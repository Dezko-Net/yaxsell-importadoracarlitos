'use client';

import { useState, useEffect } from 'react';
import { Check, Loader2, ShoppingBag, Download, ChevronDown, ChevronUp } from 'lucide-react';

interface QuoteProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  image: string;
  group?: string;
}

interface QuoteGroupData {
  label: string;
  productIds: string[];
}

export default function CotizacionForm({ params }: { params: Promise<{ id: string }> }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<QuoteProduct[]>([]);
  const [resolvedId, setResolvedId] = useState('');
  const [groupsData, setGroupsData] = useState<QuoteGroupData[]>([]);
  const [discountPct, setDiscountPct] = useState(20);
  const [clientName, setClientName] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    params.then(p => setResolvedId(p.id));
  }, [params]);

  useEffect(() => {
    if (!resolvedId) return;
    fetch(`/api/admin/ia/cotizacion?id=${resolvedId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data?.success) {
          setProducts(data.cotizacion.products);
          setGroupsData(data.cotizacion.groups || []);
          setDiscountPct(data.cotizacion.discountPct || 20);
          setClientName(data.cotizacion.clientName || '');
        } else {
          setError('No se pudo cargar la cotización');
        }
      })
      .catch(() => setError('Error al cargar'))
      .finally(() => setLoading(false));
  }, [resolvedId]);

  const discountedPrice = (price: number) => Math.round(price * (1 - discountPct / 100));

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const selectProduct = (groupLabel: string, productId: string) => {
    setSelected(prev => {
      const next = { ...prev };
      if (next[groupLabel] === productId) {
        delete next[groupLabel];
        setQuantities(q => { const n = { ...q }; delete n[productId]; return n; });
      } else {
        next[groupLabel] = productId;
        setQuantities(q => ({ ...q, [productId]: 1 }));
      }
      return next;
    });
  };

  const setQty = (productId: string, qty: number) => {
    setQuantities(q => ({ ...q, [productId]: Math.max(1, qty) }));
  };

  const groupedProducts = groupsData.length > 0
    ? groupsData.map(gd => ({
        label: gd.label,
        items: products.filter(p => gd.productIds.includes(p.id)),
      }))
    : [{ label: 'Productos', items: products }];

  const selectedProducts = products.filter(p => Object.values(selected).includes(p.id));
  const totalDiscounted = selectedProducts.reduce((s, p) => s + discountedPrice(p.price) * (quantities[p.id] || 1), 0);
  const totalOriginal = selectedProducts.reduce((s, p) => s + p.price * (quantities[p.id] || 1), 0);

  const generatePdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rows = selectedProducts.map((p, i) => `
      <tr>
        <td style="text-align:center;padding:8px 6px;border-bottom:1px solid #eee;">${i + 1}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;">${p.image ? `<img src="${p.image}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;" />` : ''}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-weight:600;">${p.name}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;color:#666;">${p.sku}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;">${quantities[p.id] || 1}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;text-decoration:line-through;color:#999;">$${(p.price * (quantities[p.id] || 1)).toLocaleString('es-CL')}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#00a884;">$${(discountedPrice(p.price) * (quantities[p.id] || 1)).toLocaleString('es-CL')}</td>
      </tr>
    `).join('');

    const dateStr = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

    printWindow.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8" /><title>Cotización</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color:#1a1a1a; padding:40px; }
        .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px; border-bottom:3px solid #00a884; padding-bottom:20px; }
        .logo { font-size:28px; font-weight:800; color:#00a884; }
        .logo span { color:#1a1a1a; }
        .info { text-align:right; font-size:13px; color:#666; }
        h1 { font-size:22px; margin-bottom:6px; }
        .subtitle { font-size:13px; color:#666; margin-bottom:20px; }
        table { width:100%; border-collapse:collapse; font-size:13px; }
        th { background:#f0fdf4; padding:10px 6px; text-align:left; font-weight:700; color:#00a884; border-bottom:2px solid #00a884; }
        th.center { text-align:center; } th.right { text-align:right; }
        .totals { margin-top:20px; margin-left:auto; width:340px; }
        .totals-row { display:flex; justify-content:space-between; padding:8px 0; font-size:14px; }
        .totals-row.grand { border-top:2px solid #00a884; margin-top:8px; padding-top:12px; font-size:18px; font-weight:800; color:#00a884; }
        .footer { margin-top:40px; padding-top:20px; border-top:1px solid #eee; font-size:11px; color:#999; text-align:center; }
        .discount-badge { display:inline-block; background:#00a884; color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px; margin-left:8px; }
      </style></head><body>
        <div class="header">
          <div class="logo">Yaxsell <span>Iván</span></div>
          <div class="info"><b>Cotización N° ${resolvedId.slice(-6).toUpperCase()}</b><br/>${dateStr}<br/>${clientName ? 'Cliente: <b>' + clientName + '</b><br/>' : ''}Válida por 7 días</div>
        </div>
        <h1>Cotización al Mayor <span class="discount-badge">${discountPct}% OFF</span></h1>
        <p class="subtitle">Precios con descuento por compra por embalaje</p>
        <table><thead><tr>
          <th class="center" style="width:30px;">#</th><th style="width:60px;"></th><th>Producto</th><th style="width:100px;">SKU</th><th class="center" style="width:50px;">Cant.</th><th class="right" style="width:100px;">Precio Normal</th><th class="right" style="width:100px;">Precio Mayor</th>
        </tr></thead><tbody>${rows}</tbody></table>
        <div class="totals">
          <div class="totals-row"><span>Subtotal normal:</span><span>$${totalOriginal.toLocaleString('es-CL')}</span></div>
          <div class="totals-row"><span>Descuento (${discountPct}%):</span><span style="color:#e44;">-$${(totalOriginal - totalDiscounted).toLocaleString('es-CL')}</span></div>
          <div class="totals-row grand"><span>Total:</span><span>$${totalDiscounted.toLocaleString('es-CL')}</span></div>
        </div>
        <div class="footer">Importadora Carlitos · Tu tienda de belleza<br/>Esta cotización no reserva stock. Los precios están sujetos a confirmación de disponibilidad.</div>
        <script>window.onload=function(){window.print();}</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 className="h-8 w-8 animate-spin" style={{ color: '#00a884' }} /></div>;
  }
  if (error) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#94a3b8' }}>{error}</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '12px', paddingBottom: '80px', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <style>{`@media(min-width:768px){.cot-customer-wrap{padding:20px 16px;padding-bottom:20px}}`}</style>
      <div className="cot-customer-wrap" style={{ maxWidth: 1000, margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#00a884', marginBottom: 4 }}>Yaxsell <span style={{ color: '#0f172a' }}>Iván</span></div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Cotización al Mayor</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>{clientName ? `Hola ${clientName}! ` : ''}Elige un producto de cada categoría</p>
          <div style={{ display: 'inline-block', background: '#00a884', color: '#fff', fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 20, marginTop: 8 }}>
            {discountPct}% de descuento al mayor
          </div>
        </div>

        <div className="cot-customer-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          <style>{`@media(min-width:900px){.cot-customer-grid{grid-template-columns:1fr 320px !important;gap:16px !important}}`}</style>
          {/* Products grouped by category */}
          <div>
            {groupedProducts.map((grp, gi) => {
              const isCollapsed = collapsedGroups.has(grp.label);
              const selectedId = selected[grp.label];

              return (
                <div key={gi} style={{ background: '#fff', border: '2px solid #e2e8f0', borderRadius: 14, marginBottom: 16, overflow: 'hidden' }}>
                  <div
                    onClick={() => toggleGroup(grp.label)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', cursor: 'pointer', background: selectedId ? '#f0fdf4' : '#f8fafc', borderBottom: isCollapsed ? 'none' : '2px solid #e2e8f0' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <span style={{ background: '#00a884', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{gi + 1}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{grp.label}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>({grp.items.length})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {selectedId && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#00a884', background: '#dcfce7', padding: '3px 10px', borderRadius: 20 }}>
                          ✓ Seleccionado
                        </span>
                      )}
                      {isCollapsed ? <ChevronDown className="h-5 w-5" style={{ color: '#94a3b8' }} /> : <ChevronUp className="h-5 w-5" style={{ color: '#94a3b8' }} />}
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="cot-prod-grid" style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, boxSizing: 'border-box' }}>
                    <style>{`@media(min-width:640px){.cot-prod-grid{grid-template-columns:repeat(4,1fr) !important;gap:10px !important}}@media(min-width:900px){.cot-prod-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr)) !important;gap:12px !important}}`}</style>
                      {grp.items.map(p => {
                        const sel = selected[grp.label] === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => selectProduct(grp.label, p.id)}
                            style={{
                              background: sel ? '#f0fdf4' : '#fff',
                              border: `2px solid ${sel ? '#00a884' : '#e2e8f0'}`,
                              borderRadius: 10, padding: 8, cursor: 'pointer', position: 'relative', transition: 'all .15s',
                              boxShadow: sel ? '0 4px 14px rgba(0,168,132,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
                              overflow: 'hidden',
                            }}
                          >
                            {sel && (
                              <div style={{ position: 'absolute', top: 8, right: 8, background: '#00a884', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Check className="h-4 w-4" style={{ color: '#fff' }} />
                              </div>
                            )}
                            {p.image && <img src={p.image} alt={p.name} style={{ width: '100%', height: 70, objectFit: 'cover', borderRadius: 6, marginBottom: 4 }} />}
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', lineHeight: 1.2, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.name}</div>
                            <div style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 4 }}>SKU: {p.sku}</div>
                            <div>
                              <div style={{ fontSize: 9, textDecoration: 'line-through', color: '#94a3b8' }}>${p.price.toLocaleString('es-CL')}</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: '#00a884' }}>${discountedPrice(p.price).toLocaleString('es-CL')}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cart sidebar */}
          <div className="cot-cart-panel" style={{ background: '#fff', border: '2px solid #e2e8f0', borderRadius: 14, padding: 14, position: 'static', maxHeight: 'none', overflowY: 'visible' }}>
          <style>{`@media(min-width:900px){.cot-cart-panel{position:sticky !important;top:20px !important;max-height:calc(100vh - 40px) !important;overflow-y:auto !important}}`}</style>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingBag className="h-5 w-5" style={{ color: '#00a884' }} />
              Mi Selección ({selectedProducts.length})
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {selectedProducts.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', borderRadius: 8, padding: 8 }}>
                  {p.image && <img src={p.image} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 1 }}>{p.group || ''}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#00a884', fontWeight: 700 }}>${discountedPrice(p.price).toLocaleString('es-CL')} c/u</div>
                  </div>
                  <input type="number" min={1} value={quantities[p.id] || 1} onChange={(e) => setQty(p.id, Number(e.target.value) || 1)} style={{ width: 48, padding: '4px 6px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, textAlign: 'center', outline: 'none' }} />
                </div>
              ))}
              {selectedProducts.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#cbd5e1', fontSize: 13 }}>Elige un producto de cada categoría</div>}
            </div>

            {selectedProducts.length > 0 && (
              <>
                <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 12, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: '#64748b' }}>Subtotal:</span>
                    <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>${totalOriginal.toLocaleString('es-CL')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: '#64748b' }}>Ahorro ({discountPct}%):</span>
                    <span style={{ color: '#ef4444' }}>-${(totalOriginal - totalDiscounted).toLocaleString('es-CL')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: '#00a884', marginTop: 6 }}>
                    <span>Total:</span><span>${totalDiscounted.toLocaleString('es-CL')}</span>
                  </div>
                </div>
                <button onClick={generatePdf} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: '#00a884', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  <Download className="h-4 w-4" /> Descargar Cotización PDF
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
