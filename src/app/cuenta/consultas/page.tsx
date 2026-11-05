'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Query } from '@/lib/db';
import { getServices, getFirebaseConfig, STOCK_ALERTS_COLLECTION, INVENTORY_PRODUCTS_COLLECTION } from '@/lib/db';
import { normalizeStockAlert, type StockAlert } from '@/lib/stock-alerts';
import { useAuth } from '@/hooks/useAuth';
import { useCuentaBg } from '../CuentaBgContext';
import { Bell, CheckCircle, XCircle, Clock, Package, ArrowLeft } from 'lucide-react';

const PINK = '#3b82f6';
const FF = '"DM Sans","Proxima Nova",-apple-system,BlinkMacSystemFont,sans-serif';
const BG_CONSULTAS = 'https://images.unsplash.com/photo-1556742049-0cfed4f6351a?w=800&q=80';

interface StockAlertView extends StockAlert {}

export default function ConsultasPage() {
  const { user, isLoggedIn } = useAuth();
  const [alerts, setAlerts] = useState<StockAlertView[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useCuentaBg(BG_CONSULTAS);

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    const load = async () => {
      try {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        const res = await databases.listDocuments(databaseId, STOCK_ALERTS_COLLECTION, [
          Query.equal('userId', user.id),
          Query.orderDesc('createdAt'),
          Query.limit(100),
        ]);
        
        const rawAlerts = res.documents.map((d: any) => normalizeStockAlert(d));
        
        // Resolve Products Details in memory
        const uniqueProductIds = Array.from(new Set(rawAlerts.map(a => a.productId).filter(Boolean)));
        const productMap: Record<string, { name: string; image: string }> = {};
        
        if (uniqueProductIds.length > 0) {
          try {
            const prodRes = await databases.listDocuments(databaseId, INVENTORY_PRODUCTS_COLLECTION, [
              Query.equal('$id', uniqueProductIds),
              Query.limit(100),
            ]);
            prodRes.documents.forEach((p: any) => {
              let img = '';
              if (p.IMAGES && p.IMAGES.length > 0) {
                try {
                  const parsed = JSON.parse(p.IMAGES);
                  if (parsed && parsed.length > 0) img = parsed[0];
                } catch {
                  if (typeof p.IMAGES === 'string') img = p.IMAGES;
                }
              } else {
                img = p.IMAGEURL || p.IMAGEURL2 || p.IMAGE_URL || p.imageUrl || '';
              }
              productMap[p.$id] = {
                name: p.NAME || p.name || 'Producto sin nombre',
                image: img,
              };
            });
          } catch (e) {
            console.error('Error fetching products for account queries', e);
          }
        }
        
        const resolvedAlerts = rawAlerts.map(a => ({
          ...a,
          productName: productMap[a.productId]?.name || a.productName || 'Producto sin nombre',
          productImage: productMap[a.productId]?.image || a.productImage || '',
        }));
        
        setAlerts(resolvedAlerts);
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    };
    load();
  }, [isLoggedIn, user]);

  const timeAgo = (ts: number) => {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `hace ${days}d`;
  };

  const pending = alerts.filter(a => a.status === 'pending');
  const available = alerts.filter(a => a.status === 'available');
  const unavailable = alerts.filter(a => a.status === 'unavailable');

  if (!isLoggedIn) return (
    <div style={{ fontFamily: FF, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <Bell size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
        <p style={{ fontSize: 16, fontWeight: 600, color: '#6b7280' }}>Inicia sesión para ver tus consultas</p>
        <Link href="/login" style={{ display: 'inline-block', marginTop: 12, padding: '10px 24px', background: PINK, color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Iniciar sesión</Link>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: FF, minHeight: '100vh', padding: '20px 16px 40px', maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/cuenta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, background: 'rgba(0,0,0,0.05)', textDecoration: 'none' }}>
          <ArrowLeft size={18} color="#333" />
        </Link>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#111', margin: 0 }}>Consultas de Disponibilidad</h1>
          <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{alerts.length} consulta{alerts.length !== 1 ? 's' : ''} realizada{alerts.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 24 }}>
        <div style={{ background: '#eff6ff', borderRadius: 12, padding: 14, textAlign: 'center', border: '1px solid #dbeafe' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#2563eb' }}>{pending.length}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.5px' }}>Pendientes</div>
        </div>
        <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 14, textAlign: 'center', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a' }}>{available.length}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '.5px' }}>Disponibles</div>
        </div>
        <div style={{ background: '#fef2f2', borderRadius: 12, padding: 14, textAlign: 'center', border: '1px solid #fecaca' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#dc2626' }}>{unavailable.length}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.5px' }}>No disponibles</div>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ width: 32, height: 32, border: '3px solid #f3f3f3', borderTop: `3px solid ${PINK}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : alerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Package size={48} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', margin: '0 0 4px' }}>Sin consultas</p>
          <p style={{ fontSize: 13, color: '#d1d5db', margin: 0 }}>Explora el catálogo y consulta disponibilidad</p>
          <Link href="/productos" style={{ display: 'inline-block', marginTop: 16, padding: '10px 24px', background: PINK, color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Ver Catálogo</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alerts.map(a => (
            <Link key={a.$id} href={a.status === 'available' ? `/producto/${a.productId}` : '#'} style={{ textDecoration: 'none' }}>
              <div style={{
                background: a.status === 'pending' ? '#fffbf5' : a.status === 'available' ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${a.status === 'pending' ? '#dbeafe' : a.status === 'available' ? '#bbf7d0' : '#fecaca'}`,
                borderRadius: 14, padding: 14, display: 'flex', gap: 12, alignItems: 'center',
                transition: 'transform .15s, box-shadow .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {a.productImage ? (
                  <img src={a.productImage} alt={a.productName} style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 10, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Package size={22} color="#9ca3af" />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.productName}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    {a.status === 'pending' && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={11} /> En revisión
                      </span>
                    )}
                    {a.status === 'available' && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <CheckCircle size={11} /> ¡Disponible!
                      </span>
                    )}
                    {a.status === 'unavailable' && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <XCircle size={11} /> Sin stock
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#aaa' }}>· {timeAgo(a.createdAt)}</span>
                    {(a.quantity ?? 1) > 1 && <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>x{a.quantity}</span>}
                  </div>
                </div>
                {a.status === 'available' && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: PINK, color: '#fff', padding: '5px 12px', borderRadius: 8, whiteSpace: 'nowrap' }}>Comprar</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
