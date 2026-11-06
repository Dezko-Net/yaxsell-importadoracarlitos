'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Clock, Upload, Copy, Check, AlertTriangle, MapPin, Package, Truck, Shield, FileText, RefreshCw, Pencil, X, Plus, Minus, Trash2, Search, Tag, Receipt, ExternalLink, MessageSquare, Box } from 'lucide-react';
import { getServices, getFirebaseConfig, ORDERS_COLLECTION, PRODUCTS_COLLECTION, MEDIA_BUCKET_ID, formatPrice, Query, ID } from '@/lib/firebase-compat';
import { WHOLESALE_ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID } from '@/lib/firebase-admin-compat';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { Order, OrderItem, Product } from '@/types';
import { generateOrderPdf } from '@/lib/generateOrderPdf';
import { notifyNegotiationOpened, notifyNegotiationPartial, notifyNegotiationComplete } from '@/lib/notify-admin';
import { useAuth } from '@/hooks/useAuth';
import { getOrderAutoCancelDeadline } from '@/lib/order-expiration';

const BANK_DEFAULTS = {
  bankAccountHolder: 'Importadora Carlitos',
  bankRut: '78267426-9',
  bankName: 'Banco de Chile',
  bankAccountType: 'Cuenta Corriente',
  bankAccountNumber: '4081220201',
  bankEmail: 'contacto@yaxsell.cl',
};

function getBankDetails(): Record<string, string> {
  try {
    const stored = localStorage.getItem('store_bank_details');
    const p = stored ? { ...BANK_DEFAULTS, ...JSON.parse(stored) } : BANK_DEFAULTS;
    return {
      'Titular': p.bankAccountHolder || 'No configurado',
      'RUT': p.bankRut || 'No configurado',
      'Banco': p.bankName || 'No configurado',
      'Tipo de cuenta': p.bankAccountType || 'Cuenta Vista',
      'N° de cuenta': p.bankAccountNumber || 'No configurado',
      'Email': p.bankEmail || 'No configurado',
    };
  } catch {
    return {
      'Titular': BANK_DEFAULTS.bankAccountHolder,
      'RUT': BANK_DEFAULTS.bankRut,
      'Banco': BANK_DEFAULTS.bankName,
      'Tipo de cuenta': BANK_DEFAULTS.bankAccountType,
      'N° de cuenta': BANK_DEFAULTS.bankAccountNumber,
      'Email': BANK_DEFAULTS.bankEmail,
    };
  }
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending:            { label: 'Stock confirmado',     color: '#166534', bg: '#f0fdf4' },
  pending_stock:      { label: 'Stock confirmado',     color: '#166534', bg: '#f0fdf4' },
  payment_expired:    { label: 'Pago vencido',         color: '#be123c', bg: '#fff1f2' },
  processing:         { label: 'Stock confirmado',    color: '#166534', bg: '#f0fdf4' },
  paid:               { label: 'Stock confirmado',    color: '#166534', bg: '#f0fdf4' },
  payment_review:     { label: 'Revisando Pago',      color: '#1d4ed8', bg: '#eff6ff' },
  payment_confirmed:  { label: 'Pago confirmado',     color: '#1b5e20', bg: '#e8f5e9' },
  negotiation:        { label: 'Negociando',          color: '#2563eb', bg: '#eff6ff' },
  shipped:            { label: 'Embalado',            color: '#6b21a8', bg: '#faf5ff' },
  delivered:          { label: 'Entregado a agencia', color: '#166534', bg: '#f0fdf4' },
  cancelled:          { label: 'Cancelado',           color: '#991b1b', bg: '#fff5f5' },
};

const STATUS_DESCRIPTIONS: Record<string, { title: string; desc: string; alertType: 'warning' | 'info' | 'success' | 'indigo' | 'danger' }> = {
  pending: {
    title: 'Stock Confirmado',
    desc: '¡Buenas noticias! El stock de tu pedido está confirmado y reservado. Realiza la transferencia bancaria con los datos indicados abajo y sube tu comprobante de pago antes de que expire el plazo.',
    alertType: 'success'
  },
  pending_stock: {
    title: 'Stock Confirmado',
    desc: '¡Buenas noticias! El stock de tu pedido está confirmado y reservado. Realiza la transferencia bancaria con los datos indicados abajo y sube tu comprobante de pago antes de que expire el plazo.',
    alertType: 'success'
  },
  processing: {
    title: 'Stock Confirmado',
    desc: '¡Buenas noticias! El stock de tu pedido está confirmado y reservado. Realiza la transferencia bancaria con los datos indicados abajo y sube tu comprobante de pago antes de que expire el plazo.',
    alertType: 'success'
  },
  paid: {
    title: 'Stock Confirmado',
    desc: '¡Buenas noticias! El stock de tu pedido está confirmado y reservado. Realiza la transferencia bancaria con los datos indicados abajo y sube tu comprobante de pago antes de que expire el plazo.',
    alertType: 'success'
  },
  payment_expired: {
    title: 'Pago vencido',
    desc: 'El plazo inicial de pago terminó, pero tu stock sigue reservado por 24 horas. Sube tu comprobante antes de que termine ese plazo para conservar tu pedido.',
    alertType: 'warning'
  },
  payment_review: {
    title: 'Revisando Pago',
    desc: 'Hemos recibido tu comprobante de pago. Nuestro equipo administrativo validará la transferencia a la brevedad para confirmar tu compra.',
    alertType: 'info'
  },
  payment_confirmed: {
    title: 'Pago Confirmado',
    desc: '¡Excelente! Tu pago ha sido verificado con éxito. Tu pedido pasará a nuestra área de preparación en bodega en las próximas horas.',
    alertType: 'success'
  },
  negotiation: {
    title: 'Negociando',
    desc: 'Estamos revisando la disponibilidad de algunos productos de tu pedido. Te contactaremos pronto con las novedades.',
    alertType: 'warning'
  },
  shipped: {
    title: 'Embalado',
    desc: 'Tu pedido ha sido embalado y está listo para ser entregado a la empresa de transporte.',
    alertType: 'indigo'
  },
  delivered: {
    title: 'Entregado a Agencia',
    desc: '¡Tu pedido ya fue entregado a la agencia de transporte! Puedes ver y descargar el comprobante de envío abajo para realizar el seguimiento.',
    alertType: 'success'
  },
  cancelled: {
    title: 'Cancelado',
    desc: 'Este pedido ha sido anulado. Si ya habías realizado la transferencia o tienes dudas, ponte en contacto con soporte técnico.',
    alertType: 'danger'
  }
};

function isPdfUrl(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.toLowerCase();
  return clean.endsWith('.pdf') || clean.includes('.pdf') || clean.includes('ext=pdf');
}

function Timer({ expiresAt }: { expiresAt: number }) {
  const [display, setDisplay] = useState('');
  const [urgent, setUrgent] = useState(false);
  useEffect(() => {
    const tick = () => {
      const diff = expiresAt - Date.now();
      if (diff <= 0) { setDisplay('Expirado'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setUrgent(diff < 15 * 60000);
      setDisplay(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return <span style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 700, color: urgent ? '#dc2626' : '#d97706' }}>{display}</span>;
}

const MAX_CUSTOMER_EDITS = 2;

function getProductSku(p: any): string {
  const direct = p?.SKU || p?.sku || '';
  if (direct && String(direct).trim()) return String(direct).trim();
  const feats = Array.isArray(p?.FEATURES) ? p.FEATURES.join('\n') : (p?.FEATURES || '');
  const m = String(feats || '').match(/SKU:\s*(.+)/i);
  return m ? m[1].trim().split('\n')[0] : '';
}

function getProductBarcode(p: any): string {
  const direct = p?.BARCODE || p?.barcode || '';
  if (direct && String(direct).trim()) return String(direct).trim();
  const feats = Array.isArray(p?.FEATURES) ? p.FEATURES.join('\n') : (p?.FEATURES || '');
  const m = String(feats || '').match(/Barcode:\s*(.+)/i);
  return m ? m[1].trim().split('\n')[0] : '';
}

async function resolveOrderInventoryMode(order?: Order | null): Promise<'erp_integrated' | 'web_independent'> {
  const savedMode = (order as any)?.INVENTORYMODE ?? (order as any)?.inventoryMode;
  if (savedMode === 'erp_integrated' || savedMode === 'web_independent') return savedMode;
  try {
    const response = await fetch('/api/store-settings', { cache: 'no-store' });
    const settings = await response.json();
    return settings?.inventoryMode === 'web_independent' ? 'web_independent' : 'erp_integrated';
  } catch {
    return 'erp_integrated';
  }
}

export default function PedidoPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [orderLookupError, setOrderLookupError] = useState('');
  const [isWholesale, setIsWholesale] = useState(false);
  const [isVendorOrder, setIsVendorOrder] = useState(false);
  const [vendorBranding, setVendorBranding] = useState<any>(null);
  const [serverBank, setServerBank] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    fetch('/api/store-settings')
      .then(r => r.json())
      .then(d => {
        if (d && (d.bankAccountHolder || d.bankName)) {
          setServerBank({
            'Titular': d.bankAccountHolder || 'No configurado',
            'RUT': d.bankRut || 'No configurado',
            'Banco': d.bankName || 'No configurado',
            'Tipo de cuenta': d.bankAccountType || 'Cuenta Vista',
            'N° de cuenta': d.bankAccountNumber || 'No configurado',
            'Email': d.bankEmail || d.email || 'No configurado',
          });
        }
      })
      .catch(() => {});
  }, []);
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [agencies, setAgencies] = useState<{ name: string }[]>([]);
  const [showAgencyChange, setShowAgencyChange] = useState(false);
  const [selectedAgency, setSelectedAgency] = useState('');
  const [savingAgency, setSavingAgency] = useState(false);
  const [shippingEditOpen, setShippingEditOpen] = useState(false);
  const [shippingDraft, setShippingDraft] = useState({ rut: '', email: '', address: '', comuna: '', region: '', additionalInfo: '' });
  const [savingShipping, setSavingShipping] = useState(false);

  // ── Customer edit/cancel (max 2 cambios) ──
  const [editOpen, setEditOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<OrderItem[]>([]);
  const [originalQtyById, setOriginalQtyById] = useState<Record<string, number>>({});
  const [productStockById, setProductStockById] = useState<Record<string, number>>({});
  const [loadingStocks, setLoadingStocks] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [editError, setEditError] = useState<string>('');
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [imageModal, setImageModal] = useState<{ src: string; name: string } | null>(null);
  const [paymentProofIsPdf, setPaymentProofIsPdf] = useState(false);
  const [shippingProofIsPdf, setShippingProofIsPdf] = useState(false);

  // Customer-side out-of-stock replacement states
  const [customerReplacingIdx, setCustomerReplacingIdx] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [replacingError, setReplacingError] = useState('');

  const handleOpenReplacementModal = async (item: OrderItem, index: number) => {
    setCustomerReplacingIdx(index);
    setLoadingSuggestions(true);
    setReplacingError('');
    setSuggestions([]);
    
    try {
      const vendorId = isVendorOrder && (order as any)?.VENDOR_ID ? String((order as any).VENDOR_ID) : '';
      const params = new URLSearchParams({ limit: '2000', inStockOnly: 'true' });
      if (vendorId) params.set('vendorId', vendorId);
      const res = await fetch(`/api/public-data/products?${params.toString()}`);
      const data = res.ok ? await res.json().catch(() => null) : null;
      const allInStock: any[] = Array.isArray(data?.products) ? data.products : [];

      // 1. Try to find original product to find its category
      let categoryId = '';
      if (item.id) {
        const oldInCatalog = allInStock.find((p: any) => p.$id === item.id);
        if (oldInCatalog?.CATEGORYID) {
          categoryId = oldInCatalog.CATEGORYID;
        } else {
          try {
            const oldRes = await fetch(`/api/public-data/products?ids=${encodeURIComponent(item.id)}`);
            const oldData = oldRes.ok ? await oldRes.json().catch(() => null) : null;
            categoryId = oldData?.products?.[0]?.CATEGORYID || '';
          } catch {}
        }
      }

      // 2. Filter by category first
      let prods: any[] = [];
      if (categoryId) {
        prods = allInStock.filter((p: any) => p.CATEGORYID === categoryId).slice(0, 50);
      }

      // 3. Fallback to name search if no category products found
      if (prods.length === 0) {
        const firstWord = (item.name || '').split(' ').filter(w => w.length > 3)[0]?.toLowerCase() || '';
        if (firstWord) {
          prods = allInStock.filter((p: any) => String(p.NAME || '').toLowerCase().includes(firstWord)).slice(0, 30);
        }
      }

      // 4. Ultimate fallback to general products
      if (prods.length === 0) {
        prods = allInStock.slice(0, 50);
      }

      // Filter: must have stock, not be the current product
      const filtered = prods.filter((p: any) => {
        if (p.$id === item.id) return false;
        const stock = p.STOCK ?? 0;
        return stock > 0 || stock === 99999;
      });

      // Sort by price similarity (compare retail prices if originalPrice is available)
      const targetComparePrice = item.originalPrice || item.price;
      const sorted = filtered.sort((a, b) => {
        const priceA = a.CURRENTPRICE ?? a.PRICE ?? 0;
        const priceB = b.CURRENTPRICE ?? b.PRICE ?? 0;
        const diffA = Math.abs(priceA - targetComparePrice);
        const diffB = Math.abs(priceB - targetComparePrice);
        return diffA - diffB;
      });

      setSuggestions(sorted);
    } catch (e: any) {
      setReplacingError('Error al buscar alternativas sugeridas.');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleCustomerReplace = async (newProd: any) => {
    if (!order || customerReplacingIdx === null) return;
    const parsedItems = [...items];
    const oldItem = parsedItems[customerReplacingIdx];
    if (!oldItem) return;

    if (!confirm(`¿Confirmas cambiar "${oldItem.name}" por "${newProd.NAME}"?`)) return;

    setLoadingSuggestions(true);
    setReplacingError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const inventoryMode = isVendorOrder || isWholesale
        ? 'erp_integrated'
        : await resolveOrderInventoryMode(order);

      // 1. Block old product (SKU)
      let oldSku = (oldItem as any).sku || '';
      let oldName = oldItem.name;
      let oldImg = oldItem.img || '';

      if (oldItem.id) {
        try {
          const oldProd: any = await databases.getDocument(databaseId, PRODUCTS_COLLECTION, oldItem.id);
          oldSku = oldProd.sku || getProductSku(oldProd);
          oldName = oldProd.NAME || oldName;
          oldImg = oldProd.IMAGEURL || oldImg;
        } catch {
          try {
            const nameSearchRes = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION, [
              Query.equal('NAME', oldItem.name),
              Query.limit(1)
            ]);
            if (nameSearchRes.documents.length > 0) {
              const oldProd = nameSearchRes.documents[0] as any;
              oldSku = oldProd.sku || getProductSku(oldProd);
              oldName = oldProd.NAME || oldName;
              oldImg = oldProd.IMAGEURL || oldImg;
            }
          } catch (errName) {
            console.error("Error doing name fallback search for blocked products (customer):", errName);
          }
        }
      }

      // 2. Set old product stock to 0
      if (oldItem.id) {
        try {
          await databases.updateDocument(databaseId, PRODUCTS_COLLECTION, oldItem.id,
            inventoryMode === 'web_independent'
              ? { WEB_STOCK: 0, web_stock: 0 }
              : { STOCK: 0, stock: 0 },
          );
          await fetch('/api/revalidate?tag=products').catch(() => {});
        } catch (errStock) {
          console.warn('No se pudo actualizar stock del producto original', errStock);
        }
      }

      // 3. Swap in order ITEMS
      let newPrice = newProd.CURRENTPRICE ?? newProd.PRICE ?? 0;
      let newOriginalPrice = null;
      if (oldItem.originalPrice && oldItem.originalPrice > oldItem.price) {
        const discountPct = (oldItem.originalPrice - oldItem.price) / oldItem.originalPrice;
        newOriginalPrice = newPrice;
        newPrice = Math.round(newPrice * (1 - discountPct));
      }
      const newSku = newProd.sku || getProductSku(newProd);

      parsedItems[customerReplacingIdx] = {
        ...oldItem,
        id: newProd.$id,
        name: newProd.NAME,
        price: newPrice,
        originalPrice: newOriginalPrice,
        img: newProd.IMAGEURL || '',
        sku: newSku,
        total: newPrice * oldItem.qty,
        missing: false,
        replaced: true,
        originalItem: {
          id: oldItem.id || '',
          name: oldItem.name,
          price: oldItem.price,
          img: oldItem.img || '',
          sku: oldSku
        } as any
      };

      const newSubtotal = parsedItems.reduce((s, it) => s + (it.price * it.qty), 0);
      const newTotal = newSubtotal + (order.SHIPPINGCOST || 0) - (order.DISCOUNT || 0);
      const editCount = (order as any).CUSTOMEREDITCOUNT || 0;

      const coll = isVendorOrder
        ? VENDOR_ORDERS_COLLECTION_ID
        : isWholesale
          ? WHOLESALE_ORDERS_COLLECTION_ID
          : ORDERS_COLLECTION;
      await databases.updateDocument(databaseId, coll, order.$id, {
        ITEMS: JSON.stringify(parsedItems),
        SUBTOTAL: newSubtotal,
        TOTAL: newTotal,
        CUSTOMEREDITCOUNT: editCount + 1,
        UPDATEDAT: Date.now()
      });

      setCustomerReplacingIdx(null);
      setSuggestions([]);
      await load();
      alert('¡Producto reemplazado con éxito!');

      // Notify admin about replacement status
      try {
        const updatedItems = parsedItems;
        const missingCount = updatedItems.filter((it: any) => it.missing === true).length;
        const replacedCount = updatedItems.filter((it: any) => it.replaced === true).length;
        const orderCode = order.ORDERCODE || order.$id;
        const customerName = order.CUSTOMERNAME || 'Cliente';

        if (missingCount === 0 && replacedCount > 0) {
          await notifyNegotiationComplete(orderCode, customerName, replacedCount);
        } else if (missingCount > 0 && replacedCount > 0) {
          await notifyNegotiationPartial(orderCode, customerName, replacedCount, missingCount);
        } else {
          // Fallback: use the old message format for edge cases
          const adminMsg = `✅ El cliente del pedido *#${orderCode}* ha completado un reemplazo en la web.\n• Producto original: ${oldItem.name}\n• Nuevo producto: ${newProd.NAME}`;
          await fetch('/api/admin/whatsapp-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: '56985520703', message: adminMsg })
          });
        }
      } catch (errNotify) {
        console.warn('Error notificando al admin:', errNotify);
      }

    } catch (e: any) {
      setReplacingError(e.message || 'Error al realizar el reemplazo');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      let doc: any = null;
      let wholesale = false;
      let vendorOrder = false;

      // 1. Intentar getDocument directo en ORDERS_COLLECTION (por doc ID)
      try {
        doc = await databases.getDocument(databaseId, ORDERS_COLLECTION, id);
      } catch {}

      // 2. Fallback server-side por ID; si la ruta antigua usa un folio, el
      // endpoint solo lo resuelve cuando corresponde a un único pedido.
      if (!doc) {
        try {
          let apiRes = await fetch(`/api/catalogo/order?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
          let apiData = await apiRes.json().catch(() => null);
          if (!apiRes.ok && apiRes.status === 404) {
            apiRes = await fetch(`/api/catalogo/order?code=${encodeURIComponent(id)}`, { cache: 'no-store' });
            apiData = await apiRes.json().catch(() => null);
          }
          if (apiRes.status === 409 && apiData?.code === 'AMBIGUOUS_ORDER_CODE') {
            setOrderLookupError(apiData.error || 'Este número corresponde a más de un pedido. Abre el enlace directo que recibiste.');
            return;
          }
          if (apiRes.ok && apiData?.order) {
            doc = apiData.order;
          }
        } catch {}
      }

      // 3. Fallback legacy mayorista por ID. La búsqueda por folio se realiza
      // en el endpoint único para impedir que un duplicado elija otra orden.
      if (!doc) {
        try {
          doc = await databases.getDocument(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, id);
          wholesale = true;
        } catch {}
      }

      // 4. Intentar pedido de vendor por ID (solo si hay usuario autenticado).
      if (!doc && user) {
        try {
          const query = new URLSearchParams({ userId: user?.id || '', email: user?.email || '' });
          const vendorRes = await fetch(`/api/public-data/vendor-order/${encodeURIComponent(id)}?${query.toString()}`);
          const vendorData = await vendorRes.json().catch(() => null);
          if (vendorRes.ok && vendorData?.order) {
            doc = {
              ...vendorData.order,
              STATUS: ['pending', 'pending_stock', 'processing'].includes(String(vendorData.order.STATUS)) ? 'paid' : vendorData.order.STATUS,
            };
            vendorOrder = true;
            setVendorBranding(vendorData.branding || null);
          }
        } catch {}
      }

      // 5. Enlaces antiguos de vendor por folio: la API rechaza duplicados.
      if (!doc) {
        try {
          const vendorRes = await fetch(`/api/vendor/public-order?code=${encodeURIComponent(id)}`, { cache: 'no-store' });
          const vendorData = await vendorRes.json().catch(() => null);
          if (vendorRes.status === 409 && vendorData?.code === 'AMBIGUOUS_ORDER_CODE') {
            setOrderLookupError(vendorData.error || 'Este número corresponde a más de un pedido. Abre el enlace directo que recibiste.');
            return;
          }
          if (vendorRes.ok && vendorData?.order) {
            doc = vendorData.order;
            vendorOrder = true;
            setVendorBranding(vendorData.order.VENDOR_BRANDING || vendorData.vendor || null);
          }
        } catch {}
      }

      if (doc) {
        setOrderLookupError('');
        if (doc.IS_VENDOR_ORDER || doc.VENDOR_NAME || doc.VENDOR_ID) {
          vendorOrder = true;
          setVendorBranding(doc.VENDOR_BRANDING || {
            name: doc.VENDOR_NAME || 'Tienda Aliada',
            bankAccountHolder: doc.VENDOR_BANK_HOLDER || doc.BANK_DETAILS?.holder,
            bankRut: doc.VENDOR_BANK_RUT || doc.BANK_DETAILS?.rut,
            bankName: doc.VENDOR_BANK_NAME || doc.BANK_DETAILS?.bank,
            bankAccountType: doc.VENDOR_BANK_TYPE || doc.BANK_DETAILS?.type,
            bankAccountNumber: doc.VENDOR_BANK_ACCOUNT || doc.BANK_DETAILS?.number,
            bankEmail: doc.VENDOR_BANK_EMAIL || doc.BANK_DETAILS?.email,
          });
        }
        setIsWholesale(wholesale);
        setIsVendorOrder(vendorOrder);
        const o = doc as unknown as Order;
        setOrder(o);
        if (o.PAYMENTPROOFURL) setUploaded(true);
        try { setItems(JSON.parse(o.ITEMS)); } catch {}

        const coll = wholesale ? WHOLESALE_ORDERS_COLLECTION_ID : ORDERS_COLLECTION;

        // If order is in negotiation and customer hasn't opened it yet, mark as opened
        if (o.STATUS === 'negotiation' && !(o as any).NEGOTIATION_OPENED_AT) {
          try {
            await databases.updateDocument(databaseId, coll, id, {
              NEGOTIATION_OPENED_AT: Date.now()
            });
            notifyNegotiationOpened(o.ORDERCODE || id, o.CUSTOMERNAME || 'Cliente').catch(() => {});
          } catch (e) {
            console.warn('No se pudo marcar NEGOTIATION_OPENED_AT:', e);
          }
        }
      }
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, [id, user]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [load, authLoading]);

  // Actualiza el estado justo al vencer cada contador, incluso si el cliente
  // deja abierta la página. El servidor conserva el stock por las 24 h extra.
  useEffect(() => {
    if (!order || !['paid', 'payment_expired'].includes(order.STATUS) || order.PAYMENTPROOFURL || isWholesale) return;
    const deadline = Number(order.STATUS === 'payment_expired' ? getOrderAutoCancelDeadline(order) : order.EXPIRESAT || 0);
    if (!deadline) return;
    const timeout = setTimeout(async () => {
      try {
        if (isVendorOrder) {
          const owner = new URLSearchParams();
          const ownerId = order.USERID || user?.id || '';
          const ownerEmail = order.CUSTOMEREMAIL || user?.email || '';
          if (ownerId) owner.set('userId', ownerId);
          if (ownerEmail) owner.set('email', ownerEmail);
          await fetch(`/api/public-data/vendor-order/${encodeURIComponent(order.$id)}?${owner.toString()}`, { cache: 'no-store' });
        } else {
          const code = order.ORDERCODE || id;
          await fetch(`/api/catalogo/order?id=${encodeURIComponent(order.$id)}&code=${encodeURIComponent(code)}`, { cache: 'no-store' });
        }
      } finally {
        await load();
      }
    }, deadline > Date.now() ? deadline - Date.now() + 250 : 60_000);
    return () => clearTimeout(timeout);
  }, [order?.$id, order?.STATUS, order?.EXPIRESAT, order?.AUTOCANCELAT, order?.PAYMENTPROOFURL, order?.CUSTOMEREMAIL, order?.ORDERCODE, order?.USERID, isVendorOrder, isWholesale, user?.id, user?.email, id, load]);

  useEffect(() => {
    if (order?.PAYMENTPROOFURL) {
      if (isPdfUrl(order.PAYMENTPROOFURL)) {
        setPaymentProofIsPdf(true);
      } else {
        fetch(order.PAYMENTPROOFURL, { method: 'HEAD' })
          .then(res => {
            const contentType = res.headers.get('content-type');
            if (contentType?.includes('application/pdf')) {
              setPaymentProofIsPdf(true);
            } else {
              setPaymentProofIsPdf(false);
            }
          })
          .catch(err => {
            console.warn('Error checking payment proof Content-Type:', err);
            setPaymentProofIsPdf(false);
          });
      }
    } else {
      setPaymentProofIsPdf(false);
    }

    if (order?.SHIPPINGPROOFURL) {
      if (isPdfUrl(order.SHIPPINGPROOFURL)) {
        setShippingProofIsPdf(true);
      } else {
        fetch(order.SHIPPINGPROOFURL, { method: 'HEAD' })
          .then(res => {
            const contentType = res.headers.get('content-type');
            if (contentType?.includes('application/pdf')) {
              setShippingProofIsPdf(true);
            } else {
              setShippingProofIsPdf(false);
            }
          })
          .catch(err => {
            console.warn('Error checking shipping proof Content-Type:', err);
            setShippingProofIsPdf(false);
          });
      }
    } else {
      setShippingProofIsPdf(false);
    }
  }, [order?.PAYMENTPROOFURL, order?.SHIPPINGPROOFURL]);

  // Load only the agencies enabled by this store.
  useEffect(() => {
    if (!order) return;
    (async () => {
      try {
        const vendorId = isVendorOrder ? String((order as any).VENDOR_ID || '') : '__MAIN__';
        const res = await fetch(`/api/agencies?vendorId=${encodeURIComponent(vendorId)}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.agencies) setAgencies(data.agencies);
      } catch {}
    })();
  }, [order, isVendorOrder]);

  async function handleChangeAgency() {
    if (!order || !selectedAgency || savingAgency) return;
    setSavingAgency(true);
    try {
      if (isVendorOrder) {
        const query = new URLSearchParams({ userId: user?.id || '', email: user?.email || '' });
        const response = await fetch(`/api/public-data/vendor-order/${encodeURIComponent(id)}?${query.toString()}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ SHIPPINGAGENCY: selectedAgency }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || 'No se pudo cambiar la agencia');
      } else {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        const coll = isWholesale ? WHOLESALE_ORDERS_COLLECTION_ID : ORDERS_COLLECTION;
        await databases.updateDocument(databaseId, coll, id, {
          SHIPPINGAGENCY: selectedAgency,
          AGENCYCHANGED: true,
        });
      }
      setOrder(prev => prev ? { ...prev, SHIPPINGAGENCY: selectedAgency, AGENCYCHANGED: true } : prev);
      setShowAgencyChange(false);
    } catch (error: any) {
      alert(error?.message || 'Error al cambiar la agencia. Intenta de nuevo.');
    } finally {
      setSavingAgency(false);
    }
  }

  async function handleSaveShipping() {
    if (!order || savingShipping) return;
    setSavingShipping(true);
    try {
      const updateData = {
        CUSTOMERRUT: shippingDraft.rut,
        CUSTOMEREMAIL: shippingDraft.email,
        ADDRESS: shippingDraft.address,
        COMUNA: shippingDraft.comuna,
        REGION: shippingDraft.region,
        ADDITIONALINFO: shippingDraft.additionalInfo,
      };
      if (isVendorOrder) {
        const query = new URLSearchParams({ userId: user?.id || '', email: user?.email || '' });
        const response = await fetch(`/api/public-data/vendor-order/${encodeURIComponent(id)}?${query.toString()}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || 'No se pudieron guardar los datos');
      } else {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        const coll = isWholesale ? WHOLESALE_ORDERS_COLLECTION_ID : ORDERS_COLLECTION;
        await databases.updateDocument(databaseId, coll, id, updateData);
      }
      setOrder(prev => prev ? { ...prev, ...updateData } : prev);
      setShippingEditOpen(false);
    } catch (error: any) {
      alert(error?.message || 'No se pudieron guardar los datos de envío.');
    } finally {
      setSavingShipping(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !order) return;
    setUploading(true);
    try {
      if (isVendorOrder) {
        const formData = new FormData();
        formData.append('file', file);
        const query = new URLSearchParams({ userId: user?.id || '', email: user?.email || '' });
        const response = await fetch(`/api/public-data/vendor-order/${encodeURIComponent(id)}/upload-proof?${query.toString()}`, {
          method: 'POST',
          body: formData,
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || 'No se pudo subir el comprobante');
      } else {
        // Usar API server-side para subir comprobante a Firebase Storage
        const formData = new FormData();
        formData.append('orderId', order.$id);
        formData.append('orderCode', order.ORDERCODE || id);
        formData.append('file', file);
        const response = await fetch('/api/catalogo/upload-proof', {
          method: 'POST',
          body: formData,
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || 'No se pudo subir el comprobante');
      }

      setUploaded(true);
      await load();
      fetch('/api/revalidate-orders', { method: 'POST' }).catch(() => {});
      window.dispatchEvent(new Event('orders-updated'));
    } catch (err: any) {
      console.error('[handleUpload]', err);
      alert('Error al subir el comprobante: ' + (err?.message || 'Intenta de nuevo.'));
    } finally {
      setUploading(false);
    }
  }

  function copyField(key: string, val: string) {
    navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function copyAll() {
    const text = Object.entries(serverBank || getBankDetails()).map(([k, v]) => `${k}: ${v}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied('all');
    setTimeout(() => setCopied(null), 2000);
  }

  function getCustomerEditCount(o: Order): number {
    const anyO = o as any;
    const v = anyO.CUSTOMEREDITCOUNT ?? anyO.customerEditCount ?? anyO.EDITCOUNT ?? anyO.editCount ?? 0;
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }

  function computeSubtotal(list: OrderItem[]) {
    return list.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  }

  function getMaxQtyFor(productId: string, currentStockFallback?: number): number | null {
    const stock = productStockById[productId] ?? currentStockFallback;
    if (stock === undefined || !Number.isFinite(stock)) return null;
    const original = Number(originalQtyById[productId] ?? 0) || 0;
    // El stock actual ya tiene descontada la reserva del pedido; por eso el máximo posible es:
    // qty_original_en_pedido + stock_disponible_actual
    return Math.max(0, original + stock);
  }

  async function loadStocksFor(ids: string[]) {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (uniq.length === 0) return;
    setLoadingStocks(true);
    try {
      const out: Record<string, number> = {};
      try {
        const res = await fetch(`/api/public-data/products?ids=${encodeURIComponent(uniq.join(','))}`);
        if (res.ok) {
          const data = await res.json().catch(() => null);
          for (const p of (data?.products || [])) {
            if (p?.$id) out[String(p.$id)] = Number(p.STOCK ?? 0);
          }
        }
      } catch {}

      const missing = uniq.filter(pid => out[pid] === undefined);
      if (missing.length > 0) {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        await Promise.all(missing.map(async (pid) => {
          try {
            const doc = await databases.getDocument(databaseId, PRODUCTS_COLLECTION, pid);
            out[pid] = Number((doc as any).STOCK ?? 0);
          } catch {
            // si falla, dejamos sin stock (null) para no bloquear UI; el guardado validará igual
          }
        }));
      }
      setProductStockById(prev => ({ ...prev, ...out }));
    } finally {
      setLoadingStocks(false);
    }
  }

  function openEditor() {
    if (!order) return;
    setEditError('');
    setProductSearch('');
    setProductResults([]);
    // Clonar items actuales como base
    const base = (items || []).map(it => ({ ...it, qty: Math.max(1, Number(it.qty) || 1) }));
    const orig: Record<string, number> = {};
    for (const it of base) orig[it.id] = Number(it.qty) || 0;
    setOriginalQtyById(orig);
    setDraftItems(base);
    loadStocksFor(base.map(i => i.id));
    setEditOpen(true);
  }

  function closeEditor() {
    setEditOpen(false);
    setEditError('');
    setProductSearch('');
    setProductResults([]);
  }

  // Cerrar modal de imagen con ESC
  useEffect(() => {
    if (!imageModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImageModal(null);
    };
    document.addEventListener('keydown', onKeyDown);
    // bloquear scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [imageModal]);

  function setQty(productId: string, qty: number) {
    setDraftItems(prev => prev.map(it => {
      if (it.id !== productId) return it;
      const minQ = 1;
      const maxQ = getMaxQtyFor(productId, (it as any).stock);
      const next = Math.max(minQ, qty);
      const clamped = maxQ != null ? Math.min(next, maxQ) : next;
      const price = Number(it.price) || 0;
      return { ...it, qty: clamped, total: price * clamped };
    }));
  }

  function removeDraft(productId: string) {
    setDraftItems(prev => prev.filter(it => it.id !== productId));
  }

  async function searchProducts() {
    const q = productSearch.trim();
    if (q.length < 2) { setProductResults([]); return; }
    setSearchingProducts(true);
    const vendorId = isVendorOrder ? String((order as any)?.VENDOR_ID || '') : '';
    const belongsToOrderVendor = (product: any) => !isVendorOrder || String(product?.VENDOR_ID || '') === vendorId;
    try {
      const serverParams = new URLSearchParams({ search: q, limit: '50' });
      if (isVendorOrder && vendorId) serverParams.set('vendorId', vendorId);
      const serverResponse = await fetch(`/api/public-data/products?${serverParams.toString()}`, { cache: 'no-store' });
      if (serverResponse.ok) {
        const serverData = await serverResponse.json().catch(() => null);
        const serverProducts = Array.isArray(serverData?.products)
          ? serverData.products.filter(belongsToOrderVendor).slice(0, 20) as Product[]
          : [];
        setProductResults(serverProducts);
        const stockMap: Record<string, number> = {};
        for (const p of serverProducts as any[]) {
          if (p?.$id && Number.isFinite(Number(p?.STOCK))) stockMap[String(p.$id)] = Number(p.STOCK);
        }
        if (Object.keys(stockMap).length) setProductStockById(prev => ({ ...prev, ...stockMap }));
        return;
      }

      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      // Primero intentamos búsqueda nativa; si falla por permisos/índices, fallback a listar y filtrar.
      try {
        const seen = new Set<string>();
        const merged: Product[] = [];

        const resByName = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION, [
          Query.search('NAME', q),
          Query.limit(20),
        ]);
        for (const d of (resByName.documents as any[])) {
          const id = String((d as any).$id || '');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          merged.push(d as Product);
        }

        // Intentar también búsqueda por FEATURES (SKU/Barcode). Si no existe índice o falla, lo ignoramos.
        try {
          const resByFeatures = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION, [
            Query.search('FEATURES', q),
            Query.limit(20),
          ]);
          for (const d of (resByFeatures.documents as any[])) {
            const id = String((d as any).$id || '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            merged.push(d as Product);
          }
        } catch {}

        let list = merged.filter(belongsToOrderVendor).slice(0, 20);
        if (list.length === 0) {
          const fallbackRes = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION, [
            ...(isVendorOrder && vendorId ? [Query.equal('VENDOR_ID', vendorId)] : []),
            Query.limit(200),
          ]);
          const qq = q.toLowerCase();
          list = (fallbackRes.documents as any[]).filter((p: any) => {
            const hay = `${String(p?.NAME || '')} ${getProductSku(p)} ${getProductBarcode(p)} ${String(p?.TAGS || '')} ${String(p?.FEATURES || '')}`.toLowerCase();
            return belongsToOrderVendor(p) && hay.includes(qq);
          }).slice(0, 20) as Product[];
        }
        setProductResults(list);
        // cachear stock para usarlo en límites de cantidad
        const stockMap: Record<string, number> = {};
        for (const p of list as any[]) {
          if (p?.$id && Number.isFinite(Number(p?.STOCK))) stockMap[String(p.$id)] = Number(p.STOCK);
        }
        if (Object.keys(stockMap).length) setProductStockById(prev => ({ ...prev, ...stockMap }));
      } catch {
        const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION, [Query.limit(80)]);
        const docs = (res.documents as unknown as Product[]) || [];
        const qq = q.toLowerCase();
        const list = docs
          .filter((p: any) => {
            const name = String(p?.NAME || '').toLowerCase();
            const sku = getProductSku(p).toLowerCase();
            const barcode = getProductBarcode(p).toLowerCase();
            const tags = Array.isArray(p?.TAGS) ? p.TAGS.join(',') : (p?.TAGS || '');
            const feats = Array.isArray(p?.FEATURES) ? p.FEATURES.join('\n') : (p?.FEATURES || '');
            const hay = `${name}\n${sku}\n${barcode}\n${String(tags).toLowerCase()}\n${String(feats).toLowerCase()}`;
            return belongsToOrderVendor(p) && hay.includes(qq);
          })
          .slice(0, 20);
        setProductResults(list);
        const stockMap: Record<string, number> = {};
        for (const p of list as any[]) {
          if (p?.$id && Number.isFinite(Number(p?.STOCK))) stockMap[String(p.$id)] = Number(p.STOCK);
        }
        if (Object.keys(stockMap).length) setProductStockById(prev => ({ ...prev, ...stockMap }));
      }
    } catch (e) {
      console.error(e);
      setProductResults([]);
    } finally {
      setSearchingProducts(false);
    }
  }

  function addProductToDraft(p: Product) {
    setDraftItems(prev => {
      const idx = prev.findIndex(x => x.id === p.$id);
      const price = (p.CURRENTPRICE ?? p.PRICE ?? 0) as number;
      const img = resolveStorageImageUrl(p.IMAGEURL);
      const pid = String((p as any).$id || '');
      const directStock = Number((p as any).STOCK ?? 0);
      if (idx >= 0) {
        const cur = prev[idx];
        const newQty = (cur.qty || 1) + 1;
        const curPrice = Number(cur.price) || 0;
        const maxQ = getMaxQtyFor(cur.id, directStock);
        if (maxQ != null && newQty > maxQ) {
          alert('No hay más stock disponible para este producto.');
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...cur, qty: newQty, total: curPrice * newQty };
        return next;
      }
      const maxNew = getMaxQtyFor(pid, directStock);
      if (maxNew != null && maxNew <= 0) {
        alert('Este producto no tiene stock disponible.');
        return prev;
      }
      return [
        ...prev,
        { id: p.$id, name: p.NAME, price, qty: 1, img, total: price, stock: directStock },
      ];
    });

    const pid = String((p as any).$id || '');
    const directStock = Number((p as any).STOCK ?? 0);
    if (pid && Number.isFinite(directStock)) {
      setProductStockById(s => ({ ...s, [pid]: directStock }));
    }
  }

  async function handleSaveEdits() {
    if (!order || savingEdit) return;
    if (draftItems.length === 0) { setEditError('El pedido debe tener al menos 1 producto.'); return; }

    setSavingEdit(true);
    setEditError('');

    try {
      const res = await fetch('/api/public-data/edit-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: id,
          draftItems,
          isWholesale,
          isVendorOrder
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al guardar los cambios del pedido.');
      }

      closeEditor();
      await load();
    } catch (e: any) {
      console.error(e);
      setEditError(e?.message || 'Error al guardar cambios. Intenta de nuevo.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleCancelOrder() {
    if (!order || cancelling) return;
    if (!window.confirm('¿Seguro que quieres anular este pedido?')) return;

    setCancelling(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      const coll = isVendorOrder
        ? VENDOR_ORDERS_COLLECTION_ID
        : isWholesale
          ? WHOLESALE_ORDERS_COLLECTION_ID
          : ORDERS_COLLECTION;
      const latestDoc = await databases.getDocument(databaseId, coll, id);
      const latest = latestDoc as unknown as Order;
      const inventoryMode = isVendorOrder || isWholesale
        ? 'erp_integrated'
        : await resolveOrderInventoryMode(latest);

      const editCount = getCustomerEditCount(latest);
      const unmodifiableStatuses = ['payment_review', 'payment_confirmed', 'negotiation', 'shipped', 'delivered', 'cancelled'];
      if (unmodifiableStatuses.includes(latest.STATUS)) {
        alert('No puedes anular el pedido si ya está verificado, en proceso de preparación o anulado.');
        return;
      }

      let latestItems: OrderItem[] = [];
      try { latestItems = JSON.parse((latest as any).ITEMS || '[]'); } catch {}

      // Restituir stock (solo si el producto tenía stock real, no el sentinel 99999)
      let restoredAnyStock = false;
      let restoreFailed = false;
      const restoredChanges: Array<{ productId: string; stockField: 'STOCK' | 'WEB_STOCK'; previousStock: number }> = [];
      for (const it of latestItems) {
        const pid = it.id;
        const qty = Number(it.qty) || 0;
        if (!pid || qty <= 0 || (latest as any).STOCKDEDUCTED === false) continue;
        try {
          const productDoc = await databases.getDocument(databaseId, PRODUCTS_COLLECTION, pid);
          const stockField = inventoryMode === 'web_independent' ? 'WEB_STOCK' : 'STOCK';
          const currentStock = Number((productDoc as any)[stockField] ?? (stockField === 'WEB_STOCK' ? (productDoc as any).STOCK : 0) ?? 0);
          // No restituir si el producto tiene stock ilimitado (sentinel 99999)
          if (currentStock === 99999) continue;
          const restoredStock = currentStock + qty;
          await databases.updateDocument(databaseId, PRODUCTS_COLLECTION, pid, stockField === 'WEB_STOCK'
            ? { WEB_STOCK: restoredStock, web_stock: restoredStock }
            : { STOCK: restoredStock, stock: restoredStock });
          restoredChanges.push({ productId: pid, stockField, previousStock: currentStock });
          restoredAnyStock = true;
        } catch (err) {
          console.error('Error restaurando stock', pid, err);
          restoreFailed = true;
          break;
        }
      }
      if (restoreFailed) {
        for (const change of restoredChanges.reverse()) {
          try {
            await databases.updateDocument(databaseId, PRODUCTS_COLLECTION, change.productId, change.stockField === 'WEB_STOCK'
              ? { WEB_STOCK: change.previousStock, web_stock: change.previousStock }
              : { STOCK: change.previousStock, stock: change.previousStock });
          } catch (rollbackError) {
            console.error('Error revirtiendo restitución parcial de stock', change.productId, rollbackError);
          }
        }
        throw new Error('No se pudo restituir el stock completo. El pedido sigue sin anularse; inténtalo nuevamente o contacta a soporte.');
      }
      if (restoredAnyStock) await fetch('/api/revalidate?tag=products').catch(() => {});

      await databases.updateDocument(databaseId, coll, id, {
        STATUS: 'cancelled',
        UPDATEDAT: Date.now(),
        CUSTOMEREDITCOUNT: editCount + 1,
        STOCKDEDUCTED: false,
        INVENTORYMODE: inventoryMode,
      });

      await load();
    } catch (e) {
      console.error(e);
      alert('Error al anular el pedido. Intenta de nuevo.');
    } finally {
      setCancelling(false);
    }
  }

  const card: React.CSSProperties = { background: '#fff', borderRadius: 4, padding: '20px 22px', marginBottom: 12 };

  if (isLoading || (authLoading && !order)) return (
    <div style={{ background: '#ebebeb', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#999', fontSize: 15 }}>Cargando pedido...</p>
    </div>
  );

  if (!order) return (
    <div style={{ background: '#ebebeb', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <AlertTriangle size={40} color="#e53935" />
      <p style={{ color: '#333', fontSize: 16 }}>{orderLookupError || 'Pedido no encontrado'}</p>
      <Link href="/" style={{ color: '#3483fa', textDecoration: 'none', fontSize: 14 }}>Ir al inicio</Link>
    </div>
  );

  const isGuestOrder = !order.USERID || order.USERID === 'guest' || String(order.USERID).includes('guest');
  if (!isGuestOrder) {
    if (!isLoggedIn || user?.id !== order.USERID) {
      return (
        <div style={{ background: '#ebebeb', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
          <Shield size={48} color="#2563eb" />
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#333', margin: 0 }}>Acceso Denegado</h2>
          <p style={{ color: '#666', fontSize: 14, maxWidth: 400 }}>
            Este pedido pertenece a una cuenta registrada. Para proteger la privacidad, debes iniciar sesión con la cuenta dueña de este pedido para verlo.
          </p>
          <Link href="/login" style={{ display: 'inline-block', marginTop: 10, padding: '12px 24px', background: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: 8, fontWeight: 700 }}>
            Iniciar Sesión
          </Link>
        </div>
      );
    }
  }

  const canEditBeforePayment = ['pending', 'pending_stock', 'processing', 'paid', 'payment_expired'].includes(order.STATUS);
  const isStockConfirmed = ['pending', 'pending_stock', 'processing', 'paid', 'payment_expired'].includes(order.STATUS);
  const BANK = isVendorOrder && vendorBranding
    ? {
        'Titular': vendorBranding.bankAccountHolder || 'No configurado',
        'RUT': vendorBranding.bankRut || 'No configurado',
        'Banco': vendorBranding.bankName || 'No configurado',
        'Tipo de cuenta': vendorBranding.bankAccountType || 'Cuenta Vista',
        'N° de cuenta': vendorBranding.bankAccountNumber || 'No configurado',
        'Email': vendorBranding.bankEmail || 'No configurado',
      }
    : (serverBank || getBankDetails());
  const isRetiro = order.SHIPPINGAGENCY?.toUpperCase() === 'RETIRO EN TIENDA';
  const isReadyRetiro = order.STATUS === 'shipped' && isRetiro;
  const status = isReadyRetiro
    ? { label: 'Listo para retirar', color: '#a21caf', bg: '#fae8ff' }
    : (STATUS_MAP[order.STATUS] || { label: order.STATUS, color: '#333', bg: '#f5f5f5' });
  const showTimer = isStockConfirmed && (order.STATUS === 'payment_expired' ? getOrderAutoCancelDeadline(order) : order.EXPIRESAT) && !uploaded;
  const isSuccess = uploaded || ['paid', 'payment_confirmed', 'shipped', 'delivered'].includes(order.STATUS);
  const customerEditCount = getCustomerEditCount(order);
  const canCustomerModify = !['payment_review', 'payment_confirmed', 'negotiation', 'shipped', 'delivered', 'cancelled'].includes(order.STATUS);
  // Allow replacement selection even for 'paid'/'processing' orders if there are missing items
  const hasMissingItems = items.some(it => !!(it as any).missing);
  const canChooseReplacement = hasMissingItems && !['payment_confirmed', 'shipped', 'delivered', 'cancelled'].includes(order.STATUS);

  return (
    <div className="bg-white min-h-screen py-6 px-4 sm:px-6 lg:px-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Back to profile ── */}
        <Link
          href="/cuenta"
          className="group inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-blue-600 transition-colors"
          aria-label="Volver a mi perfil"
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 group-hover:bg-blue-50 border border-gray-200 group-hover:border-blue-200 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 group-hover:text-blue-600 transition-colors group-hover:-translate-x-0.5 duration-200">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </span>
          Volver a mi perfil
        </Link>

        {/* ── Header success banner ── */}
        <div className="rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_rgba(37,99,235,0.08)] border border-blue-100 text-center relative overflow-hidden bg-gradient-to-b from-blue-50/60 to-white">
          {/* decorative SVG blobs */}
          <svg className="absolute -top-10 -right-10 w-40 h-40 text-blue-100/70 pointer-events-none" viewBox="0 0 200 200" fill="currentColor" aria-hidden="true">
            <path d="M42.7,-62.9C54.3,-53.2,62,-39.5,66.8,-24.9C71.6,-10.3,73.4,5.2,69.2,19.2C65,33.1,54.8,45.5,42.1,54.8C29.4,64.1,14.7,70.3,-0.9,71.5C-16.5,72.7,-33,68.9,-45.9,59.5C-58.8,50.1,-68.1,35.1,-71.8,18.9C-75.5,2.7,-73.6,-14.7,-66.1,-28.9C-58.6,-43.1,-45.5,-54.1,-31.6,-63C-17.7,-71.9,-3,-78.7,10.6,-76.1C24.2,-73.5,31.1,-72.6,42.7,-62.9Z" transform="translate(100 100)" />
          </svg>
          <svg className="absolute -bottom-12 -left-12 w-40 h-40 text-sky-100/60 pointer-events-none" viewBox="0 0 200 200" fill="currentColor" aria-hidden="true">
            <path d="M39.5,-58.6C50.6,-51.1,58.7,-39.3,64.4,-25.9C70.1,-12.5,73.4,2.6,69.9,16.1C66.4,29.6,56.1,41.5,43.7,50.9C31.3,60.3,16.7,67.2,0.9,66C-14.9,64.8,-29.8,55.5,-42.3,45.1C-54.8,34.7,-64.9,23.2,-68.4,9.4C-71.9,-4.4,-68.8,-20.5,-60.5,-33.1C-52.2,-45.7,-38.7,-54.8,-24.9,-61.4C-11.1,-68,3,-72.1,15.9,-70C28.8,-67.9,28.4,-66.1,39.5,-58.6Z" transform="translate(100 100)" />
          </svg>

          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-[0_6px_20px_rgba(37,99,235,0.15)]">
              {isSuccess
                ? <CheckCircle size={38} className="text-blue-600" strokeWidth={2.2} />
                : <Clock size={38} className="text-blue-600" strokeWidth={2.2} />}
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
              {isSuccess ? '¡Pedido confirmado!' : '¡Stock confirmado!'}
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">Código: <strong className="text-gray-900 font-bold">{order.ORDERCODE}</strong></p>
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm" style={{ background: status.bg, color: status.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.color }} />
                {status.label}
              </span>
            </div>
            {order.CUSTOMERNAME && (
              <p className="text-sm text-gray-500 mt-4">
                Hola <strong className="text-gray-900 font-semibold">{order.CUSTOMERNAME}</strong>, gracias por tu compra.
              </p>
            )}
          </div>
        </div>

        {(() => {
          const isRetiro = order.SHIPPINGAGENCY?.toUpperCase() === 'RETIRO EN TIENDA';
          const isReadyRetiro = (order.STATUS === 'paid' || order.STATUS === 'payment_confirmed') && isRetiro;
          const infoRaw = STATUS_DESCRIPTIONS[order.STATUS] || { title: 'Estado del pedido', desc: 'Tu pedido está siendo procesado.', alertType: 'info' };
          const info = isReadyRetiro 
            ? {
                title: 'Listo para retirar',
                desc: '¡Tu pedido ya está listo! Puedes pasar a retirarlo en nuestra tienda física.',
                alertType: 'indigo'
              }
            : infoRaw;
          let bgClass = 'bg-blue-50/80 border-blue-200 text-blue-800';
          let iconColor = 'text-blue-500';
          if (info.alertType === 'warning') {
            bgClass = 'bg-amber-50/80 border-amber-200 text-amber-800';
            iconColor = 'text-amber-600';
          } else if (info.alertType === 'success') {
            bgClass = 'bg-green-50/80 border-green-200 text-green-800';
            iconColor = 'text-green-600';
          } else if (info.alertType === 'indigo') {
            bgClass = isReadyRetiro 
              ? 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800' 
              : 'bg-indigo-50/80 border-indigo-200 text-indigo-800';
            iconColor = isReadyRetiro ? 'text-fuchsia-500' : 'text-indigo-600';
          } else if (info.alertType === 'danger') {
            bgClass = 'bg-red-50/80 border-red-200 text-red-800';
            iconColor = 'text-red-600';
          }
          return (
            <div className={`border rounded-3xl p-5 md:p-6 mb-8 flex items-start gap-4 transition-all duration-300 ${bgClass}`}>
              <div className={`p-3 rounded-2xl bg-white shadow-sm flex-shrink-0 ${iconColor}`}>
                {order.STATUS === 'pending' && <CheckCircle size={24} />}
                {order.STATUS === 'pending_stock' && <CheckCircle size={24} />}
                {order.STATUS === 'processing' && <CheckCircle size={24} />}
                {order.STATUS === 'paid' && <CheckCircle size={24} />}
                {order.STATUS === 'payment_review' && <Upload size={24} />}
                {order.STATUS === 'payment_confirmed' && <CheckCircle size={24} />}
                {order.STATUS === 'negotiation' && <MessageSquare size={24} />}
                {order.STATUS === 'shipped' && <Package size={24} />}
                {order.STATUS === 'delivered' && <Truck size={24} />}
                {order.STATUS === 'cancelled' && <AlertTriangle size={24} />}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base md:text-lg mb-1">{info.title}</h3>
                <p className="text-sm leading-relaxed opacity-90">{info.desc}</p>
              </div>
            </div>
          );
        })()}

        {/* ── Order Timeline (Stepper) ── */}
        {(() => {
          const isRetiro = order.SHIPPINGAGENCY?.toUpperCase() === 'RETIRO EN TIENDA';
          const useWholesaleTimeline = isWholesale;
          const steps = useWholesaleTimeline
            ? [
                { key: 'paid',               label: 'Stock Confirmado',  icon: <CheckCircle size={15} /> },
                { key: 'payment_expired',    label: 'Pago vencido',      icon: <Clock size={15} /> },
                { key: 'payment_review',     label: 'Revisando Pago',    icon: <Upload size={15} /> },
                { key: 'payment_confirmed',  label: 'Pago Confirmado',   icon: <CheckCircle size={15} /> },
                { key: 'shipped',            label: 'Embalado',          icon: <Package size={15} /> },
                { key: 'delivered',          label: 'Entregado',         icon: <Truck size={15} /> },
              ]
            : [
                { key: 'paid',               label: 'Stock Confirmado',    icon: <CheckCircle size={15} /> },
                { key: 'payment_expired',    label: 'Pago vencido',        icon: <Clock size={15} /> },
                { key: 'payment_review',     label: 'Revisando Pago',      icon: <Upload size={15} /> },
                { key: 'payment_confirmed',  label: 'Pago Confirmado',     icon: <CheckCircle size={15} /> },
                { key: 'shipped',            label: 'Embalado',            icon: <Package size={15} /> },
                { key: 'delivered',          label: 'Entregado',           icon: <Truck size={15} /> },
              ];
          const statusOrder = ['paid', 'payment_expired', 'payment_review', 'payment_confirmed', 'shipped', 'delivered'];
          const effStatus = ['pending', 'pending_stock', 'processing'].includes(order.STATUS) ? 'paid' : order.STATUS;
          const currentIdx = statusOrder.indexOf(effStatus);
          if (order.STATUS === 'cancelled') return null;
          return (
            <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-blue-100/40">
              {/* Desktop horizontal timeline */}
              <div className="hidden md:flex items-start justify-between relative">
                <div className="absolute top-4 left-6 right-6 h-0.5 bg-gray-100 z-0" />
                <div className="absolute top-4 left-6 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600 z-1 transition-all duration-500" style={{ width: currentIdx >= 0 ? `${Math.min(100, (currentIdx / (steps.length - 1)) * 100)}%` : '0%' }} />
                {steps.map((step, i) => {
                  const done = i <= currentIdx;
                  const active = i === currentIdx;
                  return (
                    <div key={step.key} className="flex flex-col items-center relative z-10 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${done ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-400'} ${active ? 'ring-4 ring-blue-100 scale-110' : ''}`}>
                        {step.icon}
                      </div>
                      <span className={`mt-2 text-[10px] text-center leading-tight max-w-[90px] ${active ? 'font-extrabold text-gray-900' : done ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Mobile vertical timeline */}
              <div className="flex md:hidden flex-col gap-0 relative pl-1">
                {(() => {
                  const stepColors: Record<string, { bg: string; border: string; text: string; ring: string; line: string; cardBg: string; cardBorder: string }> = {
                    pending:            { bg: '#f59e0b', border: '#f59e0b', text: '#fff', ring: '#fef3c7', line: '#fbbf24', cardBg: '#fffbeb', cardBorder: '#fde68a' },
                    processing:         { bg: '#3b82f6', border: '#3b82f6', text: '#fff', ring: '#dbeafe', line: '#60a5fa', cardBg: '#eff6ff', cardBorder: '#bfdbfe' },
                    paid:               { bg: '#10b981', border: '#10b981', text: '#fff', ring: '#d1fae5', line: '#34d399', cardBg: '#ecfdf5', cardBorder: '#a7f3d0' },
                    payment_expired:    { bg: '#e11d48', border: '#e11d48', text: '#fff', ring: '#ffe4e6', line: '#fb7185', cardBg: '#fff1f2', cardBorder: '#fecdd3' },
                    payment_review:     { bg: '#2563eb', border: '#2563eb', text: '#fff', ring: '#dbeafe', line: '#60a5fa', cardBg: '#eff6ff', cardBorder: '#bfdbfe' },
                    payment_confirmed:  { bg: '#16a34a', border: '#16a34a', text: '#fff', ring: '#dcfce7', line: '#22c55e', cardBg: '#f0fdf4', cardBorder: '#bbf7d0' },
                    assembling:         { bg: '#6366f1', border: '#6366f1', text: '#fff', ring: '#e0e7ff', line: '#818cf8', cardBg: '#eef2ff', cardBorder: '#c7d2fe' },
                    confirming_stock:   { bg: '#14b8a6', border: '#14b8a6', text: '#fff', ring: '#ccfbf1', line: '#2dd4bf', cardBg: '#f0fdfa', cardBorder: '#99f6e4' },
                    stock_confirmed:    { bg: '#65a30d', border: '#65a30d', text: '#fff', ring: '#ecfccb', line: '#84cc16', cardBg: '#f7fee7', cardBorder: '#bef264' },
                    packing:            { bg: '#d97706', border: '#d97706', text: '#fff', ring: '#fef3c7', line: '#f59e0b', cardBg: '#fffbeb', cardBorder: '#fde68a' },
                    preparing_shipping: { bg: '#f97316', border: '#f97316', text: '#fff', ring: '#ffedd5', line: '#fb923c', cardBg: '#fff7ed', cardBorder: '#fed7aa' },
                    ready_to_ship:      { bg: '#06b6d4', border: '#06b6d4', text: '#fff', ring: '#cffafe', line: '#22d3ee', cardBg: '#ecfeff', cardBorder: '#a5f3fc' },
                    shipped:            { bg: '#8b5cf6', border: '#8b5cf6', text: '#fff', ring: '#ede9fe', line: '#a78bfa', cardBg: '#f5f3ff', cardBorder: '#ddd6fe' },
                    delivered:          { bg: '#22c55e', border: '#22c55e', text: '#fff', ring: '#dcfce7', line: '#4ade80', cardBg: '#f0fdf4', cardBorder: '#bbf7d0' },
                    pending_stock:      { bg: '#f59e0b', border: '#f59e0b', text: '#fff', ring: '#fef3c7', line: '#fbbf24', cardBg: '#fffbeb', cardBorder: '#fde68a' },
                    waiting_payment:    { bg: '#3b82f6', border: '#3b82f6', text: '#fff', ring: '#dbeafe', line: '#60a5fa', cardBg: '#eff6ff', cardBorder: '#bfdbfe' },
                    partial_stock:      { bg: '#f97316', border: '#f97316', text: '#fff', ring: '#ffedd5', line: '#fb923c', cardBg: '#fff7ed', cardBorder: '#fed7aa' },
                    negotiation:        { bg: '#2563eb', border: '#2563eb', text: '#fff', ring: '#dbeafe', line: '#60a5fa', cardBg: '#eff6ff', cardBorder: '#bfdbfe' },
                  };
                  const doneColor = { bg: '#9ca3af', border: '#9ca3af', text: '#fff', line: '#d1d5db' };
                  return steps.map((step, i) => {
                    const done = i <= currentIdx;
                    const active = i === currentIdx;
                    const isLast = i === steps.length - 1;
                    const c = active ? stepColors[step.key] : done ? { ...doneColor, bg: stepColors[step.key]?.bg || '#9ca3af', border: stepColors[step.key]?.bg || '#9ca3af' } : null;
                    const stepColor = stepColors[step.key];
                    return (
                    <div key={step.key} className="flex gap-3 relative">
                      {/* Line + circle */}
                      <div className="flex flex-col items-center shrink-0" style={{ width: 36 }}>
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all shrink-0"
                          style={{
                            backgroundColor: active ? stepColor?.bg : done ? stepColor?.bg : '#fff',
                            borderColor: active ? stepColor?.border : done ? stepColor?.border : '#e5e7eb',
                            color: active || done ? '#fff' : '#d1d5db',
                            boxShadow: active ? `0 0 0 4px ${stepColor?.ring}` : 'none',
                            transform: active ? 'scale(1.15)' : 'scale(1)',
                          }}
                        >
                          {done && !active ? <CheckCircle size={18} /> : step.icon}
                        </div>
                        {!isLast && (
                          <div
                            className="w-0.5 flex-1 min-h-[32px] transition-colors"
                            style={{ backgroundColor: i < currentIdx ? (stepColors[steps[i].key]?.line || '#d1d5db') : '#e5e7eb' }}
                          />
                        )}
                      </div>
                      {/* Label card */}
                      <div className={`flex-1 pb-5 ${isLast ? 'pb-0' : ''}`}>
                        <div
                          className="px-3.5 py-2.5 rounded-2xl border transition-all"
                          style={{
                            backgroundColor: active ? stepColor?.cardBg : done ? '#f9fafb' : 'transparent',
                            borderColor: active ? stepColor?.cardBorder : done ? '#f3f4f6' : 'transparent',
                            boxShadow: active ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                          }}
                        >
                          <span
                            className="text-[13px] block font-bold"
                            style={{ color: active ? stepColor?.bg : done ? '#374151' : '#9ca3af' }}
                          >
                            {step.label}
                          </span>
                          {active && (
                            <span className="text-[10px] mt-0.5 block font-semibold flex items-center gap-1" style={{ color: stepColor?.bg }}>
                              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: stepColor?.bg }} />
                              Estado actual
                            </span>
                          )}
                          {done && !active && (
                            <span className="text-[10px] text-gray-400 mt-0.5 block font-medium">✓ Completado</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                  });
                })()}
              </div>
            </div>
          );
        })()}

        {/* ── Timer ── */}
        {showTimer && (
          <div className={`${order.STATUS === 'payment_expired' ? 'bg-rose-50/80 border-rose-200' : 'bg-amber-50/70 border-amber-200'} border rounded-3xl p-6 text-center shadow-sm`}>
            <p className={`text-sm font-semibold mb-2 ${order.STATUS === 'payment_expired' ? 'text-rose-800' : 'text-amber-800'}`}>
              {(() => {
                const isOverdue = order.STATUS === 'payment_expired';
                const exp = Number(isOverdue ? getOrderAutoCancelDeadline(order) : order.EXPIRESAT || 0);
                if (!exp) return '🔒 Tu stock está retenido. Tienes tiempo para pagar sin que se libere.';
                const diff = exp - Date.now();
                if (diff <= 0) return isOverdue ? 'El pedido se cancelará y el stock se devolverá en breve' : 'El plazo de pago ha vencido';
                if (isOverdue) return 'El pedido se cancela y el stock se devuelve en';
                const mins = Math.floor(diff / 60000);
                if (mins >= 60) {
                  return `Tienes hasta las ${new Date(exp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} para completar el pago`;
                }
                return `Tienes ${mins} minuto${mins !== 1 ? 's' : ''} para completar el pago`;
              })()}
            </p>
            {(order.STATUS === 'payment_expired' ? getOrderAutoCancelDeadline(order) : order.EXPIRESAT) && (
              <div className="my-2">
                <Timer expiresAt={Number(order.STATUS === 'payment_expired' ? getOrderAutoCancelDeadline(order) : order.EXPIRESAT)} />
              </div>
            )}
            <p className={`text-xs ${order.STATUS === 'payment_expired' ? 'text-rose-600' : 'text-amber-600'}`}>
              {order.STATUS === 'payment_expired'
                ? 'Puedes subir el comprobante hasta que se cumplan 24 horas desde la creación del pedido. Después se cancelará automáticamente.'
                : order.EXPIRESAT
                ? 'Si necesitas más tiempo, háblanos por WhatsApp para reactivar tu pedido.'
                : 'Una vez transferido, sube tu comprobante abajo para validarlo.'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {order.STATUS === 'payment_expired'
                ? 'La reserva sigue activa hasta que se cumplan 24 horas desde que hiciste el pedido.'
                : 'El pago debe llegar dentro de las 24 horas desde que se creó el pedido; al terminar ese plazo se cancela y se devuelve el stock reservado.'}
            </p>
          </div>
        )}

        {/* ── Bank details ── */}
        {isStockConfirmed && !uploaded && (
          <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-blue-100/40">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-extrabold text-gray-900">Datos de transferencia</h2>
              <button onClick={copyAll} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 border border-blue-100/30 rounded-xl text-xs font-bold text-blue-600 hover:bg-blue-100 transition">
                {copied === 'all' ? <><Check size={12} className="text-green-500" /> Copiado</> : <><Copy size={12} /> Copiar todo</>}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(BANK).map(([key, val]) => (
                <button key={key} onClick={() => copyField(key, val)}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-left transition ${copied === key ? 'bg-green-50/50 border-green-200' : 'bg-blue-50/20 border-blue-100/30 hover:bg-blue-50/50'}`}>
                  <div>
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{key}</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5">{val}</p>
                  </div>
                  <span className={`text-xs font-semibold flex items-center gap-1 ${copied === key ? 'text-green-600' : 'text-gray-400 group-hover:text-blue-600'}`}>
                    {copied === key ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 p-4 bg-blue-50/40 border border-blue-100/60 rounded-2xl">
              <p className="text-xs text-blue-900 leading-relaxed">
                ⚠️ Transfiere exactamente <strong className="text-sm font-extrabold">{formatPrice(order.TOTAL)}</strong> y sube el comprobante abajo para confirmar tu pedido.
              </p>
            </div>
          </div>
        )}

        {/* ── Comprobante de pago ── */}
        {(isStockConfirmed || order.STATUS === 'payment_review' || order.PAYMENTPROOFURL) && (
          <div className={`bg-white rounded-3xl p-5 md:p-6 shadow-sm border transition-all ${order.PAYMENTPROOFURL ? 'border-green-200 bg-green-50/10' : 'border-blue-100/40'}`}>
            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2 mb-4">
              <Upload size={18} className={order.PAYMENTPROOFURL ? 'text-green-600' : 'text-blue-600'} />
              Comprobante de pago
            </h2>
            
            {order.PAYMENTPROOFURL ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-700 text-sm font-bold bg-green-50/60 p-4 rounded-2xl border border-green-200">
                  <CheckCircle size={18} className="shrink-0" />
                  <span>Comprobante recibido y en proceso de verificación</span>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={() => {
                      const url = order.PAYMENTPROOFURL!;
                      if (isPdfUrl(url) || paymentProofIsPdf) {
                        window.open(url, '_blank');
                      } else {
                        setImageModal({ src: url, name: 'Comprobante de pago' });
                      }
                    }}
                    className="flex-1 py-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-250 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition duration-300"
                  >
                    <ExternalLink size={14} /> Ver comprobante actual
                  </button>
                  
                  {/* Permitir re-subir comprobante si aún no ha sido verificado como pagado */}
                  {(isStockConfirmed || order.STATUS === 'payment_review') && (
                    <label className={`flex-1 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-150 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition duration-300 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <input type="file" accept="image/*,.pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
                      <RefreshCw size={14} className={uploading ? 'animate-spin' : ''} />
                      <span>{uploading ? 'Subiendo...' : 'Cambiar comprobante'}</span>
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">Por favor, sube una captura o archivo PDF de tu transferencia.</p>
                <label className={`block ${uploading ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input type="file" accept="image/*,.pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
                  <div className="border-2 border-dashed border-blue-200 hover:border-blue-400 rounded-2xl p-6 text-center bg-blue-50/10 transition">
                    {uploading ? (
                      <p className="text-sm font-semibold text-blue-600 animate-pulse">Subiendo comprobante...</p>
                    ) : (
                      <>
                        <Upload size={32} className="text-blue-400 mx-auto mb-2" />
                        <p className="text-sm font-bold text-blue-700">Haz click para subir comprobante</p>
                        <p className="text-xs text-gray-400 mt-0.5">Formatos: JPG, PNG, PDF</p>
                      </>
                    )}
                  </div>
                </label>
              </>
            )}
          </div>
        )}

        {/* ── WhatsApp Link Section (hidden) ──
        <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-blue-100/40 mb-4">
          <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2 mb-2">
            <MessageSquare size={18} className="text-[#25D366]" /> Recibir notificaciones
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Conecta tu pedido a nuestro WhatsApp para recibir actualizaciones automáticas. Si escribiste mal tu número en el carrito, haz click aquí para corregirlo.
          </p>
          <a
            href={`https://wa.me/56954592656?text=vincular_pedido%20${order.$id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-2xl font-bold text-sm transition shadow-sm"
          >
            <MessageSquare size={16} /> Conectar WhatsApp
          </a>
        </div>
        */}

        {/* ── Order items ── */}
        <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-blue-100/40">
          <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2 mb-4">
            <Package size={18} className="text-blue-600" /> Detalle del pedido
          </h2>
          <div className="divide-y divide-blue-50/40 space-y-3 pb-4">
            {items.map((item, i) => {
              const isMissing = !!(item as any).missing;
              const isReplaced = !!(item as any).replaced;

              // En modo negociación, si hay algún item marcado como faltante o reemplazado,
              // ocultamos todos los que estén disponibles de forma normal.
              const hasNegotiations = order?.STATUS === 'negotiation' && items.some(x => x.missing || x.replaced);
              if (hasNegotiations && !isMissing && !isReplaced) return null;

              const hasDiscount = item.originalPrice && item.originalPrice > item.price;
              const discountPct = hasDiscount ? Math.round(((item.originalPrice! - item.price) / item.originalPrice!) * 100) : 0;
              return (
                <div key={i} className={`pt-3 first:pt-0 ${isMissing ? 'bg-red-50/30 p-3 rounded-2xl border border-red-100' : ''}`}>
                  <div className="flex gap-3 items-start">
                    {/* Imagen de Producto */}
                    <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-blue-100/30 overflow-hidden shrink-0 flex items-center justify-center">
                      {item.img ? (
                        <img src={resolveStorageImageUrl(item.img)} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package size={20} className="text-gray-300" />
                      )}
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold leading-tight ${isMissing ? 'text-red-900' : 'text-gray-800'}`}>
                        {item.name}
                      </p>
                      
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-gray-400">
                          Cantidad: <strong className="text-gray-800 font-bold">{item.qty}</strong> · {formatPrice(item.price)} c/u
                        </span>
                        {hasDiscount && (
                          <>
                            <span className="text-xs line-through text-gray-300">{formatPrice(item.originalPrice!)}</span>
                            <span className="px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-extrabold">-{discountPct}%</span>
                          </>
                        )}
                      </div>

                      {isMissing && (
                        <div className="text-red-600 text-xs font-bold mt-2 flex items-center gap-1">
                          <AlertTriangle size={13} /> Producto agotado - requiere reemplazo
                        </div>
                      )}
                      {isReplaced && (() => {
                        const origItem = (item as any).originalItem;
                        if (!origItem) return (
                          <div className="text-green-600 text-xs font-bold mt-1 flex items-center gap-1">
                            <CheckCircle size={13} /> Reemplazado
                          </div>
                        );
                        
                        const originalPriceTotal = (origItem.price || 0) * item.qty;
                        const replacementPriceTotal = item.price * item.qty;
                        const difference = originalPriceTotal - replacementPriceTotal;
                        
                        return (
                          <div className="mt-1 space-y-1">
                            <div className="text-green-600 text-xs font-bold flex items-center gap-1">
                              <CheckCircle size={13} /> Reemplazado
                            </div>
                            <div className="text-[11px] text-gray-500 bg-gray-50 p-2.5 rounded-xl border border-gray-100 inline-block">
                              <p className="font-semibold text-gray-700">Detalles del reemplazo:</p>
                              <p className="mt-0.5">Producto original: <span className="font-bold text-gray-600">{origItem.name}</span> ({formatPrice(origItem.price)})</p>
                              {difference > 0 ? (
                                <p className="text-orange-600 font-bold mt-0.5">
                                  Diferencia en contra: {formatPrice(difference)}
                                </p>
                              ) : difference < 0 ? (
                                <p className="text-emerald-600 font-bold mt-0.5">
                                  Saldo a favor: {formatPrice(Math.abs(difference))}
                                </p>
                              ) : (
                                <p className="text-gray-500 font-bold mt-0.5">Sin diferencia de precio</p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      {(item as any).note && (
                        <div className="mt-2 text-xs bg-amber-50 text-amber-800 p-2.5 rounded-xl border border-amber-100/60 flex items-start gap-1">
                          <span className="font-bold">💬 Nota:</span>
                          <span>{(item as any).note}</span>
                        </div>
                      )}
                      {isMissing && (canChooseReplacement || canCustomerModify) && (
                        <button
                          onClick={() => handleOpenReplacementModal(item, i)}
                          className="mt-2.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-blue-100 transition"
                        >
                          <RefreshCw size={12} /> Elegir reemplazo
                        </button>
                      )}
                    </div>
                    
                    <p className={`text-sm font-extrabold ${isMissing ? 'text-red-900' : 'text-gray-900'} shrink-0 pt-0.5`}>
                      {formatPrice(item.total)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {order.STATUS === 'negotiation' && items.some(x => x.missing) && (
            <div className="mt-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-sky-50 border border-blue-200 rounded-2xl p-5 space-y-4">
              {/* Yaxbot AI message */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-lg shrink-0 shadow-md">
                  🤖
                </div>
                <div className="flex-1">
                  <p className="font-black text-blue-900 text-sm">¡Hola! Soy Yaxbot, tu gato de la suerte 🐾</p>
                  <p className="text-blue-700 text-xs mt-1 leading-relaxed">
                    Veo que algunos productos de tu pedido no están disponibles. Pero no te preocupes, ¡yo te ayudo! Tienes <span className="font-bold">2 opciones</span>:
                  </p>
                </div>
              </div>

              {/* Option 1: Quick replacement */}
              <div className="bg-white/80 rounded-xl p-3.5 border border-blue-100">
                <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-black">1</span>
                  Reemplazo rápido con IA
                </p>
                <p className="text-blue-600 text-[11px] mt-1 ml-6 leading-relaxed">
                  Te recomiendo el mejor producto según tu categoría y el que más se parece al que te falta. ¡Solo dale al botón "Elegir reemplazo" abajo!
                </p>
              </div>

              {/* Option 2: Canje */}
              <div className="bg-white/80 rounded-xl p-3.5 border border-indigo-100">
                <p className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black">2</span>
                  Canjear tu saldo a favor
                </p>
                <p className="text-indigo-600 text-[11px] mt-1 ml-6 leading-relaxed">
                  Usa tu crédito para elegir otros productos de la tienda con un <span className="font-bold">20% de descuento extra</span>. Y si no gastas todo, el sobrante se descontará automáticamente en tu próximo pedido. 🎁
                </p>
                <a href="/canje" className="mt-2.5 ml-6 inline-flex px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-xs rounded-xl shadow-lg hover:brightness-105 active:scale-95 transition-all whitespace-nowrap">
                  Ir a canjear →
                </a>
              </div>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4 flex flex-col gap-2 text-sm text-gray-500">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-semibold text-gray-800">{formatPrice(order.SUBTOTAL)}</span>
            </div>
            <div className="flex justify-between">
              <span>Envío</span>
              <span className="font-bold text-orange-600">{order.SHIPPINGCOST > 0 ? formatPrice(order.SHIPPINGCOST) : 'Pagar contraentrega'}</span>
            </div>
            {order.SHIPPINGCOST === 0 && order.SHIPPINGAGENCY !== 'RETIRO EN TIENDA' && (
              <div className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mt-1">
                ℹ️ El costo de envío se paga al recibir el pedido (contraentrega). No se cobra al momento de la compra.
              </div>
            )}
            {order.DISCOUNT && order.DISCOUNT > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-600 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> Descuento {order.COUPONCODE && <span className="font-mono text-xs">({order.COUPONCODE})</span>}
                </span>
                <span className="text-emerald-600 font-medium">-{formatPrice(order.DISCOUNT)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-gray-950 pt-3 border-t border-gray-150 mt-2">
              <span>Total</span>
              <span>{formatPrice(order.TOTAL)}</span>
            </div>
          </div>
        </div>

        {/* ── Customer actions: editar/anular (máximo 2 veces) ── */}
        {order.STATUS !== 'cancelled' && (
          <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-gray-900">Gestionar pedido</h3>
                <p className="text-xs text-gray-400 mt-0.5">Modificaciones disponibles antes del empaque.</p>
              </div>
              {editOpen && (
                <button onClick={closeEditor}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition flex items-center gap-1 self-start sm:self-auto">
                  <X size={14} /> Cerrar editor
                </button>
              )}
            </div>

            {!canCustomerModify && (
              <p className="text-xs text-gray-400">
                Este pedido se encuentra en preparación o ya fue despachado, por lo que no permite modificaciones.
              </p>
            )}

            {canCustomerModify && !editOpen && (
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={openEditor}
                  className="flex-1 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition duration-300">
                  <Pencil size={14} /> Modificar productos
                </button>
                <button onClick={handleCancelOrder} disabled={cancelling}
                  className="flex-1 py-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-100 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition duration-300 disabled:opacity-50">
                  <Trash2 size={14} /> {cancelling ? 'Anulando...' : 'Anular pedido'}
                </button>
              </div>
            )}

            {editOpen && (
              <div className="space-y-4 mt-2">
                {editError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-semibold text-red-700">
                    {editError}
                  </div>
                )}

                {/* Items editor */}
                <div className="space-y-2.5">
                  {draftItems.map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-3 p-3 border border-gray-100 rounded-2xl bg-gray-50/50">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            const src = it.img ? resolveStorageImageUrl(it.img) : '';
                            if (src) setImageModal({ src, name: it.name });
                          }}
                          className="w-11 h-11 rounded-xl bg-white overflow-hidden shrink-0 border border-gray-100 cursor-pointer"
                        >
                          {it.img ? (
                            <img src={resolveStorageImageUrl(it.img)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100">
                              <Package size={18} className="text-gray-400" />
                            </div>
                          )}
                        </button>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{it.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatPrice(it.price)} · <span className="font-semibold text-gray-700">{formatPrice(it.price * it.qty)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center border border-gray-200 rounded-xl bg-white overflow-hidden">
                          <button onClick={() => setQty(it.id, (it.qty || 1) - 1)} disabled={(it.qty || 1) <= 1 || loadingStocks}
                            className="w-8 h-8 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 text-gray-500">
                            <Minus size={12} />
                          </button>
                          <span className="w-8 text-center text-xs font-bold text-gray-800">{it.qty}</span>
                          <button onClick={() => setQty(it.id, (it.qty || 1) + 1)} disabled={loadingStocks}
                            className="w-8 h-8 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                            <Plus size={12} />
                          </button>
                        </div>
                        <button onClick={() => removeDraft(it.id)}
                          className="p-2 border border-red-100 rounded-xl hover:bg-red-50 text-red-600 transition">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add products */}
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-bold text-gray-800 flex items-center gap-1 mb-2">
                    <Search size={13} /> Agregar productos
                  </p>
                  <div className="flex gap-2">
                    <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Buscar producto..."
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:border-blue-300"
                    />
                    <button onClick={searchProducts} disabled={searchingProducts}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1">
                      <Search size={13} /> Buscar
                    </button>
                  </div>

                  {productResults.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {productResults.map(p => {
                        const stock = Number((p as any).STOCK ?? NaN);
                        const hasStock = Number.isFinite(stock) ? stock > 0 : true;
                        return (
                          <button
                            key={p.$id}
                            onClick={() => { if (hasStock) addProductToDraft(p); }}
                            disabled={!hasStock}
                            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 text-left disabled:opacity-50 transition"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 overflow-hidden shrink-0">
                                {p.IMAGEURL ? (
                                  <img src={resolveStorageImageUrl(p.IMAGEURL)} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center"><Package size={15} className="text-gray-300" /></div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-800 truncate">{p.NAME}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">Stock: {Number.isFinite(stock) ? stock : '—'}</p>
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              <span className="text-xs font-extrabold text-gray-900">{formatPrice((p.CURRENTPRICE ?? p.PRICE ?? 0) as number)}</span>
                              <span className="text-[10px] font-bold text-blue-600">+ Agregar</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Summary & Save */}
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span>Nuevo subtotal</span>
                    <span>{formatPrice(computeSubtotal(draftItems))}</span>
                  </div>
                  <button onClick={handleSaveEdits} disabled={savingEdit}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-sm transition duration-300 disabled:opacity-50">
                    {savingEdit ? 'Guardando...' : 'Confirmar cambios en pedido'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Customer Replacement Modal */}
        {customerReplacingIdx !== null && (
          <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onMouseDown={() => { if (!loadingSuggestions) { setCustomerReplacingIdx(null); setSuggestions([]); } }}
          >
            <div
              className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh] border border-gray-150"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-gray-900 text-sm">Selecciona una alternativa</h3>
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[280px]">
                    Reemplazo para: {items[customerReplacingIdx]?.name}
                  </p>
                </div>
                <button 
                  onClick={() => { setCustomerReplacingIdx(null); setSuggestions([]); }}
                  disabled={loadingSuggestions}
                  className="text-gray-400 hover:text-gray-600 transition"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1 space-y-3">
                {replacingError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-semibold text-red-700">
                    {replacingError}
                  </div>
                )}

                {loadingSuggestions ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : suggestions.length === 0 ? (
                  <p className="text-center text-gray-400 text-xs py-8">No hay alternativas sugeridas en stock.</p>
                ) : (
                  <div className="space-y-2">
                    {suggestions.map((p) => {
                      let price = p.CURRENTPRICE ?? p.PRICE ?? 0;
                      const originalItem = items[customerReplacingIdx!];
                      const hasDiscount = originalItem?.originalPrice && originalItem.originalPrice > originalItem.price;
                      if (hasDiscount) {
                        const discountPct = (originalItem.originalPrice! - originalItem.price) / originalItem.originalPrice!;
                        price = Math.round(price * (1 - discountPct));
                      }
                      const origPrice = originalItem?.price || 0;
                      const diff = price - origPrice;
                      const diffText = diff === 0 
                        ? 'Mismo precio' 
                        : diff > 0 
                          ? `+$${diff.toLocaleString()} de diferencia`
                          : `-$${Math.abs(diff).toLocaleString()} de diferencia`;
                      return (
                        <div
                          key={p.$id}
                          className="flex items-center justify-between gap-3 p-3 bg-gray-50 border border-gray-100 rounded-2xl hover:bg-gray-100/55 transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                              {p.IMAGEURL ? (
                                <img src={resolveStorageImageUrl(p.IMAGEURL)} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Package size={18} className="text-gray-300" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-800 truncate">{p.NAME}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                Precio: <span className="font-semibold text-gray-800">{formatPrice(price)}</span> · <span className="font-medium text-blue-600">{diffText}</span>
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleCustomerReplace(p)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shrink-0 transition"
                          >
                            Elegir
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Fullscreen Image Lightbox */}
        {imageModal && (() => {
          const isPdf = isPdfUrl(imageModal.src) || (imageModal.src === order?.PAYMENTPROOFURL ? paymentProofIsPdf : (imageModal.src === order?.SHIPPINGPROOFURL ? shippingProofIsPdf : false));
          return (
            <div
              className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
              onClick={() => setImageModal(null)}
            >
              <div
                className="w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl relative"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b border-gray-150 flex items-center justify-between bg-gray-50">
                  <p className="text-xs font-bold text-gray-700 truncate pr-4">{imageModal.name}</p>
                  <div className="flex gap-2">
                    <a href={imageModal.src} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-xl bg-blue-50 border border-blue-100 hover:bg-blue-100 text-blue-700 transition flex items-center gap-1 text-xs font-bold no-underline">
                      <ExternalLink size={14} /> Abrir archivo
                    </a>
                    <button onClick={() => setImageModal(null)} className="p-1 px-3 rounded-xl bg-white border border-gray-250 hover:bg-gray-100 text-gray-600 transition flex items-center gap-1 text-xs font-bold">
                      <X size={14} /> Cerrar
                    </button>
                  </div>
                </div>
                <div className="bg-black/95 flex items-center justify-center min-h-[40vh] max-h-[80vh] overflow-hidden p-6 text-white">
                  {isPdf ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-12">
                      <FileText size={64} className="text-blue-600 animate-pulse" />
                      <p className="text-sm font-semibold text-gray-300">Este archivo es un comprobante en formato PDF</p>
                      <a href={imageModal.src} target="_blank" rel="noreferrer" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-bold text-xs flex items-center gap-2 no-underline">
                        <ExternalLink size={14} /> Abrir y ver PDF en nueva pestaña
                      </a>
                    </div>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={imageModal.src} alt="" className="max-w-full max-h-[78vh] object-contain" />
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Shipping info ── */}
        <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-blue-100/40">
          <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2 mb-4">
            <MapPin size={18} className="text-blue-600" /> Datos de envío
          </h2>
          <div className="flex flex-col gap-1.5 text-sm text-gray-600">
            <p className="font-bold text-gray-900 text-base">{order.CUSTOMERNAME}</p>
            <p>{order.CUSTOMERPHONE}{order.CUSTOMEREMAIL ? ` · ${order.CUSTOMEREMAIL}` : ''}</p>
            <p>{isRetiro && isVendorOrder && vendorBranding?.address ? vendorBranding.address : order.ADDRESS}</p>
            <p>{order.COMUNA}, {order.REGION}</p>
            {isRetiro && isVendorOrder && vendorBranding?.address && (
              <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mt-1">
                Retiro en la tienda: {vendorBranding.address}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 font-semibold text-blue-600 text-xs">
              <Truck size={14} />
              <span>{order.SHIPPINGAGENCY}</span>
              {order.AGENCYCHANGED && (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100">Modificada</span>
              )}
            </div>

            {(order as any).TRACKINGNUMBER && (
              <div className="mt-4 p-4 bg-violet-50/50 border border-violet-100 rounded-2xl flex flex-col gap-1">
                <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider">Número de Seguimiento</p>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-base font-bold text-violet-800 break-all select-all">
                    {(order as any).TRACKINGNUMBER}
                  </p>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText((order as any).TRACKINGNUMBER);
                      alert('¡Número de seguimiento copiado!');
                    }}
                    className="p-2 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-xl transition shrink-0"
                    title="Copiar número"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  </button>
                </div>
              </div>
            )}

            {canEditBeforePayment && (
              shippingEditOpen ? (
                <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <p className="text-xs font-bold text-slate-900">Editar datos de envío</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      ['rut', 'RUT'], ['email', 'Email'], ['address', 'Dirección'],
                      ['comuna', 'Comuna'], ['region', 'Región'], ['additionalInfo', 'Información adicional'],
                    ].map(([key, label]) => (
                      <label key={key} className={key === 'address' || key === 'additionalInfo' ? 'sm:col-span-2 text-[11px] font-bold text-slate-600' : 'text-[11px] font-bold text-slate-600'}>
                        {label}
                        <input
                          value={shippingDraft[key as keyof typeof shippingDraft]}
                          onChange={e => setShippingDraft(prev => ({ ...prev, [key]: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-300"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSaveShipping} disabled={savingShipping} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
                      {savingShipping ? 'Guardando...' : 'Guardar datos'}
                    </button>
                    <button onClick={() => setShippingEditOpen(false)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setShippingDraft({ rut: order.CUSTOMERRUT || '', email: order.CUSTOMEREMAIL || '', address: order.ADDRESS || '', comuna: order.COMUNA || '', region: order.REGION || '', additionalInfo: order.ADDITIONALINFO || '' });
                    setShippingEditOpen(true);
                  }}
                  className="mt-3.5 px-3 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-slate-100 transition self-start"
                >
                  <Pencil size={12} /> Editar datos de envío
                </button>
              )
            )}

            {/* Agency change option */}
            {canEditBeforePayment && !order.AGENCYCHANGED && (
              showAgencyChange ? (
                <div className="mt-4 p-4 bg-blue-50/20 border border-blue-100 rounded-2xl">
                  <p className="text-xs font-bold text-blue-900 mb-2">Selecciona nueva agencia de envío</p>
                  <select value={selectedAgency} onChange={e => setSelectedAgency(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-200 rounded-xl text-xs font-bold text-blue-700 bg-white mb-3 outline-none focus:ring-2 focus:ring-blue-300">
                    <option value="">Seleccionar agencia</option>
                    {agencies
                      .filter(a => a.name.trim().toUpperCase() !== 'RETIRO EN TIENDA')
                      .map(a => (
                        <option key={a.name} value={a.name}>{a.name}</option>
                      ))}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={handleChangeAgency} disabled={!selectedAgency || savingAgency}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-blue-700 disabled:opacity-50 transition">
                      <RefreshCw size={13} />
                      {savingAgency ? 'Guardando...' : 'Confirmar'}
                    </button>
                    <button onClick={() => setShowAgencyChange(false)}
                      className="px-4 py-2 bg-white border border-blue-100 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-50/50 transition">
                      Cancelar
                    </button>
                  </div>
                  <p className="text-[10px] text-blue-400 mt-2">⚠ Solo puedes cambiar la agencia 1 vez.</p>
                </div>
              ) : (
                <button onClick={() => { setShowAgencyChange(true); setSelectedAgency(order.SHIPPINGAGENCY || ''); }}
                  className="mt-3.5 px-3 py-1.5 bg-blue-50/50 text-blue-600 border border-blue-100 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-blue-100/50 transition self-start">
                  <RefreshCw size={12} /> Cambiar agencia de despacho
                </button>
              )
            )}

            {order.SHIPPINGPROOFURL && (() => {
              const url = order.SHIPPINGPROOFURL!;
              const isPdf = isPdfUrl(url) || shippingProofIsPdf;
              return (
                <div className="mt-5 pt-5 border-t border-gray-100">
                  <p className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
                    <Truck className="w-4 h-4 text-blue-600" /> Comprobante de envío
                  </p>
                  {isPdf ? (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 font-medium">El comprobante de despacho se encuentra disponible en formato PDF:</p>
                      <button 
                        onClick={() => window.open(url, '_blank')}
                        className="w-full py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 rounded-2xl transition duration-300 font-semibold flex items-center justify-center gap-2 text-xs"
                      >
                        <FileText size={15} /> Ver comprobante de despacho (PDF)
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500 font-medium">Haz click en la imagen para ampliarla:</p>
                      <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 max-h-60 flex items-center justify-center cursor-pointer hover:opacity-95 transition"
                        onClick={() => setImageModal({ src: url, name: 'Comprobante de envío' })}>
                        <img src={url} alt="Comprobante de despacho" className="max-w-full max-h-60 object-contain p-1" />
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white rounded-lg px-2.5 py-1 text-[10px] font-bold flex items-center gap-1">
                          <Search size={10} /> Ampliar imagen
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Purchase Protection */}
        <div className="bg-green-50/20 border border-green-200 rounded-3xl p-4 flex items-start gap-3">
          <Shield size={18} className="text-green-600 shrink-0 mt-0.5" />
          <p className="text-xs text-green-800 leading-relaxed">
            <strong>Compra Protegida</strong> — Si tienes algún problema con la recepción de tu pedido, te garantizamos la devolución de tu dinero o reemplazo de productos.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {/* Download PDF */}
          <button onClick={() => generateOrderPdf(order, items, undefined, undefined, vendorBranding || undefined)}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white border border-blue-600 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs transition shadow-sm">
            <FileText size={16} /> Imprimir / guardar pedido en PDF
          </button>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/productos" className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white text-center rounded-2xl font-bold text-xs transition no-underline block">
              Seguir comprando
            </Link>
            <Link href="/cuenta/pedidos" className="flex-1 py-3 bg-white hover:bg-gray-50 text-blue-600 text-center rounded-2xl font-bold text-xs transition border border-blue-100 no-underline block">
              Ver mis pedidos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
