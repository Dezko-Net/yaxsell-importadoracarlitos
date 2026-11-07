'use server';

import { sendWhatsAppMessage, sendWhatsAppTemplate, formatWhatsAppPhone, addToHistory } from '@/lib/whatsapp';
import { getKeniaRuntimeSnapshot } from '@/lib/kenia-runtime';
import { serverGetDocument, serverUploadFile, STORE_SETTINGS_COLLECTION } from '@/lib/db-server';
import { ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID, VENDORS_COLLECTION_ID } from '@/lib/db';
import { parsePaymentProofs } from '@/lib/payment-proofs';
import { createPaymentReviewPdf } from '@/lib/payment-review-pdf';
import type { VendorBranding } from '@/lib/generateOrderPdf';

const ADMIN_FALLBACK_PHONE = '56992139185';

export async function getAdminAlertPhone(): Promise<string> {
  try {
    const runtime = await getKeniaRuntimeSnapshot();
    if (runtime.config?.adminAlertPhone) {
      return runtime.config.adminAlertPhone;
    }
  } catch {}
  return process.env.ADMIN_WHATSAPP_NUMBER || ADMIN_FALLBACK_PHONE;
}

export async function notifyAdmin(message: string): Promise<void> {
  try {
    const phone = await getAdminAlertPhone();
    const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
    if (!WA_TOKEN) {
      console.warn('[notifyAdmin] No WHATSAPP_ACCESS_TOKEN configured');
      return;
    }
    const formattedPhone = formatWhatsAppPhone(phone);
    await sendWhatsAppMessage(formattedPhone, message, WA_TOKEN);
    await addToHistory(formattedPhone, 'assistant', message);
  } catch (e) {
    console.warn('[notifyAdmin] Failed to send notification:', e);
  }
}

export async function notifyNewOrder(orderCode: string, customerName: string, total: number, itemsCount: number): Promise<void> {
  const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
  
  try {
    const { sendWhatsAppTemplate, formatWhatsAppPhone } = await import('@/lib/whatsapp');
    
    const phone = await getAdminAlertPhone();
    const formattedPhone = formatWhatsAppPhone(phone);
    const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
    
    if (WA_TOKEN) {
      const components = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: orderCode },
            { type: 'text', text: customerName },
            { type: 'text', text: fmt(total) },
            { type: 'text', text: String(itemsCount) }
          ]
        }
      ];
      await sendWhatsAppTemplate(formattedPhone, 'alerta_nuevo_pedido_admin', 'es_CL', components, WA_TOKEN);
    }
  } catch (e) {
    console.error('[notifyNewOrder] Failed to send template:', e);
    // Fallback just in case
    await notifyAdmin(`🛒 *NUEVO PEDIDO* #${orderCode}\nCliente: ${customerName}\nTotal: ${fmt(total)}\nProductos: ${itemsCount}`);
  }
}

export async function notifyPaymentUploaded(orderCode: string, customerName: string, imageUrl?: string, orderId?: string): Promise<void> {
  const phone = await getAdminAlertPhone();
  const formattedPhone = formatWhatsAppPhone(phone);
  const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
  console.info('[notifyPaymentUploaded] Started:', JSON.stringify({
    orderCode,
    hasProofImage: Boolean(imageUrl),
    hasOrderId: Boolean(orderId),
    hasAccessToken: Boolean(WA_TOKEN),
    hasAdminRecipient: Boolean(formattedPhone),
  }));

  if (orderId && formattedPhone) {
    try {
      const { recordKeniaUsage, getKeniaUsage } = await import('@/lib/kenia-runtime');
      const adminState = await getKeniaUsage(formattedPhone);
      if (!adminState.balatinOrderFlow) {
        await recordKeniaUsage(formattedPhone, { pendingOrderId: orderId });
      }
    } catch (e) {
      console.error('[notifyPaymentUploaded] Failed to record usage:', e);
    }
  }

  if (imageUrl && WA_TOKEN && orderId) {
    let order: any = null;
    let collectionId = ORDERS_COLLECTION_ID;
    try {
      for (const candidate of [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]) {
        try {
          order = await serverGetDocument(candidate, orderId);
          collectionId = candidate;
          break;
        } catch {}
      }

      if (!order) throw new Error(`Order ${orderCode} was not found for the payment alert`);
      let storeName = 'Importadora Carlitos';
      let vendor: any = null;
      let branding: VendorBranding = { name: storeName };
      if (collectionId === VENDOR_ORDERS_COLLECTION_ID) {
        try {
          vendor = await serverGetDocument(VENDORS_COLLECTION_ID, String(order.VENDOR_ID || ''));
          storeName = String(vendor.NAME || vendor.STORENAME || vendor.storeName || storeName).trim();
          branding = {
            name: storeName,
            color: vendor.BRAND_COLOR || vendor.brandColor,
            secondaryColor: vendor.BRAND_SECONDARY_COLOR || vendor.brandSecondaryColor,
            logoUrl: vendor.LOGO_URL || vendor.logoUrl,
            address: vendor.STORE_ADDRESS || vendor.storeAddress,
            phone: vendor.STORE_PHONE || vendor.storePhone,
            email: vendor.STORE_EMAIL || vendor.storeEmail || vendor.EMAIL,
            website: vendor.STORE_WEBSITE || vendor.storeWebsite,
          };
        } catch {}
      } else {
        for (const settingsId of ['main', 'config']) {
          try {
            const settings: any = await serverGetDocument(STORE_SETTINGS_COLLECTION, settingsId);
            const configuredName = settings.STORENAME || settings.storeName;
            if (configuredName) {
              storeName = String(configuredName).trim();
            }
            branding = {
              name: storeName,
              color: settings.BRAND_COLOR || settings.brandColor,
              secondaryColor: settings.BRAND_SECONDARY_COLOR || settings.brandSecondaryColor,
              logoUrl: settings.LOGO_URL || settings.logoUrl,
              address: settings.STORE_ADDRESS || settings.storeAddress,
              phone: settings.STORE_PHONE || settings.storePhone,
              email: settings.STORE_EMAIL || settings.storeEmail,
              website: settings.STORE_WEBSITE || settings.storeWebsite,
            };
            if (configuredName) break;
          } catch {}
        }
      }

      const proofUrl = String(imageUrl || parsePaymentProofs(String(order.PAYMENTPROOFURL || ''))[0] || '').trim();
      if (!proofUrl) throw new Error(`Payment proof is missing for ${orderCode}`);
      const safeCode = String(order.ORDERCODE || orderCode).replace(/[^a-zA-Z0-9_-]/g, '_');
      const fmt = (value: unknown) => new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
      }).format(Number(value) || 0);
      const amount = fmt(order.TOTAL ?? order.total ?? order.TOTALAMOUNT ?? order.totalAmount ?? 0);
      const buttonComponents = [
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [{ type: 'payload', payload: `PAYMENT_OK:${order.$id || orderId}` }],
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '1',
          parameters: [{ type: 'payload', payload: `PAYMENT_NO:${order.$id || orderId}` }],
        },
      ];
      const sendErrors: string[] = [];

      // Intenta generar y enviar el PDF por separado. Un fallo aquí no debe impedir
      // que llegue la plantilla con la foto del comprobante y los botones.
      let pdfUrl = '';
      try {
        const pdfBuffer = await createPaymentReviewPdf(order, branding);
        const vendorFolder = String(vendor?.STORAGE_PREFIX || order.VENDOR_ID || 'vendor').replace(/[^a-zA-Z0-9_-]/g, '_');
        const reviewPath = collectionId === VENDOR_ORDERS_COLLECTION_ID
          ? `comprobantes/${vendorFolder}/revision-pagos`
          : 'comprobantes/yerko/revision-pagos';
        const upload = await serverUploadFile(
          reviewPath,
          pdfBuffer,
          `${safeCode}-${Date.now()}.pdf`,
          'application/pdf',
        );
        pdfUrl = upload.url;
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        sendErrors.push(`generación del PDF: ${detail}`);
        console.error('[notifyPaymentUploaded] Could not generate/upload order PDF:', e);
      }

      let pdfSent = false;
      let pdfMessageId = '';
      if (pdfUrl) {
        const pdfComponents = [
          {
            type: 'header',
            parameters: [{
              type: 'document',
              document: { link: pdfUrl, filename: `Pedido-${safeCode}.pdf` },
            }],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: storeName },
              { type: 'text', text: orderCode },
              { type: 'text', text: customerName },
              { type: 'text', text: amount },
            ],
          },
        ];
        try {
          const response = await sendWhatsAppTemplate(formattedPhone, 'alerta_pago_admin_pdf', 'es_CL', pdfComponents, WA_TOKEN);
          pdfSent = true;
          pdfMessageId = String(response?.messages?.[0]?.id || '');
        } catch (e) {
          console.error('[notifyPaymentUploaded] PDF template failed:', e);
          sendErrors.push(`plantilla alerta_pago_admin_pdf: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        sendErrors.push('plantilla alerta_pago_admin_pdf: no se generó/subió el PDF adjunto');
        console.error('[notifyPaymentUploaded] PDF template skipped because the PDF is unavailable');
      }

      // La plantilla del comprobante siempre se intenta, aunque haya fallado el PDF.
      let proofSent = false;
      let proofMessageId = '';
      const proofComponents = [
        {
          type: 'header',
          parameters: [{ type: 'image', image: { link: proofUrl } }],
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: orderCode },
            { type: 'text', text: storeName },
            { type: 'text', text: customerName },
            { type: 'text', text: amount },
          ],
        },
        ...buttonComponents,
      ];
      try {
        const response = await sendWhatsAppTemplate(formattedPhone, 'alerta_comprobante_pago', 'es_CL', proofComponents, WA_TOKEN);
        proofSent = true;
        proofMessageId = String(response?.messages?.[0]?.id || '');
      } catch (e) {
        console.error('[notifyPaymentUploaded] Proof template failed:', e);
        sendErrors.push(`plantilla alerta_comprobante_pago: ${e instanceof Error ? e.message : String(e)}`);
      }

      console.info('[notifyPaymentUploaded] Dispatch summary:', JSON.stringify({
        orderCode,
        collectionId,
        pdf: { attempted: Boolean(pdfUrl), acceptedByMeta: pdfSent, messageId: pdfMessageId || undefined },
        proof: { attempted: true, acceptedByMeta: proofSent, messageId: proofMessageId || undefined },
        errors: sendErrors,
      }));

      if (pdfSent || proofSent) {
        await addToHistory(
          formattedPhone,
          'assistant',
          `💳 Comprobante recibido para pedido #${orderCode}. PDF ${pdfSent ? 'enviado' : 'no enviado'}; plantilla del comprobante ${proofSent ? 'enviada' : 'no enviada'} (${collectionId}).`,
        );
      }
      return;
    } catch (e) {
      console.error('[notifyPaymentUploaded] Could not prepare payment templates:', e);
      return;
    }
  }

  const missing: string[] = [];
  if (!imageUrl) missing.push('URL del comprobante');
  if (!orderId) missing.push('ID del pedido');
  if (!WA_TOKEN) missing.push('WHATSAPP_ACCESS_TOKEN');
  console.error('[notifyPaymentUploaded] Templates not sent:', missing.join(', ') || 'unknown preparation error');
}

export async function notifyNegotiationOpened(orderCode: string, customerName: string): Promise<void> {
  await notifyAdmin(`👀 *LINK DE NEGOCIACIÓN ABIERTO* #${orderCode}\nCliente: ${customerName}\nEl cliente abrió el link para ver productos faltantes.`);
}

export async function notifyNegotiationPartial(orderCode: string, customerName: string, replacedCount: number, missingCount: number): Promise<void> {
  await notifyAdmin(`🔄 *CAMBIO PARCIAL* #${orderCode}\nCliente: ${customerName}\nReemplazados: ${replacedCount} | Faltan: ${missingCount}\nEl cliente ha reemplazado algunos productos pero aún faltan por cambiar.`);
}

export async function notifyNegotiationComplete(orderCode: string, customerName: string, replacedCount: number): Promise<void> {
  await notifyAdmin(`✅ *CAMBIO COMPLETO* #${orderCode}\nCliente: ${customerName}\nReemplazados: ${replacedCount}\nEl cliente completó todos los reemplazos. Ya puedes continuar con el pedido.`);
}
