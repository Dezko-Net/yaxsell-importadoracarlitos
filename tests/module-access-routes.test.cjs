const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies, globals = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, require: key => {
    if (!(key in dependencies)) throw new Error(`Dependencia inesperada: ${key}`);
    return dependencies[key];
  }, console, Error, AbortSignal, process: { env: { LOG_REQ: '0' } }, ...globals });
  return module.exports;
}

const modules = load('src/lib/module-access.ts', {});
const supremeOwner = load('src/lib/supreme-owner.ts', {});
const response = (status, extra = {}) => ({ status, headers: new Headers(), cookies: { set() {} }, ...extra });
function NextResponse(body, options = {}) { return response(options.status || 200, { body }); }
NextResponse.next = () => response(200);
NextResponse.redirect = url => response(307, { location: String(url) });
NextResponse.json = (body, options = {}) => response(options.status || 200, { body });

function request(pathname, token, body) {
  const url = `http://localhost:3001${pathname}`;
  return { url, nextUrl: new URL(url), method: 'GET', headers: new Headers(token ? { authorization: `Bearer ${token}`, 'user-agent': 'Mozilla' } : { 'user-agent': 'Mozilla' }), json: async () => body };
}

test('el middleware respeta los servicios y mantiene el login accesible', async () => {
  let state = { web: true, erp: true, pos: true };
  const middleware = load('src/middleware.ts', { 'next/server': { NextResponse }, '@/lib/module-access': modules }, {
    fetch: async () => ({ ok: true, json: async () => ({ modules: state }) }),
    URL,
  }).middleware;
  assert.equal((await middleware(request('/erp-dashboard'))).status, 200);
  state = { web: true, erp: false, pos: true };
  assert.equal((await middleware(request('/erp-dashboard'))).status, 307);
  assert.equal((await middleware(request('/pos-acceso'))).status, 200);
  assert.equal((await middleware(request('/api/erp/productos'))).status, 200);
  state = { web: false, erp: true, pos: false };
  assert.equal((await middleware(request('/productos'))).status, 307);
  assert.equal((await middleware(request('/shopify/catalogo-original/index.html'))).status, 307);
  assert.equal((await middleware(request('/admin-supreme'))).status, 200);
  assert.equal((await middleware(request('/admin/login'))).status, 200);
  assert.equal((await middleware(request('/pos-acceso'))).status, 307);
});

test('si no se puede consultar el estado, los módulos no se abren por error', async () => {
  const middleware = load('src/middleware.ts', { 'next/server': { NextResponse }, '@/lib/module-access': modules }, {
    fetch: async () => { throw new Error('offline'); }, URL,
  }).middleware;
  assert.equal((await middleware(request('/erp-dashboard'))).status, 503);
  assert.equal((await middleware(request('/admin/login'))).status, 200);
});

test('un rechazo sin detalle tampoco habilita servicios por accidente', async () => {
  const middleware = load('src/middleware.ts', { 'next/server': { NextResponse }, '@/lib/module-access': modules }, {
    fetch: async () => Promise.reject(undefined), URL,
  }).middleware;
  assert.equal((await middleware(request('/erp-dashboard'))).status, 503);
});

test('un fallo temporal se reintenta y la lectura interna no cae en el filtro de bots', async () => {
  let calls = 0;
  const middleware = load('src/middleware.ts', { 'next/server': { NextResponse }, '@/lib/module-access': modules }, {
    fetch: async () => ++calls === 1
      ? { ok: false, status: 503 }
      : { ok: true, json: async () => ({ modules: { web: true, erp: true, pos: true } }) },
    URL,
  }).middleware;
  assert.equal((await middleware(request('/erp-dashboard'))).status, 200);
  assert.equal(calls, 2);
  const internal = request('/api/module-access');
  internal.headers.set('user-agent', 'node-fetch');
  assert.equal((await middleware(internal)).status, 200);
  assert.equal(calls, 2);
});

test('la API exige al dueño y guarda cambios sin apagar el módulo actual', async () => {
  let stored;
  const doc = {};
  const db = {
    collection: () => ({ doc: () => doc }),
    runTransaction: async fn => fn({
      get: async () => ({ data: () => stored }),
      set: (_ref, value) => { stored = value; },
    }),
  };
  const api = load('src/app/api/module-access/route.ts', {
    'next/server': { NextResponse },
    'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async token => token === 'owner' ? { uid: '2qwk74HeaneMQzDfjugIl72cT9G3', email: 'dezkonet@gmail.com' } : { uid: 'other', email: 'other@example.com' } }) },
    '@/lib/db-server': { getAdminApp: () => ({}), getAdminDb: () => db },
    '@/lib/module-access': modules,
    '@/lib/supreme-owner': supremeOwner,
  });
  assert.equal((await api.PUT(request('/api/module-access', null, {}))).status, 401);
  assert.equal((await api.PUT(request('/api/module-access', 'other', {}))).status, 403);
  assert.equal((await api.PUT(request('/api/module-access', 'owner', { source: 'web', target: 'web', enabled: false }))).status, 400);
  assert.equal((await api.PUT(request('/api/module-access', 'owner', { source: 'web', target: 'erp', enabled: false }))).status, 200);
  assert.equal(stored.modules.erp, false);
  assert.equal((await api.PUT(request('/api/module-access', 'owner', { source: 'erp', target: 'pos', enabled: false }))).status, 409);
  assert.equal((await api.PUT(request('/api/module-access', 'owner', { source: 'pos', target: 'web', enabled: false }))).status, 200);
  assert.equal(stored.modules.web, false);
  assert.equal(stored.modules.pos, true);
});
