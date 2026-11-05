'use client';

import { useEffect, useState, useCallback, useMemo, Fragment, useRef } from 'react';
import EpicPagination from '@/components/admin/EpicPagination';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { Query, ID } from '@/lib/db';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION_ID, CATEGORIES_COLLECTION_ID, STOCK_ALERTS_COLLECTION_ID, SUBCATEGORIES_COLLECTION_ID, CATALOG_PRODUCTS_COLLECTION_ID, INVENTORY_PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { Product, Category, Subcategory } from '@/types/admin';
import { AI_CATEGORIZE_ENABLED, AI_ENABLED, AI_IMAGE_GEN_ENABLED } from '@/lib/feature-flags';
import { Plus, Search, Pencil, Trash2, AlertTriangle, X, Package, RefreshCw, ChevronDown, Download, Copy, Percent, Star, Boxes, Sparkles, OctagonX, MapPin, ArrowLeft, MessageSquare, Loader2, ImagePlus, ImageOff, Eye, Upload, FileSpreadsheet, FileText, ShoppingBag, Wrench, Lock, Ban, Globe, Store, ExternalLink, EyeOff, ArrowUpDown, Check, DollarSign, Save } from 'lucide-react';
import Link from 'next/link';
import { updateFirebaseErpProduct, purgeServerProductsCache } from '@/lib/firebaseErpService';
import ProductPhotoUploader, { uploadPendingFiles } from '@/components/admin/ProductPhotoUploader';
import MobileProductList from '@/components/admin/mobile/MobileProductList';
import MobileProductEditor from '@/components/admin/mobile/MobileProductEditor';
import PriceInput from '@/components/PriceInput';
import StockRiskBadge from '@/components/admin/StockRiskBadge';
import { getProductRisk } from '@/lib/stock-risk';
import { generateProductTitle, generateProductDescription, generateProductAiPack } from '@/lib/aiAdmin';
import { getBarcodeFromFeatures, getSkuFromFeatures, setBarcodeInFeatures, setSkuInFeatures, getWarehouseLocationFromFeatures, setSectionInFeatures, getCustomTabsFromFeatures, setCustomTabsInFeatures, getExactWholesaleFromFeatures, setExactWholesaleInFeatures, getDisableDiscountsFromFeatures, setDisableDiscountsInFeatures } from '@/lib/product-features';
// Lottie imports removed to prevent React 19 crashes

type ProductModalData = Partial<Product> & {
  _barcode?: string; _sku?: string; _details?: string; _usage?: string; _ingredients?: string;
  SHOW_IN_WEB?: boolean; show_in_web?: boolean;
  WEBPRICE?: number | null; web_price?: number | null;
  originalPrice?: number | null; STORE_PRICE?: number | null; precio_venta_1?: number | null;
};

import { MEDIA_BUCKET_ID, MEDIA_PREFIXES } from '@/lib/db';
import { invalidateProductCache, cached, TTL } from '@/lib/cache';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { getProductNewestTimestamp } from '@/lib/product-sort-date';
import { useStoreSettings } from '@/hooks/useStoreSettings';

const PRODUCTS_BUCKET_ID = MEDIA_BUCKET_ID; // Backward compatibility

const EMPTY: Partial<Product> & { SHOW_IN_WEB?: boolean; show_in_web?: boolean } = { NAME: '', DESCRIPTION: '', PRICE: 0, STOCK: 0, COST: 0, WHOLESALEPRICE: 0, WHOLESALEMINQUANTITY: 0, PACKQTY: 0, BOXPRICE: 0, BOXQTY: 0, EMBALAJEQTY: 0, PACKPRICE: 0, EMBALAJEPRICE: 0, PROMO_QTY: 0, PROMO_PRICE: 0, IMAGEURL: '', IMAGEURL2: '', IMAGEURL3: '', CATEGORYID: '', SHOW_IN_WEB: true, show_in_web: true };

const getLiveStatus = (p: Product) => {
  if (!p.$createdAt) return null;
  const now = new Date();
  const today7Am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0, 0, 0);
  const threshold = now.getTime() >= today7Am.getTime()
    ? today7Am.getTime()
    : new Date(today7Am.getFullYear(), today7Am.getMonth(), today7Am.getDate() - 1, 7, 0, 0, 0).getTime();

  const importedTime = new Date(p.$createdAt).getTime();
  if (importedTime < threshold) return null;

  const createdTime = p.$createdAt ? new Date(p.$createdAt).getTime() : 0;
  if (createdTime >= threshold) {
    return 'new';
  } else {
    return 'existing';
  }
};

export default function ProductsPage() {
  const { inventoryMode } = useStoreSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const withInventoryView = useCallback((items: Product[]) => items.map(product => {
    const raw = product as Product & { WEB_STOCK?: number; web_stock?: number; ERP_STOCK?: number };
    const erpStock = Number(raw.ERP_STOCK ?? raw.STOCK ?? (raw as any).stock ?? 0) || 0;
    const webStock = Number(raw.WEB_STOCK ?? raw.web_stock ?? erpStock) || 0;
    return {
      ...raw,
      ERP_STOCK: erpStock,
      STOCK: inventoryMode === 'web_independent' ? webStock : erpStock,
    } as Product;
  }), [inventoryMode]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [subCatFilter, setSubCatFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'instock' | 'low' | 'out'>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | 'rojo' | 'amarillo' | 'verde'>('all');
  const [noImageOnly, setNoImageOnly] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [aiWizard, setAiWizard] = useState<{ step: 'prices' | 'images' | null; refImage: string; cost: number; price: number; catalogPrice: number; marginPct: string; catalogPct: string; imgUrls: string[] } | null>(null);
  const [aiAutoEnhance, setAiAutoEnhance] = useState(false);
  const [addMode, setAddMode] = useState<'manual' | 'ia'>('manual');
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [sort, setSort] = useState<{ key: 'RISK' | 'NAME' | 'PRICE' | 'STOCK' | 'SOLDQUANTITY' | 'MARGIN' | 'CREATED'; dir: 'asc' | 'desc' }>({ key: 'CREATED', dir: 'desc' });
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; data: ProductModalData } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingPhotoFiles, setPendingPhotoFiles] = useState<File[]>([]);
  // Inline Web Price Editing (móvil y PC)
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [inlinePrices, setInlinePrices] = useState<Record<string, string>>({});
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);

  // Restaurar modal en progreso desde localStorage (modo add)
  useEffect(() => {
    const restore = () => {
      try {
        const saved = localStorage.getItem('mobile-editor-state');
        if (saved) {
          localStorage.removeItem('mobile-editor-state');
        }
      } catch {}
    };
    restore();
    // Restaurar al volver a la página (back/forward + bfcache + visibility)
    const onPageshow = (e: PageTransitionEvent) => { setTimeout(restore, 50); };
    const onPopstate = () => setTimeout(restore, 50);
    const onVisibility = () => { if (document.visibilityState === 'visible') setTimeout(restore, 50); };
    window.addEventListener('pageshow', onPageshow);
    window.addEventListener('popstate', onPopstate);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pageshow', onPageshow);
      window.removeEventListener('popstate', onPopstate);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [priceModal, setPriceModal] = useState(false);
  const [priceAdj, setPriceAdj] = useState<{ type: 'percent' | 'fixed'; value: string }>({ type: 'percent', value: '' });
  const [applyingPrice, setApplyingPrice] = useState(false);
  const [stockModal, setStockModal] = useState(false);
  const [stockAdj, setStockAdj] = useState<{ type: 'add' | 'set'; value: string }>({ type: 'add', value: '' });
  const [applyingStock, setApplyingStock] = useState(false);
  const [imageDrawer, setImageDrawer] = useState<{
    productId: string; productName: string;
    img1: string; img2: string; img3: string; img4: string;
    origImg1: string; origImg2: string; origImg3: string; origImg4: string;
    description: string; origDescription: string;
    features: string; origFeatures: string;
    tags: string; origTags: string;
    sku: string; origSku: string;
    price: number; origPrice: number;
    stock: number; origStock: number;
  } | null>(null);
  const [imageDrawerSaving, setImageDrawerSaving] = useState(false);
  const [imageDrawerUploading, setImageDrawerUploading] = useState<string | null>(null);
  const [imageDrawerTab, setImageDrawerTab] = useState<'images' | 'info' | 'specs'>('images');
  const imageDrawerFileRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);
  const [aiLoading, setAiLoading] = useState<'title' | 'desc' | 'tabs' | 'all' | null>(null);
  const [aiTitles, setAiTitles] = useState<string[]>([]);
  const [desktopMarginPct, setDesktopMarginPct] = useState<string>('');
  const [desktopCatalogPct, setDesktopCatalogPct] = useState<string>('');
  // Calcular margen automáticamente cuando cambian precio o costo
  useEffect(() => {
    const price = Number(modal?.data?.PRICE) || 0;
    const cost = Number(modal?.data?.COST) || 0;
    if (price > 0 && cost > 0) {
      const pct = ((price - cost) / cost) * 100;
      setDesktopMarginPct(pct % 1 === 0 ? String(Math.round(pct)) : pct.toFixed(1));
    }
  }, [modal?.data?.PRICE, modal?.data?.COST]);
  // Editor desktop: secciones colapsables (null = automático según contenido)
  const [techTabsOpen, setTechTabsOpen] = useState<boolean | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [KeniaOpen, setKeniaOpen] = useState(false);
  const [KeniaMessages, setKeniaMessages] = useState<{role: string; content: string}[]>([]);
  const [KeniaInput, setKeniaInput] = useState('');
  const [KeniaLoading, setKeniaLoading] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem('admin_broken_images') || '{}'); } catch { return {}; }
  });
  const [brokenOnly, setBrokenOnly] = useState(false);
  const [syncingImages, setSyncingImages] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ checked: 0, broken: 0 });
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [pdfExportProgress, setPdfExportProgress] = useState({ current: 0, total: 0 });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);

  const getModalImageUrls = useCallback((data?: Partial<ProductModalData> | null) => {
    return [data?.IMAGEURL, data?.IMAGEURL2, data?.IMAGEURL3, (data as any)?.IMAGEURL4]
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 3);
  }, []);

  // Genera un SKU consecutivo único basado en los SKUs existentes.
  // Encuentra el prefijo alfabético y el número más alto, y suma 1.
  // Ej: si existen BL003, BL004, BEB-002 -> genera BL005
  const generateConsecutiveSku = () => {
    const existingSkus = new Set<string>();
    const existingBarcodes = new Set<string>();
    for (const p of products) {
      const sku = p.SKU || p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.SKU || p.sku);
      if (sku) {
        // Normalizar: quitar guiones/espacios para comparar
        existingSkus.add(sku.toUpperCase().replace(/[-\s]/g, ''));
      }
      const barcode = p.BARCODE || p.barcode || getBarcodeFromFeatures(p.FEATURES, p.BARCODE || p.barcode);
      if (barcode) existingBarcodes.add(barcode);
    }

    // Buscar el SKU actual del modal (si editando, excluirlo)
    const currentSku = (modal?.data?._sku || '').toUpperCase().replace(/[-\s]/g, '');

    // Analizar todos los SKUs para encontrar prefijos y números
    const prefixNumbers: Record<string, number> = {};
    for (const sku of existingSkus) {
      if (sku === currentSku) continue; // excluir el actual
      const match = sku.match(/^([A-Z]+)[- ]?(\d+)$/);
      if (match) {
        const prefix = match[1];
        const num = parseInt(match[2], 10);
        if (!prefixNumbers[prefix] || num > prefixNumbers[prefix]) {
          prefixNumbers[prefix] = num;
        }
      }
    }

    // Si hay un SKU actual con el mismo formato, usar ese prefijo
    let prefix = 'PROD';
    let nextNum = 1;
    if (currentSku) {
      const m = currentSku.match(/^([A-Z]+)[- ]?(\d+)$/);
      if (m) {
        prefix = m[1];
        nextNum = (prefixNumbers[prefix] || 0) + 1;
      } else {
        // Si el SKU actual no tiene formato, usar el prefijo más común
        const topPrefix = Object.entries(prefixNumbers).sort((a, b) => b[1] - a[1])[0];
        if (topPrefix) { prefix = topPrefix[0]; nextNum = topPrefix[1] + 1; }
      }
    } else {
      // Sin SKU actual, usar el prefijo con el número más alto + 1
      const topPrefix = Object.entries(prefixNumbers).sort((a, b) => b[1] - a[1])[0];
      if (topPrefix) { prefix = topPrefix[0]; nextNum = topPrefix[1] + 1; }
    }

    // Generar y verificar que no exista
    let candidate = `${prefix}${String(nextNum).padStart(3, '0')}`;
    while (existingSkus.has(candidate.toUpperCase()) || existingBarcodes.has(candidate)) {
      nextNum++;
      candidate = `${prefix}${String(nextNum).padStart(3, '0')}`;
    }

    setModal(m => m ? { ...m, data: { ...m.data, _sku: candidate } } : m);
  };

  // Cierra el modal y limpia TODO el estado relacionado con el producto
  const closeProductModal = () => {
    setModal(null);
    setKeniaOpen(false);
    setKeniaMessages([]);
    setPendingPhotoFiles([]);
    setDesktopMarginPct('');
    setDesktopCatalogPct('');
    setAiTitles([]);
    setAiLoading(null);
    setTechTabsOpen(null);
    setAdvancedOpen(false);
  };

  const generateAllProductContent = useCallback(async () => {
    if (!modal) return;
    setAiLoading('all');
    setAiTitles([]);
    try {
      const categoryName = categories.find(c => c.$id === modal.data.CATEGORYID)?.name || '';
      const catNames = categories.map(c => c.name);
      const subGroups = categories.map(c => ({
        category: c.name,
        subs: subcategories.filter(s => s.categoryId === c.$id && !s.parentSubcategoryId).map(s => s.name),
      }));
      const result = await generateProductAiPack({
        name: modal.data.NAME || '',
        description: modal.data.DESCRIPTION || '',
        category: categoryName,
        imageUrls: getModalImageUrls(modal.data),
        availableCategories: catNames,
        availableSubcategories: subGroups,
      });
      setAiTitles(result.titles);

      // Match suggested category to real category ID
      let matchedCatId = modal.data.CATEGORYID;
      if (result.suggestedCategory) {
        const matched = categories.find(c => c.name.toLowerCase() === result.suggestedCategory.toLowerCase());
        if (matched) matchedCatId = matched.$id;
      }
      // Match suggested subcategory to real subcategory ID
      let matchedSubId = '';
      if (result.suggestedSubcategory && matchedCatId) {
        const matchedSub = subcategories.find(s =>
          s.categoryId === matchedCatId &&
          !s.parentSubcategoryId &&
          s.name.toLowerCase() === result.suggestedSubcategory.toLowerCase()
        );
        if (matchedSub) matchedSubId = matchedSub.$id;
      }

      setModal(m => m ? {
        ...m,
        data: {
          ...m.data,
          NAME: result.selectedTitle || m.data.NAME || '',
          DESCRIPTION: result.description || m.data.DESCRIPTION || '',
          _details: result.details || m.data._details || '',
          _usage: result.usage || m.data._usage || '',
          _ingredients: result.ingredients || m.data._ingredients || '',
          TAGS: result.tags.join(', '),
          CATEGORYID: matchedCatId || m.data.CATEGORYID,
          SUBCATEGORYID: matchedSubId || '',
          SUBSUBCATEGORYID: '',
        },
      } : m);
    } catch (e: any) {
      alert(e.message || 'No se pudo generar el contenido con IA.');
    } finally {
      setAiLoading(null);
    }
  }, [categories, subcategories, getModalImageUrls, modal]);

  const generateTechnicalTabsOnly = useCallback(async () => {
    if (!modal) return;
    setAiLoading('tabs');
    try {
      const categoryName = categories.find(c => c.$id === modal.data.CATEGORYID)?.name || '';
      const catNames = categories.map(c => c.name);
      const subGroups = categories.map(c => ({
        category: c.name,
        subs: subcategories.filter(s => s.categoryId === c.$id && !s.parentSubcategoryId).map(s => s.name),
      }));
      const result = await generateProductAiPack({
        name: modal.data.NAME || '',
        description: modal.data.DESCRIPTION || '',
        category: categoryName,
        imageUrls: getModalImageUrls(modal.data),
        availableCategories: catNames,
        availableSubcategories: subGroups,
      });
      setModal(m => m ? {
        ...m,
        data: {
          ...m.data,
          _details: result.details || m.data._details || '',
          _usage: result.usage || m.data._usage || '',
          _ingredients: result.ingredients || m.data._ingredients || '',
        },
      } : m);
    } catch (e: any) {
      alert(e.message || 'No se pudo generar la ficha técnica con IA.');
    } finally {
      setAiLoading(null);
    }
  }, [categories, getModalImageUrls, modal]);

  // Generar títulos sugeridos con IA (botón del editor desktop)
  const generateTitlesAI = async () => {
    if (!modal) return;
    setAiLoading('title');
    setAiTitles([]);
    try {
      const categoryName = categories.find(c => c.$id === modal.data.CATEGORYID)?.name || '';
      const titles = await generateProductTitle(modal.data.DESCRIPTION || '', categoryName, getModalImageUrls(modal.data), modal.data.NAME || '');
      setAiTitles(titles);
    } catch (e: any) {
      alert(e.message || 'No se pudieron generar títulos con IA.');
    } finally {
      setAiLoading(null);
    }
  };

  // Generar descripción con IA (botón del editor desktop)
  const generateDescriptionAI = async () => {
    if (!modal) return;
    setAiLoading('desc');
    try {
      const categoryName = categories.find(c => c.$id === modal.data.CATEGORYID)?.name || '';
      const desc = await generateProductDescription(modal.data.NAME || '', categoryName, modal.data.DESCRIPTION || '', getModalImageUrls(modal.data));
      setModal(m => m ? { ...m, data: { ...m.data, DESCRIPTION: desc } } : m);
    } catch (e: any) {
      alert(e.message || 'No se pudo generar la descripción con IA.');
    } finally {
      setAiLoading(null);
    }
  };

  // AI Categorization states
  const [aiCategorizeModal, setAiCategorizeModal] = useState(false);
  const [aiCategorizeMode, setAiCategorizeMode] = useState<'uncategorized' | 'all'>('uncategorized');
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [aiCategorizeSuggestions, setAiCategorizeSuggestions] = useState<any[]>([]);
  const [aiCategorizeProgress, setAiCategorizeProgress] = useState({ current: 0, total: 0 });
  const [approvedSuggestions, setApprovedSuggestions] = useState<Record<string, boolean>>({});
  const [applyingCategorization, setApplyingCategorization] = useState(false);
  const [applyingProgress, setApplyingProgress] = useState({ current: 0, total: 0 });

  const applyBulkStock = async () => {
    const v = parseInt(stockAdj.value, 10);
    if (isNaN(v)) { alert('Ingresa un valor válido'); return; }
    if (stockAdj.type === 'set' && v < 0) { alert('El stock no puede ser negativo'); return; }
    if (!confirm(`¿Aplicar ajuste de stock a ${filtered.length} producto(s)?`)) return;
    setApplyingStock(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await Promise.all(filtered.map(p => {
        const newStock = stockAdj.type === 'set' ? v : Math.max(0, (p.STOCK ?? 0) + v);
        const stockUpdate = inventoryMode === 'web_independent'
          ? { WEB_STOCK: newStock, web_stock: newStock }
          : { STOCK: newStock, stock: newStock };
        return databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, p.$id, stockUpdate);
      }));
      setProducts(prev => prev.map(p => {
        if (!filtered.find(f => f.$id === p.$id)) return p;
        const newStock = stockAdj.type === 'set' ? v : Math.max(0, (p.STOCK ?? 0) + v);
        return {
          ...p,
          STOCK: newStock,
          ...(inventoryMode === 'web_independent' ? { WEB_STOCK: newStock, web_stock: newStock } : { ERP_STOCK: newStock }),
        };
      }));
      setStockModal(false);
      setStockAdj({ type: 'add', value: '' });
      purgeServerProductsCache();
      invalidateProductCache();
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setApplyingStock(false); }
  };

  const applyBulkPrice = async () => {
    const v = parseFloat(priceAdj.value);
    if (isNaN(v) || v === 0) { alert('Ingresa un valor válido'); return; }
    if (!confirm(`¿Aplicar ajuste de precio a ${filtered.length} producto(s)?`)) return;
    setApplyingPrice(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await Promise.all(filtered.map(p => {
        const newPrice = priceAdj.type === 'percent'
          ? Math.round(p.PRICE * (1 + v / 100))
          : Math.round(p.PRICE + v);
        return databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, p.$id, { PRICE: Math.max(0, newPrice) });
      }));
      setProducts(prev => prev.map(p => {
        if (!filtered.find(f => f.$id === p.$id)) return p;
        const newPrice = priceAdj.type === 'percent'
          ? Math.round(p.PRICE * (1 + v / 100))
          : Math.round(p.PRICE + v);
        return { ...p, PRICE: Math.max(0, newPrice) };
      }));
      setPriceModal(false);
      setPriceAdj({ type: 'percent', value: '' });
      invalidateProductCache();
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setApplyingPrice(false); }
  };

  const startAiCategorization = async () => {
    // 1. Fetch ALL products from Appwrite (not just the current page)
    let targets: Product[] = [];
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      let cursor: string | null = null;
      const allProducts: Product[] = [];
      do {
        const q: any[] = [Query.limit(100), Query.orderDesc('$createdAt')];
        if (cursor) q.push(Query.cursorAfter(cursor));
        const resp = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, q);
        allProducts.push(...(resp.documents as unknown as Product[]));
        cursor = resp.documents.length === 100 ? (resp.documents[resp.documents.length - 1] as any).$id : null;
      } while (cursor);
      targets = allProducts;
    } catch (e: any) {
      alert('Error al cargar productos: ' + e.message);
      return;
    }

    if (aiCategorizeMode === 'uncategorized') {
      targets = targets.filter(p => !p.CATEGORYID || p.CATEGORYID.trim() === '');
    }

    if (targets.length === 0) {
      alert(aiCategorizeMode === 'uncategorized' 
        ? 'No hay productos sin categoría asignada.' 
        : 'No hay productos para procesar.'
      );
      return;
    }

    setAiCategorizing(true);
    setAiCategorizeSuggestions([]);
    setAiCategorizeProgress({ current: 0, total: targets.length });

    const batchSize = 50;
    const suggestionsList: any[] = [];
    const defaultApproved: Record<string, boolean> = {};

    try {
      for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        setAiCategorizeProgress({ current: i, total: targets.length });

        const res = await fetch('/api/ai-categorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: batch.map(p => ({ $id: p.$id, NAME: p.NAME, DESCRIPTION: p.DESCRIPTION })),
            categories: categories.map(c => ({ $id: c.$id, name: c.name })),
            subcategories: subcategories.map(s => ({ $id: s.$id, name: s.name, categoryId: s.categoryId })),
          }),
        });

        if (!res.ok) {
          throw new Error(await res.text());
        }

        const data = await res.ok ? await res.json() : { success: false, error: 'Request failed' };
        if (data.success && data.suggestions) {
          data.suggestions.forEach((s: any) => {
            // Find matched product from targets
            const p = targets.find(t => t.$id === s.productId);
            if (p) {
              suggestionsList.push({
                productId: s.productId,
                productName: p.NAME,
                currentCategoryId: p.CATEGORYID,
                suggestedCategoryId: s.categoryId,
                suggestedSubcategoryId: s.subcategoryId,
                reason: s.reason,
              });
              // Approve suggestions that actually find a category
              if (s.categoryId) {
                defaultApproved[s.productId] = true;
              }
            }
          });
          setAiCategorizeSuggestions([...suggestionsList]);
          setApprovedSuggestions({ ...defaultApproved });
        }
      }
      setAiCategorizeProgress({ current: targets.length, total: targets.length });
    } catch (e: any) {
      alert('Error durante el análisis: ' + e.message);
    } finally {
      setAiCategorizing(false);
    }
  };

  const applyAiCategorization = async () => {
    const toApply = aiCategorizeSuggestions.filter(s => approvedSuggestions[s.productId]);
    if (toApply.length === 0) {
      alert('No hay sugerencias aprobadas para aplicar.');
      return;
    }

    setApplyingCategorization(true);
    setApplyingProgress({ current: 0, total: toApply.length });

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      for (let i = 0; i < toApply.length; i++) {
        const item = toApply[i];
        setApplyingProgress({ current: i, total: toApply.length });

        const payload: any = {};
        if (item.suggestedCategoryId) payload.CATEGORYID = item.suggestedCategoryId;
        if (item.suggestedSubcategoryId) payload.SUBCATEGORYID = item.suggestedSubcategoryId;

        if (Object.keys(payload).length > 0) {
          await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, item.productId, payload);
        }
      }

      setApplyingProgress({ current: toApply.length, total: toApply.length });
      invalidateProductCache();
      // Clear sessionStorage cache so fresh data is loaded from Appwrite
      Object.keys(sessionStorage).forEach(k => { if (k.startsWith('admin_products_')) sessionStorage.removeItem(k); });
      alert(`¡Se categorizaron exitosamente ${toApply.length} producto(s)!`);
      setAiCategorizeModal(false);
      setAiCategorizeSuggestions([]);
      setApprovedSuggestions({});
      load();
    } catch (e: any) {
      alert('Error al aplicar categorizaciones: ' + e.message);
    } finally {
      setApplyingCategorization(false);
    }
  };

  const checkDuplicates = async () => {
    setIsLoading(true);
    setError('');
    try {
      // Duplicate detection now runs server-side behind a 24h cache instead of
      // pulling 3 × 2000 documents straight from Appwrite on every click
      // (~6000 reads → ~0, shared across admins; invalidated on product edits).
      const res = await fetch('/api/admin/check-duplicates', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al buscar duplicados');
      setDuplicates(data.duplicates || []);
    } catch (e: any) {
      setError('Error al buscar duplicados: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteDuplicate = async (dup: any) => {
    const colName = dup.collection === 'products' ? 'productos' : dup.collection === 'catalog_products' ? 'catalog_products' : 'inventory_products';
    if (!confirm(`¿Eliminar este producto duplicado en la colección "${colName}"?`)) return;
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      
      let collectionId = PRODUCTS_COLLECTION_ID;
      if (dup.collection === 'catalog_products') collectionId = CATALOG_PRODUCTS_COLLECTION_ID;
      else if (dup.collection === 'inventory_products') collectionId = INVENTORY_PRODUCTS_COLLECTION_ID;

      await databases.deleteDocument(databaseId, collectionId, dup.document.$id);
      
      setDuplicates(prev => prev.map(group => {
        return {
          ...group,
          duplicates: group.duplicates.filter((item: any) => !(item.document.$id === dup.document.$id && item.collection === dup.collection))
        };
      }).filter(group => group.duplicates.length > 0));

      alert('Producto duplicado eliminado con éxito.');
    } catch (err: any) {
      alert('Error al eliminar duplicado: ' + err.message);
    }
  };

  const [isDeletingBulkDups, setIsDeletingBulkDups] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{done: number; total: number} | null>(null);

  const deleteZeroStockDuplicates = async () => {
    const targets: any[] = [];
    duplicates.forEach(group => {
      group.duplicates.forEach((dup: any) => {
        const stockVal = dup.stock ?? dup.document.STOCK ?? dup.document.stock ?? 0;
        if (stockVal === 0 && dup.collection !== 'products') {
          targets.push(dup);
        }
      });
    });

    if (targets.length === 0) {
      alert('No hay productos duplicados con stock 0 en las colecciones de Catálogo o Inventario.');
      return;
    }

    if (!confirm(`¿Eliminar de forma masiva ${targets.length} productos repetidos con stock 0 de las colecciones de Catálogo e Inventario?`)) {
      return;
    }

    // `deleted` fuera del try para que el catch también tenga acceso
    const deleted: any[] = [];
    setIsDeletingBulkDups(true);
    setBulkDeleteProgress({ done: 0, total: targets.length });
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      // Lotes de 2 con 800ms de pausa → respeta el rate limit de Appwrite
      const BATCH_SIZE = 2;
      const DELAY_MS = 800;
      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const batch = targets.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(dup => {
          let collectionId = PRODUCTS_COLLECTION_ID;
          if (dup.collection === 'catalog_products') collectionId = CATALOG_PRODUCTS_COLLECTION_ID;
          else if (dup.collection === 'inventory_products') collectionId = INVENTORY_PRODUCTS_COLLECTION_ID;
          return databases.deleteDocument(databaseId, collectionId, dup.document.$id);
        }));
        deleted.push(...batch);
        setBulkDeleteProgress({ done: deleted.length, total: targets.length });
        if (i + BATCH_SIZE < targets.length) {
          await new Promise(res => setTimeout(res, DELAY_MS));
        }
      }

      setDuplicates(prev => prev.map(group => ({
        ...group,
        duplicates: group.duplicates.filter((item: any) => !deleted.some(t => t.document.$id === item.document.$id && t.collection === item.collection))
      })).filter(group => group.duplicates.length > 0));

      alert(`✅ Se eliminaron con éxito ${deleted.length} duplicados con stock 0.`);
    } catch (err: any) {
      // Reflejar en UI los que sí se borraron antes del error
      if (deleted.length > 0) {
        setDuplicates(prev => prev.map(group => ({
          ...group,
          duplicates: group.duplicates.filter((item: any) => !deleted.some(t => t.document.$id === item.document.$id && t.collection === item.collection))
        })).filter(group => group.duplicates.length > 0));
      }
      alert(`Error al eliminar: ${err.message}\nSe eliminaron ${deleted.length} de ${targets.length}. Vuelve a intentarlo para continuar.`);
    } finally {
      setIsDeletingBulkDups(false);
      setBulkDeleteProgress(null);
    }
  };

  const [globalStats, setGlobalStats] = useState<{ total: number; inStock: number; outOfStock: number } | null>(null);

  useEffect(() => {
    if (products.length > 0) {
      const inStock = products.filter(p => (Number(p.STOCK) || 0) > 0).length;
      setGlobalStats({
        total: products.length,
        inStock,
        outOfStock: products.length - inStock,
      });
    }
  }, [products]);

  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 24;

  const load = useCallback(async (force = false) => {
    setIsLoading(true);
    setError('');
    try {
      const ADMIN_CACHE_KEY = 'carlitos_admin_products_cache_v1';
      const ADMIN_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas
      let baseCache: {
        timestamp: number;
        products: Product[];
        categories: Category[];
        subcategories: Subcategory[];
        needsDeltaSync?: boolean;
      } | null = null;

      try {
        const cachedLocal = localStorage.getItem(ADMIN_CACHE_KEY) || sessionStorage.getItem('carlitos_admin_products_all_v1');
        if (cachedLocal) {
          const parsed = JSON.parse(cachedLocal);
          if (Array.isArray(parsed?.products) && parsed.products.length > 0) {
            baseCache = parsed;
            const isFresh = parsed.timestamp && (Date.now() - parsed.timestamp < ADMIN_CACHE_TTL);
            if (!force && isFresh && !parsed.needsDeltaSync) {
              setProducts(withInventoryView(parsed.products));
              setCategories(parsed.categories || []);
              setSubcategories(parsed.subcategories || []);
              setIsLoading(false);
              return;
            }
          }
        }
      } catch {}

      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      // ⚡ DELTA SYNC: Si existe snapshot previo, consultar solo cambios recientes (updatedAt > lastSyncTs - 60s)
      if (baseCache && baseCache.products.length >= 20 && baseCache.timestamp > 0) {
        try {
          const sinceTs = Math.max(0, Number(baseCache.timestamp) - 60_000);
          const needCats = force || !Array.isArray(baseCache.categories) || baseCache.categories.length === 0;
          const needSubs = force || !Array.isArray(baseCache.subcategories) || baseCache.subcategories.length === 0;
          const [deltaRes, cr, subRes] = await Promise.all([
            databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
              Query.greaterThan('updatedAt', sinceTs),
              Query.limit(1000),
            ]),
            needCats ? databases.listDocuments(databaseId, CATEGORIES_COLLECTION_ID, [Query.limit(100)]) : Promise.resolve({ documents: baseCache.categories }),
            needSubs ? databases.listDocuments(databaseId, SUBCATEGORIES_COLLECTION_ID, [Query.limit(100)]) : Promise.resolve({ documents: baseCache.subcategories }),
          ]);

          const deltaDocs = (deltaRes.documents || []) as unknown as Product[];
          let mergedProducts = baseCache.products;
          if (deltaDocs.length > 0) {
            const byId = new Map<string, Product>();
            for (const p of baseCache.products) byId.set(p.$id, p);
            for (const dDoc of deltaDocs) {
              const prev = byId.get(dDoc.$id);
              byId.set(dDoc.$id, prev ? { ...prev, ...dDoc } : dDoc);
            }
            mergedProducts = Array.from(byId.values());
          }

          const nextCats = (cr.documents || []) as unknown as Category[];
          const nextSubs = (subRes.documents || []) as unknown as Subcategory[];
          setProducts(withInventoryView(mergedProducts));
          setCategories(nextCats);
          setSubcategories(nextSubs);

          try {
            const cachePayload = {
              timestamp: Date.now(),
              products: mergedProducts,
              categories: nextCats,
              subcategories: nextSubs,
              needsDeltaSync: false,
            };
            localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(cachePayload));
            sessionStorage.setItem('carlitos_admin_products_all_v1', JSON.stringify(cachePayload));
          } catch {}
          setIsLoading(false);
          return;
        } catch (deltaErr) {
          console.warn('[AdminProducts DeltaSync] Fallback to full load:', deltaErr);
        }
      }

      const [prodRes, cr, subRes] = await Promise.all([
        databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
          Query.limit(5000),
          Query.orderDesc('$createdAt'),
        ]),
        databases.listDocuments(databaseId, CATEGORIES_COLLECTION_ID, [Query.limit(100)]),
        databases.listDocuments(databaseId, SUBCATEGORIES_COLLECTION_ID, [Query.limit(100)]),
      ]);

      const docs = prodRes.documents as unknown as Product[];
      setProducts(withInventoryView(docs));
      setCategories(cr.documents as unknown as Category[]);
      setSubcategories(subRes.documents as unknown as Subcategory[]);

      try {
        const cachePayload = {
          timestamp: Date.now(),
          products: docs,
          categories: cr.documents,
          subcategories: subRes.documents,
          needsDeltaSync: false,
        };
        localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(cachePayload));
        sessionStorage.setItem('carlitos_admin_products_all_v1', JSON.stringify(cachePayload));
      } catch {}
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [inventoryMode, withInventoryView]);

  const triggerSearch = async (searchTerm: string) => {
    setSearch(searchTerm);
    setCurrentPage(1);
  };

  useEffect(() => {
    let initialSearch = search;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const querySearch = params.get('search');
      if (querySearch) {
        initialSearch = querySearch;
        setSearch(querySearch);
      }
      const queryStock = params.get('stock');
      if (queryStock === 'out' || queryStock === 'instock' || queryStock === 'low') {
        setStockFilter(queryStock);
      }
    }
    load(false);
  }, [load]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, catFilter, subCatFilter, stockFilter, noImageOnly, brokenOnly]);

  const sendKeniaMessage = async () => {
    if (!KeniaInput.trim() || KeniaLoading) return;
    const userMsg = KeniaInput.trim();
    setKeniaInput('');
    const contextPrefix = modal ? `[Contexto: Estoy editando el producto "${modal.data.NAME}" (ID: ${(modal.data as Product).$id}, Precio: ${modal.data.PRICE}, Stock: ${modal.data.STOCK}, Categoría: ${categories.find(c => c.$id === modal.data.CATEGORYID)?.name || 'Sin categoría'})] ` : '';
    const newMessages = [...KeniaMessages, { role: 'user', content: contextPrefix + userMsg }];
    setKeniaMessages(newMessages);
    setKeniaLoading(true);
    try {
      const res = await fetch('/api/ai-sidekick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      const assistantMsg = data.text || data.response || data.message || 'No pude procesar la solicitud.';
      setKeniaMessages(prev => [...prev, { role: 'assistant', content: assistantMsg }]);
      // Execute actions if present
      if (data.actions) {
        for (const action of data.actions) {
          if (action.type === 'update' && modal) {
            // Apply updates to the current product being edited
            setModal(m => m ? { ...m, data: { ...m.data, ...action.data } } : m);
          }
        }
      }
      // Check for inline action tags and execute them
      const createMatch = assistantMsg.match(/\[ACTION:CREATE_PRODUCT\]([\s\S]*?)\[\/ACTION\]/);
      const updateMatch = assistantMsg.match(/\[ACTION:UPDATE_PRODUCT\]([\s\S]*?)\[\/ACTION\]/);
      const deleteMatch = assistantMsg.match(/\[ACTION:DELETE_PRODUCT\]([\s\S]*?)\[\/ACTION\]/);
      if (createMatch || updateMatch || deleteMatch) {
        try {
          if (createMatch) {
            const actionData = JSON.parse(createMatch[1]);
            const res = await fetch('/api/products/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: actionData.name,
                price: actionData.price || 0,
                description: actionData.description || '',
                category: actionData.category || '',
                stock: actionData.stock || 0,
                tags: actionData.tags || '',
                sku: actionData.sku || '',
                barcode: actionData.barcode || '',
              }),
            });
            const result = await res.json();
            if (result.success) {
              setKeniaMessages(prev => [...prev, { role: 'assistant', content: `✅ Producto "${actionData.name}" creado exitosamente.` }]);
              load();
            } else {
              setKeniaMessages(prev => [...prev, { role: 'assistant', content: `❌ Error al crear: ${result.error}` }]);
            }
          } else if (updateMatch) {
            const actionData = JSON.parse(updateMatch[1]);
            if (modal) {
              setModal(m => m ? { ...m, data: { ...m.data, ...actionData } } : m);
            } else if (actionData.name) {
              const res = await fetch('/api/products/update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(actionData),
              });
              const result = await res.json();
              if (result.success) {
                setKeniaMessages(prev => [...prev, { role: 'assistant', content: `✅ Producto "${actionData.name}" actualizado.` }]);
              } else {
                setKeniaMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${result.error}` }]);
              }
            }
            load();
          } else if (deleteMatch) {
            const actionData = JSON.parse(deleteMatch[1]);
            const res = await fetch('/api/products/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: actionData.name }),
            });
            const result = await res.json();
            if (result.success) {
              setKeniaMessages(prev => [...prev, { role: 'assistant', content: `🗑️ Producto "${actionData.name}" eliminado.` }]);
              load();
            } else {
              setKeniaMessages(prev => [...prev, { role: 'assistant', content: `❌ Error al eliminar: ${result.error}` }]);
            }
          }
        } catch (e) {
          console.error('Error executing inline action:', e);
        }
      }
    } catch {
      setKeniaMessages(prev => [...prev, { role: 'assistant', content: 'Error al conectar con Yaxbot.' }]);
    } finally {
      setKeniaLoading(false);
    }
  };

  const openAdd = () => {
    window.location.href = '/admin/store-catalog';
  };
  const openAddManual = () => {
    setShowAddChoice(false);
    setAddMode('manual');
    setModal({ mode: 'add', data: { ...EMPTY, _barcode: '', _sku: '', _details: '', _usage: '', _ingredients: '' } });
  };
  const openAddWithAI = () => {
    setShowAddChoice(false);
    setAiWizard({ step: 'prices', refImage: '', cost: 0, price: 0, catalogPrice: 0, marginPct: '', catalogPct: '', imgUrls: [] });
  };
  const aiWizardContinue = () => {
    if (!aiWizard) return;
    setAiWizard(w => w ? { ...w, step: 'images' } : w);
  };
  const aiWizardFinish = async () => {
    if (!aiWizard) return;
    const baseData = { ...EMPTY, COST: aiWizard.cost, PRICE: aiWizard.price, WHOLESALEPRICE: aiWizard.price, CATALOGPRICE: aiWizard.catalogPrice || 0, IMAGEURL: aiWizard.imgUrls[0] || aiWizard.refImage || '', IMAGEURL2: aiWizard.imgUrls[1] || '', IMAGEURL3: aiWizard.imgUrls[2] || '', _barcode: '', _sku: '', _details: '', _usage: '', _ingredients: '' };
    setAiWizard(null);
    setModal({ mode: 'add', data: baseData });
    setAiAutoEnhance(true);
  };

  // Función unificada: toma la primera imagen, busca similares, las selecciona y autocompleta todo
  const aiEnhanceProduct = useCallback(async () => {
    if (!modal) return;
    const rawFirstImage = getModalImageUrls(modal.data)[0];
    if (!rawFirstImage) {
      // Sin imagen, solo generar contenido
      generateAllProductContent();
      return;
    }
    // Resolver la URL de la imagen (file ID de Appwrite -> URL completa)
    const firstImage = resolveStorageImageUrl(rawFirstImage);
    setAiLoading('all');
    try {
      // 1. Buscar imágenes similares
      const searchRes = await fetch('/api/vision-similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: firstImage }),
      });
      const searchData = await searchRes.json();
      if (searchData.error) throw new Error(searchData.error);
      const similarUrls: string[] = (searchData.images || []).slice(0, 2).map((img: any) => img.url);

      // 2. Importar las imágenes similares (subirlas a Appwrite)
      // Mantener la imagen original (raw) como primera, y añadir las similares
      const newImageUrls: string[] = [rawFirstImage];
      for (const url of similarUrls) {
        if (newImageUrls.length >= 3) break;
        try {
          const proxyRes = await fetch(`/api/vision-similar?url=${encodeURIComponent(url)}`);
          if (!proxyRes.ok) continue;
          const blob = await proxyRes.blob();
          const file = new File([blob], `ai-${Date.now()}-${Math.random()}.jpg`, { type: blob.type || 'image/jpeg' });
          const { storage } = getServices();
          const fileId = ID.unique();
          const { compressProductImageClient } = await import('@/lib/compress-product-image-client');
          const res = await storage.createFile(MEDIA_BUCKET_ID, fileId, await compressProductImageClient(file));
          newImageUrls.push(res.url);
        } catch { /* skip failed image */ }
      }

      // 3. Actualizar imágenes en el modal
      setModal(m => m ? {
        ...m,
        data: {
          ...m.data,
          IMAGEURL: newImageUrls[0] || m.data.IMAGEURL || '',
          IMAGEURL2: newImageUrls[1] || m.data.IMAGEURL2 || '',
          IMAGEURL3: newImageUrls[2] || m.data.IMAGEURL3 || '',
        },
      } : m);

      // 4. Generar todo el contenido con IA
      await new Promise(r => setTimeout(r, 300));
      generateAllProductContent();
    } catch (e: any) {
      // Si falla la búsqueda de imágenes, al menos generar el contenido
      generateAllProductContent();
    } finally {
      setAiLoading(null);
    }
  }, [modal, generateAllProductContent]);

  // Reset de secciones colapsables del editor desktop al cambiar de producto
  const modalKey = modal ? ((modal.data as Product).$id || 'nuevo') : null;
  useEffect(() => { setTechTabsOpen(null); setAdvancedOpen(false); }, [modalKey]);
  // Editor desktop: bloquear todo hasta que suba al menos una foto
  const editorHasPhoto = modal ? getModalImageUrls(modal.data).length > 0 : false;

  // Auto-enhance cuando se abre el modal con aiAutoEnhance y hay imagen
  useEffect(() => {
    if (modal && aiAutoEnhance) {
      const firstImage = getModalImageUrls(modal.data)[0];
      if (firstImage) {
        setAiAutoEnhance(false);
        const timer = setTimeout(() => aiEnhanceProduct(), 600);
        return () => clearTimeout(timer);
      }
    }
  }, [modal, aiAutoEnhance, aiEnhanceProduct]);
  // Manejadores para edición rápida de precio web en la tarjeta
  const handleStartInlineEdit = (p: Product) => {
    const currentPrice = Number((p as any).WEBPRICE ?? (p as any).web_price ?? p.PRICE ?? 0);
    setEditingPriceId(p.$id);
    setInlinePrices(prev => ({ ...prev, [p.$id]: String(currentPrice || '') }));
  };

  const handleCancelInlineEdit = () => {
    setEditingPriceId(null);
  };

  const handleSaveInlinePrice = async (p: Product) => {
    const rawVal = inlinePrices[p.$id];
    const newPrice = Math.max(0, Math.round(Number(String(rawVal || '').replace(/[^0-9]/g, ''))));
    if (newPrice <= 0) {
      alert('El precio web debe ser mayor a 0');
      return;
    }
    setSavingPriceId(p.$id);
    try {
      const ok = await updateFirebaseErpProduct(p.$id, {
        web_price: newPrice,
      } as any);

      if (ok) {
        purgeServerProductsCache();
        setProducts(prev => prev.map(item => item.$id === p.$id ? {
          ...item,
          web_price: newPrice,
          WEBPRICE: newPrice,
        } as unknown as Product : item));
        setEditingPriceId(null);
      } else {
        alert('No se pudo actualizar el precio web');
      }
    } catch (e: any) {
      alert('Error guardando precio: ' + (e?.message || e));
    } finally {
      setSavingPriceId(null);
    }
  };

  const openEdit = (p: Product) => {
    setAddMode('manual');
    const tabs = getCustomTabsFromFeatures(p.FEATURES) ?? {};
    const origStorePrice = Number((p as any).STORE_PRICE ?? p.PRICE ?? p.CURRENTPRICE ?? 0);
    const webPrice = Number((p as any).WEBPRICE ?? (p as any).web_price ?? p.PRICE ?? 0);
    setModal({
      mode: 'edit',
      data: {
        ...p,
        originalPrice: origStorePrice,
        WEBPRICE: webPrice,
        web_price: webPrice,
        PRICE: webPrice,
        _barcode: p.BARCODE || p.barcode || getBarcodeFromFeatures(p.FEATURES, p.BARCODE || p.barcode) || '',
        _sku: p.SKU || p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.SKU || p.sku) || '',
        _details: tabs.details || '',
        _usage: tabs.usage || '',
        _ingredients: tabs.ingredients || '',
        DISABLE_DISCOUNTS: getDisableDiscountsFromFeatures(p.FEATURES),
      },
    });
  };

  const enhanceProductWithAI = (p: Product) => {
    const tabs = getCustomTabsFromFeatures(p.FEATURES) ?? {};
    setModal({
      mode: 'edit',
      data: {
        ...p,
        _barcode: p.BARCODE || p.barcode || getBarcodeFromFeatures(p.FEATURES, p.BARCODE || p.barcode) || '',
        _sku: p.SKU || p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.SKU || p.sku) || '',
        _details: tabs.details || '',
        _usage: tabs.usage || '',
        _ingredients: tabs.ingredients || '',
        DISABLE_DISCOUNTS: getDisableDiscountsFromFeatures(p.FEATURES),
      },
    });
    setAiAutoEnhance(true);
  };

  const duplicate = (_p: Product) => {
    alert('Los productos se crean únicamente desde la etapa 1.');
  };

  const save = async () => {
    if (!modal) return;
    if (String(modal.mode) === 'add') {
      alert('Los productos se crean únicamente desde la etapa 1. Aquí solo puedes editar productos existentes.');
      return;
    }
    const d = modal.data;
    if (!d.NAME?.trim()) { alert('El nombre es requerido'); return; }
    if (!d.PRICE || Number(d.PRICE) <= 0) { alert('El Precio es obligatorio'); return; }
    if (d._sku?.trim()) {
      const skuInput = d._sku.trim().toLowerCase();
      
      // 1. General check for new products (add mode)
      if (modal.mode === 'add') {
        const skuExists = products.some(p => {
          const pSku = p.SKU || p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.SKU || p.sku);
          return pSku.toLowerCase() === skuInput;
        });
        if (skuExists) {
          alert(`Ya existe un producto con el SKU "${d._sku}". Por favor, ingresa uno diferente.`);
          return;
        }
      }
      
      // 2. Prevent duplicate SKUs in products with stock (add or edit mode)
      const newStock = Math.round(Number(d.STOCK)) || 0;
      if (newStock > 0) {
        const duplicateSkuWithStock = products.find(p => {
          if (modal.mode === 'edit' && p.$id === (d as Product).$id) return false;
          const pStock = p.STOCK ?? 0;
          if (pStock <= 0) return false;
          const pSku = p.SKU || p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.SKU || p.sku);
          return pSku.toLowerCase() === skuInput;
        });
        if (duplicateSkuWithStock) {
          alert(`Ya existe otro producto CON STOCK ("${duplicateSkuWithStock.NAME}") que utiliza el SKU "${d._sku}". No se permiten SKUs duplicados en productos con stock activo.`);
          return;
        }
      }
    }
    setIsSaving(true);
    try {
      // Subir archivos pendientes al Storage antes de guardar
      let uploadedImageUrls: string[] = [];
      if (pendingPhotoFiles.length > 0) {
        uploadedImageUrls = await uploadPendingFiles(pendingPhotoFiles);
      }
      // Combinar URLs ya existentes con las recién subidas
      const existingUrls = [d.IMAGEURL || '', d.IMAGEURL2 || '', d.IMAGEURL3 || ''].filter(Boolean);
      const allUrls = [...existingUrls, ...uploadedImageUrls].slice(0, 3);
      while (allUrls.length < 3) allUrls.push('');

      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const original = products.find(p => p.$id === (d as Product).$id) || d as Product;
      const stockForSave = Number(original.STOCK ?? 0);
      const payload: Record<string, any> = {
        NAME: d.NAME, DESCRIPTION: d.DESCRIPTION || '',
        PRICE: Number(original.PRICE || 0),
        ...(inventoryMode === 'web_independent'
          ? { WEB_STOCK: stockForSave, web_stock: stockForSave }
          : { STOCK: stockForSave, stock: stockForSave }),
        ISACTIVE: original.ISACTIVE ?? stockForSave > 0,
        COST: Number(original.COST || 0),
        CURRENTPRICE: original.CURRENTPRICE ?? null,
        WHOLESALEPRICE: Number(original.WHOLESALEPRICE || 0),
        CATALOGPRICE: Number(original.CATALOGPRICE || original.PRICE || 0),
        WHOLESALEMINQUANTITY: Number(original.WHOLESALEMINQUANTITY || 0),
        PACKQTY: Math.round(Number(d.PACKQTY)) || 0,
        BOXPRICE: Number(original.BOXPRICE || 0),
        BOXQTY: Math.round(Number(d.BOXQTY)) || 0,
        EMBALAJEQTY: Math.round(Number(d.EMBALAJEQTY)) || 0,
        PACKPRICE: Number(original.PACKPRICE || 0),
        EMBALAJEPRICE: Number(original.EMBALAJEPRICE || 0),
        PROMO_QTY: Math.round(Number(d.PROMO_QTY)) || 0,
        PROMO_PRICE: Number(original.PROMO_PRICE || 0),
        IMAGEURL: allUrls[0] || '', IMAGEURL2: allUrls[1] || '',
        IMAGEURL3: allUrls[2] || '',
        CATEGORYID: d.CATEGORYID || '',
        SUBCATEGORYID: d.SUBCATEGORYID || '',
        SUBSUBCATEGORYID: d.SUBSUBCATEGORYID || '',
      };
      // Campos opcionales que pueden no existir en el schema
      const optionalFields: Record<string, any> = {
        TAGS: typeof d.TAGS === 'string' ? d.TAGS.split(',').map((t: string) => t.trim()).filter(Boolean) : (d.TAGS || []),
        FEATURES: (() => {
          let features = d.FEATURES || '';
          features = setSkuInFeatures(features, d._sku || '');
          features = setBarcodeInFeatures(features, d._barcode || '');
          features = setDisableDiscountsInFeatures(features, !!d.DISABLE_DISCOUNTS);
          if ((d as Product).section != null) {
            features = setSectionInFeatures(features, (d as Product).section!);
          }
          const tabs = {
            details: d._details || '',
            usage: d._usage || '',
            ingredients: d._ingredients || '',
          };
          features = setCustomTabsInFeatures(features, tabs);
          return typeof features === 'string' ? features.split('\n').filter(Boolean) : features;
        })(),
        barcode: d._barcode || '',
        BARCODE: d._barcode || '',
        sku: d._sku || '',
        SKU: d._sku || '',
        BRAND: d.BRAND || d.SUPPLIER || '',
        SUPPLIER: d.BRAND || d.SUPPLIER || '',
        QUANTITY: d.QUANTITY || d.PACKAGE_QTY || '',
        PACKAGE_QTY: d.QUANTITY || d.PACKAGE_QTY || '',
        BOX_CODE: d.BOX_CODE || '',
        EMBALAJEQTY: d.EMBALAJEQTY || (() => {
          const m = String(d.QUANTITY || d.PACKAGE_QTY || '').match(/(\d+)/);
          return m ? parseInt(m[1], 10) : 0;
        })(),
      };
      if ((d as Product).section != null) optionalFields.section = (d as Product).section;
      // Visibilidad en Tienda Web vs Solo Tienda (POS)
      if (modal.mode === 'add') {
        const showInWeb = Boolean(d.SHOW_IN_WEB ?? d.show_in_web ?? true);
        optionalFields.SHOW_IN_WEB = showInWeb;
        optionalFields.show_in_web = showInWeb;
      } else if (d.SHOW_IN_WEB !== undefined || d.show_in_web !== undefined) {
        const showInWeb = Boolean(d.SHOW_IN_WEB ?? d.show_in_web);
        optionalFields.SHOW_IN_WEB = showInWeb;
        optionalFields.show_in_web = showInWeb;
      }
      // Precio por volumen: campos de descuento por cantidad
      optionalFields.PACK_MIN_PACKS = Math.round(Number(d.PACK_MIN_PACKS)) || 0;
      optionalFields.PACK_DISCOUNT_PCT = Math.round(Number(d.PACK_DISCOUNT_PCT)) || 0;

      // Precio Web exclusivo: no altera el precio físico de tienda (original.PRICE)
      const newWebPrice = Math.max(0, Math.round(Number(d.WEBPRICE || d.web_price || d.PRICE || 0)));
      if (newWebPrice > 0) {
        optionalFields.web_price = newWebPrice;
        optionalFields.WEBPRICE = newWebPrice;
      }
      // IMAGEURL4/5 no existen en el schema — no enviarlos
      
      // Check if stock is being restocked (from 0 to >0) on edit
      let stockRestocked = false;
      const previousProduct = modal.mode === 'edit' ? products.find(p => p.$id === (d as Product).$id) : null;
      if (previousProduct && (previousProduct.STOCK ?? 0) === 0 && payload.STOCK > 0) {
        stockRestocked = true;
      }

      const doSave = async (data: Record<string, any>) => {
        if (modal.mode === 'add') {
          // Normalizar nombre: lowercase, quitar espacios extra, quitar guiones
          const normName = (s: string) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[-_]/g, '');
          const newName = normName(data.NAME || '');
          // Buscar duplicados: nombre exacto, nombre contenido, o que contenga el nuevo
          const duplicates = products.filter(p => {
            const pName = normName(p.NAME || '');
            if (!pName || !newName) return false;
            return pName === newName || pName.includes(newName) || newName.includes(pName);
          });
          if (duplicates.length > 0) {
            const namesList = duplicates.slice(0, 5).map(d => `• "${d.NAME}" (SKU: ${d.SKU || d.sku || 'sin SKU'})`).join('\n');
            const msg = `⚠️ Ya existe(n) ${duplicates.length} producto(s) con nombre similar:\n\n${namesList}\n\n¿Seguro que quieres crear un producto duplicado?`;
            if (!window.confirm(msg)) { setIsSaving(false); throw new Error('cancelled'); }
          }
          const doc = await databases.createDocument(databaseId, PRODUCTS_COLLECTION_ID, ID.unique(), data);
          setProducts(prev => [withInventoryView([doc as unknown as Product])[0], ...prev]);
        } else {
          const doc = await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, (d as Product).$id, data);
          setProducts(prev => prev.map(p => p.$id === (d as Product).$id ? withInventoryView([doc as unknown as Product])[0] : p));
        }
      };

      // Loop to dynamically remove unknown attributes if rejected by Appwrite
      // Quitar atributos que no existen en la colección de una vez
      const unknownAttrs = ['BOXPRICE', 'BOXQTY', 'SUBSUBCATEGORYID', 'barcode', 'sku', 'DISABLE_DISCOUNTS'];
      let currentPayload = { ...payload, ...optionalFields };
      unknownAttrs.forEach(attr => { delete currentPayload[attr]; });

      let success = false;
      let attempts = 0;

      while (!success && attempts < 4) {
        try {
          await doSave(currentPayload);
          success = true;
        } catch (err: any) {
          if (err?.message === 'cancelled') throw err;
          if (err?.message?.includes('Unknown attribute') || err?.message?.includes('unknown attribute')) {
            const match = err.message.match(/attribute:\s*"?([a-zA-Z0-9_$]+)"?/i);
            if (match && match[1]) {
              const attr = match[1];
              console.warn(`[Save Fallback] Removing unknown attribute: ${attr}`);
              delete currentPayload[attr];
              attempts++;
            } else {
              // Si no podemos determinar el atributo, intentar con el payload básico
              currentPayload = { ...payload };
              attempts = 7;
            }
          } else {
            throw err;
          }
        }
      }
      
      // Auto-add to cart & notify users who requested this product
      if (stockRestocked && (d as Product).$id) {
        try {
          const res = await fetch('/api/stock-alerts/auto-cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: (d as Product).$id,
              productName: d.NAME,
              productImage: d.IMAGEURL || '',
              productPrice: d.PRICE || 0,
            }),
          });
          const data = await res.json();
          if (data.autoAdded > 0) {
            console.log(`✅ Auto-agregado al carrito de ${data.autoAdded} usuarios, producto "${d.NAME}"`);
          }
        } catch (alertErr) {
          console.error('Error auto-adding to cart:', alertErr);
        }
      }
      
      if (newWebPrice > 0 && (d as Product).$id) {
        setProducts(prev => prev.map(p => p.$id === (d as Product).$id ? {
          ...p,
          web_price: newWebPrice,
          WEBPRICE: newWebPrice,
        } : p));
      }

      try {
        const patchAdminStorage = (storage: Storage, key: string) => {
          const raw = storage.getItem(key);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.products)) {
            parsed.products = parsed.products.map((p: any) =>
              p.$id === (d as Product).$id ? { ...p, ...currentPayload } : p
            );
            storage.setItem(key, JSON.stringify(parsed));
          }
        };
        patchAdminStorage(localStorage, 'carlitos_admin_products_cache_v1');
        patchAdminStorage(sessionStorage, 'carlitos_admin_products_all_v1');
      } catch {}

      localStorage.removeItem('mobile-editor-state');
      closeProductModal();
      purgeServerProductsCache();
      invalidateProductCache();
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setIsSaving(false); }
  };

  
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const deleteAll = async () => {
    if (!confirm(`⚠️ ¿Eliminar TODOS los ${products.length} productos? Esta acción no se puede deshacer.`)) return;
    const confirmText = window.prompt(`Escribe ELIMINAR para confirmar:`);
    if (confirmText !== 'ELIMINAR') { alert('Cancelado.'); return; }
    setIsDeletingAll(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      let deleted = 0;
      for (const p of products) {
        await databases.deleteDocument(databaseId, PRODUCTS_COLLECTION_ID, p.$id);
        deleted++;
      }
      setProducts([]);
      alert(`✅ ${deleted} productos eliminados.`);
      invalidateProductCache();
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setIsDeletingAll(false); }
  };

  const remove = async (_id: string) => {
    alert('Los productos publicados no se eliminan desde esta sección.');
  };
  const disableProduct = async (_p: Product) => {
    alert('El stock está protegido en esta sección.');
  };

  const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
  const catName = (id?: string) => categories.find(c => c.$id === id)?.name || '—';

  const webProductsCount = useMemo(() => {
    return products.filter(p => Boolean((p as any).SHOW_IN_WEB ?? (p as any).show_in_web)).length;
  }, [products]);


  const toggleWebStatus = async (p: Product) => {
    const currentStatus = Boolean((p as any).SHOW_IN_WEB ?? (p as any).show_in_web);
    const newStatus = !currentStatus;
    const publishedAt = newStatus ? new Date().toISOString() : undefined;
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, p.$id, {
        SHOW_IN_WEB: newStatus,
        show_in_web: newStatus,
        ...(publishedAt ? { WEB_PUBLISHED_AT: publishedAt, web_published_at: publishedAt } : {}),
      });
      setProducts(prev => prev.map(item => item.$id === p.$id ? {
        ...item,
        SHOW_IN_WEB: newStatus,
        show_in_web: newStatus,
        ...(publishedAt ? { WEB_PUBLISHED_AT: publishedAt, web_published_at: publishedAt } : {}),
      } as any : item));
      try {
        localStorage.removeItem('carlitos_admin_products_cache_v1');
        sessionStorage.removeItem('carlitos_admin_products_all_v1');
      } catch {}
      purgeServerProductsCache();
      invalidateProductCache();
    } catch (err: any) {
      alert('Error actualizando visibilidad: ' + (err?.message || err));
    }
  };

  const saveImageDrawer = async () => {
    if (!imageDrawer) return;
    setImageDrawerSaving(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const payload: Record<string, any> = {};
      if (imageDrawer.img1 !== imageDrawer.origImg1) payload.IMAGEURL = imageDrawer.img1;
      if (imageDrawer.img2 !== imageDrawer.origImg2) payload.IMAGEURL2 = imageDrawer.img2;
      if (imageDrawer.img3 !== imageDrawer.origImg3) payload.IMAGEURL3 = imageDrawer.img3;
      // IMAGEURL4/5 no existen en el schema — no enviarlos
      if (imageDrawer.description !== imageDrawer.origDescription) payload.DESCRIPTION = imageDrawer.description;
      if (imageDrawer.features !== imageDrawer.origFeatures) {
        const feats = imageDrawer.features.split('\n').map((s: string) => s.trim()).filter(Boolean);
        payload.FEATURES = feats;
      }
      if (imageDrawer.tags !== imageDrawer.origTags) {
        const tags = imageDrawer.tags.split(',').map((s: string) => s.trim()).filter(Boolean);
        payload.TAGS = tags;
      }
      if (imageDrawer.sku !== imageDrawer.origSku) payload.SKU = imageDrawer.sku;
      if (Object.keys(payload).length > 0) {
        await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, imageDrawer.productId, payload);
        setProducts(prev => prev.map(p => p.$id === imageDrawer.productId ? { ...p, ...payload } : p));
        invalidateProductCache();
      }
      setImageDrawer(null);
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setImageDrawerSaving(false); }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Nombre', 'Descripción', 'Precio', 'Stock', 'Categoría', 'Costo', 'Margen %', 'Precio Mayorista', 'Mín. Mayorista', 'Vendidos', 'Destacado', 'URL Imagen'];
    const rows = filtered.map(p => [
      p.$id, p.NAME || '', p.DESCRIPTION || '',
      p.PRICE, p.STOCK ?? 0, catName(p.CATEGORYID),
      p.COST || 0,
      p.COST && p.PRICE ? Math.round(((p.PRICE - p.COST) / p.PRICE) * 100) : '',
      p.WHOLESALEPRICE || 0, p.WHOLESALEMINQUANTITY || 0,
      p.SOLDQUANTITY || 0, p.IMAGEURL || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `productos_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportShopifyCSV = async () => {
    const btn = document.getElementById('btn-export-shopify');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.setAttribute('disabled', 'true');
      btn.innerHTML = '⏳ Exportando...';
    }

    try {
      const res = await fetch('/api/public-data/products?limit=5000&includeOutOfStock=true').then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      const allExportProducts = res.products || [];

      if (allExportProducts.length === 0) {
        alert('No se encontraron productos para exportar.');
        return;
      }

      const slugify = (text: string) => {
        return text
          .toString()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-')
          .replace(/[^\w\-]+/g, '')
          .replace(/\-\-+/g, '-')
          .replace(/^-+/, '')
          .replace(/-+$/, '');
      };

      const headers = [
        'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags',
        'Published on online store', 'Status', 'SKU', 'Barcode',
        'Option1 name', 'Option1 value', 'Option1 Linked To',
        'Option2 name', 'Option2 value', 'Option2 Linked To',
        'Option3 name', 'Option3 value', 'Option3 Linked To',
        'Price', 'Compare-at price', 'Cost per item', 'Charge tax', 'Tax code',
        'Unit price total measure', 'Unit price total measure unit',
        'Unit price base measure', 'Unit price base measure unit',
        'Inventory tracker', 'Inventory quantity', 'Continue selling when out of stock',
        'Weight value (grams)', 'Weight unit for display', 'Requires shipping', 'Fulfillment service',
        'Product image URL', 'Image position', 'Image alt text', 'Variant image URL',
        'Gift card', 'SEO title', 'SEO description',
        'Color (product.metafields.shopify.color-pattern)',
        'Google Shopping / Google product category', 'Google Shopping / Gender',
        'Google Shopping / Age group', 'Google Shopping / Manufacturer part number (MPN)',
        'Google Shopping / Ad group name', 'Google Shopping / Ads labels',
        'Google Shopping / Condition', 'Google Shopping / Custom product',
        'Google Shopping / Custom label 0', 'Google Shopping / Custom label 1',
        'Google Shopping / Custom label 2', 'Google Shopping / Custom label 3',
        'Google Shopping / Custom label 4'
      ];

      const rows: string[][] = [];

      // Group products by GROUPID to support Shopify variants
      const groups: Record<string, Product[]> = {};
      const standalone: Product[] = [];

      allExportProducts.forEach((p: any) => {
        const gid = p.GROUPID?.trim();
        if (gid) {
          if (!groups[gid]) groups[gid] = [];
          groups[gid].push(p);
        } else {
          standalone.push(p);
        }
      });

      const addProductRows = (parent: Product, isVariant: boolean, variantVal?: string, variantImg?: string) => {
        const handle = slugify(parent.NAME);
        const title = isVariant ? '' : parent.NAME;
        const desc = isVariant ? '' : (parent.DESCRIPTION || '');
        const vendor = isVariant ? '' : 'Importadora Carlitos';
        const category = isVariant ? '' : '';
        const type = isVariant ? '' : catName(parent.CATEGORYID);
        const tags = isVariant ? '' : (parent.TAGS || '');
        const status = isVariant ? '' : (parent.ISACTIVE !== false ? 'active' : 'draft');
        const published = isVariant ? '' : 'TRUE';
        const optName = isVariant ? 'Title' : (variantVal ? 'Title' : 'Title');
        const optVal = variantVal || 'Default Title';

        const sku = getSku(parent);
        const barcode = getBarcode(parent) || '';

        let price = parent.PRICE;
        let compareAtPrice = '';
        if (parent.CURRENTPRICE && parent.CURRENTPRICE > 0 && parent.CURRENTPRICE < parent.PRICE) {
          price = parent.CURRENTPRICE;
          compareAtPrice = String(parent.PRICE);
        }

        const cost = parent.COST ? String(parent.COST) : '';

        // Main image for this row
        const mainImg = variantImg || parent.IMAGEURL || '';

        const row = Array(57).fill('');
        row[0] = title;
        row[1] = handle;
        row[2] = desc;
        row[3] = vendor;
        row[4] = category;
        row[5] = type;
        row[6] = tags;
        row[7] = published;
        row[8] = status;
        row[9] = sku;
        row[10] = barcode;
        row[11] = optName;
        row[12] = optVal;
        row[20] = String(price);
        row[21] = compareAtPrice;
        row[22] = cost;
        row[23] = 'TRUE';
        row[29] = 'shopify';
        row[30] = String(parent.STOCK ?? 0);
        row[31] = 'DENY';
        row[34] = 'TRUE';
        row[35] = 'manual';
        if (variantImg) {
          row[39] = variantImg; // Variant image URL
        } else {
          row[36] = mainImg; // Product image URL
          row[37] = mainImg ? '1' : '';
        }
        row[40] = 'FALSE';

        rows.push(row);

        // Add extra images if not a variant
        if (!isVariant) {
          let imgPos = 2;
          [parent.IMAGEURL2, parent.IMAGEURL3].filter(Boolean).forEach(url => {
            const imgRow = Array(57).fill('');
            imgRow[1] = handle;
            imgRow[36] = url;
            imgRow[37] = String(imgPos++);
            rows.push(imgRow);
          });
        }
      };

      // Process standalone
      standalone.forEach(p => {
        addProductRows(p, false);
      });

      // Process grouped variants
      Object.values(groups).forEach(group => {
        if (group.length === 0) return;
        const parent = group[0];
        
        // Main row (Variant 1)
        addProductRows(parent, false, parent.NAME, parent.IMAGEURL || '');

        // Subsequent variant rows
        group.slice(1).forEach(v => {
          addProductRows(v, true, v.NAME, v.IMAGEURL || '');
        });
      });

      const cleanVal = (val: any) => {
        if (val === null || val === undefined) return '';
        return String(val).replace(/\r/g, '');
      };

      const csvContent = [headers, ...rows]
        .map(r => r.map(v => `"${cleanVal(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shopify_export_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Error al exportar para Shopify: ' + e.message);
    } finally {
      if (btn) {
        btn.removeAttribute('disabled');
        btn.innerHTML = originalText;
      }
    }
  };

  const getSku = (p: Product) =>
    p.SKU || p.sku || getSkuFromFeatures(p.FEATURES, p.TAGS, p.jumpseller_id, p.SKU || p.sku) || p.$id;

  const getBarcode = (p: Product) =>
    p.BARCODE || p.barcode || getBarcodeFromFeatures(p.FEATURES, p.BARCODE || p.barcode) || '';

  const getSection = (p: Product): { section: number; gondola: string } | null => {
    const loc = getWarehouseLocationFromFeatures(p.FEATURES, p.section ?? null);
    if (loc.section === null) return null;
    return { section: loc.section, gondola: loc.gondola || '?' };
  };

  const exportXLSX = () => {
    const data = filtered.map(p => ({
      SKU: getSku(p), 'Código de barras': getBarcode(p) || '', ID: p.$id, Nombre: p.NAME || '', Descripción: p.DESCRIPTION || '',
      Proveedor: p.BRAND || p.SUPPLIER || '',
      'Cant. Embalaje': p.QUANTITY || p.PACKAGE_QTY || (p.EMBALAJEQTY ? `${p.EMBALAJEQTY} un.` : ''),
      'Cód. Caja': p.BOX_CODE || '',
      Precio: p.PRICE, Stock: p.STOCK ?? 0, Categoría: catName(p.CATEGORYID),
      Costo: p.COST || 0,
      'Margen %': p.COST && p.PRICE ? Math.round(((p.PRICE - p.COST) / p.PRICE) * 100) : '',
      'Precio Mayorista': p.WHOLESALEPRICE || 0,
      'Mín. Mayorista': p.WHOLESALEMINQUANTITY || 0,
      'Vendidos': p.SOLDQUANTITY || 0,
      'Sección': getSection(p)?.section ?? '',
      'Góndola': getSection(p)?.gondola ?? '',
      'URL Imagen': p.IMAGEURL || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.writeFile(wb, `productos_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const [isExportingAllXLSX, setIsExportingAllXLSX] = useState(false);

  const exportAllXLSX = async () => {
    setIsExportingAllXLSX(true);
    try {
      const allProducts = await fetchAllProductsForExport();
      if (allProducts.length === 0) {
        alert('No se encontraron productos para exportar.');
        return;
      }
      const data = allProducts.map(p => ({
        SKU: getSku(p),
        'Código de barras': getBarcode(p) || '',
        ID: p.$id,
        Nombre: p.NAME || '',
        Descripción: p.DESCRIPTION || '',
        Proveedor: p.BRAND || p.SUPPLIER || '',
        'Cant. Embalaje': p.QUANTITY || p.PACKAGE_QTY || (p.EMBALAJEQTY ? `${p.EMBALAJEQTY} un.` : ''),
        'Cód. Caja': p.BOX_CODE || '',
        Precio: p.PRICE,
        Stock: p.STOCK ?? 0,
        Categoría: catName(p.CATEGORYID),
        Costo: p.COST || 0,
        'Margen %': p.COST && p.PRICE ? Math.round(((p.PRICE - p.COST) / p.PRICE) * 100) : '',
        'Precio Mayorista': p.WHOLESALEPRICE || 0,
        'Mín. Mayorista': p.WHOLESALEMINQUANTITY || 0,
        'Vendidos': p.SOLDQUANTITY || 0,
        'Sección': getSection(p)?.section ?? '',
        'Góndola': getSection(p)?.gondola ?? '',
        'URL Imagen': p.IMAGEURL || '',
        'URL Imagen 2': p.IMAGEURL2 || '',
        'URL Imagen 3': p.IMAGEURL3 || '',
        'Tags': Array.isArray(p.TAGS) ? p.TAGS.join(', ') : (p.TAGS || ''),
        'Activo': p.ISACTIVE !== false ? 'Sí' : 'No',
        'Destacado': p.ISFEATURED ? 'Sí' : 'No',
        'Fecha creación': p.$createdAt || '',
        'Fecha actualización': p.$updatedAt || '',
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Productos');
      XLSX.writeFile(wb, `productos_completos_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (e: any) {
      alert('Error al exportar todos los productos: ' + e.message);
    } finally {
      setIsExportingAllXLSX(false);
    }
  };

  const exportCompareCSV = async () => {
    try {
      const allProducts = await fetchAllProductsForExport();
      if (allProducts.length === 0) {
        alert('No se encontraron productos para exportar.');
        return;
      }
      const headers = ['SKU', 'Nombre', 'Precio', 'Stock', 'Categoria', 'Imagen'];
      let csv = headers.join(';') + '\n';
      allProducts.forEach(p => {
        const row = [
          getSku(p) || '',
          (p.NAME || '').replace(/;/g, ',').replace(/\n/g, ' '),
          p.PRICE || 0,
          p.STOCK ?? 0,
          catName(p.CATEGORYID).replace(/;/g, ','),
          (p.IMAGEURL || '').replace(/;/g, ',')
        ];
        csv += row.join(';') + '\n';
      });
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `appwrite-productos-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Error al exportar: ' + e.message);
    }
  };

  const fetchAllProductsForExport = async (): Promise<Product[]> => {
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    const all: Product[] = [];
    let lastId: string | null = null;
    const limit = 100;

    while (true) {
      const queries: any[] = [Query.limit(limit), Query.orderAsc('$id')];
      if (lastId) queries.push(Query.cursorAfter(lastId));
      const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, queries);
      if (res.documents.length === 0) break;
      all.push(...(res.documents as unknown as Product[]));
      lastId = res.documents[res.documents.length - 1].$id;
      if (res.documents.length < limit) break;
    }
    return all;
  };

  const exportInventoryPDF = async () => {
    setIsExportingPDF(true);
    setPdfExportProgress({ current: 0, total: 0 });

    let productsToExport: Product[] = [];
    try {
      productsToExport = await fetchAllProductsForExport();
    } catch (e: any) {
      alert('Error al obtener todos los productos: ' + e.message);
      setIsExportingPDF(false);
      return;
    }

    if (productsToExport.length === 0) {
      alert('No hay productos para exportar');
      setIsExportingPDF(false);
      return;
    }

    setPdfExportProgress({ current: 0, total: productsToExport.length });

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const cols = 5;
      const rows = 10;
      const cellWidth = (pageWidth - 2 * margin) / cols;
      const cellHeight = (pageHeight - 2 * margin) / rows;
      const textBlockHeight = 9; // space reserved for SKU + stock lines
      const imgSize = Math.min(cellWidth - 4, cellHeight - textBlockHeight - 2);
      const imgOffsetX = (cellWidth - imgSize) / 2;

      let itemsOnPage = 0;

      // Pre-fetch images in batches to speed things up while keeping memory reasonable
      const BATCH_SIZE = 25;
      for (let batchStart = 0; batchStart < productsToExport.length; batchStart += BATCH_SIZE) {
        const batch = productsToExport.slice(batchStart, batchStart + BATCH_SIZE);
        const batchImages = await Promise.all(batch.map(async p => {
          const imgUrl = p.IMAGEURL || p.IMAGEURL2 || p.IMAGEURL3;
          if (!imgUrl) return null;
          try {
            return await loadImageAsBase64(imgUrl);
          } catch {
            return null;
          }
        }));

        for (let j = 0; j < batch.length; j++) {
          const p = batch[j];
          const imgData = batchImages[j];
          const sku = getSku(p);

          if (itemsOnPage >= cols * rows) {
            pdf.addPage();
            itemsOnPage = 0;
          }

          const col = itemsOnPage % cols;
          const row = Math.floor(itemsOnPage / cols);
          const x = margin + col * cellWidth;
          const y = margin + row * cellHeight;

          // Draw cell border
          pdf.setDrawColor(200);
          pdf.setLineWidth(0.1);
          pdf.rect(x, y, cellWidth, cellHeight);

          const imgX = x + imgOffsetX;
          const imgY = y + 2;

          if (imgData) {
            try {
              const format = imgData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
              pdf.addImage(imgData, format, imgX, imgY, imgSize, imgSize);
            } catch {
              pdf.setFillColor('#f0f0f0');
              pdf.rect(imgX, imgY, imgSize, imgSize, 'F');
              pdf.setFontSize(7);
              pdf.setTextColor('#969696');
              pdf.text('Sin imagen', x + cellWidth / 2, imgY + imgSize / 2, { align: 'center' });
            }
          } else {
            pdf.setFillColor('#f0f0f0');
            pdf.rect(imgX, imgY, imgSize, imgSize, 'F');
            pdf.setFontSize(7);
            pdf.setTextColor('#969696');
            pdf.text('Sin imagen', x + cellWidth / 2, imgY + imgSize / 2, { align: 'center' });
          }

          // Add SKU below image
          const textY = imgY + imgSize + 3.5;
          pdf.setFontSize(6.5);
          pdf.setTextColor('#000000');
          pdf.text(String(sku || p.$id), x + cellWidth / 2, textY, { align: 'center', maxWidth: cellWidth - 2 });

          // Add stock indicator
          const stock = p.STOCK ?? 0;
          pdf.setFontSize(6);
          if (stock === 0) {
            pdf.setTextColor('#ff0000');
            pdf.text('SIN STOCK', x + cellWidth / 2, textY + 3.5, { align: 'center' });
          } else if (stock < 10) {
            pdf.setTextColor('#ffa500');
            pdf.text(`Stock: ${stock}`, x + cellWidth / 2, textY + 3.5, { align: 'center' });
          } else {
            pdf.setTextColor('#009600');
            pdf.text(`Stock: ${stock}`, x + cellWidth / 2, textY + 3.5, { align: 'center' });
          }

          itemsOnPage++;
        }

        setPdfExportProgress({ current: Math.min(batchStart + BATCH_SIZE, productsToExport.length), total: productsToExport.length });
      }

      pdf.save(`inventario_imagenes_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (e: any) {
      alert('Error al generar el PDF: ' + e.message);
    } finally {
      setIsExportingPDF(false);
      setPdfExportProgress({ current: 0, total: 0 });
    }
  };

  const loadImageAsBase64 = async (url: string): Promise<string> => {
    const res = await fetch(`/api/admin/proxy-image?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('Proxy fetch failed');
    const data = await res.json();
    if (!data.dataUrl) throw new Error('No dataUrl in response');
    return data.dataUrl;
  };

  const syncBrokenImages = async () => {
    if (products.length === 0) return;
    setSyncingImages(true);
    setBrokenImages({});
    try { localStorage.removeItem('admin_broken_images'); } catch {}
    setSyncProgress({ checked: 0, broken: 0 });
    const result: Record<string, string[]> = {};
    let checked = 0;
    let broken = 0;
    const BATCH = 20;
    const allImages = products.flatMap(p =>
      [p.IMAGEURL, p.IMAGEURL2, p.IMAGEURL3]
        .filter(Boolean)
        .map(url => ({ productId: p.$id, url: url! }))
    );
    for (let i = 0; i < allImages.length; i += BATCH) {
      const batch = allImages.slice(i, i + BATCH);
      await Promise.all(batch.map(({ productId, url }) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => {
            if (!result[productId]) result[productId] = [];
            result[productId].push(url);
            broken++;
            resolve();
          };
          img.src = url;
        })
      ));
      checked += batch.length;
      setSyncProgress({ checked, broken });
      const snapshot = { ...result };
      setBrokenImages(snapshot);
      try { localStorage.setItem('admin_broken_images', JSON.stringify(snapshot)); } catch {}
    }
    setSyncingImages(false);
  };

  const filtered = products.filter(p => {
    const matchScope = Boolean((p as any).SHOW_IN_WEB ?? (p as any).show_in_web);
    const q = search.toLowerCase();
    const tagsStr = Array.isArray(p.TAGS) ? p.TAGS.join(', ') : (p.TAGS || '');
    const featuresStr = Array.isArray(p.FEATURES) ? p.FEATURES.join(', ') : (p.FEATURES || '');
    const matchSearch = !search || (
      p.NAME?.toLowerCase().includes(q) ||
      p.DESCRIPTION?.toLowerCase().includes(q) ||
      tagsStr.toLowerCase().includes(q) ||
      getSku(p).toLowerCase().includes(q) ||
      getBarcode(p).toLowerCase().includes(q) ||
      featuresStr.toLowerCase().includes(q) ||
      p.BRAND?.toLowerCase().includes(q) ||
      p.SUPPLIER?.toLowerCase().includes(q) ||
      p.QUANTITY?.toLowerCase().includes(q) ||
      p.PACKAGE_QTY?.toLowerCase().includes(q) ||
      p.BOX_CODE?.toLowerCase().includes(q)
    );
    const matchCat = !catFilter || p.CATEGORYID === catFilter;
    const matchSubCat = !subCatFilter || p.SUBCATEGORYID === subCatFilter;
    const matchStock = stockFilter === 'all' ? true
      : stockFilter === 'instock' ? (p.STOCK ?? 0) > 0
      : stockFilter === 'out' ? (p.STOCK ?? 0) === 0
      : (p.STOCK ?? 0) > 0 && (p.STOCK ?? 0) <= 10;
    const matchNoImage = !noImageOnly || !p.IMAGEURL;
    const matchBroken = !brokenOnly || brokenImages[p.$id]?.length;
    const matchRisk = riskFilter === 'all' ? true : (() => {
      const r = getProductRisk({
        stock: p.STOCK ?? 0,
        salesVelocity7d: (p as any).salesVelocity7d || 0,
        maxBatchSize: (p as any).maxBatchSize || 1,
        daysSinceCreated: p.$createdAt
          ? Math.floor((Date.now() - new Date(p.$createdAt).getTime()) / 86400000)
          : 999,
        price: Number(p.CURRENTPRICE ?? p.PRICE ?? 0),
      });
      return r.level === riskFilter;
    })();
    return matchScope && matchSearch && matchCat && matchSubCat && matchStock && matchNoImage && matchBroken && matchRisk;
  }).sort((a, b) => {
    if (sort.key === 'RISK') {
      const riskA = getProductRisk({
        stock: a.STOCK ?? 0,
        salesVelocity7d: (a as any).salesVelocity7d || 0,
        maxBatchSize: (a as any).maxBatchSize || 1,
        daysSinceCreated: a.$createdAt
          ? Math.floor((Date.now() - new Date(a.$createdAt).getTime()) / 86400000)
          : 999,
        price: Number(a.CURRENTPRICE ?? a.PRICE ?? 0),
      });
      const riskB = getProductRisk({
        stock: b.STOCK ?? 0,
        salesVelocity7d: (b as any).salesVelocity7d || 0,
        maxBatchSize: (b as any).maxBatchSize || 1,
        daysSinceCreated: b.$createdAt
          ? Math.floor((Date.now() - new Date(b.$createdAt).getTime()) / 86400000)
          : 999,
        price: Number(b.CURRENTPRICE ?? b.PRICE ?? 0),
      });

      // 'asc': Críticos / Menos tienen primero (ROJOS primero: 0%, 6%, 15%... los que hay que sacar de la web)
      // 'desc': Seguros / Más tienen primero (VERDES primero: 100%, 95%...)
      if (sort.dir === 'asc') {
        const weight = (lvl: string) => (lvl === 'rojo' ? 0 : lvl === 'amarillo' ? 1 : 2);
        const diff = weight(riskA.level) - weight(riskB.level);
        if (diff !== 0) return diff;
        if (riskA.pct !== riskB.pct) return riskA.pct - riskB.pct;
        return (a.STOCK ?? 0) - (b.STOCK ?? 0);
      } else {
        const weight = (lvl: string) => (lvl === 'verde' ? 0 : lvl === 'amarillo' ? 1 : 2);
        const diff = weight(riskA.level) - weight(riskB.level);
        if (diff !== 0) return diff;
        if (riskB.pct !== riskA.pct) return riskB.pct - riskA.pct;
        return (b.STOCK ?? 0) - (a.STOCK ?? 0);
      }
    }

    let av: number | string, bv: number | string;
    if (sort.key === 'MARGIN') {
      av = (a.COST && a.PRICE) ? ((a.PRICE - a.COST) / a.PRICE) : -1;
      bv = (b.COST && b.PRICE) ? ((b.PRICE - b.COST) / b.PRICE) : -1;
    } else if (sort.key === 'CREATED') {
      av = getProductNewestTimestamp(a as any);
      bv = getProductNewestTimestamp(b as any);
    } else {
      av = a[sort.key] ?? 0; bv = b[sort.key] ?? 0;
    }
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedProducts = useMemo(() => {
    return filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  }, [filtered, currentPage, PAGE_SIZE]);

  const totalInventoryValue = filtered.reduce((sum, p) => sum + (p.STOCK ?? 0) * p.PRICE, 0);
  const totalCostValue = filtered.reduce((sum, p) => sum + (p.STOCK ?? 0) * (p.COST || 0), 0);
  const totalUnits = filtered.reduce((sum, p) => sum + (p.STOCK ?? 0), 0);
  const noImageCount = filtered.filter(p => !p.IMAGEURL).length;
  const lowStockCount = filtered.filter(p => (p.STOCK ?? 0) > 0 && (p.STOCK ?? 0) <= 10).length;
  const outStockCount = filtered.filter(p => (p.STOCK ?? 0) === 0).length;
  const withMargin = filtered.filter(p => p.COST && p.COST > 0 && p.PRICE > 0);
  const avgMargin = withMargin.length > 0
    ? Math.round(withMargin.reduce((sum, p) => sum + ((p.PRICE - (p.COST || 0)) / p.PRICE) * 100, 0) / withMargin.length)
    : null;
  const liveCount = filtered.filter(p => Boolean(getLiveStatus(p))).length;
  const publishedProducts = useMemo(() => {
    return products.filter(p => Boolean((p as any).SHOW_IN_WEB ?? (p as any).show_in_web));
  }, [products]);

  const riskCounts = useMemo(() => {
    let rojo = 0;
    let amarillo = 0;
    let verde = 0;
    for (const p of publishedProducts) {
      const r = getProductRisk({
        stock: p.STOCK ?? 0,
        salesVelocity7d: (p as any).salesVelocity7d || 0,
        maxBatchSize: (p as any).maxBatchSize || 1,
        daysSinceCreated: p.$createdAt
          ? Math.floor((Date.now() - new Date(p.$createdAt).getTime()) / 86400000)
          : 999,
        price: Number(p.CURRENTPRICE ?? p.PRICE ?? 0),
      });
      if (r.level === 'rojo') rojo++;
      else if (r.level === 'amarillo') amarillo++;
      else if (r.level === 'verde') verde++;
    }
    return { rojo, amarillo, verde, all: publishedProducts.length };
  }, [publishedProducts]);
  const activeFiltersCount = [Boolean(search), Boolean(catFilter), Boolean(subCatFilter), noImageOnly, brokenOnly, stockFilter !== 'instock', riskFilter !== 'all'].filter(Boolean).length;

  return (
    <div className="space-y-2 sm:space-y-5 p-0 sm:p-5" style={{ background: '#ffffff', minHeight: '100%', borderRadius: 12 }}>

      {/* ═══════════════════════════════════════════════════════════════
          FULL-PAGE PRODUCT EDITOR (replaces table when modal is active)
         ═══════════════════════════════════════════════════════════════ */}
      {modal && (
        <div className="hidden md:block min-h-[calc(100vh-140px)]">
          {/* AI waiting banner */}
          {aiAutoEnhance && !getModalImageUrls(modal.data)[0] && (
            <div className="mb-4 flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl p-3">
              <Sparkles className="w-5 h-5 text-purple-600 animate-pulse shrink-0" />
              <p className="text-sm text-purple-700 font-medium">Sube una imagen del producto y la IA autocompletará todo automáticamente</p>
            </div>
          )}
          {/* Header bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={closeProductModal} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{modal.mode === 'add' ? 'Nuevo Producto' : 'Editar Producto'}</h1>
                {modal.mode === 'edit' && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-400">ID: {(modal.data as Product).$id}</p>
                    <span className="text-gray-300">•</span>
                    <a
                      href={`/productos/${(modal.data as Product).$id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-900 hover:text-gray-900 hover:underline flex items-center gap-1 font-medium"
                    >
                      <Eye className="w-3.5 h-3.5" /> Ver en tienda
                    </a>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Botones IA inline */}
              <button type="button" onClick={generateAllProductContent} disabled={aiLoading !== null || !editorHasPhoto}
                title={!editorHasPhoto ? 'Primero sube al menos una foto' : 'Generar todo con IA'}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">
                {aiLoading === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span className="hidden lg:inline">{aiLoading === 'all' ? 'Generando...' : 'IA'}</span>
              </button>
              <button type="button" onClick={generateTechnicalTabsOnly} disabled={aiLoading !== null || !editorHasPhoto}
                title={!editorHasPhoto ? 'Primero sube al menos una foto' : 'Generar ficha técnica con IA'}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 disabled:opacity-50">
                {aiLoading === 'tabs' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                <span className="hidden lg:inline">Ficha</span>
              </button>
              <button type="button" onClick={() => aiEnhanceProduct()} disabled={aiLoading !== null || !editorHasPhoto}
                title={!editorHasPhoto ? 'Primero sube al menos una foto' : 'Buscar mejores imágenes con IA'}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 disabled:opacity-50">
                {aiLoading === null ? <ImagePlus className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                <span className="hidden lg:inline">Imágenes</span>
              </button>
              <button type="button" onClick={() => setKeniaOpen(!KeniaOpen)}
                title="Preguntar a Yaxbot"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition ${KeniaOpen ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'}`}>
                <MessageSquare className="w-4 h-4" />
                <span className="hidden lg:inline">{KeniaOpen ? 'Cerrar' : 'Yaxbot'}</span>
              </button>
              {modal.mode === 'edit' && (
                <a
                  href={`/productos/${(modal.data as Product).$id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200"
                  title="Ver detalle del producto en la tienda"
                >
                  <Eye className="w-4 h-4" /> <span className="hidden lg:inline">Ver</span>
                </a>
              )}
              <button onClick={closeProductModal} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={save} disabled={isSaving} className="px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-900 transition disabled:opacity-60 flex items-center gap-2">
                {isSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</> : 'Guardar'}
              </button>
            </div>
          </div>

          <div className="flex gap-6 items-start">
            {/* ══ Columna izquierda fija: fotos + asistente IA ══ */}
            <div className="w-[300px] xl:w-[340px] shrink-0 space-y-4 sticky top-4 self-start">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <label className="block text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-gray-900 text-white text-xs font-bold flex items-center justify-center">1</span>
                  Fotos del producto
                </label>
                <ProductPhotoUploader
                  imageUrls={[modal.data.IMAGEURL || '', modal.data.IMAGEURL2 || '', modal.data.IMAGEURL3 || ''].filter(Boolean).slice(0, 3)}
                  onChange={urls => setModal(m => m ? { ...m, data: { ...m.data, IMAGEURL: urls[0] || '', IMAGEURL2: urls[1] || '', IMAGEURL3: urls[2] || '' } } : m)}
                  pendingFiles={pendingPhotoFiles}
                  onPendingFilesChange={setPendingPhotoFiles}
                  showAiSearch={modal.mode === 'add' && addMode === 'ia'}
                  compact
                />
                <p className="text-[11px] text-gray-400 mt-2">Hasta 3 fotos. La primera es la principal.</p>
              </div>

              {/* Panel IA eliminado — los botones están ahora en la barra superior */}

              {/* Información básica — en columna izquierda solo en modo manual */}
              {addMode === 'manual' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-gray-900 text-white text-xs font-bold flex items-center justify-center">2</span>
                  Información básica
                </h3>
                <div className="space-y-4">
                  {/* Publicar en Tienda Web */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-purple-200 bg-purple-50/60">
                    <div>
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-purple-600" />
                        Publicar en Tienda Web
                      </div>
                      <div className="text-[10px] text-slate-500">Visible para clientes en el catálogo web</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(modal.data.SHOW_IN_WEB ?? modal.data.show_in_web)}
                        onChange={e => {
                          setModal(m => m ? {
                            ...m,
                            data: {
                              ...m.data,
                              SHOW_IN_WEB: e.target.checked,
                              show_in_web: e.target.checked,
                            }
                          } : m);
                        }}
                        className="w-4 h-4 accent-purple-600 cursor-pointer"
                      />
                    </label>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-bold text-purple-700">Nombre del producto <span className="text-red-500">*</span></label>
                      {AI_ENABLED && (
                      <button type="button" onClick={generateTitlesAI} disabled={aiLoading !== null}
                        className="flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900 transition disabled:opacity-50">
                        {aiLoading === 'title' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Sugerir nombres con IA
                      </button>
                      )}
                    </div>
                    <input value={modal.data.NAME || ''} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, NAME: e.target.value } } : m)}
                      className={`w-full px-4 py-2.5 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${modal.data.NAME ? 'border-purple-300 bg-purple-50/30' : 'border-purple-400 bg-purple-50'}`} placeholder="Nombre del producto" />
                    {aiTitles.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {aiTitles.map((t, i) => (
                          <button key={i} type="button" onClick={() => { setModal(m => m ? { ...m, data: { ...m.data, NAME: t } } : m); setAiTitles([]); }}
                            className="text-xs px-2.5 py-1 bg-purple-50 text-purple-800 rounded-lg hover:bg-purple-100 border border-purple-100 transition-colors truncate max-w-full">
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-gray-500">Descripción <span className="text-gray-400 text-xs">(opcional)</span></label>
                      {AI_ENABLED && (
                      <button type="button" onClick={generateDescriptionAI} disabled={aiLoading !== null}
                        className="flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900 transition disabled:opacity-50">
                        {aiLoading === 'desc' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Generar con IA
                      </button>
                      )}
                    </div>
                    <textarea value={modal.data.DESCRIPTION || ''} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, DESCRIPTION: e.target.value } } : m)}
                      rows={5} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none" placeholder="Describe tu producto..." />
                  </div>
                </div>
              </div>
              )}
            </div>

            {/* ══ Columna principal: secciones numeradas ══ */}
            <div className="flex-1 min-w-0 space-y-6">
              <div className="space-y-6">
              {/* 2. Precios e Inventario (lo primero que define el humano) */}
              <div className="hidden">
                <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-gray-900 text-white text-xs font-bold flex items-center justify-center">{addMode === 'ia' ? '2' : '3'}</span> Precios e Inventario
                </h3>
                {/* ── Costo + Margen → Precio ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Costo (lo que pagas) <span className="text-gray-400">(opcional)</span></label>
                    <input type="number" value={modal.data.COST || ''} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ''; }} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, COST: Number(e.target.value) || 0 } } : m)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Margen de ganancia (%) <span className="text-gray-400">(opcional)</span></label>
                    <div className="flex items-center gap-2">
                      <div className="relative w-24">
                        <input
                          type="number" inputMode="numeric"
                          value={desktopMarginPct}
                          placeholder="Ej: 100"
                          onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ''; }}
                          onChange={e => {
                            setDesktopMarginPct(e.target.value);
                            const pct = Number(e.target.value);
                            const cost = Number(modal.data.COST) || 0;
                            if (pct !== 0 && cost > 0) {
                              const price = Math.round(cost * (1 + pct / 100));
                              setModal(m => m ? { ...m, data: { ...m.data, PRICE: price, WHOLESALEPRICE: price } } : m);
                            }
                          }}
                          className="w-full px-2 py-2 pr-6 border border-emerald-300 rounded-xl text-sm font-bold text-emerald-700 bg-emerald-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold text-emerald-600 pointer-events-none">%</span>
                      </div>
                      {modal.data.COST && modal.data.PRICE && (
                        <span className="text-xs font-semibold text-emerald-600">
                          Ganancia: ${(Number(modal.data.PRICE) - Number(modal.data.COST)).toLocaleString('es-CL')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-purple-700 mb-1">Precio venta (CLP) <span className="text-red-500">*</span></label>
                    <PriceInput value={modal.data.PRICE || ''} onChange={v => setModal(m => m ? { ...m, data: { ...m.data, PRICE: v, WHOLESALEPRICE: v } } : m)}
                      placeholder="$0"
                      className={`w-full px-3 py-2 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${modal.data.PRICE ? 'border-purple-300 bg-purple-50/30' : 'border-purple-400 bg-purple-50'}`} />
                    {(() => {
                      const price = Number(modal.data.PRICE) || 0;
                      const cost = Number(modal.data.COST) || 0;
                      if (!price || !cost) return null;
                      const margin = Math.round(((price - cost) / cost) * 100);
                      return (
                        <p className={`text-[10px] mt-1 font-medium ${margin >= 40 ? 'text-emerald-600' : margin >= 20 ? 'text-amber-600' : 'text-red-500'}`}>
                          Margen actual: {margin}%
                        </p>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center justify-between">
                      <span>Stock</span>
                      <button
                        type="button"
                        onClick={() => setModal(m => m ? { ...m, data: { ...m.data, STOCK: 99999 } } : m)}
                        className="text-[10px] text-gray-900 hover:text-indigo-800 font-semibold underline"
                      >
                        Poner Ilimitado (99999)
                      </button>
                    </label>
                    <input type="number" value={modal.data.STOCK || ''} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ''; }} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, STOCK: Number(e.target.value) || 0 } } : m)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800" />
                    {Number(modal.data.STOCK) === 99999 && (
                      <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">✓ Stock Ilimitado (vender sin stock)</p>
                    )}
                    {Number(modal.data.STOCK) === 0 && (
                      <p className="text-xs text-indigo-500 mt-1 flex items-center gap-1">Se guardara como Ilimitado automaticamente</p>
                    )}
                    {Number(modal.data.STOCK) > 0 && Number(modal.data.STOCK) <= 5 && (
                      <p className="text-xs text-amber-500 mt-1">⚠ Stock bajo ({modal.data.STOCK} un.)</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Organización y Detalles */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-gray-900 text-white text-xs font-bold flex items-center justify-center">{addMode === 'ia' ? '3' : '4'}</span> Organización y Detalles
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-purple-700 mb-1">Categoría <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select value={modal.data.CATEGORYID || ''} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, CATEGORYID: e.target.value, SUBCATEGORYID: '', SUBSUBCATEGORYID: '' } } : m)}
                        className={`w-full appearance-none px-3 py-2 pr-8 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${modal.data.CATEGORYID ? 'border-purple-300 bg-purple-50/30' : 'border-purple-400 bg-purple-50'}`}>
                        <option value="">Sin categoría</option>
                        {categories.map(c => <option key={c.$id} value={c.$id}>{c.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Ej: Bebidas, Lácteos, Limpieza. Agrupa tus productos.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-purple-700 mb-1">Subcategoría <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select value={modal.data.SUBCATEGORYID || ''} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, SUBCATEGORYID: e.target.value, SUBSUBCATEGORYID: '' } } : m)}
                        disabled={!modal.data.CATEGORYID}
                        className={`w-full appearance-none px-3 py-2 pr-8 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:bg-gray-100 ${modal.data.SUBCATEGORYID ? 'border-purple-300 bg-purple-50/30' : 'border-purple-400 bg-purple-50'}`}>
                        <option value="">Ninguna</option>
                        {subcategories.filter(s => s.categoryId === modal.data.CATEGORYID && !s.parentSubcategoryId).map(s => <option key={s.$id} value={s.$id}>{s.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Ej: Jugos, Yogures, Desinfectantes. Subgrupo dentro de la categoría.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-purple-700 mb-1">SKU <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      <input type="text" value={modal.data._sku ?? ''}
                        onChange={e => setModal(m => m ? { ...m, data: { ...m.data, _sku: e.target.value } } : m)}
                        placeholder="Ej: BEB-001"
                        className={`flex-1 px-3 py-2 border-2 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 ${modal.data._sku ? 'border-purple-300 bg-purple-50/30' : 'border-purple-400 bg-purple-50'}`} />
                      <button type="button" onClick={generateConsecutiveSku}
                        title="Generar SKU consecutivo automático"
                        className="px-3 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition whitespace-nowrap flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" /> Auto
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Código interno tuyo para identificar el producto.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Proveedor <span className="text-gray-400">(opcional)</span></label>
                    <input type="text" value={modal.data.BRAND ?? modal.data.SUPPLIER ?? ''}
                      onChange={e => setModal(m => m ? { ...m, data: { ...m.data, BRAND: e.target.value, SUPPLIER: e.target.value } } : m)}
                      placeholder="Ej: DON LEE, YUANDA, TASBEL, PARCERO"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 placeholder-gray-500" />
                    <p className="text-[10px] text-gray-400 mt-1">Proveedor o importadora mayorista del producto.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Cantidad por embalaje <span className="text-gray-400">(opcional)</span></label>
                    <input type="text" value={modal.data.QUANTITY ?? modal.data.PACKAGE_QTY ?? ''}
                      onChange={e => setModal(m => m ? { ...m, data: { ...m.data, QUANTITY: e.target.value, PACKAGE_QTY: e.target.value } } : m)}
                      placeholder="Ej: 150PCS, 500PCS, 24 unid"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 placeholder-gray-500" />
                    <p className="text-[10px] text-gray-400 mt-1">Unidades o piezas que contiene la caja o bulto de embalaje.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Código de barras <span className="text-gray-400">(opcional)</span></label>
                    <input type="text" value={modal.data._barcode ?? ''}
                      onChange={e => setModal(m => m ? { ...m, data: { ...m.data, _barcode: e.target.value } } : m)}
                      placeholder="Ej: 7801234567890"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-800 placeholder-gray-500" />
                    <p className="text-[10px] text-gray-400 mt-1">El código de barras del envase (EAN/UPC). Opcional.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Cód. Caja / Góndola <span className="text-gray-400">(opcional)</span></label>
                    <div className="flex gap-2">
                      <input type="text" value={modal.data.BOX_CODE ?? ''}
                        onChange={e => setModal(m => m ? { ...m, data: { ...m.data, BOX_CODE: e.target.value } } : m)}
                        placeholder="Ej: 8214, 515, K3X"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-800 placeholder-gray-500" />
                      <input type="number" value={(modal.data as Product).section ?? ''}
                        onChange={e => setModal(m => m ? { ...m, data: { ...m.data, section: e.target.value ? Number(e.target.value) : undefined } } : m)}
                        placeholder="Góndola #"
                        title="Número de pasillo o góndola"
                        className="w-24 px-2 py-2 border border-gray-200 rounded-xl text-xs text-center focus:outline-none focus:ring-2 focus:ring-gray-800 placeholder-gray-400" />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Código de caja mayorista y/o número de pasillo en bodega.</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tags <span className="text-gray-400">(opcional, separados por coma)</span></label>
                    <input type="text" value={Array.isArray(modal.data.TAGS) ? modal.data.TAGS.join(', ') : (modal.data.TAGS || '')} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, TAGS: e.target.value } } : m)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 placeholder-gray-500" placeholder="Ej: oferta, nuevo, importado" />
                    <p className="text-[10px] text-gray-400 mt-1">Palabras para buscar y filtrar productos en el panel admin. Opcional.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Etiquetas <span className="text-gray-400">(opcional, separadas por coma)</span></label>
                    <input type="text" value={Array.isArray(modal.data.FEATURES) ? modal.data.FEATURES.join(', ') : (modal.data.FEATURES || '')} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, FEATURES: e.target.value } } : m)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 placeholder-gray-500" placeholder="Ej: sin gluten, orgánico, vegano" />
                    <p className="text-[10px] text-gray-400 mt-1">Sellos que se ven en la tienda. Ej: "Sin gluten", "Orgánico". Opcional.</p>
                  </div>
                </div>
              </div>

              {/* Cantidad por paquete y embalaje (con precios especiales integrados) */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-gray-900 text-white text-xs font-bold flex items-center justify-center">{addMode === 'ia' ? '4' : '5'}</span>
                  Cantidad por paquete y embalaje
                </h3>
                <p className="text-[11px] text-gray-400 mb-4">Opcional. Define cuántas unidades trae cada formato y su precio especial.</p>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {/* ── Paquete ── */}
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm font-bold text-gray-900 mb-1">Unidades por paquete</p>
                    <p className="text-[11px] text-gray-500 mb-3">Cuántas unidades trae un paquete</p>
                    <input type="number" min="0" value={modal.data.PACKQTY || ''} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ''; }} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, PACKQTY: Number(e.target.value) || 0 } } : m)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="Ej: 12" />
                    {modal.data.PACKQTY && modal.data.PACKQTY > 1 ? (
                      <p className="text-[10px] text-emerald-600 mt-1">📦 Paquete de {modal.data.PACKQTY} unidades</p>
                    ) : (
                      <p className="text-[10px] text-gray-400 mt-1">Vacío = venta por unidad suelta</p>
                    )}
                    {/* Precio especial por paquete — dentro del mismo cuadro */}
                    {modal.data.PACKQTY && modal.data.PACKQTY > 1 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-emerald-700">Precio especial por paquete</span>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={!!(modal.data.PACKPRICE && modal.data.PACKPRICE > 0)}
                              onChange={e => {
                                if (!e.target.checked) {
                                  setModal(m => m ? { ...m, data: { ...m.data, PACKPRICE: 0 } } : m);
                                } else {
                                  setModal(m => m ? { ...m, data: { ...m.data, PACKPRICE: Math.round((modal.data.PRICE || 0) * (modal.data.PACKQTY || 1) * 0.95) } } : m);
                                }
                              }}
                              className="w-3.5 h-3.5 accent-emerald-600" />
                            <span className="text-[10px] text-gray-500">Activar</span>
                          </label>
                        </div>
                        {modal.data.PACKPRICE && modal.data.PACKPRICE > 0 ? (
                          <>
                            <label className="block text-[10px] text-gray-500 mb-1">Ref: {fmt(modal.data.PRICE || 0)} c/u = {fmt((modal.data.PRICE || 0) * (modal.data.PACKQTY || 1))} por paquete</label>
                            <PriceInput
                              value={modal.data.PACKPRICE || ''}
                              onChange={v => {
                                const unitPrice = (modal.data.PRICE || 0);
                                const packQty = (modal.data.PACKQTY || 1);
                                const refTotal = unitPrice * packQty;
                                if (refTotal > 0 && v > 0) {
                                  const diff = Math.abs(v - refTotal) / refTotal;
                                  if (diff > 0.5) {
                                    if (!confirm(`⚠️ El precio (${fmt(v)}) es muy diferente al de referencia (${fmt(refTotal)}). ¿Estás seguro?`)) return;
                                  }
                                }
                                setModal(m => m ? { ...m, data: { ...m.data, PACKPRICE: v } } : m);
                              }}
                              placeholder="$0"
                              className="w-full px-3 py-2 border border-emerald-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                            <p className="text-[10px] text-emerald-700 mt-1">
                              📦 {fmt(modal.data.PACKPRICE)} por paquete ({fmt(Math.round(Number(modal.data.PACKPRICE) / Number(modal.data.PACKQTY)))} c/u)
                              {(() => {
                                const refUnit = (modal.data.PRICE || 0);
                                const packUnit = Math.round(Number(modal.data.PACKPRICE) / Number(modal.data.PACKQTY || 1));
                                if (refUnit > 0 && packUnit < refUnit) {
                                  return ` · Ahorra ${Math.round((1 - packUnit / refUnit) * 100)}%`;
                                }
                                return '';
                              })()}
                            </p>
                          </>
                        ) : (
                          <p className="text-[10px] text-gray-400">Sin precio especial = precio normal × unidades</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Embalaje ── */}
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm font-bold text-gray-900 mb-1">Unidades por embalaje</p>
                    <p className="text-[11px] text-gray-500 mb-3">Cuántas unidades trae el embalaje (para supermercado)</p>
                    <input type="number" min="0" value={modal.data.EMBALAJEQTY || ''} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ''; }} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, EMBALAJEQTY: Number(e.target.value) || 0 } } : m)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="Ej: 36" />
                    {modal.data.EMBALAJEQTY && modal.data.EMBALAJEQTY > 0 ? (
                      <p className="text-[10px] text-blue-600 mt-1">📦 Embalaje de {modal.data.EMBALAJEQTY} unidades</p>
                    ) : (
                      <p className="text-[10px] text-gray-400 mt-1">Vacío = no muestra embalaje</p>
                    )}
                    {/* Precio especial por embalaje — dentro del mismo cuadro */}
                    {modal.data.EMBALAJEQTY && modal.data.EMBALAJEQTY > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-blue-700">Precio especial por embalaje</span>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={!!(modal.data.EMBALAJEPRICE && modal.data.EMBALAJEPRICE > 0)}
                              onChange={e => {
                                if (!e.target.checked) {
                                  setModal(m => m ? { ...m, data: { ...m.data, EMBALAJEPRICE: 0 } } : m);
                                } else {
                                  setModal(m => m ? { ...m, data: { ...m.data, EMBALAJEPRICE: Math.round((modal.data.PRICE || 0) * (modal.data.EMBALAJEQTY || 1) * 0.9) } } : m);
                                }
                              }}
                              className="w-3.5 h-3.5 accent-blue-600" />
                            <span className="text-[10px] text-gray-500">Activar</span>
                          </label>
                        </div>
                        {modal.data.EMBALAJEPRICE && modal.data.EMBALAJEPRICE > 0 ? (
                          <>
                            <label className="block text-[10px] text-gray-500 mb-1">Ref: {fmt(modal.data.PRICE || 0)} c/u = {fmt((modal.data.PRICE || 0) * (modal.data.EMBALAJEQTY || 1))} por embalaje</label>
                            <PriceInput
                              value={modal.data.EMBALAJEPRICE || ''}
                              onChange={v => {
                                const unitPrice = (modal.data.PRICE || 0);
                                const embQty = (modal.data.EMBALAJEQTY || 1);
                                const refTotal = unitPrice * embQty;
                                if (refTotal > 0 && v > 0) {
                                  const diff = Math.abs(v - refTotal) / refTotal;
                                  if (diff > 0.5) {
                                    if (!confirm(`⚠️ El precio (${fmt(v)}) es muy diferente al de referencia (${fmt(refTotal)}). ¿Estás seguro?`)) return;
                                  }
                                }
                                setModal(m => m ? { ...m, data: { ...m.data, EMBALAJEPRICE: v } } : m);
                              }}
                              placeholder="$0"
                              className="w-full px-3 py-2 border border-blue-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <p className="text-[10px] text-blue-700 mt-1">
                              📦 {fmt(modal.data.EMBALAJEPRICE)} por embalaje ({fmt(Math.round(Number(modal.data.EMBALAJEPRICE) / Number(modal.data.EMBALAJEQTY)))} c/u)
                              {(() => {
                                const refUnit = (modal.data.PRICE || 0);
                                const embUnit = Math.round(Number(modal.data.EMBALAJEPRICE) / Number(modal.data.EMBALAJEQTY || 1));
                                if (refUnit > 0 && embUnit < refUnit) {
                                  return ` · Ahorra ${Math.round((1 - embUnit / refUnit) * 100)}%`;
                                }
                                return '';
                              })()}
                            </p>
                          </>
                        ) : (
                          <p className="text-[10px] text-gray-400">Sin precio especial = precio normal × unidades</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. Promociones por cantidad exacta */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-gray-900 text-white text-xs font-bold flex items-center justify-center">{addMode === 'ia' ? '5' : '6'}</span>
                  Promociones
                  <span className="text-[10px] font-normal text-gray-400">opcional</span>
                </h3>
                <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-900">Promoción por cantidad exacta</p>
                      <p className="text-[11px] text-gray-500">Ej: "2 por $5.000". Si compra 3, solo los pares de 2 tienen el precio promo.</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!(modal.data.PROMO_QTY && modal.data.PROMO_QTY > 0)}
                        onChange={e => {
                          if (!e.target.checked) {
                            setModal(m => m ? { ...m, data: { ...m.data, PROMO_QTY: 0, PROMO_PRICE: 0 } } : m);
                          } else {
                            setModal(m => m ? { ...m, data: { ...m.data, PROMO_QTY: 2, PROMO_PRICE: Math.round((modal.data.PRICE || 0) * 2 * 0.9) } } : m);
                          }
                        }}
                        className="w-4 h-4 accent-gray-900" />
                      <span className="text-xs font-semibold text-gray-700">Activar</span>
                    </label>
                  </div>
                  {modal.data.PROMO_QTY && modal.data.PROMO_QTY > 0 && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad exacta</label>
                          <input type="number" min="2" value={modal.data.PROMO_QTY || ''} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ''; }} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, PROMO_QTY: Number(e.target.value) || 0 } } : m)}
                            className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Ej: 2" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Precio por esa cantidad</label>
                          <PriceInput value={modal.data.PROMO_PRICE || ''} onChange={v => setModal(m => m ? { ...m, data: { ...m.data, PROMO_PRICE: v } } : m)}
                            placeholder="$0"
                            className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-700 bg-orange-100 rounded-lg px-3 py-2">
                        {(() => {
                          const qty = Number(modal.data.PROMO_QTY) || 0;
                          const promoPrice = Number(modal.data.PROMO_PRICE) || 0;
                          const unitPrice = qty > 0 ? Math.round(promoPrice / qty) : 0;
                          const refPrice = Number(modal.data.PRICE) || 0;
                          const refTotal = refPrice * qty;
                          const saving = refTotal > 0 ? Math.round((1 - promoPrice / refTotal) * 100) : 0;
                          return (
                            <>
                              🎯 <strong>{qty} por {fmt(promoPrice)}</strong> ({fmt(unitPrice)} c/u)
                              {saving > 0 && <span className="text-orange-700"> · Ahorra {saving}% vs. suelto</span>}
                              <br />
                              <span className="text-gray-500">Si compra 3: {qty} a {fmt(promoPrice)} + 1 a {fmt(refPrice)} = {fmt(promoPrice + refPrice)}</span>
                            </>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 5. Precio mayorista (opcional) */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-gray-900 text-white text-xs font-bold flex items-center justify-center">{addMode === 'ia' ? '6' : '7'}</span>
                  Precio mayorista
                  <span className="text-[10px] font-normal text-gray-400">opcional</span>
                </h3>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-900">Precio especial al comprar X+ unidades</p>
                      <p className="text-[11px] text-gray-500">Ofrece un precio menor cuando compran cierta cantidad</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!(modal.data.WHOLESALEMINQUANTITY && modal.data.WHOLESALEMINQUANTITY > 0) || !!(modal.data.PACK_MIN_PACKS && modal.data.PACK_DISCOUNT_PCT)}
                        onChange={e => {
                          if (!e.target.checked) {
                            setModal(m => m ? { ...m, data: { ...m.data, WHOLESALEMINQUANTITY: 0, WHOLESALEPRICE: 0, PACK_MIN_PACKS: 0, PACK_DISCOUNT_PCT: 0 } } : m);
                          } else {
                            setModal(m => m ? { ...m, data: { ...m.data, WHOLESALEMINQUANTITY: m.data.WHOLESALEMINQUANTITY || 5 } } : m);
                          }
                        }}
                        className="w-4 h-4 accent-gray-900" />
                      <span className="text-xs font-semibold text-gray-700">Activar</span>
                    </label>
                  </div>
                  {((modal.data.WHOLESALEMINQUANTITY && modal.data.WHOLESALEMINQUANTITY > 0) || (modal.data.PACK_MIN_PACKS && modal.data.PACK_DISCOUNT_PCT)) && (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad mínima</label>
                          <input type="number" min="2" value={modal.data.WHOLESALEMINQUANTITY || modal.data.PACK_MIN_PACKS || ''} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ''; }} onChange={e => {
                            const v = Number(e.target.value) || 0;
                            setModal(m => m ? { ...m, data: { ...m.data, WHOLESALEMINQUANTITY: v, PACK_MIN_PACKS: v } } : m);
                          }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="Ej: 5" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de descuento</label>
                          <select value={(modal.data.PACK_DISCOUNT_PCT && modal.data.PACK_DISCOUNT_PCT > 0) ? 'pct' : 'fixed'}
                            onChange={e => {
                              if (e.target.value === 'pct') {
                                setModal(m => m ? { ...m, data: { ...m.data, WHOLESALEPRICE: 0, PACK_DISCOUNT_PCT: m.data.PACK_DISCOUNT_PCT || 10 } } : m);
                              } else {
                                setModal(m => m ? { ...m, data: { ...m.data, PACK_DISCOUNT_PCT: 0, WHOLESALEPRICE: m.data.WHOLESALEPRICE || Math.round((modal.data.PRICE || 0) * 0.9) } } : m);
                              }
                            }}
                            className="w-full appearance-none px-3 py-2 pr-8 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                            <option value="fixed">Precio fijo</option>
                            <option value="pct">% Descuento</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {(modal.data.PACK_DISCOUNT_PCT && modal.data.PACK_DISCOUNT_PCT > 0) ? '% de descuento' : 'Precio unitario'}
                          </label>
                          {(modal.data.PACK_DISCOUNT_PCT && modal.data.PACK_DISCOUNT_PCT > 0) ? (
                            <input type="number" min="1" max="90" value={modal.data.PACK_DISCOUNT_PCT || ''} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ''; }} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, PACK_DISCOUNT_PCT: Number(e.target.value) || 0 } } : m)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="Ej: 10" />
                          ) : (
                            <PriceInput value={modal.data.WHOLESALEPRICE || ''} onChange={v => setModal(m => m ? { ...m, data: { ...m.data, WHOLESALEPRICE: v } } : m)}
                              placeholder="$0"
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-700 bg-gray-100 rounded-lg px-3 py-2">
                        {(modal.data.PACK_DISCOUNT_PCT && modal.data.PACK_DISCOUNT_PCT > 0) ? (
                          <>Compra <strong>{modal.data.WHOLESALEMINQUANTITY || modal.data.PACK_MIN_PACKS}+</strong> → <strong>{modal.data.PACK_DISCOUNT_PCT}% off</strong> ({fmt(Math.round((modal.data.PRICE || 0) * (1 - (modal.data.PACK_DISCOUNT_PCT || 0) / 100)))} c/u)</>
                        ) : (
                          <>Compra <strong>{modal.data.WHOLESALEMINQUANTITY}+</strong> → <strong>{fmt(modal.data.WHOLESALEPRICE || 0)} c/u</strong></>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Información básica — en columna principal solo en modo IA */}
              {addMode === 'ia' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-gray-900 text-white text-xs font-bold flex items-center justify-center">7</span>
                  Información básica
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-bold text-purple-700">Nombre del producto <span className="text-red-500">*</span></label>
                      {AI_ENABLED && (
                      <button type="button" onClick={generateTitlesAI} disabled={aiLoading !== null}
                        className="flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900 transition disabled:opacity-50">
                        {aiLoading === 'title' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Sugerir nombres con IA
                      </button>
                      )}
                    </div>
                    <input value={modal.data.NAME || ''} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, NAME: e.target.value } } : m)}
                      className={`w-full px-4 py-2.5 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${modal.data.NAME ? 'border-purple-300 bg-purple-50/30' : 'border-purple-400 bg-purple-50'}`} placeholder="Nombre del producto" />
                    {aiTitles.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {aiTitles.map((t, i) => (
                          <button key={i} type="button" onClick={() => { setModal(m => m ? { ...m, data: { ...m.data, NAME: t } } : m); setAiTitles([]); }}
                            className="text-xs px-2.5 py-1 bg-purple-50 text-purple-800 rounded-lg hover:bg-purple-100 border border-purple-100 transition-colors truncate max-w-full">
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-gray-500">Descripción <span className="text-gray-400 text-xs">(opcional)</span></label>
                      {AI_ENABLED && (
                      <button type="button" onClick={generateDescriptionAI} disabled={aiLoading !== null}
                        className="flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900 transition disabled:opacity-50">
                        {aiLoading === 'desc' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Generar con IA
                      </button>
                      )}
                    </div>
                    <textarea value={modal.data.DESCRIPTION || ''} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, DESCRIPTION: e.target.value } } : m)}
                      rows={5} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none" placeholder="Describe tu producto..." />
                  </div>
                </div>
              </div>
              )}

              {/* 5. Custom specs/info tabs — colapsable */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <button type="button" onClick={() => setTechTabsOpen(!(techTabsOpen ?? !!(modal.data._details || modal.data._usage || modal.data._ingredients)))}
                  className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-gray-900 text-white text-xs font-bold flex items-center justify-center">8</span>
                    Ficha Técnica (pestañas de información)
                    {(modal.data._details || modal.data._usage || modal.data._ingredients) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">con contenido</span>
                    )}
                  </h3>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${(techTabsOpen ?? !!(modal.data._details || modal.data._usage || modal.data._ingredients)) ? 'rotate-180' : ''}`} />
                </button>
                {(techTabsOpen ?? !!(modal.data._details || modal.data._usage || modal.data._ingredients)) && (
                  <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-4">
                    <p className="text-xs text-gray-500">
                      Completa estos campos para mostrar pestañas dedicadas debajo de la descripción en el detalle de producto de Plantilla 5. Si los dejas vacíos, no se mostrarán.
                    </p>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-gray-400" /> Detalles del Producto (Especificaciones / Características)
                      </label>
                      <textarea
                        rows={3}
                        value={modal.data._details || ''}
                        onChange={e => setModal(m => m ? { ...m, data: { ...m.data, _details: e.target.value } } : m)}
                        placeholder="Ej: Material: 100% Algodón Orgánico&#10;Dimensiones: 15cm x 10cm&#10;Peso: 250g"
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-gray-400" /> Modo de Uso (Instrucciones)
                      </label>
                      <textarea
                        rows={3}
                        value={modal.data._usage || ''}
                        onChange={e => setModal(m => m ? { ...m, data: { ...m.data, _usage: e.target.value } } : m)}
                        placeholder="Ej: Aplicar sobre la piel limpia por la mañana y por la noche. Masajear suavemente hasta su completa absorción."
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-gray-400" /> Ingredientes (Composición / Tabla Nutricional)
                      </label>
                      <textarea
                        rows={3}
                        value={modal.data._ingredients || ''}
                        onChange={e => setModal(m => m ? { ...m, data: { ...m.data, _ingredients: e.target.value } } : m)}
                        placeholder="Ej: Aqua, Glycerin, Niacinamide, Sodium Hyaluronate, Phenoxyethanol..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none font-sans"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Opciones avanzadas — colapsable */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <button type="button" onClick={() => setAdvancedOpen(v => !v)}
                  className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-gray-900 text-white text-xs font-bold flex items-center justify-center">9</span>
                    Opciones avanzadas
                    {(modal.data.CURRENTPRICE || modal.data.DISABLE_DISCOUNTS) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">activas</span>
                    )}
                  </h3>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                </button>
                {advancedOpen && (
                  <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-4">
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-red-600 mb-1">Precio oferta (CURRENTPRICE)</label>
                        <input type="number" value={modal.data.CURRENTPRICE || ''} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ''; }} onChange={e => setModal(m => m ? { ...m, data: { ...m.data, CURRENTPRICE: Number(e.target.value) || 0 } } : m)}
                          placeholder="Vacío = sin oferta"
                          className="w-full px-3 py-2 border border-red-200 bg-red-50/40 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                        <p className="text-[10px] text-gray-400 mt-1">Si es menor que el precio de venta, se muestra como oferta en la tienda.</p>
                      </div>
                    </div>

                    <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition">
                      <input type="checkbox" checked={!!modal.data.DISABLE_DISCOUNTS}
                        onChange={e => setModal(m => m ? { ...m, data: { ...m.data, DISABLE_DISCOUNTS: e.target.checked } } : m)}
                        className="w-4 h-4 accent-gray-900" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">Desactivar descuentos para este producto</p>
                        <p className="text-[11px] text-gray-400">No se le aplicarán cupones ni descuentos automáticos.</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>
              </div>
            </div>

            {/* Yaxbot side panel */}
            {KeniaOpen && (
              <div className="w-[360px] shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center text-white text-xs font-bold">Y</div>
                    <span className="text-sm font-semibold text-gray-800">Yaxbot</span>
                    <span className="text-[10px] text-gray-400">para este producto</span>
                  </div>
                  <button onClick={() => setKeniaOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {KeniaMessages.length === 0 && (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 mx-auto rounded-full bg-gray-50 flex items-center justify-center mb-3">
                        <MessageSquare className="w-6 h-6 text-gray-800" />
                      </div>
                      <p className="text-sm text-gray-500">Pregúntale algo sobre este producto</p>
                      <p className="text-xs text-gray-400 mt-1">Yaxbot ya sabe qué producto estás editando</p>
                      <div className="mt-4 space-y-2">
                        {['Mejora la descripción', 'Sugiere un precio competitivo', 'Genera tags para SEO'].map(s => (
                          <button key={s} onClick={() => { setKeniaInput(s); }} className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-50 text-gray-600 hover:text-gray-800 transition">
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {KeniaMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${msg.role === 'user' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800'}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {KeniaLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 px-3 py-2 rounded-xl text-sm text-gray-500 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Pensando...
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-3 border-t border-gray-100">
                  <div className="flex gap-2">
                    <input type="file" id="Kenia-file-input" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setKeniaLoading(true);
                      try {
                        const formData = new FormData();
                        formData.append('file', file);
                        if (modal?.data?.$id) formData.append('productId', (modal.data as Product).$id);
                        formData.append('imageField', 'IMAGEURL');
                        const res = await fetch('/api/products/upload-image', { method: 'POST', body: formData });
                        const data = await res.json();
                        if (data.success) {
                          setKeniaMessages(prev => [...prev, { role: 'user', content: '📷 Imagen enviada' }, { role: 'assistant', content: '✅ Imagen subida y asignada al producto.' }]);
                          if (modal?.data) setModal(m => m ? { ...m, data: { ...m.data, IMAGEURL: data.imageUrl } } : m);
                          load();
                        } else {
                          setKeniaMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${data.error}` }]);
                        }
                      } catch { setKeniaMessages(prev => [...prev, { role: 'assistant', content: '❌ Error al subir imagen.' }]); }
                      finally { setKeniaLoading(false); (e.target as HTMLInputElement).value = ''; }
                    }} />
                    <button onClick={() => document.getElementById('Kenia-file-input')?.click()} disabled={KeniaLoading}
                      className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition disabled:opacity-50" title="Subir imagen">
                      <ImagePlus className="w-4 h-4" />
                    </button>
                    <input value={KeniaInput} onChange={e => setKeniaInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendKeniaMessage(); } }}
                      placeholder="Escribe tu pregunta..."
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800" />
                    <button onClick={sendKeniaMessage} disabled={KeniaLoading || !KeniaInput.trim()}
                      className="p-2 rounded-xl bg-gray-900 text-white hover:bg-gray-800 transition disabled:opacity-50">
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ MOBILE PRODUCT EDITOR (wizard, solo < md) ═══ */}
      {modal && (
        <MobileProductEditor
          key={(modal.data as Product).$id || 'nuevo'}
          modal={modal}
          setModal={setModal}
          onClose={closeProductModal}
          onSave={save}
          isSaving={isSaving}
          categories={categories}
          subcategories={subcategories}
          aiLoading={aiLoading}
          setAiLoading={setAiLoading}
          aiTitles={aiTitles}
          setAiTitles={setAiTitles}
          onGenerateAll={generateAllProductContent}
          onGenerateTabs={generateTechnicalTabsOnly}
          aiAutoEnhance={aiAutoEnhance}
          addMode={addMode}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MODAL DE SELECCIÓN: Agregar manualmente o con IA (solo PC)
         ═══════════════════════════════════════════════════════════════ */}
      {showAddChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddChoice(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Agregar producto</h2>
            <p className="text-sm text-gray-500 mb-5">Elige cómo quieres crear el producto</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={openAddManual}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Plus className="w-6 h-6 text-gray-700" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Agregar manualmente</p>
                  <p className="text-xs text-gray-500 mt-0.5">Llena todos los campos tú mismo</p>
                </div>
              </button>
              <button
                onClick={() => { setShowAddChoice(false); setAddMode('ia'); setModal({ mode: 'add', data: { ...EMPTY, _barcode: '', _sku: '', _details: '', _usage: '', _ingredients: '' } }); setAiAutoEnhance(true); }}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-gray-200 hover:border-purple-500 hover:bg-purple-50 transition text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Agregar con IA</p>
                  <p className="text-xs text-gray-500 mt-0.5">Sube una foto y la IA autocompleta todo</p>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowAddChoice(false)}
              className="mt-4 w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          WIZARD IA: Paso 1 precios, Paso 2 imágenes (solo PC)
         ═══════════════════════════════════════════════════════════════ */}
      {aiWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAiWizard(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            {/* Progress indicator */}
            <div className="flex items-center gap-2 mb-5">
              <div className={`flex items-center gap-2 ${aiWizard.step === 'prices' ? 'text-purple-600' : 'text-gray-400'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${aiWizard.step === 'prices' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
                <span className="text-sm font-medium">Precios</span>
              </div>
              <div className="flex-1 h-0.5 bg-gray-200 rounded" />
              <div className={`flex items-center gap-2 ${aiWizard.step === 'images' ? 'text-purple-600' : 'text-gray-400'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${aiWizard.step === 'images' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
                <span className="text-sm font-medium">Imágenes</span>
              </div>
            </div>

            {aiWizard.step === 'prices' && (
              <>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Precios del producto</h2>
                <p className="text-sm text-gray-500 mb-5">Ingresa los precios básicos. La IA usará estos datos.</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Costo (lo que pagas) <span className="text-red-500">*</span></label>
                    <input type="number" placeholder="Ej: 5000" value={aiWizard.cost || ''} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ''; }}
                      onChange={e => {
                        const cost = Number(e.target.value) || 0;
                        setAiWizard(w => {
                          if (!w) return w;
                          const updated = { ...w, cost };
                          if (w.marginPct && cost > 0) {
                            const pct = Number(w.marginPct);
                            updated.price = Math.round(cost * (1 + pct / 100));
                          }
                          return updated;
                        });
                      }}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Margen de ganancia (%) <span className="text-gray-400">(opcional)</span></label>
                    <div className="flex items-center gap-2">
                      <input type="number" inputMode="numeric" placeholder="Ej: 100" value={aiWizard.marginPct}
                        onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ''; }}
                        onChange={e => {
                          const pct = Number(e.target.value);
                          setAiWizard(w => {
                            if (!w) return w;
                            const cost = w.cost;
                            const updated = { ...w, marginPct: e.target.value };
                            if (pct !== 0 && cost > 0) {
                              updated.price = Math.round(cost * (1 + pct / 100));
                            }
                            return updated;
                          });
                        }}
                        className="w-24 px-2 py-2 border border-emerald-300 rounded-xl text-sm font-bold text-emerald-700 bg-emerald-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                      {aiWizard.cost > 0 && aiWizard.price > 0 && (
                        <span className="text-xs font-semibold text-emerald-600">
                          Ganancia: ${(aiWizard.price - aiWizard.cost).toLocaleString('es-CL')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Precio de venta (CLP) <span className="text-red-500">*</span></label>
                    <input type="number" placeholder="Ej: 10000" value={aiWizard.price || ''} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ''; }}
                      onChange={e => setAiWizard(w => w ? { ...w, price: Number(e.target.value) || 0 } : w)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button onClick={() => setAiWizard(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancelar</button>
                  <button onClick={aiWizardContinue} disabled={!aiWizard.cost || !aiWizard.price} className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50">Continuar</button>
                </div>
              </>
            )}

            {aiWizard.step === 'images' && (
              <>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Imágenes del producto</h2>
                <p className="text-sm text-gray-500 mb-5">Sube una imagen de referencia y hasta 3 imágenes del producto.</p>
                {/* Reference image */}
                <div className="mb-5">
                  <label className="block text-xs font-medium text-gray-600 mb-2">Imagen de referencia (para que la IA la analice)</label>
                  <ProductPhotoUploader
                    imageUrls={aiWizard.refImage ? [aiWizard.refImage] : []}
                    onChange={urls => setAiWizard(w => w ? { ...w, refImage: urls[0] || '' } : w)}
                    compact
                  />
                </div>
                {/* Product images */}
                <div className="mb-5">
                  <label className="block text-xs font-medium text-gray-600 mb-2">Imágenes del producto (máximo 3)</label>
                  <ProductPhotoUploader
                    imageUrls={aiWizard.imgUrls}
                    onChange={urls => setAiWizard(w => w ? { ...w, imgUrls: urls.slice(0, 3) } : w)}
                    compact
                  />
                </div>
                <div className="mt-6 flex gap-3">
                  <button onClick={() => setAiWizard(w => w ? { ...w, step: 'prices' } : w)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Atrás</button>
                  <button onClick={aiWizardFinish} className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4" /> Crear con IA
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PRODUCT LIST (shown when modal is NOT active)
         ═══════════════════════════════════════════════════════════════ */}
      {!modal && (
        <div className="hidden md:block space-y-5">
      {/* Header compacto con stats en línea */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
              <Package className="w-5 h-5 text-gray-900" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Productos publicados en la web</h1>
              <p className="text-xs text-gray-500">
                {filtered.length} de {webProductsCount} productos publicados en el catálogo web
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition shadow-sm">
              <Store className="w-4 h-4" /> Seleccionar de tienda
            </button>
            {AI_IMAGE_GEN_ENABLED && (
            <button
              onClick={() => { setModal({ mode: 'add', data: { ...EMPTY, _barcode: '', _sku: '', _details: '', _usage: '', _ingredients: '' } }); setAiAutoEnhance(true); }}
              disabled={aiLoading !== null}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-purple-300 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-50 transition shadow-sm disabled:opacity-50"
              title="Sube una imagen y la IA autocompleta todo"
            >
              {aiLoading !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 animate-pulse" />}
              IA
            </button>
            )}
            {AI_CATEGORIZE_ENABLED && (
            <button onClick={() => setAiCategorizeModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition shadow-sm" title="Categorizar productos usando IA">
              <Sparkles className="w-4 h-4" /> Yaxbot
            </button>
            )}
            <button onClick={() => { try { localStorage.removeItem('carlitos_admin_products_cache_v1'); sessionStorage.removeItem('carlitos_admin_products_all_v1'); } catch {} load(true); }} disabled={isLoading} className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition text-gray-600" title="Refrescar productos">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        {/* Stats inline compactas */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg text-xs">
            <span className="text-gray-500">Visibles:</span>
            <span className="font-bold text-gray-900">{filtered.length}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg text-xs">
            <span className="text-gray-500">Stock:</span>
            <span className="font-bold text-gray-900">{totalUnits.toLocaleString('es-CL')}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg text-xs">
            <span className="text-gray-500">Valor:</span>
            <span className="font-bold text-gray-900">{fmt(totalInventoryValue)}</span>
          </div>
          {noImageCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg text-xs">
              <span className="text-amber-600">Sin imagen:</span>
              <span className="font-bold text-amber-700">{noImageCount}</span>
            </div>
          )}
          {outStockCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-lg text-xs">
              <span className="text-red-500">Agotados:</span>
              <span className="font-bold text-red-600">{outStockCount}</span>
            </div>
          )}
          {lowStockCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg text-xs">
              <span className="text-amber-600">Stock bajo:</span>
              <span className="font-bold text-amber-700">{lowStockCount}</span>
            </div>
          )}
          {avgMargin !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-lg text-xs">
              <span className="text-emerald-600">Margen:</span>
              <span className="font-bold text-emerald-700">{avgMargin}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Acciones secundarias — agrupadas en un menú para mantener el orden */}
      {(() => {
        const menuItem = 'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition text-left disabled:opacity-40 disabled:cursor-not-allowed';
        const menuLabel = 'px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400';
        const brokenCount = Object.keys(brokenImages).length;
        return (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button onClick={() => setToolsOpen(v => !v)}
                className="flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition shadow-sm">
                <Wrench className="w-4 h-4 text-gray-500" /> Herramientas
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${toolsOpen ? 'rotate-180' : ''}`} />
              </button>
              {toolsOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setToolsOpen(false)} />
                  <div className="absolute left-0 mt-2 z-30 w-64 bg-white border border-gray-100 rounded-2xl shadow-xl ring-1 ring-black/5 p-2 flex flex-col">
                    <p className={menuLabel}>Edición masiva</p>

                    <div className="my-1.5 border-t border-gray-100" />
                    <p className={menuLabel}>Exportar</p>
                    <button onClick={() => { setToolsOpen(false); exportCSV(); }} disabled={filtered.length === 0} className={menuItem}>
                      <FileText className="w-4 h-4 text-gray-400" /> CSV
                    </button>
                    <button onClick={() => { setToolsOpen(false); exportXLSX(); }} disabled={filtered.length === 0} className={menuItem}>
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Excel (XLSX)
                    </button>
                    <button onClick={() => { setToolsOpen(false); exportAllXLSX(); }} disabled={isExportingAllXLSX} className={menuItem}>
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      {isExportingAllXLSX ? '⏳ Exportando...' : 'Excel Completo (XLSX)'}
                    </button>
                    <button onClick={() => { setToolsOpen(false); exportInventoryPDF(); }} disabled={isExportingPDF} className={menuItem}>
                      <FileText className="w-4 h-4 text-purple-500" />
                      {isExportingPDF ? `PDF ${pdfExportProgress.total > 0 ? `${pdfExportProgress.current}/${pdfExportProgress.total}` : '...'}` : 'PDF con imágenes'}
                    </button>
                    <button id="btn-export-shopify" onClick={() => { setToolsOpen(false); exportShopifyCSV(); }} disabled={products.length === 0} className={menuItem}>
                      <ShoppingBag className="w-4 h-4 text-gray-400" /> Shopify CSV
                    </button>
                    <button onClick={() => { setToolsOpen(false); exportCompareCSV(); }} className={menuItem}>
                      <FileSpreadsheet className="w-4 h-4 text-blue-500" /> CSV Comparador
                    </button>

                    <div className="my-1.5 border-t border-gray-100" />
                    <p className={menuLabel}>Imágenes</p>
                    <Link href="/admin/products/import-images" onClick={() => setToolsOpen(false)} className={menuItem}>
                      <Upload className="w-4 h-4 text-gray-400" /> Importar imágenes
                    </Link>
                    <button onClick={() => { setToolsOpen(false); syncBrokenImages(); }} disabled={syncingImages || products.length === 0} className={menuItem}>
                      <ImageOff className={`w-4 h-4 ${brokenCount > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                      {syncingImages ? 'Verificando…' : 'Verificar fotos'}
                      {brokenCount > 0 && !syncingImages && (
                        <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">{brokenCount}</span>
                      )}
                    </button>


                  </div>
                </>
              )}
            </div>

            {/* Estado de procesos en curso (fuera del menú, siempre visible) */}
            {(isExportingPDF || syncingImages) && (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {isExportingPDF
                  ? `PDF ${pdfExportProgress.current}/${pdfExportProgress.total}`
                  : `Fotos ${syncProgress.checked}/${products.flatMap(p => [p.IMAGEURL, p.IMAGEURL2, p.IMAGEURL3].filter(Boolean)).length}`}
              </span>
            )}

            {/* Acción contextual: eliminar repetidos con stock 0 */}
            {showDuplicates && duplicates.length > 0 && (
              <button onClick={deleteZeroStockDuplicates} disabled={isDeletingBulkDups}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-xl text-sm font-semibold transition shadow-sm">
                <Trash2 className={`w-4 h-4 ${isDeletingBulkDups ? 'animate-spin' : ''}`} />
                {isDeletingBulkDups && bulkDeleteProgress
                  ? `Eliminando ${bulkDeleteProgress.done}/${bulkDeleteProgress.total}...`
                  : 'Eliminar repetidos stock 0'}
              </button>
            )}
          </div>
        );
      })()}

      {/* Progress bar de eliminación masiva */}
      {bulkDeleteProgress && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-red-700 font-medium flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Eliminando duplicados con stock 0...
            </span>
            <span className="text-red-600 font-bold tabular-nums">
              {bulkDeleteProgress.done} / {bulkDeleteProgress.total}
            </span>
          </div>
          <div className="w-full bg-red-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-2 bg-red-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${bulkDeleteProgress.total > 0 ? (bulkDeleteProgress.done / bulkDeleteProgress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-red-500">Procesando de a 2 por vez para no exceder el límite de Appwrite</p>
        </div>
      )}

      {/* Filtros — búsqueda, categorías y estado de stock en una sola tarjeta */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-black text-purple-800">
          <Globe className="h-4 w-4" />
          Productos publicados en la web: {webProductsCount}
        </div>

      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mr-1">Stock</span>
        {([['all','Todos'], ['instock','En stock'], ['low','Stock bajo'], ['out','Agotados']] as const).map(([k, label]) => {
          const cnt = k === 'all' ? products.length : k === 'instock' ? products.filter(p => (p.STOCK ?? 0) > 0).length : k === 'low' ? products.filter(p => (p.STOCK ?? 0) > 0 && (p.STOCK ?? 0) <= 10).length : products.filter(p => (p.STOCK ?? 0) === 0).length;
          return (
            <button key={k} onClick={() => setStockFilter(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                stockFilter === k ? 'bg-gray-900 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}>
              {label}
              {cnt > 0 && k !== 'all' && <span className={`text-[10px] font-bold px-1 rounded-full ${stockFilter === k ? 'bg-white/20 text-white' : k === 'out' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>{cnt}</span>}
            </button>
          );
        })}
                <button onClick={() => setNoImageOnly(v => !v)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
            noImageOnly ? 'bg-gray-700 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}>
          Sin imagen
        </button>
        <button onClick={() => {
          const next = !showDuplicates;
          setShowDuplicates(next);
          if (next) {
            checkDuplicates();
          }
        }}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
            showDuplicates ? 'bg-rose-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}>
          Ver Repetidos
        </button>
        {Object.keys(brokenImages).length > 0 && (
          <button onClick={() => setBrokenOnly(v => !v)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
              brokenOnly ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
            }`}>
            <ImageOff className="w-3 h-3" />
            Fotos rotas
            <span className={`text-[10px] font-bold px-1 rounded-full ${brokenOnly ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'}`}>{Object.keys(brokenImages).length}</span>
          </button>
        )}
      </div>

      {/* Filtro por Riesgo / Salud de Stock (Paso 3: Identificar qué sacar de la web) */}
      <div className="flex gap-2 flex-wrap items-center pt-2 border-t border-gray-100">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mr-1">Salud Web</span>
        <button
          onClick={() => { setRiskFilter('all'); setCurrentPage(1); }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            riskFilter === 'all'
              ? 'bg-gray-900 text-white shadow-sm'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Todos ({webProductsCount})
        </button>
        <button
          onClick={() => { setRiskFilter(prev => prev === 'rojo' ? 'all' : 'rojo'); setCurrentPage(1); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
            riskFilter === 'rojo'
              ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-400/40'
              : 'bg-rose-50/80 text-rose-700 border border-rose-200 hover:bg-rose-100'
          }`}
          title="Ver solo productos críticos o vacíos que se deben sacar de la web"
        >
          <span>🔴 Críticos / Sacar</span>
          <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${riskFilter === 'rojo' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'}`}>
            {riskCounts.rojo}
          </span>
        </button>
        <button
          onClick={() => { setRiskFilter(prev => prev === 'amarillo' ? 'all' : 'amarillo'); setCurrentPage(1); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            riskFilter === 'amarillo'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'bg-amber-50/80 text-amber-800 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <span>🟡 Precaución</span>
          <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${riskFilter === 'amarillo' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
            {riskCounts.amarillo}
          </span>
        </button>
        <button
          onClick={() => { setRiskFilter(prev => prev === 'verde' ? 'all' : 'verde'); setCurrentPage(1); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            riskFilter === 'verde'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-emerald-50/80 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
          }`}
        >
          <span>🟢 Seguros</span>
          <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${riskFilter === 'verde' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
            {riskCounts.verde}
          </span>
        </button>

        {/* Separador */}
        <span className="w-px h-5 bg-gray-200 my-auto mx-1 hidden sm:inline-block" />

        {/* Alternar orden: Críticos primero vs Más seguros primero */}
        <button
          onClick={() => {
            setSort((current) => ({
              key: 'CREATED',
              dir: current.key === 'CREATED' && current.dir === 'desc' ? 'asc' : 'desc',
            }));
            setCurrentPage(1);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
            sort.key === 'CREATED'
              ? 'bg-sky-100 text-sky-800 border border-sky-300 shadow-2xs'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          title="Ordenar por fecha de publicación"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>{sort.key === 'CREATED' && sort.dir === 'asc' ? 'Más antiguos primero' : 'Más recientes primero'}</span>
        </button>

        <button
          onClick={() => {
            if (sort.key !== 'RISK') {
              setSort({ key: 'RISK', dir: 'asc' });
            } else {
              setSort({ key: 'RISK', dir: sort.dir === 'asc' ? 'desc' : 'asc' });
            }
            setCurrentPage(1);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
            sort.key === 'RISK' && sort.dir === 'asc'
              ? 'bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs'
              : sort.key === 'RISK' && sort.dir === 'desc'
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          title="Alternar orden por salud de stock"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>
            {sort.key === 'RISK' && sort.dir === 'asc'
              ? '🔴 Orden: Críticos primero'
              : sort.key === 'RISK' && sort.dir === 'desc'
              ? '🟢 Orden: Seguros primero'
              : 'Ordenar por salud'}
          </span>
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setCurrentPage(1);
              }
            }}
            placeholder="SKU, barra o nombre (Enter para buscar en BD)..."
            className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800" />
          {search && <button onClick={() => { setSearch(''); setCurrentPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-4 h-4" /></button>}
        </div>
        <div className="relative">
          <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setSubCatFilter(''); }} className="appearance-none pl-3 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800">
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c.$id} value={c.$id}>{c.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={subCatFilter} onChange={e => setSubCatFilter(e.target.value)} className="appearance-none pl-3 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800">
            <option value="">Todas las subcategorías</option>
            {subcategories
              .filter(s => !catFilter || s.categoryId === catFilter)
              .map(s => <option key={s.$id} value={s.$id}>{s.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      </div>{/* /Filtros */}

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}

      {/* ═══ MODO DUPLICADOS: tabla técnica ═══ */}
      {showDuplicates ? (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-50/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Producto Repetido</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase" colSpan={2}>Motivo</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Precio</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Stock</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Producto a Conservar</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {[1, 2, 3, 4, 5, 6].map(j => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                duplicates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      No se encontraron productos repetidos
                    </td>
                  </tr>
                ) : (
                  duplicates.map((group, groupIdx) => (
                    <Fragment key={groupIdx}>
                      {/* Original Row (Counterpart to keep) */}
                      <tr className="bg-emerald-50/25 border-l-4 border-emerald-500 hover:bg-emerald-50/45 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                              {group.original.imageurl ? (
                                <img src={resolveStorageImageUrl(group.original.imageurl)} alt={group.original.name} className="w-full h-full object-cover" />
                              ) : (
                                <Package className="w-5 h-5 text-gray-400 m-auto mt-2.5" />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{group.original.name}</p>
                              <p className="text-[10px] text-gray-400 font-mono">SKU: {group.sku}</p>
                              <p className="text-[10px] text-gray-500">
                                Colección:{' '}
                                <span className="font-medium text-emerald-700 uppercase text-[9px] bg-emerald-100 px-1.5 py-0.5 rounded">
                                  {group.original.collection === 'products' ? 'Productos (Principal)' : group.original.collection === 'catalog_products' ? 'Catálogo' : 'Inventario'}
                                </span>
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-emerald-600 font-bold" colSpan={2}>
                          ✨ Producto a Conservar
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="font-semibold text-gray-900">{fmt(group.original.price)}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                            {group.original.stock}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-emerald-700 font-medium hidden md:table-cell">
                          Conserva stock / principal
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">✔ Activo</span>
                        </td>
                      </tr>

                      {/* Duplicate Rows (To be deleted) */}
                      {group.duplicates.map((dup: any, dupIdx: number) => (
                        <tr key={`${groupIdx}-dup-${dupIdx}`} className="bg-rose-50/10 hover:bg-rose-50/20 transition-colors border-l-4 border-rose-300">
                          <td className="px-4 py-3 pl-8">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                                {dup.imageurl ? (
                                  <img src={resolveStorageImageUrl(dup.imageurl)} alt={dup.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-4 h-4 text-gray-400 m-auto mt-2" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{dup.name}</p>
                                <p className="text-[10px] text-gray-400 font-mono">SKU: {dup.sku}</p>
                                <p className="text-[10px] text-gray-500">
                                  Colección:{' '}
                                  <span className="font-medium text-rose-600 uppercase text-[9px] bg-rose-50 px-1.5 py-0.5 rounded">
                                    {dup.collection === 'products' ? 'Productos (Principal)' : dup.collection === 'catalog_products' ? 'Catálogo' : 'Inventario'}
                                  </span>
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-amber-600 font-medium" colSpan={2}>
                            {dup.reason}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-gray-900">{fmt(dup.price)}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700">
                              {dup.stock}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
                            Copia a eliminar
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => deleteDuplicate(dup)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-medium transition"
                              title="Eliminar este duplicado"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && showDuplicates && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
            <span>Se encontraron <span className="font-semibold text-rose-600">{duplicates.length}</span> productos repetidos en total.</span>
          </div>
        )}
      </div>
      ) : (
      /* ═══ MODO NORMAL: grid de tarjetas (simple y visual) ═══ */
      <div>
        {isLoading ? (
          <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
                <div className="h-32 bg-gray-100" />
                <div className="p-2.5 space-y-2">
                  <div className="h-3.5 bg-gray-100 rounded" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                  <div className="h-7 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-16 text-center text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            No se encontraron productos
          </div>
        ) : (
          <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {pagedProducts.map((p: Product) => {
              const liveStatus = getLiveStatus(p);
              const pRisk = getProductRisk({
                stock: p.STOCK ?? 0,
                salesVelocity7d: (p as any).salesVelocity7d || 0,
                maxBatchSize: (p as any).maxBatchSize || 1,
                daysSinceCreated: p.$createdAt
                  ? Math.floor((Date.now() - new Date(p.$createdAt).getTime()) / 86400000)
                  : 999,
                price: Number(p.CURRENTPRICE ?? p.PRICE ?? 0),
              });
              const isRedRisk = pRisk.level === 'rojo';
              const isWeb = Boolean((p as any).SHOW_IN_WEB ?? (p as any).show_in_web);
              const originalStorePrice = Number((p as any).STORE_PRICE ?? p.PRICE ?? p.CURRENTPRICE ?? 0);
              const currentWebPrice = Number((p as any).WEBPRICE ?? (p as any).web_price ?? p.PRICE ?? 0);
              const hasCustomWebPrice = currentWebPrice > 0 && currentWebPrice !== originalStorePrice;
              const isEditingThisPrice = editingPriceId === p.$id;
              const isSavingThis = savingPriceId === p.$id;

              let cardAccent = 'border-gray-200 hover:border-gray-300';
              if (isRedRisk && isWeb) {
                cardAccent = 'border-rose-300 ring-2 ring-rose-400/70 bg-rose-50/15 shadow-sm shadow-rose-100';
              } else if (liveStatus === 'new') {
                cardAccent = 'border-gray-400 ring-1 ring-gray-300';
              } else if (liveStatus === 'existing') {
                cardAccent = 'border-amber-300 ring-1 ring-amber-200';
              } else if ((p.STOCK ?? 0) === 0) {
                cardAccent = 'border-red-300 ring-1 ring-red-200';
              }
              const photoCount = [p.IMAGEURL, p.IMAGEURL2, p.IMAGEURL3].filter(Boolean).length;
              const tagList = ((Array.isArray(p.TAGS) ? p.TAGS : String(p.TAGS || '').split(',')) as string[]).map((t: string) => t.trim()).filter(Boolean).slice(0, 2);
              return (
                <div key={p.$id} className={`bg-white rounded-xl border shadow-[0_1px_4px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150 ${cardAccent}`}>
                  {/* Imagen con tamaño fijo: se adapta a cualquier proporción */}
                  <div className="relative h-32 bg-gray-50/70 border-b border-gray-200 cursor-pointer group"
                    onClick={() => {
                      setImageDrawerTab('images');
                      setImageDrawer({
                        productId: p.$id,
                        productName: p.NAME || '',
                        img1: p.IMAGEURL || '',
                        img2: p.IMAGEURL2 || '',
                        img3: p.IMAGEURL3 || '',
                        img4: (p as any).IMAGEURL4 || '',
                        origImg1: p.IMAGEURL || '',
                        origImg2: p.IMAGEURL2 || '',
                        origImg3: p.IMAGEURL3 || '',
                        origImg4: (p as any).IMAGEURL4 || '',
                        description: p.DESCRIPTION || '',
                        origDescription: p.DESCRIPTION || '',
                        features: (Array.isArray(p.FEATURES) ? p.FEATURES : []).join('\n'),
                        origFeatures: (Array.isArray(p.FEATURES) ? p.FEATURES : []).join('\n'),
                        tags: (Array.isArray(p.TAGS) ? p.TAGS : []).join(', '),
                        origTags: (Array.isArray(p.TAGS) ? p.TAGS : []).join(', '),
                        sku: (p as any).SKU || '',
                        origSku: (p as any).SKU || '',
                        price: p.PRICE || 0,
                        origPrice: p.PRICE || 0,
                        stock: p.STOCK ?? 0,
                        origStock: p.STOCK ?? 0,
                      });
                    }}
                    title="Click para cambiar imagen">
                    {p.IMAGEURL ? (
                      <img src={resolveStorageImageUrl(p.IMAGEURL)} alt={p.NAME} className="w-full h-full object-contain p-1" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                        <Package className="w-7 h-7" />
                        <span className="text-[9px] text-amber-500 font-medium mt-1">sin imagen</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Pencil className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {(brokenImages[p.$id]?.length ?? 0) > 0 && (
                      <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center" title={`${brokenImages[p.$id].length} imagen(es) rota(s)`}>
                        <ImageOff className="w-3 h-3 text-white" />
                      </div>
                    )}
                    {photoCount > 1 && (
                      <span className="absolute bottom-1.5 right-1.5 text-[9px] font-bold bg-black/60 text-white rounded-full px-1.5 py-0.5">{photoCount} fotos</span>
                    )}
                    {isWeb ? (
                      isRedRisk ? (
                        <span className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-black shadow-md z-10 animate-pulse">
                          <AlertTriangle className="w-2.5 h-2.5 text-white" /> Crítico en Web
                        </span>
                      ) : (
                        <span className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-600 text-white text-[9px] font-bold shadow-md z-10">
                          <Globe className="w-2.5 h-2.5" /> Web
                        </span>
                      )
                    ) : (
                      <span className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800/80 backdrop-blur-sm text-slate-200 text-[9px] font-bold shadow-sm z-10">
                        <Store className="w-2.5 h-2.5" /> Tienda
                      </span>
                    )}
                    {AI_ENABLED && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        openEdit(p);
                        setTimeout(() => setKeniaOpen(true), 100);
                      }}
                      className="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-1 rounded-lg bg-purple-600 text-white text-[9px] font-bold shadow-lg hover:bg-purple-700 transition"
                      title="Editar con ayuda de Yaxbot IA">
                      <Sparkles className="w-3 h-3" /> IA
                    </button>
                    )}
                    {liveStatus === 'new' && (
                      <span className="absolute bottom-1.5 left-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-gray-800 text-white animate-pulse">Nuevo en Live</span>
                    )}
                    {liveStatus === 'existing' && (
                      <span className="absolute bottom-1.5 left-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">Ya estaba (En Live)</span>
                    )}
                  </div>

                  {/* Info del producto */}
                  <div className="p-2.5 flex flex-col gap-1 flex-1">
                    <p className="font-semibold text-gray-900 text-[13px] leading-snug line-clamp-2 min-h-[2.1rem]">{p.NAME}</p>

                    {/* Barra de Salud Web / Riesgo de Stock animada */}
                    <div className="my-1 flex items-center justify-between gap-1.5 flex-wrap">
                      <StockRiskBadge risk={pRisk} compact />
                      {isRedRisk && isWeb && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[9px] font-black border border-rose-200 animate-pulse shrink-0" title="Riesgo de quiebre en tienda física: Quitar de la web">
                          <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                          Sacar de Web
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">{catName(p.CATEGORYID)}</span>
                      {(p.BRAND || p.SUPPLIER) && (
                        <button
                          onClick={e => { e.stopPropagation(); setSearch(p.BRAND || p.SUPPLIER || ''); }}
                          className="text-[10px] font-semibold px-1.5 py-0.5 bg-blue-50 border border-blue-200/60 text-blue-700 rounded-md hover:bg-blue-100 transition"
                          title="Filtrar por proveedor">
                          Prov: {p.BRAND || p.SUPPLIER}
                        </button>
                      )}
                      {tagList.map((t: string) => (
                        <button key={t} onClick={e => { e.stopPropagation(); setSearch(t); }}
                          className="text-[10px] px-1.5 py-0.5 bg-gray-50 border border-gray-100 text-gray-400 rounded-full hover:text-gray-900 transition cursor-pointer">
                          {t}
                        </button>
                      ))}
                      {getSku(p) && getSku(p) !== p.$id && (
                        <span className="text-[10px] text-gray-400 font-mono">SKU: {getSku(p)}</span>
                      )}
                    </div>
                    {/* Precios: soporte para edición rápida inline en la tarjeta */}
                    {isEditingThisPrice ? (
                      <div className="mt-auto pt-1 bg-purple-50/80 p-2 rounded-xl border-2 border-purple-400 shadow-xs">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-bold text-slate-400 line-through">
                            Tienda: ${originalStorePrice.toLocaleString('es-CL')}
                          </span>
                          <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-purple-200 text-purple-800">
                            Solo Web
                          </span>
                        </div>
                        <div className="flex items-center bg-white border-2 border-purple-600 rounded-lg px-2 py-1 shadow-xs focus-within:ring-2 focus-within:ring-purple-400">
                          <span className="text-xs font-black text-purple-700 mr-1">$</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={inlinePrices[p.$id] ?? ''}
                            onChange={e => setInlinePrices(prev => ({ ...prev, [p.$id]: e.target.value.replace(/[^0-9]/g, '') }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveInlinePrice(p);
                              if (e.key === 'Escape') handleCancelInlineEdit();
                            }}
                            placeholder="Precio web"
                            className="w-full text-xs sm:text-sm font-black text-purple-950 bg-transparent outline-none"
                            autoFocus
                          />
                        </div>
                        <p className="text-[9px] text-purple-700 font-bold mt-1">
                          🔒 No afecta la caja ni el POS
                        </p>
                      </div>
                    ) : (
                      <div className="mt-auto pt-1">
                        {hasCustomWebPrice ? (
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-base font-black text-purple-700">
                                ${currentWebPrice.toLocaleString('es-CL')}
                              </span>
                              <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 border border-purple-200">
                                Web
                              </span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[11px] font-semibold text-slate-400 line-through">
                                Tienda: ${originalStorePrice.toLocaleString('es-CL')}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-base font-bold text-gray-900">${originalStorePrice.toLocaleString('es-CL')}</span>
                            <span className="text-[9px] font-bold text-slate-400">igual a tienda</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-1">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${(p.STOCK ?? 0) === 0 ? 'bg-red-100 text-red-700' : (p.STOCK ?? 0) <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {(p.STOCK ?? 0) === 0 ? 'Agotado' : `${p.STOCK} en stock`}
                          </span>
                          {p.COST && p.COST > 0 && (
                            <span className="text-[10px] text-gray-400">
                              {Math.round((((currentWebPrice || originalStorePrice) - p.COST) / (currentWebPrice || originalStorePrice)) * 100)}% margen
                            </span>
                          )}
                        </div>
                        {((p.QUANTITY || p.PACKAGE_QTY || p.EMBALAJEQTY) || p.PACKQTY || p.BOX_CODE || getSection(p)) && (
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-500 flex-wrap">
                            {(p.QUANTITY || p.PACKAGE_QTY || p.EMBALAJEQTY) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200/60 text-amber-800 font-medium" title="Cantidad por Embalaje">
                                📦 Emb: {p.QUANTITY || p.PACKAGE_QTY || `${p.EMBALAJEQTY} un.`}
                              </span>
                            )}
                            {p.PACKQTY ? <span>×{p.PACKQTY}/paq</span> : null}
                            {p.BOX_CODE && (
                              <span className="font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded text-[9px]" title="Código de Caja">
                                Caja: {p.BOX_CODE}
                              </span>
                            )}
                            {(() => {
                              const loc = getSection(p);
                              return loc ? (
                                <span className="inline-flex items-center gap-0.5 font-bold text-gray-500">
                                  <MapPin className="w-2.5 h-2.5" />G{loc.gondola} S{loc.section}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Botón destacado "Quitar de Web" para productos críticos en rojo */}
                  {isRedRisk && isWeb && (
                    <div className="px-2.5 pb-1.5">
                      <button
                        onClick={() => toggleWebStatus(p)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-98 text-white text-[11px] font-black shadow-sm transition-all duration-150 cursor-pointer animate-pulse"
                        title="Quitar este producto crítico de la tienda web para proteger inventario de tienda física"
                      >
                        <EyeOff className="w-3.5 h-3.5 text-rose-100" />
                        <span>Quitar de Web</span>
                        <span className="text-[9px] font-bold bg-rose-700/90 px-1.5 py-0.2 rounded text-rose-100">Peligro</span>
                      </button>
                    </div>
                  )}

                  {/* Acciones grandes y claras */}
                  <div className="px-2.5 pb-2.5 space-y-1.5">
                    {isEditingThisPrice ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleSaveInlinePrice(p)}
                          disabled={isSavingThis}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs shadow-sm transition disabled:opacity-50"
                        >
                          {isSavingThis ? <RefreshCw size={13} className="animate-spin" /> : <Check size={14} />}
                          <span>Guardar Precio</span>
                        </button>
                        <button
                          onClick={handleCancelInlineEdit}
                          disabled={isSavingThis}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 active:scale-95 transition"
                          title="Cancelar edición"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(p)}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-semibold hover:bg-gray-800 active:scale-98 transition">
                            <Pencil className="w-3 h-3" /> Ficha
                          </button>
                          <button onClick={() => toggleWebStatus(p)}
                            className={`p-1.5 rounded-lg border transition ${
                              isWeb
                                ? isRedRisk
                                  ? 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100'
                                  : 'bg-purple-50 border-purple-300 text-purple-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'
                                : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-purple-700 hover:bg-purple-50 hover:border-purple-200'
                            }`}
                            title={isWeb ? (isRedRisk ? 'Peligro de quiebre (clic para quitar de Web)' : 'Publicado en Web (clic para quitar)') : 'Solo Tienda (clic para publicar en web)'}>
                            {isWeb && isRedRisk ? <EyeOff className="w-3.5 h-3.5 text-rose-600" /> : <Globe className="w-3.5 h-3.5" />}
                          </button>
                          <a href={`/productos/${p.$id}`} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                            title="Ver en tienda">
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                          <button onClick={() => disableProduct(p)}
                            className="p-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition"
                            title="Deshabilitar (Stock en 0)">
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => remove(p.$id)} disabled={deleteId === p.$id}
                            className="p-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                            title="Eliminar">
                            {deleteId === p.$id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {/* Botón de editar precio web rápido (destacado para móvil y PC) */}
                        <button
                          onClick={() => handleStartInlineEdit(p)}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-[11px] active:scale-98 transition shadow-2xs"
                          title="Editar precio rápido exclusivo de la web"
                        >
                          <DollarSign size={13} className="text-purple-600" />
                          <span>Editar Precio Web</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!isLoading && filtered.length > 0 && (
          <div className="mt-4 px-4 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 text-xs text-gray-500 flex-wrap">
            <span><span className="font-semibold text-gray-700">{filtered.length}</span> productos</span>
            <span>Stock: <span className="font-semibold text-gray-700">{totalUnits.toLocaleString('es-CL')} un.</span></span>
            <span>Valor: <span className="font-semibold text-gray-700">{fmt(totalInventoryValue)}</span></span>
            {filtered.some(p => p.COST) && (
              <span>Costo: <span className="font-semibold text-gray-700">{fmt(totalCostValue)}</span></span>
            )}
            {(() => { const noCost = filtered.filter(p => !p.COST || p.COST === 0).length; return noCost > 0 ? <span className="text-amber-600 font-medium">{noCost} sin costo</span> : null; })()}
            {noImageCount > 0 ? <span className="text-amber-500 font-medium">{noImageCount} sin imagen</span> : null}
            {avgMargin !== null ? <span className="ml-auto text-gray-900 font-semibold">Margen: {avgMargin}%</span> : null}
          </div>
        )}
      </div>
      )}

      <EpicPagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => setCurrentPage(page)}
        isLoading={isLoading}
        pageSize={PAGE_SIZE}
        totalItems={filtered.length}
      />

      {/* Bulk price modal */}
      {priceModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <p className="font-bold text-gray-900">Ajuste masivo de precios</p>
                <p className="text-xs text-gray-500 mt-0.5">Se aplica a {filtered.length} producto(s) visible(s)</p>
              </div>
              <button onClick={() => setPriceModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Tipo de ajuste</label>
                <div className="flex bg-gray-100 rounded-xl p-1">
                  {([['percent', '% Porcentaje'], ['fixed', '$ Monto fijo']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setPriceAdj(a => ({ ...a, type: v }))}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${priceAdj.type === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {priceAdj.type === 'percent' ? 'Porcentaje (ej: +10 o -5)' : 'Monto en CLP (ej: +500 o -1000)'}
                </label>
                <input type="number" value={priceAdj.value} onChange={e => setPriceAdj(a => ({ ...a, value: e.target.value }))}
                  placeholder={priceAdj.type === 'percent' ? 'ej: 10' : 'ej: 500'}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800" />
                <p className="text-xs text-gray-400 mt-1">Usa valores negativos para reducir precios</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setPriceModal(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={applyBulkPrice} disabled={applyingPrice || !priceAdj.value}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-900 transition disabled:opacity-60">
                {applyingPrice ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Percent className="w-4 h-4" />}
                {applyingPrice ? 'Aplicando...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk stock modal */}
      {stockModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <p className="font-bold text-gray-900">Ajuste masivo de stock</p>
                <p className="text-xs text-gray-500 mt-0.5">Se aplica a {filtered.length} producto(s) visible(s)</p>
              </div>
              <button onClick={() => setStockModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Tipo de ajuste</label>
                <div className="flex bg-gray-100 rounded-xl p-1">
                  {([['add', '+ Agregar / Restar'], ['set', '= Establecer valor']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setStockAdj(a => ({ ...a, type: v }))}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${stockAdj.type === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {stockAdj.type === 'add' ? 'Cantidad a agregar (negativo para restar)' : 'Stock exacto a establecer'}
                </label>
                <input type="number" value={stockAdj.value} onChange={e => setStockAdj(a => ({ ...a, value: e.target.value }))}
                  placeholder={stockAdj.type === 'add' ? 'ej: 50 o -10' : 'ej: 100'}
                  min={stockAdj.type === 'set' ? 0 : undefined}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800" />
                {stockAdj.type === 'add' && <p className="text-xs text-gray-400 mt-1">Usa valores negativos para reducir stock</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setStockModal(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={applyBulkStock} disabled={applyingStock || !stockAdj.value}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-60">
                {applyingStock ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Boxes className="w-4 h-4" />}
                {applyingStock ? 'Aplicando...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image drawer (cortina lateral) */}
      {imageDrawer && (
        <div className="fixed inset-0 z-[9999] flex justify-end" onClick={() => !imageDrawerSaving && setImageDrawer(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" />
          <div
            className="relative h-full w-full max-w-[640px] bg-white shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 border-b border-gray-100 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                  <ImagePlus className="w-5 h-5 text-gray-900" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm">Editar producto</p>
                  <p className="text-xs text-gray-500 truncate max-w-[300px]">{imageDrawer.productName}</p>
                </div>
              </div>
              <button
                onClick={() => !imageDrawerSaving && setImageDrawer(null)}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="shrink-0 flex gap-1 px-5 pt-3 border-b border-gray-100">
              {([
                { key: 'images' as const, label: 'Imágenes' },
                { key: 'info' as const, label: 'Descripción' },
                { key: 'specs' as const, label: 'Ficha técnica' },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setImageDrawerTab(tab.key)}
                  className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
                    imageDrawerTab === tab.key
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* TAB: Images */}
              {imageDrawerTab === 'images' && (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Imagen 1', sub: 'Principal', key: 'img1' as const, idx: 0 },
                    { label: 'Imagen 2', sub: 'Secundaria', key: 'img2' as const, idx: 1 },
                    { label: 'Imagen 3', sub: 'Detalle', key: 'img3' as const, idx: 2 },
                    { label: 'Imagen 4', sub: 'Extra', key: 'img4' as const, idx: 3 },
                  ].map((slot) => {
                    const url = imageDrawer[slot.key];
                    const isUploading = imageDrawerUploading === slot.key;
                    return (
                      <div key={slot.key} className="rounded-xl border border-gray-200 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-gray-900">{slot.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${slot.idx === 0 ? 'bg-gray-100 text-gray-900' : 'bg-gray-100 text-gray-600'}`}>
                              {slot.sub}
                            </span>
                          </div>
                          {url && (
                            <button
                              onClick={() => setImageDrawer(d => d ? { ...d, [slot.key]: '' } : null)}
                              className="text-[11px] text-red-500 hover:text-red-700 font-medium"
                            >Quitar</button>
                          )}
                        </div>
                        {url ? (
                          <div className="relative w-full h-28 rounded-lg overflow-hidden bg-gray-100 mb-2">
                            <img src={resolveStorageImageUrl(url)} alt={slot.label} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="w-full h-28 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-indigo-400 hover:text-gray-800 transition mb-2"
                            onClick={() => imageDrawerFileRefs.current[slot.idx]?.click()}
                          >
                            {isUploading ? (
                              <Loader2 className="w-6 h-6 animate-spin text-gray-800" />
                            ) : (
                              <>
                                <Upload className="w-5 h-5 mb-1" />
                                <span className="text-[11px] font-medium">Subir</span>
                              </>
                            )}
                          </button>
                        )}
                        <div className="flex gap-1.5">
                          <input
                            type="url"
                            value={url}
                            onChange={e => setImageDrawer(d => d ? { ...d, [slot.key]: e.target.value } : null)}
                            placeholder="URL..."
                            className="flex-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-800"
                          />
                          <input
                            ref={el => { imageDrawerFileRefs.current[slot.idx] = el; }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setImageDrawerUploading(slot.key);
                              try {
                                const { storage } = getServices();
                                const fileId = ID.unique();
                                const { compressProductImageClient } = await import('@/lib/compress-product-image-client');
                                const res = await storage.createFile(PRODUCTS_BUCKET_ID, fileId, await compressProductImageClient(file));
                                setImageDrawer(d => d ? { ...d, [slot.key]: res.url } : null);
                              } catch (err: any) {
                                alert('Error al subir: ' + err.message);
                              } finally {
                                setImageDrawerUploading(null);
                                e.target.value = '';
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => imageDrawerFileRefs.current[slot.idx]?.click()}
                            disabled={isUploading}
                            className="shrink-0 px-2.5 py-2 border border-indigo-200 bg-gray-50 rounded-lg text-xs font-medium text-gray-900 hover:bg-gray-100 transition disabled:opacity-50"
                          >
                            <Upload className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TAB: Info (descripción + datos básicos) */}
              {imageDrawerTab === 'info' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Descripción</label>
                    <textarea
                      value={imageDrawer.description}
                      onChange={e => setImageDrawer(d => d ? { ...d, description: e.target.value } : null)}
                      rows={6}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none"
                      placeholder="Descripción del producto..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">SKU</label>
                      <input
                        type="text"
                        value={imageDrawer.sku}
                        onChange={e => setImageDrawer(d => d ? { ...d, sku: e.target.value } : null)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
                        placeholder="SKU del producto"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tags</label>
                      <input
                        type="text"
                        value={imageDrawer.tags}
                        onChange={e => setImageDrawer(d => d ? { ...d, tags: e.target.value } : null)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
                        placeholder="tag1, tag2, tag3"
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                    Stock y precios están protegidos en esta sección.
                  </div>
                </div>
              )}

              {/* TAB: Specs (ficha técnica) */}
              {imageDrawerTab === 'specs' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Ficha técnica <span className="text-gray-400 font-normal">(una característica por línea)</span>
                    </label>
                    <textarea
                      value={imageDrawer.features}
                      onChange={e => setImageDrawer(d => d ? { ...d, features: e.target.value } : null)}
                      rows={10}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none font-mono"
                      placeholder={"Ejemplo:\nMaterial: Algodón\nTalla: L\nColor: Azul\nGarantía: 3 meses"}
                    />
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold text-gray-700">Vista previa:</span>
                    </p>
                    {imageDrawer.features.trim() ? (
                      <ul className="mt-2 space-y-1">
                        {imageDrawer.features.split('\n').filter((s: string) => s.trim()).map((line: string, i: number) => {
                          const [key, ...rest] = line.split(':');
                          return (
                            <li key={i} className="text-xs flex gap-2">
                              <span className="font-medium text-gray-700">{key.trim()}:</span>
                              <span className="text-gray-600">{rest.join(':').trim()}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-gray-400">Sin características</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-gray-100 px-5 py-3.5 flex justify-end gap-3 bg-white">
              <button
                onClick={() => !imageDrawerSaving && setImageDrawer(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >Cancelar</button>
              <button
                onClick={saveImageDrawer}
                disabled={imageDrawerSaving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-900 transition disabled:opacity-50 shadow-sm"
              >
                {imageDrawerSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                {imageDrawerSaving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Categorization Modal (Yaxbot) — oculto cuando IA desactivada */}
      {AI_CATEGORIZE_ENABLED && aiCategorizeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center text-white shadow-md shadow-gray-100">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-base">Categorización Inteligente con Yaxbot</p>
                  <p className="text-xs text-gray-500 mt-0.5">Organiza tu catálogo de forma automática usando Inteligencia Artificial</p>
                </div>
              </div>
              <button onClick={() => {
                if (aiCategorizing || applyingCategorization) return;
                setAiCategorizeModal(false);
                setAiCategorizeSuggestions([]);
              }} disabled={aiCategorizing || applyingCategorization} className="p-1.5 rounded-lg hover:bg-gray-200/60 text-gray-400 hover:text-gray-600 transition disabled:opacity-50">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
              {/* State 1: Configuration */}
              {aiCategorizeSuggestions.length === 0 && !aiCategorizing && (
                <div className="space-y-6 max-w-lg mx-auto py-4">
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex gap-3 text-sm text-gray-900">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-gray-900" />
                    <div>
                      <p className="font-semibold">¿Cómo funciona?</p>
                      <p className="text-gray-800/95 mt-1 leading-relaxed text-xs">
                        Yaxbot analizará el título y la descripción de tus productos para recomendarte la categoría y la subcategoría que mejor se ajusten de entre las que tienes registradas. Luego podrás revisar las propuestas antes de aplicarlas.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">¿Qué productos quieres categorizar?</label>
                    <div className="grid grid-cols-1 gap-3">
                      <label className={`border rounded-xl p-4 flex items-start gap-3 cursor-pointer transition ${aiCategorizeMode === 'uncategorized' ? 'border-gray-900 bg-gray-50/40 ring-2 ring-gray-100' : 'border-gray-200 hover:bg-gray-50 bg-white'}`}>
                        <input type="radio" name="ai-mode" checked={aiCategorizeMode === 'uncategorized'} onChange={() => setAiCategorizeMode('uncategorized')} className="mt-1 text-gray-900 focus:ring-gray-800" />
                        <div>
                          <p className="font-semibold text-sm text-gray-900">Solo productos sin categoría</p>
                          <p className="text-xs text-gray-500 mt-1">Recomendado. Procesará únicamente los productos que no tienen ninguna categoría asignada ({products.filter(p => !p.CATEGORYID || p.CATEGORYID.trim() === '').length} encontrados en esta página).</p>
                        </div>
                      </label>

                      <label className={`border rounded-xl p-4 flex items-start gap-3 cursor-pointer transition ${aiCategorizeMode === 'all' ? 'border-gray-900 bg-gray-50/40 ring-2 ring-gray-100' : 'border-gray-200 hover:bg-gray-50 bg-white'}`}>
                        <input type="radio" name="ai-mode" checked={aiCategorizeMode === 'all'} onChange={() => setAiCategorizeMode('all')} className="mt-1 text-gray-900 focus:ring-gray-800" />
                        <div>
                          <p className="font-semibold text-sm text-gray-900">Todos los productos</p>
                          <p className="text-xs text-gray-500 mt-1">Procesará la totalidad de tu catálogo de productos ({globalStats?.total ?? products.length} productos) para re-evaluarlos.</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="pt-4 flex justify-center">
                    <button onClick={startAiCategorization} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-semibold shadow-lg shadow-gray-100 transition duration-150">
                      <Sparkles className="w-5 h-5" /> Comenzar Análisis
                    </button>
                  </div>
                </div>
              )}

              {/* State 2: Categorizing (Progress) */}
              {aiCategorizing && (
                <div className="flex flex-col items-center justify-center py-16 space-y-6 max-w-md mx-auto">
                  <div className="w-16 h-16 rounded-full border-4 border-gray-100 border-t-gray-900 animate-spin" />
                  <div className="text-center">
                    <p className="font-bold text-gray-800 text-lg">Yaxbot está analizando tu catálogo...</p>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      Este proceso se realiza en lotes eficientes de 10 productos para garantizar la máxima precisión. Por favor, no cierres esta ventana.
                    </p>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden shadow-inner">
                    <div className="bg-gradient-to-r from-gray-800 to-gray-900 h-full rounded-full transition-all duration-300" style={{ width: `${(aiCategorizeProgress.current / aiCategorizeProgress.total) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-800 bg-gray-50 px-3 py-1 rounded-full">
                    {aiCategorizeProgress.current} de {aiCategorizeProgress.total} productos procesados
                  </span>
                </div>
              )}

              {/* State 3: Suggestion Review */}
              {aiCategorizeSuggestions.length > 0 && !aiCategorizing && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2 bg-gray-50 border border-gray-100 rounded-xl p-3.5">
                    <div className="flex items-center gap-2 text-gray-900">
                      <Sparkles className="w-4 h-4 shrink-0 text-gray-900" />
                      <span className="text-xs font-semibold">Se encontraron {aiCategorizeSuggestions.length} sugerencias. Desmarca las que no quieras aplicar.</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => {
                        const next: Record<string, boolean> = {};
                        aiCategorizeSuggestions.forEach(s => { next[s.productId] = true; });
                        setApprovedSuggestions(next);
                      }} className="text-[11px] font-bold text-gray-800 hover:text-gray-900 bg-white border border-gray-200 px-2.5 py-1 rounded-lg transition">Marcar todo</button>
                      <button onClick={() => setApprovedSuggestions({})} className="text-[11px] font-bold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 px-2.5 py-1 rounded-lg transition">Desmarcar todo</button>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                    <div className="overflow-x-auto max-h-[45vh]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-600 uppercase tracking-wider">
                            <th className="p-4 w-12 text-center">OK</th>
                            <th className="p-4">Producto</th>
                            <th className="p-4">Categoría Sugerida</th>
                            <th className="p-4">Subcategoría Sugerida</th>
                            <th className="p-4">Justificación de Yaxbot</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                          {aiCategorizeSuggestions.map(s => {
                            const cat = categories.find(c => c.$id === s.suggestedCategoryId);
                            const sub = subcategories.find(sub => sub.$id === s.suggestedSubcategoryId);
                            return (
                              <tr key={s.productId} className={`hover:bg-gray-50/50 transition ${approvedSuggestions[s.productId] ? '' : 'opacity-60 bg-gray-50/20'}`}>
                                <td className="p-4 text-center">
                                  <input type="checkbox" checked={approvedSuggestions[s.productId] || false} onChange={e => setApprovedSuggestions(prev => ({ ...prev, [s.productId]: e.target.checked }))} className="rounded text-gray-900 focus:ring-gray-800" />
                                </td>
                                <td className="p-4 font-medium text-gray-900 max-w-[200px] truncate" title={s.productName}>{s.productName}</td>
                                <td className="p-4">
                                  {cat ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-900 border border-gray-100">
                                      {cat.name}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400 italic">No identificada</span>
                                  )}
                                </td>
                                <td className="p-4">
                                  {sub ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-800 border border-gray-100">
                                      {sub.name}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400 italic">Sin subcategoría</span>
                                  )}
                                </td>
                                <td className="p-4 text-xs text-gray-500 leading-relaxed max-w-[250px] truncate" title={s.reason}>{s.reason || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* State 4: Applying (Saving) */}
              {applyingCategorization && (
                <div className="flex flex-col items-center justify-center py-16 space-y-6 max-w-md mx-auto">
                  <div className="w-16 h-16 rounded-full border-4 border-gray-100 border-t-gray-900 animate-spin" />
                  <div className="text-center">
                    <p className="font-bold text-gray-800 text-lg">Guardando categorizaciones...</p>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      Actualizando tu catálogo de productos en la base de datos de Appwrite. Por favor, no cierres esta ventana.
                    </p>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden shadow-inner">
                    <div className="bg-gradient-to-r from-gray-800 to-gray-900 h-full rounded-full transition-all duration-300" style={{ width: `${(applyingProgress.current / applyingProgress.total) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-900 bg-gray-50 px-3 py-1 rounded-full animate-pulse">
                    Actualizando: {applyingProgress.current} de {applyingProgress.total} productos
                  </span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center p-5 border-t border-gray-100 bg-gray-50">
              <div>
                {aiCategorizeSuggestions.length > 0 && !aiCategorizing && !applyingCategorization && (
                  <span className="text-xs font-medium text-gray-500">
                    Aprobados: <span className="font-bold text-gray-800">{aiCategorizeSuggestions.filter(s => approvedSuggestions[s.productId]).length}</span> de {aiCategorizeSuggestions.length} sugerencias
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  disabled={aiCategorizing || applyingCategorization}
                  onClick={() => {
                    setAiCategorizeModal(false);
                    setAiCategorizeSuggestions([]);
                    setApprovedSuggestions({});
                  }}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-100 transition disabled:opacity-50"
                >
                  {aiCategorizeSuggestions.length > 0 ? 'Descartar todo' : 'Cerrar'}
                </button>

                {aiCategorizeSuggestions.length > 0 && !aiCategorizing && !applyingCategorization && (
                  <button
                    onClick={applyAiCategorization}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 shadow-md shadow-gray-100 transition"
                  >
                    <Sparkles className="w-4 h-4" /> Aplicar Categorizaciones
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      )}

      {/* ═══ MOBILE PRODUCT LIST (tarjetas, solo < md) ═══ */}
      {!modal && (
        <MobileProductList
          products={pagedProducts}
          allProducts={products}
          isLoading={isLoading}
          search={search}
          onSearchChange={setSearch}
          onSearchSubmit={() => setCurrentPage(1)}
          onSearchClear={() => { setSearch(''); setCurrentPage(1); }}
          categories={categories}
          catFilter={catFilter}
          onCatChange={(v) => { setCatFilter(v); setSubCatFilter(''); setCurrentPage(1); }}
          stockFilter={stockFilter}
          onStockFilterChange={(v) => { setStockFilter(v); setCurrentPage(1); }}
          onEdit={openEdit}
          onEnhanceProduct={enhanceProductWithAI}
          onAdd={openAdd}
          onDelete={remove}
          deleteId={deleteId}
          globalTotal={products.length}
          aiLoading={aiLoading !== null}
          onRefresh={() => load(true)}
          currentPage={currentPage}
          hasMore={currentPage < totalPages}
          onNextPage={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          onPrevPage={() => setCurrentPage(p => Math.max(1, p - 1))}
          brokenImages={brokenImages}
          brokenOnly={brokenOnly}
          onBrokenOnlyChange={setBrokenOnly}
          onSyncBrokenImages={syncBrokenImages}
          syncingImages={syncingImages}
          syncProgress={syncProgress}
          noImageOnly={noImageOnly}
          onNoImageOnlyChange={setNoImageOnly}
          riskFilter={riskFilter}
          onRiskFilterChange={(v) => { setRiskFilter(v); setCurrentPage(1); }}
          riskCounts={riskCounts}
          sortRiskDir={sort.key === 'RISK' ? sort.dir : null}
          sortNewestDir={sort.key === 'CREATED' ? sort.dir : null}
          onToggleSortNewest={() => {
            setSort((current) => ({
              key: 'CREATED',
              dir: current.key === 'CREATED' && current.dir === 'desc' ? 'asc' : 'desc',
            }));
            setCurrentPage(1);
          }}
          onToggleSortRisk={() => {
            if (sort.key !== 'RISK') {
              setSort({ key: 'RISK', dir: 'asc' });
            } else {
              setSort({ key: 'RISK', dir: sort.dir === 'asc' ? 'desc' : 'asc' });
            }
            setCurrentPage(1);
          }}
          onToggleWebStatus={toggleWebStatus}
        />
      )}
    </div>
  );
}
