import { NextRequest, NextResponse } from 'next/server';
import { AggregateField } from 'firebase-admin/firestore';
import { getAdminDb, serverListDocuments, serverCreateDocument } from '@/lib/db-server';
import { VENDORS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { hashPassword, generateVendorPassword } from '@/lib/vendor-auth';
import { Query } from '@/lib/db';
import { revalidateTag, unstable_cache } from 'next/cache';
import { isSupremeAdminRequest } from '@/lib/admin-api-auth';
import { isWebAdminRequest } from '@/lib/web-admin-request';
import { clearCatalogMemoryCache } from '@/lib/catalog-cache';
import { clearPublicProductDetailCache } from '@/lib/public-product-detail-cache';

export const dynamic = 'force-dynamic';

const gAdminVendors = globalThis as unknown as {
  __yaxsellAdminVendorsStatsCache?: { data: any[]; ts: number } | null;
};
const VENDOR_STATS_TTL_MS = 5 * 60 * 1000;

const getCachedVendorOptions = unstable_cache(
  async () => {
    const vendorsRes = await serverListDocuments(VENDORS_COLLECTION_ID, [Query.limit(200)]);
    return (vendorsRes.documents as any[])
      .filter(v => v.$id !== '_init' && !v._seed && String(v.NAME || '').trim() && String(v.EMAIL || '').trim())
      .map(v => ({ $id: v.$id, NAME: v.NAME }));
  },
  ['admin-vendor-options-v1'],
  { revalidate: 300, tags: ['vendors'] }
);

// GET: lista vendors con métrica agregada (para calcular comisión) — sin exponer pedidos detallados
export async function GET(req: NextRequest) {
  const basic = req.nextUrl.searchParams.get('basic') === 'true';
  if (!(basic ? await isWebAdminRequest(req) : await isSupremeAdminRequest(req))) return NextResponse.json({ error: 'Acceso administrativo requerido' }, { status: 401 });
  try {
    if (basic) {
      const vendors = await getCachedVendorOptions();
      return NextResponse.json({ vendors });
    }

    const force = req.nextUrl.searchParams.get('force') === '1' || req.nextUrl.searchParams.get('force') === 'true';
    if (!force && gAdminVendors.__yaxsellAdminVendorsStatsCache && Date.now() - gAdminVendors.__yaxsellAdminVendorsStatsCache.ts < VENDOR_STATS_TTL_MS) {
      return NextResponse.json({ vendors: gAdminVendors.__yaxsellAdminVendorsStatsCache.data });
    }

    const vendorsRes = await serverListDocuments(VENDORS_COLLECTION_ID, [Query.limit(200)]);
    const vendors = (vendorsRes.documents as any[]).filter(v =>
      v.$id !== '_init' && !v._seed && String(v.NAME || '').trim() && String(v.EMAIL || '').trim()
    );
    const adminDb = getAdminDb();

    const withStats = await Promise.all(vendors.map(async (v) => {
      let totalSold = 0;
      let orderCount = 0;
      let productCount = 0;
      try {
        const ordersQuery = adminDb.collection(VENDOR_ORDERS_COLLECTION_ID).where('VENDOR_ID', '==', v.$id);
        const ordersStats = await ordersQuery.aggregate({
          orderCount: AggregateField.count(),
          totalSold: AggregateField.sum('TOTAL'),
        }).get();
        const data = ordersStats.data();
        orderCount = Number(data.orderCount) || 0;
        totalSold = Number(data.totalSold) || 0;
      } catch { /* noop */ }
      try {
        const productsStats = await adminDb.collection(PRODUCTS_COLLECTION_ID)
          .where('VENDOR_ID', '==', v.$id)
          .count()
          .get();
        productCount = Number(productsStats.data().count) || 0;
      } catch { /* noop */ }

      return {
        $id: v.$id,
        name: v.NAME,
        email: v.EMAIL,
        active: v.ACTIVE,
        minPurchaseAmount: v.MIN_PURCHASE_AMOUNT || 0,
        createdAt: v.CREATEDAT,
        logoUrl: v.LOGO_URL || '',
        brandColor: v.BRAND_COLOR || '',
        totalSold,
        orderCount,
        productCount,
      };
    }));

    gAdminVendors.__yaxsellAdminVendorsStatsCache = { data: withStats, ts: Date.now() };
    return NextResponse.json({ vendors: withStats });
  } catch (err: any) {
    console.error('[admin/vendors GET]', err);
    return NextResponse.json({ error: 'Error al listar vendedores' }, { status: 500 });
  }
}

// POST: crea un nuevo vendor con la contraseña definida por el admin
export async function POST(req: NextRequest) {
  if (!await isSupremeAdminRequest(req)) return NextResponse.json({ error: 'Acceso administrativo requerido' }, { status: 401 });
  try {
    const {
      name, email, password, minPurchaseAmount = 0,
      bankAccountHolder = '', bankRut = '', bankName = '', bankAccountType = '', bankAccountNumber = '', bankEmail = '',
      brandColor = '#f97316', brandSecondaryColor = '#fb923c', logoUrl = '', storeAddress = '', storePhone = '', storeEmail = '', storeWebsite = '',
    } = await req.json();

    if (!name || !String(name).trim()) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 });
    if (!email || !String(email).trim()) return NextResponse.json({ error: 'Falta el email' }, { status: 400 });
    if (!password || String(password).trim().length < 4) return NextResponse.json({ error: 'La contraseña debe tener al menos 4 caracteres' }, { status: 400 });

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await serverListDocuments(VENDORS_COLLECTION_ID, [Query.equal('EMAIL', normalizedEmail), Query.limit(1)]);
    if (existing.documents.length > 0) {
      return NextResponse.json({ error: 'Ya existe un vendedor con ese email' }, { status: 409 });
    }

    const plainPassword = String(password).trim();
    const now = Date.now();
    const vendor = await serverCreateDocument(VENDORS_COLLECTION_ID, 'unique()', {
      NAME: String(name).trim(),
      EMAIL: normalizedEmail,
      PASSWORD_HASH: hashPassword(plainPassword),
      ACTIVE: true,
      MIN_PURCHASE_AMOUNT: parseInt(minPurchaseAmount) || 0,
      BANK_ACCOUNT_HOLDER: bankAccountHolder,
      BANK_RUT: bankRut,
      BANK_NAME: bankName,
      BANK_ACCOUNT_TYPE: bankAccountType,
      BANK_ACCOUNT_NUMBER: bankAccountNumber,
      BANK_EMAIL: bankEmail,
      BRAND_COLOR: brandColor || '#f97316',
      BRAND_SECONDARY_COLOR: brandSecondaryColor || '#fb923c',
      LOGO_URL: logoUrl || '',
      STORE_ADDRESS: storeAddress || '',
      STORE_PHONE: storePhone || '',
      STORE_EMAIL: storeEmail || normalizedEmail,
      STORE_WEBSITE: storeWebsite || '',
      VISIBLE_AGENCIES: '[]',
      CREATEDAT: now,
      UPDATEDAT: now,
    });

    gAdminVendors.__yaxsellAdminVendorsStatsCache = null;
    revalidateTag('products');
    revalidateTag('vendors');
    clearCatalogMemoryCache();
    clearPublicProductDetailCache();
    return NextResponse.json({
      ok: true,
      vendor,
      credentials: { email: normalizedEmail, password: plainPassword },
    });
  } catch (err: any) {
    console.error('[admin/vendors POST]', err);
    return NextResponse.json({ error: err.message || 'Error al crear el vendedor' }, { status: 500 });
  }
}
