'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Sparkles, Gift, Ticket, Truck, Package, ArrowLeft, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import CuentaPageShell from '@/components/cuenta/CuentaPageShell';
import { useCuentaBg } from '../CuentaBgContext';
import { PointsStoreService, type PointsStoreItem } from '@/services/pointsStoreService';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { getLevelMeta } from '@/lib/loyalty-levels';

const PINK = '#3b82f6';
const FF = '"DM Sans",system-ui,sans-serif';

const TYPE_ICONS: Record<string, typeof Gift> = {
  product: Package,
  coupon: Ticket,
  offer: Sparkles,
  gift: Gift,
  shipping: Truck,
};

export default function PuntosPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  useCuentaBg('https://cdn3d.iconscout.com/3d/premium/thumb/star-3d-icon-png-download-11038354.png');
  const [items, setItems] = useState<PointsStoreItem[]>([]);
  const [balance, setBalance] = useState({ earned: 0, redeemed: 0, available: 0 });
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [loyaltyId, setLoyaltyId] = useState('bronze');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [list, pts] = await Promise.all([
        PointsStoreService.listActiveItems(),
        PointsStoreService.getUserPoints(user.id),
      ]);
      setItems(list);
      setBalance(pts);
      const { account } = await import('@/lib/firebase-compat').then((m) => m.getServices());
      const acc = await account.get();
      const prefs = (acc as { prefs?: Record<string, unknown> }).prefs || {};
      if (prefs.loyaltyLevel) setLoyaltyId(String(prefs.loyaltyLevel));
    } catch {
      setItems(await PointsStoreService.listActiveItems());
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isLoggedIn && user) load();
  }, [isLoggedIn, user, load]);

  const level = getLevelMeta(loyaltyId);

  async function handleRedeem(item: PointsStoreItem) {
    if (!user?.id || redeeming) return;
    if (balance.available < item.POINTSCOST) {
      setToast({ type: 'err', msg: 'No tienes suficientes puntos' });
      return;
    }
    if (!confirm(`¿Canjear "${item.TITLE}" por ${item.POINTSCOST.toLocaleString()} puntos?`)) return;
    setRedeeming(item.$id);
    const res = await PointsStoreService.redeemItem(user.id, item);
    setRedeeming(null);
    if (res.success) {
      setToast({
        type: 'ok',
        msg: res.code ? `¡Listo! Tu cupón ${res.code} quedó guardado en tu cuenta` : '¡Canje exitoso! Revisa tu cuenta o cupones',
      });
      load();
    } else {
      setToast({ type: 'err', msg: res.error || 'No se pudo canjear' });
    }
  }

  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Loader2 size={32} color={PINK} className="animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: FF }}>
        <p>Inicia sesión para ver tu tienda de puntos</p>
        <Link href="/login" style={{ color: PINK, fontWeight: 700 }}>Ingresar</Link>
      </div>
    );
  }

  return (
    <CuentaPageShell
      title="Tienda de puntos"
      subtitle="Canjea tus puntos VIP por recompensas exclusivas"
      backHref="/cuenta"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 16px',
              borderRadius: 14,
              marginBottom: 16,
              background: toast.type === 'ok' ? '#ecfdf5' : '#fef2f2',
              border: `1px solid ${toast.type === 'ok' ? '#a7f3d0' : '#fecaca'}`,
              color: toast.type === 'ok' ? '#065f46' : '#991b1b',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {toast.type === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {toast.msg}
            <button type="button" onClick={() => setToast(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}>✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Balance hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 24,
          padding: '28px 24px',
          marginBottom: 24,
          background: `linear-gradient(135deg, ${level.color}22, #eff6ff 40%, #fff)`,
          border: '1px solid rgba(59,130,246,0.2)',
          boxShadow: '0 12px 40px rgba(59,130,246,0.12)',
        }}
      >
        <div style={{ position: 'absolute', top: -30, right: -20, opacity: 0.15 }}>
          <Coins size={120} color={PINK} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, position: 'relative' }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: 1 }}>Puntos disponibles</p>
            <p style={{ margin: '8px 0 0', fontSize: 42, fontWeight: 900, color: '#111', letterSpacing: -1, lineHeight: 1 }}>
              {balance.available.toLocaleString()}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
              Ganados: {balance.earned.toLocaleString()} · Canjeados: {balance.redeemed.toLocaleString()}
            </p>
          </div>
          {level.badge && (
            <img src={level.badge} alt={level.name} style={{ width: 56, height: 56, objectFit: 'contain' }} />
          )}
        </div>
        <p style={{ margin: '16px 0 0', fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>
          Nivel {level.name} · multiplicador {level.pointsMultiplier}x en compras
        </p>
      </motion.div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={28} color={PINK} className="animate-spin" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {items.map((item, i) => {
            const Icon = TYPE_ICONS[item.TYPE] || Gift;
            const canAfford = balance.available >= item.POINTSCOST;
            const isRedeeming = redeeming === item.$id;

            return (
              <motion.div
                key={item.$id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                style={{
                  background: '#fff',
                  borderRadius: 20,
                  border: '1px solid #dbeafe',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: canAfford ? '0 8px 24px rgba(59,130,246,0.1)' : '0 2px 8px rgba(0,0,0,0.04)',
                  opacity: canAfford ? 1 : 0.85,
                }}
              >
                <div style={{ height: 120, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {item.IMAGEURL ? (
                    <img src={resolveStorageImageUrl(item.IMAGEURL)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Icon size={48} color={PINK} strokeWidth={1.5} />
                  )}
                  <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.9)', color: '#1e3a8a' }}>
                    {item.TYPE}
                  </span>
                </div>
                <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111' }}>{item.TITLE}</h3>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280', lineHeight: 1.45, flex: 1 }}>{item.DESCRIPTION}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: PINK }}>{item.POINTSCOST.toLocaleString()} pts</span>
                    <button
                      type="button"
                      disabled={!canAfford || isRedeeming}
                      onClick={() => handleRedeem(item)}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 999,
                        border: 'none',
                        background: canAfford ? `linear-gradient(135deg, ${PINK}, #2563eb)` : '#e5e7eb',
                        color: canAfford ? '#fff' : '#9ca3af',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: canAfford && !isRedeeming ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {isRedeeming ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {canAfford ? 'Canjear' : 'Faltan pts'}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <Link
        href="/cuenta"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 24,
          fontSize: 13,
          fontWeight: 600,
          color: PINK,
          textDecoration: 'none',
        }}
      >
        <ArrowLeft size={16} /> Volver a mi cuenta
      </Link>
    </CuentaPageShell>
  );
}
