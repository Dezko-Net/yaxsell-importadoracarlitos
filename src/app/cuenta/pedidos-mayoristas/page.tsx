'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Package, Loader2, Clock, CheckCircle, XCircle, MessageCircle, RefreshCw, ChevronDown, ChevronUp, Truck, Shield, FileText, AlertTriangle, Box } from 'lucide-react';
import { getServices, getFirebaseConfig } from '@/lib/db';
import { WHOLESALE_ORDERS_COLLECTION_ID } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useCuentaBg } from '../CuentaBgContext';
import { Query } from '@/lib/db';
import CuentaPageShell from '@/components/cuenta/CuentaPageShell';
import { formatPrice } from '@/lib/db';

const FF = '"DM Sans",system-ui,sans-serif';
const AMBER = '#c68b59';
const AMBER_BG = '#fef9f4';

const STATUS_MAP: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  pending:            { label: 'Stock confirmado',      bg: '#e8f5e9', color: '#1b5e20', icon: <CheckCircle size={13} /> },
  pending_stock:      { label: 'Stock confirmado',      bg: '#e8f5e9', color: '#1b5e20', icon: <CheckCircle size={13} /> },
  processing:         { label: 'Stock confirmado',      bg: '#e8f5e9', color: '#1b5e20', icon: <CheckCircle size={13} /> },
  paid:               { label: 'Stock confirmado',      bg: '#e8f5e9', color: '#1b5e20', icon: <CheckCircle size={13} /> },
  payment_review:     { label: 'Revisando Pago',        bg: '#e3f2fd', color: '#1d4ed8', icon: <FileText size={13} /> },
  payment_confirmed:  { label: 'Pago confirmado',       bg: '#d1fae5', color: '#059669', icon: <CheckCircle size={13} /> },
  negotiation:        { label: 'Negociando',            bg: '#eff6ff', color: '#1d4ed8', icon: <MessageCircle size={13} /> },
  shipped:            { label: 'Embalado',              bg: '#faf5ff', color: '#6b21a8', icon: <Truck size={13} /> },
  delivered:          { label: 'Entregado a agencia',   bg: '#e8f5e9', color: '#166534', icon: <CheckCircle size={13} /> },
  cancelled:          { label: 'Cancelado',             bg: '#ffebee', color: '#c62828', icon: <XCircle size={13} /> },
};

const BG = 'https://img.freepik.com/free-photo/shipment-delivery-by-truck-bell-notification-delivery-transportation-concept-3d-rendering_56104-1309.jpg?semt=ais_hybrid&w=740&q=80';

export default function PedidosMayoristasPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  useCuentaBg(BG);
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn || !user) { router.push('/login'); return; }
    (async () => {
      setLoading(true);
      try {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        const res = await databases.listDocuments(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, [
          Query.equal('USERID', user.id),
          Query.orderDesc('$createdAt'),
          Query.limit(50),
        ]);
        setRequests(res.documents);
      } catch {
        try {
          const { databases } = getServices();
          const { databaseId } = getFirebaseConfig();
          const res2 = await databases.listDocuments(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, [
            Query.equal('CUSTOMEREMAIL', user.email || ''),
            Query.orderDesc('$createdAt'),
            Query.limit(50),
          ]);
          setRequests(res2.documents);
        } catch { setRequests([]); }
      } finally { setLoading(false); }
    })();
  }, [isLoggedIn, user, authLoading, router]);

  const formatDate = (ts: number | string) => {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const parseItems = (raw: string): any[] => {
    try { return JSON.parse(raw); } catch { return []; }
  };

  return (
    <CuentaPageShell
      title="Pedidos Mayoristas"
      subtitle="Seguí el estado de tus solicitudes mayoristas"
    >
      <div style={{ fontFamily: FF, maxWidth: 680, margin: '0 auto', padding: '0 12px 60px' }}>

        {/* Info banner */}
        <div style={{ padding: '12px 14px', borderRadius: 14, background: 'linear-gradient(135deg,#fef9f4,#fff8f0)', border: '1px solid #eed9c4', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <MessageCircle size={16} color={AMBER} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
            El stock de tu pedido se confirma automáticamente al recibirlo. Te avisamos por <strong>WhatsApp</strong> y podés ver el detalle de cada solicitud aquí.
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <Loader2 size={28} color={AMBER} style={{ animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 20px', background: '#fff', borderRadius: 20, border: '1px solid #eed9c4', boxShadow: '0 4px 20px rgba(198,139,89,0.06)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: AMBER_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Package size={28} color={AMBER} />
            </div>
            <p style={{ fontSize: 17, fontWeight: 800, color: '#374151', margin: '0 0 8px' }}>No tenés pedidos mayoristas</p>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px' }}>Visitá nuestro catálogo y comprá en cantidad.</p>
            <Link href="/productos" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: AMBER, color: '#fff', borderRadius: 12, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              <Package size={14} /> Ver productos
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {requests.map(req => {
              const status = STATUS_MAP[req.STATUS] || { label: req.STATUS || 'Desconocido', bg: '#f3f4f6', color: '#6b7280', icon: <Clock size={13} /> };
              const items = parseItems(req.ITEMS || '[]');
              const isExpanded = expandedId === req.$id;
              const createdAt = req.CREATEDAT || req.$createdAt;
              const reqCode = req.REQCODE || req.$id.slice(-8).toUpperCase();
              return (
                <div key={req.$id} style={{ background: '#fff', borderRadius: 16, border: '1px solid #eed9c4', overflow: 'hidden', boxShadow: '0 2px 12px rgba(198,139,89,0.05)' }}>
                  {/* Card header */}
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}
                    onClick={() => setExpandedId(isExpanded ? null : req.$id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: AMBER_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Package size={16} color={AMBER} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1a1a1a' }}>#{reqCode}</p>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 700, background: status.bg, color: status.color, whiteSpace: 'nowrap' }}>
                            {status.icon} {status.label}
                          </span>
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatDate(createdAt)} · {items.length} producto{items.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: AMBER, whiteSpace: 'nowrap' }}>{formatPrice(req.TOTAL || req.SUBTOTAL || 0)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Link href={`/pedido/${req.$id}`} onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: AMBER, color: '#fff', borderRadius: 8, fontSize: 10, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          Ver detalle
                        </Link>
                        {isExpanded ? <ChevronUp size={15} color="#9ca3af" /> : <ChevronDown size={15} color="#9ca3af" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #eed9c4', padding: '14px 16px', background: '#fef9f4' }}>
                      {/* Items list */}
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Productos solicitados</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {items.map((item: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#fff', borderRadius: 8, border: '1px solid #eed9c4' }}>
                              {item.img ? (
                                <img src={item.img} alt={item.name} style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 7, border: '1px solid #eed9c4', flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: 34, height: 34, borderRadius: 7, background: AMBER_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📦</div>
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                                <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9ca3af' }}>
                                  {item.isPack && item.packQty > 1 ? `Paquete de ${item.packQty} un.` : `x${item.qty}`}
                                </p>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: AMBER }}>{formatPrice(item.total || 0)}</p>
                                <p style={{ margin: '2px 0 0', fontSize: 9, color: '#9ca3af' }}>{formatPrice(item.price || 0)}/un.</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Delivery info */}
                      <div style={{ padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px solid #eed9c4', marginBottom: 10 }}>
                        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Entrega</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#374151', wordBreak: 'break-word' }}>{req.ADDRESS || '—'}</p>
                        {req.REGION && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>{req.COMUNA}, {req.REGION}</p>}
                        {req.SHIPPINGAGENCY && <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 700, color: AMBER }}>Agencia: {req.SHIPPINGAGENCY}</p>}
                      </div>

                      {/* Status messages */}
                      {(req.STATUS === 'pending_stock' || req.STATUS === 'pending' || req.STATUS === 'processing') && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: '#e8f5e9', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                          <CheckCircle size={14} color="#1b5e20" style={{ flexShrink: 0, marginTop: 1 }} />
                          <p style={{ margin: 0, fontSize: 11, color: '#1b5e20', lineHeight: 1.4 }}>
                            El stock de tu pedido está confirmado. Realiza la transferencia y sube tu comprobante de pago.
                          </p>
                        </div>
                      )}
                      {req.STATUS === 'paid' && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: '#e8f5e9', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                          <CheckCircle size={14} color="#1b5e20" style={{ flexShrink: 0, marginTop: 1 }} />
                          <p style={{ margin: 0, fontSize: 11, color: '#1b5e20', lineHeight: 1.4 }}>
                            El stock de tu pedido está confirmado. Realiza la transferencia y sube tu comprobante de pago.
                          </p>
                        </div>
                      )}
                      {req.STATUS === 'negotiation' && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #dbeafe' }}>
                          <MessageCircle size={14} color="#1d4ed8" style={{ flexShrink: 0, marginTop: 1 }} />
                          <p style={{ margin: 0, fontSize: 11, color: '#1e3a8a', lineHeight: 1.4 }}>
                            Estamos revisando la disponibilidad de algunos productos. Te contactaremos pronto.
                          </p>
                        </div>
                      )}
                      {req.STATUS === 'shipped' && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: '#faf5ff', borderRadius: 8, border: '1px solid #d8b4fe' }}>
                          <Truck size={14} color="#6b21a8" style={{ flexShrink: 0, marginTop: 1 }} />
                          <p style={{ margin: 0, fontSize: 11, color: '#581c87', lineHeight: 1.4 }}>
                            Tu pedido ya está en camino. Revisa el detalle para ver el comprobante de envío.
                          </p>
                        </div>
                      )}
                      {req.STATUS === 'delivered' && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: '#e8f5e9', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                          <CheckCircle size={14} color="#166534" style={{ flexShrink: 0, marginTop: 1 }} />
                          <p style={{ margin: 0, fontSize: 11, color: '#14532d', lineHeight: 1.4 }}>
                            Pedido entregado correctamente. ¡Gracias por tu compra!
                          </p>
                        </div>
                      )}
                      {req.STATUS === 'cancelled' && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: '#ffebee', borderRadius: 8, border: '1px solid #ef9a9a' }}>
                          <XCircle size={14} color="#c62828" style={{ flexShrink: 0, marginTop: 1 }} />
                          <p style={{ margin: 0, fontSize: 11, color: '#b71c1c', lineHeight: 1.4 }}>
                            Este pedido ha sido anulado.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CuentaPageShell>
  );
}
