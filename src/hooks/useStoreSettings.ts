'use client';

import { useEffect, useState } from 'react';

export interface Attendant {
  id: number | string;
  name: string;
  number: string;
  img?: string;
  border?: string;
  hover?: string;
  text?: string;
  sub?: string;
  active?: boolean;
  floatingEmojis?: string[];
}

export interface BalatinContact {
  name: string;
  number: string;
  img?: string;
  active?: boolean;
  sub?: string;
}

export const DEFAULT_WHATSAPP_CONTACTS: Attendant[] = [
  {
    id: 0,
    name: 'Lissy',
    number: '56936302521',
    img: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/08/1785997439696-pegada-1785997429956.png',
    border: 'border-red-400',
    hover: 'hover:border-red-500',
    text: 'text-red-500',
    sub: 'Personalizado',
    active: true,
    floatingEmojis: ['❤️', '💖', '💕'],
  },
  {
    id: 1,
    name: 'Fernanda',
    number: '56945892576',
    img: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/08/1785998075009-pegada-1785998072451.png',
    border: 'border-gray-500',
    hover: 'hover:border-gray-600',
    text: 'text-gray-600',
    sub: 'Personalizado',
    active: true,
    floatingEmojis: ['🖤', '🖤', '🖤'],
  },
];

export const DEFAULT_BALATIN_CONTACT: BalatinContact = {
  name: 'Importadora Carlitos',
  number: '56936599658',
  img: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/09/1789051062597-pegada-1789051061671.png',
  active: true,
  sub: 'Dueño Importadora Carlitos',
};

export interface HomeMarketing {
  heroSlides: { enabled: boolean; desktopUrl: string; mobileUrl: string }[];
  newsBanner: { enabled: boolean; desktopUrl: string; mobileUrl: string };
}

export interface StoreSettings {
  $id?: string;
  storeName: string;
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  description: string;
  showInAnnouncementBar: boolean;
  unlimitedStock: boolean;
  inventoryMode: 'erp_integrated' | 'web_independent';
  minimumPurchase?: number;
  bankAccountHolder?: string;
  bankRut?: string;
  bankName?: string;
  bankAccountType?: string;
  bankAccountNumber?: string;
  bankEmail?: string;
  bankInstructions?: string;
  whatsappContacts?: Attendant[];
  balatinContact?: BalatinContact;
  attendantMode?: 'choice' | 'direct' | 'rotation' | 'yexi';
  allowWhatsappOrders?: boolean;
  allowWebOrders?: boolean;
  whatsappMessageTemplate?: string;
  homeMarketing?: HomeMarketing;
}

let cachedSettings: StoreSettings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // La conexión del inventario puede cambiar desde otra pestaña o sesión.
let pendingPromise: Promise<StoreSettings> | null = null;

async function fetchStoreSettings(): Promise<StoreSettings> {
  try {
    const response = await fetch(`/api/store-settings`, { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      // Sincronizar en localStorage como fallback offline/instantáneo
      if (typeof window !== 'undefined' && data) {
        try {
          const prev = JSON.parse(localStorage.getItem('store_bank_details') || '{}');
          localStorage.setItem('store_bank_details', JSON.stringify({
            ...prev,
            minimumPurchase: String(data.minimumPurchase || prev.minimumPurchase || '50000'),
            bankAccountHolder: data.bankAccountHolder || prev.bankAccountHolder || '',
            bankRut: data.bankRut || prev.bankRut || '',
            bankName: data.bankName || prev.bankName || '',
            bankAccountType: data.bankAccountType || prev.bankAccountType || '',
            bankAccountNumber: data.bankAccountNumber || prev.bankAccountNumber || '',
            bankEmail: data.bankEmail || prev.bankEmail || '',
            bankInstructions: data.bankInstructions || prev.bankInstructions || '',
          }));
          if (Array.isArray(data.whatsappContacts) && data.whatsappContacts.length > 0) {
            localStorage.setItem('store_whatsapp_contacts', JSON.stringify(data.whatsappContacts));
          }
          if (data.balatinContact) {
            localStorage.setItem('store_balatin_contact', JSON.stringify(data.balatinContact));
          }
        } catch {}
      }
      return data;
    }
  } catch (error) {
    console.error('Failed to fetch store settings from API:', error);
  }
  return {
    storeName: '', logoUrl: '', phone: '', email: '', address: '', website: '', description: '',
    showInAnnouncementBar: false, unlimitedStock: false, minimumPurchase: 50000,
    inventoryMode: 'erp_integrated',
    whatsappContacts: DEFAULT_WHATSAPP_CONTACTS,
    balatinContact: DEFAULT_BALATIN_CONTACT,
    attendantMode: 'choice',
    allowWhatsappOrders: true,
    allowWebOrders: true,
  };
}

async function loadStoreSettings(): Promise<StoreSettings> {
  if (typeof window !== 'undefined') {
    const p = window.location.pathname;
    if (p.startsWith('/pos') || p.startsWith('/erp-dashboard') || p.startsWith('/inventario')) {
      return {
        storeName: 'Importadora Carlitos', logoUrl: '', phone: '', email: '', address: '', website: '', description: '',
        showInAnnouncementBar: false, unlimitedStock: false, minimumPurchase: 50000,
        inventoryMode: 'erp_integrated',
        whatsappContacts: DEFAULT_WHATSAPP_CONTACTS,
        balatinContact: DEFAULT_BALATIN_CONTACT,
        attendantMode: 'choice',
        allowWhatsappOrders: true,
        allowWebOrders: true,
      };
    }
    if (!cachedSettings) {
      try {
        const raw = sessionStorage.getItem('carlitos_store_settings_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.data && Date.now() - Number(parsed.ts || 0) < CACHE_TTL) {
            cachedSettings = parsed.data;
            cacheTimestamp = Number(parsed.ts);
            return parsed.data;
          }
        }
      } catch {}
    }
  }
  const now = Date.now();
  if (cachedSettings && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedSettings;
  }

  if (pendingPromise) return pendingPromise;

  pendingPromise = (async () => {
    try {
      const settings = await fetchStoreSettings();
      cachedSettings = settings;
      cacheTimestamp = Date.now();
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('carlitos_store_settings_v1', JSON.stringify({ data: settings, ts: cacheTimestamp }));
        } catch {}
      }
      cacheTimestamp = Date.now();
      return settings;
    } finally {
      pendingPromise = null;
    }
  })();

  return pendingPromise;
}

export function invalidateStoreSettingsCache() {
  cachedSettings = null;
  cacheTimestamp = 0;
  pendingPromise = null;
  if (typeof window !== 'undefined') {
    try { sessionStorage.removeItem('carlitos_store_settings_v1'); } catch {}
  }
}

export function useStoreSettings() {
  const [settings, setSettings] = useState<StoreSettings | null>(cachedSettings);
  const [isLoading, setIsLoading] = useState(!cachedSettings);

  useEffect(() => {
    let cancelled = false;
    loadStoreSettings().then(s => {
      if (cancelled) return;
      setSettings(s);
      setIsLoading(false);
    });

    const onSettingsUpdate = () => {
      invalidateStoreSettingsCache();
      loadStoreSettings().then(s => {
        if (cancelled) return;
        setSettings(s);
      });
    };
    const onSettingsStorage = (event: StorageEvent) => {
      if (event.key === 'yaxsell_store_settings_updated_at') onSettingsUpdate();
    };

    window.addEventListener('store-settings-updated', onSettingsUpdate);
    window.addEventListener('storage', onSettingsStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('store-settings-updated', onSettingsUpdate);
      window.removeEventListener('storage', onSettingsStorage);
    };
  }, []);

  const effectiveMinPurchase = settings?.minimumPurchase ?? (typeof window !== 'undefined' ? (() => {
    try {
      const stored = localStorage.getItem('store_bank_details');
      if (stored) {
        const val = Number(JSON.parse(stored).minimumPurchase);
        if (!isNaN(val) && val > 0) return val;
      }
    } catch {}
    return 50000;
  })() : 50000);

  const effectiveWhatsappContacts = settings?.whatsappContacts || (typeof window !== 'undefined' ? (() => {
    try {
      const stored = localStorage.getItem('store_whatsapp_contacts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return null;
  })() : null) || DEFAULT_WHATSAPP_CONTACTS;

  const effectiveBalatinContact = settings?.balatinContact || (typeof window !== 'undefined' ? (() => {
    try {
      const stored = localStorage.getItem('store_balatin_contact');
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  })() : null) || DEFAULT_BALATIN_CONTACT;

  return {
    settings,
    isLoading,
    storeName: settings?.storeName || '',
    logoUrl: settings?.logoUrl || '',
    unlimitedStock: settings?.unlimitedStock ?? false,
    inventoryMode: settings?.inventoryMode || 'erp_integrated',
    minimumPurchase: effectiveMinPurchase,
    whatsappContacts: effectiveWhatsappContacts,
    balatinContact: effectiveBalatinContact,
    attendantMode: settings?.attendantMode || 'choice',
    allowWhatsappOrders: settings?.allowWhatsappOrders ?? true,
    allowWebOrders: settings?.allowWebOrders ?? true,
    whatsappMessageTemplate: settings?.whatsappMessageTemplate || '',
    homeMarketing: settings?.homeMarketing || null,
  };
}
