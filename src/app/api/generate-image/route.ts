import { AI_IMAGE_GEN_ENABLED } from '@/lib/feature-flags';

import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAuthHeaders, buildGeminiUrl } from '@/lib/google-auth';

export async function POST(req: NextRequest) {
  if (!AI_IMAGE_GEN_ENABLED) return NextResponse.json({ error: 'IA desactivada' }, { status: 404 });
  try {
    const { prompt, referenceImageUrl, referenceImageBase64 } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: 'prompt es requerido' }, { status: 400 });
    }

    // ── Strategy 1: Gemini generateContent with IMAGE modality ──
    const parts: any[] = [{ text: prompt }];

    if (referenceImageUrl) {
      try {
        const imgRes = await fetch(referenceImageUrl);
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/png';
          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          parts.push({ inlineData: { mimeType: contentType, data: base64 } });
        }
      } catch (e) {
        console.warn('[generate-image] Could not fetch reference image:', e);
      }
    } else if (referenceImageBase64) {
      parts.push({ inlineData: { mimeType: 'image/png', data: referenceImageBase64 } });
    }

    const geminiBody = {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    };

    const geminiModels = [
      'gemini-2.5-flash-image',
      'gemini-3.1-flash-image-preview',
    ];

    const geminiHeaders = await getGeminiAuthHeaders();
    for (const model of geminiModels) {
      try {
        const url = buildGeminiUrl(model);
        const res = await fetch(url, {
          method: 'POST',
          headers: geminiHeaders,
          body: JSON.stringify(geminiBody),
        });

        const rawText = await res.text();
        if (!res.ok) {
          console.warn(`[generate-image] Gemini ${model} failed (${res.status}):`, rawText.slice(0, 200));
          continue;
        }

        const data = JSON.parse(rawText);
        const candidates = data?.candidates || [];
        for (const candidate of candidates) {
          const cParts = candidate?.content?.parts || [];
          for (const part of cParts) {
            if (part.inlineData) {
              const { mimeType, data: base64 } = part.inlineData;
              return NextResponse.json({ imageUrl: `data:${mimeType};base64,${base64}`, mimeType });
            }
          }
        }
      } catch (e) {
        console.warn(`[generate-image] Gemini ${model} threw:`, e);
      }
    }

    // ── Strategy 2: Pollinations.ai (free, no auth, no DNS issues) ──
    try {
      const encodedPrompt = encodeURIComponent(prompt);
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;
      const imgRes = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(30000) });

      if (imgRes.ok) {
        const imgBuffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(imgBuffer).toString('base64');
        return NextResponse.json({ imageUrl: `data:image/png;base64,${base64}`, mimeType: 'image/png' });
      }
      console.warn('[generate-image] Pollinations failed:', imgRes.status);
    } catch (e) {
      console.warn('[generate-image] Pollinations threw:', e);
    }

    return NextResponse.json({
      error: 'No se pudo generar la imagen. Gemini tiene un bug de cuota temporal (Ghost 429). Intenta de nuevo más tarde.',
    }, { status: 503 });
  } catch (err: any) {
    console.error('[generate-image] Route error:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
