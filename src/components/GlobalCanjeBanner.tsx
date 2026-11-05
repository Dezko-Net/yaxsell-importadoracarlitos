'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Gift, Sparkles, ChevronRight } from 'lucide-react';
import { formatPrice } from '@/lib/db';

export default function GlobalCanjeBanner() {
  const { user } = useAuth();
  const [canjeCredit, setCanjeCredit] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setCanjeCredit(null);
      return;
    }
    let cancelled = false;
    const fetchCredit = async () => {
      try {
        const res = await fetch(
          `/api/public-data/canje-info?userId=${encodeURIComponent(user.id)}&email=${encodeURIComponent(user.email)}&lightweight=1`
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setCanjeCredit(data.hasCredit ? data.creditAmount : null);
          }
        }
      } catch (err) {
        console.error('Error fetching canje info:', err);
      }
    };
    fetchCredit();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!canjeCredit || canjeCredit <= 0) return null;

  return (
    <div className="relative z-[100]">
      {/* Animación de fondo brillante constante */}
      <style>{`
        @keyframes shineBanner {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 15px rgba(236, 72, 153, 0.4), inset 0 0 10px rgba(255, 255, 255, 0.3); }
          50% { box-shadow: 0 0 25px rgba(236, 72, 153, 0.8), inset 0 0 20px rgba(255, 255, 255, 0.6); }
        }
      `}</style>
      
      <Link href="/canje" className="block relative w-full overflow-hidden" style={{ textDecoration: 'none' }}>
        {/* Banner container */}
        <div 
          className="relative flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 px-4 py-3 sm:py-4 transition-all hover:brightness-110"
          style={{ 
            background: 'linear-gradient(90deg, #db2777, #f43f5e, #db2777)', 
            backgroundSize: '200% auto',
            animation: 'shineBanner 3s linear infinite, pulseGlow 2s ease-in-out infinite',
            borderBottom: '2px solid rgba(255,255,255,0.2)'
          }}
        >
          {/* Decorative sparkles */}
          <Sparkles className="absolute top-2 left-4 sm:left-10 text-white/40 w-5 h-5 animate-pulse" />
          <Sparkles className="absolute bottom-2 right-4 sm:right-10 text-white/40 w-6 h-6 animate-pulse" style={{ animationDelay: '1s' }} />
          
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm shadow-inner">
              <Gift className="w-6 h-6 sm:w-7 sm:h-7 text-white drop-shadow-md" />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="text-white font-black text-[15px] sm:text-lg tracking-wide drop-shadow-sm text-center sm:text-left leading-tight">
                ¡Tienes {formatPrice(canjeCredit)} a tu favor!
              </span>
              <span className="text-pink-100 font-medium text-xs sm:text-sm text-center sm:text-left drop-shadow-sm">
                Canjéalos ahora por productos nuevos
              </span>
            </div>
          </div>
          
          <div className="mt-2 sm:mt-0 flex items-center gap-1 bg-white text-pink-600 px-4 py-1.5 sm:py-2 rounded-full font-black text-xs sm:text-sm shadow-lg hover:scale-105 active:scale-95 transition-transform uppercase tracking-wider">
            Reclamar Aquí <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </Link>
    </div>
  );
}
