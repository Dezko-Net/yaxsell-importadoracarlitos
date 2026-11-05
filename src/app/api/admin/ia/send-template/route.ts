import { NextRequest, NextResponse } from 'next/server';
import { AI_ENABLED } from '@/lib/feature-flags';
import { addToHistory, sendWhatsAppTemplate } from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/kenia-runtime';

export async function POST(req: NextRequest) {
  if (!AI_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const body = await req.json();
    const phone = normalizePhone(body.phone || '');
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Falta el número de teléfono' }, { status: 400 });
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN || '';
    if (!token) {
      return NextResponse.json({ success: false, error: 'No está configurado WHATSAPP_ACCESS_TOKEN en el servidor' }, { status: 500 });
    }

    const components = [
      {
        type: "body",
        parameters: [
          { type: "text", text: "Cliente Prueba 🐾" }, // Variable {{1}}
          { type: "text", text: "#TEST-001" },         // Variable {{2}}
          { type: "text", text: "En Camino 🚚✨" }      // Variable {{3}}
        ]
      }
    ];

    await sendWhatsAppTemplate(
      phone,
      "estado_de_pedido",
      "es_CL",
      components,
      token
    );

    const logText = "🐾 [Plantilla Enviada] ¡Hola! Soy Yaxbot de Importadora Carlitos 🇨🇱✨ Te escribo feliz para contarte que tu pedido #TEST-001 ya cambió de estado a: En Camino 🚚✨ 🎉\n\nSi tienes cualquier duda o quieres saber más, ¡escríbeme por aquí mismo! Estoy atento para ayudarte. �";
    await addToHistory(phone, 'assistant', logText);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'No se pudo enviar la plantilla' }, { status: 500 });
  }
}
