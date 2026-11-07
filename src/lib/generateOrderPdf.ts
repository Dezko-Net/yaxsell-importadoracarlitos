import { Order, OrderItem } from '@/types';
import { orderQrSvg } from '@/lib/order-qr';
import type { ProductWarehouseLocation } from '@/lib/product-features';

function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(price);
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABELS: Record<string, string> = {
  pending:            'Pendiente',
  pending_stock:      'Stock Confirmado',
  processing:         'Pago a verificar',
  paid:               'Pago verificado',
  payment_expired:    'Pago vencido',
  payment_review:     'Revisando Pago',
  payment_confirmed:  'Pago Confirmado',
  assembling:         'Armando',
  preparing_shipping: 'Etiqueta lista',
  ready_to_ship:      'Pedido listo para enviar',
  shipped:            'Enviado',
  delivered:          'Entregado',
  cancelled:          'Cancelado',
};

export interface ProductExtraInfo {
  sku?: string;
  location?: ProductWarehouseLocation | null;
}

export interface VendorBranding {
  name?: string;
  color?: string;
  secondaryColor?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export interface OrderPdfProofPage {
  label: string;
  dataUrl: string;
}

export function buildOrderPdfHtml(
  order: Order,
  items: OrderItem[],
  productExtraInfo?: Record<string, ProductExtraInfo>,
  branding?: VendorBranding,
  options: { proofPages?: OrderPdfProofPage[] } = {},
) {
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]!));
  const safeColor = (value: string | undefined, fallback: string) => value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
  const printableItems = items.filter(i => !(i as any).missing);
  const hasSku = (productExtraInfo && printableItems.some(i => i.id && productExtraInfo[i.id]?.sku)) || printableItems.some(i => (i as any).sku);
  const hasLocations = productExtraInfo && printableItems.some(i => i.id && productExtraInfo[i.id]?.location?.label);
  const hasImages = printableItems.some(i => (i as any).img || (i as any).imageUrl);
  const statusLabel = STATUS_LABELS[order.STATUS] || order.STATUS;
  const date = formatDate(order.CREATEDAT);
  const subtotal = order.SUBTOTAL || items.reduce((s, i) => s + (i.total || i.price * i.qty), 0);
  const total = order.TOTAL || subtotal;
  const discount = order.DISCOUNT || (order as any).DISCOUNTAMOUNT || (subtotal - total > 0 ? subtotal - total : 0);
  const brandName = escapeHtml(branding?.name || 'Importadora Carlitos');
  const brandColor = safeColor(branding?.color, '#f97316');
  const brandSecondary = safeColor(branding?.secondaryColor, brandColor);
  const brandLogo = branding?.logoUrl ? `<img src="${escapeHtml(branding.logoUrl)}" style="width:38px;height:38px;border-radius:9px;background:#fff;object-fit:contain;padding:3px;" />` : `<div style="width:38px;height:38px;border-radius:9px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;">${brandName.slice(0, 2).toUpperCase()}</div>`;
  const brandSubtitle = escapeHtml([branding?.address, branding?.phone, branding?.email].filter(Boolean).join(' · ') || 'Información de la tienda');

  const itemsHtml = printableItems.map(i => {
    const extra = i.id ? productExtraInfo?.[i.id] : null;
    const loc = extra?.location?.label || null;
    const sku = extra?.sku || (i as any).sku || '';
    const note = (i as any).note || '';
    const original = (i as any).replacedOriginal || (i as any).originalItem;
    const isReplacement = !!(i as any).isCanjeReplacement || !!((i as any).replaced && original);
    const img = escapeHtml((i as any).img || (i as any).imageUrl || '');
    const imgHtml = img
      ? `<img src="${img}" style="width:104px;height:104px;object-fit:contain;border:1px solid #e5e7eb;border-radius:8px;padding:3px;background:#fff;" />`
      : `<div style="width:104px;height:104px;border:1px solid #e5e7eb;border-radius:8px;display:flex;align-items:center;justify-content:center;background:#f9fafb;font-size:11px;color:#9ca3af;">Sin img</div>`;
    const replacementLabel = isReplacement
      ? `<span style="display:inline-block;margin-left:6px;padding:2px 6px;border-radius:4px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-size:10px;font-weight:700;">(Reemplazado)</span>`
      : '';
    const originalHtml = isReplacement && original?.name
      ? `<div style="margin-top:5px;padding:4px 6px;border-left:3px solid #f59e0b;background:#fffbeb;color:#92400e;font-size:10px;">Anterior faltante: ${escapeHtml(original.name)}${original.sku ? ` · SKU: ${escapeHtml(original.sku)}` : ''}</div>`
      : '';
    return `
    <tr style="page-break-inside:avoid;break-inside:avoid;">
      ${hasImages ? `<td style="width:116px;padding:10px 6px;border-bottom:1px solid #f0f0f0;text-align:center;vertical-align:middle;">${imgHtml}</td>` : ''}
      <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;font-size:15px;color:#333;vertical-align:middle;">
        <div style="font-weight:700;">${escapeHtml(i.name)}${replacementLabel}</div>
        ${originalHtml}
        ${note ? `<div style="font-size:12px;color:#d97706;background:#fffbeb;border:1px solid #fef3c7;padding:4px 7px;border-radius:4px;margin-top:5px;display:inline-block;">💬 Nota: ${escapeHtml(note)}</div>` : ''}
      </td>
      ${hasSku ? `<td style="padding:8px 6px;border-bottom:1px solid #f0f0f0;font-size:12px;color:${brandSecondary};text-align:center;font-weight:600;font-family:monospace;">${escapeHtml(sku || '—')}</td>` : ''}
      ${hasLocations ? `<td style="padding:8px 6px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#4338ca;text-align:center;font-weight:600;">${escapeHtml(loc || '—')}</td>` : ''}
      <td style="padding:8px 6px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666;text-align:center;">${i.qty}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666;text-align:right;">${formatPrice(i.price)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#333;text-align:right;font-weight:600;">${formatPrice(i.total || i.price * i.qty)}</td>
    </tr>
  `;
  }).join('');

  const customerNote = (order as any).CUSTOMERNOTE || '';
  const proofPagesHtml = (options.proofPages || []).map((proof, index) => `
    <section class="proof-page">
      <h2>Comprobante de pago ${index + 1}${proof.label ? ` · ${escapeHtml(proof.label)}` : ''}</h2>
      <img src="${escapeHtml(proof.dataUrl)}" alt="Comprobante de pago ${index + 1}" />
    </section>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Pedido ${order.ORDERCODE}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4; margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; color: #0f172a; padding: 32px; margin: 0; }
    .sheet { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 40px rgba(15,23,42,0.10); border: 1px solid #e2e8f0; }
    @media print {
      body { padding: 0; background: #fff; }
      .sheet { box-shadow: none; border: none; border-radius: 0; max-width: none; }
      .no-print { display: none !important; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; break-inside: avoid; }
      .proof-page { page-break-before: always; break-before: page; min-height: 260mm; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; padding: 8mm 0; }
      .proof-page h2 { width: 100%; margin: 0 0 6mm; font-size: 18px; color: #0f172a; }
      .proof-page img { max-width: 100%; max-height: 225mm; object-fit: contain; }
    }
  </style>
</head>
<body>
  <div class="sheet">
  <!-- Brand header -->
  <div style="background:linear-gradient(135deg,${brandColor} 0%,${brandSecondary} 55%,${brandColor}dd 100%);color:#fff;padding:28px 40px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          ${brandLogo}
          <div style="line-height:1.1;">
            <div style="font-size:17px;font-weight:800;letter-spacing:.5px;">${brandName}</div>
            <div style="font-size:11px;opacity:.85;">${brandSubtitle}</div>
          </div>
        </div>
        <h1 style="font-size:22px;font-weight:800;letter-spacing:.3px;">Comprobante de Pedido</h1>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.8;">N° de pedido</div>
        <div style="font-size:22px;font-weight:800;margin:2px 0 8px;">${escapeHtml(order.ORDERCODE)}</div>
        <span style="display:inline-block;padding:4px 14px;border-radius:999px;background:rgba(255,255,255,0.2);font-size:12px;font-weight:700;border:1px solid rgba(255,255,255,0.35);">${escapeHtml(statusLabel)}</span>
      </div>
    </div>
  </div>

  <!-- Meta bar -->
  <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 40px;background:${brandSecondary}12;border-bottom:1px solid ${brandSecondary}35;font-size:12px;color:#1e3a8a;">
    <span><strong style="color:${brandSecondary};">Fecha de emisión:</strong> ${date}</span>
    <span style="font-family:monospace;color:${brandSecondary};">${escapeHtml(order.ORDERCODE)}</span>
  </div>

  <div style="padding:28px 40px 36px;">

  <div style="display:flex;justify-content:flex-end;gap:20px;margin-bottom:8px;">${order.$id ? `<div style="text-align:center;font-size:12px;font-weight:bold;color:#1e40af;"><div style="width:160px;height:160px;background:white;">${orderQrSvg(order.$id)}</div>Embalado</div><div style="text-align:center;font-size:12px;font-weight:bold;color:#b91c1c;"><div style="width:160px;height:160px;background:white;">${orderQrSvg(order.$id, 'shortage')}</div>Faltantes / devoluciones</div>` : ''}</div>

  <!-- Customer info -->
  <div style="display:flex;gap:16px;margin-bottom:${customerNote ? '16px' : '28px'};">
    <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">
      <p style="font-size:11px;font-weight:700;color:${brandSecondary};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Cliente</p>
      <p style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:3px;">${escapeHtml(order.CUSTOMERNAME || '-')}</p>
      <p style="font-size:13px;color:#475569;">${escapeHtml(order.CUSTOMERRUT || '')}</p>
      <p style="font-size:13px;color:#475569;">${escapeHtml(order.CUSTOMERPHONE || '')}</p>
      <p style="font-size:13px;color:#475569;">${escapeHtml(order.CUSTOMEREMAIL || '')}</p>
    </div>
    <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">
      <p style="font-size:11px;font-weight:700;color:${brandSecondary};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Envío</p>
      <p style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:3px;">${escapeHtml(order.SHIPPINGAGENCY || 'A coordinar')}</p>
      <p style="font-size:13px;color:#475569;">${escapeHtml(order.ADDRESS || '')}</p>
      <p style="font-size:13px;color:#475569;">${escapeHtml([order.COMUNA, order.REGION].filter(Boolean).join(', '))}</p>
    </div>
  </div>

  ${customerNote ? `
  <div style="margin-bottom:28px;background:#fffbeb;border:1px solid #fef3c7;padding:12px;border-radius:8px;">
    <p style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;margin-bottom:4px;">Nota del Cliente</p>
    <p style="font-size:13px;color:#92400e;">${escapeHtml(customerNote)}</p>
  </div>
  ` : ''}

  <!-- Items table -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <thead>
      <tr style="background:${brandSecondary}12;">
        ${hasImages ? '<th style="padding:11px 8px;text-align:center;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #bfdbfe;">Img</th>' : ''}
        <th style="padding:11px 8px;text-align:left;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #bfdbfe;">Producto</th>
        ${hasSku ? '<th style="padding:11px 8px;text-align:center;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #bfdbfe;">SKU</th>' : ''}
        ${hasLocations ? '<th style="padding:11px 8px;text-align:center;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #bfdbfe;">Sección</th>' : ''}
        <th style="padding:11px 8px;text-align:center;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #bfdbfe;">Cant.</th>
        <th style="padding:11px 8px;text-align:right;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #bfdbfe;">P. Unit.</th>
        <th style="padding:11px 8px;text-align:right;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #bfdbfe;">Total</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <!-- Totals -->
  <div style="margin-left:auto;width:290px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;">
    <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px;">
      <span style="color:#64748b;">Subtotal</span>
      <span style="color:#0f172a;font-weight:600;">${formatPrice(subtotal)}</span>
    </div>
    ${discount > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px;">
      <span style="color:#059669;">Descuento${order.COUPONCODE ? ' (' + order.COUPONCODE + ')' : ''}</span>
      <span style="color:#059669;font-weight:700;">-${formatPrice(discount)}</span>
    </div>` : ''}
    <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px;">
      <span style="color:#64748b;">Envío</span>
      <span style="color:${order.SHIPPINGCOST > 0 ? '#0f172a' : '#059669'};font-weight:600;font-size:${order.SHIPPINGCOST > 0 ? '14px' : '12px'};">
        ${order.SHIPPINGCOST > 0 ? formatPrice(order.SHIPPINGCOST) : 'Pago contraentrega'}
      </span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;margin-top:10px;background:linear-gradient(135deg,${brandSecondary},${brandSecondary});border-radius:9px;font-size:18px;font-weight:800;color:#fff;">
      <span>Total</span>
      <span>${formatPrice(total)}</span>
    </div>
  </div>

  <!-- Footer -->
  <div style="margin-top:36px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="font-size:12px;color:#475569;">Este documento es un comprobante de tu pedido. Consérvalo como referencia.</p>
    <p style="font-size:11px;color:#94a3b8;margin-top:4px;">${brandName}${brandSubtitle && brandSubtitle !== 'Información de la tienda' ? ` · ${brandSubtitle}` : ''} · Generado automáticamente</p>
  </div>

  </div><!-- /padding -->
  </div><!-- /sheet -->

  ${proofPagesHtml}

  <!-- Print button (non-print) -->
  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button onclick="window.print()" style="padding:13px 34px;background:linear-gradient(135deg,${brandSecondary},${brandSecondary});color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px ${brandSecondary}35;">
      Imprimir / Guardar PDF
    </button>
  </div>
</body>
</html>`;

  return html;
}

export function generateOrderPdf(
  order: Order,
  items: OrderItem[],
  productExtraInfo?: Record<string, ProductExtraInfo>,
  existingWindow?: Window | null,
  branding?: VendorBranding,
) {
  const html = buildOrderPdfHtml(order, items, productExtraInfo, branding);
  const printWindow = existingWindow || window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    // Auto-trigger print dialog after a brief delay
    setTimeout(() => printWindow.print(), 500);
  }
}

export function generateReplacementPdf(
  orderCode: string,
  replacements: { original: { name: string; sku: string; price: number; qty: number; img?: string }; newItems: { name: string; sku: string; price: number; qty: number; img?: string }[] }[],
  branding?: VendorBranding,
) {
  const brandSecondary = branding?.secondaryColor || '#4f46e5';
  const fmtP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);

  const replacementRows = replacements.map((r, idx) => {
    const origTotal = r.original.price * r.original.qty;
    const newTotal = r.newItems.reduce((s, n) => s + n.price * n.qty, 0);
    const diff = newTotal - origTotal;

    const origImg = r.original.img
      ? `<img src="${r.original.img}" style="width:100px;height:100px;object-fit:contain;border:1px solid #e5e7eb;border-radius:8px;padding:4px;background:#fff;" />`
      : `<div style="width:100px;height:100px;border:1px solid #e5e7eb;border-radius:8px;display:flex;align-items:center;justify-content:center;background:#f9fafb;font-size:11px;color:#9ca3af;">Sin imagen</div>`;

    const newItemsHtml = r.newItems.map(n => {
      const nImg = n.img
        ? `<img src="${n.img}" style="width:80px;height:80px;object-fit:contain;border:1px solid #d1fae5;border-radius:8px;padding:4px;background:#fff;" />`
        : `<div style="width:80px;height:80px;border:1px solid #d1fae5;border-radius:8px;display:flex;align-items:center;justify-content:center;background:#f0fdf4;font-size:10px;color:#9ca3af;">Sin imagen</div>`;
      return `
        <div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #f0fdf4;">
          ${nImg}
          <div style="flex:1;">
            <p style="font-size:13px;font-weight:600;color:#065f46;">${n.name}</p>
            <p style="font-size:11px;color:#6b7280;margin-top:2px;">SKU: <span style="font-family:monospace;font-weight:600;color:#7c3aed;">${n.sku || '—'}</span></p>
            <p style="font-size:12px;color:#374151;margin-top:2px;">${fmtP(n.price)} c/u × ${n.qty} = <strong>${fmtP(n.price * n.qty)}</strong></p>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div style="margin-bottom:24px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;page-break-inside:avoid;break-inside:avoid;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:${brandSecondary};color:#fff;font-size:12px;font-weight:700;">${idx + 1}</span>
          <span style="font-size:14px;font-weight:700;color:#374151;">Reemplazo ${idx + 1}</span>
        </div>
        <div style="display:flex;gap:24px;">
          <!-- Original -->
          <div style="flex:1;padding:12px;background:#fef2f2;border-radius:10px;border:1px solid #fecaca;">
            <p style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;margin-bottom:8px;">Producto Original</p>
            <div style="display:flex;gap:12px;align-items:flex-start;">
              ${origImg}
              <div style="flex:1;">
                <p style="font-size:13px;font-weight:600;color:#7f1d1d;">${r.original.name}</p>
                <p style="font-size:11px;color:#991b1b;margin-top:4px;">SKU: <span style="font-family:monospace;font-weight:600;">${r.original.sku || '—'}</span></p>
                <p style="font-size:12px;color:#374151;margin-top:4px;">${fmtP(r.original.price)} c/u × ${r.original.qty}</p>
                <p style="font-size:14px;font-weight:700;color:#7f1d1d;margin-top:4px;">Total: ${fmtP(origTotal)}</p>
              </div>
            </div>
          </div>
          <!-- Arrow -->
          <div style="display:flex;align-items:center;justify-content:center;">
            <span style="font-size:28px;color:#9ca3af;">→</span>
          </div>
          <!-- New products -->
          <div style="flex:1;padding:12px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;">
            <p style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;margin-bottom:8px;">Nuevo(s) Producto(s)</p>
            ${newItemsHtml}
            <div style="margin-top:8px;padding-top:8px;border-top:2px solid #bbf7d0;">
              <p style="font-size:14px;font-weight:700;color:#065f46;">Total reemplazo: ${fmtP(newTotal)}</p>
              ${diff > 0
                ? `<p style="font-size:12px;font-weight:600;color:#059669;margin-top:2px;">Saldo a favor: +${fmtP(diff)}</p>`
                : diff < 0
                ? `<p style="font-size:12px;font-weight:600;color:#ea580c;margin-top:2px;">Diferencia en contra: -${fmtP(Math.abs(diff))}</p>`
                : `<p style="font-size:12px;font-weight:600;color:#6b7280;margin-top:2px;">Sin diferencia</p>`
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Cambios de Pedido ${orderCode}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fff; color: #333; padding: 40px; max-width: 800px; margin: 0 auto; }
    @media print {
      body { padding: 20px; max-width: none; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid ${brandSecondary};">
    <div>
      <h1 style="font-size:22px;font-weight:700;color:${brandSecondary};">Resumen de Cambios</h1>
      <p style="font-size:13px;color:#999;margin-top:4px;">${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    </div>
    <div style="text-align:right;">
      <p style="font-size:18px;font-weight:700;color:#333;">${orderCode}</p>
      <span style="display:inline-block;padding:3px 12px;border-radius:12px;background:${brandSecondary}12;font-size:12px;font-weight:600;color:${brandSecondary};border:1px solid ${brandSecondary}45;">${replacements.length} reemplazo(s)</span>
    </div>
  </div>

  ${replacementRows}

  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button onclick="window.print()" style="padding:12px 32px;background:${brandSecondary};color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
      Imprimir / Guardar PDF
    </button>
  </div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }
}
