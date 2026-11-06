const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function createCatalog({ waitForFirstProducts } = {}) {
  let mode = 'erp_integrated';
  let productCalls = 0;
  const products = [{ $id: 'product', NAME: 'Producto', STOCK: 0, WEB_STOCK: 10, SHOW_IN_WEB: true }];
  const dependencies = {
    'next/cache': { unstable_cache: fn => fn },
    '@/lib/collections': { PRODUCTS_COLLECTION: 'products', STORE_SETTINGS_COLLECTION: 'settings' },
    '@/lib/product-images': { normalizeProductImages: product => ({ ...product }) },
    '@/lib/db-server': { serverListDocuments: async name => {
      if (name === 'products') {
        productCalls++;
        if (productCalls === 1 && waitForFirstProducts) await waitForFirstProducts;
        return { documents: products };
      }
      return { documents: [] };
    } },
    '@/lib/public-vendor-cache': { getPublicVendors: async () => [] },
    '@/lib/inventory-mode': {
      getInventoryConnectionMode: async () => mode,
      getInventoryStock: (product, current) => Number(current === 'web_independent' ? product.WEB_STOCK ?? product.STOCK : product.STOCK),
    },
    '@/lib/home-cache': { clearHomeMemoryCache: () => {}, getHomeMemoryCache: () => null },
    '@/lib/apertura-promo': { applyWebPrice: product => product },
    '@/lib/product-publication': { isProductPublishedOnWeb: () => true },
  };
  const source = fs.readFileSync('src/lib/catalog-cache.ts', 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, require: name => {
    if (!(name in dependencies)) throw new Error(`Dependencia inesperada: ${name}`);
    return dependencies[name];
  }, console, Map, Set, Date, Promise });
  return { catalog: module.exports, setMode: value => { mode = value; } };
}

test('el caché respeta el stock de cada modo al cambiar entre ERP y web', async () => {
  const { catalog, setMode } = createCatalog();
  assert.equal((await catalog.getCachedAllProducts())[0].STOCK, 0);
  setMode('web_independent');
  assert.equal((await catalog.getCachedAllProducts())[0].STOCK, 10);
  setMode('erp_integrated');
  assert.equal((await catalog.getCachedAllProducts())[0].STOCK, 0);
});

test('consultas simultáneas de modos distintos no comparten stock equivocado', async () => {
  let release;
  const waitForFirstProducts = new Promise(resolve => { release = resolve; });
  const { catalog, setMode } = createCatalog({ waitForFirstProducts });
  const erp = catalog.getCachedAllProducts();
  await new Promise(resolve => setImmediate(resolve));
  setMode('web_independent');
  const web = catalog.getCachedAllProducts();
  await new Promise(resolve => setImmediate(resolve));
  release();
  assert.equal((await erp)[0].STOCK, 0);
  assert.equal((await web)[0].STOCK, 10);
});
