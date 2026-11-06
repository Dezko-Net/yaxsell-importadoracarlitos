import { NextRequest, NextResponse } from 'next/server';
import { WHATSAPP_CUSTOMER_AI_ENABLED } from '@/lib/feature-flags';
import { addToHistory, sendWhatsAppMessage, getHistory, clearHistory } from '@/lib/whatsapp';
import { normalizePhone, getKeniaConfig, getKeniaUsage, recordKeniaUsage, setKeniaBlocked } from '@/lib/kenia-runtime';
import { serverListDocuments, serverGetDocument } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID } from '@/lib/db';
import { getGeminiAuthHeaders, buildGeminiUrl } from '@/lib/google-auth';
import { GEMINI_TEXT_MODELS } from '@/lib/gemini-models';
import { getPublicSiteUrl } from '@/lib/public-site-url';
import { requireWhatsAppAdmin } from '@/lib/whatsapp-admin-auth';

export const maxDuration = 60;

const GEMINI_MODELS = GEMINI_TEXT_MODELS;
const SITE_URL = getPublicSiteUrl();

const CUSTOMER_PROMPT = `Eres Yaxbot, el gato de la suerte y asistente virtual de Importadora Carlitos, una tienda de artículos de hogar, aseo y variedad.
Tu personalidad es cercana, tranquila y juguetona. Eres un gato blanco de la fortuna (maneki-neko).
Eres chileno y usas expresiones locales de forma sutil.

## TU ROL:
Ayudas a los clientes con:
- Información de productos y precios
- Estado de sus pedidos
- Datos para transferir
- Ofertas y novedades
- Resolver dudas generales

## REGLAS:
- Responde de forma corta y directa
- No inventes información que no tengas
- Si no sabes algo, dile que vas a consultar con el equipo
- Usa emojis felinos con moderación (🐾✨�)
- No hagas preguntas abiertas al final, responde y cierra`;

export async function POST(req: NextRequest) {
  const denied = await requireWhatsAppAdmin(req);
  if (denied) return denied;
  if (!WHATSAPP_CUSTOMER_AI_ENABLED) return NextResponse.json({ error: 'Respuestas de IA por WhatsApp desactivadas' }, { status: 404 });
  try {
    const body = await req.json();
    const phone = normalizePhone(body.phone || '');
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Falta teléfono' }, { status: 400 });
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN || '';
    if (!token) {
      return NextResponse.json({ success: false, error: 'No hay WHATSAPP_ACCESS_TOKEN' }, { status: 500 });
    }

    // 1. Cargar historial del chat
    const history = await getHistory(phone);

    // 2. Cargar config de Yaxbot
    const keniaConfig = await getKeniaConfig();

    // 3. Cargar datos del cliente
    const usage = await getKeniaUsage(phone);
    const customerName = usage.customerName || '';

    // 4. Buscar pedidos del cliente
    let ordersContext = '';
    try {
      const qPhone = JSON.stringify({ method: 'contains', attribute: 'CUSTOMERPHONE', values: [phone] });
      const qLimit = JSON.stringify({ method: 'limit', values: [10] });
      const ordersRes = await serverListDocuments(ORDERS_COLLECTION_ID, [qPhone, qLimit]);
      if (ordersRes.documents && ordersRes.documents.length > 0) {
        const orders = ordersRes.documents.map((o: any) => {
          const items = (() => { try { return JSON.parse(o.ITEMS); } catch { return []; } })();
          const itemsSummary = Array.isArray(items) ? items.slice(0, 3).map((it: any) => `${it.name || it.NAME || 'producto'} x${it.quantity || it.QUANTITY || 1}`).join(', ') : '';
          return `#${o.ORDERCODE || o.$id} | Estado: ${o.STATUS} | Total: $${o.TOTAL || 0} | Fecha: ${o.CREATEDAT ? new Date(o.CREATEDAT).toLocaleDateString('es-CL') : 'N/A'} | Items: ${itemsSummary}`;
        }).join('\n');
        ordersContext = `\n\n## 📦 PEDIDOS ACTIVOS DE LA CLIENTA:\n${orders}`;
      }
    } catch (e) {
      console.warn('[interact] Error loading orders:', e);
    }

    // 5. Construir prompt
    const basePrompt = keniaConfig.customerPrompt || CUSTOMER_PROMPT;
    const customerNameBlock = customerName ? `\n\n## 👤 DATOS DEL CLIENTE:\nNombre: ${customerName}` : '';
    const systemPrompt = basePrompt + ordersContext + customerNameBlock;

    // 6. Construir contents para Gemini
    const contents = history.slice(-20).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Si no hay historial, agregar un mensaje inicial
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hola' }] });
    }

    const geminiBody = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    };

    // 7. Llamar a Gemini
    let aiReply = '';
    const geminiHeaders = await getGeminiAuthHeaders();
    for (const model of GEMINI_MODELS) {
      const url = buildGeminiUrl(model);
      const res = await fetch(url, {
        method: 'POST',
        headers: geminiHeaders,
        body: JSON.stringify(geminiBody),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          aiReply = text
            .replace(/\[ACTION:[^\]]+\][\s\S]*?\[\/ACTION\]/g, '')
            .replace(/\*\*(.*?)\*\*/g, '*$1*')
            .trim();
          break;
        }
      }
      if (res.status !== 503 && res.status !== 429) break;
    }

    if (!aiReply) {
      return NextResponse.json({ success: false, error: 'Gemini no respondió. Revisa la API key.' }, { status: 500 });
    }

    // 8. Enviar respuesta por WhatsApp
    await sendWhatsAppMessage(phone, aiReply, token);
    await addToHistory(phone, 'assistant', aiReply);
    await setKeniaBlocked(phone, false);

    return NextResponse.json({ success: true, reply: aiReply, reactivated: true });
  } catch (error: any) {
    console.error('[interact] Error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Error al interactuar' }, { status: 500 });
  }
}
