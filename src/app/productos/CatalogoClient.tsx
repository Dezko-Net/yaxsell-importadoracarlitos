'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useFavorites } from '@/context/FavoritesContext';
import { useCart } from '@/context/CartContext';
import { useWebClientConfig } from '@/hooks/useWebClientConfig';

function getMinPurchaseFromStorage(): number {
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

interface CatalogoClientProps {
  defaultHash?: string;
}

export default function CatalogoClient({ defaultHash = '' }: CatalogoClientProps = {}) {
    const iframeSrc = `/shopify/catalogo-original/index.html?v=20261110_catalogo_qr_carlitos_v1${defaultHash}`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { favorites, toggleFavorite } = useFavorites();
  const { addBundleItem } = useCart();
  const { config: webConfig } = useWebClientConfig();
  const {
    storeName,
    logoUrl,
    minimumPurchase,
    whatsappContacts,
    balatinContact,
    attendantMode,
    allowWhatsappOrders,
    allowWebOrders,
    whatsappMessageTemplate,
    homeMarketing,
  } = useStoreSettings();

  // Refs para evitar re-renders: mantenemos los valores actuales en refs
  const settingsRef = useRef({
    storeName, logoUrl, minimumPurchase, whatsappContacts, balatinContact,
    attendantMode, allowWhatsappOrders, allowWebOrders, whatsappMessageTemplate, homeMarketing, favorites, webConfig,
  });
  settingsRef.current = {
    storeName, logoUrl, minimumPurchase, whatsappContacts, balatinContact,
    attendantMode, allowWhatsappOrders, allowWebOrders, whatsappMessageTemplate, homeMarketing, favorites, webConfig,
  };

  // Un cambio de sección solo actualiza el hash del iframe. Cambiar `src`
  // después de montar lo navegaba por segunda vez y repetía sus peticiones.
  const syncCatalogHash = useCallback(() => {
    try {
      const frame = iframeRef.current?.contentWindow;
      if (!frame || frame.location.origin !== window.location.origin || frame.location.pathname !== '/shopify/catalogo-original/index.html') return;
      const hash = window.location.hash || defaultHash;
      if (frame.location.hash !== hash) frame.location.hash = hash;
    } catch {}
  }, [defaultHash]);

  useEffect(() => { syncCatalogHash(); }, [syncCatalogHash]);

  // Función estable: no depende de nada que cambie, lee del ref
  const sendSettings = useCallback(() => {
    const s = settingsRef.current;
    const minPurchase = s.minimumPurchase || getMinPurchaseFromStorage();
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'YAXSEL_SETTINGS',
        storeName: s.webConfig.storeName,
        logoUrl: s.webConfig.logoUrl,
        webConfig: s.webConfig,
        minPurchase,
        whatsappContacts: s.whatsappContacts,
        balatinContact: s.balatinContact,
        attendantMode: s.attendantMode,
        allowWhatsappOrders: s.allowWhatsappOrders,
        allowWebOrders: s.allowWebOrders,
        whatsappMessageTemplate: s.whatsappMessageTemplate,
        homeMarketing: s.homeMarketing,
        favorites: s.favorites,
      },
      window.location.origin
    );
  }, []);

  useEffect(() => { sendSettings(); }, [sendSettings, webConfig, minimumPurchase, whatsappContacts, balatinContact, attendantMode, allowWhatsappOrders, allowWebOrders, whatsappMessageTemplate, homeMarketing]);

  // Un solo effect: envía settings al cargar el iframe y cuando el catálogo está listo
  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow || e.origin !== window.location.origin || !e.data) return;
      if (e.data.type === 'YAXSEL_CATALOG_READY') {
        sendSettings();
      }
      if (e.data.type === 'YAXSEL_ADD_PACK_TO_CART' && Array.isArray(e.data.items)) {
        const bundleId = String(e.data.bundleId || '');
        const bundleTitle = String(e.data.bundleTitle || 'Pack destacado');
        const bundleInstanceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `pack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        e.data.items.forEach((item: any) => {
          const id = String(item?.id || '');
          const unitPrice = Math.max(0, Math.round(Number(item?.unitPrice) || 0));
          const originalUnitPrice = Math.max(unitPrice, Math.round(Number(item?.originalUnitPrice) || 0));
          if (!id || !unitPrice || !bundleId) return;
          addBundleItem({
            $id: id,
            SKU: String(item.sku || id),
            NAME: String(item.name || 'Producto'),
            PRICE: originalUnitPrice,
            CURRENTPRICE: originalUnitPrice,
            IMAGEURL: String(item.image || ''),
            STOCK: Math.max(0, Math.floor(Number(item.stock) || 0)),
          } as any, bundleId, bundleInstanceId, bundleTitle, unitPrice, originalUnitPrice);
        });
        window.dispatchEvent(new CustomEvent('yaxsel:open-cart'));
      }
      if (e.data.type === 'YAXSEL_TOGGLE_FAVORITE' && typeof e.data.productId === 'string') {
        toggleFavorite(e.data.productId);
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [addBundleItem, sendSettings, toggleFavorite]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'YAXSEL_FAVORITES_SYNC', favorites },
      '*'
    );
  }, [favorites]);

  const displayTitle = `Catálogo Mayorista | ${webConfig.storeName}`;

  return (
    <div className="w-full h-[100dvh] overflow-hidden bg-[#f7f7f9]" style={{ height: '100dvh' }}>
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title={displayTitle}
        className="w-full h-full border-0"
        style={{ width: '100%', height: '100%' }}
        onLoad={() => { syncCatalogHash(); sendSettings(); }}
      />
    </div>
  );
}
