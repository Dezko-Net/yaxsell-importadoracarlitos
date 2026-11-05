import { NextResponse } from 'next/server';
import { revalidateTag, unstable_cache } from 'next/cache';
import { STORE_SETTINGS_COLLECTION, getAdminApp, getAdminDb } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID } from '@/lib/db';
import { getAuth } from 'firebase-admin/auth';
import { isAdminEmail } from '@/lib/admin-access';
import { clearCatalogMemoryCache } from '@/lib/catalog-cache';
import { clearPublicProductDetailCache } from '@/lib/public-product-detail-cache';
import { MODULE_ACCESS } from '@/lib/module-access';
import {
  DEFAULT_INVENTORY_CONNECTION_MODE,
  getInventoryConnectionMode,
  normalizeInventoryConnectionMode,
} from '@/lib/inventory-mode';

// Caché en memoria global de 60 minutos (se limpia/actualiza al instante en POST)
const gSettings = globalThis as unknown as {
  __yaxsellStoreSettingsCache?: { data: any; ts: number };
  __yaxsellUnlimitedStockCache?: { value: boolean; expiresAt: number };
};
const MEMORY_CACHE_TTL = 60 * 60 * 1000;

// Mantener la configuración almacenada y actualizar únicamente la marca mostrada.
const displayStoreBrand = (value: unknown) =>
  typeof value === 'string'
    ? value.replace(/(?:importadora\s*3b|(?:importadora\s+)?don\s*balato(?:\s+[ab])?)/gi, 'Importadora Carlitos')
    : '';

const DEFAULT_WHATSAPP_CONTACTS = [
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

const DEFAULT_BALATIN_CONTACT = {
  name: 'Importadora Carlitos',
  number: '56936599658',
  img: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/09/1789051062597-pegada-1789051061671.png',
  active: true,
  sub: 'Dueño Importadora Carlitos'
};

const DEFAULT_HOME_MARKETING = {
  heroSlides: [
    {
      enabled: true,
      desktopUrl: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/DONBALATO/pagina/assets/images/hero-slide1-desktop.webp',
      mobileUrl: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/DONBALATO/pagina/assets/images/hero-slide1-mobile.webp',
    },
    {
      enabled: true,
      desktopUrl: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1785054964756-pegada-1785054949538.png',
      mobileUrl: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1785055391342-pegada-1785055359108.png',
    },
    {
      enabled: true,
      desktopUrl: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1785058391199-pegada-1785058361185.png',
      mobileUrl: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1785058450858-pegada-1785058441498.png',
    },
  ],
  newsBanner: {
    enabled: true,
    desktopUrl: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1785357824719-pegada-1785357821625.png',
    mobileUrl: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1785356616648-pegada-1785356614330.png',
  },
};

// Serve the optimized copy even when the old URL is saved in store settings.
const OPTIMIZED_MARKETING_IMAGES: Record<string, string> = {
  'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1785054964756-pegada-1785054949538.png': '/images/optimized/slide2-desktop.webp',
  'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1785055391342-pegada-1785055359108.png': '/images/optimized/slide2-mobile.webp',
  'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1785058391199-pegada-1785058361185.png': '/images/optimized/slide3-desktop.webp',
  'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1785058450858-pegada-1785058441498.png': '/images/optimized/slide3-mobile.webp',
  'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1785357824719-pegada-1785357821625.png': '/images/optimized/banner-home.webp',
  'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1785356616648-pegada-1785356614330.png': '/images/optimized/banner-home-mobile.webp',
};

function optimizeMarketingUrl(url: string): string {
  return OPTIMIZED_MARKETING_IMAGES[url] || url;
}

const getCachedStoreSettings = unstable_cache(
  async () => {
    const adminDb = getAdminDb();
    const colRef = adminDb.collection(STORE_SETTINGS_COLLECTION);
    const mainSnap = await colRef.doc('main').get();
    const configSnap = !mainSnap.exists ? await colRef.doc('config').get() : null;
    const fallbackSnap = !mainSnap.exists && (!configSnap || !configSnap.exists)
      ? await colRef.limit(1).get()
      : null;
    const fallbackData = fallbackSnap && !fallbackSnap.empty ? fallbackSnap.docs[0].data() : {};
    const mergedDoc = {
      ...fallbackData,
      ...(configSnap && configSnap.exists ? configSnap.data() : {}),
      ...(mainSnap.exists ? mainSnap.data() : {}),
    } as any;
    const settingsId = mainSnap.exists ? 'main' : (configSnap && configSnap.exists) ? 'config' : fallbackSnap?.docs[0]?.id;

    let result: any = {
      storeName: 'Importadora Carlitos', logoUrl: '', phone: '', email: '', address: '', website: '', description: '',
      showInAnnouncementBar: false, unlimitedStock: false,
      inventoryMode: DEFAULT_INVENTORY_CONNECTION_MODE,
      minimumPurchase: 50000,
      bankAccountHolder: '',
      bankRut: '',
      bankName: '',
      bankAccountType: '',
      bankAccountNumber: '',
      bankEmail: '',
      bankInstructions: '',
      whatsappContacts: DEFAULT_WHATSAPP_CONTACTS,
      balatinContact: DEFAULT_BALATIN_CONTACT,
      attendantMode: 'choice',
      allowWhatsappOrders: true,
      allowWebOrders: true,
      whatsappMessageTemplate: '',
      homeMarketing: DEFAULT_HOME_MARKETING,
    };

    if (settingsId) {
      const doc = mergedDoc;
      result = {
        $id: settingsId,
        storeName: displayStoreBrand(doc.storeName || doc.STORENAME) || 'Importadora Carlitos',
        logoUrl: doc.logoUrl || doc.LOGOURL || '',
        phone: doc.phone || doc.PHONE || '',
        email: doc.email || doc.EMAIL || '',
        address: doc.address || doc.ADDRESS || '',
        website: doc.website || doc.WEBSITE || '',
        description: displayStoreBrand(doc.description || doc.DESCRIPTION),
        showInAnnouncementBar: doc.showInAnnouncementBar || false,
        unlimitedStock: doc.unlimitedStock || false,
        inventoryMode: normalizeInventoryConnectionMode(doc.inventoryMode),
        minimumPurchase: Number(doc.minimumPurchase || doc.MINIMUM_PURCHASE || 50000),
        bankAccountHolder: doc.bankAccountHolder || '',
        bankRut: doc.bankRut || '',
        bankName: doc.bankName || '',
        bankAccountType: doc.bankAccountType || '',
        bankAccountNumber: doc.bankAccountNumber || '',
        bankEmail: doc.bankEmail || '',
        bankInstructions: doc.bankInstructions || '',
        whatsappContacts: Array.isArray(doc.whatsappContacts) && doc.whatsappContacts.length > 0 ? doc.whatsappContacts : DEFAULT_WHATSAPP_CONTACTS,
        balatinContact: doc.balatinContact ? {
          ...doc.balatinContact,
          name: displayStoreBrand(doc.balatinContact.name),
          sub: displayStoreBrand(doc.balatinContact.sub),
        } : DEFAULT_BALATIN_CONTACT,
        attendantMode: doc.attendantMode || 'choice',
        allowWhatsappOrders: doc.allowWhatsappOrders !== false,
        allowWebOrders: doc.allowWebOrders !== false,
        whatsappMessageTemplate: doc.whatsappMessageTemplate || '',
        homeMarketing: {
          heroSlides: DEFAULT_HOME_MARKETING.heroSlides.map((slide, index) => ({
            ...slide,
            ...(Array.isArray(doc.homeMarketing?.heroSlides) ? doc.homeMarketing.heroSlides[index] : {}),
          })),
          newsBanner: { ...DEFAULT_HOME_MARKETING.newsBanner, ...(doc.homeMarketing?.newsBanner || {}) },
        },
      };
    }
    result.homeMarketing = {
      ...result.homeMarketing,
      heroSlides: result.homeMarketing.heroSlides.map((slide: any) => ({
        ...slide,
        desktopUrl: optimizeMarketingUrl(slide.desktopUrl),
        mobileUrl: optimizeMarketingUrl(slide.mobileUrl),
      })),
      newsBanner: {
        ...result.homeMarketing.newsBanner,
        desktopUrl: optimizeMarketingUrl(result.homeMarketing.newsBanner.desktopUrl),
        mobileUrl: optimizeMarketingUrl(result.homeMarketing.newsBanner.mobileUrl),
      },
    };
    return result;
  },
  ['store-settings-cache-v7'],
  { revalidate: 86400, tags: ['store-settings', 'settings'] }
);

export async function GET() {
  try {
    const cached = gSettings.__yaxsellStoreSettingsCache;
    const inventoryMode = await getInventoryConnectionMode();
    if (cached && Date.now() - cached.ts < MEMORY_CACHE_TTL) {
      return NextResponse.json({ ...cached.data, inventoryMode }, {
        headers: { 'Cache-Control': 'private, no-store, max-age=0' }
      });
    }
    const result = await getCachedStoreSettings();
    gSettings.__yaxsellStoreSettingsCache = { data: result, ts: Date.now() };
    return NextResponse.json({ ...result, inventoryMode }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error: any) {
    console.error('[API store-settings] Error fetching store settings:', error);
    return NextResponse.json({
      storeName: '', phone: '', email: '', address: '', website: '', description: '',
      showInAnnouncementBar: false, unlimitedStock: false,
      inventoryMode: DEFAULT_INVENTORY_CONNECTION_MODE,
      minimumPurchase: 50000,
      bankAccountHolder: '', bankRut: '', bankName: '', bankAccountType: '', bankAccountNumber: '', bankEmail: '', bankInstructions: '',
      error: error.message
    }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!MODULE_ACCESS.whatsappManagement && ['whatsappContacts', 'balatinContact', 'attendantMode', 'allowWhatsappOrders', 'whatsappMessageTemplate'].some(key => Object.prototype.hasOwnProperty.call(body, key))) {
      return NextResponse.json({ ok: false, error: 'Módulo no disponible' }, { status: 403 });
    }
    if (body?.inventoryMode !== undefined) {
      body.inventoryMode = normalizeInventoryConnectionMode(body.inventoryMode);
      const currentMode = await getInventoryConnectionMode();
      if (body.inventoryMode !== currentMode) {
        const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
        try {
          if (!token) throw new Error('missing token');
          const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
          if (!isAdminEmail(decoded.email)) throw new Error('not admin');
        } catch {
          return NextResponse.json({ ok: false, error: 'Solo un administrador autenticado puede cambiar el modo de inventario.' }, { status: 401 });
        }

        const activeOrders = await getAdminDb().collection(ORDERS_COLLECTION_ID)
          .where('STOCKDEDUCTED', '==', true)
          .limit(500)
          .get();
        const hasLegacyReservation = activeOrders.size >= 500 || activeOrders.docs.some((snapshot) => {
          const order = snapshot.data() || {};
          const isVendor = order.IS_VENDOR_ORDER === true || Boolean(order.VENDOR_ID);
          return !isVendor && order.INVENTORYMODE !== 'erp_integrated' && order.INVENTORYMODE !== 'web_independent';
        });
        if (hasLegacyReservation) {
          return NextResponse.json({
            ok: false,
            error: 'Hay pedidos antiguos con stock reservado. Completa o anula esos pedidos antes de cambiar el modo de inventario.',
          }, { status: 409 });
        }
      }
    }
    const adminDb = getAdminDb();
    const colRef = adminDb.collection(STORE_SETTINGS_COLLECTION);
    const batch = adminDb.batch();
    batch.set(colRef.doc('main'), body, { merge: true });
    batch.set(colRef.doc('config'), body, { merge: true });
    await batch.commit();
    if (body?.inventoryMode !== undefined) {
      clearCatalogMemoryCache();
      clearPublicProductDetailCache();
      try { revalidateTag('products'); } catch {}
      try { revalidateTag('combos'); } catch {}
    }

    // Limpiar caches para que los clientes vean el nuevo monto inmediatamente
    gSettings.__yaxsellStoreSettingsCache = undefined;
    if (typeof body?.unlimitedStock === 'boolean') {
      gSettings.__yaxsellUnlimitedStockCache = {
        value: body.unlimitedStock,
        expiresAt: Date.now() + 10 * 60 * 1000,
      };
    }
    try {
      revalidateTag('store-settings');
      revalidateTag('store_settings');
      revalidateTag('settings');
    } catch {}

    return NextResponse.json({
      ok: true,
      saved: {
        bankAccountNumber: body?.bankAccountNumber || body?.BANKACCOUNTNUMBER || '',
        bankEmail: body?.bankEmail || body?.BANKEMAIL || '',
        bankAccountHolder: body?.bankAccountHolder || body?.BANKACCOUNTHOLDER || '',
      },
    });
  } catch (error: any) {
    console.error('[API store-settings] Error saving settings:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
