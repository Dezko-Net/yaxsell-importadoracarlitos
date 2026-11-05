'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Eye,
  FileText,
  Filter,
  Image as ImageIcon,
  LoaderCircle,
  Minus,
  Package,
  Palette,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Sliders,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import {
  createPosPriceLabelsPdf,
  type LabelTheme,
  type NumberWeight,
  type PosPriceLabel,
  type PosPriceLabelConfig,
  type PriceSize,
  type TitleSize,
  THEMES,
} from '@/lib/posPriceLabelsPdf';

export type RecentPriceLabelProduct = {
  sku: string;
  nombre: string;
  imageUrl?: string | null;
  codigo_barra?: string;
  categoria?: string;
  subcategoria?: string;
  proveedor?: string;
  cantidad_embalaje?: string;
  precio_venta_1?: number;
  precio_venta_2?: number;
  precio_venta_3?: number;
  min_qty_2?: number;
  min_qty_3?: number;
  label_p2?: string;
  label_p3?: string;
  stock?: number;
  createdAt?: number;
};

export type PackFilter = 'all' | 'x6' | 'x3' | 'sin_pack';

const formatPrice = (value: number) =>
  `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(value))}`;

const parsePackageQuantity = (value: unknown) => {
  const match = String(value ?? '').match(/\d+/);
  const quantity = match ? Number(match[0]) : 0;
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
};

export type PriceSlotInfo = {
  price: number;
  label: string;
  rawLabel: string;
  qty: number;
  isX6: boolean;
  isX3: boolean;
};

export type ProductPricesInfo = {
  p1: { price: number; label: string; qty: number };
  p2: PriceSlotInfo | null;
  p3: PriceSlotInfo | null;
  defaultSecondary: 'p2' | 'p3' | 'none';
  packType: 'x6' | 'x3' | 'otro_pack' | 'sin_pack';
  hasPack: boolean;
  packLabel: string;
  packPrice: number;
  packQty: number;
  unitsPerBox: number;
};

function PackLabelEditControl({
  label,
  quantity,
  packageQty,
  onApply,
}: {
  label: string;
  quantity: number;
  packageQty: number;
  onApply: (label: string, quantity: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(label);
  const [quantityDraft, setQuantityDraft] = useState(String(quantity));
  const quantityPresets = Array.from(new Set([packageQty, 3, 6, 12].filter(value => value > 1)));

  const labelForQuantity = (nextQuantity: number) => {
    const currentLabel = draft.trim();
    return /^x\s*(?:\d+|caja)$/i.test(currentLabel)
      ? `X ${nextQuantity}`
      : currentLabel || `X ${nextQuantity}`;
  };

  const applyQuantity = (nextQuantity: number) => {
    if (!Number.isFinite(nextQuantity) || nextQuantity < 2) return;
    const normalizedQuantity = Math.round(nextQuantity);
    onApply(labelForQuantity(normalizedQuantity), normalizedQuantity);
    setOpen(false);
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setDraft(label);
          setQuantityDraft(String(quantity));
          setOpen(value => !value);
        }}
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 text-[10px] font-extrabold text-sky-700 hover:border-sky-300 hover:bg-sky-100 transition cursor-pointer"
        aria-label={`Editar etiqueta ${label}`}
        aria-expanded={open}
      >
        <Pencil size={11} />
        Editar etiqueta
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl"
          onClick={event => event.stopPropagation()}
        >
          <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-500">Cantidad en la etiqueta</p>
          {packageQty > 1 && (
            <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-800">
              La caja trae {packageQty} unidades
            </p>
          )}
          <div className="grid grid-cols-2 gap-1">
            {quantityPresets.map(presetQty => (
              <button
                key={presetQty}
                type="button"
                onClick={() => applyQuantity(presetQty)}
                className={`rounded-lg border px-2 py-1.5 text-[10px] font-extrabold transition cursor-pointer ${
                  quantity === presetQty
                    ? 'border-sky-300 bg-sky-50 text-sky-800'
                    : 'border-slate-200 text-slate-600 hover:border-sky-200 hover:bg-sky-50'
                }`}
              >
                {presetQty === packageQty ? `Caja · ${presetQty}` : `X ${presetQty}`}
              </button>
            ))}
          </div>
          <label className="mt-2 block text-[10px] font-bold text-slate-500">
            Otra cantidad
            <input
              type="number"
              inputMode="numeric"
              min="2"
              max="999"
              step="1"
              value={quantityDraft}
              onChange={event => setQuantityDraft(event.target.value)}
              onWheel={event => event.currentTarget.blur()}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-800 outline-none focus:border-sky-400"
            />
          </label>
          <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-slate-500">Texto opcional en el PDF</p>
          <input
            type="text"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            maxLength={18}
            placeholder="Etiqueta personalizada"
            className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-800 outline-none focus:border-sky-400"
          />
          <div className="mt-2 flex justify-end gap-1.5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100 cursor-pointer">Cancelar</button>
            <button
              type="button"
              onClick={() => {
                const nextQuantity = Number(quantityDraft);
                if (Number.isFinite(nextQuantity) && nextQuantity >= 2) {
                  applyQuantity(nextQuantity);
                  setOpen(false);
                }
              }}
              disabled={!Number.isFinite(Number(quantityDraft)) || Number(quantityDraft) < 2}
              className="rounded-lg bg-sky-600 px-2.5 py-1 text-[10px] font-extrabold text-white hover:bg-sky-700 disabled:opacity-40 cursor-pointer"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PackPriceEditControl({
  productName,
  slot,
  originalPrice,
  value,
  onChange,
  onReset,
}: {
  productName: string;
  slot: 'p2' | 'p3';
  originalPrice: number;
  value?: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div
      className="flex shrink-0 flex-col items-center rounded-lg border border-slate-200 bg-white px-1.5 py-1"
      title={`Este precio ${slot.toUpperCase()} solo cambia en este PDF; el producto queda igual.`}
      onClick={event => event.stopPropagation()}
    >
      <span className="text-[8px] font-extrabold uppercase tracking-wide text-slate-400">{slot.toUpperCase()} · PDF</span>
      <div className="flex items-center gap-0.5">
        <span className="text-[9px] font-bold text-slate-400">$</span>
        <input
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          aria-label={`Precio ${slot.toUpperCase()} solo para PDF: ${productName}`}
          value={value ?? String(originalPrice)}
          onChange={event => onChange(event.target.value)}
          onBlur={() => {
            if (value === undefined) return;
            const normalized = Math.round(Number(value));
            if (!Number.isFinite(normalized) || normalized <= 0 || normalized === originalPrice) onReset();
            else onChange(String(normalized));
          }}
          className="w-[68px] bg-transparent text-right text-[11px] font-black font-mono text-slate-800 outline-none focus:text-sky-700"
        />
        {value !== undefined && (
          <button
            type="button"
            onClick={onReset}
            className="grid h-5 w-5 place-items-center rounded text-slate-400 hover:bg-sky-50 hover:text-sky-700"
            title="Restaurar precio original"
            aria-label={`Restaurar precio ${slot.toUpperCase()} de ${productName}`}
          >
            <RotateCcw size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

// Helper exhaustivo para analizar TODOS los precios del producto (P1, P2 y P3)
function detectProductPack(product: RecentPriceLabelProduct): ProductPricesInfo {
  const p1 = Number(product.precio_venta_1 || 0);
  const p2 = Number(product.precio_venta_2 || 0);
  const p3 = Number(product.precio_venta_3 || 0);

  const label2 = String(product.label_p2 || '').trim();
  const label3 = String(product.label_p3 || '').trim();
  const minQty2 = Number(product.min_qty_2 || 0);
  const minQty3 = Number(product.min_qty_3 || 0);
  const embalaje = String(product.cantidad_embalaje || '').trim();
  const unitsPerBox = parsePackageQuantity(embalaje);

  // Detección en P2
  let qty2 = minQty2 > 1 ? minQty2 : 0;
  if (!qty2) {
    const m = label2.match(/\b(?:x\s*|pack\s*)?(\d+)\b/i);
    if (m) qty2 = Number(m[1]);
    else if (/caja|embalaje/i.test(label2) || p2 > 0) qty2 = unitsPerBox;
  }
  const isP2X6 = qty2 === 6 || /\b(?:x\s*6|pack\s*6|6\s*u(?:nidades|nid|ds)?)\b/i.test(label2);
  const isP2X3 = qty2 === 3 || /\b(?:x\s*3|pack\s*3|3\s*u(?:nidades|nid|ds)?)\b/i.test(label2);
  const tagP2 = isP2X6 ? 'X 6' : isP2X3 ? 'X 3' : (qty2 > 1 ? `X ${qty2}` : (label2 || 'P2'));

  // Detección en P3 (muy común en Importadora Carlitos para embalajes de 6 u otros)
  let qty3 = minQty3 > 1 ? minQty3 : 0;
  if (!qty3) {
    const m = label3.match(/\b(?:x\s*|pack\s*)?(\d+)\b/i);
    if (m) qty3 = Number(m[1]);
    else if (/caja|embalaje/i.test(label3) || p3 > 0) qty3 = unitsPerBox;
  }
  const isP3X6 = qty3 === 6 || /\b(?:x\s*6|pack\s*6|6\s*u(?:nidades|nid|ds)?)\b/i.test(label3);
  const isP3X3 = qty3 === 3 || /\b(?:x\s*3|pack\s*3|3\s*u(?:nidades|nid|ds)?)\b/i.test(label3);
  const tagP3 = isP3X6 ? 'X 6' : isP3X3 ? 'X 3' : (qty3 > 1 ? `X ${qty3}` : (label3 || 'P3'));

  const p2Info: PriceSlotInfo | null = p2 > 0 ? {
    price: p2,
    label: tagP2,
    rawLabel: label2 || 'Precio 2',
    qty: qty2 || 2,
    isX6: isP2X6,
    isX3: isP2X3,
  } : null;

  const p3Info: PriceSlotInfo | null = p3 > 0 ? {
    price: p3,
    label: tagP3,
    rawLabel: label3 || 'Precio 3',
    qty: qty3 || 3,
    isX6: isP3X6,
    isX3: isP3X3,
  } : null;

  // Determinar el mejor pack por defecto (preferir X6, luego X3, luego P2, luego P3)
  let defaultSecondary: 'p2' | 'p3' | 'none' = 'none';
  if (p3Info && p3Info.isX6) defaultSecondary = 'p3';
  else if (p2Info && p2Info.isX6) defaultSecondary = 'p2';
  else if (p3Info && p3Info.isX3) defaultSecondary = 'p3';
  else if (p2Info && p2Info.isX3) defaultSecondary = 'p2';
  else if (p2Info && p2Info.price !== p1) defaultSecondary = 'p2';
  else if (p3Info && p3Info.price !== p1) defaultSecondary = 'p3';

  const isX6 = (p2Info?.isX6 || p3Info?.isX6) ?? false;
  const isX3 = (p2Info?.isX3 || p3Info?.isX3) ?? false;
  const hasAnyPack = isX6 || isX3 || (p2 > 0 && p2 !== p1) || (p3 > 0 && p3 !== p1);

  const packType: 'x6' | 'x3' | 'otro_pack' | 'sin_pack' =
    isX6 ? 'x6' :
    isX3 ? 'x3' :
    hasAnyPack ? 'otro_pack' : 'sin_pack';

  const bestSlot = defaultSecondary === 'p3' ? p3Info : defaultSecondary === 'p2' ? p2Info : null;

  return {
    p1: { price: p1, label: 'X 1', qty: 1 },
    p2: p2Info,
    p3: p3Info,
    defaultSecondary,
    packType,
    hasPack: Boolean(bestSlot),
    packLabel: bestSlot?.label || 'Sin Pack',
    packPrice: bestSlot?.price || 0,
    packQty: bestSlot?.qty || 1,
    unitsPerBox,
  };
}

export default function RecentPriceLabelsModal({
  products,
  onClose,
  title,
  subtitle,
  initialLimit,
}: {
  products: RecentPriceLabelProduct[];
  onClose: () => void;
  title?: string;
  subtitle?: string;
  initialLimit?: number;
}) {
  // Tabs: 'productos' (lista y selección) | 'personalizar' (colores, tamaños, vista previa)
  const [activeTab, setActiveTab] = useState<'productos' | 'personalizar'>('productos');

  // Límite de productos mostrados (por defecto 20 o initialLimit)
  const [limit, setLimit] = useState<number>(initialLimit !== undefined ? initialLimit : 20);

  // Filtro de pack: 'all' | 'x6' | 'x3' | 'sin_pack'
  const [packFilter, setPackFilter] = useState<PackFilter>('all');

  // Búsqueda en tiempo real
  const [searchQuery, setSearchQuery] = useState('');

  // Selección individual (inicia vacía; no se auto-marca al buscar)
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(() => new Set());
  // Selección personalizada de pack por producto ('p2' | 'p3' | 'none')
  const [chosenPackSlotMap, setChosenPackSlotMap] = useState<Record<string, 'p2' | 'p3' | 'none'>>({});
  // Etiquetas editables solo para esta impresión; el PDF recibe el texto elegido.
  const [packLabelOverrides, setPackLabelOverrides] = useState<Record<string, string>>({});
  const [packQuantityOverrides, setPackQuantityOverrides] = useState<Record<string, number>>({});

  // Dropdown personalizado de límite para evitar truncamiento y recortes nativos de Windows
  const [isLimitDropdownOpen, setIsLimitDropdownOpen] = useState(false);
  const limitDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (limitDropdownRef.current && !limitDropdownRef.current.contains(e.target as Node)) {
        setIsLimitDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const LIMIT_OPTIONS = [
    { value: 20, label: 'Últimos 20' },
    { value: 50, label: 'Últimos 50' },
    { value: 100, label: 'Últimos 100' },
    { value: 0, label: 'Todos los productos' },
  ];

  // ── OPCIONES DE PERSONALIZACIÓN PARA TODAS LAS FICHAS / ETIQUETAS ──
  const [theme, setTheme] = useState<LabelTheme>('bw');
  const [gridFormat, setGridFormat] = useState<'2h' | '10' | '8' | '12' | '16' | '4'>('2h');
  // Estos precios viven solo en el modal: nunca se escriben en el producto.
  const [printPriceOverrides, setPrintPriceOverrides] = useState<Record<string, string>>({});
  const [packPriceOverrides, setPackPriceOverrides] = useState<Record<string, string>>({});
  const [titleSize, setTitleSize] = useState<TitleSize>('normal');
  const [priceSize, setPriceSize] = useState<PriceSize>('normal');
  const [numberWeight, setNumberWeight] = useState<NumberWeight>('heavy');
  const [borderStyle, setBorderStyle] = useState<'dashed' | 'solid' | 'none'>('dashed');

  // Modo de vista previa: 'sheet' (Hoja A4 completa con todas las etiquetas) o 'single' (Ficha individual 1:1)
  const [previewMode, setPreviewMode] = useState<'sheet' | 'single'>('sheet');

  // Configuración dinámica de la cuadrícula de la Hoja A4
  const previewGrid = useMemo(() => {
    const cols = gridFormat === '2h' ? 1 : gridFormat === '12' ? 3 : 2;
    const rows =
      gridFormat === '2h' ? 2 :
      gridFormat === '4' ? 2 :
      gridFormat === '8' ? 4 :
      gridFormat === '12' ? 4 :
      gridFormat === '16' ? 8 : 5;
    const totalSlots = cols * rows;
    const formatLabel =
      gridFormat === '2h' ? '2 por hoja (1x2 · Horizontal 198×141 mm)' :
      gridFormat === '4' ? '4 por hoja (2x2 · Cartel 98×141 mm)' :
      gridFormat === '8' ? '8 por hoja (2x4 · Grande 98×71 mm)' :
      gridFormat === '12' ? '12 por hoja (3x4 · Mediano 65×71 mm)' :
      gridFormat === '16' ? '16 por hoja (2x8 · Compacto 98×35 mm)' :
      '10 por hoja (2x5 · Góndola 98×56 mm)';

    return { cols, rows, totalSlots, formatLabel };
  }, [gridFormat]);

  const getMainPrice = (product: RecentPriceLabelProduct) => {
    const originalPrice = Number(product.precio_venta_1 || 0);
    const override = printPriceOverrides[product.sku];
    if (override === undefined || override.trim() === '') return originalPrice;
    const parsed = Number(override);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : originalPrice;
  };

  const updatePrintPrice = (product: RecentPriceLabelProduct, value: string) => {
    setPrintPriceOverrides(current => ({ ...current, [product.sku]: value }));
  };

  const resetPrintPrice = (sku: string) => {
    setPrintPriceOverrides(current => {
      const next = { ...current };
      delete next[sku];
      return next;
    });
  };

  const packPriceKey = (sku: string, slot: 'p2' | 'p3') => `${sku}:${slot}`;
  const getPackPrice = (sku: string, slot: 'p2' | 'p3', originalPrice: number) => {
    const override = packPriceOverrides[packPriceKey(sku, slot)];
    if (override === undefined || override.trim() === '') return originalPrice;
    const parsed = Number(override);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : originalPrice;
  };
  const updatePackPrice = (sku: string, slot: 'p2' | 'p3', value: string) => {
    setPackPriceOverrides(current => ({ ...current, [packPriceKey(sku, slot)]: value }));
  };
  const resetPackPrice = (sku: string, slot: 'p2' | 'p3') => {
    setPackPriceOverrides(current => {
      const next = { ...current };
      delete next[packPriceKey(sku, slot)];
      return next;
    });
  };
  const [includeSecondPrice, setIncludeSecondPrice] = useState(true);
  const [secondPriceMode, setSecondPriceMode] = useState<'auto' | 'force_6' | 'force_3' | 'force_12'>('auto');
  const [showSku, setShowSku] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [showHeader, setShowHeader] = useState(true);
  const [headerText, setHeaderText] = useState('Importadora Carlitos');

  // Estado de descarga
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Pre-computar packs de los productos
  const productsWithPack = useMemo(() => {
    return products.map(product => ({
      product,
      pack: detectProductPack(product),
    }));
  }, [products]);

  // Contadores globales por tipo de pack
  const packCounts = useMemo(() => {
    let all = 0;
    let x6 = 0;
    let x3 = 0;
    let sinPack = 0;

    productsWithPack.forEach(({ product, pack }) => {
      if (Number(product.precio_venta_1) <= 0) return;
      all++;
      if (pack.packType === 'x6') x6++;
      else if (pack.packType === 'x3') x3++;
      else if (!pack.hasPack) sinPack++;
    });

    return { all, x6, x3, sinPack };
  }, [productsWithPack]);

  // Filtrar catálogo completo según búsqueda y filtro de pack
  const filteredCatalog = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return productsWithPack.filter(({ product, pack }) => {
      if (Number(product.precio_venta_1) <= 0) return false;

      // Filtro de pack
      if (packFilter === 'x6' && pack.packType !== 'x6') return false;
      if (packFilter === 'x3' && pack.packType !== 'x3') return false;
      if (packFilter === 'sin_pack' && pack.hasPack) return false;

      // Búsqueda
      if (q) {
        const matchName = product.nombre?.toLowerCase().includes(q);
        const matchSku = product.sku?.toLowerCase().includes(q);
        const matchBarcode = product.codigo_barra?.toLowerCase().includes(q);
        const matchCat = product.categoria?.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchBarcode && !matchCat) return false;
      }

      return true;
    });
  }, [productsWithPack, packFilter, searchQuery]);

  // Aplicar límite (últimos 20 subidos por defecto)
  const displayProducts = useMemo(() => {
    if (limit === 0) return filteredCatalog;
    return filteredCatalog.slice(0, limit);
  }, [filteredCatalog, limit]);

  // Nota: No se auto-seleccionan productos al buscar o filtrar; la cajera marca manualmente.

  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !generating) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [generating, onClose]);

  // Acciones de selección
  const toggleProduct = (sku: string) => {
    setSelectedSkus(current => {
      const next = new Set(current);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedSkus(new Set(displayProducts.map(({ product }) => product.sku)));
  };

  const deselectAll = () => {
    setSelectedSkus(new Set());
  };

  const invertSelection = () => {
    setSelectedSkus(current => {
      const next = new Set<string>();
      displayProducts.forEach(({ product }) => {
        if (!current.has(product.sku)) next.add(product.sku);
      });
      return next;
    });
  };

  // Alternar qué precio de pack se imprime para cada producto ('p2' | 'p3' | 'none')
  const togglePackSlot = (sku: string, slot: 'p2' | 'p3', defaultSlot: 'p2' | 'p3' | 'none') => {
    setChosenPackSlotMap(prev => {
      const current = prev[sku] ?? defaultSlot;
      const next = current === slot ? 'none' : slot;
      return { ...prev, [sku]: next };
    });
  };

  const packLabelKey = (sku: string, slot: 'p2' | 'p3') => `${sku}:${slot}`;
  const getPackLabel = (sku: string, slot: 'p2' | 'p3', defaultLabel: string) =>
    packLabelOverrides[packLabelKey(sku, slot)] || defaultLabel;
  const getPackQuantity = (sku: string, slot: 'p2' | 'p3', defaultQuantity: number) =>
    packQuantityOverrides[packLabelKey(sku, slot)] ?? defaultQuantity;
  const applyPackLabel = (sku: string, slot: 'p2' | 'p3', label: string, quantity: number) => {
    const normalized = label.trim();
    if (!normalized || !Number.isFinite(quantity) || quantity < 2) return;
    const key = packLabelKey(sku, slot);
    setPackLabelOverrides(current => ({ ...current, [key]: normalized }));
    setPackQuantityOverrides(current => ({ ...current, [key]: Math.round(quantity) }));
  };

  // Cálculo de totales seleccionados y páginas A4 (1 etiqueta por producto seleccionado)
  const selectedCount = displayProducts.filter(({ product }) => selectedSkus.has(product.sku)).length;
  const totalLabelsToPrint = selectedCount;

  const labelsPerPage =
    gridFormat === '2h' ? 2 :
    gridFormat === '4' ? 4 :
    gridFormat === '8' ? 8 :
    gridFormat === '12' ? 12 :
    gridFormat === '16' ? 16 : 10;
  const estimatedPages = Math.ceil(totalLabelsToPrint / labelsPerPage) || 1;

  // Producto muestra para la vista previa en vivo
  const previewSample = useMemo(() => {
    const firstSelected = displayProducts.find(({ product }) => selectedSkus.has(product.sku));
    if (firstSelected) return firstSelected;
    if (displayProducts.length > 0) return displayProducts[0];
    if (productsWithPack.length > 0) return productsWithPack[0];
    return null;
  }, [displayProducts, selectedSkus, productsWithPack]);

  // Colección de productos para rellenar la Hoja A4 completa
  const sheetItems = useMemo(() => {
    const selected = displayProducts.filter(({ product }) => selectedSkus.has(product.sku));
    const pool = selected.length ? selected : (previewSample ? [previewSample] : productsWithPack.slice(0, previewGrid.totalSlots));
    if (!pool.length) return [];

    const items = [];
    for (let i = 0; i < previewGrid.totalSlots; i++) {
      items.push(pool[i % pool.length]);
    }
    return items;
  }, [displayProducts, selectedSkus, previewSample, productsWithPack, previewGrid.totalSlots]);

  // Generador de PDF
  const generatePdf = async () => {
    const selected = displayProducts.filter(({ product }) => selectedSkus.has(product.sku));
    if (!selected.length) return;

    setGenerating(true);
    setError('');
    try {
      const labels: PosPriceLabel[] = selected.map(({ product, pack }) => {
        const unitPrice = getMainPrice(product);
        let qPrice: number | undefined = undefined;
        let qNumber: number | undefined = undefined;
        let qLabel: string | undefined = undefined;

        if (includeSecondPrice) {
          if (secondPriceMode === 'force_6') {
            qNumber = 6;
            qPrice = getPackPrice(product.sku, 'p2', Number(product.precio_venta_2) > 0 ? Number(product.precio_venta_2) : Math.round(unitPrice * 0.9));
            qLabel = 'X 6';
          } else if (secondPriceMode === 'force_3') {
            qNumber = 3;
            qPrice = getPackPrice(product.sku, 'p2', Number(product.precio_venta_2) > 0 ? Number(product.precio_venta_2) : Math.round(unitPrice * 0.93));
            qLabel = 'X 3';
          } else if (secondPriceMode === 'force_12') {
            qNumber = 12;
            qPrice = getPackPrice(product.sku, 'p2', Number(product.precio_venta_2) > 0 ? Number(product.precio_venta_2) : Math.round(unitPrice * 0.85));
            qLabel = 'X 12';
          } else {
            const chosenSlot = chosenPackSlotMap[product.sku] ?? pack.defaultSecondary;
            if (chosenSlot === 'p2' && pack.p2) {
              qPrice = getPackPrice(product.sku, 'p2', pack.p2.price);
              qNumber = getPackQuantity(product.sku, 'p2', pack.p2.qty);
              qLabel = getPackLabel(product.sku, 'p2', pack.p2.label);
            } else if (chosenSlot === 'p3' && pack.p3) {
              qPrice = getPackPrice(product.sku, 'p3', pack.p3.price);
              qNumber = getPackQuantity(product.sku, 'p3', pack.p3.qty);
              qLabel = getPackLabel(product.sku, 'p3', pack.p3.label);
            }
          }
        }

        return {
          name: product.nombre,
          sku: product.sku,
          barcode: product.codigo_barra,
          unitPrice,
          quantityPrice: qPrice,
          quantity: qNumber,
          quantityLabel: qLabel,
          copies: 1,
        };
      });

      // Mapear distribución de cuadrícula
      const cols = gridFormat === '2h' ? 1 : gridFormat === '12' ? 3 : 2;
      const rows =
        gridFormat === '2h' ? 2 :
        gridFormat === '4' ? 2 :
        gridFormat === '8' ? 4 :
        gridFormat === '12' ? 4 :
        gridFormat === '16' ? 8 : 5;

      const pdfConfig: PosPriceLabelConfig = {
        columns: cols,
        rows: rows,
        theme: theme,
        headerText: showHeader ? headerText : '',
        borderStyle: borderStyle,
        fontSize: priceSize,
        priceSize: priceSize,
        titleSize: titleSize,
        numberWeight: numberWeight,
        showSecondPrice: includeSecondPrice,
        showSku: showSku,
        showBarcode: showBarcode,
      };

      const pdf = createPosPriceLabelsPdf(labels, pdfConfig);
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date());
      pdf.save(`etiquetas-importadora-carlitos-${date}.pdf`);
    } catch (cause) {
      console.error('[etiquetas-precios] Error generando PDF:', cause);
      setError('No se pudo generar el PDF. Verifica los datos e intenta nuevamente.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden bg-slate-950/60 backdrop-blur-xs"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !generating) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="recent-price-labels-title"
        aria-modal="true"
        className="flex flex-col w-full max-w-5xl xl:max-w-6xl max-h-[calc(100dvh-1.25rem)] sm:max-h-[calc(100dvh-2.5rem)] h-full sm:h-auto bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
        role="dialog"
      >
        {/* ── HEADER SUPERIOR NATIVO (NO CHOCA CON NINGUNA NAVBAR) ── */}
        <header className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-3.5 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-200">
              <Printer size={19} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="recent-price-labels-title" className="text-base sm:text-lg font-black tracking-tight text-slate-900 truncate">
                  {title || 'Impresión de Etiquetas de Precios'}
                </h2>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-sky-50 text-sky-700 border border-sky-200">
                  A4 · Fleje Góndola
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                {subtitle || 'Filtra por pack X6, X3 o sin pack · Personaliza color y tamaño para todas'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Botón selector de Pestañas */}
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('productos')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'productos'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Tag size={13} />
                <span>Productos ({selectedCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('personalizar')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'personalizar'
                    ? 'bg-white text-sky-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Palette size={13} />
                <span>Personalizar & Vista Previa</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              aria-label="Cerrar modal"
              className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* ════════════════════════════════════════════════════════════════════════════
            PESTAÑA 1: SELECCIÓN Y FILTRO DE PRODUCTOS (X6, X3, SIN PACK, ÚLTIMOS 20)
            ════════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'productos' && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Barra de Filtros de Pack y Alcance de Últimos Subidos */}
            <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 sm:px-6 space-y-2.5">
              {/* Fila 1: Filtro de Pack (X6, X3, Sin Pack, Todos) + Selector Últimos 20 */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Pills de Pack */}
                <div className="flex items-center gap-1.5 flex-wrap" role="tablist" aria-label="Filtrar por tipo de pack">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mr-1 hidden sm:inline">
                    Packs:
                  </span>

                  <button
                    type="button"
                    onClick={() => setPackFilter('all')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      packFilter === 'all'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>Todos</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${packFilter === 'all' ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {packCounts.all}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPackFilter('x6')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                      packFilter === 'x6'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    <span>📦 Pack X6</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${packFilter === 'x6' ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-800'}`}>
                      {packCounts.x6}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPackFilter('x3')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                      packFilter === 'x3'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    <span>📦 Pack X3</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${packFilter === 'x3' ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                      {packCounts.x3}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPackFilter('sin_pack')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                      packFilter === 'sin_pack'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
                    }`}
                  >
                    <span>🏷️ Sin Pack</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${packFilter === 'sin_pack' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'}`}>
                      {packCounts.sinPack}
                    </span>
                  </button>
                </div>

                {/* Selector de últimos subidos: Dropdown estilizado que no se corta ni trunca */}
                <div className="relative shrink-0 ml-auto sm:ml-0" ref={limitDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsLimitDropdownOpen(prev => !prev)}
                    className="h-8.5 px-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer flex items-center gap-2 shadow-2xs text-xs font-bold text-slate-800"
                  >
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
                      Mostrar:
                    </span>
                    <span className="text-slate-800 font-extrabold">
                      {LIMIT_OPTIONS.find(o => o.value === limit)?.label || `${limit} subidos`}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-slate-400 transition-transform duration-200 ${
                        isLimitDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isLimitDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 py-1.5 overflow-hidden">
                      {LIMIT_OPTIONS.map(opt => {
                        const isSelected = limit === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setLimit(opt.value);
                              setIsLimitDropdownOpen(false);
                            }}
                            className={`w-full px-3.5 py-2 text-left text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                              isSelected
                                ? 'bg-sky-50 text-sky-700 font-black'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span>{opt.label}</span>
                            {isSelected && <Check size={14} className="text-sky-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Fila 2: Buscador por Nombre/SKU/Barra + Acciones Rápidas */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <div className="relative w-full sm:max-w-md">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar producto por nombre, SKU, barra o categoría..."
                    className="w-full h-8.5 rounded-xl border border-slate-200 bg-white pl-8.5 pr-8 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition shadow-2xs"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto text-xs">
                  <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                    {displayProducts.length} mostrados · <strong className="text-slate-800">{selectedCount}</strong> selec.
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 transition cursor-pointer"
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
                    >
                      Ninguno
                    </button>
                    <button
                      type="button"
                      onClick={invertSelection}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-200/60 transition cursor-pointer hidden md:inline"
                    >
                      Invertir
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── LISTA DE PRODUCTOS CON SCROLL INTERNO TOTALMENTE FLUIDO ── */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 space-y-2 bg-slate-50/40">
              {displayProducts.length ? (
                displayProducts.map(({ product, pack }, index) => {
                  const hasUnitPrice = Number(product.precio_venta_1) > 0;
                  const selected = selectedSkus.has(product.sku);

                  return (
                    <div
                      key={`${product.sku}-${index}`}
                      onClick={() => {
                        if (hasUnitPrice) toggleProduct(product.sku);
                      }}
                      className={`group flex flex-col sm:flex-row sm:items-center items-stretch justify-between gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-2xl border transition cursor-pointer ${
                        !hasUnitPrice
                          ? 'opacity-60 border-amber-200 bg-amber-50/40 cursor-not-allowed'
                          : selected
                          ? 'border-sky-300 bg-sky-50/60 shadow-2xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 w-full sm:flex-1">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={selected && hasUnitPrice}
                          disabled={!hasUnitPrice}
                          onChange={() => toggleProduct(product.sku)}
                          onClick={e => e.stopPropagation()}
                          className="h-4 w-4 shrink-0 rounded accent-sky-600 cursor-pointer"
                        />

                        {/* Thumbnail */}
                        <div className="relative h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-contain"
                              onError={e => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <ImageIcon size={18} className="text-slate-300" />
                          )}
                        </div>

                        {/* Textos del producto */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                              {product.nombre || 'Sin nombre'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                              SKU: {product.sku}
                            </span>
                            {product.codigo_barra && (
                              <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                                {product.codigo_barra}
                              </span>
                            )}
                            {product.categoria && (
                              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md hidden md:inline truncate max-w-32">
                                {product.categoria}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ── GUÍA DE TODOS LOS PRECIOS (P1, P2, P3) & SELECTOR DE PACK PARA LA CAJERA ── */}
                      <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto sm:shrink-0 flex-wrap justify-start sm:justify-end" onClick={e => e.stopPropagation()}>
                        {pack.unitsPerBox > 0 && (
                          <div className="flex flex-col items-end px-2.5 py-1 rounded-xl border border-amber-200 bg-amber-50 text-amber-900">
                            <div className="flex items-center gap-1">
                              <Package size={12} />
                              <span className="text-xs sm:text-sm font-black font-mono">{pack.unitsPerBox} uds</span>
                            </div>
                            <span className="text-[8.5px] font-bold uppercase tracking-wider text-amber-700">Por caja</span>
                          </div>
                        )}
                        {/* P1: Detalle / Unitario (Siempre presente como precio base) */}
                        <div className="flex flex-col items-end px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs" title="Solo cambia el precio que aparece en este PDF; el producto queda igual.">
                          <label className="text-[8px] font-extrabold text-slate-500 uppercase tracking-wider">Precio principal · solo PDF</label>
                          <div className="mt-0.5 flex items-center gap-1">
                            <span className="text-[10px] font-bold text-slate-400">$</span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              aria-label={`Precio principal solo para PDF: ${product.nombre}`}
                              value={printPriceOverrides[product.sku] ?? String(pack.p1.price)}
                              onChange={event => updatePrintPrice(product, event.target.value)}
                              onBlur={() => {
                                const currentValue = printPriceOverrides[product.sku];
                                if (currentValue === undefined) return;
                                const normalized = Math.round(Number(currentValue));
                                if (!Number.isFinite(normalized) || normalized <= 0 || normalized === pack.p1.price) {
                                  resetPrintPrice(product.sku);
                                } else {
                                  updatePrintPrice(product, String(normalized));
                                }
                              }}
                              onClick={event => event.stopPropagation()}
                              className="w-[86px] bg-transparent text-right text-xs sm:text-sm font-black font-mono text-slate-900 outline-none focus:text-sky-700"
                            />
                            <span className="text-[9px] font-extrabold text-slate-500 bg-white px-1 py-0.2 rounded border border-slate-200">X 1</span>
                            {printPriceOverrides[product.sku] !== undefined && (
                              <button
                                type="button"
                                onClick={() => resetPrintPrice(product.sku)}
                                className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-white hover:text-sky-700"
                                title="Restaurar precio del producto"
                                aria-label={`Restaurar precio original de ${product.nombre}`}
                              >
                                <RotateCcw size={12} />
                              </button>
                            )}
                          </div>
                          <span className="text-[8px] text-slate-400">No modifica el producto</span>
                        </div>

                        {/* P2: Precio 2 (Interactivo: la cajera ve el precio y marca si lo imprime) */}
                        {pack.p2 ? (
                          (() => {
                            const activeSlot = chosenPackSlotMap[product.sku] ?? pack.defaultSecondary;
                            const isChosen = activeSlot === 'p2';
                            const displayedLabel = getPackLabel(product.sku, 'p2', pack.p2.label);
                            return (
                              <div className="relative flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => togglePackSlot(product.sku, 'p2', pack.defaultSecondary)}
                                  title={isChosen ? 'Este pack se imprimirá en la etiqueta (clic para quitar)' : 'Clic para imprimir este pack en la etiqueta'}
                                  className={`flex flex-col items-end px-2.5 py-1 rounded-xl border transition cursor-pointer active:scale-95 ${
                                    isChosen
                                      ? (pack.p2.isX6
                                          ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200 text-blue-900 shadow-xs'
                                          : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200 text-emerald-900 shadow-xs')
                                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs sm:text-sm font-black font-mono">
                                      {formatPrice(getPackPrice(product.sku, 'p2', pack.p2.price))}
                                    </span>
                                    <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded ${
                                      pack.p2.isX6 ? 'bg-blue-100 text-blue-800' : pack.p2.isX3 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                                    }`}>
                                      {displayedLabel}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[8.5px] font-extrabold">
                                    {isChosen && <span className="text-sky-700">✓ En etiqueta</span>}
                                    <span className={isChosen ? 'text-sky-600' : 'text-slate-400'}>
                                      {pack.p2.rawLabel || 'P2'}
                                    </span>
                                  </div>
                                </button>
                                <PackPriceEditControl
                                  productName={product.nombre}
                                  slot="p2"
                                  originalPrice={pack.p2.price}
                                  value={packPriceOverrides[packPriceKey(product.sku, 'p2')]}
                                  onChange={value => updatePackPrice(product.sku, 'p2', value)}
                                  onReset={() => resetPackPrice(product.sku, 'p2')}
                                />
                                <PackLabelEditControl
                                  label={displayedLabel}
                                  quantity={getPackQuantity(product.sku, 'p2', pack.p2.qty)}
                                  packageQty={pack.unitsPerBox}
                                  onApply={(label, quantity) => applyPackLabel(product.sku, 'p2', label, quantity)}
                                />
                              </div>
                            );
                          })()
                        ) : (
                          <div className="hidden sm:flex flex-col items-end justify-center px-2 py-1 rounded-xl border border-dashed border-slate-200 text-slate-300 text-[10px]">
                            <span>Sin P2</span>
                          </div>
                        )}

                        {/* P3: Precio 3 (Ej: X6 en embalaje - la cajera ve el precio y marca si lo imprime) */}
                        {pack.p3 ? (
                          (() => {
                            const activeSlot = chosenPackSlotMap[product.sku] ?? pack.defaultSecondary;
                            const isChosen = activeSlot === 'p3';
                            const displayedLabel = getPackLabel(product.sku, 'p3', pack.p3.label);
                            return (
                              <div className="relative flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => togglePackSlot(product.sku, 'p3', pack.defaultSecondary)}
                                  title={isChosen ? 'Este pack se imprimirá en la etiqueta (clic para quitar)' : 'Clic para imprimir este pack en la etiqueta'}
                                  className={`flex flex-col items-end px-2.5 py-1 rounded-xl border transition cursor-pointer active:scale-95 ${
                                    isChosen
                                      ? (pack.p3.isX6
                                          ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200 text-blue-900 shadow-xs'
                                          : 'bg-purple-50 border-purple-400 ring-2 ring-purple-200 text-purple-900 shadow-xs')
                                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs sm:text-sm font-black font-mono">
                                      {formatPrice(getPackPrice(product.sku, 'p3', pack.p3.price))}
                                    </span>
                                    <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded ${
                                      pack.p3.isX6 ? 'bg-blue-100 text-blue-800' : pack.p3.isX3 ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                                    }`}>
                                      {displayedLabel}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[8.5px] font-extrabold">
                                    {isChosen && <span className="text-sky-700">✓ En etiqueta</span>}
                                    <span className={isChosen ? 'text-sky-600' : 'text-slate-400'}>
                                      {pack.p3.rawLabel || 'P3 (Embalaje)'}
                                    </span>
                                  </div>
                                </button>
                                <PackPriceEditControl
                                  productName={product.nombre}
                                  slot="p3"
                                  originalPrice={pack.p3.price}
                                  value={packPriceOverrides[packPriceKey(product.sku, 'p3')]}
                                  onChange={value => updatePackPrice(product.sku, 'p3', value)}
                                  onReset={() => resetPackPrice(product.sku, 'p3')}
                                />
                                <PackLabelEditControl
                                  label={displayedLabel}
                                  quantity={getPackQuantity(product.sku, 'p3', pack.p3.qty)}
                                  packageQty={pack.unitsPerBox}
                                  onApply={(label, quantity) => applyPackLabel(product.sku, 'p3', label, quantity)}
                                />
                              </div>
                            );
                          })()
                        ) : (
                          <div className="hidden sm:flex flex-col items-end justify-center px-2 py-1 rounded-xl border border-dashed border-slate-200 text-slate-300 text-[10px]">
                            <span>Sin P3</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
                  <div className="max-w-sm">
                    <Package size={28} className="mx-auto text-slate-300 mb-2" />
                    <h3 className="text-sm font-bold text-slate-700">No se encontraron productos</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Prueba quitando el término de búsqueda o cambiando el filtro de pack a &quot;Todos&quot;.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setPackFilter('all');
                      }}
                      className="mt-3 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition"
                    >
                      Restablecer filtros
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════════
            PESTAÑA 2: PERSONALIZAR DISEÑO DE ETIQUETA Y VISTA PREVIA EN VIVO
            ════════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'personalizar' && (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 bg-slate-50/50">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Columna Izquierda: Controles de Personalización (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                {/* 1. Paleta de Colores de la Etiqueta */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Palette size={14} className="text-sky-600" />
                      <span>1. Color del Tema / Estilo</span>
                    </label>
                    <span className="text-[11px] font-bold text-slate-500">
                      {THEMES[theme].name}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {(Object.keys(THEMES) as LabelTheme[]).map(key => {
                      const t = THEMES[key];
                      const active = theme === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setTheme(key)}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition cursor-pointer active:scale-95 ${
                            active
                              ? 'border-sky-600 bg-sky-50/50 shadow-xs ring-2 ring-sky-200'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <span
                            className="w-6 h-6 rounded-full mb-1 border border-black/10 shadow-xs flex items-center justify-center text-white text-[10px]"
                            style={{ backgroundColor: t.badgeBgHex }}
                          >
                            {active && <Check size={12} className={key === 'bw' ? 'text-black' : 'text-white'} />}
                          </span>
                          <span className="text-[10px] font-bold text-slate-700 text-center leading-tight truncate w-full">
                            {key === 'bw' ? 'B/N Flúor' : key === 'blue' ? 'Azul' : key === 'red' ? 'Rojo' : key === 'green' ? 'Verde' : key === 'purple' ? 'Violeta' : 'Ámbar'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Distribución y Tamaño en Hoja A4 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Package size={14} className="text-sky-600" />
                      <span>2. Tamaño y Formato en Hoja A4</span>
                    </label>
                    <span className="text-[11px] font-bold text-sky-700">
                      {labelsPerPage} por hoja
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {[
                      { id: '2h', title: '2 por hoja · Horizontal', desc: '198 × 141 mm · Ancho completo', tag: 'Recomendado' },
                      { id: '10', title: '10 por hoja (2x5)', desc: '98 × 56 mm · Góndola', tag: 'Estándar' },
                      { id: '8', title: '8 por hoja (2x4)', desc: '98 × 71 mm · Grande', tag: 'Vitrina' },
                      { id: '4', title: '4 por hoja (2x2)', desc: '98 × 141 mm · Cartel 4 Tarjetas', tag: 'Cartel Grande' },
                      { id: '12', title: '12 por hoja (3x4)', desc: '65 × 71 mm · Mediano', tag: 'Cajas' },
                      { id: '16', title: '16 por hoja (2x8)', desc: '98 × 35 mm · Compacto', tag: 'Fleje' },
                    ].map(opt => {
                      const active = gridFormat === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setGridFormat(opt.id as any)}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer active:scale-95 ${
                            active
                              ? 'border-sky-600 bg-sky-50/60 shadow-xs ring-1 ring-sky-300'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-black text-slate-900">{opt.title}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 leading-tight">{opt.desc}</p>
                          <span className={`inline-block mt-1 px-1.5 py-0.2 rounded text-[9px] font-bold ${active ? 'bg-sky-200 text-sky-900' : 'bg-slate-100 text-slate-600'}`}>
                            {opt.tag}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Tipografía, Grosor y Tamaños */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Grosor de los Números */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">
                        Grosor de los Números
                      </label>
                      <span className="text-[10px] font-bold text-sky-700">
                        {numberWeight === 'black' ? 'Ultra Grueso' : numberWeight === 'heavy' ? 'Grueso' : 'Normal'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'normal', label: 'Normal' },
                        { id: 'heavy', label: 'Grueso' },
                        { id: 'black', label: 'Ultra Grueso' },
                      ].map(w => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setNumberWeight(w.id as any)}
                          className={`py-1.5 px-1 rounded-xl text-xs font-black border transition cursor-pointer text-center ${
                            numberWeight === w.id
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tamaño de Precios */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">
                        Tamaño de los Precios
                      </label>
                      <span className="text-[10px] font-bold text-sky-700">
                        {priceSize === 'ultra' ? 'Extra' : priceSize === 'giant' ? 'Gigante' : priceSize === 'large' ? 'Grande' : 'Normal'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: 'normal', label: 'Normal' },
                        { id: 'large', label: 'Grande' },
                        { id: 'giant', label: 'Gigante' },
                        { id: 'ultra', label: 'Extra' },
                      ].map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setPriceSize(s.id as any)}
                          className={`py-1.5 px-1 rounded-xl text-xs font-extrabold border transition cursor-pointer text-center ${
                            priceSize === s.id
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tamaño del Título / Nombre */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">
                        Tamaño del Título (Nombre)
                      </label>
                      <span className="text-[10px] font-bold text-sky-700">
                        {titleSize === 'giant' ? 'Extra' : titleSize === 'large' ? 'Grande' : titleSize === 'small' ? 'Pequeño' : 'Normal'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: 'small', label: 'Pequeño' },
                        { id: 'normal', label: 'Normal' },
                        { id: 'large', label: 'Grande' },
                        { id: 'giant', label: 'Extra' },
                      ].map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTitleSize(t.id as any)}
                          className={`py-1.5 px-1 rounded-xl text-xs font-extrabold border transition cursor-pointer text-center ${
                            titleSize === t.id
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Borde / Línea de Corte */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">
                        Líneas de Corte
                      </label>
                      <span className="text-[10px] font-bold text-slate-500">
                        {borderStyle === 'dashed' ? 'Punteada' : borderStyle === 'solid' ? 'Sólida' : 'Sin borde'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'dashed', label: 'Punteada' },
                        { id: 'solid', label: 'Sólida' },
                        { id: 'none', label: 'Sin borde' },
                      ].map(b => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBorderStyle(b.id as any)}
                          className={`py-1.5 px-1 rounded-xl text-xs font-extrabold border transition cursor-pointer text-center ${
                            borderStyle === b.id
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. Opciones de Contenido & Toggles */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Sliders size={14} className="text-sky-600" />
                    <span>4. Elementos visibles en la ficha</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* Toggle Segundo Precio */}
                    <label className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-200/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeSecondPrice}
                        onChange={e => setIncludeSecondPrice(e.target.checked)}
                        className="h-4 w-4 rounded accent-sky-600"
                      />
                      <div>
                        <span className="font-extrabold text-slate-800 block">Mostrar segundo precio</span>
                        <span className="text-[10px] text-slate-500">Pack X6 o X3 si el producto lo tiene</span>
                      </div>
                    </label>

                    {/* Toggle Encabezado */}
                    <label className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-200/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showHeader}
                        onChange={e => setShowHeader(e.target.checked)}
                        className="h-4 w-4 rounded accent-sky-600"
                      />
                      <div className="flex-1">
                        <span className="font-extrabold text-slate-800 block">Encabezado superior</span>
                        {showHeader ? (
                          <input
                            type="text"
                            value={headerText}
                            onChange={e => setHeaderText(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            placeholder="Importadora Carlitos"
                            className="mt-1 h-6 w-full text-[10px] font-bold px-1.5 rounded bg-white border border-slate-200"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400">Sin distintivo superior</span>
                        )}
                      </div>
                    </label>

                    {/* Toggle SKU */}
                    <label className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-200/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showSku}
                        onChange={e => setShowSku(e.target.checked)}
                        className="h-4 w-4 rounded accent-sky-600"
                      />
                      <div>
                        <span className="font-extrabold text-slate-800 block">Imprimir SKU</span>
                        <span className="text-[10px] text-slate-500">Pie de etiqueta a la izquierda</span>
                      </div>
                    </label>

                    {/* Toggle Código de Barras */}
                    <label className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-200/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showBarcode}
                        onChange={e => setShowBarcode(e.target.checked)}
                        className="h-4 w-4 rounded accent-sky-600"
                      />
                      <div>
                        <span className="font-extrabold text-slate-800 block">Imprimir Código de Barras</span>
                        <span className="text-[10px] text-slate-500">Pie de etiqueta a la derecha</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Vista Previa de la Hoja A4 Completa (7 cols) */}
              <div className="lg:col-span-7 sticky top-0 space-y-3">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  {/* Encabezado de la Vista Previa con Selector de Modo (Hoja A4 vs Ficha 1:1) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                        <Eye size={14} className="text-sky-600" />
                        <span>Vista Previa en Vivo</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-sky-50 text-sky-700 border border-sky-200">
                        {previewGrid.formatLabel.split('·')[0].trim()}
                      </span>
                    </div>

                    {/* Switcher: Hoja A4 vs Ficha Zoom 1:1 */}
                    <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-xl gap-0.5 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setPreviewMode('sheet')}
                        className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                          previewMode === 'sheet'
                            ? 'bg-white text-slate-900 shadow-2xs font-black'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <FileText size={12} />
                        <span>Hoja A4 ({labelsPerPage})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode('single')}
                        className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                          previewMode === 'single'
                            ? 'bg-white text-slate-900 shadow-2xs font-black'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Eye size={12} />
                        <span>Ficha Zoom (1:1)</span>
                      </button>
                    </div>
                  </div>

                  {/* ── MODO 1: HOJA A4 COMPLETA CON TODAS LAS ETIQUETAS DISTRIBUIDAS ── */}
                  {previewMode === 'sheet' && (
                    <div className="flex flex-col items-center">
                      {/* Fondo de Mesa de Trabajo / Tablero para la Hoja A4 */}
                      <div className="w-full bg-slate-100/80 rounded-2xl p-3 sm:p-4.5 border border-slate-200/90 shadow-inner flex flex-col items-center justify-center">
                        {/* Hoja A4 Física Proporcional (210 × 297 mm) */}
                        <div
                          className="w-full max-w-[420px] aspect-[210/297] bg-white rounded-sm shadow-xl border border-slate-300 p-2 sm:p-2.5 flex flex-col justify-between overflow-hidden relative transition-all"
                        >
                          {/* Cuadrícula de Etiquetas en la Hoja A4 */}
                          <div
                            className="grid gap-1 sm:gap-1.5 h-full w-full"
                            style={{
                              gridTemplateColumns: `repeat(${previewGrid.cols}, minmax(0, 1fr))`,
                              gridTemplateRows: `repeat(${previewGrid.rows}, minmax(0, 1fr))`,
                            }}
                          >
                            {sheetItems.map((item, idx) => {
                              const chosenSlot = chosenPackSlotMap[item.product.sku] ?? item.pack.defaultSecondary;
                              const chosenPack = chosenSlot === 'p2' ? item.pack.p2 : chosenSlot === 'p3' ? item.pack.p3 : null;
                              const chosenPackPrice = chosenPack && (chosenSlot === 'p2' || chosenSlot === 'p3')
                                ? getPackPrice(item.product.sku, chosenSlot, chosenPack.price)
                                : 0;
                              const hasSecond = includeSecondPrice && chosenPack && chosenPackPrice > 0;
                              const chosenPackLabel = chosenPack && chosenSlot !== 'none'
                                ? getPackLabel(item.product.sku, chosenSlot, chosenPack.label)
                                : '';

                              return (
                                <div
                                  key={idx}
                                  className={`bg-white rounded-sm overflow-hidden transition-all ${
                                    gridFormat === '2h'
                                      ? 'grid grid-cols-[minmax(0,1fr)_1.15fr] grid-rows-[auto_1fr_auto] gap-x-2 sm:gap-x-4 items-center'
                                      : 'flex flex-col justify-between'
                                  } ${
                                    borderStyle === 'dashed'
                                      ? 'border border-dashed'
                                      : borderStyle === 'solid'
                                      ? 'border border-solid'
                                      : 'border-0'
                                  } ${
                                      gridFormat === '2h' || gridFormat === '4' ? 'p-2 sm:p-2.5' :
                                    gridFormat === '8' ? 'p-1.5' :
                                    gridFormat === '16' ? 'p-1' :
                                    'p-1 sm:p-1.5'
                                  }`}
                                  style={{
                                    borderColor: THEMES[theme].badgeBgHex === '#e2e8f0' ? '#94a3b8' : THEMES[theme].badgeBgHex,
                                  }}
                                >
                                  {/* Encabezado / Badge superior */}
                                  <div className={`flex items-center justify-between gap-1 leading-none mb-0.5 ${gridFormat === '2h' ? 'col-span-2 row-start-1' : ''}`}>
                                    {showSku && item.product.sku ? (
                                      <span className={`font-mono text-slate-400 truncate ${
                                        gridFormat === '2h' ? 'text-[9px] sm:text-[11px]' : gridFormat === '4' ? 'text-[8px] sm:text-[9px]' : 'text-[6px] sm:text-[7px]'
                                      }`}>
                                        {item.product.sku}
                                      </span>
                                    ) : <span />}
                                    {showHeader && headerText && (
                                      <span
                                        className={`font-black uppercase tracking-wider rounded px-1 py-0.2 shrink-0 ${
                                          gridFormat === '2h' ? 'text-[9px] sm:text-[11px]' : gridFormat === '4' ? 'text-[8px] sm:text-[9px]' : 'text-[5.5px] sm:text-[6.5px]'
                                        }`}
                                        style={{
                                          backgroundColor: THEMES[theme].badgeBgHex,
                                          color: THEMES[theme].badgeTextHex,
                                        }}
                                      >
                                        {headerText.trim()}
                                      </span>
                                    )}
                                  </div>

                                  {/* Nombre del producto */}
                                  <p
                                    className={`font-black leading-tight text-slate-900 ${gridFormat === '2h' ? 'col-start-1 row-start-2 self-center' : ''} ${
                                      gridFormat === '2h' ? 'text-sm sm:text-base line-clamp-2' : gridFormat === '4' ? 'text-[10px] sm:text-xs line-clamp-2' :
                                      gridFormat === '8' ? 'text-[8.5px] sm:text-[9.5px] line-clamp-2' :
                                      gridFormat === '16' ? 'text-[7px] sm:text-[8px] line-clamp-1' :
                                      'text-[7.5px] sm:text-[8.5px] line-clamp-1 sm:line-clamp-2'
                                    }`}
                                  >
                                    {item.product.nombre}
                                  </p>

                                  {/* Precios (Sin contorno ni relleno) */}
                                  <div className={`my-auto py-0.5 space-y-0.5 ${gridFormat === '2h' ? 'col-start-2 row-start-2 w-full' : ''}`}>
                                    {/* Precio Unitario */}
                                    <div className="flex items-center justify-between gap-1 leading-none">
                                      <span
                                        className={`font-mono font-black tracking-tight ${
                                          gridFormat === '2h' ? 'text-3xl sm:text-4xl' : gridFormat === '4' ? 'text-sm sm:text-base' :
                                          gridFormat === '8' ? 'text-xs sm:text-sm' :
                                          gridFormat === '16' ? 'text-[9.5px] sm:text-[11px]' :
                                          'text-[10.5px] sm:text-xs'
                                        }`}
                                        style={{
                                          color: THEMES[theme].badgeBgHex === '#e2e8f0' ? '#000000' : THEMES[theme].badgeBgHex,
                                          textShadow:
                                            numberWeight === 'black'
                                              ? '0.35px 0 0 currentColor'
                                              : numberWeight === 'heavy'
                                              ? '0.18px 0 0 currentColor'
                                              : 'none',
                                        }}
                                      >
                                        {formatPrice(getMainPrice(item.product))}
                                      </span>
                                      <span
                                        className={`font-black uppercase tracking-tight shrink-0 ${
                                          gridFormat === '2h' ? 'text-sm sm:text-base' : gridFormat === '4' ? 'text-[10px] sm:text-xs' : 'text-[7px] sm:text-[8px]'
                                        }`}
                                        style={{
                                          color: THEMES[theme].badgeBgHex === '#e2e8f0' ? '#334155' : THEMES[theme].badgeBgHex,
                                        }}
                                      >
                                        X 1
                                      </span>
                                    </div>

                                    {/* Segundo Precio (Pack X6 o X3) */}
                                    {hasSecond && (
                                      <div className="flex items-center justify-between gap-1 leading-none pt-0.5 border-t border-slate-100">
                                        <span
                                          className={`font-mono font-black tracking-tight ${
                                            gridFormat === '2h' ? 'text-xl sm:text-2xl' : gridFormat === '4' ? 'text-xs sm:text-sm' :
                                            gridFormat === '8' ? 'text-[10px] sm:text-xs' :
                                            gridFormat === '16' ? 'text-[8.5px] sm:text-[9.5px]' :
                                            'text-[9px] sm:text-[10.5px]'
                                          }`}
                                          style={{
                                            color: THEMES[theme].badgeBgHex === '#e2e8f0' ? '#334155' : THEMES[theme].badgeBgHex,
                                            textShadow:
                                              numberWeight === 'black'
                                                ? '0.35px 0 0 currentColor'
                                                : numberWeight === 'heavy'
                                                ? '0.18px 0 0 currentColor'
                                                : 'none',
                                          }}
                                        >
                                          {formatPrice(chosenPackPrice)}
                                        </span>
                                        <span
                                          className={`font-black uppercase tracking-tight shrink-0 ${
                                            gridFormat === '2h' ? 'text-sm sm:text-base' : gridFormat === '4' ? 'text-[9.5px] sm:text-[11px]' : 'text-[6.5px] sm:text-[7.5px]'
                                          }`}
                                          style={{
                                            color: THEMES[theme].badgeBgHex === '#e2e8f0' ? '#0f172a' : THEMES[theme].badgeBgHex,
                                          }}
                                        >
                                          {chosenPackLabel}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Código de barra si está activo */}
                                  {showBarcode && item.product.codigo_barra && (
                                    <div className={`font-mono text-slate-400 text-right truncate ${gridFormat === '2h' ? 'col-span-2 row-start-3' : ''} ${
                                      gridFormat === '2h' ? 'text-[9px] sm:text-[10px]' : gridFormat === '4' ? 'text-[7.5px]' : 'text-[5.5px]'
                                    }`}>
                                      {item.product.codigo_barra}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Leyenda de la Hoja A4 */}
                        <div className="mt-2 text-center text-[10.5px] font-bold text-slate-500">
                          <span>
                            Hoja A4 (210 × 297 mm) · {previewGrid.cols} columnas × {previewGrid.rows} filas ({labelsPerPage} etiquetas por hoja)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── MODO 2: FICHA ZOOM DETALLADA (1:1) ── */}
                  {previewMode === 'single' && (
                    previewSample ? (
                      <div
                        className={`relative bg-white rounded-xl p-4 transition-all flex flex-col justify-between ${
                          borderStyle === 'dashed'
                            ? 'border-2 border-dashed'
                            : borderStyle === 'solid'
                            ? 'border-2 border-solid'
                            : 'border border-slate-200 shadow-sm'
                        }`}
                        style={{
                          borderColor: THEMES[theme].badgeBgHex,
                          minHeight: gridFormat === '2h' || gridFormat === '4' ? '300px' : gridFormat === '8' ? '220px' : gridFormat === '16' ? '145px' : '185px',
                        }}
                      >
                        <div>
                          {showHeader && headerText && (
                            <div className="flex justify-end mb-1.5">
                              <span
                                className={`px-2.5 py-0.5 rounded font-black uppercase tracking-wider ${gridFormat === '4' ? 'text-xs' : 'text-[10px]'}`}
                                style={{
                                  backgroundColor: THEMES[theme].badgeBgHex,
                                  color: THEMES[theme].badgeTextHex,
                                }}
                              >
                                {headerText.trim()}
                              </span>
                            </div>
                          )}

                          <p
                            className="font-black leading-tight line-clamp-2"
                            style={{
                              color: '#0f172a',
                              fontSize:
                                titleSize === 'giant' ? (gridFormat === '2h' || gridFormat === '4' ? '24px' : '15px') :
                                titleSize === 'large' ? (gridFormat === '2h' || gridFormat === '4' ? '21px' : '13.5px') :
                                titleSize === 'small' ? (gridFormat === '2h' || gridFormat === '4' ? '16px' : '10.5px') :
                                (gridFormat === '2h' || gridFormat === '4' ? '18px' : '12px'),
                            }}
                          >
                            {previewSample.product.nombre}
                          </p>
                        </div>

                        <div className="my-auto py-2 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="font-mono tracking-tight"
                              style={{
                                color: THEMES[theme].badgeBgHex === '#e2e8f0' ? '#000000' : THEMES[theme].badgeBgHex,
                                fontSize:
                                  priceSize === 'ultra' ? (gridFormat === '2h' || gridFormat === '4' ? '64px' : '31px') :
                                  priceSize === 'giant' ? (gridFormat === '2h' || gridFormat === '4' ? '56px' : '27px') :
                                  priceSize === 'large' ? (gridFormat === '2h' || gridFormat === '4' ? '48px' : '24px') :
                                  (gridFormat === '2h' || gridFormat === '4' ? '40px' : '21px'),
                                fontWeight: numberWeight === 'black' ? 950 : numberWeight === 'heavy' ? 900 : 700,
                                textShadow:
                                  numberWeight === 'black'
                                    ? '0.45px 0 0 currentColor, -0.45px 0 0 currentColor, 0 0.45px 0 currentColor'
                                    : numberWeight === 'heavy'
                                    ? '0.25px 0 0 currentColor'
                                    : 'none',
                              }}
                            >
                              {formatPrice(getMainPrice(previewSample.product))}
                            </span>
                            <span
                              className={`font-black uppercase tracking-tight shrink-0 ${
                                gridFormat === '2h' ? 'text-2xl' : gridFormat === '4' ? 'text-lg' : 'text-sm'
                              }`}
                              style={{
                                color: THEMES[theme].badgeBgHex === '#e2e8f0' ? '#334155' : THEMES[theme].badgeBgHex,
                              }}
                            >
                              X 1
                            </span>
                          </div>

                          {(() => {
                            if (!includeSecondPrice || !previewSample) return null;
                            const chosenSlot = chosenPackSlotMap[previewSample.product.sku] ?? previewSample.pack.defaultSecondary;
                            const chosenPack = chosenSlot === 'p2' ? previewSample.pack.p2 : chosenSlot === 'p3' ? previewSample.pack.p3 : null;
                            if (!chosenPack || (chosenSlot !== 'p2' && chosenSlot !== 'p3')) return null;
                            const chosenPackPrice = getPackPrice(previewSample.product.sku, chosenSlot, chosenPack.price);
                            if (chosenPackPrice <= 0) return null;
                            const chosenPackLabel = getPackLabel(previewSample.product.sku, chosenSlot, chosenPack.label);

                            return (
                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                                <span
                                  className="font-mono tracking-tight"
                                  style={{
                                    color: THEMES[theme].badgeBgHex === '#e2e8f0' ? '#334155' : THEMES[theme].badgeBgHex,
                                    fontSize:
                                      priceSize === 'ultra' ? (gridFormat === '2h' || gridFormat === '4' ? '56px' : '29px') :
                                      priceSize === 'giant' ? (gridFormat === '2h' || gridFormat === '4' ? '48px' : '25px') :
                                      priceSize === 'large' ? (gridFormat === '2h' || gridFormat === '4' ? '42px' : '22px') :
                                      (gridFormat === '2h' || gridFormat === '4' ? '36px' : '19px'),
                                    fontWeight: numberWeight === 'black' ? 950 : numberWeight === 'heavy' ? 900 : 700,
                                    textShadow:
                                      numberWeight === 'black'
                                        ? '0.45px 0 0 currentColor, -0.45px 0 0 currentColor, 0 0.45px 0 currentColor'
                                        : numberWeight === 'heavy'
                                        ? '0.25px 0 0 currentColor'
                                        : 'none',
                                  }}
                                >
                                  {formatPrice(chosenPackPrice)}
                                </span>
                                <span
                                  className={`font-black uppercase tracking-tight shrink-0 ${
                                    gridFormat === '2h' ? 'text-2xl' : gridFormat === '4' ? 'text-xl' : 'text-base'
                                  }`}
                                  style={{
                                    color: THEMES[theme].badgeBgHex === '#e2e8f0' ? '#0f172a' : THEMES[theme].badgeBgHex,
                                  }}
                                >
                                  {chosenPackLabel}
                                </span>
                              </div>
                            );
                          })()}
                        </div>

                        {(showSku || showBarcode) && (
                          <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mt-4 pt-2 border-t border-slate-100">
                            {showSku && <span>SKU: {previewSample.product.sku}</span>}
                            {showBarcode && (
                              <span>{previewSample.product.codigo_barra ? `BARRA: ${previewSample.product.codigo_barra}` : ''}</span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Selecciona un producto para ver la vista previa
                      </div>
                    )
                  )}

                  <div className="rounded-xl bg-sky-50 border border-sky-100 p-2.5 text-[11px] text-sky-800 flex items-start gap-2">
                    <Sparkles size={14} className="shrink-0 mt-0.5 text-sky-600" />
                    <span>
                      Esta configuración se aplicará a todas las <strong>{totalLabelsToPrint}</strong> etiquetas que descargues en el PDF.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── FOOTER INFERIOR CON RESUMEN Y BOTÓN DESCARGAR (SIEMPRE VISIBLE) ── */}
        <footer className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 text-xs">
            {error ? (
              <span className="font-bold text-rose-600">{error}</span>
            ) : (
              <span className="text-slate-600 font-medium">
                <strong className="text-slate-900">{selectedCount}</strong> productos seleccionados ·{' '}
                <strong className="text-sky-700">{totalLabelsToPrint}</strong> etiquetas en total (~<strong>{estimatedPages}</strong> hoja{estimatedPages === 1 ? '' : 's'} A4)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {activeTab === 'personalizar' ? (
              <button
                type="button"
                onClick={() => setActiveTab('productos')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                ← Volver a Productos
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('personalizar')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 transition cursor-pointer flex items-center gap-1.5"
              >
                <Palette size={13} />
                <span>Personalizar ({THEMES[theme].name.split(' ')[0]})</span>
              </button>
            )}

            <button
              type="button"
              onClick={generatePdf}
              disabled={!selectedCount || generating}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 px-4 py-2 text-xs sm:text-sm font-extrabold text-white shadow-md shadow-sky-200 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {generating ? <LoaderCircle size={15} className="animate-spin" /> : <Printer size={15} />}
              <span>{generating ? 'Generando PDF…' : `Descargar PDF (${totalLabelsToPrint} etiquetas)`}</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
