import type { BulkPaymentReviewOrder } from '@/components/admin/BulkPaymentReviewModal';
import { parsePaymentProofs } from '@/lib/payment-proofs';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

const money = (value: unknown) => new Intl.NumberFormat('es-CL', {
  style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
}).format(Number(value) || 0);

function safeImageUrl(value: string): string {
  const raw = String(value || '').trim();
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(raw)) return raw;
  try {
    const baseUrl = typeof window === 'undefined'
      ? process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      : window.location.origin;
    const url = new URL(raw, baseUrl);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

export function buildBulkPaymentReviewPrintHtml(orders: BulkPaymentReviewOrder[]): string {
  const sheets = orders.map((order, index) => {
    const proofs = parsePaymentProofs(order.PAYMENTPROOFURL).map((url, proofIndex) => {
      const safeUrl = safeImageUrl(url);
      const isPdf = /(?:\.pdf(?:\?|$)|[?&]ext=pdf(?:&|$))/i.test(url);
      return safeUrl
        ? isPdf
          ? `<a class="proof-link" href="${escapeHtml(safeUrl)}">Comprobante ${proofIndex + 1}: abrir PDF</a>`
          : `<img class="proof-image" src="${escapeHtml(safeUrl)}" alt="Comprobante ${proofIndex + 1}" />`
        : `<p class="proof-missing">Comprobante ${proofIndex + 1}: archivo no disponible</p>`;
    }).join('');
    const items = order.ITEMS.map(item => `
      <tr>
        <td>${escapeHtml(item.name)}${item.sku ? `<small>Código: ${escapeHtml(item.sku)}</small>` : ''}</td>
        <td class="center">${Number(item.qty) || 0}</td>
        <td class="right">${money(item.price)}</td>
        <td class="right">${money(item.total || item.qty * item.price)}</td>
      </tr>`).join('');
    const date = order.CREATEDAT ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(order.CREATEDAT) : 'Fecha no disponible';
    return `
      <article class="sheet">
        <header class="heading">
          <div><p class="store">Importadora Carlitos Mayorista</p><h1>Revisión de pago</h1><p class="subheading">${escapeHtml(order.IS_VENDOR_ORDER ? order.VENDOR_NAME || 'Tienda aliada' : 'Pedido de tienda principal')}</p></div>
          <div class="order-code"><span>Pedido</span><strong>${escapeHtml(order.ORDERCODE || order.$id)}</strong><small>${escapeHtml(date)}</small></div>
        </header>
        <section class="customer">
          <h2>Datos del cliente</h2>
          <div class="customer-grid">
            <p><span>Nombre</span><strong>${escapeHtml(order.CUSTOMERNAME || 'No registrado')}</strong></p>
            <p><span>RUT</span><strong>${escapeHtml(order.CUSTOMERRUT || 'No registrado')}</strong></p>
            <p><span>Teléfono</span><strong>${escapeHtml(order.CUSTOMERPHONE || 'No registrado')}</strong></p>
            <p><span>Correo</span><strong>${escapeHtml(order.CUSTOMEREMAIL || 'No registrado')}</strong></p>
            <p><span>Medio de pago</span><strong>${escapeHtml(order.PAYMENTMETHOD || 'No registrado')}</strong></p>
          </div>
        </section>
        <section class="products">
          <h2>Detalle del pedido</h2>
          <table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${items || '<tr><td colspan="4">Sin detalle de productos</td></tr>'}</tbody></table>
          <div class="totals">
            ${order.SUBTOTAL ? `<p><span>Subtotal</span><strong>${money(order.SUBTOTAL)}</strong></p>` : ''}
            ${order.DISCOUNTAMOUNT ? `<p><span>Descuento</span><strong>−${money(order.DISCOUNTAMOUNT)}</strong></p>` : ''}
            ${order.SHIPPINGCOST ? `<p><span>Despacho</span><strong>${money(order.SHIPPINGCOST)}</strong></p>` : ''}
            <p class="grand-total"><span>Total pedido</span><strong>${money(order.TOTAL)}</strong></p>
          </div>
        </section>
        <section class="proofs"><h2>Comprobante${parsePaymentProofs(order.PAYMENTPROOFURL).length === 1 ? '' : 's'} de pago</h2><div class="proof-grid">${proofs || '<p class="proof-missing">No hay comprobante adjunto</p>'}</div></section>
        <footer>Documento de revisión ${index + 1} de ${orders.length} · Imprimir o guardar como PDF</footer>
      </article>`;
  }).join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Revisión de pagos</title><style>
    *{box-sizing:border-box}body{margin:0;color:#172033;font-family:Arial,Helvetica,sans-serif;background:#eef2f7}.sheet{width:210mm;min-height:297mm;margin:10mm auto;padding:12mm;background:#fff;display:flex;flex-direction:column;gap:7mm;page-break-after:always;break-after:page;box-shadow:0 2px 12px #0f172a18}.sheet:last-child{page-break-after:auto;break-after:auto}.heading{display:flex;justify-content:space-between;gap:12mm;border-bottom:2px solid #dbe5f1;padding-bottom:6mm}.store{margin:0 0 2mm;color:#2563eb;font-size:10pt;font-weight:700}.heading h1{margin:0;font-size:21pt}.subheading{margin:2mm 0 0;color:#64748b;font-size:9pt}.order-code{text-align:right;display:flex;flex-direction:column;gap:1.5mm}.order-code span,.customer p span{color:#64748b;font-size:8pt}.order-code strong{font-size:16pt}.order-code small{color:#64748b}.customer h2,.products h2,.proofs h2{margin:0 0 3mm;font-size:11pt}.customer{padding:4mm;background:#f8fafc;border:1px solid #e2e8f0;border-radius:3mm}.customer-grid{display:grid;grid-template-columns:1fr 1fr;gap:2.5mm 7mm}.customer p{margin:0;display:flex;flex-direction:column;gap:1mm}.customer p strong{font-size:9pt;overflow-wrap:anywhere}.products table{width:100%;border-collapse:collapse;font-size:8.5pt}.products th{padding:2.4mm;text-align:left;background:#eff6ff;color:#1e40af}.products td{padding:2.5mm;border-bottom:1px solid #e2e8f0}.products td small{display:block;color:#64748b;font-size:7pt;margin-top:1mm}.center{text-align:center}.right{text-align:right}.totals{margin:3mm 0 0 auto;width:70mm}.totals p{display:flex;justify-content:space-between;margin:0;padding:1.5mm 0;font-size:8.5pt}.grand-total{border-top:1px solid #cbd5e1;margin-top:1mm!important;padding-top:3mm!important;font-size:12pt!important;font-weight:700}.proof-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3mm;align-items:center}.proof-image{width:100%;height:70mm;object-fit:contain;border:1px solid #dbe3ed;border-radius:2mm;background:#f8fafc}.proof-link{color:#1d4ed8;font-size:10pt}.proof-missing{color:#b91c1c;font-size:9pt}.sheet footer{margin-top:auto;padding-top:3mm;border-top:1px solid #e2e8f0;text-align:right;color:#64748b;font-size:7pt}
    @page{size:A4 portrait;margin:0}@media print{body{background:#fff}.sheet{width:auto;min-height:297mm;margin:0;padding:10mm;box-shadow:none;break-inside:avoid;page-break-inside:avoid}.proof-image{height:62mm}}
  </style></head><body>${sheets}</body></html>`;
}
