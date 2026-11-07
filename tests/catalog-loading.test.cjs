const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function loadCatalog(fetch) {
  const source = fs.readFileSync('public/shopify/catalogo-original/app.js', 'utf8');
  const start = source.indexOf('async function loadAppwriteProducts()');
  const end = source.indexOf('\nasync function init()', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    fetch, console, setTimeout, Promise, Date, JSON, Array, String, Number,
    window: { location: { origin: 'https://test.local' } },
    sessionStorage: { setItem() {}, removeItem() {} }, localStorage: { setItem() {} },
    _settings: { webConfig: {} }, _vendors: [], _appwriteCategories: [], _appwriteSubcategories: [],
    MAIN_STORE_NAME: 'Tienda', IFRAME_CATALOG_CACHE_KEY: 'cache', _lastCatalogSyncTs: 0,
    _firestoreReady: true, allProducts: [], renderCount: 0,
    resolveAppwriteImage: url => url || '',
  };
  context.render = () => { context.renderCount++; };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test('los productos no esperan respuestas lentas de categorías ni tiendas', async () => {
  const categories = deferred();
  const vendors = deferred();
  const ctx = loadCatalog(url => {
    if (url.includes('/catalog?')) return categories.promise;
    if (url.includes('/vendors')) return vendors.promise;
    return Promise.resolve({ ok: true, json: async () => ({ products: [{ $id: '1', NAME: 'Polera', CATEGORYID: 'ropa', IMAGEURL: '/foto.png' }] }) });
  });
  const result = await Promise.race([
    ctx.loadAppwriteProducts(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('La carga quedó esperando categorías o tiendas')), 1500)),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Polera');
  ctx.allProducts = result;
  categories.resolve({ ok: true, json: async () => ({ categories: [{ id: 'ropa', name: 'Ropa' }], subcategories: [] }) });
  vendors.resolve({ ok: true, json: async () => ({ vendors: [{ id: 'v', name: 'Asociada' }] }) });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(result[0].category, 'Ropa');
  assert.equal(ctx._vendors[0].name, 'Asociada');
  assert.ok(ctx.renderCount >= 1);
});

test('un error del servicio de productos no se interpreta como catálogo vacío', async () => {
  const ctx = loadCatalog(url => {
    if (url.includes('/products?')) return Promise.resolve({ ok: false, status: 503 });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
  await assert.rejects(ctx.loadAppwriteProducts(), /HTTP 503/);
});
