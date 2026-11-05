'use client';

import { useEffect, useState } from 'react';
import {
  Gift, Sparkles, CheckCircle2, Copy, ChevronRight,
  Star, Zap, Crown, PartyPopper,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getServices, getFirebaseConfig, COUPONS_COLLECTION_ID, APERTURA_SETTINGS_COLLECTION_ID } from '@/lib/db';
import { Query } from '@/lib/db';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import CuentaPageShell from '@/components/cuenta/CuentaPageShell';
import WelcomeGiftSuccess from '@/components/WelcomeGiftSuccess';
import { useCuentaBg } from '../CuentaBgContext';

const FF = '"DM Sans",system-ui,sans-serif';
const PINK = '#3b82f6';

function fireCelebration() {
  confetti({ particleCount: 120, spread: 80, origin: { y: 0.55 }, colors: ['#3b82f6', '#f43f5e', '#fbbf24', '#fff'] });
  setTimeout(() => {
    confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#3b82f6', '#fff'] });
    confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#f43f5e', '#fff'] });
  }, 200);
}

export default function RegalosPage() {
  const { user, isLoggedIn } = useAuth();
  useCuentaBg('linear-gradient(135deg, #1e3a8a, #3b82f6)');
  const [showWelcomeReward, setShowWelcomeReward] = useState(false);
  const [claimedCode, setClaimedCode] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [discountPercent, setDiscountPercent] = useState(20);

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    loadRewardData();
  }, [isLoggedIn, user]);

  async function loadRewardData() {
    if (!user?.id) return;
    try {
      const { account } = getServices();
      const acc = await account.get();
      const prefs = (acc as { prefs?: Record<string, unknown> }).prefs || {};

      if (prefs.hasMadeFirstPurchase) {
        setShowWelcomeReward(false);
        setLoading(false);
        return;
      }

      setShowWelcomeReward(false);
      setDiscountPercent(0);
      
      if (prefs.firstPurchaseActive) {
        setClaimedCode('ACTIVADO');
        setJustClaimed(false);
      } else {
        setJustClaimed(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function claimWelcomeReward() {
    if (!user?.id) return;
    setClaiming(true);
    try {
      const { account } = getServices();
      const acc = await account.get();
      const prefs = (acc as { prefs?: Record<string, unknown> }).prefs || {};
      
      if (prefs.hasMadeFirstPurchase) {
        setShowWelcomeReward(false);
        return;
      }

      await account.updatePrefs({
        ...prefs,
        firstPurchaseActive: true,
        welcomeGiftClaimed: true, // mantenemos compatibilidad por si acaso
      });
      
      setClaimedCode('ACTIVADO');
      setJustClaimed(true);
      fireCelebration();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('apertura-gift-claimed'));
      }
    } catch (err) {
      console.error('Error claiming reward', err);
    } finally {
      setClaiming(false);
    }
  }

  function copyCouponCode() {
    if (!claimedCode) return;
    navigator.clipboard.writeText(claimedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', fontFamily: FF }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #dbeafe', borderTopColor: PINK }}
        />
      </motion.div>
    );
  }

  return (
    <CuentaPageShell
      title="Regalos"
      subtitle="Premios por tu registro y la gran apertura"
    >
      <div style={{ fontFamily: FF }}>
      <AnimatePresence>
        {showWelcomeReward && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ marginBottom: 28 }}
          >
            {/* Hero premio */}
            <div
              style={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 28,
                padding: '32px 28px 28px',
                background: 'linear-gradient(145deg, #eff6ff 0%, #dbeafe 35%, #60a5fa 70%, #f472b6 100%)',
                boxShadow: '0 20px 50px rgba(59,130,246,0.28)',
                marginBottom: 16,
              }}
            >
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    opacity: [0.2, 0.8, 0.2],
                    y: [0, -20 - (i % 5) * 8, 0],
                    scale: [1, 1.2, 1],
                  }}
                  transition={{ duration: 2 + (i % 4), repeat: Infinity, delay: i * 0.15 }}
                  style={{
                    position: 'absolute',
                    left: `${(i * 17) % 100}%`,
                    top: `${(i * 23) % 100}%`,
                    width: 3 + (i % 3),
                    height: 3 + (i % 3),
                    borderRadius: '50%',
                    background: '#fff',
                    pointerEvents: 'none',
                  }}
                />
              ))}

              <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
                <motion.div
                  animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.08, 1] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  style={{
                    width: 80, height: 80, margin: '0 auto 16px',
                    borderRadius: 24, background: 'rgba(255,255,255,0.15)',
                    border: '2px solid rgba(255,255,255,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  <Crown size={40} color="#fff" strokeWidth={1.5} />
                </motion.div>

                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 999,
                    background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                    fontSize: 10, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.14em',
                    marginBottom: 12,
                  }}
                >
                  <Star size={12} fill="#fff" /> Importadora Carlitos te premia
                </span>

                <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
                  ¡Regalo de Primera Compra!
                </h2>
                <p style={{ margin: '10px auto 0', fontSize: 14, color: 'rgba(255,255,255,0.9)', maxWidth: 340, lineHeight: 1.5, fontWeight: 500 }}>
                  Activa tu descuento exclusivo del 20% válido solo para tu primer pedido.
                </p>
              </div>
            </div>

            {/* Tarjeta del regalo */}
            <motion.div
              layout
              style={{
                background: '#fff',
                borderRadius: 24,
                padding: 28,
                border: '1px solid #dbeafe',
                boxShadow: '0 16px 48px rgba(59,130,246,0.12)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute', top: 0, right: 0, width: 180, height: 180,
                  background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }}
              />

              <AnimatePresence mode="wait">
                {!claimedCode ? (
                  <motion.div
                    key="claim"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <div
                      style={{
                        display: 'flex', alignItems: 'stretch', gap: 0,
                        borderRadius: 20, overflow: 'hidden',
                        border: '2px solid #dbeafe',
                        marginBottom: 20,
                      }}
                    >
                      <motion.div
                        animate={{ background: ['#60a5fa', '#3b82f6', '#60a5fa'] }}
                        transition={{ duration: 4, repeat: Infinity }}
                        style={{
                          width: 100, flexShrink: 0,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          padding: 16, color: '#fff',
                        }}
                      >
                        <Gift size={36} strokeWidth={1.5} />
                        <span style={{ fontSize: 28, fontWeight: 900, marginTop: 4, lineHeight: 1 }}>20%</span>
                        <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.9 }}>OFF</span>
                      </motion.div>
                      <div style={{ flex: 1, padding: '20px 22px', background: 'linear-gradient(135deg, #fffbeb, #fff)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <Zap size={14} color={PINK} fill={PINK} />
                          <span style={{ fontSize: 10, fontWeight: 800, color: PINK, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            Regalo Especial
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#111827' }}>20% de descuento</p>
                        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6b7280', lineHeight: 1.45 }}>
                          Válido en tu primera compra. Se aplicará a toda la tienda al instante.
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                          {['Exclusivo', 'Por tiempo limitado', 'Nuevos usuarios'].map((tag) => (
                            <span
                              key={tag}
                              style={{
                                padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                                background: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe',
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={claimWelcomeReward}
                      disabled={claiming}
                      style={{
                        width: '100%', padding: 18,
                        background: claiming ? '#9ca3af' : 'linear-gradient(135deg, #60a5fa, #3b82f6)',
                        color: '#fff', border: 'none', borderRadius: 18,
                        fontSize: 14, fontWeight: 900, cursor: claiming ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        boxShadow: '0 12px 32px rgba(59,130,246,0.4)',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}
                    >
                      {claiming ? (
                        <>
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                            style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }}
                          />
                          Generando tu premio...
                        </>
                      ) : (
                        <>
                          <PartyPopper size={20} /> Reclamar mi regalo <ChevronRight size={20} />
                        </>
                      )}
                    </motion.button>
                  </motion.div>
                ) : (
                  <WelcomeGiftSuccess
                    key="claimed"
                    percent={discountPercent}
                    couponCode={claimedCode}
                    onCopy={copyCouponCode}
                    copied={copied}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showWelcomeReward && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: '#fff', borderRadius: 24, padding: 56, textAlign: 'center',
            border: '1px solid #f3f4f6', boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
          }}
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            style={{ marginBottom: 20 }}
          >
            <Gift size={56} color="#e5e7eb" strokeWidth={1.5} />
          </motion.div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#374151', marginBottom: 8 }}>
            No tienes regalos disponibles
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: '#9ca3af', maxWidth: 280, marginLeft: 'auto', marginRight: 'auto' }}>
            Vuelve pronto: nuevas promociones y sorpresas exclusivas te esperan.
          </p>
        </motion.div>
      )}
      </div>
    </CuentaPageShell>
  );
}

