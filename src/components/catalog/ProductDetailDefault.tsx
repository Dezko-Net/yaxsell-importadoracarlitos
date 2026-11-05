'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from '@/components/StoreImage';
import Link from 'next/link';
import { ShoppingCart, Check, ChevronRight, Truck, Shield, RefreshCw, Heart, Sparkles, Star, Clock } from 'lucide-react';
import ShareButton from '@/components/ShareButton';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION, CATEGORIES_COLLECTION, STOCK_ALERTS_COLLECTION, TIMED_OFFERS_COLLECTION, STOCK_REQUESTS_COLLECTION, formatPrice, ID } from '@/lib/db';
import { buildStockAlertData } from '@/lib/stock-alerts';
import { normalizeProductImages, getProductImageUrl, resolveStorageImageUrl } from '@/lib/product-images';
import { Query } from '@/lib/db';
import { Product, TimedOffer } from '@/types';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/hooks/useAuth';
import { getProductRisk } from '@/lib/stock-risk';
import ReviewSection from '@/components/ReviewSection';
import FavoriteButton from '@/components/FavoriteButton';
import RecentlyViewed, { trackView } from '@/components/RecentlyViewed';
import ImageZoom from '@/components/ImageZoom';
import ProductQuestions from '@/components/ProductQuestions';
import ProductTabs from '@/components/ProductTabs';
import StockIndicator from '@/components/StockIndicator';
import { useAperturaPromotion } from '@/hooks/useAperturaPromotion';
import { resolveProductDisplayPrice, isDisableDiscounts } from '@/lib/apertura-promo';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import AperturaDiscountBadge from '@/components/AperturaDiscountBadge';
import CountdownTimer from '@/components/CountdownTimer';

function getExpiresAtEpochSeconds(offer: TimedOffer): number | null {
  if (offer.timeType === 'endDateTime' && offer.endDateTime) {
    return Math.floor(new Date(offer.endDateTime).getTime() / 1000);
  }
  if (offer.timeType === 'duration' && offer.durationHours) {
    const start = offer.activatedAt || (offer as any).$createdAt;
    if (start) {
      return Math.floor((new Date(start).getTime() + offer.durationHours * 3600000) / 1000);
    }
  }
  return null;
}

// Paleta Yaxsell — púrpura
const ORANGE_PRIMARY = '#e396bf';
const PINK_LIGHT = '#f5a8cf';
const PINK_BG = '#fdf2f8';
const PINK_BG_DARK = '#fce7f3';
const TEXT_DARK = '#374151';
const TEXT_MUTED = '#6b7280';

export default function ProductDetail({ previewProductId }: { previewProductId?: string }) {
  const params = useParams<{ id: string; productId?: string }>();
  const id = previewProductId || params.productId || params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPaquetesMode = searchParams.get('mode') === 'paquetes';
  const { user } = useAuth();
  const { unlimitedStock } = useStoreSettings();
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [categoryBg, setCategoryBg] = useState('');
  const [categoryBgLoaded, setCategoryBgLoaded] = useState(false);
  const [categoryColor, setCategoryColor] = useState(ORANGE_PRIMARY);
  const [categoryIcon, setCategoryIcon] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [selectedImg, setSelectedImg] = useState(0);
  const [added, setAdded] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [shippingModalOpen, setShippingModalOpen] = useState(false);
  const { addItem } = useCart();
  const [activeOffer, setActiveOffer] = useState<TimedOffer | null>(null);
  const { settings: apertura } = useAperturaPromotion();

  // Stock Request State
  const [isStockRequestModalOpen, setIsStockRequestModalOpen] = useState(false);
  const [stockRequestQty, setStockRequestQty] = useState(1);
  const [isRequestingStock, setIsRequestingStock] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  // Keyboard navigation for image gallery
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!product) return;
      const imgs = [product.IMAGEURL, product.IMAGEURL2, product.IMAGEURL3, product.IMAGEURL4, product.IMAGEURL5].filter(Boolean).map(v => resolveStorageImageUrl(v));
      if (imgs.length <= 1) return;
      if (e.key === 'ArrowLeft') setSelectedImg(i => (i - 1 + imgs.length) % imgs.length);
      else if (e.key === 'ArrowRight') setSelectedImg(i => (i + 1) % imgs.length);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/public-data/product-detail?id=${id}`);
        if (!res.ok) throw new Error('Product not found');
        const data = await res.json();
        
        setProduct(data.product);
        if (isPaquetesMode && data.product?.PACKQTY) {
          setQty(data.product.PACKQTY);
        }
        setActiveOffer(data.activeOffer);
        setCategoryName(data.categoryName);
        setCategoryBg(data.categoryBg || 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221200%22%20height%3D%22400%22%20viewBox%3D%220%200%201200%20400%22%3E%3Crect%20width%3D%221200%22%20height%3D%22400%22%20fill%3D%22%23f5f5f5%22%2F%3E%3Ctext%20x%3D%22600%22%20y%3D%22200%22%20font-family%3D%22sans-serif%22%20font-size%3D%2228%22%20fill%3D%22%23bbb%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E');
        setCategoryColor(data.categoryColor || ORANGE_PRIMARY);
        setCategoryIcon(data.categoryIcon);
        setRelated(data.related || []);
        
        trackView(data.product.$id);

        // Check if user has a pending stock request for this product
        if (user) {
          try {
            const { databases } = getServices();
            const { databaseId } = getFirebaseConfig();
            const reqs = await databases.listDocuments(databaseId, STOCK_REQUESTS_COLLECTION, [
              Query.equal('productId', data.product.$id),
              Query.equal('userId', user.id),
              Query.equal('status', 'pending'),
              Query.limit(1),
            ]);
            if (reqs.documents.length > 0) setHasPendingRequest(true);
          } catch { /* non-critical */ }
        }
      } catch { router.push('/productos'); }
      finally { setIsLoading(false); }
    }
    load();
  }, [id, router, isPaquetesMode]);

  // Dynamic SEO metadata
  useEffect(() => {
    if (!product) return;
    const price = resolveProductDisplayPrice(product, apertura).displayPrice;
    document.title = `${product.NAME} - ${formatPrice(price)} | Yaxsell`;
    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
      if (!el) { el = document.createElement('meta'); name.startsWith('og:') ? el.setAttribute('property', name) : el.setAttribute('name', name); document.head.appendChild(el); }
      el.setAttribute('content', content);
    };
    const desc = (product.DESCRIPTION || product.NAME).slice(0, 160);
    setMeta('description', desc);
    setMeta('og:title', product.NAME);
    setMeta('og:description', desc);
    setMeta('og:type', 'product');
    if (product.IMAGEURL) setMeta('og:image', resolveStorageImageUrl(product.IMAGEURL));
    setMeta('og:url', window.location.href);
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Inicio', item: window.location.origin },
            { '@type': 'ListItem', position: 2, name: 'Productos', item: `${window.location.origin}/productos` },
            ...(categoryName ? [{ '@type': 'ListItem', position: 3, name: categoryName, item: `${window.location.origin}/productos?categoria=${encodeURIComponent(categoryName)}` }] : []),
            { '@type': 'ListItem', position: categoryName ? 4 : 3, name: product.NAME, item: window.location.href },
          ],
        },
        {
          '@type': 'Product',
          name: product.NAME,
          description: desc,
          image: resolveStorageImageUrl(product.IMAGEURL) || undefined,
          sku: product.$id,
          offers: {
            '@type': 'Offer',
            price,
            priceCurrency: 'CLP',
            availability: (product.STOCK ?? 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url: window.location.href,
          },
          ...(product.RATING ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.RATING, reviewCount: product.NUMREVIEWS || 1 } } : {}),
        },
      ],
    };
    let scriptEl = document.getElementById('product-jsonld');
    if (!scriptEl) { scriptEl = document.createElement('script'); scriptEl.id = 'product-jsonld'; scriptEl.setAttribute('type', 'application/ld+json'); document.head.appendChild(scriptEl); }
    scriptEl.textContent = JSON.stringify(jsonLd);
    return () => { document.title = 'Yaxsell'; const el = document.getElementById('product-jsonld'); if (el) el.remove(); };
  }, [product, categoryName, apertura]);

  if (isLoading) return (
    <div className="pd-page pd-skeleton">
      <div className="pd-skeleton-banner pd-skeleton-shine" />
      <div className="pd-skeleton-container">
        <div className="pd-skeleton-card">
          <div className="pd-skeleton-gallery pd-skeleton-shine" />
          <div className="pd-skeleton-info">
            <div className="pd-skeleton-line pd-skeleton-line--lg pd-skeleton-shine" />
            <div className="pd-skeleton-line pd-skeleton-line--md pd-skeleton-shine" />
            <div className="pd-skeleton-line pd-skeleton-line--sm pd-skeleton-shine" />
            <div className="pd-skeleton-price pd-skeleton-shine" />
            <div className="pd-skeleton-btn pd-skeleton-shine" />
            <div className="pd-skeleton-btn pd-skeleton-btn--ghost pd-skeleton-shine" />
          </div>
        </div>
      </div>
      <style>{`
        @keyframes pdSkShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .pd-skeleton { background: ${PINK_BG}; min-height: 100vh; padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)); }
        .pd-skeleton-shine { background: linear-gradient(90deg, #fdf2f8, #fce7f3, #fdf2f8); background-size: 200% 100%; animation: pdSkShimmer 1.4s ease infinite; }
        .pd-skeleton-banner { height: 600px; width: 100%; }
        .pd-skeleton-container { max-width: 1400px; margin: -550px auto 0; padding: 0 16px 24px; position: relative; z-index: 2; }
        .pd-skeleton-card { background: #fff; border-radius: 24px; padding: 48px 40px; display: grid; grid-template-columns: auto 1fr; gap: 40px; box-shadow: 0 10px 40px rgba(227,150,191,0.1); }
        .pd-skeleton-gallery { width: 460px; height: 460px; border-radius: 16px; }
        .pd-skeleton-info { display: flex; flex-direction: column; gap: 14px; }
        .pd-skeleton-line { height: 18px; border-radius: 8px; }
        .pd-skeleton-line--lg { width: 85%; height: 28px; }
        .pd-skeleton-line--md { width: 60%; }
        .pd-skeleton-line--sm { width: 40%; }
        .pd-skeleton-price { width: 45%; height: 36px; border-radius: 10px; margin-top: 8px; }
        .pd-skeleton-btn { height: 48px; border-radius: 12px; width: 100%; max-width: 380px; }
        .pd-skeleton-btn--ghost { max-width: 280px; height: 44px; opacity: 0.75; }
        @media (max-width: 768px) {
          .pd-skeleton-banner { height: 140px !important; }
          .pd-skeleton-container { margin-top: -64px !important; padding: 0 12px 20px !important; }
          .pd-skeleton-card { grid-template-columns: 1fr !important; padding: 16px 14px !important; gap: 16px !important; border-radius: 16px !important; }
          .pd-skeleton-gallery { width: 100% !important; height: auto !important; aspect-ratio: 1 !important; max-height: min(82vw, 360px) !important; }
          .pd-skeleton-info { gap: 12px !important; }
          .pd-skeleton-line--lg { height: 22px !important; width: 92% !important; }
          .pd-skeleton-btn { max-width: none !important; height: 46px !important; }
          .pd-skeleton-btn--ghost { display: none !important; }
        }
      `}</style>
    </div>
  );

  if (!product) return null;

  const images = [product.IMAGEURL, product.IMAGEURL2, product.IMAGEURL3, product.IMAGEURL4, product.IMAGEURL5].filter(Boolean).map(v => resolveStorageImageUrl(v)) as string[];
  const features = product.FEATURES ? (Array.isArray(product.FEATURES) ? product.FEATURES : (product.FEATURES as string).split(',').map((s: string) => s.trim()).filter(Boolean)) : [];
  const tags = product.TAGS ? (Array.isArray(product.TAGS) ? product.TAGS : (product.TAGS as string).split(',').map((s: string) => s.trim()).filter(Boolean)) : [];
  const basePriceResolved = activeOffer ? {
    displayPrice: activeOffer.discountPrice,
    originalPrice: activeOffer.originalPrice,
    hasDiscount: true,
    discountPercent: activeOffer.discountPercentage,
    fromApertura: false
  } : resolveProductDisplayPrice(product, apertura);

  // En modo paquetes, usar WHOLESALEPRICE si hay; si no, precio normal
  const packQtyVal = product.PACKQTY || 0;
  const isPackQtyReached = isPaquetesMode && packQtyVal > 1 && qty >= packQtyVal;
  const priceResolved = basePriceResolved;

  const displayPrice = priceResolved.displayPrice;
  const hasDisc = priceResolved.hasDiscount;
  const discPct = priceResolved.discountPercent;
  const priceOriginal = priceResolved.originalPrice;
  const hasWholesale = !!(product.WHOLESALEPRICE && product.WHOLESALEMINQUANTITY && product.WHOLESALEPRICE > 0);
  const pFeatures = Array.isArray(product.FEATURES) ? product.FEATURES.join('\n') : product.FEATURES || '';
  const isExact = /ExactWholesale:\s*true/i.test(pFeatures);
  const isWholesaleQty = hasWholesale && (isExact ? qty === (product.WHOLESALEMINQUANTITY || 0) : qty >= (product.WHOLESALEMINQUANTITY || 0));
  // 📦 Precio por volumen — % descuento
  const volPct = Number(product.PACK_DISCOUNT_PCT) || 0;
  const volMinQty = Number(product.PACK_MIN_PACKS) || 0;
  const hasVolPct = volPct > 0 && volMinQty > 0;
  const isVolPctActive = hasVolPct && qty >= volMinQty && !isDisableDiscounts(product);
  const volPctPrice = isVolPctActive ? Math.round(displayPrice * (1 - volPct / 100)) : 0;
  const effectivePrice = isPackQtyReached ? displayPrice : (isVolPctActive ? volPctPrice : (isWholesaleQty ? product.WHOLESALEPRICE! : displayPrice));
  const lineTotal = effectivePrice * qty;
  const isLimitedStock = product.STOCK !== undefined && product.STOCK !== null && product.STOCK < 99999;
  const stock = isLimitedStock ? product.STOCK! : 99999;
  const rating = product.RATING ?? 0;
  const numReviews = product.NUMREVIEWS ?? 0;
  const soldQty = product.SOLDQUANTITY ?? 0;
  const stockColor = stock > 18 ? '#047857' : stock > 5 ? '#ea580c' : stock > 0 ? '#dc2626' : '#be123c';
  const stockLabel = stock > 18
    ? (stock >= 99999 ? '🟢 Stock disponible' : `🟢 Stock disponible (${stock} uds. en tienda)`)
    : stock > 5
    ? `🔥 ¡Apúrate que se acaban! Quedan ${stock} unidades`
    : stock > 0
    ? `⚠️ ¡Últimas ${stock} unidades en tienda!`
    : '⛔ Sin stock (0 uds. disponibles)';
  const isBestSeller = soldQty >= 20;
  const hasOffer = hasDisc && discPct >= 10;
  const outOfStock = stock <= 0;

  // Riesgo de stock (sistema de semáforo Importadora Carlitos)
  const stockRisk = getProductRisk({
    stock: stock >= 99999 ? 99999 : stock,
    salesVelocity7d: (product as any)?.salesVelocity7d || 0,
    maxBatchSize: (product as any)?.maxBatchSize || 1,
    daysSinceCreated: (product as any)?.createdAt
      ? Math.floor((Date.now() - new Date((product as any).createdAt).getTime()) / 86400000)
      : 999,
    price: Number(product?.CURRENTPRICE ?? product?.PRICE ?? (product as any)?.price ?? 0),
  });
  const isRedRisk = stockRisk.level === 'rojo'
  const isYellowRisk = stockRisk.level === 'amarillo'
  const blockPurchase = outOfStock || isRedRisk

  function handleAdd() {
    const webPrice = Number((product as any)?.WEBPRICE ?? (product as any)?.web_price ?? 0);
    const packOverridePrice = (webPrice > 0) ? undefined : (isPackQtyReached && !isDisableDiscounts(product!) ? (product!.WHOLESALEPRICE ?? undefined) : undefined);
    const wholesalePriceOverride = (webPrice > 0) ? undefined : (isWholesaleQty ? product?.WHOLESALEPRICE : packOverridePrice);
    addItem(product!, qty, activeOffer?.discountPrice, activeOffer ? (getExpiresAtEpochSeconds(activeOffer) || 0) * 1000 : undefined, wholesalePriceOverride, isPaquetesMode);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  const handleStockRequest = async () => {
    if (!user || !product) return;
    setIsRequestingStock(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.createDocument(
        databaseId,
        STOCK_REQUESTS_COLLECTION,
        'unique()',
        {
          productId: product.$id,
          productName: product.NAME,
          userId: user.id,
          userEmail: user.email || '',
          requestedQuantity: stockRequestQty,
          status: 'pending',
        }
      );
      setHasPendingRequest(true);
      setIsStockRequestModalOpen(false);
      alert('Tu solicitud ha sido enviada con éxito. Te notificaremos cuando tengamos más stock.');
    } catch (err: any) {
      console.error('Error submitting stock request:', err);
      if (err?.message?.includes('could not be found')) {
        alert('La función de solicitud de stock no está disponible en este momento.');
      } else {
        alert('Hubo un error al enviar tu solicitud. Intenta nuevamente.');
      }
    } finally {
      setIsRequestingStock(false);
    }
  };

  const buyBoxContent = (className: string) => (
    <div className={className} style={{ position: 'sticky', top: 16, background: '#fff', border: `1.5px solid ${PINK_BG_DARK}`, borderRadius: 16, padding: '18px 18px 22px', boxShadow: '0 4px 16px rgba(227,150,191,0.08)' }}>
      {activeOffer && (
        <div style={{
          marginBottom: 14,
          padding: '10px 12px',
          background: '#fff5f5',
          border: '1.5px solid #fee2e2',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} className="animate-pulse" /> ¡Oferta por tiempo limitado!
          </p>
          <div style={{ marginTop: 2 }}>
            <CountdownTimer expiresAt={getExpiresAtEpochSeconds(activeOffer) || 0} />
          </div>
        </div>
      )}
      <p style={{ margin: '0 0 4px', fontSize: 14, color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Truck size={15} /> Sale entre hoy y mañana
      </p>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: TEXT_MUTED }}>
        Envío disponible a todo Chile. <button type="button" onClick={() => setShippingModalOpen(true)} style={{ color: ORANGE_PRIMARY, textDecoration: 'none', fontWeight: 500, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>Más detalles</button>
      </p>
      <div style={{ borderTop: `1px solid ${PINK_BG_DARK}`, paddingTop: 12, marginBottom: 12 }}>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: stockColor, display: 'flex', alignItems: 'center', gap: 6 }}>{stockLabel}</p>
        {stock > 5 && stock <= 18 && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ea580c', fontWeight: 600 }}>
            ⚡ Alta rotación en tienda física. Completa tu pedido antes de que se agote.
          </p>
        )}
      </div>

      {/* Banner de riesgo de stock */}
      {isRedRisk && !outOfStock && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1.5px solid #fecaca', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🔴</span>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#dc2626' }}>Disponible solo en tienda física</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#991b1b' }}>Alta demanda en tienda. Visita nuestra sucursal para comprarlo.</p>
          </div>
        </div>
      )}
      {isYellowRisk && !outOfStock && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: '#fffbeb', border: '1.5px solid #fde68a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🟡</span>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#d97706' }}>Alta demanda en tienda física</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#92400e' }}>Te recomendamos completar tu compra pronto. Tienes 15 minutos para transferir.</p>
          </div>
        </div>
      )}

      {blockPurchase ? (
        <>
          {outOfStock && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: TEXT_MUTED }}>Sin stock por el momento</p>
              <button type="button" onClick={() => setIsStockRequestModalOpen(true)} style={{ width: '100%', padding: '12px 18px', background: '#fff', color: ORANGE_PRIMARY, border: `1.5px solid ${ORANGE_PRIMARY}`, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
                🔔 Avisarme cuando haya stock
              </button>
            </div>
          )}
          {isRedRisk && !outOfStock && (
            <div style={{ marginBottom: 12 }}>
              <button type="button" disabled style={{ width: '100%', padding: '12px 18px', background: '#e5e7eb', color: '#9ca3af', border: '1.5px solid #d1d5db', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
                Compra no disponible online
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: TEXT_MUTED }}>
              Cantidad: <strong style={{ color: TEXT_DARK }}>{qty} unidad{qty > 1 ? 'es' : ''}</strong>
              {isLimitedStock && <span style={{ color: '#9ca3af' }}> ({stock} disp.)</span>}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${PINK_BG_DARK}`, borderRadius: 8, width: 'fit-content', overflow: 'hidden' }}>
              <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 40, height: 40, border: 'none', background: '#fff', fontSize: 18, cursor: 'pointer', color: ORANGE_PRIMARY, fontWeight: 600 }}>−</button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={qty}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 1 && (!isLimitedStock || val <= stock)) {
                    setQty(val);
                  }
                }}
                style={{ 
                  width: 60, 
                  textAlign: 'center', 
                  fontSize: 14, 
                  fontWeight: 600, 
                  color: TEXT_DARK, 
                  border: '1px solid transparent',
                  outline: 'none',
                  outlineStyle: 'none',
                  boxShadow: 'none',
                  background: '#fff'
                }}
              />
              <button type="button" onClick={() => setQty(q => !isLimitedStock ? q + 1 : Math.min(stock, q + 1))} style={{ width: 40, height: 40, border: 'none', background: '#fff', fontSize: 18, cursor: 'pointer', color: ORANGE_PRIMARY, fontWeight: 600 }}>+</button>
            </div>
            {qty > 1 && <p style={{ margin: '8px 0 0', fontSize: 12, color: TEXT_MUTED }}>Total: <strong style={{ color: ORANGE_PRIMARY, fontSize: 14 }}>{formatPrice(lineTotal)}</strong></p>}
          </div>
          <button type="button" onClick={() => {
            if (outOfStock) return;
            const webPrice = Number((product as any)?.WEBPRICE ?? (product as any)?.web_price ?? 0);
            const packOverridePriceBuy = (webPrice > 0) ? undefined : (isPackQtyReached && !isDisableDiscounts(product!) ? (product!.WHOLESALEPRICE ?? undefined) : undefined);
            const wholesalePriceOverride = (webPrice > 0) ? undefined : (isWholesaleQty ? product?.WHOLESALEPRICE : packOverridePriceBuy);
            addItem(product!, qty, activeOffer?.discountPrice, activeOffer ? (getExpiresAtEpochSeconds(activeOffer) || 0) * 1000 : undefined, wholesalePriceOverride, isPaquetesMode);
            router.push('/carrito');
          }} style={{ width: '100%', padding: '12px 18px', background: ORANGE_PRIMARY, color: '#fff', border: `1.5px solid ${ORANGE_PRIMARY}`, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, transition: 'all 0.2s' }}>
            Comprar ahora
          </button>
          <button type="button" onClick={handleAdd} style={{ width: '100%', padding: '12px 18px', background: added ? '#10b981' : ORANGE_PRIMARY, color: '#fff', border: `1.5px solid ${added ? '#10b981' : ORANGE_PRIMARY}`, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, transition: 'all 0.2s' }}>
            {added ? <><Check size={15} /> Agregado</> : <><ShoppingCart size={15} /> Agregar al carrito</>}
          </button>

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${PINK_BG_DARK}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <RefreshCw size={13} color={ORANGE_PRIMARY} style={{ flexShrink: 0, marginTop: 1 }} />
              <span><strong style={{ color: TEXT_DARK }}>Devolución gratis.</strong> 30 días desde que lo recibes.</span>
            </p>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <Shield size={13} color={ORANGE_PRIMARY} style={{ flexShrink: 0, marginTop: 1 }} />
              <span><strong style={{ color: TEXT_DARK }}>Compra Protegida.</strong> Recibe el producto o te devolvemos el dinero.</span>
            </p>
          </div>
          <div style={{ marginTop: 12 }}><StockIndicator stock={product.STOCK} soldQuantity={product.SOLDQUANTITY} /></div>
        </>
      )}
    </div>
  );

  return (
    <div className="pd-page" style={{ background: '#f5f5f5', minHeight: '100vh', fontFamily: 'Poppins, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <style>{`
        @media (max-width: 768px) {
          .pd-page { padding-bottom: calc(140px + env(safe-area-inset-bottom, 0px)); }
          .pd-breadcrumb { top: 0 !important; padding: 10px 12px !important; overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .pd-breadcrumb > div { font-size: 12px !important; flex-wrap: nowrap; min-width: min-content; }
          .pd-breadcrumb span { max-width: 110px !important; }
          .pd-category-banner { height: 150px !important; }
          .pd-container { margin-top: -64px !important; padding: 0 12px 20px !important; }
          .pd-main-grid { grid-template-columns: 1fr !important; padding: 18px 14px !important; gap: 18px !important; border-radius: 16px !important; }
          .pd-gallery { flex-direction: column !important; width: 100% !important; align-items: stretch !important; }
          .pd-h-scroll { overflow-x: auto !important; overflow-y: hidden !important; -webkit-overflow-scrolling: touch !important; scroll-snap-type: x proximity !important; touch-action: pan-y pinch-zoom !important; scrollbar-width: none !important; -ms-overflow-style: none !important; padding-bottom: 0 !important; max-height: none !important; }
          .pd-h-scroll::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }
          .pd-gallery-thumbs { flex-direction: row !important; gap: 8px !important; width: 100% !important; }
          .pd-gallery-thumb-btn { flex-shrink: 0 !important; scroll-snap-align: start !important; }
          .pd-buy-box--mobile-inline { position: static !important; display: block !important; }
          .pd-features-grid { grid-template-columns: 1fr !important; }
          .pd-related-scroll { padding-bottom: 0 !important; }
          .pd-related-card { scroll-snap-align: start !important; }
          .pd-gallery-main { width: 100% !important; height: auto !important; aspect-ratio: 1 !important; max-height: min(82vw, 360px) !important; }
          .pd-gallery-main > div { width: 100% !important; height: 100% !important; min-height: 240px !important; }
          .pd-info h1 { font-size: 18px !important; }
          .pd-price-main { font-size: 28px !important; }
          .pd-buy-box.pd-buy-box--desktop { display: none !important; }
          .pd-section { padding: 18px 14px !important; border-radius: 14px !important; }
          .pd-section h2 { font-size: 17px !important; }
          .pd-related-scroll { gap: 10px !important; }
          .pd-related-card { width: 140px !important; }
          .pd-related-card > div:first-child { height: 112px !important; }
          .pd-mobile-bar { display: flex !important; }
        }
        @media (min-width: 769px) {
          .pd-mobile-bar, .pd-buy-box--mobile-inline { display: none !important; }
          .pd-gallery { flex-direction: row !important; align-items: flex-start !important; }
          .pd-gallery-main { order: 2 !important; }
          .pd-gallery-thumbs { order: 1 !important; flex-direction: column !important; }
        }
        .pd-mobile-bar {
          display: none; position: fixed; left: 0; right: 0;
          bottom: calc(68px + env(safe-area-inset-bottom, 0px));
          z-index: 10020; background: rgba(255,255,255,0.98);
          backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
          border-top: 1px solid #fce7f3; padding: 10px 12px; gap: 10px;
          align-items: center; box-shadow: 0 -6px 24px rgba(227,150,191,0.1);
        }
        .pd-mobile-bar-info { flex-shrink: 0; min-width: 0; }
        .pd-mobile-bar-price { font-size: 19px; font-weight: 700; color: ${TEXT_DARK}; line-height: 1.1; }
        .pd-mobile-bar-meta { font-size: 10px; color: ${TEXT_MUTED}; margin-top: 2px; }
        .pd-mobile-bar-actions { display: flex; gap: 8px; flex: 1; min-width: 0; }
        .pd-mobile-bar-actions button { flex: 1; border-radius: 10px; font-size: 12px; font-weight: 700; padding: 11px 8px; cursor: pointer; }
        .pd-mbar-buy { border: none; background: linear-gradient(135deg, ${ORANGE_PRIMARY}, ${PINK_LIGHT}); color: #fff; box-shadow: 0 4px 12px rgba(227,150,191,0.35); }
        .pd-mbar-cart { background: #fff; color: ${ORANGE_PRIMARY}; border: 1.5px solid ${PINK_LIGHT}; display: flex; align-items: center; justify-content: center; gap: 4px; }
      `}</style>

      {/* Breadcrumb */}
      <div className="pd-breadcrumb pd-h-scroll" style={{ background: '#fff', padding: '12px 2%', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 76, zIndex: 999 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <a href="/" onClick={(e) => { e.preventDefault(); window.location.href = '/'; }} style={{ color: ORANGE_PRIMARY, textDecoration: 'none', fontWeight: 500, cursor: 'pointer' }}>Inicio</a>
          <ChevronRight size={12} color={PINK_LIGHT} />
          <Link href="/productos" style={{ color: ORANGE_PRIMARY, textDecoration: 'none', fontWeight: 500 }}>Productos</Link>
          {categoryName && <>
            <ChevronRight size={12} color={PINK_LIGHT} />
            <Link href={`/productos?categoria=${encodeURIComponent(categoryName)}`} style={{ color: ORANGE_PRIMARY, textDecoration: 'none', fontWeight: 500 }}>{categoryName}</Link>
          </>}
          <ChevronRight size={12} color={PINK_LIGHT} />
          <span style={{ color: TEXT_MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{product.NAME}</span>
        </div>
      </div>

      {/* Category Banner con gradiente rosa */}
      <div className="pd-category-banner" style={{
        position: 'relative', width: '100%', height: 600, overflow: 'hidden',
        background: categoryBg ? '#000' : `linear-gradient(135deg, ${ORANGE_PRIMARY} 0%, ${PINK_LIGHT} 50%, ${PINK_BG_DARK} 100%)`,
      }}>
        {categoryBg && !categoryBgLoaded && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,#fdf2f8,#fce7f3,#fdf2f8)', backgroundSize: '200% 100%', animation: 'skeletonShimmer 1.5s ease infinite' }} />
        )}
        {categoryBg
          ? <Image src={categoryBg} alt={categoryName} fill style={{ objectFit: 'cover', opacity: 0.9 }} onLoad={() => setCategoryBgLoaded(true)} />
          : null}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, transparent 0%, transparent 50%, #f5f5f5 100%)` }} />
        <style>{`@keyframes skeletonShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>

      <div className="pd-container" style={{ maxWidth: 1400, margin: '-550px auto 0', padding: '0 16px 16px', position: 'relative', zIndex: 2 }}>

        {/* Category badge - above the main card */}
        {(categoryName || categoryIcon) && (
          <div className="pd-category-badge" style={{ marginBottom: 16 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 12,
              background: 'rgba(255,255,255,0.97)', borderRadius: 14,
              padding: '10px 18px',
              boxShadow: '0 8px 28px rgba(227,150,191,0.2)',
              backdropFilter: 'blur(8px)',
            }}>
              {categoryIcon && (
                <Image src={categoryIcon} alt={categoryName} width={44} height={44} style={{ objectFit: 'contain' }} />
              )}
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT_DARK }}>{categoryName}</p>
                <Link href={`/productos?categoria=${encodeURIComponent(categoryName)}`} style={{ fontSize: 12, color: ORANGE_PRIMARY, textDecoration: 'none', fontWeight: 600 }}>Ver todos los productos →</Link>
              </div>
            </div>
          </div>
        )}

        {/* Main: 3-column ML-style layout */}
        <div className="pd-main-grid" style={{ background: '#fff', borderRadius: 24, padding: '48px 40px', display: 'grid', gridTemplateColumns: 'auto 1fr 380px', gap: 40, marginBottom: 20, boxShadow: '0 10px 40px rgba(227,150,191,0.1)', alignItems: 'flex-start' }}>

          {/* Column 1: Image gallery (thumbs + main) */}
          <div className="pd-gallery" style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            <div className="pd-gallery-main" style={{ position: 'relative', width: 420, height: 420, background: '#fff', borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
              {images[selectedImg]
                ? <ImageZoom src={images[selectedImg]} alt={product.NAME} width={420} height={420} />
                : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>💄</span>}
              {hasDisc && (
                <span style={{ position: 'absolute', top: 12, left: 12, background: `linear-gradient(135deg, ${ORANGE_PRIMARY}, ${PINK_LIGHT})`, color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 16, boxShadow: '0 3px 10px rgba(227,150,191,0.4)' }}>
                  -{discPct}% OFF
                </span>
              )}
              <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 2, display: 'flex', gap: 6 }}>
                <ShareButton title={product.NAME} text={`${product.NAME} - ${formatPrice(displayPrice)}`} image={resolveStorageImageUrl(product.IMAGEURL)} />
                <FavoriteButton productId={product.$id} size={20} />
              </div>
            </div>
            {images.length > 1 && (
              <div className="pd-gallery-thumbs pd-h-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {images.map((img, i) => (
                  <button key={i} type="button" className="pd-gallery-thumb-btn"
                    onClick={() => setSelectedImg(i)}
                    style={{
                      width: 56, height: 56, border: `2px solid ${selectedImg === i ? ORANGE_PRIMARY : PINK_BG_DARK}`,
                      borderRadius: 8, background: '#fff', cursor: 'pointer', padding: 0, overflow: 'hidden',
                      transition: 'all .15s', boxShadow: selectedImg === i ? `0 0 0 1px ${ORANGE_PRIMARY}` : 'none',
                    }}>
                    <img src={img} alt="" referrerPolicy="no-referrer" width={56} height={56} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 3, boxSizing: 'border-box' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: Info (title, rating, price, description) */}
          <div className="pd-info" style={{ minWidth: 0, paddingTop: 4 }}>
            {soldQty > 0 && (
              <p style={{ margin: '0 0 6px', fontSize: 13, color: TEXT_MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={12} color={ORANGE_PRIMARY} /> Nuevo · <strong style={{ color: TEXT_DARK }}>+{soldQty.toLocaleString()}</strong> vendidos
              </p>
            )}
            {isBestSeller && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8, background: `linear-gradient(135deg, ${ORANGE_PRIMARY}, ${PINK_LIGHT})`, padding: '4px 12px', borderRadius: 16, boxShadow: '0 3px 10px rgba(227,150,191,0.3)' }}>
                <span style={{ color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: 0.5 }}>⭐ MÁS VENDIDO</span>
              </div>
            )}
            <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 600, color: TEXT_DARK, lineHeight: 1.3, letterSpacing: -0.2 }}>{product.NAME}</h1>
            {product.BRAND && (
              <p style={{ margin: '0 0 10px', fontSize: 13, color: TEXT_MUTED, fontWeight: 500 }}>Marca: <strong style={{ color: TEXT_DARK }}>{product.BRAND}</strong></p>
            )}

            {/* Rating - always visible */}
            <div
              onClick={() => {
                const tabsEl = document.getElementById('product-tabs');
                if (tabsEl) {
                  tabsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  window.dispatchEvent(new CustomEvent('activate-tab', { detail: 'reviews' }));
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, cursor: 'pointer' }}
              title="Ver opiniones"
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: TEXT_DARK }}>{rating > 0 ? rating.toFixed(1) : '0.0'}</span>
              <div style={{ display: 'flex', gap: 1 }}>
                {[1,2,3,4,5].map(i => {
                  const isFull = i <= Math.floor(rating);
                  const isHalf = !isFull && i === Math.ceil(rating) && rating % 1 >= 0.5;
                  return (
                    <Star key={i} size={13} fill={isFull ? '#fbbf24' : isHalf ? 'url(#half-star)' : 'none'} color="#fbbf24" />
                  );
                })}
              </div>
              {numReviews > 0 && <span style={{ fontSize: 12, color: ORANGE_PRIMARY, fontWeight: 500 }}>({numReviews})</span>}
              {numReviews === 0 && <span style={{ fontSize: 12, color: TEXT_MUTED }}>(Sin opiniones)</span>}
            </div>

            {/* Price */}
            {hasOffer && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `linear-gradient(135deg, ${PINK_BG_DARK}, ${PINK_BG})`, border: `1px solid ${ORANGE_PRIMARY}`, borderRadius: 8, padding: '4px 10px', marginBottom: 10 }}>
                <Sparkles size={12} color={ORANGE_PRIMARY} />
                <span style={{ fontSize: 11, fontWeight: 800, color: ORANGE_PRIMARY, letterSpacing: 0.3 }}>OFERTA EXCLUSIVA</span>
              </div>
            )}
            <div style={{ marginBottom: 18 }}>
              {(hasDisc && !isWholesaleQty && !isVolPctActive && priceOriginal != null) && (
                <p style={{ margin: '0 0 2px', fontSize: 14, color: '#9ca3af', textDecoration: 'line-through' }}>{formatPrice(priceOriginal)}</p>
              )}
              {isVolPctActive && (
                <p style={{ margin: '0 0 2px', fontSize: 14, color: '#9ca3af', textDecoration: 'line-through' }}>{formatPrice(displayPrice)}</p>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span className="pd-price-main" style={{ fontSize: 36, fontWeight: 400, color: (isWholesaleQty || isVolPctActive) ? '#059669' : TEXT_DARK, letterSpacing: -1, lineHeight: 1, transition: 'color 0.3s ease' }}>
                  {formatPrice(effectivePrice)}
                </span>
                {(hasDisc && !isWholesaleQty && !isVolPctActive) && (
                  priceResolved.fromApertura ? (
                    <AperturaDiscountBadge percent={discPct} size="lg" />
                  ) : (
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#10b981' }}>{discPct}% OFF</span>
                  )
                )}
                {isVolPctActive && (
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#10b981' }}>{volPct}% OFF</span>
                )}
                {isWholesaleQty && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', background: 'rgba(5,150,105,0.1)', padding: '3px 8px', borderRadius: 20 }}>PRECIO MAYORISTA</span>
                )}
              </div>
              {/* Badge de oferta por volumen */}
              {hasVolPct && !isVolPctActive && (
                <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a1a1a', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  📦 Compra {volMinQty}+ → {volPct}% OFF
                </div>
              )}
              {hasWholesale && !isWholesaleQty && !hasVolPct && (
                <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  📦 Compra {product.WHOLESALEMINQUANTITY}+ → {formatPrice(product.WHOLESALEPRICE!)} c/u
                </div>
              )}
              {/* Badge de precio por caja */}
              {!!(product.BOXPRICE && product.BOXQTY && product.BOXPRICE > 0 && product.BOXQTY > 1) && (
                <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  📦 Caja de {product.BOXQTY} → {formatPrice(product.BOXPRICE!)} ({formatPrice(Math.round((product.BOXPRICE || 0) / (product.BOXQTY || 1)))} c/u)
                </div>
              )}
              {/* Badge de embalaje */}
              {!!((product as any).EMBALAJEQTY && (product as any).EMBALAJEQTY > 0) && (
                <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  📦 Embalaje de {(product as any).EMBALAJEQTY} unidades
                </div>
              )}
              {/* Badge de precio por paquete */}
              {!!((product as any).PACKPRICE && (product as any).PACKPRICE > 0 && product.PACKQTY && product.PACKQTY > 1) && (
                <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  📦 Paquete de {product.PACKQTY} → {formatPrice((product as any).PACKPRICE!)} ({formatPrice(Math.round(((product as any).PACKPRICE || 0) / (product.PACKQTY || 1)))} c/u)
                </div>
              )}
              {/* Badge de precio por embalaje */}
              {!!((product as any).EMBALAJEPRICE && (product as any).EMBALAJEPRICE > 0 && (product as any).EMBALAJEQTY && (product as any).EMBALAJEQTY > 0) && (
                <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  📦 Embalaje de {(product as any).EMBALAJEQTY} → {formatPrice((product as any).EMBALAJEPRICE!)} ({formatPrice(Math.round(((product as any).EMBALAJEPRICE || 0) / ((product as any).EMBALAJEQTY || 1)))} c/u)
                </div>
              )}
              {/* Badge de promoción por cantidad exacta */}
              {!!((product as any).PROMO_QTY && (product as any).PROMO_QTY > 0 && (product as any).PROMO_PRICE && (product as any).PROMO_PRICE > 0) && (
                <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#ea580c,#c2410c)', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  🎯 {(product as any).PROMO_QTY} por {formatPrice((product as any).PROMO_PRICE!)} ({formatPrice(Math.round(((product as any).PROMO_PRICE || 0) / ((product as any).PROMO_QTY || 1)))} c/u)
                </div>
              )}
            </div>

            {/* Características rápidas */}
            {features.length > 0 && (
              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${PINK_BG_DARK}` }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: TEXT_DARK }}>Lo que tienes que saber de este producto</h3>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {features.slice(0, 6).map((f, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0', fontSize: 13, color: TEXT_MUTED }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: ORANGE_PRIMARY, marginTop: 7, flexShrink: 0 }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={() => setPaymentModalOpen(true)} style={{ margin: '16px 0 0', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: ORANGE_PRIMARY, fontWeight: 600, textDecoration: 'underline', textDecorationStyle: 'dotted', display: 'block', textAlign: 'left' }}>Ver los medios de pago</button>
          </div>

          {buyBoxContent('pd-buy-box pd-buy-box--mobile-inline')}

          {/* Column 3: Sticky buy box — desktop */}
          {buyBoxContent('pd-buy-box pd-buy-box--desktop')}
        </div>

        {/* Features + Description */}
        {((features.length > 0) || (tags.length > 0) || product.DESCRIPTION) && (
          <div className="pd-section" style={{ background: '#fff', borderRadius: 24, padding: '32px 36px', marginBottom: 20, boxShadow: '0 6px 24px rgba(227,150,191,0.06)' }}>
            {features.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ margin: '0 0 18px', fontSize: 22, fontWeight: 700, color: TEXT_DARK, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Sparkles size={20} color={ORANGE_PRIMARY} /> Características del producto
                </h2>
                <div className="pd-features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 0, border: `1px solid ${PINK_BG_DARK}`, borderRadius: 14, overflow: 'hidden' }}>
                  {features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: i % 2 === 0 ? '#f9fafb' : '#fff', borderBottom: `1px solid ${PINK_BG_DARK}` }}>
                      <Check size={15} color={ORANGE_PRIMARY} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: TEXT_DARK }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tags.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: TEXT_DARK }}>Etiquetas</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {tags.map((t, i) => (
                    <span key={i} style={{ fontSize: 13, color: ORANGE_PRIMARY, border: `1.5px solid ${PINK_LIGHT}`, background: '#f9fafb', padding: '5px 16px', borderRadius: 24, fontWeight: 500 }}>{t}</span>
                  ))}
                </div>
              </div>
            )}
            {product.DESCRIPTION && (
              <div>
                <h2 style={{ margin: '0 0 14px', fontSize: 22, fontWeight: 700, color: TEXT_DARK }}>Descripción</h2>
                <p style={{ margin: 0, fontSize: 15, color: TEXT_MUTED, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{product.DESCRIPTION}</p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <ProductTabs tabs={[
          { id: 'desc', label: 'Descripción', content: (
            <div style={{ fontSize: 15, color: TEXT_MUTED, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
              {product.DESCRIPTION || 'Sin descripción disponible.'}
              {features.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <p style={{ fontWeight: 700, color: TEXT_DARK, marginBottom: 10 }}>Características:</p>
                  <ul style={{ margin: 0, paddingLeft: 22 }}>
                    {features.map((f: string, i: number) => (
                      <li key={i} style={{ marginBottom: 6, color: TEXT_MUTED }}>{f.trim()}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )},
          { id: 'reviews', label: 'Opiniones', count: numReviews, content: (
            <ReviewSection productId={product.$id} rating={rating} numReviews={numReviews} />
          )},
          { id: 'questions', label: 'Preguntas', content: (
            <ProductQuestions productId={product.$id} />
          )},
        ]} />

        {/* Vistos recientemente */}
        <RecentlyViewed excludeId={product.$id} />

      </div>

      {/* Barra fija de compra — mobile */}
      {stock > 0 && !isRedRisk && (
        <div className="pd-mobile-bar">
          <div className="pd-mobile-bar-info">
            <div className="pd-mobile-bar-price">{formatPrice(effectivePrice)}</div>
            <div className="pd-mobile-bar-meta">{stockLabel}</div>
          </div>
          <div className="pd-mobile-bar-actions">
            <button type="button" className="pd-mbar-cart" onClick={handleAdd} aria-label="Agregar al carrito">
              <ShoppingCart size={16} />
              {added ? 'Listo' : 'Carrito'}
            </button>
            <button type="button" className="pd-mbar-buy" onClick={() => {
              if (outOfStock) return;
              const webPrice = Number((product as any)?.WEBPRICE ?? (product as any)?.web_price ?? 0);
              const wholesalePriceOverride = (webPrice > 0) ? undefined : (isWholesaleQty ? product?.WHOLESALEPRICE : undefined);
              addItem(product!, qty, activeOffer?.discountPrice, activeOffer ? (getExpiresAtEpochSeconds(activeOffer) || 0) * 1000 : undefined, wholesalePriceOverride, isPaquetesMode);
              router.push('/carrito');
            }}>Comprar</button>
          </div>
        </div>
      )}

      {/* Payment Methods Modal */}
      {paymentModalOpen && (
        <div onClick={() => setPaymentModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px 16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT_DARK }}>Medios de pago para este producto</h2>
              <button onClick={() => setPaymentModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#666', display: 'flex', alignItems: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div style={{ padding: '24px' }}>

              {/* Transferencia bancaria */}
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: TEXT_DARK }}>Transferencia bancaria</h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: TEXT_MUTED }}>Acreditación en 1-2 horas hábiles.</p>
                <div style={{ background: '#f9fafb', border: '1px solid #f0f0f0', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TEXT_DARK }}>¿Cómo realizar la transferencia?</p>
                  {[
                    { step: '1', text: 'Agrega los productos al carrito y completa el proceso de pago (checkout).' },
                    { step: '2', text: 'Selecciona "Transferencia bancaria" como medio de pago.' },
                    { step: '3', text: 'Te mostraremos los datos de la cuenta para transferir.' },
                    { step: '4', text: 'Transfiere el monto exacto e indica tu nombre y número de orden como referencia.' },
                    { step: '5', text: 'Envía el comprobante por WhatsApp o email. Procesamos tu pedido al confirmar el pago.' },
                  ].map(item => (
                    <div key={item.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: `linear-gradient(135deg, ${ORANGE_PRIMARY}, ${PINK_LIGHT})`, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{item.step}</div>
                      <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED, lineHeight: 1.5 }}>{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ height: 1, background: '#f3f4f6', marginBottom: 28 }} />

              {/* Pasarelas de pago */}
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: TEXT_DARK }}>Pasarelas de pago</h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: TEXT_MUTED }}>Pago seguro. Acreditación instantánea.</p>

                {/* Webpay */}
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 12, padding: '16px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 56, height: 56, background: '#005A9C', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg viewBox="0 0 120 40" width="44" height="20" xmlns="http://www.w3.org/2000/svg"><text x="4" y="28" fontFamily="Arial" fontWeight="bold" fontSize="22" fill="white">Webpay</text></svg>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: TEXT_DARK }}>Webpay Plus</p>
                    <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED }}>Paga con tarjetas de crédito, débito y prepago Redcompra. Operado por Transbank.</p>
                  </div>
                </div>

                {/* MercadoPago */}
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 56, height: 56, background: '#009EE3', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg viewBox="0 0 44 44" width="32" height="32" xmlns="http://www.w3.org/2000/svg"><circle cx="22" cy="22" r="20" fill="white" opacity="0.15"/><path d="M22 8C14.27 8 8 14.27 8 22C8 29.73 14.27 36 22 36C29.73 36 36 29.73 36 22C36 14.27 29.73 8 22 8ZM28.5 19.5L22 26L15.5 19.5L17 18L22 23L27 18L28.5 19.5Z" fill="white"/></svg>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: TEXT_DARK }}>Mercado Pago</p>
                    <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED }}>Paga con tu cuenta de Mercado Pago, tarjetas de crédito, débito o efectivo. Rápido y seguro.</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}



      {/* Shipping Details Modal */}
      {shippingModalOpen && (
        <div onClick={() => setShippingModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 0, background: '#fff', zIndex: 1, borderRadius: '16px 16px 0 0' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT_DARK, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Truck size={20} color={ORANGE_PRIMARY} /> Detalles de envío
              </h2>
              <button onClick={() => setShippingModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#666', display: 'flex', alignItems: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            {/* Content */}
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Truck size={18} color="#10b981" /></div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: TEXT_DARK }}>Envío a todo Chile</p>
                    <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED, lineHeight: 1.5 }}>Realizamos despacho a todas las regiones y comunas de Chile continental.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: PINK_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><RefreshCw size={18} color={ORANGE_PRIMARY} /></div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: TEXT_DARK }}>Devolución gratis</p>
                    <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED, lineHeight: 1.5 }}>Tienes 30 días desde la recepción para devolver el producto sin costo.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Shield size={18} color="#3b82f6" /></div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: TEXT_DARK }}>Compra Protegida</p>
                    <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED, lineHeight: 1.5 }}>Recibe el producto o te devolvemos el dinero. Tu compra está protegida.</p>
                  </div>
                </div>
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: '14px 16px', border: '1px solid #f3f4f6' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: TEXT_DARK }}>Tiempos de entrega estimados</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED }}>• Región Metropolitana: 1–2 días hábiles</p>
                    <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED }}>• Zona central: 2–4 días hábiles</p>
                    <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED }}>• Zona sur/norte: 3–6 días hábiles</p>
                    <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED }}>• Zona austral: 5–8 días hábiles</p>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>El costo de envío se coordina con el vendedor tras confirmar el pedido.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
