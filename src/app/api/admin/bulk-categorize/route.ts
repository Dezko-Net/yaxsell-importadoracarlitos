import { NextRequest, NextResponse } from 'next/server';
import { AI_CATEGORIZE_ENABLED } from '@/lib/feature-flags';
import { revalidateTag } from 'next/cache';
import { serverListDocuments, serverUpdateDocument, serverCreateDocument } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID, CATEGORIES_COLLECTION_ID, SUBCATEGORIES_COLLECTION_ID } from '@/lib/db';
import { getGeminiAuthHeaders, buildGeminiUrl } from '@/lib/google-auth';
import { GEMINI_TEXT_MODELS as MODELS } from '@/lib/gemini-models';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { isAdminEmail } from '@/lib/admin-access';

interface Category { $id: string; name: string }
interface Subcategory { $id: string; name: string; categoryId: string; parentSubcategoryId?: string }

function cleanJsonBlock(text: string) {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

async function callGemini(prompt: string, imageUrls: string[] = []): Promise<string> {
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

  async function imageUrlToPart(url: string) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
      if (!mimeType.startsWith('image/')) return null;
      const bytes = await res.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return null;
      return { inlineData: { mimeType, data: Buffer.from(bytes).toString('base64') } };
    } catch { return null; }
  }

  const imageParts = (await Promise.all(imageUrls.slice(0, 3).map(imageUrlToPart))).filter(Boolean);
  const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts] }] });

  let res;
  const geminiHeaders = await getGeminiAuthHeaders();
  for (const model of MODELS) {
    const url = buildGeminiUrl(model);
    res = await fetch(url, { method: 'POST', headers: geminiHeaders, body });
    if (res.ok) break;
    if (res.status === 503 || res.status === 429) { continue; }
    break;
  }

  if (!res || !res.ok) throw new Error(`Gemini error (${res?.status || 503})`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function POST(req: NextRequest) {
  if (!AI_CATEGORIZE_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const body = await req.json();
    const email = body?.email;
    if (!email || !isAdminEmail(email)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // 1. Fetch all categories and subcategories
    const [catRes, subRes] = await Promise.all([
      serverListDocuments(CATEGORIES_COLLECTION_ID, [JSON.stringify({ method: 'limit', values: [100] })]),
      serverListDocuments(SUBCATEGORIES_COLLECTION_ID, [JSON.stringify({ method: 'limit', values: [500] })]),
    ]);
    const categories = catRes.documents as unknown as Category[];
    const subcategories = subRes.documents as unknown as Subcategory[];

    const catNames = categories.map(c => c.name);
    const subGroups = categories.map(c => ({
      category: c.name,
      subs: subcategories.filter(s => s.categoryId === c.$id && !s.parentSubcategoryId).map(s => s.name),
    }));

    // 2. Fetch products without CATEGORYID OR without SUBCATEGORYID — batches of 100
    const uncategorized: Record<string, unknown>[] = [];
    let offset = 0;
    while (true) {
      const batch = await serverListDocuments(PRODUCTS_COLLECTION_ID, [
        JSON.stringify({ method: 'limit', values: [100] }),
        JSON.stringify({ method: 'offset', values: [offset] }),
        JSON.stringify({ method: 'orderDesc', attribute: '$createdAt' }),
      ]);
      const needsCat = batch.documents.filter((p: any) => !p.CATEGORYID || (p.CATEGORYID && !p.SUBCATEGORYID));
      uncategorized.push(...needsCat);
      if (batch.documents.length < 100) break;
      offset += 100;
      if (offset >= 500) break; // safety limit
    }

    if (uncategorized.length === 0) {
      return NextResponse.json({ success: true, message: 'Todos los productos tienen categoría y subcategoría.', updated: 0 });
    }

    // 3. For each product, call Gemini to suggest category + subcategory
    const results: { id: string; name: string; category: string; subcategory: string; status: 'ok' | 'skip' | 'error' }[] = [];

    for (const product of uncategorized) {
      const p = product as any;
      const name = p.NAME || '';
      const description = p.DESCRIPTION || '';
      const imageUrls = [p.IMAGEURL, p.IMAGEURL2, p.IMAGEURL3].filter(Boolean).map((u: string) => {
        const resolved = resolveStorageImageUrl(u);
        // Make absolute for server-side fetch
        if (resolved.startsWith('/')) return `http://localhost:3000${resolved}`;
        return resolved;
      });

      const prompt = `Eres una experta en catalogación para e-commerce en Chile.
Analiza el producto y asigna la categoría y subcategoría más adecuada.

Nombre: ${name}
Descripción: ${description || 'Sin descripción'}
${imageUrls.length > 0 ? 'Analiza las imágenes del producto.' : ''}

Categorías disponibles: ${catNames.join(', ')}

Subcategorías existentes:
${subGroups.map(s => `${s.category}: ${s.subs.join(', ') || '(sin subcategorías)'}`).join('\n')}

Reglas:
- DEBES elegir la categoría EXACTA de la lista.
- PRIMERO intenta usar una subcategoría EXISTENTE de la lista.
- Si ninguna subcategoría existente encaja bien, INVENTA una nueva que sea clara y descriptiva (máx 4 palabras, puede incluir un emoji relevante).
- NUNCA dejes suggestedSubcategory vacío. Siempre asigna una.
- Responde SOLO JSON válido.

Formato:
{
  "suggestedCategory": "",
  "suggestedSubcategory": "",
  "isNewSubcategory": false
}`;

      try {
        const raw = await callGemini(prompt, imageUrls);
        const parsed = JSON.parse(cleanJsonBlock(raw));
        const suggestedCat = String(parsed.suggestedCategory || '').trim();
        const suggestedSub = String(parsed.suggestedSubcategory || '').trim();
        const isNewSub = Boolean(parsed.isNewSubcategory);

        // Match category to real ID
        const matchedCat = categories.find(c => c.name.toLowerCase() === suggestedCat.toLowerCase())
          || categories.find(c => c.name.toLowerCase().includes(suggestedCat.toLowerCase()) || suggestedCat.toLowerCase().includes(c.name.toLowerCase()));
        if (!matchedCat) {
          results.push({ id: p.$id, name, category: '', subcategory: '', status: 'skip' });
          continue;
        }

        let matchedSubId = '';
        let finalSubName = '';
        if (suggestedSub) {
          // Try to match existing subcategory
          const matchedSub = subcategories.find(s =>
            s.categoryId === matchedCat.$id &&
            !s.parentSubcategoryId &&
            s.name.toLowerCase() === suggestedSub.toLowerCase()
          );
          if (matchedSub) {
            matchedSubId = matchedSub.$id;
            finalSubName = matchedSub.name;
          } else if (isNewSub || suggestedSub) {
            // Create new subcategory
            const created = await serverCreateDocument(SUBCATEGORIES_COLLECTION_ID, 'unique()', {
              name: suggestedSub,
              categoryId: matchedCat.$id,
              order: subcategories.filter(s => s.categoryId === matchedCat.$id).length,
            });
            const newSub = created as any;
            matchedSubId = newSub.$id;
            finalSubName = suggestedSub;
            // Add to local cache so subsequent products can reuse it
            subcategories.push({ $id: newSub.$id, name: suggestedSub, categoryId: matchedCat.$id });
          }
        }

        // 4. Update product in Appwrite
        await serverUpdateDocument(PRODUCTS_COLLECTION_ID, p.$id, {
          CATEGORYID: matchedCat.$id,
          SUBCATEGORYID: matchedSubId || null,
        });

        results.push({
          id: p.$id,
          name,
          category: matchedCat.name,
          subcategory: finalSubName,
          status: 'ok',
        });
      } catch (err: any) {
        console.error(`[bulk-categorize] Error for "${name}":`, err.message);
        results.push({ id: p.$id, name, category: '', subcategory: '', status: 'error' });
      }
      // Delay to avoid Gemini rate limiting
      await new Promise(r => setTimeout(r, 1000));
    }

    const updated = results.filter(r => r.status === 'ok').length;
    const skipped = results.filter(r => r.status === 'skip').length;
    const errors = results.filter(r => r.status === 'error').length;

    // Invalidate all relevant caches
    revalidateTag('products');
    revalidateTag('categories');
    revalidateTag('subcategories');
    revalidateTag('catalog');
    revalidateTag('home');

    return NextResponse.json({
      success: true,
      total: uncategorized.length,
      updated,
      skipped,
      errors,
      results,
    });
  } catch (err: any) {
    console.error('[bulk-categorize] Error:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
