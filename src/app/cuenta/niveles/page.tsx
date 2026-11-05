'use client';

import { useEffect, useState } from 'react';
import { Crown, Star, Gem, Award, Gift, TrendingUp, Coins, Calendar, Trophy, Copy, Check, Lock, ChevronRight, Sparkles, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { LoyaltyService } from '@/services/loyaltyService';
import { formatPrice } from '@/lib/db';
import { motion, Variants } from 'framer-motion';

const FF = '"DM Sans",system-ui,sans-serif';
const PINK = '#3b82f6';

const LEVELS = [
  { id: 'bronze', name: 'Bronce', icon: Award, color: '#cd7f32', bgColor: 'linear-gradient(135deg, #eaddcf, #d4a373)', requiredOrders: 0, pointsMultiplier: 1 },
  { id: 'silver', name: 'Plata', icon: Star, color: '#9ca3af', bgColor: 'linear-gradient(135deg, #f3f4f6, #9ca3af)', requiredOrders: 5, pointsMultiplier: 1.5 },
  { id: 'gold', name: 'Oro', icon: Crown, color: '#fbbf24', bgColor: 'linear-gradient(135deg, #fef3c7, #fbbf24)', requiredOrders: 10, pointsMultiplier: 2 },
  { id: 'diamond', name: 'Diamante', icon: Gem, color: '#38bdf8', bgColor: 'linear-gradient(135deg, #e0f2fe, #38bdf8)', requiredOrders: 20, pointsMultiplier: 3 },
  { id: 'ruby', name: 'Ruby', icon: Sparkles, color: '#f43f5e', bgColor: 'linear-gradient(135deg, #ffe4e6, #f43f5e)', requiredOrders: 30, pointsMultiplier: 5 },
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function NivelesPage() {
  const { user, isLoggedIn } = useAuth();
  const [loyaltyData, setLoyaltyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCoupon, setCopiedCoupon] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    loadData();
  }, [isLoggedIn, user]);

  async function loadData() {
    if (!user || !user.id) return;
    try {
      const data = await LoyaltyService.getLoyaltyData(user.id);
      setLoyaltyData(data);
    } catch (err) {
      console.error('Error loading loyalty data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function copyCouponCode(couponCode: string) {
    try {
      await navigator.clipboard.writeText(couponCode);
      setCopiedCoupon(couponCode);
      setTimeout(() => setCopiedCoupon(null), 2000);
    } catch (err) {
      console.error('Error copying coupon:', err);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', fontFamily: FF }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} style={{ width: 40, height: 40, border: '3px solid #f3f3f3', borderTop: `3px solid ${PINK}`, borderRadius: '50%' }} />
      </div>
    );
  }

  if (!loyaltyData) {
    return (
      <div style={{ minHeight: '100vh', padding: '24px', background: '#fafafa', fontFamily: FF }}>
        <p style={{ textAlign: 'center', color: '#6b7280' }}>Error al cargar datos de lealtad</p>
      </div>
    );
  }

  const currentLevelInfo = LEVELS.find(l => l.id === loyaltyData.currentLevel) || LEVELS[0];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: FF, paddingBottom: 60, paddingTop: 24 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
        
        {/* Header Section */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 40, textAlign: 'center' }}>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', marginBottom: 12, letterSpacing: '-0.03em' }}>
            Tu Programa de Lealtad
          </h1>
          <p style={{ fontSize: 16, color: '#64748b', maxWidth: 500, margin: '0 auto', lineHeight: 1.5 }}>
            Sube de nivel, desbloquea recompensas exclusivas y disfruta de beneficios VIP diseñados especialmente para ti.
          </p>
        </motion.div>

        {/* Global Stats Dashboard */}
        <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 40 }}>
          {[
            { icon: Trophy, label: 'Pedidos Completados', value: loyaltyData.paidOrdersCount, color: '#3b82f6', bg: '#eff6ff' },
            { icon: Coins, label: 'Puntos Acumulados', value: loyaltyData.points.toLocaleString(), color: '#f59e0b', bg: '#fef3c7' },
            { icon: TrendingUp, label: 'Inversión Total', value: formatPrice(loyaltyData.totalSpent), color: '#10b981', bg: '#ecfdf5' }
          ].map((stat, i) => (
            <motion.div variants={itemVariants} key={i} whileHover={{ y: -4 }} style={{ padding: 24, background: '#fff', borderRadius: 24, border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <stat.icon size={28} color={stat.color} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>{stat.value}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b', fontWeight: 600 }}>{stat.label}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 40 }}>
          
          {/* Path of Levels */}
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Award color={PINK} /> Todos los Niveles VIP
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              {LEVELS.map((level, i) => {
                const isCurrent = level.id === loyaltyData.currentLevel;
                const isUnlocked = loyaltyData.paidOrdersCount >= level.requiredOrders;
                const LevelIcon = level.icon;

                return (
                  <motion.div
                    key={level.id}
                    whileHover={{ scale: 1.02 }}
                    style={{
                      padding: 24,
                      background: isCurrent ? level.bgColor : isUnlocked ? '#fff' : '#f8fafc',
                      borderRadius: 24,
                      border: isCurrent ? 'none' : `1px solid ${isUnlocked ? '#e2e8f0' : '#f1f5f9'}`,
                      boxShadow: isCurrent ? `0 12px 30px ${level.color}33` : '0 4px 12px rgba(0,0,0,0.02)',
                      position: 'relative',
                      overflow: 'hidden',
                      opacity: isUnlocked ? 1 : 0.6,
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    {!isUnlocked && <Lock size={80} color="#cbd5e1" style={{ position: 'absolute', top: -10, right: -10, opacity: 0.2 }} />}
                    {isCurrent && (
                      <div style={{ position: 'absolute', top: 16, right: 16, background: '#fff', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, color: level.color }}>
                        ACTUAL
                      </div>
                    )}
                    
                    <div style={{ width: 48, height: 48, borderRadius: 16, background: isCurrent ? 'rgba(255,255,255,0.2)' : isUnlocked ? `${level.color}15` : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                      <LevelIcon size={24} color={isCurrent ? '#fff' : isUnlocked ? level.color : '#94a3b8'} strokeWidth={2.5} />
                    </div>
                    
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: isCurrent ? '#fff' : '#0f172a' }}>{level.name}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: isCurrent ? 'rgba(255,255,255,0.8)' : '#64748b', fontWeight: 600 }}>
                      Requiere {level.requiredOrders} pedidos
                    </p>
                    
                    <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: isCurrent ? 'rgba(255,255,255,0.15)' : '#f1f5f9', padding: '6px 12px', borderRadius: 8 }}>
                        <Zap size={14} color={isCurrent ? '#fff' : '#64748b'} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: isCurrent ? '#fff' : '#475569' }}>
                          Multiplicador x{level.pointsMultiplier}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>

          {/* Timeline History */}
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar color={PINK} /> Tu Historial de Progresión
            </h2>
            
            <div style={{ background: '#fff', borderRadius: 24, border: '1px solid rgba(0,0,0,0.04)', padding: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              {loyaltyData.levelHistory.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, position: 'relative' }}>
                  {/* Timeline connecting line */}
                  <div style={{ position: 'absolute', left: 24, top: 24, bottom: 24, width: 2, background: '#f1f5f9', zIndex: 0 }} />

                  {loyaltyData.levelHistory.slice().reverse().map((history: any, i: number) => {
                    const level = LEVELS.find(l => l.id === history.level);
                    const LevelIcon = level?.icon || Award;
                    const date = new Date(history.upgradedAt).toLocaleDateString('es-CL', { 
                      day: 'numeric', month: 'long', year: 'numeric'
                    });

                    return (
                      <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 * i }} key={i} style={{ display: 'flex', gap: 20, position: 'relative', zIndex: 1 }}>
                        {/* Timeline node */}
                        <div style={{ width: 50, height: 50, borderRadius: '50%', background: level?.bgColor || '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 0 4px #fff' }}>
                          <LevelIcon size={24} color="#fff" strokeWidth={2} />
                        </div>
                        
                        <div style={{ flex: 1, background: '#f8fafc', padding: 20, borderRadius: 16, border: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <h4 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Alcanzaste Nivel {level?.name || history.level}</h4>
                                {history.couponGenerated && <span style={{ padding: '2px 8px', background: '#ecfdf5', color: '#10b981', fontSize: 10, fontWeight: 800, borderRadius: 999, border: '1px solid #a7f3d0' }}>RECOMPENSA RECLAMADA</span>}
                              </div>
                              <p style={{ margin: 0, fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Calendar size={14} /> {date}
                              </p>
                            </div>
                          </div>

                          {history.couponGenerated && history.couponCode && (
                            <div style={{ marginTop: 16, padding: 16, background: '#fff', borderRadius: 12, border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                              <div>
                                <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Tu Cupón de Recompensa</p>
                                <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 900, color: PINK, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                                  {history.couponCode}
                                </p>
                              </div>
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => copyCouponCode(history.couponCode)}
                                style={{ padding: '10px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                              >
                                {copiedCoupon === history.couponCode ? <Check size={16} color="#34d399" /> : <Copy size={16} />}
                                {copiedCoupon === history.couponCode ? 'Copiado' : 'Copiar'}
                              </motion.button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <TrendingUp size={40} color="#cbd5e1" />
                  </div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Comienza tu viaje</h3>
                  <p style={{ margin: 0, fontSize: 14, color: '#64748b', maxWidth: 300, marginInline: 'auto' }}>
                    Completa tu primera compra para empezar a subir de nivel y desbloquear beneficios exclusivos.
                  </p>
                </div>
              )}
            </div>
          </motion.section>

        </div>
      </div>
    </div>
  );
}
