const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}, env = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, require: key => {
    if (!(key in dependencies)) throw new Error(`Dependencia inesperada: ${key}`);
    return dependencies[key];
  }, process: { env }, URL, console });
  return module.exports;
}

test('otra instalación comienza sin contactos ni imagen de Carlitos', () => {
  const config = load('src/lib/web-client-config.ts', {}, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'otro-cliente' });
  assert.equal(config.DEFAULT_WEB_CLIENT_CONFIG.storeName, 'Mi tienda');
  assert.equal(config.DEFAULT_WEB_CLIENT_CONFIG.supportPhone, '');
  assert.equal(config.DEFAULT_WEB_CLIENT_CONFIG.botPhone, '');
  assert.equal(config.DEFAULT_WEB_CLIENT_CONFIG.logoUrl, '');
  assert.equal(config.DEFAULT_WEB_CLIENT_CONFIG.heroImageUrl, '');
  const firebase = load('src/lib/firebase-public-config.ts', {}, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'otro-cliente' });
  assert.equal(firebase.hasFirebasePublicConfig(), false);
  assert.equal(firebase.FIREBASE_PUBLIC_CONFIG.storageBucket, '');
});

test('valida enlaces, teléfonos e identificador de Meta', () => {
  const config = load('src/lib/web-client-config.ts');
  const base = config.normalizeWebClientConfig({});
  assert.equal(config.validateWebClientConfig({ ...base, siteUrl: 'https://mitienda.cl' }, '1339726502567839'), null);
  assert.ok(config.validateWebClientConfig({ ...base, siteUrl: 'http://localhost:3001' }, ''));
  assert.ok(config.validateWebClientConfig({ ...base, logoUrl: '//externo.cl/logo.png' }, ''));
  assert.ok(config.validateWebClientConfig({ ...base, heroImageUrl: 'javascript:alert(1)' }, ''));
  assert.ok(config.validateWebClientConfig({ ...base, supportPhone: 'abc' }, ''));
  assert.ok(config.validateWebClientConfig(base, 'no-es-id'));
});

test('la API reserva los cambios al dueño y guarda solo configuración web', async () => {
  const config = load('src/lib/web-client-config.ts');
  const owner = load('src/lib/supreme-owner.ts');
  let writes = [];
  const db = {
    collection: name => ({ doc: id => `${name}/${id}` }),
    batch: () => ({ set: (ref, value) => writes.push({ ref, value }), commit: async () => {} }),
  };
  const NextResponse = { json: (body, options = {}) => ({ body, status: options.status || 200 }) };
  const api = load('src/app/api/admin/web-client-config/route.ts', {
    'next/server': { NextResponse },
    'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async token => token === 'owner' ? { uid: owner.SUPREME_OWNER_UID, email: owner.SUPREME_OWNER_EMAIL } : { uid: 'otro', email: 'otro@example.com' } }) },
    '@/lib/db-server': { getAdminApp: () => ({ options: { projectId: 'importadora-carlitos' } }), getAdminDb: () => db },
    '@/lib/web-client-config': config,
    '@/lib/web-client-config-server': { getWebClientConfig: async () => config.DEFAULT_WEB_CLIENT_CONFIG, getWebMetaPhoneNumberId: async () => '123456', invalidateWebClientConfig: () => {} },
    'next/cache': { revalidatePath: () => {} },
    '@/lib/supreme-owner': owner,
    '@/lib/catalog-cache': { clearCatalogMemoryCache: () => {} },
  }, { WHATSAPP_ACCESS_TOKEN: 'secret-token' });
  const request = (token, body) => ({ headers: { get: () => token ? `Bearer ${token}` : '' }, json: async () => body });
  assert.equal((await api.PUT(request('otro', {}))).status, 403);
  assert.equal((await api.PUT(request('owner', { config: { ...config.DEFAULT_WEB_CLIENT_CONFIG, botPhone: 'mal' }, metaPhoneNumberId: '' }))).status, 400);
  assert.equal(writes.length, 0);
  const saved = await api.PUT(request('owner', { config: { ...config.DEFAULT_WEB_CLIENT_CONFIG, storeName: 'Nueva tienda' }, metaPhoneNumberId: '123456' }));
  assert.equal(saved.status, 200);
  assert.deepEqual(writes.map(w => w.ref), ['web_settings/config', 'web_settings/integrations']);
  assert.equal(writes[0].value.storeName, 'Nueva tienda');
  assert.equal(writes[1].value.metaPhoneNumberId, '123456');
  const read = await api.GET(request('owner'));
  assert.equal(read.body.accessTokenConfigured, true);
  assert.equal(JSON.stringify(read.body).includes('secret-token'), false);
});

test('el bot solo presenta datos bancarios completos', () => {
  const { hasCompleteBankDetails } = load('src/lib/bank-details.ts');
  assert.equal(hasCompleteBankDetails(null), false);
  assert.equal(hasCompleteBankDetails({ bank: 'Banco', type: 'Vista', account: '', rut: '1', holder: 'Cliente' }), false);
  assert.equal(hasCompleteBankDetails({ bank: 'Banco', type: 'Vista', account: '123', rut: '1', holder: 'Cliente' }), true);
});
