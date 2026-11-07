'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, ShoppingBag, Trash2, Plus, Minus, ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, Zap, User, MessageCircle, Package } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { formatPrice } from '@/lib/db';
import { useCartItemPrice } from '@/hooks/useCartItemPrice';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useWebClientConfig } from '@/hooks/useWebClientConfig';
import type { CartItem } from '@/types';
import { getProductRisk } from '@/lib/stock-risk';
import StockVerificationModal from '@/components/StockVerificationModal';

interface Props {
  open: boolean;
  onClose: () => void;
}

function getMinPurchase(): number {
  try {
    const stored = localStorage.getItem('store_bank_details');
    if (stored) {
      const parsed = JSON.parse(stored);
      const val = Number(parsed.minimumPurchase);
      if (!isNaN(val) && val > 0) return val;
    }
  } catch {}
  return 50000;
}

interface Attendant {
  id: number | string;
  name: string;
  number: string;
  img?: string;
  border?: string;
  hover?: string;
  text?: string;
  sub?: string;
  active?: boolean;
  floatingEmojis?: string[];
}

const WHATSAPP_CONTACTS: Attendant[] = [
  {
    id: 0,
    name: 'Lissy',
    number: '56936302521',
    img: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/08/1785997439696-pegada-1785997429956.png',
    border: 'border-red-400',
    hover: 'hover:border-red-500',
    text: 'text-red-500',
    sub: 'Personalizado',
    floatingEmojis: ['❤️', '💖', '💕'],
  },
  {
    id: 1,
    name: 'Fernanda',
    number: '56945892576',
    img: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/08/1785998075009-pegada-1785998072451.png',
    border: 'border-gray-500',
    hover: 'hover:border-gray-600',
    text: 'text-gray-600',
    sub: 'Personalizado',
    floatingEmojis: ['🖤', '🖤', '🖤'],
  },
];

const BALATIN_CONTACT = {
  name: 'Importadora Carlitos',
  number: '56936715405',
  img: 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/09/1789051062597-pegada-1789051061671.png',
};

function normalizeChileanPhone(raw: string): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('56')) digits = digits.substring(2);
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (digits.length === 8) digits = '9' + digits;
  if (digits.length === 9 && digits.charAt(0) !== '9') digits = '9' + digits;
  if (digits.length > 9) digits = digits.substring(digits.length - 9);
  if (digits.length < 9) return '';
  return '56' + digits;
}

export default function CartDrawer({ open, onClose }: Props) {
  const { items, removeItem, updateQuantity, totalItems, subtotal, clearCart, getEffectivePrice, getEffectiveItemTotal } = useCart();
  const router = useRouter();
  const { 
    storeName,
    inventoryMode,
    minimumPurchase: serverMinPurchase,
    whatsappContacts,
    balatinContact,
    attendantMode,
    allowWhatsappOrders,
    allowWebOrders,
  } = useStoreSettings();
  const { config: webConfig } = useWebClientConfig();
  const currentStoreName = storeName || 'Importadora Carlitos';
  const [vendors, setVendors] = useState<any[]>([]);
  const [vendorsLoaded, setVendorsLoaded] = useState(false);
  const cartVendorIds = useMemo(() => [...new Set(items.map(item => {
    const vendorId = (item.product as any).VENDOR_ID;
    return vendorId && vendorId !== '__MAIN__' ? vendorId : '__MAIN__';
  }))], [items]);
  const commonVendorId = cartVendorIds.length === 1 ? cartVendorIds[0] : null;
  const currentVendor = commonVendorId && commonVendorId !== '__MAIN__' ? vendors.find(vendor => vendor.id === commonVendorId) : null;
  const minPurchase = currentVendor?.minPurchaseAmount || serverMinPurchase || getMinPurchase();
  const isMinReached = subtotal >= minPurchase;
  const missingForMin = Math.max(0, minPurchase - subtotal);
  const minimumProgress = Math.min(100, Math.max(0, (subtotal / minPurchase) * 100));

  const contactsList = useMemo(() => {
    if (Array.isArray(whatsappContacts)) {
      return whatsappContacts.filter(c => c.active !== false);
    }
    return WHATSAPP_CONTACTS.filter(c => c.active !== false);
  }, [whatsappContacts]);

  const balatinConfig = useMemo(() => {
    return balatinContact || BALATIN_CONTACT;
  }, [balatinContact]);

  useEffect(() => {
    // La respuesta es pública y el endpoint ya define max-age/s-maxage; dejar
    // que el navegador reutilice ese caché al volver a montar el carrito.
    fetch('/api/public-data/vendors')
      .then(response => response.json())
      .then(data => setVendors(Array.isArray(data?.vendors) ? data.vendors : []))
      .catch(() => setVendors([]))
      .finally(() => setVendorsLoaded(true));
  }, []);

  const [timerLeft, setTimerLeft] = useState('09:59');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<0 | 1 | 2>(0); 
  const [selectedAttendant, setSelectedAttendant] = useState<number | 'balatin' | 'yexi' | 'vendor' | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const [confirmation, setConfirmation] = useState<{
    orderCode: string;
    waUrl: string;
    customerName: string;
    storeName: string;
  } | null>(null);

  useEffect(() => {
    try {
      const savedName = localStorage.getItem('cart_customer_name') || localStorage.getItem('customerName') || '';
      if (savedName) setCustomerName(savedName);
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;

    // Bloquear scroll del body mientras el drawer está abierto
    // (evita que la página suba/baje detrás del drawer en mobile)
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const getOrInitEndTime = () => {
      try {
        const endTs = localStorage.getItem('db_fomo_cart_timer_end');
        const now = Date.now();
        if (!endTs || Number(endTs) <= now) {
          const newEnd = now + 10 * 60 * 1000;
          localStorage.setItem('db_fomo_cart_timer_end', String(newEnd));
          return newEnd;
        }
        return Number(endTs);
      } catch {
        return Date.now() + 10 * 60 * 1000;
      }
    };

    let endTs = getOrInitEndTime();

    const tick = () => {
      let rem = Math.max(0, Math.floor((endTs - Date.now()) / 1000));
      if (rem <= 0) {
        endTs = Date.now() + 10 * 60 * 1000;
        try {
          localStorage.setItem('db_fomo_cart_timer_end', String(endTs));
        } catch {}
        rem = 10 * 60;
      }
      const m = Math.floor(rem / 60);
      const s = rem % 60;
      setTimerLeft(`${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => {
      clearInterval(interval);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (isModalOpen) {
      try {
        const savedName = localStorage.getItem('cart_customer_name') || localStorage.getItem('customerName') || '';
        const savedPhone = localStorage.getItem('customerPhone') || '';
        const prefAttendant = localStorage.getItem('preferredAttendant');
        if (savedName && !customerName) setCustomerName(savedName);
        if (savedPhone && !customerPhone) setCustomerPhone(savedPhone);
        if (prefAttendant !== null && !isNaN(Number(prefAttendant))) {
          setSelectedAttendant(Number(prefAttendant));
        }
      } catch {}
    }
  }, [isModalOpen]);

  if (!open) return null;

  const handleStartWhatsAppCheckout = () => {
    if (items.length === 0) return;
    if (cartVendorIds.length > 1) {
      onClose();
      router.push('/carrito');
      return;
    }
    if (commonVendorId && commonVendorId !== '__MAIN__' && (!vendorsLoaded || !currentVendor)) {
      alert(vendorsLoaded ? 'Esta tienda no está disponible' : 'Cargando información de la tienda. Intenta nuevamente.');
      return;
    }
    if (!isMinReached) {
      alert(`⚠️ Falta para la compra mínima: ${formatPrice(missingForMin)} (Mínimo requerido: ${formatPrice(minPurchase)})`);
      return;
    }
    setOrderError(null);
    setStockModalOpen(true);
  };

  const handleStockVerificationSuccess = () => {
    setStockModalOpen(false);
    setOrderError(null);
    setModalStep(0);
    setIsModalOpen(true);
  };

  const handleChoosePurchaseMethod = (method: 'whatsapp' | 'web') => {
    if (method === 'web') {
      setIsModalOpen(false);
      onClose();
      router.push(commonVendorId ? `/checkout?vendor=${encodeURIComponent(commonVendorId)}` : '/carrito');
      return;
    }

    setSelectedAttendant('balatin');
    setModalStep(2);
  };

  const handleSelectAttendant = (idx: number) => {
    setSelectedAttendant(idx);
    try {
      localStorage.setItem('preferredAttendant', String(idx));
    } catch {}
    setModalStep(2);
  };

  const handleSendToBalatin = async () => {
    if (items.length === 0) return;
    setSubmittingOrder(true);
    setOrderError(null);

    const savedName = (typeof window !== 'undefined' ? localStorage.getItem('customerName') : '') || customerName.trim() || '';
    const savedPhone = (typeof window !== 'undefined' ? localStorage.getItem('customerPhone') : '') || customerPhone.trim() || '';

    const orderItems = items.map(i => ({
      id: i.product.$id,
      sku: i.product.SKU || i.product.$id,
      name: i.product.NAME,
      qty: i.quantity,
      price: getEffectivePrice(i),
      image: i.product.IMAGEURL || '',
      total: getEffectiveItemTotal(i),
      isPack: !!i.isPack,
    }));

    let orderCode = `WA-${String(Date.now()).slice(-8)}`;
    let orderId = '';
    let orderStatus = 'paid';
    try {
      const res = await fetch('/api/catalogo/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: savedName,
          customerPhone: savedPhone,
          items: orderItems,
          total: subtotal,
          assignedCashier: balatinConfig.name || 'Importadora Carlitos',
        }),
      });
      const data = await res.json();
      if (data.success && data.orderCode) {
        orderCode = data.orderCode;
        orderId = data.orderId || '';
        orderStatus = data.status || 'paid';
      }
    } catch (e) {
      console.warn('Importadora Carlitos order creation fallback:', e);
    }

    let waMsg = '*Hola Ivan!*';
    if (savedName) waMsg += `, soy ${savedName}`;
    waMsg += `\n\nTengo un pedido del catalogo:\n\n`;
    waMsg += '----------------------------------------\n';
    items.forEach(i => {
      const price = getEffectivePrice(i);
      waMsg += `\n- ${i.product.NAME}\n`;
      waMsg += `  ${i.quantity} x ${formatPrice(price)} = ${formatPrice(price * i.quantity)}\n`;
    });
    waMsg += '\n----------------------------------------\n';
    waMsg += `*Total: ${formatPrice(subtotal)}*\n`;
    waMsg += `*Codigo: ${orderCode}*`;

    const cleanNumber = normalizeChileanPhone(balatinConfig.number || '56936715405') || '56936715405';
    const waUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(waMsg)}`;

    try {
      const prevOrders = JSON.parse(localStorage.getItem('myOrders') || '[]');
      prevOrders.unshift({
        id: orderId || orderCode,
        orderCode,
        items: orderItems,
        total: subtotal,
        assignedCashier: balatinConfig.name || 'Importadora Carlitos',
        status: orderStatus,
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem('myOrders', JSON.stringify(prevOrders.slice(0, 50)));
    } catch {}

    clearCart();
    setSubmittingOrder(false);
    setIsModalOpen(false);
    setConfirmation({
      orderCode,
      waUrl,
      customerName: savedName || 'Cliente',
      storeName: balatinConfig.name || 'Importadora Carlitos',
    });

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSubmitCustomerOrder = async () => {
    if (submittingOrder) return;
    const nameTrim = customerName.trim();
    if (!nameTrim) {
      setOrderError('Por favor ingresa tu nombre completo para continuar');
      return;
    }
    const phoneRaw = customerPhone.trim();
    if (!phoneRaw) {
      setOrderError('Por favor ingresa tu teléfono WhatsApp');
      return;
    }
    const normalized = normalizeChileanPhone(phoneRaw);
    if (!normalized) {
      setOrderError('Número de teléfono inválido. Ej: 9 1234 5678 o +56 9 1234 5678');
      return;
    }
    setSubmittingOrder(true);
    setOrderError(null);

    const isVendorOrder = Boolean(currentVendor && commonVendorId);
    const directWebBot = inventoryMode === 'web_independent' && !isVendorOrder;
    if (directWebBot && !normalizeChileanPhone(webConfig.botPhone)) {
      setOrderError('El número del bot aún no está configurado para esta tienda.');
      setSubmittingOrder(false);
      return;
    }
    const attendant = directWebBot
      ? { name: webConfig.storeName || currentStoreName, number: webConfig.botPhone }
      : isVendorOrder || selectedAttendant === 'balatin' || selectedAttendant === 'yexi'
      ? { name: balatinConfig.name || 'Importadora Carlitos', number: balatinConfig.number || '56936715405' }
      : typeof selectedAttendant === 'number' && contactsList[selectedAttendant]
        ? contactsList[selectedAttendant]
        : { name: balatinConfig.name || 'Importadora Carlitos', number: balatinConfig.number || '56936715405' };

    const apiBase = typeof window !== 'undefined' ? window.location.origin : '';
    const orderItems = items.map(i => ({
      id: i.product.$id,
      sku: i.product.SKU || i.product.$id,
      name: i.product.NAME,
      qty: i.quantity,
      price: getEffectivePrice(i),
      image: i.product.IMAGEURL || '',
      total: getEffectiveItemTotal(i),
      isPack: !!i.isPack,
    }));

    let orderCode = `WA-${String(Date.now()).slice(-8)}`;
    let orderId = '';
    let orderStatus = 'paid';

    try {
      const stockResponse = await fetch('/api/checkout/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'validate', items: orderItems }),
      });
      const stockData = await stockResponse.json().catch(() => null);
      if (!stockResponse.ok || !stockData?.ok) {
        throw new Error(stockData?.error || 'No se pudo verificar el stock');
      }

      const isVendorOrder = Boolean(currentVendor && commonVendorId);
      const res = await fetch(isVendorOrder ? '/api/checkout/vendor-order' : '/api/catalogo/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isVendorOrder ? {
          vendorId: commonVendorId,
          customerName: nameTrim,
          customerPhone: normalized,
          items: orderItems,
          subtotal,
          orderSource: 'whatsapp',
        } : {
          customerName: nameTrim,
          customerPhone: normalized,
          items: orderItems,
          total: subtotal,
          assignedCashier: attendant.name,
        }),
      });
      const data = await res.json();
      if ((data.success || data.ok) && data.orderCode) {
        orderCode = data.orderCode;
        orderId = data.orderId || '';
        orderStatus = data.status || 'paid';
      } else {
        throw new Error(data.error || 'No se pudo crear el pedido');
      }
    } catch (e: any) {
      console.error('Order creation failed:', e);
      setOrderError(e?.message || 'No se pudo crear el pedido');
      setSubmittingOrder(false);
      return;
    }

    const attendantFirstName = (() => {
      const n = attendant.name || 'Importadora Carlitos';
      // Use last word of name (e.g. "Importadora Carlitos" -> "Ivan", "Yexy" -> "Ivan" fallback)
      const parts = n.trim().split(/\s+/);
      const last = parts[parts.length - 1];
      // If the last word looks like a real first name (not "Balato" / "Don"), use it; otherwise default to Ivan
      const skipWords = ['balato', 'don', 'dueño', 'tienda', 'bot', 'yexy', 'kenia', 'balatin'];
      return skipWords.includes(last.toLowerCase()) ? 'Ivan' : last;
    })();
    let waMsg = `*Hola ${attendantFirstName}!* Soy *${nameTrim}*\n\n`;
    if (isVendorOrder && currentVendor) {
      waMsg += `Quiero realizar este pedido de la tienda aliada *${currentVendor.name}*:\n\n`;
    } else {
      waMsg += 'Quiero realizar este pedido desde el catalogo online:\n\n';
    }
    waMsg += '----------------------------------------\n';
    if (isVendorOrder && currentVendor) {
      waMsg += `*Tienda:* ${currentVendor.name}\n`;
    }
    waMsg += `*Cliente:* ${nameTrim}\n`;
    if (normalized) waMsg += `*Telefono:* ${normalized}\n`;
    waMsg += `*Codigo:* ${orderCode}\n\n`;
    waMsg += '*Productos:*\n';
    items.forEach(i => {
      const price = getEffectivePrice(i);
      waMsg += `\n- ${i.product.NAME}\n`;
      waMsg += `  ${i.quantity} x ${formatPrice(price)} = ${formatPrice(price * i.quantity)}\n`;
    });
    waMsg += '\n----------------------------------------\n';
    waMsg += `*Total: ${formatPrice(subtotal)}*\n`;
    waMsg += `*Codigo: ${orderCode}*`;

    const targetNumber = normalizeChileanPhone(attendant.number || balatinConfig.number || '56936715405') || '56936715405';
    const waUrl = `https://wa.me/${targetNumber}?text=${encodeURIComponent(waMsg)}`;

    try {
      localStorage.setItem('customerName', nameTrim);
      localStorage.setItem('cart_customer_name', nameTrim);
      if (normalized) localStorage.setItem('customerPhone', normalized);
      if (typeof selectedAttendant === 'number') {
        localStorage.setItem('preferredAttendant', String(selectedAttendant));
      }
      const prevOrders = JSON.parse(localStorage.getItem('myOrders') || '[]');
      prevOrders.unshift({
        id: orderId || orderCode,
        orderCode,
        items: orderItems,
        total: subtotal,
        assignedCashier: attendant.name,
        status: orderStatus,
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem('myOrders', JSON.stringify(prevOrders.slice(0, 50)));
    } catch {}

    clearCart();
    setSubmittingOrder(false);
    setIsModalOpen(false);
    setConfirmation({
      orderCode,
      waUrl,
      customerName: nameTrim,
      storeName: currentVendor?.name || currentStoreName,
    });

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 flex justify-end font-sans" style={{ zIndex: 2147484000 }}>
      <div onClick={onClose} className="absolute inset-0 bg-blue-950/40 backdrop-blur-xs transition-opacity duration-300" />
      <div className="relative h-full w-full sm:w-[440px] bg-[#f3f8fd] shadow-2xl flex flex-col border-l border-blue-100 z-10" style={{ animation: 'slideInRight .25s ease' }}>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 sm:px-5 py-4 bg-white border-b border-[#e2edf6]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-2xl bg-[#ffe17a] flex items-center justify-center text-[#234b78]">
              <ShoppingBag size={21} strokeWidth={2} />
            </div>
            <div>
              <h2 className="font-extrabold text-xl tracking-tight text-[#234b78] leading-tight">Tu pedido</h2>
              <span className="text-xs font-semibold text-[#7289a3]">
                {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-11 h-11 shrink-0 rounded-full bg-[#f1f6fb] hover:bg-blue-100 text-[#567492] flex items-center justify-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" aria-label="Cerrar carrito">
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 min-h-0">
          {items.length === 0 ? (
            <div className="text-center py-14 px-4 flex flex-col items-center">
              <div className="relative mb-4">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-b from-blue-50 to-indigo-100/70 border border-blue-200/70 flex items-center justify-center text-blue-600 shadow-sm">
                  <ShoppingBag size={36} strokeWidth={1.8} />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center shadow-xs">
                  <Zap size={12} className="text-amber-950 fill-current" />
                </div>
              </div>
              <h3 className="font-black text-slate-900 text-lg tracking-tight mb-1.5">Tu carrito está vacío</h3>
              <p className="text-xs text-slate-500 font-medium max-w-[250px] leading-relaxed mb-6">
                Explora nuestro catálogo mayorista, añade tus productos y asegura tu stock al mejor precio.
              </p>
              
              <div className="w-full max-w-xs space-y-2 mb-6 text-left">
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-700 text-xs font-semibold">
                  <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs shrink-0">✓</span>
                  <span>Precios mayoristas directos</span>
                </div>
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-700 text-xs font-semibold">
                  <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-xs shrink-0">🚚</span>
                  <span>Envíos a todo Chile</span>
                </div>
              </div>

              <Link
                href="/productos"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-2xl bg-[#ffdf76] hover:bg-[#ffe997] text-[#234b78] font-extrabold text-sm transition active:scale-95 cursor-pointer"
              >
                <span>Explorar catálogo</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <>
              {/* Purchase progress */}
              <div className="rounded-[20px] border border-[#e0ebf5] bg-white p-4 shadow-[0_3px_14px_rgba(35,75,120,0.04)]">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-[#7189a2]">Compra mínima mayorista</p>
                    <p className="mt-1 text-sm font-extrabold text-[#234b78]">
                      {isMinReached ? '¡Ya alcanzaste el mínimo!' : `Te faltan ${formatPrice(missingForMin)}`}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${isMinReached ? 'bg-emerald-50 text-emerald-700' : 'bg-[#fff4c7] text-[#7a5a10]'}`}>
                    {isMinReached ? 'Completado' : minimumProgress > 0 && minimumProgress < 1 ? '<1%' : `${Math.floor(minimumProgress)}%`}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full rounded-full bg-[#e9f0f7] overflow-hidden mb-2.5" role="progressbar" aria-label="Progreso del pedido mínimo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={minimumProgress}>
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${
                      isMinReached ? 'bg-emerald-500' : 'bg-[#ffcb3d]'
                    }`}
                    style={{ width: `${minimumProgress}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-semibold text-[#7189a2]">
                  <span>Llevas <strong className="text-[#234b78]">{formatPrice(subtotal)}</strong> de {formatPrice(minPurchase)}</span>
                  <span className="flex items-center gap-1"><ShieldCheck size={13} /> Stock reservado al pedir</span>
                </div>
              </div>

              <div className="space-y-2.5">
                {/* Banner de advertencia si hay productos con alta demanda */}
                {items.some(item => {
                  const risk = getProductRisk({
                    stock: (item.product as any)?.STOCK || 0,
                    salesVelocity7d: (item.product as any)?.salesVelocity7d || 0,
                    maxBatchSize: (item.product as any)?.maxBatchSize || 1,
                    daysSinceCreated: 999,
                    price: Number((item.product as any)?.CURRENTPRICE ?? (item.product as any)?.PRICE ?? (item.product as any)?.price ?? 0),
                  })
                  return risk.level === 'amarillo'
                }) && (
                  <div className="rounded-2xl px-3.5 py-3 border border-[#f6e1ac] bg-[#fffaf0] flex items-start gap-2.5">
                    <div className="w-7 h-7 shrink-0 rounded-lg bg-[#ffedbd] text-[#ae760e] flex items-center justify-center">
                      <Zap size={15} fill="currentColor" />
                    </div>
                    <p className="text-xs text-[#755723] font-medium leading-relaxed">
                      <strong className="font-extrabold">Alta rotación:</strong> hay productos de mucha demanda en tu pedido. Finalízalo pronto para confirmar disponibilidad.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between px-1 pt-1 pb-0.5">
                  <h3 className="text-sm font-extrabold text-[#234b78]">Productos</h3>
                  <span className="text-[11px] font-semibold text-[#8194a9]">{totalItems} {totalItems === 1 ? 'unidad' : 'unidades'}</span>
                </div>
                {items.map((item, idx) => (
                  <CartItemCard key={`${item.product.$id || item.product.SKU || idx}_${item.isPack ? 'pack' : 'unit'}_${item.bundleInstanceId || item.bundleId || 'regular'}`} item={item} updateQuantity={updateQuantity} removeItem={removeItem} />
                ))}
              </div>
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="shrink-0 border-t border-[#e0ebf5] px-4 sm:px-5 pt-3.5 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] bg-white shadow-[0_-8px_24px_rgba(35,75,120,0.06)]">
            <div className="space-y-1.5 mb-3">
              <div className="flex items-center justify-between gap-3 text-xs text-[#7189a2] font-medium">
                <span>Subtotal ({totalItems} {totalItems === 1 ? 'producto' : 'productos'})</span>
                <span className="font-bold text-[#234b78]">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-[#7189a2] font-medium">
                <span>Despacho</span>
                <span className="text-right text-[#617b96] font-semibold">A coordinar por agencia o retiro</span>
              </div>
              <div className="pt-2.5 border-t border-[#edf2f7] flex items-center justify-between gap-3">
                <div>
                  <span className="text-sm text-[#234b78] font-extrabold block">Total estimado</span>
                  <span className="text-[11px] text-[#8295a9] font-medium">Precios mayoristas</span>
                </div>
                <span className="text-2xl font-black tracking-tight text-[#234b78]">{formatPrice(subtotal)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleStartWhatsAppCheckout}
                disabled={!isMinReached}
                className={`group w-full min-h-12 px-4 rounded-2xl font-extrabold text-sm transition-all flex items-center justify-between gap-2 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  isMinReached
                    ? 'bg-[#ffdf76] hover:bg-[#ffe997] text-[#234b78] cursor-pointer'
                    : 'bg-[#eef3f8] text-[#8193a6] cursor-not-allowed'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <ShoppingBag size={18} strokeWidth={2.2} />
                  {isMinReached ? 'Realizar pedido mayorista' : `Faltan ${formatPrice(missingForMin)} para pedir`}
                </span>
                <ArrowRight size={17} className={`transition-transform ${isMinReached ? 'group-hover:translate-x-1' : ''}`} />
              </button>
              <div className="text-center pt-1 flex items-center justify-center gap-3 text-[11px] text-[#8b9eb1] font-medium">
                <span className="flex items-center gap-1"><ShieldCheck size={13} /> Compra segura</span>
                <span className="flex items-center gap-1"><MessageCircle size={13} /> Soporte WhatsApp</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <StockVerificationModal
        isOpen={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
        onSuccess={handleStockVerificationSuccess}
      />

      {isModalOpen && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ zIndex: 2147484010 }}>
          <div onClick={() => !submittingOrder && setIsModalOpen(false)} className="absolute inset-0 bg-black/65 backdrop-blur-xs transition-opacity" />
          <div className="relative w-full max-w-md bg-white rounded-t-[32px] sm:rounded-3xl p-5 sm:p-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] shadow-2xl z-10 border border-gray-100 max-h-[92vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-6 duration-200">
            
            {/* Mobile drag handle */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3.5 sm:hidden" />

            {modalStep === 0 && (
              <div>
                {/* Header with Title, Total and Close Button */}
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div>
                    <h3 className="font-extrabold text-lg sm:text-xl text-slate-950 tracking-tight">Elige cómo quieres comprar</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Total del pedido <strong className="ml-1 text-slate-900 font-extrabold">{formatPrice(subtotal)}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition shrink-0"
                    aria-label="Cerrar"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Opción 1: Compra Web */}
                  <button
                    type="button"
                    onClick={() => handleChoosePurchaseMethod('web')}
                    className="group w-full min-h-[88px] text-left rounded-2xl border border-blue-200 bg-blue-50/55 hover:bg-blue-50 hover:border-blue-400 hover:shadow-[0_5px_16px_rgba(37,99,235,.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3.5 px-3.5 py-3 sm:px-4">
                      <div className="w-11 h-11 rounded-xl bg-white border border-blue-100 flex items-center justify-center text-blue-700 shrink-0">
                        <Zap size={20} className="fill-current" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm sm:text-base text-slate-900 leading-tight">Pagar online</h4>
                        <p className="mt-1 text-xs sm:text-[13px] text-slate-600 leading-snug">Transferencia directa y reserva inmediata de stock</p>
                      </div>
                      <ArrowRight size={18} className="text-blue-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </div>
                  </button>

                  {/* Opción 2: Pedir por WhatsApp */}
                  <button
                    type="button"
                    onClick={() => handleChoosePurchaseMethod('whatsapp')}
                    className="group w-full min-h-[88px] text-left rounded-2xl border border-emerald-200 bg-emerald-50/45 hover:bg-emerald-50 hover:border-emerald-400 hover:shadow-[0_5px_16px_rgba(16,185,129,.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3.5 px-3.5 py-3 sm:px-4">
                      <div className="w-11 h-11 rounded-xl bg-white border border-emerald-100 flex items-center justify-center text-[#18a957] shrink-0">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm sm:text-base text-slate-900 leading-tight">Pedir por WhatsApp</h4>
                        <p className="mt-1 text-xs sm:text-[13px] text-slate-600 leading-snug">Confirma tu pedido directamente por WhatsApp</p>
                      </div>
                      <ArrowRight size={18} className="text-emerald-700 group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </div>
                  </button>
                </div>

                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="mt-4 w-full py-2.5 rounded-xl text-slate-500 font-semibold text-sm hover:bg-slate-50 hover:text-slate-700 transition"
                >
                  Cancelar
                </button>
              </div>
            )}
            {modalStep === 1 && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <button type="button" onClick={() => setModalStep(0)} className="text-xs font-bold text-gray-500 hover:text-gray-800 flex items-center gap-1 transition"><ArrowLeft size={14} /> Volver</button>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-700 flex items-center justify-center transition shrink-0"
                    aria-label="Cerrar"
                  >
                    <X size={15} />
                  </button>
                </div>
                <h3 className="font-extrabold text-lg sm:text-xl text-gray-900 text-center mb-1">¿Quién quieres que te atienda?</h3>
                <p className="text-xs text-gray-500 text-center mb-5">Selecciona una opción para continuar</p>
                <div className="flex flex-wrap justify-center items-start gap-4 sm:gap-6 py-2">
                  {contactsList.map((attendant, idx) => (
                    <button key={attendant.id ?? idx} type="button" onClick={() => handleSelectAttendant(idx)} className="group flex flex-col items-center gap-2 transition-all duration-200 active:scale-90">
                      <div className={`w-18 h-18 sm:w-20 sm:h-20 rounded-full border-3 ${attendant.border || (idx % 2 === 0 ? 'border-red-400' : 'border-gray-500')} ${attendant.hover || 'hover:border-blue-500'} bg-transparent flex items-center justify-center transition-all duration-200 group-hover:scale-105 group-hover:shadow-lg overflow-hidden relative`}>
                        <img src={attendant.img || 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/08/1785997439696-pegada-1785997429956.png'} alt={attendant.name} className="w-full h-full object-cover rounded-full" />
                        {(attendant.floatingEmojis || (idx % 2 === 0 ? ['❤️', '💖', '💕'] : ['🖤', '🖤', '🖤'])).map((em: string, eIdx: number) => (
                          <span key={eIdx} className={`absolute text-[12px] pointer-events-none select-none z-20 ${eIdx === 0 ? 'bottom-1 left-2' : eIdx === 1 ? 'top-1 right-2' : 'bottom-2 right-2'}`} style={{ animation: `${eIdx % 2 === 0 ? 'gentleEmojiFloat' : 'gentleEmojiPulse'} 3.5s ease-in-out ${eIdx * 0.5}s infinite alternate` }}>{em}</span>
                        ))}
                      </div>
                      <div className="text-center">
                        <div className="font-extrabold text-gray-800 text-xs sm:text-sm">{attendant.name}</div>
                        <div className="text-[10px] text-gray-400 font-medium mt-0.5">{attendant.sub || 'Personalizado'}</div>
                      </div>
                    </button>
                  ))}
                  {balatinConfig.active !== false && (
                    <button type="button" onClick={() => { setSelectedAttendant('balatin'); setModalStep(2); }} className="group flex flex-col items-center gap-2 transition-all duration-200 active:scale-90">
                      <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-3 border-blue-400 hover:border-blue-500 bg-transparent flex items-center justify-center transition-all duration-200 group-hover:scale-105 group-hover:shadow-lg overflow-hidden relative">
                        <img src={balatinConfig.img || BALATIN_CONTACT.img} alt={balatinConfig.name || 'Importadora Carlitos'} className="w-full h-full object-contain rounded-full" />
                        <span className="absolute text-[12px] bottom-1 left-2 pointer-events-none select-none z-20" style={{ animation: 'gentleEmojiFloat 3.4s ease-in-out 0s infinite alternate' }}>⚡</span>
                        <span className="absolute text-[11px] top-1 right-2 pointer-events-none select-none z-20" style={{ animation: 'gentleEmojiPulse 3.8s ease-in-out 0.6s infinite alternate' }}>✨</span>
                      </div>
                      <div className="text-center">
                        <div className="font-extrabold text-gray-800 text-xs sm:text-sm flex items-center gap-1 justify-center">{balatinConfig.name || 'Importadora Carlitos'} <span className="text-[8px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded-full">DUEÑO</span></div>
                        <div className="text-[10px] text-blue-500 font-medium mt-0.5">{balatinConfig.sub || 'Atención Directa'}</div>
                      </div>
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="mt-4 w-full py-2.5 rounded-xl text-gray-400 font-semibold text-xs hover:bg-gray-100 transition">Cancelar</button>
              </div>
            )}
            {modalStep === 2 && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <button type="button" onClick={() => setModalStep(0)} className="text-xs font-bold text-gray-500 hover:text-gray-800 flex items-center gap-1 transition"><ArrowLeft size={14} /> Volver</button>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-700 flex items-center justify-center transition shrink-0"
                    aria-label="Cerrar"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2 shadow-xs">
                  <User size={20} strokeWidth={2.4} />
                </div>
                <h3 className="font-extrabold text-lg sm:text-xl text-gray-900 text-center mb-0.5">Tus datos de contacto</h3>
                <p className="text-xs text-gray-500 text-center mb-4 max-w-xs mx-auto">Para asociar tu pedido y abrir tu chat de WhatsApp</p>
                {orderError && <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold text-center">{orderError}</div>}
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder="Ej: Juan Pérez"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:bg-white focus:outline-none font-semibold text-sm text-gray-900 placeholder:text-gray-400 transition"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Teléfono WhatsApp *</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSubmitCustomerOrder();
                        }
                      }}
                      placeholder="Ej: +56 9 1234 5678"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:bg-white focus:outline-none font-semibold text-sm text-gray-900 placeholder:text-gray-400 transition"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={submittingOrder}
                  onClick={handleSubmitCustomerOrder}
                  className="mt-4 w-full bg-[#25D366] hover:bg-[#1faa53] active:scale-[0.98] text-white font-extrabold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition disabled:opacity-60 text-sm cursor-pointer"
                >
                  {submittingOrder ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeDasharray="42 18" /></svg>
                      Preparando pedido...
                    </span>
                  ) : (
                    <>
                      <MessageCircle size={18} /> Continuar a WhatsApp
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmation && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ zIndex: 2147484020 }}>
          <div onClick={() => setConfirmation(null)} className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity" />
          <div className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] text-center shadow-2xl z-10 border border-blue-100">
            <div className="w-16 h-16 rounded-full bg-emerald-500 text-white mx-auto flex items-center justify-center mb-3 shadow-md"><CheckCircle2 size={36} strokeWidth={2.6} /></div>
            <h3 className="font-extrabold text-2xl text-blue-950 mb-1">¡Pedido enviado!</h3>
            <p className="text-xs text-gray-500 mb-4 px-2">Gracias <strong className="text-blue-950">{confirmation.customerName}</strong>.<br />Compraste en <strong className="text-blue-950">{confirmation.storeName}</strong>.<br />Envíanos el mensaje de WhatsApp para confirmar tu pedido.</p>
            <div className="bg-gray-50 rounded-2xl py-2.5 px-4 mb-5 border border-gray-200/80">
              <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider mb-0.5">Código del pedido</p>
              <p className="text-lg text-blue-950 font-mono font-black">{confirmation.orderCode}</p>
            </div>
            <a href={confirmation.waUrl} target="_blank" rel="noopener noreferrer" className="w-full bg-[#25D366] hover:bg-[#1faa53] text-white font-extrabold py-3.5 rounded-2xl active:scale-95 flex items-center justify-center gap-2 mb-2.5 shadow-md transition text-sm">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
              <span>Abrir WhatsApp ahora</span>
            </a>
            <button type="button" onClick={() => { setConfirmation(null); onClose(); }} className="w-full py-3 rounded-2xl text-gray-500 font-bold text-xs hover:bg-gray-100 transition">Cerrar</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes gentleEmojiFloat {
          0% { transform: translateY(0px) rotate(0deg); }
          100% { transform: translateY(-6px) rotate(8deg); }
        }
        @keyframes gentleEmojiPulse {
          0% { transform: scale(1) translateY(0px); }
          100% { transform: scale(1.18) translateY(-4px); }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function CartItemCard({ item, updateQuantity, removeItem }: { item: CartItem; updateQuantity: (id: string, qty: number, isPack?: boolean, stockOverride?: number, matchIsPack?: boolean, bundleInstanceId?: string | null) => void; removeItem: (id: string, bundleInstanceId?: string | null) => void; }) {
  const { unitPrice } = useCartItemPrice(item);
  const p = item.product;
  const [incrementMode, setIncrementMode] = useState<'unit' | 'pack'>(item.isPack ? 'pack' : 'unit');

  useEffect(() => {
    setIncrementMode(item.isPack ? 'pack' : 'unit');
  }, [item.isPack]);

  const displayTag = (p.SKU && p.SKU.length <= 12) ? `SKU: ${p.SKU}` : (p.SUBCATEGORYID || p.CATEGORYID || `COD: #${String(p.$id).slice(-6).toUpperCase()}`);
  const itemTotal = unitPrice * item.quantity;

  return (
    <div className="group relative flex gap-3 rounded-[20px] p-3 bg-white border border-[#e0ebf5] shadow-[0_3px_14px_rgba(35,75,120,0.04)]">
      <div className="w-[76px] h-[76px] rounded-2xl overflow-hidden shrink-0 bg-[#f2f7fc] border border-[#edf3f8] relative flex items-center justify-center">
        {p.IMAGEURL ? (
          <img src={p.IMAGEURL} alt={p.NAME} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-2xl">📦</span>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div className="pr-8">
          <div className="font-bold text-[#234b78] text-[13px] leading-snug line-clamp-2">
            {p.NAME}
          </div>
          <div className="text-[10px] text-[#8a9caf] font-semibold mt-1 truncate">
            {displayTag}
          </div>
          {item.bundleTitle && <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700"><Package size={11} /><span className="truncate">{item.bundleTitle}</span></div>}
        </div>

        {/* Delete button top right */}
        <button
          type="button"
          onClick={() => removeItem(p.$id, item.bundleInstanceId ?? (item.bundleId ? undefined : null))}
          className="absolute top-2 right-2 w-9 h-9 rounded-xl text-[#9aacc0] hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          title="Eliminar producto"
          aria-label="Eliminar producto"
        >
          <Trash2 size={16} />
        </button>

        <div className="flex flex-wrap items-end justify-between gap-2 mt-3">
          <div>
            {item.bundleId && item.bundleOriginalUnitPrice != null && item.bundleOriginalUnitPrice > unitPrice && (
              <div className="mb-1 text-[10px] font-semibold text-[#9aacc0] line-through">{formatPrice(item.bundleOriginalUnitPrice)}</div>
            )}
            <div className="text-[#234b78] font-extrabold text-base leading-none">
              {formatPrice(itemTotal)}
            </div>
            {item.quantity > 1 && (
              <div className="text-[10px] text-[#8a9caf] font-medium mt-1">
                {formatPrice(unitPrice)} c/u
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {item.bundleId ? (
              <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2 text-[11px] font-bold text-emerald-700">Parte del pack</span>
            ) : p.PACKQTY && p.PACKQTY > 1 && (
              <select
                value={incrementMode}
                onChange={e => {
                  const val = e.target.value as 'unit' | 'pack';
                  setIncrementMode(val);
                  if (val === 'pack') {
                    const packSize = p.PACKQTY || 1;
                    const remainder = item.quantity % packSize;
                    const newQty = remainder === 0 ? Math.max(packSize, item.quantity) : Math.ceil(item.quantity / packSize) * packSize;
                    updateQuantity(p.$id, newQty, true, undefined, Boolean(item.isPack), null);
                  } else {
                    updateQuantity(p.$id, item.quantity, false, undefined, Boolean(item.isPack), null);
                  }
                }}
                aria-label={`Modo de cantidad para ${p.NAME}`}
                className="text-[11px] min-h-9 px-2 rounded-xl border border-[#dfeaf4] bg-[#f4f8fc] text-[#567492] font-bold cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <option value="unit">Unidad</option>
                <option value="pack">Pack ({p.PACKQTY})</option>
              </select>
            )}

            <div className={`flex items-center bg-[#f0f6fb] rounded-xl border border-[#e3edf6] p-0.5 ${item.bundleId ? 'hidden' : ''}`}>
              <button
                type="button"
                onClick={() => updateQuantity(p.$id, item.quantity - (incrementMode === 'pack' ? (p.PACKQTY || 1) : 1), incrementMode === 'pack', undefined, Boolean(item.isPack), item.bundleInstanceId ?? (item.bundleId ? undefined : null))}
                className="w-9 h-9 rounded-lg bg-white hover:bg-blue-50 text-[#42688e] font-extrabold flex items-center justify-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                aria-label="Restar"
              >
                <Minus size={12} strokeWidth={2.8} />
              </button>
              <span className="w-8 text-center font-extrabold text-[#234b78] text-sm">
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={() => updateQuantity(p.$id, item.quantity + (incrementMode === 'pack' ? (p.PACKQTY || 1) : 1), incrementMode === 'pack', undefined, Boolean(item.isPack), item.bundleInstanceId ?? (item.bundleId ? undefined : null))}
                className="w-9 h-9 rounded-lg bg-[#ffdf76] hover:bg-[#ffe997] text-[#234b78] font-extrabold flex items-center justify-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                aria-label="Sumar"
              >
                <Plus size={12} strokeWidth={2.8} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
