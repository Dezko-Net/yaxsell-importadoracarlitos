import puppeteer from 'puppeteer';
import { buildOrderPdfHtml, type ProductExtraInfo, type VendorBranding } from '@/lib/generateOrderPdf';
import { serverGetDocument } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { getProductImageUrl } from '@/lib/product-images';
import { getSkuFromFeatures, getWarehouseLocationFromFeatures } from '@/lib/product-features';
import { getCachedAllProducts } from '@/lib/catalog-cache';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

function parseItems(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function absoluteAssetUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:')) return raw;
  try {
    return new URL(raw, SITE_URL).toString();
  } catch {
    return '';
  }
}

async function prepareOrderItems(order: Record<string, any>): Promise<{
  items: any[];
  productExtraInfo: Record<string, ProductExtraInfo>;
}> {
  const items = parseItems(order.ITEMS).map(item => ({ ...item }));
  const productExtraInfo: Record<string, ProductExtraInfo> = {};
  const productIds = Array.from(new Set(items.map(item => String(item.id || '').trim()).filter(Boolean)));
  const productsById = new Map<string, any>();

  // 1. Resolver primero desde el catálogo en RAM del servidor (0 lecturas a Firestore)
  try {
    const cachedCatalog = await getCachedAllProducts();
    if (Array.isArray(cachedCatalog)) {
      const idSet = new Set(productIds);
      for (const product of cachedCatalog as any[]) {
        const pid = String(product?.$id || '');
        if (pid && idSet.has(pid)) {
          productsById.set(pid, product);
          productExtraInfo[pid] = {
            sku: getSkuFromFeatures(product.FEATURES, product.TAGS, product.jumpseller_id, product.sku || product.SKU),
            location: getWarehouseLocationFromFeatures(product.FEATURES, product.section) || null,
          };
        }
      }
    }
  } catch {}

  // 2. Consultar Firestore solo para los IDs que no estén en el catálogo cacheado
  const missingIds = productIds.filter(id => !productsById.has(id));
  if (missingIds.length > 0) {
    await Promise.all(missingIds.map(async id => {
      try {
        const product: any = await serverGetDocument(PRODUCTS_COLLECTION_ID, id);
        productsById.set(id, product);
        productExtraInfo[id] = {
          sku: getSkuFromFeatures(product.FEATURES, product.TAGS, product.jumpseller_id, product.sku || product.SKU),
          location: getWarehouseLocationFromFeatures(product.FEATURES, product.section) || null,
        };
      } catch {}
    }));
  }

  for (const item of items) {
    const id = String(item.id || '').trim();
    const product = id ? productsById.get(id) : null;
    const image = absoluteAssetUrl((product && getProductImageUrl(product)) || item.img || item.imageUrl);
    if (image) item.img = image;
    if (id && !productExtraInfo[id]?.sku && item.sku) {
      productExtraInfo[id] = { ...productExtraInfo[id], sku: item.sku };
    }
  }

  return { items, productExtraInfo };
}

async function renderOrderPdf(html: string): Promise<Buffer> {
  // Vercel no instala el navegador de Puppeteer durante npm install. Usa el
  // Chromium empaquetado para serverless allí y conserva el Chrome local para
  // desarrollo en Windows/macOS.
  const browser = process.env.VERCEL === '1'
    ? await (async () => {
        const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
          import('@sparticuz/chromium'),
          import('puppeteer-core'),
        ]);
        return puppeteer.launch({
          args: chromium.args,
          defaultViewport: (chromium as any).defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: 'shell',
        });
      })()
    : await (async () => {
        const { default: puppeteer } = await import('puppeteer');
        return puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
      })();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });
    await page.emulateMediaType('print');
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.evaluate(async () => {
      await Promise.race([
        Promise.all(Array.from(document.images).map(image => image.decode().catch(() => undefined))),
        new Promise(resolve => setTimeout(resolve, 8_000)),
      ]);
    });
    const result = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
    return Buffer.from(result);
  } finally {
    await browser.close();
  }
}

/** Renders only the branded, printable order document used by the admin order detail. */
export async function createPaymentReviewPdf(
  order: Record<string, any>,
  branding: VendorBranding,
): Promise<Buffer> {
  const { items, productExtraInfo } = await prepareOrderItems(order);

  const html = buildOrderPdfHtml(order as any, items as any, productExtraInfo, {
    ...branding,
    logoUrl: absoluteAssetUrl(branding.logoUrl),
  });
  return renderOrderPdf(html);
}
