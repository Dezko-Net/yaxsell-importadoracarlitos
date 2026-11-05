'use client';

import { useEffect, useState } from 'react';
import { Crown, Star, Gem, Award, Gift, Truck, Headphones, Sparkles, TrendingUp, Coins, Calendar, Trophy, Zap, Lock, CheckCircle2, ShoppingBag, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { formatPrice, getServices } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { LoyaltyService } from '@/services/loyaltyService';
import { motion, AnimatePresence } from 'framer-motion';
import BenefitActionLink from '@/components/BenefitActionLink';

const FF = '"DM Sans",system-ui,sans-serif';
const PINK = '#e396bf';

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

interface LevelConfig {
  id: string;
  name: string;
  icon: any;
  image: string;
  badge?: string;
  color: string;
  bgColor: string;
  requiredOrders: number;
  couponPercent: number;
  minOrderValue: number;
  benefits: string[];
}

const LEVELS: LevelConfig[] = [
  {
    id: 'bronze',
    name: 'Bronce',
    icon: Award,
    image: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778903648867-pegada-1778903643580.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=A7X1WH5mE2HVGyuOlobnOttQvUjH3HdEbhJ%2Btfav0BVipBitLHzoevrKi2AQxIuFu87YgUWZGfvtv7vJeGq9GKw0FwIC35lQ3po6ZD1EIyp27t5Ls4R8ZLoFzjsxRlL2G9ch9WYjLmGlUNE6ZDJlmMKWyca%2FvseAeysZOm1Vc3MAi7ekzfzg3o9DILWm8vta%2BNuufz9q4zc3IPVreT3Te%2Brbja%2FjOsObWWdyuu7kuiNt5trVQiIJH2prI8jZ1n7%2FeX2Hvk9iTZN9bsgDdk5I7dRyFl3KR6pPk%2F1ZIl1%2B%2FSXpnbodii8SXHEV4T1pEO%2BQjsE1E%2BXmX%2BGd3mQ9Jiij2A%3D%3D',
    badge: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907249364-pegada-1778907248432.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=UZgq9eKk4EDkubPxUsLcuOyhDwGUNUxTuFNQxue45QasYIo3%2F2vMtCU31qDrMbHwnqAYHb2ZWY%2FnLR%2FkVVQlxceKXZP1IS1aN4kErtTF4xTyhhIObTi0f6asQUXiMoVCsll9S3hH1RAo%2FS2Nph84uabU0wWlFnfvtMNvZ0TzRQyjIXfIC%2FqFUv%2BJ2Wz6wBAkUllDmuLiJeYUcsK7Jwmk6mtzhDC8m7EnCUO6RzWS3r10fLtX%2BufPfH3Y%2BKrmODsXffdhAYL7lL3D8eSNSJ%2Fkz4dzRXsdOko5%2BArkNBMdzHVOGbIvrlygMyNsiSuh%2BbCiqJK3r0wj6IyddiP%2Bwvo1Vw%3D%3D',
    color: '#cd7f32',
    bgColor: 'linear-gradient(135deg, #eaddcf, #d4a373)',
    requiredOrders: 0,
    couponPercent: 0,
    minOrderValue: 0,
    benefits: ['Acceso a catálogo completo', 'Seguimiento de pedidos', 'Atención al cliente', '1 punto por cada $1000 gastado', 'Sorteo mensual para nuevos usuarios'],
  },
  {
    id: 'silver',
    name: 'Plata',
    icon: Star,
    image: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778906641804-pegada-1778906640215.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=DG%2FTQispMFCDr1R4kLUSNpPbk%2BfwPmSPngV9YooWiJXCx9j5y5t8C7xYvgoTkb8kZbf6ZEJ2AciHbhAV6JRFgi2%2FsB2I4909GGc3SXBL35vs4%2Fx5a96DziUIlp5JbmbU3S%2F6fGMzVPTQ2ccobE6SYD0QnU8tYPDpDR%2BeIQWrh7cWlzxNWrYCGf0Ko5yBJSQQRPxNptTlZjPeNFDe5eb7CFvdDMVnfKqOqKun6lVc%2BUDZ6C7ZUM0P1dJytrz2aKcOqkUjQMr2d6PFGyh0Ycgcg9zazuewfadbwp9P%2FT6hh2X7UCcXQnQZO7ra8Ui9Ne1ueOpTTBpl4S2fFrT9DUYxrw%3D%3D',
    badge: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907186962-pegada-1778907185830.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=f2tSbBlbVIfe2xa9YjBkd2dAcYKCTZNW%2FoleMZYIPn9R%2Fbh8fQI2Xtu1azuD%2BBr2E2gQXYOo7bbbxl4I9GP22DqQg0aYMd5I7MxQ4Z1DPt0xSIhW%2FMKtr39Be6uo%2B2o0Fg1XoSgngoqNRsdJmTSyOPBp3gk6nVKBu4A6Pvk3kwN8UAEzmvgTtFWVuWWltOKZsv6KNtX2X3GkopYLHIkN9DRpQAIh%2Foz3Ghjif%2FSQLsA7Be%2FUVL0TEMKyBu5xhDcJbNd3BFll8KTynlwI%2B5s%2Fi8uI9Iyg0q9DSU86JWYSZW89WDjKO4YukGuc%2BciL%2FchXuck9rzgoUqOR5gGGEMSSQQ%3D%3D',
    color: '#9ca3af',
    bgColor: 'linear-gradient(135deg, #f3f4f6, #9ca3af)',
    requiredOrders: 5,
    couponPercent: 3,
    minOrderValue: 50000,
    benefits: ['Todo lo de Bronce', 'Cupón 3% acumulable (pedidos > $50k)', '1.5 puntos por cada $1000 gastado'],
  },
  {
    id: 'gold',
    name: 'Oro',
    icon: Crown,
    image: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907416680-pegada-1778907415236.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=BdjgOaVBMiXGVBJOgD1Ys%2B3DaXfI4JTHN7sgg5Br%2FNDe85HdLftuGWJF2Z6oaMstZkQ30Sg7FI6Tcc1FvZxfY0MmZWySn9umI6m%2BaUN4TJSB805MFXDicbiGMclWJVtTsIU%2BZT%2BGPkF0IXGdPhcsGYFctp9k3kbqWCKBqS8FtOpyP4%2F4jouNXilVFgbBge4UiRtPBRGWq%2BNXznoXrqPfe0q0MvlHCDV5OlubuHh4g3z8ckUF%2BhaC0V%2BMyhgKMKMPl2zdMMQdrxvlOoG99frAT0kledWKR59AmqF3jgP5%2Ftz82ep6ZRpFuFQSAlZ%2FnX4sQuOPRSIEG0rbSj1nfc0MzQ%3D%3D',
    badge: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907447447-pegada-1778907446361.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=SVPkcC3LBY2KhtE8vmzKcW2q0HoKNLDT5gSLAB6UjGGkRaoD6IZuOuV7XpTsEG4oI5BhjmOmEyKxdcFA4pHMc8XxwX4D4S%2BnuSs%2FADrfQsHuRSxY0%2BVnbrUZ%2BtJK8%2Fo5lizEIxPcyHlgbLjKsAJMcWppgD5O%2FWpQ5DzVGTCtoCX1hWXwPrwlzwjv8%2BmsKBPk0U9g%2B53MeilokwG%2BCyDZsJfHK4fE9P3bMFcs04B%2BYoEY3zhLLDLiGjwvp5uYCJ9sckBg7ki1EWYXAu13sX%2Fp5S3GXwtNh4QqJrv9FuP2EN2iUoWJXjz7hk7efafpvhS1GbORq%2FpwZJbPi1HIfWNoZA%3D%3D',
    color: '#fbbf24',
    bgColor: 'linear-gradient(135deg, #fef3c7, #fbbf24)',
    requiredOrders: 10,
    couponPercent: 5,
    minOrderValue: 100000,
    benefits: ['Todo lo de Plata', 'Cupón 5% no acumulable (pedidos > $100k)', 'Acceso anticipado a preventas', '2 puntos por cada $1000', 'Regalo de cumpleaños'],
  },
  {
    id: 'diamond',
    name: 'Diamante',
    icon: Gem,
    image: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778908405817-pegada-1778908404129.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=OhH5%2B5FvjuHkXDypZv1eu2jxj%2BjSS5tp%2F29x6fjvKp7vGgFE0W0NXHt7DACXOFY5rO%2Fo86tLuu1oiNnfKGTlhNMDMqwgdSgBt84x65wQfUMpakpSQTcOGglp6k%2BKpgB7M%2FPvRfgzfVPO8yGeMITgUJK%2F9BPZJQRVriNJtMBvT%2Fuso%2F0us4lTj%2BOAwOXTIKQhgcC08NsgAb%2BwwRVGOW12T6N0Nv%2BfK4WjnjqcCUw8Qve6gOkmdbIm%2BSs0wRGAXvYi8VqATCYmNhYkZKhwvJ87vgu%2BMQG%2BX%2B7i3mOG6A%2FyRRjp90kHYZ%2F1FS%2FWEXsiJs00pdUqt2Sf1thMuAEf4S3HKA%3D%3D',
    badge: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778907790908-pegada-1778907790043.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=A%2FL9Y0VDAOZojqnk%2B2T%2Bz9QL7IH%2FaPi7YtOA4lAo3hsrrR29s91RDdWzwl9ZDCsXiW18zqqdYm7cS44ucw0sOD%2Fs7lE6JF%2B%2BtNKSLCxnuC18Xx7N0R%2FO5AvRVO4QwayS1hlwzfOgkGS9hSnXFIgC%2Filo9WnsHlAQBK1qJTxSKCaawiXUVVloTSHSqJGLLhAoiiiY1WpFLilBLnguj8l%2FqGF%2B9WTqyO%2Fq7YMr%2FJyVUU4t5llG0zVzh6HUmYGHC3HHMRqYBHVL6IAv%2FUge21gGoxg1wokBp9ph7Qf5ZEGLwdASua9Y67XqDQY6pu7%2BAu06A6eVyDFakG845%2FpSkAYjjA%3D%3D',
    color: '#9ca3af',
    bgColor: 'linear-gradient(135deg, #f3f4f6, #9ca3af)',
    requiredOrders: 20,
    couponPercent: 10,
    minOrderValue: 80000,
    benefits: ['Todo lo de Oro', 'Cupón 10% (pedidos > $80k, 1 uso)', 'Envío rápido', '3 puntos por cada $1000', 'Soporte WhatsApp prioritario'],
  },
  {
    id: 'ruby',
    name: 'Ruby',
    icon: Sparkles,
    image: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778908191353-pegada-1778908189045.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=VOm%2FYwbVJnRZ2U1GeYOumoE0cbiW2uNzLomLjqGs4Ld4x4Csebr6ScnheDIq01%2BcnVhpwHoi%2FMhwv06MmILHtmLH6DW3mzqTqnr90K8puhZZwU15OrNrUWEeJqa99FE05nI7BFITvJ156P98fWWnLmK164ifDc8F%2BFFSO4FFls1fIsPSJPrg72%2BdZMmQalSnwSc%2BBuBKopPHMXnMx%2BGkko19r0JOUXNUikmNp4ehY1boxSzeyO7XdAM%2FlloE%2BO227nxcsrXq%2FKnToTSrw4Ud2vXslmO7CbdphUoTSRoi0PoaUrj6L%2FnG5Bd1rO7KD6kqd4cXLqvg1VUZ4lmIHlutyg%3D%3D',
    badge: 'https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1778908226958-pegada-1778908225905.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=BqPLV4aHi9DTpG6dmp8HQD%2FPK%2BiL2gnkClQ3ZaSF1oyhQHyyTgBBu8l%2B43gHdJqACfsNv7SO0JJKxhRUNXbrUyu0hAZkGwlwLHgRfIOq%2BEEbE%2Brfrnz%2BJ5vBydNAFo3jdian%2Fd5Qx0G6pQ3cs45r%2BvI9ttjuz%2Fm%2FDhXoOWJqFk6APK43kC69by2GiW%2FVJ7SL%2BQ0Dj07MelRAdhiVWBT%2BIQhuhJ6w4TstSrUqHvkgBi4SqVN2gNQVQD1MHWQ4T0AJ8O8qXVvm96poxdusTPkzusKMZRGn7yglXGqNAn7ImNKKQ2CUNB6NEeoNSRquYckAVngc5ug8Xzza7JG6uhCDHQ%3D%3D',
    color: '#f43f5e',
    bgColor: 'linear-gradient(135deg, #ffe4e6, #f43f5e)',
    requiredOrders: 30,
    couponPercent: 10,
    minOrderValue: 100000,
    benefits: ['Todo lo de Diamante', 'Cupón 10% mensual (pedidos > $100k)', 'Envío mismo día', '5 puntos por cada $1000', 'Asesor personal de compras'],
  },
];

export default function LoyaltyLevel() {
  const { user, isLoggedIn } = useAuth();
  const [currentLevel, setCurrentLevel] = useState<LevelConfig>(LEVELS[0]);
  const [paidOrdersCount, setPaidOrdersCount] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [points, setPoints] = useState(0);
  const [nextLevel, setNextLevel] = useState<LevelConfig | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [couponGenerated, setCouponGenerated] = useState(false);
  const [couponCode, setCouponCode] = useState<string>('');
  const [levelHistory, setLevelHistory] = useState<any[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [medalImageError, setMedalImageError] = useState(false);
  const [trophyImageError, setTrophyImageError] = useState(false);
  const [showCurrentBenefits, setShowCurrentBenefits] = useState(true);
  const [showNextBenefits, setShowNextBenefits] = useState(true);
  const [showSilverBenefits, setShowSilverBenefits] = useState(false);
  const [showGoldBenefits, setShowGoldBenefits] = useState(false);
  const [showDiamondBenefits, setShowDiamondBenefits] = useState(false);
  const [showRubyBenefits, setShowRubyBenefits] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    console.log('[LoyaltyLevel] useEffect trigger. isLoggedIn:', isLoggedIn, 'user:', user);
    if (!isLoggedIn || !user) {
      console.log('[LoyaltyLevel] isLoggedIn or user is falsey, skipping loadUserData');
      return;
    }
    loadUserData();
  }, [isLoggedIn, user]);

  async function loadUserData() {
    console.log('[LoyaltyLevel] loadUserData started for user.id:', user?.id);
    if (!user || !user.id) {
      console.log('[LoyaltyLevel] No user or user.id, setting loading false');
      setLoading(false);
      return;
    }
    try {
      console.log('[LoyaltyLevel] Calling LoyaltyService.getLoyaltyData...');
      
      const getLoyaltyDataPromise = LoyaltyService.getLoyaltyData(user.id);
      const timeoutPromise = new Promise<any>((resolve) => {
        setTimeout(() => {
          console.warn('[LoyaltyLevel] Loyalty data fetch timed out. Falling back.');
          resolve({
            userId: user.id,
            currentLevel: 'bronze',
            paidOrdersCount: 0,
            totalSpent: 0,
            points: 0,
            levelHistory: [],
          });
        }, 4000);
      });
      
      const loyaltyData = await Promise.race([getLoyaltyDataPromise, timeoutPromise]);
      console.log('[LoyaltyLevel] Loyalty data received:', loyaltyData);
      
      setPaidOrdersCount(loyaltyData.paidOrdersCount || 0);
      setTotalSpent(loyaltyData.totalSpent || 0);
      setPoints(loyaltyData.points || 0);
      const history = loyaltyData.levelHistory || [];
      setLevelHistory(history);

      const levelIndex = LEVELS.findIndex(l => l.id === (loyaltyData.currentLevel || 'bronze'));
      const activeLevelIndex = levelIndex >= 0 ? levelIndex : 0;
      const level = LEVELS[activeLevelIndex];
      setCurrentLevel(level);

      if (activeLevelIndex < LEVELS.length - 1) {
        const next = LEVELS[activeLevelIndex + 1];
        setNextLevel(next);
        const progress = (((loyaltyData.paidOrdersCount || 0) - level.requiredOrders) / (next.requiredOrders - level.requiredOrders)) * 100;
        setProgressPercent(Math.min(Math.max(progress, 0), 100));
      } else {
        setNextLevel(null);
        setProgressPercent(100);
      }

      const lastHistory = history[history.length - 1];
      if (lastHistory && lastHistory.level === (loyaltyData.currentLevel || 'bronze')) {
        setCouponGenerated(lastHistory.couponGenerated);
        setCouponCode(lastHistory.couponCode || '');
      }

    } catch (err) {
      console.error('[LoyaltyLevel] Error loading loyalty data:', err);
    } finally {
      console.log('[LoyaltyLevel] loadUserData finished, setting loading false');
      setLoading(false);
    }
  }

  async function generateCoupon() {
    if (!user || !nextLevel || !user.id) return;

    const result = await LoyaltyService.generateLevelUpCoupon(user.id, nextLevel.id);
    
    if (result.success && result.couponCode) {
      setCouponGenerated(true);
      setCouponCode(result.couponCode);
      setCurrentLevel(nextLevel);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
      loadUserData();
    } else {
      alert('Error al generar cupón: ' + (result.error || 'Intenta nuevamente.'));
    }
  }

  if (loading) {
    return (
      <div style={{ background: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)', borderRadius: 24, border: '1px solid rgba(255,255,255,0.4)', padding: 40, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.04)' }}>
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{ width: 40, height: 40, border: '3px solid #d1d5db', borderRadius: '50%', margin: '0 auto' }} 
        />
      </div>
    );
  }

  const CurrentIcon = currentLevel.icon;
  const NextIcon = nextLevel?.icon;
  const ordersNeeded = nextLevel ? nextLevel.requiredOrders - paidOrdersCount : 0;

  return (
    <div 
      style={{ 
        borderRadius: 22, 
        padding: isMobile ? '16px 14px' : 40, 
        fontFamily: FF,
        background: '#ffffff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.07), 0 16px 32px rgba(0,0,0,0.07)',
        border: '1px solid rgba(0,0,0,0.07)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <style>{`
        /* ──────────────────────────────────────────────────────────────
           LoyaltyLevel — Interacciones + borde animado (móvil/desktop)
           ────────────────────────────────────────────────────────────── */
        .loyalty-level-card{
        }
        ${particleStyles}
        .ll-chip{
          position: relative;
          overflow: hidden;
        }
        .ll-chip::after{
          content:'';
          position:absolute;
          inset:-2px;
          background: linear-gradient(120deg, transparent 0%, var(--chip-glow, rgba(227,150,191,0.25)) 45%, transparent 60%);
          transform: translateX(-120%);
          animation: llShine 3.2s ease-in-out infinite;
          pointer-events:none;
        }
        @keyframes llShine{
          0%   { transform: translateX(-120%); opacity: 0; }
          18%  { opacity: 1; }
          55%  { transform: translateX(120%); opacity: 1; }
          100% { transform: translateX(120%); opacity: 0; }
        }

        .ll-iconWrap{
          position: relative;
          overflow: hidden;
        }
        .ll-orbit{
          position:absolute;
          inset:-16px;
          border-radius: 999px;
          background: conic-gradient(from 0deg, var(--orbit-c1, rgba(227,150,191,0.0)), var(--orbit-c2, rgba(227,150,191,0.35)), var(--orbit-c3, rgba(56,189,248,0.35)), var(--orbit-c1, rgba(227,150,191,0.0)));
          filter: blur(8px);
          opacity: 0.7;
          animation: llOrbit 6s linear infinite;
          pointer-events:none;
        }
        @keyframes llOrbit{ to { transform: rotate(360deg); } }

        @keyframes ll_shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes ll_float { 0%,100% { transform: translateY(0); opacity: 0.6; } 50% { transform: translateY(-2px); opacity: 1; } }
        @keyframes ll_bubble { 0%,100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.4); opacity: 0.6; } }
        @keyframes ll_drift { 0%,100% { transform: translateX(0); opacity: 0.15; } 50% { transform: translateX(6px); opacity: 0.25; } }

        @media (prefers-reduced-motion: reduce){
          .loyalty-level-card, .ll-chip::after, .ll-orbit { animation: none !important; }
        }
      `}</style>

      {/* Premium Background Elements */}
      <div style={{ position: 'absolute', top: -100, right: -100, width: 300, height: 300, background: `radial-gradient(circle, ${PINK}08 0%, transparent 70%)`, borderRadius: '50%', zIndex: 0 }} />
      <div style={{ position: 'absolute', bottom: -50, left: -50, width: 200, height: 200, background: `radial-gradient(circle, ${PINK}05 0%, transparent 70%)`, borderRadius: '50%', zIndex: 0 }} />

      {showConfetti && (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}
        >
          <div style={{ textAlign: 'center' }}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1.2, rotate: [0, 15, -15, 0] }} transition={{ type: 'spring', damping: 12 }}>
              <CurrentIcon size={80} color={PINK} />
            </motion.div>
            <h2 style={{ fontSize: 28, fontWeight: 900, marginTop: 24, color: '#111827' }}>¡NUEVO NIVEL ALCANZADO!</h2>
            <p style={{ color: PINK, fontWeight: 800, fontSize: 18 }}>Bienvenido a {currentLevel.name}</p>
          </div>
        </motion.div>
      )}

      {/* Header Profile Section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 12 : 24, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 24 }}>
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 4 }}
            whileTap={{ scale: 0.98, rotate: -2 }}
            style={{ 
              width: isMobile ? 52 : 90, height: isMobile ? 52 : 90, 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative'
            }}
          >
            {!medalImageError && currentLevel.image ? (
              <img 
                src={currentLevel.image}
                alt="Medalla"
                onError={() => setMedalImageError(true)}
                style={{ width: isMobile ? 52 : 90, height: isMobile ? 52 : 90, objectFit: 'contain' }}
              />
            ) : (
              <CurrentIcon size={isMobile ? 32 : 56} color={currentLevel.color} fill={currentLevel.color} />
            )}
            <motion.div 
              animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}
              style={{ position: 'absolute', bottom: isMobile ? -5 : -8, right: isMobile ? -5 : -8, background: '#fff', borderRadius: '50%', padding: isMobile ? 3 : 6, boxShadow: `0 4px 15px ${currentLevel.color}40` }}
            >
              <Zap size={isMobile ? 10 : 16} color={currentLevel.color} fill={currentLevel.color} />
            </motion.div>
          </motion.div>
          <div>
            <p style={{ margin: 0, fontSize: isMobile ? 10 : 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Medalla</p>
            <h2 style={{ margin: '2px 0 0', fontSize: isMobile ? 20 : 36, fontWeight: 900, color: '#111827', letterSpacing: '-0.04em', lineHeight: 1 }}>Nivel {currentLevel.name}</h2>
            <p style={{ margin: '4px 0 0', fontSize: isMobile ? 12 : 14, fontWeight: 700, color: currentLevel.color }}>{points} pts</p>
          </div>
        </div>
      </div>

      {/* MI STATUS ACTUAL chip + Debug badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isMobile ? 12 : 20, position: 'relative', zIndex: 1 }}>
        <motion.span 
          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
          className="ll-chip"
          style={{ display: 'inline-block', padding: isMobile ? '3px 8px' : '6px 14px', background: '#f3f4f6', color: '#374151', borderRadius: 999, fontSize: isMobile ? 9 : 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', border: '1px solid #d1d5db', '--chip-glow': `${currentLevel.color}40`, '--orbit-c1': `${currentLevel.color}00`, '--orbit-c2': `${currentLevel.color}59`, '--orbit-c3': `${currentLevel.color}59` } as React.CSSProperties}
        >
          Programa de lealtad
        </motion.span>
      </div>

      {/* Stats resumen */}
      <motion.div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: isMobile ? 8 : 12, marginBottom: isMobile ? 14 : 20, position: 'relative', zIndex: 1 }}>
        {[
          { icon: ShoppingBag, value: String(paidOrdersCount), label: 'Pedidos realizados', color: '#e396bf', description: 'Pedidos pagados en total', particleColor: 'rgba(236, 72, 153, 0.45)' },
          { icon: DollarSign, value: formatPrice(totalSpent), label: 'Total invertido', color: '#10b981', description: 'Acumulación de todos tus pedidos', particleColor: 'rgba(16, 185, 129, 0.45)' },
          { icon: Sparkles, value: points.toLocaleString(), label: 'Puntos acumulados', color: '#8b5cf6', description: `Gana 1 punto por $1000. ${currentLevel.id === 'bronze' ? '1x' : currentLevel.id === 'silver' ? '1.5x' : currentLevel.id === 'gold' ? '2x' : currentLevel.id === 'diamond' ? '3x' : '5x'} según nivel. Canjea por cupones y productos.`, particleColor: 'rgba(139, 92, 246, 0.45)' },
        ].map((stat, i) => (
          <motion.div key={i} whileHover={{ y: -2 }} style={{ padding: isMobile ? '12px 8px' : '16px', borderRadius: isMobile ? 14 : 18, background: '#fff', border: '1px solid #e5e7eb', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden' }}>
            {/* Partículas animadas */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
              <div className="absolute rounded-full" style={{ left: '13%', top: '17%', width: '3px', height: '3px', background: `radial-gradient(circle, ${stat.particleColor}, ${stat.particleColor.replace('0.45', '0.2')})`, boxShadow: `${stat.particleColor.replace('0.45', '0.3')} 0px 0px 3px`, animation: '3s ease-in-out 0s infinite alternate td_float' }} />
              <div className="absolute rounded-full" style={{ left: '26%', top: '36%', width: '4.5px', height: '4.5px', background: `radial-gradient(circle, ${stat.particleColor.replace('0.45', '0.57')}, ${stat.particleColor.replace('0.45', '0.28')})`, boxShadow: `${stat.particleColor.replace('0.45', '0.3')} 0px 0px 5px`, animation: '3.8s ease-in-out 0.3s infinite alternate td_float' }} />
              <div className="absolute rounded-full" style={{ left: '39%', top: '55%', width: '6px', height: '6px', background: `radial-gradient(circle, ${stat.particleColor.replace('0.45', '0.69')}, ${stat.particleColor.replace('0.45', '0.36')})`, boxShadow: `${stat.particleColor.replace('0.45', '0.3')} 0px 0px 7px`, animation: '4.6s ease-in-out 0.6s infinite alternate td_float' }} />
              <div className="absolute rounded-full" style={{ left: '52%', top: '74%', width: '3px', height: '3px', background: `radial-gradient(circle, ${stat.particleColor}, ${stat.particleColor.replace('0.45', '0.2')})`, boxShadow: `${stat.particleColor.replace('0.45', '0.3')} 0px 0px 3px`, animation: '5.4s ease-in-out 0.9s infinite alternate td_float' }} />
              <div className="absolute rounded-full" style={{ left: '65%', top: '23%', width: '4.5px', height: '4.5px', background: `radial-gradient(circle, ${stat.particleColor.replace('0.45', '0.57')}, ${stat.particleColor.replace('0.45', '0.28')})`, boxShadow: `${stat.particleColor.replace('0.45', '0.3')} 0px 0px 5px`, animation: '3s ease-in-out 1.2s infinite alternate td_float' }} />
              <div className="absolute rounded-full" style={{ left: '78%', top: '42%', width: '6px', height: '6px', background: `radial-gradient(circle, ${stat.particleColor.replace('0.45', '0.69')}, ${stat.particleColor.replace('0.45', '0.36')})`, boxShadow: `${stat.particleColor.replace('0.45', '0.3')} 0px 0px 7px`, animation: '3.8s ease-in-out 1.5s infinite alternate td_float' }} />
            </div>
            <div style={{ position: 'relative', zIndex: 10 }}>
              <stat.icon size={isMobile ? 16 : 18} color={stat.color} style={{ margin: '0 auto 6px', display: 'block' }} />
              <p style={{ margin: 0, fontSize: isMobile ? 15 : 17, fontWeight: 900, color: '#111827' }}>{stat.value}</p>
              <p style={{ margin: '4px 0 0', fontSize: isMobile ? 8 : 9, fontWeight: 800, color: stat.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</p>
              <p style={{ margin: i === 2 ? '4px 0 0' : '8px 0 0', fontSize: isMobile ? 9 : 10, fontWeight: 600, color: '#6b7280', lineHeight: 1.3 }}>{stat.description}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Progress & Motivation Section */}
      {nextLevel ? (
        <div style={{ marginBottom: isMobile ? 16 : 40, position: 'relative', zIndex: 1, padding: isMobile ? '16px' : '24px 28px', background: 'linear-gradient(160deg, #ffffff 0%, #fdf2f8 100%)', borderRadius: isMobile ? 18 : 24, border: '1px solid #fce7f3', boxShadow: '0 8px 32px rgba(227,150,191,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: isMobile ? 10 : 14, gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: isMobile ? 10 : 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tu camino VIP</p>
              <p style={{ margin: '4px 0 0', fontSize: isMobile ? 14 : 16, fontWeight: 900, color: '#111827' }}>
                <span style={{ color: currentLevel.color }}>{currentLevel.name}</span>
                <span style={{ color: '#d1d5db', margin: '0 8px' }}>→</span>
                <span style={{ color: nextLevel.color }}>{nextLevel.name}</span>
              </p>
            </div>
            <p style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 900, color: PINK, flexShrink: 0 }}>
              {paidOrdersCount}<span style={{ fontSize: isMobile ? 12 : 14, color: '#9ca3af', fontWeight: 700 }}>/{nextLevel.requiredOrders}</span>
            </p>
          </div>

          {/* Animated Progress Bar */}
          <div style={{ height: isMobile ? 24 : 32, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              style={{ 
                position: 'absolute', top: 0, left: 0, bottom: 0, 
                background: `linear-gradient(90deg, ${currentLevel.color}, ${nextLevel.color})`,
                borderRadius: 999,
              }} 
            >
              {/* Shimmer */}
              <div style={{ position: 'absolute', inset: 0, opacity: 0.4, backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 100%)', backgroundSize: '200% 100%', animation: 'll_shimmer 2.5s ease-in-out infinite' }} />
              {/* Float dots */}
              {[{l:3,t:15,s:1.5,d:0},{l:9.5,t:38,s:2.3,d:.15},{l:16,t:61,s:3.1,d:.3},{l:22.5,t:9,s:3.9,d:.45},{l:29,t:32,s:1.5,d:.6},{l:35.5,t:55,s:2.3,d:.75},{l:42,t:78,s:3.1,d:.9},{l:48.5,t:26,s:3.9,d:1.05},{l:55,t:49,s:1.5,d:1.2},{l:61.5,t:72,s:2.3,d:1.35},{l:68,t:20,s:3.1,d:1.5},{l:74.5,t:43,s:3.9,d:1.65},{l:81,t:66,s:1.5,d:1.8},{l:87.5,t:14,s:2.3,d:1.95},{l:94,t:37,s:3.1,d:.1}].map((p,i)=>(
                <div key={`pf${i}`} style={{ position:'absolute', left:`${p.l}%`, top:`${p.t}%`, width:p.s, height:p.s, borderRadius:'50%', background:`radial-gradient(circle,rgba(255,255,255,${0.6+((i%3)*0.15)}),rgba(255,255,255,0.1))`, boxShadow:`0 0 ${2+i%3}px rgba(255,255,255,0.5)`, animation:`ll_float ${1.2+(i%5)*.4}s ease-in-out ${p.d}s infinite alternate` }} />
              ))}
              {/* Bubbles */}
              {[{l:5,t:5,s:3},{l:18,t:24,s:5},{l:31,t:43,s:7},{l:44,t:62,s:3},{l:57,t:11,s:5},{l:70,t:30,s:7},{l:83,t:49,s:3}].map((b,i)=>(
                <div key={`pb${i}`} style={{ position:'absolute', left:`${b.l}%`, top:`${b.t}%`, width:b.s, height:b.s, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.3)', animation:`ll_bubble ${1.5+i*.5}s ease-in-out ${i*.2}s infinite` }} />
              ))}
              {/* Drift bars */}
              <div style={{ position:'absolute', top:0, height:'100%', width:8, borderRadius:999, background:'rgba(255,255,255,0.15)', filter:'blur(1px)', left:'20%', animation:'ll_drift 3s ease-in-out infinite' }} />
              <div style={{ position:'absolute', top:0, height:'100%', width:6, borderRadius:999, background:'rgba(255,255,255,0.1)', filter:'blur(1px)', left:'60%', animation:'ll_drift 4s ease-in-out infinite reverse' }} />
            </motion.div>
          </div>

          {/* Motivation text */}
          <div style={{ marginTop: isMobile ? 10 : 14 }}>
            <p style={{ margin: 0, fontSize: isMobile ? 13 : 16, fontWeight: 800, color: '#111827', letterSpacing: '-0.01em' }}>
              {ordersNeeded > 0 ? (
                <>Estás a <span style={{ color: PINK }}>{ordersNeeded} pedidos</span> de <span style={{ color: nextLevel.color }}>{nextLevel.name}</span></>
              ) : (
                <span style={{ color: '#10b981' }}>🎉 ¡Ya puedes reclamar tu nuevo nivel!</span>
              )}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: isMobile ? 11 : 13, color: '#6b7280', fontWeight: 500 }}>
              {ordersNeeded > 0 ? 'Desbloquea beneficios exclusivos con tu próxima compra.' : 'Haz clic abajo para generar tu cupón de recompensa.'}
            </p>
          </div>
          {nextLevel && ordersNeeded > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: isMobile ? 10 : 12, fontWeight: 700, color: '#9ca3af', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Faltan <span style={{ color: PINK }}>{ordersNeeded}</span> pedidos para el nivel <span style={{ color: nextLevel.color }}>{nextLevel.name}</span>
            </p>
          )}
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          style={{ marginBottom: isMobile ? 16 : 40, position: 'relative', zIndex: 1, padding: isMobile ? '20px 24px' : '28px 32px', background: '#fff', borderRadius: isMobile ? 20 : 28, border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.07), 0 16px 32px rgba(0,0,0,0.07)' }}
        >
          <div style={{ textAlign: 'center' }}>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              style={{ width: isMobile ? 120 : 160, height: isMobile ? 120 : 160, borderRadius: '50%', background: '#fdf2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '1px solid rgba(227,150,191,0.15)', position: 'relative' }}
            >
              {!trophyImageError ? (
                <img 
                  src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221200%22%20height%3D%22400%22%20viewBox%3D%220%200%201200%20400%22%3E%3Crect%20width%3D%221200%22%20height%3D%22400%22%20fill%3D%22%23f5f5f5%22%2F%3E%3Ctext%20x%3D%22600%22%20y%3D%22200%22%20font-family%3D%22sans-serif%22%20font-size%3D%2228%22%20fill%3D%22%23bbb%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E"
                  alt="Trofeo"
                  onError={() => setTrophyImageError(true)}
                  style={{ width: isMobile ? 100 : 136, height: isMobile ? 100 : 136, objectFit: 'contain' }}
                />
              ) : (
                <Trophy size={isMobile ? 64 : 96} color={PINK} />
              )}
              {/* Confeti mejorado */}
              {[...Array(20)].map((_, i) => {
                const colors = ['#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#fb7185', '#fcd34d', '#4ade80', '#f87171', '#818cf8'];
                const angle = (i / 20) * Math.PI * 2;
                const dist = 60 + Math.random() * 40;
                const isStrip = i % 3 === 0;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0 }}
                    animate={{ 
                      opacity: [0, 1, 1, 0], 
                      x: [0, Math.cos(angle) * dist, Math.cos(angle) * (dist + 20)],
                      y: [0, Math.sin(angle) * dist - 30, Math.sin(angle) * (dist + 20) + 60],
                      rotate: [0, 180 + Math.random() * 360, 360 + Math.random() * 720],
                      scale: [0, 1, 0.8, 0]
                    }}
                    transition={{ 
                      delay: i * 0.05, 
                      duration: 2.5 + Math.random(), 
                      repeat: Infinity,
                      repeatDelay: 1.5 + Math.random()
                    }}
                    style={{
                      position: 'absolute',
                      width: isStrip ? 4 : 6,
                      height: isStrip ? 12 : 6,
                      borderRadius: isStrip ? 2 : '50%',
                      background: colors[i % colors.length],
                      left: '50%',
                      top: '50%',
                      marginLeft: -3,
                      marginTop: -3,
                      transformOrigin: 'center',
                      boxShadow: `0 0 4px ${colors[i % colors.length]}40`
                    }}
                  />
                );
              })}
            </motion.div>
            
            <motion.h2 
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{ margin: 0, fontSize: isMobile ? 20 : 26, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}
            >
              ¡Felicidades!
            </motion.h2>
            
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              style={{ margin: '6px 0 0', fontSize: isMobile ? 14 : 16, fontWeight: 700, color: PINK, letterSpacing: '-0.01em' }}
            >
              Eres lo más premium
            </motion.p>
            
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              style={{ margin: '8px 0 0', fontSize: isMobile ? 12 : 14, color: '#6b7280', fontWeight: 500, lineHeight: 1.5 }}
            >
              Has alcanzado el nivel más alto.<br />
              Disfruta de todos los beneficios exclusivos.
            </motion.p>
          </div>
        </motion.div>
      )}

      {/* Coupon Action */}
      {nextLevel && nextLevel.couponPercent > 0 && (
        <AnimatePresence>
          {(!couponGenerated && paidOrdersCount >= nextLevel.requiredOrders) ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              style={{ padding: 32, background: '#f9fafb', borderRadius: 28, marginBottom: 40, border: '1.5px solid #d1d5db', boxShadow: 'inset 0 1px 2px 0 rgba(0,0,0,0.015), 0 1px 2px 0 rgba(0,0,0,0.025), 0 2px 8px 0 rgba(0,0,0,0.035), 0 4px 16px 0 rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden' }}
            >
              {/* Decorative sparkles */}
              <div style={{ position: 'absolute', top: 0, right: 0, width: '100%', height: '100%', background: 'url("https://www.transparenttextures.com/patterns/stardust.png")', opacity: 0.2, pointerEvents: 'none' }} />
              
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 20 : 24, position: 'relative', zIndex: 1 }}>
                <div style={{ width: 64, height: 64, borderRadius: 20, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }}>
                  <Gift size={32} color={PINK} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#111827' }}>¡Tu Recompensa del {nextLevel.couponPercent}%!</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7280', fontWeight: 500 }}>Felicidades por subir a {nextLevel.name}. Úsalo en tu próxima compra.</p>
                </div>
                  <motion.button
                  whileHover={{ scale: 1.05, translateY: -2 }} whileTap={{ scale: 0.95 }}
                  onClick={generateCoupon}
                  style={{ width: isMobile ? '100%' : 'auto', padding: isMobile ? '14px 20px' : '18px 36px', background: '#fff', color: PINK, border: 'none', borderRadius: 20, fontSize: 13, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.15)', transition: 'all 0.2s ease', textTransform: 'uppercase', letterSpacing: '0.02em' }}
                >
                  <Sparkles size={18} /> Reclamar Cupón
                </motion.button>
              </div>
            </motion.div>
          ) : couponGenerated && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              style={{ padding: 24, background: '#f9fafb', borderRadius: 24, border: '1.5px solid #d1d5db', marginBottom: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'inset 0 1px 2px 0 rgba(0,0,0,0.015), 0 1px 2px 0 rgba(0,0,0,0.025), 0 2px 8px 0 rgba(0,0,0,0.035), 0 4px 16px 0 rgba(0,0,0,0.02)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#d1d5db', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                  <Award size={20} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#374151' }}>Cupón Activo</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Añadido a tu cuenta para tu próxima compra</p>
                </div>
              </div>
              <div style={{ background: '#f3f4f6', padding: '12px 24px', borderRadius: 16, border: '1.5px dashed #d1d5db', fontSize: 22, fontWeight: 900, color: '#374151', letterSpacing: '0.1em', fontFamily: 'monospace' }}>
                {couponCode}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Benefits Area */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 32, position: 'relative', zIndex: 1 }}>
        {/* Current Benefits */}
        <div>
          <div 
            onClick={() => setShowCurrentBenefits(!showCurrentBenefits)}
            style={{ 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: isMobile ? 10 : 20 
            }}
          >
            <h3 style={{ fontSize: isMobile ? 10 : 12, fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>
              TUS PRIVILEGIOS {currentLevel.name.toUpperCase()}
            </h3>
            {showCurrentBenefits ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
          </div>
          <AnimatePresence>
            {showCurrentBenefits && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 6 : 12, paddingBottom: isMobile ? 10 : 0 }}>
                  {currentLevel.benefits.map((benefit, i) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                      key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: isMobile ? 8 : 14, background: '#fff', padding: isMobile ? '10px 12px' : '16px 20px', borderRadius: isMobile ? 12 : 16, border: '1.5px solid #d1d5db', boxShadow: 'inset 0 1px 2px 0 rgba(0,0,0,0.015), 0 1px 2px 0 rgba(0,0,0,0.025), 0 2px 8px 0 rgba(0,0,0,0.035), 0 4px 16px 0 rgba(0,0,0,0.02)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: isMobile ? 8 : 14 }}>
                        <div style={{ marginTop: 2, color: currentLevel.color }}>
                          <CheckCircle2 size={18} />
                        </div>
                        <p style={{ margin: 0, fontSize: 14, color: '#4b5563', fontWeight: 600, lineHeight: 1.5, flex: 1 }}>{benefit}</p>
                      </div>
                      <BenefitActionLink benefit={benefit} accentColor={currentLevel.color} compact={isMobile} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Next Levels Teaser */}
        {LEVELS.filter(l => l.requiredOrders > currentLevel.requiredOrders).map((level) => {
          const isLocked = paidOrdersCount < level.requiredOrders;
          return (
            <div key={level.id}>
              <div 
                onClick={() => {
                  // Close all others first
                  setShowSilverBenefits(false);
                  setShowGoldBenefits(false);
                  setShowDiamondBenefits(false);
                  setShowRubyBenefits(false);
                  
                  // Then toggle the clicked one (if already open, it will close because we closed all above)
                  if (level.id === 'silver') setShowSilverBenefits(!showSilverBenefits);
                  if (level.id === 'gold') setShowGoldBenefits(!showGoldBenefits);
                  if (level.id === 'diamond') setShowDiamondBenefits(!showDiamondBenefits);
                  if (level.id === 'ruby') setShowRubyBenefits(!showRubyBenefits);
                }}
                style={{ 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginBottom: 20 
                }}
              >
                <h3 style={{ fontSize: 12, fontWeight: 900, color: level.color, textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Lock size={14} /> DESBLOQUEA EN {level.name.toUpperCase()} <span style={{ color: '#6b7280', fontWeight: 600 }}>({level.requiredOrders} pedidos)</span>
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img 
                    src={level.badge || level.image || ''} 
                    alt={level.name}
                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                  />
                  {(level.id === 'silver' ? showSilverBenefits : level.id === 'gold' ? showGoldBenefits : level.id === 'diamond' ? showDiamondBenefits : showRubyBenefits) ? 
                    <ChevronUp size={16} color={level.color} /> : 
                    <ChevronDown size={16} color={level.color} />}
                </div>
              </div>
              <AnimatePresence>
                {(level.id === 'silver' ? showSilverBenefits : level.id === 'gold' ? showGoldBenefits : level.id === 'diamond' ? showDiamondBenefits : showRubyBenefits) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 10 }}>
                      {level.benefits.filter(b => !currentLevel.benefits.includes(b)).slice(0, 4).map((benefit, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, background: '#fff', border: '1.5px dashed #e2e8f0', padding: '16px 20px', borderRadius: 16, opacity: isLocked ? 0.6 : 1, boxShadow: 'inset 0 1px 2px 0 rgba(0,0,0,0.01), 0 1px 2px 0 rgba(0,0,0,0.02), 0 2px 6px 0 rgba(0,0,0,0.015)' }}>
                          <div style={{ marginTop: 2, color: isLocked ? '#cbd5e1' : level.color }}>
                            <Sparkles size={18} />
                          </div>
                          <p style={{ margin: 0, fontSize: 14, color: isLocked ? '#64748b' : '#4b5563', fontWeight: 600, lineHeight: 1.5 }}>{benefit}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

    </div>
  );
}
