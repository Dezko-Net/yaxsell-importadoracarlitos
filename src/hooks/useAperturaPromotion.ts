'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { AperturaSettings } from '@/lib/apertura-promo';

// ── Singleton cache: todos los hooks comparten la misma llamada ──
let cachedSettings: AperturaSettings | null = null;
let cachedClaimed: boolean = false;
let cachedFirstPurchaseActive: boolean = false;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos en memoria + sessionStorage
const SESSION_CACHE_KEY = 'yaxsel_apertura_promo_v1';
let pendingPromise: Promise<{ settings: AperturaSettings; claimed: boolean; firstPurchaseActive: boolean }> | null = null;

function isPosOrErpRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname;
  return (
    p.startsWith('/pos') ||
    p.startsWith('/erp-dashboard') ||
    p.startsWith('/inventario')
  );
}

async function loadApertura(isLoggedIn: boolean): Promise<{ settings: AperturaSettings; claimed: boolean; firstPurchaseActive: boolean }> {
  if (isPosOrErpRoute()) {
    const inactive: AperturaSettings = { isActive: false, discountPercent: 0, minPurchase: 0 };
    return { settings: inactive, claimed: false, firstPurchaseActive: false };
  }

  const now = Date.now();
  if (cachedSettings && (now - cacheTimestamp) < CACHE_TTL) {
    // Si ya tenemos caché y no está logueado, o ya tenemos claimed, reusar
    if (!isLoggedIn || cachedClaimed !== undefined) {
      return { settings: cachedSettings, claimed: cachedClaimed, firstPurchaseActive: cachedFirstPurchaseActive };
    }
  }

  if (!isLoggedIn && typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.settings && now - Number(parsed.ts || 0) < CACHE_TTL) {
          cachedSettings = parsed.settings;
          cachedClaimed = false;
          cachedFirstPurchaseActive = false;
          cacheTimestamp = Number(parsed.ts);
          return { settings: parsed.settings, claimed: false, firstPurchaseActive: false };
        }
      }
    } catch {}
  }

  // Si ya hay una petición en vuelo, reusar la misma Promise
  if (pendingPromise) return pendingPromise;

  pendingPromise = (async () => {
    try {
      // ── Usa la API route cacheada en vez del SDK directo ──
      const res = await fetch('/api/public-data/apertura');
      const globalSettings: AperturaSettings = res.ok
        ? await res.json()
        : { isActive: true, discountPercent: 10, minPurchase: 0 };

      let claimed = false;
      let firstPurchaseActive = false;
      
      if (isLoggedIn) {
        try {
          const { getServices } = await import('@/lib/firebase-compat');
          const account = getServices().account;
          const acc = await account.get();
          const prefs = (acc as any).prefs || {};
          claimed = Boolean(prefs.welcomeGiftClaimed);
          firstPurchaseActive = Boolean(prefs.firstPurchaseActive);
        } catch {
          claimed = false;
          firstPurchaseActive = false;
        }
      }
      
      cachedSettings = globalSettings;
      cachedClaimed = claimed;
      cachedFirstPurchaseActive = firstPurchaseActive;
      cacheTimestamp = Date.now();
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ settings: globalSettings, ts: cacheTimestamp }));
        } catch {}
      }
      return { settings: globalSettings, claimed, firstPurchaseActive };
    } finally {
      pendingPromise = null;
    }
  })();

  return pendingPromise;
}

export function invalidateAperturaCache() {
  cachedSettings = null;
  cachedClaimed = false;
  cachedFirstPurchaseActive = false;
  cacheTimestamp = 0;
  pendingPromise = null;
  if (typeof window !== 'undefined') {
    try { sessionStorage.removeItem(SESSION_CACHE_KEY); } catch {}
  }
}

/** Promoción global aplica precios visuales a toda la tienda si está activa en el admin */
export function useAperturaPromotion() {
  const { isLoggedIn } = useAuth();
  const [settings, setSettings] = useState<AperturaSettings | null>(cachedSettings);
  const [hasClaimedGift, setHasClaimedGift] = useState(cachedClaimed);
  const [firstPurchaseActive, setFirstPurchaseActive] = useState(cachedFirstPurchaseActive);
  const [isLoading, setIsLoading] = useState(!cachedSettings);

  useEffect(() => {
    let cancelled = false;

    loadApertura(isLoggedIn).then(({ settings: s, claimed, firstPurchaseActive: fpa }) => {
      if (cancelled) return;
      setSettings(s);
      setHasClaimedGift(claimed);
      setFirstPurchaseActive(fpa);
      setIsLoading(false);
    });

    const onClaimed = () => {
      invalidateAperturaCache();
      loadApertura(isLoggedIn).then(({ settings: s, claimed, firstPurchaseActive: fpa }) => {
        if (cancelled) return;
        setSettings(s);
        setHasClaimedGift(claimed);
        setFirstPurchaseActive(fpa);
      });
    };

    window.addEventListener('apertura-gift-claimed', onClaimed);
    return () => {
      cancelled = true;
      window.removeEventListener('apertura-gift-claimed', onClaimed);
    };
  }, [isLoggedIn]);

  // Si el usuario tiene activo su regalo de primera compra, sobreescribimos la configuración
  const overrideSettings = firstPurchaseActive 
    ? { isActive: true, discountPercent: 20, minPurchase: 0 }
    : null;

  const activeSettings = overrideSettings || settings;
  const canShowDiscount = Boolean(activeSettings?.isActive);
  const effectiveSettings: AperturaSettings | null = canShowDiscount ? activeSettings : null;

  return {
    settings: effectiveSettings,
    isLoading,
    hasClaimedGift,
    isPromotionEnabled: activeSettings?.isActive ?? false,
    isActive: canShowDiscount,
    discountPercent: canShowDiscount ? (activeSettings?.discountPercent ?? 0) : 0,
    minPurchase: activeSettings?.minPurchase ?? 0,
  };
}
