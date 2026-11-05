import { AI_ENABLED } from '@/lib/feature-flags';

import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAuthHeaders, buildGeminiUrl } from '@/lib/google-auth';

import { GEMINI_TEXT_MODELS as MODELS } from '@/lib/gemini-models';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function imageUrlToPart(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!mimeType.startsWith('image/')) return null;
    const bytes = await res.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return {
      inlineData: {
        mimeType,
        data: Buffer.from(bytes).toString('base64'),
      },
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!AI_ENABLED) return NextResponse.json({ error: 'IA desactivada' }, { status: 404 });
  try {
    const { prompt, imageUrls } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: 'prompt es requerido' }, { status: 400 });
    }

    const normalizedImageUrls = Array.isArray(imageUrls)
      ? imageUrls.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
      : [];

    const imageParts = (await Promise.all(normalizedImageUrls.map(imageUrlToPart))).filter(Boolean);

    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts] }],
    });

    let res;
    const geminiHeaders = await getGeminiAuthHeaders();
    for (const model of MODELS) {
      const url = buildGeminiUrl(model);
      res = await fetch(url, {
        method: 'POST',
        headers: geminiHeaders,
        body,
      });
      if (res.ok) break;
      console.warn(`Model ${model} unavailable (${res.status}), trying fallback...`);
    }

    if (!res || !res.ok) {
      const errText = res ? await res.text() : 'All models unavailable';
      console.error('Gemini API error:', res?.status, errText);
      return NextResponse.json({ error: `Error en la API de Gemini (${res?.status || 503})` }, { status: res?.status || 503 });
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return NextResponse.json({ text });
  } catch (err: any) {
    console.error('Gemini route error:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
