import { NextRequest, NextResponse } from 'next/server';
import { AUTO_NEGOTIATION_ENABLED } from '@/lib/feature-flags';
import { serverListDocuments, serverUpdateDocument, serverGetDocument } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { sendWhatsAppMessage, sendWhatsAppTemplate, formatWhatsAppPhone, addToHistory } from '@/lib/whatsapp';
import { getPublicSiteUrl } from '@/lib/public-site-url';
import { isMainStoreProduct } from '@/lib/catalog-cache';
import { getInventoryConnectionMode, getInventoryStock } from '@/lib/inventory-mode';

const CRON_SECRET = process.env.CRON_SECRET || 'negotiation_secret_key_2026';
const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const SITE_URL = getPublicSiteUrl();

export async function GET(req: NextRequest) {
  if (!AUTO_NEGOTIATION_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get('secret');
    const targetOrderId = searchParams.get('orderId');

    // Security check
    if (secret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Disable automatic cron to prevent 1 Appwrite read per minute (1440/day)
    if (!targetOrderId) {
      return NextResponse.json({ status: 'disabled', message: 'Cron automático desactivado para ahorrar consumo de Appwrite.' });
    }

    // 1. Fetch orders in negotiation
    let activeOrders: any[] = [];
    if (targetOrderId) {
      try {
        const singleOrder = await serverGetDocument(ORDERS_COLLECTION_ID, targetOrderId);
        activeOrders = [singleOrder];
      } catch (e) {
        return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
      }
    } else {
      const qStatus = JSON.stringify({ method: 'equal', attribute: 'STATUS', values: ['negotiation'] });
      const qLimit = JSON.stringify({ method: 'limit', values: [100] });
      const resOrders = await serverListDocuments(ORDERS_COLLECTION_ID, [qStatus, qLimit]);
      activeOrders = resOrders.documents || [];
    }

    const processedOrders: string[] = [];
    const sendErrors: string[] = [];
    const debugInfo: any[] = [];

    for (const order of activeOrders) {
      const orderId = order.$id;
      const orderCode = order.ORDERCODE || String(orderId).slice(-6).toUpperCase();
      const additionalInfo = (order.ADDITIONALINFO as string) || '';
      const adminNotes = (order.adminNotes as string) || '';

      // Skip if already notified by WA (only during automatic cron scan, not manual trigger)
      if (!targetOrderId && (adminNotes.includes('[negot_wa_notified]') || additionalInfo.includes('[negot_wa_notified]'))) {
        continue;
      }

      // Parse order items
      let items: any[] = [];
      try {
        items = JSON.parse((order.ITEMS as string) || '[]');
      } catch (e) {
        console.error(`Error parsing ITEMS for order ${orderCode}:`, e);
        continue;
      }

      const missingItems = items.filter(it => it.missing === true);
      if (missingItems.length === 0) {
        continue;
      }

      // 2. Find similar products for each missing item
      const missingDetails: string[] = [];
      const suggestionsTextList: string[] = [];

      for (const item of missingItems) {
        missingDetails.push(`- ${item.name} (${item.qty} uds)`);

        // Find product to get category
        let categoryId = '';
        let itemPrice = item.price || 0;
        if (item.id) {
          try {
            const prod = await serverGetDocument(PRODUCTS_COLLECTION_ID, item.id);
            categoryId = (prod as any).CATEGORYID || '';
            itemPrice = (prod as any).CURRENTPRICE || (prod as any).PRICE || itemPrice;
          } catch (e) {
            console.warn(`Could not fetch details for missing product ${item.id}:`, e);
          }
        }

        // List products in category
        let categoryProds: any[] = [];
        if (categoryId) {
          try {
            const qCat = JSON.stringify({ method: 'equal', attribute: 'CATEGORYID', values: [categoryId] });
            const qLimit50 = JSON.stringify({ method: 'limit', values: [50] });
            const resProds = await serverListDocuments(PRODUCTS_COLLECTION_ID, [qCat, qLimit50]);
            categoryProds = resProds.documents || [];
          } catch (e) {
            console.error(`Error loading category products for category ${categoryId}:`, e);
          }
        }

        // Filter similar products
        const inventoryMode = await getInventoryConnectionMode();
        const similar = categoryProds.filter((p: any) => {
          if (p.$id === item.id) return false;
          const stock = getInventoryStock(p, inventoryMode, isMainStoreProduct(p));
          if (stock <= 0 || stock === 99999) return false; // must have real stock
          const price = p.CURRENTPRICE || p.PRICE || 0;
          
          // Comparar en base al precio original (antes del descuento) o al pagado
          const referencePrice = item.originalPrice || item.price || itemPrice || 0;
          if (referencePrice === 0) return true;

          const diffPct = Math.abs(price - referencePrice) / referencePrice;
          return diffPct <= 0.20; // margen del 20% solicitado
        });

        // Take top 2 suggestions
        const topSuggestions = similar.slice(0, 2);
        if (topSuggestions.length > 0) {
          const formattedItemPrice = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(item.price || 0);
          suggestionsTextList.push(`*Reemplazos sugeridos para ${item.name} (que compraste a ${formattedItemPrice}):*`);
          
          const originalPrice = item.originalPrice;
          const pricePaid = item.price;
          const hasDiscount = originalPrice && originalPrice > pricePaid;

          topSuggestions.forEach((p: any) => {
            let basePrice = p.CURRENTPRICE || p.PRICE || 0;
            const formattedBase = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(basePrice);
            const formattedPaid = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(pricePaid);

            if (hasDiscount) {
              suggestionsTextList.push(`  • ${p.NAME} (Valor normal: ${formattedBase} ➡️ Te lo respetamos al mismo precio con descuento: ${formattedPaid})`);
            } else {
              suggestionsTextList.push(`  • ${p.NAME} (${formattedBase})`);
            }
          });
        }
      }

      // 3. Compose WhatsApp message (Greeting only, wait for response)
      const customerName = order.CUSTOMERNAME || 'Amiga';
      const firstName = customerName.split(' ')[0];
      const messageText = `¡Hola linda, *${firstName}*! ✨ ¿Cómo estás? Te escribimos de *Importadora Carlitos* por tu pedidito *#${orderCode}* 🛍️.`;

      // 4. Send message to WhatsApp
      const rawPhone = (order.CUSTOMERPHONE as string) || '';
      const formattedPhone = formatWhatsAppPhone(rawPhone);

      if (formattedPhone && WA_TOKEN) {
        let messageSent = false;
        let sendError = '';
        try {
          // Send the approved template first
          await sendWhatsAppTemplate(
            formattedPhone,
            'saludo_kenia',
            'es_419',
            [
              {
                type: 'body',
                parameters: [
                  {
                    type: 'text',
                    text: firstName
                  }
                ]
              }
            ],
            WA_TOKEN
          );
          messageSent = true;
        } catch (tplErr: any) {
          console.error(`[Cron Negotiation] Template failed for ${orderCode}, trying plain text:`, tplErr.message);
          sendError = tplErr.message;
        }

        // If template failed, send as plain text message
        if (!messageSent) {
          try {
            await sendWhatsAppMessage(formattedPhone, messageText, WA_TOKEN);
            messageSent = true;
            console.log(`[Cron Negotiation] Plain text sent to ${formattedPhone} for order ${orderCode} (template failed)`);
          } catch (txtErr: any) {
            console.error(`[Cron Negotiation] Plain text also failed for ${orderCode}:`, txtErr.message);
            sendError = `Template: ${sendError} | Text: ${txtErr.message}`;
          }
        }

        if (messageSent) {
          try {
            const historyMsg = sendError
              ? messageText
              : `[Plantilla enviada] ¡Hola ${firstName}! 💕 Soy Yaxbot, del equipo de Importadora Carlitos. ¿Cómo estás?`;
            await addToHistory(formattedPhone, 'assistant', historyMsg);

            if (targetOrderId) {
              console.log(`[Cron Negotiation] Manual trigger: Message sent to ${formattedPhone} for order ${orderCode}.`);
            } else {
              console.log(`[Cron Negotiation] WhatsApp message sent successfully to ${formattedPhone} for order ${orderCode}`);
            }
            processedOrders.push(orderCode);
          } catch (postErr: any) {
            console.error(`[Cron Negotiation] Failed to save history for ${orderCode}:`, postErr);
            sendErrors.push(`${orderCode}: ${postErr.message}`);
          }
        } else {
          sendErrors.push(`${orderCode}: ${sendError}`);
        }
      } else {
        const reason = !formattedPhone ? `phone invalid or empty (raw: "${rawPhone}")` : 'WA_TOKEN missing';
        console.warn(`[Cron Negotiation] Could not send message to order ${orderCode}: ${reason}.`);
        sendErrors.push(`${orderCode}: ${reason}`);
        debugInfo.push({ orderCode, rawPhone, formattedPhone, hasToken: !!WA_TOKEN });
      }

      // ALWAYS update order notes to prevent infinite retries
      const timestamp = new Date().toISOString().slice(0, 10);
      const isFailed = sendErrors.some(e => e.startsWith(orderCode));
      const marker = isFailed ? '[negot_wa_notified]' : '[negot_wa_notified]'; // Use the same marker so the cron query skips it
      
      const currentNotes = (order.ADDITIONALINFO as string) || '';
      const updatedNotes = currentNotes 
        ? `${currentNotes}\n${marker}`
        : `${marker}`;

      try {
        await serverUpdateDocument(ORDERS_COLLECTION_ID, orderId, {
          ADDITIONALINFO: updatedNotes,
          UPDATEDAT: Date.now()
        });
        console.log(`[Cron Negotiation] Successfully marked ${orderCode} with ${marker} in ADDITIONALINFO`);
      } catch (noteErr: any) {
        console.error(`[Cron Negotiation] Could not update ADDITIONALINFO for ${orderCode}:`, noteErr.message);
      }
    }

    return NextResponse.json({
      status: 'ok',
      processed: processedOrders,
      total_found: activeOrders.length,
      skipped_no_missing: activeOrders.filter(o => {
        try {
          const items = JSON.parse((o.ITEMS as string) || '[]');
          return !items.some((it: any) => it.missing === true);
        } catch { return true; }
      }).map(o => o.ORDERCODE || o.$id),
      has_wa_token: !!WA_TOKEN,
      send_errors: sendErrors,
      debug: debugInfo,
    });

  } catch (err: any) {
    console.error('[Cron Negotiation] Route crash:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
