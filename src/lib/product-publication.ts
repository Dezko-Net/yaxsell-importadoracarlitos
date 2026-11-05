function isEnabled(value: unknown): boolean {
  if (value === true || value === 1) return true;
  return typeof value === 'string' && ['true', '1', 'yes', 'si'].includes(value.trim().toLowerCase());
}

/** Publicación efectiva: evita mostrar borradores o publicaciones pendientes. */
export function isProductPublishedOnWeb(product: any): boolean {
  if (!product) return false;

  const webFlag = product.SHOW_IN_WEB ?? product.show_in_web;
  if (!isEnabled(webFlag)) return false;

  if (isEnabled(product.IS_DRAFT ?? product.is_draft)) return false;
  const status = String(product.STATUS ?? product.status ?? '').trim().toLowerCase();
  if (status === 'draft' || status === 'borrador') return false;
  if (isEnabled(product.WEB_PUBLISH_PENDING ?? product.web_publish_pending)) return false;

  const prices = [
    product.PRICE,
    product.price,
    product.WEBPRICE,
    product.web_price,
    product.CURRENTPRICE,
    product.current_price,
    product.precio_venta_1,
  ];
  return prices.some(value => Number.isFinite(Number(value)) && Number(value) > 0);
}
