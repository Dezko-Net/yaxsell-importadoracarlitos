'use client';

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { User, MapPin, Package, ChevronDown, ChevronRight, Shield, Truck, RefreshCw, Plus } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { getServices, getFirebaseConfig, ORDERS_COLLECTION_ID, WHOLESALE_ORDERS_COLLECTION_ID, APERTURA_SETTINGS_COLLECTION_ID, COUPONS_COLLECTION_ID } from '@/lib/db';
import { ADDRESSES_COLLECTION_ID } from '@/lib/db';
import { notifyNewOrder } from '@/lib/notify-admin';
import { CHILE_REGIONES } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { formatPrice } from '@/lib/db';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { resolveProductDisplayPrice, applyWebPrice } from '@/lib/apertura-promo';
import { getSkuFromFeatures, getBarcodeFromFeatures } from '@/lib/product-features';
import { useAperturaPromotion } from '@/hooks/useAperturaPromotion';
import { Query, ID } from '@/lib/db';
import Image from '@/components/StoreImage';
import Link from 'next/link';
import { isBelowMinimumOrder, minimumOrderMessage } from '@/lib/order-rules';
import { getPaymentDeadlineByRisk } from '@/lib/payment-deadline';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import DynamicCheckout from '@/components/DynamicCheckout';

interface AgencyOption { name: string; color: string; bg: string; desc: string; logo: string; active?: boolean; }
interface SavedAddress { id: string; alias: string; name: string; phone: string; fullAddress: string; commune: string; region: string; lat: number; lng: number; }

// Fallback agencies if API fails — debe coincidir con las agencias de Appwrite
const FALLBACK_AGENCIES: AgencyOption[] = [
  { name: 'RETIRO EN TIENDA', color: '#e65c00', bg: '#fff3e0', desc: 'Retiro en Chacabuco 08, Estación Central (Al lado de Carnicería El Carnicero)', logo: '', active: true },
  { name: 'STARKEN', color: '#ffffff', bg: '#f5f5f5', desc: 'Tarifa Cara - Cobertura Nacional', logo: 'https://cdn.shopify.com/app-store/listing_images/250a2eb754c4528e183002b0064a0dea/icon/CPSaw-Pd8e8CEAE=.jpeg', active: true },
  { name: 'PULLMAN CARGO', color: '#002855', bg: '#e6f0fa', desc: 'Tarifa económica - Ideal para cajas grandes', logo: 'https://media.licdn.com/dms/image/v2/C4E0BAQFbzoEKacuZyg/company-logo_200_200/company-logo_200_200/0/1678472951084/pullman_go_logo?e=2147483647&v=beta&t=xjy_N8LPAe1f7lvBLKVLO7mdNzEZ3_Zv_IIZNj7zXnI', active: true },
  { name: 'VARMONTT', color: '#c62828', bg: '#fce8e6', desc: 'Tarifa económica - Especialistas al Sur de Chile', logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRXEnhvSY8qCumnADJcC_SNl1fqFnKuYKsQhuygDA5o-RCraqCNStogGqQ&s=10', active: true },
  { name: 'BLUEXPRESS', color: '#1558b0', bg: '#e8f0fe', desc: 'Tarifa media/alta - Entrega express', logo: 'https://www.beetrack.com/hubfs/Logos%20Clientes/Logo%20BlueExpress.png', active: true },
  { name: 'CYC', color: '#3483fa', bg: '#e8f0fe', desc: 'Empresa Express', logo: 'https://www.cyccargo.cl/wp-content/uploads/2023/05/brand.png', active: true },
  { name: 'TVP', color: '#3483fa', bg: '#e8f0fe', desc: '', logo: 'https://tvp.cl/brand/logo-tvp-isotipo.png', active: true },
  { name: 'CRUZ DEL SUR', color: '#3483fa', bg: '#e8f0fe', desc: '', logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ5UHOw-IEx4fNPTTsjGK7SjjN5MxWSIp_EMJ4TsRwmwg0c8fCzw5IshNZm&s=10', active: true },
  { name: 'TRAMAR', color: '#3483fa', bg: '#e8f0fe', desc: '', logo: '', active: true },
  { name: '5SUR', color: '#3483fa', bg: '#e8f0fe', desc: '', logo: '', active: true },
  { name: 'MENA', color: '#3483fa', bg: '#e8f0fe', desc: '', logo: '', active: true },
  { name: 'CACEM', color: '#3483fa', bg: '#e8f0fe', desc: '', logo: '', active: true },
  { name: 'JT TRANSPORTES', color: '#3483fa', bg: '#e8f0fe', desc: '', logo: '', active: true },
];

const PINK = '#2563eb'; const PINK_LIGHT = '#60a5fa'; const PINK_BG = '#eff6ff'; const FF = '"DM Sans", system-ui, sans-serif';
const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', border: '1.5px solid #dbeafe', borderRadius: 12, fontSize: 14, outline: 'none', color: '#111', background: '#fff', boxSizing: 'border-box', transition: 'all .2s', fontFamily: FF };
const selectStyle: React.CSSProperties = { ...inp, appearance: 'none', paddingRight: 32, backgroundColor: '#fff', color: '#111' };
const optionStyle: React.CSSProperties = { backgroundColor: '#fff', color: '#111' };
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6, fontFamily: FF };

function CheckoutInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const discountParam = parseFloat(searchParams.get('discount') || '0');
  const vendorFilter = searchParams.get('vendor'); // '__MAIN__' o vendorId
  const { items: allItems, subtotal: allSubtotal, clearCart, catalogSubtotal, aperturaSavings, updateCartWithLiveProducts, removeItem, hasPackItems, getEffectiveItemTotal, getEffectivePrice, updateQuantity } = useCart();

  // Filtrar items según el vendor seleccionado (pago por tienda)
  const items = vendorFilter
    ? allItems.filter(i => {
        const vId = (i.product as any).VENDOR_ID || '__MAIN__';
        return vId === vendorFilter;
      })
    : allItems;
  const subtotal = items.reduce((s, i) => s + getEffectiveItemTotal(i), 0);
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const { unlimitedStock, minimumPurchase, storeName } = useStoreSettings();
  const currentStoreName = storeName || 'Importadora Carlitos';
  const minOrder = minimumPurchase || 50000;
  const { settings: apertura, isActive: aperturaActive, discountPercent: aperturaPct } = useAperturaPromotion();

  const [form, setForm] = useState({
    name: '', rut: '', phone: '', email: '',
    region: '', comuna: '', address: '', additionalInfo: '',
  });
  const [customerNote, setCustomerNote] = useState('');
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [isGift, setIsGift] = useState(false);
  const [agencies, setAgencies] = useState<AgencyOption[]>(FALLBACK_AGENCIES);
  const [agency, setAgency] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [deliveryType, setDeliveryType] = useState<'domicilio' | 'agencia'>('domicilio');

  // Refresca los datos visibles del carrito desde el endpoint público. No se
  // elimina nada aquí: una lectura incompleta/permisos nunca significan que un
  // documento haya sido borrado. La comprobación autoritativa ocurre al escanear
  // y al enviar el pedido, usando Firebase Admin en /api/checkout/stock.
  const refreshedCartIdsRef = useRef('');
  useEffect(() => {
    const ids = [...new Set(allItems
      .filter(item => item.product.SKU !== 'PROMO1')
      .map(item => String(item.product.$id || '').trim())
      .filter(Boolean))].sort();
    if (!ids.length) return;
    const key = ids.join('|');
    if (refreshedCartIdsRef.current === key) return;
    refreshedCartIdsRef.current = key;

    let cancelled = false;
    fetch(`/api/public-data/products?ids=${encodeURIComponent(ids.join(','))}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (cancelled || !Array.isArray(data?.products) || data.products.length === 0) return;
        updateCartWithLiveProducts(data.products.map((product: any) => applyWebPrice(product)));
      })
      .catch(error => console.warn('[checkout] No se pudo refrescar el catálogo del carrito:', error));
    return () => { cancelled = true; };
  }, [allItems, updateCartWithLiveProducts]);

  const [showingNewAddress, setShowingNewAddress] = useState(false);
  const submittedRef = useRef(false);

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState('');
  const [couponDocId, setCouponDocId] = useState('');
  const [couponUserRestriction, setCouponUserRestriction] = useState<string | null>(null);
  const [publicCoupons, setPublicCoupons] = useState<any[]>([]);

  // Agency dropdown and modal state
  const [agencyDropdownOpen, setAgencyDropdownOpen] = useState(false);
  const [showAgencyModal, setShowAgencyModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  // Geolocation state
  const [showGeoModal, setShowGeoModal] = useState(false);
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [geoSkipped, setGeoSkipped] = useState(false);
  const [geoCoords, setGeoCoords] = useState<{lat: number, lng: number} | null>(null);
  const [geoError, setGeoError] = useState('');

  const comunas = form.region ? CHILE_REGIONES[form.region] || [] : [];
  const totalDiscount = discountParam + couponDiscount;
  const total = Math.max(0, subtotal - totalDiscount);
  const [vendorMinPurchase, setVendorMinPurchase] = useState(0);
  const commonVendorId = vendorFilter || (() => {
    const ids = [...new Set(items.map(i => (i.product as any).VENDOR_ID || '__MAIN__'))];
    return ids.length === 1 ? ids[0] : '__MAIN__';
  })();
  const effectiveMinimum = commonVendorId !== '__MAIN__' && vendorMinPurchase > 0 ? vendorMinPurchase : minOrder;
  const belowMinimum = isBelowMinimumOrder(total, effectiveMinimum);

  useEffect(() => {
    if (items.length === 0 && !submittedRef.current) router.push('/carrito');
  }, [items, router]);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
  }, [authLoading, isLoggedIn, router]);

  useEffect(() => {
    // Fetch agencies from API (managed in admin)
    (async () => {
      try {
        const res = await fetch(`/api/agencies${vendorFilter ? `?vendorId=${encodeURIComponent(vendorFilter)}` : ''}`);
        const data = await res.json();
        if (data.agencies && data.agencies.length > 0) {
          setAgencies(data.agencies);
        }
      } catch {
        // Keep fallback agencies
      }
    })();
  }, [vendorFilter]);

  useEffect(() => {
    if (commonVendorId === '__MAIN__') {
      setVendorMinPurchase(0);
      return;
    }
    fetch('/api/public-data/vendors')
      .then(res => res.json())
      .then(data => {
        const vendor = data.vendors?.find((item: any) => item.id === commonVendorId);
        setVendorMinPurchase(Number(vendor?.minPurchaseAmount) || 0);
      })
      .catch(() => setVendorMinPurchase(0));
  }, [commonVendorId]);

  // Fetch public coupons (via API to avoid server SDK in client)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/public-data/coupons');
        if (!res.ok) return;
        const docs = (await res.json()) as any[];
        const active = (Array.isArray(docs) ? docs : []).filter((c: any) => {
          const isActive = c.isActive ?? c.ISACTIVE ?? c.ACTIVE ?? true;
          if (!isActive) return false;
          const rawExpires = c.expiresAt || c.EXPIRESAT || c.endAt || c.ENDAT || null;
          if (rawExpires) {
            let expDate: Date | null = null;
            if (typeof rawExpires === 'number') {
              expDate = new Date(rawExpires < 1e12 ? rawExpires * 1000 : rawExpires);
            } else {
              expDate = new Date(rawExpires);
            }
            if (expDate && expDate < new Date()) return false;
          }
          const maxUses = c.maxUses || c.MAXUSES || 0;
          const usedCount = c.usedCount || c.USEDCOUNT || 0;
          if (maxUses && usedCount >= maxUses) return false;
          const code = (c.code || c.CODE || '').toUpperCase();
          if (!code) return false;
          return true;
        });
        setPublicCoupons(active);
      } catch (e) { console.error('Failed to fetch public coupons:', e); }
    })();
  }, []);

  useEffect(() => {
    if (couponApplied && couponUserRestriction && couponUserRestriction.trim().toLowerCase() !== 'null') {
      const restrictedVal = couponUserRestriction.trim().toLowerCase();
      const userEmail = user?.email?.trim().toLowerCase();
      const userId = user?.id?.trim().toLowerCase();
      const checkoutEmail = form.email?.trim().toLowerCase();

      const matchUser = (userId && userId === restrictedVal) || 
                        (userEmail && userEmail === restrictedVal) ||
                        (checkoutEmail && checkoutEmail === restrictedVal);

      if (!matchUser) {
        removeCoupon();
        setError('El cupón aplicado se removió porque no coincide con el correo o usuario ingresado');
      }
    }
  }, [form.email, user, couponApplied, couponUserRestriction]);

  useEffect(() => {
    // Load saved addresses from DB first, fallback to localStorage
    if (user?.id) {
      (async () => {
        try {
          const { databases } = getServices();
          const { databaseId } = getFirebaseConfig();
          const res = await databases.listDocuments(databaseId, ADDRESSES_COLLECTION_ID, [
            Query.equal('userId', user.id),
            Query.limit(25),
          ]);
          const dbAddrs: SavedAddress[] = res.documents.map((doc: any) => {
            const rawAddress = doc.fullAddress || doc.address || '';
            const rawAlias = doc.alias || '';
            const displayAlias = (rawAlias === 'Otro' || !rawAlias)
              ? (rawAddress.replace('[SUCURSAL]', '').trim().split(',')[0].slice(0, 30) || 'Otro')
              : rawAlias;
            return {
              id: doc.$id,
              alias: displayAlias,
              name: doc.name || '',
              phone: doc.phone || '',
              fullAddress: rawAddress,
              commune: doc.commune || doc.city || '',
              region: doc.region || '',
              lat: doc.lat || 0,
              lng: doc.lng || 0,
            };
          });
          if (dbAddrs.length > 0) {
            setSavedAddresses(dbAddrs);
            setSelectedAddressId(dbAddrs[0].id);
            fillFormFromAddress(dbAddrs[0]);
            localStorage.setItem(`addr_${user.id}`, JSON.stringify(dbAddrs));
          } else {
            // Fallback to localStorage
            const stored = localStorage.getItem(`addr_${user.id}`);
            if (stored) {
              const addresses: SavedAddress[] = JSON.parse(stored);
              setSavedAddresses(addresses);
              if (addresses.length > 0) {
                setSelectedAddressId(addresses[0].id);
                fillFormFromAddress(addresses[0]);
              } else {
                setSelectedAddressId(null);
              }
            } else {
              setSavedAddresses([]);
              setSelectedAddressId(null);
            }
          }
        } catch {
          // Fallback to localStorage on error
          try {
            const stored = localStorage.getItem(`addr_${user.id}`);
            if (stored) {
              const addresses: SavedAddress[] = JSON.parse(stored);
              setSavedAddresses(addresses);
              if (addresses.length > 0) {
                setSelectedAddressId(addresses[0].id);
                fillFormFromAddress(addresses[0]);
              } else {
                setSelectedAddressId(null);
              }
            } else {
              setSavedAddresses([]);
              setSelectedAddressId(null);
            }
          } catch {
            setSavedAddresses([]);
            setSelectedAddressId(null);
          }
        }
      })();
    }
  }, [user]);

  useEffect(() => {
    // Load user data (name, email, phone, RUT) from user and prefs
    if (user) {
      (async () => {
        try {
          const { account } = getServices();
          const acc = await account.get();
          const prefs = (acc as any).prefs || {};
          setForm(f => ({
            ...f,
            name: f.name || user.name || '',
            email: f.email || user.email || '',
            phone: f.phone || prefs.phone || user.phone || '',
            rut: f.rut || prefs.rut || '',
            region: f.region || prefs.region || '',
            comuna: f.comuna || prefs.comuna || '',
            address: f.address || prefs.address || '',
          }));
        } catch {}
      })();
    }
  }, [user]);

  function fillFormFromAddress(addr: SavedAddress) {
    const isSucursalAddress = (addr.fullAddress || '').startsWith('[SUCURSAL]');
    const cleanAddress = isSucursalAddress
      ? addr.fullAddress.replace('[SUCURSAL]', '').trim()
      : addr.fullAddress;

    setDeliveryType(isSucursalAddress ? 'agencia' : 'domicilio');

    setForm(f => ({
      ...f,
      name: addr.name || f.name,
      phone: addr.phone || f.phone,
      region: addr.region || f.region,
      comuna: addr.commune || f.comuna,
      address: cleanAddress || f.address,
      additionalInfo: '',
    }));
  }

  function selectAddress(addr: SavedAddress) {
    setSelectedAddressId(addr.id);
    fillFormFromAddress(addr);
  }

  async function deleteAddress(addrId: string) {
    const updated = savedAddresses.filter(a => a.id !== addrId);
    setSavedAddresses(updated);
    if (selectedAddressId === addrId) {
      if (updated.length > 0) {
        setSelectedAddressId(updated[0].id);
        fillFormFromAddress(updated[0]);
      } else {
        setSelectedAddressId(null);
        setShowingNewAddress(true);
        setForm({ name: '', rut: '', phone: '', email: '', region: '', comuna: '', address: '', additionalInfo: '' });
      }
    }
    if (user?.id) {
      try {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        await databases.deleteDocument(databaseId, ADDRESSES_COLLECTION_ID, addrId);
        localStorage.setItem(`addr_${user.id}`, JSON.stringify(updated));
      } catch (e) {
        console.error('Error deleting address:', e);
      }
    }
  }

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })); }

  function formatRut(val: string) {
    const clean = val.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length <= 1) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
  }

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      let coupon = publicCoupons.find((c: any) => String(c.code || c.CODE || '').trim().toUpperCase() === code) || null;
      if (!coupon) {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        // Try lowercase 'code' first, then uppercase 'CODE'
        let res = await databases.listDocuments(databaseId, COUPONS_COLLECTION_ID, [
          Query.equal('code', code),
          Query.limit(1),
        ]);
        if (res.documents.length === 0) {
          try {
            res = await databases.listDocuments(databaseId, COUPONS_COLLECTION_ID, [
              Query.equal('CODE', code),
              Query.limit(1),
            ]);
          } catch {}
        }
        if (res.documents.length > 0) {
          coupon = res.documents[0] as any;
        }
      }
      if (!coupon) {
        setCouponError('Cupón no encontrado');
        setCouponLoading(false);
        return;
      }

      // Validate active (try both lowercase and uppercase field names)
      const isActive = coupon.isActive ?? coupon.ISACTIVE ?? coupon.ACTIVE ?? true;
      if (!isActive) {
        setCouponError('Este cupón ya no está vigente');
        setCouponLoading(false);
        return;
      }
      // Validate expiry (try both lowercase and uppercase)
      // expiresAt can be epoch seconds (number) or ISO string
      const rawExpires = coupon.expiresAt || coupon.EXPIRESAT || coupon.endAt || coupon.ENDAT || null;
      let expiresAt: Date | null = null;
      if (rawExpires) {
        if (typeof rawExpires === 'number') {
          // epoch seconds — if < 1e12 it's seconds, otherwise milliseconds
          expiresAt = new Date(rawExpires < 1e12 ? rawExpires * 1000 : rawExpires);
        } else {
          expiresAt = new Date(rawExpires);
        }
      }
      if (expiresAt && expiresAt < new Date()) {
        setCouponError('Este cupón ha expirado');
        setCouponLoading(false);
        return;
      }
      // Validate max uses
      const maxUses = coupon.maxUses ?? coupon.MAXUSES ?? 0;
      const usedCount = coupon.usedCount ?? coupon.USEDCOUNT ?? 0;
      if (maxUses && usedCount >= maxUses) {
        setCouponError('Este cupón ha alcanzado su límite de usos');
        setCouponLoading(false);
        return;
      }
      // Validate min purchase
      const minOrderAmount = coupon.minPurchase ?? coupon.minOrderAmount ?? coupon.MINORDERAMOUNT ?? 0;
      if (minOrderAmount && subtotal < minOrderAmount) {
        setCouponError(`Compra mínima: ${formatPrice(minOrderAmount)}`);
        setCouponLoading(false);
        return;
      }

      // Validate user/email restriction
      const userRestriction = coupon.userRestriction || coupon.USERRESTRICTION || null;
      const hasRestriction = userRestriction && userRestriction.trim() !== '' && userRestriction.trim().toLowerCase() !== 'null';
      if (hasRestriction) {
        const restrictedVal = userRestriction.trim().toLowerCase();
        const userEmail = user?.email?.trim().toLowerCase();
        const userId = user?.id?.trim().toLowerCase();
        const checkoutEmail = form.email?.trim().toLowerCase();

        const matchUser = (userId && userId === restrictedVal) || 
                          (userEmail && userEmail === restrictedVal) ||
                          (checkoutEmail && checkoutEmail === restrictedVal);

        if (!matchUser) {
          setCouponError('Este cupón está restringido a otro usuario');
          setCouponLoading(false);
          return;
        }
      }

      // Calculate eligible subtotal for coupon (excluding active timed offer products)
      const now = Date.now();
      const eligibleSubtotal = items.reduce((acc, i) => {
        if (i.bundleId) return acc + getEffectiveItemTotal(i);
        const isOfferActive = i.timedOfferPrice && i.timedOfferExpiresAt && now < i.timedOfferExpiresAt;
        if (isOfferActive) return acc;
        
        const pFeatures = Array.isArray(i.product.FEATURES) ? i.product.FEATURES.join('\n') : i.product.FEATURES || '';
        const isExact = /ExactWholesale:\s*true/i.test(pFeatures);
        const minQty = i.product.WHOLESALEMINQUANTITY || 0;
        const qtyMatches = isExact 
          ? i.quantity === minQty 
          : i.quantity >= minQty;

        const hasConfiguredWholesale = !!(i.product.WHOLESALEPRICE && i.product.WHOLESALEMINQUANTITY);
        const effectiveWholesale = (hasConfiguredWholesale && qtyMatches) ? i.product.WHOLESALEPRICE : (hasConfiguredWholesale ? undefined : i.wholesalePrice);
        const itemPrice = effectiveWholesale || resolveProductDisplayPrice(i.product, apertura).displayPrice;
        return acc + itemPrice * i.quantity;
      }, 0);

      // Calculate discount
      let discount = 0;
      const couponValue = coupon.value ?? coupon.discountValue ?? coupon.DISCOUNTVALUE ?? coupon.VALUE ?? 0;
      const couponType = coupon.type ?? coupon.discountType ?? coupon.DISCOUNTTYPE ?? coupon.TYPE ?? 'percent';
      if (couponType === 'percent' || couponType === 'percentage') {
        discount = Math.round(eligibleSubtotal * couponValue / 100);
        const maxDiscount = coupon.maxDiscount ?? coupon.MAXDISCOUNT ?? 0;
        if (maxDiscount && discount > maxDiscount) discount = maxDiscount;
      } else {
        discount = couponValue;
      }
      discount = Math.min(discount, eligibleSubtotal);

      setCouponDiscount(discount);
      setCouponApplied(code);
      setCouponDocId(coupon.$id);
      setCouponUserRestriction(userRestriction || null);
    } catch (err: any) {
      setCouponError('Error al validar cupón');
    } finally {
      setCouponLoading(false);
    }
  }

  function removeCoupon() {
    setCouponDiscount(0);
    setCouponApplied('');
    setCouponDocId('');
    setCouponCode('');
    setCouponError('');
    setCouponUserRestriction(null);
  }

  async function reserveNextOrderIdentity(prefix: 'ORD' | 'WR' = 'ORD'): Promise<{ orderIndex: number; orderCode: string }> {
    try {
      const res = await fetch('/api/public-data/orders/next-index', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix }),
      });
      const data = await res.json();
      if (!res.ok || !data?.nextIndex || !data?.orderCode) {
        throw new Error(data?.error || 'No se pudo reservar un número único para tu pedido. Intenta nuevamente.');
      }
      return { orderIndex: Number(data.nextIndex), orderCode: String(data.orderCode) };
    } catch (error: any) {
      throw new Error(error?.message || 'No se pudo reservar un número único para tu pedido. Intenta nuevamente.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.region || !form.comuna) { setError('Selecciona región y comuna'); return; }
    if (!form.name || !form.rut || !form.phone) { setError('Completa todos los campos obligatorios'); return; }
    if (belowMinimum) {
      setError(minimumOrderMessage(total, effectiveMinimum));
      return;
    }
    
    if (!agency) {
      setShowAgencyModal(true);
      return;
    }

    setShowSummaryModal(true);
  }

  async function executeCheckout() {
    setShowSummaryModal(false);
    // Si no se ha decidido sobre geolocalización, mostrar modal
    if (!geoSkipped && !geoCoords) {
      setShowGeoModal(true);
      return;
    }

    if (hasPackItems) {
      createWholesaleRequest(geoCoords);
    } else {
      createOrder(geoCoords);
    }
  }

  async function createWholesaleRequest(coords: {lat: number, lng: number} | null) {
    setSubmitting(true); setError('');
    try {
      // Validate pack stock for wholesale items
      for (const item of items) {
        if (item.isPack && item.product.PACKQTY && item.product.PACKQTY > 1) {
          const rawStock = item.product.STOCK || 0;
          // Skip validation for unlimited stock sentinel
          if (rawStock === 99999) continue;
          const packStock = (item.product.PACK_STOCK && item.product.PACK_STOCK > 0)
            ? item.product.PACK_STOCK
            : Math.floor(rawStock / item.product.PACKQTY);
          const requestedPacks = Math.ceil(item.quantity / item.product.PACKQTY);
          if (packStock < requestedPacks) {
            const msg = `Stock insuficiente para "${item.product.NAME}". Solo hay ${packStock} paquete(s) disponible(s) y solicitaste ${requestedPacks}.`;
            setError(msg);
            setGeoError(msg);
            setSubmitting(false);
            return;
          }
        }
      }

      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const now = Date.now();
      const wholesaleIdentity = await reserveNextOrderIdentity('WR');
      const reqCode = wholesaleIdentity.orderCode;
      const itemsData = items.map(i => {
        const prod = i.product as any;
        const productSku = prod.SKU || prod.sku || getSkuFromFeatures(prod.FEATURES, prod.TAGS, prod.jumpseller_id, prod.SKU) || '';
        const productBarcode = prod.BARCODE || prod.barcode || getBarcodeFromFeatures(prod.FEATURES, prod.BARCODE) || '';
        const total = getEffectiveItemTotal(i);
        const price = getEffectivePrice(i);
        return {
          id: prod.$id,
          name: prod.NAME,
          price,
          packQty: prod.PACKQTY || 1,
          qty: i.quantity,
          img: prod.IMAGEURL || '',
          total,
          isPack: i.isPack || false,
          sku: productSku,
          barcode: productBarcode
        };
      });
      const finalAddress = (agency !== 'RETIRO EN TIENDA' && deliveryType === 'agencia' && !form.address.startsWith('[SUCURSAL]'))
        ? `[SUCURSAL] ${form.address}` : form.address;
      const additionalInfoWithGeo = coords
        ? `${form.additionalInfo ? form.additionalInfo + '\n' : ''}[GEO:${coords.lat},${coords.lng}]`
        : form.additionalInfo;

      const docId = await databases.createDocument(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, ID.unique(), {
        USERID: user?.id || 'guest',
        ITEMS: JSON.stringify(itemsData),
        CUSTOMERNAME: form.name,
        CUSTOMERRUT: form.rut,
        CUSTOMERPHONE: form.phone,
        CUSTOMEREMAIL: form.email,
        REGION: form.region,
        COMUNA: form.comuna,
        ADDRESS: finalAddress,
        ADDITIONALINFO: additionalInfoWithGeo,
        SHIPPINGAGENCY: agency,
        ORDERCODE: reqCode,
        ORDERINDEX: wholesaleIdentity.orderIndex,
        SUBTOTAL: subtotal,
        TOTAL: subtotal,
        REQCODE: reqCode,
        STATUS: 'processing',
        CREATEDAT: now,
        ...(customerNote.trim() ? { CUSTOMERNOTE: customerNote.trim() } : {}),
      });
      // Update First Purchase state
      if (user) {
        try {
          const { account } = getServices();
          const acc = await account.get();
          const currentPrefs = (acc as any).prefs || {};
          const updatedPrefs: any = { ...currentPrefs };
          
          if (currentPrefs.firstPurchaseActive || !currentPrefs.hasMadeFirstPurchase) {
            updatedPrefs.firstPurchaseActive = false;
            updatedPrefs.hasMadeFirstPurchase = true;
            await account.updatePrefs(updatedPrefs);
          }
        } catch (prefError) {
          console.log('Error saving user prefs:', prefError);
        }
      }

      submittedRef.current = true;
      items.forEach(it => removeItem(it.product.$id));
      router.push(`/pedido-mayorista-confirmado?id=${docId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar pedido mayorista';
      console.error('[createWholesaleRequest] Error:', err);
      setError(msg);
      setGeoError(msg);
    } finally { setSubmitting(false); }
  }

  const handleGeolocate = () => {
    setIsGeolocating(true);
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError('Tu navegador no soporta geolocalización.');
      setIsGeolocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeoCoords(coords);
        setIsGeolocating(false);
        setShowGeoModal(false);
        setGeoSkipped(false);
        if (hasPackItems) {
          createWholesaleRequest(coords);
        } else {
          createOrder(coords);
        }
      },
      (err) => {
        setGeoError('No se pudo obtener tu ubicación automáticamente: ' + err.message);
        setIsGeolocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleSkipGeo = () => {
    setGeoSkipped(true);
    if (hasPackItems) {
      createWholesaleRequest(null);
    } else {
      setShowGeoModal(false);
      createOrder(null);
    }
  };

  // Construye el shape de item usado tanto en el pedido propio como en los sub-pedidos de vendor.
  function buildItemPayload(i: typeof items[number]) {
    const total = getEffectiveItemTotal(i);
    const price = getEffectivePrice(i);
    const originalPrice = i.product.PRICE !== price ? i.product.PRICE : null;
    const note = itemNotes[i.product.$id] || '';
    const prod = i.product as any;
    const productSku = prod.SKU || prod.sku || getSkuFromFeatures(prod.FEATURES, prod.TAGS, prod.jumpseller_id, prod.SKU) || '';
    const productBarcode = prod.BARCODE || prod.barcode || getBarcodeFromFeatures(prod.FEATURES, prod.BARCODE) || '';
    return {
      id: i.product.$id,
      name: i.product.NAME,
      price,
      originalPrice,
      qty: i.quantity,
      img: resolveStorageImageUrl(i.product.IMAGEURL),
      total,
      sku: productSku,
      barcode: productBarcode,
      isPack: !!i.isPack,
      ...(i.bundleId ? {
        bundleId: i.bundleId,
        bundleInstanceId: i.bundleInstanceId,
        bundleTitle: i.bundleTitle,
        bundleUnitPrice: i.bundleUnitPrice,
        bundleOriginalUnitPrice: i.bundleOriginalUnitPrice,
      } : {}),
      ...(note.trim() ? { note: note.trim() } : {})
    };
  }

  async function createOrder(coords: {lat: number, lng: number} | null) {
    setSubmitting(true); setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      // ── Marketplace: separar productos propios de productos de vendors ──
      // Cada vendor termina en su propio pedido (colección vendor_orders, con
      // sus propios datos de transferencia); tus pedidos jamás se mezclan con
      // los de terceros.
      const ownItems = items.filter(i => !(i.product as any).VENDOR_ID || (i.product as any).VENDOR_ID === '__MAIN__');
      const vendorItemsByVendor = new Map<string, typeof items>();
      for (const i of items) {
        const vId = (i.product as any).VENDOR_ID;
        if (!vId || vId === '__MAIN__') continue;
        if (!vendorItemsByVendor.has(vId)) vendorItemsByVendor.set(vId, []);
        vendorItemsByVendor.get(vId)!.push(i);
      }
      const merchantCount = (ownItems.length > 0 ? 1 : 0) + vendorItemsByVendor.size;
      if (merchantCount > 1) {
        setError('Para proteger el stock y pagar a cada tienda correctamente, realiza un pedido por tienda. Vuelve al carrito y selecciona una tienda.');
        setSubmitting(false);
        return;
      }

      const orderIdentity = ownItems.length > 0 ? await reserveNextOrderIdentity() : null;
      const orderIndex = orderIdentity?.orderIndex || 0;
      const orderCode = orderIdentity?.orderCode || '';
      const now = Date.now();
      // Deadline dinámico: si hay productos amarillos en el carrito, 15 min visibles + 5 grace oculto
      const hasYellowItem = items.some(it => {
        const p = it.product as any
        const stock = Number(p?.STOCK ?? p?.stock ?? 0)
        const velocity = Number(p?.salesVelocity7d ?? 0)
        const maxBatch = Number(p?.maxBatchSize) || 1
        if (velocity === 0) {
          // Sin ventas pero stock bajo → amarillo si stock <=5
          return stock <= 5 && stock > Math.max(1, Math.ceil(maxBatch * 0.5))
        }
        const cobertura = stock / velocity
        const pisoBase = velocity < 0.2 ? 1 : 3
        const pisoCritico = Math.max(pisoBase, Math.ceil(maxBatch * 0.5))
        if (stock <= pisoCritico) return false // rojo, no amarillo
        // También es amarillo si el stock no alcanza para 1 lote típico
        if (stock < maxBatch) return true
        return cobertura >= 1.5 && cobertura < 4
      })
      let configuredExpirationMinutes: number | undefined;
      try {
        const expirationResponse = await fetch('/api/public-data/order-expiration', { cache: 'no-store' });
        if (expirationResponse.ok) {
          const expirationData = await expirationResponse.json();
          const parsedMinutes = Number(expirationData?.minutes);
          if (Number.isInteger(parsedMinutes) && parsedMinutes > 0) configuredExpirationMinutes = parsedMinutes;
        }
      } catch {}
      const riskDeadline = getPaymentDeadlineByRisk(hasYellowItem, new Date(now), configuredExpirationMinutes)
      // Guardar el plazo visible como expiresAt y conservar la gracia backend para el comprobante.
      let expiresAt = riskDeadline.visible;
      let backendExpiresAt = riskDeadline.backend;
      const itemsData = ownItems.map(buildItemPayload);
      const ownSubtotal = ownItems.reduce((s, i) => s + getEffectiveItemTotal(i), 0);
      const ownTotal = Math.max(0, ownSubtotal - totalDiscount);

      // ── Payload de stock para el servidor ──
      // La colección `products` NO es legible/escribible desde el navegador en
      // este proyecto (permisos sin rol anónimo). Antes el checkout la leía con
      // el cliente crudo: Appwrite respondía 200 con `{}`, `res.documents` era
      // undefined y el for...of reventaba ("... .documents is not iterable").
      // Ahora la validación y el descuento de stock van server-side con Firebase Admin
      // y datos frescos (ver src/app/api/checkout/stock/route.ts).
      const stockByProduct = new Map<string, { id: string; qty: number; name: string; sku: string; isPack: boolean }>();
      items.forEach(it => {
        const id = it.product.$id;
        if (!id) return;
        const current = stockByProduct.get(id);
        if (current) current.qty += it.quantity;
        else stockByProduct.set(id, {
          id,
          qty: it.quantity,
          name: it.product.NAME,
          sku: (it.product as any).SKU || (it.product as any).sku || '',
          isPack: false,
        });
      });
      const stockPayload = [...stockByProduct.values()];

      // ── Validar catálogo y ajustar cantidades positivas antes de crear el pedido ──
      // El POS tiene prioridad para Importadora Carlitos: stock cero no elimina el producto ni bloquea la venta.
      // Regla: STOCK = 99999 = sentinel de "ilimitado", nunca se valida ni
      // descuenta (la lógica vive en el endpoint).
      try {
        const vr = await fetch('/api/checkout/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'validate', items: stockPayload }),
        });
        const vd = await vr.json().catch(() => null);
        if (!vr.ok || !vd?.ok) {
          const removedNames: string[] = [];
          const adjustedNames: string[] = [];
          const blockedNames: string[] = [];

          if (vd?.removed && Array.isArray(vd.removed)) {
            for (const r of vd.removed) {
              const id = String(r?.id || '')
              const sku = String(r?.sku || '')
              const name = String(r?.name || '')
              const matchingItems = allItems.filter(it =>
                it.product.$id === id ||
                (sku && String((it.product as any).SKU || '') === sku) ||
                it.product.NAME === name
              );
              if (matchingItems.length) {
                matchingItems.forEach(item => removeItem(item.product.$id, item.bundleInstanceId ?? (item.bundleId ? undefined : null)));
                removedNames.push(name)
              }
            }
          }

          if (vd?.adjusted && Array.isArray(vd.adjusted)) {
            for (const adjustment of vd.adjusted) {
              const id = String(adjustment?.id || '')
              const sku = String(adjustment?.sku || '')
              const name = String(adjustment?.name || '')
              const quantity = Math.max(0, Math.floor(Number(adjustment?.adjustedQty) || 0))
              const stock = Math.max(0, Math.floor(Number(adjustment?.availableStock) || 0))
              const matchingItems = allItems.filter(it =>
                it.product.$id === id || (sku && String((it.product as any).SKU || '') === sku)
              );
              if (matchingItems.length) {
                let remaining = quantity;
                for (const item of matchingItems) {
                  const keepQty = Math.min(item.quantity, remaining);
                  remaining -= keepQty;
                  if (keepQty < item.quantity) {
                    updateQuantity(
                      item.product.$id || String((item.product as any).SKU || ''),
                      keepQty,
                      item.isPack,
                      stock,
                      Boolean(item.isPack),
                      item.bundleInstanceId ?? (item.bundleId ? undefined : null),
                    );
                  }
                }
                adjustedNames.push(name)
              }
            }
          }

          if (vd?.blocked && Array.isArray(vd.blocked)) {
            blockedNames.push(...vd.blocked.map((item: any) => {
              const name = String(item?.name || '').trim();
              const reason = String(item?.reason || '').trim();
              return name ? `${name}${reason ? ` (${reason})` : ''}` : '';
            }).filter(Boolean));
          }

          if (removedNames.length > 0 || adjustedNames.length > 0 || blockedNames.length > 0) {
            const notices = [
              removedNames.length > 0 ? `Se quitaron porque ya no existen: ${removedNames.join(', ')}` : '',
              adjustedNames.length > 0 ? `Ajustamos al stock actual: ${adjustedNames.join(', ')}` : '',
              blockedNames.length > 0 ? `Estos productos se mantienen en el carrito, pero debes resolver su disponibilidad antes de continuar: ${blockedNames.join(', ')}` : '',
            ].filter(Boolean).join('. ')
            setError(`${notices}. Revisa el carrito y vuelve a continuar.`)
            setSubmitting(false)
            return
          }

          setError(vd?.error || 'Error al consultar disponibilidad de productos. Intenta de nuevo.');
          setSubmitting(false);
          return;
        }
      } catch (err: any) {
        console.error('[checkout] Error consultando disponibilidad:', err);
        setError('Error al consultar disponibilidad de productos. ' + (err?.message || 'Intenta de nuevo.'));
        setSubmitting(false);
        return;
      }

      const finalAddress = (agency !== 'RETIRO EN TIENDA' && deliveryType === 'agencia' && !form.address.startsWith('[SUCURSAL]'))
        ? `[SUCURSAL] ${form.address}`
        : form.address;
      const additionalInfoWithGeo = coords
        ? `${form.additionalInfo ? form.additionalInfo + '\\n' : ''}[GEO:${coords.lat},${coords.lng}]`
        : form.additionalInfo;

      let orderId = '';
      if (ownItems.length > 0) {
        const docId = await databases.createDocument(databaseId, ORDERS_COLLECTION_ID, ID.unique(), {
          USERID: user?.id || 'guest', ITEMS: JSON.stringify(itemsData),
          CUSTOMERNAME: form.name, CUSTOMERRUT: form.rut, CUSTOMERPHONE: form.phone, CUSTOMEREMAIL: form.email,
          REGION: form.region, COMUNA: form.comuna, ADDRESS: finalAddress, ADDITIONALINFO: additionalInfoWithGeo,
          PAYMENTMETHOD: 'Transferencia Bancaria', SHIPPINGAGENCY: agency,
          SUBTOTAL: ownSubtotal, SHIPPINGCOST: 0, TOTAL: ownTotal,
          ORDERCODE: orderCode, ORDERINDEX: orderIndex,
          // El stock queda reservado y confirmado desde la creación del pedido.
          STATUS: 'paid', CREATEDAT: now, EXPIRESAT: expiresAt,
          EXPIRESATBACKEND: backendExpiresAt,
          EXPIRATIONWINDOWMINUTES: configuredExpirationMinutes ?? Math.max(1, Math.round((expiresAt - now) / 60000)),
          ...(customerNote.trim() ? { CUSTOMERNOTE: customerNote.trim() } : {}),
          ...(isGift ? { ISGIFT: true } : {}),
        });
        orderId = (docId as unknown as { $id: string }).$id;
      }
      // ── Crear un sub-pedido por cada vendor del marketplace presente en el carrito ──
      // Va a vendor_orders (colección separada, sin permisos públicos) con los
      // datos bancarios propios de cada vendor. El envío completo queda en tu
      // pedido; estos sub-pedidos no llevan costo de envío (fase 1).
      const vendorOrderResults: { vendorId: string; orderId: string; orderCode: string }[] = [];
      const createdOrderIds = orderId ? [orderId] : [];
      try {
        if (vendorItemsByVendor.size > 0) {
          const vr = await fetch('/api/checkout/vendor-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orders: [...vendorItemsByVendor.entries()].map(([vendorId, vendorItems]) => ({
                vendorId,
                items: vendorItems.map(buildItemPayload),
              })),
              customerName: form.name, customerRut: form.rut, customerPhone: form.phone, customerEmail: form.email,
              region: form.region, comuna: form.comuna, address: finalAddress, additionalInfo: additionalInfoWithGeo,
              shippingAgency: agency, parentOrderId: orderId || undefined, userId: user?.id || 'guest',
              expiresAt, backendExpiresAt,
            }),
          });
          const vd = await vr.json().catch(() => null);
          if (!vr.ok || !vd?.ok || !Array.isArray(vd.orders)) {
            throw new Error(vd?.error || 'No se pudo crear el pedido de la tienda aliada.');
          }
          for (const vendorOrder of vd.orders) {
            vendorOrderResults.push({ vendorId: vendorOrder.vendorId, orderId: vendorOrder.orderId, orderCode: vendorOrder.orderCode });
            createdOrderIds.push(vendorOrder.orderId);
          }
        }

        if (!orderId && vendorOrderResults.length > 0) orderId = vendorOrderResults[0].orderId;

        const reservationResponse = await fetch('/api/checkout/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'reserve_orders',
            orderIds: createdOrderIds,
            userId: user?.id || 'guest',
            email: form.email,
          }),
        });
        const reservation = await reservationResponse.json().catch(() => null);
        if (!reservationResponse.ok || !reservation?.ok) throw new Error(reservation?.error || 'No se pudo reservar el stock del pedido.');
      } catch (creationError) {
        // La reserva se ejecuta en una sola transacción. Si falla, se cancelan
        // los documentos recién creados y no se deja al cliente con pedidos parciales.
        if (createdOrderIds.length > 0) {
          await fetch('/api/checkout/stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'cleanup_unreserved',
              orderIds: createdOrderIds,
              userId: user?.id || 'guest',
              email: form.email,
            }),
          }).catch(() => null);
        }
        throw creationError;
      }

      submittedRef.current = true;

      // Notificación de nuevo pedido desactivada para evitar spam
      // Solo se notifica al admin cuando el cliente sube el comprobante de pago
      // notifyNewOrder(orderCode, form.name, total, items.length).catch(() => {});

      // Mark coupon as used (increment counter and deactivate)
      if (couponDocId) {
        try {
          const couponDoc = await databases.getDocument(databaseId, COUPONS_COLLECTION_ID, couponDocId);
          const currentCount = (couponDoc as any).usedCount ?? (couponDoc as any).USEDCOUNT ?? 0;
          await databases.updateDocument(databaseId, COUPONS_COLLECTION_ID, couponDocId, {
            isActive: false,
            ISACTIVE: false,
            usedCount: currentCount + 1,
            USEDCOUNT: currentCount + 1,
          });
        } catch {}
      }
      
      // Save user prefs for future purchases and handle First Purchase reward state
      if (user) {
        try {
          const { account } = getServices();
          const acc = await account.get();
          const currentPrefs = (acc as any).prefs || {};
          const updatedPrefs: any = { ...currentPrefs };
          
          if (form.rut) updatedPrefs.rut = form.rut;
          if (form.phone) updatedPrefs.phone = form.phone;
          if (form.region) updatedPrefs.region = form.region;
          if (form.comuna) updatedPrefs.comuna = form.comuna;
          if (form.address) updatedPrefs.address = form.address;

          // Update First Purchase state
          if (currentPrefs.firstPurchaseActive || !currentPrefs.hasMadeFirstPurchase) {
            updatedPrefs.firstPurchaseActive = false;
            updatedPrefs.hasMadeFirstPurchase = true;
          }

          await account.updatePrefs(updatedPrefs);

          // Guardar el NOMBRE real en la cuenta (el registro solo pide correo +
          // contraseña, así que el nombre se captura aquí, en el pedido). Así la
          // próxima compra precarga nombre/RUT/teléfono/dirección solos.
          const trimmedName = form.name.trim();
          if (trimmedName && trimmedName !== (acc as any).name) {
            try { await account.updateName(trimmedName); } catch (e) { console.log('Error saving name:', e); }
          }
        } catch (prefError) {
          console.log('Error saving user prefs:', prefError);
        }
      }
      
      // Save address to addresses collection for future purchases
      if (user && form.region && form.comuna && form.address) {
        try {
          const { databases } = getServices();
          const { databaseId } = getFirebaseConfig();
          // Check if this address already exists for the user
          const existing = await databases.listDocuments(databaseId, ADDRESSES_COLLECTION_ID, [
            Query.equal('userId', user.id),
            Query.equal('address', finalAddress),
            Query.equal('city', form.comuna),
            Query.limit(1),
          ]);
          if (existing.documents.length === 0) {
            await databases.createDocument(databaseId, ADDRESSES_COLLECTION_ID, ID.unique(), {
              userId: user.id,
              alias: (agency !== 'RETIRO EN TIENDA' && deliveryType === 'agencia') ? 'Sucursal' : (form.address.split(',')[0].trim().slice(0, 30) || 'Otro'),
              name: form.name,
              phone: form.phone,
              address: finalAddress,
              city: form.comuna,
              region: form.region,
              lat: 0,
              lng: 0,
            });
          }
        } catch (addrError) {
          console.log('Error saving address:', addrError);
        }
      }
      
      // Solo limpiar del carrito los items que se pagaron (pago por tienda)
      items.forEach(it => removeItem(it.product.$id));
      const extraVendorIds = vendorOrderResults.map(v => v.orderId).filter(id => id !== orderId);
      const extraParam = extraVendorIds.length ? `&vendorOrders=${extraVendorIds.join(',')}` : '';
      const ownerParams = user?.id || form.email ? `&userId=${encodeURIComponent(user?.id || '')}&email=${encodeURIComponent(form.email || '')}` : '';
      if (ownItems.length > 0) {
        router.push(`/pedido-confirmado?id=${orderId}${extraParam}${ownerParams}`);
      } else {
        // Checkout web de vendors: usa exactamente la página original de felicitaciones.
        // /confirmar-pedido queda reservado para los pedidos de WhatsApp.
        router.push(`/pedido-confirmado?id=${orderId}${extraParam}${ownerParams}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al crear pedido');
    } finally { setSubmitting(false); }
  }

  const totalItems = items.reduce((a, i) => a + i.quantity, 0);
  const distinctProducts = items.length;

  return (
    <>
      <style>{`
        @keyframes ckBtnShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes ckOrbFloat {
          0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
          10% { opacity: 0.9; }
          50% { transform: translateY(-22px) translateX(8px) scale(1.4); opacity: 1; }
          90% { opacity: 0.7; }
          100% { transform: translateY(-44px) translateX(-4px) scale(0.6); opacity: 0; }
        }
        @keyframes ckSparkle {
          0% { transform: scale(0) rotate(0deg); opacity: 0; }
          20% { transform: scale(1.2) rotate(90deg); opacity: 1; }
          50% { transform: scale(0.8) rotate(180deg); opacity: 0.8; }
          80% { transform: scale(1.1) rotate(270deg); opacity: 0.5; }
          100% { transform: scale(0) rotate(360deg); opacity: 0; }
        }
        @keyframes ckTrail {
          0% { transform: translateX(0) scaleX(1); opacity: 0.8; }
          50% { transform: translateX(20px) scaleX(1.5); opacity: 0.4; }
          100% { transform: translateX(40px) scaleX(0); opacity: 0; }
        }
        @keyframes ckPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(37,99,235,0.3), inset 0 0 12px rgba(255,255,255,0.1); }
          50% { box-shadow: 0 0 20px rgba(37,99,235,0.5), inset 0 0 20px rgba(255,255,255,0.2); }
        }
        @keyframes ckShimmer {
          0% { left: -40%; }
          100% { left: 110%; }
        }
        .ck-orb {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.9), rgba(255,255,255,0.1));
          box-shadow: 0 0 6px rgba(255,255,255,0.5);
          animation: ckOrbFloat 2.8s ease-in-out infinite;
        }
        .ck-orb:nth-child(1) { width: 8px; height: 8px; left: 8%; bottom: 4px; animation-delay: 0s; }
        .ck-orb:nth-child(2) { width: 5px; height: 5px; left: 22%; bottom: 2px; animation-delay: 0.4s; }
        .ck-orb:nth-child(3) { width: 10px; height: 10px; left: 38%; bottom: 6px; animation-delay: 0.8s; }
        .ck-orb:nth-child(4) { width: 6px; height: 6px; left: 52%; bottom: 3px; animation-delay: 1.2s; }
        .ck-orb:nth-child(5) { width: 7px; height: 7px; left: 68%; bottom: 5px; animation-delay: 1.6s; }
        .ck-orb:nth-child(6) { width: 4px; height: 4px; left: 82%; bottom: 2px; animation-delay: 2s; }
        .ck-orb:nth-child(7) { width: 9px; height: 9px; left: 92%; bottom: 4px; animation-delay: 2.4s; }
        .ck-sparkle {
          position: absolute;
          width: 4px; height: 4px;
          background: white;
          clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
          animation: ckSparkle 2s ease-in-out infinite;
          filter: drop-shadow(0 0 3px rgba(255,255,255,0.8));
        }
        .ck-sparkle:nth-child(8) { left: 15%; top: 30%; animation-delay: 0s; }
        .ck-sparkle:nth-child(9) { left: 45%; top: 20%; animation-delay: 0.7s; width: 5px; height: 5px; }
        .ck-sparkle:nth-child(10) { left: 75%; top: 40%; animation-delay: 1.4s; }
        .ck-sparkle:nth-child(11) { left: 30%; top: 55%; animation-delay: 0.3s; width: 3px; height: 3px; }
        .ck-sparkle:nth-child(12) { left: 60%; top: 15%; animation-delay: 1s; }
        .ck-trail {
          position: absolute;
          height: 2px;
          width: 20px;
          border-radius: 2px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
          animation: ckTrail 2.5s ease-in-out infinite;
        }
        .ck-trail:nth-child(13) { left: 5%; top: 45%; animation-delay: 0s; }
        .ck-trail:nth-child(14) { left: 35%; top: 35%; animation-delay: 0.8s; }
        .ck-trail:nth-child(15) { left: 65%; top: 50%; animation-delay: 1.6s; }
        @keyframes ckPulseWholesale {
          0%, 100% { box-shadow: 0 0 8px rgba(92,61,36,0.15), inset 0 0 12px rgba(255,255,255,0.15); }
          50% { box-shadow: 0 0 20px rgba(92,61,36,0.3), inset 0 0 20px rgba(255,255,255,0.3); }
        }
        .ck-confirm-btn {
          animation: ckBtnShift 3s ease infinite, ckPulse 2s ease-in-out infinite;
        }
        .ck-confirm-btn:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 12px 32px rgba(37,99,235,0.35), inset 0 0 20px rgba(255,255,255,0.15); }
        .ck-confirm-btn-wholesale {
          animation: ckBtnShift 3s ease infinite, ckPulseWholesale 2s ease-in-out infinite;
        }
        .ck-confirm-btn-wholesale:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 12px 32px rgba(92,61,36,0.25), inset 0 0 20px rgba(255,255,255,0.2); }
        .ck-shimmer-line {
          position: absolute;
          top: 0; bottom: 0;
          width: 40%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          animation: ckShimmer 2.5s ease-in-out infinite;
          pointer-events: none;
        }
        .ck-modal-agency-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        @media (max-width: 800px) {
          .ck-page { padding: 12px 12px calc(76px + env(safe-area-inset-bottom, 0px)) !important; }
          .ck-layout { flex-direction: column !important; gap: 12px !important; }
          .ck-main { min-width: 0 !important; width: 100% !important; }
          .ck-sidebar { width: 100% !important; position: static !important; order: -1; }
          .ck-card { padding: 16px 14px !important; border-radius: 16px !important; }
          .ck-card h2 { font-size: 15px !important; }
          .ck-agency-grid { grid-template-columns: 1fr !important; }
          .ck-form-grid { grid-template-columns: 1fr !important; }
          .ck-form-grid > div { grid-column: 1 / -1 !important; }
          .ck-summary-items { max-height: 180px !important; padding: 12px 14px !important; }
          .ck-breadcrumb { font-size: 12px !important; margin-bottom: 12px !important; flex-wrap: wrap; }
          
          /* Grid de agencias en modal (de 2 en 2 en mobiles) */
          .ck-modal-agency-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 10px !important;
          }
          .ck-agency-card {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
            padding: 14px 10px !important;
            gap: 10px !important;
          }
          .ck-agency-chevron {
            display: none !important;
          }
          .ck-agency-logo-wrapper {
            width: 48px !important;
            height: 48px !important;
            margin-bottom: 2px;
          }
          .ck-agency-name {
            font-size: 13px !important;
          }
          .ck-agency-desc {
            font-size: 10px !important;
            line-height: 1.2;
          }
        }
        .ck-input-placeholder::placeholder { color: #6b7280; opacity: 1; }
        .ck-textarea-placeholder::placeholder { color: #6b7280; opacity: 1; }

        /* ══════════════════════════════════════════════════════════
           REDISEÑO CHECKOUT — superficie con aurora + tarjetas premium
           + stepper + barra de compra fija en móvil.
           ══════════════════════════════════════════════════════════ */
        .ck-aurora {
          position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
        }
        .ck-aurora::before, .ck-aurora::after {
          content: ''; position: absolute; border-radius: 50%; filter: blur(70px);
        }
        .ck-aurora::before {
          width: 62vw; height: 62vw; max-width: 560px; max-height: 560px;
          top: -18%; left: -14%;
          background: radial-gradient(circle, rgba(56,189,248,.24), transparent 68%);
        }
        .ck-aurora::after {
          width: 60vw; height: 60vw; max-width: 540px; max-height: 540px;
          top: -12%; right: -16%;
          background: radial-gradient(circle, rgba(59,130,246,.20), transparent 68%);
        }

        /* Tarjeta de sección: marco premium con hairline de luz arriba */
        .ck-card {
          position: relative;
          border-radius: 20px !important;
          border: 1px solid rgba(37,99,235,.12) !important;
          background: linear-gradient(180deg, #fff, #fbfcff) !important;
          box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 14px 34px -22px rgba(37,99,235,.40) !important;
          backdrop-filter: none !important;
          overflow: hidden;
        }
        .ck-card::before {
          content: ''; position: absolute; top: 0; left: 18px; right: 18px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(56,189,248,.55), rgba(59,130,246,.35), transparent);
          pointer-events: none;
        }
        /* Insignia numerada: chip con halo */
        .ck-step-badge {
          width: 30px; height: 30px; border-radius: 11px; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center;
          color: #fff; font-size: 14px; font-weight: 800;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          box-shadow: 0 4px 12px rgba(37,99,235,.35), inset 0 1px 0 rgba(255,255,255,.4);
        }

        /* ── Stepper de progreso ── */
        .ck-stepper { display: flex; align-items: center; gap: 6px; margin-bottom: 18px; }
        .ck-step { display: flex; align-items: center; gap: 8px; }
        .ck-step-dot {
          width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 800; font-family: ${FF};
          background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff;
          box-shadow: 0 3px 10px rgba(37,99,235,.30);
        }
        .ck-step-label { font-size: 13px; font-weight: 700; color: #1e3a8a; font-family: ${FF}; white-space: nowrap; }
        .ck-step-line { flex: 1; height: 2px; border-radius: 2px; background: linear-gradient(90deg, #93c5fd, #dbeafe); min-width: 14px; }
        .ck-step.is-todo .ck-step-dot { background: #eef2ff; color: #93a4c8; box-shadow: none; }
        .ck-step.is-todo .ck-step-label { color: #9ca3af; }

        /* ── Barra de compra fija (móvil) ── */
        .ck-bar-total { display: none; }

        @media (max-width: 800px) {
          .ck-stepper { gap: 4px; margin-bottom: 14px; }
          .ck-step-label { display: none; }
          .ck-step-label.is-current { display: inline; }
          .ck-step-line { min-width: 10px; }

          /* CTA anclado abajo: total + botón siempre a la vista del pulgar */
          .ck-submit-bar {
            position: fixed !important; left: 0; right: 0; bottom: 0; z-index: 900;
            margin: 0 !important; padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px)) !important;
            background: rgba(255,255,255,.86);
            backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4);
            border-top: 1px solid rgba(37,99,235,.14);
            box-shadow: 0 -8px 26px rgba(16,24,40,.12);
            display: flex; align-items: center; gap: 12px;
          }
          .ck-bar-total {
            display: flex; flex-direction: column; line-height: 1.1; flex-shrink: 0;
          }
          .ck-bar-total small { font-size: 10px; font-weight: 700; color: #9ca3af; font-family: ${FF}; }
          .ck-bar-total b { font-size: 19px; font-weight: 900; color: ${PINK}; font-family: ${FF}; letter-spacing: -.02em; }
          .ck-submit-bar .ck-confirm-btn,
          .ck-submit-bar .ck-confirm-btn-wholesale {
            flex: 1; padding: 15px 0 !important; font-size: 15px !important; border-radius: 14px !important;
          }
          /* reserva para que la barra no tape el contenido */
          .ck-page { padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)) !important; }
        }
      `}</style>
    <div className="ck-page" style={{ minHeight: '100vh', padding: '24px 4%', fontFamily: FF, position: 'relative', background: 'linear-gradient(180deg, #f6f9ff 0%, #eef4ff 100%)' }}>
      <div className="ck-aurora" aria-hidden="true" />
      <div style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div className="ck-breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 14 }}>
          <Link href="/" style={{ color: PINK, textDecoration: 'none', fontWeight: 600 }}>Inicio</Link>
          <ChevronRight size={12} color={PINK_LIGHT} />
          <Link href="/carrito" style={{ color: PINK, textDecoration: 'none', fontWeight: 600 }}>Carrito</Link>
          <ChevronRight size={12} color={PINK_LIGHT} />
          <span style={{ color: '#9ca3af', fontWeight: 600 }}>Finalizar compra</span>
        </div>

        {/* Stepper de progreso */}
        <div className="ck-stepper" aria-hidden="true">
          <div className="ck-step">
            <span className="ck-step-dot">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <span className="ck-step-label">Carrito</span>
          </div>
          <div className="ck-step-line" />
          <div className="ck-step">
            <span className="ck-step-dot">2</span>
            <span className="ck-step-label is-current">Tus datos y envío</span>
          </div>
          <div className="ck-step-line" style={{ background: 'linear-gradient(90deg,#dbeafe,#eef2ff)' }} />
          <div className="ck-step is-todo">
            <span className="ck-step-dot">3</span>
            <span className="ck-step-label">Confirmar</span>
          </div>
        </div>

        {/* Banner: mostrar de qué tienda se está comprando */}
        {vendorFilter && items.length > 0 && (
          <div style={{ marginBottom: 12, padding: '10px 16px', borderRadius: 12, background: items[0] && (items[0].product as any).VENDOR_ID ? '#f5f3ff' : '#eff6ff', border: `1px solid ${items[0] && (items[0].product as any).VENDOR_ID ? '#ddd6fe' : '#bfdbfe'}`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: items[0] && (items[0].product as any).VENDOR_ID ? '#7c3aed' : '#1e40af' }}>
            🏪 Estás comprando productos de {items[0] && ((items[0].product as any).VENDOR_ID ? ((items[0].product as any).VENDOR_NAME || 'Tienda asociada') : currentStoreName)}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* ── LEFT ── */}
            <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Shipping agencies */}
              <div className="ck-card" style={{ background: '#fff', borderRadius: 20, padding: '22px 24px', border: '1px solid #dbeafe', boxShadow: 'none', backdropFilter: 'none', position: 'relative', zIndex: 50 }}>
                <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800, color: '#111', display: 'flex', alignItems: 'center', gap: 10, fontFamily: FF }}>
                  <span className="ck-step-badge">1</span>
                  Agencia de envío
                </h2>
                <div style={{ position: 'relative', zIndex: 10 }}>
                  <style>{`
                    .agencies-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
                    .agencies-row::-webkit-scrollbar { display: none; }
                    .agency-btn { flex: 0 0 auto; width: 92px; padding: 10px 6px; border: 2px solid #dbeafe; border-radius: 14px; background: #fff; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 5px; transition: all .2s; position: relative; }
                    .agency-btn.sel { border-color: ${PINK}; background: ${PINK_BG}; box-shadow: 0 4px 14px rgba(37,99,235,0.12); }
                    @media (min-width: 640px) {
                      .agencies-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); overflow: visible; padding-bottom: 0; }
                      .agency-btn { width: auto; }
                    }
                  `}</style>
                  <div className="agencies-row">
                    {agencies.map((ag: AgencyOption, idx: number) => {
                      const sel = agency === ag.name;
                      return (
                        <button type="button" key={ag.name + '_' + idx} onClick={() => { setAgency(ag.name); if (ag.name === 'RETIRO EN TIENDA') { setForm(f => ({ ...f, region: 'Región Metropolitana', comuna: 'Estación Central', address: 'Chacabuco 08, Estación Central, Chile', additionalInfo: 'Referencia: Al lado de Carnicería El Carnicero (https://maps.app.goo.gl/XYFewki3NjcTRoGr7)' })); setSelectedAddressId(null); setShowingNewAddress(true); } }}
                          className={`agency-btn ${sel ? 'sel' : ''}`}
                          onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = '#93c5fd'; }}
                          onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = '#dbeafe'; }}>
                          {sel && <span style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: '50%', background: `linear-gradient(135deg, ${PINK}, #1d4ed8)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          </span>}
                          <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ag.bg, borderRadius: 10, overflow: 'hidden' }}>
                            {ag.logo ? <img src={ag.logo} alt={ag.name} style={{ width: 32, height: 32, objectFit: 'contain' }} /> : <Truck size={20} color={ag.color} />}
                          </div>
                          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: sel ? ag.color : '#333', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{ag.name}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p style={{ margin: '12px 0 0', fontSize: 12, color: '#00a650', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <RefreshCw size={12} /> El costo de envío se paga al recibir el pedido (contraentrega). No se cobra al momento de la compra.
                </p>
              </div>

              {/* Saved Addresses */}
              {savedAddresses.length > 0 && !showingNewAddress && (
                <div className="ck-card" style={{ background: '#fff', borderRadius: 20, padding: '22px 24px', border: '1px solid #dbeafe', boxShadow: 'none', backdropFilter: 'none' }}>
                  <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800, color: '#111', display: 'flex', alignItems: 'center', gap: 10, fontFamily: FF }}>
                    <span className="ck-step-badge">2</span>
                    Dirección de envío
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, marginBottom: 12 }}>
                    {savedAddresses.map((addr) => {
                      const sel = selectedAddressId === addr.id;
                      const aliasIcon = addr.alias === 'Casa' ? '🏠' : addr.alias === 'Trabajo' ? '💼' : addr.alias === 'Sucursal' ? '🏪' : '📍';
                      return (
                        <div key={addr.id}
                          style={{ padding: '16px 18px', border: `2px solid ${sel ? PINK : '#dbeafe'}`, borderRadius: 14, background: sel ? PINK_BG : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all .2s', position: 'relative', boxShadow: sel ? '0 4px 14px rgba(37,99,235,0.15)' : 'none' }}
                          onClick={() => selectAddress(addr)}
                        >
                          {sel && <span style={{ position: 'absolute', top: 8, right: 10, width: 18, height: 18, borderRadius: '50%', background: `linear-gradient(135deg, ${PINK}, #1d4ed8)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          </span>}
                          <button type="button" onClick={(e) => { e.stopPropagation(); deleteAddress(addr.id); }}
                            style={{ position: 'absolute', top: 8, right: sel ? 36 : 10, width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s', padding: 0 }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#fecaca'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.transform = 'scale(1)'; }}
                            title="Eliminar dirección">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m-9 0v14a2 2 0 002 2h6a2 2 0 002-2V6"/></svg>
                          </button>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingRight: 28 }}>
                            <span style={{ fontSize: 16 }}>{aliasIcon}</span>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: sel ? PINK : '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addr.alias}</p>
                          </div>
                          {addr.name && (
                            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: sel ? '#1d4ed8' : '#444', lineHeight: 1.3 }}>
                              {addr.name}
                            </p>
                          )}
                          {addr.phone && (
                            <p style={{ margin: '0 0 6px', fontSize: 11, color: '#6b7280', lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10 }}>📞</span> {addr.phone}
                            </p>
                          )}
                          {addr.fullAddress && (
                            <p style={{ margin: '0 0 3px', fontSize: 12, color: '#555', lineHeight: 1.35, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                              <span style={{ fontSize: 10, marginTop: 2 }}>📮</span> <span>{addr.fullAddress}</span>
                            </p>
                          )}
                          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 10 }}>🗺️</span> {addr.commune}{addr.region ? `, ${addr.region}` : ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => { setShowingNewAddress(true); setSelectedAddressId(null); setDeliveryType('domicilio'); setForm({ name: '', rut: '', phone: '', email: '', region: '', comuna: '', address: '', additionalInfo: '' }); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: '1.5px dashed #60a5fa', borderRadius: 12, color: PINK, fontSize: 13, fontWeight: 600, background: PINK_BG, transition: 'all .15s', cursor: 'pointer', fontFamily: FF }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#dbeafe'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = PINK_BG; }}>
                    <Plus size={14} /> Agregar nueva dirección
                  </button>
                </div>
              )}

              {/* Personal data */}
              <div className="ck-card" style={{ background: '#fff', borderRadius: 20, padding: '22px 24px', border: '1px solid #dbeafe', boxShadow: 'none', backdropFilter: 'none', position: 'relative', zIndex: 1 }}>
                <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800, color: '#111', display: 'flex', alignItems: 'center', gap: 10, fontFamily: FF }}>
                  <span className="ck-step-badge">3</span>
                  Datos personales
                </h2>
                <div style={{ margin: '0 0 14px', padding: '8px 12px', borderRadius: 10, background: '#eff6ff', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#3b82f6', fontFamily: FF, fontWeight: 600 }}>
                  <Shield size={13} /> Estos datos quedarán guardados en tu cuenta y no necesitarás volver a ingresarlos
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={label}>Nombre completo *</label>
                    <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Juan Pérez" style={inp}
                      onFocus={e => { e.target.style.borderColor = PINK; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }} onBlur={e => { e.target.style.borderColor = '#dbeafe'; e.target.style.boxShadow = 'none'; }} />
                  </div>
                  <div>
                    <label style={label}>RUT *</label>
                    <input required value={form.rut} onChange={e => set('rut', formatRut(e.target.value))} placeholder="12.345.678-9" maxLength={12} style={inp}
                      onFocus={e => { e.target.style.borderColor = PINK; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }} onBlur={e => { e.target.style.borderColor = '#dbeafe'; e.target.style.boxShadow = 'none'; }} />
                  </div>
                  <div>
                    <label style={label}>Teléfono *</label>
                    <input required type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+56 9 1234 5678" style={inp}
                      onFocus={e => { e.target.style.borderColor = PINK; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }} onBlur={e => { e.target.style.borderColor = '#dbeafe'; e.target.style.boxShadow = 'none'; }} />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={label}>Email (para notificaciones)</label>
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="juan@email.com" style={inp}
                      onFocus={e => { e.target.style.borderColor = PINK; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }} onBlur={e => { e.target.style.borderColor = '#dbeafe'; e.target.style.boxShadow = 'none'; }} />
                  </div>
                </div>
              </div>

              {/* Shipping address - only show if no saved addresses OR user is adding new */}
              {(savedAddresses.length === 0 || showingNewAddress) && (
                <div className="ck-card" style={{ background: '#fff', borderRadius: 20, padding: '22px 24px', border: '1px solid #dbeafe', boxShadow: 'none', backdropFilter: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#111', display: 'flex', alignItems: 'center', gap: 10, fontFamily: FF }}>
                      <span className="ck-step-badge">4</span>
                      Dirección de envío
                    </h2>
                    {showingNewAddress && savedAddresses.length > 0 && (
                      <button type="button" onClick={() => { setShowingNewAddress(false); if (savedAddresses.length > 0) { setSelectedAddressId(savedAddresses[0].id); fillFormFromAddress(savedAddresses[0]); } }}
                        style={{ padding: '6px 12px', border: '1.5px solid #dbeafe', borderRadius: 10, color: PINK, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s', fontFamily: FF }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = PINK_BG; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}>
                        ← Usar dirección guardada
                      </button>
                    )}
                  </div>

                  {agency !== 'RETIRO EN TIENDA' && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={label}>Tipo de entrega *</label>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => setDeliveryType('domicilio')}
                          style={{
                            flex: 1,
                            padding: '12px',
                            border: `2px solid ${deliveryType === 'domicilio' ? PINK : '#dbeafe'}`,
                            borderRadius: 12,
                            background: deliveryType === 'domicilio' ? PINK_BG : '#fff',
                            color: deliveryType === 'domicilio' ? PINK : '#6b7280',
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            textAlign: 'center',
                            fontFamily: FF
                          }}
                        >
                          🏠 Despacho a Domicilio
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeliveryType('agencia')}
                          style={{
                            flex: 1,
                            padding: '12px',
                            border: `2px solid ${deliveryType === 'agencia' ? PINK : '#dbeafe'}`,
                            borderRadius: 12,
                            background: deliveryType === 'agencia' ? PINK_BG : '#fff',
                            color: deliveryType === 'agencia' ? PINK : '#6b7280',
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            textAlign: 'center',
                            fontFamily: FF
                          }}
                        >
                          🏢 Retiro en Sucursal / Agencia
                        </button>
                      </div>
                    </div>
                  )}
                  {agency === 'RETIRO EN TIENDA' && (
                    <div style={{ margin: '0 0 16px', padding: '14px 16px', borderRadius: 14, background: '#f0fdf4', border: '1.5px solid #86efac', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#166534' }}>
                        <MapPin size={16} /> Retiro en Tienda: Chacabuco 08, Estación Central, Chile
                      </div>
                      <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>
                        📍 <strong>Referencia:</strong> Al lado de Carnicería El Carnicero
                      </div>
                      <a
                        href="https://maps.app.goo.gl/XYFewki3NjcTRoGr7"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, color: '#2563eb', textDecoration: 'underline', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}
                      >
                        🗺️ Ver ubicación en Google Maps (Cómo llegar)
                      </a>
                    </div>
                  )}
                  <div style={{ margin: '0 0 14px', padding: '8px 12px', borderRadius: 10, background: '#eff6ff', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#3b82f6', fontFamily: FF, fontWeight: 600 }}>
                    <MapPin size={13} /> Esta dirección quedará guardada en tu cuenta para futuros pedidos
                  </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ position: 'relative' }}>
                    <label style={label}>Región *</label>
                    <select required value={form.region} onChange={e => { set('region', e.target.value); set('comuna', ''); }}
                      style={selectStyle}
                      onFocus={e => { e.target.style.borderColor = PINK; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }} onBlur={e => { e.target.style.borderColor = '#dbeafe'; e.target.style.boxShadow = 'none'; }} >
                      <option value="" style={optionStyle}>Selecciona región</option>
                      {Object.keys(CHILE_REGIONES).map(r => <option key={r} value={r} style={optionStyle}>{r}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, bottom: 12, color: '#999', pointerEvents: 'none' }} />
                  </div>
                  <div style={{ position: 'relative' }}>
                    <label style={label}>Comuna *</label>
                    <select required value={form.comuna} onChange={e => set('comuna', e.target.value)} disabled={!form.region}
                      style={{ ...selectStyle, opacity: form.region ? 1 : 0.5 }}
                      onFocus={e => { e.target.style.borderColor = PINK; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }} onBlur={e => { e.target.style.borderColor = '#dbeafe'; e.target.style.boxShadow = 'none'; }}>
                      <option value="" style={optionStyle}>Selecciona comuna</option>
                      {comunas.map(c => <option key={c} value={c} style={optionStyle}>{c}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, bottom: 12, color: '#999', pointerEvents: 'none' }} />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={label}>
                      {agency !== 'RETIRO EN TIENDA' && deliveryType === 'agencia' ? 'Sucursal o Agencia de Destino *' : 'Dirección Particular *'}
                    </label>
                    <input required value={form.address} onChange={e => set('address', e.target.value)}
                      placeholder={agency !== 'RETIRO EN TIENDA' && deliveryType === 'agencia' ? 'Ej: Starken Sucursal Padre Las Casas (o dirección de la sucursal)' : 'Calle, número, departamento/casa'}
                      style={inp}
                      onFocus={e => { e.target.style.borderColor = PINK; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }}
                      onBlur={e => { e.target.style.borderColor = '#dbeafe'; e.target.style.boxShadow = 'none'; }} />
                    {agency !== 'RETIRO EN TIENDA' && deliveryType === 'agencia' && (
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#2563eb', fontWeight: 600, fontFamily: FF }}>
                        ⚠️ Indica claramente el nombre o dirección de la sucursal de destino. No ingreses tu dirección particular aquí para evitar confusiones de despacho.
                      </p>
                    )}
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={label}>Información adicional (opcional)</label>
                    <textarea value={form.additionalInfo} onChange={e => set('additionalInfo', e.target.value)}
                      placeholder="Referencias, instrucciones para la entrega..." rows={2}
                      style={{ ...inp, resize: 'none', fontFamily: FF }}
                      onFocus={e => { e.target.style.borderColor = PINK; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }} onBlur={e => { e.target.style.borderColor = '#dbeafe'; e.target.style.boxShadow = 'none'; }} />
                  </div>
                </div>
                </div>
              )}

            </div>

            {/* ── RIGHT: order summary ── */}
            <div className="ck-sidebar" style={{ width: 340, flexShrink: 0, position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Summary card */}
              <div style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 22, border: '1px solid #dbeafe', boxShadow: '0 12px 40px rgba(37,99,235,0.08)', backdropFilter: 'blur(14px)', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', padding: '18px 22px 14px', borderBottom: '1px solid #dbeafe' }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111', fontFamily: FF, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 10, background: `linear-gradient(135deg, ${PINK}, #1d4ed8)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={14} color="#fff" />
                    </span>
                    Resumen de compra
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af', fontFamily: FF }}>{distinctProducts} producto{distinctProducts !== 1 ? 's' : ''} · {totalItems} unidad{totalItems !== 1 ? 'es' : ''}</p>
                </div>

                {/* Items */}
                <div style={{ padding: '14px 22px', maxHeight: 360, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(() => {
                      // Agrupar items por tienda (vendor)
                      const groups: { key: string; name: string; isMain: boolean; items: typeof items }[] = [];
                      const groupMap = new Map<string, number>();
                      items.forEach(item => {
                        const vId = (item.product as any).VENDOR_ID || '__MAIN__';
                        const rawVName = (item.product as any).VENDOR_NAME;
                        const vName = (rawVName && rawVName !== 'Importadora Carlitos' && rawVName !== 'Importadora Carlitos')
                          ? rawVName
                          : (!(item.product as any).VENDOR_ID ? currentStoreName : 'Tienda asociada');
                        const isMain = !(item.product as any).VENDOR_ID;
                        if (!groupMap.has(vId)) {
                          groupMap.set(vId, groups.length);
                          groups.push({ key: vId, name: vName, isMain, items: [] });
                        }
                        groups[groupMap.get(vId)!].items.push(item);
                      });
                      return groups.map(group => (
                        <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: group.isMain ? '#92400e' : '#7c3aed', background: group.isMain ? '#fef3c7' : '#f5f3ff', border: `1px solid ${group.isMain ? '#fde68a' : '#ddd6fe'}`, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                              {group.isMain ? '🐱' : '🏪'} {group.name}
                            </span>
                          </div>
                          {group.items.map((item, idx) => {
                            const pricing = resolveProductDisplayPrice(item.product, apertura);
                            const price = item.bundleId ? getEffectivePrice(item) : pricing.displayPrice;
                            const lineTotal = getEffectiveItemTotal(item);
                            return (
                              <div key={`${item.product.$id}-${item.bundleInstanceId || idx}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #eff6ff', transition: 'all .15s' }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                  <div style={{ position: 'relative', width: 48, height: 48, background: 'linear-gradient(135deg, #eff6ff, #fff)', borderRadius: 12, overflow: 'visible', flexShrink: 0, border: '1px solid #dbeafe' }}>
                                    {item.product.IMAGEURL
                                      ? <img src={resolveStorageImageUrl(item.product.IMAGEURL)} alt={item.product.NAME} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', padding: 2 }} />
                                      : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📦</span>}
                                    <span style={{ position: 'absolute', top: -3, right: -3, background: `linear-gradient(135deg, ${PINK}, #1d4ed8)`, color: '#fff', fontSize: 8, fontWeight: 800, borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(37,99,235,0.3)' }}>{item.quantity}</span>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: 12, color: '#374151', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontFamily: FF, fontWeight: 500 }}>
                                      {item.product.NAME}
                                    </p>
                                    {item.bundleTitle && <span style={{ fontSize: 9, fontWeight: 800, color: '#047857', background: '#ecfdf5', padding: '2px 6px', borderRadius: 6, marginTop: 4, display: 'inline-block' }}>📦 {item.bundleTitle}</span>}
                                    {pricing.fromApertura && (
                                      <span style={{ fontSize: 9, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 6px', borderRadius: 6, marginTop: 4, display: 'inline-block' }}>Promo apertura</span>
                                    )}
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    {(item.bundleId && item.bundleOriginalUnitPrice != null && item.bundleOriginalUnitPrice > price) ? (
                                      <p style={{ margin: '0 0 2px', fontSize: 10, color: '#9ca3af', textDecoration: 'line-through', fontFamily: FF }}>{formatPrice(item.bundleOriginalUnitPrice * item.quantity)}</p>
                                    ) : pricing.hasDiscount && pricing.originalPrice != null && (
                                      <p style={{ margin: '0 0 2px', fontSize: 10, color: '#9ca3af', textDecoration: 'line-through', fontFamily: FF }}>{formatPrice(pricing.originalPrice * item.quantity)}</p>
                                    )}
                                    <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: item.bundleId ? '#047857' : pricing.fromApertura ? '#2563eb' : '#111', fontFamily: FF }}>{formatPrice(lineTotal)}</p>

                                    {item.bundleId ? (
                                      <button type="button" onClick={() => removeItem(item.product.$id, item.bundleInstanceId ?? undefined)} style={{ marginTop: 8, border: '1px solid #fecdd3', borderRadius: 8, background: '#fff1f2', padding: '4px 8px', color: '#be123c', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Quitar pack completo</button>
                                    ) : <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (item.quantity > 1) {
                                            updateQuantity(item.product.$id, item.quantity - 1, item.isPack, undefined, Boolean(item.isPack), null);
                                          } else {
                                            removeItem(item.product.$id, null);
                                          }
                                        }}
                                        style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #dbeafe', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}
                                      >
                                        -
                                      </button>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', minWidth: 16, textAlign: 'center' }}>
                                        {item.quantity}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          updateQuantity(item.product.$id, item.quantity + 1, item.isPack, undefined, Boolean(item.isPack), null);
                                        }}
                                        style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #dbeafe', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}
                                      >
                                        +
                                      </button>
                                    </div>}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <input
                                    type="text"
                                    placeholder="Nota: Ej. color azul, talla, etc."
                                    value={itemNotes[item.product.$id] || ''}
                                    onChange={(e) => setItemNotes(prev => ({ ...prev, [item.product.$id]: e.target.value }))}
                                    style={{
                                      width: '100%',
                                      padding: '6px 10px',
                                      fontSize: 11,
                                      border: '1.5px solid #dbeafe',
                                      borderRadius: 8,
                                      outline: 'none',
                                      background: '#fff',
                                      color: '#111'
                                    }}
                                    className="ck-input-placeholder"
                                  />
                                  <p style={{ margin: '2px 2px 0', fontSize: 9.5, color: '#9ca3af', fontFamily: FF }}>No es 100% seguro, se añadirá solo si hay stock disponible.</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Totals */}
                <div style={{ padding: '0 22px 14px' }}>
                  <div style={{ borderTop: '1px dashed #dbeafe', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#6b7280', fontFamily: FF }}>Subtotal</span>
                      <span style={{ color: '#374151', fontWeight: 600, fontFamily: FF }}>{formatPrice(subtotal + aperturaSavings)}</span>
                    </div>
                    {aperturaSavings > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#be185d', fontFamily: FF }}>Promoción de apertura (-{aperturaPct}%)</span>
                        <span style={{ color: '#be185d', fontWeight: 700, fontFamily: FF }}>-{formatPrice(aperturaSavings)}</span>
                      </div>
                    )}
                    {discountParam > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#00a650', fontFamily: FF }}>Descuento</span>
                        <span style={{ color: '#00a650', fontWeight: 700, fontFamily: FF }}>-{formatPrice(discountParam)}</span>
                      </div>
                    )}
                    {couponDiscount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#00a650', display: 'flex', alignItems: 'center', gap: 4, fontFamily: FF }}>
                          🎟 {couponApplied}
                          <button type="button" onClick={removeCoupon} style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 10, textDecoration: 'underline', padding: 0, fontFamily: FF }}>quitar</button>
                        </span>
                        <span style={{ color: '#00a650', fontWeight: 700, fontFamily: FF }}>-{formatPrice(couponDiscount)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, alignItems: 'center' }}>
                      <span style={{ color: '#9ca3af', fontFamily: FF }}>Envío</span>
                      <span style={{ color: '#e65c00', fontWeight: 700, fontSize: 11, fontFamily: FF }}>Pagar contraentrega</span>
                    </div>
                    <div style={{ marginTop: 4, padding: '6px 10px', borderRadius: 8, background: '#fff3e0', border: '1px solid #ffe0b2', fontSize: 10, color: '#e65c00', fontFamily: FF, fontWeight: 600, lineHeight: 1.4 }}>
                      ℹ️ El costo de envío se paga al recibir el pedido (contraentrega). No se cobra al momento de la compra.
                    </div>
                  </div>
                </div>

                {/* Total highlight */}
                <div style={{ margin: '0 22px 16px', padding: '12px 16px', borderRadius: 14, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: `1px solid ${belowMinimum ? '#fca5a5' : '#bfdbfe'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#111', fontFamily: FF }}>Total a pagar</span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: belowMinimum ? '#dc2626' : PINK, fontFamily: FF, letterSpacing: '-0.03em' }}>{formatPrice(total)}</span>
                </div>
                {belowMinimum && (
                  <p style={{ margin: '0 22px 12px', fontSize: 12, color: '#b91c1c', background: '#fef2f2', padding: '10px 12px', borderRadius: 10, border: '1px solid #fecaca', fontFamily: FF, lineHeight: 1.45 }}>
                    ⚠ {minimumOrderMessage(total, effectiveMinimum)}
                  </p>
                )}

                {/* Coupon */}
                {!couponApplied && (
                  <div style={{ padding: '0 22px 16px' }}>
                    <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#6b7280', fontFamily: FF, textTransform: 'uppercase', letterSpacing: '0.05em' }}>¿Tenés un cupón?</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        value={couponCode}
                        onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } }}
                        className="ck-input-placeholder"
                        style={{ flex: 1, padding: '10px 12px', border: `1.5px solid ${couponError ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 10, fontSize: 13, outline: 'none', color: '#111', background: '#f9fafb', textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: FF, fontWeight: 600 }}
                        onFocus={e => { e.currentTarget.style.borderColor = PINK; e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.08)'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = couponError ? '#fca5a5' : '#e5e7eb'; e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.boxShadow = 'none'; }}
                      />
                      <button
                        type="button"
                        onClick={applyCoupon}
                        disabled={couponLoading || !couponCode.trim()}
                        style={{ padding: '10px 18px', background: couponCode.trim() ? `linear-gradient(135deg, ${PINK}, #1d4ed8)` : '#e5e7eb', color: couponCode.trim() ? '#fff' : '#9ca3af', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: couponCode.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', opacity: couponLoading ? 0.6 : 1, fontFamily: FF, transition: 'all .2s', boxShadow: couponCode.trim() ? '0 4px 12px rgba(37,99,235,0.2)' : 'none' }}
                      >
                        {couponLoading ? '...' : 'Aplicar'}
                      </button>
                    </div>
                    {couponError && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ef4444', fontFamily: FF }}>⚠ {couponError}</p>}
                    {(() => {
                      const filtered = publicCoupons.filter((c: any) => {
                        const userRestriction = c.userRestriction || c.USERRESTRICTION || null;
                        if (!userRestriction || userRestriction.trim() === '' || userRestriction.trim().toLowerCase() === 'null') return true;
                        const val = userRestriction.trim().toLowerCase();
                        return (
                          (user?.id && user.id.toLowerCase() === val) ||
                          (user?.email && user.email.toLowerCase() === val) ||
                          (form.email && form.email.toLowerCase() === val)
                        );
                      });
                      if (filtered.length === 0) return null;
                      return (
                        <div style={{ marginTop: 8 }}>
                          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: '#9ca3af', fontFamily: FF, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cupones disponibles</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {filtered.map((c: any) => {
                              const code = (c.code || c.CODE || '').toUpperCase();
                              if (!code) return null;
                              const discType = c.type ?? c.DISCOUNTTYPE ?? c.TYPE ?? 'percent';
                              const discVal = c.value ?? c.DISCOUNTVALUE ?? c.VALUE ?? 0;
                              const label = discType === 'percent' || discType === 'percentage' ? `${discVal}% OFF` : formatPrice(discVal);
                              return (
                                <button key={c.$id} type="button" onClick={() => { setCouponCode(code); setCouponError(''); }}
                                  style={{ padding: '5px 10px', borderRadius: 999, border: `1.5px solid ${couponCode === code ? PINK : '#dbeafe'}`, background: couponCode === code ? PINK_BG : '#fff', color: couponCode === code ? PINK : '#6b7280', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FF, transition: 'all .15s', letterSpacing: 0.5 }}
                                  onMouseEnter={e => { e.currentTarget.style.borderColor = PINK; e.currentTarget.style.color = PINK; }}
                                  onMouseLeave={e => { if (couponCode !== code) { e.currentTarget.style.borderColor = '#dbeafe'; e.currentTarget.style.color = '#6b7280'; } }}>
                                  🎟 {code} <span style={{ fontWeight: 800, color: '#00a650' }}>{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Agency badge — only show when selected */}
                {agency && (
                <div style={{ margin: '0 22px 14px', padding: '10px 14px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(37,99,235,0.06), rgba(96,165,250,0.1))', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: PINK_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #dbeafe' }}>
                    <Truck size={13} color={PINK} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111', fontFamily: FF }}>{agency}</p>
                  </div>
                </div>
                )}

                {/* Note */}
                <div style={{ padding: '0 22px 16px' }}>
                  <textarea value={customerNote} onChange={e => setCustomerNote(e.target.value)} maxLength={500}
                    placeholder="💬 Notas para tu pedido (opcional)..."
                    className="ck-textarea-placeholder"
                    style={{ width: '100%', padding: '10px 12px', fontSize: 12, border: '1.5px solid #f3f4f6', borderRadius: 10, resize: 'none', minHeight: 44, maxHeight: 80, outline: 'none', color: '#374151', boxSizing: 'border-box', fontFamily: FF, background: '#f9fafb', transition: 'all .2s' }}
                    onFocus={e => { e.currentTarget.style.borderColor = PINK; e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.08)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#f3f4f6'; e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.boxShadow = 'none'; }} />
                </div>

                {error && <p style={{ margin: '0 22px 12px', fontSize: 12, color: '#ef4444', background: '#fef2f2', padding: '8px 12px', borderRadius: 10, border: '1px solid #fecaca', fontFamily: FF }}>⚠ {error}</p>}

                {/* Wholesale notice */}
                {hasPackItems && (
                  <div style={{ margin: '0 22px 14px', padding: '14px 16px', borderRadius: 14, background: 'linear-gradient(135deg,#fef9f4,#fff8f0)', border: '1px solid #eed9c4', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>📦</span>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#5c3d24', fontFamily: FF }}>Pedido Mayorista</p>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#92400e', fontFamily: FF, lineHeight: 1.5 }}>
                      Hemos recibido tus productos. Antes del pago, verificaremos la disponibilidad de stock y nos comunicaremos contigo por <strong>WhatsApp</strong> para confirmarte cuáles hay disponibles.
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#b45309', fontFamily: FF }}>También podrás ver el estado desde <strong>Mis Pedidos Mayoristas</strong> en tu cuenta.</p>
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* Submit button — full width at bottom (barra fija en móvil) */}
          <div className="ck-submit-bar" style={{ marginTop: 16, padding: '0 0 8px' }}>
            <div className="ck-bar-total">
              <small>Total</small>
              <b>{formatPrice(total)}</b>
            </div>
            <button type="submit" disabled={submitting || belowMinimum} className={hasPackItems ? "ck-confirm-btn-wholesale" : "ck-confirm-btn"}
              style={{ display: 'block', width: '100%', padding: '18px 0', backgroundImage: submitting ? 'none' : (hasPackItems ? 'linear-gradient(135deg, #f7e5d4, #eed9c4, #d4b290, #eed9c4, #f7e5d4)' : 'linear-gradient(135deg, #bfdbfe, #60a5fa, #2563eb, #60a5fa, #bfdbfe)'), backgroundColor: submitting ? (hasPackItems ? '#eed9c4' : '#60a5fa') : 'transparent', color: hasPackItems ? '#5c3d24' : '#fff', textAlign: 'center', borderRadius: 16, fontSize: 17, fontWeight: 800, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', transition: 'all .3s', boxSizing: 'border-box', fontFamily: FF, position: 'relative', overflow: 'hidden', backgroundSize: '300% 300%', letterSpacing: '0.02em' }}>
              {!submitting && <>
                <span style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                  <span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" /><span className="ck-orb" />
                  <span className="ck-sparkle" /><span className="ck-sparkle" /><span className="ck-sparkle" /><span className="ck-sparkle" /><span className="ck-sparkle" />
                  <span className="ck-trail" /><span className="ck-trail" /><span className="ck-trail" />
                </span>
                <span className="ck-shimmer-line" />
              </>}
              <span style={{ position: 'relative', zIndex: 2, textShadow: '0 1px 3px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {submitting ? 'Procesando...' : hasPackItems ? <>📦 Solicitar Pedido Mayorista</> : <><Shield size={16} /> Confirmar pedido</>}
              </span>
            </button>
          </div>
        </form>
      </div>
      </div>
    </div>

        {/* Modal de Selección de Agencia */}
        {showAgencyModal && typeof document !== 'undefined' && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', padding: 20 }}>
            <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 460, overflow: 'hidden', boxShadow: '0 24px 50px rgba(0,0,0,0.15)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
              <div style={{ padding: '32px 24px 24px', textAlign: 'center', position: 'relative' }}>
                <div style={{ width: 64, height: 64, background: PINK_BG, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: `1px solid ${PINK_LIGHT}`, boxShadow: `0 8px 24px rgba(37,99,235,0.2)` }}>
                  <Truck size={32} color={PINK} strokeWidth={2.5} />
                </div>
                <h3 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 800, color: '#111', fontFamily: FF, lineHeight: 1.2 }}>¿Por dónde enviamos tu pedido? 📦</h3>
                <p style={{ margin: '0 0 12px', fontSize: 14, color: '#6b7280', fontFamily: FF, lineHeight: 1.5 }}>
                  Selecciona la agencia de envíos de tu preferencia para continuar.
                </p>
                <div style={{ margin: '0 0 20px', padding: '10px 14px', borderRadius: 12, background: '#fff3e0', border: '1px solid #ffe0b2', fontSize: 12, color: '#e65c00', fontFamily: FF, fontWeight: 600, lineHeight: 1.5, textAlign: 'center' }}>
                  📦 El envío se paga contraentrega al recibir tu pedido
                </div>
                <div className="ck-modal-agency-grid">
                  {agencies.map(a => (
                    <button
                      key={a.name}
                      type="button"
                      onClick={() => {
                        setAgency(a.name);
                        setShowAgencyModal(false);
                        setShowSummaryModal(true);
                      }}
                      className="ck-agency-card"
                      style={{
                        padding: '16px', borderRadius: 16, border: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = hasPackItems ? '#cda178' : PINK; e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = hasPackItems ? '0 6px 16px rgba(92,61,36,0.1)' : '0 6px 16px rgba(37,99,235,0.15)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
                    >
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', border: `1px solid ${a.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} className="ck-agency-logo-wrapper">
                        {a.logo ? (
                          <img src={a.logo} alt={a.name} style={{ width: 24, height: 24, objectFit: 'contain' }} />
                        ) : (
                          <Truck size={20} color={a.color} />
                        )}
                      </div>
                      <div className="ck-agency-text-wrapper">
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#111', fontFamily: FF }} className="ck-agency-name">{a.name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280', fontFamily: FF }} className="ck-agency-desc">{a.desc}</p>
                      </div>
                      <div style={{ marginLeft: 'auto' }} className="ck-agency-chevron">
                        <ChevronRight size={20} color="#9ca3af" />
                      </div>
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setShowAgencyModal(false)}
                  style={{ marginTop: 24, padding: '12px 24px', background: 'transparent', color: '#6b7280', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FF, textDecoration: 'underline' }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Modal de Resumen y Confirmación */}
        {showSummaryModal && typeof document !== 'undefined' && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', padding: 20 }}>
            <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 460, overflow: 'hidden', boxShadow: '0 24px 50px rgba(0,0,0,0.15)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
              <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, background: PINK_BG, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Package size={24} color={PINK} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111', fontFamily: FF }}>Confirmación Final</h3>
                  <p style={{ margin: 0, fontSize: 13, color: '#6b7280', fontFamily: FF }}>Revisa tus datos antes de enviar</p>
                </div>
              </div>
              
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                <div style={{ background: '#f9fafb', borderRadius: 16, padding: '16px', border: '1px solid #e5e7eb', marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FF }}>Dirección de Envío</h4>
                  <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#111', fontFamily: FF }}>{form.name}</p>
                  <p style={{ margin: '0 0 4px', fontSize: 14, color: '#374151', fontFamily: FF }}>{form.address}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#6b7280', fontFamily: FF }}>{form.comuna}, {form.region}</p>
                </div>
                
                <div style={{ background: '#f9fafb', borderRadius: 16, padding: '16px', border: '1px solid #e5e7eb', marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FF }}>Datos de Contacto</h4>
                  <p style={{ margin: '0 0 4px', fontSize: 14, color: '#374151', fontFamily: FF }}><strong>Email:</strong> {form.email}</p>
                  <p style={{ margin: '0 0 4px', fontSize: 14, color: '#374151', fontFamily: FF }}><strong>Teléfono:</strong> {form.phone}</p>
                  <p style={{ margin: 0, fontSize: 14, color: '#374151', fontFamily: FF }}><strong>RUT:</strong> {form.rut}</p>
                </div>

                <div style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.06), rgba(96,165,250,0.1))', borderRadius: 16, padding: '16px', border: '1px solid #dbeafe' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 800, color: PINK, textTransform: 'uppercase', letterSpacing: 1, fontFamily: FF }}>Agencia Seleccionada</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <Truck size={18} color={PINK} />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#111', fontFamily: FF }}>{agency}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ padding: '16px 24px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 12 }}>
                <button type="button" onClick={() => setShowSummaryModal(false)}
                  style={{ flex: 1, padding: '16px', background: '#f9fafb', color: '#4b5563', border: '1px solid #e5e7eb', borderRadius: 16, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FF, transition: 'all 0.2s' }}>
                  Volver
                </button>
                <button type="button" onClick={executeCheckout}
                  style={{ flex: 2, padding: '16px', background: hasPackItems ? 'linear-gradient(135deg, #eed9c4, #e1c2a4, #cda178)' : 'linear-gradient(135deg, #bfdbfe, #60a5fa, #2563eb)', color: hasPackItems ? '#5c3d24' : '#fff', border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: FF, boxShadow: hasPackItems ? '0 8px 20px rgba(92,61,36,0.15)' : '0 8px 20px rgba(37,99,235,0.3)', transition: 'all 0.2s', position: 'relative', overflow: 'hidden' }}>
                  <span className="ck-shimmer-line" />
                  <span style={{ position: 'relative', zIndex: 2, textShadow: hasPackItems ? 'none' : '0 1px 3px rgba(0,0,0,0.12)' }}>Confirmar y Enviar</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Modal de Geolocalización (Pro) */}
        {showGeoModal && typeof document !== 'undefined' && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', padding: 20 }}>
            <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 24px 50px rgba(0,0,0,0.15)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
              <div style={{ padding: '32px 24px 24px', textAlign: 'center', position: 'relative' }}>
                <div style={{ width: 64, height: 64, background: PINK_BG, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: `1px solid ${PINK_LIGHT}`, boxShadow: `0 8px 24px rgba(37,99,235,0.2)` }}>
                  <MapPin size={32} color={PINK} strokeWidth={2.5} />
                </div>
                <h3 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 800, color: '#111', fontFamily: FF, lineHeight: 1.2 }}>Mejora la precisión<br/>de tu envío 📍</h3>
                <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6b7280', fontFamily: FF, lineHeight: 1.5 }}>
                  ¿Deseas geolocalizar tu dirección actual? Esto nos ayudará a obtener una ubicación exacta para que el repartidor encuentre tu destino sin problemas y tu pedido llegue más rápido.
                </p>
                {geoError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
                    <p style={{ margin: 0, fontSize: 12, color: '#ef4444', fontFamily: FF, fontWeight: 500 }}>{geoError}</p>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <button onClick={handleGeolocate} disabled={isGeolocating || submitting}
                    style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #bfdbfe, #60a5fa, #2563eb)', color: '#fff', border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 800, cursor: (isGeolocating || submitting) ? 'not-allowed' : 'pointer', fontFamily: FF, boxShadow: '0 8px 20px rgba(37,99,235,0.3)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? 0.6 : 1 }}>
                    {isGeolocating ? (
                      <><RefreshCw size={18} className="animate-spin" /> Obteniendo ubicación...</>
                    ) : submitting ? (
                      <><RefreshCw size={18} className="animate-spin" /> Procesando pedido...</>
                    ) : (
                      <><MapPin size={18} /> Sí, usar mi ubicación actual</>
                    )}
                  </button>
                  <button onClick={handleSkipGeo} disabled={isGeolocating || submitting}
                    style={{ width: '100%', padding: '16px', background: '#f9fafb', color: '#4b5563', border: '1px solid #e5e7eb', borderRadius: 16, fontSize: 14, fontWeight: 700, cursor: (isGeolocating || submitting) ? 'not-allowed' : 'pointer', fontFamily: FF, transition: 'all .2s', opacity: submitting ? 0.6 : 1 }}>
                    No estoy en mi casa, prefiero escribirla.
                  </button>
                </div>
              </div>
            </div>
            <style>{`
              @keyframes slideUp {
                from { opacity: 0; transform: translateY(20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
          </div>,
          document.body
        )}

        {/* Loading overlay cuando se procesa el pedido */}
        {submitting && createPortal(
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 20, fontFamily: FF,
          }}>
            <style>{`
              @keyframes ckLoaderSpin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              @keyframes ckLoaderPulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.15); opacity: 0.7; }
              }
              @keyframes ckLoaderDot {
                0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                40% { transform: scale(1); opacity: 1; }
              }
            `}</style>
            <div style={{ position: 'relative', width: 72, height: 72 }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: '4px solid #dbeafe', borderTopColor: '#2563eb',
                animation: 'ckLoaderSpin 0.8s linear infinite',
              }} />
              <div style={{
                position: 'absolute', inset: 12, borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'ckLoaderPulse 1.5s ease-in-out infinite',
                boxShadow: '0 4px 20px rgba(37,99,235,0.3)',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e3a8a', fontFamily: FF }}>
                Procesando tu pedido...
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#6b7280', fontFamily: FF }}>
                Espera un momento por favor, estamos confirmando tu compra.
              </p>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 14 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 8, height: 8, borderRadius: '50%', background: '#2563eb',
                    animation: `ckLoaderDot 1.2s ease-in-out ${i * 0.15}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export default function CheckoutPage() {
  return (
    <DynamicCheckout>
      <Suspense fallback={<div style={{ background: 'linear-gradient(180deg, #eff6ff 0%, #fff 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FF }}><p style={{ color: '#2563eb' }}>Cargando...</p></div>}>
        <CheckoutInner />
      </Suspense>
    </DynamicCheckout>
  );
}
