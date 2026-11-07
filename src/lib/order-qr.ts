import { getPublicSiteUrl } from '@/lib/public-site-url';
import QRCode from 'qrcode';

export function orderScanLink(orderId: string, purpose: 'packing' | 'shortage' = 'packing'): string {
  const base = typeof window !== 'undefined' ? window.location.origin : getPublicSiteUrl();
  const page = purpose === 'shortage' ? 'faltantes' : 'comprobacion';
  return `${base}/admin/orders/${page}?pedido=${encodeURIComponent(orderId)}`;
}

export function orderQrSvg(orderId: string, purpose: 'packing' | 'shortage' = 'packing'): string {
  const qr = QRCode.create(orderScanLink(orderId, purpose), { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const squares: string[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (qr.modules.get(y, x)) squares.push(`M${x + 4} ${y + 4}h1v1h-1z`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${size + 8} ${size + 8}" shape-rendering="crispEdges" role="img" aria-label="Código para verificar el pedido"><rect width="100%" height="100%" fill="white"/><path d="${squares.join('')}" fill="black"/></svg>`;
}
