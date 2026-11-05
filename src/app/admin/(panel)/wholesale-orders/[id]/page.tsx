'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getServices, getFirebaseConfig, WHOLESALE_ORDERS_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/firebase-admin-compat';
import { MEDIA_BUCKET_ID } from '@/lib/firebase-compat';
import { MODULE_ACCESS } from '@/lib/module-access';
import { Query, ID } from '@/lib/firebase-compat';
import {
  ArrowLeft, Package, User, MapPin, Clock, FileText,
  Phone, Mail, Hash, Save, Check, AlertTriangle, ExternalLink,
  Image as ImageIcon, MessageSquare, DollarSign, Printer, Send, Ban,
  StickyNote, MapPinned, Receipt, Copy, Truck, Trash2
} from 'lucide-react';
import { getWarehouseLocationFromFeatures, getSkuFromFeatures, getBarcodeFromFeatures, type ProductWarehouseLocation } from '@/lib/product-features';

interface WholesaleOrder {
  $id: string;
  USERID: string;
  ITEMS: string;
  CUSTOMERNAME: string;
  CUSTOMERRUT?: string;
  CUSTOMERPHONE: string;
  CUSTOMEREMAIL: string;
  REGION?: string;
  COMUNA?: string;
  ADDRESS: string;
  ADDITIONALINFO?: string;
  SHIPPINGAGENCY?: string;
  SUBTOTAL: number;
  TOTAL: number;
  REQCODE: string;
  STATUS: string;
  CREATEDAT: number;
  PAYMENTPROOFURL?: string;
  SHIPPINGPROOFURL?: string;
  CUSTOMERNOTE?: string;
  ADMINNOTES?: string;
  $createdAt: string;
  $updatedAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string; icon: string }> = {
  pending:            { label: 'Stock Confirmado',            bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400', icon: '�' },
  pending_stock:      { label: 'Stock Confirmado',            bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400', icon: '📦' },
  processing:         { label: 'Stock Confirmado',            bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400', icon: '�' },
  paid:               { label: 'Stock Confirmado',  bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400', icon: '📦' },
  payment_review:     { label: 'Revisando Pago',      bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-400',    icon: '📄' },
  payment_confirmed:  { label: 'Pago Confirmado',   bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200',   dot: 'bg-green-400',   icon: '✅' },
  negotiation:        { label: 'Negociando',          bg: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200',    dot: 'bg-pink-400',    icon: '🤝' },
  shipped:            { label: 'Embalado',           bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  dot: 'bg-violet-400',  icon: '�' },
  delivered:          { label: 'Entregado a Agencia', bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200',   dot: 'bg-green-400',   icon: '🚚' },
  cancelled:          { label: 'Cancelado',            bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-400',     icon: '❌' },
};

const STATUS_FLOW = ['pending', 'paid', 'payment_review', 'payment_confirmed', 'shipped', 'delivered'];

const STATUS_HEX: Record<string, string> = {
  pending: '#10b981', pending_stock: '#10b981', processing: '#10b981', paid: '#10b981', payment_review: '#2563eb', payment_confirmed: '#059669',
  negotiation: '#ec4899', shipped: '#8b5cf6', delivered: '#22c55e', cancelled: '#ef4444',
};

// Icon paths (Material-style) for the status stepper nodes
const STEP_ICON_PATHS: Record<string, string> = {
  pending:            'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.5 5H11v6l5.25 3.15.75-1.23-4.5-2.67V7z',
  pending_stock:      'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  confirming_stock:   'M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z',
  stock_confirmed:    'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  waiting_payment:    'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
  processing:         'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
  paid:               'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  payment_confirmed:  'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  payment_review:     'M14 2H6c-1.1 0-1.99.9-1.99 2L4 18c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  assembling:         'M12 2l-5.5 9h11z M17.5 17.5m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0 M3 13.5h8v8H3z',
  preparing_shipping: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z',
  ready_to_ship:      'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
  shipped:            'M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zm-.5 1.5 1.96 2.5H17V9.5h2.5zM6 18c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm12 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z',
  delivered:          'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
};

const STATUS_DESC: Record<string, string> = {
  pending:            'El stock del pedido fue confirmado. Pendiente de pago.',
  pending_stock:      'El stock del pedido fue confirmado. Pendiente de pago.',
  processing:         'El stock del pedido fue confirmado. Pendiente de pago.',
  paid:               'El stock del pedido fue confirmado. Pendiente de pago.',
  payment_review:     'Se recibió el comprobante de pago, hay que verificarlo.',
  payment_confirmed:  'El pago fue confirmado y verificado correctamente.',
  negotiation:        'Faltan productos, se está negociando con el cliente.',
  shipped:            'El pedido salió de la tienda con la agencia.',
  delivered:          'El pedido fue entregado a la agencia de transporte.',
  cancelled:          'El pedido fue cancelado.',
};

const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

function isPdfUrl(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.toLowerCase();
  return clean.endsWith('.pdf') || clean.includes('.pdf') || clean.includes('ext=pdf');
}

export default function WholesaleOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<WholesaleOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [productLocations, setProductLocations] = useState<Record<string, ProductWarehouseLocation>>({});
  const [productSkus, setProductSkus] = useState<Record<string, string>>({});
  const [productBarcodes, setProductBarcodes] = useState<Record<string, string>>({});
  const [productStocks, setProductStocks] = useState<Record<string, number>>({});
  const [proofOpen, setProofOpen] = useState(false);
  const [paymentProofIsPdf, setPaymentProofIsPdf] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [uploadingShippingProof, setUploadingShippingProof] = useState(false);
  const [shippingProofOpen, setShippingProofOpen] = useState(false);
  const [shippingProofIsPdf, setShippingProofIsPdf] = useState(false);
  const [isNotifyModalOpen, setIsNotifyModalOpen] = useState(false);
  
  const originalItemsRef = useRef<any[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const doc = await databases.getDocument(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, orderId);
      const o = doc as unknown as WholesaleOrder;
      setOrder(o);
      setAdminNotes(o.ADMINNOTES || '');

      try {
        if (originalItemsRef.current === null && o.ITEMS) {
          originalItemsRef.current = JSON.parse(o.ITEMS);
        }
      } catch (e) {}

      if (o.PAYMENTPROOFURL) {
        if (isPdfUrl(o.PAYMENTPROOFURL)) setPaymentProofIsPdf(true);
        else {
          fetch(o.PAYMENTPROOFURL, { method: 'HEAD' })
            .then(res => setPaymentProofIsPdf(!!res.headers.get('content-type')?.includes('application/pdf')))
            .catch(() => setPaymentProofIsPdf(false));
        }
      }
      
      if (o.SHIPPINGPROOFURL) {
        if (isPdfUrl(o.SHIPPINGPROOFURL)) setShippingProofIsPdf(true);
        else {
          fetch(o.SHIPPINGPROOFURL, { method: 'HEAD' })
            .then(res => setShippingProofIsPdf(!!res.headers.get('content-type')?.includes('application/pdf')))
            .catch(() => setShippingProofIsPdf(false));
        }
      }

      let items: { id?: string }[] = [];
      try { items = JSON.parse(o.ITEMS || '[]'); } catch {}
      const productIds = items.map(it => it.id).filter((id): id is string => Boolean(id));
      if (productIds.length > 0) {
        const stocks: Record<string, number> = {};
        const locs: Record<string, ProductWarehouseLocation> = {};
        const skus: Record<string, string> = {};
        const barcodes: Record<string, string> = {};
        try {
          const productsResp = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
            Query.equal('$id', productIds),
            Query.limit(productIds.length),
          ]);
          for (const product of productsResp.documents) {
            const d = product as { $id: string; STOCK?: number; FEATURES?: string; TAGS?: string; jumpseller_id?: string; sku?: string; section?: number; barcode?: string };
            const pid = d.$id;
            stocks[pid] = d.STOCK || 0;
            locs[pid] = getWarehouseLocationFromFeatures(d.FEATURES, d.section);
            skus[pid] = getSkuFromFeatures(d.FEATURES, d.TAGS, d.jumpseller_id, d.sku);
            barcodes[pid] = getBarcodeFromFeatures(d.FEATURES, d.barcode);
          }
        } catch {}
        setProductStocks(stocks);
        setProductLocations(locs);
        setProductSkus(skus);
        setProductBarcodes(barcodes);
      } else {
        setProductLocations({});
      }
    } catch (e: any) {
      setError(e.message || 'Error al cargar el pedido');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (order?.PAYMENTPROOFURL) {
      if (isPdfUrl(order.PAYMENTPROOFURL)) {
        setPaymentProofIsPdf(true);
      } else {
        fetch(order.PAYMENTPROOFURL, { method: 'HEAD' })
          .then(res => setPaymentProofIsPdf(!!res.headers.get('content-type')?.includes('application/pdf')))
          .catch(() => setPaymentProofIsPdf(false));
      }
    } else {
      setPaymentProofIsPdf(false);
    }
  }, [order?.PAYMENTPROOFURL]);

  const handleAdminUploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !order) return;
    setUploadingProof(true);
    try {
      const { storage, databases } = getServices();
      const { databaseId, endpoint, projectId } = getFirebaseConfig();
      const fileId = ID.unique();
      await storage.createFile(MEDIA_BUCKET_ID, fileId, file);
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const url = `${endpoint}/storage/buckets/${MEDIA_BUCKET_ID}/files/${fileId}/view?project=${projectId}&ext=${ext}`;
      await databases.updateDocument(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, orderId, {
        PAYMENTPROOFURL: url,
        STATUS: ['pending', 'pending_stock', 'processing', 'paid', 'payment_review'].includes(order.STATUS) ? 'payment_review' : order.STATUS,
      });
      await load();
    } catch (err: any) {
      alert('Error al subir comprobante: ' + (err?.message || err));
    } finally {
      setUploadingProof(false);
    }
  };

  const handleAdminUploadShippingProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !order) return;
    setUploadingShippingProof(true);
    try {
      const { storage, databases } = getServices();
      const { databaseId, endpoint, projectId } = getFirebaseConfig();
      const fileId = ID.unique();
      await storage.createFile(MEDIA_BUCKET_ID, fileId, file);
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const url = `${endpoint}/storage/buckets/${MEDIA_BUCKET_ID}/files/${fileId}/view?project=${projectId}&ext=${ext}`;

      await databases.updateDocument(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, orderId, {
        SHIPPINGPROOFURL: url,
        UPDATEDAT: Date.now(),
      });
      setOrder(prev => prev ? { ...prev, SHIPPINGPROOFURL: url } : prev);
      window.open(url, '_blank');
      await load();
    } catch (err: any) {
      alert('Error al subir comprobante de envío: ' + (err?.message || err));
    } finally {
      setUploadingShippingProof(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!order) return;
    setUpdating(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, order.$id, { STATUS: newStatus });
      setOrder(prev => prev ? { ...prev, STATUS: newStatus } : prev);
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (!order) return;
    if (newStatus === 'cancelled') {
      if (!confirm('¿Cancelar este pedido mayorista?')) return;
      updateStatus(newStatus);
      return;
    }
    updateStatus(newStatus);
  };

  const saveNotes = async () => {
    if (!order) return;
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, order.$id, { ADMINNOTES: adminNotes.trim() });
      setOrder(prev => prev ? { ...prev, ADMINNOTES: adminNotes.trim() } : prev);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const removeItem = async (index: number) => {
    if (!order) return;
    let parsedItems: any[] = [];
    try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
    if (index < 0 || index >= parsedItems.length) return;
    const itemName = parsedItems[index]?.name || 'este producto';
    if (!confirm(`¿Eliminar "${itemName}" del pedido por falta de stock?\nEl total se recalculará automáticamente y el producto se perderá.`)) return;
    setUpdating(true);
    try {
      parsedItems.splice(index, 1);
      const newSubtotal = parsedItems.reduce((s, it) => s + (it.total || it.price * it.qty), 0);
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, order.$id, {
        ITEMS: JSON.stringify(parsedItems),
        SUBTOTAL: newSubtotal,
        TOTAL: newSubtotal,
      });
      setOrder(prev => prev ? { ...prev, ITEMS: JSON.stringify(parsedItems), SUBTOTAL: newSubtotal, TOTAL: newSubtotal } : prev);
    } catch (e: any) {
      alert('Error al eliminar producto: ' + e.message);
    } finally {
      setUpdating(false);
    }
  };

  const getWhatsAppSummaryText = () => {
    if (!order) return '';
    let currentItems: any[] = [];
    try { currentItems = JSON.parse(order.ITEMS || '[]'); } catch {}
    const originalItems = originalItemsRef.current || currentItems;
    const currentItemNames = new Set(currentItems.map(it => it.name));
    const unavailable = originalItems.filter(it => !currentItemNames.has(it.name));

    let msg = `Hola ${order.CUSTOMERNAME || ''}, \nte escribimos de Importadora Carlitos por tu pedido mayorista #${order.REQCODE || order.$id.slice(-6)}.\n\n`;
    msg += `Hemos revisado tu pedido en bodega y esto es lo que tenemos disponible para ti:\n\n`;
    msg += `✅ LO QUE SÍ HAY:\n\n`;
    currentItems.forEach(it => {
      msg += `🛍️ ${it.name} (Cant: ${it.qty})\n${it.img ? `🔗 Ver imagen: ${it.img}\n` : ''}`;
    });
    
    if (unavailable.length > 0) {
      msg += `\n❌ LO QUE NO HAY:\n\n`;
      unavailable.forEach(it => {
        msg += `🚫 ${it.name} (Cant: ${it.qty})\n${it.img ? `🔗 Ver imagen: ${it.img}\n` : ''}`;
      });
    }

    msg += `\n💵 NUEVO TOTAL: ${fmt(order.TOTAL)} \n\n`;
    msg += `¿Estás de acuerdo para proceder con este pedido?\n\n`;
    msg += `Quedamos atentos para enviarte los datos de transferencia.`;
    return msg;
  };

  const generateReceiptImage = async () => {
    try {
      if ((window as any).html2canvas) {
        doGenerateImage();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = doGenerateImage;
      document.body.appendChild(script);
    } catch (e) {
      console.error(e);
    }
  };

  const doGenerateImage = async () => {
    const el = document.getElementById('whatsapp-receipt-card');
    if (el && (window as any).html2canvas) {
      const originalMaxH = el.style.maxHeight;
      const originalOverflow = el.style.overflow;
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';
      
      const canvas = await (window as any).html2canvas(el, { scale: 2, useCORS: true });
      const imgUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = imgUrl;
      a.download = `Pedido-${order?.REQCODE || 'resumen'}.png`;
      a.click();
      
      el.style.maxHeight = originalMaxH;
      el.style.overflow = originalOverflow;
    }
  };

  const notifyStockWhatsApp = () => {
    if (!order) return;
    setIsNotifyModalOpen(true);
  };

  const copyOrderItemsList = (type: 'barcode' | 'sku') => {
    if (!order) return;
    let parsedItems: any[] = [];
    try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
    const lines = parsedItems.map(it => {
      let code = '';
      if (type === 'barcode') {
        code = (it.id ? productBarcodes[it.id] : '') || it.barcode || (it.id ? productSkus[it.id] : '') || it.sku || '';
      } else {
        code = (it.id ? productSkus[it.id] : '') || it.sku || (it.id ? productBarcodes[it.id] : '') || it.barcode || '';
      }
      if (!code) code = it.id || it.name || '';
      return `${code},${it.qty || 1},${it.price || 0}`;
    });
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(type === 'barcode' ? 'copiedBarcode' : 'copiedSku');
    setTimeout(() => setCopied(null), 1500);
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-gray-100 rounded-xl" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <div>
            <p className="font-semibold text-red-700">Error al cargar el pedido</p>
            <p className="text-sm text-red-600">{error || 'Pedido no encontrado'}</p>
          </div>
          <Link href="/admin/wholesale-orders" className="ml-auto px-4 py-2 bg-white border border-red-200 rounded-xl text-sm text-red-700 hover:bg-red-50">
            Volver
          </Link>
        </div>
      </div>
    );
  }

  let items: { name: string; qty: number; price: number; total: number; img?: string; id?: string; sku?: string; isPack?: boolean; packQty?: number }[] = [];
  try { items = JSON.parse(order.ITEMS || '[]'); } catch {}
  const date = order.CREATEDAT ? new Date(order.CREATEDAT) : new Date(order.$createdAt);
  const ageMs = Date.now() - date.getTime();
  const isOverdue = order.STATUS === 'pending' && ageMs > 3 * 86400000;
  const scRaw = STATUS_CONFIG[order.STATUS] || STATUS_CONFIG.pending;
  const sc = scRaw;
  const customerNote = order.CUSTOMERNOTE;
  const currentStepIdx = STATUS_FLOW.indexOf(['pending_stock', 'processing'].includes(order.STATUS) ? 'pending' : order.STATUS);
  const isCancelled = order.STATUS === 'cancelled';
  const totalItems = items.reduce((s, it) => s + (it.qty || 1), 0);
  const ageDays = Math.floor(ageMs / 86400000);
  const ageHours = Math.floor(ageMs / 3600000);
  const ageStr = ageDays > 0 ? `${ageDays}d` : `${ageHours}h`;
  const displayAdditionalInfo = order.ADDITIONALINFO || '';

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-break { page-break-inside: avoid; break-inside: avoid; }
          body { background: #fff !important; }
          .print-area { width: 100% !important; padding: 0 !important; margin: 0 !important; }
          .print-area .lg\\:grid-cols-3 { grid-template-columns: 1fr !important; }
          .print-area .lg\\:col-span-2 { grid-column: span 1 !important; }
          .print-area .shadow-sm { box-shadow: none !important; }
          .print-area .divide-y > div { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      {/* Proof lightbox */}
      {proofOpen && order.PAYMENTPROOFURL && (() => {
        const isPdf = isPdfUrl(order.PAYMENTPROOFURL) || paymentProofIsPdf;
        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 gap-4" onClick={() => setProofOpen(false)}>
            <div className="no-print flex gap-4">
              <a href={order.PAYMENTPROOFURL} target="_blank" rel="noreferrer"
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-indigo-700 transition">
                <ExternalLink className="w-4 h-4" /> Abrir archivo / Descargar
              </a>
              <button onClick={() => setProofOpen(false)} className="px-4 py-2 bg-white/20 text-white text-xs font-bold rounded-xl hover:bg-white/30 transition">
                Cerrar
              </button>
            </div>
            <div className="relative max-w-3xl max-h-[80vh] w-full flex items-center justify-center p-6 bg-gray-900 rounded-2xl" onClick={e => e.stopPropagation()}>
              {isPdf ? (
                <div className="flex flex-col items-center justify-center gap-4 py-12 text-white">
                  <FileText size={64} className="text-indigo-400 animate-pulse" />
                  <p className="text-sm font-semibold text-gray-300">Este comprobante es un archivo PDF</p>
                  <a href={order.PAYMENTPROOFURL} target="_blank" rel="noreferrer" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition font-bold text-xs flex items-center gap-2 no-underline">
                    <ExternalLink size={14} /> Abrir y ver PDF en nueva pestaña
                  </a>
                </div>
              ) : (
                <img src={order.PAYMENTPROOFURL} alt="Comprobante de pago" className="w-full h-auto max-h-[75vh] object-contain rounded-2xl" />
              )}
            </div>
          </div>
        );
      })()}

      {/* MODAL COMPROBANTE DE ENVÍO */}
      {shippingProofOpen && order.SHIPPINGPROOFURL && (() => {
        const isPdf = isPdfUrl(order.SHIPPINGPROOFURL) || shippingProofIsPdf;
        return (
          <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8" onClick={() => setShippingProofOpen(false)}>
            <div className="no-print flex gap-4 mb-4">
              <a href={order.SHIPPINGPROOFURL} target="_blank" rel="noreferrer"
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-indigo-700 transition">
                <ExternalLink className="w-4 h-4" /> Abrir archivo / Descargar
              </a>
              <button onClick={() => setShippingProofOpen(false)} className="px-4 py-2 bg-white/20 text-white text-xs font-bold rounded-xl hover:bg-white/30 transition">
                Cerrar
              </button>
            </div>
            <div className="relative max-w-3xl max-h-[80vh] w-full flex items-center justify-center p-6 bg-gray-900 rounded-2xl" onClick={e => e.stopPropagation()}>
              {isPdf ? (
                <div className="flex flex-col items-center justify-center gap-4 py-12 text-white">
                  <Truck size={64} className="text-indigo-400 animate-pulse" />
                  <p className="text-sm font-semibold text-gray-300">Este comprobante es un archivo PDF</p>
                  <a href={order.SHIPPINGPROOFURL} target="_blank" rel="noreferrer" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition font-bold text-xs flex items-center gap-2 no-underline">
                    <ExternalLink size={14} /> Abrir y ver PDF en nueva pestaña
                  </a>
                </div>
              ) : (
                <img src={order.SHIPPINGPROOFURL} alt="Comprobante de envío" className="w-full h-auto max-h-[75vh] object-contain rounded-2xl" />
              )}
            </div>
          </div>
        );
      })()}

      {/* ───────── HOJA DE IMPRESIÓN (1 página): cliente, agencia y productos ───────── */}
      <div className="hidden print:block" style={{ color: '#111', fontSize: 12, lineHeight: 1.4, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#4f46e5', color: '#fff', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.7 }}>Pedido Mayorista</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>#{order.REQCODE || order.$id.slice(-6)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'inline-block', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: 999, padding: '3px 12px', fontWeight: 700, fontSize: 12 }}>{sc.label}</div>
            <div style={{ fontSize: 11, marginTop: 5, opacity: 0.85 }}>{fmtDate(date.getTime())} · {fmtTime(date.getTime())}</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{totalItems} uds · {items.length} productos</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#f3f4f6', padding: '5px 12px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#374151' }}>Cliente</div>
            <div style={{ padding: '8px 12px' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{order.CUSTOMERNAME}</div>
              {order.CUSTOMERRUT && <div>RUT: {order.CUSTOMERRUT}</div>}
              {order.CUSTOMERPHONE && <div>Tel: {order.CUSTOMERPHONE}</div>}
              {order.CUSTOMEREMAIL && <div style={{ color: '#4b5563' }}>{order.CUSTOMEREMAIL}</div>}
            </div>
          </div>
          <div style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#f3f4f6', padding: '5px 12px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#374151' }}>Envío</div>
            <div style={{ padding: '8px 12px' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{order.SHIPPINGAGENCY || 'Sin agencia'}</div>
              <div>{order.ADDRESS || '—'}</div>
              <div style={{ color: '#4b5563' }}>{[order.COMUNA, order.REGION].filter(Boolean).join(', ')}</div>
              {displayAdditionalInfo && <div style={{ color: '#4b5563', fontStyle: 'italic' }}>{displayAdditionalInfo}</div>}
            </div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, border: '1px solid #c7d2fe', borderRadius: 10, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#4f46e5', color: '#fff', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', width: 50 }}></th>
              <th style={{ padding: '6px 8px', width: 90 }}>SKU</th>
              <th style={{ padding: '6px 8px' }}>Producto</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', width: 44 }}>Cant.</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', width: 70 }}>Precio</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', width: 80 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eef2ff', background: i % 2 ? '#eef2ff' : '#fff' }}>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  {it.img ? <img src={it.img} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : ''}
                </td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: '#4338ca' }}>{(it.id ? productSkus[it.id] : '') || it.sku || '—'}</td>
                <td style={{ padding: '5px 8px' }}>{it.name}{it.isPack ? <strong style={{ color: '#7c3aed' }}> (Paquete x{it.packQty || 1})</strong> : ''}</td>
                <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700 }}>{it.qty}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt(it.price)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>{fmt(it.total || it.price * it.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 12, marginLeft: 'auto', width: 260, fontSize: 12, border: '1px solid #c7d2fe', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 12px' }}><span style={{ color: '#6b7280' }}>Subtotal</span><span>{fmt(order.SUBTOTAL || order.TOTAL)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: '#4f46e5', color: '#fff', fontWeight: 800, fontSize: 14 }}><span>TOTAL</span><span>{fmt(order.TOTAL)}</span></div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 8, borderTop: '1px dashed #d1d5db', fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>
          Documento interno de preparación · Pedido Mayorista #{order.REQCODE} · Generado el {new Date().toLocaleDateString('es-CL')}
        </div>
      </div>

      <div className="print-area print:hidden max-w-6xl mx-auto space-y-4 sm:space-y-5 px-1 sm:px-0">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button onClick={() => router.push('/admin/wholesale-orders')} className="no-print p-1.5 sm:p-2 rounded-xl hover:bg-gray-100 transition text-gray-500 flex-shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">Pedido Mayorista #{order.REQCODE || order.$id.slice(-6)}</h1>
                <button onClick={() => copyText(order.REQCODE || order.$id, 'code')} className="no-print text-gray-400 hover:text-indigo-500 transition flex-shrink-0">
                  {copied === 'code' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {isOverdue && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-500 text-white rounded animate-pulse">VENCIDO</span>}
                {order.PAYMENTPROOFURL && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">💰 COMPROBANTE</span>}
              </div>
              <p className="text-xs sm:text-sm text-gray-500 truncate">{fmtDate(date.getTime())} · {fmtTime(date.getTime())} · Hace {ageStr}</p>
            </div>
          </div>
          <div className="no-print flex items-center gap-1 sm:gap-2 flex-shrink-0 flex-wrap">
            <button onClick={() => {
              const textC = `Pedido: #${order.REQCODE}\nCliente: ${order.CUSTOMERNAME}\nRUT: ${order.CUSTOMERRUT || '-'}\nTeléfono: ${order.CUSTOMERPHONE || '-'}\nDirección: ${order.ADDRESS}, ${order.COMUNA}, ${order.REGION}\nAgencia: ${order.SHIPPINGAGENCY || '-'}\nTotal: ${fmt(order.TOTAL)}\nEstado: ${sc.label}`;
              copyText(textC, 'all');
            }} className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-100 transition">
              {copied === 'all' ? <><Check className="w-3.5 h-3.5 text-green-600 animate-pulse" /><span className="hidden xs:inline sm:inline">Copiado</span></> : <><Copy className="w-3.5 h-3.5" /><span className="hidden xs:inline sm:inline">Datos</span></>}
            </button>
            <button onClick={() => copyOrderItemsList('sku')} className="flex items-center gap-1.5 px-2 py-1.5 bg-violet-50 border border-violet-200 text-violet-700 rounded-xl text-xs font-semibold hover:bg-violet-100 transition">
              {copied === 'copiedSku' ? <><Check className="w-3.5 h-3.5 text-green-600 animate-pulse" /><span className="hidden xs:inline sm:inline">Copiado</span></> : <><Copy className="w-3.5 h-3.5" /><span className="hidden xs:inline sm:inline">SKU</span></>}
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-white border border-gray-250 text-gray-600 rounded-xl text-xs sm:text-sm font-medium hover:bg-gray-50 transition">
              <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Imprimir / PDF</span>
            </button>
            {MODULE_ACCESS.whatsappManagement && <button onClick={notifyStockWhatsApp} className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-[#25D366] text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-[#128C7E] transition shadow-sm">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824zm-3.423-14.416c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm.029 18.88c-1.161 0-2.305-.292-3.318-.844l-3.677.964.984-3.595c-.607-1.052-.927-2.246-.926-3.468.001-5.824 4.74-10.563 10.567-10.564 5.823 0 10.561 4.741 10.562 10.564 0 5.825-4.738 10.562-10.564 10.564z" />
              </svg>
              <span className="hidden sm:inline">Avisar Stock WhatsApp</span>
            </button>}
          </div>
        </div>

        {/* Summary cards */}
        {(() => {
          const statusHex = STATUS_HEX[order.STATUS] || '#6b7280';
          const cards: { label: string; value: React.ReactNode; hex: string; icon: React.ReactNode }[] = [
            { label: 'Total', hex: '#4f46e5', value: fmt(order.TOTAL), icon: <DollarSign className="w-4 h-4 text-white" /> },
            { label: 'Unidades', hex: '#d97706', value: <>{totalItems} <span className="text-xs font-semibold text-gray-400">uds</span></>, icon: <Package className="w-4 h-4 text-white" /> },
            { label: 'Estado', hex: statusHex, value: <span style={{ color: statusHex }}>{sc.label}</span>, icon: <span className="text-base leading-none">{sc.icon}</span> },
            { label: 'Antigüedad', hex: isOverdue ? '#ef4444' : '#64748b', value: <span style={{ color: isOverdue ? '#dc2626' : undefined }}>{ageStr}</span>, icon: <Clock className="w-4 h-4 text-white" /> },
          ];
          return (
            <div className="no-print grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {cards.map((c, i) => (
                <div key={i} className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-3 sm:p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
                  <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${c.hex}12, transparent 70%)` }} />
                  <div className="relative flex items-center gap-2 mb-2">
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(145deg, ${c.hex}, ${c.hex}d9)`, boxShadow: `0 3px 8px -3px ${c.hex}99, inset 0 1px 1px rgba(255,255,255,0.4)` }}>
                      {c.icon}
                    </span>
                    <p className="text-[10px] sm:text-[11px] uppercase tracking-wide font-bold text-gray-400">{c.label}</p>
                  </div>
                  <p className="relative text-base sm:text-xl font-extrabold text-gray-900 tracking-tight leading-tight truncate">{c.value}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Status Stepper */}
        {!isCancelled ? (
          <div className="no-print relative rounded-[20px] overflow-hidden border border-gray-100 bg-white p-4 sm:p-5 shadow-sm">
            <div className="absolute -top-16 -left-10 w-52 h-52 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${(STATUS_HEX[order.STATUS] || '#6366f1')}0d, transparent 70%)` }} />

            {/* Header */}
            <div className="relative flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-lg" style={{ background: `linear-gradient(145deg, ${(STATUS_HEX[order.STATUS] || '#6b7280')}, ${(STATUS_HEX[order.STATUS] || '#6b7280')}d9)`, boxShadow: `0 3px 8px -3px ${(STATUS_HEX[order.STATUS] || '#6b7280')}99, inset 0 1px 1px rgba(255,255,255,0.4)` }}>
                  {sc.icon}
                </span>
                <div>
                  <p className="text-sm sm:text-base font-extrabold text-gray-900 leading-tight tracking-tight">{sc.label}</p>
                  <p className="text-[10px] sm:text-[11px] text-gray-400 font-medium leading-tight flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    Toca un paso para cambiar el estado
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleStatusChange('negotiation')}
                  disabled={updating || order.STATUS === 'negotiation'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-60 hover:-translate-y-0.5"
                  style={{ background: order.STATUS === 'negotiation' ? '#ec4899' : '#fdf2f8', color: order.STATUS === 'negotiation' ? '#fff' : '#db2777', border: '1px solid #fbcfe8' }}>
                  🤝 {order.STATUS === 'negotiation' ? 'En negociación' : 'Negociación'}
                </button>
              </div>
            </div>

            {/* Progress rail */}
            <div className="relative overflow-x-auto pb-2 pt-3">
              <div className="flex items-start gap-0 min-w-max">
                {STATUS_FLOW.map((step, i) => {
                  const hex = STATUS_HEX[step] || '#6b7280';
                  const label = STATUS_CONFIG[step]?.label || step;
                  const isCompleted = i < currentStepIdx;
                  const isCurrent = i === currentStepIdx;
                  const isFuture = i > currentStepIdx;
                  const nextHex = STATUS_HEX[STATUS_FLOW[i + 1]] || hex;
                  const iconPath = STEP_ICON_PATHS[step];
                  return (
                    <React.Fragment key={step}>
                      <button type="button" onClick={() => !isCurrent && handleStatusChange(step)} disabled={updating || isCurrent}
                        title={`Cambiar a "${label}"`}
                        className="group flex flex-col items-center gap-1.5 flex-shrink-0 disabled:cursor-default" style={{ width: 74 }}>
                        <div className="relative transition-transform duration-200 group-hover:enabled:-translate-y-0.5 group-enabled:group-hover:scale-105" style={{ animation: isCurrent ? 'kwdFloat 2.6s ease-in-out infinite' : undefined }}>
                          {isCurrent && <span className="absolute inset-0 rounded-[13px]" style={{ ['--kwd' as any]: `${hex}3d`, animation: 'kwdPulse 2.2s ease-out infinite' }} />}
                          <div className="relative flex items-center justify-center rounded-[13px] transition-all duration-300"
                            style={{
                              width: isCurrent ? 42 : 34,
                              height: isCurrent ? 42 : 34,
                              background: isFuture ? 'linear-gradient(160deg,#ffffff,#f1f5f9)' : `linear-gradient(160deg, rgba(255,255,255,0.22), rgba(0,0,0,0.12)), ${hex}`,
                              border: isFuture ? `1.5px dashed ${hex}3a` : '1px solid rgba(255,255,255,0.3)',
                              boxShadow: isCurrent ? `0 0 0 3px ${hex}1a, 0 6px 14px -8px ${hex}aa, inset 0 1px 1px rgba(255,255,255,0.5)` : isFuture ? 'none' : `0 3px 9px -5px ${hex}80, inset 0 1px 1px rgba(255,255,255,0.45)`,
                            }}>
                            {isCompleted ? (
                              <Check className="w-4 h-4 text-white" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }} />
                            ) : (
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ color: isFuture ? `${hex}66` : '#fff', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}>
                                {iconPath && <path d={iconPath} />}
                              </svg>
                            )}
                            {!isFuture && <span className="absolute inset-x-1 top-1 h-1/3 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.45), transparent)' }} />}
                          </div>
                        </div>
                        <span className="text-[8px] sm:text-[9px] font-bold text-center leading-tight transition-colors group-hover:enabled:text-gray-900" style={{ color: isCurrent ? hex : isFuture ? '#c2cbd6' : '#475569' }}>{label}</span>
                      </button>
                      {i < STATUS_FLOW.length - 1 && (
                        <div className="relative self-start mt-[17px] flex-shrink-0 -mx-1 rounded-full overflow-hidden" style={{ height: 4, width: 24, background: isCompleted ? `linear-gradient(90deg, ${hex}, ${nextHex})` : '#e5e7eb' }}>
                          {isCompleted && <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)', animation: `kwdShimmer 2.4s linear ${i * 0.18}s infinite` }} />}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <style>{`
              @keyframes kwdShimmer { 0% { transform: translateX(-110%); } 100% { transform: translateX(220%); } }
              @keyframes kwdPulse { 0% { box-shadow: 0 0 0 0 var(--kwd); } 70% { box-shadow: 0 0 0 11px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
              @keyframes kwdFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
            `}</style>
          </div>
        ) : (
          /* Cancelled banner */
          <div className="no-print rounded-xl sm:rounded-2xl border border-red-200 bg-red-50 p-3 sm:p-5 flex items-center justify-between flex-wrap gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center flex-shrink-0">
                <Ban className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm sm:text-lg font-bold text-red-700">Pedido Cancelado</p>
                <p className="text-[10px] sm:text-xs text-red-500">Este pedido mayorista fue cancelado</p>
              </div>
            </div>
            <button onClick={() => handleStatusChange('pending')} disabled={updating}
              className="text-xs sm:text-sm font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border bg-white text-amber-700 border-amber-200 hover:bg-amber-50 transition flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
              Reactivar pedido
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-5">
          {/* ── Info block (header + location + notes) ── */}
          <div className="print-info-block lg:col-span-2 space-y-3 sm:space-y-5">
            {/* Order header */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden print-break">
              <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-500" />
                  <p className="font-semibold text-gray-900 text-xs sm:text-sm">Pedido Mayorista #{order.REQCODE || order.$id.slice(-6)}</p>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-400">{fmtDate(date.getTime())} · {fmtTime(date.getTime())}</p>
              </div>
            </div>

            {/* Location Map (no se imprime) */}
            {order.ADDRESS && (
              <div className="no-print bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                  <MapPinned className="w-4 h-4 text-indigo-500" />
                  <p className="font-semibold text-gray-900 text-xs sm:text-sm">Ubicación de entrega</p>
                </div>
                <div className="p-3 sm:p-4 border-b border-gray-100">
                  <div className="rounded-xl border p-3" style={{ borderColor: '#bbf7d0', background: 'linear-gradient(160deg,#f0fdf4,#ffffff)' }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="w-5 h-5 rounded-md bg-emerald-500 flex items-center justify-center"><MapPin className="w-3 h-3 text-white" /></span>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Dirección de despacho</p>
                    </div>
                    <p className="text-xs font-semibold text-gray-800 leading-snug">{order.ADDRESS}</p>
                    <p className="text-[11px] text-gray-500">{[order.COMUNA, order.REGION].filter(Boolean).join(', ') || '—'}</p>
                  </div>
                </div>
                <div className="aspect-[16/9] sm:aspect-[21/9] w-full">
                  <iframe
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(`${order.ADDRESS}, ${order.COMUNA}, ${order.REGION}, Chile`)}`}>
                  </iframe>
                </div>
              </div>
            )}

            {/* Notes & Timeline */}
            <div className="no-print bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-indigo-500" />
                <p className="font-semibold text-gray-900 text-xs sm:text-sm">Notas y seguimiento</p>
              </div>
              <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
                {customerNote && (
                  <div className="p-2.5 sm:p-3.5 bg-amber-50 border border-amber-200 rounded-lg sm:rounded-xl">
                    <p className="text-[10px] sm:text-xs font-semibold text-amber-700 mb-1 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Nota del cliente</p>
                    <p className="text-xs sm:text-sm text-amber-800 whitespace-pre-wrap">{customerNote}</p>
                  </div>
                )}
                {/* Admin notes editor */}
                <div>
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Notas de administración</p>
                  <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                    placeholder="Ej: Stock verificado en bodega principal, esperando transferencia."
                    rows={3}
                    className="w-full text-xs sm:text-sm p-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                  <div className="flex justify-end mt-2">
                    <button onClick={saveNotes}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition">
                      {notesSaved ? <><Check className="w-3.5 h-3.5" /> Guardado</> : <><Save className="w-3.5 h-3.5" /> Guardar notas</>}
                    </button>
                  </div>
                </div>
                {/* Timeline */}
                <div className="border-t border-gray-100 pt-3 sm:pt-4">
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-500 mb-2 sm:mb-3 uppercase tracking-wide">Historial del pedido</p>
                  <div className="relative ml-1.5 sm:ml-2 space-y-3 sm:space-y-4 border-l-2 border-gray-200 pl-3 sm:pl-4">
                    <TimelineEntry dot="bg-indigo-400" title="Pedido creado" date={`${fmtDate(date.getTime())} ${fmtTime(date.getTime())}`} />
                    {order.PAYMENTPROOFURL && (
                      <TimelineEntry dot="bg-emerald-400" title="Comprobante subido" icon={<ImageIcon className="w-3 h-3" />} />
                    )}
                    {order.STATUS !== 'pending' && (
                      <TimelineEntry dot={STATUS_CONFIG[order.STATUS]?.dot || 'bg-gray-400'} title={`Estado → ${sc.label}`} date={`${fmtDate(new Date(order.$updatedAt).getTime())} ${fmtTime(new Date(order.$updatedAt).getTime())}`} />
                    )}
                    {isCancelled && (
                      <TimelineEntry dot="bg-red-400" title="Pedido cancelado" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right column — Customer + Shipping + Payment + Actions */}
          <div className="space-y-3 sm:space-y-5">
            {/* Customer */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden print-break">
              <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-500" />
                <p className="font-semibold text-gray-900 text-xs sm:text-sm">Cliente</p>
              </div>
              <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3">
                <InfoRow icon={<User className="w-3.5 h-3.5" />} label="Nombre" value={order.CUSTOMERNAME} onCopy={() => copyText(order.CUSTOMERNAME, 'name')} copied={copied === 'name'} />
                {order.CUSTOMERRUT && <InfoRow icon={<Hash className="w-3.5 h-3.5" />} label="RUT" value={order.CUSTOMERRUT} onCopy={() => copyText(order.CUSTOMERRUT!, 'rut')} copied={copied === 'rut'} />}
                {order.CUSTOMERPHONE && <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="Teléfono" value={order.CUSTOMERPHONE} onCopy={() => copyText(order.CUSTOMERPHONE!, 'phone')} copied={copied === 'phone'} />}
                {order.CUSTOMEREMAIL && <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={order.CUSTOMEREMAIL} onCopy={() => copyText(order.CUSTOMEREMAIL!, 'email')} copied={copied === 'email'} />}
              </div>
            </div>

            {/* Shipping */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden print-break">
              <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2">
                <MapPinned className="w-4 h-4 text-indigo-500" />
                <p className="font-semibold text-gray-900 text-xs sm:text-sm">Envío</p>
              </div>
              <div className="p-3 sm:p-5 space-y-1.5 sm:space-y-2">
                {order.SHIPPINGAGENCY && (
                  <p className="text-sm sm:text-base font-bold text-violet-700 print:text-black flex items-center gap-1.5"><Truck className="w-4 h-4" /> {order.SHIPPINGAGENCY}</p>
                )}
                <p className="text-xs sm:text-sm font-medium text-gray-900">{order.ADDRESS || 'Sin dirección'}</p>
                <p className="text-[10px] sm:text-xs text-gray-500">{order.COMUNA}{order.COMUNA && order.REGION ? ', ' : ''}{order.REGION}</p>
                {displayAdditionalInfo && (
                  <div className="mt-1.5 sm:mt-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-[10px] sm:text-xs text-gray-400 font-medium">Info adicional</p>
                    <p className="text-[10px] sm:text-xs text-gray-600 whitespace-pre-wrap">{displayAdditionalInfo}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Payment */}
            <div className="no-print bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-indigo-500" />
                <p className="font-semibold text-gray-900 text-xs sm:text-sm">Pago</p>
              </div>
              <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3">
                {order.PAYMENTPROOFURL ? (
                  <button onClick={() => {
                    const url = order.PAYMENTPROOFURL!;
                    if (isPdfUrl(url) || paymentProofIsPdf) window.open(url, '_blank');
                    else setProofOpen(true);
                  }}
                    className="flex items-center gap-2 p-2.5 sm:p-3 bg-emerald-50 border border-emerald-200 rounded-lg sm:rounded-xl hover:bg-emerald-100 transition group w-full text-left">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] sm:text-xs font-semibold text-emerald-700">Comprobante de pago</p>
                      <p className="text-[9px] sm:text-[10px] text-emerald-500">Click para ver</p>
                    </div>
                    <ExternalLink className="w-3 h-3 text-emerald-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                  </button>
                ) : (
                  <label className="flex items-center justify-center w-full p-2.5 sm:p-3 border-2 border-dashed border-gray-200 rounded-lg sm:rounded-xl bg-gray-50 hover:bg-gray-100 hover:border-gray-300 cursor-pointer transition group">
                    <input type="file" accept="image/*,.pdf" onChange={handleAdminUploadProof} className="hidden" disabled={uploadingProof} />
                    <div className="flex flex-col items-center gap-1">
                      {uploadingProof ? (
                        <>
                          <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                          <p className="text-[10px] sm:text-xs text-amber-700 font-medium">Subiendo comprobante...</p>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-4 h-4 text-gray-400 group-hover:text-amber-500 transition-colors" />
                          <p className="text-[10px] sm:text-xs text-gray-500 font-medium group-hover:text-amber-700">Subir comprobante</p>
                        </>
                      )}
                    </div>
                  </label>
                )}
              </div>
            </div>

            {/* Envío Proof */}
            <div className="no-print bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2">
                <Truck className="w-4 h-4 text-violet-500" />
                <p className="font-semibold text-gray-900 text-xs sm:text-sm">Envío</p>
              </div>
              <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3">
                {order.SHIPPINGPROOFURL ? (
                  <button onClick={() => {
                    const url = order.SHIPPINGPROOFURL!;
                    if (isPdfUrl(url) || shippingProofIsPdf) window.open(url, '_blank');
                    else setShippingProofOpen(true);
                  }}
                    className="flex items-center gap-2 p-2.5 sm:p-3 bg-violet-50 border border-violet-200 rounded-lg sm:rounded-xl hover:bg-violet-100 transition group w-full text-left">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] sm:text-xs font-semibold text-violet-700">Comprobante de envío</p>
                      <p className="text-[9px] sm:text-[10px] text-violet-500">Click para ver</p>
                    </div>
                    <ExternalLink className="w-3 h-3 text-violet-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                  </button>
                ) : (
                  <label className="flex items-center justify-center w-full p-2.5 sm:p-3 border-2 border-dashed border-gray-200 rounded-lg sm:rounded-xl bg-gray-50 hover:bg-gray-100 hover:border-gray-300 cursor-pointer transition group">
                    <input type="file" accept="image/*,.pdf" onChange={handleAdminUploadShippingProof} className="hidden" disabled={uploadingShippingProof} />
                    <div className="flex flex-col items-center gap-1">
                      {uploadingShippingProof ? (
                        <>
                          <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                          <p className="text-[10px] sm:text-xs text-violet-700 font-medium">Subiendo comprobante...</p>
                        </>
                      ) : (
                        <>
                          <Truck className="w-4 h-4 text-gray-400 group-hover:text-violet-500 transition-colors" />
                          <p className="text-[10px] sm:text-xs text-gray-500 font-medium group-hover:text-violet-700">Subir comprobante de envío</p>
                        </>
                      )}
                    </div>
                  </label>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="no-print bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5 space-y-1.5 sm:space-y-2">
              <p className="text-[10px] sm:text-xs font-semibold text-gray-500 mb-1.5 sm:mb-2 uppercase tracking-wide">Acciones rápidas</p>
              {MODULE_ACCESS.whatsappManagement && order.CUSTOMERPHONE && (() => {
                const clean = order.CUSTOMERPHONE.replace(/\D/g, '');
                const waPhone = clean.startsWith('56') ? clean : '56' + clean;
                const msg = `Hola ${order.CUSTOMERNAME}, te contactamos de Yaxsell por tu pedido mayorista #${order.REQCODE} por un total de ${fmt(order.TOTAL)}. ¿En qué te podemos ayudar?`;
                return (
                  <>
                    <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 w-full p-2 sm:p-2.5 bg-green-50 border border-green-200 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium text-green-700 hover:bg-green-100 transition">
                      <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> WhatsApp
                    </a>
                    <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 w-full p-2 sm:p-2.5 bg-amber-50 border border-amber-200 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium text-amber-800 hover:bg-amber-100 transition">
                      <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" /> WhatsApp con mensaje
                    </a>
                  </>
                );
              })()}
              {order.STATUS !== 'cancelled' && (
                <button onClick={() => handleStatusChange('cancelled')}
                  className="flex items-center gap-2 w-full p-2 sm:p-2.5 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium text-red-600 hover:bg-red-100 transition">
                  <Ban className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Cancelar pedido
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Products block ── */}
        <div className="print-products-block bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-500" />
              <p className="font-semibold text-gray-900 text-xs sm:text-sm">Productos ({items.length})</p>
            </div>
            <p className="text-[10px] sm:text-xs text-gray-400">{totalItems} unidades</p>
          </div>
          <div className="divide-y divide-gray-50">
            {items.map((it, i) => {
              const currentStock = it.id ? (productStocks[it.id] ?? 0) : 0;
              const loc = it.id ? productLocations[it.id] : null;
              const sku = (it.id ? productSkus[it.id] : '') || it.sku || '';
              return (
                <div key={i} className="flex flex-col gap-2 px-3 sm:px-5 py-3 sm:py-3.5 hover:bg-gray-50/50 transition border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2 sm:gap-4">
                    <div className="w-9 h-9 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {it.img ? <img src={it.img} alt="" className="w-full h-full object-contain p-0.5 sm:p-1" /> : <Package className="w-4 h-4 sm:w-5 sm:h-5 text-gray-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs sm:text-sm font-semibold truncate text-gray-900">{it.name}</p>
                        {it.isPack && (
                          <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                            📦 Paquete de {it.packQty || 1} un.
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5">
                        <span className="text-[10px] sm:text-xs text-gray-500">{fmt(it.price)} c/u</span>
                        <span className="text-gray-300">×</span>
                        <span className="text-[10px] sm:text-xs font-semibold text-gray-700">{it.qty}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {sku && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-800 text-[10px] sm:text-xs font-bold">
                            <Hash className="w-3 h-3 shrink-0" />{sku}
                          </span>
                        )}
                        {loc?.label && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] sm:text-xs font-bold">
                            <MapPin className="w-3 h-3 shrink-0" />{loc.label}
                          </span>
                        )}
                        {it.id && (
                          <span className={`text-[9px] sm:text-[10px] font-semibold px-1 sm:px-1.5 py-0.5 rounded ${currentStock <= 0 ? 'bg-red-100 text-red-600' : currentStock <= 5 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                            Stock: {currentStock === 99999 ? '∞' : currentStock}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 flex items-center gap-2">
                      <p className="text-xs sm:text-sm font-bold text-gray-900">{fmt(it.total || it.price * it.qty)}</p>
                      {(order.STATUS === 'negotiation') && (
                        <button
                          onClick={() => removeItem(i)}
                          disabled={updating}
                          title="Eliminar producto del pedido"
                          className="no-print p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Totals */}
          <div className="px-3 sm:px-5 py-3 sm:py-4 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100 space-y-1.5 sm:space-y-2">
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-700">{fmt(order.SUBTOTAL || order.TOTAL)}</span>
            </div>
            <div className="flex justify-between text-base sm:text-lg font-bold pt-1.5 sm:pt-2 border-t border-gray-200">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900">{fmt(order.TOTAL)}</span>
            </div>
          </div>
        </div>
      </div>
      {/* Notify Modal */}
      {MODULE_ACCESS.whatsappManagement && isNotifyModalOpen && order && (() => {
        let currentItems: any[] = [];
        try { currentItems = JSON.parse(order.ITEMS || '[]'); } catch {}
        const originalItems = originalItemsRef.current || currentItems;
        const currentItemNames = new Set(currentItems.map(it => it.name));
        const unavailable = originalItems.filter(it => !currentItemNames.has(it.name));
        
        const textContent = getWhatsAppSummaryText();
        
        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-center p-4" onClick={() => setIsNotifyModalOpen(false)}>
            <div className="w-full max-w-5xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
              
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Notificar Stock al Cliente</h3>
                  <p className="text-xs text-gray-500">Toma una captura del resumen y envía el texto por WhatsApp</p>
                </div>
                <button onClick={() => setIsNotifyModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-xl transition">
                  <Ban className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6 flex flex-col lg:flex-row gap-6 bg-gray-50">
                {/* Left side: Text Preview */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between mt-2">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-indigo-500" />
                      Texto para WhatsApp
                    </h4>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={generateReceiptImage}
                        className="px-3 py-1.5 bg-pink-50 text-pink-700 hover:bg-pink-100 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border border-pink-200"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        Descargar Imagen
                      </button>
                      <button 
                        onClick={() => copyText(textContent, 'whatsapp_text')}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border border-indigo-200"
                      >
                        {copied === 'whatsapp_text' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied === 'whatsapp_text' ? 'Copiado!' : 'Copiar Texto'}
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-[400px] bg-white border border-gray-200 rounded-2xl p-4 text-xs font-mono text-gray-700 whitespace-pre-wrap overflow-auto shadow-sm">
                    {textContent}
                  </div>
                </div>

                {/* Right side: Visual Receipt Card */}
                <div className="flex-[1.2] flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-emerald-500" />
                      Resumen Visual (Capturar pantalla)
                    </h4>
                  </div>
                  
                  {/* Visual Card */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm overflow-hidden flex flex-col gap-6 relative" id="whatsapp-receipt-card">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                    
                    <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                      <div>
                        <h2 className="text-lg font-black text-gray-900 tracking-tight">Importadora Carlitos</h2>
                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Revisión de Stock</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">Pedido #{order.REQCODE || order.$id.slice(-6)}</p>
                        <p className="text-[10px] text-gray-500">{order.CUSTOMERNAME}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h3 className="text-xs font-bold text-emerald-600 mb-2 flex items-center gap-1.5 bg-emerald-50 w-fit px-2 py-0.5 rounded-full"><Check className="w-3 h-3" /> CONFIRMADOS</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {currentItems.map((it, i) => (
                            <div key={i} className="flex flex-col gap-1.5 p-2 border border-gray-100 rounded-xl bg-gray-50">
                              <div className="w-full h-14 bg-white rounded-lg overflow-hidden border border-gray-100 flex items-center justify-center">
                                {it.img ? <img src={it.img} alt="" className="max-w-full max-h-full object-contain" /> : <Package className="w-4 h-4 text-gray-300" />}
                              </div>
                              <p className="text-[9px] font-semibold text-gray-700 leading-tight line-clamp-2" title={it.name}>{it.name}</p>
                              <div className="flex justify-between items-center mt-auto">
                                <span className="text-[10px] font-black text-gray-900">x{it.qty}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {unavailable.length > 0 && (
                        <div className="pt-2 border-t border-gray-100">
                          <h3 className="text-xs font-bold text-red-600 mb-2 flex items-center gap-1.5 bg-red-50 w-fit px-2 py-0.5 rounded-full"><Ban className="w-3 h-3" /> AGOTADOS</h3>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {unavailable.map((it, i) => (
                              <div key={i} className="flex flex-col gap-1.5 p-2 border border-red-50 rounded-xl bg-red-50/30 opacity-75">
                                <div className="w-full h-14 bg-white rounded-lg overflow-hidden border border-red-100 flex items-center justify-center grayscale">
                                  {it.img ? <img src={it.img} alt="" className="max-w-full max-h-full object-contain" /> : <Package className="w-4 h-4 text-gray-300" />}
                                </div>
                                <p className="text-[9px] font-semibold text-gray-500 leading-tight line-clamp-2 line-through">{it.name}</p>
                                <div className="flex justify-between items-center mt-auto">
                                  <span className="text-[10px] font-black text-gray-400">x{it.qty}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-end justify-between bg-gray-50 -mx-6 -mb-6 p-6">
                      <p className="text-[10px] text-gray-500 font-medium">Captura esta pantalla y<br/>envíala por WhatsApp</p>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Nuevo Total</p>
                        <p className="text-2xl font-black text-indigo-600 leading-none mt-0.5">{fmt(order.TOTAL)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-4 border-t border-gray-100 bg-white flex justify-end">
                <button onClick={() => setIsNotifyModalOpen(false)} className="px-6 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition shadow-sm">
                  Cerrar
                </button>
              </div>

            </div>
          </div>
        );
      })()}
    </>
  );
}

function InfoRow({ icon, label, value, onCopy, copied }: { icon: React.ReactNode; label: string; value: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="flex items-center justify-between group">
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <span className="text-gray-400 flex-shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
          <p className="text-xs sm:text-sm text-gray-800 font-medium truncate">{value}</p>
        </div>
      </div>
      <button onClick={onCopy}
        className="no-print p-1.5 sm:p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-500 sm:opacity-0 sm:group-hover:opacity-100 transition flex-shrink-0">
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function TimelineEntry({ dot, title, date, icon }: { dot: string; title: string; date?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 sm:gap-3 relative">
      <div className={`absolute -left-[17px] sm:-left-[21px] w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${dot} border-2 border-white top-0.5`} />
      <div className="flex-1">
        <div className="flex items-center gap-1 sm:gap-1.5">
          {icon}
          <p className="text-xs sm:text-sm text-gray-700 font-medium">{title}</p>
        </div>
        {date && <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">{date}</p>}
      </div>
    </div>
  );
}
