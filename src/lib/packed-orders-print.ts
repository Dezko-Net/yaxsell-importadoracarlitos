export interface PackedListOrder {
  id: string; code: string; customer: string; rut: string; phone: string;
  agency: string; address: string; comuna: string; region: string; tracking: string;
  boxSizes?: string[]; boxCount?: number;
}

const escapeHtml = (value: unknown) => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function buildPackedListHtml(orders: PackedListOrder[]): string {
  const rows = orders.map((order, index) => `<tr>
    <td class="check"><span class="box"></span></td><td class="number">${index + 1}</td>
    <td><strong>${escapeHtml(order.code || order.id)}</strong><br><small>Embalado</small></td>
    <td><strong>${escapeHtml(order.customer || 'Sin nombre')}</strong>${order.rut ? `<br><small>RUT: ${escapeHtml(order.rut)}</small>` : ''}${order.phone ? `<br><small>Tel: ${escapeHtml(order.phone)}</small>` : ''}</td>
    <td><strong>${escapeHtml(order.agency || 'Sin agencia')}</strong><br><small>${escapeHtml([order.address, order.comuna, order.region].filter(Boolean).join(', ') || 'Sin dirección')}</small>${order.tracking ? `<br><small>Seguimiento: ${escapeHtml(order.tracking)}</small>` : ''}</td>
    <td class="boxes">${order.boxCount ? `${escapeHtml(order.boxCount)} caja(s)${order.boxSizes?.length ? `<br><small>${escapeHtml(order.boxSizes.join(', '))}</small>` : ''}` : '________'}</td></tr>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pedidos embalados</title><style>
    @page { size: A4; margin: 13mm; } * { box-sizing:border-box; } body { font: 12px Arial,sans-serif; color:#17213a; margin:0; }
    header { display:flex; justify-content:space-between; gap:12px; border-bottom:2px solid #1d4ed8; padding-bottom:10px; margin-bottom:14px; }
    h1 { margin:0 0 5px; font-size:20px; } p { margin:0; color:#475569; } .total { text-align:right; white-space:nowrap; font-weight:bold; }
    table { width:100%; border-collapse:collapse; } thead { display:table-header-group; } th { text-align:left; background:#edf4ff; color:#1e3a8a; padding:8px 6px; font-size:10px; } td { border-bottom:1px solid #cbd5e1; padding:10px 6px; vertical-align:top; overflow-wrap:anywhere; } tr { break-inside:avoid; page-break-inside:avoid; } small { color:#475569; font-size:10px; line-height:1.45; } .check { width:28px; } .number { width:25px; color:#64748b; } .box { display:block; width:15px; height:15px; border:1.5px solid #334155; } .boxes { width:65px; text-align:center; } .note { margin-top:12px; font-size:10px; } .controls { padding:16px 0; } button { padding:10px 18px; cursor:pointer; } @media print { .controls { display:none; } }
  </style></head><body><header><div><h1>Pedidos embalados</h1><p>Lista para preparar etiquetas y marcar pedidos revisados</p></div><div class="total">${orders.length} pedidos<br><small>${escapeHtml(new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' }))}</small></div></header>
  <table><thead><tr><th>✓</th><th>#</th><th>Pedido</th><th>Cliente</th><th>Agencia y destino</th><th>Bultos</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="note">Los pedidos sin cantidad registrada dejan el espacio en blanco. Lista de todos los pedidos que estaban en estado embalado al generarla.</p><div class="controls"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div></body></html>`;
}
