// Placeholder SVG inline (data URI) - no external requests, no Vercel issues
// Usar para productos/banners/logos sin imagen
export const PLACEHOLDER_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="#f5f5f5"/><text x="200" y="200" font-family="sans-serif" font-size="20" fill="#bbb" text-anchor="middle" dominant-baseline="middle">Sin imagen</text></svg>'
);

// Placeholder para logos (más chico, fondo oscuro)
export const PLACEHOLDER_LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60"><rect width="200" height="60" fill="#1a1a2e"/><text x="100" y="30" font-family="sans-serif" font-size="14" fill="#fff" text-anchor="middle" dominant-baseline="middle">Logo</text></svg>'
);

// Placeholder para banners (horizontal)
export const PLACEHOLDER_BANNER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><rect width="1200" height="400" fill="#f5f5f5"/><text x="600" y="200" font-family="sans-serif" font-size="28" fill="#bbb" text-anchor="middle" dominant-baseline="middle">Sin imagen</text></svg>'
);
