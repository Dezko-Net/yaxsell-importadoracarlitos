import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import fs from 'fs';
import path from 'path';
import { serverGetDocument, serverCreateDocument, serverUpdateDocument } from '@/lib/db-server';
import { isSupremeAdminRequest } from '@/lib/admin-api-auth';
import { ComboItemConfig, MAX_COMBO_PRODUCTS } from '@/lib/combo-types';
import { PRODUCTS_COLLECTION } from '@/lib/collections';
import { isProductPublishedOnWeb } from '@/lib/product-publication';
import { isMainStoreProduct, getCachedAllProducts } from '@/lib/catalog-cache';

const CONFIG_PATH = path.join(process.cwd(), 'src', 'data', 'combos-config.json');
const SETTINGS_COLLECTION_ID = 'theme_config';
const COMBOS_DOC_ID = 'combos-config';

const gCombos = globalThis as unknown as {
  __yaxsellCombosCache?: { rawConfigs: ComboItemConfig[] | null; rawConfigsTime: number };
};

export async function GET(req: NextRequest) {
  if (!await isSupremeAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Acceso administrativo requerido' }, { status: 401 });
  }

  try {
    // Try Appwrite first (works in production)
    try {
      const doc = await serverGetDocument(SETTINGS_COLLECTION_ID, COMBOS_DOC_ID);
      if (doc && (doc as any).config) {
        const configs = JSON.parse((doc as any).config);
        return NextResponse.json({ success: true, configs });
      }
    } catch { /* doc doesn't exist yet, fall through to local */ }

    // Fallback to local file (works in dev)
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return NextResponse.json({ success: true, configs: JSON.parse(content) });
    }
    return NextResponse.json({ success: true, configs: [] });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

function validateConfigs(value: unknown): value is ComboItemConfig[] {
  if (!Array.isArray(value) || value.length > 20) return false;
  return value.every((raw: any) => {
    if (!raw || typeof raw !== 'object') return false;
    const ids = Array.isArray(raw.bundleProductIds)
      ? raw.bundleProductIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : null;
    const discount = Number(raw.discountPercent ?? 0);
    return Boolean(
      typeof raw.id === 'string' && raw.id.trim().length > 0 && raw.id.length <= 100 &&
      typeof raw.title === 'string' && raw.title.trim().length > 0 && raw.title.length <= 100 &&
      (raw.subtitle == null || (typeof raw.subtitle === 'string' && raw.subtitle.length <= 280)) &&
      (raw.badge == null || (typeof raw.badge === 'string' && raw.badge.length <= 60)) &&
      typeof raw.isActive === 'boolean' &&
      (raw.pricingMode == null || raw.pricingMode === 'percent' || raw.pricingMode === 'fixed') &&
      (raw.pricingMode !== 'fixed' || (Number.isInteger(raw.fixedPrice) && raw.fixedPrice > 0)) &&
      Number.isFinite(discount) && discount >= 0 && discount <= 90 &&
      typeof raw.mainProductId === 'string' && raw.mainProductId.length <= 100 &&
      ids && ids.length <= MAX_COMBO_PRODUCTS && new Set(ids).size === ids.length &&
      (!raw.isActive || ids.length >= 2)
    );
  });
}

export async function POST(req: NextRequest) {
  if (!await isSupremeAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Acceso administrativo requerido' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { configs } = body;

    if (!validateConfigs(configs)) {
      return NextResponse.json({ success: false, error: `Configuración inválida: cada pack activo necesita entre 2 y ${MAX_COMBO_PRODUCTS} productos distintos.` }, { status: 400 });
    }

    const activeConfigs = (configs as ComboItemConfig[]).filter(config => config.isActive);
    const activeProductIds = Array.from(new Set(activeConfigs.flatMap(config => [
      ...config.bundleProductIds,
      ...(config.mainProductId ? [config.mainProductId] : []),
    ])));
    const cachedCatalog = await getCachedAllProducts().catch(() => [] as any[]);
    const catalogById = new Map<string, any>();
    for (const p of cachedCatalog) {
      const pid = String(p?.$id || p?.id || '');
      if (pid) catalogById.set(pid, p);
    }
    const activeProducts = await Promise.all(activeProductIds.map(async id => {
      if (catalogById.has(id)) return catalogById.get(id);
      try { return await serverGetDocument(PRODUCTS_COLLECTION, id); }
      catch { return null; }
    }));
    const hasIneligibleProduct = activeProducts.some(product => {
      if (!product || !isMainStoreProduct(product)) return true;
      const webOnly = (product as any).WEB_ONLY ?? (product as any).web_only ?? (product as any).SOLO_WEB ?? (product as any).solo_web;
      const isWebOnly = webOnly === true || webOnly === 1 || (typeof webOnly === 'string' && ['true', '1', 'yes', 'si'].includes(webOnly.trim().toLowerCase()));
      return isWebOnly || Number((product as any).STOCK ?? (product as any).stock ?? -1) < 0 || !isProductPublishedOnWeb(product);
    });
    if (hasIneligibleProduct) {
      return NextResponse.json({
        success: false,
        error: 'Los packs activos solo pueden incluir productos del POS publicados en la web (paso 3). Actualiza la selección.',
      }, { status: 400 });
    }

    for (const config of activeConfigs) {
      const total = config.bundleProductIds.reduce((sum, id) => {
        const product = activeProducts[activeProductIds.indexOf(id)] as any;
        return sum + Number(product?.WEBPRICE ?? product?.web_price ?? product?.CURRENTPRICE ?? product?.current_price ?? product?.PRICE ?? product?.price ?? 0);
      }, 0);
      const price = config.pricingMode === 'fixed' ? Number(config.fixedPrice) : Math.round(total * (1 - Number(config.discountPercent || 0) / 100));
      if (!Number.isFinite(total) || !Number.isFinite(price) || price <= 0 || price >= total) {
        return NextResponse.json({ success: false, error: 'El precio del pack debe ser mayor que cero y menor que la suma de sus productos.' }, { status: 400 });
      }
    }

    const dataStr = JSON.stringify(configs, null, 2);

    // Save to Appwrite (works in production)
    try {
      try {
        // Try update first
        await serverUpdateDocument(SETTINGS_COLLECTION_ID, COMBOS_DOC_ID, { config: dataStr });
      } catch {
        // Document doesn't exist — create it
        await serverCreateDocument(SETTINGS_COLLECTION_ID, COMBOS_DOC_ID, { NAME: 'combos-config', config: dataStr }, [
          'read("any")',
          'update("any")',
          'delete("any")',
        ]);
      }
    } catch (awErr: any) {
      console.error('[API admin combos POST] Appwrite save failed:', awErr);
      // Fallback to local file in dev
      try {
        const dir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CONFIG_PATH, dataStr, 'utf-8');
      } catch (fsErr: any) {
        return NextResponse.json({ success: false, error: `No se pudo guardar: ${awErr.message} / ${fsErr.message}` }, { status: 500 });
      }
    }

    if (gCombos.__yaxsellCombosCache) {
      gCombos.__yaxsellCombosCache.rawConfigs = configs;
      gCombos.__yaxsellCombosCache.rawConfigsTime = Date.now();
    }
    revalidateTag('combos');
    revalidatePath('/');
    return NextResponse.json({ success: true, message: 'Configuración de packs guardada correctamente' });
  } catch (e: any) {
    console.error('[API admin combos POST] Error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
