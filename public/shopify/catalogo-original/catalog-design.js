const CATALOG_EMBALAJE_MODE = false;
// Presentation helpers share the catalog's existing prices, stock and cart.
function catalogIcon(name) {
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4M10.5 7v7M7 10.5h7"/>',
    box: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/>',
    truck: '<path d="M1 4h14v12H1zM15 8h4l3 4v4h-7"/><circle cx="5" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 12h8M8 8h5"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.box}</svg>`;
}

function renderCatalogCard(p, badge = '') {
  const stock = getRealStock(p);
  const out = stock <= 0 || (CATALOG_EMBALAJE_MODE && !p.embalajePrice);
  const low = stock > 0 && stock <= 5;
  const sku = escapeHtml(p.sku || p.id || '');
  const category = stripEmoji(p.subcategory || p.category || 'Catálogo mayorista');
  const cartQty = CATALOG_EMBALAJE_MODE ? getEmbalajeCartCount(p) : cart.filter(item => item.sku === p.sku && isSameCartMode(item.mode, currentMode || 'public')).reduce((sum, item) => sum + item.qty, 0);
  const tag = out ? 'Agotado' : badge === 'new' ? 'Recién llegado' : low ? 'Últimas unidades' : badge === 'low' ? `${stock} disponibles` : '';
  return `<article class="product-card catalog-card" data-catalog-sku="${sku}">
    <div class="catalog-card-media">
      <button type="button" class="catalog-card-open" data-catalog-action="detail" data-sku="${sku}" aria-label="Ver ${escapeHtml(p.name)}">
        <div class="pc-img">${imgEl(p.image, p.name).replace('<img ', '<img decoding="async" onload="this.dataset.loaded=1" ')}</div>
      </button>
      ${tag ? `<span class="catalog-card-badge ${out ? 'is-out' : badge === 'new' ? 'is-new' : ''}">${tag}</span>` : ''}
      ${catalogFavoriteButtonHtml(p)}
      ${p.image ? `<button type="button" class="catalog-card-zoom" data-catalog-action="zoom" data-sku="${sku}" aria-label="Ampliar imagen de ${escapeHtml(p.name)}">${catalogIcon('zoom')}</button>` : ''}
    </div>
    <div class="catalog-card-body">
      <div class="catalog-card-category">${escapeHtml(category)}</div>
      <button type="button" class="catalog-card-title" data-catalog-action="detail" data-sku="${sku}">${escapeHtml(p.name)}</button>
      ${CATALOG_EMBALAJE_MODE ? `<div class="catalog-card-category">${p.embalajeQty} unidades por embalaje</div>` : ''}
      ${vendorBadge(p)}
      <div class="catalog-card-meta">
        <span class="catalog-card-stock ${out ? 'is-out' : low ? 'is-low' : ''}">${out ? (CATALOG_EMBALAJE_MODE && !p.embalajePrice ? 'Precio no disponible' : 'Sin stock') : stock >= 999 ? 'Stock disponible' : `${stock.toLocaleString('es-CL')} disponibles`}</span>
        <span class="catalog-card-sku" title="SKU ${sku}">SKU ${sku}</span>
      </div>
      <div class="catalog-card-price"><strong>${out && CATALOG_EMBALAJE_MODE && !p.embalajePrice ? 'Consultar' : formatPrice(getPrice(p))}</strong><span>${CATALOG_EMBALAJE_MODE ? 'por embalaje' : 'c/u'}</span></div>
      <button type="button" class="catalog-card-add ${cartQty ? 'is-added' : ''}" data-catalog-action="add" data-sku="${sku}" ${out ? 'disabled' : ''} aria-label="${out ? 'Agotado' : 'Agregar ' + escapeHtml(p.name) + ' al pedido'}">
        ${catalogIcon(cartQty ? 'check' : 'plus')}<span>${out ? 'No disponible' : cartQty ? `Agregar ${CATALOG_EMBALAJE_MODE ? 'embalaje' : ''} · ${cartQty} en pedido` : CATALOG_EMBALAJE_MODE ? 'Agregar embalaje' : 'Agregar al pedido'}</span>
      </button>
    </div>
  </article>`;
}

function renderCatalogBenefits() {
  return `<div class="catalog-benefits">
    <div class="catalog-benefit">${catalogIcon('box')}<div><strong>Compra por mayor</strong><span>Arma el surtido de tu negocio</span></div></div>
    <div class="catalog-benefit">${catalogIcon('truck')}<div><strong>Envíos a todo Chile</strong><span>Elige tu agencia de transporte</span></div></div>
    <div class="catalog-benefit">${catalogIcon('message')}<div><strong>Atención directa</strong><span>Te acompañamos en tu compra</span></div></div>
  </div>`;
}

function syncCatalogDesignCart() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const peek = document.getElementById('catalogOrderPeek');
  if (peek) {
    if (count === 0) hideCatalogOrderPeek();
    document.getElementById('catalogOrderCount').textContent = `${count} ${count === 1 ? 'unidad' : 'unidades'} en tu pedido`;
    document.getElementById('catalogOrderTotal').textContent = formatPrice(cartTotal());
  }
  document.querySelectorAll('[data-catalog-action="add"]').forEach(button => {
    if (button.disabled || button.classList.contains('btn-add-pop')) return;
    const product = CATALOG_EMBALAJE_MODE ? getProducts().find(p => String(p.sku || p.id) === button.dataset.sku) : null;
    const qty = CATALOG_EMBALAJE_MODE && product ? getEmbalajeCartCount(product) : cart.filter(item => item.sku === button.dataset.sku && isSameCartMode(item.mode, currentMode || 'public')).reduce((sum, item) => sum + item.qty, 0);
    button.classList.toggle('is-added', qty > 0);
    button.innerHTML = `${catalogIcon(qty ? 'check' : 'plus')}<span>${qty ? `Agregar ${CATALOG_EMBALAJE_MODE ? 'embalaje' : ''} · ${qty} en pedido` : CATALOG_EMBALAJE_MODE ? 'Agregar embalaje' : 'Agregar al pedido'}</span>`;
  });
}

let catalogOrderPeekTimer;
function hideCatalogOrderPeek() {
  clearTimeout(catalogOrderPeekTimer);
  const peek = document.getElementById('catalogOrderPeek');
  if (peek) peek.hidden = true;
}

function showCatalogOrderPeek() {
  const peek = document.getElementById('catalogOrderPeek');
  if (!peek) return;
  // Avoid stacking the purchase notice over the order confirmation.
  if (typeof closeFomoToast === 'function') closeFomoToast();
  clearTimeout(catalogOrderPeekTimer);
  peek.hidden = false;
  catalogOrderPeekTimer = setTimeout(hideCatalogOrderPeek, 2800);
}

let catalogExplorerCategories = [];

function normalizeCatalogExplorerText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function renderCatalogExplorerCategories(query = '') {
  const list = document.getElementById('catalogExplorerList');
  const empty = document.getElementById('catalogExplorerEmpty');
  const count = document.getElementById('catalogExplorerCategoryCount');
  if (!list) return;

  const normalizedQuery = normalizeCatalogExplorerText(query);
  const matchingCategories = catalogExplorerCategories.filter(({name}) =>
    normalizeCatalogExplorerText(stripEmoji(name)).includes(normalizedQuery)
  );

  list.innerHTML = matchingCategories.map(({name, count}) => {
    const image = typeof getCategoryIcon === 'function' ? getCategoryIcon(name, [name]) : null;
    const icon = image
      ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">`
      : escapeHtml(getCategoryEmoji(name) || '📦');
    return `<a class="catalog-explorer-category" href="${categoryUrl([name])}" data-close-explorer>
      <span class="catalog-explorer-icon" aria-hidden="true">${icon}</span>
      <span class="catalog-explorer-category-copy"><strong>${escapeHtml(stripEmoji(name))}</strong><small>${count} productos</small></span>
      <svg class="catalog-explorer-chevron" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="m7 4 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>`;
  }).join('');

  if (count) count.textContent = `${matchingCategories.length} ${matchingCategories.length === 1 ? 'categoría' : 'categorías'}`;
  if (empty) empty.hidden = matchingCategories.length > 0;
}

function openCatalogExplorer() {
  const dialog = document.getElementById('catalogExplorer');
  if (!dialog || dialog.open) return;
  const products = getProducts().filter(p => getRealStock(p) > 0);
  catalogExplorerCategories = getChildren([]).map(name => ({name, count:products.filter(p => matchesPath(p, [name])).length})).filter(category => category.count > 0);
  const search = document.getElementById('catalogExplorerSearch');
  if (search) search.value = '';
  renderCatalogExplorerCategories();
  document.getElementById('catalogExplorerCount').textContent = `${products.length} productos`;
  dialog.showModal();
  document.body.classList.add('catalog-explorer-open');
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-catalog-action]');
  if (action) {
    const p = getProducts().find(item => String(item.sku || item.id) === action.dataset.sku);
    if (!p) return;
    if (action.dataset.catalogAction === 'add') addToCart(p.sku);
    if (action.dataset.catalogAction === 'detail') showProductModal(p.sku);
    if (action.dataset.catalogAction === 'zoom') openLightbox(p.image, action);
  }
  if (event.target.closest('[data-open-explorer]')) openCatalogExplorer();
  if (event.target.closest('#bottomNav a[data-nav="home"]')) {
    document.getElementById('searchInput').value = '';
    searchQuery = '';
    document.getElementById('catalogSearchClear').hidden = true;
    if (location.hash === '#/') render();
  }
  if (event.target.closest('[data-close-explorer]')) {
    const search = document.getElementById('searchInput');
    search.value = '';
    searchQuery = '';
    document.getElementById('catalogSearchClear').hidden = true;
    document.getElementById('catalogExplorer').close();
  }
});

document.getElementById('catalogExplorer').addEventListener('click', event => {
  if (event.target === event.currentTarget) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
  }
});
document.getElementById('catalogExplorer').addEventListener('close', () => document.body.classList.remove('catalog-explorer-open'));
document.getElementById('catalogExplorerSearch').addEventListener('input', event => renderCatalogExplorerCategories(event.target.value));
document.getElementById('searchInput').addEventListener('input', event => {
  document.getElementById('catalogSearchClear').hidden = !event.target.value;
});
document.getElementById('catalogSearchClear').addEventListener('click', () => {
  const input = document.getElementById('searchInput');
  input.value = '';
  input.dispatchEvent(new Event('input', {bubbles:true}));
  input.focus();
});
