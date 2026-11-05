'use client';

import { useState, useEffect } from 'react';
import { Star, Gift, TrendingUp, Sparkles, Ticket, ChevronRight, CheckCircle2, ShoppingBag, DollarSign } from 'lucide-react';
import { getServices, getFirebaseConfig, ORDERS_COLLECTION } from '@/lib/db';
import { Query } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import { LoyaltyService } from '@/services/loyaltyService';

const POINTS_PER_1000 = 10;

// Animations for particles
const particleStyles = `
  @keyframes td_float {
    0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.6; }
    50% { transform: translateY(-10px) translateX(5px); opacity: 1; }
  }
  @keyframes td_drift {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(10px, -10px); }
  }
  .td_float { animation: td_float ease-in-out infinite alternate; }
  .td_drift { animation: td_drift ease-in-out infinite; }
`;

interface Tier {
  name: string;
  min: number;
  color: string;
  icon: string;
  bg: string;
  id: string;
  image?: string;
}

const TIERS: Tier[] = [
  { name: 'Bronce', min: 0, color: '#cd7f32', bg: '#fdf2f8', icon: '🥉', id: 'bronze', image: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907249364-pegada-1778907248432.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=UZgq9eKk4EDkubPxUsLcuOyhDwGUNUxTuFNQxue45QasYIo3%2F2vMtCU31qDrMbHwnqAYHb2ZWY%2FnLR%2FkVVQlxceKXZP1IS1aN4kErtTF4xTyhhIObTi0f6asQUXiMoVCsll9S3hH1RAo%2FS2Nph84uabU0wWlFnfvtMNvZ0TzRQyjIXfIC%2FqFUv%2BJ2Wz6wBAkUllDmuLiJeYUcsK7Jwmk6mtzhDC8m7EnCUO6RzWS3r10fLtX%2BufPfH3Y%2BKrmODsXffdhAYL7lL3D8eSNSJ%2Fkz4dzRXsdOko5%2BArkNBMdzHVOGbIvrlygMyNsiSuh%2BbCiqJK3r0wj6IyddiP%2Bwvo1Vw%3D%3D' },
  { name: 'Plata', min: 500, color: '#94a3b8', bg: '#f8fafc', icon: '🥈', id: 'silver', image: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907186962-pegada-1778907185830.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=f2tSbBlbVIfe2xa9YjBkd2dAcYKCTZNW%2FoleMZYIPn9R%2Fbh8fQI2Xtu1azuD%2BBr2E2gQXYOo7bbbxl4I9GP22DqQg0aYMd5I7MxQ4Z1DPt0xSIhW%2FMKtr39Be6uo%2B2o0Fg1XoSgngoqNRsdJmTSyOPBp3gk6nVKBu4A6Pvk3kwN8UAEzmvgTtFWVuWWltOKZsv6KNtX2X3GkopYLHIkN9DRpQAIh%2Foz3Ghjif%2FSQLsA7Be%2FUVL0TEMKyBu5xhDcJbNd3BFll8KTynlwI%2B5s%2Fi8uI9Iyg0q9DSU86JWYSZW89WDjKO4YukGuc%2BciL%2FchXuck9rzgoUqOR5gGGEMSSQQ%3D%3D' },
  { name: 'Oro', min: 2000, color: '#fbbf24', bg: '#fffbeb', icon: '🥇', id: 'gold', image: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907447447-pegada-1778907446361.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=SVPkcC3LBY2KhtE8vmzKcW2q0HoKNLDT5gSLAB6UjGGkRaoD6IZuOuV7XpTsEG4oI5BhjmOmEyKxdcFA4pHMc8XxwX4D4S%2BnuSs%2FADrfQsHuRSxY0%2BVnbrUZ%2BtJK8%2Fo5lizEIxPcyHlgbLjKsAJMcWppgD5O%2FWpQ5DzVGTCtoCX1hWXwPrwlzwjv8%2BmsKBPk0U9g%2B53MeilokwG%2BCyDZsJfHK4fE9P3bMFcs04B%2BYoEY3zhLLDLiGjwvp5uYCJ9sckBg7ki1EWYXAu13sX%2Fp5S3GXwtNh4QqJrv9FuP2EN2iUoWJXjz7hk7efafpvhS1GbORq%2FpwZJbPi1HIfWNoZA%3D%3D' },
  { name: 'Diamante', min: 5000, color: '#9ca3af', bg: '#f3f4f6', icon: '💎', id: 'diamond', image: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907790908-pegada-1778907790043.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=A%2FL9Y0VDAOZojqnk%2B2T%2Bz9QL7IH%2FaPi7YtOA4lAo3hsrrR29s91RDdWzwl9ZDCsXiW18zqqdYm7cS44ucw0sOD%2Fs7lE6JF%2B%2BtNKSLCxnuC18Xx7N0R%2FO5AvRVO4QwayS1hlwzfOgkGS9hSnXFIgC%2Filo9WnsHlAQBK1qJTxSKCaawiXUVVloTSHSqJGLLhAoiiiY1WpFLilBLnguj8l%2FqGF%2B9WTqyO%2Fq7YMr%2FJyVUU4t5llG0zVzh6HUmYGHC3HHMRqYBHVL6IAv%2FUge21gGoxg1wokBp9ph7Qf5ZEGLwdASua9Y67XqDQY6pu7%2BAu06A6eVyDFakG845%2FpSkAYjjA%3D%3D' },
  { name: 'Ruby', min: 10000, color: '#f43f5e', bg: '#ffe4e6', icon: '❤️', id: 'ruby', image: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778908226958-pegada-1778908225905.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=BqPLV4aHi9DTpG6dmp8HQD%2FPK%2BiL2gnkClQ3ZaSF1oyhQHyyTgBBu8l%2B43gHdJqACfsNv7SO0JJKxhRUNXbrUyu0hAZkGwlwLHgRfIOq%2BEEbE%2Brfrnz%2BJ5vBydNAFo3jdian%2Fd5Qx0G6pQ3cs45r%2BvI9ttjuz%2Fm%2FDhXoOWJqFk6APK43kC69by2GiW%2FVJ7SL%2BQ0Dj07MelRAdhiVWBT%2BIQhuhJ6w4TstSrUqHvkgBi4SqVN2gNQVQD1MHWQ4T0AJ8O8qXVvm96poxdusTPkzusKMZRGn7yglXGqNAn7ImNKKQ2CUNB6NEeoNSRquYckAVngc5ug8Xzza7JG6uhCDHQ%3D%3D' },
];
const PINK = '#e396bf';

function getTier(points: number): Tier {
  return [...TIERS].reverse().find(t => points >= t.min) || TIERS[0];
}

function getNextTier(points: number): Tier | null {
  const idx = TIERS.findIndex(t => points < t.min);
  return idx >= 0 ? TIERS[idx] : null;
}

export default function LoyaltyPoints({ compact = false }: { compact?: boolean }) {
  const { user, isLoggedIn } = useAuth();
  const [points, setPoints] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loyaltyLevelId, setLoyaltyLevelId] = useState('bronze');

  // Welcome coupon states
  const [showWelcomeReward, setShowWelcomeReward] = useState(false);
  const [selectedReward, setSelectedReward] = useState<'order_2' | 'product_5' | null>(null);
  const [claimedCode, setClaimedCode] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !user) { setLoading(false); return; }
    (async () => {
      try {
        const { databases, account } = getServices();
        const { databaseId } = getFirebaseConfig();
        
        // Fetch orders (solo pedidos pagados cuentan para subir de nivel)
        const res = await databases.listDocuments(databaseId, ORDERS_COLLECTION, [
          Query.equal('CUSTOMEREMAIL', user.email),
          Query.equal('STATUS', 'paid'),
          Query.limit(200),
        ]);
        
        const spent = res.documents.reduce((s: number, o: any) => s + (o.TOTAL || 0), 0);
        const pts = Math.floor((spent / 1000) * POINTS_PER_1000);
        
        setTotalSpent(spent);
        setPoints(pts);
        setOrderCount(res.total);

        // Check if welcome reward was claimed
        const acc = await account.get();
        const prefs = (acc as any).prefs || {};
        if (!prefs.welcomeGiftClaimed) {
          setShowWelcomeReward(true);
        }
        // Read loyalty level from prefs
        if (prefs.loyaltyLevel) {
          setLoyaltyLevelId(prefs.loyaltyLevel);
        }

      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [isLoggedIn, user]);

  async function claimWelcomeReward() {
    if (!selectedReward || !user?.id) return;
    setClaiming(true);
    try {
      const res = await LoyaltyService.generateWelcomeCoupon(user.id, selectedReward);
      if (res.success && res.couponCode) {
        setClaimedCode(res.couponCode);
        setTimeout(() => setShowWelcomeReward(false), 8000);
      }
    } catch (err) {
      console.error("Error claiming reward", err);
    } finally {
      setClaiming(false);
    }
  }

  if (!isLoggedIn || loading) return null;

  const tierByPoints = getTier(points);
  const tierById = TIERS.find(t => t.id === loyaltyLevelId);
  const tier = tierById && TIERS.indexOf(tierById) >= TIERS.indexOf(tierByPoints) ? tierById : tierByPoints;
  const next = getNextTier(points);
  const progress = next ? ((points - tier.min) / (next.min - tier.min)) * 100 : 100;

  if (compact) {
    return (
      <motion.div 
        whileHover={{ scale: 1.02 }}
        className="flex items-center gap-3 px-4 py-2 bg-white rounded-xl border border-gray-200 shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.015),0_1px_2px_0_rgba(0,0,0,0.025),0_2px_8px_0_rgba(0,0,0,0.035),0_4px_16px_0_rgba(0,0,0,0.02)]"
      >
        <span className="text-xl transform hover:scale-110 transition-transform">{tier.icon}</span>
        <div className="flex flex-col">
          <span className="text-sm font-black text-slate-900 leading-none">{points} <span className="text-[10px] text-pink-500 font-bold uppercase tracking-tight">pts</span></span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{tier.name}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <style>{`
        /* LoyaltyPoints — borde animado + micro-interacciones */
        .lp-card{
          border: 1px solid rgba(0,0,0,0.07);
          box-shadow: 0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.07), 0 16px 32px rgba(0,0,0,0.07);
        }
        .lp-tierIcon{
          position: relative;
        }
        @media (prefers-reduced-motion: reduce){
          .lp-card { animation: none !important; }
        }
        ${particleStyles}
      `}</style>
      
      {/* ── Welcome Reward (First Registration) ── */}
      <AnimatePresence>
        {showWelcomeReward && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.9, height: 0, overflow: 'hidden' }}
            className="bg-white rounded-[22px] p-1 relative overflow-hidden"
            style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.07), 0 16px 32px rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.07)' }}
          >
            {/* Background Glow */}
            <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-pink-100 rounded-full blur-[40px] opacity-40 z-0" />
            
            <div className="relative z-10 p-7 text-slate-900">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-400 flex items-center justify-center shadow-lg shadow-pink-200 flex-shrink-0">
                  <Gift size={28} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 leading-tight">¡Tu Regalo de Bienvenida!</h3>
                  <p className="text-sm text-slate-500 font-medium mt-1">Elige un beneficio exclusivo por tu primer registro.</p>
                </div>
              </div>

              {!claimedCode ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button 
                      onClick={() => setSelectedReward('order_2')}
                      className={`group p-4 rounded-2xl border-2 transition-all text-left relative overflow-hidden ${selectedReward === 'order_2' ? 'border-pink-500 bg-pink-50/30' : 'border-slate-100 bg-white hover:border-pink-200 hover:bg-pink-50/10'}`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className={`p-2 rounded-lg ${selectedReward === 'order_2' ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <Ticket size={20} />
                        </div>
                        {selectedReward === 'order_2' && <CheckCircle2 size={18} className="text-pink-500" />}
                      </div>
                      <p className="font-black text-base text-slate-900">2% de Descuento</p>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wide mt-1">Total del Pedido</p>
                    </button>

                    <button 
                      onClick={() => setSelectedReward('product_5')}
                      className={`group p-4 rounded-2xl border-2 transition-all text-left relative overflow-hidden ${selectedReward === 'product_5' ? 'border-pink-500 bg-pink-50/30' : 'border-slate-100 bg-white hover:border-pink-200 hover:bg-pink-50/10'}`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className={`p-2 rounded-lg ${selectedReward === 'product_5' ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <Sparkles size={20} />
                        </div>
                        {selectedReward === 'product_5' && <CheckCircle2 size={18} className="text-pink-500" />}
                      </div>
                      <p className="font-black text-base text-slate-900">5% de Descuento</p>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wide mt-1">En el Producto</p>
                    </button>
                  </div>
                  
                  <motion.button 
                    whileHover={selectedReward ? { scale: 1.01, translateY: -2 } : {}} 
                    whileTap={selectedReward ? { scale: 0.98 } : {}}
                    onClick={claimWelcomeReward}
                    disabled={!selectedReward || claiming}
                    className="w-full mt-4 py-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-black rounded-2xl disabled:opacity-50 disabled:grayscale transition-all flex items-center justify-center gap-2 shadow-[0_10px_25px_rgba(227,150,191,0.3)]"
                  >
                    {claiming ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Generando Cupón...
                      </div>
                    ) : (
                      <>¡RECLAMAR MI REGALO AHORA! <ChevronRight size={20} /></>
                    )}
                  </motion.button>
                </div>
              ) : (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6 bg-pink-50/50 rounded-2xl border border-pink-100">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={32} className="text-emerald-500" />
                  </div>
                  <p className="text-sm font-black text-slate-900 mb-2 uppercase tracking-wide">¡Tu Cupón ha sido Generado!</p>
                  <p className="text-xs text-slate-500 mb-4 px-4">Copia el código y úsalo al finalizar tu compra.</p>
                  <div className="bg-white border-2 border-emerald-500/20 text-emerald-600 text-2xl font-mono font-black py-4 px-8 rounded-2xl inline-block tracking-[0.2em] shadow-sm select-all">
                    {claimedCode}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Loyalty Points Card ── */}
      <div 
        className="bg-white rounded-[22px] overflow-hidden"
        style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.07), 0 16px 32px rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.07)' }}
      >
        {/* Tier Header */}
        <div className="p-8 pb-6 relative overflow-hidden">
          {/* Decorative shapes */}
          <div className="absolute top-[-40px] right-[-40px] w-[200px] h-[200px] rounded-full opacity-10 pointer-events-none" style={{ backgroundColor: tier.color, filter: 'blur(40px)' }} />
          
          <div className="flex items-center gap-6 relative z-10">
            <motion.div 
              whileHover={{ scale: 1.05, rotate: 5 }}
              whileTap={{ scale: 0.98, rotate: -3 }}
              className={`lp-tierIcon ${isMobile ? 'w-14 h-14 rounded-2xl text-2xl' : 'w-20 h-20 rounded-[28px] text-4xl'} flex items-center justify-center z-10`}
              style={{}}
            >
              <img 
                src={tier.image || ''}
                alt="Medalla"
                style={{ width: isMobile ? 56 : 80, height: isMobile ? 56 : 80, objectFit: 'contain' }}
              />
            </motion.div>
            <div>
              <div className="inline-flex items-center gap-1.5 mb-2 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider" style={{ backgroundColor: `${tier.color}15`, color: tier.color }}>
                Nivel {tier.name}
              </div>
              <h2 className={`${isMobile ? 'text-2xl' : 'text-4xl'} font-black text-slate-900 tracking-tight leading-none`}>
                {points.toLocaleString()} <span className="text-sm font-bold text-slate-400 uppercase tracking-widest ml-1">pts</span>
              </h2>
            </div>
          </div>
        </div>

        {/* Progress System */}
        <div className="px-8 pb-8 relative z-10">
          <div className="flex justify-between items-end mb-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Progreso Actual</span>
              <span className="text-xs font-bold text-slate-700">{tier.name}</span>
            </div>
            {next ? (
              <div className="text-right">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Siguiente Nivel</span>
                <span className="text-xs font-bold" style={{ color: next.color }}>{next.name}</span>
              </div>
            ) : (
              <span className="text-xs font-black text-pink-500 uppercase tracking-widest">¡Nivel Máximo! 👑</span>
            )}
          </div>
          
          <div className="h-3.5 bg-slate-100 rounded-full overflow-hidden relative border border-slate-50">
            <motion.div 
              initial={{ width: 0 }} animate={{ width: `${Math.min(100, progress)}%` }} transition={{ duration: 1.2, ease: 'easeOut' }}
              className="absolute top-0 left-0 bottom-0 rounded-full shadow-[0_0_15px_rgba(227,150,191,0.2)]" 
              style={{ background: `linear-gradient(90deg, ${tier.color}, ${next?.color || tier.color})` }} 
            />
          </div>
          
          {next && (
            <p className="mt-4 text-xs font-bold text-slate-400 text-center uppercase tracking-wide">
              Faltan <span className="text-pink-500">{(next.min - points).toLocaleString()} pts</span> para el nivel <span style={{ color: next.color }}>{next.name}</span>
            </p>
          )}
        </div>

        {/* Experience Stats Row */}
        <div className="grid grid-cols-3 bg-slate-50/50 border-t border-slate-100 p-3 gap-2">
          {[
            { icon: ShoppingBag, value: orderCount, label: 'Pedidos realizados', color: 'text-pink-500', bg: 'bg-white', description: 'Pedidos pagados en total', particleColor: 'rgba(236, 72, 153, 0.45)' },
            { icon: DollarSign, value: '$' + totalSpent.toLocaleString(), label: 'Total invertido', color: 'text-emerald-500', bg: 'bg-white', description: 'Acumulación de todos tus pedidos', particleColor: 'rgba(16, 185, 129, 0.45)' },
            { icon: Sparkles, value: points.toLocaleString(), label: 'Puntos acumulados', color: 'text-pink-400', bg: 'bg-white', description: `Gana 1 punto por $1000. ${POINTS_PER_1000}x según nivel. Canjea por cupones y productos.`, particleColor: 'rgba(139, 92, 246, 0.45)' },
          ].map((stat, i) => (
            <motion.div 
              key={i} 
              whileHover={{ y: -3, boxShadow: 'inset 0 1px 2px 0 rgba(0,0,0,0.015), 0 1px 3px 0 rgba(0,0,0,0.03), 0 4px 12px 0 rgba(0,0,0,0.045), 0 8px 24px 0 rgba(0,0,0,0.025)' }} 
              className={`flex flex-col items-center justify-center p-5 rounded-2xl transition-all border border-slate-100 hover:border-slate-200 ${stat.bg} shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.015),0_1px_2px_0_rgba(0,0,0,0.025),0_2px_8px_0_rgba(0,0,0,0.035),0_4px_16px_0_rgba(0,0,0,0.02)] relative overflow-hidden`}
            >
              {/* Partículas animadas */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute rounded-full" style={{ left: '13%', top: '17%', width: '3px', height: '3px', background: `radial-gradient(circle, ${stat.particleColor}, ${stat.particleColor.replace('0.45', '0.2')})`, boxShadow: `${stat.particleColor.replace('0.45', '0.3')} 0px 0px 3px`, animation: '3s ease-in-out 0s infinite alternate td_float' }} />
                <div className="absolute rounded-full" style={{ left: '26%', top: '36%', width: '4.5px', height: '4.5px', background: `radial-gradient(circle, ${stat.particleColor.replace('0.45', '0.57')}, ${stat.particleColor.replace('0.45', '0.28')})`, boxShadow: `${stat.particleColor.replace('0.45', '0.3')} 0px 0px 5px`, animation: '3.8s ease-in-out 0.3s infinite alternate td_float' }} />
                <div className="absolute rounded-full" style={{ left: '39%', top: '55%', width: '6px', height: '6px', background: `radial-gradient(circle, ${stat.particleColor.replace('0.45', '0.69')}, ${stat.particleColor.replace('0.45', '0.36')})`, boxShadow: `${stat.particleColor.replace('0.45', '0.3')} 0px 0px 7px`, animation: '4.6s ease-in-out 0.6s infinite alternate td_float' }} />
                <div className="absolute rounded-full" style={{ left: '52%', top: '74%', width: '3px', height: '3px', background: `radial-gradient(circle, ${stat.particleColor}, ${stat.particleColor.replace('0.45', '0.2')})`, boxShadow: `${stat.particleColor.replace('0.45', '0.3')} 0px 0px 3px`, animation: '5.4s ease-in-out 0.9s infinite alternate td_float' }} />
                <div className="absolute rounded-full" style={{ left: '65%', top: '23%', width: '4.5px', height: '4.5px', background: `radial-gradient(circle, ${stat.particleColor.replace('0.45', '0.57')}, ${stat.particleColor.replace('0.45', '0.28')})`, boxShadow: `${stat.particleColor.replace('0.45', '0.3')} 0px 0px 5px`, animation: '3s ease-in-out 1.2s infinite alternate td_float' }} />
                <div className="absolute rounded-full" style={{ left: '78%', top: '42%', width: '6px', height: '6px', background: `radial-gradient(circle, ${stat.particleColor.replace('0.45', '0.69')}, ${stat.particleColor.replace('0.45', '0.36')})`, boxShadow: `${stat.particleColor.replace('0.45', '0.3')} 0px 0px 7px`, animation: '3.8s ease-in-out 1.5s infinite alternate td_float' }} />
              </div>
              <div className="relative z-10">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 shadow-sm ${stat.bg} border border-slate-50`}>
                  <stat.icon size={18} className={stat.color} />
                </div>
                <p className="text-base font-black text-slate-900 leading-none mb-2">{stat.value}</p>
                <p style={{ fontSize: '9px', fontWeight: 800, color: stat.color, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>{stat.label}</p>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', lineHeight: 1.3, marginTop: i === 2 ? '4px' : '8px' }}>{stat.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
