'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from '@/components/StoreImage';
import Link from 'next/link';
import { Zap, Clock, ShoppingCart, Timer, Ticket, Tag, Copy, CheckCircle2 } from 'lucide-react';
import { getServices, getFirebaseConfig, TIMED_OFFERS_COLLECTION, formatPrice } from '@/lib/db';
import { Query } from '@/lib/db';
import { TimedOffer } from '@/types';

function getExpiresAt(offer: TimedOffer): number | null {
  if (offer.timeType === 'endDateTime' && offer.endDateTime) {
    return new Date(offer.endDateTime).getTime();
  }
  if (offer.timeType === 'duration' && offer.durationHours) {
    const start = offer.activatedAt || (offer as any).$createdAt;
    if (start) return new Date(start).getTime() + offer.durationHours * 3600000;
  }
  return null;
}

function isOfferValid(offer: TimedOffer): boolean {
  if (!offer.isActive || offer.status !== 'active') return false;
  const exp = getExpiresAt(offer);
  if (exp === null) return true; // no time data — trust admin activation
  return exp > Date.now();
}

function CountdownTimer({ offer }: { offer: TimedOffer }) {
  const [display, setDisplay] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    const tick = () => {
      const expiresAt = getExpiresAt(offer);
      if (!expiresAt) { setDisplay('Sin tiempo'); return; }
      const diff = expiresAt - Date.now();
      if (diff <= 0) { setDisplay('Expirado'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setUrgent(diff < 30 * 60000);
      if (h >= 24) {
        const days = Math.floor(h / 24);
        setDisplay(`${days}d ${h % 24}h ${m}m`);
      } else {
        setDisplay(`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offer]);

  return (
    <span className={`font-mono font-bold text-sm ${urgent ? 'text-red-400' : 'text-orange-400'}`}>
      {display}
    </span>
  );
}

export default function OfertasPage() {
  const [offers, setOffers] = useState<TimedOffer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [publicCoupons, setPublicCoupons] = useState<any[]>([]);
  const [copiedCode, setCopiedCode] = useState('');

  const load = useCallback(async () => {
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const res = await databases.listDocuments(databaseId, TIMED_OFFERS_COLLECTION, [
        Query.equal('isActive', true),
        Query.equal('status', 'active'),
        Query.limit(50),
      ]);
      const active = (res.documents as unknown as TimedOffer[]).filter(isOfferValid);
      setOffers(active);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, []);

  // Load public coupons
  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/public-data/coupons', { cache: 'no-store' });
        if (!response.ok) throw new Error(`No se pudieron cargar los cupones (${response.status})`);
        const coupons = await response.json();
        const active = (Array.isArray(coupons) ? coupons : []).filter((c: any) => {
          const expiresAt = c.EXPIRESAT || c.EXPIRYDATE || (c.ENDAT ? new Date(c.ENDAT * 1000).toISOString() : null);
          if (expiresAt && new Date(expiresAt) < new Date()) return false;
          if (c.MAXUSES && (c.USEDCOUNT || 0) >= c.MAXUSES) return false;
          
          // Filter out coupons with a valid user restriction
          const userRestriction = c.userRestriction || c.USERRESTRICTION || null;
          if (userRestriction && userRestriction.trim() !== '' && userRestriction.trim().toLowerCase() !== 'null') {
            return false;
          }
          return true;
        });
        setPublicCoupons(active);
      } catch {}
    })();
  }, []);

  useEffect(() => { load(); }, [load]);

  // 🔥 Refresco onFocus eliminado a petición del administrador para ahorrar llamadas
  useEffect(() => {
    // Ya no se recarga al hacer focus
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
          <Timer size={20} className="text-orange-400" />
        </div>
        <h1 className="text-3xl font-bold">Ofertas por tiempo limitado</h1>
      </div>
      <p className="text-white/50 text-sm mb-8 ml-[52px]">Precios especiales disponibles solo por tiempo limitado</p>

      {/* Public coupons */}
      {publicCoupons.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Ticket size={18} className="text-pink-400" />
            <h2 className="text-lg font-bold text-white/90">Cupones disponibles</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {publicCoupons.map((c: any) => {
              const code = (c.code || c.CODE || '').toUpperCase();
              if (!code) return null;
              const discType = c.DISCOUNTTYPE ?? c.TYPE ?? 'percent';
              const discVal = c.DISCOUNTVALUE ?? c.VALUE ?? 0;
              const label = (discType === 'percent' || discType === 'percentage') ? `${discVal}% OFF` : `${formatPrice(discVal)} OFF`;
              const copied = copiedCode === code;
              return (
                <div key={c.$id} className="glass rounded-2xl p-5 flex items-center gap-4 group hover:border-pink-500/30 transition-all">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center shrink-0 border border-pink-500/10">
                    <Tag size={22} className="text-pink-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-sm font-extrabold text-white tracking-wider bg-white/10 px-2 py-0.5 rounded">{code}</code>
                      <span className="text-xs font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">{label}</span>
                    </div>
                    {c.DESCRIPTION && <p className="text-xs text-white/50 truncate">{c.DESCRIPTION}</p>}
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(code); setCopiedCode(code); setTimeout(() => setCopiedCode(''), 2000); }}
                    className="shrink-0 w-9 h-9 rounded-lg bg-white/10 hover:bg-pink-500/20 flex items-center justify-center transition-all border border-white/10 hover:border-pink-500/30"
                    title="Copiar cupón">
                    {copied ? <CheckCircle2 size={16} className="text-green-400" /> : <Copy size={16} className="text-white/60" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => <div key={i} className="h-72 glass rounded-2xl animate-pulse" />)}
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 glass rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Timer size={36} className="text-white/20" />
          </div>
          <p className="text-xl font-bold mb-2">No hay ofertas activas</p>
          <p className="text-white/50 text-sm mb-6">Vuelve pronto para ver nuevas promociones</p>
          <Link href="/productos" className="gradient-bg text-white px-6 py-3 rounded-xl font-medium hover:opacity-90">
            Ver todos los productos
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {offers.map(offer => (
            <OfferCard key={offer.$id} offer={offer} />
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer }: { offer: TimedOffer }) {
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setPulse(p => !p), 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <Link href={offer.targetId ? `/productos/${offer.targetId}` : '#'}>
      <div className="relative rounded-2xl overflow-hidden h-80 cursor-pointer group shadow-xl hover:shadow-2xl transition-shadow">
        {/* Background image */}
        {offer.customImagePath ? (
          <Image
            src={offer.customImagePath}
            alt={offer.productName}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-800 to-purple-900 flex items-center justify-center text-6xl">
            📦
          </div>
        )}

        {/* Bottom gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* "OFERTA POR TIEMPO LIMITADO" badge — top right, pulsing */}
        <div className={`absolute top-3 right-3 flex items-center gap-1.5 bg-orange-500 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-xl shadow-lg transition-transform duration-500 ${pulse ? 'scale-105' : 'scale-95'}`}>
          <Clock size={10} className="shrink-0" />
          OFERTA POR TIEMPO LIMITADO
        </div>

        {/* Content at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          {/* Title */}
          <p className="text-white font-bold text-base leading-tight mb-1 drop-shadow-md">
            {offer.title}
          </p>
          {/* Product name */}
          <p className="text-white/80 text-xs font-medium mb-3 truncate">
            {offer.productName}
          </p>
          {/* Prices row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-white/60 text-sm line-through">
              {formatPrice(offer.originalPrice)}
            </span>
            <span className="text-green-400 text-xl font-bold">
              {formatPrice(offer.discountPrice)}
            </span>
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-lg">
              -{offer.discountPercentage}%
            </span>
          </div>
          {/* Countdown */}
          <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-lg px-2.5 py-1.5 w-fit">
            <Clock size={12} className="text-orange-400 shrink-0" />
            <CountdownTimer offer={offer} />
          </div>
        </div>
      </div>
    </Link>
  );
}
