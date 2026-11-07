// === CATÁLOGO EMPRENDEDOR - BASE TEMPLATE ===
// ============================================
// CONFIGURACIÓN DEL CLIENTE (SaaS dinámico por URL)
if (!window.__CATALOG_CONFIG__ || !window.__CATALOG_CONFIG__.firebase || !window.__CATALOG_CONFIG__.clientId) throw new Error('Falta la configuración Firebase del catálogo.');
let CLIENT_ID = window.__CATALOG_CONFIG__.clientId;

let WHATSAPP_CONTACTS = [];
let BALATIN_CONTACT = { name: '', number: '', active: false };
let _homeMarketing = null;
try { _homeMarketing = JSON.parse(localStorage.getItem('home_marketing') || 'null'); } catch (e) {}
let MAIN_STORE_NAME = CLIENT_ID === 'carlitos' ? 'Importadora Carlitos' : 'Mi tienda';
const PASSWORDS = { admin: 'Flavia273@' }; // TODO: Move to firebase
const STORAGE_KEYS = { cart: `db_cart_${CLIENT_ID}`, adminAuth: `db_admin_auth_${CLIENT_ID}` };

// === Firebase Firestore ===
const firebaseConfig = window.__CATALOG_CONFIG__.firebase;
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Legacy upload helpers use this alias; keep them on Carlitos' own bucket.
const geminaiStorage = firebase.storage();

// Colecciones dinámicas
const COL_PRODUCTS = `${CLIENT_ID}_products`;
const COL_ORDERS = `${CLIENT_ID}_orders`;
const DOC_OVERRIDES = `${CLIENT_ID}_config/overrides`;
const DOC_DELETED = `${CLIENT_ID}_config/deleted`;
const DOC_CATEGORIES = `${CLIENT_ID}_config/categories`;
const DOC_SETTINGS = `${CLIENT_ID}_config/settings`;
const DOC_GLOBAL = `catalogs_config/${CLIENT_ID}`; // Config del Dashboard

// In-memory caches (populated from Firestore)
let _customProducts = [];
let _overrides = {};
let _deletedSkus = [];
let _customCategories = {};
function getInitialMinPurchase() {
  try {
    const stored = localStorage.getItem('store_bank_details');
    if (stored) {
      const parsed = JSON.parse(stored);
      const val = Number(parsed.minimumPurchase);
      if (!isNaN(val) && val > 0) return val;
    }
  } catch (e) {}
  return 50000;
}
let _settings = { minPurchase: getInitialMinPurchase() };
let _orders = [];
let _firestoreReady = false;
let _globalConfig = {};
let _appwriteCategories = []; // categorias desde Appwrite (con imagenes)
let _appwriteSubcategories = []; // subcategorias desde Appwrite (con imagenes)
let catalogFavoriteIds = new Set();
try {
  if (localStorage.getItem('yaxsel_fav_user')) {
    const storedFavoriteIds = JSON.parse(localStorage.getItem('yaxsel_fav_ids') || '[]');
    if (Array.isArray(storedFavoriteIds)) catalogFavoriteIds = new Set(storedFavoriteIds.map(String));
  }
} catch (e) {}

async function loadFirestoreData() {
  try {
    // ⚡ CERO lecturas directas a Firestore: los productos ya se cargan desde
    // la API cacheada /api/public-data/products en fetchAppwriteProducts()
    // y los settings se reciben desde el parent (CatalogoClient) por postMessage ('YAXSEL_SETTINGS').
    _customProducts = JSON.parse(localStorage.getItem('db_custom_products') || '[]');
    _overrides = JSON.parse(localStorage.getItem('db_overrides') || '{}');
    _deletedSkus = JSON.parse(localStorage.getItem('db_deleted') || '[]');
    _customCategories = JSON.parse(localStorage.getItem('db_categories') || '{}');
    _orders = [];
    _firestoreReady = true;
  } catch (err) {
    console.warn('Error inicializando estado local del catalogo:', err);
  }
  updateCatalogBranding();
}


// === Orders ===
function getOrders() { return _orders; }
async function saveOrders(o) { _orders = o; }
async function saveOrderFromCart() {
  const order = {
    date: new Date().toISOString(),
    items: cart.map(i => ({ sku: i.sku, name: i.name, qty: i.qty, price: i.price, mode: i.mode })),
    total: cartTotal(),
    paid: false,
    stockApplied: false
  };
  try {
    const ref = await db.collection(COL_ORDERS).add(order);
    order.id = ref.id;
    _orders.unshift(order);
  } catch (err) { console.error('Error saving order:', err); }
}
async function markOrderPaid(orderId) {
  const order = _orders.find(o => o.id === orderId);
  if (!order) return;
  if (!order.stockApplied) {
    const overrides = getOverrides();
    order.items.forEach(item => {
      const p = getProducts().find(x => x.sku === item.sku);
      if (!p) return;
      const ov = overrides[item.sku] || {};
      const currentStock = ov.stock !== undefined ? ov.stock : p.stock;
      ov.stock = Math.max(0, currentStock - item.qty);
      overrides[item.sku] = ov;
    });
    await saveOverrides(overrides);
    order.stockApplied = true;
  }
  order.paid = true;
  try { await db.collection(COL_ORDERS).doc(orderId).update({ paid: true, stockApplied: order.stockApplied }); } catch(e) {}
  showToast('Pedido marcado como pagado, stock actualizado');
  renderAdmin();
}
async function deleteOrder(orderId) {
  if (!confirm('¿Eliminar este pedido del registro?')) return;
  _orders = _orders.filter(o => o.id !== orderId);
  try { await db.collection(COL_ORDERS).doc(orderId).delete(); } catch(e) {}
  renderAdmin();
}
async function unmarkOrderPaid(orderId) {
  const order = _orders.find(o => o.id === orderId);
  if (!order) return;
  if (order.stockApplied) {
    const overrides = getOverrides();
    order.items.forEach(item => {
      const p = getProducts().find(x => x.sku === item.sku);
      if (!p) return;
      const ov = overrides[item.sku] || {};
      const currentStock = ov.stock !== undefined ? ov.stock : p.stock;
      ov.stock = currentStock + item.qty;
      overrides[item.sku] = ov;
    });
    await saveOverrides(overrides);
    order.stockApplied = false;
  }
  order.paid = false;
  try { await db.collection(COL_ORDERS).doc(orderId).update({ paid: false, stockApplied: false }); } catch(e) {}
  renderAdmin();
}

// State
let allProducts = [];
let catalogLoadError = false;
let _vendors = [];           // tiendas activas con logo/color/nombre
let selectedStore = '';      // '' = todas · '__main__' = Yaxsell Demo · vendorId
let currentMode = 'public'; // 'public' | 'admin'
let _catalogPack = null;
let _catalogPackProducts = [];
let _catalogPackSelectedIds = new Set();
let _catalogPackLoaded = false;
let _catalogPackPromise = null;

function loadCatalogPack() {
  if (_catalogPackPromise) return _catalogPackPromise;
  _catalogPackPromise = fetch(window.location.origin + '/api/public-data/combos', { cache: 'force-cache' })
    .then(function(response) { return response.ok ? response.json() : null; })
    .then(function(data) {
      const config = data && data.success && Array.isArray(data.combos) ? data.combos[0] : null;
      _catalogPack = config || null;
      _catalogPackProducts = config && Array.isArray(config.bundleProducts)
        ? config.bundleProducts.map(function(bundleProduct) {
            const id = String(bundleProduct.$id || bundleProduct.id || '');
            const sku = String(bundleProduct.SKU || bundleProduct.sku || '');
            const catalogProduct = allProducts.find(function(product) {
              return (id && String(product.id) === id) || (sku && String(product.sku) === sku);
            });
            const price = catalogProduct ? getPrice(catalogProduct) : Number(bundleProduct.CURRENTPRICE || bundleProduct.PRICE || 0);
            const stock = catalogProduct ? getRealStock(catalogProduct) : Number(bundleProduct.STOCK ?? bundleProduct.stock ?? 0);
            return {
              ...(catalogProduct || {}),
              id: id || (catalogProduct && catalogProduct.id) || '',
              sku: sku || (catalogProduct && catalogProduct.sku) || id,
              name: String((catalogProduct && catalogProduct.name) || bundleProduct.NAME || 'Producto'),
              image: (catalogProduct && catalogProduct.image) || bundleProduct.IMAGEURL || '',
              stock,
              priceA: price,
              priceB: price,
              _packOriginalPrice: price,
            };
          }).filter(function(product) { return product.id && product._packOriginalPrice > 0; })
        : [];
      if (_catalogPack && _catalogPackProducts.length >= 2) {
        _catalogPackSelectedIds = new Set(_catalogPackProducts.map(function(product) { return product.id; }));
      }
      _catalogPackLoaded = true;
      return _catalogPack;
    })
    .catch(function(error) {
      console.warn('[catalogo] No se pudo cargar el pack publicado:', error);
      _catalogPackLoaded = true;
      return null;
    });
  return _catalogPackPromise;
}

function getSelectedCatalogPackProducts() {
  return _catalogPackProducts.filter(function(product) { return _catalogPackSelectedIds.has(product.id); });
}

function calculateCatalogPack() {
  const selected = getSelectedCatalogPackProducts();
  const originalPrices = selected.map(function(product) { return product._packOriginalPrice; });
  const discount = Math.max(0, Math.min(90, Number(_catalogPack && _catalogPack.discountPercent) || 0));
  const originalTotal = originalPrices.reduce(function(sum, price) { return sum + price; }, 0);
  const fixed = Number(_catalogPack && _catalogPack.fixedPrice);
  const total = _catalogPack && _catalogPack.pricingMode === 'fixed' ? fixed : Math.round(originalTotal * (1 - discount / 100));
  const factor = originalTotal > 0 ? total / originalTotal : 0;
  const allocated = originalPrices.map(function(price) { return Math.floor(price * factor); });
  let remainder = total - allocated.reduce(function(sum, price) { return sum + price; }, 0);
  const order = originalPrices.map(function(price, index) { return { index, fraction: price * factor - allocated[index] }; })
    .sort(function(a, b) { return b.fraction - a.fraction; });
  for (let index = 0; remainder > 0 && order.length; index = (index + 1) % order.length) {
    allocated[order[index].index] += 1;
    remainder -= 1;
  }
  return { selected, originalTotal: originalPrices.reduce(function(sum, price) { return sum + price; }, 0), discount, total, allocated };
}

function toggleCatalogPackProduct(id) {
  const product = _catalogPackProducts.find(function(item) { return item.id === id; });
  if (!product || product.stock <= 0) return;
  if (_catalogPackSelectedIds.has(id)) {
    if (_catalogPackSelectedIds.size <= 2) {
      showToast('Un pack necesita al menos 2 productos');
      return;
    }
    _catalogPackSelectedIds.delete(id);
  } else {
    _catalogPackSelectedIds.add(id);
  }
  renderCatalogPackPage();
}
window.toggleCatalogPackProduct = toggleCatalogPackProduct;

function addSelectedCatalogPackToCart() {
  const pack = calculateCatalogPack();
  if (!pack || pack.selected.length < 2) {
    showToast('Selecciona al menos 2 productos para armar el pack');
    return;
  }
  const unavailable = pack.selected.find(function(product) { return product.stock < 1; });
  if (!Number.isFinite(pack.total) || pack.total <= 0 || pack.total >= pack.originalTotal) { showToast('El precio del pack ya no está disponible'); return; }
  if (unavailable) {
    showToast('Uno de los productos seleccionados está sin stock');
    return;
  }
  const items = pack.selected.map(function(product, index) {
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      image: product.image,
      stock: product.stock,
      unitPrice: pack.allocated[index],
      originalUnitPrice: product._packOriginalPrice,
    };
  });
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'YAXSEL_ADD_PACK_TO_CART',
      bundleId: _catalogPack.id,
      bundleTitle: _catalogPack.title || 'Pack destacado',
      items,
    }, window.location.origin);
    showToast('Pack agregado al pedido');
    window.parent.postMessage({ type: 'YAXSEL_OPEN_CART' }, window.location.origin);
  } else {
    showToast('El carrito de packs solo está disponible en la tienda');
  }
}
window.addSelectedCatalogPackToCart = addSelectedCatalogPackToCart;

function renderCatalogPackCard() {
  if (!_catalogPack || _catalogPackProducts.length < 2) return '';
  const pack = calculateCatalogPack();
  const available = pack.selected.length === _catalogPackProducts.length && pack.selected.every(function(product) { return product.stock > 0; }) && pack.total > 0 && pack.total < pack.originalTotal;
  const rows = _catalogPackProducts.map(function(product) {
    return `<div class="pack-offer-row"><div class="pack-offer-image">${imgEl(product.image, product.name, 'w-full h-full object-cover')}</div><div class="pack-offer-name"><strong>${escapeHtml(product.name)}</strong><small>${product.stock > 0 ? 'Incluido en el pack' : 'Sin stock'}</small></div><span>${formatPrice(product._packOriginalPrice)}</span></div>`;
  }).join('');
  return `<section class="pack-offer" aria-labelledby="catalogPackPromoTitle">
    <div class="pack-offer-header"><div><span class="pack-offer-label">${escapeHtml(_catalogPack.badge || 'Pack especial')}</span><h2 id="catalogPackPromoTitle">${escapeHtml(_catalogPack.title || 'Pack especial')}</h2><p>${escapeHtml(_catalogPack.subtitle || 'Lleva estos productos juntos a un mejor precio.')}</p></div><span class="pack-offer-count">${_catalogPackProducts.length} productos</span></div>
    <div class="pack-offer-list">${rows}</div>
    <div class="pack-offer-footer"><div><span class="pack-offer-normal">Precio normal <s>${formatPrice(pack.originalTotal)}</s></span><span class="pack-offer-price">Precio pack <strong>${formatPrice(pack.total)}</strong></span></div><button type="button" onclick="addSelectedCatalogPackToCart()" ${available ? '' : 'disabled'}>${available ? 'Agregar pack al pedido' : 'Pack no disponible'}</button></div>
  </section>`;
}

function renderCatalogPackPage() {
  const app = document.getElementById('app');
  if (!app) return;
  if (!_catalogPackLoaded) {
    app.innerHTML = '<div class="catalog-pack-loading"><span class="catalog-pack-spinner"></span><p>Cargando packs…</p></div>';
    loadCatalogPack().then(renderCatalogPackPage);
    return;
  }
  if (!_catalogPack || _catalogPackProducts.length < 2) {
    app.innerHTML = `<section class="catalog-pack-empty-page"><a href="#/" class="catalog-pack-back">← Volver al catálogo</a><div class="catalog-pack-empty-icon">🎁</div><h1>Por ahora no hay packs disponibles</h1><p>Vuelve más tarde para ver las combinaciones activas.</p></section>`;
    return;
  }
  const pack = calculateCatalogPack();
  const canAdd = pack.selected.length === _catalogPackProducts.length && pack.selected.every(function(product) { return product.stock > 0; }) && pack.total > 0 && pack.total < pack.originalTotal;
  app.innerHTML = `<div class="catalog-pack-page fade-in">
    <a href="#/" class="catalog-pack-back">← Volver al catálogo</a>
    <section class="catalog-pack-hero"><span class="catalog-pack-kicker">${escapeHtml(_catalogPack.badge || 'PACK DESTACADO')}</span><h1>${escapeHtml(_catalogPack.title || 'Arma tu pack')}</h1><p>${escapeHtml(_catalogPack.subtitle || 'Elige los productos para tu pack.')}</p><div class="catalog-pack-hero-discount">${pack.discount}% de descuento al combinar</div></section>
    <section class="catalog-pack-builder" aria-label="Productos del pack">
      <div class="catalog-pack-section-head"><div><h2>Productos incluidos</h2><p>Todos estos productos forman parte del pack.</p></div><span>${pack.selected.length} seleccionados</span></div>
      <div class="catalog-pack-products">${_catalogPackProducts.map(function(product) {
        const selected = _catalogPackSelectedIds.has(product.id);
        const unavailable = product.stock <= 0;
        return `<div class="catalog-pack-product${selected ? ' is-selected' : ''}${unavailable ? ' is-unavailable' : ''}">
          <span class="catalog-pack-check" aria-hidden="true">${selected ? '✓' : '+'}</span>
          <span class="catalog-pack-product-image">${imgEl(product.image, product.name, 'w-full h-full object-cover')}</span>
          <span class="catalog-pack-product-copy"><strong>${escapeHtml(product.name)}</strong><small>${product.stock > 0 ? `Stock disponible: ${Number(product.stock).toLocaleString('es-CL')}` : 'Sin stock por ahora'}</small></span>
          <span class="catalog-pack-product-price">${formatPrice(product._packOriginalPrice)}</span>
        </div>`;
      }).join('')}</div>
      <div class="catalog-pack-summary"><div><span>Precio normal</span><strong>${formatPrice(pack.originalTotal)}</strong></div><div><span>Descuento pack</span><strong>${pack.discount}%</strong></div><div class="catalog-pack-grand-total"><span>Total del pack</span><strong>${formatPrice(pack.total)}</strong></div><button type="button" onclick="addSelectedCatalogPackToCart()" ${canAdd ? '' : 'disabled'}>Agregar pack al pedido · ${formatPrice(pack.total)}</button></div>
    </section>
  </div>`;
}

function isSameCartMode(m1, m2) {
  if (m1 === m2) return true;
  const isRetailLike1 = !m1 || m1 === 'public' || m1 === 'retail';
  const isRetailLike2 = !m2 || m2 === 'public' || m2 === 'retail';
  return isRetailLike1 && isRetailLike2;
}

function deduplicateIframeCart(rawCart) {
  if (!Array.isArray(rawCart)) return [];
  const consolidated = [];
  for (const item of rawCart) {
    if (!item || (!item.sku && !item.id)) continue;
    const targetMode = (!item.mode || item.mode === 'retail') ? 'public' : item.mode;
    const existing = consolidated.find(c =>
      (c.sku === item.sku || (c.id && item.id && c.id === item.id) || (c.sku && item.id && c.sku === item.id) || (c.id && item.sku && c.id === item.sku)) &&
      isSameCartMode(c.mode, targetMode) &&
      ((c.bundleId || c.bundleInstanceId || item.bundleId || item.bundleInstanceId)
        ? c.bundleId === item.bundleId && c.bundleInstanceId === item.bundleInstanceId
        : true)
    );
    if (existing) {
      existing.qty = (existing.qty || 0) + (item.qty || 1);
      if (!existing.image && item.image) existing.image = item.image;
      if (!existing.name && item.name) existing.name = item.name;
    } else {
      consolidated.push({ ...item, mode: targetMode });
    }
  }
  return consolidated;
}

let cart = deduplicateIframeCart(JSON.parse(localStorage.getItem(STORAGE_KEYS.cart) || '[]'));
if (cart.length === 0) {
  try {
    const rawYaxsel = localStorage.getItem('yaxsel_cart');
    if (rawYaxsel) {
      const parsed = JSON.parse(rawYaxsel);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const mapped = parsed.map(item => ({
          id: item.product?.$id || '',
          sku: item.product?.SKU || item.product?.$id || '',
          name: item.product?.NAME || '',
          price: item.bundleUnitPrice ?? item.bundlePackPrice ?? item.wholesalePrice ?? item.product?.PRICE ?? 0,
          qty: item.quantity || 1,
          image: item.product?.IMAGEURL || '',
          mode: item.isPack ? 'box' : (item.wholesalePrice ? 'wholesale' : 'public'),
          vendorId: item.product?.VENDOR_ID || '',
          stock: item.product?.STOCK,
          bundleId: item.bundleId,
          bundleInstanceId: item.bundleInstanceId,
          bundleTitle: item.bundleTitle,
          bundleUnitPrice: item.bundleUnitPrice,
          bundleOriginalUnitPrice: item.bundleOriginalUnitPrice,
          bundlePackQty: item.bundlePackQty,
          bundlePackPrice: item.bundlePackPrice
        })).filter(i => i.qty > 0 && (i.id || i.sku));
        cart = deduplicateIframeCart(mapped);
        localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
      }
    }
  } catch (e) {}
}
let searchQuery = '';
let _adminSearchDebounce = null;

// Helpers
const $ = (sel) => document.querySelector(sel);
const formatPrice = (n) => '$' + Math.round(n).toLocaleString('es-CL');
const escapeHtml = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

const CATEGORY_ICONS = {
  // Top categories
  'Nuevos': 'https://cdn-icons-png.flaticon.com/512/2665/2665051.png',
  'Hogar': 'https://cdn-icons-png.flaticon.com/512/619/619153.png',
  'Electronica': 'https://cdn-icons-png.flaticon.com/512/3556/3556550.png',
  'Ropa': 'https://cdn-icons-png.flaticon.com/512/5853/5853911.png',
  'Jardin y Exterior': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR8RfsdbSc49NqsJkqtr6_UiwW66j2kmUR8BA&s',
  'Regalos': 'https://cdn-icons-png.flaticon.com/512/4213/4213958.png',
  'Escolar': 'https://cdn-icons-png.flaticon.com/512/747/747062.png',
  // Subcategories (Hogar)
  'Cocina': 'https://cdn-icons-png.flaticon.com/512/1830/1830839.png',
  'Limpieza': 'https://cdn-icons-png.flaticon.com/512/995/995053.png',
  'Decoracion': 'https://cdn-icons-png.flaticon.com/512/2620/2620910.png',
  'Organizacion': 'https://cdn-icons-png.flaticon.com/512/2702/2702069.png',
  'Salud y Bienestar': 'https://cdn-icons-png.flaticon.com/512/2966/2966327.png',
  'Mascotas': 'https://cdn-icons-png.flaticon.com/512/616/616430.png',
  'Manualidades': 'https://cdn-icons-png.flaticon.com/512/2784/2784065.png',
  'Belleza': 'https://cdn-icons-png.flaticon.com/512/6075/6075201.png',
  'Bano': 'https://cdn-icons-png.flaticon.com/512/4151/4151196.png',
  'Juguetes y Bebes': 'https://cdn-icons-png.flaticon.com/512/3082/3082040.png',
  'Auto': 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png',
  // Subcategories (Electronica)
  'Audio': 'https://cdn-icons-png.flaticon.com/512/727/727269.png',
  'Camaras': 'https://cdn-icons-png.flaticon.com/512/685/685655.png',
  'Iluminacion': 'https://cdn-icons-png.flaticon.com/512/702/702797.png',
  'Cocina Electrica': 'https://cdn-icons-png.flaticon.com/512/3082/3082031.png',
  'Cuidado Personal': 'https://cdn-icons-png.flaticon.com/512/2933/2933116.png',
  'Accesorios Tech': 'https://cdn-icons-png.flaticon.com/512/2659/2659980.png',
  // Subcategories (Ropa)
  'Invierno': 'https://cdn-icons-png.flaticon.com/512/2942/2942466.png',
  'Hombre': 'https://cdn-icons-png.flaticon.com/512/2257/2257295.png',
  'Mujer': 'https://cdn-icons-png.flaticon.com/512/4140/4140037.png',
  'Ninos': 'https://cdn-icons-png.flaticon.com/512/3043/3043798.png',
  'Accesorios': 'https://cdn-icons-png.flaticon.com/512/892/892458.png',
  // Other subcategories
  'Exterior': 'https://cdn-icons-png.flaticon.com/512/2924/2924779.png',
  'Ramos y Decoracion': 'https://cdn-icons-png.flaticon.com/512/3081/3081860.png',
  'Materiales': 'https://cdn-icons-png.flaticon.com/512/3534/3534033.png',
  'Otros': 'https://cdn-icons-png.flaticon.com/512/1377/1377194.png'
};

function getCustomCategories() { return _customCategories; }
function getKnownCategories() {
  const bad = ['0', 's', 'sin categoria', '?'];
  const customObj = getCustomCategories();
  const deletedCats = Object.keys(customObj).filter(k => customObj[k] === '__DELETED__');
  
  const base = allProducts.map(x => x.category).filter(c => !deletedCats.includes(c));
  const custom = Object.keys(customObj).filter(k => !k.includes('/') && customObj[k] !== '__DELETED__');
  const current = getProducts().map(x => x.category);
  
  return [...new Set([...base, ...custom, ...current])]
    .filter(Boolean)
    .filter(c => !bad.includes(c.toLowerCase().trim()))
    .sort();
}

function getKnownSubcategories(category) {
  const bad = ['0', 's', 'sin categoria', '?'];
  const customObj = getCustomCategories();
  const deletedSubs = Object.keys(customObj).filter(k => customObj[k] === '__DELETED__');
  
  const base = allProducts.filter(p => p.category === category && !deletedSubs.includes(category + '/' + p.subcategory)).map(p => p.subcategory);
  const custom = Object.keys(customObj)
    .filter(k => k.startsWith(category + '/') && k.split('/').length === 2 && customObj[k] !== '__DELETED__')
    .map(k => k.split('/')[1]);
  const current = getProducts().filter(p => p.category === category).map(p => p.subcategory);
  
  return [...new Set([...base, ...custom, ...current])]
    .filter(Boolean)
    .filter(s => !bad.includes(s.toLowerCase().trim()))
    .sort();
}
async function saveCustomCategories(cats) {
  _customCategories = cats;
  localStorage.setItem('db_categories', JSON.stringify(cats));
  const encoded = {};
  for (const k in cats) encoded[k.replace(/\//g, '||')] = cats[k];
  try { await db.doc(DOC_CATEGORIES).set({ map: encoded }); } catch(e) { console.error('Error saving categories:', e); }
}

function getMinPurchase() {
  if (typeof _settings.minPurchase === 'number' && _settings.minPurchase > 0) {
    return _settings.minPurchase;
  }
  const fromStorage = getInitialMinPurchase();
  if (fromStorage > 0) return fromStorage;
  return 50000;
}

function formatMinPurchaseCompact(value) {
  return value >= 1000 && value % 1000 === 0 ? `$${value / 1000}K` : formatPrice(value);
}

function getRealStock(product) {
  const value = Number(product && (product.stock ?? product.STOCK ?? 0));
  return Number.isFinite(value) ? value : 0;
}

function getDisplayStock(product) {
  return getRealStock(product);
}

function getStockBadgeHtml(product) {
  const st = getRealStock(product);
  if (st <= 0) {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-50 text-rose-600 border border-rose-200">⛔ Agotado</span>`;
  }
  if (st <= 5) {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-red-50 text-red-600 border border-red-200">⚠️ ¡Últimas ${st} uds!</span>`;
  }
  if (st <= 18) {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">🔥 Quedan ${st} uds</span>`;
  }
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">🟢 ${st} disponibles</span>`;
}

function getCatalogFavoriteId(product) {
  return String(product && (product.id || product.$id || product.sku) || '').trim();
}

function catalogFavoriteButtonHtml(product, compact = false) {
  const id = getCatalogFavoriteId(product);
  if (!id) return '';
  const active = catalogFavoriteIds.has(id);
  const dimensions = compact ? 'w-8 h-8' : 'w-10 h-10';
  const iconSize = compact ? 'w-4 h-4' : 'w-5 h-5';
  return `<button type="button" data-favorite-id="${escapeHtml(id)}" aria-pressed="${active}" aria-label="${active ? 'Quitar de favoritos' : 'Agregar a favoritos'}" title="${active ? 'Quitar de favoritos' : 'Agregar a favoritos'}" onclick="event.stopPropagation(); toggleCatalogFavorite(this.dataset.favoriteId)" class="catalog-favorite ${dimensions} absolute bottom-2 right-2 z-20 rounded-full border flex items-center justify-center shadow-md backdrop-blur active:scale-90 transition-transform" style="color:${active ? '#e11d48' : '#475569'};background:${active ? 'rgba(255,241,242,.97)' : 'rgba(255,255,255,.94)'};border-color:${active ? 'rgba(225,29,72,.22)' : 'rgba(255,255,255,.9)'}">
    <svg class="${iconSize}" fill="${active ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  </button>`;
}

function syncCatalogFavoriteButtons() {
  document.querySelectorAll('[data-favorite-id]').forEach(function(button) {
    const active = catalogFavoriteIds.has(String(button.dataset.favoriteId || ''));
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Quitar de favoritos' : 'Agregar a favoritos');
    button.setAttribute('title', active ? 'Quitar de favoritos' : 'Agregar a favoritos');
    button.style.color = active ? '#c81e1e' : '#475569';
    button.style.background = active ? 'rgba(254,242,242,.97)' : 'rgba(255,255,255,.94)';
    button.style.borderColor = active ? 'rgba(200,30,30,.24)' : 'rgba(255,255,255,.9)';
    const icon = button.querySelector('svg');
    if (icon) icon.setAttribute('fill', active ? 'currentColor' : 'none');
  });
  const headerFavBadge = document.getElementById('headerFavCount');
  if (headerFavBadge) {
    const favTotal = catalogFavoriteIds.size;
    headerFavBadge.textContent = String(favTotal);
    headerFavBadge.classList.toggle('hidden', favTotal === 0);
  }
}

function syncCatalogFavorites(ids) {
  if (!Array.isArray(ids)) return;
  catalogFavoriteIds = new Set(ids.map(function(id) { return String(id); }));
  syncCatalogFavoriteButtons();
  if (typeof parseHash === 'function' && parseHash()[0] === 'favorites') {
    renderFavorites();
  }
}

function toggleCatalogFavorite(productId) {
  const id = String(productId || '').trim();
  if (!id) return;
  const active = !catalogFavoriteIds.has(id);
  if (active) catalogFavoriteIds.add(id);
  else catalogFavoriteIds.delete(id);
  syncCatalogFavoriteButtons();

  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'YAXSEL_TOGGLE_FAVORITE', productId: id }, '*');
  }

  try {
    const favoriteUser = localStorage.getItem('yaxsel_fav_user') || 'guest';
    localStorage.setItem('yaxsel_fav_ids', JSON.stringify(Array.from(catalogFavoriteIds)));
    localStorage.setItem('yaxsel_fav_user', favoriteUser);
  } catch (e) {}
  showToast(active ? 'Agregado a favoritos ❤️' : 'Eliminado de favoritos');

  if (typeof parseHash === 'function' && parseHash()[0] === 'favorites') {
    renderFavorites();
  }
}

// Extract leading emoji from a string (handles surrogate pairs + variation selectors + Firestore icon)
function extractEmoji(name) {
  if (!name) return '';
  // Check category or subcategory icon field in _appwriteCategories / _appwriteSubcategories
  if (typeof _appwriteCategories !== 'undefined' && _appwriteCategories && _appwriteCategories.length > 0) {
    const cm = _appwriteCategories.find(function(c) { return c && (c.name === name || (c.name && c.name.toLowerCase() === name.toLowerCase())); });
    if (cm && cm.icon && cm.icon.length <= 4) return cm.icon;
  }
  if (typeof _appwriteSubcategories !== 'undefined' && _appwriteSubcategories && _appwriteSubcategories.length > 0) {
    const sm = _appwriteSubcategories.find(function(s) { return s && (s.name === name || (s.name && s.name.toLowerCase() === name.toLowerCase())); });
    if (sm && sm.icon && sm.icon.length <= 4) return sm.icon;
  }
  // Regex: emoji ranges including surrogate pairs, ZWJ sequences, variation selectors, skin tones
  const emojiRegex = /^(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*[\uFE0E\uFE0F]?)/u;
  const m = name.match(emojiRegex);
  return m ? m[1] : '';
}

function getCategoryEmoji(name) {
  const explicitEmoji = extractEmoji(name);
  if (explicitEmoji) return explicitEmoji;
  const normalized = stripEmoji(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const categories = [
    [/ilumin/, '💡'],
    [/bebe|maternidad|infantil/, '🍼'],
    [/belleza|cuidado personal|maquill|cosmet/, '💄'],
    [/herramient|ferreter/, '🛠️'],
    [/cocina|menaje/, '🍳'],
    [/aseo|limpieza|bano|higiene/, '🧼'],
    [/hogar|decoracion|organizacion/, '🏠'],
    [/electronica|tecnologia|audio|celular/, '📱'],
    [/mascota|animal/, '🐾'],
    [/juguete|nino|nina/, '🧸'],
    [/ropa|moda|calzado|vestuario/, '👕'],
    [/jardin|exterior|planta/, '🪴'],
    [/escolar|oficina|papeleria/, '✏️'],
    [/deporte|fitness/, '⚽'],
    [/auto|vehiculo|automotriz/, '🚗'],
    [/general/, '📦']
  ];
  const match = categories.find(([pattern]) => pattern.test(normalized));
  return match ? match[1] : '📦';
}

// Remove leading emoji + trailing whitespace from a name
function stripEmoji(name) {
  if (!name) return '';
  const emojiRegex = /^(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*[\uFE0E\uFE0F]?\s*)/u;
  if (emojiRegex.test(name)) {
    return name.replace(emojiRegex, '').trim();
  }
  const emoji = extractEmoji(name);
  if (emoji && name.startsWith(emoji) && !/^[A-Za-z0-9ÁÉÍÓÚáéíóúñÑ]/.test(emoji)) {
    return name.slice(emoji.length).trim();
  }
  return name.trim();
}

// Generic SVG icon for categories/subcategories without emoji or image
const FALLBACK_CAT_SVG = '<svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 7l-1-1m0 0l-3-3m3 3l-3-3m3 3v10a2 2 0 01-2 2H7a2 2 0 01-2-2V4m0 0l3-3m-3 3l3-3m0 0h7a2 2 0 012 2v0M7 10h10M7 14h6"/></svg>';
async function saveSettings(newSettings) {
  _settings = { ..._settings, ...newSettings };
  localStorage.setItem('db_settings', JSON.stringify(_settings));
  try { await db.doc(DOC_SETTINGS).set(_settings); } catch(e) { console.error('Error saving settings:', e); }
}

window.updateMinPurchase = async function() {
  const val = parseInt(document.getElementById('admin_min_purchase').value);
  if (isNaN(val) || val < 0) return showToast('Monto inválido');
  await saveSettings({ minPurchase: val });
  
  const minPurchEl = document.getElementById('minPurchaseDisplay');
  if (minPurchEl) minPurchEl.textContent = `Compra mínima • $${getMinPurchase().toLocaleString('es-CL')}`;
  
  showToast('Compra mínima actualizada');
};

function getCategoryIcon(cat, fullPathArray) {
  // 1. Custom categories (Firestore admin del catalogo)
  if (fullPathArray && fullPathArray.length > 0) {
    const pathStr = fullPathArray.join('/');
    if (_customCategories[pathStr] && _customCategories[pathStr].image) {
      return _customCategories[pathStr].image;
    }
  }
  if (_customCategories[cat] && _customCategories[cat].image) {
    return _customCategories[cat].image;
  }
  // 2. Appwrite / Firestore categories: buscar por nombre en _appwriteCategories
  if (typeof _appwriteCategories !== 'undefined' && _appwriteCategories && _appwriteCategories.length > 0) {
    var apiBase = window.location.origin;
    // Top-level category: match by name
    var catMatch = _appwriteCategories.find(function(c) {
      return c && (c.name === cat || (c.name && c.name.toLowerCase() === cat.toLowerCase()));
    });
    if (catMatch) {
      var icon = catMatch.iconUrl || catMatch.BACKGROUND_IMAGE_URL || '';
      if (icon && icon.startsWith('http')) return icon;
      if (icon) return resolveAppwriteImage(icon, apiBase);
    }
    // Subcategory: match by name in _appwriteSubcategories
    if (fullPathArray && fullPathArray.length > 1 && typeof _appwriteSubcategories !== 'undefined' && _appwriteSubcategories) {
      var subMatch = _appwriteSubcategories.find(function(s) {
        return s && (s.name === cat || (s.name && s.name.toLowerCase() === cat.toLowerCase()));
      });
      if (subMatch) {
        var subIcon = subMatch.iconUrl || subMatch.BACKGROUND_IMAGE_URL || '';
        if (subIcon && subIcon.startsWith('http')) return subIcon;
        if (subIcon) return resolveAppwriteImage(subIcon, apiBase);
      }
    }
  }
  // Si Perfumes Hombre no tiene imagen configurada, usar una foto real de su catálogo.
  var normalizedCatName = stripEmoji(cat || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\bperfumes?\b/.test(normalizedCatName) && /\b(hombre|hombres|masculino|men)\b/.test(normalizedCatName)) {
    var perfumeProduct = getProducts().find(function(product) {
      if (!product || !product.image || getRealStock(product) <= 0) return false;
      return String(product.CATEGORYID || '').toLowerCase() === 'cat_perfumes_hombre' || matchesPath(product, [cat]);
    });
    if (perfumeProduct) return perfumeProduct.image;
  }
  // 3. Hardcoded fallback icons
  return CATEGORY_ICONS[cat] || null;
}

// Permite recorrer horizontalmente las categorías con el dedo, incluso en el iframe móvil.
function initCategorySwipe() {
  if (window.__categorySwipeInitialized) return;
  window.__categorySwipeInitialized = true;

  let gesture = null;
  let suppressClickUntil = 0;

  document.addEventListener('pointerdown', function(event) {
    if (event.pointerType === 'touch') return;
    const row = event.target.closest && event.target.closest('.category-scroll-row');
    if (!row || event.button !== 0 || event.isPrimary === false) return;
    gesture = {
      row: row,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: row.scrollLeft,
      dragging: false
    };
  }, { passive: true });

  document.addEventListener('pointermove', function(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      if (Math.abs(deltaX) < 7 && Math.abs(deltaY) < 7) return;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) { gesture = null; return; }
      gesture.dragging = true;
      gesture.row.classList.add('is-dragging');
    }
    gesture.row.scrollLeft = gesture.startScrollLeft - deltaX;
    if (event.cancelable) event.preventDefault();
  }, { passive: false });

  function finishGesture(event) {
    if (!gesture || (event && event.pointerId !== gesture.pointerId)) return;
    if (gesture.dragging) {
      gesture.row.classList.remove('is-dragging');
      suppressClickUntil = Date.now() + 350;
    }
    gesture = null;
  }
  document.addEventListener('pointerup', finishGesture, { passive: true });
  document.addEventListener('pointercancel', finishGesture, { passive: true });

  document.addEventListener('click', function(event) {
    if (Date.now() >= suppressClickUntil || !event.target.closest('.category-scroll-row')) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

var _toastTimer = null;
function showToast(msg, options) {
  const t = $('#toast');
  if (!t) return;
  if (_toastTimer) clearTimeout(_toastTimer);
  options = options || {};

  if (options.html) {
    t.innerHTML = options.html;
  } else {
    t.innerHTML = `<div class="flex items-center gap-2">
      <span class="w-4 h-4 rounded-full bg-blue-500/30 text-blue-300 flex items-center justify-center text-[10px] shrink-0 font-bold">i</span>
      <span class="text-white text-xs font-bold leading-tight">${escapeHtml(msg)}</span>
    </div>`;
  }

  t.classList.remove('hidden');
  void t.offsetWidth;
  t.classList.add('is-visible');
  _toastTimer = setTimeout(() => {
    t.classList.remove('is-visible');
    setTimeout(() => t.classList.add('hidden'), 260);
  }, options.duration || 2400);
}

function animateAddButtons(sku) {
  try {
    const btns = document.querySelectorAll(`[data-catalog-action="add"][data-sku="${sku}"]`);
    btns.forEach(btn => {
      btn.classList.add('btn-add-pop');
      const origContent = btn.innerHTML;
      btn.innerHTML = `<svg class="w-4 h-4 text-emerald-600 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg><span class="text-emerald-700 font-extrabold">¡Agregado!</span>`;
      setTimeout(() => {
        btn.classList.remove('btn-add-pop');
        if (typeof syncCatalogDesignCart === 'function') {
          syncCatalogDesignCart();
        } else {
          btn.innerHTML = origContent;
        }
      }, 1100);
    });
  } catch (e) {}
}

function bumpCart() {
  const targets = [
    document.querySelector('#bottomNav [data-nav="cart"]'),
    document.getElementById('catalogOrderPeek'),
    document.getElementById('cartBtn')
  ].filter(Boolean);
  targets.forEach(t => {
    t.classList.remove('cart-thump');
    void t.offsetWidth;
    t.classList.add('cart-thump');
    setTimeout(() => t.classList.remove('cart-thump'), 480);
  });
}

function getPrice(p) {
  return Math.max(p.priceA || 0, p.priceB || 0);
}

function getOverrides() { return _overrides; }
async function saveOverrides(ovs) {
  _overrides = ovs;
  try { await db.doc(DOC_OVERRIDES).set({ map: ovs }); } catch(e) { console.error('Error saving overrides:', e); }
}
function setOverride(sku, patch) {
  const ovs = getOverrides();
  ovs[sku] = { ...(ovs[sku] || {}), ...patch };
  _overrides = ovs;
  db.doc(DOC_OVERRIDES).set({ map: ovs }).catch(e => console.error('Error saving override:', e));
}
function clearOverride(sku) {
  const ovs = getOverrides();
  delete ovs[sku];
  _overrides = ovs;
  db.doc(DOC_OVERRIDES).set({ map: ovs }).catch(e => console.error('Error clearing override:', e));
}
function getDeleted() { return _deletedSkus; }
function setDeleted(skus) {
  _deletedSkus = skus;
  db.doc(DOC_DELETED).set({ skus }).catch(e => console.error('Error saving deleted:', e));
}
function getCartProduct(skuOrId) {
  if (!skuOrId) return null;
  const target = String(skuOrId).trim().toLowerCase();
  const raw = allProducts.find(function(p) {
    if (!p) return false;
    return String(p.sku || '').trim().toLowerCase() === target ||
           String(p.id || '').trim().toLowerCase() === target ||
           String(p.code || '').trim().toLowerCase() === target;
  }) || _customProducts.find(function(p) {
    if (!p) return false;
    return String(p.sku || '').trim().toLowerCase() === target ||
           String(p.id || '').trim().toLowerCase() === target ||
           String(p.code || '').trim().toLowerCase() === target;
  });
  if (!raw) return null;
  const overrides = getOverrides();
  const key = raw.sku || target;
  const result = overrides[key] ? { ...raw, ...overrides[key] } : { ...raw };
  const live = allProducts.find(function(p) { return p && (p.sku === raw.sku || (p.id && p.id === raw.id)); });
  if (live) { result.stock = live.stock; result.STOCK = live.stock; }
  return result;
}

function getProducts() {
  const overrides = getOverrides();
  const deleted = new Set(getDeleted());
  const seen = new Set();
  return [..._customProducts, ...allProducts]
    .filter(p => {
      if (!p || !p.sku || String(p.sku).trim() === '' || deleted.has(p.sku)) return false;
      if (seen.has(p.sku)) return false;
      seen.add(p.sku);
      // Filtro por tienda seleccionada
      if (selectedStore) {
        const liveProduct = allProducts.find(function(live) {
          return live && (live.sku === p.sku || live.id === p.id || live.name === p.name);
        });
        const pVendor = p.VENDOR_ID || (liveProduct && liveProduct.VENDOR_ID) || '';
        if (selectedStore === '__main__' && pVendor) return false;
        if (selectedStore !== '__main__' && pVendor !== selectedStore) return false;
      }
      return true;
    })
    .map(p => {
      const liveProduct = allProducts.find(function(live) {
        return live && (live.sku === p.sku || live.id === p.id || live.name === p.name);
      });
      const merged = overrides[p.sku] ? { ...p, ...overrides[p.sku] } : { ...p };
      // El inventario vivo no puede ser reemplazado por un ajuste local antiguo.
      if (liveProduct) { merged.stock = liveProduct.stock; merged.STOCK = liveProduct.stock; }
      if (!merged.VENDOR_ID && liveProduct && liveProduct.VENDOR_ID) merged.VENDOR_ID = liveProduct.VENDOR_ID;
      if (!merged.VENDOR_NAME && liveProduct && liveProduct.VENDOR_NAME) merged.VENDOR_NAME = liveProduct.VENDOR_NAME;
      if (!merged.image) {
        const rawImage = merged.IMAGEURL || merged.IMAGEURL2 || merged.IMAGEURL3 || '';
        if (rawImage) {
          const imageBase = window.location.origin;
          merged.image = typeof resolveAppwriteImage === 'function' ? resolveAppwriteImage(rawImage, imageBase) : rawImage;
        }
      }
      return merged;
    });
}

function getProductImageCandidates(product) {
  const matches = [product];
  const sku = product && product.sku;
  if (sku) {
    allProducts.filter(function(p) { return p && (p.sku === sku || p.SKU === sku); }).forEach(function(p) { matches.push(p); });
    _customProducts.filter(function(p) { return p && (p.sku === sku || p.SKU === sku); }).forEach(function(p) { matches.push(p); });
  }
  const urls = [];
  matches.forEach(function(p) {
    [p.image, p.IMAGEURL, p.image2, p.IMAGEURL2, p.image3, p.IMAGEURL3].forEach(function(url) {
      if (url && String(url).trim()) {
        const raw = String(url).trim();
        const resolved = typeof resolveAppwriteImage === 'function' ? resolveAppwriteImage(raw, window.location.origin) : raw;
        if (resolved && urls.indexOf(resolved) < 0) urls.push(resolved);
      }
    });
  });
  return urls;
}

// Use Vercel's cached image optimizer only for the known public Firebase buckets.
// Keep the original URL for full-size views and as a fallback if optimization fails.
function catalogThumbnailUrl(src, width) {
  try {
    const url = new URL(src, window.location.origin);
    const buckets = [firebaseConfig.storageBucket];
    if (url.protocol !== 'https:') return src;
    const parts = url.pathname.split('/');
    const bucket = url.hostname === 'storage.googleapis.com' ? parts[1]
      : url.hostname === 'firebasestorage.googleapis.com' && parts[1] === 'v0' && parts[2] === 'b' ? parts[3] : '';
    if (!buckets.includes(bucket)) return src;
    return '/_next/image?url=' + encodeURIComponent(url.href) + '&w=' + width + '&q=75';
  } catch (_) { return src; }
}

function catalogImageError(image) {
  const original = image.dataset.originalSrc;
  if (original && image.dataset.triedOriginal !== '1') {
    image.dataset.triedOriginal = '1';
    image.src = original;
    return;
  }
  const placeholder = document.createElement('div');
  placeholder.className = (image.dataset.fallbackClass || 'w-full h-full') + ' img-placeholder rounded-2xl text-xl font-bold font-display';
  placeholder.textContent = image.dataset.initials || 'IC';
  image.replaceWith(placeholder);
}

function preloadCatalogThumbnail(src, width, onLoad, onError) {
  const image = new Image();
  const optimized = catalogThumbnailUrl(src, width);
  let triedOriginal = optimized === src;
  image.onload = function() { onLoad(image.src); };
  image.onerror = function() {
    if (!triedOriginal) { triedOriginal = true; image.src = src; }
    else onError();
  };
  image.src = optimized;
}

// Image fallback HTML
function imgEl(src, alt, sizeClass='w-full h-full') {
  const initials = (alt || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || 'DB';
  if (!src) {
    return `<div class="${sizeClass} img-placeholder rounded-2xl text-xl font-bold font-display">${escapeHtml(initials)}</div>`;
  }
  const optimized = catalogThumbnailUrl(src, 384);
  return `<img src="${escapeHtml(optimized)}" data-original-src="${escapeHtml(optimized === src ? '' : src)}" data-fallback-class="${escapeHtml(sizeClass)}" data-initials="${escapeHtml(initials)}" alt="${escapeHtml(alt)}" class="${sizeClass} object-cover rounded-2xl" loading="lazy" onerror="catalogImageError(this)">`;
}

// === Cart Synchronization with Next.js (yaxsel_cart) ===
function syncToParentCart() {
  try {
    const rawYaxsel = localStorage.getItem('yaxsel_cart');
    let parentCart = [];
    try { parentCart = rawYaxsel ? JSON.parse(rawYaxsel) : []; } catch (e) {}
    if (!Array.isArray(parentCart)) parentCart = [];

    // Ensure cart itself is deduplicated
    cart = deduplicateIframeCart(cart);
    const sameParentLine = (parentItem, cartItem) => {
      const productMatches = parentItem.product?.$id === cartItem.id ||
        (cartItem.sku && parentItem.product?.SKU === cartItem.sku) ||
        (cartItem.sku && parentItem.product?.$id === cartItem.sku) ||
        (cartItem.id && parentItem.product?.SKU === cartItem.id);
      if (!productMatches || Boolean(parentItem.isPack) !== (cartItem.mode === 'box')) return false;
      if (parentItem.bundleId || parentItem.bundleInstanceId || cartItem.bundleId || cartItem.bundleInstanceId) {
        return parentItem.bundleId === cartItem.bundleId && parentItem.bundleInstanceId === cartItem.bundleInstanceId;
      }
      return true;
    };

    const newParentItems = [];
    for (const item of cart) {
      const alreadyInNew = newParentItems.find(p => sameParentLine(p, item));
      if (alreadyInNew) {
        alreadyInNew.quantity += (item.qty || 1);
        continue;
      }

      const existingParent = parentCart.find(p => sameParentLine(p, item));
      const pProd = (typeof getCartProduct === 'function' ? getCartProduct(item.sku) : null) || {};
      const productObj = existingParent ? { ...existingParent.product } : {
        $id: item.id || item.sku,
        SKU: item.sku,
        NAME: item.name || pProd.name || '',
        PRICE: item.bundleOriginalUnitPrice ?? item.price ?? pProd.price ?? 0,
        IMAGEURL: item.image || pProd.image || '',
        VENDOR_ID: item.vendorId || pProd.VENDOR_ID || '',
        STOCK: item.stock ?? pProd.stock ?? 99999
      };
      productObj.NAME = item.name || productObj.NAME;
      productObj.PRICE = item.bundleOriginalUnitPrice ?? item.price ?? productObj.PRICE;
      if (item.image) productObj.IMAGEURL = item.image;
      if (item.vendorId) productObj.VENDOR_ID = item.vendorId;

      newParentItems.push({
        product: productObj,
        quantity: item.qty,
        wholesalePrice: item.mode === 'wholesale' ? item.price : undefined,
        isPack: item.mode === 'box',
        bundleId: item.bundleId,
        bundleInstanceId: item.bundleInstanceId,
        bundleTitle: item.bundleTitle,
        bundleUnitPrice: item.bundleUnitPrice ?? (item.bundleId ? item.price : undefined),
        bundleOriginalUnitPrice: item.bundleOriginalUnitPrice,
        bundlePackQty: item.bundlePackQty,
        bundlePackPrice: item.bundlePackPrice
      });
    }

    // Preserve items not in this catalog
    for (const pItem of parentCart) {
      const pId = pItem.product?.$id;
      const pSku = pItem.product?.SKU;
      const inAppCart = cart.some(i => 
        (i.id && (i.id === pId || i.id === pSku)) || 
        (i.sku && (i.sku === pSku || i.sku === pId))
      );
      const alreadyInNew = newParentItems.some(np => 
        (np.product?.$id === pId || (pSku && np.product?.SKU === pSku) || (pId && np.product?.SKU === pId) || (pSku && np.product?.$id === pSku)) &&
        Boolean(np.isPack) === Boolean(pItem.isPack) &&
        ((np.bundleId || np.bundleInstanceId || pItem.bundleId || pItem.bundleInstanceId)
          ? np.bundleId === pItem.bundleId && np.bundleInstanceId === pItem.bundleInstanceId
          : true)
      );
      if (!inAppCart && !alreadyInNew && pItem.product && pItem.quantity > 0) {
        newParentItems.push(pItem);
      }
    }

    localStorage.setItem('yaxsel_cart', JSON.stringify(newParentItems));
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'YAXSEL_CART_SYNC', items: newParentItems }, '*');
      try { window.parent.dispatchEvent(new CustomEvent('yaxsel:cart-updated')); } catch (e) {}
    }
  } catch (err) {
    console.warn('Error syncing cart to parent:', err);
  }
}

function syncFromParentCart(parentItems) {
  if (!Array.isArray(parentItems)) return;
  const mapped = parentItems.map(item => ({
    id: item.product?.$id || '',
    sku: item.product?.SKU || item.product?.$id || '',
    name: item.product?.NAME || '',
    price: item.bundleUnitPrice ?? item.bundlePackPrice ?? item.wholesalePrice ?? item.product?.PRICE ?? 0,
    qty: item.quantity || 1,
    image: item.product?.IMAGEURL || '',
    mode: item.isPack ? 'box' : (item.wholesalePrice ? 'wholesale' : 'public'),
    vendorId: item.product?.VENDOR_ID || '',
    stock: item.product?.STOCK,
    bundleId: item.bundleId,
    bundleInstanceId: item.bundleInstanceId,
    bundleTitle: item.bundleTitle,
    bundleUnitPrice: item.bundleUnitPrice,
    bundleOriginalUnitPrice: item.bundleOriginalUnitPrice,
    bundlePackQty: item.bundlePackQty,
    bundlePackPrice: item.bundlePackPrice
  })).filter(i => i.qty > 0 && (i.id || i.sku));

  cart = deduplicateIframeCart(mapped);
  localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
  updateCartCount();
  const cartDrawerEl = document.getElementById('cartDrawer');
  if (cartDrawerEl && !cartDrawerEl.classList.contains('hidden') && typeof renderCart === 'function') {
    renderCart();
  }
}

window.addEventListener('message', (e) => {
  if (e.origin !== window.location.origin || e.source !== window.parent) return;
  if (e.data && e.data.type === 'YAXSEL_FAVORITES_SYNC' && Array.isArray(e.data.favorites)) {
    syncCatalogFavorites(e.data.favorites);
  }
  if (e.data && e.data.type === 'YAXSEL_CART_SYNC_FROM_PARENT' && Array.isArray(e.data.items)) {
    syncFromParentCart(e.data.items);
  }
  // Recibir configuración del parent (Next.js) — ej. minPurchase, storeName y cajeras
  if (e.data && e.data.type === 'YAXSEL_SETTINGS') {
    var shouldReRender = false;
    if (Array.isArray(e.data.favorites)) syncCatalogFavorites(e.data.favorites);
    if (e.data.storeName) {
      var prevName = MAIN_STORE_NAME;
      MAIN_STORE_NAME = String(e.data.storeName).trim();
      _settings.storeName = MAIN_STORE_NAME;
      try { localStorage.setItem('store_name', MAIN_STORE_NAME); } catch (err) {}
      // Re-render si el nombre cambio (ej: "Yaxsell Demo" -> "Importadora Carlitos")
      if (prevName !== MAIN_STORE_NAME) {
        shouldReRender = true;
      }
    }
    if (e.data.logoUrl) {
      const nextLogoUrl = String(e.data.logoUrl).trim();
      _settings.logoUrl = nextLogoUrl;
    }
    if (typeof e.data.minPurchase === 'number' && e.data.minPurchase > 0) {
      _settings.minPurchase = e.data.minPurchase;
      const minDisplay = document.getElementById('minPurchaseDisplay');
      if (minDisplay) minDisplay.textContent = `Compra mínima • $${_settings.minPurchase.toLocaleString('es-CL')}`;
      const minPurchaseHero = document.getElementById('minPurchaseHero');
      if (minPurchaseHero) minPurchaseHero.textContent = formatMinPurchaseCompact(_settings.minPurchase);
    }
    if (Array.isArray(e.data.whatsappContacts) && e.data.whatsappContacts.length > 0) {
      WHATSAPP_CONTACTS = e.data.whatsappContacts.filter(function(c) { return c.active !== false; });
      try { localStorage.setItem('store_whatsapp_contacts', JSON.stringify(e.data.whatsappContacts)); } catch (err) {}
    }
    if (e.data.balatinContact && e.data.balatinContact.number) {
      BALATIN_CONTACT = e.data.balatinContact;
      try { localStorage.setItem('store_balatin_contact', JSON.stringify(e.data.balatinContact)); } catch (err) {}
    }
    if (e.data.homeMarketing) {
      var prevMarketing = JSON.stringify(_homeMarketing);
      var newMarketing = JSON.stringify(e.data.homeMarketing);
      _homeMarketing = e.data.homeMarketing;
      try { localStorage.setItem('home_marketing', JSON.stringify(e.data.homeMarketing)); } catch (err) {}
      // Solo re-render si el homeMarketing realmente cambio
      if (prevMarketing !== newMarketing) {
        shouldReRender = true;
      }
    }
    if (e.data.webConfig && typeof e.data.webConfig === 'object') {
      const next = e.data.webConfig;
      const previous = JSON.stringify(_settings.webConfig || null);
      _settings.webConfig = next;
      _settings.logoUrl = String(next.logoUrl || '');
      _settings.heroImageUrl = String(next.heroImageUrl || '');
      _settings.supportPhone = String(next.supportPhone || '').replace(/\D/g, '');
      _settings.botPhone = String(next.botPhone || '').replace(/\D/g, '');
      _settings.address = String(next.address || '');
      _settings.announcementText = String(next.announcementText || '');
      _settings.shippingText = String(next.shippingText || '');
      _settings.heroKicker = String(next.heroKicker || '');
      _settings.heroTitle = String(next.heroTitle || '');
      _settings.heroDescription = String(next.heroDescription || '');
      BALATIN_CONTACT = { ...BALATIN_CONTACT, name: MAIN_STORE_NAME, number: _settings.botPhone, active: Boolean(_settings.botPhone) };
      WHATSAPP_CONTACTS = _settings.supportPhone ? [{ name: 'Atención', number: _settings.supportPhone, active: true }] : [];
      if (previous !== JSON.stringify(next)) shouldReRender = true;
    }
    updateCatalogBranding();
    if (shouldReRender) {
      try { render(); } catch (err) {}
    }
  }
});

function updateHeaderWhatsAppUrl() {
  const btn = document.getElementById('headerWhatsAppBtn');
  if (!btn) return;
  const phone = _settings.supportPhone || _settings.botPhone || '';
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  btn.style.display = cleanPhone ? '' : 'none';
  if (!cleanPhone) { btn.removeAttribute('href'); return; }
  btn.href = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent('Hola, tengo una consulta sobre la tienda 🛒');
}

function updateCatalogBranding() {
  const logoEl = document.getElementById('mainLogoImg');
  if (logoEl) {
    if (_settings.logoUrl) logoEl.src = _settings.logoUrl;
    logoEl.alt = MAIN_STORE_NAME;
  }
  if (MAIN_STORE_NAME) {
    document.title = MAIN_STORE_NAME + ' · Catálogo Mayorista';
    updateHeaderWhatsAppUrl();
  }
  const location = document.querySelector('.carlitos-announcement-location');
  if (location) {
    location.style.display = _settings.address ? '' : 'none';
    location.querySelectorAll('.carlitos-location-full, .carlitos-location-short').forEach(el => { el.textContent = _settings.address || ''; });
  }
  const icon = document.querySelector('link[rel="icon"]');
  if (icon && _settings.logoUrl) icon.setAttribute('href', _settings.logoUrl);
  const announcement = document.querySelector('.carlitos-announcement-copy');
  if (announcement) {
    announcement.replaceChildren();
    String(_settings.announcementText || '').split('·').forEach((part, index) => {
      if (index) { const dot = document.createElement('i'); dot.textContent = '·'; announcement.appendChild(dot); }
      announcement.appendChild(document.createTextNode(part.trim()));
    });
  }
  const shipping = document.querySelector('.catalog-shipping');
  const shippingText = shipping && shipping.querySelector('strong');
  if (shipping && shippingText) { shipping.style.display = _settings.shippingText ? '' : 'none'; shippingText.textContent = _settings.shippingText || ''; }
}
window.addEventListener('yaxsel:cart-updated', () => {
  try {
    const raw = localStorage.getItem('yaxsel_cart');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) syncFromParentCart(parsed);
    }
  } catch (err) {}
});
window.addEventListener('storage', (e) => {
  if (e.key === 'yaxsel_cart' && e.newValue) {
    try {
      const parsed = JSON.parse(e.newValue);
      if (Array.isArray(parsed)) syncFromParentCart(parsed);
    } catch (err) {}
  }
});

// === Cart ===
function saveCart() {
  localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
  updateCartCount();
  syncToParentCart();
}
function updateCartCount() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const el = $('#cartCount');
  const navEl = $('#navCartBadge');
  if (typeof syncCatalogDesignCart === 'function') syncCatalogDesignCart();
  if (total > 0) {
    if (el) {
      el.textContent = total;
      el.classList.remove('hidden');
      el.classList.add('pop');
      setTimeout(() => el.classList.remove('pop'), 300);
    }
    if (navEl) {
      navEl.textContent = total;
      navEl.classList.remove('hidden');
      navEl.style.removeProperty('display');
    }
  } else {
    if (el) el.classList.add('hidden');
    if (navEl) {
      navEl.classList.add('hidden');
      navEl.style.setProperty('display', 'none', 'important');
    }
  }
}

function updateBottomNav() {
  const hash = location.hash || '#/';
  let active = hash === '#/' || hash === '' ? 'home' : 'categories';
  if (hash.startsWith('#/my-orders')) active = 'account';
  else if (hash.startsWith('#/favorites')) active = 'favorites';
  else if (hash.startsWith('#/cart')) active = 'cart';
  else if (hash.startsWith('#/account')) active = 'account';
  document.querySelectorAll('#bottomNav .nav-item').forEach(el => {
    const selected = el.dataset.nav === active;
    el.classList.toggle('active', selected);
    if (selected) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  let desktopActive = 'home';
  if (hash.startsWith('#/my-orders')) desktopActive = 'my-orders';
  else if (hash.startsWith('#/favorites')) desktopActive = 'favorites';
  else if (hash.startsWith('#/account')) desktopActive = 'account';
  else if (hash !== '#/' && hash !== '') desktopActive = 'all';
  document.querySelectorAll('.carlitos-desktop-nav .carlitos-nav-link').forEach(el => {
    const selected = el.dataset.desktopNav === desktopActive;
    el.classList.toggle('active', selected);
    if (selected) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}
function addToCart(sku, qty = 1) {
  const p = getProducts().find(x => x.sku === sku || (x.id && x.id === sku));
  if (!p) return;
  qty = Math.max(1, parseInt(qty) || 1);
  const targetMode = currentMode || 'public';
  const existing = cart.find(i => 
    (i.sku === p.sku || (p.id && i.id && i.id === p.id) || (p.sku && i.id && i.id === p.sku) || (i.sku && p.id && i.sku === p.id)) &&
    isSameCartMode(i.mode, targetMode)
  );
  const inCart = existing ? existing.qty : 0;
  const room = Math.max(0, (p.stock || 0) - inCart);
  if (room <= 0) { showToast('Sin más stock disponible'); return; }
  const add = Math.min(qty, room);
  if (existing) {
    existing.qty += add;
    existing.mode = targetMode;
  } else {
    cart.push({ sku: p.sku || sku, id: p.id || '', image: p.image || '', qty: add, mode: targetMode, price: getPrice(p), name: p.name, vendorId: p.VENDOR_ID || '' });
  }
  saveCart();
  if (typeof showCatalogOrderPeek === 'function') showCatalogOrderPeek();
  animateAddButtons(p.sku || sku);
  flyToCart(p.sku || sku);
  trackUserAddToCart(p.sku || sku, add);
  if (add < qty) setTimeout(() => showToast(`Solo quedaban ${add} unidades disponibles`), 1500);
}

// Fly product image to the cart icon
function flyToCart(sku) {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      bumpCart();
      return;
    }
    const btn = Array.from(document.querySelectorAll('[data-catalog-action="add"]')).find(el => el.dataset.sku === String(sku)) || document.querySelector(`button[onclick*="'${sku}'"]`);
    const card = btn && btn.closest('.product-card');
    const srcImg = (card && card.querySelector('img')) || document.querySelector('#modal-content img');
    const desktopCart = document.getElementById('cartBtn');
    const peekEl = document.getElementById('catalogOrderPeek');
    const bottomCartEl = document.querySelector('#bottomNav [data-nav="cart"]');
    const cartTarget = (desktopCart && desktopCart.getBoundingClientRect().width > 0)
      ? desktopCart
      : (peekEl && !peekEl.hidden && peekEl.getBoundingClientRect().width > 0 ? peekEl : bottomCartEl);
    if (!srcImg || !cartTarget) {
      bumpCart();
      return;
    }
    const s = srcImg.getBoundingClientRect();
    const c = cartTarget.getBoundingClientRect();
    if (s.width === 0 || s.height === 0) {
      bumpCart();
      return;
    }
    const fly = document.createElement('img');
    fly.src = srcImg.src;
    fly.className = 'fly-img';
    fly.style.left = s.left + 'px';
    fly.style.top = s.top + 'px';
    fly.style.width = Math.min(s.width, 90) + 'px';
    fly.style.height = Math.min(s.height, 90) + 'px';
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
      fly.style.left = (c.left + c.width / 2 - 16) + 'px';
      fly.style.top = (c.top + c.height / 2 - 16) + 'px';
      fly.style.width = '32px';
      fly.style.height = '32px';
      fly.style.opacity = '0.35';
      fly.style.transform = 'scale(0.6) rotate(20deg)';
    });
    setTimeout(() => {
      fly.remove();
      bumpCart();
    }, 580);
  } catch (e) {
    bumpCart();
  }
}
function removeFromCart(sku, mode, bundleInstanceId) {
  cart = cart.filter(i => bundleInstanceId
    ? i.bundleInstanceId !== bundleInstanceId
    : !((i.sku === sku || (i.id && i.id === sku)) && isSameCartMode(i.mode, mode)));
  saveCart();
  renderCart();
}
function changeQty(sku, mode, delta) {
  const idx = cart.findIndex(i => (i.sku === sku || (i.id && i.id === sku)) && isSameCartMode(i.mode, mode));
  if (idx === -1) return;
  if (cart[idx].bundleId) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) {
    cart.splice(idx, 1);
  }
  saveCart();
  renderCart();
}
function setQty(sku, mode, value) {
  const qty = parseInt(value);
  if (isNaN(qty) || qty < 1) return;
  const idx = cart.findIndex(i => (i.sku === sku || (i.id && i.id === sku)) && isSameCartMode(i.mode, mode));
  if (idx === -1) return;
  if (cart[idx].bundleId) return;
  cart[idx].qty = qty;
  saveCart();
  renderCart();
}
function cartTotal() {
  return cart.reduce((s, i) => s + i.qty * i.price, 0);
}

// El catálogo puede estar cacheado. Solo completar datos visuales aquí; la
// disponibilidad y las cantidades se verifican con stock fresco en checkout.
function syncCartWithLiveProducts() {
  if (!Array.isArray(allProducts) || allProducts.length === 0 || cart.length === 0) return 0;
  const productsBySkuOrId = new Map();
  allProducts.forEach(function(p) {
    if (!p) return;
    if (p.sku) productsBySkuOrId.set(String(p.sku).trim().toLowerCase(), p);
    if (p.id) productsBySkuOrId.set(String(p.id).trim().toLowerCase(), p);
    if (p.code) productsBySkuOrId.set(String(p.code).trim().toLowerCase(), p);
  });
  cart.forEach(function(item) {
    const sTarget = String(item.sku || '').trim().toLowerCase();
    const idTarget = String(item.id || '').trim().toLowerCase();
    const product = (sTarget && productsBySkuOrId.get(sTarget)) ||
                    (idTarget && productsBySkuOrId.get(idTarget)) ||
                    null;
    if (product) {
      item.id = product.id || item.id || '';
      if (!item.image && product.image) item.image = product.image;
      item.name = product.name || item.name || '';
      if (!item.bundleId) item.price = getPrice(product) || item.price || 0;
      item.vendorId = product.VENDOR_ID || item.vendorId || '';
    }
  });
  return 0;
}

async function refreshCartBeforeOpen() {
  if (Array.isArray(allProducts) && allProducts.length > 0 && (Date.now() - _lastCatalogSyncTs < 2 * 60 * 1000)) {
    syncCartWithLiveProducts();
    renderCart();
    return;
  }
  try {
    const liveProducts = await fetchAppwriteProducts();
    if (liveProducts.length > 0) {
      allProducts = liveProducts;
      await loadFirestoreData();
      syncCartWithLiveProducts();
      renderCart();
    }
  } catch (e) {
    console.warn('No se pudo actualizar el carrito con el catálogo vivo', e);
  }
}

function openCart() {
  // Si estamos dentro de un iframe (ej. /productos), pedirle al padre que abra
  // su React CartDrawer en lugar de mostrar el drawer interno.
  if (window.parent && window.parent !== window) {
    syncToParentCart();
    window.parent.postMessage({ type: 'YAXSEL_OPEN_CART' }, '*');
    return;
  }
  // Fallback: drawer interno cuando se usa standalone
  const drawer = $('#cartDrawer');
  if (drawer) drawer.classList.remove('hidden');
  const bNav = $('#bottomNav');
  if (bNav) bNav.style.display = 'none';
  document.body.style.overflow = 'hidden';
  renderCart();
  // Actualizar productos cada vez que el cliente abre el carrito.
  refreshCartBeforeOpen();
}
function closeCart() {
  const drawer = $('#cartDrawer');
  if (drawer) drawer.classList.add('hidden');
  const bNav = $('#bottomNav');
  if (bNav) bNav.style.display = '';
  document.body.style.overflow = '';
}
let selectedCartGroupId = null;
let selectedCartVendor = null;

function getCartGroups() {
  const itemsWithProd = cart.map(function(item) {
    return { item: item, product: getCartProduct(item.sku) || getCartProduct(item.id) };
  });
  return [{
    id: '__main__',
    name: MAIN_STORE_NAME,
    phone: '',
    color: '#2563eb',
    items: itemsWithProd
  }];
}

function cartGroupTotal(group) {
  return cartTotal();
}

function cartGroupMinimum(group) {
  return getMinPurchase();
}

function vendorBadge(product) {
  var isMain = !product || (!product.VENDOR_ID && product.VENDOR_IS_MAIN !== false);
  var rawName = product && product.VENDOR_NAME;
  var vName = (rawName && rawName !== 'Yaxsell Demo')
    ? rawName
    : (isMain ? MAIN_STORE_NAME : 'Tienda asociada');
  if (isMain) {
    var brandLogo = _settings.logoUrl || '';
    return '<div class="mt-1 mb-0.5"><span class="db-store-badge" title="' + escapeHtml(vName) + '">' +
      (brandLogo ? '<img src="' + escapeHtml(brandLogo) + '" alt="" aria-hidden="true">' : '') +
      '<span>' + escapeHtml(vName) + '</span>' +
    '</span></div>';
  }
  return '<div class="mt-1 mb-0.5"><span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border border-amber-300/80 bg-amber-50/90 text-amber-900 shadow-sm">🛍️ ' + escapeHtml(vName) + '</span></div>';
}

function categoryBadge(product) {
  if (!product) return '';
  var cat = (product.category && product.category !== 'Sin Categoria') ? product.category : '';
  var sub = (product.subcategory && product.subcategory !== 'Sin Categoria') ? product.subcategory : '';
  if (!cat && !sub) return '';

  var em = extractEmoji(cat) || (sub ? extractEmoji(sub) : '') || '';
  var cleanCat = stripEmoji(cat);
  var cleanSub = stripEmoji(sub);

  if (cleanCat && cleanSub && cleanCat.toLowerCase() !== cleanSub.toLowerCase()) {
    return '<div class="text-[10px] text-blue-600 font-bold uppercase tracking-wider mt-1 truncate" title="' + escapeHtml(cleanCat + ' · ' + cleanSub) + '">' +
      (em ? '<span class="mr-1">' + em + '</span>' : '') +
      '<span>' + escapeHtml(cleanCat) + '</span>' +
      '<span class="text-blue-300 font-normal"> · </span>' +
      '<span class="text-blue-400 font-medium">' + escapeHtml(cleanSub) + '</span>' +
    '</div>';
  }

  return '<div class="text-[10px] text-blue-600 font-bold uppercase tracking-wider mt-1 truncate" title="' + escapeHtml(cleanCat || cleanSub) + '">' +
    (em ? '<span class="mr-1">' + em + '</span>' : '') +
    '<span>' + escapeHtml(cleanCat || cleanSub) + '</span>' +
  '</div>';
}

function renderCartGroupHeader(group) {
  return '';
}

function renderCartActions() {
  const actions = document.getElementById('cartWhatsAppActions');
  if (!actions) return;
  actions.innerHTML = `
    <button type="button" onclick="sendWhatsApp()" class="w-full py-3.5 px-4 rounded-xl btn-primary text-white font-extrabold text-sm shadow-md active:scale-[0.98] transition flex items-center justify-center gap-2">
      <span>Continuar pedido (Web o WhatsApp)</span>
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.3" d="M9 5l7 7-7 7"/></svg>
    </button>
  `;
}

function startCartGroupCheckout(groupId, recipient) {
  sendWhatsApp();
}
window.startCartGroupCheckout = startCartGroupCheckout;

function renderCart() {
  const wrap = $('#cartItems');
  if (!wrap) return;
  if (cart.length === 0) {
    wrap.innerHTML = `
      <div class="text-center py-16 px-4">
        <div class="w-16 h-16 mx-auto rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-2xl mb-3 shadow-sm">
          🛍️
        </div>
        <h3 class="font-display font-extrabold text-gray-950 text-base mb-1">Tu pedido está vacío</h3>
        <p class="text-xs text-gray-500 font-medium max-w-[220px] mx-auto">Agrega productos del catálogo para comprar por la Web o pedir por WhatsApp.</p>
      </div>`;
    const totalEl = $('#cartTotal');
    if (totalEl) totalEl.textContent = '$0';
    renderCartActions();
    let warnEmpty = $('#minWarn');
    if (warnEmpty) warnEmpty.remove();
    return;
  }
  let timerHeader = `
    <div class="rounded-xl bg-white border border-gray-200 p-3 mb-3 flex items-center justify-between shadow-sm">
      <div class="flex items-center gap-2">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span class="text-xs font-bold text-gray-800">Reserva temporal activa</span>
      </div>
      <div class="font-mono font-bold text-xs text-gray-900 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200 flex items-center gap-1 tabular-nums">
        <span id="cartTimerDisplay" class="font-mono font-bold">09:59</span> min
      </div>
    </div>`;

  wrap.innerHTML = timerHeader + cart.map(i => {
    const p = getCartProduct(i.sku) || getCartProduct(i.id);
    const imgUrl = i.image || p?.image || '';
    const isBundleItem = Boolean(i.bundleId || i.bundleInstanceId);
    const cleanSku = typeof formatCatalogSku === 'function' ? formatCatalogSku(p?.code || i.sku || i.id || '') : String(i.sku || '').slice(-8).toUpperCase();
    const rawCat = p?.subcategory || p?.category || '';
    const cleanCat = typeof cleanCatalogCategoryLabel === 'function' ? cleanCatalogCategoryLabel(rawCat) : rawCat;
    const displaySubOrSku = [p?.BRAND || p?.brand || '', cleanCat, cleanSku].filter(Boolean).join(' · ');
    return `
    <div class="flex gap-3 rounded-2xl p-3.5 shadow-sm bg-white border border-gray-200/90 mb-2.5">
      <div class="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[#f4f5f7] border border-gray-200/80 relative flex items-center justify-center">
        ${imgEl(imgUrl, i.name, 'w-full h-full object-contain p-1.5')}
      </div>
      <div class="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div class="font-display font-bold text-gray-950 text-xs sm:text-sm leading-tight line-clamp-2">${escapeHtml(i.name)}</div>
          <div class="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider font-semibold truncate">${escapeHtml(displaySubOrSku)}</div>
        </div>
        <div class="flex items-center justify-between gap-2 mt-2">
          <div class="text-gray-950 font-display font-extrabold text-base tabular-nums">${formatPrice(i.price * i.qty)}</div>
          ${isBundleItem
            ? `<span class="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-extrabold text-emerald-700">Incluido en ${escapeHtml(i.bundleTitle || 'pack')}</span>`
            : `<div class="flex items-center gap-1 bg-gray-100 rounded-xl border border-gray-200 p-0.5">
              <button onclick="changeQty('${i.sku}','${i.mode}',-1)" class="w-7 h-7 rounded-lg bg-white hover:bg-gray-50 text-gray-900 font-extrabold active:scale-90 flex items-center justify-center transition shadow-sm" aria-label="Restar">−</button>
              <input type="number" value="${i.qty}" min="1" onchange="setQty('${i.sku}','${i.mode}',this.value)" class="w-9 text-center font-extrabold text-gray-950 text-xs sm:text-sm bg-transparent focus:outline-none tabular-nums">
              <button onclick="changeQty('${i.sku}','${i.mode}',1)" class="w-7 h-7 rounded-lg bg-[#121216] hover:bg-[#c81e1e] text-white font-extrabold active:scale-90 flex items-center justify-center transition shadow-sm" aria-label="Sumar">+</button>
            </div>`}
        </div>
        <div class="flex justify-end mt-1.5">
          <button onclick="removeFromCart('${i.sku}','${i.mode}'${isBundleItem ? `,'${i.bundleInstanceId || ''}'` : ''})" class="text-[11px] text-gray-400 hover:text-red-600 font-semibold active:scale-95 transition flex items-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            ${isBundleItem ? 'Quitar pack completo' : 'Quitar'}
          </button>
        </div>
      </div>
    </div>
  `;
  }).join('');
  renderCartActions();

  const total = cartTotal();
  const min = getMinPurchase();
  const totalEl = $('#cartTotal');
  if (totalEl) totalEl.textContent = formatPrice(total);
  initCartReservationTimer();

  // Show min purchase warning
  let warn = $('#minWarn');
  if (!warn) {
    warn = document.createElement('div');
    warn.id = 'minWarn';
    warn.className = 'text-xs text-center mb-3 px-3.5 py-2 rounded-xl font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition-all';
    const totalRow = totalEl ? totalEl.closest('.flex') : null;
    if (totalRow && totalRow.parentNode) totalRow.parentNode.insertBefore(warn, totalRow);
  }
  if (total < min) {
    const missing = min - total;
    warn.innerHTML = '<div>⚠️ ' + escapeHtml(MAIN_STORE_NAME) + ': faltan <strong class="underline font-black">' + formatPrice(missing) + '</strong> para el pedido mínimo (' + formatPrice(min) + ')</div>';
    warn.className = 'text-xs text-center mb-3 px-3.5 py-2 rounded-xl font-extrabold bg-amber-50 text-amber-900 border border-amber-300/80 shadow-sm flex flex-col items-center justify-center gap-1';
  } else {
    warn.innerHTML = `<span>✓ Compra mínima alcanzada</span>`;
    warn.className = 'text-xs text-center mb-3 px-3.5 py-2 rounded-xl font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200/90 shadow-sm flex items-center justify-center gap-1.5';
  }
}
let selectedAttendant = null;
let submittingCustomerOrder = false;
function setSubmittingCustomerOrder(value) {
  submittingCustomerOrder = value;
  const overlay = document.getElementById('orderSubmittingOverlay');
  if (overlay) overlay.classList.toggle('hidden', !value);
  const button = document.querySelector('#modalStep2 button[onclick="submitCustomerOrder()"]');
  if (button) {
    button.disabled = value;
    button.classList.toggle('opacity-70', value);
    button.innerHTML = value
      ? '<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" stroke-dasharray="42 18"/></svg> Enviando pedido...'
      : '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg> Confirmar y enviar por WhatsApp';
  }
}
function sendWhatsApp() {
  if (cart.length === 0) { showToast('Carrito vacio'); return; }
  const total = cartTotal();
  const min = getMinPurchase();
  if (total < min) {
    showToast('Falta para la compra mínima: ' + formatPrice(min - total));
    return;
  }
  // Render attendant options (step 1) — 3 circular selectors
  selectedAttendant = null;
  var container = document.getElementById('attendantOptions');
  if (container) {
    var attendantMeta = (WHATSAPP_CONTACTS && WHATSAPP_CONTACTS.length > 0)
      ? WHATSAPP_CONTACTS.map(function(c, i) {
          return {
            emoji: null,
            img: c.img || (i % 2 === 0
              ? 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/08/1785997439696-pegada-1785997429956.png'
              : 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/08/1785998075009-pegada-1785998072451.png'),
            label: c.name || ('Cajera ' + (i + 1)),
            sub: c.sub || 'Personalizado',
            border: c.border || (i % 2 === 0 ? 'border-red-400' : 'border-gray-500'),
            hover: c.hover || (i % 2 === 0 ? 'hover:border-red-500' : 'hover:border-gray-600'),
            text: c.text || (i % 2 === 0 ? 'text-red-500' : 'text-gray-600'),
            floatingEmojis: (Array.isArray(c.floatingEmojis) && c.floatingEmojis.length > 0)
              ? c.floatingEmojis
              : (i % 2 === 0 ? ['❤️', '💖', '💕'] : ['🖤', '🖤', '🖤'])
          };
        })
      : [];
    var humanButtons = attendantMeta.map(function(meta, idx) {
      var emojisMarkup = (meta.floatingEmojis || []).map(function(em, eIdx) {
        var posClass = eIdx === 0 ? 'bottom-1.5 left-2' : (eIdx === 1 ? 'top-2 right-2' : 'bottom-2 right-2');
        var animName = eIdx % 2 === 0 ? 'gentleEmojiFloat' : 'gentleEmojiPulse';
        var delay = (eIdx * 0.6).toFixed(1) + 's';
        var dur = (3.4 + eIdx * 0.4).toFixed(1) + 's';
        return '<span class="attendant-emoji absolute text-[12px] ' + posClass + ' pointer-events-none select-none z-20" style="animation: ' + animName + ' ' + dur + ' ease-in-out ' + delay + ' infinite alternate;">' + em + '</span>';
      }).join('');

      var avatarContent = meta.img
        ? '<div class="relative w-full h-full rounded-full overflow-hidden"><img src="' + meta.img + '" alt="' + meta.label + '" class="w-full h-full object-cover rounded-full">' + emojisMarkup + '</div>'
        : meta.emoji;
      return '<button type="button" data-idx="' + idx + '" onclick="selectAttendant(' + idx + ')" class="attendant-btn group flex flex-col items-center gap-3 transition-all duration-200 active:scale-90">' +
        '<div class="w-24 h-24 rounded-full border-4 ' + meta.border + ' ' + meta.hover + ' bg-transparent flex items-center justify-center text-5xl transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg overflow-hidden relative">' +
          avatarContent +
        '</div>' +
        '<div class="text-center">' +
          '<div class="font-bold text-gray-800 text-sm">' + meta.label + '</div>' +
          '<div class="text-[10px] text-gray-400 font-medium mt-0.5">' + meta.sub + '</div>' +
        '</div>' +
      '</button>';
    }).join('');

    var balatinEmojis = '<span class="attendant-emoji absolute text-[12px] bottom-1.5 left-2 pointer-events-none select-none z-20" style="animation: gentleEmojiFloat 3.4s ease-in-out 0s infinite alternate;">⚡</span>' +
      '<span class="attendant-emoji absolute text-[11px] top-2 right-2 pointer-events-none select-none z-20" style="animation: gentleEmojiPulse 3.8s ease-in-out 0.6s infinite alternate;">✨</span>' +
      '<span class="attendant-emoji absolute text-[10px] bottom-2 right-2 pointer-events-none select-none z-20" style="animation: gentleEmojiFloat 3.6s ease-in-out 1.2s infinite alternate;">⭐</span>';

    var balatinButton = (BALATIN_CONTACT && BALATIN_CONTACT.active !== false)
      ? ('<button type="button" onclick="sendToBalatin()" class="attendant-btn group flex flex-col items-center gap-3 transition-all duration-200 active:scale-90">' +
        '<div class="w-24 h-24 rounded-full border-4 border-blue-400 hover:border-blue-500 bg-transparent flex items-center justify-center text-5xl transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg overflow-hidden relative">' +
          '<div class="relative w-full h-full rounded-full overflow-hidden"><img src="' + (BALATIN_CONTACT.img || 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/08/1786020188976-pegada-1786020186663.png') + '" alt="' + (BALATIN_CONTACT.name || 'Balatin') + '" class="w-full h-full object-contain rounded-full">' + balatinEmojis + '</div>' +
        '</div>' +
        '<div class="text-center">' +
          '<div class="font-bold text-gray-800 text-sm flex items-center gap-1 justify-center">' + (BALATIN_CONTACT.name || 'Balatin') + ' <span class="text-[8px] font-bold bg-blue-400 text-white px-1.5 py-0.5 rounded-full">IA</span></div>' +
          '<div class="text-[10px] text-blue-500 font-medium mt-0.5">' + (BALATIN_CONTACT.sub || 'Al instante') + '</div>' +
        '</div>' +
      '</button>')
      : '';
    container.innerHTML = '<div class="flex justify-center items-start gap-8 py-2">' + humanButtons + balatinButton + '</div>';
  }
  showPurchaseChoice();
  const modal = document.getElementById('customerFormModal');
  if (modal) { modal.classList.remove('hidden'); return; }
}

function showPurchaseChoice() {
  var step0 = document.getElementById('modalStep0');
  var step1 = document.getElementById('modalStep1');
  var step2 = document.getElementById('modalStep2');
  if (step0) step0.classList.remove('hidden');
  if (step1) step1.classList.add('hidden');
  if (step2) step2.classList.add('hidden');
}
window.showPurchaseChoice = showPurchaseChoice;

function choosePurchaseMethod(method) {
  if (method === 'web') {
    transferCartToWeb();
    return;
  }
  var step0 = document.getElementById('modalStep0');
  var step1 = document.getElementById('modalStep1');
  var step2 = document.getElementById('modalStep2');
  if (step0) step0.classList.add('hidden');
  
  selectedAttendant = 'bot';
  if (step1) step1.classList.add('hidden');
  if (step2) step2.classList.remove('hidden');
  fillCustomerFormFromCache();
  setTimeout(function() { var input = document.getElementById('custName'); if (input) input.focus(); }, 100);
}
window.choosePurchaseMethod = choosePurchaseMethod;

function transferCartToWeb() {
  try {
    var webCart = cart.map(function(item) {
      var isBundleItem = Boolean(item.bundleId || item.bundleInstanceId);
      return {
        product: {
          $id: item.id || item.sku,
          NAME: item.name,
          PRICE: isBundleItem ? (item.bundleOriginalUnitPrice ?? item.price) : item.price,
          WHOLESALEPRICE: isBundleItem ? undefined : item.price,
          IMAGEURL: item.image || '',
          STOCK: item.stock ?? 999
        },
        quantity: item.qty || 1,
        bundleId: item.bundleId,
        bundleInstanceId: item.bundleInstanceId,
        bundleTitle: item.bundleTitle,
        bundleUnitPrice: isBundleItem ? (item.bundleUnitPrice ?? item.price) : undefined,
        bundleOriginalUnitPrice: item.bundleOriginalUnitPrice,
        bundlePackQty: item.bundlePackQty,
        bundlePackPrice: item.bundlePackPrice
      };
    });
    localStorage.setItem('yaxsel_cart', JSON.stringify(webCart));
    if (window.top && window.top !== window) {
      window.top.location.href = '/checkout';
    } else {
      window.location.href = '/checkout';
    }
  } catch (err) {
    console.error('Error transferring cart to web:', err);
    if (window.top) window.top.location.href = '/checkout';
  }
}
window.transferCartToWeb = transferCartToWeb;

function selectAttendant(idx) {
  selectedAttendant = idx;
  savePreferredAttendant(idx);
  var buttons = document.querySelectorAll('.attendant-btn');
  buttons.forEach(function(btn) {
    var circle = btn.querySelector('div');
    if (String(btn.getAttribute('data-idx')) === String(idx)) {
      if (circle) {
        circle.style.transform = 'scale(1.1)';
        circle.style.borderWidth = '5px';
        circle.style.boxShadow = '0 0 0 4px rgba(0,0,0,0.05)';
      }
    } else if (btn.getAttribute('data-idx')) {
      if (circle) {
        circle.style.transform = '';
        circle.style.borderWidth = '';
        circle.style.boxShadow = '';
      }
    }
  });
  // Show step 2 (name + phone) after selecting a human attendant
  var step2 = document.getElementById('modalStep2');
  if (step2) step2.classList.remove('hidden');
  // Recuperar los datos del cliente guardados en este navegador.
  fillCustomerFormFromCache();
  // Focus name input
  setTimeout(function() {
    var nameInput = document.getElementById('custName');
    if (nameInput) nameInput.focus();
  }, 100);
}
function closeCustomerFormModal() {
  if (submittingCustomerOrder) return;
  const modal = document.getElementById('customerFormModal');
  if (modal) modal.classList.add('hidden');
}
// Normaliza cualquier formato de telefono chileno a 56 + 9 + 8 digitos
function normalizeChileanPhone(raw) {
  if (!raw) return '';
  // Quitar todo lo que no sea digito
  var digits = raw.replace(/\D/g, '');
  // Si esta vacio
  if (!digits) return '';
  // Si empieza con 56, quitarlo para trabajar limpio
  if (digits.indexOf('56') === 0) {
    digits = digits.substring(2);
  }
  // Si empieza con 0, quitarlo
  if (digits.indexOf('0') === 0) {
    digits = digits.substring(1);
  }
  // Si tiene 8 digitos (sin el 9), agregar el 9 adelante
  if (digits.length === 8) {
    digits = '9' + digits;
  }
  // Si tiene 9 digitos y no empieza con 9, agregar 9
  if (digits.length === 9 && digits.charAt(0) !== '9') {
    digits = '9' + digits;
  }
  // Si tiene mas de 9 digitos, tomar los ultimos 9
  if (digits.length > 9) {
    digits = digits.substring(digits.length - 9);
  }
  // Si tiene menos de 9, no se puede usar
  if (digits.length < 9) return '';
  // Retornar con 56 adelante
  return '56' + digits;
}
// Balatin: sin formulario, sin pedido pre-creado. El cliente le escribe directo con su lista
// y Balatin arma el pedido conversando (nombre, stock, direccion y comprobante por chat).
function sendToBalatin() {
  if (!BALATIN_CONTACT.number) { showToast('El WhatsApp de pedidos aún no está configurado.'); return; }
  var balatinGroup = selectedCartGroupId ? getCartGroups().find(function(g) { return g.id === selectedCartGroupId; }) : null;
  var balatinCart = balatinGroup ? balatinGroup.items.map(function(row) { return row.item; }) : cart.slice();
  var balatinTotal = balatinCart.reduce(function(sum, i) { return sum + i.qty * i.price; }, 0);
  if (balatinCart.length === 0) { showToast('Carrito vacio'); return; }
  var balatinMin = (balatinGroup && balatinGroup.id !== '__main__' && _vendors.find(function(v) { return v.id === balatinGroup.id; }))
    ? (_vendors.find(function(v) { return v.id === balatinGroup.id; }).minPurchaseAmount || 0)
    : getMinPurchase();
  if (balatinTotal < balatinMin) {
    showToast(`Compra minima: $${balatinMin.toLocaleString('es-CL')}`);
    return;
  }

  var apiBase = window.location.origin;

  var orderItems = balatinCart.map(function(i) {
    return { id: i.id || '', sku: i.sku, name: i.name, qty: i.qty, price: i.price, image: i.image || '' };
  });
  var total = balatinTotal;

  // Crear pedido en Appwrite (sin nombre ni telefono — Balatin los pedira por chat)
  var orderCode = '';
  var orderId = '';
  var saveError = false;
  var self = this;

  (async function() {
    try {
      var res = await fetch(apiBase + '/api/catalogo/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: '',
          customerPhone: '',
          items: orderItems,
          total: total,
          assignedCashier: 'Balatin'
        })
      });
      var data = await res.json();
      if (data.success) {
        orderCode = data.orderCode || '';
        orderId = data.orderId || '';
      } else {
        saveError = true;
      }
    } catch (e) {
      console.error('Error guardando pedido Balatin en Appwrite:', e);
      saveError = true;
    }

    // Construir mensaje de WhatsApp para Importadora Carlitos con el codigo del pedido
    var _balatinFullName = BALATIN_CONTACT.name || 'Importadora Carlitos';
    var _skipNames = ['balato', 'don', 'dueño', 'tienda', 'bot', 'yexy', 'kenia', 'balatin'];
    var _balatinParts = _balatinFullName.trim().split(/\s+/);
    var _balatinFirst = _balatinParts[_balatinParts.length - 1];
    var _balatinGreetName = _skipNames.indexOf(_balatinFirst.toLowerCase()) >= 0 ? 'Ivan' : _balatinFirst;
    var waMsg = '*Hola ' + _balatinGreetName + '!*\r\n\r\n';
    waMsg += 'Quiero hacer este pedido:\r\n\r\n';
    waMsg += '----------------------------------------\r\n';
    balatinCart.forEach(function(i) {
      waMsg += '\r\n- ' + i.name + '\r\n';
      waMsg += '  ' + i.qty + ' x ' + formatPrice(i.price) + ' = ' + formatPrice(i.price * i.qty) + '\r\n';
    });
    waMsg += '\r\n----------------------------------------\r\n';
    waMsg += '*Total: ' + formatPrice(total) + '*\r\n';
    waMsg += '*Codigo: ' + orderCode + '*';

    var waUrl = 'https://wa.me/' + BALATIN_CONTACT.number + '?text=' + encodeURIComponent(waMsg);

    // Guardar pedido en localStorage (con URL de WhatsApp para recuperar despues)
    if (orderCode) {
      saveLocalOrder(orderCode, orderId, cart.slice(), total, 'Balatin');
      savePendingWhatsApp(waUrl, orderCode);
    }

    // Limpiar carrito y cerrar modal
    cart = [];
    saveCart();
    updateCartCount();
    renderCart();
    closeCustomerFormModal();

    // Mostrar confirmacion y abrir WhatsApp
    showOrderConfirmation(orderCode, '', saveError, waUrl, MAIN_STORE_NAME);
  })();
}

async function submitCustomerOrder() {
  if (submittingCustomerOrder) return;
  if (selectedAttendant === null) { showToast('Selecciona quien te atiende'); return; }
  if (!(WHATSAPP_CONTACTS[selectedAttendant] || WHATSAPP_CONTACTS[0])?.number) { showToast('El WhatsApp de atención aún no está configurado.'); return; }
  var targetCart = cart.slice();
  var rawName = (document.getElementById('custName') || {}).value || '';
  var customerName = rawName.trim();
  if (!customerName) { showToast('Por favor ingresa tu nombre'); return; }
  var rawPhone = (document.getElementById('custPhone') || {}).value || '';
  var normalizedPhone = normalizeChileanPhone(rawPhone);
  if (!normalizedPhone) { showToast('Numero de telefono invalido. Ej: 9 1234 5678 o 56912345678'); return; }

  setSubmittingCustomerOrder(true);
  var attendant = { name: (BALATIN_CONTACT && BALATIN_CONTACT.name) || 'Importadora Carlitos', number: (BALATIN_CONTACT && BALATIN_CONTACT.number) || '56954592656' };

  var apiBase = window.location.origin;

  var orderItems = targetCart.map(function(i) {
    return { id: i.id || '', sku: i.sku, name: i.name, qty: i.qty, price: i.price, image: i.image || '', total: i.price * i.qty };
  });
  var total = targetCart.reduce(function(sum, i) { return sum + i.qty * i.price; }, 0);

  // Revalidar el carrito contra el stock actual justo antes de crear el pedido.
  try {
    var stockValidation = await fetch(window.location.origin + '/api/checkout/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'validate', items: orderItems.map(function(i) { return { id: i.id, qty: i.qty, name: i.name, sku: i.sku }; }) })
    });
    var stockResult = await stockValidation.json().catch(function() { return null; });
    if (!stockValidation.ok || !stockResult || !stockResult.ok) {
      showToast((stockResult && stockResult.error) || 'Algunos productos cambiaron de disponibilidad. Actualiza tu carrito e inténtalo nuevamente.');
      setSubmittingCustomerOrder(false);
      return;
    }
  } catch (stockError) {
    console.error('Error revalidando stock antes del pedido:', stockError);
    showToast('No pudimos verificar el stock. Inténtalo nuevamente.');
    setSubmittingCustomerOrder(false);
    return;
  }

  var orderCode = '';
  var orderId = '';
  var saveError = false;

  // Crear pedido en backend
  try {
    var orderEndpoint = apiBase + '/api/catalogo/order';
    var orderBody = {
      customerName: customerName,
      customerPhone: normalizedPhone,
      items: orderItems,
      total: total,
      assignedCashier: attendant.name
    };
    var res = await fetch(orderEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderBody)
    });
    var data = await res.json();
    var orderStatus = 'paid';
    if (data.success) {
      orderCode = data.orderCode || '';
      orderId = data.orderId || '';
      orderStatus = data.status || 'paid';
    } else {
      saveError = true;
    }
  } catch (e) {
    console.error('Error guardando pedido en backend:', e);
    saveError = true;
  }

  // Construir mensaje de WhatsApp para Importadora Carlitos con link de verificar stock
  var siteUrl = window.location.origin;
  var waMsg = '*Hola!* Soy *' + customerName + '*\r\n\r\n';
  waMsg += 'Tengo un pedido del catalogo:\r\n\r\n';
  waMsg += '----------------------------------------\r\n';
  waMsg += '*Tienda:* ' + MAIN_STORE_NAME + '\r\n';
  waMsg += '*Cliente:* ' + customerName + '\r\n';
  waMsg += '*Telefono:* ' + normalizedPhone + '\r\n';
  waMsg += '*Codigo:* ' + (orderCode ? orderCode : '') + '\r\n\r\n';
  waMsg += '*Productos:*\r\n';
  targetCart.forEach(function(i) {
    waMsg += '\r\n- ' + i.name + '\r\n';
    waMsg += '  ' + i.qty + ' x ' + formatPrice(i.price) + ' = ' + formatPrice(i.price * i.qty) + '\r\n';
  });
  waMsg += '\r\n----------------------------------------\r\n';
  waMsg += '*Total: ' + formatPrice(total) + '*';

  var recipientNumber = attendant.number;
  var waUrl = 'https://wa.me/' + recipientNumber + '?text=' + encodeURIComponent(waMsg);

  // Guardar pedido y teléfono en localStorage
  if (orderCode) {
    saveLocalOrder(orderCode, orderId, targetCart.slice(), total, attendant.name, orderStatus);
    savePendingWhatsApp(waUrl, orderCode);
  }
  saveCustomerPhone(normalizedPhone);
  saveCustomerName(customerName);
  if (typeof selectedAttendant === 'number') savePreferredAttendant(selectedAttendant);

  // Limpiar carrito completo y actualizar interfaz
  cart = [];
  saveCart();
  updateCartCount();
  renderCart();
  closeCustomerFormModal();

  setSubmittingCustomerOrder(false);
  // Mostrar modal de confirmación
  showOrderConfirmation(orderCode, customerName, saveError, waUrl, MAIN_STORE_NAME);
}

function showOrderConfirmation(orderCode, customerName, hasError, waUrl, storeName) {
  var modal = document.getElementById('orderConfirmModal');
  var titleEl = document.getElementById('ocTitle');
  var msgEl = document.getElementById('ocMessage');
  var codeEl = document.getElementById('ocCode');
  var waBtn = document.getElementById('ocWhatsAppBtn');

  if (hasError) {
    if (titleEl) titleEl.textContent = 'Hubo un problema';
    if (msgEl) msgEl.innerHTML = 'No pudimos registrar tu pedido. Intenta nuevamente.';
    if (codeEl) codeEl.textContent = '';
    if (waBtn) waBtn.classList.add('hidden');
  } else {
    if (titleEl) titleEl.textContent = '¡Pedido enviado!';
    if (msgEl) msgEl.innerHTML = 'Gracias <strong>' + escapeHtml(customerName) + '</strong>.<br>Compraste en <strong>' + escapeHtml(storeName || MAIN_STORE_NAME) + '</strong>.<br>Envíanos el mensaje de WhatsApp para confirmar tu pedido.';
    if (codeEl) codeEl.textContent = orderCode ? 'Código: ' + orderCode : '';
    if (waBtn && waUrl) {
      waBtn.href = waUrl;
      waBtn.classList.remove('hidden');
    }
  }

  if (modal) modal.classList.remove('hidden');
}

function closeOrderConfirmModal() {
  var modal = document.getElementById('orderConfirmModal');
  if (modal) modal.classList.add('hidden');
}

// === Local orders (localStorage) ===
function saveLocalOrder(orderCode, orderId, items, total, cashier, status) {
  try {
    var orders = JSON.parse(localStorage.getItem('myOrders') || '[]');
    orders.unshift({
      orderCode: orderCode,
      orderId: orderId || '',
      items: items.map(function(i) { return { name: i.name, qty: i.qty, price: i.price, image: i.image || '' }; }),
      total: total,
      cashier: cashier || '',
      status: status || 'paid',
      createdAt: new Date().toISOString()
    });
    localStorage.setItem('myOrders', JSON.stringify(orders.slice(0, 50)));
  } catch (e) { console.error('Error saving local order:', e); }
}
function getLocalOrders() {
  try { return JSON.parse(localStorage.getItem('myOrders') || '[]'); } catch { return []; }
}
function saveCustomerPhone(phone) {
  try { localStorage.setItem('customerPhone', phone); } catch {}
}
function getCustomerPhone() {
  try { return localStorage.getItem('customerPhone') || ''; } catch { return ''; }
}
function saveCustomerName(name) {
  try { if (name && name.trim()) localStorage.setItem('customerName', name.trim()); } catch {}
}
function getCustomerName() {
  try { return localStorage.getItem('customerName') || ''; } catch { return ''; }
}
function savePreferredAttendant(index) {
  try { localStorage.setItem('preferredAttendant', String(index)); } catch {}
}
function getPreferredAttendant() {
  try {
    const value = localStorage.getItem('preferredAttendant');
    return value === null ? null : Number(value);
  } catch { return null; }
}

function fillCustomerFormFromCache() {
  const name = document.getElementById('custName');
  const phone = document.getElementById('custPhone');
  if (name && !name.value) name.value = getCustomerName();
  if (phone && !phone.value) phone.value = getCustomerPhone();
}

// === Pedido pendiente de WhatsApp ===
function savePendingWhatsApp(waUrl, orderCode) {
  try {
    localStorage.setItem('pendingWhatsApp', JSON.stringify({
      url: waUrl,
      orderCode: orderCode,
      createdAt: Date.now()
    }));
  } catch (e) { console.error('Error saving pending WhatsApp:', e); }
}
function getPendingWhatsApp() {
  try {
    var raw = localStorage.getItem('pendingWhatsApp');
    if (!raw) return null;
    var data = JSON.parse(raw);
    // Expirar despues de 1 hora (3600000 ms)
    if (Date.now() - data.createdAt > 3600000) {
      // Cancelar el pedido en el servidor y limpiar
      cancelPendingOrder(data.orderCode);
      localStorage.removeItem('pendingWhatsApp');
      return null;
    }
    return data;
  } catch { return null; }
}
function clearPendingWhatsApp() {
  try { localStorage.removeItem('pendingWhatsApp'); } catch {}
  hidePendingOrderBanner();
}
function cancelPendingOrder(orderCode) {
  try {
    var apiBase = window.location.origin;
    fetch(apiBase + '/api/catalogo/cancel-pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderCode: orderCode })
    }).catch(function(e) {
      console.error('Error cancelando pedido expirado:', e);
    });
  } catch (e) { console.error('Error en cancelPendingOrder:', e); }
}
function showPendingOrderBanner() {
  var pending = getPendingWhatsApp();
  if (!pending) return;

  // No mostrar si ya esta visible
  if (document.getElementById('pendingOrderBanner')) return;

  var banner = document.createElement('div');
  banner.id = 'pendingOrderBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:linear-gradient(135deg,#f59e0b,#f97316);color:white;padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,0.2);font-family:-apple-system,sans-serif;font-size:14px;';

  var minsLeft = Math.max(1, Math.round((3600000 - (Date.now() - pending.createdAt)) / 60000));

  banner.innerHTML =
    '<div style="flex:1;">' +
      '<div style="font-weight:700;font-size:14px;">Tienes un pedido pendiente (' + pending.orderCode + ')</div>' +
      '<div style="font-size:12px;opacity:0.9;">Envialo por WhatsApp para que lo verifiquen. Expira en ' + minsLeft + ' min.</div>' +
    '</div>' +
    '<a href="' + pending.url + '" target="_blank" onclick="clearPendingWhatsApp()" style="background:white;color:#f97316;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;white-space:nowrap;font-size:13px;">Ir a WhatsApp</a>' +
    '<button onclick="dismissPendingOrderBanner()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">x</button>';

  document.body.insertBefore(banner, document.body.firstChild);

  // Empujar el contenido hacia abajo para que el banner no tape nada
  document.body.style.marginTop = '60px';
}
function dismissPendingOrderBanner() {
  hidePendingOrderBanner();
  // No borrar el localStorage — solo ocultar el banner esta sesion
}
function hidePendingOrderBanner() {
  var banner = document.getElementById('pendingOrderBanner');
  if (banner) banner.remove();
  document.body.style.marginTop = '0';
}

// === My Orders view ===
var ORDER_STATUS_LABELS = {
  'pending': 'Stock Confirmado',
  'pending_stock': 'Stock Confirmado',
  'payment_review': 'Revisando Pago',
  'paid': 'Stock Confirmado',
  'payment_confirmed': 'Pago Confirmado',
  'processing': 'Procesando',
  'shipped': 'Embalado',
  'delivered': 'Entregado a Agencia',
  'negotiation': 'Negociando',
  'cancelled': 'Cancelado'
};
var ORDER_STATUS_COLORS = {
  'pending': '#fb923c',
  'pending_stock': '#fb923c',
  'payment_review': '#2563eb',
  'paid': '#fb923c',
  'payment_confirmed': '#059669',
  'processing': '#3b82f6',
  'shipped': '#8b5cf6',
  'delivered': '#22c55e',
  'negotiation': '#f97316',
  'cancelled': '#ef4444'
};
var ORDER_STATUS_ICONS = {
  'pending': '📦',
  'pending_stock': '📦',
  'payment_review': '🔍',
  'paid': '📦',
  'payment_confirmed': '✅',
  'processing': '📦',
  'shipped': '🚚',
  'delivered': '🎉',
  'negotiation': '🤝',
  'cancelled': '❌'
};

function renderMyOrders() {
  var app = $('#app');
  var localOrders = getLocalOrders();
  var savedPhone = getCustomerPhone();

  app.innerHTML = '<div class="min-h-screen pb-24 space-y-4">' +
    '<!-- Header Banner (Cristal Blanco Luxe Theme) -->' +
    '<div class="relative overflow-hidden rounded-[26px] p-5 sm:p-6 bg-gradient-to-r from-blue-50/90 via-white to-blue-50/90 border border-blue-200/80 shadow-sm mb-4">' +
      '<div class="flex items-center gap-3 relative z-10">' +
        '<div class="w-12 h-12 rounded-2xl bg-blue-100/80 border border-blue-200/80 flex items-center justify-center text-2xl flex-shrink-0 shadow-sm">' +
          '📦' +
        '</div>' +
        '<div>' +
          '<h1 class="font-display font-extrabold text-xl sm:text-2xl text-blue-950 leading-tight">Mis Pedidos</h1>' +
          '<p class="text-xs text-blue-500/90 font-semibold">Sigue en tiempo real el estado de tus compras</p>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="max-w-2xl mx-auto space-y-4">' +
      '<div id="myOrdersList" class="space-y-3"></div>' +

      '<div class="rounded-[24px] p-5 bg-white/95 backdrop-blur-xl border border-blue-100/90 shadow-sm">' +
        '<div class="flex items-center gap-2 mb-1.5">' +
          '<div class="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">' +
            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>' +
          '</div>' +
          '<p class="text-sm font-extrabold text-blue-950">Sincronizar pedidos</p>' +
        '</div>' +
        '<p class="text-xs text-blue-400 font-medium mb-3">Ingresa tu número de teléfono para vincular y buscar todas tus compras automáticamente.</p>' +
        '<div class="flex gap-2">' +
          '<input id="syncPhoneInput" type="tel" placeholder="Ej: 9 1234 5678" value="' + escapeHtml(savedPhone) + '" class="flex-1 px-4 py-2.5 text-sm font-semibold text-blue-950 bg-blue-50/50 border border-blue-200/80 rounded-2xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all">' +
          '<button onclick="syncMyOrders()" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-2xl active:scale-95 transition shadow-sm flex items-center gap-1.5 whitespace-nowrap">' +
            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>' +
            'Sincronizar</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  renderMyOrdersList(localOrders);
  if (savedPhone) {
    syncMyOrders(true);
  }
}

function orderItemImageCandidates(item) {
  var candidates = [item.image, item.img, item.IMAGEURL].filter(function(url) { return url && String(url).trim(); });
  var product = item.sku ? getCartProduct(item.sku) : null;
  if (!product && item.name) product = getProducts().find(function(p) { return p.name === item.name; });
  if (product) candidates = candidates.concat(getProductImageCandidates(product));
  return candidates.map(function(url) { return String(url).trim(); }).filter(function(url, index, arr) { return url && arr.indexOf(url) === index; });
}

function orderImageHtml(item, sizeClass) {
  var candidates = orderItemImageCandidates(item);
  var initials = String(item.name || '?').split(' ').filter(Boolean).slice(0, 2).map(function(w) { return w[0] || ''; }).join('').toUpperCase() || 'DB';
  if (!candidates.length) return '<span class="text-blue-300 text-sm">' + escapeHtml(initials) + '</span>';
  return '<img src="' + escapeHtml(candidates[0]) + '" loading="lazy" data-catalog-fallback="1" data-fallback-images="' + escapeHtml(JSON.stringify(candidates)) + '" data-fallback-index="0" onerror="orderImageFallback(this)" class="' + sizeClass + ' object-cover">';
}
window.orderImageFallback = function(img) {
  try {
    var urls = JSON.parse(img.dataset.fallbackImages || '[]');
    var next = Number(img.dataset.fallbackIndex || 0) + 1;
    if (next < urls.length) { img.dataset.fallbackIndex = String(next); img.src = urls[next]; return; }
  } catch (e) {}
  img.onerror = null;
  img.replaceWith(document.createTextNode('📦'));
};

function renderMyOrdersList(orders) {
  var list = document.getElementById('myOrdersList');
  if (!list) return;
  if (!orders || orders.length === 0) {
    list.innerHTML = '<div class="text-center py-14 px-4 bg-white/90 backdrop-blur-xl rounded-[28px] border border-blue-100/90 shadow-sm">' +
      '<div class="w-20 h-20 mx-auto rounded-3xl bg-blue-50 border border-blue-100 flex items-center justify-center text-4xl mb-4 shadow-sm">📦</div>' +
      '<h3 class="font-display font-extrabold text-blue-950 text-lg mb-1">No tienes pedidos aún</h3>' +
      '<p class="text-xs text-blue-400 font-medium max-w-[240px] mx-auto mb-6">Cuando hagas un pedido en nuestro catálogo mayorista aparecerá aquí.</p>' +
      '<a href="#/" class="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300 text-blue-950 font-extrabold text-sm shadow-md shadow-amber-300/30 active:scale-95 transition-all"><span>🛍️ Explorar Catálogo</span></a>' +
    '</div>';
    return;
  }
  list.innerHTML = orders.map(function(o) {
    var status = o.status || 'pending_stock';
    var label = ORDER_STATUS_LABELS[status] || status;
    var color = ORDER_STATUS_COLORS[status] || '#6b7280';
    var icon = ORDER_STATUS_ICONS[status] || '📦';
    var date = o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    var itemCount = (o.items || []).reduce(function(s, i) { return s + (i.qty || 1); }, 0);
    var items = o.items || [];
    var itemImage = function(it) { return it.image || it.img || it.IMAGEURL || ''; };
    var firstItems = items.slice(0, 2);
    var remainingCount = items.length - firstItems.length;
    var storeName = o.storeName || (o.vendorId ? 'Tienda asociada' : MAIN_STORE_NAME);

    return '<div class="bg-white rounded-[24px] border border-blue-100 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-blue-200">' +
      '<div class="px-5 py-3.5 flex items-center justify-between border-b border-blue-100/60 bg-blue-50/40 gap-2">' +
        '<div class="flex items-center gap-2.5">' +
          '<span class="text-xl">' + icon + '</span>' +
          '<div>' +
            '<p class="font-mono font-extrabold text-sm text-blue-950">' + escapeHtml(o.orderCode || 'Sin código') + '</p>' +
            '<p class="text-[10px] text-blue-400 font-semibold">' + date + '</p>' +
            '<p class="text-[10px] text-indigo-600 font-extrabold mt-0.5">🏪 ' + escapeHtml(storeName) + '</p>' +
          '</div>' +
        '</div>' +
        '<span class="text-xs font-extrabold px-3 py-1 rounded-full border border-current shadow-sm" style="background:' + color + '15;color:' + color + ';border-color:' + color + '30;">' + escapeHtml(label) + '</span>' +
      '</div>' +
      '<div class="p-5">' +
        '<div class="space-y-2.5 mb-4">' +
          firstItems.map(function(it) {
            return '<div class="flex items-center gap-3">' +
              '<div class="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center overflow-hidden flex-shrink-0 border border-blue-100/80">' +
                orderImageHtml(it, 'w-full h-full') +
              '</div>' +
              '<div class="flex-1 min-w-0">' +
                '<p class="text-xs font-extrabold text-blue-950 truncate">' + escapeHtml(it.name || '') + '</p>' +
                '<p class="text-[10px] text-blue-400 font-semibold mt-0.5">' + (it.qty || 1) + ' x ' + formatPrice(it.price || 0) + '</p>' +
              '</div>' +
            '</div>';
          }).join('') +
          (remainingCount > 0 ? '<p class="text-[11px] text-blue-500 font-extrabold pl-1">+' + remainingCount + ' producto' + (remainingCount > 1 ? 's' : '') + ' más</p>' : '') +
        '</div>' +
        '<div class="flex items-center justify-between pt-3 border-t border-blue-100/60">' +
          '<div class="flex items-center gap-2 text-xs text-blue-500 font-semibold">' +
            '<span>' + itemCount + ' producto' + (itemCount !== 1 ? 's' : '') + '</span>' +
            (o.cashier ? '<span>·</span><span class="text-blue-600 font-bold">' + escapeHtml(o.cashier) + '</span>' : '') +
          '</div>' +
          '<span class="font-display font-extrabold text-base text-blue-950">' + formatPrice(o.total || 0) + '</span>' +
        '</div>' +
        (o.trackingNumber ? '<div class="mt-3 p-3 rounded-2xl flex items-center gap-2.5 bg-cyan-50/80 border border-cyan-200/80 shadow-sm">' +
          '<svg class="w-5 h-5 text-cyan-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>' +
          '<div><p class="text-[10px] text-cyan-600 font-extrabold uppercase tracking-wider">Seguimiento de envío</p><p class="text-xs text-cyan-900 font-mono font-extrabold">' + escapeHtml(o.trackingNumber) + '</p></div>' +
        '</div>' : '') +
        '<details class="mt-3">' +
          '<summary class="text-xs font-extrabold text-blue-600 hover:text-blue-800 cursor-pointer transition select-none">Ver resumen de productos ▾</summary>' +
          '<div class="mt-2 space-y-2 pt-2 border-t border-blue-50">' +
            items.map(function(it) {
              return '<div class="flex items-center gap-2.5 text-xs py-1">' +
                '<div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center overflow-hidden flex-shrink-0 border border-blue-100">' +
                  orderImageHtml(it, 'w-full h-full') +
                '</div>' +
                '<span class="flex-1 text-blue-900 font-semibold truncate">' + escapeHtml(it.name || '') + '</span>' +
                '<span class="text-blue-400 font-bold">x' + (it.qty || 1) + '</span>' +
                '<span class="font-extrabold text-blue-950">' + formatPrice((it.price || 0) * (it.qty || 1)) + '</span>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</details>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function syncMyOrders(silent) {
  var phoneInput = document.getElementById('syncPhoneInput');
  var phone = phoneInput ? phoneInput.value.trim() : '';
  if (!phone) { if (!silent) showToast('Ingresa tu número de teléfono'); return; }
  var normalized = normalizeChileanPhone(phone);
  if (!normalized) { if (!silent) showToast('Teléfono inválido. Ej: 9 1234 5678'); return; }
  saveCustomerPhone(normalized);

  var list = document.getElementById('myOrdersList');
  if (list && !silent) {
    list.innerHTML = '<div class="text-center py-12"><div class="animate-spin w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-3"></div><p class="text-sm text-gray-400">Sincronizando...</p></div>';
  }

  try {
    var apiBase = window.location.origin;
    var res = await fetch(apiBase + '/api/catalogo/my-orders?phone=' + encodeURIComponent(normalized));
    var data = await res.json();
    if (data.success && data.orders) {
      // Appwrite es la fuente de verdad: al sincronizar se elimina del cache
      // cualquier pedido que ya no exista en el servidor.
      var syncedOrders = data.orders.filter(function(o) { return o.orderCode; });
      try { localStorage.setItem('myOrders', JSON.stringify(syncedOrders.slice(0, 50))); } catch {}

      renderMyOrdersList(syncedOrders);
      if (!silent) showToast('Pedidos sincronizados (' + syncedOrders.length + ')');
    } else {
      if (!silent) showToast('No se encontraron pedidos');
      renderMyOrdersList(getLocalOrders());
    }
  } catch (e) {
    console.error('Error syncing orders:', e);
    if (!silent) showToast('Error al sincronizar');
    renderMyOrdersList(getLocalOrders());
  }
}

// === Routing ===
function parseHash() {
  const h = location.hash.slice(1) || '/';
  const parts = h.split('/').filter(Boolean);
  return parts;
}
function navigate(path) {
  location.hash = path;
}
window.addEventListener('hashchange', render);

// === Account Embed View ===
function renderAccount() {
  closeFomoToast();
  const accountUrl = location.hash.startsWith('#/account/orders') ? '/cuenta?embed=1&pedidos=1' : '/cuenta?embed=1';
  const announcementBar = document.getElementById('announcementBar');
  if (announcementBar) announcementBar.style.display = 'none';

  const catalogHeader = document.querySelector('header.glass');
  if (catalogHeader) catalogHeader.style.display = 'none';

  const catalogFooter = document.getElementById('catalogFooter');
  if (catalogFooter) catalogFooter.style.display = 'none';

  let container = document.getElementById('accountEmbedContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'accountEmbedContainer';
    container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:40;background:#121216;-webkit-overflow-scrolling:touch;overflow:hidden;border:none;margin:0;padding:0;';
    container.innerHTML = '<iframe id="accountFrame" src="' + accountUrl + '" style="width:100%;height:100%;border:none;margin:0;padding:0;display:block;outline:none;" title="Mi cuenta"></iframe>';
    document.body.appendChild(container);
  }
  const accountFrame = document.getElementById('accountFrame');
  if (accountFrame && accountFrame.getAttribute('src') !== accountUrl) accountFrame.setAttribute('src', accountUrl);
  container.style.display = 'block';
  container.style.visibility = 'visible';

  const appEl = document.getElementById('app');
  if (appEl) appEl.style.display = 'none';

  const peek = document.getElementById('catalogOrderPeek');
  if (peek) peek.style.display = 'none';
}

function hideAccountView() {
  const announcementBar = document.getElementById('announcementBar');
  if (announcementBar && announcementBar.style.display === 'none') {
    announcementBar.style.display = '';
  }

  const catalogHeader = document.querySelector('header.glass');
  if (catalogHeader && catalogHeader.style.display === 'none') {
    catalogHeader.style.display = '';
  }

  const catalogFooter = document.getElementById('catalogFooter');
  if (catalogFooter && catalogFooter.style.display === 'none') {
    catalogFooter.style.display = '';
  }

  const container = document.getElementById('accountEmbedContainer');
  if (container) {
    container.style.display = 'none';
    container.style.visibility = 'hidden';
  }
  const appEl = document.getElementById('app');
  if (appEl && appEl.style.display === 'none') {
    appEl.style.display = '';
  }
  const peek = document.getElementById('catalogOrderPeek');
  if (peek && peek.style.display === 'none') {
    peek.style.display = '';
  }
}

// === Render ===
function render() {
  initPersistentHeroTimer();
  initAnnouncementBarEngine();
  initLiveUsersEngine();
  const parts = parseHash();
  const route = parts[0] || '';

  if (route !== 'account') {
    hideAccountView();
  }

  // Detect mode based on route
  const modeTag = $('#modeTag');
  if (modeTag) {
    if (route === 'admin') {
      currentMode = 'admin';
      modeTag.classList.remove('hidden');
      modeTag.textContent = 'Admin';
    } else {
      currentMode = 'public';
      modeTag.classList.add('hidden');
    }
  } else {
    currentMode = route === 'admin' ? 'admin' : 'public';
  }

  // Show back button if not home
  const backBtn = $('#backBtn');
  if (backBtn) {
    backBtn.classList.toggle('hidden', parts.length === 0);
  }

  // Show bottom nav & footer on public catalog routes, hide on admin
  const bottomNav = document.getElementById('bottomNav');
  if (bottomNav) {
    bottomNav.classList.toggle('hidden', route === 'admin');
    updateBottomNav();
  }
  const catalogFooter = document.getElementById('catalogFooter');
  if (catalogFooter && route !== 'account') {
    catalogFooter.style.display = route === 'admin' ? 'none' : '';
  }

  // Routes
  if (route === 'admin') return renderAdmin(parts.slice(1));
  if (route === 'category') return renderCategory(parts.slice(1));
  if (route === 'all') return renderAllProducts();
  if (route === 'packs') return renderCatalogPackPage();
  if (route === 'favorites') return renderFavorites();
  if (route === 'account') return renderAccount();
  if (route === 'my-orders') return renderMyOrders();
  if (route === 'search' || searchQuery) return renderSearch();
  if (route === 'categories') {
    renderHome();
    requestAnimationFrame(function() {
      setTimeout(function() {
        var el = document.getElementById('categoriesSection');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });
    return;
  }
  renderHome();
  initLiveUsersCounter();
  initFomoSalesEngine();
  return;
}

function scrollToCategoriesSection() {
  document.querySelectorAll('#bottomNav .nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === 'categories');
  });
  if (location.hash !== '#/' && location.hash !== '' && location.hash !== '#categories' && location.hash !== '#/categories') {
    location.hash = '#categories';
  } else {
    var el = document.getElementById('categoriesSection');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }
}
window.scrollToCategoriesSection = scrollToCategoriesSection;

var _heroParticleRAF = null;

function initHeroParticles(catName, containerId) {
  var container = document.getElementById(containerId || 'heroParticles');
  if (!container) return;
  container.innerHTML = '';
  if (_heroParticleRAF) { cancelAnimationFrame(_heroParticleRAF); _heroParticleRAF = null; }

  var canvas = document.createElement('canvas');
  container.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var W, H;
  function resize() {
    W = canvas.width = container.offsetWidth || 480;
    H = canvas.height = container.offsetHeight || 220;
  }
  resize();
  window.addEventListener('resize', resize);

  var T = 0; // global tick

  // ─── PALETA DE COLORES ───────────────────────────────────────────────────────
  var COLORS = {
    gold:   [255, 210, 60],
    amber:  [255, 170, 30],
    white:  [240, 248, 255],
    sky:    [96,  195, 255],
    rose:   [255, 180, 150],
  };
  var PALETTE = ['gold','gold','gold','amber','white','white','sky'];

  function rgba(c, a) { return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a.toFixed(3)+')'; }
  function pickColor() { return COLORS[PALETTE[Math.floor(Math.random() * PALETTE.length)]]; }

  // ─── CAPA 1: BOKEH ATMOSFÉRICO (grandes esferas borrosas en fondo) ────────────
  var bokeh = [];
  for (var i = 0; i < 5; i++) {
    bokeh.push({
      x: Math.random() * W, y: Math.random() * H,
      r: 14 + Math.random() * 28,          // 14-42 px (antes 28-83)
      col: pickColor(),
      ox: Math.random() * Math.PI * 2,
      oy: Math.random() * Math.PI * 2,
      fx: 0.00015 + Math.random() * 0.0002,
      fy: 0.00012 + Math.random() * 0.00018,
      amp: 12 + Math.random() * 18,
      baseAlpha: 0.022 + Math.random() * 0.03, // antes 0.04-0.11
      pulsePhase: Math.random() * Math.PI * 2,
      pulseFreq: 0.0004 + Math.random() * 0.0006,
    });
  }

  // ─── CAPA 2: POLVO DORADO ASCENDENTE (partículas que nacen abajo y mueren arriba) ─
  var DUST_COUNT = 18;
  function mkDust() {
    return {
      x: Math.random() * W,
      y: H + Math.random() * 20,
      r: 0.5 + Math.random() * 1.5,         // antes 0.8-3.6
      col: pickColor(),
      vy: -(0.08 + Math.random() * 0.22),   // más lento
      vx: (Math.random() - 0.5) * 0.1,
      wobbleAmp: 0.3 + Math.random() * 1.2,
      wobbleFreq: 0.005 + Math.random() * 0.012,
      wobblePhase: Math.random() * Math.PI * 2,
      life: 0,
      maxLife: 260 + Math.floor(Math.random() * 320),
      baseAlpha: 0.18 + Math.random() * 0.25, // antes 0.4-0.9
    };
  }
  var dust = [];
  for (var i = 0; i < DUST_COUNT; i++) {
    var d = mkDust();
    d.y = Math.random() * H;   // al inicio distribuir por toda la altura
    d.life = Math.floor(Math.random() * d.maxLife);
    dust.push(d);
  }

  // ─── CAPA 3: DESTELLOS DIAMANTE con halo pulsante ────────────────────────────
  var SPARK_COUNT = 12;
  function mkSpark() {
    return {
      x: 0.05 * W + Math.random() * 0.9 * W,
      y: 0.05 * H + Math.random() * 0.9 * H,
      r: 1.2 + Math.random() * 2.2,         // antes 2.5-7.5
      col: pickColor(),
      rot: Math.random() * Math.PI,
      rotSpeed: (Math.random() - 0.5) * 0.018,
      ox: Math.random() * Math.PI * 2,
      oy: Math.random() * Math.PI * 2,
      fx: 0.0003 + Math.random() * 0.0005,
      fy: 0.00025 + Math.random() * 0.0004,
      driftAmp: 4 + Math.random() * 8,
      life: 0,
      maxLife: 180 + Math.floor(Math.random() * 220),
      baseAlpha: 0.22 + Math.random() * 0.28, // antes 0.5-1.0
      haloScale: 0.8 + Math.random() * 1.2,   // antes 1-3.5
      haloPhase: Math.random() * Math.PI * 2,
    };
  }
  var sparks = [];
  for (var i = 0; i < SPARK_COUNT; i++) {
    var s = mkSpark();
    s.life = Math.floor(Math.random() * s.maxLife);
    sparks.push(s);
  }

  // ─── DRAW HELPERS ─────────────────────────────────────────────────────────────


  function drawBokeh(b, elapsed) {
    var dx = Math.sin(elapsed * b.fx + b.ox) * b.amp;
    var dy = Math.cos(elapsed * b.fy + b.oy) * b.amp * 0.6;
    var pulse = 0.5 + 0.5 * Math.sin(elapsed * b.pulseFreq + b.pulsePhase);
    var a = b.baseAlpha * (0.7 + 0.3 * pulse);
    ctx.save();
    ctx.filter = 'blur(' + Math.round(b.r * 0.55) + 'px)';
    var g = ctx.createRadialGradient(b.x + dx, b.y + dy, 0, b.x + dx, b.y + dy, b.r);
    g.addColorStop(0,   rgba(b.col, Math.min(1, a * 2.2)));
    g.addColorStop(0.5, rgba(b.col, a * 0.5));
    g.addColorStop(1,   rgba(b.col, 0));
    ctx.beginPath();
    ctx.arc(b.x + dx, b.y + dy, b.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  function drawDust(d) {
    var progress = d.life / d.maxLife;
    // Fade in rápido, fade out lento
    var a = d.baseAlpha * (progress < 0.12 ? progress / 0.12 : progress > 0.8 ? (1 - progress) / 0.2 : 1);
    var wx = d.x + Math.sin(d.life * d.wobbleFreq + d.wobblePhase) * d.wobbleAmp;

    // Glow halo
    var g = ctx.createRadialGradient(wx, d.y, 0, wx, d.y, d.r * 3.5);
    g.addColorStop(0,   rgba(d.col, Math.min(1, a * 1.6)));
    g.addColorStop(0.5, rgba(d.col, a * 0.4));
    g.addColorStop(1,   rgba(d.col, 0));
    ctx.beginPath();
    ctx.arc(wx, d.y, d.r * 3.5, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // Core bright dot
    ctx.beginPath();
    ctx.arc(wx, d.y, d.r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(d.col, Math.min(1, a * 2));
    ctx.fill();
  }

  function drawStar4(cx, cy, r, rot, col, a) {
    // 4-punta estrella alargada (clásico destello de diamante)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    // Rayo horizontal
    var gx = ctx.createLinearGradient(-r * 3.5, 0, r * 3.5, 0);
    gx.addColorStop(0,   rgba(col, 0));
    gx.addColorStop(0.5, rgba(col, a));
    gx.addColorStop(1,   rgba(col, 0));
    ctx.beginPath();
    ctx.moveTo(-r * 3.5, 0); ctx.lineTo(0, r * 0.35); ctx.lineTo(r * 3.5, 0); ctx.lineTo(0, -r * 0.35);
    ctx.closePath();
    ctx.fillStyle = gx;
    ctx.fill();
    // Rayo vertical
    var gy = ctx.createLinearGradient(0, -r * 3.5, 0, r * 3.5);
    gy.addColorStop(0,   rgba(col, 0));
    gy.addColorStop(0.5, rgba(col, a));
    gy.addColorStop(1,   rgba(col, 0));
    ctx.beginPath();
    ctx.moveTo(0, -r * 3.5); ctx.lineTo(r * 0.35, 0); ctx.lineTo(0, r * 3.5); ctx.lineTo(-r * 0.35, 0);
    ctx.closePath();
    ctx.fillStyle = gy;
    ctx.fill();
    // Core glow
    var gc = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.2);
    gc.addColorStop(0,   rgba([255,255,255], Math.min(1, a * 1.4)));
    gc.addColorStop(0.5, rgba(col, a * 0.7));
    gc.addColorStop(1,   rgba(col, 0));
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = gc;
    ctx.fill();
    ctx.restore();
  }

  function drawSparkParticle(s, elapsed) {
    var progress = s.life / s.maxLife;
    var a = s.baseAlpha * (progress < 0.15 ? progress / 0.15 : progress > 0.75 ? (1 - progress) / 0.25 : 1);

    var dx = Math.sin(elapsed * s.fx + s.ox) * s.driftAmp;
    var dy = Math.cos(elapsed * s.fy + s.oy) * s.driftAmp * 0.5;

    // Halo externo pulsante
    var hPulse = 0.5 + 0.5 * Math.sin(elapsed * 0.002 + s.haloPhase);
    var hR = s.r * (s.haloScale + 0.5 * hPulse);
    var hg = ctx.createRadialGradient(s.x + dx, s.y + dy, 0, s.x + dx, s.y + dy, hR);
    hg.addColorStop(0,   rgba(s.col, a * 0.35));
    hg.addColorStop(0.6, rgba(s.col, a * 0.08));
    hg.addColorStop(1,   rgba(s.col, 0));
    ctx.beginPath();
    ctx.arc(s.x + dx, s.y + dy, hR, 0, Math.PI * 2);
    ctx.fillStyle = hg;
    ctx.fill();

    drawStar4(s.x + dx, s.y + dy, s.r, s.rot, s.col, a);
    s.rot += s.rotSpeed;
  }


  // ─── ANIMATION LOOP ──────────────────────────────────────────────────────────
  var startTime = performance.now();

  function frame(now) {
    W = canvas.width = container.offsetWidth || W;
    H = canvas.height = container.offsetHeight || H;
    ctx.clearRect(0, 0, W, H);

    var elapsed = now - startTime;
    T++;

    // 1. Bokeh fondo
    for (var i = 0; i < bokeh.length; i++) drawBokeh(bokeh[i], elapsed);

    // 2. Polvo ascendente
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      d.life++;
      d.y += d.vy;
      d.x += d.vx;
      drawDust(d);
      if (d.life >= d.maxLife || d.y < -10) { dust[i] = mkDust(); }
    }

    // 3. Destellos diamante
    for (var i = 0; i < sparks.length; i++) {
      var s = sparks[i];
      s.life++;
      drawSparkParticle(s, elapsed);
      if (s.life >= s.maxLife) { sparks[i] = mkSpark(); }
    }
    _heroParticleRAF = requestAnimationFrame(frame);
  }

  _heroParticleRAF = requestAnimationFrame(frame);
}

function getCategoryBgEmojis(catName) {
  var n = (catName || '').toLowerCase();
  if (n.includes('aseo') || n.includes('limpieza') || n.includes('baño')) return '🫧 🧼 🧽';
  if (n.includes('electrónica') || n.includes('tecnología') || n.includes('audio') || n.includes('celular')) return '⚡ 🎧 📱';
  if (n.includes('hogar') || n.includes('cocina') || n.includes('decoración')) return '🏡 🍳 ☕';
  if (n.includes('juguet') || n.includes('niño') || n.includes('bebé')) return '🎈 🧸 🚀';
  if (n.includes('mascota')) return '🐾 🐶 🐱';
  if (n.includes('moda') || n.includes('calzado') || n.includes('ropa')) return '👟 🕶️ 🎒';
  return '📦 🏡 ⚡';
}

function getCategorySparkleColor(catName) {
  var n = (catName || '').toLowerCase();
  if (n.includes('aseo') || n.includes('limpieza')) return 'bg-cyan-400';
  if (n.includes('electrónica') || n.includes('tecnología')) return 'bg-purple-400';
  if (n.includes('hogar') || n.includes('cocina')) return 'bg-amber-400';
  if (n.includes('juguet') || n.includes('niño')) return 'bg-emerald-400';
  if (n.includes('belleza')) return 'bg-rose-400';
  return 'bg-blue-400';
}
  // === Live Connected Users Simulator Engine (Organic Step Walk 29..120) ===
var _liveUsersCount = 28;
var _liveUsersTarget = 31;
var _liveUsersTimeout = null;

function initLiveUsersEngine() {
  var el = document.getElementById('liveUsersCount');
  if (!el) return;
  if (_liveUsersTimeout) clearTimeout(_liveUsersTimeout);

  function tick() {
    // Pick a new target within a tight, realistic band
    if (Math.abs(_liveUsersCount - _liveUsersTarget) <= 1 || Math.random() < 0.15) {
      _liveUsersTarget = Math.floor(Math.random() * (42 - 18 + 1)) + 18;
    }
    // Small organic step: usually ±1, occasionally ±2
    var dir = _liveUsersTarget > _liveUsersCount ? 1 : -1;
    var stepSize = Math.random() < 0.8 ? 1 : 2;
    _liveUsersCount += dir * stepSize;
    // Strict boundaries
    _liveUsersCount = Math.max(18, Math.min(42, _liveUsersCount));
    var currentEl = document.getElementById('liveUsersCount');
    if (currentEl) currentEl.textContent = _liveUsersCount;
    // Slow rhythm: 4-8 seconds between changes
    var nextDelay = Math.floor(Math.random() * 4000) + 4000;
    _liveUsersTimeout = setTimeout(tick, nextDelay);
  }

  el.textContent = _liveUsersCount;
  _liveUsersTimeout = setTimeout(tick, 4000);
}

// === Persistent Urgency Countdown Timers (per customer in localStorage) ===
var _heroTimerInterval = null;
var _cartTimerInterval = null;

function initPersistentHeroTimer() {
  var display = document.getElementById('persistentTimer');
  if (!display) return;

  var endTs = localStorage.getItem('db_fomo_hero_timer_end');
  var now = Date.now();

  if (!endTs || Number(endTs) <= now) {
    endTs = now + (24 * 60 + 35) * 1000;
    localStorage.setItem('db_fomo_hero_timer_end', endTs);
  } else {
    endTs = Number(endTs);
  }

  if (_heroTimerInterval) clearInterval(_heroTimerInterval);
  _heroTimerInterval = setInterval(function() {
    var rem = Math.max(0, Math.floor((endTs - Date.now()) / 1000));
    if (rem <= 0) {
      endTs = Date.now() + (24 * 60 + 35) * 1000;
      localStorage.setItem('db_fomo_hero_timer_end', endTs);
      rem = 24 * 60 + 35;
    }
    var m = Math.floor(rem / 60);
    var s = rem % 60;
    var el = document.getElementById('persistentTimer');
    if (el) el.textContent = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }, 1000);
}

// === Smart Personalized Subcategory Promo Engine ===
var _announcementTimerInterval = null;
var _lastScrollY = window.scrollY;

function getActivePromoSubcategoryPath() {
  var products = typeof getProducts === 'function' ? getProducts() : [];
  if (products.length === 0) return ['Aseo y Limpieza'];

  // 1. Personalization Trick: Check if customer has cart history or orders!
  try {
    var userCart = typeof cart !== 'undefined' && cart.length > 0 ? cart : JSON.parse(localStorage.getItem('db_cart') || '[]');
    if (userCart && userCart.length > 0) {
      var lastCartItem = userCart[userCart.length - 1];
      var matchP = products.find(p => p.sku === lastCartItem.sku);
      if (matchP) {
        var path = getProductPath(matchP);
        if (path && path.length > 0) return path;
      }
    }
  } catch (e) {}

  // 2. Personalization Trick: Check previous orders history
  try {
    var orders = JSON.parse(localStorage.getItem('db_my_orders') || '[]');
    if (orders && orders.length > 0 && orders[0].items && orders[0].items.length > 0) {
      var lastOrderItem = orders[0].items[0];
      var matchOrderP = products.find(p => p.sku === lastOrderItem.sku);
      if (matchOrderP) {
        var oPath = getProductPath(matchOrderP);
        if (oPath && oPath.length > 0) return oPath;
      }
    }
  } catch (e) {}

  // 3. Persistent stored real subcategory path for this customer
  try {
    var storedPath = localStorage.getItem('db_fomo_user_promo_path');
    if (storedPath) {
      var parsed = JSON.parse(storedPath);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}

  // 4. Fallback: Pick a random real product path from actual products database!
  var validProductsWithCat = products.filter(p => (p.category || p.subcategory) && p.stock > 0);
  if (validProductsWithCat.length > 0) {
    var randomP = validProductsWithCat[Math.floor(Math.random() * validProductsWithCat.length)];
    var rPath = getProductPath(randomP);
    try { localStorage.setItem('db_fomo_user_promo_path', JSON.stringify(rPath)); } catch(e){}
    return rPath;
  }

  return ['Aseo y Limpieza'];
}

function getActivePromoSubcategoryName() {
  var path = getActivePromoSubcategoryPath();
  return path[path.length - 1] || path[0] || 'Aseo y Limpieza';
}

function getActivePromoSubcategory() {
  return getActivePromoSubcategoryName();
}

function initAnnouncementBarEngine() {
  var promoTitleEl = document.getElementById('promoSubcatTitle');
  var promoSubcat = getActivePromoSubcategoryName();
  if (promoTitleEl) promoTitleEl.textContent = promoSubcat;

  var timerEl = document.getElementById('announcementTimer');
  if (!timerEl) return;

  var endTs = localStorage.getItem('db_fomo_promo_timer_end');
  var now = Date.now();

  if (!endTs || Number(endTs) <= now) {
    endTs = now + (4 * 3600 + 18 * 60 + 22) * 1000;
    localStorage.setItem('db_fomo_promo_timer_end', endTs);
  } else {
    endTs = Number(endTs);
  }

  if (_announcementTimerInterval) clearInterval(_announcementTimerInterval);
  _announcementTimerInterval = setInterval(function() {
    var rem = Math.max(0, Math.floor((endTs - Date.now()) / 1000));
    if (rem <= 0) {
      endTs = Date.now() + (4 * 3600 + 18 * 60 + 22) * 1000;
      localStorage.setItem('db_fomo_promo_timer_end', endTs);
      rem = 4 * 3600 + 18 * 60 + 22;
    }
    var h = Math.floor(rem / 3600);
    var m = Math.floor((rem % 3600) / 60);
    var s = rem % 60;
    var el = document.getElementById('announcementTimer');
    if (el) el.textContent = (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }, 1000);
}

// Native CSS sticky flow for announcement bar and header

function scrollToPromoSubcategory() {
  var path = getActivePromoSubcategoryPath();
  location.hash = categoryUrl(path);
}
window.scrollToPromoSubcategory = scrollToPromoSubcategory;

function initCartReservationTimer() {
  var display = document.getElementById('cartTimerDisplay');
  if (!display) return;

  var endTs = localStorage.getItem('db_fomo_cart_timer_end');
  var now = Date.now();

  if (!endTs || Number(endTs) <= now) {
    endTs = now + 10 * 60 * 1000; // 10 minutes
    localStorage.setItem('db_fomo_cart_timer_end', endTs);
  } else {
    endTs = Number(endTs);
  }

  if (_cartTimerInterval) clearInterval(_cartTimerInterval);
  _cartTimerInterval = setInterval(function() {
    var rem = Math.max(0, Math.floor((endTs - Date.now()) / 1000));
    if (rem <= 0) {
      endTs = Date.now() + 10 * 60 * 1000;
      localStorage.setItem('db_fomo_cart_timer_end', endTs);
      rem = 10 * 60;
    }
    var m = Math.floor(rem / 60);
    var s = rem % 60;
    var el = document.getElementById('cartTimerDisplay');
    if (el) el.textContent = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }, 1000);
}

// === Hero FOMO Urgency Spotlight Engine ===
var _heroFomoTimer = null;
var _heroFomoCurrentSku = null;

function initHeroFomoBannerEngine() {
  if (_heroFomoTimer) clearInterval(_heroFomoTimer);
  updateHeroFomoBannerData();
  
  _heroFomoTimer = setInterval(function() {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    updateHeroFomoBannerData();
  }, 60000);
}

function updateHeroFomoBannerData() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  var banner = document.getElementById('heroFomoBanner');
  if (!banner) return;
  
  var products = typeof getProducts === 'function' ? getProducts() : [];
  // Limitar a un pool fijo de 12 productos para que el navegador reutilice las imágenes en caché RAM
  // en lugar de descargar las 380 fotos de Firebase Storage en bucle infinito.
  var withImg = products.filter(function(p) { return getProductImageCandidates(p).length > 0; }).slice(0, 12);
  if (withImg.length === 0) return;

  var p = withImg[Math.floor(Math.random() * withImg.length)];
  if (!p) return;

  _heroFomoCurrentSku = p.sku;

  var tags = [
    '🔥 ÚLTIMAS UNIDADES EN BODEGA',
    '⚡ ALTA DEMANDA MAYORISTA',
    '📦 ÚLTIMO LOTE DISPONIBLE',
    '🚨 MÁS VENDIDO DE LA SEMANA',
    '💥 SE ACABA HOY MISMO'
  ];

  var claims = [
    'Ayer se vendieron +140 unidades por mayor. ¡Quedan pocas unidades en bodega, asegura las tuyas!',
    '¡38 comerciantes tienen este producto en su carrito ahora mismo! No garantizamos stock para mañana.',
    'Último lote disponible a precio directo de fábrica. ¡Agrega tus unidades antes que el camión cierre!',
    '¡Alta demanda a nivel nacional! Los clientes están llevando este producto por bultos cerrados.',
    '¡Producto estrella en tendencia! Se han despachado 95 cajas este fin de semana. Consigue tu stock.'
  ];

  var randomTag = tags[Math.floor(Math.random() * tags.length)];
  var randomClaim = claims[Math.floor(Math.random() * claims.length)];

  // Preload the first working image from every source before changing the DOM.
  var imageCandidates = getProductImageCandidates(p);
  var imageIndex = 0;
  var applyBanner = function(src) {
    var imgEl = document.getElementById('heroFomoImg');
    var skeletonEl = document.getElementById('heroFomoSkeleton');
    var tagEl = document.getElementById('heroFomoTag');
    var titleEl = document.getElementById('heroFomoTitle');
    var claimEl = document.getElementById('heroFomoClaim');
    var priceEl = document.getElementById('heroFomoPrice');
    if (imgEl) {
      imgEl.onload = function() {
        if (skeletonEl) skeletonEl.style.display = 'none';
        imgEl.style.opacity = '1';
      };
      imgEl.src = src;
    }
    if (tagEl) tagEl.textContent = randomTag;
    if (titleEl) titleEl.textContent = p.name;
    if (claimEl) claimEl.textContent = randomClaim;
    if (priceEl) priceEl.textContent = formatPrice(getPrice(p));
  };
  var tryBannerImage = function() {
    if (imageIndex >= imageCandidates.length) return;
    var src = imageCandidates[imageIndex++];
    preloadCatalogThumbnail(src, 384, applyBanner, tryBannerImage);
  };
  tryBannerImage();
}

function showFomoBannerProductModal() {
  if (_heroFomoCurrentSku) {
    showProductModal(_heroFomoCurrentSku);
  }
}
window.showFomoBannerProductModal = showFomoBannerProductModal;

// === Live Fake Online Users Counter (legacy, kept as no-op to avoid duplicate engines) ===
var _liveUsersInterval = null;
function initLiveUsersCounter() {
  // Intentionally disabled: initLiveUsersEngine is the single source of truth.
  return;
}

// === FOMO Sales & Real User Cart Toast Engine ===
var _fomoTimer = null;
var _fomoHideTimer = null;
var _fomoCurrentSku = null;
var _fomoSuppressedForPage = false;

function suppressFomoForPage() {
  if (_fomoSuppressedForPage) return;
  _fomoSuppressedForPage = true;
  if (_fomoTimer) clearTimeout(_fomoTimer);
  _fomoTimer = null;
  if (_fomoHideTimer) clearTimeout(_fomoHideTimer);
  _fomoHideTimer = null;
  closeFomoToast();
  updateFomoBellUI();
}

function dismissFomoNotificationsForPage() {
  suppressFomoForPage();
}
window.dismissFomoNotificationsForPage = dismissFomoNotificationsForPage;

// Real user cart accumulator buffer
var _userCartDebounceTimer = null;
var _userCartBuffer = {};
var _userCartLastSku = null;

function trackUserAddToCart(sku, qtyAdded) {
  if (!_userCartBuffer[sku]) _userCartBuffer[sku] = 0;
  _userCartBuffer[sku] += qtyAdded;
  _userCartLastSku = sku;

  // Reset/extend 5s debounce timer
  if (_userCartDebounceTimer) clearTimeout(_userCartDebounceTimer);
  
  _userCartDebounceTimer = setTimeout(function() {
    triggerUserAddToCartToast();
  }, 5000);
}

function triggerUserAddToCartToast() {
  if (!_userCartLastSku || !_userCartBuffer[_userCartLastSku]) return;
  var sku = _userCartLastSku;
  var totalQty = _userCartBuffer[sku];
  
  // Reset buffer
  _userCartBuffer = {};
  _userCartLastSku = null;

  var productList = typeof getProducts === 'function' ? getProducts() : (typeof _customProducts !== 'undefined' ? _customProducts : []);
  var p = productList.find(x => x.sku === sku);
  if (!p) return;

  var userText = '🟢 ¡Tú!';
  var actionText = 'Has reservado x' + totalQty + ' ' + (totalQty > 1 ? 'unidades' : 'unidad') + ' de ' + p.name;
  var timeText = 'Hace unos segundos · Toca para ver';

  showFomoToastData({
    sku: p.sku,
    image: p.image,
    badge: '🛒 TU COMPRA',
    user: userText,
    action: actionText,
    time: timeText
  });
}

// === Mute / Unmute Notifications ===
var _fomoMuted = localStorage.getItem('db_fomo_muted') === 'true';

function updateFomoBellUI() {
  var activeSvg = document.getElementById('fomoBellActive');
  var mutedSvg = document.getElementById('fomoBellMuted');
  var textSpan = document.getElementById('fomoBellText');
  var btn = document.getElementById('toggleFomoBtn');
  var notificationsMuted = _fomoMuted || _fomoSuppressedForPage;
  if (activeSvg && mutedSvg) {
    if (notificationsMuted) {
      activeSvg.classList.add('hidden');
      mutedSvg.classList.remove('hidden');
      if (textSpan) textSpan.textContent = _fomoSuppressedForPage ? 'Actualiza la página para activar' : 'Activar notificaciones';
      if (btn) btn.classList.add('opacity-60', 'bg-gray-100');
    } else {
      activeSvg.classList.remove('hidden');
      mutedSvg.classList.add('hidden');
      if (textSpan) textSpan.textContent = 'Desactivar notificaciones';
      if (btn) btn.classList.remove('opacity-60', 'bg-gray-100');
    }
  }
}

function toggleFomoNotifications() {
  if (_fomoSuppressedForPage) {
    showToast('Notificaciones pausadas hasta actualizar la página');
    return;
  }
  _fomoMuted = !_fomoMuted;
  localStorage.setItem('db_fomo_muted', _fomoMuted ? 'true' : 'false');
  updateFomoBellUI();

  if (_fomoMuted) {
    closeFomoToast();
    showToast('Notificaciones silenciadas 🔕');
  } else {
    showToast('Notificaciones activadas 🔔');
  }
}

window.toggleFomoNotifications = toggleFomoNotifications;

function initFomoSalesEngine() {
  updateFomoBellUI();
  if (_fomoTimer) return;
  scheduleNextFomoToast(1200);
}

function scheduleNextFomoToast(delayMs) {
  if (_fomoSuppressedForPage) return;
  if (_fomoTimer) clearTimeout(_fomoTimer);
  _fomoTimer = setTimeout(function() {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      triggerFomoToast();
    }
    var nextDelay = 45000 + Math.floor(Math.random() * 30000);
    scheduleNextFomoToast(nextDelay);
  }, delayMs);
}

function triggerFomoToast() {
  if (location.hash.startsWith('#/account')) return;
  if (_fomoMuted || _fomoSuppressedForPage) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  var fullList = typeof getProducts === 'function' ? getProducts() : (typeof _customProducts !== 'undefined' ? _customProducts : []);
  if (!fullList || fullList.length === 0) return;
  // Limitar al mismo pool fijo de 12 productos para evitar descargar las 380 fotos de Firebase Storage
  var productList = fullList.slice(0, 12);

  var randomProduct = productList[Math.floor(Math.random() * productList.length)];
  if (!randomProduct) return;

  var prefixes = ['99551', '98681', '97412', '93120', '95589', '94201', '98112', '96341', '92088', '99120', '98432', '97745', '96109'];
  var randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  var phoneText = '+56 9 ' + randomPrefix.substring(0, 4) + ' ****';

  var qty = Math.floor(Math.random() * 5) + 1;
  var actions = [
    'ha comprado ' + qty + 'x ' + randomProduct.name,
    'ha agregado ' + qty + 'x ' + randomProduct.name + ' al carrito',
    'compró ' + randomProduct.name + ' por mayor',
    'ha reservado ' + qty + ' unidades de ' + randomProduct.name
  ];
  var randomAction = actions[Math.floor(Math.random() * actions.length)];
  var times = ['Hace 1 min', 'Hace 2 min', 'Hace unos segundos', 'Hace 3 min'];
  var randomTime = times[Math.floor(Math.random() * times.length)] + ' · Toca para ver';

  var fallbackImages = getProductImageCandidates(randomProduct);
  var primaryImage = fallbackImages[0] || '';
  showFomoToastData({
    sku: randomProduct.sku,
    image: primaryImage,
    images: fallbackImages,
    badge: '🔥 SALE',
    user: phoneText,
    action: randomAction,
    time: randomTime
  });
}

function showFomoToastData(data) {
  if (_fomoMuted || _fomoSuppressedForPage) return;
  var toast = document.getElementById('fomoToast');
  if (!toast) return;

  var imgEl = document.getElementById('fomoImg');
  var userEl = document.getElementById('fomoUser');
  var actionEl = document.getElementById('fomoAction');
  var timeEl = document.getElementById('fomoTime');
  var badgeEl = document.getElementById('fomoBadge');

  _fomoCurrentSku = data.sku;

  // Preload image before sliding down toast; try the other product images if the first one fails.
  var candidates = (data.images && data.images.length ? data.images : [data.image]).filter(function(url) { return url && url.trim(); });
  var imageIndex = 0;
  var renderAndShow = function(src) {
    if (location.hash.startsWith('#/account')) return;
    if (_fomoMuted || _fomoSuppressedForPage) return;
    var orderPeek = document.getElementById('catalogOrderPeek');
    if (orderPeek && !orderPeek.hidden) return;
    if (imgEl) imgEl.src = src || 'https://via.placeholder.com/100';
    if (userEl) userEl.textContent = data.user;
    if (actionEl) actionEl.textContent = data.action;
    if (timeEl) timeEl.textContent = data.time;
    if (badgeEl) badgeEl.textContent = data.badge || '🔥 SALE';

    toast.onclick = function() {
      if (_fomoCurrentSku && typeof window.showProductModal === 'function') window.showProductModal(_fomoCurrentSku);
      closeFomoToast();
    };
    toast.classList.remove('-translate-y-6', 'opacity-0', 'pointer-events-none');
    toast.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
    if (_fomoHideTimer) clearTimeout(_fomoHideTimer);
    _fomoHideTimer = setTimeout(function() { closeFomoToast(); }, 10000);
  };
  var tryNextImage = function() {
    if (imageIndex >= candidates.length) { renderAndShow(''); return; }
    var src = candidates[imageIndex++];
    preloadCatalogThumbnail(src, 128, renderAndShow, tryNextImage);
  };
  tryNextImage();
}

function closeFomoToast() {
  var toast = document.getElementById('fomoToast');
  if (!toast) return;
  toast.classList.add('-translate-y-6', 'opacity-0', 'pointer-events-none');
  toast.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
}

window.closeFomoToast = closeFomoToast;

// === Hierarchy helpers ===
function isHiddenCatalogCategory(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === 'imagenes rotas';
}
// Get product path as array (uses path field, falls back to category/subcategory).
// The old "Imágenes Rotas" bucket is hidden from the public catalog; products
// remain visible under their parent category instead of disappearing.
function getProductPath(p) {
  const rawPath = Array.isArray(p.path) && p.path.length > 0
    ? p.path
    : [p.category, p.subcategory, p.subsubcategory].filter(Boolean);
  const cleanPath = rawPath.filter(part => !isHiddenCatalogCategory(part));
  return cleanPath.length ? cleanPath : ['Sin Categoria'];
}
// Returns true if product belongs to the given path prefix
function matchesPath(p, prefix) {
  const path = getProductPath(p);
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (path[i] !== prefix[i]) return false;
  }
  return true;
}
// Get child category names at a given prefix level
function getChildren(prefix) {
  const children = new Set();
  
  // Custom categories that are NOT deleted
  const customObj = getCustomCategories();
  const deletedCats = Object.keys(customObj).filter(k => customObj[k] === '__DELETED__');
  
  getProducts().forEach(p => {
    const path = getProductPath(p);
    // Don't include it if it's marked as deleted
    let isDeleted = false;
    let curr = '';
    for (const part of path) {
      curr = curr ? curr + '/' + part : part;
      if (deletedCats.includes(curr)) {
        isDeleted = true; break;
      }
    }
    
    if (!isDeleted && matchesPath(p, prefix) && path.length > prefix.length) {
      const name = path[prefix.length];
      if (name) children.add(name);
    }
  });

  // Also include catalog subcategories from _appwriteSubcategories
  if (prefix.length === 1 && typeof _appwriteCategories !== 'undefined' && typeof _appwriteSubcategories !== 'undefined') {
    const parentCatName = prefix[0];
    const catMatch = _appwriteCategories.find(function(c) {
      return c && (c.name === parentCatName || (c.name && c.name.toLowerCase() === parentCatName.toLowerCase()));
    });
    if (catMatch) {
      const catId = catMatch.$id || catMatch.id;
      _appwriteSubcategories.forEach(function(s) {
        if (s && s.name && (s.categoryId === catId || s.category_id === catId)) {
          const subPath = parentCatName + '/' + s.name;
          if (!deletedCats.includes(subPath) && !deletedCats.includes(s.name)) {
            children.add(s.name);
          }
        }
      });
    }
  }
  
  Object.keys(customObj).forEach(pathStr => {
    if (customObj[pathStr] === '__DELETED__') return;
    
    const path = pathStr.split('/');
    if (path.some(isHiddenCatalogCategory)) return;
    if (path.length > prefix.length) {
      let match = true;
      for (let i = 0; i < prefix.length; i++) {
        if (path[i] !== prefix[i]) { match = false; break; }
      }
      if (match) children.add(path[prefix.length]);
    }
  });

  // Filter out "Sin Categoria" if there are other valid categories
  if (children.size > 1 && children.has('Sin Categoria')) {
    children.delete('Sin Categoria');
  }

  return [...children].sort();
}
function categoryUrl(prefix) {
  return '#/category/' + prefix.map(encodeURIComponent).join('/');
}

// === Home ===
// === Store (tienda) filter band — logo + nombre ===
function renderNewsBanner() {
  try {
    if (!_homeMarketing) return '';
    var banners = Array.isArray(_homeMarketing.newsBanners)
      ? _homeMarketing.newsBanners.slice(0, 3)
      : (_homeMarketing.newsBanner ? [_homeMarketing.newsBanner] : []);
    return banners.map(function(nb, index) {
      if (!nb || !nb.enabled) return '';
      var desktop = String(nb.desktopUrl || nb.mobileUrl || '').trim();
      var mobile = String(nb.mobileUrl || nb.desktopUrl || '').trim();
      if (!desktop || !mobile) return '';
      var image = '<picture><source media="(max-width: 639px)" srcset="' + escapeHtml(mobile) + '">'
        + '<img src="' + escapeHtml(desktop) + '" alt="Novedad ' + (index + 1) + '" loading="lazy" style="display:block;width:100%;height:auto" /></picture>';
      var href = '', external = false;
      if (nb.linkType === 'category' && typeof nb.category === 'string' && nb.category.trim()) {
        href = categoryUrl([nb.category.trim()]);
      } else if (nb.linkType === 'url' && typeof nb.linkUrl === 'string') {
        try {
          var parsed = new URL(nb.linkUrl);
          if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password) { href = parsed.href; external = true; }
        } catch (_) {}
      }
      if (href) image = '<a href="' + escapeHtml(href) + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '') + ' aria-label="' + escapeHtml(nb.linkType === 'category' ? 'Ver categoría ' + nb.category : 'Abrir enlace del banner') + '">' + image + '</a>';
      return '<div class="news-banner-wrap" style="margin-top:16px;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.15)">' + image + '</div>';
    }).join('');
  } catch (e) { return ''; }
}

function renderStoreBand() {
  if (_vendors.length === 0) return '';
  var mainLogo = _settings.logoUrl || '';
  var stores = [{ id: '', name: 'Todas', color: '#121216', logoUrl: '' },
                { id: '__main__', name: MAIN_STORE_NAME, color: '#c81e1e', logoUrl: mainLogo }]
    .concat(_vendors.map(function(v){ return { id: v.id, name: v.name, color: v.color || '#f97316', logoUrl: v.logoUrl || '', phone: v.phone || '' }; }));
  var chips = stores.map(function(s) {
    var active = selectedStore === s.id;
    var initials = (s.name || '?').trim().slice(0, 2).toUpperCase();
    var avatar = s.logoUrl
      ? '<img src="' + escapeHtml(s.logoUrl) + '" alt="' + escapeHtml(s.name) + '" style="width:100%;height:100%;object-fit:contain">'
      : (s.id === '__main__' ? '🏪' : (s.id ? escapeHtml(initials) : '🛍️'));
    var bg = s.id === '' ? 'transparent' : s.color;
    return '<button type="button" onclick="selectStore(\'' + s.id + '\')" style="flex-shrink:0;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;padding:6px 14px 6px 6px;border-radius:999px;border:1px solid ' + (active ? s.color : '#e5e7eb') + ';background:' + (active ? s.color + '18' : '#fff') + ';color:' + (active ? s.color : '#6b7280') + ';font-size:12px;font-weight:' + (active ? '800' : '600') + ';cursor:pointer;transition:all .2s;font-family:inherit">'
      + '<span style="width:28px;height:28px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:' + bg + ';color:#fff;font-size:14px;font-weight:800;flex-shrink:0">' + avatar + '</span>'
      + '<span>' + escapeHtml(s.name) + '</span>'
      + '</button>';
  }).join('');
  return '<div class="scrollbar-hide" style="display:flex;align-items:center;gap:10px;overflow-x:auto;padding:6px 2px 14px;margin-bottom:6px;-webkit-overflow-scrolling:touch;scrollbar-width:none">'
    + '<span style="flex-shrink:0;font-size:12px;font-weight:800;color:#6b7280;margin-right:2px">Tiendas</span>'
    + chips
    + '</div>';
}

function selectStore(id) {
  selectedStore = id || '';
  render();
}
window.selectStore = selectStore;

// === Toggle inline subcategorías under a category card ===
function toggleCategorySubcats(catId) {
  var panel = document.getElementById(catId + '-subs');
  var arrow = document.getElementById(catId + '-arrow');
  if (!panel) return;
  var isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden');
    if (arrow) arrow.style.transform = 'rotate(180deg)';
  } else {
    panel.classList.add('hidden');
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  }
}
window.toggleCategorySubcats = toggleCategorySubcats;

// === Toggle subcategorías bajo un chip de categoría ===
function toggleChipSubcats(chipId) {
  var panel = document.getElementById(chipId + '-subs');
  if (!panel) return;
  var isHidden = panel.style.display === 'none' || panel.classList.contains('hidden');
  // Cerrar otros paneles abiertos
  document.querySelectorAll('[id$="-subs"]').forEach(function(el) {
    if (el.id !== chipId + '-subs') {
      el.style.display = 'none';
      el.classList.add('hidden');
    }
  });
  if (isHidden) {
    panel.classList.remove('hidden');
    panel.style.display = 'flex';
  } else {
    panel.classList.add('hidden');
    panel.style.display = 'none';
  }
}
window.toggleChipSubcats = toggleChipSubcats;

function renderHome() {
  const products = getProducts().filter(p => getRealStock(p) > 0);
  const topCats = getChildren([]);
  const counts = {};
  topCats.forEach(c => counts[c] = products.filter(p => matchesPath(p, [c])).length);
  // Filtrar categorias sin productos con stock
  const topCatsWithStock = topCats.filter(c => (counts[c] || 0) > 0);

  const withImg = products.filter(p => p.image && p.image.trim());
  // Deals: Productos "¡Apúrate que se acaban!" con stock real caliente (6 a 18 unidades)
  let deals = [...withImg].filter(p => {
    const st = getRealStock(p);
    return st >= 6 && st <= 18;
  }).sort((a, b) => getRealStock(a) - getRealStock(b)).slice(0, 10);

  if (deals.length < 4) {
    deals = [...withImg].filter(p => {
      const st = getRealStock(p);
      return st > 0 && st <= 25;
    }).sort((a, b) => getRealStock(a) - getRealStock(b)).slice(0, 10);
  }
  // Recently added: published catalog products ordered by their web publication date.
  // Keep the browser-local recent SKU list as a tie-breaker for legacy custom products.
  let recentSkus = [];
  try { recentSkus = JSON.parse(localStorage.getItem('db_recent_product_skus') || '[]'); } catch (e) {}
  const recentSkuRank = new Map(recentSkus.map((sku, index) => [String(sku), index]));
  const recent = products
    .slice()
    .sort((a, b) => {
      const publishedDifference = productNewestTimestamp(b) - productNewestTimestamp(a);
      if (publishedDifference) return publishedDifference;
      const rankA = recentSkuRank.has(String(a.sku)) ? recentSkuRank.get(String(a.sku)) : Infinity;
      const rankB = recentSkuRank.has(String(b.sku)) ? recentSkuRank.get(String(b.sku)) : Infinity;
      if (rankA !== rankB) return rankA - rankB;
      return (a.name || '').localeCompare(b.name || '', 'es');
    })
    .slice(0, 8);
  // Destacados comienza con los productos recién añadidos y completa con mayor stock.
  const recentFeatured = recent.filter(p => p.image && p.image.trim()).slice(0, 6);
  const recentFeaturedSkus = new Set(recentFeatured.map(p => String(p.sku)));
  const featured = [
    ...recentFeatured,
    ...[...withImg]
      .sort((a, b) => getRealStock(b) - getRealStock(a))
      .filter(p => !recentFeaturedSkus.has(String(p.sku)))
      .slice(0, Math.max(0, 6 - recentFeatured.length))
  ];
  const minK = formatMinPurchaseCompact(getMinPurchase());

  // Cheap products carousel (sorted ascending by price)
  const cheapProducts = [...products]
    .filter(p => getPrice(p) > 0)
    .sort((a,b) => getPrice(a) - getPrice(b))
    .slice(0, 8);
  const heroLogoUrl = _settings.logoUrl || '';
  const heroBackground = 'linear-gradient(90deg,rgba(8,18,17,.46),rgba(12,23,21,.16))' + (_settings.heroImageUrl ? ',url(' + JSON.stringify(_settings.heroImageUrl) + ')' : '');
  const categoryBrowseSection = topCatsWithStock.length > 0 ? `
    <section id="categoriesSection" class="category-browse-section scroll-mt-24" aria-labelledby="categoryBrowseTitle">
      <div class="catalog-section-heading category-section-heading">
        <div>
          <span class="category-browse-kicker">COMPRA A TU MANERA</span>
          <h2 id="categoryBrowseTitle" class="section-title">Explora por categoría</h2>
          <p>Encuentra rápido lo que buscas</p>
        </div>
        <span class="category-swipe-hint" aria-hidden="true">Desliza <svg viewBox="0 0 20 20" fill="none"><path d="M3 10h13m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </div>
      <div class="category-scroll-row">
        ${topCatsWithStock.map((cat, idx) => {
          const icon = getCategoryIcon(cat, [cat]);
          const em = getCategoryEmoji(cat);
          return `
          <a href="${categoryUrl([cat])}" class="cat-card category-home-card cat-g${idx % 4} flex-none w-[72%] sm:w-52 snap-start text-left">
            <div class="cat-icon-wrap">
              ${icon ? `<img src="${escapeHtml(icon)}" alt="${escapeHtml(stripEmoji(cat))}" loading="lazy">` : `<span class="text-3xl leading-none" role="img" aria-label="${escapeHtml(stripEmoji(cat))}">${em}</span>`}
            </div>
            <span class="category-home-copy">
              <span class="category-home-eyebrow">Ver categoría</span>
              <strong>${escapeHtml(stripEmoji(cat))}</strong>
              <span class="category-home-footer"><span>${counts[cat] || 0} productos</span><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 10h13m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            </span>
          </a>`;
        }).join('')}
      </div>
    </section>` : '';

  const html = `
    <div class="fade-in space-y-6 catalog-home">
      <!-- Hero sky tomado de Definitive; se conservan datos y acciones del catálogo actual. -->
      <section class="hero-banner hero-sky-surface relative overflow-hidden rounded-[28px] p-5 sm:p-8 card-shadow" style="background-image:${escapeHtml(heroBackground)}">
        <canvas class="hero-sky-canvas" aria-hidden="true"></canvas>
        <div class="hero-sky-shade" aria-hidden="true"></div>
        <svg class="hero-motion-scene" viewBox="0 0 340 220" aria-hidden="true" focusable="false">
          <defs><linearGradient id="carlitosHeroGold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff4bc"/><stop offset="1" stop-color="#f5ca36"/></linearGradient></defs>
          <path class="hero-motion-trail" d="M32 142 C48 31 109 19 166 24 C229 28 285 26 308 91" fill="none" stroke="#ffe38a" stroke-width="1.1" stroke-dasharray="2 9" stroke-linecap="round"/>
          <g class="hero-motion-item hero-motion-box" transform="translate(4 112)"><image href="/images/hero-decor/regalo.png" width="76" height="76" preserveAspectRatio="xMidYMid meet"/></g>
          <g class="hero-motion-item hero-motion-perfume" transform="translate(270 17)"><image href="/images/hero-decor/perfume.png" width="65" height="65" preserveAspectRatio="xMidYMid meet"/></g>
          <g class="hero-motion-item hero-motion-shirt" transform="translate(268 133)"><image href="/images/hero-decor/ropa.png" width="68" height="68" preserveAspectRatio="xMidYMid meet"/></g>
          <g class="hero-motion-sparkles" fill="#ffe8a1"><circle cx="54" cy="53" r="1.8"/><circle cx="282" cy="104" r="1.6"/><path d="M58 171v8m-4-4h8M272 64v6m-3-3h6" stroke="#ffe8a1" stroke-width="1.3" stroke-linecap="round"/></g>
        </svg>
        ${_settings.heroKicker ? `<div class="hero-mobile-kicker"><span aria-hidden="true"></span>${escapeHtml(_settings.heroKicker)}</div>` : ''}
        <div class="absolute z-10 top-4 right-3 sm:top-1/2 sm:right-6 -translate-y-0 sm:-translate-y-1/2">
          <div class="hero-logo-frame w-[58px] h-[58px] sm:w-32 sm:h-32${heroLogoUrl ? '' : ' logo-error'}" aria-label="Logo de ${escapeHtml(MAIN_STORE_NAME)}">
            <div class="hero-logo-skeleton" aria-hidden="true"></div>
            ${heroLogoUrl ? `<img id="heroLogoImage" src="${escapeHtml(heroLogoUrl)}" alt="Logo de ${escapeHtml(MAIN_STORE_NAME)}" class="hero-logo-image" onload="this.parentElement.classList.add('logo-loaded')" onerror="this.parentElement.classList.add('logo-error')">` : ''}
            <div class="hero-logo-fallback absolute inset-0 items-center justify-center text-center font-display font-extrabold text-sm text-white/80">${escapeHtml((MAIN_STORE_NAME || 'T').slice(0, 2).toUpperCase())}</div>
          </div>
        </div>
        <div class="relative z-10 max-w-[74%] sm:max-w-[72%]">
          ${_settings.heroKicker ? `<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/25 backdrop-blur text-[9px] sm:text-[10px] font-bold tracking-[0.1em] sm:tracking-[0.14em] uppercase text-white shadow-sm border border-white/40"><span class="w-1.5 h-1.5 rounded-full bg-yellow-300"></span>${escapeHtml(_settings.heroKicker)}</div>` : '<div class="hidden"></div>'}
          <h1 class="font-display font-extrabold text-[25px] sm:text-4xl leading-[1.1] mt-3 sm:mt-4 text-white max-w-[16ch]" style="text-shadow:0 2px 8px rgba(42,93,158,.25)">
            ${escapeHtml(_settings.heroTitle || 'Descubre nuestros productos')}
          </h1>
          <p class="text-white/90 text-xs sm:text-sm mt-2.5 max-w-xl font-medium leading-relaxed">
            ${escapeHtml(_settings.heroDescription || 'Explora nuestro catálogo y encuentra tus favoritos.')}
          </p>
          <div class="flex flex-col sm:flex-row sm:items-center gap-2.5 mt-4 sm:mt-5">
            <a href="#/all" class="hero-catalog-link inline-flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2.5 rounded-2xl font-semibold text-xs sm:text-sm active:scale-95 w-full sm:w-auto">
              Ver catálogo completo
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"/></svg>
            </a>
            <div class="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <div class="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/20 backdrop-blur border border-white/35 text-white min-w-0">
                <span class="w-7 h-7 rounded-full bg-[#fad502] flex items-center justify-center text-sm font-extrabold text-[#7b171d] flex-none" aria-hidden="true">$</span>
                <div class="min-w-0">
                  <div class="text-[9px] uppercase tracking-wider text-white/80 leading-tight">Compra mínima</div>
                  <div id="minPurchaseHero" class="font-display font-extrabold text-sm sm:text-base leading-tight truncate">${minK}</div>
                </div>
              </div>
              <div class="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/20 backdrop-blur border border-white/35 text-white min-w-0">
                <span class="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center text-sm flex-none">📦</span>
                <div class="min-w-0">
                  <div class="text-[9px] uppercase tracking-wider text-white/80 leading-tight">Productos</div>
                  <div class="font-display font-extrabold text-sm sm:text-base leading-tight">${products.length} <span class="text-xs font-semibold text-white/80">${products.length === 1 ? 'producto activo' : 'productos activos'}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      ${renderCatalogBenefits()}
      ${categoryBrowseSection}
      ${renderCatalogPackCard()}

      <style>
        @keyframes fomoShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      </style>

      <!-- Hero FOMO Urgency Spotlight Carousel Banner (Theme Matched White Luxe) -->
      <div id="heroFomoBanner" class="relative overflow-hidden rounded-[26px] bg-white/95 backdrop-blur-xl p-4 sm:p-5 text-blue-950 shadow-lg border-2 border-blue-200/90 cursor-pointer hover:border-blue-400/80 transition-all duration-300 group" onclick="showFomoBannerProductModal()">
        <div class="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <!-- Left: BIG product image (clean without badges) + urgency text -->
          <div class="flex items-center gap-4 w-full sm:w-auto">
            <!-- Large Product Thumbnail Container -->
            <div class="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-blue-50/80 overflow-hidden flex-shrink-0 border border-blue-200/80 shadow-inner group-hover:scale-105 transition-transform duration-300">
              <div id="heroFomoSkeleton" class="absolute inset-0 z-10" style="background: linear-gradient(90deg, #e0e7ff 25%, #c7d2fe 50%, #e0e7ff 75%); background-size: 200% 100%; animation: fomoShimmer 1.4s ease-in-out infinite;"></div>
              <img id="heroFomoImg" src="" alt="Producto" class="w-full h-full object-cover relative z-0" style="opacity: 0; transition: opacity 0.4s ease;">
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-600 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider shadow-sm">
                  <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                  <span id="heroFomoTag">🔥 ÚLTIMAS UNIDADES EN BODEGA</span>
                </span>
              </div>
              <h3 id="heroFomoTitle" class="font-display font-extrabold text-sm sm:text-base text-blue-950 line-clamp-1 leading-snug">Cargando producto estrella...</h3>
              <p id="heroFomoClaim" class="text-xs sm:text-sm text-blue-800/90 font-semibold line-clamp-2 leading-relaxed mt-1">Descubre los productos disponibles en nuestro catálogo.</p>
            </div>
          </div>

          <!-- Right: Price + Quick Reserve Action Button -->
          <div class="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-blue-100">
            <div class="flex flex-col text-left sm:text-right">
              <span class="text-[10px] text-blue-500 uppercase font-extrabold tracking-wider">Precio Mayorista</span>
              <span id="heroFomoPrice" class="font-display font-extrabold text-xl sm:text-2xl text-emerald-600">$0</span>
            </div>
            <button onclick="event.stopPropagation(); showFomoBannerProductModal()" class="px-5 py-3 rounded-2xl btn-accent font-extrabold text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center gap-1.5 whitespace-nowrap">
              <span>⚡ Asegurar Mi Stock</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>

        </div>
      </div>

      ${renderNewsBanner()}

      ${products.length === 0 ? `
      <div class="bg-white rounded-3xl p-6 card-shadow text-center">
        <div class="w-16 h-16 mx-auto rounded-full mb-3 flex items-center justify-center" style="background: linear-gradient(135deg,#e3f2ff,#f5fbff);">
          <svg class="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
        </div>
        <h3 class="font-display font-extrabold text-blue-800 text-lg">${catalogLoadError ? 'No pudimos cargar los productos' : 'Catálogo vacío'}</h3>
        <p class="text-blue-500 text-sm mt-1 mb-4">${catalogLoadError ? 'Revisa tu conexión y vuelve a intentarlo.' : 'Aún no se han cargado productos.'}</p>
        ${catalogLoadError ? '<button type="button" onclick="refreshData()" class="px-5 py-2 rounded-xl bg-blue-700 text-white font-bold">Reintentar</button>' : ''}
      </div>` : ''}

      <!-- Store (tienda) filter band — logo + nombre -->
      ${renderStoreBand()}

      ${recent.length > 0 ? `
      <!-- Lo último añadido aparece antes de productos con poco stock -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="section-title">✨ Lo último añadido</h2>
        </div>
        <div class="catalog-product-rail">
          ${recent.map(p => renderCatalogCard(p, 'new')).join('')}
        </div>
      </div>` : ''}

      ${deals.length > 0 ? `
      <!-- Deals carousel -->
      <div>
        <div class="flex flex-col mb-3">
          <div class="flex items-center justify-between">
            <h2 class="section-title">🔥 ¡Apúrate que se acaban!</h2>
            <a href="#/all" class="text-xs text-blue-500 font-bold hover:text-blue-700 flex-none ml-2">Ver más →</a>
          </div>
          <p class="text-xs text-blue-900/90 font-medium mt-0.5"><span class="hidden sm:inline">Productos con pocas unidades que vuelan rápido. ¡Asegura los tuyos antes de que se agoten!</span><span class="inline sm:hidden">¡Poco stock! Vuelan rápido 🔥</span></p>
        </div>
        <div class="catalog-product-rail">
          ${deals.map(p => renderCatalogCard(p, 'low')).join('')}
        </div>
      </div>` : ''}

      ${cheapProducts.length > 0 ? `
      <!-- Productos ordenados desde el precio publicado más bajo -->
      <div>
        <div class="flex flex-col mb-3">
          <div class="flex items-center justify-between">
            <h2 class="section-title">🏷️ <span class="hidden sm:inline">Productos </span>Desde ${formatPrice(getPrice(cheapProducts[0]))}</h2>
            <a href="#/all" class="text-xs text-blue-500 font-bold hover:text-blue-700 flex-none ml-2">Ver todos →</a>
          </div>
          <p class="text-xs text-blue-900/90 font-medium mt-0.5"><span class="hidden sm:inline">¡Lo mismo que te costaría un chicle! Margen imbatible para tu negocio.</span><span class="inline sm:hidden">Margen imbatible 💰</span></p>
        </div>
        <div class="catalog-product-rail">
          ${cheapProducts.map(p => renderCatalogCard(p, '')).join('')}
        </div>
      </div>` : ''}

      ${featured.length > 0 ? `
      <!-- Featured products -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="section-title">Destacados</h2>
          <a href="#/all" class="text-xs text-blue-500 font-bold hover:text-blue-700">Ver todo →</a>
        </div>
        ${renderProductGrid(featured)}
      </div>` : ''}
    </div>
  `;
  $('#app').innerHTML = html;
  window.mountVolumetricHero?.();
  initHeroFomoBannerEngine();
  initPersistentHeroTimer();
  initAnnouncementBarEngine();
}

// === Category page (hierarchical, supports any depth) ===
function renderCategory(prefixEncoded) {
  const prefix = (prefixEncoded || []).map(decodeURIComponent).filter(part => !isHiddenCatalogCategory(part));
  if (prefix.length === 0) return renderHome();

  const products = getProducts().filter(p => matchesPath(p, prefix));
  const children = getChildren(prefix);

  // Breadcrumb
  let breadcrumb = '<div class="flex items-center gap-1 text-xs text-blue-400 mb-1 flex-wrap">';
  breadcrumb += `<a href="#/" class="hover:text-blue-600">Inicio</a>`;
  for (let i = 0; i < prefix.length; i++) {
    breadcrumb += `<span class="mx-1">›</span>`;
    if (i === prefix.length - 1) {
      breadcrumb += `<span class="text-blue-600 font-semibold">${escapeHtml(prefix[i])}</span>`;
    } else {
      breadcrumb += `<a href="${categoryUrl(prefix.slice(0, i+1))}" class="hover:text-blue-600">${escapeHtml(prefix[i])}</a>`;
    }
  }
  breadcrumb += '</div>';

  const catTitle = prefix[prefix.length - 1];
  const displayCatTitle = typeof cleanCatalogCategoryLabel === 'function' ? cleanCatalogCategoryLabel(catTitle) : catTitle;
  const catIcon = typeof getCategoryBgEmojis === 'function' ? (getCategoryBgEmojis(catTitle).split(' ')[0] || '🛍️') : '🛍️';

  let html = `<div class="fade-in space-y-5">
    ${breadcrumb}
    ${renderStoreBand()}
    <div class="catalog-heading">
      <div class="flex items-center gap-3.5">
        <div class="w-12 h-12 rounded-2xl bg-[#f4f5f7] border border-gray-200 flex items-center justify-center text-2xl flex-shrink-0">
          ${catIcon}
        </div>
        <div>
          <h1>${escapeHtml(displayCatTitle)}</h1>
          <p>${escapeHtml(MAIN_STORE_NAME)} · Stock disponible en línea</p>
        </div>
      </div>
      <span class="catalog-heading-count">${products.length} ${products.length === 1 ? 'producto' : 'productos'}</span>
    </div>`;

  // Subcategory chips (if there are children) — solo con stock
  var childrenWithStock = children.filter(function(c) {
    return getProducts().filter(function(p) { return getRealStock(p) > 0 && matchesPath(p, [...prefix, c]); }).length > 0;
  });

  if (childrenWithStock.length > 0) {
    html += `<div class="mb-6">
      <div class="section-title mb-3 !text-sm">Subcategorías</div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 stagger">
        ${childrenWithStock.map((c, idx) => {
          const subCount = getProducts().filter(p => getRealStock(p) > 0 && matchesPath(p, [...prefix, c])).length;
          const icon = getCategoryIcon(c, [...prefix, c]);
          const em = getCategoryEmoji(c);
          return `
            <a href="${categoryUrl([...prefix, c])}" class="cat-card cat-g${idx % 4} card-shadow card-shadow-hover block text-left">
              <div class="cat-icon-wrap">
                ${icon ? `<img src="${escapeHtml(icon)}" alt="${escapeHtml(stripEmoji(c))}" loading="lazy">` : `<span class="text-3xl leading-none" role="img" aria-label="${escapeHtml(stripEmoji(c))}">${em}</span>`}
              </div>
              <div class="font-display font-extrabold text-blue-900 text-sm sm:text-base leading-tight relative">${escapeHtml(stripEmoji(c))}</div>
              <div class="text-[11px] text-blue-500/80 mt-1 font-semibold relative">${subCount} productos</div>
            </a>`;
        }).join('')}
      </div>
    </div>`;
  }

  // Products at this level or below — with shared filter/sort bar
  if (products.length > 0) {
    html += productListSection(products);
  }
  html += '</div>';
  $('#app').innerHTML = html;
  initHeroParticles(catTitle, 'catParticles');
}

// === Catalog filters & sorting (shared across catalog / category / search) ===
const SORT_OPTIONS = [
  { v: 'newest',     label: 'Más recientes',  sub: 'Últimos publicados primero' },
  { v: 'reco',       label: 'Recomendado',     sub: 'Lo mejor primero' },
  { v: 'stock_low',  label: '🔥 Por agotarse', sub: 'Menos stock primero' },
  { v: 'stock_high', label: '📦 Mayor stock',  sub: 'Más disponibles primero' },
  { v: 'price_asc',  label: 'Menor precio',    sub: 'Más barato primero' },
  { v: 'price_desc', label: 'Mayor precio',    sub: 'Más caro primero' },
  { v: 'name',       label: 'Nombre A–Z',      sub: 'Alfabético' }
];
let _catSort = 'newest';    // prioriza la fecha de publicación en la web
let _catInStock = false;    // only show products with stock
let _catPrice = { min: null, max: null }; // active price filter (null = unbounded)

function sortLabel() { return (SORT_OPTIONS.find(o => o.v === _catSort) || SORT_OPTIONS[0]).label; }
function priceActive() { return _catPrice.min !== null || _catPrice.max !== null; }
function priceLabel() {
  if (!priceActive()) return 'Precio';
  if (_catPrice.min !== null && _catPrice.max !== null) return `${formatPrice(_catPrice.min)}–${formatPrice(_catPrice.max)}`;
  if (_catPrice.min !== null) return `≥ ${formatPrice(_catPrice.min)}`;
  return `≤ ${formatPrice(_catPrice.max)}`;
}

// Price bounds (rounded to 100s) across the whole catalog
function priceBounds() {
  const prices = getProducts().map(getPrice).filter(n => n > 0);
  if (!prices.length) return { min: 0, max: 0 };
  return { min: Math.floor(Math.min(...prices) / 100) * 100, max: Math.ceil(Math.max(...prices) / 100) * 100 };
}

function applyCatFilters(list) {
  let out = [...list].filter(p => getRealStock(p) > 0);
  if (_catPrice.min !== null) out = out.filter(p => getPrice(p) >= _catPrice.min);
  if (_catPrice.max !== null) out = out.filter(p => getPrice(p) <= _catPrice.max);
  switch (_catSort) {
    case 'newest':
      out.sort((a, b) => productNewestTimestamp(b) - productNewestTimestamp(a));
      break;
    case 'stock_low': out.sort((a, b) => getRealStock(a) - getRealStock(b)); break;
    case 'stock_high': out.sort((a, b) => getRealStock(b) - getRealStock(a)); break;
    case 'price_asc': out.sort((a, b) => getPrice(a) - getPrice(b)); break;
    case 'price_desc': out.sort((a, b) => getPrice(b) - getPrice(a)); break;
    case 'name': out.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')); break;
    default: break; // reco => keep renderProductGrid's default ordering
  }
  return out;
}

// Filter bar: Ordenar (sheet) + Precio (sheet) + Con stock toggle + count
function renderFilterBar(shown, total) {
  const hiddenCount = total - shown;
  return `<div class="filter-bar scrollbar-hide">
    <button onclick="openSortSheet()" class="pill">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M3 7h13M3 12h9M3 17h5M17 17V7m0 0l-3 3m3-3l3 3"/></svg>
      <span>${sortLabel()}</span>
    </button>
    <button onclick="openPriceSheet()" class="pill ${priceActive() ? 'on' : ''}">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M3 6h18M6 12h12M10 18h4"/></svg>
      <span>${priceLabel()}</span>
    </button>
    <button aria-pressed="${_catInStock}" onclick="toggleCatInStock()" class="pill ${_catInStock ? 'on' : ''}">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
      Con stock
    </button>
    <span class="ml-auto text-xs font-bold text-blue-400 whitespace-nowrap flex-shrink-0 pl-2">${shown}${hiddenCount > 0 ? `<span class="text-blue-300">/${total}</span>` : ''} prod.</span>
  </div>`;
}

// Reusable section: filter bar + grid (or empty state) for any product list
function productListSection(products) {
  const list = applyCatFilters(products);
  if (list.length === 0) {
    return renderFilterBar(0, products.length) + `<div class="text-center text-blue-400 py-14">
      <svg class="w-12 h-12 mx-auto mb-3 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
      <p class="font-semibold">No hay productos con estos filtros</p>
      ${(_catInStock || priceActive()) ? '<button onclick="clearAllFilters()" class="mt-3 text-sm font-bold text-blue-600 underline">Quitar filtros</button>' : ''}
    </div>`;
  }
  return renderFilterBar(list.length, products.length) + renderProductGrid(list, _catSort !== 'reco');
}

// Sort bottom sheet
function openSortSheet() {
  const wrap = document.getElementById('sortOptions');
  wrap.innerHTML = SORT_OPTIONS.map(o => `
    <button class="sort-opt ${o.v === _catSort ? 'sel' : ''}" onclick="pickSort('${o.v}')">
      <span class="flex flex-col items-start">
        <span>${o.label}</span>
        <span class="text-[11px] font-semibold text-blue-300">${o.sub}</span>
      </span>
      ${o.v === _catSort ? `<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>` : ''}
    </button>`).join('');
  document.getElementById('sortSheet').classList.remove('hidden');
}
function closeSortSheet() { document.getElementById('sortSheet').classList.add('hidden'); }
function pickSort(v) { _catSort = v; closeSortSheet(); render(); }
function toggleCatInStock() { _catInStock = !_catInStock; render(); }
function clearAllFilters() { _catInStock = false; _catPrice = { min: null, max: null }; render(); }

function productTimestamp(value) {
  if (value instanceof Date) return value.getTime() || 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') return productTimestamp(value.toDate());
    const seconds = Number(value.seconds || value._seconds || 0);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return 0;
}

function productNewestTimestamp(product) {
  return productTimestamp(product.webPublishedAt) ||
    productTimestamp(product._createdAt) ||
    productTimestamp(product.createdAt) ||
    0;
}

// === Price range bottom sheet ===
function pricePresets(b) {
  // Sensible buckets clamped to the catalog's real bounds
  return [
    { label: 'Todos', min: null, max: null },
    { label: '≤ $1.000', min: null, max: 1000 },
    { label: '$1.000–$5.000', min: 1000, max: 5000 },
    { label: '$5.000–$10.000', min: 5000, max: 10000 },
    { label: '≥ $10.000', min: 10000, max: null }
  ].filter(p => (p.min === null || p.min < b.max) && (p.max === null || p.max > b.min));
}
function _presetSelected(p) {
  return (_catPrice.min ?? null) === (p.min ?? null) && (_catPrice.max ?? null) === (p.max ?? null);
}
function openPriceSheet() {
  const b = priceBounds();
  const lo = document.getElementById('rangeMin');
  const hi = document.getElementById('rangeMax');
  const step = Math.max(50, Math.round((b.max - b.min) / 100 / 50) * 50) || 50;
  [lo, hi].forEach(el => { el.min = b.min; el.max = b.max; el.step = step; });
  lo.value = _catPrice.min !== null ? Math.max(b.min, _catPrice.min) : b.min;
  hi.value = _catPrice.max !== null ? Math.min(b.max, _catPrice.max) : b.max;
  document.getElementById('pricePresets').innerHTML = pricePresets(b).map((p, i) =>
    `<button class="price-preset ${_presetSelected(p) ? 'sel' : ''}" onclick='applyPreset(${JSON.stringify(p)})'>${p.label}</button>`).join('');
  _updatePriceUI();
  document.getElementById('priceSheet').classList.remove('hidden');
}
function _updatePriceUI() {
  const lo = document.getElementById('rangeMin');
  const hi = document.getElementById('rangeMax');
  let a = +lo.value, z = +hi.value;
  if (a > z) { [a, z] = [z, a]; }   // keep thumbs ordered visually
  document.getElementById('priceMinLabel').textContent = formatPrice(a);
  document.getElementById('priceMaxLabel').textContent = formatPrice(z);
  const min = +lo.min, max = +lo.max, span = (max - min) || 1;
  const fill = document.getElementById('rangeFill');
  fill.style.left = ((a - min) / span * 100) + '%';
  fill.style.right = (100 - (z - min) / span * 100) + '%';
}
function onPriceInput() { _updatePriceUI(); }
function applyPrice() {
  const lo = document.getElementById('rangeMin');
  const hi = document.getElementById('rangeMax');
  let a = +lo.value, z = +hi.value;
  if (a > z) [a, z] = [z, a];
  const b = priceBounds();
  _catPrice = { min: a <= b.min ? null : a, max: z >= b.max ? null : z };
  closePriceSheet();
  render();
}
function applyPreset(p) {
  _catPrice = { min: p.min, max: p.max };
  closePriceSheet();
  render();
}
function clearPrice() { _catPrice = { min: null, max: null }; closePriceSheet(); render(); }
function closePriceSheet() { document.getElementById('priceSheet').classList.add('hidden'); }

// === All products ===
function renderAllProducts() {
  const all = getProducts();
  const inStock = all.filter(p => getRealStock(p) > 0);
  const topCats = getChildren([]);
  const counts = {};
  topCats.forEach(c => counts[c] = inStock.filter(p => matchesPath(p, [c])).length);
  const topCatsWithStock = topCats.filter(c => (counts[c] || 0) > 0);

  const html = `<div class="fade-in space-y-4">
    <!-- Breadcrumb -->
    <div class="flex items-center gap-1.5 text-xs text-blue-400 mb-1 font-medium">
      <a href="#/" class="hover:text-blue-600 transition-colors">Inicio</a>
      <span class="text-blue-300">›</span>
      <span class="text-blue-700 font-bold">Catálogo Completo</span>
    </div>

<div class="catalog-heading">
      <div><h1>Todo para tu negocio.</h1><p>Explora, combina y arma tu próximo pedido por mayor.</p></div>
      <div class="catalog-heading-count"><strong>${inStock.length}</strong> productos</div>
    </div>

    <!-- Quick Category Chips Carousel -->
    ${topCatsWithStock.length > 0 ? `
    <div class="chip-row scrollbar-hide -mx-1 px-1">
      <a href="#/all" class="chip active">
        <span>✨ Todos</span>
        <span class="text-[10px] opacity-80">(${inStock.length})</span>
      </a>
      ${topCatsWithStock.map(cat => {
        const em = getCategoryEmoji(cat);
        const cleanName = stripEmoji(cat);
        const cnt = counts[cat] || 0;
        return `
        <a href="${categoryUrl([cat])}" class="chip">
          <span>${em} ${escapeHtml(cleanName)}</span>
          <span class="text-[10px] opacity-75">(${cnt})</span>
        </a>`;
      }).join('')}
    </div>` : ''}

    ${renderStoreBand()}
    ${productListSection(inStock)}
  </div>`;
  $('#app').innerHTML = html;
}

// === Favorites ===
function renderFavorites() {
  const all = getProducts();
  const favProducts = all.filter(p => {
    const id = getCatalogFavoriteId(p);
    return id && catalogFavoriteIds.has(String(id));
  });

  const html = `<div class="favorites-page">
    <nav class="favorites-breadcrumb" aria-label="Ruta de navegación">
      <a href="#/">Inicio</a><span aria-hidden="true">/</span><span aria-current="page">Favoritos</span>
    </nav>

    <section class="favorites-hero" aria-labelledby="favorites-title">
      <div class="favorites-hero-copy">
        <span class="favorites-eyebrow"><span aria-hidden="true">♥</span> Tu selección</span>
        <h1 id="favorites-title">Tus favoritos,<br>siempre a mano.</h1>
        <p>Guarda lo que te gusta y vuelve cuando estés listo para armar tu pedido.</p>
        <div class="favorites-count"><strong>${favProducts.length}</strong><span>${favProducts.length === 1 ? 'producto guardado' : 'productos guardados'}</span></div>
      </div>
      <div class="favorites-art" data-favorites-animation aria-hidden="true"></div>
    </section>

    ${favProducts.length === 0 ? `
      <section class="favorites-empty" aria-labelledby="favorites-empty-title">
        <div class="favorites-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M20.8 4.7a5.4 5.4 0 0 0-7.6 0L12 5.9l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6l1.2 1.2L12 21l7.6-7.5 1.2-1.2a5.4 5.4 0 0 0 0-7.6Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></div>
        <h2 id="favorites-empty-title">Tu selección empieza aquí</h2>
        <p>Toca el corazón de cualquier producto para guardarlo en este espacio.</p>
        <a href="#/all" class="favorites-explore">Explorar el catálogo <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      </section>
    ` : `
      <section class="favorites-products" aria-labelledby="favorites-products-title">
        <div class="favorites-section-heading"><div><h2 id="favorites-products-title">Tu selección</h2><p>Todo lo que guardaste en un solo lugar.</p></div><a href="#/all">Seguir explorando <span aria-hidden="true">→</span></a></div>
        ${renderStoreBand()}
        ${productListSection(favProducts)}
      </section>
    `}
  </div>`;
  $('#app').innerHTML = html;
}

// === Search ===
function renderSearch() {
  const q = searchQuery.toLowerCase().trim();
  const products = q
    ? getProducts().filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.subcategory || '').toLowerCase().includes(q))
    : getProducts();
  const html = `<div class="fade-in">
    <h1 class="font-display font-extrabold text-2xl text-blue-800 mb-1">Buscar</h1>
    <div class="text-blue-400 mb-4 text-sm">${q ? `Resultados para "${escapeHtml(q)}"` : 'Mostrando todo el catálogo'}</div>
    ${products.length === 0 ? `<div class="text-center text-blue-400 py-16">
      <svg class="w-12 h-12 mx-auto mb-3 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
      <p class="font-semibold">Sin resultados</p>
      <p class="text-sm text-blue-300 mt-1">Prueba con otra palabra</p>
    </div>` : productListSection(products)}
  </div>`;
  $('#app').innerHTML = html;
}

// === Product grid (con paginación progresiva para evitar descargar 320 imágenes de golpe) ===
var _catalogVisibleLimit = 24;
var _catalogLastHashKey = '';
function loadMoreCatalogProducts() {
  _catalogVisibleLimit += 24;
  render();
}
window.loadMoreCatalogProducts = loadMoreCatalogProducts;

function renderProductGrid(products, preSorted = false) {
  if (products.length === 0) {
    return '<div class="text-center text-blue-400 py-12">No hay productos</div>';
  }
  const currentHashKey = (typeof location !== 'undefined' ? location.hash : '') + '|' + (typeof searchQuery !== 'undefined' ? searchQuery : '');
  if (currentHashKey !== _catalogLastHashKey) {
    _catalogLastHashKey = currentHashKey;
    _catalogVisibleLimit = 24;
  }
  // Default ordering: cheapest with image first, then without image.
  // When preSorted is true, the caller already applied an explicit sort.
  const sorted = preSorted ? products : [...products].sort((a, b) => {
    const priceA = getPrice(a);
    const priceB = getPrice(b);
    const aHasImg = !!(a.image && a.image.trim());
    const bHasImg = !!(b.image && b.image.trim());
    if (aHasImg !== bHasImg) return bHasImg ? 1 : -1;
    return priceA - priceB;
  });
  const visibleSlice = sorted.slice(0, _catalogVisibleLimit);
  const remainingCount = Math.max(0, sorted.length - visibleSlice.length);
  return `<div class="catalog-grid">
    ${visibleSlice.map(p => renderCatalogCard(p)).join('')}
  </div>
  ${remainingCount > 0 ? `<div class="catalog-load-more">
    <p>Viendo ${visibleSlice.length} de ${sorted.length} productos</p>
    <button type="button" onclick="loadMoreCatalogProducts()">Ver ${Math.min(24, remainingCount)} productos más <span aria-hidden="true">↓</span></button>
  </div>` : ''}`;

}

// === Admin ===
function renderAdminProductList() {
  const customs = _customProducts;
  const overrides = getOverrides();
  const deleted = getDeleted();
  const editFilter = (window._adminFilter || '').toLowerCase().trim();
  let allList = getProducts();
  const filtered = editFilter
    ? allList.filter(p =>
        (p.name||'').toLowerCase().includes(editFilter) ||
        (p.sku||'').toLowerCase().includes(editFilter) ||
        (p.category||'').toLowerCase().includes(editFilter))
    : allList;
  // Sort: custom products first (newest by createdAt), then no image, then by name
  filtered.sort((a, b) => {
    const aCustom = _customProducts.find(c => c.sku === a.sku);
    const bCustom = _customProducts.find(c => c.sku === b.sku);
    if (aCustom && bCustom) return (Number(bCustom.createdAt) || 0) - (Number(aCustom.createdAt) || 0);
    if (aCustom !== bCustom) return aCustom ? -1 : 1;
    const aHasImg = !!(a.image && a.image.trim());
    const bHasImg = !!(b.image && b.image.trim());
    if (aHasImg !== bHasImg) return aHasImg ? 1 : -1;
    return (a.name||'').localeCompare(b.name||'', 'es');
  });
  const visible = filtered;
  
  const listEl = $('#adminProductList');
  const countEl = $('#adminProductCount');
  if (listEl && countEl) {
    countEl.textContent = `Productos (${filtered.length})`;
    listEl.innerHTML = visible.map(p => {
      const isCustom = customs.find(c => c.sku === p.sku);
      const isEdited = !!overrides[p.sku];
      return `<div class="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-white rounded-2xl p-2 border border-blue-100">
        <div class="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">${imgEl(p.image, p.name)}</div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-blue-700 text-sm truncate">${escapeHtml(p.name)}</div>
          <div class="text-[11px] text-blue-400 truncate">SKU: ${escapeHtml(p.sku)} · ${formatPrice(p.priceA)}</div>
          <div class="flex gap-1 mt-0.5 flex-wrap">
            ${isCustom ? '<span class="text-[10px] bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded font-bold">NUEVO</span>' : ''}
            ${isEdited ? '<span class="text-[10px] bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded font-bold">EDITADO</span>' : ''}
            ${!p.image ? '<span class="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-bold">SIN FOTO</span>' : ''}
          </div>
        </div>
        <div class="flex flex-col gap-1 flex-shrink-0">
          <a href="#/admin/edit/${encodeURIComponent(p.sku)}" class="bg-blue-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold active:scale-95 text-center">Editar</a>
          <button onclick="quickDeleteProduct('${escapeHtml(p.sku)}')" class="bg-red-50 text-red-500 px-3 py-1.5 rounded-full text-xs font-semibold active:scale-95 border border-red-200">🗑️</button>
        </div>
      </div>`;
    }).join('');
    
  }
}

// === Category Admin Logic ===
window.saveCustomCat = async function(pathStr) {
  const inputId = 'cat_img_' + btoa(pathStr).replace(/=/g, '');
  const input = document.getElementById(inputId);
  if (!input) return;
  const cats = getCustomCategories();
  cats[pathStr] = cats[pathStr] || {};
  cats[pathStr].image = input.value;
  cats[pathStr].path = pathStr.split('/');
  cats[pathStr].name = pathStr.split('/').pop();
  await saveCustomCategories(cats);
  showToast('Categoría guardada');
  renderAdmin();
};
window.deleteCustomCat = async function(pathStr) {
  const productsInCat = getProducts().filter(p => matchesPath(p, pathStr.split('/')));
  
  if (productsInCat.length > 0) {
    if (!confirm(`⚠️ ¡ATENCIÓN! Esta categoría contiene ${productsInCat.length} producto(s).\r\n\r\nSi eliminas la categoría, TAMBIÉN SE ELIMINARÁN ESTOS PRODUCTOS.\r\n\r\n¿Estás absolutamente seguro de querer borrar la categoría y todos sus productos?`)) return;
    
    const deleted = new Set(getDeleted());
    productsInCat.forEach(p => deleted.add(p.sku));
    await setDeleted(Array.from(deleted));
  } else {
    if (!confirm('¿Eliminar esta categoría?')) return;
  }
  
  const cats = { ...getCustomCategories() };
  cats[pathStr] = '__DELETED__';
  await saveCustomCategories(cats);
  
  showToast('Categoría eliminada');
  renderAdmin();
};
window.addNewCustomCat = async function() {
  const inputPath = document.getElementById('new_cat_path').value.trim();
  const inputImg = document.getElementById('new_cat_img').value.trim();
  if (!inputPath) return showToast('Escribe un nombre de categoría');
  const pathStr = inputPath.replace(/\\/g, '/'); // normalize
  const cats = getCustomCategories();
  cats[pathStr] = cats[pathStr] || {};
  if (inputImg) cats[pathStr].image = inputImg;
  cats[pathStr].path = pathStr.split('/');
  cats[pathStr].name = pathStr.split('/').pop();
  await saveCustomCategories(cats);
  showToast('Categoría creada');
  renderAdmin();
};

function renderAdmin(rest) {
  const authed = sessionStorage.getItem(STORAGE_KEYS.adminAuth) === '1';
  if (!authed) {
    $('#app').innerHTML = `<div class="fade-in max-w-sm mx-auto mt-8 bg-white rounded-3xl p-6 card-shadow text-center">
      <div class="w-16 h-16 rounded-full bg-rose-100 mx-auto flex items-center justify-center mb-3">
        <svg class="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>
      </div>
      <h2 class="font-bold text-xl text-rose-600 mb-1">Panel Admin</h2>
      <input id="apwd" type="password" placeholder="Contraseña" class="w-full px-4 py-3 border-2 border-rose-100 rounded-full focus:border-rose-300 focus:outline-none text-center font-semibold mt-3">
      <button onclick="checkAdmin()" class="mt-3 w-full btn-primary text-white font-bold py-3 rounded-full active:scale-95">Ingresar</button>
      <a href="#/" class="block mt-3 text-rose-400 text-sm">Volver</a>
    </div>`;
    setTimeout(() => {
      const inp = $('#apwd');
      if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkAdmin(); });
    }, 50);
    return;
  }
  // Sub-route: editor for a specific SKU
  if (rest && rest[0] === 'edit' && rest[1]) {
    return renderAdminEdit(decodeURIComponent(rest[1]));
  }

  const customs = _customProducts;
  const overrides = getOverrides();
  const deleted = getDeleted();
  const orders = getOrders();
  const editFilter = (window._adminFilter || '').toLowerCase().trim();
  if (window._adminTab === undefined) window._adminTab = 'products';
  let allList = getProducts();
  const filtered = editFilter
    ? allList.filter(p =>
        (p.name||'').toLowerCase().includes(editFilter) ||
        (p.sku||'').toLowerCase().includes(editFilter) ||
        (p.category||'').toLowerCase().includes(editFilter))
    : allList;
  // Sort: custom products first (newest by createdAt), then no image, then by name
  filtered.sort((a, b) => {
    const aCustom = _customProducts.find(c => c.sku === a.sku);
    const bCustom = _customProducts.find(c => c.sku === b.sku);
    if (aCustom && bCustom) return (Number(bCustom.createdAt) || 0) - (Number(aCustom.createdAt) || 0);
    if (aCustom !== bCustom) return aCustom ? -1 : 1;
    const aHasImg = !!(a.image && a.image.trim());
    const bHasImg = !!(b.image && b.image.trim());
    if (aHasImg !== bHasImg) return aHasImg ? 1 : -1;
    return (a.name||'').localeCompare(b.name||'', 'es');
  });
  const visible = filtered;
  const pendingOrders = orders.filter(o => !o.paid).length;
  const tab = window._adminTab;

  const revenue = orders.filter(o => o.paid).reduce((s, o) => s + (o.total || 0), 0);
  const lowStockCount = allList.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= 5).length;
  const noImgCount = allList.filter(p => !(p.image && p.image.trim())).length;
  const adminTabs = [
    { id: 'products',   label: 'Productos', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { id: 'categories', label: 'Categorías', icon: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z' },
    { id: 'orders',     label: 'Pedidos', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z', badge: pendingOrders },
    { id: 'settings',   label: 'Ajustes', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
  ];

  let html = `<div class="fade-in space-y-4 pb-8">
    <!-- Premium admin header -->
    <div class="relative overflow-hidden rounded-[26px] p-5 text-white shadow-lg"
         style="background: linear-gradient(135deg,#5a96d8 0%,#7eb1e6 50%,#9fc7f0 100%);">
      <div class="absolute -top-12 -right-10 w-44 h-44 rounded-full" style="background:radial-gradient(circle,rgba(255,232,128,.4),transparent 60%);"></div>
      <div class="absolute -bottom-16 -left-8 w-40 h-40 rounded-full" style="background:radial-gradient(circle,rgba(255,255,255,.3),transparent 65%);"></div>
      <div class="relative flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center border-2 border-white/40 overflow-hidden">
            ${_settings.logoUrl ? `<img src="${escapeHtml(_settings.logoUrl)}" class="w-full h-full object-cover">` : `<span class="font-display font-extrabold text-lg">${escapeHtml((MAIN_STORE_NAME || 'DB').slice(0, 2).toUpperCase())}</span>`}
          </div>
          <div>
            <div class="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] uppercase text-yellow-300"><span class="w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse"></span>Panel de control</div>
            <h1 class="font-display font-extrabold text-xl leading-tight">${escapeHtml(MAIN_STORE_NAME)}</h1>
          </div>
        </div>
        <button onclick="adminLogout()" class="bg-white/15 hover:bg-white/25 px-3.5 py-2 rounded-full text-xs font-bold backdrop-blur border border-white/20 active:scale-95 flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          Salir
        </button>
      </div>
      <div class="relative grid grid-cols-4 gap-2 mt-5">
        ${[
          { n: allList.length, l: 'Productos' },
          { n: Object.keys(overrides).length, l: 'Editados' },
          { n: orders.length, l: 'Pedidos' },
          { n: formatPrice(revenue).replace('$',''), l: 'Vendido $', small: true }
        ].map(s => `<div class="bg-white/12 rounded-2xl p-2.5 backdrop-blur border border-white/15 text-center">
          <div class="font-display font-extrabold ${s.small ? 'text-sm' : 'text-xl'} leading-none">${s.n}</div>
          <div class="text-[9px] opacity-75 font-bold uppercase tracking-wide mt-1">${s.l}</div>
        </div>`).join('')}
      </div>
      ${(pendingOrders > 0 || lowStockCount > 0 || noImgCount > 0) ? `
      <div class="relative flex flex-wrap gap-1.5 mt-3">
        ${pendingOrders > 0 ? `<button onclick="window._adminTab='orders'; renderAdmin()" class="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-300 text-amber-900 active:scale-95">⏳ ${pendingOrders} pedido${pendingOrders>1?'s':''} pendiente${pendingOrders>1?'s':''}</button>` : ''}
        ${lowStockCount > 0 ? `<span class="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15 border border-white/20">📉 ${lowStockCount} bajo stock</span>` : ''}
        ${noImgCount > 0 ? `<span class="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15 border border-white/20">🖼️ ${noImgCount} sin foto</span>` : ''}
      </div>` : ''}
    </div>

    <!-- Tab bar (segmented) -->
    <div class="grid grid-cols-4 gap-1.5 bg-white/90 backdrop-blur rounded-2xl p-1.5 card-shadow sticky z-30" style="top: var(--hdr-h, 110px);">
      ${adminTabs.map(t => `
        <button onclick="window._adminTab='${t.id}'; renderAdmin()" class="relative flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-bold transition ${tab===t.id?'bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow':'text-blue-400 hover:bg-blue-50'}">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" d="${t.icon}"/></svg>
          ${t.label}
          ${t.badge > 0 ? `<span class="absolute top-0.5 right-1 bg-amber-400 text-amber-900 text-[9px] rounded-full min-w-4 h-4 px-1 inline-flex items-center justify-center font-extrabold">${t.badge}</span>` : ''}
        </button>`).join('')}
    </div>

    ${tab === 'products' ? `
    <details class="bg-white rounded-3xl p-5 card-shadow">
      <summary class="font-bold text-lg cursor-pointer text-blue-600 flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        Agregar producto nuevo
      </summary>
      <div class="space-y-4 mt-4 bg-gray-50/50 p-4 rounded-3xl border border-blue-50">
        <div>
          <h4 class="font-bold text-xs text-blue-800 mb-2 ml-1 uppercase tracking-wider">1. Info Básica</h4>
          <div class="space-y-2">
            <input id="f_sku" placeholder="SKU *" class="w-full px-4 py-3 border-2 border-blue-100 rounded-2xl focus:border-blue-300 focus:outline-none bg-white shadow-sm">
            <input id="f_name" placeholder="Nombre del producto *" class="w-full px-4 py-3 border-2 border-blue-100 rounded-2xl focus:border-blue-300 focus:outline-none bg-white shadow-sm">
          </div>
        </div>
        <div>
          <h4 class="font-bold text-xs text-blue-800 mb-2 ml-1 mt-4 uppercase tracking-wider">2. Precio y Stock</h4>
          <div class="grid grid-cols-2 gap-2">
            <input id="f_priceA" type="number" placeholder="Precio *" class="w-full px-4 py-3 border-2 border-blue-100 rounded-2xl focus:border-blue-300 focus:outline-none bg-white shadow-sm">
            <input id="f_stock" type="number" placeholder="Stock" class="w-full px-4 py-3 border-2 border-blue-100 rounded-2xl focus:border-blue-300 focus:outline-none bg-white shadow-sm">
          </div>
        </div>
        <div>
          <h4 class="font-bold text-xs text-blue-800 mb-2 ml-1 mt-4 uppercase tracking-wider">3. Fotos del Producto</h4>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <div class="img-upload-box" id="f_img1_box" onclick="document.getElementById('f_img1_file').click()">
                <div class="upload-placeholder">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <span>Foto 1<br>(principal)</span>
                </div>
              </div>
              <input type="file" id="f_img1_file" accept="image/*" class="hidden" onchange="uploadImageBox(event, 'f_image', 'f_img1_box', 'f_img1_remove')">
              <input type="hidden" id="f_image">
              <button type="button" id="f_img1_remove" class="hidden mt-1 w-full text-[10px] font-bold text-rose-500 py-1" onclick="clearImgBox('f_image','f_img1_box','f_img1_remove','f_img1_file')">Quitar foto</button>
            </div>
            <div>
              <div class="img-upload-box" id="f_img2_box" onclick="document.getElementById('f_img2_file').click()">
                <div class="upload-placeholder">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <span>Foto 2<br>(opcional)</span>
                </div>
              </div>
              <input type="file" id="f_img2_file" accept="image/*" class="hidden" onchange="uploadImageBox(event, 'f_image2', 'f_img2_box', 'f_img2_remove')">
              <input type="hidden" id="f_image2">
              <button type="button" id="f_img2_remove" class="hidden mt-1 w-full text-[10px] font-bold text-rose-500 py-1" onclick="clearImgBox('f_image2','f_img2_box','f_img2_remove','f_img2_file')">Quitar foto</button>
            </div>
          </div>
        </div>
        <div>
          <h4 class="font-bold text-xs text-blue-800 mb-2 ml-1 mt-4 uppercase tracking-wider">4. Categorización</h4>
          <div class="space-y-3">
            <div class="space-y-2">
              <select id="f_category" class="w-full px-4 py-3 border-2 border-blue-100 rounded-2xl focus:border-blue-300 focus:outline-none bg-white shadow-sm font-semibold text-blue-900" onchange="handleCategoryChange()">
                <option value="">Seleccionar categoría *</option>
                ${getKnownCategories().map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
                <option value="Nueva categoría...">+ Nueva categoría...</option>
              </select>
              <div id="f_new_category_wrapper" class="hidden p-3 bg-blue-100/50 border border-blue-200 rounded-2xl space-y-2 shadow-inner">
                <input id="f_new_category" placeholder="Nombre de la nueva categoría *" class="w-full px-4 py-3 text-sm border-2 border-white rounded-xl focus:border-blue-400 focus:outline-none bg-white shadow-sm">
                <div class="relative">
                  <input id="f_new_category_img" placeholder="URL foto de categoría" class="w-full px-4 py-3 text-xs border-2 border-white rounded-xl focus:border-blue-400 focus:outline-none bg-white shadow-sm pr-24">
                  <label class="absolute right-1 top-1 bottom-1 bg-blue-200 hover:bg-blue-300 text-blue-800 px-3 rounded-lg flex items-center justify-center cursor-pointer text-[10px] font-bold uppercase tracking-wider transition-colors">
                    Subir <input type="file" accept="image/*" onchange="uploadImage(event, 'f_new_category_img')" class="hidden">
                  </label>
                </div>
              </div>
            </div>
            
            <div class="space-y-2">
              <select id="f_subcategory" class="w-full px-4 py-3 border-2 border-blue-100 rounded-2xl focus:border-blue-300 focus:outline-none bg-white shadow-sm text-sm" onchange="handleSubcategoryChange()">
                <option value="">Subcategoría (opcional)</option>
              </select>
              <div id="f_new_subcategory_wrapper" class="hidden p-3 bg-blue-100/50 border border-blue-200 rounded-2xl space-y-2 shadow-inner">
                <input id="f_new_subcategory" placeholder="Nombre de la nueva subcategoría *" class="w-full px-4 py-3 text-sm border-2 border-white rounded-xl focus:border-blue-400 focus:outline-none bg-white shadow-sm">
                <div class="relative">
                  <input id="f_new_subcategory_img" placeholder="URL foto de subcategoría" class="w-full px-4 py-3 text-xs border-2 border-white rounded-xl focus:border-blue-400 focus:outline-none bg-white shadow-sm pr-24">
                  <label class="absolute right-1 top-1 bottom-1 bg-blue-200 hover:bg-blue-300 text-blue-800 px-3 rounded-lg flex items-center justify-center cursor-pointer text-[10px] font-bold uppercase tracking-wider transition-colors">
                    Subir <input type="file" accept="image/*" onchange="uploadImage(event, 'f_new_subcategory_img')" class="hidden">
                  </label>
                </div>
              </div>
            </div>
            
            <input id="f_subsubcategory" placeholder="Tercer nivel / Sub-subcategoría (opcional)" class="w-full px-4 py-3 border-2 border-blue-100 rounded-2xl focus:border-blue-300 focus:outline-none bg-white shadow-sm text-sm">
          </div>
        </div>
        <button onclick="addCustomProduct()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all mt-6 text-base">Guardar Producto</button>
      </div>
    </details>

    <div class="bg-white rounded-3xl p-5 card-shadow">
      <h2 id="adminProductCount" class="font-bold text-lg mb-3 text-blue-600">Productos (${filtered.length})</h2>
      <input id="adminSearchInput" value="${escapeHtml(editFilter)}" oninput="window._adminFilter = this.value; renderAdminProductList()" placeholder="Buscar por SKU, nombre o categoría..." class="w-full px-4 py-3 border-2 border-blue-100 rounded-2xl focus:border-blue-300 focus:outline-none mb-3">
      <div id="adminProductList" class="space-y-2">
        ${visible.map(p => {
          const isCustom = customs.find(c => c.sku === p.sku);
          const isEdited = !!overrides[p.sku];
          return `<div class="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-white rounded-2xl p-2 border border-blue-100">
            <div class="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">${imgEl(p.image, p.name)}</div>
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-blue-700 text-sm truncate">${escapeHtml(p.name)}</div>
              <div class="text-[11px] text-blue-400 truncate">SKU: ${escapeHtml(p.sku)} · ${formatPrice(p.priceA)}</div>
              <div class="flex gap-1 mt-0.5 flex-wrap">
                ${isCustom ? '<span class="text-[10px] bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded font-bold">NUEVO</span>' : ''}
                ${isEdited ? '<span class="text-[10px] bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded font-bold">EDITADO</span>' : ''}
                ${!p.image ? '<span class="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-bold">SIN FOTO</span>' : ''}
              </div>
            </div>
            <div class="flex flex-col gap-1 flex-shrink-0">
              <a href="#/admin/edit/${encodeURIComponent(p.sku)}" class="bg-blue-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold active:scale-95 text-center">Editar</a>
              <button onclick="quickDeleteProduct('${escapeHtml(p.sku)}')" class="bg-red-50 text-red-500 px-3 py-1.5 rounded-full text-xs font-semibold active:scale-95 border border-red-200">🗑️</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
    ` : ''}

    ${tab === 'orders' ? `
    <div class="bg-white rounded-3xl p-5 card-shadow">
      <h2 class="font-bold text-lg mb-3 text-blue-600">Pedidos (${orders.length})</h2>
      ${orders.length === 0 ? '<div class="text-center text-blue-400 py-8">No hay pedidos registrados aún</div>' : `
      <div class="space-y-3">
        ${orders.map(o => {
          const d = new Date(o.date);
          const dateStr = d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          return `<div class="rounded-2xl border-2 ${o.paid?'border-green-200 bg-green-50':'border-amber-200 bg-amber-50'} p-3">
            <div class="flex items-center justify-between mb-2">
              <div>
                <div class="font-bold text-sm ${o.paid?'text-green-700':'text-amber-700'}">${o.paid?'✓ PAGADO':'⏳ PENDIENTE'}</div>
                <div class="text-[11px] text-blue-400">${dateStr} · ${o.id}</div>
              </div>
              <div class="text-right">
                <div class="font-bold text-blue-700 text-lg">${formatPrice(o.total)}</div>
                <div class="text-[11px] text-blue-400">${o.items.reduce((a,i)=>a+i.qty,0)} items</div>
              </div>
            </div>
            <details class="mt-1">
              <summary class="text-xs text-blue-500 cursor-pointer font-semibold">Ver productos</summary>
              <div class="mt-2 space-y-1 text-xs text-blue-700">
                ${o.items.map(i => {
                  const p = getProducts().find(prod => prod.sku === i.sku);
                  const img = p && p.image ? `<img src="${escapeHtml(p.image)}" onclick="openLightbox('${escapeHtml(p.image)}')" class="w-10 h-10 object-cover rounded-md flex-shrink-0 border border-blue-100 cursor-pointer hover:scale-110 transition-transform card-shadow">` : `<div class="w-10 h-10 bg-blue-50 rounded-md flex-shrink-0 border border-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-300">?</div>`;
                  return `<div class="flex items-center gap-3 py-2 border-b border-blue-50/50 last:border-0 hover:bg-blue-50/30 rounded-lg px-2 transition-colors"><div class="flex-shrink-0">${img}</div><div class="flex-1 truncate"><div class="font-bold text-blue-800 text-xs truncate">${escapeHtml(i.name)}</div><div class="text-[10px] text-blue-400 font-semibold mt-0.5">Cant: <span class="text-blue-600">${i.qty}</span></div></div><div class="font-bold text-sm flex-shrink-0 text-blue-800">${formatPrice(i.price*i.qty)}</div></div>`;
                }).join('')}
              </div>
            </details>
            <div class="flex gap-2 mt-3">
              ${o.paid 
                ? `<button onclick="unmarkOrderPaid('${o.id}')" class="flex-1 bg-white border-2 border-green-300 text-green-700 font-semibold py-2 rounded-full text-xs active:scale-95">Desmarcar pagado</button>`
                : `<button onclick="markOrderPaid('${o.id}')" class="flex-1 bg-green-500 text-white font-semibold py-2 rounded-full text-xs active:scale-95">✓ Marcar pagado</button>`
              }
              <button onclick="deleteOrder('${o.id}')" class="bg-red-50 border border-red-200 text-red-500 font-semibold px-3 py-2 rounded-full text-xs active:scale-95">🗑️</button>
            </div>
          </div>`;
        }).join('')}
      </div>`}
    </div>
    ` : ''}

    ${tab === 'categories' ? (() => {
      const allCategoryPaths = new Set();
      const customObj = getCustomCategories();
      allList.forEach(p => {
        const pPath = getProductPath(p);
        let curr = '';
        pPath.forEach(part => {
          curr = curr ? curr + '/' + part : part;
          if (customObj[curr] !== '__DELETED__') {
            allCategoryPaths.add(curr);
          }
        });
      });
      Object.keys(customObj).forEach(pathStr => {
        if (customObj[pathStr] !== '__DELETED__') {
          allCategoryPaths.add(pathStr);
        }
      });
      const sortedCats = [...allCategoryPaths].sort();
      
      return `
      <div class="bg-white rounded-3xl p-5 card-shadow">
        <h2 class="font-bold text-lg mb-4 text-blue-600">Crear o Editar Categorías</h2>
        
        <div class="bg-blue-50 p-4 rounded-2xl mb-6">
          <h3 class="font-semibold text-sm text-blue-800 mb-2">Añadir Nueva Categoría/Subcategoría</h3>
          <p class="text-[10px] text-blue-500 mb-3">Usa barras "/" para crear subcategorías (Ej: Ropa/Mujer/Verano)</p>
          <input id="new_cat_path" placeholder="Nombre (Ej: Zapatillas)" class="w-full px-3 py-2 text-sm border border-blue-200 rounded-xl mb-2 focus:outline-none focus:border-blue-400">
          <label class="block text-xs text-blue-500 mb-1">Imagen (URL o subir archivo):</label>
          <input id="new_cat_img" placeholder="https://..." class="w-full px-3 py-2 text-sm border border-blue-200 rounded-xl mb-2 focus:outline-none focus:border-blue-400">
          <label class="block mb-2">
            <span class="block w-full bg-white text-blue-500 border border-blue-200 font-semibold py-1.5 rounded-xl text-center cursor-pointer text-xs active:bg-blue-100">📷 Subir desde dispositivo</span>
            <input type="file" accept="image/*" onchange="uploadImage(event, 'new_cat_img')" class="hidden">
          </label>
          <button onclick="addNewCustomCat()" class="w-full bg-blue-500 text-white font-bold py-2 rounded-xl text-sm active:scale-95">Guardar Nueva Categoría</button>
        </div>

        <h3 class="font-bold text-sm text-blue-600 mb-3">Categorías Existentes (${sortedCats.length})</h3>
        <div class="space-y-4">
          ${sortedCats.map(pathStr => {
            const pathArr = pathStr.split('/');
            const name = pathArr[pathArr.length - 1];
            const iconUrl = getCategoryIcon(name, pathArr);
            const isCustom = !!_customCategories[pathStr];
            const inputId = 'cat_img_' + btoa(pathStr).replace(/=/g, '');
            const level = pathArr.length - 1;
            const paddingLeft = level * 1.5;
            
            const isRoot = level === 0;
            const titleColor = isRoot ? 'text-blue-900 text-base' : 'text-gray-600 text-sm';
            const bgColor = isRoot ? 'bg-white shadow-sm border border-blue-100 rounded-2xl' : 'bg-gray-50 border-l-4 border-blue-400 rounded-r-2xl rounded-l-md';
            const prefixArrow = isRoot ? '' : '<span class="text-blue-400 font-bold mr-1">↳</span>';
            const pClass = isRoot ? 'p-4 mb-5' : 'p-3 mb-3 relative';
            const connector = !isRoot ? `<div class="absolute -left-[1.5rem] top-6 w-6 h-px bg-blue-200"></div>` : '';
            
            return `
            <div class="${bgColor} ${pClass}" style="margin-left: ${paddingLeft}rem">
              ${connector}
              <div class="flex items-center gap-3 mb-3 relative z-10">
                <div class="${isRoot ? 'w-12 h-12' : 'w-10 h-10'} rounded-xl overflow-hidden bg-blue-50 flex-shrink-0 relative shadow-inner border border-blue-100/50">
                  ${iconUrl ? `<img src="${escapeHtml(iconUrl)}" class="w-full h-full object-cover">` : `<span class="absolute inset-0 flex items-center justify-center text-blue-300 text-xs font-bold">${name[0]}</span>`}
                </div>
                <div class="flex-1">
                  <div class="font-bold ${titleColor}">${prefixArrow}${escapeHtml(name)}</div>
                  <div class="text-[10px] text-blue-400 opacity-80">${escapeHtml(pathStr)} ${isCustom ? '<span class="text-yellow-600 font-bold bg-yellow-100 px-1.5 rounded ml-1 border border-yellow-200">Personalizada</span>' : ''}</div>
                </div>
              </div>
              <div class="flex flex-col sm:flex-row gap-2 relative z-10">
                <div class="flex-1 relative">
                  <input id="${inputId}" value="${isCustom && _customCategories[pathStr].image ? escapeHtml(_customCategories[pathStr].image) : ''}" placeholder="URL de la imagen o subir..." class="w-full px-3 py-2 text-xs border border-blue-200 rounded-xl focus:outline-none focus:border-blue-400 bg-white">
                  <label class="absolute right-1 top-1 bottom-1 bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-600 px-3 rounded-lg flex items-center justify-center cursor-pointer text-[10px] font-bold uppercase tracking-wider transition-colors">
                    Subir <input type="file" accept="image/*" onchange="uploadImage(event, '${inputId}')" class="hidden">
                  </label>
                </div>
                <button onclick="saveCustomCat('${escapeHtml(pathStr)}')" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold active:scale-95 whitespace-nowrap shadow-sm hover:bg-blue-700 transition-colors">Guardar</button>
                <button onclick="deleteCustomCat('${escapeHtml(pathStr)}')" class="bg-red-50 text-red-500 border border-red-200 px-4 py-2 rounded-xl text-xs font-bold active:scale-95 whitespace-nowrap hover:bg-red-100 transition-colors">🗑️ Borrar</button>
              </div>
            </div>
            `;
          }).join('')}
        </div>
      </div>`;
    })() : ''}

    ${tab === 'settings' ? `
    <!-- Logo de la tienda -->
    <div class="bg-white rounded-3xl p-5 card-shadow">
      <div class="section-title mb-1 !text-base">Logo de la tienda</div>
      <p class="text-xs text-blue-400 mb-4">Sube un PNG con fondo transparente. Aparecerá en el banner principal y en este panel.</p>
      <div class="flex items-center gap-4">
        <div id="logoPreview" class="w-24 h-24 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border-2 border-dashed border-blue-200"
             style="background:linear-gradient(135deg,#5a96d8,#7eb1e6);">
          ${_settings.logoUrl
            ? `<img src="${escapeHtml(_settings.logoUrl)}" class="w-full h-full object-cover">`
            : `<span class="text-white/60 text-[11px] font-bold text-center px-2">Sin logo</span>`}
        </div>
        <div class="flex-1 space-y-2">
          <input id="admin_logo_url" value="${escapeHtml(_settings.logoUrl || '')}" oninput="updateLogoPreview()" placeholder="URL del logo o subir..." class="w-full px-3 py-2.5 text-sm border-2 border-blue-100 rounded-xl focus:border-blue-300 focus:outline-none">
          <label class="block">
            <span class="block w-full btn-primary text-white font-bold py-2.5 rounded-xl text-center cursor-pointer text-sm active:scale-95">📷 Subir PNG</span>
            <input type="file" accept="image/png,image/*" onchange="uploadLogo(event)" class="hidden">
          </label>
          <div class="flex gap-2">
            <button onclick="saveLogo()" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm active:scale-95">Guardar logo</button>
            <button onclick="removeLogo()" class="bg-red-50 text-red-500 border border-red-200 font-bold px-4 py-2.5 rounded-xl text-sm active:scale-95">Quitar</button>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-3xl p-5 card-shadow space-y-4">
      <div class="section-title !text-base">Configuración global</div>
      <div>
        <label class="block text-xs font-bold text-blue-500 mb-1 uppercase tracking-wide">Compra mínima ($)</label>
        <div class="flex gap-2">
          <input type="number" id="admin_min_purchase" value="${getMinPurchase()}" class="flex-1 px-4 py-2.5 border-2 border-blue-100 rounded-xl focus:border-blue-300 focus:outline-none font-semibold">
          <button onclick="updateMinPurchase()" class="btn-primary text-white font-bold px-5 py-2.5 rounded-xl active:scale-95">Guardar</button>
        </div>
      </div>
    </div>

    ${deleted.length > 0 ? `<div class="bg-white rounded-3xl p-5 card-shadow">
      <div class="section-title mb-3 !text-base">Eliminados (${deleted.length})</div>
      <button onclick="restoreAllDeleted()" class="w-full bg-blue-100 text-blue-600 font-bold py-2.5 rounded-xl active:scale-95">Restaurar todos</button>
    </div>` : ''}

    <div class="bg-white rounded-3xl p-5 card-shadow">
      <div class="section-title mb-3 !text-base">Datos y respaldo</div>
      <button onclick="migrateLocalToFirebase()" class="w-full bg-yellow-100 text-yellow-700 font-bold py-3 rounded-xl active:scale-95 mb-3 border border-yellow-300">⚠️ Rescatar datos locales a la nube</button>
      <div class="grid grid-cols-2 gap-2">
        <button onclick="exportAdminData()" class="bg-blue-100 text-blue-600 font-bold py-3 rounded-xl active:scale-95">📥 Exportar JSON</button>
        <button onclick="exportCatalogExcel()" class="bg-green-100 text-green-700 font-bold py-3 rounded-xl active:scale-95">📊 Exportar Excel</button>
      </div>
      <label class="block mt-2">
        <span class="block w-full bg-blue-100 text-blue-600 font-bold py-3 rounded-xl active:scale-95 text-center cursor-pointer">📤 Importar</span>
        <input type="file" accept=".json" onchange="importAdminData(event)" class="hidden">
      </label>
      <div class="text-xs text-blue-400 mt-2">Exporta tus cambios para respaldarlos o moverlos a otro dispositivo.</div>
    </div>
    ` : ''}
  </div>`;
  $('#app').innerHTML = html;
  // Initial render of product list
  renderAdminProductList();
}

// Edit individual product
function renderAdminEdit(sku) {
  const p = getProducts().find(x => x.sku === sku);
  if (!p) {
    $('#app').innerHTML = '<div class="text-center text-rose-400 py-12">Producto no encontrado <a href="#/admin" class="text-rose-600 underline">Volver</a></div>';
    return;
  }
  const isCustom = !!_customProducts.find(c => c.sku === sku);
  const cats = getKnownCategories();

  $('#app').innerHTML = `<div class="fade-in space-y-4 max-w-md mx-auto pb-12">
    <a href="#/admin" class="text-rose-500 text-sm font-semibold inline-flex items-center gap-1">← Volver al panel</a>
    <h1 class="font-bold text-2xl text-rose-700">Editar producto</h1>

    <div class="bg-white rounded-3xl p-5 card-shadow space-y-4 border border-rose-50">
      <div class="flex justify-center mb-6">
        <div id="prevImg" class="w-32 h-32 rounded-3xl overflow-hidden shadow-md border-4 border-rose-50">${imgEl(p.image, p.name)}</div>
      </div>

      <div class="bg-rose-50/50 p-4 rounded-3xl border border-rose-100/50 space-y-4">
        <div>
          <h4 class="font-bold text-xs text-rose-800 mb-2 ml-1 uppercase tracking-wider">1. Info Básica</h4>
          <div class="space-y-2">
            <input id="e_sku" value="${escapeHtml(p.sku)}" disabled class="w-full px-4 py-3 border-2 border-rose-100 rounded-2xl bg-rose-50/80 text-rose-400 font-mono shadow-sm cursor-not-allowed">
            <input id="e_name" value="${escapeHtml(p.name)}" placeholder="Nombre del producto *" class="w-full px-4 py-3 border-2 border-rose-100 rounded-2xl focus:border-rose-400 focus:outline-none bg-white shadow-sm">
          </div>
        </div>
        
        <div>
          <h4 class="font-bold text-xs text-rose-800 mb-2 ml-1 mt-4 uppercase tracking-wider">2. Precio y Stock</h4>
          <div class="grid grid-cols-2 gap-2">
            <input id="e_priceA" type="number" value="${p.priceA||0}" placeholder="Precio *" class="w-full px-4 py-3 border-2 border-rose-100 rounded-2xl focus:border-rose-400 focus:outline-none bg-white shadow-sm">
            <input id="e_stock" type="number" value="${p.stock||0}" placeholder="Stock" class="w-full px-4 py-3 border-2 border-rose-100 rounded-2xl focus:border-rose-400 focus:outline-none bg-white shadow-sm">
          </div>
        </div>
        
        <div>
          <h4 class="font-bold text-xs text-rose-800 mb-2 ml-1 mt-4 uppercase tracking-wider">3. Fotos del Producto</h4>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <div class="img-upload-box ${p.image ? 'has-img' : ''}" id="e_img1_box" onclick="document.getElementById('e_img1_file').click()">
                ${p.image ? `<img src="${escapeHtml(p.image)}" alt="Foto 1"><div class="img-label">Foto 1 (principal)</div>` : `<div class="upload-placeholder"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg><span>Foto 1<br>(principal)</span></div>`}
              </div>
              <input type="file" id="e_img1_file" accept="image/*" class="hidden" onchange="uploadImageBox(event, 'e_image', 'e_img1_box', 'e_img1_remove')">
              <input type="hidden" id="e_image" value="${escapeHtml(p.image||'')}">
              <button type="button" id="e_img1_remove" class="${p.image ? '' : 'hidden'} mt-1 w-full text-[10px] font-bold text-rose-500 py-1" onclick="clearImgBox('e_image','e_img1_box','e_img1_remove','e_img1_file')">Quitar foto</button>
            </div>
            <div>
              <div class="img-upload-box ${p.image2 ? 'has-img' : ''}" id="e_img2_box" onclick="document.getElementById('e_img2_file').click()">
                ${p.image2 ? `<img src="${escapeHtml(p.image2)}" alt="Foto 2"><div class="img-label">Foto 2</div>` : `<div class="upload-placeholder"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg><span>Foto 2<br>(opcional)</span></div>`}
              </div>
              <input type="file" id="e_img2_file" accept="image/*" class="hidden" onchange="uploadImageBox(event, 'e_image2', 'e_img2_box', 'e_img2_remove')">
              <input type="hidden" id="e_image2" value="${escapeHtml(p.image2||'')}">
              <button type="button" id="e_img2_remove" class="${p.image2 ? '' : 'hidden'} mt-1 w-full text-[10px] font-bold text-rose-500 py-1" onclick="clearImgBox('e_image2','e_img2_box','e_img2_remove','e_img2_file')">Quitar foto</button>
            </div>
          </div>
        </div>
        
        <div>
          <h4 class="font-bold text-xs text-rose-800 mb-2 ml-1 mt-4 uppercase tracking-wider">4. Categorización</h4>
          <div class="space-y-3">
            <div class="space-y-2">
              <select id="e_category" class="w-full px-4 py-3 border-2 border-rose-100 rounded-2xl focus:border-rose-400 focus:outline-none bg-white shadow-sm font-semibold text-rose-900" onchange="handleEditCategoryChange()">
                <option value="">Seleccionar categoría *</option>
                ${cats.map(c=>`<option value="${escapeHtml(c)}" ${p.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                <option value="Nueva categoría...">+ Nueva categoría...</option>
              </select>
              <div id="e_new_category_wrapper" class="hidden p-3 bg-rose-100/50 border border-rose-200 rounded-2xl space-y-2 shadow-inner">
                <input id="e_new_category" placeholder="Nombre de la nueva categoría *" class="w-full px-4 py-3 text-sm border-2 border-white rounded-xl focus:border-rose-400 focus:outline-none bg-white shadow-sm">
                <div class="relative">
                  <input id="e_new_category_img" placeholder="URL foto de categoría" class="w-full px-4 py-3 text-xs border-2 border-white rounded-xl focus:border-rose-400 focus:outline-none bg-white shadow-sm pr-24">
                  <label class="absolute right-1 top-1 bottom-1 bg-rose-200 hover:bg-rose-300 text-rose-800 px-3 rounded-lg flex items-center justify-center cursor-pointer text-[10px] font-bold uppercase tracking-wider transition-colors">
                    Subir <input type="file" accept="image/*" onchange="uploadImage(event, 'e_new_category_img')" class="hidden">
                  </label>
                </div>
              </div>
            </div>
            
            <div class="space-y-2">
              <select id="e_subcategory" class="w-full px-4 py-3 border-2 border-rose-100 rounded-2xl focus:border-rose-400 focus:outline-none bg-white shadow-sm text-sm" onchange="handleEditSubcategoryChange()">
                <option value="">Subcategoría (opcional)</option>
                ${getKnownSubcategories(p.category).map(s=>`<option value="${escapeHtml(s)}" ${p.subcategory === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                <option value="Nueva subcategoría...">+ Nueva subcategoría...</option>
              </select>
              <div id="e_new_subcategory_wrapper" class="hidden p-3 bg-rose-100/50 border border-rose-200 rounded-2xl space-y-2 shadow-inner">
                <input id="e_new_subcategory" placeholder="Nombre de la nueva subcategoría *" class="w-full px-4 py-3 text-sm border-2 border-white rounded-xl focus:border-rose-400 focus:outline-none bg-white shadow-sm">
                <div class="relative">
                  <input id="e_new_subcategory_img" placeholder="URL foto de subcategoría" class="w-full px-4 py-3 text-xs border-2 border-white rounded-xl focus:border-rose-400 focus:outline-none bg-white shadow-sm pr-24">
                  <label class="absolute right-1 top-1 bottom-1 bg-rose-200 hover:bg-rose-300 text-rose-800 px-3 rounded-lg flex items-center justify-center cursor-pointer text-[10px] font-bold uppercase tracking-wider transition-colors">
                    Subir <input type="file" accept="image/*" onchange="uploadImage(event, 'e_new_subcategory_img')" class="hidden">
                  </label>
                </div>
              </div>
            </div>
            
            <input id="e_subsubcategory" value="${escapeHtml(p.subsubcategory||'')}" placeholder="Tercer nivel / Sub-subcategoría (opcional)" class="w-full px-4 py-3 border-2 border-rose-100 rounded-2xl focus:border-rose-400 focus:outline-none bg-white shadow-sm text-sm">
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-2 pt-2">
      <button onclick="saveProductEdit('${escapeHtml(sku)}')" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all text-base">Guardar cambios</button>
      <button onclick="resetProductEdit('${escapeHtml(sku)}')" class="w-full bg-white border-2 border-rose-200 text-rose-600 font-bold py-3 rounded-2xl active:scale-95 transition-all text-sm">Restaurar valores originales</button>
      <button onclick="deleteProductFull('${escapeHtml(sku)}', ${isCustom})" class="w-full bg-red-50 text-red-600 font-bold py-3 rounded-2xl active:scale-95 transition-all text-sm mt-4 border border-red-100 hover:bg-red-100">🗑️ Eliminar producto</button>
    </div>
  </div>`;
}

function updateImgPreview() {
  const url = $('#e_image').value.trim();
  const name = $('#e_name').value.trim() || '?';
  $('#prevImg').innerHTML = imgEl(url, name);
}

function saveProductEdit(sku) {
  const path = [];
  const categorySelect = $('#e_category');
  let cat = categorySelect.value.trim();
  const newCat = $('#e_new_category').value.trim();
  const newCatImg = $('#e_new_category_img') ? $('#e_new_category_img').value.trim() : '';

  if (cat === 'Nueva categoría...' && newCat) {
    cat = newCat;
    if (newCatImg) {
      const cats = { ...getCustomCategories() };
      cats[cat] = { image: newCatImg };
      saveCustomCategories(cats);
    }
  }

  let sub = $('#e_subcategory').value.trim();
  const newSub = $('#e_new_subcategory').value.trim();
  const newSubImg = $('#e_new_subcategory_img') ? $('#e_new_subcategory_img').value.trim() : '';

  if (sub === 'Nueva subcategoría...' && newSub) {
    sub = newSub;
    if (newSubImg) {
      const cats = { ...getCustomCategories() };
      cats[cat + '/' + sub] = { image: newSubImg };
      saveCustomCategories(cats);
    }
  }

  const subsub = $('#e_subsubcategory').value.trim();
  if (cat) path.push(cat);
  if (sub) path.push(sub);
  if (subsub) path.push(subsub);
  const patch = {
    name: $('#e_name').value.trim(),
    priceA: parseInt($('#e_priceA').value) || 0,
    priceB: parseInt($('#e_priceA').value) || 0,
    stock: parseInt($('#e_stock').value) || 0,
    image: $('#e_image').value.trim(),
    image2: $('#e_image2') ? $('#e_image2').value.trim() : '',
    category: cat,
    subcategory: sub,
    subsubcategory: subsub,
    path: path.length ? path : ['Sin Categoria']
  };
  const isCustom = !!_customProducts.find(c => c.sku === sku);
  const oldImage = isCustom
    ? (_customProducts.find(c => c.sku === sku) || {}).image
    : (allProducts.find(p => p.sku === sku) || {}).image;
  const newImage = patch.image;
  if (oldImage && newImage && oldImage !== newImage && oldImage.includes('firebasestorage')) {
    deleteImageFromStorage(oldImage);
  }
  if (isCustom) {
    const idx = _customProducts.findIndex(c => c.sku === sku);
    _customProducts[idx] = { ..._customProducts[idx], ...patch };
    try { localStorage.setItem('db_custom_products', JSON.stringify(_customProducts)); } catch(e) { console.warn('localStorage full', e); }
    db.collection(COL_PRODUCTS).doc(sku).set(_customProducts[idx]).catch(e => {});
  } else {
    setOverride(sku, patch);
  }
  showToast('Cambios guardados');
  navigate('/admin');
}

function resetProductEdit(sku) {
  if (!confirm('¿Restaurar valores originales? Se perderán tus ediciones.')) return;
  clearOverride(sku);
  showToast('Restaurado');
  render();
}

async function deleteImageFromStorage(imageUrl) {
  if (!imageUrl || !imageUrl.includes('firebasestorage')) return;
  try {
    const ref = geminaiStorage.refFromURL(imageUrl);
    await ref.delete();
  } catch(e) {
    console.warn('No se pudo borrar imagen del Storage:', e);
  }
}

function deleteProductFull(sku, isCustom) {
  if (!confirm('¿Eliminar este producto del catálogo?')) return;
  const product = getProducts().find(p => p.sku === sku);
  if (isCustom) {
    _customProducts = _customProducts.filter(c => c.sku !== sku);
    db.collection(COL_PRODUCTS).doc(sku).delete().catch(e => {});
  } else {
    const deleted = getDeleted();
    if (!deleted.includes(sku)) deleted.push(sku);
    setDeleted(deleted);
  }
  if (product && product.image) deleteImageFromStorage(product.image);
  clearOverride(sku);
  showToast('Producto eliminado');
  navigate('/admin');
}

function restoreAllDeleted() {
  if (!confirm('¿Restaurar todos los productos eliminados?')) return;
  setDeleted([]);
  render();
}

function uploadImage(ev, targetId) {
  const file = ev.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      
      const MAX = 500;
      if (w > h && w > MAX) {
        h *= MAX / w;
        w = MAX;
      } else if (h > MAX) {
        w *= MAX / h;
        h = MAX;
      }
      
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      
      canvas.toBlob(async (blob) => {
        if (!blob) return showToast('Error al procesar imagen');
        showToast('Subiendo imagen a Storage...');
        try {
          const filename = 'CATALOGOEMPRENDEDOR/' + CLIENT_ID + '/' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.webp';
          const ref = geminaiStorage.ref(filename);
          await ref.put(blob);
          const url = await ref.getDownloadURL();
          $('#' + targetId).value = url;
          if (targetId === 'e_image') updateImgPreview();
          showToast('Imagen cargada con éxito');
        } catch(e) {
          console.error(e);
          showToast('Error al subir imagen');
        }
      }, 'image/webp', 0.6);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function uploadImageBox(ev, hiddenId, boxId, removeBtnId) {
  const file = ev.target.files[0];
  if (!file) return;
  const box = $('#' + boxId);
  const placeholder = box.querySelector('.upload-placeholder');
  if (placeholder) placeholder.style.display = 'none';
  const oldImg = box.querySelector('img');
  if (oldImg) oldImg.remove();
  const oldLabel = box.querySelector('.img-label');
  if (oldLabel) oldLabel.remove();
  const tempImg = document.createElement('img');
  tempImg.style.opacity = '0.5';
  tempImg.src = URL.createObjectURL(file);
  box.appendChild(tempImg);
  box.classList.add('has-img');

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      const MAX = 500;
      if (w > h && w > MAX) { h *= MAX / w; w = MAX; }
      else if (h > MAX) { w *= MAX / h; h = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(async (blob) => {
        if (!blob) { showToast('Error al procesar imagen'); return; }
        showToast('Subiendo imagen...');
        try {
          const filename = 'CATALOGOEMPRENDEDOR/' + CLIENT_ID + '/' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.webp';
          const ref = geminaiStorage.ref(filename);
          await ref.put(blob);
          const url = await ref.getDownloadURL();
          $('#' + hiddenId).value = url;
          tempImg.src = url;
          tempImg.style.opacity = '1';
          const label = document.createElement('div');
          label.className = 'img-label';
          label.textContent = hiddenId.includes('image2') ? 'Foto 2' : 'Foto 1 (principal)';
          box.appendChild(label);
          $('#' + removeBtnId).classList.remove('hidden');
          showToast('Imagen cargada');
        } catch (err) {
          console.error(err);
          showToast('Error al subir imagen');
          tempImg.remove();
          box.classList.remove('has-img');
          if (placeholder) placeholder.style.display = '';
        }
      }, 'image/webp', 0.6);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function clearImgBox(hiddenId, boxId, removeBtnId, fileId) {
  $('#' + hiddenId).value = '';
  const box = $('#' + boxId);
  box.classList.remove('has-img');
  const img = box.querySelector('img');
  if (img) img.remove();
  const label = box.querySelector('.img-label');
  if (label) label.remove();
  const placeholder = box.querySelector('.upload-placeholder');
  if (placeholder) placeholder.style.display = '';
  $('#' + removeBtnId).classList.add('hidden');
  $('#' + fileId).value = '';
}

// === Store logo (PNG, keeps transparency) ===
function updateLogoPreview() {
  const url = (document.getElementById('admin_logo_url') || {}).value || '';
  const prev = document.getElementById('logoPreview');
  if (!prev) return;
  prev.innerHTML = url
    ? `<img src="${escapeHtml(url)}" class="w-full h-full object-cover">`
    : `<span class="text-white/60 text-[11px] font-bold text-center px-2">Sin logo</span>`;
}
function uploadLogo(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      // Downscale but keep PNG transparency intact
      const MAX = 600;
      let w = img.width, h = img.height;
      if (w > h && w > MAX) { h *= MAX / w; w = MAX; }
      else if (h > MAX) { w *= MAX / h; h = MAX; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(async (blob) => {
        if (!blob) return showToast('Error al procesar el logo');
        showToast('Subiendo logo...');
        try {
          const ref = geminaiStorage.ref('logos/' + Date.now() + '_logo.png');
          await ref.put(blob);
          const url = await ref.getDownloadURL();
          const input = document.getElementById('admin_logo_url');
          if (input) input.value = url;
          updateLogoPreview();
          showToast('Logo cargado · pulsa "Guardar logo"');
        } catch (err) { console.error(err); showToast('Error al subir el logo'); }
      }, 'image/png');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
async function saveLogo() {
  const url = (document.getElementById('admin_logo_url') || {}).value || '';
  await saveSettings({ logoUrl: url.trim() || null });
  showToast('Logo guardado');
  renderAdmin();
}
async function removeLogo() {
  await saveSettings({ logoUrl: null });
  const input = document.getElementById('admin_logo_url');
  if (input) input.value = '';
  showToast('Logo quitado');
  renderAdmin();
}

window.migrateLocalToFirebase = async function() {
  if (!confirm('¿Subir a la nube tus productos y categorías locales que no se guardaron por el error de ayer?')) return;
  try {
    const localProducts = JSON.parse(localStorage.getItem('db_custom_products') || '[]');
    const localCategories = JSON.parse(localStorage.getItem('db_categories') || '{}');
    const localOverrides = JSON.parse(localStorage.getItem('db_overrides') || '{}');
    
    if (localProducts.length > 0) {
      const batch = db.batch();
      localProducts.forEach(p => {
        batch.set(db.collection(COL_PRODUCTS).doc(p.sku), p);
      });
      await batch.commit();
    }
    
    if (Object.keys(localCategories).length > 0) {
      const mergedCats = { ...getCustomCategories(), ...localCategories };
      const encodedCats = {};
      for (const k in mergedCats) encodedCats[k.replace(/\//g, '||')] = mergedCats[k];
      await db.doc(DOC_CATEGORIES).set({ map: encodedCats });
    }
    
    const localSettings = JSON.parse(localStorage.getItem('db_settings') || '{}');
    if (localSettings.minPurchase) {
      await saveSettings(localSettings);
    }
    
    if (Object.keys(localOverrides).length > 0) {
      const mergedOvs = { ...getOverrides(), ...localOverrides };
      await db.doc(DOC_OVERRIDES).set({ map: mergedOvs });
    }
    
    alert('¡Datos rescatados y subidos a la nube con éxito! Recargando...');
    location.reload();
  } catch (err) {
    alert('Error al subir: ' + err.message);
  }
};

function exportAdminData() {
  const data = {
    customProducts: _customProducts,
    overrides: getOverrides(),
    deleted: getDeleted(),
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yesbella-admin-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCatalogExcel() {
  const products = getProducts();
  const headers = ['SKU', 'Nombre', 'Precio A', 'Precio B', 'Precio Final', 'Stock', 'Categoria', 'Subcategoria', 'Imagen'];
  let csv = headers.join(';') + '\r\n';
  products.forEach(p => {
    const row = [
      p.sku || '',
      (p.name || '').replace(/;/g, ',').replace(/\r\n/g, ' '),
      p.priceA || 0,
      p.priceB || 0,
      getPrice(p),
      p.stock || 0,
      (p.category || '').replace(/;/g, ','),
      (p.subcategory || '').replace(/;/g, ','),
      (p.image || '').replace(/;/g, ',')
    ];
    csv += row.join(';') + '\r\n';
  });
  // BOM for Excel UTF-8
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `catalogo-web-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Excel exportado: ' + products.length + ' productos');
}

function importAdminData(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data)) {
        data.forEach(p => {
          _customProducts.push(p);
          db.collection(COL_PRODUCTS).doc(p.sku).set(p).catch(e => {});
        });
      } else {
        if (data.customProducts) data.customProducts.forEach(p => {
          _customProducts.push(p);
          db.collection(COL_PRODUCTS).doc(p.sku).set(p).catch(e => {});
        });
        if (data.overrides) saveOverrides(data.overrides);
        if (data.deleted) setDeleted(data.deleted);
      }
      showToast('Datos importados');
      render();
    } catch {
      showToast('Archivo inválido');
    }
  };
  reader.readAsText(f);
}
function checkAdmin() {
  const v = $('#apwd').value;
  if (v === PASSWORDS.admin) {
    sessionStorage.setItem(STORAGE_KEYS.adminAuth, '1');
    render();
  } else {
    showToast('Contraseña incorrecta');
  }
}
function adminLogout() {
  sessionStorage.removeItem(STORAGE_KEYS.adminAuth);
  navigate('/');
}
function quickDeleteProduct(sku) {
  if (!confirm('¿Eliminar este producto del catálogo?')) return;
  const product = getProducts().find(p => p.sku === sku);
  const deleted = getDeleted();
  if (!deleted.includes(sku)) deleted.push(sku);
  setDeleted(deleted);
  // Also delete from custom products if it's there
  const idx = _customProducts.findIndex(c => c.sku === sku);
  if (idx !== -1) {
    _customProducts.splice(idx, 1);
    db.collection(COL_PRODUCTS).doc(sku).delete().catch(e => {});
  }
  if (product && product.image) deleteImageFromStorage(product.image);
  showToast('Producto eliminado');
  renderAdmin();
}
function addCustomProduct() {
  let sku = $('#f_sku').value.trim().replace(/\//g, '-');
  const name = $('#f_name').value.trim();
  const priceA = parseInt($('#f_priceA').value) || 0;
  const priceB = priceA;
  const stock = parseInt($('#f_stock').value) || 999;
  const image = $('#f_image').value.trim();
  const image2 = $('#f_image2') ? $('#f_image2').value.trim() : '';
  
  const categorySelect = $('#f_category');
  let category = categorySelect.value.trim();
  const newCategory = $('#f_new_category').value.trim();
  const newCatImg = $('#f_new_category_img') ? $('#f_new_category_img').value.trim() : '';
  
  if (category === 'Nueva categoría...' && newCategory) {
    category = newCategory;
    if (newCatImg) {
      const cats = { ...getCustomCategories() };
      cats[category] = { image: newCatImg };
      saveCustomCategories(cats);
    }
  }
  
  let subcategory = $('#f_subcategory').value.trim();
  const newSubcategory = $('#f_new_subcategory') ? $('#f_new_subcategory').value.trim() : '';
  const newSubImg = $('#f_new_subcategory_img') ? $('#f_new_subcategory_img').value.trim() : '';
  
  if (subcategory === 'Nueva subcategoría...' && newSubcategory) {
    subcategory = newSubcategory;
    if (newSubImg) {
      const cats = { ...getCustomCategories() };
      cats[category + '/' + subcategory] = { image: newSubImg };
      saveCustomCategories(cats);
    }
  }
  
  const subsubcategory = $('#f_subsubcategory') ? $('#f_subsubcategory').value.trim() : '';
  if (!sku || !name || !priceA || !category) { showToast('Faltan campos requeridos'); return; }
  if (getProducts().some(p => p.sku === sku)) { showToast('SKU ya existe'); return; }
  const path = [category];
  if (subcategory) path.push(subcategory);
  if (subsubcategory) path.push(subsubcategory);
  const product = { sku, name, priceA, priceB, stock, image, image2, category, subcategory, subsubcategory, path, barcode: '', createdAt: Date.now() };
  _customProducts.push(product);
  try {
    const recentSkus = JSON.parse(localStorage.getItem('db_recent_product_skus') || '[]');
    localStorage.setItem('db_recent_product_skus', JSON.stringify([sku, ...recentSkus.filter(s => s !== sku)].slice(0, 20)));
  } catch (e) {}
  try { localStorage.setItem('db_custom_products', JSON.stringify(_customProducts)); } catch(e) { console.warn('localStorage full', e); }
  db.collection(COL_PRODUCTS).doc(sku).set(product).catch(e => console.error('Error adding product:', e));
  showToast('Producto agregado');
  renderAdmin();
}

// Manejar cambio de categoría para mostrar campo de nueva categoría
window.handleCategoryChange = function() {
  const categorySelect = $('#f_category');
  const wrapper = $('#f_new_category_wrapper');
  if (categorySelect && wrapper) {
    if (categorySelect.value === 'Nueva categoría...') {
      wrapper.classList.remove('hidden');
      $('#f_new_category').focus();
      $('#f_subcategory').innerHTML = '<option value="">Subcategoría (opcional)</option><option value="Nueva subcategoría...">+ Nueva subcategoría...</option>';
    } else {
      wrapper.classList.add('hidden');
      updateSubcategories(categorySelect.value);
    }
  }
};

window.handleSubcategoryChange = function() {
  const subSelect = $('#f_subcategory');
  const wrapper = $('#f_new_subcategory_wrapper');
  if (subSelect && wrapper) {
    if (subSelect.value === 'Nueva subcategoría...') {
      wrapper.classList.remove('hidden');
      $('#f_new_subcategory').focus();
    } else {
      wrapper.classList.add('hidden');
    }
  }
};

window.handleEditCategoryChange = function() {
  const categorySelect = $('#e_category');
  const wrapper = $('#e_new_category_wrapper');
  if (categorySelect && wrapper) {
    if (categorySelect.value === 'Nueva categoría...') {
      wrapper.classList.remove('hidden');
      $('#e_new_category').focus();
      $('#e_subcategory').innerHTML = '<option value="">Subcategoría (opcional)</option><option value="Nueva subcategoría...">+ Nueva subcategoría...</option>';
    } else {
      wrapper.classList.add('hidden');
      updateSubcategoriesEdit(categorySelect.value);
    }
  }
};

window.handleEditSubcategoryChange = function() {
  const subSelect = $('#e_subcategory');
  const wrapper = $('#e_new_subcategory_wrapper');
  if (subSelect && wrapper) {
    if (subSelect.value === 'Nueva subcategoría...') {
      wrapper.classList.remove('hidden');
      $('#e_new_subcategory').focus();
    } else {
      wrapper.classList.add('hidden');
    }
  }
};

// Actualizar subcategorías basado en la categoría seleccionada
function updateSubcategories(category) {
  const subcategorySelect = $('#f_subcategory');
  if (!subcategorySelect || !category) return;
  const subcats = getKnownSubcategories(category);
  subcategorySelect.innerHTML = '<option value="">Subcategoría (opcional)</option>' +
    subcats.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('') +
    '<option value="Nueva subcategoría...">+ Nueva subcategoría...</option>';
  
  const wrapper = $('#f_new_subcategory_wrapper');
  if (wrapper) wrapper.classList.add('hidden');
}

function updateSubcategoriesEdit(category) {
  const subcategorySelect = $('#e_subcategory');
  if (!subcategorySelect || !category) return;
  const subcats = getKnownSubcategories(category);
  subcategorySelect.innerHTML = '<option value="">Subcategoría (opcional)</option>' +
    subcats.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('') +
    '<option value="Nueva subcategoría...">+ Nueva subcategoría...</option>';
  
  const wrapper = $('#e_new_subcategory_wrapper');
  if (wrapper) wrapper.classList.add('hidden');
};

window.handleEditCategoryChange = function() {
  const cat = $('#e_category').value;
  const sub = $('#e_subcategory');
  const newCat = $('#e_new_category');
  const newSub = $('#e_new_subcategory');
  
  if (cat === 'Nueva categoría...') {
    if(newCat) {
      newCat.classList.remove('hidden');
      newCat.focus();
    }
    if(sub) sub.innerHTML = '<option value="">Subcategoría (opcional)</option><option value="Nueva subcategoría...">+ Nueva subcategoría</option>';
  } else {
    if(newCat) newCat.classList.add('hidden');
    if(sub) {
      const subcats = getKnownSubcategories(cat);
      sub.innerHTML = '<option value="">Subcategoría (opcional)</option>' + 
                      subcats.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('') + 
                      '<option value="Nueva subcategoría...">+ Nueva subcategoría</option>';
    }
  }
  if(newSub) newSub.classList.add('hidden');
};

window.handleEditSubcategoryChange = function() {
  const sub = $('#e_subcategory').value;
  const newSub = $('#e_new_subcategory');
  if (sub === 'Nueva subcategoría...') {
    if(newSub) {
      newSub.classList.remove('hidden');
      newSub.focus();
    }
  } else {
    if(newSub) newSub.classList.add('hidden');
  }
};

// Agregar event listeners después de renderizar
setTimeout(() => {
  const categorySelect = $('#f_category');
  if (categorySelect) {
    categorySelect.addEventListener('change', handleCategoryChange);
  }
}, 100);

// === Lightbox ===
var _lightboxMovedImage = null;
var _lightboxImageParent = null;
var _lightboxImageNextSibling = null;
var _lightboxImageStyle = null;
var _lightboxStopClick = null;

function openLightbox(src, triggerElement) {
  const clickEvent = window.event;
  const trigger = triggerElement || (clickEvent && (clickEvent.currentTarget instanceof Element ? clickEvent.currentTarget : clickEvent.target));
  const imageScope = trigger instanceof Element ? (trigger.closest('.product-card, .main-img') || trigger) : null;
  const visibleImage = imageScope && imageScope.querySelector ? imageScope.querySelector('img') : null;
  const imgEl = document.getElementById('lightbox-img');
  const lbEl = document.getElementById('lightbox');
  if (!lbEl) return;

  if (visibleImage && visibleImage.complete && visibleImage.naturalWidth > 0) {
    _lightboxMovedImage = visibleImage;
    _lightboxImageParent = visibleImage.parentNode;
    _lightboxImageNextSibling = visibleImage.nextSibling;
    _lightboxImageStyle = visibleImage.getAttribute('style');
    _lightboxStopClick = function(event) { event.stopPropagation(); };
    visibleImage.addEventListener('click', _lightboxStopClick);
    visibleImage.classList.add('lightbox-active-image');
    visibleImage.style.cssText = 'display:block;width:auto;height:auto;max-width:94vw;max-height:88vh;object-fit:contain;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.5);';
    if (imgEl) imgEl.style.display = 'none';
    lbEl.appendChild(visibleImage);
  } else if (imgEl && src) {
    imgEl.classList.add('lightbox-active-image');
    imgEl.style.display = '';
    imgEl.src = src;
  } else {
    return;
  }

  lbEl.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const lbEl = document.getElementById('lightbox');
  const imgEl = document.getElementById('lightbox-img');
  if (_lightboxMovedImage && _lightboxImageParent) {
    if (_lightboxStopClick) _lightboxMovedImage.removeEventListener('click', _lightboxStopClick);
    _lightboxMovedImage.classList.remove('lightbox-active-image');
    if (_lightboxImageStyle === null) _lightboxMovedImage.removeAttribute('style');
    else _lightboxMovedImage.setAttribute('style', _lightboxImageStyle);
    if (_lightboxImageNextSibling && _lightboxImageNextSibling.parentNode === _lightboxImageParent) {
      _lightboxImageParent.insertBefore(_lightboxMovedImage, _lightboxImageNextSibling);
    } else {
      _lightboxImageParent.appendChild(_lightboxMovedImage);
    }
  }
  _lightboxMovedImage = null;
  _lightboxImageParent = null;
  _lightboxImageNextSibling = null;
  _lightboxImageStyle = null;
  _lightboxStopClick = null;
  if (imgEl) {
    imgEl.classList.remove('lightbox-active-image');
    imgEl.style.display = '';
  }
  if (lbEl) lbEl.classList.remove('active');
  document.body.style.overflow = '';
}

window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeLightbox();
  if (typeof closeProductModal === 'function') closeProductModal();
  if (typeof closeSortSheet === 'function') closeSortSheet();
  if (typeof closePriceSheet === 'function') closePriceSheet();
  if (typeof closeCustomerFormModal === 'function') closeCustomerFormModal();
  if (typeof closeCart === 'function') closeCart();
});

// === Product detail modal ===
function showProductModal(sku) {
  const p = getProducts().find(x => x.sku === sku);
  if (!p) return;
  const nav = document.getElementById('bottomNav');
  if (nav) nav.style.display = 'none';
  const price = getPrice(p);
  const rawPath = getProductPath(p).filter(seg => {
    const clean = stripEmoji(seg || '').toLowerCase();
    return clean && clean !== 'sin categoria' && clean !== 'sin categoría';
  });
  const currentStock = getRealStock(p);
  const outOfStock = currentStock <= 0;
  const hasImg2 = !!(p.image2 && p.image2.trim());
  const img1 = p.image || '';
  const img2 = p.image2 || '';
  const brand = String(p.BRAND || p.brand || '').trim();
  const displayCat = typeof cleanCatalogCategoryLabel === 'function' ? cleanCatalogCategoryLabel(p.subcategory || p.category || '') : '';
  const displaySku = typeof formatCatalogSku === 'function' ? formatCatalogSku(p.code || p.sku || p.id || '') : p.sku;
  const descriptionText = String(p.description || p.DESCRIPTION || '').trim();

  $('#modal-content').innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-4">
      <div class="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider">
        ${brand ? `<span class="text-red-600">${escapeHtml(brand)}</span><span class="text-gray-300">·</span>` : ''}
        <span class="text-gray-500">${escapeHtml(displayCat || 'Selección Oficial')}</span>
      </div>
      <button type="button" onclick="closeProductModal()" class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center flex-shrink-0 transition" aria-label="Cerrar detalle">✕</button>
    </div>

    <div class="flex flex-col sm:flex-row gap-4 sm:gap-5 mb-4">
      <div class="modal-gallery mx-auto sm:mx-0">
        <div class="main-img ${img1 ? 'cursor-zoom-in' : ''} relative group" id="modalMainImg" ${img1 ? `onclick="openLightbox('${escapeHtml(img1)}')"` : ''}>
          ${img1 ? `<img src="${escapeHtml(img1)}" alt="${escapeHtml(p.name)}" id="modalMainImgEl">` : imgEl('', p.name)}
        </div>
        ${hasImg2 ? `
        <div class="thumbs justify-center sm:justify-start">
          <div class="thumb active" id="modalThumb1" onclick="switchModalImg(1,'${escapeHtml(img1)}','${escapeHtml(img2)}')"><img src="${escapeHtml(img1)}" alt="Foto 1"></div>
          <div class="thumb" id="modalThumb2" onclick="switchModalImg(2,'${escapeHtml(img1)}','${escapeHtml(img2)}')"><img src="${escapeHtml(img2)}" alt="Foto 2"></div>
        </div>` : ''}
      </div>
      <div class="flex-1 min-w-0">
        <h2 class="font-display font-extrabold text-xl text-gray-950 leading-snug mb-1.5">${escapeHtml(p.name)}</h2>
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <span class="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-mono text-[11px] font-bold">Código: ${escapeHtml(displaySku)}</span>
          ${getStockBadgeHtml(p)}
        </div>
        <div class="flex items-baseline gap-1.5 pt-2 border-t border-gray-100">
          <span class="text-3xl font-display font-extrabold text-gray-950 tabular-nums">${formatPrice(price)}</span>
          <span class="text-xs text-gray-400 font-semibold">/ unidad</span>
        </div>
        ${rawPath.length > 0 ? `<div class="text-xs text-gray-500 font-semibold mt-2.5 flex items-center gap-1 flex-wrap">${rawPath.map(escapeHtml).join(' <span class="text-gray-300">›</span> ')}</div>` : ''}
      </div>
    </div>

    ${descriptionText ? `
    <div class="rounded-2xl bg-[#f7f7f9] border border-gray-200/80 p-3.5 mb-4">
      <div class="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1">Descripción del artículo</div>
      <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-line">${escapeHtml(descriptionText)}</div>
    </div>` : ''}

    ${outOfStock ? '' : `
    <div class="flex items-center justify-between bg-[#f7f7f9] border border-gray-200/80 rounded-2xl p-2.5 mb-3.5">
      <span class="text-sm font-bold text-gray-800 ml-2">Cantidad a pedir</span>
      <div class="flex items-center gap-2.5">
        <button class="qty-step" onclick="modalQtyChange('${escapeHtml(p.sku)}',-1)">−</button>
        <input id="modalQty" type="number" min="1" max="${currentStock}" value="1" oninput="modalQtyUpdate('${escapeHtml(p.sku)}')" class="w-12 text-center font-extrabold text-gray-950 text-lg bg-transparent focus:outline-none tabular-nums">
        <button class="qty-step" onclick="modalQtyChange('${escapeHtml(p.sku)}',1)">+</button>
      </div>
    </div>`}
    <button ${outOfStock ? 'disabled' : ''} onclick="modalAddToCart('${escapeHtml(p.sku)}')" class="w-full ${outOfStock ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed' : 'btn-primary text-white active:scale-[0.99]'} font-extrabold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all">
      ${outOfStock ? '<span>Agotado temporalmente</span>' : `<span>Agregar al pedido</span><span id="modalSubtotal" class="opacity-95 tabular-nums">· ${formatPrice(price)}</span>`}
    </button>
  `;
  $('#productModal').classList.remove('hidden');
}

function switchModalImg(idx, img1, img2) {
  const mainImg = document.getElementById('modalMainImg');
  const mainEl = document.getElementById('modalMainImgEl');
  if (!mainImg) return;
  const url = idx === 1 ? img1 : img2;
  if (mainEl) {
    mainEl.src = url;
  } else {
    mainImg.innerHTML = `<img src="${escapeHtml(url)}" alt="" id="modalMainImgEl">`;
  }
  mainImg.setAttribute('onclick', `openLightbox('${escapeHtml(url)}')`);
  const t1 = document.getElementById('modalThumb1');
  const t2 = document.getElementById('modalThumb2');
  if (t1) t1.classList.toggle('active', idx === 1);
  if (t2) t2.classList.toggle('active', idx === 2);
}

function _modalClampQty(sku) {
  const p = getProducts().find(x => x.sku === sku);
  const input = document.getElementById('modalQty');
  if (!p || !input) return 1;
  let q = parseInt(input.value) || 1;
  q = Math.max(1, Math.min(q, p.stock || 1));
  input.value = q;
  const sub = document.getElementById('modalSubtotal');
  if (sub) sub.textContent = '· ' + formatPrice(getPrice(p) * q);
  return q;
}
function modalQtyChange(sku, delta) {
  const input = document.getElementById('modalQty');
  if (input) input.value = (parseInt(input.value) || 1) + delta;
  _modalClampQty(sku);
}
function modalQtyUpdate(sku) { _modalClampQty(sku); }
function modalAddToCart(sku) {
  const q = _modalClampQty(sku);
  closeProductModal();
  addToCart(sku, q);
}
function closeProductModal() {
  $('#productModal').classList.add('hidden');
  const nav = document.getElementById('bottomNav');
  if (nav) nav.style.display = '';
}

// === Init ===
function renderSkeleton() {
  const skeletonCard = `<div class="product-card catalog-card" aria-hidden="true">
    <div class="catalog-card-media skeleton"></div>
    <div class="catalog-card-body">
      <div class="h-3 w-20 rounded skeleton"></div>
      <div class="h-4 w-5/6 rounded skeleton mt-1"></div>
      <div class="h-3 w-1/2 rounded skeleton mt-1"></div>
      <div class="mt-3 pt-2 border-t border-gray-100 space-y-2">
        <div class="h-5 w-24 rounded skeleton"></div>
        <div class="h-10 w-full rounded-xl skeleton"></div>
      </div>
    </div>
  </div>`;

  $('#app').innerHTML = `<div class="fade-in catalog-home" role="status" aria-label="Cargando catálogo" aria-busy="true">
    <section class="carlitos-hero" aria-hidden="true">
      <div class="carlitos-hero-copy">
        <div class="h-6 w-52 rounded-full skeleton"></div>
        <div class="h-11 w-4/5 rounded-xl skeleton mt-5"></div>
        <div class="h-11 w-3/5 rounded-xl skeleton mt-2"></div>
        <div class="h-4 w-full max-w-md rounded skeleton mt-4"></div>
        <div class="h-4 w-3/4 max-w-sm rounded skeleton mt-2"></div>
        <div class="flex gap-3 mt-6">
          <div class="h-11 w-40 rounded-xl skeleton"></div>
          <div class="h-11 w-36 rounded-xl skeleton"></div>
        </div>
      </div>
      <div class="carlitos-hero-visual hero-sky-surface"></div>
    </section>
    <div class="catalog-benefits" aria-hidden="true">
      ${'<div class="catalog-benefit"><div class="w-10 h-10 rounded-xl skeleton flex-none"></div><div class="flex-1 space-y-1.5"><div class="h-3.5 w-28 rounded skeleton"></div><div class="h-3 w-36 rounded skeleton"></div></div></div>'.repeat(4)}
    </div>
    <section aria-hidden="true">
      <div class="h-6 w-48 rounded skeleton mb-4"></div>
      <div class="catalog-grid">${skeletonCard.repeat(4)}</div>
    </section>
  </div>`;
}

function resolveAppwriteImage(url, apiBase) {
  if (!url) return '';
  var value = String(url).trim();
  if (value.indexOf('http://localhost:3000/') === 0) {
    return window.location.origin + value.substring('http://localhost:3000'.length);
  }
  if (value.indexOf('/api/image?url=') === 0) {
    return window.location.origin + value;
  }
  if (value.indexOf('http://') === 0 || value.indexOf('https://') === 0) {
    return value;
  }
  return value;
}

// Compartir solo peticiones simultáneas; cada actualización posterior sigue
// consultando el catálogo para no prolongar la vigencia del stock mostrado.
var _catalogFetchInFlight = null;
var _lastCatalogSyncTs = 0;
var IFRAME_CATALOG_CACHE_KEY = 'yaxsel_iframe_catalog_v4_' + firebaseConfig.projectId;
var IFRAME_CATALOG_FRESH_MS = 30 * 1000;
var _catalogReadFromSession = false;
function fetchAppwriteProducts(forceRefresh) {
  if (!forceRefresh && Array.isArray(allProducts) && allProducts.length > 0 && (Date.now() - _lastCatalogSyncTs < 2 * 60 * 1000)) {
    return Promise.resolve(allProducts);
  }
  if (!forceRefresh) {
    try {
      var cachedRaw = sessionStorage.getItem(IFRAME_CATALOG_CACHE_KEY);
      if (cachedRaw) {
        var parsed = JSON.parse(cachedRaw);
        if (parsed && Array.isArray(parsed.products) && parsed.products.length > 0 && (Date.now() - Number(parsed.ts || 0) < IFRAME_CATALOG_FRESH_MS)) {
          if (Array.isArray(parsed.categories)) _appwriteCategories = parsed.categories;
          if (Array.isArray(parsed.subcategories)) _appwriteSubcategories = parsed.subcategories;
          if (Array.isArray(parsed.vendors)) _vendors = parsed.vendors;
          if (!_settings.webConfig && parsed.mainStoreName) MAIN_STORE_NAME = parsed.mainStoreName;
          _lastCatalogSyncTs = Number(parsed.ts || Date.now());
          _catalogReadFromSession = true;
          return Promise.resolve(parsed.products);
        }
      }
    } catch (e) {}
  }
  if (_catalogFetchInFlight) return _catalogFetchInFlight;
  var pending = loadAppwriteProducts();
  _catalogFetchInFlight = pending;
  pending.then(function() {
    if (_catalogFetchInFlight === pending) _catalogFetchInFlight = null;
  }, function() {
    if (_catalogFetchInFlight === pending) _catalogFetchInFlight = null;
  });
  return pending;
}

async function loadAppwriteProducts() {
  var apiBase = window.location.origin;
  // Categorías y tiendas se actualizan aparte: no deben bloquear los productos.
  var categoriesPromise = fetch(apiBase + '/api/public-data/catalog?categoriesOnly=true')
    .then(function(res) { return res.ok ? res.json() : null; }).catch(function() { return null; });
  var vendorsPromise = fetch(apiBase + '/api/public-data/vendors')
    .then(function(res) { return res.ok ? res.json() : null; }).catch(function() { return null; });
  var prodRes = await fetch(apiBase + '/api/public-data/products?limit=1000&includeVendorProducts=true&minimal=true&stockv=2');
  if (!prodRes.ok) throw new Error('No se pudieron cargar los productos (HTTP ' + prodRes.status + ').');
  var prodData = await prodRes.json();
  if (!Array.isArray(prodData) && !Array.isArray(prodData.products)) throw new Error('Respuesta de productos inválida.');
  var raw = Array.isArray(prodData) ? prodData : (prodData.products || []);
  var catData = await Promise.race([categoriesPromise, new Promise(function(resolve) { setTimeout(function() { resolve(null); }, 350); })]);
  // Build lookup maps: id -> name, and store category/subcategory data with images
  var catMap = {};
  var subMap = {};
  _appwriteCategories = [];
  _appwriteSubcategories = [];
  if (catData && Array.isArray(catData.categories)) {
    _appwriteCategories = catData.categories;
    catData.categories.forEach(function(c) {
      if (c.$id) catMap[c.$id] = c.name || '';
      if (c.id) catMap[c.id] = c.name || '';
      if (c.name) catMap[c.name] = c.name;
    });
  }
  if (catData && Array.isArray(catData.subcategories)) {
    _appwriteSubcategories = catData.subcategories;
    catData.subcategories.forEach(function(s) {
      if (s.$id) subMap[s.$id] = s.name || '';
      if (s.id) subMap[s.id] = s.name || '';
      if (s.name) subMap[s.name] = s.name;
    });
  }
  var mainProdEarly = raw.find(function(p) { return !p.VENDOR_ID && p.VENDOR_NAME && p.VENDOR_NAME !== 'Yaxsell Demo'; });
  if (!_settings.webConfig && mainProdEarly && mainProdEarly.VENDOR_NAME) {
    MAIN_STORE_NAME = String(mainProdEarly.VENDOR_NAME).trim();
  }
  var mappedProducts = raw.map(function(p) {
    var img = resolveAppwriteImage(p.IMAGEURL || p.image || '', apiBase);
    var img2 = resolveAppwriteImage(p.IMAGEURL2 || p.image2 || '', apiBase);
    var img3 = resolveAppwriteImage(p.IMAGEURL3 || p.image3 || '', apiBase);
    // Resolve SKU same way as web: SKU field > FEATURES > TAGS > jumpseller_id > $id
    var resolvedSku = p.SKU || '';
    if (!resolvedSku) {
      var feats = Array.isArray(p.FEATURES) ? p.FEATURES.join('\r\n') : (p.FEATURES || '');
      var m = feats.match(/SKU:\s*(.+)/i);
      if (m) resolvedSku = m[1].trim().split('\r\n')[0];
    }
    if (!resolvedSku && p.TAGS) {
      var tags = typeof p.TAGS === 'string' ? p.TAGS.split(',') : p.TAGS;
      for (var t = 0; t < tags.length; t++) {
        var tag = tags[t].trim();
        if (/^[A-Z0-9]{4,}$/i.test(tag)) { resolvedSku = tag; break; }
      }
    }
    if (!resolvedSku) resolvedSku = p.jumpseller_id || p.$id || p.id || '';

    var catIdVal = p.CATEGORYID || p.categoryId || p.category_id || '';
    var subIdVal = p.SUBCATEGORYID || p.subcategoryId || p.subcategory_id || '';
    var catName = catMap[catIdVal] || (p.category && p.category !== 'Sin Categoria' ? p.category : '');
    var subName = subMap[subIdVal] || (p.subcategory && p.subcategory !== 'Sin Categoria' ? p.subcategory : '');

    // Fallback: si no encontro categoria directa pero tiene subcategoria registrada
    if (!catName && subIdVal && _appwriteSubcategories && _appwriteSubcategories.length > 0) {
      var subObj = _appwriteSubcategories.find(function(s) {
        return (s.$id || s.id) === subIdVal;
      });
      if (subObj && (subObj.categoryId || subObj.category_id)) {
        catName = catMap[subObj.categoryId || subObj.category_id] || '';
      }
    }

    var cleanCategory = catName || 'Sin Categoria';
    var cleanPath = [cleanCategory, subName].filter(function(x) {
      return Boolean(x) && x !== 'Sin Categoria';
    });

    return {
      id: p.$id || p.id || '',
      sku: resolvedSku,
      name: p.NAME || '',
      priceA: p.PRICE || 0,
      priceB: p.WHOLESALEPRICE || p.PRICE || 0,
      stock: (p.STOCK !== undefined && p.STOCK !== null) ? Number(p.STOCK) : (p.stock !== undefined && p.stock !== null ? Number(p.stock) : 0),
      category: cleanCategory,
      path: cleanPath.length > 0 ? cleanPath : [cleanCategory],
      image: img || img2 || img3,
      image2: img2,
      image3: img3,
      CATEGORYID: catIdVal,
      subcategoryId: subIdVal,
      subcategory: subName || '',
      BRAND: p.BRAND || p.brand || '',
      brand: p.BRAND || p.brand || '',
      DESCRIPTION: p.DESCRIPTION || p.description || '',
      description: p.DESCRIPTION || p.description || '',
      PACKQTY: p.PACKQTY || null,
      VENDOR_ID: p.VENDOR_ID || '',
      VENDOR_NAME: (p.VENDOR_NAME && p.VENDOR_NAME !== 'Yaxsell Demo') ? p.VENDOR_NAME : (p.VENDOR_ID ? '' : MAIN_STORE_NAME),
      VENDOR_IS_MAIN: p.VENDOR_IS_MAIN !== false && !p.VENDOR_ID,
      webPublishedAt: p.WEB_PUBLISHED_AT || p.web_published_at || '',
      _createdAt: p.$createdAt || p.createdAt || 0
    };
  });
  if (!catData) categoriesPromise.then(function(data) { setTimeout(function() {
    if (!data || allProducts !== mappedProducts) return;
    _appwriteCategories = Array.isArray(data.categories) ? data.categories : [];
    _appwriteSubcategories = Array.isArray(data.subcategories) ? data.subcategories : [];
    mappedProducts.forEach(function(product) {
      var sub = _appwriteSubcategories.find(function(s) { return String(s.$id || s.id) === String(product.subcategoryId); });
      var catId = product.CATEGORYID || (sub && (sub.categoryId || sub.category_id));
      var category = _appwriteCategories.find(function(c) { return String(c.$id || c.id) === String(catId); });
      var categoryName = category && category.name || product.category;
      var subName = sub && sub.name || product.subcategory;
      product.category = categoryName || 'Sin Categoria';
      product.subcategory = subName || '';
      product.path = [product.category, product.subcategory].filter(function(value) { return value && value !== 'Sin Categoria'; });
      if (!product.path.length) product.path = [product.category];
    });
    try { sessionStorage.removeItem(IFRAME_CATALOG_CACHE_KEY); } catch (e) {}
    if (_firestoreReady) render();
  }, 0); });
  vendorsPromise.then(function(data) { setTimeout(function() {
    if (allProducts !== mappedProducts || !data || !Array.isArray(data.vendors)) return;
    _vendors = data.vendors.map(function(v) { return { id: v.id, name: v.name || 'Tienda asociada', color: v.color || '#f97316', logoUrl: v.logoUrl || '', phone: v.phone || '', minPurchaseAmount: v.minPurchaseAmount || 0 }; });
    try { sessionStorage.removeItem(IFRAME_CATALOG_CACHE_KEY); } catch (e) {}
    if (_firestoreReady) render();
  }, 0); });
  // Actualizar MAIN_STORE_NAME desde la API (viene de la BD correcta)
  var mainProd = raw.find(function(p) { return !p.VENDOR_ID && p.VENDOR_NAME && p.VENDOR_NAME !== 'Yaxsell Demo'; });
  if (!_settings.webConfig && mainProd && mainProd.VENDOR_NAME) {
    MAIN_STORE_NAME = String(mainProd.VENDOR_NAME).trim();
    try { localStorage.setItem('store_name', MAIN_STORE_NAME); } catch (e) {}
  }
  _lastCatalogSyncTs = Date.now();
  try {
    sessionStorage.setItem(IFRAME_CATALOG_CACHE_KEY, JSON.stringify({
      products: mappedProducts,
      categories: _appwriteCategories || [],
      subcategories: _appwriteSubcategories || [],
      vendors: _vendors || [],
      mainStoreName: MAIN_STORE_NAME,
      ts: _lastCatalogSyncTs
    }));
  } catch (e) {}
  if (mappedProducts) {
    return mappedProducts;
  }
}

async function init() {
  renderSkeleton();
  try {
    allProducts = await fetchAppwriteProducts();
    catalogLoadError = false;
  } catch (e) {
    allProducts = [];
    catalogLoadError = true;
    console.error('No se pudieron cargar productos desde Appwrite', e);
  }
  await loadFirestoreData();
  
  // Migrate cart items: fill id and image from allProducts if missing
  var productsById = {};
  allProducts.forEach(function(p) { productsById[p.sku] = p; });
  cart.forEach(function(i) {
    if (!i.id || !i.image) {
      var p = productsById[i.sku];
      if (p) {
        if (!i.id) i.id = p.id || '';
        if (!i.image) i.image = p.image || '';
      }
    }
  });
  saveCart();
  syncCartWithLiveProducts();

  const minPurchEl = document.getElementById('minPurchaseDisplay');
  if (minPurchEl) minPurchEl.textContent = `Compra mínima • $${getMinPurchase().toLocaleString('es-CL')}`;

  if (window.parent && window.parent !== window) {
    try { window.parent.postMessage({ type: 'YAXSEL_CATALOG_READY' }, '*'); } catch (e) {}
  }

  updateCartCount();
  syncCatalogFavoriteButtons();

  const searchEl = $('#searchInput');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (searchQuery && !location.hash.startsWith('#/search')) {
        renderSearch();
      } else if (!searchQuery) {
        render();
      } else {
        renderSearch();
      }
    });
    initSearchTypingAnimation(searchEl);
  }
  // Cart open
  $('#cartBtn').addEventListener('click', openCart);
  // WhatsApp send
  $('#whatsappBtn').addEventListener('click', sendWhatsApp);
  // Back button
  $('#backBtn').addEventListener('click', () => { history.back(); });

  // Keep the sticky filter bar pinned just under the header
  syncHeaderHeight();
  window.addEventListener('resize', syncHeaderHeight);

  // Mobile gestures
  setupPullToRefresh();
  makeDismissable(document.querySelector('#productModal .absolute.bottom-0'), closeProductModal);
  makeDismissable(document.querySelector('#sortSheet .sheet-panel'), closeSortSheet);
  makeDismissable(document.querySelector('#priceSheet .sheet-panel'), closePriceSheet);
  makeDismissable(document.querySelector('#customerFormModal .absolute.bottom-0'), closeCustomerFormModal);
  makeDismissable(document.querySelector('#orderConfirmModal .absolute.bottom-0'), closeOrderConfirmModal);

  updateHeaderWhatsAppUrl();
  render();
  // Muestra la copia rápida e inmediatamente comprueba el stock de nuevo.
  if (_catalogReadFromSession) {
    _catalogReadFromSession = false;
    refreshData().catch(function() {});
  }
  loadCatalogPack().then(function() {
    const activeRoute = parseHash()[0] || '';
    if (!activeRoute || activeRoute === 'packs') render();
  });

  // Mostrar banner si hay pedido pendiente de WhatsApp
  showPendingOrderBanner();
}

function syncHeaderHeight() {
  const h = document.querySelector('header');
  if (h) document.documentElement.style.setProperty('--hdr-h', h.offsetHeight + 'px');
}

// Re-fetch live data (products + Firestore overrides/stock/prices)
async function refreshData() {
  _lastCatalogSyncTs = 0;
  try { sessionStorage.removeItem(IFRAME_CATALOG_CACHE_KEY); } catch (e) {}
  try {
    allProducts = await fetchAppwriteProducts();
    catalogLoadError = false;
  } catch (e) { catalogLoadError = true; /* conservar productos ya mostrados */ }
  await loadFirestoreData();
  updateCartCount();
  render();
}

// Keep the search prompt readable at all times.
function initSearchTypingAnimation(input) {
  if (!input) return;
  input.placeholder = 'Buscar productos...';
}

function anySheetOpen() {
  const open = ['productModal', 'sortSheet', 'priceSheet', 'customerFormModal', 'orderConfirmModal', 'cartDrawer']
    .some(id => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); });
  const lb = document.getElementById('lightbox');
  return open || (lb && lb.classList.contains('active'));
}

// Pull down at the top of the page to refresh
function setupPullToRefresh() {
  const ptr = document.getElementById('ptr');
  if (!ptr) return;
  const THRESH = 70;
  let startY = 0, pulling = false, dist = 0, busy = false;
  window.addEventListener('touchstart', e => {
    if (busy || window.scrollY > 0 || anySheetOpen()) { pulling = false; return; }
    startY = e.touches[0].clientY; pulling = true; dist = 0;
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (!pulling || busy) return;
    dist = e.touches[0].clientY - startY;
    if (dist > 0 && window.scrollY <= 0) {
      const d = Math.min(dist * 0.5, 90);
      ptr.style.transition = 'none';
      ptr.style.transform = `translateY(${d - 8}px)`;
      ptr.style.opacity = Math.min(1, d / THRESH);
      ptr.classList.toggle('ready', d >= THRESH);
    } else { pulling = false; ptr.style.transition = ''; ptr.style.transform = ''; ptr.style.opacity = ''; }
  }, { passive: true });
  window.addEventListener('touchend', async () => {
    if (!pulling || busy) return;
    pulling = false;
    ptr.style.transition = '';
    const go = ptr.classList.contains('ready');
    ptr.classList.remove('ready');
    if (go) {
      busy = true;
      ptr.classList.add('spinning');
      ptr.style.transform = 'translateY(52px)'; ptr.style.opacity = '1';
      await refreshData();
      showToast('Catálogo actualizado');
      ptr.classList.remove('spinning');
      busy = false;
    }
    ptr.style.transform = ''; ptr.style.opacity = '';
  });
}

// Swipe a bottom sheet / modal downward to dismiss it
function makeDismissable(panel, closeFn) {
  if (!panel) return;
  let sy = 0, dragging = false, dy = 0;
  panel.addEventListener('touchstart', e => {
    if (e.target.closest('input,button,select,a,textarea')) return; // don't hijack controls
    const rect = panel.getBoundingClientRect();
    if (e.touches[0].clientY - rect.top > 80) return;  // only the top handle zone
    if ((panel.scrollTop || 0) > 0) return;            // let scrollable content scroll
    sy = e.touches[0].clientY; dragging = true; dy = 0;
    panel.style.transition = 'none';
  }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (!dragging) return;
    dy = e.touches[0].clientY - sy;
    if (dy > 0) panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  panel.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 100) closeFn();
  });
}

initCategorySwipe();
init();
initLiveUsersCounter();
initFomoSalesEngine();

// Expose for inline handlers
window.addToCart = addToCart;
window.toggleCatalogFavorite = toggleCatalogFavorite;
window.changeQty = changeQty;
window.setQty = setQty;
window.removeFromCart = removeFromCart;
window.closeCart = closeCart;
window.checkAdmin = checkAdmin;
window.addCustomProduct = addCustomProduct;
window.adminLogout = adminLogout;
window.renderAdmin = renderAdmin;
window.renderAdminProductList = renderAdminProductList;
window.saveProductEdit = saveProductEdit;
window.resetProductEdit = resetProductEdit;
window.deleteProductFull = deleteProductFull;
window.restoreAllDeleted = restoreAllDeleted;
window.uploadImage = uploadImage;
window.uploadImageBox = uploadImageBox;
window.clearImgBox = clearImgBox;
window.switchModalImg = switchModalImg;
window.updateImgPreview = updateImgPreview;
window.exportAdminData = exportAdminData;
window.exportCatalogExcel = exportCatalogExcel;
window.importAdminData = importAdminData;
window.openLightbox = openLightbox;
window.showProductModal = showProductModal;
window.closeProductModal = closeProductModal;
window.markOrderPaid = markOrderPaid;
window.unmarkOrderPaid = unmarkOrderPaid;
window.deleteOrder = deleteOrder;
window.quickDeleteProduct = quickDeleteProduct;
window.openSortSheet = openSortSheet;
window.closeSortSheet = closeSortSheet;
window.pickSort = pickSort;
window.toggleCatInStock = toggleCatInStock;
window.clearAllFilters = clearAllFilters;
window.openPriceSheet = openPriceSheet;
window.closePriceSheet = closePriceSheet;
window.onPriceInput = onPriceInput;
window.applyPrice = applyPrice;
window.applyPreset = applyPreset;
window.clearPrice = clearPrice;
window.uploadLogo = uploadLogo;
window.updateLogoPreview = updateLogoPreview;
window.saveLogo = saveLogo;
window.removeLogo = removeLogo;
window.modalQtyChange = modalQtyChange;
window.modalQtyUpdate = modalQtyUpdate;
window.modalAddToCart = modalAddToCart;
window.flyToCart = flyToCart;
window.selectAttendant = selectAttendant;

// Script cleanup complete
