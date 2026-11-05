'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getServices, getFirebaseConfig, ORDERS_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { MODULE_ACCESS } from '@/lib/module-access';
import { MEDIA_BUCKET_ID, MEDIA_PREFIXES, ORDER_BOX_PHOTOS_BUCKET_ID, ID, Query } from '@/lib/db';
import { Order, OrderStatus } from '@/types/admin';
import { generateOrderPdf } from '@/lib/generateOrderPdf';
import {
  ArrowLeft, Package, User, MapPin, CreditCard, Truck, Clock, FileText,
  Phone, Mail, Hash, ChevronDown, Save, CheckCircle, Copy, Check,
  AlertTriangle, ExternalLink, Image as ImageIcon, MessageSquare, Calendar, DollarSign,
  Printer, Send, Ban, StickyNote, MapPinned, Receipt, Tag, XCircle, Upload, Search, Download,
  RefreshCw, Plus
} from 'lucide-react';
import { getWarehouseLocationFromFeatures, getSkuFromFeatures, getBarcodeFromFeatures, type ProductWarehouseLocation } from '@/lib/product-features';
import { resolveBoxCode } from '@/lib/embalajeHelper';
import { resolveStorageImageUrl, getProductImageUrl } from '@/lib/product-images';
import { parsePaymentProofs, serializePaymentProofs, MAX_PAYMENT_PROOFS } from '@/lib/payment-proofs';
import { ShippingNotificationModal } from '@/components/admin/ShippingNotificationModal';
import { hasShippingData } from '@/lib/order-rules';
import { getOrderAutoCancelDeadline } from '@/lib/order-expiration';
import { useStoreSettings } from '@/hooks/useStoreSettings';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string; icon: string }> = {
  pending:            { label: 'Stock Confirmado',          bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400', icon: '📦' },
  pending_stock:      { label: 'Stock Confirmado',          bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400', icon: '📦' },
  processing:         { label: 'Stock Confirmado',          bg: 'bg-emerald-50', text: 'text-emerald-700',  border: 'border-emerald-200', dot: 'bg-emerald-400', icon: '📦' },
  paid:               { label: 'Stock Confirmado',        bg: 'bg-emerald-50', text: 'text-emerald-700',  border: 'border-emerald-200', dot: 'bg-emerald-400', icon: '📦' },
  payment_expired:    { label: 'Pago vencido',             bg: 'bg-rose-50',    text: 'text-rose-700',     border: 'border-rose-200',    dot: 'bg-rose-400',    icon: '⏱️' },
  payment_review:     { label: 'Revisando Pago',          bg: 'bg-blue-50',    text: 'text-blue-700',     border: 'border-blue-200',    dot: 'bg-blue-400',    icon: '📄' },
  payment_confirmed:  { label: 'Pago Confirmado',         bg: 'bg-green-50',   text: 'text-green-700',    border: 'border-green-200',   dot: 'bg-green-400',   icon: '✅' },
  negotiation:        { label: 'Negociando',                bg: 'bg-pink-50',    text: 'text-pink-700',     border: 'border-pink-200',    dot: 'bg-pink-400',    icon: '🤝' },
  shipped:            { label: 'Embalado',                 bg: 'bg-violet-50',  text: 'text-violet-700',   border: 'border-violet-200',  dot: 'bg-violet-400',  icon: '📦' },
  delivered:          { label: 'Entregado a Agencia',      bg: 'bg-green-50',   text: 'text-green-700',    border: 'border-green-200',   dot: 'bg-green-400',   icon: '🚚' },
  cancelled:          { label: 'Cancelado',                 bg: 'bg-red-50',     text: 'text-red-700',      border: 'border-red-200',     dot: 'bg-red-400',     icon: '❌' },
};

const STATUS_FLOW = ['payment_expired', 'paid', 'payment_review', 'payment_confirmed', 'shipped', 'delivered'];

// Colores hex por estado (para gradientes/glows del rediseño)
const STATUS_HEX: Record<string, string> = {
  pending: '#10b981', pending_stock: '#10b981', processing: '#10b981', paid: '#10b981', payment_expired: '#e11d48', payment_review: '#2563eb', payment_confirmed: '#059669',
  negotiation: '#ec4899', shipped: '#8b5cf6', delivered: '#22c55e', cancelled: '#ef4444',
};

const editInputStyle: React.CSSProperties = {
  padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, color: '#0f172a', outline: 'none',
};

const isBluexpress = (agency?: string) => !!agency && agency.toUpperCase().replace(/\s/g, '').includes('BLUEXPRESS');
const isPickupAgency = (agency?: string) => !!agency && agency.toUpperCase() === 'RETIRO EN TIENDA';

// Etiqueta del estado según sea retiro en tienda o envío por agencia
const displayStatusLabel = (status: string, agency?: string): string => {
  const pickup = isPickupAgency(agency);
  if (status === 'paid' || status === 'pending' || status === 'processing' || status === 'pending_stock') return 'Stock Confirmado';
  if (status === 'shipped') return pickup ? 'Listo para Retirar' : 'Embalado';
  if (status === 'delivered') return pickup ? 'Entregado' : 'Entregado a Agencia';
  return STATUS_CONFIG[status]?.label || status;
};

const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

// Clave normalizada por nombre de producto (sin acentos/mayúsculas/espacios extra)
// para emparejar los items del pedido con el catálogo cuando no traen id.
const normNameKey = (s?: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

const fmtDate = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
};

function isPdfUrl(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.toLowerCase();
  return clean.endsWith('.pdf') || clean.includes('.pdf') || clean.includes('ext=pdf');
}

export default function OrderDetailPage() {
  const { inventoryMode } = useStoreSettings();
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [productStocks, setProductStocks] = useState<Record<string, number>>({});
  const [productLocations, setProductLocations] = useState<Record<string, ProductWarehouseLocation>>({});
  const [productSkus, setProductSkus] = useState<Record<string, string>>({});
  const [productBoxCodes, setProductBoxCodes] = useState<Record<string, string>>({});
  // Imágenes de producto por id / sku / nombre, tomadas del catálogo público
  // cacheado. Necesario porque los pedidos del flujo de catálogo/WhatsApp guardan
  // los items SIN id ni img (solo sku y name), así que la foto se empareja aquí.
  const [itemImages, setItemImages] = useState<{ byId: Record<string, string>; bySku: Record<string, string>; byName: Record<string, string> }>({ byId: {}, bySku: {}, byName: {} });
  const [productPrices, setProductPrices] = useState<Record<string, number>>({});
  const [productBarcodes, setProductBarcodes] = useState<Record<string, string>>({});
  const [proofOpen, setProofOpen] = useState(false);
  const [selectedPaymentProof, setSelectedPaymentProof] = useState<string | null>(null);
  const [selectedPaymentProofIsPdf, setSelectedPaymentProofIsPdf] = useState(false);
  const [shippingProofOpen, setShippingProofOpen] = useState(false);
  const [shippingProofIsPdf, setShippingProofIsPdf] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [uploadingShippingProof, setUploadingShippingProof] = useState(false);
  const [deliveredModalOpen, setDeliveredModalOpen] = useState(false);
  const [deliveredModalMode, setDeliveredModalMode] = useState<'photo' | 'tracking' | null>(null);
  const [deliveredModalFile, setDeliveredModalFile] = useState<File | null>(null);
  const [deliveredModalTracking, setDeliveredModalTracking] = useState('');
  const [deliveredModalUploading, setDeliveredModalUploading] = useState(false);
  const [uploadingBoxPhoto, setUploadingBoxPhoto] = useState(false);
  const [detectedAddr, setDetectedAddr] = useState<{ region: string; comuna: string; full: string } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [agencies, setAgencies] = useState<{ name: string }[]>([]);
  const [editingAgency, setEditingAgency] = useState(false);
  const [selectedAgency, setSelectedAgency] = useState('');
  const [savingAgency, setSavingAgency] = useState(false);
  const [editingTracking, setEditingTracking] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [savingTracking, setSavingTracking] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', rut: '', phone: '', email: '', address: '', comuna: '', region: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  // Out of stock & Replacement states
  const [replacingIdx, setReplacingIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [isSimilarSearch, setIsSimilarSearch] = useState(false);
  const [notifyingIdx, setNotifyingIdx] = useState<number | null>(null);
  const [notifiedIndices, setNotifiedIndices] = useState<Set<number>>(new Set());
  const [missingQty, setMissingQty] = useState<number>(1);
  const [negotiationSearch, setNegotiationSearch] = useState('');
  const [replacementSelection, setReplacementSelection] = useState<{ product: any; qty: number }[]>([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [addProductSearch, setAddProductSearch] = useState('');
  const [addProductResults, setAddProductResults] = useState<any[]>([]);
  const [addingProduct, setAddingProduct] = useState(false);

  // Modal para solicitar / recordar datos de envío
  const [shippingModalOpen, setShippingModalOpen] = useState(false);
  const [shippingModalData, setShippingModalData] = useState<any>(null);
  const [notifyingShipping, setNotifyingShipping] = useState(false);

  const handleNotifyShippingData = async () => {
    if (!order) return;
    setNotifyingShipping(true);
    try {
      const res = await fetch('/api/admin/orders/notify-shipping-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.$id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Error al procesar notificación de datos de envío');
        return;
      }
      setShippingModalData(data);
      setShippingModalOpen(true);
    } catch (err: any) {
      alert(`Error: ${err.message || 'No se pudo contactar al servidor'}`);
    } finally {
      setNotifyingShipping(false);
    }
  };

  const replacementTargetTotal = replacingIdx !== null && order
    ? (() => {
        try {
          const parsed = JSON.parse(order.ITEMS || '[]');
          const it = parsed[replacingIdx];
          return it ? (it.price || 0) * (missingQty || 1) : 0;
        } catch { return 0; }
      })()
    : 0;
  const replacementCurrentSum = replacementSelection.reduce((s, r) => {
    const price = r.product.CURRENTPRICE ?? r.product.PRICE ?? 0;
    return s + price * r.qty;
  }, 0);

  const addToReplacementSelection = (product: any) => {
    setReplacementSelection(prev => {
      const existing = prev.find(r => r.product.$id === product.$id);
      if (existing) {
        return prev.map(r => r.product.$id === product.$id ? { ...r, qty: r.qty + 1 } : r);
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateReplacementQty = (productId: string, delta: number) => {
    setReplacementSelection(prev => prev
      .map(r => r.product.$id === productId ? { ...r, qty: Math.max(1, r.qty + delta) } : r)
      .filter(r => r.qty > 0)
    );
  };

  const removeFromReplacementSelection = (productId: string) => {
    setReplacementSelection(prev => prev.filter(r => r.product.$id !== productId));
  };

  const replaceItemWithMultiple = async () => {
    if (!order || replacingIdx === null || replacementSelection.length === 0) return;
    let parsedItems: any[] = [];
    try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
    const oldItem = parsedItems[replacingIdx];
    if (!oldItem) return;

    const confirmMsg = `¿Reemplazar "${oldItem.name}" por ${replacementSelection.length} producto(s)?\nTotal reemplazo: ${fmt(replacementCurrentSum)}\nOriginal: ${fmt(replacementTargetTotal)}`;
    if (!confirm(confirmMsg)) return;

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      let oldSku = oldItem.sku || '';
      let oldName = oldItem.name || '';
      let oldImg = oldItem.img || '';

      // Delete old product
      if (oldItem.id) {
        try {
          const oldProd: any = await databases.getDocument(databaseId, PRODUCTS_COLLECTION_ID, oldItem.id);
          oldSku = oldProd.sku || getSkuFromFeatures(oldProd.FEATURES, oldProd.TAGS, oldProd.jumpseller_id, oldProd.sku);
          oldName = oldProd.NAME || oldName;
          oldImg = oldProd.IMAGEURL || oldImg;
        } catch {}
      }
      if (oldItem.id) {
        try { await databases.deleteDocument(databaseId, PRODUCTS_COLLECTION_ID, oldItem.id); } catch {}
      }

      // Build replacement items
      const newItems: any[] = replacementSelection.map((r, idx) => {
        const p = r.product;
        const newPrice = p.CURRENTPRICE ?? p.PRICE ?? 0;
        const newSku = p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.sku);
        return {
          id: p.$id,
          name: p.NAME,
          price: newPrice,
          originalPrice: p.CURRENTPRICE ?? p.PRICE ?? 0,
          img: resolveStorageImageUrl(p.IMAGEURL),
          sku: newSku,
          qty: r.qty,
          total: newPrice * r.qty,
          missing: false,
          replaced: true,
          originalItem: idx === 0 ? {
            id: oldItem.id || '',
            name: oldItem.name,
            price: oldItem.price,
            img: oldItem.img || '',
            sku: oldSku
          } : undefined,
        };
      });

      // Replace old item at index with all new items
      parsedItems.splice(replacingIdx, 1, ...newItems);

      const newSubtotal = parsedItems.reduce((s, it) => s + (it.price * it.qty), 0);
      const newTotal = newSubtotal + (order.SHIPPINGCOST || 0) - (order.DISCOUNTAMOUNT || 0);

      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, order.$id, {
        ITEMS: JSON.stringify(parsedItems),
        SUBTOTAL: newSubtotal,
        TOTAL: newTotal
      });

      setReplacingIdx(null);
      setSearchQuery('');
      setSearchResults([]);
      setIsSimilarSearch(false);
      setReplacementSelection([]);
      await load();
      alert('Producto reemplazado por múltiples items exitosamente.');
    } catch (e: any) {
      alert('Error al reemplazar: ' + e.message);
    }
  };

  const revertReplacement = async (index: number) => {
    if (!order) return;
    let parsedItems: any[] = [];
    try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
    const replacedItem = parsedItems[index];
    if (!replacedItem || !replacedItem.replaced) return;

    const origItem = replacedItem.originalItem;
    if (!origItem) {
      alert('No hay información del producto original para revertir.');
      return;
    }

    if (!confirm(`¿Revertir el reemplazo y restaurar "${origItem.name}"?`)) return;

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      // Find all replacement items that share the same originalItem (multi-product replacement)
      const replacementIndices: number[] = [];
      for (let i = 0; i < parsedItems.length; i++) {
        const it = parsedItems[i];
        if (it.replaced && it.originalItem && it.originalItem.id === origItem.id) {
          replacementIndices.push(i);
        }
      }

      // If only one item was replaced, just revert that one
      if (replacementIndices.length === 0) replacementIndices.push(index);

      // Remove replacement items (from highest index to lowest to preserve indices)
      const sortedIndices = [...replacementIndices].sort((a, b) => b - a);
      for (const idx of sortedIndices) {
        parsedItems.splice(idx, 1);
      }

      // Insert original item at the position of the first replacement
      const insertIdx = Math.min(...replacementIndices);
      const restoredItem: any = {
        id: origItem.id || '',
        name: origItem.name,
        price: origItem.price,
        img: origItem.img || '',
        sku: origItem.sku || '',
        qty: replacedItem.qty,
        total: (origItem.price || 0) * (replacedItem.qty || 1),
        missing: false,
        replaced: false,
      };
      parsedItems.splice(insertIdx, 0, restoredItem);

      const newSubtotal = parsedItems.reduce((s, it) => s + (it.price * it.qty), 0);
      const newTotal = newSubtotal + (order.SHIPPINGCOST || 0) - (order.DISCOUNTAMOUNT || 0);

      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, order.$id, {
        ITEMS: JSON.stringify(parsedItems),
        SUBTOTAL: newSubtotal,
        TOTAL: newTotal
      });

      // Re-create the original product document if it was deleted
      if (origItem.id) {
        try {
          await databases.getDocument(databaseId, PRODUCTS_COLLECTION_ID, origItem.id);
        } catch {
          // Product was deleted, recreate it
          try {
            await databases.createDocument(databaseId, PRODUCTS_COLLECTION_ID, origItem.id, {
              NAME: origItem.name,
              PRICE: origItem.price,
              IMAGEURL: origItem.img || '',
              sku: origItem.sku || '',
              STOCK: 1,
            });
          } catch (err) { console.error("Error recreating product:", err); }
        }
      }

      await load();
      alert('Reemplazo revertido. Producto original restaurado.');
    } catch (e: any) {
      alert('Error al revertir: ' + e.message);
    }
  };

  const toggleMissingItem = async (index: number) => {
    if (!order) return;
    let parsedItems: any[] = [];
    try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
    const item = parsedItems[index];
    if (!item) return;

    const isCurrentlyMissing = !!item.missing;
    item.missing = !isCurrentlyMissing;

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, order.$id, {
        ITEMS: JSON.stringify(parsedItems)
      });
      setOrder(prev => prev ? { ...prev, ITEMS: JSON.stringify(parsedItems) } : null);
      // If now missing, clear notification flag so button reappears
      if (isCurrentlyMissing) {
        setNotifiedIndices(prev => { const s = new Set(prev); s.delete(index); return s; });
      }
    } catch (e: any) {
      alert('Error al actualizar el producto: ' + e.message);
    }
  };

  const notifyMissingItemToCustomer = async (index: number, itemName: string) => {
    if (!order || notifyingIdx === index) return;
    setNotifyingIdx(index);
    try {
      const { createNotificationClient, resolveUserIdFromOrder } = await import('@/services/notificationClient');
      const userId = await resolveUserIdFromOrder(order);
      if (!userId) {
        alert('No se pudo encontrar al usuario del pedido para notificar.');
        return;
      }
      const code = order.ORDERCODE || order.$id;
      await createNotificationClient({
        title: '⚠️ Producto sin stock en tu pedido',
        message: `El producto "${itemName}" en tu pedido ${code} no está disponible. Puedes elegir un reemplazo en tu pedido.`,
        type: 'warning',
        userId,
        link: `/pedido/${order.$id}`,
        refKey: `missing:${order.$id}:${index}:${Date.now()}`,
      });
      setNotifiedIndices(prev => new Set(prev).add(index));
      alert('¡Cliente notificado! Verá el aviso al ingresar a la app.');
    } catch (e: any) {
      alert('Error al notificar al cliente: ' + e.message);
    } finally {
      setNotifyingIdx(null);
    }
  };

  const catalogProductsRef = useRef<any[]>([]);
  const ensureCatalogProducts = useCallback(async (): Promise<any[]> => {
    if (catalogProductsRef.current.length > 0) return catalogProductsRef.current;
    try {
      const pr = await fetch('/api/public-data/products?limit=5000&includeOutOfStock=true&includeVendorProducts=true');
      if (pr.ok) {
        const prods = ((await pr.json()).products || []) as any[];
        if (prods.length > 0) {
          catalogProductsRef.current = prods;
          return prods;
        }
      }
    } catch {}
    return [];
  }, []);

  const handleSearchProducts = async (q: string) => {
    setSearchQuery(q);
    const clean = q.trim().toLowerCase();
    if (!clean) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const prods = await ensureCatalogProducts();
      if (prods.length > 0) {
        const filteredProds = prods.filter((p: any) => {
          const name = String(p.NAME || p.name || '').toLowerCase();
          const sku = String(p.SKU || p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.sku) || '').toLowerCase();
          return name.includes(clean) || sku.includes(clean);
        });
        setSearchResults(filteredProds.slice(0, 15));
        return;
      }
      const res = await fetch(`/api/public-data/products?search=${encodeURIComponent(q.trim())}&limit=15&includeOutOfStock=true`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.products || []);
      }
    } catch {} finally {
      setSearching(false);
    }
  };

  const handleSearchBySkuAndReplace = async (skuQuery: string) => {
    const trimmed = skuQuery.trim();
    if (!trimmed) return;
    setSearching(true);
    try {
      const targetUpper = trimmed.toUpperCase();
      const prods = await ensureCatalogProducts();
      let doc = prods.find((p: any) => {
        const pSku = String(p.SKU || p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.sku) || '').trim().toUpperCase();
        return pSku === targetUpper;
      });

      if (!doc) {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        const queriesToTry = Array.from(new Set([trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()]));
        for (const q of queriesToTry) {
          const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
            Query.equal('sku', q),
            Query.limit(1)
          ]);
          if (res.documents.length > 0) {
            doc = res.documents[0];
            break;
          }
        }
      }

      if (doc) {
        await replaceItem(doc);
      } else {
        alert(`No se encontró ningún producto con el SKU "${trimmed}". Asegúrate de que el SKU sea correcto.`);
      }
    } catch (err: any) {
      alert('Error al buscar por SKU: ' + err.message);
    } finally {
      setSearching(false);
    }
  };

  const searchProductsForAdd = async (q: string) => {
    setAddProductSearch(q);
    const clean = q.trim().toLowerCase();
    if (!clean) {
      setAddProductResults([]);
      return;
    }
    try {
      const prods = await ensureCatalogProducts();
      if (prods.length > 0) {
        const exactSku = prods.filter((p: any) => {
          const pSku = String(p.SKU || p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.sku) || '').trim().toLowerCase();
          return pSku === clean;
        });
        if (exactSku.length > 0) {
          setAddProductResults(exactSku.slice(0, 10));
          return;
        }
        const matched = prods.filter((p: any) => {
          const name = String(p.NAME || p.name || '').toLowerCase();
          const pSku = String(p.SKU || p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.sku) || '').toLowerCase();
          return name.includes(clean) || pSku.includes(clean);
        });
        setAddProductResults(matched.slice(0, 30));
        return;
      }
      const res = await fetch(`/api/public-data/products?search=${encodeURIComponent(q.trim())}&limit=30&includeOutOfStock=true`);
      if (res.ok) {
        const data = await res.json();
        setAddProductResults(data.products || []);
      }
    } catch {}
  };

  const searchBySkuAndAdd = async (skuQuery: string) => {
    const trimmed = skuQuery.trim();
    if (!trimmed) return;
    try {
      const targetUpper = trimmed.toUpperCase();
      const prods = await ensureCatalogProducts();
      const foundInRam = prods.find((p: any) => {
        const pSku = String(p.SKU || p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.sku) || '').trim().toUpperCase();
        return pSku === targetUpper;
      });
      if (foundInRam) {
        await addProductToOrder(foundInRam, 1);
        return;
      }
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const uniqueQueries = Array.from(new Set([trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()]));
      for (const q of uniqueQueries) {
        const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
          Query.equal('sku', q),
          Query.limit(1)
        ]);
        if (res.documents.length > 0) {
          await addProductToOrder(res.documents[0], 1);
          return;
        }
      }
      alert(`No se encontró ningún producto con el SKU "${trimmed}".`);
    } catch (e: any) {
      alert('Error al buscar por SKU: ' + e.message);
    }
  };

  const addProductToOrder = async (product: any, qty: number = 1) => {
    if (!order) return;
    setAddingProduct(true);
    try {
      let parsedItems: any[] = [];
      try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}

      const price = product.CURRENTPRICE ?? product.PRICE ?? 0;
      const pSku = product.sku || getSkuFromFeatures(product.FEATURES, product.TAGS, product.jumpseller_id, product.sku);

      const newItem: any = {
        id: product.$id,
        name: product.NAME,
        price,
        originalPrice: product.CURRENTPRICE ?? product.PRICE ?? 0,
        img: resolveStorageImageUrl(product.IMAGEURL),
        sku: pSku,
        qty,
        total: price * qty,
        missing: false,
        replaced: false,
      };

      // Check if same product already exists in order
      const existingIdx = parsedItems.findIndex((x: any) => x.id === product.$id && !x.missing && !x.replaced);
      if (existingIdx !== -1) {
        parsedItems[existingIdx].qty += qty;
        parsedItems[existingIdx].total = parsedItems[existingIdx].price * parsedItems[existingIdx].qty;
      } else {
        parsedItems.push(newItem);
      }

      const newSubtotal = parsedItems.reduce((s, it) => s + (it.price * it.qty), 0);
      const newTotal = newSubtotal + (order.SHIPPINGCOST || 0) - (order.DISCOUNTAMOUNT || 0);

      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, order.$id, {
        ITEMS: JSON.stringify(parsedItems),
        SUBTOTAL: newSubtotal,
        TOTAL: newTotal
      });

      setOrder(prev => prev ? ({
        ...prev,
        ITEMS: JSON.stringify(parsedItems),
        SUBTOTAL: newSubtotal,
        TOTAL: newTotal,
      } as Order) : prev);
      if (product.$id) {
        const s = Number(product.STOCK ?? product.stock ?? 0);
        setProductStocks(prev => ({ ...prev, [product.$id]: s, ...(pSku ? { [pSku]: s } : {}) }));
        setProductSkus(prev => ({ ...prev, [product.$id]: pSku }));
        setProductPrices(prev => ({ ...prev, [product.$id]: price }));
      }
      setAddProductSearch('');
      setAddProductResults([]);
      setShowAddProduct(false);
    } catch (e: any) {
      alert('Error al añadir producto: ' + e.message);
    } finally {
      setAddingProduct(false);
    }
  };

  const handleUpdateQty = async (index: number, newQty: number) => {
    if (!order) return;
    let parsedItems: any[] = [];
    try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
    const targetItem = parsedItems[index];
    if (!targetItem) return;

    if (newQty === 0) {
      if (!confirm('¿Eliminar este producto de la orden?')) return;
      parsedItems.splice(index, 1);
    } else {
      targetItem.qty = newQty;
      targetItem.total = targetItem.price * newQty;
    }

    const newSubtotal = parsedItems.reduce((s, x) => s + (x.price * x.qty), 0);
    const newTotal = newSubtotal + (order.SHIPPINGCOST || 0) - (order.DISCOUNTAMOUNT || 0);

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, order.$id, {
        ITEMS: JSON.stringify(parsedItems),
        SUBTOTAL: newSubtotal,
        TOTAL: newTotal
      });
      setOrder(prev => prev ? ({
        ...prev,
        ITEMS: JSON.stringify(parsedItems),
        SUBTOTAL: newSubtotal,
        TOTAL: newTotal,
      } as Order) : prev);
    } catch (err: any) {
      alert('Error al actualizar cantidad: ' + err.message);
    }
  };

  const handleOpenSimilarSearch = async (index: number) => {
    const oldItem = items[index];
    if (!oldItem) return;

    let initialMissing = oldItem.qty || 1;
    if (oldItem.qty > 1) {
      const input = prompt(`¿Cuántas unidades faltan de "${oldItem.name}"? (Máx: ${oldItem.qty})`, oldItem.qty.toString());
      if (input === null) return; // cancelado
      const parsed = parseInt(input, 10);
      if (isNaN(parsed) || parsed <= 0 || parsed > oldItem.qty) {
        alert("Cantidad inválida");
        return;
      }
      initialMissing = parsed;
    }

    setMissingQty(initialMissing);
    setReplacingIdx(index);
    setIsSimilarSearch(true);
    setSearching(true);
    setSearchQuery('');
    setSearchResults([]);

    const targetPrice = oldItem.price || 0;
    const totalMissingPrice = targetPrice * initialMissing;

    // Rango de consulta: nunca más de un 10% de diferencia, pero mínimo 150 pesos
    const variance = Math.max(150, totalMissingPrice * 0.10);
    const minDiscounted = Math.max(0, totalMissingPrice - variance);
    const maxDiscounted = totalMissingPrice + variance;

    // Para combinaciones (ej. 2 de 500), buscamos productos cuyo precio unitario pueda multiplicar para llegar al total
    // Buscamos productos desde un precio mucho menor (ej. total / 4) hasta el maxDiscounted
    const minUnitDiscounted = Math.max(0, (totalMissingPrice / 4) - variance);
    const minPriceLimit = Math.round(minUnitDiscounted);
    const maxPriceLimit = Math.round(maxDiscounted);

    try {
      const allCatalog = await ensureCatalogProducts();
      const prods = allCatalog.filter((p: any) => {
        const pPrice = Number(p.CURRENTPRICE ?? p.PRICE ?? 0);
        const pStock = Number(p.STOCK ?? p.stock ?? 0);
        return pStock > 0 && pPrice >= minPriceLimit && pPrice <= maxPriceLimit;
      });

      // Palabras clave del producto original para similitud
      const keywords = oldItem.name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);

      // Filtrar y calcular la mejor cantidad (combinaciones)
      const validCombinations: any[] = [];
      for (const p of prods) {
        if (p.$id === oldItem.id) continue;
        const pPrice = p.CURRENTPRICE ?? p.PRICE ?? 0;
        if (pPrice <= 0) continue;

        // ¿Cuántas unidades de p nos acercan más al totalMissingPrice?
        const bestQty = Math.max(1, Math.round(totalMissingPrice / pPrice));
        const comboTotal = bestQty * pPrice;
        
        // Si el total de esta combinación está dentro del margen de varianza permitido:
        if (Math.abs(comboTotal - totalMissingPrice) <= variance) {
          // Calcular score de similitud
          let score = 0;
          const pName = p.NAME.toLowerCase();
          for (const kw of keywords) {
            if (pName.includes(kw)) score += 10;
          }
          
          // Castigo leve si la diferencia de precio es mayor
          const priceDiff = Math.abs(comboTotal - totalMissingPrice);
          score -= (priceDiff / 100);

          validCombinations.push({ ...p, _bestQty: bestQty, _score: score, _comboTotal: comboTotal });
        }
      }

      // Sort by score (descending), then by combo total (descending)
      validCombinations.sort((a, b) => b._score - a._score || b._comboTotal - a._comboTotal);

      setSearchResults(validCombinations);
    } catch (e) {
      console.error("Error finding similar products:", e);
    } finally {
      setSearching(false);
    }
  };

  const handleDownloadSimilarCatalog = async () => {
    if (replacingIdx === null || !items[replacingIdx]) return;
    if (searchResults.length === 0) {
      alert("No hay opciones disponibles para descargar.");
      return;
    }

    const oldItem = items[replacingIdx];
    const topResults = searchResults.slice(0, 12);
    const fmtP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);

    // Fetch image via same-origin proxy and convert to data URL to avoid canvas tainting
    const fetchAsDataUrl = async (url: string): Promise<string | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    };

    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(new Image());
        img.src = src;
      });
    };

    // Load all images: fetch as data URL first, then load into Image
    // If fetch fails, use empty image - NEVER load directly as it taints canvas
    const images: HTMLImageElement[] = [];
    for (const p of topResults) {
      const rawUrl = p.IMAGEURL ? resolveStorageImageUrl(p.IMAGEURL) : '';
      if (rawUrl) {
        if (rawUrl.startsWith('data:')) {
          images.push(await loadImage(rawUrl));
        } else {
          // Ensure URL goes through our same-origin proxy
          const fetchUrl = rawUrl.startsWith('/api/image')
            ? rawUrl
            : `/api/image?url=${encodeURIComponent(rawUrl)}`;
          const dataUrl = await fetchAsDataUrl(fetchUrl);
          if (dataUrl) {
            images.push(await loadImage(dataUrl));
          } else {
            images.push(new Image());
          }
        }
      } else {
        images.push(new Image());
      }
    }

    // Generate canvas image with up to 6 products
    const generateImage = (subset: typeof topResults, imgSubset: HTMLImageElement[], partNum: number, totalParts: number) => {
      const cols = 3;
      const rows = Math.ceil(subset.length / cols);
      const cellW = 280;
      const cellH = 300;
      const padding = 20;
      const headerH = 80;
      const canvasW = cols * cellW + (cols + 1) * padding;
      const canvasH = headerH + rows * cellH + (rows + 1) * padding;

      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Header - pink
      ctx.fillStyle = '#db2777';
      ctx.fillRect(0, 0, canvasW, headerH);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Opciones de reemplazo: ${oldItem?.name || ''}`, canvasW / 2, 32);
      ctx.font = '14px Arial';
      ctx.fillStyle = '#fbcfe8';
      ctx.fillText(`Meta: ${fmtP(replacementTargetTotal)} · Parte ${partNum}/${totalParts}`, canvasW / 2, 58);

      // Draw each product
      subset.forEach((p, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = padding + col * (cellW + padding);
        const y = headerH + padding + row * (cellH + padding);

        // Card
        ctx.fillStyle = '#fdf2f8';
        ctx.fillRect(x, y, cellW, cellH);
        ctx.strokeStyle = '#fbcfe8';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellW, cellH);

        // Number badge - pink
        ctx.fillStyle = '#db2777';
        ctx.beginPath();
        ctx.arc(x + 18, y + 18, 14, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${idx + 1}`, x + 18, y + 23);

        // Image - big, centered
        const img = imgSubset[idx];
        const imgSize = 180;
        const imgX = x + (cellW - imgSize) / 2;
        const imgY = y + 20;
        if (img && img.width > 0 && img.height > 0) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(imgX, imgY, imgSize, imgSize);
          const ratio = Math.min(imgSize / img.width, imgSize / img.height);
          const dw = img.width * ratio;
          const dh = img.height * ratio;
          ctx.drawImage(img, imgX + (imgSize - dw) / 2, imgY + (imgSize - dh) / 2, dw, dh);
        } else {
          ctx.fillStyle = '#f3f4f6';
          ctx.fillRect(imgX, imgY, imgSize, imgSize);
          ctx.fillStyle = '#9ca3af';
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('Sin imagen', imgX + imgSize / 2, imgY + imgSize / 2);
        }

        // Info below image
        const infoY = imgY + imgSize + 12;
        ctx.textAlign = 'center';

        const originalPrice = p.CURRENTPRICE ?? p.PRICE ?? 0;
        const price = originalPrice;
        const isCombo = p._bestQty && p._bestQty > 1;
        const productTotal = isCombo ? (p._comboTotal || price * p._bestQty) : price;
        const diff = productTotal - replacementTargetTotal;
        const pSku = p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.sku) || '—';
        const name = isCombo ? `(${p._bestQty} uds) ${p.NAME}` : (p.NAME || 'Producto');

        // Name
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 13px Arial';
        const maxChars = 38;
        const displayName = name.length > maxChars ? name.slice(0, maxChars) + '...' : name;
        ctx.fillText(displayName, x + cellW / 2, infoY);

        // SKU
        ctx.fillStyle = '#6b7280';
        ctx.font = '11px Arial';
        ctx.fillText(`SKU: ${pSku}`, x + cellW / 2, infoY + 18);

        // Price
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 15px Arial';
        ctx.fillText(fmtP(productTotal), x + cellW / 2, infoY + 40);

        // Only saldo a favor
        if (diff > 0) {
          ctx.fillStyle = '#059669';
          ctx.font = 'bold 12px Arial';
          ctx.fillText(`Saldo a favor: +${fmtP(diff)}`, x + cellW / 2, infoY + 60);
        }
      });

      // Download as PNG
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `reemplazo_${oldItem?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'producto'}_parte${partNum}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return true;
      } catch (e) {
        console.error('Canvas export failed', e);
        return false;
      }
    };

    // Generate both images
    const part1 = topResults.slice(0, 6);
    const part2 = topResults.slice(6, 12);
    const img1 = images.slice(0, 6);
    const img2 = images.slice(6, 12);

    const totalParts = part2.length > 0 ? 2 : 1;
    await new Promise<void>(resolve => {
      generateImage(part1, img1, 1, totalParts);
      setTimeout(resolve, 800);
    });
    if (part2.length > 0) {
      generateImage(part2, img2, 2, totalParts);
    }
  };

  const replaceItem = async (newProduct: any) => {
    if (!order || replacingIdx === null) return;
    let parsedItems: any[] = [];
    try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
    const oldItem = parsedItems[replacingIdx];
    if (!oldItem) return;

    const confirmMsg = `¿Reemplazar "${oldItem.name}" por "${newProduct.NAME}"?\nSe registrará el bloqueo del SKU y se eliminará de la tienda.`;
    if (!confirm(confirmMsg)) return;

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      let oldSku = oldItem.sku || '';
      let oldName = oldItem.name;
      let oldImg = oldItem.img || '';

      if (oldItem.id) {
        try {
          const oldProd: any = await databases.getDocument(databaseId, PRODUCTS_COLLECTION_ID, oldItem.id);
          oldSku = oldProd.sku || getSkuFromFeatures(oldProd.FEATURES, oldProd.TAGS, oldProd.jumpseller_id, oldProd.sku);
          oldName = oldProd.NAME || oldName;
          oldImg = oldProd.IMAGEURL || oldImg;
        } catch {
          try {
            const nameSearchRes = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
              Query.equal('NAME', oldItem.name),
              Query.limit(1)
            ]);
            if (nameSearchRes.documents.length > 0) {
              const oldProd = nameSearchRes.documents[0] as any;
              oldSku = oldProd.sku || getSkuFromFeatures(oldProd.FEATURES, oldProd.TAGS, oldProd.jumpseller_id, oldProd.sku);
              oldName = oldProd.NAME || oldName;
              oldImg = oldProd.IMAGEURL || oldImg;
            }
          } catch (errName) {
            console.error("Error doing name fallback search for blocked products:", errName);
          }
        }
      }

      if (oldItem.id) {
        try {
          await databases.deleteDocument(databaseId, PRODUCTS_COLLECTION_ID, oldItem.id);
        } catch {}
      }

      const newPrice = newProduct.CURRENTPRICE ?? newProduct.PRICE ?? 0;
      const newSku = newProduct.sku || getSkuFromFeatures(newProduct.FEATURES, newProduct.TAGS, newProduct.jumpseller_id, newProduct.sku);

      const totalMissingPrice = missingQty * (oldItem.price || 0);
      const isCloserToTotal = Math.abs(newPrice - totalMissingPrice) < Math.abs(newPrice - (oldItem.price || 0));
      const newQty = newProduct._bestQty || (isCloserToTotal ? 1 : missingQty);

      const newReplacedItem = {
        ...oldItem,
        id: newProduct.$id,
        name: newProduct.NAME,
        price: newPrice,
        originalPrice: newProduct.CURRENTPRICE ?? newProduct.PRICE ?? 0,
        img: resolveStorageImageUrl(newProduct.IMAGEURL),
        sku: newSku,
        qty: newQty,
        total: newPrice * newQty,
        missing: false,
        replaced: true,
        originalItem: {
          id: oldItem.id || '',
          name: oldItem.name,
          price: oldItem.price,
          img: oldItem.img || '',
          sku: oldSku
        }
      };

      // Reemplazo total siempre para evitar items duplicados o divididos por error
      parsedItems[replacingIdx] = newReplacedItem;

      const newSubtotal = parsedItems.reduce((s, it) => s + (it.price * it.qty), 0);
      const newTotal = newSubtotal + (order.SHIPPINGCOST || 0) - (order.DISCOUNTAMOUNT || 0);

      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, order.$id, {
        ITEMS: JSON.stringify(parsedItems),
        SUBTOTAL: newSubtotal,
        TOTAL: newTotal
      });

      setReplacingIdx(null);
      setSearchQuery('');
      setSearchResults([]);
      setIsSimilarSearch(false);
      await load();
      alert('Producto reemplazado exitosamente.');
    } catch (e: any) {
      alert('Error al reemplazar el producto: ' + e.message);
    }
  };

  // Auto-print when status changes to 'payment_confirmed' (Pago Confirmado)
  useEffect(() => {
    if (!order) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = order.STATUS;
    if (prev && prev !== 'payment_confirmed' && order.STATUS === 'payment_confirmed') {
      setTimeout(() => window.print(), 500);
    }
  }, [order?.STATUS]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const doc = await databases.getDocument(databaseId, ORDERS_COLLECTION_ID, orderId);
      const o = doc as unknown as Order;
      setOrder(o);
      prevStatusRef.current = o.STATUS;
      setAdminNotes(o.adminNotes || '');
      setTrackingNumber((o as any).TRACKINGNUMBER || '');

      // Fetch product stocks
      let items: { id?: string }[] = [];
      try { items = JSON.parse(o.ITEMS || '[]'); } catch {}

      // Mapa de imágenes y datos de stock/SKU/ubicación desde el catálogo cacheado en RAM (0 lecturas Firestore)
      let catalogList: any[] = [];
      if (items.length > 0) {
        try {
          catalogList = await ensureCatalogProducts();
          if (catalogList.length > 0) {
            const byId: Record<string, string> = {};
            const bySku: Record<string, string> = {};
            const byName: Record<string, string> = {};
            for (const p of catalogList) {
              const img = getProductImageUrl(p);
              if (!img) continue;
              if (p.$id) byId[p.$id] = img;
              const sku = p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.sku);
              if (sku) bySku[String(sku).toLowerCase().trim()] = img;
              if (p.NAME) byName[normNameKey(p.NAME)] = img;
            }
            setItemImages({ byId, bySku, byName });
          }
        } catch { /* si falla, se muestra el placeholder */ }
      }

      const productIds = items.map(it => it.id).filter((id): id is string => Boolean(id));
      if (productIds.length > 0 || items.some(it => (it as any).sku)) {
        const stocks: Record<string, number> = {};
        const locs: Record<string, ProductWarehouseLocation> = {};
        const skus: Record<string, string> = {};
        const boxCodes: Record<string, string> = {};
        const prices: Record<string, number> = {};
        const barcodes: Record<string, string> = {};

        try {
          const catalogById = new Map<string, any>();
          const catalogBySku = new Map<string, any>();
          for (const p of catalogList) {
            if (p.$id) catalogById.set(String(p.$id), p);
            const cSku = String(p.SKU || p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.sku) || '').trim();
            if (cSku) {
              catalogBySku.set(cSku, p);
              catalogBySku.set(cSku.toUpperCase(), p);
              catalogBySku.set(cSku.toLowerCase(), p);
            }
          }

          const applyProductDoc = (doc: any, fallbackKey?: string) => {
            if (!doc) return;
            const pid = doc.$id || fallbackKey;
            if (!pid) return;
            const s = doc.STOCK !== undefined ? Number(doc.STOCK) : (doc.stock !== undefined ? Number(doc.stock) : 0);
            const numStock = isNaN(s) ? 0 : s;
            stocks[pid] = numStock;
            if (fallbackKey) stocks[fallbackKey] = numStock;
            if (doc.sku) stocks[String(doc.sku)] = numStock;
            if (doc.SKU) stocks[String(doc.SKU)] = numStock;
            const targetKey = fallbackKey || pid;
            locs[targetKey] = getWarehouseLocationFromFeatures(doc.FEATURES, doc.section);
            skus[targetKey] = getSkuFromFeatures(doc.FEATURES, doc.TAGS, doc.jumpseller_id, doc.sku || doc.SKU);
            boxCodes[targetKey] = String(doc.BOX_CODE || doc.box_code || doc.boxCode || '').trim();
            prices[targetKey] = doc.PRICE || 0;
            barcodes[targetKey] = getBarcodeFromFeatures(doc.FEATURES, doc.barcode || doc.BARCODE);
            if (pid !== targetKey) {
              locs[pid] = locs[targetKey];
              skus[pid] = skus[targetKey];
              boxCodes[pid] = boxCodes[targetKey];
              prices[pid] = prices[targetKey];
              barcodes[pid] = barcodes[targetKey];
            }
          };

          // 1. Resolver primero desde el catálogo en memoria (0 lecturas a Firestore)
          const missingPids: string[] = [];
          for (const pid of productIds) {
            const fromCat = catalogById.get(pid);
            if (fromCat) {
              applyProductDoc(fromCat);
            } else {
              missingPids.push(pid);
            }
          }

          // 2. Solo consultar en Firestore los IDs que no existan en el catálogo público
          if (missingPids.length > 0) {
            const productDocs = await Promise.all(
              missingPids.map(async (pid) => {
                try {
                  return await databases.getDocument(databaseId, PRODUCTS_COLLECTION_ID, pid);
                } catch {
                  return null;
                }
              })
            );
            for (const product of productDocs) {
              if (!product) continue;
              applyProductDoc(product);
              const doc = product as any;
              const resolved = getProductImageUrl(doc);
              if (resolved && doc.$id) {
                setItemImages(prev => {
                  if (prev.byId[doc.$id]) return prev;
                  return {
                    ...prev,
                    byId: { ...prev.byId, [doc.$id]: resolved },
                    byName: doc.NAME ? { ...prev.byName, [normNameKey(doc.NAME)]: resolved } : prev.byName,
                  };
                });
              }
            }
          }

          // 3. Fallback por SKU para items que no se hayan encontrado por doc ID
          const missingSkuItems = items.filter(it => (!it.id || stocks[it.id] === undefined) && (it as any).sku);
          if (missingSkuItems.length > 0) {
            await Promise.all(missingSkuItems.map(async (it: any) => {
              const rawSku = String(it.sku || '').trim();
              const fromCatSku = catalogBySku.get(rawSku) || catalogBySku.get(rawSku.toUpperCase()) || catalogBySku.get(rawSku.toLowerCase());
              if (fromCatSku) {
                applyProductDoc(fromCatSku, it.id || rawSku);
                return;
              }
              try {
                let res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
                  Query.equal('sku', rawSku),
                  Query.limit(1)
                ]);
                if (res.documents.length === 0) {
                  res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
                    Query.equal('SKU', rawSku),
                    Query.limit(1)
                  ]);
                }
                if (res.documents.length > 0) {
                  applyProductDoc(res.documents[0], it.id || rawSku);
                }
              } catch {}
            }));
          }
        } catch {}

        setProductStocks(stocks);
        setProductLocations(locs);
        setProductSkus(skus);
        setProductBoxCodes(boxCodes);
        setProductPrices(prices);
        setProductBarcodes(barcodes);
      } else {
        setProductLocations({});
        setProductBoxCodes({});
      }
    } catch (e: any) {
      setError(e.message || 'Error al cargar el pedido');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Resuelve la imagen de un item: primero el catálogo (ya resuelto y proxyado
  // via /api/image), luego la URL guardada en el pedido, luego por sku y nombre.
  // Con absolute=true la vuelve absoluta (para el PDF que abre otra ventana).
  const itemImage = useCallback((it: any, absolute = false): string => {
    let img = '';
    // 1. Catálogo por ID (ya resuelto via /api/image — más confiable)
    if (it?.id && itemImages.byId[it.id]) img = itemImages.byId[it.id];
    // 2. URL directa guardada en el pedido (puede ser URL externa rota)
    if (!img) {
      const direct = it?.img || it?.imageUrl;
      if (direct) img = resolveStorageImageUrl(direct);
    }
    // 3. Por SKU
    if (!img) {
      const sku = it?.sku ? String(it.sku).toLowerCase().trim() : '';
      if (sku && itemImages.bySku[sku]) img = itemImages.bySku[sku];
    }
    // 4. Por nombre
    if (!img) {
      const nm = normNameKey(it?.name);
      if (nm && itemImages.byName[nm]) img = itemImages.byName[nm];
    }
    if (absolute && img.startsWith('/') && typeof window !== 'undefined') img = window.location.origin + img;
    return img;
  }, [itemImages]);

  const itemBoxCode = (it: any): string => resolveBoxCode({
    sku: String((it?.id && productSkus[it.id]) || it?.sku || it?.SKU || ''),
    boxCode: String((it?.id && productBoxCodes[it.id]) || (it?.sku && productBoxCodes[it.sku]) || it?.BOX_CODE || it?.box_code || it?.boxCode || ''),
    codigoCaja: String(it?.codigoCaja || it?.codigo_caja || ''),
  });

  // Reverse-geocode de las coords GPS del cliente → dirección detectada (región/comuna)
  useEffect(() => {
    const info = order?.ADDITIONALINFO || '';
    const m = info.match(/\[GEO:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/);
    if (!m) { setDetectedAddr(null); return; }
    let cancelled = false;
    setGeoLoading(true);
    fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${m[1]}&longitude=${m[2]}&localityLanguage=es`)
      .then(r => r.json())
      .then((d: any) => {
        if (cancelled) return;
        const region = d.principalSubdivision || '';
        const comuna = d.city || d.locality || '';
        const full = Array.from(new Set([d.locality, d.city, d.principalSubdivision, d.countryName].filter(Boolean))).join(', ');
        setDetectedAddr({ region, comuna, full });
      })
      .catch(() => { if (!cancelled) setDetectedAddr(null); })
      .finally(() => { if (!cancelled) setGeoLoading(false); });
    return () => { cancelled = true; };
  }, [order?.ADDITIONALINFO]);

  useEffect(() => {
    if (selectedPaymentProof) {
      if (isPdfUrl(selectedPaymentProof)) {
        setSelectedPaymentProofIsPdf(true);
      } else {
        // Usar el proxy para evitar bloqueo CORS de Firebase Storage
        const proxyUrl = `/api/media-proxy?url=${encodeURIComponent(selectedPaymentProof)}`;
        fetch(proxyUrl, { method: 'HEAD' })
          .then(res => {
            const contentType = res.headers.get('content-type');
            if (contentType?.includes('application/pdf')) {
              setSelectedPaymentProofIsPdf(true);
            } else {
              setSelectedPaymentProofIsPdf(false);
            }
          })
          .catch(err => {
            console.warn('Error checking payment proof Content-Type:', err);
            setSelectedPaymentProofIsPdf(false);
          });
      }
    } else {
      setSelectedPaymentProofIsPdf(false);
    }

    if (order?.SHIPPINGPROOFURL) {
      if (isPdfUrl(order.SHIPPINGPROOFURL)) {
        setShippingProofIsPdf(true);
      } else {
        // Usar el proxy para evitar bloqueo CORS de Firebase Storage
        const proxyUrl = `/api/media-proxy?url=${encodeURIComponent(order.SHIPPINGPROOFURL)}`;
        fetch(proxyUrl, { method: 'HEAD' })
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
  }, [selectedPaymentProof, order?.SHIPPINGPROOFURL]);

  // Load agencies for the selector
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agencies');
        const data = await res.json();
        if (data.agencies) setAgencies(data.agencies);
      } catch {}
    })();
  }, []);

  const saveAgency = async () => {
    if (!order || !selectedAgency) return;
    setSavingAgency(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, order.$id, {
        SHIPPINGAGENCY: selectedAgency,
      });
      setOrder(prev => prev ? { ...prev, SHIPPINGAGENCY: selectedAgency, AGENCYCHANGED: true } as Order : prev);
      setEditingAgency(false);
    } catch (e: any) {
      console.error('Error updating agency:', e?.message);
    } finally {
      setSavingAgency(false);
    }
  };

  const saveCustomerData = async () => {
    if (!order) return;
    setSavingCustomer(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const updates: Record<string, any> = {};
      if (customerForm.name) updates.CUSTOMERNAME = customerForm.name;
      if (customerForm.rut !== undefined) updates.CUSTOMERRUT = customerForm.rut;
      if (customerForm.phone) updates.CUSTOMERPHONE = customerForm.phone;
      if (customerForm.email !== undefined) updates.CUSTOMEREMAIL = customerForm.email;
      if (customerForm.address !== undefined) updates.ADDRESS = customerForm.address;
      if (customerForm.comuna !== undefined) updates.COMUNA = customerForm.comuna;
      if (customerForm.region !== undefined) updates.REGION = customerForm.region;
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, order.$id, updates);
      setOrder(prev => prev ? { ...prev, ...updates } as Order : prev);
      setEditingCustomer(false);
    } catch (e: any) {
      console.error('Error updating customer data:', e?.message);
    } finally {
      setSavingCustomer(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!order) return;
    const prevStatus = order.STATUS;
    // Actualización optimista: cambiar visualmente altiro
    setOrder(prev => prev ? { ...prev, STATUS: newStatus as OrderStatus } : prev);
    setUpdating(true);
    try {
      const res = await fetch('/api/admin/orders/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.$id, newStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        // Revertir si falla
        setOrder(prev => prev ? { ...prev, STATUS: prevStatus as OrderStatus } : prev);
        throw new Error(data.error || 'Error al actualizar el estado del pedido');
      }

      // No llamar revalidate desde el cliente: el API ya lo hace server-side.
      // Llamarlo aquí puede causar que Next.js re-renderice y pise el estado optimista.
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setUpdating(false);
    }
  };

  const saveNotes = async () => {
    if (!order) return;
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, order.$id, {
        adminNotes: adminNotes.trim(),
      });
      setOrder(prev => prev ? { ...prev, adminNotes: adminNotes.trim() } : prev);
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

  const copyOrderItemsList = (type: 'barcode' | 'sku') => {
    if (!order) return;
    let parsedItems: any[] = [];
    try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
    
    const lines = parsedItems.map(it => {
      let code = '';
      if (type === 'barcode') {
        if (it.id) {
          code = productBarcodes[it.id] || '';
        }
        if (!code) {
          code = (it as any).barcode || '';
        }
        if (!code && it.id) {
          code = productSkus[it.id] || '';
        }
        if (!code) {
          code = it.sku || '';
        }
      } else {
        if (it.id) {
          code = productSkus[it.id] || '';
        }
        if (!code) {
          code = it.sku || '';
        }
        if (!code && it.id) {
          code = productBarcodes[it.id] || '';
        }
        if (!code) {
          code = (it as any).barcode || '';
        }
      }
      
      if (!code) {
        code = it.id || it.name || '';
      }
      
      const qty = it.qty || 1;
      
      let origPrice = 0;
      if (it.id) {
        origPrice = productPrices[it.id] || 0;
      }
      if (!origPrice) {
        origPrice = it.originalPrice || it.price || 0;
      }
      
      return `${code},${qty},${origPrice}`;
    });
    
    const textToCopy = lines.join('\n');
    navigator.clipboard.writeText(textToCopy);
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
          <Link href="/admin/orders" className="ml-auto px-4 py-2 bg-white border border-red-200 rounded-xl text-sm text-red-700 hover:bg-red-50">
            Volver
          </Link>
        </div>
      </div>
    );
  }

  let items: { name: string; qty: number; price: number; total: number; img?: string; id?: string; originalPrice?: number | null }[] = [];
  try { items = JSON.parse(order.ITEMS || '[]'); } catch {}
  const date = order.CREATEDAT ? new Date(order.CREATEDAT) : new Date(order.$createdAt);
  const ageMs = Date.now() - date.getTime();
  const isOverdue = order.STATUS === 'payment_expired';
  const scRaw = STATUS_CONFIG[order.STATUS] || STATUS_CONFIG.pending;
  const isRetiro = order.SHIPPINGAGENCY?.toUpperCase() === 'RETIRO EN TIENDA';
  const isReadyRetiro = order.STATUS === 'shipped' && isRetiro;
  const sc = {
    ...scRaw,
    label: isReadyRetiro ? 'Listo para retirar' : displayStatusLabel(order.STATUS, order.SHIPPINGAGENCY),
    bg: isReadyRetiro ? 'bg-fuchsia-50' : scRaw.bg,
    text: isReadyRetiro ? 'text-fuchsia-700' : scRaw.text,
    border: isReadyRetiro ? 'border-fuchsia-200' : scRaw.border,
    dot: isReadyRetiro ? 'bg-fuchsia-400' : scRaw.dot,
    icon: isReadyRetiro ? '🛍️' : scRaw.icon,
  };
  const customerNote = (order as any).CUSTOMERNOTE;
  const isGift = (order as any).ISGIFT;
  const isLive = (order as any).PURCHASEDFROMLIVE;

  const effectiveStatus = (['pending', 'pending_stock', 'processing'].includes(order.STATUS)) ? 'paid' : order.STATUS;
  const currentStepIdx = STATUS_FLOW.indexOf(effectiveStatus);
  const isCancelled = order.STATUS === 'cancelled';

  const rawAdditionalInfo = order.ADDITIONALINFO || '';
  const geoMatch = rawAdditionalInfo.match(/\[GEO:(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)\]/);
  const isGeolocated = !!geoMatch;
  const geoLat = geoMatch ? geoMatch[1] : null;
  const geoLng = geoMatch ? geoMatch[3] : null;
  const displayAdditionalInfo = geoMatch
    ? rawAdditionalInfo.replace(geoMatch[0], '').trim()
    : rawAdditionalInfo;

  // Comparación dirección ingresada vs. detectada por GPS
  const normTxt = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
  const fieldMatch = (a?: string, b?: string) => {
    const na = normTxt(a), nb = normTxt(b);
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
  };
  const comunaMatches = fieldMatch(order.COMUNA, detectedAddr?.comuna);
  const regionMatches = fieldMatch(order.REGION, detectedAddr?.region);
  const geoAddressMatches = !!detectedAddr && comunaMatches && regionMatches;

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === 'cancelled') {
      if (!confirm('¿Cancelar este pedido? El stock será devuelto.')) return;
      updateStatus(newStatus);
      return;
    }

    // Validate: cannot set to "delivered" without shipping proof photo or tracking number
    if (newStatus === 'delivered') {
      const hasShippingProof = !!(order as any)?.SHIPPINGPROOFURL;
      const hasTrackingNumber = !!(order as any)?.TRACKINGNUMBER;
      if (!hasShippingProof && !hasTrackingNumber) {
        setDeliveredModalOpen(true);
        return;
      }
    }

    updateStatus(newStatus);
  };

  const submitDeliveredModal = async () => {
    if (!order) return;
    if (deliveredModalMode === 'photo' && !deliveredModalFile) { alert('Selecciona una foto'); return; }
    if (deliveredModalMode === 'tracking' && !deliveredModalTracking.trim()) { alert('Ingresa el número de seguimiento'); return; }
    setDeliveredModalUploading(true);
    try {
      const formData = new FormData();
      formData.append('orderId', order.$id);
      if (deliveredModalMode === 'photo' && deliveredModalFile) formData.append('file', deliveredModalFile);
      if (deliveredModalMode === 'tracking' && deliveredModalTracking.trim()) formData.append('trackingNumber', deliveredModalTracking.trim());
      const res = await fetch('/api/admin/orders/shipping-proof', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al guardar');
      setOrder(prev => prev ? { ...prev, SHIPPINGPROOFURL: data.shippingProofUrl || prev.SHIPPINGPROOFURL, TRACKINGNUMBER: data.trackingNumber || (prev as any).TRACKINGNUMBER } as any : prev);
      closeDeliveredModal();
      updateStatus('delivered');
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setDeliveredModalUploading(false);
    }
  };

  const closeDeliveredModal = () => {
    setDeliveredModalOpen(false);
    setDeliveredModalMode(null);
    setDeliveredModalFile(null);
    setDeliveredModalTracking('');
    setDeliveredModalUploading(false);
  };

  const handleAdminUploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !order) return;
    const current = parsePaymentProofs(order.PAYMENTPROOFURL);
    if (current.length >= MAX_PAYMENT_PROOFS) {
      alert('Solo se permiten hasta 3 comprobantes de pago');
      return;
    }
    setUploadingProof(true);
    try {
      const { storage, databases } = getServices();
      const { databaseId, endpoint, projectId } = getFirebaseConfig();
      const fileId = ID.unique();
      await storage.createFile(MEDIA_BUCKET_ID, fileId, file);
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const url = `${endpoint}/storage/buckets/${MEDIA_BUCKET_ID}/files/${fileId}/view?project=${projectId}&ext=${ext}`;
      const allProofs = serializePaymentProofs([...current, url]);
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, orderId, {
        PAYMENTPROOFURL: allProofs,
        STATUS: ['pending', 'pending_stock', 'processing', 'paid', 'payment_review'].includes(order.STATUS) ? 'payment_review' : order.STATUS,
      });
      await load();
    } catch (err: any) {
      alert('Error al subir comprobante: ' + (err?.message || err));
    } finally {
      setUploadingProof(false);
    }
  };

  const handleAdminDeleteProof = async (index: number) => {
    if (!order) return;
    const current = parsePaymentProofs(order.PAYMENTPROOFURL);
    if (index < 0 || index >= current.length) return;
    if (!confirm('¿Seguro que deseas eliminar este comprobante de pago?')) return;
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      current.splice(index, 1);
      const remaining = serializePaymentProofs([...current]);
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, orderId, {
        PAYMENTPROOFURL: remaining,
      });
      setOrder(prev => prev ? { ...prev, PAYMENTPROOFURL: remaining } : prev);
      alert('Comprobante de pago eliminado correctamente.');
      await load();
    } catch (err: any) {
      alert('Error al eliminar comprobante de pago: ' + (err?.message || err));
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

      // El voucher/comprobante de envío solo se adjunta; no fuerza cambio de estado
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, orderId, {
        SHIPPINGPROOFURL: url,
        UPDATEDAT: Date.now(),
      });
      setOrder(prev => prev ? { ...prev, SHIPPINGPROOFURL: url } : prev);

      // Abrir automáticamente el comprobante PDF/imagen en el navegador
      window.open(url, '_blank');

      await load();
    } catch (err: any) {
      alert('Error al subir comprobante de envío: ' + (err?.message || err));
    } finally {
      setUploadingShippingProof(false);
    }
  };

  const handleSaveTracking = async () => {
    if (!order) return;
    setSavingTracking(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, orderId, {
        TRACKINGNUMBER: trackingNumber,
      });
      setOrder(prev => prev ? { ...prev, TRACKINGNUMBER: trackingNumber } as any : prev);
      setEditingTracking(false);
      alert('Número de seguimiento guardado.');
    } catch (err: any) {
      alert('Error al guardar el número de seguimiento: ' + (err.message || err));
    } finally {
      setSavingTracking(false);
    }
  };

  const handleAdminDeleteShippingProof = async () => {
    if (!order) return;
    if (!confirm('¿Seguro que deseas eliminar el comprobante de envío?')) return;
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, orderId, {
        SHIPPINGPROOFURL: '',
      });
      setOrder(prev => prev ? { ...prev, SHIPPINGPROOFURL: '' } : prev);
      alert('Comprobante de envío eliminado correctamente.');
      await load();
    } catch (err: any) {
      alert('Error al eliminar comprobante de envío: ' + (err?.message || err));
    }
  };

  const handleUploadBoxPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !order) return;
    setUploadingBoxPhoto(true);
    try {
      const { storage, databases } = getServices();
      const { databaseId, endpoint, projectId } = getFirebaseConfig();
      const newUrls: string[] = [];
      for (const file of files) {
        const fileId = ID.unique();
        await storage.createFile(ORDER_BOX_PHOTOS_BUCKET_ID, fileId, file);
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        newUrls.push(`${endpoint}/storage/buckets/${ORDER_BOX_PHOTOS_BUCKET_ID}/files/${fileId}/view?project=${projectId}&ext=${ext}`);
      }
      let current: string[] = [];
      try { current = JSON.parse(order.BOXPHOTOS || '[]'); } catch {}
      const merged = [...current, ...newUrls];
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, orderId, {
        BOXPHOTOS: JSON.stringify(merged),
        UPDATEDAT: Date.now(),
      });
      setOrder(prev => prev ? { ...prev, BOXPHOTOS: JSON.stringify(merged) } : prev);
    } catch (err: any) {
      alert('Error al subir foto(s) de las cajas: ' + (err?.message || err));
    } finally {
      setUploadingBoxPhoto(false);
      e.target.value = '';
    }
  };

  const handleDeleteBoxPhoto = async (url: string) => {
    if (!order || !confirm('¿Eliminar esta foto de las cajas?')) return;
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      let current: string[] = [];
      try { current = JSON.parse(order.BOXPHOTOS || '[]'); } catch {}
      const next = current.filter(u => u !== url);
      await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, orderId, {
        BOXPHOTOS: JSON.stringify(next),
      });
      setOrder(prev => prev ? { ...prev, BOXPHOTOS: JSON.stringify(next) } : prev);
    } catch (err: any) {
      alert('Error al eliminar la foto: ' + (err?.message || err));
    }
  };

  // Fotos de las cajas (parse seguro)
  let boxPhotos: string[] = [];
  try { boxPhotos = JSON.parse(order.BOXPHOTOS || '[]'); } catch {}
  // Banner de alerta: agencia (no BluExpress, no retiro) ya despachada sin N° seguimiento ni voucher
  const orderIsPickup = isPickupAgency(order.SHIPPINGAGENCY);
  const orderIsBluexpress = isBluexpress(order.SHIPPINGAGENCY);
  const trackingPending =
    ['shipped', 'delivered'].includes(order.STATUS) &&
    !!order.SHIPPINGAGENCY && !orderIsPickup && !orderIsBluexpress &&
    !((order as any).TRACKINGNUMBER && (order as any).TRACKINGNUMBER.trim()) &&
    !(order.SHIPPINGPROOFURL && order.SHIPPINGPROOFURL.trim());

  // Mostrar sección de fotos de cajas desde que está confirmado en adelante
  const showBoxPhotos = ['paid', 'payment_confirmed', 'shipped', 'delivered'].includes(order.STATUS) && !orderIsPickup;

  const totalItems = items.reduce((s, it) => s + it.qty, 0);
  const ageDays = Math.floor(ageMs / 86400000);
  const ageHours = Math.floor(ageMs / 3600000);
  const ageStr = ageDays > 0 ? `${ageDays}d` : `${ageHours}h`;

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-break { page-break-inside: avoid; break-inside: avoid; }
          body { background: #fff !important; }
          /* Single column layout for print */
          .print-area { width: 100% !important; padding: 0 !important; margin: 0 !important; }
          .print-area .lg\:grid-cols-3 { grid-template-columns: 1fr !important; }
          .print-area .lg\:col-span-2 { grid-column: span 1 !important; }
          /* No forced page breaks - let content flow naturally */
          .print-info-block { page-break-after: auto; }
          .print-products-block { page-break-before: auto; }
          .print-order-items thead { display: table-header-group; }
          .print-order-items tr { page-break-inside: avoid; break-inside: avoid; }
          /* Remove shadows/borders for cleaner print */
          .print-area .shadow-sm { box-shadow: none !important; }
          .print-area .divide-y > div { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      {/* Proof lightbox */}
      {proofOpen && selectedPaymentProof && (() => {
        const isPdf = isPdfUrl(selectedPaymentProof) || selectedPaymentProofIsPdf;
        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 gap-4" onClick={() => { setProofOpen(false); setSelectedPaymentProof(null); }}>
            <div className="no-print flex gap-4">
              <a 
                href={selectedPaymentProof} 
                target="_blank" 
                rel="noreferrer" 
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-indigo-700 transition"
              >
                <ExternalLink className="w-4 h-4" /> Abrir archivo / Descargar
              </a>
              <button onClick={() => { setProofOpen(false); setSelectedPaymentProof(null); }} className="px-4 py-2 bg-white/20 text-white text-xs font-bold rounded-xl hover:bg-white/30 transition">
                Cerrar
              </button>
            </div>
            <div className="relative max-w-3xl max-h-[80vh] w-full flex items-center justify-center p-6 bg-gray-900 rounded-2xl" onClick={e => e.stopPropagation()}>
              {isPdf ? (
                <div className="flex flex-col items-center justify-center gap-4 py-12 text-white">
                  <FileText size={64} className="text-indigo-400 animate-pulse" />
                  <p className="text-sm font-semibold text-gray-300">Este comprobante es un archivo PDF</p>
                  <a href={selectedPaymentProof} target="_blank" rel="noreferrer" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition font-bold text-xs flex items-center gap-2 no-underline">
                    <ExternalLink size={14} /> Abrir y ver PDF en nueva pestaña
                  </a>
                </div>
              ) : (
                <img src={`/api/media-proxy?url=${encodeURIComponent(selectedPaymentProof)}`} alt="Comprobante de pago" className="w-full h-auto max-h-[75vh] object-contain rounded-2xl" />
              )}
            </div>
          </div>
        );
      })()}

      {/* Shipping Proof lightbox */}
      {shippingProofOpen && order.SHIPPINGPROOFURL && (() => {
        const isPdf = isPdfUrl(order.SHIPPINGPROOFURL) || shippingProofIsPdf;
        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 gap-4" onClick={() => setShippingProofOpen(false)}>
            <div className="no-print flex gap-4">
              <a 
                href={order.SHIPPINGPROOFURL} 
                target="_blank" 
                rel="noreferrer" 
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-indigo-700 transition"
              >
                <ExternalLink className="w-4 h-4" /> Abrir archivo / Descargar
              </a>
              <button onClick={() => setShippingProofOpen(false)} className="px-4 py-2 bg-white/20 text-white text-xs font-bold rounded-xl hover:bg-white/30 transition">
                Cerrar
              </button>
            </div>
            <div className="relative max-w-3xl max-h-[80vh] w-full flex items-center justify-center p-6 bg-gray-900 rounded-2xl" onClick={e => e.stopPropagation()}>
              {isPdf ? (
                <div className="flex flex-col items-center justify-center gap-4 py-12 text-white">
                  <FileText size={64} className="text-indigo-400 animate-pulse" />
                  <p className="text-sm font-semibold text-gray-300">Este comprobante es un archivo PDF</p>
                  <a href={order.SHIPPINGPROOFURL} target="_blank" rel="noreferrer" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition font-bold text-xs flex items-center gap-2 no-underline">
                    <ExternalLink size={14} /> Abrir y ver PDF en nueva pestaña
                  </a>
                </div>
              ) : (
                <img src={`/api/media-proxy?url=${encodeURIComponent(order.SHIPPINGPROOFURL!)}`} alt="Comprobante de envío" className="w-full h-auto max-h-[75vh] object-contain rounded-2xl" />
              )}
            </div>
          </div>
        );
      })()}

      {/* Add Product Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden shadow-xl border border-gray-100">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-gray-900 text-sm">Añadir Producto al Pedido</h3>
              </div>
              <button onClick={() => { setShowAddProduct(false); setAddProductSearch(''); setAddProductResults([]); }} className="text-gray-400 hover:text-gray-600 transition">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={addProductSearch}
                  onChange={e => {
                    setAddProductSearch(e.target.value);
                    if (!e.target.value.trim()) setAddProductResults([]);
                  }}
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const trimmed = addProductSearch.trim();
                      if (!trimmed) return;
                      // Try SKU exact match first - add directly
                      const { databases } = getServices();
                      const { databaseId } = getFirebaseConfig();
                      let found = false;
                      for (const qv of [trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()]) {
                        try {
                          const skuRes = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
                            Query.equal('sku', qv),
                            Query.limit(1)
                          ]);
                          if (skuRes.documents.length > 0) {
                            await addProductToOrder(skuRes.documents[0], 1);
                            found = true;
                            break;
                          }
                        } catch {}
                      }
                      if (!found) {
                        // Not an exact SKU, do a name search and show results
                        await searchProductsForAdd(trimmed);
                      }
                    }
                  }}
                  placeholder="Escribe y presiona Enter para buscar... (SKU exacto añade directo)"
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                {addProductResults.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-8">
                    {addProductSearch.trim() ? 'No se encontraron productos' : 'Escribe para buscar productos...'}
                  </p>
                ) : (
                  addProductResults.map(p => {
                    const price = p.CURRENTPRICE ?? p.PRICE ?? 0;
                    const pSku = p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.sku);
                    return (
                      <div key={p.$id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100/70 transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-white border border-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {p.IMAGEURL ? <img src={p.IMAGEURL} className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-gray-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{p.NAME}</p>
                          <p className="text-[10px] text-gray-500">
                            SKU: <span className="font-mono">{pSku || '—'}</span> · Stock: <span className={p.STOCK > 0 || p.STOCK === 99999 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{p.STOCK === 99999 ? 'Ilimitado' : p.STOCK}</span>
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                          <p className="text-xs font-bold text-gray-900">{fmt(price)}</p>
                          <button
                            onClick={() => addProductToOrder(p, 1)}
                            disabled={addingProduct}
                            className="text-[10px] font-bold px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                          >
                            {addingProduct ? 'Añadiendo...' : '+ Añadir'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Replacement Modal */}
      {replacingIdx !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl border border-gray-100">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-150 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-white border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                  {items[replacingIdx]?.img ? <img src={items[replacingIdx]?.img} className="w-full h-full object-contain p-1" /> : <Package className="w-5 h-5 text-gray-300" />}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                    {isSimilarSearch ? 'Buscar Productos Similares' : 'Reemplazar Producto'}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Reemplazando: <span className="font-semibold text-gray-700">{items[replacingIdx]?.name}</span> · {fmt(items[replacingIdx]?.price)} c/u · {missingQty} ud(s) · <span className="font-bold text-gray-900">Meta: {fmt(replacementTargetTotal)}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isSimilarSearch && searchResults.length > 0 && (
                  <button
                    onClick={handleDownloadSimilarCatalog}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm mr-2"
                  >
                    <Download className="w-3.5 h-3.5" /> Descargar Imágenes
                  </button>
                )}
                <button
                  onClick={() => { setReplacingIdx(null); setSearchQuery(''); setSearchResults([]); setIsSimilarSearch(false); setReplacementSelection([]); }}
                  className="text-gray-400 hover:text-gray-600 transition"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto flex flex-col">
              {/* Search Bar */}
              <div className="p-4 pb-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={searchQuery}
                      onChange={e => {
                        setIsSimilarSearch(false);
                        setSearchQuery(e.target.value);
                        if (!e.target.value.trim()) setSearchResults([]);
                      }}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const trimmed = searchQuery.trim();
                          if (!trimmed) return;
                          // Try SKU exact match first - add to selection cart
                          const { databases } = getServices();
                          const { databaseId } = getFirebaseConfig();
                          let found = false;
                          for (const qv of [trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()]) {
                            try {
                              const skuRes = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
                                Query.equal('sku', qv),
                                Query.limit(1)
                              ]);
                              if (skuRes.documents.length > 0) {
                                addToReplacementSelection(skuRes.documents[0]);
                                setSearchQuery('');
                                found = true;
                                break;
                              }
                            } catch {}
                          }
                          if (!found) {
                            // Not an exact SKU match, do a name search
                            await handleSearchProducts(trimmed);
                          }
                        }
                      }}
                      placeholder="Escribe SKU y Enter para añadir al carrito... o nombre para buscar"
                      className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Search Results */}
              <div className="px-4 pb-3 space-y-2.5">
                {searching ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-8">
                    {searchQuery.trim() ? 'No se encontraron productos' : 'Escribe para buscar productos disponibles...'}
                  </p>
                ) : (
                  searchResults.map(p => {
                    const originalPrice = p.CURRENTPRICE ?? p.PRICE ?? 0;
                    const price = originalPrice;
                    const pSku = p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.sku);
                    const isCombo = p._bestQty && p._bestQty > 1;
                    const inSelection = replacementSelection.some(r => r.product.$id === p.$id);
                    const productTotal = isCombo ? (p._comboTotal || price * p._bestQty) : price;
                    const diff = productTotal - replacementTargetTotal;
                    return (
                      <div
                        key={p.$id}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${inSelection ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100/70'}`}
                      >
                        <div className="w-10 h-10 rounded-lg bg-white border border-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                          {p.IMAGEURL ? (
                            <img src={p.IMAGEURL} alt={p.NAME} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-4 h-4 text-gray-300" />
                          )}
                          {isCombo && (
                            <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-bold px-1 rounded-bl-md">
                              x{p._bestQty}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
                            {isCombo ? `(${p._bestQty} uds) ${p.NAME}` : p.NAME}
                          </p>
                          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">
                            SKU: <span className="font-mono">{pSku || '—'}</span> · Stock: <span className={p.STOCK > 0 || p.STOCK === 99999 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{p.STOCK === 99999 ? 'Ilimitado' : p.STOCK}</span>
                          </p>
                          <span className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${diff === 0 ? 'bg-gray-100 text-gray-600' : diff > 0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                            {diff === 0 ? 'Mismo precio' : diff > 0 ? `Saldo a favor: +${fmt(diff)}` : `Dif en contra: -${fmt(Math.abs(diff))}`}
                          </span>
                        </div>
                        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                          <p className="text-xs sm:text-sm font-bold text-gray-900">
                            {isCombo ? fmt(p._comboTotal) : fmt(price)}
                          </p>
                          {isCombo && <p className="text-[9px] text-gray-400">{fmt(price)} c/u</p>}
                          <button
                            onClick={() => addToReplacementSelection(p)}
                            disabled={p.STOCK <= 0 && p.STOCK !== 99999}
                            className={`text-[10px] font-bold px-2.5 py-1 mt-1 rounded-lg transition disabled:bg-gray-300 disabled:cursor-not-allowed ${inSelection ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                          >
                            {inSelection ? '✓ Agregado' : '+ Agregar'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Selection Cart */}
              {replacementSelection.length > 0 && (
                <div className="border-t border-gray-200 bg-gray-50/50 p-4 space-y-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Productos seleccionados ({replacementSelection.length})</p>
                    <button
                      onClick={() => setReplacementSelection([])}
                      className="text-[10px] text-red-500 hover:text-red-700 font-medium"
                    >Limpiar todo</button>
                  </div>
                  {replacementSelection.map(r => {
                    const price = r.product.CURRENTPRICE ?? r.product.PRICE ?? 0;
                    return (
                      <div key={r.product.$id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100">
                        <div className="w-8 h-8 rounded-md bg-gray-50 border border-gray-100 overflow-hidden flex-shrink-0">
                          {r.product.IMAGEURL ? <img src={r.product.IMAGEURL} className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-gray-300 m-auto mt-1" />}
                        </div>
                        <p className="flex-1 text-xs font-medium text-gray-800 truncate">{r.product.NAME}</p>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => updateReplacementQty(r.product.$id, -1)} className="w-6 h-6 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-bold flex items-center justify-center">−</button>
                          <span className="text-xs font-bold w-6 text-center">{r.qty}</span>
                          <button onClick={() => updateReplacementQty(r.product.$id, +1)} className="w-6 h-6 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-bold flex items-center justify-center">+</button>
                        </div>
                        <p className="text-xs font-bold text-gray-900 w-16 text-right">{fmt(price * r.qty)}</p>
                        <button onClick={() => removeFromReplacementSelection(r.product.$id)} className="text-red-400 hover:text-red-600 p-1">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 p-4 bg-white flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">Meta:</span>
                  <span className="font-bold text-gray-900">{fmt(replacementTargetTotal)}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">Suma:</span>
                  <span className={`font-bold ${replacementCurrentSum >= replacementTargetTotal ? 'text-green-600' : 'text-orange-600'}`}>{fmt(replacementCurrentSum)}</span>
                </div>
                {(() => {
                  const diff = replacementCurrentSum - replacementTargetTotal;
                  if (replacementCurrentSum === 0) {
                    return (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 inline-block w-fit">
                        Selecciona productos para reemplazar
                      </span>
                    );
                  }
                  if (diff === 0) {
                    return (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 inline-block w-fit">
                        ✓ Monto exacto
                      </span>
                    );
                  }
                  if (diff > 0) {
                    return (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 inline-block w-fit">
                        ✓ Saldo a favor: {fmt(diff)}
                      </span>
                    );
                  }
                  return (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 inline-block w-fit">
                      ⚠️ Diferencia en contra: {fmt(Math.abs(diff))}
                    </span>
                  );
                })()}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setReplacingIdx(null); setSearchQuery(''); setSearchResults([]); setIsSimilarSearch(false); setReplacementSelection([]); }}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >Cancelar</button>
                <button
                  onClick={replaceItemWithMultiple}
                  disabled={replacementSelection.length === 0}
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  Confirmar reemplazo ({replacementSelection.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    {/* ───────── HOJA DE IMPRESIÓN: cliente, agencia y productos con imágenes grandes ───────── */}
    <div className="hidden print:block" style={{ color: '#0f172a', fontSize: 12, lineHeight: 1.4, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
      {/* Encabezado (azul → celeste, tema de la tienda) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, background: 'linear-gradient(135deg,#1d4ed8 0%,#2563eb 50%,#0ea5e9 100%)', color: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.20)', border: '1px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>DB</div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.4 }}>Importadora Carlitos</div>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.85 }}>Orden de preparación</div>
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>{order.ORDERCODE || '#' + order.$id.slice(-6)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.22)', border: '1.5px solid rgba(255,255,255,0.55)', borderRadius: 999, padding: '4px 14px', fontWeight: 700, fontSize: 12 }}>{displayStatusLabel(order.STATUS, order.SHIPPINGAGENCY)}</div>
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.9 }}>{fmtDate(date.getTime())} · {fmtTime(date.getTime())}</div>
          <div style={{ fontSize: 11, opacity: 0.9 }}>{totalItems} uds · {items.length} productos</div>
        </div>
      </div>

      {/* Cliente / Envío */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, border: '1px solid #bae6fd', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#eff6ff', padding: '5px 12px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#1e40af', borderBottom: '1px solid #dbeafe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Cliente
            <button onClick={() => {
              if (editingCustomer) { setEditingCustomer(false); return; }
              setCustomerForm({
                name: order.CUSTOMERNAME || '',
                rut: order.CUSTOMERRUT || '',
                phone: order.CUSTOMERPHONE || '',
                email: order.CUSTOMEREMAIL || '',
                address: order.ADDRESS || '',
                comuna: order.COMUNA || '',
                region: order.REGION || '',
              });
              setEditingCustomer(true);
            }} style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
              {editingCustomer ? 'Cancelar' : 'Editar'}
            </button>
          </div>
          <div style={{ padding: '8px 12px' }}>
            {editingCustomer ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input value={customerForm.name} onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre" style={editInputStyle} />
                <input value={customerForm.rut} onChange={e => setCustomerForm(f => ({ ...f, rut: e.target.value }))} placeholder="RUT" style={editInputStyle} />
                <input value={customerForm.phone} onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))} placeholder="Telefono" style={editInputStyle} />
                <input value={customerForm.email} onChange={e => setCustomerForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" style={editInputStyle} />
                <input value={customerForm.address} onChange={e => setCustomerForm(f => ({ ...f, address: e.target.value }))} placeholder="Direccion" style={editInputStyle} />
                <input value={customerForm.comuna} onChange={e => setCustomerForm(f => ({ ...f, comuna: e.target.value }))} placeholder="Comuna" style={editInputStyle} />
                <input value={customerForm.region} onChange={e => setCustomerForm(f => ({ ...f, region: e.target.value }))} placeholder="Region" style={editInputStyle} />
                <button onClick={saveCustomerData} disabled={savingCustomer} style={{ marginTop: 4, padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: savingCustomer ? 'wait' : 'pointer' }}>
                  {savingCustomer ? 'Guardando...' : 'Guardar datos'}
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{order.CUSTOMERNAME}</div>
                {order.CUSTOMERRUT && <div style={{ color: '#475569' }}>RUT: {order.CUSTOMERRUT}</div>}
                {order.CUSTOMERPHONE && <div style={{ color: '#475569' }}>Tel: {order.CUSTOMERPHONE}</div>}
                {order.CUSTOMEREMAIL && <div style={{ color: '#475569' }}>{order.CUSTOMEREMAIL}</div>}
              </>
            )}
          </div>
        </div>
        <div style={{ flex: 1, border: '1px solid #bae6fd', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#eff6ff', padding: '5px 12px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#1e40af', borderBottom: '1px solid #dbeafe' }}>Envío</div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{order.SHIPPINGAGENCY || 'Sin agencia'}</div>
            <div style={{ color: '#334155' }}>{order.ADDRESS || '—'}</div>
            <div style={{ color: '#475569' }}>{[order.COMUNA, order.REGION].filter(Boolean).join(', ')}</div>
            {displayAdditionalInfo && <div style={{ color: '#475569', fontStyle: 'italic' }}>{displayAdditionalInfo}</div>}
            <div style={{ marginTop: 2, color: '#334155' }}>N° Seguimiento: <strong>{(order as any).TRACKINGNUMBER || '—'}</strong></div>
          </div>
        </div>
      </div>

      {customerNote && (
        <div style={{ border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: 8, padding: '6px 12px', marginBottom: 12, fontSize: 11 }}>
          <strong>Nota del cliente:</strong> {customerNote}
        </div>
      )}

      {/* Productos (con imágenes) */}
      <table className="print-order-items" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, border: '1px solid #bae6fd', borderRadius: 10, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', color: '#fff', textAlign: 'left' }}>
            <th style={{ padding: '7px 8px', width: 124 }}>Foto</th>
            <th style={{ padding: '7px 8px', width: 100 }}>Cód. caja</th>
            <th style={{ padding: '7px 8px' }}>Producto</th>
            <th style={{ padding: '7px 8px', textAlign: 'center', width: 44 }}>Cant.</th>
            <th style={{ padding: '7px 8px', textAlign: 'right', width: 70 }}>Precio</th>
            <th style={{ padding: '7px 8px', textAlign: 'right', width: 80 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e0f2fe', background: i % 2 ? '#f0f9ff' : '#fff' }}>
              <td style={{ padding: '6px', textAlign: 'center' }}>
                <div style={{ width: 112, height: 112, borderRadius: 8, border: '1px solid #bae6fd', background: '#f0f9ff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {(() => { const im = itemImage(it); return im ? (
                    <img src={im} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { const t = e.target as HTMLImageElement; t.style.display = 'none'; (t.parentElement as HTMLElement).innerHTML = '<span style="font-size:11px;color:#7dd3fc;font-weight:700;">S/F</span>'; }} />
                  ) : <span style={{ fontSize: 11, color: '#7dd3fc', fontWeight: 700 }}>S/F</span>; })()}
                </div>
              </td>
              <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: '#1d4ed8', fontWeight: 600 }}>{itemBoxCode(it) || '—'}</td>
              <td style={{ padding: '5px 8px', color: '#0f172a' }}>
                {it.name}{(it as any).missing ? <strong style={{ color: '#b91c1c' }}> (FALTANTE)</strong> : ''}
                {(it as any).note && <div style={{ fontSize: 10, color: '#d97706', marginTop: 2, background: '#fffbeb', padding: '2px 6px', borderRadius: 4, display: 'inline-block', border: '1px solid #fef3c7' }}>Nota: {(it as any).note}</div>}
              </td>
              <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>{it.qty}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: '#475569' }}>{fmt(it.price)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(it.total || it.price * it.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totales */}
      <div style={{ marginTop: 12, marginLeft: 'auto', width: 260, fontSize: 12, border: '1px solid #bae6fd', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 12px' }}><span style={{ color: '#64748b' }}>Subtotal</span><span style={{ color: '#0f172a', fontWeight: 600 }}>{fmt(order.SUBTOTAL || order.TOTAL)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 12px' }}><span style={{ color: '#64748b' }}>Envío</span><span style={{ color: '#0f172a', fontWeight: 600 }}>{order.SHIPPINGCOST > 0 ? fmt(order.SHIPPINGCOST) : 'Contraentrega'}</span></div>
        {order.DISCOUNTAMOUNT && order.DISCOUNTAMOUNT > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 12px', color: '#059669' }}><span>Descuento {order.COUPONCODE ? `(${order.COUPONCODE})` : ''}</span><span style={{ fontWeight: 700 }}>-{fmt(order.DISCOUNTAMOUNT)}</span></div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', fontWeight: 800, fontSize: 14 }}><span>TOTAL</span><span>{fmt(order.TOTAL)}</span></div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 8, borderTop: '1px dashed #bae6fd', fontSize: 9, color: '#94a3b8', textAlign: 'center' }}>
        Documento interno de preparación · {order.ORDERCODE} · Generado el {new Date().toLocaleDateString('es-CL')}
      </div>
    </div>

    <div className="print-area print:hidden max-w-6xl mx-auto space-y-4 sm:space-y-5 px-1 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button onClick={() => router.push('/admin/orders')} className="no-print p-1.5 sm:p-2 rounded-xl hover:bg-gray-100 transition text-gray-500 flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">Pedido {order.ORDERCODE || '#' + order.$id.slice(-6)}</h1>
              {((order as any).IS_VENDOR_ORDER || (order as any).VENDOR_NAME) && (
                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm uppercase tracking-wider inline-flex items-center gap-1">
                  🏪 {(order as any).VENDOR_NAME || 'Tienda Aliada'}
                </span>
              )}
              <button onClick={() => { copyText(order.ORDERCODE || order.$id, 'code'); }} className="no-print text-gray-400 hover:text-indigo-500 transition flex-shrink-0">
                {copied === 'code' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              {isOverdue && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-500 text-white rounded animate-pulse">VENCIDO</span>}
              {isLive && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-600 text-white rounded">🔴 LIVE</span>}
              {isGift && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-pink-100 text-pink-700 rounded">🎁 REGALO</span>}
            </div>
            <p className="text-xs sm:text-sm text-gray-500 truncate">{fmtDate(date.getTime())} · {fmtTime(date.getTime())} · Hace {ageStr}</p>
          </div>
        </div>
        <div className="no-print flex items-center gap-1 sm:gap-2 flex-shrink-0 flex-wrap">
          <button onClick={() => {
            const statusLabelC = displayStatusLabel(order.STATUS, order.SHIPPINGAGENCY);
            const textC = `Pedido: ${order.ORDERCODE}\nCliente: ${order.CUSTOMERNAME}\nRUT: ${order.CUSTOMERRUT || '-'}\nTeléfono: ${order.CUSTOMERPHONE || '-'}\nDirección: ${order.ADDRESS}, ${order.COMUNA}, ${order.REGION}\nAgencia: ${order.SHIPPINGAGENCY || '-'}\nTotal: ${fmt(order.TOTAL)}\nEstado: ${statusLabelC}`;
            copyText(textC, 'all');
          }} className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-100 transition">
            {copied === 'all' ? <><Check className="w-3.5 h-3.5 text-green-600 animate-pulse" /><span className="hidden xs:inline sm:inline">Copiado</span></> : <><Copy className="w-3.5 h-3.5" /><span className="hidden xs:inline sm:inline">Datos</span></>}
          </button>
          <button onClick={() => copyOrderItemsList('sku')} className="flex items-center gap-1.5 px-2 py-1.5 bg-violet-50 border border-violet-200 text-violet-700 rounded-xl text-xs font-semibold hover:bg-violet-100 transition">
            {copied === 'copiedSku' ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600 animate-pulse" />
                <span className="hidden xs:inline sm:inline">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden xs:inline sm:inline">SKU</span>
              </>
            )}
          </button>
          <button
            onClick={() => {
              // El PDF se abre en otra ventana → la imagen debe ser URL absoluta.
              const itemsForPdf = items.map(it => ({ ...it, img: itemImage(it, true) || (it as any).img }));
              generateOrderPdf(order as any, itemsForPdf as any, Object.fromEntries(
                Object.entries(productSkus).map(([id, sku]) => [id, { sku, location: productLocations[id] || null }])
              ));
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-semibold hover:bg-indigo-100 transition"
          >
            <FileText className="w-3.5 h-3.5" /> <span className="hidden xs:inline sm:inline">PDF</span>
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-white border border-gray-250 text-gray-600 rounded-xl text-xs sm:text-sm font-medium hover:bg-gray-50 transition">
            <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Imprimir</span>
          </button>
        </div>
      </div>

      {/* Summary cards (mobile-friendly) */}
      {(() => {
        const statusHex = isReadyRetiro ? '#c026d3' : (STATUS_HEX[order.STATUS] || '#6b7280');
        const cards: { label: string; value: React.ReactNode; hex: string; icon: React.ReactNode }[] = [
          { label: 'Total', hex: '#4f46e5', value: fmt(order.TOTAL), icon: <DollarSign className="w-4 h-4 text-white" /> },
          { label: 'Items', hex: '#d97706', value: <>{totalItems} <span className="text-xs font-semibold text-gray-400">uds</span></>, icon: <Package className="w-4 h-4 text-white" /> },
          { label: 'Estado', hex: statusHex, value: <span style={{ color: statusHex }}>{sc.label}</span>, icon: <span className="text-base leading-none">{sc.icon}</span> },
          { label: 'Creado hace', hex: isOverdue ? '#ef4444' : '#64748b', value: <span style={{ color: isOverdue ? '#dc2626' : undefined }}>{ageStr}</span>, icon: <Clock className="w-4 h-4 text-white" /> },
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
          {/* Ambient sutil */}
          <div className="absolute -top-16 -left-10 w-52 h-52 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${(isReadyRetiro ? '#c026d3' : (STATUS_HEX[order.STATUS] || '#6366f1'))}0d, transparent 70%)` }} />

          {/* Header */}
          <div className="relative flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-lg" style={{ background: `linear-gradient(145deg, ${(isReadyRetiro ? '#c026d3' : (STATUS_HEX[order.STATUS] || '#6b7280'))}, ${(isReadyRetiro ? '#c026d3' : (STATUS_HEX[order.STATUS] || '#6b7280'))}d9)`, boxShadow: `0 3px 8px -3px ${(isReadyRetiro ? '#c026d3' : (STATUS_HEX[order.STATUS] || '#6b7280'))}99, inset 0 1px 1px rgba(255,255,255,0.4)` }}>
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
            <button
              onClick={() => handleStatusChange('negotiation')}
              disabled={updating || order.STATUS === 'negotiation'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-60 hover:-translate-y-0.5"
              style={{ background: order.STATUS === 'negotiation' ? '#ec4899' : '#fdf2f8', color: order.STATUS === 'negotiation' ? '#fff' : '#db2777', border: '1px solid #fbcfe8' }}>
              🤝 {order.STATUS === 'negotiation' ? 'En negociación' : 'Negociación'}
            </button>
          </div>

          {/* Progress rail */}
          <div className="relative overflow-x-auto pb-2 pt-3">
            <div className="flex items-start gap-0 min-w-max">
              {STATUS_FLOW.map((step, i) => {
                const STEP_ICON_PATHS: Record<string, string> = {
                  pending:          'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.5 5H11v6l5.25 3.15.75-1.23-4.5-2.67V7z',
                  pending_stock:    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.5 5H11v6l5.25 3.15.75-1.23-4.5-2.67V7z',
                  processing:       'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
                  paid:             'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
                  payment_expired:  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 11h-2V7h2zm0 4h-2v-2h2z',
                  payment_confirmed:'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
                  payment_review:   'M14 2H6c-1.1 0-1.99.9-1.99 2L4 18c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
                  assembling:       'M17.66 8L12 2.35 6.34 8C4.78 9.56 4 11.64 4 13.64s.78 4.11 2.34 5.67 3.61 2.35 5.66 2.35 4.1-.79 5.66-2.35S20 15.64 20 13.64 19.22 9.56 17.66 8z',
                  confirming_stock: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
                  stock_confirmed:  'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
                  packing:          'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z',
                  ready_to_ship:    'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
                  shipped:          'M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zm-.5 1.5 1.96 2.5H17V9.5h2.5zM6 18c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2.22-3c-.55-.61-1.35-1-2.22-1s-1.67.39-2.22 1H3V6h12v9H8.22zM18 18c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z',
                  delivered:        'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
                };
                const isReadyRetiroStep = step === 'shipped' && isRetiro;
                const hex = isReadyRetiroStep ? '#c026d3' : (STATUS_HEX[step] || '#6b7280');
                const label = displayStatusLabel(step, order.SHIPPINGAGENCY);
                const isCompleted = step !== 'payment_expired' && i < currentStepIdx;
                const isCurrent = i === currentStepIdx;
                const isFuture = step === 'payment_expired'
                  ? effectiveStatus !== 'payment_expired'
                  : i > currentStepIdx;
                const nextHex = STATUS_HEX[STATUS_FLOW[i + 1]] || hex;
                const iconPath = STEP_ICON_PATHS[step];
                return (
                  <React.Fragment key={step}>
                    <button type="button" onClick={() => !isCurrent && step !== 'payment_expired' && handleStatusChange(step)} disabled={updating || isCurrent || step === 'payment_expired'}
                      title={step === 'payment_expired' ? 'Estado automático al vencer el pago' : `Cambiar a "${label}"`}
                      className="group flex flex-col items-center gap-1.5 flex-shrink-0 disabled:cursor-default" style={{ width: 70 }}>
                      <div className="relative transition-transform duration-200 group-hover:enabled:-translate-y-0.5 group-enabled:group-hover:scale-105" style={{ animation: isCurrent ? 'kcdFloat 2.6s ease-in-out infinite' : undefined }}>
                        {isCurrent && <span className="absolute inset-0 rounded-[13px]" style={{ ['--kcd' as any]: `${hex}3d`, animation: 'kcdPulse 2.2s ease-out infinite' }} />}
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
                        {isCompleted && <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)', animation: `kcdShimmer 2.4s linear ${i * 0.18}s infinite` }} />}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Cronómetro / Estado del plazo de pago */}
          {(() => {
            if ((order.STATUS === 'paid' || order.STATUS === 'payment_expired') && !order.PAYMENTPROOFURL) {
              const isPaymentExpired = order.STATUS === 'payment_expired';
              const deadline = Number(isPaymentExpired ? getOrderAutoCancelDeadline(order) : (order.EXPIRESAT || 0));
              if (!deadline) return null;
              const diff = deadline - Date.now();
              const isExpired = diff <= 0;
              const totalMins = Math.floor(Math.abs(diff) / 60000);
              const days = Math.floor(totalMins / (24 * 60));
              const hours = Math.floor((totalMins % (24 * 60)) / 60);
              const mins = totalMins % 60;
              const secs = Math.floor((Math.abs(diff) % 60000) / 1000);
              const timeStr = isPaymentExpired
                ? `${days ? `${days}d ` : ''}${hours}h ${mins}m ${secs}s`
                : `${mins}:${secs < 10 ? '0' : ''}${secs}`;
              return (
                <div className={`mt-3.5 p-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold ${isPaymentExpired || isExpired ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  <Clock className="w-4 h-4 shrink-0 animate-pulse" />
                  <div className="flex-1">
                    <span className="font-extrabold">{isPaymentExpired ? (isExpired ? '⏱️ Cancelación pendiente' : `⏱️ Pago vencido · se cancela en ${timeStr}`) : (isExpired ? '⏱️ Plazo de pago vencido' : `⏱️ Plazo de pago activo: quedan ${timeStr} min`)}</span>
                    <span className="text-[11px] block font-normal opacity-85">{isPaymentExpired ? 'Puedes subir el comprobante hasta que se cumplan 24 horas desde la creación del pedido; luego se cancela y se devuelve el stock reservado.' : (isExpired ? 'El plazo inicial venció; el pedido conserva el stock hasta cumplir 24 horas desde su creación.' : 'Stock reservado esperando transferencia del cliente.')}</span>
                  </div>
                </div>
              );
            }
            if (order.STATUS === 'payment_review') {
              return (
                <div className="mt-3.5 p-3 rounded-xl border bg-blue-50 border-blue-200 text-blue-800 flex items-center gap-2.5 text-xs font-semibold">
                  <span className="text-base">🛡️</span>
                  <div className="flex-1">
                    <span className="font-extrabold">Comprobante recibido · Cronómetro detenido</span>
                    <span className="text-[11px] block font-normal opacity-85">El cliente ya subió o envió su comprobante de pago. Revisa y confirma el pago.</span>
                  </div>
                </div>
              );
            }
            if (order.STATUS === 'payment_confirmed') {
              const hasShipping = hasShippingData(order);
              return (
                <div className="mt-3.5 p-3 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-800 flex items-center justify-between flex-wrap gap-2.5 text-xs font-semibold">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base shrink-0">✅</span>
                    <div className="min-w-0">
                      <span className="font-extrabold block">Pago confirmado con éxito</span>
                      <span className="text-[11px] block font-normal opacity-85">
                        {hasShipping
                          ? 'Datos de entrega listos. Stock descontado y pedido listo para preparación en bodega.'
                          : '⚠️ El cliente aún no completa sus datos de envío (dirección, comuna, región o agencia).'}
                      </span>
                    </div>
                  </div>
                  {MODULE_ACCESS.whatsappManagement && !hasShipping && (
                    <button
                      type="button"
                      onClick={handleNotifyShippingData}
                      disabled={notifyingShipping}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition shadow-sm shrink-0 bg-emerald-700 hover:bg-emerald-800 text-white ring-2 ring-emerald-400/50"
                      title="Pedir datos de envío por WhatsApp"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {notifyingShipping ? 'Procesando...' : 'Pedir datos de envío por WhatsApp'}
                    </button>
                  )}
                </div>
              );
            }
            return null;
          })()}

          <style>{`
            @keyframes kcdShimmer { 0% { transform: translateX(-110%); } 100% { transform: translateX(220%); } }
            @keyframes kcdSheen { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
            @keyframes kcdPulse { 0% { box-shadow: 0 0 0 0 var(--kcd); } 70% { box-shadow: 0 0 0 11px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
            @keyframes kcdFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
          `}</style>
        </div>
      ) : (
        /* Cancelled banner */
        <div className="no-print rounded-xl sm:rounded-2xl border border-red-200 bg-red-50 p-3 sm:p-5 flex items-center justify-between flex-wrap gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center flex-shrink-0">
              <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm sm:text-lg font-bold text-red-700">Pedido Cancelado</p>
              <p className="text-[10px] sm:text-xs text-red-500">Stock devuelto a los productos</p>
            </div>
          </div>
          <div className="no-print relative">
            <select value={order.STATUS} onChange={e => handleStatusChange(e.target.value)} disabled={updating}
              className="appearance-none text-xs sm:text-sm font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 pr-7 sm:pr-8 bg-white text-gray-800 border-gray-200">
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {displayStatusLabel(k, order.SHIPPINGAGENCY)}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── Alerta: falta N° de seguimiento o voucher (agencias ≠ BluExpress) ── */}
      {trackingPending && (
        <div className="no-print rounded-xl sm:rounded-2xl border border-amber-300 bg-amber-50 p-3 sm:p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">Seguimiento pendiente</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Este pedido se despachó por <strong>{order.SHIPPINGAGENCY}</strong>. Falta cargar el <strong>N° de seguimiento</strong> o subir la <strong>foto del voucher</strong> que entrega la agencia. (BluExpress no lo requiere — la etiqueta se imprime antes.)
            </p>
          </div>
        </div>
      )}

      {/* ── Negociación de Faltantes Control Panel ── */}
      {order.STATUS === 'negotiation' && (
        <div className="no-print bg-white rounded-xl sm:rounded-2xl border border-pink-250 shadow-sm p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-pink-100 pb-3">
            <span className="text-xl">🤝</span>
            <div>
              <h2 className="text-sm font-bold text-gray-800">Panel de Negociación por Productos Faltantes</h2>
              <p className="text-xs text-gray-400">Selecciona qué productos faltan y en qué cantidad para coordinar con el cliente.</p>
            </div>
          </div>

          {/* Search bar for quick SKU/name filtering */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={negotiationSearch}
              onChange={e => setNegotiationSearch(e.target.value)}
              placeholder="Buscar por SKU o nombre..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
            {items.map((it, idx) => {
              const isMissing = !!(it as any).missing;
              const isReplaced = !!(it as any).replaced;
              const itemSku = (it.id ? productSkus[it.id] : '') || (it as any).sku || '';
              const matchesSearch = !negotiationSearch.trim() ||
                it.name.toLowerCase().includes(negotiationSearch.toLowerCase().trim()) ||
                itemSku.toLowerCase().includes(negotiationSearch.toLowerCase().trim());
              if (!matchesSearch) return null;
              
              return (
                <div key={idx} className="py-2.5 flex items-center justify-between gap-2 text-xs flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded bg-gray-50 border overflow-hidden shrink-0 flex items-center justify-center">
                      {(() => { const im = itemImage(it); return im ? <img src={im} className="w-full h-full object-contain" onError={(e) => { const t = e.target as HTMLImageElement; t.onerror = null; t.src = ''; t.style.display = 'none'; const p = t.parentElement; if (p) p.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>'; }} /> : <Package className="w-3 h-3 text-gray-300" />; })()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate">{it.name}</p>
                      <p className="text-gray-400 text-[10px]">{(() => { const sku = (it.id ? productSkus[it.id] : '') || (it as any).sku || ''; return sku ? <>SKU: <span className="font-mono">{sku}</span> · </> : null; })()}Cantidad en pedido: {it.qty}</p>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-3">
                    {isMissing ? (
                      <>
                        <span className="px-2 py-0.5 rounded-full font-bold bg-red-50 text-red-600 border border-red-100 text-[10px]">
                          ⚠️ Faltante
                        </span>
                        <button
                          onClick={async () => {
                            if (!confirm('¿Marcar este producto como disponible?')) return;
                            let parsedItems: any[] = [];
                            try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
                            const itemToRestore = parsedItems[idx];
                            if (!itemToRestore) return;

                            const identicalIdx = parsedItems.findIndex((x, i) => 
                              i !== idx && 
                              x.id === itemToRestore.id && 
                              !x.missing && 
                              !x.replaced
                            );

                            if (identicalIdx !== -1) {
                              parsedItems[identicalIdx].qty += itemToRestore.qty;
                              parsedItems[identicalIdx].total = parsedItems[identicalIdx].qty * parsedItems[identicalIdx].price;
                              parsedItems.splice(idx, 1);
                            } else {
                              itemToRestore.missing = false;
                            }

                            try {
                              const { databases } = getServices();
                              const { databaseId } = getFirebaseConfig();
                              await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, order.$id, {
                                ITEMS: JSON.stringify(parsedItems)
                              });
                              setOrder(prev => prev ? { ...prev, ITEMS: JSON.stringify(parsedItems) } : null);
                            } catch (err: any) {
                              alert('Error: ' + err.message);
                            }
                          }}
                          className="px-2.5 py-1 bg-white border border-gray-250 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
                        >
                          Marcar Disponible
                        </button>
                      </>
                    ) : isReplaced ? (
                      <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-600 text-[10px]">
                        🔄 Reemplazado
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-[10px]">Faltan:</span>
                        <input
                          type="number"
                          min={1}
                          max={it.qty}
                          defaultValue={1}
                          id={`missing-qty-${idx}`}
                          className="w-12 px-1.5 py-0.5 border border-gray-300 rounded text-center focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                        <button
                          onClick={async () => {
                            const inputEl = document.getElementById(`missing-qty-${idx}`) as HTMLInputElement;
                            const mQty = parseInt(inputEl?.value || '1');
                            if (isNaN(mQty) || mQty <= 0 || mQty > it.qty) return;

                            let parsedItems: any[] = [];
                            try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
                            const itemToMark = parsedItems[idx];
                            if (!itemToMark) return;

                            if (mQty === itemToMark.qty) {
                              itemToMark.missing = true;
                            } else {
                              const newItem = {
                                ...itemToMark,
                                qty: mQty,
                                total: itemToMark.price * mQty,
                                missing: true
                              };
                              itemToMark.qty -= mQty;
                              itemToMark.total = itemToMark.price * itemToMark.qty;
                              parsedItems.push(newItem);
                            }

                            try {
                              const { databases } = getServices();
                              const { databaseId } = getFirebaseConfig();
                              await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, order.$id, {
                                ITEMS: JSON.stringify(parsedItems)
                              });
                              setOrder(prev => prev ? { ...prev, ITEMS: JSON.stringify(parsedItems) } : null);
                            } catch (err: any) {
                              alert('Error: ' + err.message);
                            }
                          }}
                          className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-100 rounded-lg font-medium hover:bg-red-100 transition"
                        >
                          Marcar Faltante
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Botón de WhatsApp con mensaje personalizado de negociación ── */}
          {(() => {
            const missingItems = items.filter((it: any) => it.missing);
            const availableItems = items.filter((it: any) => !it.missing && !it.replaced);
            const replacedItems = items.filter((it: any) => it.replaced);
            const allAvailable = [...availableItems, ...replacedItems];
            const missingTotal = missingItems.reduce((s: number, it: any) => s + (it.price * it.qty), 0);
            const newTotal = Math.max(0, order.TOTAL - missingTotal);

            const nombre = order.CUSTOMERNAME?.split(' ')[0] || order.CUSTOMERNAME || 'Cliente';
            const codigo = order.ORDERCODE || '#' + order.$id.slice(-6);

            let msg = `Hola ${nombre} 👋, te escribimos de Importadora Carlitos por tu pedido ${codigo}.\n\n`;
            msg += `Lamentablemente, al revisar tu pedido en bodega nos dimos cuenta que hay productos agotados:\n\n`;
            missingItems.forEach((it: any) => { 
              msg += `🚫 ${it.name} (Cant: ${it.qty})\n`;
              if (it.img) {
                // Agregar enlace a la imagen para que el cliente la vea
                msg += `📸 Foto: ${it.img}\n`;
              }
              msg += `\n`;
            });
            msg += `💸 *MONTO FALTANTE A TU FAVOR: ${fmt(missingTotal)}*\n\n`;
            msg += `Para solucionar esto rápido, hemos habilitado una zona especial de CANJE donde puedes elegir qué productos quieres llevar en reemplazo con tu saldo.\n\n`;
            msg += `✨ ¡En la zona de canje *TODO TIENE 20% DE DESCUENTO* desde la unidad 1! ✨\n\n`;
            msg += `Ingresa aquí para elegir tus productos:\n`;
            msg += `👉 https://yaxsell.cl/canje\n\n`;
            msg += `Me avisas cuando hayas elegido tus reemplazos para despacharte enseguida 💕`;

            const waLink = order.CUSTOMERPHONE
              ? `https://wa.me/${order.CUSTOMERPHONE.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`
              : null;

            return (
              <div className="mt-4 pt-4 border-t border-pink-100 space-y-3">
                <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                  <span>📲</span> Mensaje personalizado para el cliente
                </p>
                <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-700 font-mono whitespace-pre-wrap border border-gray-200 max-h-48 overflow-auto">
                  {msg}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => { navigator.clipboard.writeText(msg); alert('✅ Texto copiado al portapapeles'); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition"
                  >
                    📋 Copiar texto
                  </button>
                  {MODULE_ACCESS.whatsappManagement && waLink && (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366] text-white rounded-xl text-xs font-bold hover:bg-[#128C7E] transition"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824zm-3.423-14.416c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm.029 18.88c-1.161 0-2.305-.292-3.318-.844l-3.677.964.984-3.595c-.607-1.052-.927-2.246-.926-3.468.001-5.824 4.74-10.563 10.567-10.564 5.823 0 10.561 4.741 10.562 10.564 0 5.825-4.738 10.562-10.564 10.564z" /></svg>
                      Enviar por WhatsApp
                    </a>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-5">
        {/* ── PAGE 1: Info block (header + customer + shipping + totals) ── */}
        <div className="print-info-block lg:col-span-2 space-y-3 sm:space-y-5">
          {/* Order header */}
          <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden print-break">
            <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-500" />
                <p className="font-semibold text-gray-900 text-xs sm:text-sm">Pedido {order.ORDERCODE || '#' + order.$id.slice(-6)}</p>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400">{fmtDate(date.getTime())} · {fmtTime(date.getTime())}</p>
            </div>
          </div>

          {/* Location Map + verificación de dirección (no se imprime) */}
          {order.ADDRESS && (
            <div className="no-print bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                <MapPinned className="w-4 h-4 text-indigo-500" />
                <p className="font-semibold text-gray-900 text-xs sm:text-sm">Ubicación de entrega</p>
                {isGeolocated && <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold border border-indigo-100">📍 GPS</span>}
              </div>

              {/* Comparación: dirección ingresada vs. detectada por GPS (siempre visible) */}
              {(() => {
                const ok = isGeolocated && geoAddressMatches;
                const gpsAccent = !isGeolocated ? '#94a3b8' : geoLoading ? '#9ca3af' : ok ? '#22c55e' : '#ef4444';
                const gpsBorder = !isGeolocated ? '#e5e7eb' : geoLoading ? '#e5e7eb' : ok ? '#bbf7d0' : '#fecaca';
                const gpsBg = !isGeolocated ? '#f8fafc' : geoLoading ? '#f9fafb' : ok ? 'linear-gradient(160deg,#f0fdf4,#ffffff)' : 'linear-gradient(160deg,#fef2f2,#ffffff)';
                return (
                  <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 border-b border-gray-100">
                    {/* Ingresada por el cliente */}
                    <div className="rounded-xl border p-3" style={{ borderColor: '#bbf7d0', background: 'linear-gradient(160deg,#f0fdf4,#ffffff)' }}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="w-5 h-5 rounded-md bg-emerald-500 flex items-center justify-center"><User className="w-3 h-3 text-white" /></span>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Dirección ingresada</p>
                      </div>
                      <p className="text-xs font-semibold text-gray-800 leading-snug">{order.ADDRESS}</p>
                      <p className="text-[11px] text-gray-500">{[order.COMUNA, order.REGION].filter(Boolean).join(', ') || '—'}</p>
                    </div>
                    {/* Detectada por GPS */}
                    <div className="rounded-xl border p-3" style={{ borderColor: gpsBorder, background: gpsBg }}>
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: gpsAccent }}>
                          <MapPin className="w-3 h-3 text-white" />
                        </span>
                        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: !isGeolocated ? '#64748b' : geoLoading ? '#6b7280' : ok ? '#15803d' : '#b91c1c' }}>Detectada por GPS</p>
                        {isGeolocated && !geoLoading && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full" style={{ background: ok ? '#dcfce7' : '#fee2e2', color: ok ? '#15803d' : '#b91c1c' }}>
                            {ok ? '✓ COINCIDE' : '✕ DIFIERE'}
                          </span>
                        )}
                      </div>
                      {!isGeolocated ? (
                        <p className="text-xs text-gray-400 leading-snug">El cliente no compartió su ubicación GPS en este pedido.</p>
                      ) : geoLoading ? (
                        <p className="text-xs text-gray-400 italic">Calculando dirección…</p>
                      ) : detectedAddr ? (
                        <>
                          <p className="text-xs font-semibold text-gray-800 leading-snug">{detectedAddr.full || '—'}</p>
                          <p className="text-[11px]" style={{ color: comunaMatches ? '#16a34a' : '#dc2626' }}>
                            {detectedAddr.comuna || '—'}{detectedAddr.region ? <span style={{ color: regionMatches ? '#16a34a' : '#dc2626' }}>, {detectedAddr.region}</span> : null}
                          </p>
                          {!ok && (
                            <p className="text-[10px] text-red-600 mt-1 leading-snug">⚠️ El cliente pudo haber hecho el pedido fuera de su casa. Verifica la dirección de envío.</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No se pudo determinar.</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="aspect-[16/9] sm:aspect-[21/9] w-full">
                <iframe
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${isGeolocated ? `${geoLat},${geoLng}` : encodeURIComponent(`${order.ADDRESS}, ${order.COMUNA}, ${order.REGION}, Chile`)}`}>
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
              {isGift && (
                <div className="p-2.5 sm:p-3.5 bg-pink-50 border border-pink-200 rounded-lg sm:rounded-xl">
                  <p className="text-xs sm:text-sm text-pink-700 font-medium">🎁 Pedido marcado como regalo</p>
                </div>
              )}
              {/* Timeline */}
              <div className="border-t border-gray-100 pt-3 sm:pt-4">
                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 mb-2 sm:mb-3 uppercase tracking-wide">Historial del pedido</p>
                <div className="relative ml-1.5 sm:ml-2 space-y-3 sm:space-y-4 border-l-2 border-gray-200 pl-3 sm:pl-4">
                  <TimelineEntry dot="bg-indigo-400" title="Pedido creado" date={`${fmtDate(date.getTime())} ${fmtTime(date.getTime())}`} />
                  {order.PAYMENTPROOFURL && (
                    <TimelineEntry dot="bg-emerald-400" title="Comprobante subido" icon={<ImageIcon className="w-3 h-3" />} />
                  )}
                  {order.SHIPPINGPROOFURL && (
                    <TimelineEntry dot="bg-violet-400" title="Comprobante de envío subido" icon={<Truck className="w-3 h-3" />} />
                  )}
                  {order.UPDATEDAT && order.STATUS !== 'pending' && (() => {
                    const title = `Estado → ${displayStatusLabel(order.STATUS, order.SHIPPINGAGENCY)}`;
                    return (
                      <TimelineEntry dot={STATUS_CONFIG[order.STATUS]?.dot || 'bg-gray-400'} title={title} date={`${fmtDate(order.UPDATEDAT)} ${fmtTime(order.UPDATEDAT)}`} />
                    );
                  })()}
                  {isCancelled && (
                    <TimelineEntry dot="bg-red-400" title="Pedido cancelado — stock devuelto" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column — Customer + Shipping (visible in print) */}
        <div className="space-y-3 sm:space-y-5">
          {/* Customer */}
          <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden print-break">
            <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-500" />
              <p className="font-semibold text-gray-900 text-xs sm:text-sm">Cliente</p>
              <button onClick={() => {
                if (editingCustomer) { setEditingCustomer(false); return; }
                setCustomerForm({
                  name: order.CUSTOMERNAME || '',
                  rut: order.CUSTOMERRUT || '',
                  phone: order.CUSTOMERPHONE || '',
                  email: order.CUSTOMEREMAIL || '',
                  address: order.ADDRESS || '',
                  comuna: order.COMUNA || '',
                  region: order.REGION || '',
                });
                setEditingCustomer(true);
              }} className="ml-auto text-[10px] font-bold px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition no-print">
                {editingCustomer ? 'Cancelar' : 'Editar'}
              </button>
            </div>
            <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3">
              {editingCustomer ? (
                <div className="flex flex-col gap-2 no-print">
                  <style>{`.cust-input::placeholder { color: #94a3b8; font-weight: 500; }`}</style>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Nombre</label>
                  <input className="cust-input px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={customerForm.name} onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Marcela Araya Vargas" />
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">RUT</label>
                  <input className="cust-input px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={customerForm.rut} onChange={e => setCustomerForm(f => ({ ...f, rut: e.target.value }))} placeholder="Ej: 13.266.051-4" />
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Teléfono</label>
                  <input className="cust-input px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={customerForm.phone} onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))} placeholder="Ej: +56912345678" />
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Email</label>
                  <input className="cust-input px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={customerForm.email} onChange={e => setCustomerForm(f => ({ ...f, email: e.target.value }))} placeholder="Ej: marcela@gmail.com" />
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Dirección</label>
                  <input className="cust-input px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={customerForm.address} onChange={e => setCustomerForm(f => ({ ...f, address: e.target.value }))} placeholder="Ej: Calle Colonial 2628" />
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Comuna</label>
                  <input className="cust-input px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={customerForm.comuna} onChange={e => setCustomerForm(f => ({ ...f, comuna: e.target.value }))} placeholder="Ej: La Serena" />
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Región</label>
                  <input className="cust-input px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={customerForm.region} onChange={e => setCustomerForm(f => ({ ...f, region: e.target.value }))} placeholder="Ej: Coquimbo" />
                  <button onClick={saveCustomerData} disabled={savingCustomer} className="px-3 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition flex items-center gap-1.5 justify-center">
                    <Save className="w-3.5 h-3.5" />
                    {savingCustomer ? 'Guardando...' : 'Guardar datos'}
                  </button>
                </div>
              ) : (
                <>
                  <InfoRow icon={<User className="w-3.5 h-3.5" />} label="Nombre" value={order.CUSTOMERNAME} onCopy={() => copyText(order.CUSTOMERNAME, 'name')} copied={copied === 'name'} />
                  {order.CUSTOMERRUT && <InfoRow icon={<Hash className="w-3.5 h-3.5" />} label="RUT" value={order.CUSTOMERRUT} onCopy={() => copyText(order.CUSTOMERRUT!, 'rut')} copied={copied === 'rut'} />}
                  {order.CUSTOMERPHONE && <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="Teléfono" value={order.CUSTOMERPHONE} onCopy={() => copyText(order.CUSTOMERPHONE!, 'phone')} copied={copied === 'phone'} />}
                  {order.CUSTOMEREMAIL && <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={order.CUSTOMEREMAIL} onCopy={() => copyText(order.CUSTOMEREMAIL!, 'email')} copied={copied === 'email'} />}
                </>
              )}
            </div>
          </div>

          {/* Shipping */}
          <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden print-break">
            <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2">
              <MapPinned className="w-4 h-4 text-indigo-500" />
              <p className="font-semibold text-gray-900 text-xs sm:text-sm">Envío</p>
            </div>
            <div className="p-3 sm:p-5 space-y-1.5 sm:space-y-2">
              {editingAgency ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={selectedAgency}
                    onChange={e => setSelectedAgency(e.target.value)}
                    className="text-xs sm:text-sm font-bold border border-violet-200 rounded-lg px-2 py-1.5 bg-violet-50 text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-300 flex-1 min-w-[140px]"
                  >
                    <option value="">Seleccionar agencia</option>
                    {agencies.map(a => (
                      <option key={a.name} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                  <button onClick={saveAgency} disabled={!selectedAgency || savingAgency}
                    className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 disabled:opacity-50 transition">
                    <Save className="w-3 h-3" />
                    {savingAgency ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditingAgency(false)}
                    className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition">Cancelar</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {order.SHIPPINGAGENCY && (
                    <p className="text-sm sm:text-base font-bold text-violet-700 print:text-black">{order.SHIPPINGAGENCY}</p>
                  )}
                  {order.AGENCYCHANGED && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">Modificada</span>
                  )}
                  <button onClick={() => { setEditingAgency(true); setSelectedAgency(order.SHIPPINGAGENCY || ''); }}
                    className="text-[10px] font-bold px-2 py-1 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition flex items-center gap-1 no-print">
                    <Truck className="w-3 h-3" /> Cambiar
                  </button>
                </div>
              )}
              <p className="text-xs sm:text-sm font-medium text-gray-900">{order.ADDRESS || 'Sin dirección'}</p>
              <p className="text-[10px] sm:text-xs text-gray-500">{order.COMUNA}{order.COMUNA && order.REGION ? ', ' : ''}{order.REGION}</p>
              {displayAdditionalInfo && (
                <div className="mt-1.5 sm:mt-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="text-[10px] sm:text-xs text-gray-400 font-medium">Info adicional</p>
                  <p className="text-[10px] sm:text-xs text-gray-600 whitespace-pre-wrap">{displayAdditionalInfo}</p>
                </div>
              )}
              {(order as any).ADDRESSPHOTOURL && (
                <a href={(order as any).ADDRESSPHOTOURL} target="_blank" rel="noreferrer" className="block mt-1.5 sm:mt-2">
                  <img src={(order as any).ADDRESSPHOTOURL} alt="Foto dirección" className="w-full h-20 sm:h-24 object-cover rounded-lg border border-gray-200" />
                </a>
              )}
              {/* Tracking Number */}
              <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-100 no-print">
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-500">N° de Seguimiento</p>
                  {editingTracking ? (
                    <div className="flex gap-2 flex-col sm:flex-row">
                      <input
                        type="text"
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        placeholder="Ej. 123456789"
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                      <button
                        onClick={handleSaveTracking}
                        disabled={savingTracking}
                        className="px-3 py-1.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50"
                      >
                        {savingTracking ? '...' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingTracking(false);
                          setTrackingNumber((order as any).TRACKINGNUMBER || '');
                        }}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-200"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {(order as any).TRACKINGNUMBER ? (
                        <p className="text-sm sm:text-base font-bold text-violet-700 flex-1 break-all">{(order as any).TRACKINGNUMBER}</p>
                      ) : (
                        <p className="text-sm sm:text-base font-medium text-gray-400 italic flex-1">Sin número asignado</p>
                      )}
                      <button
                        onClick={() => setEditingTracking(true)}
                        className="text-[10px] font-bold px-2 py-1 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition flex items-center gap-1 shrink-0"
                      >
                        <Truck className="w-3 h-3" /> {(order as any).TRACKINGNUMBER ? 'Editar' : 'Añadir'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Comprobante de envío movido a su propia sección abajo */}
            </div>
          </div>

          {/* Comprobante de envío (para Embalado / Entregado a Agencia) */}
          {['shipped', 'delivered'].includes(order.STATUS) && !orderIsPickup && (
            <div className="no-print bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2">
                <Truck className="w-4 h-4 text-violet-500" />
                <p className="font-semibold text-gray-900 text-xs sm:text-sm">Comprobante de envío</p>
                {order.SHIPPINGPROOFURL && (
                  <span className="ml-auto text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full">Subido</span>
                )}
              </div>
              <div className="p-3 sm:p-5 space-y-3">
                {order.SHIPPINGPROOFURL ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const url = order.SHIPPINGPROOFURL!;
                        if (isPdfUrl(url) || shippingProofIsPdf) {
                          window.open(url, '_blank');
                        } else {
                          setShippingProofOpen(true);
                        }
                      }}
                      className="flex items-center gap-2 p-2.5 sm:p-3 bg-violet-50 border border-violet-200 rounded-lg sm:rounded-xl hover:bg-violet-100 transition group flex-1 text-left">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] sm:text-xs font-semibold text-violet-700">Ver comprobante de envío</p>
                        <p className="text-[9px] sm:text-[10px] text-violet-500">Click para ver</p>
                      </div>
                      <ExternalLink className="w-3 h-3 text-violet-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                    </button>
                    <button
                      onClick={handleAdminDeleteShippingProof}
                      title="Eliminar comprobante de envío"
                      className="p-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg sm:rounded-xl text-red-600 transition flex items-center justify-center shrink-0">
                      <Ban className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 p-2.5 sm:p-3 bg-violet-50 border border-violet-200 rounded-lg sm:rounded-xl cursor-pointer hover:bg-violet-100 transition group">
                    <input type="file" accept="image/*,application/pdf" onChange={handleAdminUploadShippingProof} className="hidden" disabled={uploadingShippingProof} />
                    {uploadingShippingProof ? (
                      <>
                        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        <p className="text-[10px] sm:text-xs text-violet-700 font-medium">Subiendo comprobante de envío...</p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-500 flex-shrink-0 group-hover:text-violet-600" />
                        <p className="text-[10px] sm:text-xs text-violet-700 font-medium">Subir comprobante de envío</p>
                      </>
                    )}
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Payment */}
          <div className="no-print bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-indigo-500" />
              <p className="font-semibold text-gray-900 text-xs sm:text-sm">Pago</p>
              {order.PAYMENTMETHOD && (
                <span className="ml-auto text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{order.PAYMENTMETHOD}</span>
              )}
            </div>
            <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3">
              {((order as any).IS_VENDOR_ORDER || (order as any).VENDOR_NAME) && (
                <div className="p-2.5 sm:p-3 bg-amber-50 border border-amber-200 rounded-lg sm:rounded-xl text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>🏪 Tienda Aliada:</span>
                    <span className="underline">{(order as any).VENDOR_NAME}</span>
                  </div>
                  {((order as any).VENDOR_BANK_HOLDER || (order as any).BANK_DETAILS?.holder) && (
                    <div className="text-[11px] text-amber-800 pt-1 border-t border-amber-200/70">
                      <span className="font-semibold">Datos bancarios informados al cliente:</span><br />
                      {(order as any).VENDOR_BANK_NAME || (order as any).BANK_DETAILS?.bank} · {(order as any).VENDOR_BANK_TYPE || (order as any).BANK_DETAILS?.type} Nº {(order as any).VENDOR_BANK_ACCOUNT || (order as any).BANK_DETAILS?.number}<br />
                      {(order as any).VENDOR_BANK_HOLDER || (order as any).BANK_DETAILS?.holder} (RUT: {(order as any).VENDOR_BANK_RUT || (order as any).BANK_DETAILS?.rut})
                    </div>
                  )}
                </div>
              )}
              {order.COUPONCODE && (
                <div className="flex items-center justify-between p-2 sm:p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <span className="text-[10px] sm:text-xs text-emerald-600 flex items-center gap-1"><Tag className="w-3 h-3" /> Cupón</span>
                  <span className="text-[10px] sm:text-xs font-mono font-bold text-emerald-700">{order.COUPONCODE}</span>
                </div>
              )}
              {(() => {
                const proofs = parsePaymentProofs(order?.PAYMENTPROOFURL);
                const canAdd = proofs.length < MAX_PAYMENT_PROOFS;
                const canUpload = ['pending', 'pending_stock', 'processing', 'paid', 'payment_expired', 'payment_review'].includes(order.STATUS);
                if (!proofs.length && !canUpload) return null;
                return (
                  <div className="space-y-2">
                    {proofs.map((url, i) => (
                      <div key={i} className="p-2.5 sm:p-3 bg-emerald-50 border border-emerald-200 rounded-lg sm:rounded-xl space-y-2">
                        <button onClick={() => { setSelectedPaymentProof(url); setProofOpen(true); }}
                          className="flex items-center gap-2 w-full text-left group">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] sm:text-xs font-semibold text-emerald-700">Comprobante de pago {i + 1}</p>
                            <p className="text-[9px] sm:text-[10px] text-emerald-500">Click para ver</p>
                          </div>
                          <ExternalLink className="w-3 h-3 text-emerald-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                        </button>
                        <div className="flex items-center gap-2 pt-1 border-t border-emerald-200/60">
                          <button onClick={() => handleAdminDeleteProof(i)} className="flex-1 flex items-center justify-center gap-1.5 p-1.5 sm:p-2 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-lg transition text-[10px] sm:text-xs font-bold">
                            <XCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            <span>Eliminar</span>
                          </button>
                        </div>
                      </div>
                    ))}
                    {canAdd && canUpload && (
                      <label className="flex items-center gap-2 p-2.5 sm:p-3 bg-amber-50 border border-amber-200 rounded-lg sm:rounded-xl cursor-pointer hover:bg-amber-100 transition group">
                        <input type="file" accept="image/*,.pdf" onChange={handleAdminUploadProof} className="hidden" disabled={uploadingProof} />
                        {uploadingProof ? (
                          <>
                            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                            <p className="text-[10px] sm:text-xs text-amber-700 font-medium">Subiendo...</p>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 flex-shrink-0 group-hover:text-amber-600" />
                            <p className="text-[10px] sm:text-xs text-amber-700 font-medium">Subir comprobante {proofs.length + 1} / {MAX_PAYMENT_PROOFS}</p>
                          </>
                        )}
                      </label>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Quick actions */}
          <div className="no-print bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5 space-y-1.5 sm:space-y-2">
            <p className="text-[10px] sm:text-xs font-semibold text-gray-500 mb-1.5 sm:mb-2 uppercase tracking-wide">Acciones rápidas</p>
            {MODULE_ACCESS.whatsappManagement && order.CUSTOMERPHONE && (
              <a href={`https://wa.me/${order.CUSTOMERPHONE.replace(/[^0-9+]/g, '')}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 w-full p-2 sm:p-2.5 bg-green-50 border border-green-200 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium text-green-700 hover:bg-green-100 transition">
                <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> WhatsApp
              </a>
            )}
            {MODULE_ACCESS.whatsappManagement && order.CUSTOMERPHONE && (
              <a href={`https://wa.me/${order.CUSTOMERPHONE.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(`¡Hola ${order.CUSTOMERNAME}! Te escribimos de Importadora Carlitos. 😊 Queríamos contarte que ya tenemos reservado tu pedido ${order.ORDERCODE || '#' + order.$id.slice(-6)} por un total de ${fmt(order.TOTAL)}. Escríbenos por aquí cuando tengas listo tu comprobante de transferencia para poder procesarlo y comenzar a prepararlo hoy mismo. ¡Muchas gracias por tu preferencia!`)}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 w-full p-2 sm:p-2.5 bg-amber-50 border border-amber-200 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium text-amber-800 hover:bg-amber-100 transition">
                <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" /> WhatsApp Pago Pendiente
              </a>
            )}
            {MODULE_ACCESS.whatsappManagement && order.STATUS === 'payment_confirmed' && !hasShippingData(order) && (
              <button
                type="button"
                onClick={handleNotifyShippingData}
                disabled={notifyingShipping}
                className="flex items-center gap-2 w-full p-2 sm:p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium text-emerald-800 hover:bg-emerald-100 transition text-left"
              >
                <Truck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                <span>{notifyingShipping ? 'Cargando...' : 'Pedir datos de envío por WhatsApp'}</span>
              </button>
            )}
            {order.STATUS !== 'cancelled' && (
              <button onClick={() => handleStatusChange('cancelled')}
                className="flex items-center gap-2 w-full p-2 sm:p-2.5 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium text-red-600 hover:bg-red-100 transition">
                <Ban className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Cancelar pedido
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── PAGE 2+: Products block ── */}
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
            const currentStock = it.id ? (productStocks[it.id] ?? (it.sku ? productStocks[it.sku] : undefined) ?? 0) : (it.sku ? (productStocks[it.sku] ?? 0) : 0);
            const isConfirmed = order.STOCKDEDUCTED === true;
            const loc = it.id ? productLocations[it.id] : (it.sku ? productLocations[it.sku] : null);
            const sku = it.id ? (productSkus[it.id] || it.sku || '') : (it.sku || '');
            const isMissing = !!(it as any).missing;
            const isReplaced = !!(it as any).replaced;
            const origItem = (it as any).originalItem;

            // En modo negociación, si hay algún item marcado como faltante o reemplazado,
            // ocultamos todos los que estén disponibles de forma normal.
            const hasNegotiations = order.STATUS === 'negotiation' && items.some(x => (x as any).missing || (x as any).replaced);
            if (hasNegotiations && !isMissing && !isReplaced) return null;

            return (
              <div key={i} className={`flex flex-col gap-2 px-3 sm:px-5 py-3 sm:py-3.5 hover:bg-gray-50/50 transition border-b border-gray-100 last:border-0 ${isMissing ? 'bg-red-50/80 border-l-4 border-l-red-500' : isReplaced ? 'bg-emerald-50/40 border-l-4 border-l-emerald-400' : ''}`}>
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="w-9 h-9 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {(() => { const im = itemImage(it); return im
                      ? <img src={im} alt="" className="w-full h-full object-contain p-0.5 sm:p-1" onError={(e) => { const t = e.target as HTMLImageElement; t.onerror = null; t.src = ''; t.style.display = 'none'; const p = t.parentElement; if (p) p.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>'; }} />
                      : <Package className="w-4 h-4 sm:w-5 sm:h-5 text-gray-300" />; })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-xs sm:text-sm font-semibold truncate ${isMissing ? 'text-red-950' : 'text-gray-900'}`}>{it.name}</p>
                      {isMissing && (
                        <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                          ⚠️ Faltante
                        </span>
                      )}
                      {isReplaced && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            🔄 Reemplazado
                          </span>
                          {(() => {
                            const origTotal = (origItem?.price || it.originalPrice || 0) * it.qty;
                            const replTotal = it.price * it.qty;
                            const diff = origTotal - replTotal;
                            if (diff === 0) return null;
                            return (
                              <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${diff > 0 ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-emerald-600 bg-emerald-50 border-emerald-100'}`}>
                                {diff > 0 ? `Dif en contra: ${fmt(diff)}` : `Saldo a favor: ${fmt(Math.abs(diff))}`}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                    {(it as any).note && (
                      <p className="text-[11px] bg-amber-50 text-amber-800 p-2 rounded-lg mt-1 border border-amber-100 font-medium">
                        💬 Nota: {(it as any).note}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5">
                      <span className="text-[10px] sm:text-xs text-gray-500">{fmt(it.price)} c/u</span>
                      <span className="text-gray-300">×</span>
                      <div className="flex items-center gap-1 no-print">
                        <input
                          type="number"
                          min={0}
                          value={it.qty}
                          onChange={async (e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val >= 0) {
                              await handleUpdateQty(i, val);
                            }
                          }}
                          className="w-12 px-1 py-0.5 border border-gray-300 rounded text-center focus:ring-1 focus:ring-indigo-500 focus:outline-none font-bold text-xs bg-white text-gray-800"
                        />
                      </div>
                      <span className="hidden print:inline text-[10px] sm:text-xs font-semibold text-gray-700">{it.qty}</span>
                      {it.originalPrice && it.originalPrice !== it.price && (
                        <span className="text-[9px] sm:text-[10px] line-through text-gray-300">{fmt(it.originalPrice)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {sku && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-800 text-[10px] sm:text-xs font-bold print:bg-violet-50 print:border print:border-violet-200">
                          <Hash className="w-3 h-3 shrink-0" />{sku}
                        </span>
                      )}
                      {loc?.label && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] sm:text-xs font-bold print:bg-indigo-50 print:border print:border-indigo-200">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {loc.label}
                        </span>
                      )}
                    </div>
                    {(it.id || it.sku) && !isMissing && !isReplaced && (
                      <div className="flex items-center gap-1 sm:gap-1.5 mt-1 flex-wrap no-print">
                        <span className={`text-[9px] sm:text-[10px] font-semibold px-1 sm:px-1.5 py-0.5 rounded ${currentStock <= 0 ? 'bg-red-100 text-red-600' : currentStock <= 5 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-600'}`} title="Stock físico actual en el sistema de Importadora Carlitos">
                          Stock tienda: {currentStock}
                        </span>
                        {isConfirmed ? (
                          <span className="text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200" title="Stock reservado automáticamente al crear el pedido">
                            📦 Apartado ({it.qty} uds)
                          </span>
                        ) : (
                          <span className={`text-[9px] sm:text-[10px] font-semibold px-1 sm:px-1.5 py-0.5 rounded ${currentStock <= 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {currentStock} disp
                          </span>
                        )}
                      </div>
                    )}
                    {isReplaced && origItem && (() => {
                      const originalPriceTotal = (origItem.price || 0) * it.qty;
                      const replacementPriceTotal = it.price * it.qty;
                      const difference = originalPriceTotal - replacementPriceTotal;
                      return (
                        <div className="mt-2 bg-gray-50 rounded-xl border border-gray-100 p-2.5">
                          <div className="flex items-center gap-2 sm:gap-3">
                            {/* Original product */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-white border border-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                {origItem.img ? <img src={origItem.img} className="w-full h-full object-contain p-0.5" /> : <Package className="w-4 h-4 text-gray-300" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] sm:text-xs font-semibold text-gray-600 truncate line-through">{origItem.name}</p>
                                <p className="text-[9px] text-gray-400 flex items-center gap-1">
                                  <Hash className="w-2.5 h-2.5" />{origItem.sku || 'Sin SKU'}
                                </p>
                                <p className="text-[9px] text-gray-500 font-bold">{fmt(origItem.price)} c/u</p>
                              </div>
                            </div>

                            {/* Arrow */}
                            <div className="flex flex-col items-center justify-center shrink-0">
                              <span className="text-gray-300 text-lg sm:text-xl font-bold">→</span>
                              <span className="text-[8px] text-gray-400 font-medium">reemplazado</span>
                            </div>

                            {/* New product */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-white border border-emerald-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                {it.img ? <img src={it.img} className="w-full h-full object-contain p-0.5" /> : <Package className="w-4 h-4 text-gray-300" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] sm:text-xs font-semibold text-emerald-700 truncate">{it.name}</p>
                                <p className="text-[9px] text-gray-400 flex items-center gap-1">
                                  <Hash className="w-2.5 h-2.5" />{sku || 'Sin SKU'}
                                </p>
                                <p className="text-[9px] text-gray-500 font-bold">{fmt(it.price)} c/u</p>
                              </div>
                            </div>
                          </div>

                          {/* Price difference */}
                          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-[9px] text-gray-400">Diferencia de precio:</span>
                            {difference > 0 ? (
                              <span className="text-[10px] font-bold text-orange-600">Dif en contra: {fmt(difference)}</span>
                            ) : difference < 0 ? (
                              <span className="text-[10px] font-bold text-emerald-600">Saldo a favor: {fmt(Math.abs(difference))}</span>
                            ) : (
                              <span className="text-[10px] font-bold text-gray-400">Sin diferencia</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs sm:text-sm font-bold text-gray-900">{fmt(it.total || it.price * it.qty)}</p>
                  </div>
                </div>

                {/* Actions row for this product inside order */}
                {['pending', 'pending_stock', 'processing', 'paid', 'negotiation'].includes(order.STATUS) && (
                  <div className="flex items-center gap-1.5 sm:gap-2 mt-1 sm:pl-18 no-print flex-wrap">
                    <button
                      onClick={() => toggleMissingItem(i)}
                      className={`text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-lg transition border ${isMissing ? 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
                    >
                      {isMissing ? 'Marcar como Disponible' : 'Marcar como Sin Stock (No Hay)'}
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`¿Eliminar "${it.name}" por completo de este pedido?`)) return;
                        let parsedItems: any[] = [];
                        try { parsedItems = JSON.parse(order.ITEMS || '[]'); } catch {}
                        parsedItems.splice(i, 1);
                        
                        const newSubtotal = parsedItems.reduce((s, x) => s + (x.price * x.qty), 0);
                        const newTotal = newSubtotal + (order.SHIPPINGCOST || 0) - (order.DISCOUNTAMOUNT || 0);

                        try {
                          const { databases } = getServices();
                          const { databaseId } = getFirebaseConfig();
                          await databases.updateDocument(databaseId, ORDERS_COLLECTION_ID, order.$id, {
                            ITEMS: JSON.stringify(parsedItems),
                            SUBTOTAL: newSubtotal,
                            TOTAL: newTotal
                          });
                          await load();
                        } catch (err: any) {
                          alert('Error al eliminar: ' + err.message);
                        }
                      }}
                      className="text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition border border-red-200"
                    >
                      Eliminar del Pedido
                    </button>
                    {isMissing && (
                      <>
                        <button
                          onClick={() => notifyMissingItemToCustomer(i, it.name)}
                          disabled={notifyingIdx === i || notifiedIndices.has(i)}
                          className={`text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-lg transition border flex items-center gap-1 ${
                            notifiedIndices.has(i)
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default'
                              : notifyingIdx === i
                              ? 'bg-amber-50 text-amber-700 border-amber-200 cursor-wait opacity-70'
                              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {notifiedIndices.has(i) ? (
                            <><Check className="w-3 h-3" /> Notificado</>
                          ) : notifyingIdx === i ? (
                            <><div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" /> Enviando...</>
                          ) : (
                            <><Send className="w-3 h-3" /> Notificar al cliente</>
                          )}
                        </button>
                        <button
                          onClick={() => handleOpenSimilarSearch(i)}
                          className="text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-1"
                        >
                          <Search className="w-3 h-3" /> Buscar Similares
                        </button>
                        <button
                          onClick={() => {
                            setIsSimilarSearch(false);
                            setReplacingIdx(i);
                            setMissingQty(it.qty || 1);
                            setReplacementSelection([]);
                          }}
                          className="text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
                        >
                          Reemplazar Producto
                        </button>
                      </>
                    )}
                    {isReplaced && origItem && (
                      <button
                        onClick={() => revertReplacement(i)}
                        className="text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Revertir Reemplazo
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Standalone Add Product button - always visible */}
        {['pending', 'pending_stock', 'processing', 'paid', 'negotiation'].includes(order.STATUS) && (
          <div className="px-3 sm:px-5 py-2.5 border-t border-gray-100 no-print">
            <button
              onClick={() => setShowAddProduct(true)}
              className="w-full py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Añadir Producto al Pedido
            </button>
          </div>
        )}
        {/* Totals / Negotiation summary */}
        {order.STATUS === 'negotiation' && (() => {
          const missingItems = items.filter((it: any) => it.missing);
          const replacedItems = items.filter((it: any) => it.replaced);
          const missingTotal = missingItems.reduce((s, it: any) => s + (it.price * it.qty), 0);
          const replacedTotal = replacedItems.reduce((s, it: any) => s + (it.price * it.qty), 0);
          const remaining = missingTotal - replacedTotal;
          const pct = missingTotal > 0 ? Math.min(100, Math.round((replacedTotal / missingTotal) * 100)) : 0;
          return (
            <div className="px-3 sm:px-5 py-3 sm:py-4 bg-gradient-to-r from-orange-50 to-amber-50 border-t border-orange-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold text-gray-700">📊 Resumen de negociación</span>
                <span className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full ${remaining <= 0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                  {remaining <= 0 ? '✓ Cubierto' : 'Pendiente'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-gray-600">Faltante total</span>
                <span className="font-bold text-gray-900">{fmt(missingTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-gray-600">Reemplazado hasta ahora</span>
                <span className={`font-bold ${remaining <= 0 ? 'text-green-600' : 'text-orange-600'}`}>{fmt(replacedTotal)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${remaining <= 0 ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-[10px] sm:text-xs">
                <span className="text-gray-500">Progreso: {pct}%</span>
                <span className={`font-bold ${remaining <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                  {remaining <= 0 ? `Cubierto (+${fmt(Math.abs(remaining))})` : `Falta: ${fmt(remaining)}`}
                </span>
              </div>
            </div>
          );
        })()}
        {order.STATUS !== 'negotiation' && (
        <div className="px-3 sm:px-5 py-3 sm:py-4 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100 space-y-1.5 sm:space-y-2">
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-700">{fmt(order.SUBTOTAL || order.TOTAL)}</span>
          </div>
          {order.SHIPPINGCOST > 0 ? (
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-gray-500 flex items-center gap-1"><Truck className="w-3 h-3" /> Envío</span>
              <span className="text-gray-700">{fmt(order.SHIPPINGCOST)}</span>
            </div>
          ) : (
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-gray-500 flex items-center gap-1"><Truck className="w-3 h-3" /> Envío</span>
              <span className="text-emerald-600 text-[10px] sm:text-xs font-medium">Pago contraentrega</span>
            </div>
          )}
          {(() => {
            const sub = order.SUBTOTAL || 0;
            const ship = order.SHIPPINGCOST || 0;
            const total = order.TOTAL || 0;
            const storedDisc = order.DISCOUNTAMOUNT || 0;
            const calcDisc = storedDisc > 0 ? storedDisc : (sub + ship - total);
            if (calcDisc > 0) {
              return (
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-emerald-600 flex items-center gap-1"><Tag className="w-3 h-3" /> Descuento {order.COUPONCODE && <span className="font-mono text-[10px] sm:text-xs">({order.COUPONCODE})</span>}{!order.COUPONCODE && !storedDisc && <span className="text-[9px] text-gray-400">(auto-calculado)</span>}</span>
                  <span className="text-emerald-600 font-medium">-{fmt(calcDisc)}</span>
                </div>
              );
            }
            return null;
          })()}
          <div className="flex justify-between text-base sm:text-lg font-bold pt-1.5 sm:pt-2 border-t border-gray-200">
            <span className="text-gray-900">Total</span>
            <span className="text-gray-900">{fmt(order.TOTAL)}</span>
          </div>
        </div>
        )}
      </div>
    </div>

    {/* Delivered modal — shown when trying to set "delivered" without proof/tracking */}
    {deliveredModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" onClick={closeDeliveredModal}></div>
        <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg text-gray-800">Entregar a Agencia</h3>
            <button onClick={closeDeliveredModal} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-5">Necesitas una de estas dos opciones:</p>

          {!deliveredModalMode && (
            <div className="space-y-3">
              <button onClick={() => setDeliveredModalMode('photo')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-blue-100 hover:border-blue-400 hover:bg-blue-50 transition text-left">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl">📷</div>
                <div className="flex-1">
                  <div className="font-bold text-gray-800 text-sm">Subir foto del comprobante de envío</div>
                  <div className="text-xs text-gray-400">Foto del comprobante de la agencia</div>
                </div>
              </button>
              <button onClick={() => setDeliveredModalMode('tracking')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-green-100 hover:border-green-400 hover:bg-green-50 transition text-left">
                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-2xl">📋</div>
                <div className="flex-1">
                  <div className="font-bold text-gray-800 text-sm">Ingresar número de seguimiento</div>
                  <div className="text-xs text-gray-400">Código de tracking de la agencia</div>
                </div>
              </button>
            </div>
          )}

          {deliveredModalMode === 'photo' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Foto del comprobante de envío</label>
                <input type="file" accept="image/*" onChange={(e) => setDeliveredModalFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-blue-50 file:text-blue-700 file:font-bold hover:file:bg-blue-100" />
                {deliveredModalFile && <p className="text-xs text-green-600 mt-2 font-semibold">✓ {deliveredModalFile.name}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDeliveredModalMode(null)} className="flex-1 py-3 rounded-2xl text-gray-500 font-semibold text-sm hover:bg-gray-50 border border-gray-200">Atrás</button>
                <button onClick={submitDeliveredModal} disabled={deliveredModalUploading || !deliveredModalFile}
                  className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-50">
                  {deliveredModalUploading ? 'Subiendo...' : 'Subir y entregar'}
                </button>
              </div>
            </div>
          )}

          {deliveredModalMode === 'tracking' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Número de seguimiento</label>
                <input type="text" value={deliveredModalTracking} onChange={(e) => setDeliveredModalTracking(e.target.value)}
                  placeholder="Ej: 1234567890" autoFocus
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-green-400 focus:outline-none font-semibold" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDeliveredModalMode(null)} className="flex-1 py-3 rounded-2xl text-gray-500 font-semibold text-sm hover:bg-gray-50 border border-gray-200">Atrás</button>
                <button onClick={submitDeliveredModal} disabled={deliveredModalUploading || !deliveredModalTracking.trim()}
                  className="flex-1 py-3 rounded-2xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 disabled:opacity-50">
                  {deliveredModalUploading ? 'Guardando...' : 'Guardar y entregar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    {shippingModalOpen && (
      <ShippingNotificationModal
        isOpen={shippingModalOpen}
        onClose={() => setShippingModalOpen(false)}
        order={order}
        initialData={shippingModalData}
      />
    )}
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
