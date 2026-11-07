'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Camera,
  Check,
  ClipboardPaste,
  DollarSign,
  Eye,
  EyeOff,
  FolderPlus,
  Image as ImageIcon,
  Infinity as InfinityIcon,
  Layers,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  Package,
  Palette,
  Plus,
  RotateCcw,
  Ruler,
  Search,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import {
  COLOR_SWATCHES,
  DESCRIPTION_BLUEPRINTS,
  Interactive3DStoreCard,
  ProfitEngineWidget,
  ReadinessRing,
  triggerHaptic,
} from './ProductStudioComponents';

export type StudioProductFormState = {
  name: string;
  description: string;
  price: string;
  cost: string;
  stock: string;
  category: string;
  brand: string;
  size: string;
  color: string;
  content: string;
  imageUrl: string;
  imageUrl2: string;
  imageUrl3: string;
  visible: boolean;
  unlimitedStock: boolean;
};

type StudioTabKey = 'media' | 'identity' | 'pricing' | 'details';

const QUICK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Estándar', 'Única'];
const QUICK_CONTENTS = ['30 ml', '50 ml', '100 ml', '150 ml', '200 ml', '250 ml', '1 Unidad', 'Set x3'];
const QUICK_STOCK_PRESETS = [0, 5, 10, 25, 50, 100];

export interface ProductStudioSheetProps {
  open: boolean;
  editingProduct: { id: string; code: string; name: string } | null;
  displaySku?: string;
  form: StudioProductFormState;
  saving: boolean;
  uploadingImage: boolean;
  activeUploadSlot: 1 | 2 | 3;
  setActiveUploadSlot: (slot: 1 | 2 | 3) => void;
  imagePreviewError: boolean;
  setImagePreviewError: (v: boolean) => void;
  draggingImage: boolean;
  setDraggingImage: (v: boolean) => void;
  error: string | null;
  notice: string | null;
  categories: string[];
  brands: string[];
  creatingCategory: boolean;
  setCreatingCategory: React.Dispatch<React.SetStateAction<boolean>>;
  newCategoryName: string;
  setNewCategoryName: (v: string) => void;
  savingCategory: boolean;
  onCreateCategory: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImageInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImageDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onImagePaste: (e: React.ClipboardEvent<HTMLElement>) => void;
  onPasteClipboardButton: () => void;
  onUpdateField: <K extends keyof StudioProductFormState>(
    key: K,
    value: StudioProductFormState[K]
  ) => void;
  onSetSlotUrl: (slot: 1 | 2 | 3, url: string) => void;
  onApplyMarginPreset: (pctMarkup: number) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onDelete?: () => void;
  savedDraft: StudioProductFormState | null;
  onRestoreDraft: () => void;
  onDiscardDraft: () => void;
  formatCurrency: (value: number) => string;
}

export function ProductStudioSheet({
  open,
  editingProduct,
  displaySku,
  form,
  saving,
  uploadingImage,
  activeUploadSlot,
  setActiveUploadSlot,
  imagePreviewError,
  setImagePreviewError,
  draggingImage,
  setDraggingImage,
  error,
  notice,
  categories,
  brands,
  creatingCategory,
  setCreatingCategory,
  newCategoryName,
  setNewCategoryName,
  savingCategory,
  onCreateCategory,
  fileInputRef,
  onImageInputChange,
  onImageDrop,
  onImagePaste,
  onPasteClipboardButton,
  onUpdateField,
  onSetSlotUrl,
  onApplyMarginPreset,
  onSubmit,
  onClose,
  onDelete,
  savedDraft,
  onRestoreDraft,
  onDiscardDraft,
  formatCurrency,
}: ProductStudioSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<StudioTabKey>('media');
  const [show3DPreview, setShow3DPreview] = useState(false);
  const [showUrlField, setShowUrlField] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const priceInputRef = useRef<HTMLInputElement | null>(null);
  const mediaSecRef = useRef<HTMLElement | null>(null);
  const identitySecRef = useRef<HTMLElement | null>(null);
  const pricingSecRef = useRef<HTMLElement | null>(null);
  const detailsSecRef = useRef<HTMLElement | null>(null);
  const dragStartYRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock background scroll when sheet is open
  useEffect(() => {
    if (!open) {
      setDragOffsetY(0);
      setShow3DPreview(false);
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Auto-open URL input if preview errors on a custom link
  useEffect(() => {
    if (imagePreviewError) {
      setShowUrlField(true);
    }
  }, [imagePreviewError]);

  const numericPrice = Math.max(0, Number(form.price) || 0);
  const numericCost = Math.max(0, Number(form.cost) || 0);
  const numericStock = Math.max(0, Math.trunc(Number(form.stock) || 0));

  const marginInfo = useMemo(() => {
    if (numericPrice <= 0 || numericCost <= 0) return null;
    const profit = numericPrice - numericCost;
    const pct = Math.round((profit / numericPrice) * 100);
    return { profit, pct };
  }, [numericCost, numericPrice]);

  const slotUrls: [string, string, string] = [
    form.imageUrl,
    form.imageUrl2,
    form.imageUrl3,
  ];
  const loadedPhotosCount = slotUrls.filter((u) => u.trim().length > 0).length;
  const activeSlotUrl =
    activeUploadSlot === 2 ? form.imageUrl2 : activeUploadSlot === 3 ? form.imageUrl3 : form.imageUrl;

  // Readiness Score (0 -> 100)
  const readinessScore = useMemo(() => {
    let score = 0;
    if (form.imageUrl.trim()) score += 30;
    if (form.name.trim().length >= 2) score += 25;
    if (numericPrice > 0) score += 25;
    if (form.unlimitedStock || numericStock > 0) score += 10;
    if (form.category.trim() || numericCost > 0) score += 10;
    return Math.min(100, score);
  }, [form.category, form.imageUrl, form.name, form.unlimitedStock, numericCost, numericPrice, numericStock]);

  // Scroll-Spy handler
  const handleScrollSpy = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop + 120;
    const sections: Array<{ key: StudioTabKey; el: HTMLElement | null }> = [
      { key: 'media', el: mediaSecRef.current },
      { key: 'identity', el: identitySecRef.current },
      { key: 'pricing', el: pricingSecRef.current },
      { key: 'details', el: detailsSecRef.current },
    ];
    let current: StudioTabKey = 'media';
    for (const sec of sections) {
      if (sec.el && sec.el.offsetTop <= scrollTop) {
        current = sec.key;
      }
    }
    if (current !== activeTab) {
      setActiveTab(current);
    }
  };

  const jumpToSection = (key: StudioTabKey, focusPrice = false) => {
    triggerHaptic('light');
    setActiveTab(key);
    const map: Record<StudioTabKey, HTMLElement | null> = {
      media: mediaSecRef.current,
      identity: identitySecRef.current,
      pricing: pricingSecRef.current,
      details: detailsSecRef.current,
    };
    const target = map[key];
    const container = scrollContainerRef.current;
    if (target && container) {
      container.scrollTo({
        top: Math.max(0, target.offsetTop - 12),
        behavior: 'smooth',
      });
    }
    if (focusPrice) {
      setTimeout(() => priceInputRef.current?.focus(), 260);
    }
  };

  // Swap secondary photo to primary cover slot
  const promoteSlotToCover = (slot: 2 | 3) => {
    triggerHaptic('medium');
    const cover = form.imageUrl;
    const chosen = slot === 2 ? form.imageUrl2 : form.imageUrl3;
    if (!chosen) return;
    onSetSlotUrl(1, chosen);
    onSetSlotUrl(slot, cover);
    setActiveUploadSlot(1);
  };

  // Native Header Touch Pull-Down to Dismiss
  const handleHeaderTouchStart = (e: React.TouchEvent) => {
    if (saving || uploadingImage) return;
    dragStartYRef.current = e.touches[0].clientY;
  };
  const handleHeaderTouchMove = (e: React.TouchEvent) => {
    if (dragStartYRef.current === null) return;
    const delta = e.touches[0].clientY - dragStartYRef.current;
    if (delta > 0) {
      // Rubber-band damping
      setDragOffsetY(Math.min(260, delta * 0.78));
    }
  };
  const handleHeaderTouchEnd = () => {
    if (dragOffsetY > 105) {
      triggerHaptic('light');
      setDragOffsetY(0);
      onClose();
    } else {
      setDragOffsetY(0);
    }
    dragStartYRef.current = null;
  };

  const adjustStockDelta = (delta: number) => {
    triggerHaptic('light');
    onUpdateField('unlimitedStock', false);
    const next = Math.max(0, numericStock + delta);
    onUpdateField('stock', String(next));
  };

  const appendBlueprint = (snippet: string) => {
    triggerHaptic('light');
    const curr = form.description.trim();
    onUpdateField('description', curr ? `${curr}\n\n${snippet}` : snippet);
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="studio-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[1000] flex items-end sm:items-center sm:justify-end"
          style={{
            background: 'rgba(4, 7, 18, 0.62)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
          onClick={onClose}
        >
          <motion.div
            key="studio-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-form-title"
            initial={{ y: '100%', opacity: 0.9 }}
            animate={{ y: dragOffsetY, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.95 }}
            transition={
              dragOffsetY > 0
                ? { duration: 0 }
                : { type: 'spring', stiffness: 370, damping: 36, mass: 0.85 }
            }
            onClick={(e) => e.stopPropagation()}
            onPaste={onImagePaste}
            className="relative w-full sm:max-w-[650px] h-[95dvh] sm:h-[calc(100dvh-20px)] sm:m-2.5 bg-[#eef2f6] rounded-t-[30px] sm:rounded-[28px] shadow-[0_-20px_70px_rgba(0,0,0,0.48)] sm:shadow-[0_24px_80px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden border-t sm:border border-slate-300"
          >
            {/* ── NATIVE iOS TOP GRABBER + AMBIENT MESH CHROME ── */}
            <div
              onTouchStart={handleHeaderTouchStart}
              onTouchMove={handleHeaderTouchMove}
              onTouchEnd={handleHeaderTouchEnd}
              className="relative shrink-0 bg-white border-b border-slate-300 px-4 sm:px-5 pt-2 pb-3 select-none"
            >
              {/* Mobile Pull Bar */}
              <div className="sm:hidden flex justify-center pb-2">
                <div className="w-10 h-1.5 rounded-full bg-slate-300/90" />
              </div>

              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <ReadinessRing score={readinessScore} size={40} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2
                        id="product-form-title"
                        className="text-[16px] sm:text-lg font-black text-slate-900 tracking-tight truncate"
                      >
                        {editingProduct ? 'Editar producto' : 'Nuevo producto'}
                      </h2>
                      {editingProduct && displaySku && (
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          {displaySku}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium truncate">
                      {readinessScore >= 100
                        ? 'Ficha óptima lista para convertir clientes'
                        : 'Completa foto, nombre y precio en segundos'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* 1-Tap Header Visibility Switch */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onUpdateField('visible', !form.visible);
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition active:scale-95 cursor-pointer ${
                      form.visible
                        ? 'bg-emerald-50/70 text-emerald-800 border-emerald-200/80'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                    title="Alternar visibilidad en tienda web"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        form.visible ? 'bg-emerald-600' : 'bg-slate-400'
                      }`}
                    />
                    <span>{form.visible ? 'Visible' : 'Oculto'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar formulario"
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200/80 text-slate-600 flex items-center justify-center transition active:scale-90 cursor-pointer"
                  >
                    <X className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>
              </div>
            </div>

            {/* ── FORM CORE ── */}
            <form onSubmit={onSubmit} className="flex-1 flex flex-col min-h-0">
              {/* ── STICKY DYNAMIC ISLAND HUD + FLUID SEGMENTED TABS ── */}
              <div className="shrink-0 px-3.5 sm:px-5 pt-3 pb-2.5 bg-[#eef2f6]/95 backdrop-blur-md z-20 space-y-2.5 border-b border-slate-300/85">
                {/* Auto-Draft Recovery Banner */}
                {!editingProduct && savedDraft && !form.name && !form.imageUrl && !form.price && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs shadow-2xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <RotateCcw className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                      <span className="font-bold truncate">
                        Borrador guardado: &ldquo;{savedDraft.name || 'Producto sin título'}&rdquo;
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={onRestoreDraft}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-[11px] cursor-pointer"
                      >
                        Restaurar
                      </button>
                      <button
                        type="button"
                        onClick={onDiscardDraft}
                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                        aria-label="Descartar borrador"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* CLEAN ARCHITECTURAL WHITE COMMERCIAL HUD */}
                <div className="wpw-island-border rounded-[22px] p-3.5 text-slate-900 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    {/* Tap to Focus Price */}
                    <button
                      type="button"
                      onClick={() => jumpToSection('pricing', true)}
                      className="text-left group min-w-0 cursor-pointer"
                    >
                      <span className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500 flex items-center gap-1">
                        <span>Precio Vitrina</span>
                        <span className="text-slate-400 group-hover:text-slate-700 transition">✎</span>
                      </span>
                      <div className="text-xl sm:text-2xl font-black tracking-tight tabular-nums leading-tight text-slate-900">
                        {formatCurrency(numericPrice)}
                      </div>
                    </button>

                    {/* Live Profit + Stock + 3D Simulator Trigger */}
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {marginInfo ? (
                        <button
                          type="button"
                          onClick={() => jumpToSection('pricing')}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold tabular-nums border cursor-pointer transition ${
                            marginInfo.profit >= 0
                              ? 'bg-emerald-50/70 text-emerald-800 border-emerald-200/80'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {marginInfo.profit >= 0 ? '+' : ''}
                          {formatCurrency(marginInfo.profit)} ({marginInfo.pct}%)
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => jumpToSection('pricing')}
                          className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200/90 hover:bg-slate-200/70 transition cursor-pointer"
                        >
                          + Costo
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => jumpToSection('pricing')}
                        className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200/90 tabular-nums cursor-pointer"
                      >
                        {form.unlimitedStock ? '∞ Stock' : `${numericStock} uds`}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setShow3DPreview((v) => !v);
                        }}
                        aria-expanded={show3DPreview}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition active:scale-95 cursor-pointer ${
                          show3DPreview
                            ? 'bg-slate-200 text-slate-900 border-slate-400'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Sparkles className="w-3 h-3 text-slate-500" />
                        <span>3D</span>
                      </button>
                    </div>
                  </div>

                  {/* Expandable 3D Storefront Card Stage */}
                  <AnimatePresence initial={false}>
                    {show3DPreview && (
                      <motion.div
                        key="island-3d-stage"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 pt-3 border-t border-slate-200/70 rounded-2xl bg-slate-50/60">
                          <Interactive3DStoreCard
                            name={form.name}
                            category={form.category}
                            brand={form.brand}
                            price={numericPrice}
                            images={slotUrls}
                            size={form.size}
                            color={form.color}
                            content={form.content}
                            unlimitedStock={form.unlimitedStock}
                            stock={numericStock}
                            visible={form.visible}
                            formatCurrency={formatCurrency}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* FLUID SEGMENTED STUDIO NAVIGATION */}
                <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-200/75">
                  {(
                    [
                      { key: 'media', label: 'Fotos', badge: `${loadedPhotosCount}/3` },
                      { key: 'identity', label: 'Datos' },
                      { key: 'pricing', label: 'Precio' },
                      { key: 'details', label: 'Extras' },
                    ] as Array<{ key: StudioTabKey; label: string; badge?: string }>
                  ).map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => jumpToSection(tab.key)}
                        className={`relative py-1.5 px-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1 select-none ${
                          isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="studio-segmented-active"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                            className="absolute inset-0 rounded-xl bg-white shadow-sm"
                          />
                        )}
                        <span className="relative z-10">{tab.label}</span>
                        {tab.badge && (
                          <span
                            className={`relative z-10 text-[9px] font-black px-1.5 py-0.2 rounded-full ${
                              loadedPhotosCount > 0
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Alerts */}
              {error && (
                <div
                  role="alert"
                  className="mx-3.5 sm:mx-5 mt-2.5 shrink-0 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700 flex items-center justify-between gap-2"
                >
                  <span>{error}</span>
                </div>
              )}
              {notice && (
                <div
                  role="status"
                  className="mx-3.5 sm:mx-5 mt-2.5 shrink-0 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800 flex items-center gap-2"
                >
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{notice}</span>
                </div>
              )}

              {/* ── SCROLLABLE STUDIO CANVAS ── */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScrollSpy}
                className="flex-1 overflow-y-auto px-3.5 sm:px-5 py-3.5 space-y-4 overscroll-contain"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {/* ═══ SECTION 1: BENTO MEDIA STUDIO DECK ═══ */}
                <section
                  ref={mediaSecRef}
                  role="group"
                  aria-label="Subir o pegar foto del producto"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDraggingImage(true);
                  }}
                  onDragLeave={() => setDraggingImage(false)}
                  onDrop={onImageDrop}
                  className={`wpw-bento-frame rounded-[24px] border-t-[3px] border-t-indigo-500 p-3.5 sm:p-4 transition space-y-3 ${
                    draggingImage
                      ? 'border-indigo-400 bg-indigo-50/40'
                      : ''
                  }`}
                >
                  {/* Hidden File Inputs (Gallery + Native Mobile Camera) */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onImageInputChange}
                    className="hidden"
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={onImageInputChange}
                    className="hidden"
                  />

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          Estudio Fotográfico
                        </h3>
                        <p className="text-[10px] text-slate-400 font-medium">
                          Compresión automática WebP · Toca un slot para elegir
                        </p>
                      </div>
                    </div>

                    {uploadingImage && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Optimizando…
                      </span>
                    )}
                  </div>

                  {/* 3-Card Bento Visual Slot Deck */}
                  <div className="grid grid-cols-12 gap-2.5">
                    {([1, 2, 3] as const).map((slot) => {
                      const url = slot === 1 ? form.imageUrl : slot === 2 ? form.imageUrl2 : form.imageUrl3;
                      const isSelected = activeUploadSlot === slot;
                      const isHero = slot === 1;

                      return (
                        <div
                          key={slot}
                          onClick={() => {
                            triggerHaptic('light');
                            setActiveUploadSlot(slot);
                            setImagePreviewError(false);
                            if (!url && !uploadingImage) {
                              fileInputRef.current?.click();
                            }
                          }}
                          className={`${
                            isHero ? 'col-span-6' : 'col-span-3'
                          } relative aspect-square rounded-2xl overflow-hidden border transition-all cursor-pointer group select-none ${
                            isSelected
                              ? 'border-slate-400 ring-2 ring-slate-200 shadow-xs'
                              : url
                                ? 'border-slate-200 hover:border-slate-300'
                                : 'border-dashed border-slate-300 bg-slate-50/70 hover:border-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          {url ? (
                            <>
                              <img
                                key={url}
                                src={url}
                                alt={`Foto ${slot}`}
                                onLoad={() => {
                                  if (isSelected) setImagePreviewError(false);
                                }}
                                onError={() => {
                                  if (isSelected) setImagePreviewError(true);
                                }}
                                className="w-full h-full object-cover"
                              />
                              {/* Top Slot Pill */}
                              <span
                                className={`absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide backdrop-blur-md ${
                                  isHero
                                    ? 'bg-white/90 text-slate-800 border border-slate-200/80 shadow-2xs'
                                    : 'bg-black/60 text-white'
                                }`}
                              >
                                {isHero ? '★ Portada' : `#${slot}`}
                              </span>

                              {/* Delete button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerHaptic('light');
                                  onSetSlotUrl(slot, '');
                                }}
                                aria-label={`Quitar foto ${slot}`}
                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/65 hover:bg-rose-600 text-white flex items-center justify-center transition cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>

                              {/* Promote to Cover button for Slot 2 & 3 */}
                              {!isHero && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    promoteSlotToCover(slot);
                                  }}
                                  title="Convertir en foto principal de portada"
                                  className="absolute bottom-1.5 inset-x-1.5 py-1 rounded-lg bg-white/90 hover:bg-white text-slate-800 text-[9px] font-extrabold backdrop-blur-sm flex items-center justify-center gap-0.5 transition cursor-pointer"
                                >
                                  <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                                  <span>Portada</span>
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center gap-1">
                              <div
                                className={`rounded-2xl flex items-center justify-center transition ${
                                  isHero
                                    ? 'w-10 h-10 bg-slate-200/70 text-slate-600'
                                    : 'w-8 h-8 bg-slate-200/60 text-slate-500'
                                }`}
                              >
                                <Plus className={isHero ? 'w-5 h-5 stroke-[2.5]' : 'w-4 h-4 stroke-[2.5]'} />
                              </div>
                              <span className="text-[10px] font-extrabold text-slate-700 leading-tight">
                                {isHero ? 'Portada HD' : `Foto ${slot}`}
                              </span>
                              {isHero && (
                                <span className="text-[9px] font-semibold text-slate-400">
                                  Toca o suelta aquí
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Native Mobile Camera + Gallery + Paste + URL Action Bar */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      disabled={uploadingImage}
                      onClick={() => {
                        triggerHaptic('light');
                        cameraInputRef.current?.click();
                      }}
                      className="sm:hidden flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-2xl bg-slate-100 text-slate-700 border border-slate-200/90 text-[11px] font-extrabold active:scale-95 transition cursor-pointer disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4 text-slate-600" />
                      <span>Cámara</span>
                    </button>

                    <button
                      type="button"
                      disabled={uploadingImage}
                      onClick={() => {
                        triggerHaptic('light');
                        fileInputRef.current?.click();
                      }}
                      className="col-span-1 sm:col-span-2 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2 px-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] sm:text-xs font-extrabold shadow-2xs active:scale-95 transition cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{uploadingImage ? 'Subiendo…' : 'Galería'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={uploadingImage}
                      onClick={() => {
                        triggerHaptic('light');
                        onPasteClipboardButton();
                      }}
                      className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2 px-2 rounded-2xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-[11px] sm:text-xs font-extrabold active:scale-95 transition cursor-pointer disabled:opacity-50"
                    >
                      <ClipboardPaste className="w-4 h-4 text-slate-600" />
                      <span>Pegar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowUrlField((v) => !v)}
                      className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2 px-2 rounded-2xl text-[11px] sm:text-xs font-extrabold border active:scale-95 transition cursor-pointer ${
                        showUrlField || activeSlotUrl
                          ? 'bg-slate-200/80 text-slate-900 border-slate-300'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Link2 className="w-4 h-4" />
                      <span>URL #{activeUploadSlot}</span>
                    </button>
                  </div>

                  {/* Collapsible Clean URL Input */}
                  <AnimatePresence initial={false}>
                    {showUrlField && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-1">
                          <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                            Enlace directo de la foto {activeUploadSlot}
                          </label>
                          <input
                            type="url"
                            value={activeSlotUrl}
                            onChange={(e) => {
                              setImagePreviewError(false);
                              onSetSlotUrl(activeUploadSlot, e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.preventDefault();
                            }}
                            placeholder="https://ejemplo.com/foto-hd.webp"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/80 focus:bg-white px-3.5 py-2.5 text-[16px] sm:text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {imagePreviewError && (
                    <p role="alert" className="text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
                      No se pudo cargar la vista previa de esta URL. Verifica que sea un enlace público de imagen.
                    </p>
                  )}
                </section>

                {/* ═══ SECTION 2: IDENTITY, CATEGORY RAIL & BRAND CHIPS ═══ */}
                <section
                  ref={identitySecRef}
                  className="wpw-bento-frame rounded-[24px] border-t-[3px] border-t-violet-500 p-4 space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <span>✨</span>
                        <span>Nombre del producto</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      {form.name && (
                        <button
                          type="button"
                          onClick={() => onUpdateField('name', '')}
                          className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          Limpiar
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => onUpdateField('name', e.target.value)}
                      placeholder="Ej. Perfume Lattafa Khamrah EDP 100ml"
                      className="w-full px-3.5 py-3 bg-slate-50/70 focus:bg-white border border-slate-200/90 rounded-2xl text-[16px] sm:text-[15px] font-extrabold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
                    />
                  </div>

                  {/* Tactile Category Pill Rail + Accessible Select */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="web-product-category"
                        className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5"
                      >
                        <span>🗂️</span>
                        <span>Categoría</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setCreatingCategory((c) => !c);
                          setNewCategoryName('');
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Nueva categoría</span>
                      </button>
                    </div>

                    {/* Horizontal 1-Tap Category Chips */}
                    {categories.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            onUpdateField('category', '');
                          }}
                          className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold border transition active:scale-95 cursor-pointer ${
                            !form.category
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          Sin categoría
                        </button>
                        {categories.map((cat) => {
                          const active = form.category === cat;
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                onUpdateField('category', cat);
                              }}
                              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold border transition active:scale-95 cursor-pointer ${
                                active
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Synced Native Select for full accessibility / large lists */}
                    <select
                      id="web-product-category"
                      value={form.category}
                      onChange={(e) => onUpdateField('category', e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50/70 focus:bg-white border border-slate-200 rounded-2xl text-[16px] sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    >
                      <option value="">Sin categoría asignada</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>

                    {/* Inline Category Composer */}
                    <AnimatePresence initial={false}>
                      {creatingCategory && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-1 p-3 rounded-2xl bg-indigo-50/50 border border-indigo-200/70 flex flex-wrap items-center gap-2">
                            <FolderPlus className="w-4 h-4 text-indigo-600 shrink-0" />
                            <input
                              type="text"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              placeholder="Ej. Perfumes Árabes"
                              aria-label="Nombre de la categoría"
                              className="flex-1 min-w-[150px] px-3 py-2 bg-white border border-indigo-200/80 rounded-xl text-[16px] sm:text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                            <button
                              type="button"
                              onClick={onCreateCategory}
                              disabled={savingCategory}
                              className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-extrabold hover:bg-indigo-700 cursor-pointer disabled:opacity-60"
                            >
                              {savingCategory ? 'Creando…' : 'Guardar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCreatingCategory(false);
                                setNewCategoryName('');
                              }}
                              className="px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Brand + Quick Brand Pills */}
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span>🏛️</span>
                      <span>Marca / Casa Comercial</span>
                    </label>
                    <input
                      type="text"
                      list="web-product-brands"
                      value={form.brand}
                      onChange={(e) => onUpdateField('brand', e.target.value)}
                      placeholder="Ej. Lattafa, Maison Alhambra, Dior, Zara"
                      className="w-full px-3.5 py-2.5 bg-slate-50/70 focus:bg-white border border-slate-200 rounded-2xl text-[16px] sm:text-sm font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                    <datalist id="web-product-brands">
                      {brands.map((brand) => (
                        <option key={brand} value={brand} />
                      ))}
                    </datalist>

                    {brands.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                        {brands.slice(0, 10).map((b) => {
                          const active = form.brand === b;
                          return (
                            <button
                              key={b}
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                onUpdateField('brand', active ? '' : b);
                              }}
                              className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                                active
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              {b}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>

                {/* ═══ SECTION 3: COMMERCIAL & INVENTORY ENGINE ═══ */}
                <section
                  ref={pricingSecRef}
                  className="wpw-bento-frame rounded-[24px] border-t-[3px] border-t-emerald-500 p-4 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center text-sm">
                        💰
                      </div>
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          Motor de Precio, Costo & Margen
                        </h3>
                        <p className="text-[10px] text-slate-500 font-medium">
                          Rentabilidad por unidad y disponibilidad en vivo
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Side-by-Side Bento Currency Cards with Emojis & Structural Left Fillet */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Selling Price Card (Bento Indigo Fillet) */}
                    <div className="rounded-2xl bg-[#eef2ff] border border-indigo-300 border-l-[3.5px] border-l-indigo-600 p-3.5 focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:bg-white transition shadow-2xs">
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1">
                          <span>🏷️</span>
                          <span>Precio Venta *</span>
                        </label>
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-indigo-200/75 text-indigo-800">
                          Web
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-base font-black text-indigo-600">$</span>
                        <input
                          ref={priceInputRef}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          required
                          value={form.price}
                          onChange={(e) => onUpdateField('price', e.target.value)}
                          placeholder="19990"
                          className="w-full bg-transparent text-[19px] sm:text-lg font-black text-slate-900 placeholder:text-indigo-400/70 focus:outline-none tabular-nums"
                        />
                      </div>
                      <span className="block text-[10px] font-bold text-indigo-700 mt-1 tabular-nums truncate">
                        {numericPrice > 0 ? `✨ ${formatCurrency(numericPrice)} CLP` : '✨ Público en vitrina'}
                      </span>
                    </div>

                    {/* Base Cost Card (Bento Warm Amber Fillet) */}
                    <div className="rounded-2xl bg-[#fffbeb] border border-amber-300 border-l-[3.5px] border-l-amber-600 p-3.5 focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:bg-white transition shadow-2xs">
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-amber-950 flex items-center gap-1">
                          <span>📦</span>
                          <span>Costo Base</span>
                        </label>
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-amber-200/75 text-amber-900">
                          Interno
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-base font-black text-amber-600">$</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          value={form.cost}
                          onChange={(e) => onUpdateField('cost', e.target.value)}
                          placeholder="10000"
                          className="w-full bg-transparent text-[19px] sm:text-lg font-black text-slate-900 placeholder:text-amber-400/80 focus:outline-none tabular-nums"
                        />
                      </div>
                      <span className="block text-[10px] font-bold text-amber-800 mt-1 tabular-nums truncate">
                        {numericCost > 0 ? `🔒 ${formatCurrency(numericCost)} neto` : '🔒 Privado (solo tú)'}
                      </span>
                    </div>
                  </div>

                  {/* Interactive Profit Engine (.990 + Split Bar + Range Scrubber + Quick Cost Starters) */}
                  <ProfitEngineWidget
                    price={numericPrice}
                    cost={numericCost}
                    onChangePrice={(val) => onUpdateField('price', val)}
                    onChangeCost={(val) => onUpdateField('cost', val)}
                    onApplyMarkup={onApplyMarginPreset}
                    formatCurrency={formatCurrency}
                  />

                  {/* Tactile Inventory Mode Switch + Thumb Stepper */}
                  <div className="pt-2.5 border-t border-slate-100 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <span>📊</span>
                        <span>Inventario Web</span>
                      </span>

                      {/* Segmented Stock Mode Toggle */}
                      <div className="inline-flex p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            onUpdateField('unlimitedStock', false);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition cursor-pointer ${
                            !form.unlimitedStock
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          🔢 Unidades
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('medium');
                            onUpdateField('unlimitedStock', true);
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition cursor-pointer ${
                            form.unlimitedStock
                              ? 'bg-sky-600 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <InfinityIcon className="w-3.5 h-3.5" />
                          <span>Ilimitado</span>
                        </button>
                      </div>

                      {/* Synced sr-only checkbox for a11y */}
                      <input
                        type="checkbox"
                        checked={form.unlimitedStock}
                        onChange={(e) => onUpdateField('unlimitedStock', e.target.checked)}
                        className="sr-only"
                        aria-label="Stock ilimitado"
                      />
                    </div>

                    {form.unlimitedStock ? (
                      <div className="rounded-2xl bg-sky-50/70 border border-sky-200/80 p-3.5 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center shrink-0">
                          <InfinityIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-sky-950">
                            ♾️ Siempre disponible para compra (Stock ∞)
                          </p>
                          <p className="text-[11px] text-sky-700 font-medium">
                            Ideal para productos bajo pedido o reposición continua sin quiebre en vitrina.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {/* Giant Tactile Stepper */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => adjustStockDelta(-5)}
                            className="h-11 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black active:scale-95 transition cursor-pointer"
                          >
                            −5
                          </button>
                          <button
                            type="button"
                            onClick={() => adjustStockDelta(-1)}
                            className="h-11 w-11 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-lg font-black active:scale-95 transition cursor-pointer"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            value={form.stock}
                            onChange={(e) => onUpdateField('stock', e.target.value)}
                            placeholder="0"
                            className="flex-1 h-11 px-3 bg-slate-50 focus:bg-white border border-slate-200 rounded-2xl text-center text-[17px] font-black text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                          />
                          <button
                            type="button"
                            onClick={() => adjustStockDelta(1)}
                            className="h-11 w-11 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-black active:scale-95 transition shadow-2xs cursor-pointer"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => adjustStockDelta(5)}
                            className="h-11 px-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/70 text-xs font-black active:scale-95 transition cursor-pointer"
                          >
                            +5
                          </button>
                        </div>

                        {/* Quick Stock Presets */}
                        <div className="grid grid-cols-6 gap-1.5">
                          {QUICK_STOCK_PRESETS.map((preset) => {
                            const isCurrent = !form.unlimitedStock && numericStock === preset;
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  onUpdateField('unlimitedStock', false);
                                  onUpdateField('stock', String(preset));
                                }}
                                className={`py-1.5 rounded-xl text-[11px] font-extrabold border transition active:scale-95 cursor-pointer tabular-nums ${
                                  isCurrent
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                }`}
                              >
                                {preset}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* ═══ SECTION 4: DESCRIPTION BLUEPRINTS & VISUAL VARIANTS ═══ */}
                <section
                  ref={detailsSecRef}
                  className="wpw-bento-frame rounded-[24px] border-t-[3px] border-t-sky-500 p-4 space-y-4"
                >
                  {/* Description with 1-Tap Blueprints */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <span>✍️</span>
                        <span>Descripción persuasiva</span>
                      </label>
                      <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                        {form.description.length} caract.
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                      {DESCRIPTION_BLUEPRINTS.map((bp) => (
                        <button
                          key={bp.id}
                          type="button"
                          onClick={() => appendBlueprint(bp.snippet)}
                          className="shrink-0 px-2.5 py-1 rounded-xl bg-indigo-50/60 hover:bg-indigo-100/80 text-indigo-800 border border-indigo-200/60 text-[11px] font-bold transition active:scale-95 cursor-pointer"
                        >
                          {bp.label}
                        </button>
                      ))}
                    </div>

                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(e) => onUpdateField('description', e.target.value)}
                      placeholder="Notas aromáticas, materiales, beneficios o qué incluye..."
                      className="w-full px-3.5 py-2.5 bg-slate-50/70 focus:bg-white border border-slate-200 rounded-2xl text-[16px] sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                  </div>

                  {/* Variants Matrix */}
                  <div className="pt-2 border-t border-slate-100 space-y-3.5">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span>🎨</span>
                      <span>Variantes & Atributos Táctiles</span>
                    </span>

                    {/* Contenido / Formato (Perfumes / Packs) */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-extrabold text-slate-600 flex items-center gap-1">
                        <span>🧴</span>
                        <span>Contenido / Formato</span>
                      </label>
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                        {QUICK_CONTENTS.map((c) => {
                          const active = form.content === c;
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                onUpdateField('content', active ? '' : c);
                              }}
                              className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition active:scale-95 cursor-pointer ${
                                active
                                  ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-sky-300'
                              }`}
                            >
                              {c}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="text"
                        value={form.content}
                        onChange={(e) => onUpdateField('content', e.target.value)}
                        placeholder="Ej. 100 ml EDP, Set x3, 250g"
                        className="w-full px-3 py-2 bg-slate-50/70 focus:bg-white border border-slate-200 rounded-xl text-[16px] sm:text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      />
                    </div>

                    {/* Talla Chips + Input */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-extrabold text-slate-600 flex items-center gap-1">
                        <span>📏</span>
                        <span>Talla / Medida</span>
                      </label>
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                        {QUICK_SIZES.map((s) => {
                          const active = form.size === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                onUpdateField('size', active ? '' : s);
                              }}
                              className={`shrink-0 min-w-[40px] px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition active:scale-95 cursor-pointer ${
                                active
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="text"
                        value={form.size}
                        onChange={(e) => onUpdateField('size', e.target.value)}
                        placeholder="Otra talla o medida (ej. 42, Oversize)"
                        className="w-full px-3 py-2 bg-slate-50/70 focus:bg-white border border-slate-200 rounded-xl text-[16px] sm:text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      />
                    </div>

                    {/* Visual Color Swatches + Input */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-extrabold text-slate-600 flex items-center gap-1">
                        <span>🌈</span>
                        <span>Color / Tono</span>
                      </label>
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-0.5">
                        {COLOR_SWATCHES.map((sw) => {
                          const active = form.color.toLowerCase() === sw.name.toLowerCase();
                          return (
                            <button
                              key={sw.name}
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                onUpdateField('color', active ? '' : sw.name);
                              }}
                              title={sw.name}
                              className={`shrink-0 inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border text-[11px] font-bold transition active:scale-95 cursor-pointer ${
                                active
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <span
                                className="w-4 h-4 rounded-full border shrink-0 flex items-center justify-center"
                                style={{
                                  background: sw.hex,
                                  borderColor: sw.ring,
                                }}
                              >
                                {active && (
                                  <Check
                                    className={`w-2.5 h-2.5 stroke-[3] ${
                                      sw.light ? 'text-slate-900' : 'text-white'
                                    }`}
                                  />
                                )}
                              </span>
                              <span>{sw.name}</span>
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="text"
                        value={form.color}
                        onChange={(e) => onUpdateField('color', e.target.value)}
                        placeholder="O escribe un color personalizado (ej. Azul Noche / Oro Rosa)"
                        className="w-full px-3 py-2 bg-slate-50/70 focus:bg-white border border-slate-200 rounded-xl text-[16px] sm:text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      />
                    </div>
                  </div>

                  {/* Tactile iOS Storefront Visibility Switch Card */}
                  <div
                    onClick={() => {
                      triggerHaptic('medium');
                      onUpdateField('visible', !form.visible);
                    }}
                    className={`rounded-2xl p-3.5 border flex items-center justify-between gap-3 cursor-pointer transition select-none ${
                      form.visible
                        ? 'bg-emerald-50/55 border-emerald-200/85'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                          form.visible
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-slate-200/70 text-slate-500 border-transparent'
                        }`}
                      >
                        {form.visible ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-black text-slate-900">
                          {form.visible ? '🟢 Publicado en Vitrina Web' : '🌙 Guardado como Borrador Oculto'}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {form.visible
                            ? 'Visible inmediatamente para compra online.'
                            : 'Solo visible en tu panel de administración.'}
                        </p>
                      </div>
                    </div>

                    {/* Native iOS Switch Track */}
                    <div
                      className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${
                        form.visible ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <motion.div
                        layout
                        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        className={`w-5 h-5 rounded-full bg-white shadow-sm ${
                          form.visible ? 'ml-5' : 'ml-0'
                        }`}
                      />
                    </div>
                  </div>
                </section>
              </div>

              {/* ── STICKY SAFE-AREA ACTION DOCK (pr-14 shields Next.js dev button) ── */}
              <div
                className="shrink-0 px-4 sm:px-5 pt-3 pr-14 sm:pr-6 border-t border-slate-200/80 bg-white/95 backdrop-blur-xl flex items-center justify-between gap-2"
                style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}
              >
                {editingProduct && onDelete ? (
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={saving || uploadingImage}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs font-extrabold text-rose-600 bg-rose-50/80 hover:bg-rose-100 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Eliminar</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={saving || uploadingImage}
                    className="px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 text-xs font-extrabold hover:bg-slate-100 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                )}

                <div className="flex items-center gap-2 flex-1 justify-end">
                  {editingProduct && (
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={saving || uploadingImage}
                      className="px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white text-slate-700 text-xs font-extrabold hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={saving || uploadingImage}
                    className="wpw-cta-shimmer flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs sm:text-sm font-black shadow-sm transition active:scale-[0.98] cursor-pointer disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Guardando…</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>
                          {editingProduct
                            ? 'Guardar cambios'
                            : form.visible
                              ? numericPrice > 0
                                ? `Publicar · ${formatCurrency(numericPrice)}`
                                : 'Publicar producto'
                              : 'Guardar borrador'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ─────────────────── Spring Bottom Sheet: Quick Commercial Adjust ─────────────────── */
export function QuickCommercialSheet({
  product,
  price,
  setPrice,
  cost,
  setCost,
  stock,
  setStock,
  unlimited,
  setUnlimited,
  saving,
  onSave,
  onClose,
  formatCurrency,
}: {
  product: { id: string; name: string; imageUrl?: string } | null;
  price: string;
  setPrice: (v: string) => void;
  cost: string;
  setCost: (v: string) => void;
  stock: string;
  setStock: (v: string) => void;
  unlimited: boolean;
  setUnlimited: React.Dispatch<React.SetStateAction<boolean>>;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  formatCurrency: (val: number) => string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const numPrice = Math.max(0, Number(price) || 0);
  const numCost = Math.max(0, Number(cost) || 0);

  return createPortal(
    <AnimatePresence>
      {product && (
        <motion.div
          key="qa-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1010] flex items-end sm:items-center justify-center sm:p-4"
          style={{
            background: 'rgba(4, 7, 18, 0.58)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
          onClick={() => !saving && onClose()}
        >
          <motion.div
            key="qa-sheet"
            initial={{ y: '100%', opacity: 0.95 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.95 }}
            transition={{ type: 'spring', stiffness: 390, damping: 35 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden border border-slate-200/80"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="sm:hidden flex justify-center pt-2.5">
              <div className="w-10 h-1.5 rounded-full bg-slate-300" />
            </div>

            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <Zap className="w-5 h-5 text-amber-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-slate-400" />
                    Ajuste Express Comercial
                  </p>
                  <h3 className="text-sm font-black text-slate-900 truncate">{product.name}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[78dvh] overflow-y-auto bg-[#eef2f6]/55">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#eef2ff] border border-indigo-300 border-l-[3.5px] border-l-indigo-600 p-3 shadow-2xs">
                  <label className="text-[10px] font-black uppercase text-indigo-900 block mb-1">
                    🏷️ Precio Web ($)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-transparent text-[18px] font-black text-slate-900 focus:outline-none tabular-nums"
                  />
                </div>
                <div className="rounded-2xl bg-[#fffbeb] border border-amber-300 border-l-[3.5px] border-l-amber-600 p-3 shadow-2xs">
                  <label className="text-[10px] font-black uppercase text-amber-950 block mb-1">
                    📦 Costo Base ($)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    className="w-full bg-transparent text-[18px] font-black text-slate-800 focus:outline-none tabular-nums"
                  />
                </div>
              </div>

              <ProfitEngineWidget
                price={numPrice}
                cost={numCost}
                onChangePrice={setPrice}
                onChangeCost={setCost}
                onApplyMarkup={(m) => {
                  if (numCost > 0) {
                    setPrice(String(Math.round((numCost * (1 + m / 100)) / 10) * 10));
                  }
                }}
                formatCurrency={formatCurrency}
              />

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800">Stock Disponible</span>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setUnlimited((v) => !v);
                    }}
                    className={`px-3 py-1 rounded-xl text-[11px] font-extrabold border transition flex items-center gap-1 cursor-pointer ${
                      unlimited
                        ? 'bg-slate-200/90 text-slate-900 border-slate-400'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    <InfinityIcon className="w-3.5 h-3.5" />
                    <span>Ilimitado</span>
                  </button>
                </div>

                {!unlimited && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setStock(String(Math.max(0, (Number(stock) || 0) - 1)))}
                        className="w-10 h-10 rounded-xl bg-white border border-slate-200 font-black text-slate-800 cursor-pointer"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={stock}
                        onChange={(e) => setStock(e.target.value)}
                        className="flex-1 h-10 px-3 bg-white border border-slate-200 rounded-xl text-center text-[16px] font-black text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-300"
                      />
                      <button
                        type="button"
                        onClick={() => setStock(String(Math.max(0, (Number(stock) || 0) + 1)))}
                        className="w-10 h-10 rounded-xl bg-slate-200/90 text-slate-900 font-black cursor-pointer"
                      >
                        +
                      </button>
                    </div>

                    <div className="grid grid-cols-6 gap-1.5">
                      {QUICK_STOCK_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setUnlimited(false);
                            setStock(String(preset));
                          }}
                          className="py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-extrabold text-slate-700 hover:border-slate-300 cursor-pointer tabular-nums"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-2 pt-1 pr-10 sm:pr-0">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-extrabold text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  className="wpw-cta-shimmer flex-[1.7] py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-black text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
                  <span>{saving ? 'Guardando…' : 'Aplicar al instante'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ─────────────────── Mobile Floating Glass Thumb Dock ─────────────────── */
export function MobileFloatingIsland({
  hidden,
  selectedCount,
  bulkUpdating,
  mobileGridMode,
  onToggleMobileGrid,
  onFocusSearch,
  onOpenCreate,
  onBulkAction,
  onClearSelection,
}: {
  hidden: boolean;
  selectedCount: number;
  bulkUpdating: boolean;
  mobileGridMode: boolean;
  onToggleMobileGrid: () => void;
  onFocusSearch: () => void;
  onOpenCreate: () => void;
  onBulkAction: (action: 'show' | 'hide' | 'unlimited' | 'delete') => void;
  onClearSelection: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || hidden) return null;

  return createPortal(
    <div
      className="sm:hidden fixed left-3 right-16 z-[90] pointer-events-none"
      style={{ bottom: 'max(0.85rem, env(safe-area-inset-bottom))' }}
    >
      <AnimatePresence mode="wait">
        {selectedCount > 0 ? (
          <motion.div
            key="bulk-island"
            initial={{ y: 50, opacity: 0, scale: 0.94 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="pointer-events-auto rounded-2xl bg-white/95 text-slate-800 backdrop-blur-2xl border border-slate-200 shadow-[0_10px_28px_-8px_rgba(15,23,42,0.14)] p-2 flex items-center justify-between gap-1.5"
          >
            <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-black tabular-nums shrink-0">
              {selectedCount} sel.
            </span>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <button
                type="button"
                disabled={bulkUpdating}
                onClick={() => onBulkAction('show')}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-extrabold shrink-0 cursor-pointer"
              >
                Mostrar
              </button>
              <button
                type="button"
                disabled={bulkUpdating}
                onClick={() => onBulkAction('hide')}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-extrabold shrink-0 cursor-pointer"
              >
                Ocultar
              </button>
              <button
                type="button"
                disabled={bulkUpdating}
                onClick={() => onBulkAction('unlimited')}
                className="px-2 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-extrabold shrink-0 cursor-pointer"
              >
                ∞
              </button>
              <button
                type="button"
                disabled={bulkUpdating}
                onClick={() => onBulkAction('delete')}
                className="px-2 py-1.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-extrabold shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={onClearSelection}
              className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 cursor-pointer"
              aria-label="Limpiar selección"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="nav-island"
            initial={{ y: 50, opacity: 0, scale: 0.94 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="pointer-events-auto rounded-[22px] bg-white/95 text-slate-800 backdrop-blur-2xl border border-slate-200 shadow-[0_10px_28px_-8px_rgba(15,23,42,0.12)] p-1.5 flex items-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onFocusSearch();
              }}
              className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200/80 flex items-center justify-center text-slate-600 active:scale-90 transition shrink-0 cursor-pointer"
              aria-label="Buscar producto"
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onToggleMobileGrid();
              }}
              className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200/80 flex items-center justify-center text-slate-600 active:scale-90 transition shrink-0 cursor-pointer"
              aria-label="Cambiar vista móvil"
            >
              {mobileGridMode ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onOpenCreate();
              }}
              className="wpw-cta-shimmer flex-1 h-10 rounded-2xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Nuevo Producto</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}
