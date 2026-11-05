'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getServices, getFirebaseConfig, COUPONS_COLLECTION } from '@/lib/db';
import { Query, Client, Databases } from '@/lib/db';
import { ArrowLeft, Ticket, Gift, Tag, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import CuentaPageShell from '@/components/cuenta/CuentaPageShell';
import { useCuentaBg } from '../CuentaBgContext';

const FF = '"DM Sans",system-ui,sans-serif';
const PINK = '#3b82f6';

const COUPON_IMG = 'https://cdn3d.iconscout.com/3d/premium/thumb/cupon-3d-icon-png-download-10660366.png';

interface Coupon {
  $id: string;
  CODE: string;
  DISCOUNTTYPE: string;
  DISCOUNTVALUE: number;
  MINORDERVALUE?: number;
  MAXUSES?: number;
  USEDCOUNT?: number;
  EXPIRYDATE?: string;
  ISACTIVE: boolean;
  DESCRIPTION?: string;
}

export default function CuponesPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  useCuentaBg('https://cdn3d.iconscout.com/3d/premium/thumb/cupon-3d-icon-png-download-10660366.png');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [welcomeCode, setWelcomeCode] = useState<string | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    (async () => {
      try {
        const { client, account } = getServices();
        const { databaseId } = getFirebaseConfig();
        const db = new Databases(client);
        let res;
        try {
          res = await db.listDocuments(databaseId, COUPONS_COLLECTION, [
            Query.equal('isActive', true),
            Query.orderDesc('$createdAt'),
            Query.limit(100),
          ]);
        } catch {
          res = await db.listDocuments(databaseId, COUPONS_COLLECTION, [
            Query.equal('ISACTIVE', true),
            Query.orderDesc('$createdAt'),
            Query.limit(100),
          ]);
        }

        const docs = res.documents.map((doc: any) => {
          const type = doc.type ?? doc.DISCOUNTTYPE ?? 'percent';
          const value = doc.value ?? doc.DISCOUNTVALUE ?? 0;
          const code = (doc.code ?? doc.CODE ?? '').toUpperCase();
          const isActive = doc.isActive ?? doc.ISACTIVE ?? true;
          const minPurchase = doc.minPurchase ?? doc.MINORDERVALUE ?? 0;
          const maxUses = doc.maxUses ?? doc.MAXUSES ?? 0;
          const usedCount = doc.usedCount ?? doc.USEDCOUNT ?? 0;
          
          let expiryDate = doc.EXPIRYDATE || null;
          if (!expiryDate && doc.expiresAt) {
            expiryDate = new Date(doc.expiresAt * 1000).toISOString();
          }

          return {
            $id: doc.$id,
            CODE: code,
            DISCOUNTTYPE: type,
            DISCOUNTVALUE: value,
            MINORDERVALUE: minPurchase,
            MAXUSES: maxUses,
            USEDCOUNT: usedCount,
            EXPIRYDATE: expiryDate,
            ISACTIVE: isActive,
            DESCRIPTION: doc.description ?? doc.DESCRIPTION ?? '',
            userRestriction: doc.userRestriction ?? doc.USERRESTRICTION ?? null,
          };
        });

        const filtered = docs.filter((c: any) => {
          if (!c.userRestriction || c.userRestriction.trim() === '' || c.userRestriction.trim().toLowerCase() === 'null') return true;
          const val = c.userRestriction.trim().toLowerCase();
          return (
            (user.id && user.id.toLowerCase() === val) ||
            (user.email && user.email.toLowerCase() === val)
          );
        });

        setCoupons(filtered);
        try {
          const acc = await account.get();
          const prefs = (acc as { prefs?: Record<string, unknown> }).prefs || {};
          if (prefs.welcomeCouponCode) setWelcomeCode(String(prefs.welcomeCouponCode));
        } catch { /* prefs opcionales */ }
      } catch (err) {
        console.error('Error loading coupons:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [isLoggedIn, user]);

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
        <Loader2 size={32} color={PINK} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div style={{ minHeight: '100vh', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <Ticket size={48} color={PINK} style={{ margin: '0 auto 16px' }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Iniciá sesión para ver tus cupones</p>
          <Link href="/login" style={{ display: 'inline-block', marginTop: 12, padding: '12px 28px', background: PINK, color: '#fff', borderRadius: 12, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  function getCouponStatus(c: Coupon): 'active' | 'expired' | 'used' {
    if (c.EXPIRYDATE && new Date(c.EXPIRYDATE) < new Date()) return 'expired';
    if (c.MAXUSES && c.USEDCOUNT && c.USEDCOUNT >= c.MAXUSES) return 'used';
    return 'active';
  }

  function formatExpiry(date?: string) {
    if (!date) return null;
    const d = new Date(date);
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <CuentaPageShell
      title="Mis Cupones"
      subtitle={`${coupons.length} cupón${coupons.length !== 1 ? 'es' : ''} disponible${coupons.length !== 1 ? 's' : ''}`}
    >
      <div style={{ fontFamily: FF }}>
        {/* Hero image */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: 'center', marginBottom: 28 }}
        >
          <img 
            src={COUPON_IMG}
            alt="Cupones"
            style={{ width: isMobile ? 200 : 280, height: 'auto', objectFit: 'contain', margin: '0 auto' }}
          />
        </motion.div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Loader2 size={28} color={PINK} style={{ animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : coupons.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: 20, border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.07)' }}
          >
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid rgba(59,130,246,0.15)' }}>
              <Ticket size={28} color={PINK} />
            </div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>No tenés cupones disponibles</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#6b7280' }}>Los cupones que recibas aparecerán aquí</p>
          </motion.div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {coupons.map((coupon, i) => {
              const status = getCouponStatus(coupon);
              const discountLabel = (coupon.DISCOUNTTYPE === 'percentage' || coupon.DISCOUNTTYPE === 'percent') ? `${coupon.DISCOUNTVALUE}%` : `$${coupon.DISCOUNTVALUE.toLocaleString()}`;
              return (
                <motion.div
                  key={coupon.$id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  style={{
                    background: '#fff',
                    borderRadius: 16,
                    border: '1px solid rgba(0,0,0,0.07)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.07)',
                    overflow: 'hidden',
                    opacity: status !== 'active' ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {/* Discount badge */}
                    <div style={{
                      minWidth: isMobile ? 80 : 100,
                      padding: isMobile ? '16px 12px' : '20px 16px',
                      background: status === 'active' ? 'linear-gradient(135deg, #eff6ff, #dbeafe)' : '#f3f4f6',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRight: '2px dashed rgba(0,0,0,0.07)',
                      position: 'relative',
                    }}>
                      <span style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: status === 'active' ? PINK : '#9ca3af', letterSpacing: '-0.02em' }}>
                        {discountLabel}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: status === 'active' ? PINK : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>
                        Descuento
                      </span>
                    </div>

                    {/* Coupon details */}
                    <div style={{ flex: 1, padding: isMobile ? '12px 14px' : '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <code style={{
                          fontSize: isMobile ? 12 : 14,
                          fontWeight: 800,
                          color: '#111827',
                          background: '#f3f4f6',
                          padding: '3px 10px',
                          borderRadius: 6,
                          letterSpacing: '0.05em',
                          border: '1px solid #e5e7eb',
                        }}>
                          {coupon.CODE}
                        </code>
                        {status === 'active' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#10b981', background: '#ecfdf5', padding: '2px 8px', borderRadius: 99, border: '1px solid #a7f3d0' }}>
                            <CheckCircle2 size={10} /> Activo
                          </span>
                        )}
                        {status === 'expired' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#ef4444', background: '#fef2f2', padding: '2px 8px', borderRadius: 99, border: '1px solid #fecaca' }}>
                            <XCircle size={10} /> Expirado
                          </span>
                        )}
                        {status === 'used' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 99, border: '1px solid #d1d5db' }}>
                            <XCircle size={10} /> Agotado
                          </span>
                        )}
                      </div>
                      
                      {coupon.DESCRIPTION && (
                        <p style={{ margin: '4px 0 0', fontSize: isMobile ? 11 : 13, color: '#6b7280', fontWeight: 500, lineHeight: 1.4 }}>
                          {coupon.DESCRIPTION}
                        </p>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                        {coupon.MINORDERVALUE && coupon.MINORDERVALUE > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#6b7280', fontWeight: 600 }}>
                            <Tag size={10} /> Mín. ${coupon.MINORDERVALUE.toLocaleString()}
                          </span>
                        )}
                        {coupon.EXPIRYDATE && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#6b7280', fontWeight: 600 }}>
                            <Clock size={10} /> {formatExpiry(coupon.EXPIRYDATE)}
                          </span>
                        )}
                        {coupon.MAXUSES && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#6b7280', fontWeight: 600 }}>
                            <Gift size={10} /> {coupon.USEDCOUNT || 0}/{coupon.MAXUSES} usados
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </CuentaPageShell>
  );
}
