'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DEFAULT_COMPANY_CONFIG, openReceiptPrintWindow } from '@/lib/posReceipt';
import type { ReceiptCompanyConfig } from '@/lib/posReceipt';
import { db, authReady } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { formatEmbalajeBoletaLabel, formatProductCodeLabel } from '@/lib/embalajeHelper';
import { normalizePosAccessLevel, POS_ACCESS_RANK, type PosAccessLevel } from '@/lib/posAccessLevels';
import { updateVentaPos } from '@/lib/firebaseVentasPos';
import { saleBelongsToCashier } from '@/lib/posCashierVisibility';
import { isSellerCargo, normalizePosSellerRole, type PosSellerRole } from '@/lib/posSellerRoles';
import { useLiveDataVisibility } from '@/hooks/useLiveDataVisibility';
import { useAuth } from '@/hooks/useAuth';
import { isAdminEmail } from '@/lib/admin-access';
import { SEDES, SedeSlug, DEFAULT_SEDE } from '@/types';
import { branchSlugQueryValues, matchBranchSlug, getBranchDisplayName } from '@/lib/posBranchAccess';
import { getChileDateStr, shiftDateStr } from '@/lib/chileDate';
import {
  RefreshCw, Download, Eye, Loader2, Search, Filter,
  ShoppingCart, Wallet, TrendingUp, Hash, User, Receipt, Trash2,
  ShieldAlert, Edit3, Check, X, RotateCcw, Calendar, AlertCircle,
  Package, ZoomIn, ArrowLeft, Banknote, CreditCard, ArrowRightLeft, Clock,
  ChevronRight, ArrowUpRight, CheckCircle2
} from 'lucide-react';

interface VentaItem {
  sku: string;
  nombre: string;
  cantidad: number;
  subtotal: number;
  precioUnitario?: number;
  priceField?: string;
  priceLabel?: string;
  costoUnitario?: number;
  descuentoPct?: number;
  imageUrl?: string;
  embalajeQty?: number | null;
  packageQty?: string | null;
}

interface PagoEntry {
  metodo: 'efectivo' | 'debito' | 'transferencia';
  monto: number;
}

interface VentaPOS {
  id: string;
  $id?: string;
  sede: string;
  cajeroNombre: string;
  cajeroId?: string;
  clienteNombre?: string;
  total: number;
  subtotal: number;
  estado: 'completada' | 'anulada' | 'pre_venta';
  fechaStr: string;
  fecha?: any;
  fechaTs?: number;
  createdAt?: any;
  createdAtTs?: number;
  items: VentaItem[];
  pagos: PagoEntry[];
  metodoPago?: string;
  descuentoGlobalPct: number;
  descuentoGlobal: number;
  efectivoPagado?: number;
  vuelto?: number;
  boletaNumero?: number;
  debitoOrdenNumero?: number | null;
  tipoComprobante?: string;
  motivoAnulacion?: string;
  historialEdiciones?: Array<{ razon: string; editadoPor: string; editadoEn: number }>;
  $createdAt?: string;
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n || 0));

const fmtCount = (n: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(n || 0));

const fmtDateTime = (venta: VentaPOS) => {
  const timestamp = venta.fecha?.toDate?.() || (venta.fechaTs ? new Date(venta.fechaTs) : venta.createdAtTs ? new Date(venta.createdAtTs) : null);
  if (!timestamp) return venta.fechaStr || 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }).format(timestamp);
};

function mapDocToVenta(docData: any): VentaPOS {
  let items: VentaItem[] = [];
  if (Array.isArray(docData.items)) {
    items = docData.items;
  } else if (docData.itemsJson) {
    try { items = JSON.parse(docData.itemsJson); } catch {}
  }

  let pagos: PagoEntry[] = [];
  if (Array.isArray(docData.pagos) && docData.pagos.length > 0) {
    pagos = docData.pagos;
  } else if (docData.pagosJson) {
    try { pagos = JSON.parse(docData.pagosJson); } catch {}
  }

  const totalVenta = Number(docData.total || 0);
  const esCompletada = !docData.estado || docData.estado === 'completada';

  if ((!pagos || pagos.length === 0) && esCompletada && totalVenta > 0) {
    if (docData.debitoOrdenNumero) {
      pagos = [{ metodo: 'debito', monto: totalVenta }];
    } else if (docData.metodoPago && docData.metodoPago !== 'mixto') {
      pagos = [{ metodo: docData.metodoPago, monto: totalVenta }];
    } else {
      pagos = [{ metodo: 'efectivo', monto: totalVenta }];
    }
  }

  const derivedMetodo = String(docData.metodoPago || (pagos.length > 0 ? (pagos.length === 1 ? pagos[0].metodo : 'mixto') : 'efectivo'));

  const resolvedCreatedAtTs = Number(
    docData.createdAtTs ||
    docData.fechaTs ||
    (docData.createdAt?.toMillis ? docData.createdAt.toMillis() : 0) ||
    (docData.fecha?.toMillis ? docData.fecha.toMillis() : 0) ||
    0
  );

  return {
    id: String(docData.id || docData.$id || ''),
    $id: String(docData.$id || docData.id || ''),
    sede: String(docData.sede || ''),
    cajeroNombre: String(docData.cajeroNombre || 'Cajera'),
    cajeroId: docData.cajeroId ? String(docData.cajeroId) : undefined,
    clienteNombre: String(docData.clienteNombre || 'Cliente general'),
    total: totalVenta,
    subtotal: Number(docData.subtotal || totalVenta),
    estado: (docData.estado || 'completada') as 'completada' | 'anulada' | 'pre_venta',
    fechaStr: String(docData.fechaStr || ''),
    fecha: docData.fecha,
    fechaTs: Number(docData.fechaTs || resolvedCreatedAtTs),
    createdAt: docData.createdAt,
    createdAtTs: resolvedCreatedAtTs,
    items,
    pagos,
    metodoPago: derivedMetodo,
    descuentoGlobalPct: Number(docData.descuentoGlobalPct || 0),
    descuentoGlobal: Number(docData.descuentoGlobal || 0),
    efectivoPagado: Number(docData.efectivoPagado || 0),
    vuelto: Number(docData.vuelto || 0),
    boletaNumero: Number(docData.boletaNumero || 0),
    debitoOrdenNumero: docData.debitoOrdenNumero != null ? Number(docData.debitoOrdenNumero) : null,
    tipoComprobante: String(docData.tipoComprobante || 'boleta'),
    motivoAnulacion: docData.motivoAnulacion,
    historialEdiciones: docData.historialEdiciones,
    $createdAt: docData.$createdAt,
  };
}

const EDIT_PIN = '988189813';
const RESTORE_SALE_STORAGE_PREFIX = 'yaxsel_pos_restore_sale_';

export default function HistorialVentasPOS() {
  const liveDataVisible = useLiveDataVisibility();
  const router = useRouter();
  const params = useParams();
  const sedeParam = (params?.sede as string) || DEFAULT_SEDE;
  const currentSede = sedeParam as SedeSlug;
  const sedeNombre = SEDES[currentSede] || getBranchDisplayName(currentSede);

  // Prevenir Hydration Mismatch en Next.js
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const { user: authUser } = useAuth();
  const [nivelAccesoPos, setNivelAccesoPos] = useState<PosAccessLevel>('bajo');
  const [cashierIdentity, setCashierIdentity] = useState<{ id: string; name: string; sellerRole: PosSellerRole | null }>({ id: '', name: '', sellerRole: null });
  const [isSessionAdmin, setIsSessionAdmin] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('asistora_pos_session') || localStorage.getItem('yaxsel_pos_session');
      const session = raw ? JSON.parse(raw) : null;
      const sellerRole = isSellerCargo(session?.cargo) ? normalizePosSellerRole(session?.rolOperativoPos) : null;
      const cargoUpper = String(session?.cargo || '').toUpperCase();
      const isAdminSess = isAdminEmail(session?.email) || cargoUpper.includes('ADMIN') || cargoUpper.includes('SUPREMO');
      setIsSessionAdmin(isAdminSess);
      setNivelAccesoPos(isAdminSess ? 'alto' : sellerRole ? 'bajo' : normalizePosAccessLevel(session?.nivelAccesoPos, session?.puedeGestionarCaja));
      setCashierIdentity({ id: String(session?.id || ''), name: String(session?.nombre || ''), sellerRole });
    } catch {
      setNivelAccesoPos('bajo');
      setIsSessionAdmin(false);
      setCashierIdentity({ id: '', name: '', sellerRole: null });
    }
  }, []);

  const isSupreme = Boolean(
    isAdminEmail(authUser?.email) ||
    isSessionAdmin ||
    (typeof window !== 'undefined' && (() => {
      try {
        const authStorage = localStorage.getItem('yaxsel_auth_user');
        if (authStorage) {
          const parsed = JSON.parse(authStorage);
          if (isAdminEmail(parsed?.email)) return true;
        }
      } catch {}
      return false;
    })())
  );

  // Si es admin o la cajera tiene permiso alto: no requiere contraseña
  // Si es nivel medio o bajo: ni les aparecen las opciones que requieren autorización (anular, editar, rehacer)
  const isPermisoAlto = isSupreme || nivelAccesoPos === 'alto';
  const puedeAnularDevolver = isPermisoAlto;
  const puedeEditarBoleta = isPermisoAlto;
  const restrictToOwnSales = !isPermisoAlto || Boolean(cashierIdentity.sellerRole);
  const [empresaConfig, setEmpresaConfig] = useState<ReceiptCompanyConfig>(DEFAULT_COMPANY_CONFIG);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await authReady;
        if (!db) return;
        const snap = await getDoc(doc(db, 'config_pos', 'empresa'));
        if (active && snap.exists()) setEmpresaConfig({ ...DEFAULT_COMPANY_CONFIG, ...(snap.data() as ReceiptCompanyConfig) });
      } catch (error) {
        console.warn('No se pudo cargar la configuración de boleta:', error);
      }
    })();
    return () => { active = false; };
  }, []);

  const [ventasRaw, setVentasRaw] = useState<VentaPOS[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'loading' | 'cache' | 'synced' | 'offline'>('loading');

  // Fechas por defecto
  const todayFilter = useMemo(() => {
    return getChileDateStr();
  }, []);

  const [fechaDesde, setFechaDesde] = useState(todayFilter);
  const [fechaHasta, setFechaHasta] = useState(todayFilter);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'recent' | 'amount-desc'>('recent');
  const [filterMetodo, setFilterMetodo] = useState<string>('todos');
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [filterCajero, setFilterCajero] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const applyQuickDate = (type: 'today' | 'yesterday' | 'week' | 'month') => {
    if (type === 'today') {
      setFechaDesde(todayFilter);
      setFechaHasta(todayFilter);
    } else if (type === 'yesterday') {
      const yesterday = shiftDateStr(todayFilter, -1);
      setFechaDesde(yesterday);
      setFechaHasta(yesterday);
    } else if (type === 'week') {
      setFechaDesde(shiftDateStr(todayFilter, -6));
      setFechaHasta(todayFilter);
    } else if (type === 'month') {
      setFechaDesde(`${todayFilter.slice(0, 7)}-01`);
      setFechaHasta(todayFilter);
    }
    setPage(1);
  };

  // Modales
  const [selectedVenta, setSelectedVenta] = useState<VentaPOS | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VentaPOS | null>(null);
  const [deletePin, setDeletePin] = useState('');
  const [deleteMotivo, setDeleteMotivo] = useState('');
  const [deletePinError, setDeletePinError] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [rehacerTarget, setRehacerTarget] = useState<VentaPOS | null>(null);
  const [rehacerMotivo, setRehacerMotivo] = useState('');
  const [rehacerSaving, setRehacerSaving] = useState(false);

  type MetodoPago = 'efectivo' | 'debito' | 'transferencia';
  interface EditItemState {
    sku: string;
    nombre: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    imageUrl?: string;
  }
  const [editTarget, setEditTarget] = useState<VentaPOS | null>(null);
  const [editPin, setEditPin] = useState('');
  const [editPinError, setEditPinError] = useState(false);
  const [editPinOk, setEditPinOk] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [editMetodo, setEditMetodo] = useState<MetodoPago>('efectivo');
  const [editCajero, setEditCajero] = useState<string>('');
  const [isCustomCajero, setIsCustomCajero] = useState(false);
  const [editItems, setEditItems] = useState<EditItemState[]>([]);
  const [editMonto, setEditMonto] = useState<string>('');
  const [editSaving, setEditSaving] = useState(false);
  const [zoomImage, setZoomImage] = useState<{ url: string; title: string } | null>(null);

  const openRestoredSale = (venta: VentaPOS) => {
    const token = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      localStorage.setItem(`${RESTORE_SALE_STORAGE_PREFIX}${token}`, JSON.stringify({
        clienteNombre: venta.clienteNombre || '',
        boletaNumero: venta.boletaNumero || null,
        items: venta.items || [],
        descuentoGlobalPct: venta.descuentoGlobalPct || 0,
      }));
      const tab = window.open(`/pos/${currentSede}?restaurar=${encodeURIComponent(token)}`, '_blank');
      if (!tab) {
        localStorage.removeItem(`${RESTORE_SALE_STORAGE_PREFIX}${token}`);
        alert('El navegador bloqueó la nueva pestaña. Permite ventanas emergentes para abrir la venta restaurada.');
      } else {
        tab.opener = null;
      }
    } catch (error) {
      console.warn('No se pudo preparar la venta restaurada:', error);
      alert('No se pudo abrir la venta restaurada. Inténtalo nuevamente.');
    }
  };

  const editSubtotal = useMemo(() => editItems.reduce((s, it) => s + (it.cantidad > 0 ? it.subtotal : 0), 0), [editItems]);
  const editDescuento = editTarget?.descuentoGlobal || 0;
  const editTotal = Math.max(0, editSubtotal - editDescuento);

  const knownCajeros = useMemo(() => {
    const list = ['Paola', 'Fernanda', 'Lissy', 'Daniel'];
    ventasRaw.forEach(v => {
      const n = (v.cajeroNombre || '').trim();
      if (n && !list.includes(n)) list.push(n);
    });
    return list;
  }, [ventasRaw]);

  // ─── Clave de caché local para ventas de hoy ───
  const cacheKey = useMemo(() => `pos_historial_sales_${currentSede}_${todayFilter}`, [currentSede, todayFilter]);

  // 1. Carga instantánea desde localStorage al montar/F5 (0ms, 0 lecturas)
  useEffect(() => {
    if (typeof window === 'undefined' || !mounted) return;
    const isToday = fechaDesde === todayFilter && fechaHasta === todayFilter;
    if (!isToday) return;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const list = JSON.parse(cached);
        if (Array.isArray(list) && list.length > 0) {
          setVentasRaw(list);
          setLoading(false);
          setSyncStatus('cache');
        }
      }
    } catch {}
  }, [cacheKey, fechaDesde, fechaHasta, todayFilter, mounted]);

  // 2. Carga y sincronización: WebSocket (onSnapshot) para HOY, getDocs para fechas pasadas
  useEffect(() => {
    if (!mounted || !currentSede) return;
    const isToday = fechaDesde === todayFilter && fechaHasta === todayFilter;
    if (isToday && !liveDataVisible) {
      setIsRealtimeActive(false);
      setSyncStatus('cache');
      return;
    }

    // Rango histórico (Ayer, semana, rango personalizado): Consulta puntual getDocs (sin suscripción)
    if (!isToday) {
      setIsRealtimeActive(false);
      setSyncStatus('loading');
      let active = true;
      setLoading(true);

      (async () => {
        try {
          const { db } = await import('@/lib/firebase');
          const { collection, query, where, getDocsFromServer } = await import('firebase/firestore');
          const q = query(
            collection(db, 'ventas_pos'),
            where('sede', 'in', branchSlugQueryValues(currentSede)),
            where('fechaStr', '>=', fechaDesde),
            where('fechaStr', '<=', fechaHasta)
          );
          const snap = await getDocsFromServer(q);
          if (!active) return;
          const all: any[] = snap.docs
            .map((d: any) => ({ $id: d.id, ...d.data() }))
            .filter((d: any) => !currentSede || matchBranchSlug(d.sede, currentSede));

          const list: VentaPOS[] = all.map(mapDocToVenta);
          list.sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));
          setVentasRaw(list);
          setSyncStatus('synced');
        } catch (e) {
          console.warn('Error cargando ventas históricas:', e);
          if (active) setSyncStatus('offline');
        } finally {
          if (active) setLoading(false);
        }
      })();

      return () => {
        active = false;
      };
    }

    // Día de HOY: Conexión persistente en tiempo real vía WebSocket (onSnapshot)
    let isMounted = true;
    let unsub: (() => void) | null = null;

    (async () => {
      try {
        const { db } = await import('@/lib/firebase');
        const { collection, query, where, onSnapshot } = await import('firebase/firestore');
        if (!isMounted) return;

        const q = query(
          collection(db, 'ventas_pos'),
          where('sede', 'in', branchSlugQueryValues(currentSede)),
          where('fechaStr', '==', todayFilter)
        );

        unsub = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
          if (!isMounted) return;
          const list: VentaPOS[] = snapshot.docs
            .filter(docSnap => matchBranchSlug(docSnap.data().sede || 'donbalato-central', currentSede))
            .map(docSnap => mapDocToVenta({ $id: docSnap.id, ...docSnap.data() }));
          list.sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));

          setVentasRaw(list);
          setLoading(false);
          const fromCache = snapshot.metadata.fromCache;
          setIsRealtimeActive(!fromCache);
          setSyncStatus(fromCache ? 'cache' : 'synced');

          // Solo reemplazar la copia local con una lectura que Firestore confirmó en servidor.
          if (!fromCache && typeof window !== 'undefined') {
            try {
              localStorage.setItem(cacheKey, JSON.stringify(list.slice(0, 500)));
            } catch {}
          }
        }, (err) => {
          console.warn('[historial] onSnapshot error:', err);
          if (isMounted) {
            setIsRealtimeActive(false);
            setSyncStatus('offline');
          }
        });
      } catch (err) {
        console.warn('[historial] Failed to attach onSnapshot:', err);
        if (isMounted) setSyncStatus('offline');
      }
    })();

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, [mounted, currentSede, fechaDesde, fechaHasta, todayFilter, cacheKey, liveDataVisible]);

  // Recarga manual forzada (si la cajera presiona el botón "Actualizar")
  const loadVentas = useCallback(async (force = false) => {
    setLoading(true);
    setSyncStatus('loading');
    try {
      const { db } = await import('@/lib/firebase');
      const { collection, query, where, getDocs, getDocsFromServer } = await import('firebase/firestore');
      const q = query(
        collection(db, 'ventas_pos'),
        where('sede', 'in', branchSlugQueryValues(currentSede)),
        where('fechaStr', '>=', fechaDesde),
        where('fechaStr', '<=', fechaHasta)
      );
      const snap = force ? await getDocsFromServer(q) : await getDocs(q);
      const all: any[] = snap.docs
        .map((d: any) => ({ $id: d.id, ...d.data() }))
        .filter((d: any) => !currentSede || matchBranchSlug(d.sede, currentSede));

      const list: VentaPOS[] = all.map(mapDocToVenta);
      list.sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));
      setVentasRaw(list);
      setSyncStatus(force ? 'synced' : 'cache');

      const isToday = fechaDesde === todayFilter && fechaHasta === todayFilter;
      if (isToday && typeof window !== 'undefined') {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(list.slice(0, 500)));
        } catch {}
      }
    } catch (e) {
      console.warn('Error cargando ventas desde Firestore:', e);
      setSyncStatus('offline');
    } finally {
      setLoading(false);
    }
  }, [currentSede, fechaDesde, fechaHasta, todayFilter, cacheKey]);

  // Ventas filtradas
  const ventas = useMemo(() => {
    return ventasRaw.filter((v: any) => {
      const fechaStr = String(v?.fechaStr || '').slice(0, 10);
      const inRange = !fechaStr || (fechaStr >= fechaDesde && fechaStr <= fechaHasta);
      return inRange && (!restrictToOwnSales || saleBelongsToCashier(v, cashierIdentity));
    });
  }, [ventasRaw, fechaDesde, fechaHasta, restrictToOwnSales, cashierIdentity]);

  const filtered = useMemo(() => {
    let result = ventas;
    if (filterEstado !== 'todos') result = result.filter(v => v.estado === filterEstado);
    if (filterMetodo !== 'todos') {
      result = result.filter(v =>
        v.pagos?.some(p => (p.metodo || '').toLowerCase().trim() === filterMetodo) ||
        (v.metodoPago && v.metodoPago.toLowerCase().trim() === filterMetodo)
      );
    }
    if (filterCajero !== 'todos') result = result.filter(v => (v.cajeroNombre || '').trim() === filterCajero);
    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim();
      const cleanNum = term.replace(/[$.,\s]/g, '');
      const isNumeric = /^\d+$/.test(cleanNum);
      result = result.filter(v => {
        if (isNumeric) {
          const totalStr = String(Math.round(v.total));
          const boletaStr = String(v.boletaNumero || '');
          return totalStr.includes(cleanNum) || boletaStr.includes(cleanNum);
        }
        return (
          v.cajeroNombre?.toLowerCase().includes(term) ||
          v.id?.toLowerCase().includes(term) ||
          v.items?.some(i => i.nombre?.toLowerCase().includes(term) || i.sku?.toLowerCase().includes(term))
        );
      });
    }
    if (sortOrder === 'amount-desc') {
      result = [...result].sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
    }
    return result;
  }, [ventas, filterEstado, filterMetodo, filterCajero, searchTerm, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Resumen KPIs
  const resumen = useMemo(() => {
    const completed = filtered.filter(v => v.estado === 'completada');
    const totalVentas = completed.reduce((s, v) => s + Number(v.total || 0), 0);
    const totalBoletas = completed.length;
    const anuladas = filtered.filter(v => v.estado === 'anulada').length;
    const totalItems = completed.reduce((s, v) => s + (v.items || []).reduce((s2, it) => s2 + Number(it.cantidad || 0), 0), 0);
    const ticketPromedio = totalBoletas > 0 ? Math.round(totalVentas / totalBoletas) : 0;

    let totalEfectivo = 0;
    let totalDebito = 0;
    let totalTransferencia = 0;

    completed.forEach((v) => {
      if (Array.isArray(v.pagos) && v.pagos.length > 0) {
        v.pagos.forEach((p) => {
          const m = String(p.metodo || 'efectivo').toLowerCase().trim();
          const monto = Number(p.monto || 0);
          if (m === 'efectivo') totalEfectivo += monto;
          else if (m === 'debito') totalDebito += monto;
          else if (m === 'transferencia') totalTransferencia += monto;
        });
      } else {
        const m = String(v.metodoPago || 'efectivo').toLowerCase().trim();
        const monto = Number(v.total || 0);
        if (m === 'efectivo') totalEfectivo += monto;
        else if (m === 'debito') totalDebito += monto;
        else if (m === 'transferencia') totalTransferencia += monto;
      }
    });

    return { totalVentas, totalBoletas, anuladas, totalItems, ticketPromedio, totalEfectivo, totalDebito, totalTransferencia };
  }, [filtered]);

  // Acciones
  const openVentaReceipt = (venta: VentaPOS) => {
    const resolvedDate = (venta.fecha?.toDate ? venta.fecha.toDate() : null)
      || (venta.fecha instanceof Date ? venta.fecha : null)
      || (venta.fechaTs ? new Date(venta.fechaTs) : null)
      || (venta.createdAtTs ? new Date(venta.createdAtTs) : null)
      || ((venta as any).createdAt?.toDate ? (venta as any).createdAt.toDate() : null)
      || ((venta as any).createdAt ? new Date((venta as any).createdAt) : null)
      || (venta.fechaStr ? new Date(`${venta.fechaStr}T12:00:00`) : new Date());

    openReceiptPrintWindow({
      ventaId: venta.id || `v${Date.now()}`,
      boletaNumero: 0,
      debitoOrdenNumero: venta.debitoOrdenNumero ?? null,
      cajero: venta.cajeroNombre || '',
      sedeNombre,
      fecha: resolvedDate,
      fechaTs: venta.fechaTs,
      createdAtTs: venta.createdAtTs,
      fechaStr: venta.fechaStr,
      subtotal: Number(venta.subtotal || 0),
      descuentoGlobalPct: Number(venta.descuentoGlobalPct || 0),
      descuentoGlobal: Number(venta.descuentoGlobal || 0),
      total: Number(venta.total || 0),
      efectivoPagado: Number(venta.efectivoPagado || 0),
      vuelto: Number(venta.vuelto || 0),
      metodoPago: (venta as any).metodoPago || ((venta.pagos && venta.pagos.length > 0) ? venta.pagos[0].metodo : undefined),
      pagos: (venta.pagos || []).map(p => ({ metodo: p.metodo, monto: Number(p.monto || 0) })),
      items: (venta.items || []).map(it => ({
        sku: it.sku,
        nombre: it.nombre,
        cantidad: Number(it.cantidad || 0),
        precioUnitario: Number(it.precioUnitario || (it.cantidad > 0 ? it.subtotal / it.cantidad : 0)),
        subtotal: Number(it.subtotal || 0),
        embalajeQty: it.embalajeQty,
        packageQty: it.packageQty,
      })),
      tipoComprobante: 'comprobante',
    }, empresaConfig);
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const headers = ['Folio/Boleta', 'Fecha', 'Hora', 'Cajera', 'Cliente', 'Estado', 'Medio de Pago', 'Total', 'Items'];
    const rows = filtered.map(v => {
      const fechaObj = (v.fecha?.toDate ? v.fecha.toDate() : null)
        || (v.fechaTs ? new Date(v.fechaTs) : null)
        || (v.createdAtTs ? new Date(v.createdAtTs) : null);
      const horaStr = fechaObj ? new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }).format(fechaObj) : '';
      const diaStr = fechaObj ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Santiago' }).format(fechaObj) : (v.fechaStr || '');
      const itemsSummary = (v.items || []).map(i => `${i.cantidad}x ${i.nombre}`).join('; ');
      return [
        v.boletaNumero || v.id.slice(-6),
        diaStr,
        horaStr,
        `"${(v.cajeroNombre || '').replace(/"/g, '""')}"`,
        `"${(v.clienteNombre || 'Cliente').replace(/"/g, '""')}"`,
        v.estado,
        v.metodoPago || '',
        Math.round(v.total || 0),
        `"${itemsSummary.replace(/"/g, '""')}"`,
      ].join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ventas_${currentSede}_${fechaDesde}_${fechaHasta}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRehacerConfirm = async () => {
    if (!puedeAnularDevolver || !rehacerTarget || !rehacerMotivo.trim()) return;
    setRehacerSaving(true);
    const restoreToken = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const restoreKey = `${RESTORE_SALE_STORAGE_PREFIX}${restoreToken}`;
    try {
      localStorage.setItem(restoreKey, JSON.stringify({
        clienteNombre: `Rehacer ${rehacerTarget.boletaNumero ? `#${rehacerTarget.boletaNumero}` : `#${rehacerTarget.id.slice(-6)}`}`,
        boletaNumero: rehacerTarget.boletaNumero || null,
        items: rehacerTarget.items || [],
        descuentoGlobalPct: rehacerTarget.descuentoGlobalPct || 0,
      }));

      // 1. Restituir stock atómicamente en Firestore products (Web & POS Sync)
      try {
        await fetch('/api/pos/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            mode: 'restore',
            ventaId: rehacerTarget.id,
            sede: rehacerTarget.sede || currentSede,
            items: (rehacerTarget.items || []).map((it: any) => ({
              sku: it.sku,
              cantidad: it.cantidad,
            })),
          }),
        });
      } catch (stockErr) {
        console.warn('Error restituyendo stock en rehacer venta:', stockErr);
      }

      await updateVentaPos(rehacerTarget.id, {
        estado: 'anulada',
        motivoAnulacion: rehacerMotivo.trim(),
        anuladaEn: Date.now(),
      });

      setRehacerTarget(null);
      router.push(`/pos/${currentSede}?restaurar=${encodeURIComponent(restoreToken)}`);
    } catch (e: any) {
      localStorage.removeItem(restoreKey);
      alert('Error al rehacer venta: ' + e.message);
    } finally {
      setRehacerSaving(false);
    }
  };

  const openEditPago = (v: VentaPOS) => {
    if (!puedeEditarBoleta) return;
    setEditTarget(v);
    setEditPin('');
    setEditPinError(false);
    setEditPinOk(true);
    setEditReason('');
    setEditMetodo(((v.pagos?.[0]?.metodo as MetodoPago) || 'efectivo'));
    const cajeroActual = (v.cajeroNombre || '').trim() || 'Paola';
    setEditCajero(cajeroActual);
    setIsCustomCajero(!knownCajeros.includes(cajeroActual));
    const itemsMapped: EditItemState[] = (v.items || []).map(it => {
      const qty = Number(it.cantidad) || 1;
      const unitPrice = Number(it.precioUnitario) || (qty > 0 ? Math.round(Number(it.subtotal) / qty) : 0);
      return {
        sku: it.sku,
        nombre: it.nombre,
        cantidad: qty,
        precioUnitario: unitPrice,
        subtotal: Math.round(qty * unitPrice),
        imageUrl: (it as any).imageUrl || '',
      };
    });
    setEditItems(itemsMapped);
    const initialTotal = Math.max(0, itemsMapped.reduce((s, it) => s + it.subtotal, 0) - (v.descuentoGlobal || 0));
    setEditMonto(String(initialTotal));
  };

  const handleUpdateEditItemQty = (idx: number, qtyStr: string) => {
    const cleanStr = qtyStr.replace(/[^0-9]/g, '');
    const qty = cleanStr === '' ? 0 : Number(cleanStr);
    setEditItems(prev => {
      const next = [...prev];
      if (!next[idx]) return prev;
      next[idx] = {
        ...next[idx],
        cantidad: qty,
        subtotal: Math.round(qty * next[idx].precioUnitario),
      };
      return next;
    });
  };

  const handleUpdateEditItemPrice = (idx: number, priceStr: string) => {
    const cleanStr = priceStr.replace(/[^0-9]/g, '');
    const price = cleanStr === '' ? 0 : Number(cleanStr);
    setEditItems(prev => {
      const next = [...prev];
      if (!next[idx]) return prev;
      next[idx] = {
        ...next[idx],
        precioUnitario: price,
        subtotal: Math.round(next[idx].cantidad * price),
      };
      return next;
    });
  };

  const handleRemoveEditItem = (idx: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!puedeEditarBoleta || !editReason.trim()) {
      alert('Escribe el motivo de la edición para dejarlo registrado.');
      return;
    }
    const validItems = editItems.filter(it => it.cantidad > 0);
    if (validItems.length === 0) {
      alert('La venta debe tener al menos un producto con cantidad mayor a 0. Si deseas anularla completamente, usa la opción Anular Venta.');
      return;
    }

    setEditSaving(true);
    try {
      // 1. Calcular balance de stock y sincronizar atómicamente con /api/pos/stock
      const origMap = new Map<string, number>();
      for (const it of (editTarget.items || [])) {
        origMap.set(it.sku, (origMap.get(it.sku) || 0) + Number(it.cantidad || 0));
      }

      const newMap = new Map<string, number>();
      for (const it of validItems) {
        newMap.set(it.sku, (newMap.get(it.sku) || 0) + Number(it.cantidad || 0));
      }

      const restoreItems: Array<{ sku: string; cantidad: number }> = [];
      const decrementItems: Array<{ sku: string; cantidad: number }> = [];

      const allSkus = new Set([...Array.from(origMap.keys()), ...Array.from(newMap.keys())]);
      for (const sku of allSkus) {
        const origQty = origMap.get(sku) || 0;
        const newQty = newMap.get(sku) || 0;
        const diff = newQty - origQty;
        if (diff > 0) {
          decrementItems.push({ sku, cantidad: diff });
        } else if (diff < 0) {
          restoreItems.push({ sku, cantidad: Math.abs(diff) });
        }
      }

      if (restoreItems.length > 0) {
        try {
          await fetch('/api/pos/stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({
              mode: 'restore',
              ventaId: editTarget.id,
              sede: currentSede,
              items: restoreItems,
            }),
          });
        } catch (stockErr) {
          console.warn('Error restituyendo stock en edición:', stockErr);
        }
      }

      if (decrementItems.length > 0) {
        try {
          await fetch('/api/pos/stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({
              mode: 'decrement',
              ventaId: editTarget.id,
              sede: currentSede,
              items: decrementItems,
            }),
          });
        } catch (stockErr) {
          console.warn('Error descontando stock en edición:', stockErr);
        }
      }

      const newSubtotal = validItems.reduce((s, it) => s + it.subtotal, 0);
      const newTotal = Math.max(0, newSubtotal - (editTarget.descuentoGlobal || 0));
      const montoPago = Number(editMonto) || newTotal;

      const finalPagos = editTarget.pagos?.length === 1
        ? [{ metodo: editMetodo, monto: montoPago }]
        : (editTarget.pagos || []).map((p, i) => i === 0 ? { ...p, metodo: editMetodo, monto: montoPago } : p);

      const itemsToSave = validItems.map(it => ({
        sku: it.sku,
        nombre: it.nombre,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        subtotal: it.subtotal,
        imageUrl: it.imageUrl || '',
      }));

      const newCajero = editCajero.trim() || editTarget.cajeroNombre || 'Cajero';
      let actorName = 'Usuario POS';
      try { actorName = JSON.parse(localStorage.getItem('asistora_pos_session') || '{}')?.nombre || actorName; } catch {}

      await updateVentaPos(editTarget.id, {
        items: itemsToSave,
        subtotal: newSubtotal,
        total: newTotal,
        pagos: finalPagos,
        cajeroNombre: newCajero,
        historialEdiciones: [...(editTarget.historialEdiciones || []), { razon: editReason.trim(), editadoPor: actorName, editadoEn: Date.now() }],
      });

      // Actualizar tabla local en vivo
      setVentasRaw(prev => prev.map(v => v.id === editTarget.id ? {
        ...v,
        items: itemsToSave,
        subtotal: newSubtotal,
        total: newTotal,
        pagos: finalPagos,
        cajeroNombre: newCajero,
      } : v));

      setEditTarget(null);
    } catch (e: any) {
      alert('Error al guardar cambios de la venta: ' + e.message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!puedeAnularDevolver || !deleteTarget) return;
    if (!isPermisoAlto && deletePin !== EDIT_PIN) {
      setDeletePinError(true);
      setDeletePin('');
      return;
    }
    setDeleting(true);
    try {
      // 1. Restituir stock atómicamente en Firestore products (Web & POS Sync)
      try {
        await fetch('/api/pos/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            mode: 'restore',
            ventaId: deleteTarget.id,
            sede: deleteTarget.sede || currentSede,
            items: (deleteTarget.items || []).map((it: any) => ({
              sku: it.sku,
              cantidad: it.cantidad,
            })),
          }),
        });
      } catch (stockErr) {
        console.warn('Error restituyendo stock en anulación:', stockErr);
      }

      await updateVentaPos(deleteTarget.id, {
        estado: 'anulada',
        motivoAnulacion: deleteMotivo.trim() || 'Anulada por usuario autorizado',
        anuladaEn: Date.now(),
      });

      setVentasRaw(prev => prev.map(v => v.id === deleteTarget.id ? {
        ...v,
        estado: 'anulada',
        motivoAnulacion: deleteMotivo.trim() || 'Anulada por usuario autorizado',
      } : v));

      setDeleteTarget(null);
      setDeletePin('');
      setDeleteMotivo('');
      setDeletePinError(false);
    } catch (e: any) {
      alert('Error al anular venta: ' + e.message);
    } finally {
      setDeleting(false);
    }
  };

  // Renderizar esqueleto inicial para evitar Hydration Mismatch
  if (!mounted) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto min-h-screen bg-[#f4f6f3] flex items-center justify-center text-slate-500 font-sans">
        <Loader2 size={24} className="animate-spin text-[#087f73] mr-2.5" />
        <span className="text-sm font-bold">Cargando Historial POS...</span>
      </div>
    );
  }

  return (
    <div className="pos-historial-page min-h-screen bg-[#f4f6f3] text-slate-800 font-sans p-3 sm:p-5 lg:p-7">
      <div className="w-full max-w-[1600px] mx-auto space-y-5">

        {/* ─── ENCABEZADO PRINCIPAL (ASISTORA POS ADMIN STYLE) ─── */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pb-1">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="inline-flex items-center gap-[2.5px] h-[18px] px-1.5 bg-white border border-[#cfdfd4] rounded-[6px] shadow-xs shrink-0" title="Asistora">
                <i className="w-[3px] h-[12px] rounded-[1.5px] bg-[#e83462] block" />
                <i className="w-[3px] h-[12px] rounded-[1.5px] bg-[#f3c437] block" />
                <i className="w-[3px] h-[12px] rounded-[1.5px] bg-[#087f73] block" />
              </span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{sedeNombre}</span>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-medium text-slate-500">Punto de Venta</span>
              {isRealtimeActive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Actualizado en vivo
                </span>
              ) : syncStatus === 'cache' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Datos locales · sincronizando
                </span>
              ) : syncStatus === 'offline' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Servidor no confirmó · datos pueden estar desactualizados
                </span>
              ) : syncStatus === 'synced' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Consultado en servidor
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                  Sincronizando ventas…
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950">
              Historial de ventas y tickets
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Consulta boletas emitidas, reimprime comprobantes térmicos y gestiona correcciones con trazabilidad.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => loadVentas(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-2xs transition active:scale-95 disabled:opacity-60 cursor-pointer"
              title="Actualizar datos desde Firestore"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-[#087f73]' : 'text-slate-500'} />
              <span>{loading ? 'Cargando...' : 'Actualizar'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-2xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Descargar listado filtrado en Excel / CSV"
            >
              <Download size={14} className="text-slate-500" />
              <span>Exportar Excel</span>
            </button>

            <button
              type="button"
              onClick={() => window.opener ? window.close() : router.push(`/pos/${currentSede}`)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#087f73] hover:bg-[#06695f] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm transition active:scale-95 cursor-pointer"
            >
              <ShoppingCart size={16} />
              <span>Volver a Caja</span>
            </button>
          </div>
        </header>

        {/* ─── RESUMEN FINANCIERO Y MEDIOS DE PAGO (ESTILO POS ADMIN) ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)] gap-4 sm:gap-5">
          {/* Card 1: Resumen de Ventas de la Jornada (Hero Card) */}
          <section className="relative bg-[#edf5ef] border border-[#d4e3d8] rounded-2xl p-5 sm:p-6 overflow-hidden flex flex-col justify-between shadow-2xs">
            <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-gradient-to-b from-[#e83462] via-[#f3c437] to-[#087f73]" />

            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Período en pantalla</span>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">Ventas completadas</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white/70 border border-[#cfdfd4] rounded-lg px-2.5 py-1">
                <Calendar size={13} className="text-[#087f73]" />
                {fechaDesde === fechaHasta ? fechaDesde : `${fechaDesde} → ${fechaHasta}`}
              </span>
            </div>

            <div className="flex items-center justify-between my-4 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-500">Importe cobrado en tickets</p>
                <strong className="block text-3xl sm:text-4xl lg:text-5xl font-black text-slate-950 tracking-tight mt-1">
                  {fmtCLP(resumen.totalVentas)}
                </strong>
                <span className="text-[11px] text-slate-500">Monto total pagado, antes de devoluciones</span>
              </div>
              <div className="hidden sm:grid w-16 h-20 rounded-2xl border border-[#cfdfd4] bg-[#f8fcf8] place-items-center text-[#087f73] rotate-6 shadow-xs shrink-0">
                <Receipt size={32} strokeWidth={1.4} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3.5 border-t border-[#d4e3d8]">
              <div>
                <span className="block text-[11px] font-semibold text-slate-500">Tickets cobrados</span>
                <strong className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 block">{fmtCount(resumen.totalBoletas)}</strong>
              </div>
              <div className="border-l border-[#d4e3d8] pl-3">
                <span className="block text-[11px] font-semibold text-slate-500">Ticket promedio</span>
                <strong className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 block">{fmtCLP(resumen.ticketPromedio)}</strong>
              </div>
              <div className="border-l border-[#d4e3d8] pl-3">
                <span className="block text-[11px] font-semibold text-slate-500">Unidades vendidas</span>
                <strong className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 block">{fmtCount(resumen.totalItems)} u.</strong>
              </div>
            </div>
          </section>

          {/* Card 2: Desglose por Medios de Pago */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Medios de pago</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Distribución de las ventas completadas</p>
                </div>
                <CreditCard size={20} className="text-[#087f73]" />
              </div>

              {/* Segmented proportion bar */}
              <div className="flex h-3 gap-1 rounded-md bg-slate-100 p-0.5 overflow-hidden my-3">
                <span
                  className="bg-[#087f73] rounded-xs transition-all"
                  style={{ width: `${resumen.totalVentas > 0 ? (resumen.totalEfectivo / resumen.totalVentas) * 100 : 0}%` }}
                  title={`Efectivo: ${fmtCLP(resumen.totalEfectivo)}`}
                />
                <span
                  className="bg-[#8aa397] rounded-xs transition-all"
                  style={{ width: `${resumen.totalVentas > 0 ? (resumen.totalDebito / resumen.totalVentas) * 100 : 0}%` }}
                  title={`Débito: ${fmtCLP(resumen.totalDebito)}`}
                />
                <span
                  className="bg-[#f3c437] rounded-xs transition-all"
                  style={{ width: `${resumen.totalVentas > 0 ? (resumen.totalTransferencia / resumen.totalVentas) * 100 : 0}%` }}
                  title={`Transferencia: ${fmtCLP(resumen.totalTransferencia)}`}
                />
              </div>

              <div className="space-y-2.5 pt-1 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <div className="flex items-center gap-2 font-medium text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#087f73]" />
                    <span>Efectivo</span>
                  </div>
                  <strong className="font-black text-slate-900">{fmtCLP(resumen.totalEfectivo)}</strong>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <div className="flex items-center gap-2 font-medium text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#8aa397]" />
                    <span>Débito / Tarjeta</span>
                  </div>
                  <strong className="font-black text-slate-900">{fmtCLP(resumen.totalDebito)}</strong>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <div className="flex items-center gap-2 font-medium text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#f3c437]" />
                    <span>Transferencia</span>
                  </div>
                  <strong className="font-black text-slate-900">{fmtCLP(resumen.totalTransferencia)}</strong>
                </div>
              </div>
            </div>

            {resumen.anuladas > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
                <span className="flex items-center gap-1.5 font-bold">
                  <AlertCircle size={14} className="text-rose-600" />
                  {resumen.anuladas} ticket{resumen.anuladas === 1 ? '' : 's'} anulado{resumen.anuladas === 1 ? '' : 's'}
                </span>
                <span className="text-[11px] font-semibold text-rose-600">Stock restituido</span>
              </div>
            )}
          </section>
        </div>

        {/* ─── FILTROS Y BÚSQUEDA RESPONSIVE (1 SOLA FILA EN DESKTOP / ADAPTADO A MÓVILES) ─── */}
        <section className="bg-white border border-slate-200 rounded-2xl p-2.5 sm:p-3 shadow-2xs space-y-2">
          {/* Fila 1 en mobile: Buscador a ancho completo / Flex en Desktop */}
          <div className="flex flex-col xl:flex-row xl:items-center gap-2">
            {/* Buscador de boleta / producto / cliente */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                placeholder="Buscar por # boleta, monto ($), SKU, cajera o cliente…"
                style={{ paddingLeft: '38px', paddingRight: '28px' }}
                className="!w-full !h-9 !py-0 !text-xs !bg-slate-50/80 !border !border-slate-200 !rounded-xl text-slate-800 placeholder:text-slate-400 outline-none transition focus:!border-[#087f73] focus:!bg-white focus:!ring-2 focus:!ring-[#087f73]/15 font-medium"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => { setSearchTerm(''); setPage(1); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  title="Limpiar búsqueda"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Contenedor de Fechas y Filtros (En mobile se distribuye limpiamente) */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* Selector de Rango de Fechas Integrado */}
              <div className="inline-flex items-center justify-between gap-1.5 h-9 rounded-xl !border border-slate-200 bg-slate-50/80 px-2.5 text-xs font-semibold text-slate-700 flex-1 sm:flex-initial">
                <Calendar size={13} className="text-[#087f73] shrink-0" />
                <span className="text-[10px] uppercase font-bold text-slate-400">Del</span>
                <input
                  aria-label="Fecha desde"
                  type="date"
                  value={fechaDesde}
                  onChange={e => { setFechaDesde(e.target.value); setPage(1); }}
                  className="!w-auto !h-auto !p-0 !bg-transparent !border-0 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                />
                <span className="text-[10px] uppercase font-bold text-slate-400">al</span>
                <input
                  aria-label="Fecha hasta"
                  type="date"
                  value={fechaHasta}
                  onChange={e => { setFechaHasta(e.target.value); setPage(1); }}
                  className="!w-auto !h-auto !p-0 !bg-transparent !border-0 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                />
              </div>

              {/* Accesos rápidos de fecha */}
              <div className="inline-flex items-center h-9 rounded-xl border border-slate-200 bg-slate-50/80 p-0.5 shrink-0 overflow-x-auto max-w-full">
                {(['today', 'yesterday', 'week', 'month'] as const).map(t => {
                  const label = t === 'today' ? 'Hoy' : t === 'yesterday' ? 'Ayer' : t === 'week' ? '7 días' : 'Este mes';
                  const active = (t === 'today' && fechaDesde === todayFilter && fechaHasta === todayFilter);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => applyQuickDate(t)}
                      className={`px-2.5 h-full rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-white text-[#087f73] shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Select: Estado */}
              <select
                aria-label="Filtrar por estado"
                value={filterEstado}
                onChange={e => { setFilterEstado(e.target.value); setPage(1); }}
                className="!w-auto !h-9 !py-0 !pl-2.5 !pr-7 !text-xs font-semibold !rounded-xl !border border-slate-200 !bg-slate-50/80 hover:!bg-white text-slate-700 outline-none cursor-pointer transition focus:!border-[#087f73] focus:!bg-white focus:!ring-2 focus:!ring-[#087f73]/15 flex-1 sm:flex-initial"
              >
                <option value="todos">Estado: Todos</option>
                <option value="completada">Completadas</option>
                <option value="anulada">Anuladas</option>
              </select>

              {/* Select: Medio de Pago */}
              <select
                aria-label="Filtrar por medio de pago"
                value={filterMetodo}
                onChange={e => { setFilterMetodo(e.target.value); setPage(1); }}
                className="!w-auto !h-9 !py-0 !pl-2.5 !pr-7 !text-xs font-semibold !rounded-xl !border border-slate-200 !bg-slate-50/80 hover:!bg-white text-slate-700 outline-none cursor-pointer transition focus:!border-[#087f73] focus:!bg-white focus:!ring-2 focus:!ring-[#087f73]/15 flex-1 sm:flex-initial"
              >
                <option value="todos">Pago: Todos</option>
                <option value="efectivo">Efectivo</option>
                <option value="debito">Débito</option>
                <option value="transferencia">Transferencia</option>
              </select>

              {/* Select: Cajera */}
              {knownCajeros.length > 1 && (
                <select
                  aria-label="Filtrar por cajera"
                  value={filterCajero}
                  onChange={e => { setFilterCajero(e.target.value); setPage(1); }}
                  className="!w-auto !h-9 !py-0 !pl-2.5 !pr-7 !text-xs font-semibold !rounded-xl !border border-slate-200 !bg-slate-50/80 hover:!bg-white text-slate-700 outline-none cursor-pointer transition focus:!border-[#087f73] focus:!bg-white focus:!ring-2 focus:!ring-[#087f73]/15 flex-1 sm:flex-initial max-w-[140px] truncate"
                >
                  <option value="todos">Cajera: Todas</option>
                  {knownCajeros.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}

              {/* Contador de ventas/tickets */}
              <span className="h-9 inline-flex items-center justify-center rounded-xl bg-teal-50 border border-teal-100 px-2.5 text-xs font-black text-teal-800 whitespace-nowrap shrink-0">
                {filtered.length} {filtered.length === 1 ? 'ticket' : 'tickets'}
              </span>

              {/* Limpiar filtros */}
              {(Boolean(searchTerm) || filterEstado !== 'todos' || filterMetodo !== 'todos' || filterCajero !== 'todos' || fechaDesde !== todayFilter || fechaHasta !== todayFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterEstado('todos');
                    setFilterMetodo('todos');
                    setFilterCajero('todos');
                    setFechaDesde(todayFilter);
                    setFechaHasta(todayFilter);
                    setPage(1);
                  }}
                  className="inline-flex items-center gap-1 h-9 px-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition shrink-0 cursor-pointer"
                  title="Restablecer filtros a hoy"
                >
                  <RotateCcw size={12} />
                  <span className="hidden sm:inline">Limpiar</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ─── COMPROBANTES / ACTIVIDAD (TABLA EN DESKTOP, CARDS EN MOBILE) ─── */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          {/* Cabecera Responsiva */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 px-3.5 sm:px-4 py-2.5 bg-slate-50/70 gap-2">
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">Tickets y comprobantes</h2>
                <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                  {filtered.length} {filtered.length === 1 ? 'registro' : 'registros'}
                </span>
              </div>
              <span className="sm:hidden text-xs font-semibold text-slate-500">
                Pág. {page}/{totalPages}
              </span>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
              <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                {/* Selector de Orden */}
                <select
                  aria-label="Ordenar por"
                  value={sortOrder}
                  onChange={e => { setSortOrder(e.target.value as 'recent' | 'amount-desc'); setPage(1); }}
                  className="!flex-1 sm:!flex-initial !w-auto !h-8 !py-0 !pl-2.5 !pr-7 !text-xs font-bold !rounded-xl !border border-slate-200 !bg-white hover:!bg-slate-50 text-slate-700 outline-none cursor-pointer transition focus:!border-[#087f73]"
                >
                  <option value="recent">Más recientes</option>
                  <option value="amount-desc">Mayor importe</option>
                </select>

                {/* Selector de Tamaño de Página */}
                <select
                  aria-label="Registros por página"
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="!w-auto !h-8 !py-0 !pl-2.5 !pr-7 !text-xs font-bold !rounded-xl !border border-slate-200 !bg-white hover:!bg-slate-50 text-slate-700 outline-none cursor-pointer transition focus:!border-[#087f73]"
                >
                  <option value={15}>15 / pág.</option>
                  <option value={25}>25 / pág.</option>
                  <option value={50}>50 / pág.</option>
                  <option value={100}>100 / pág.</option>
                </select>
              </div>

              <span className="hidden sm:inline text-xs font-semibold text-slate-500 pl-1 border-l border-slate-200">
                Pág. {page} de {totalPages}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 gap-2.5">
              <Loader2 size={20} className="animate-spin text-[#087f73]" />
              <span className="text-xs font-bold text-slate-600">Cargando comprobantes de la sucursal...</span>
            </div>
          ) : paged.length === 0 ? (
            <div className="py-20 px-4 text-center text-slate-400 space-y-2">
              <Receipt size={40} className="mx-auto opacity-30 text-[#087f73]" />
              <p className="text-sm font-bold text-slate-700">No se encontraron tickets con los filtros aplicados</p>
              <p className="text-xs text-slate-400">Prueba cambiando el rango de fechas o limpiando el buscador.</p>
            </div>
          ) : (
            <>
              {/* ─── VISTA MOBILE: CARDS DE TICKETS (PANTALLAS PEQUEÑAS) ─── */}
              <div className="block lg:hidden divide-y divide-slate-100 p-2 sm:p-3 space-y-2.5">
                {paged.map((v) => {
                  const isAnulada = v.estado === 'anulada';
                  const fechaObj = (v.fecha?.toDate ? v.fecha.toDate() : null)
                    || (v.fechaTs ? new Date(v.fechaTs) : null)
                    || (v.createdAtTs ? new Date(v.createdAtTs) : null);
                  const horaStr = fechaObj ? new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }).format(fechaObj) : '--:--';
                  const diaStr = fechaObj ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', timeZone: 'America/Santiago' }).format(fechaObj) : (v.fechaStr || '');
                  const totalUnits = (v.items || []).reduce((acc, it) => acc + Number(it.cantidad || 0), 0);
                  const totalLines = v.items?.length || 0;

                  return (
                    <div
                      key={`mobile-${v.id}`}
                      className={`rounded-2xl border p-3.5 transition-all space-y-3 ${
                        isAnulada
                          ? 'bg-rose-50/20 border-rose-200/80'
                          : 'bg-white border-slate-200/90 shadow-2xs hover:border-[#087f73]/50'
                      }`}
                    >
                      {/* Fila 1: Folio, Fecha y Monto con Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                            isAnulada ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-200 bg-slate-50 text-[#087f73]'
                          }`}>
                            <Receipt size={17} />
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedVenta(v)}
                              className="font-mono font-black text-sm text-[#087f73] hover:underline block text-left truncate cursor-pointer"
                            >
                              {v.boletaNumero ? `#${String(v.boletaNumero).padStart(6, '0')}` : `#${v.id.slice(-6).toUpperCase()}`}
                            </button>
                            <span className="text-[11px] text-slate-400 font-medium">
                              {horaStr} · {diaStr}
                            </span>
                          </div>
                        </div>

                        {/* Monto y Estado */}
                        <div className="text-right shrink-0">
                          <strong className={`block text-base font-black tracking-tight ${isAnulada ? 'line-through text-slate-400' : 'text-slate-950'}`}>
                            {fmtCLP(v.total)}
                          </strong>
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider mt-0.5 ${
                            isAnulada ? 'bg-[#fff0f3] text-[#ab2847] border border-[#fecdd3]' : 'bg-[#edf6ef] text-[#326446] border border-[#cfdfd4]'
                          }`}>
                            {v.estado}
                          </span>
                        </div>
                      </div>

                      {/* Fila 2: Cajera, Cliente, Medios de Pago e Ítems */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-slate-800 text-xs truncate max-w-[130px]">
                            {v.cajeroNombre || 'Cajera'}
                          </span>
                          {v.clienteNombre && v.clienteNombre !== 'Cliente' && v.clienteNombre !== 'Genérico' && (
                            <span className="rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 truncate max-w-[120px]">
                              {v.clienteNombre}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          {/* Medios de Pago */}
                          {v.pagos && v.pagos.length > 0 ? (
                            v.pagos.map((p, idx) => {
                              const m = (p.metodo || '').toLowerCase().trim();
                              const badgeStyle = m === 'transferencia'
                                ? 'bg-[#fff7dc] text-[#7c6111] border-[#fef08a]'
                                : m === 'debito'
                                ? 'bg-[#f0f4f2] text-[#3e564a] border-[#cfdfd4]'
                                : 'bg-[#edf6ef] text-[#326446] border-[#bdddd1]';
                              return (
                                <span key={idx} className={`capitalize px-2 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${badgeStyle}`}>
                                  {p.metodo}: {fmtCLP(p.monto)}
                                </span>
                              );
                            })
                          ) : (
                            <span className="capitalize px-2 py-0.5 rounded-md text-[10px] font-bold border bg-[#edf6ef] text-[#326446] border-[#bdddd1] whitespace-nowrap">
                              {v.metodoPago || 'efectivo'}: {fmtCLP(v.total)}
                            </span>
                          )}

                          <span className="text-[10px] font-medium text-slate-400">
                            {totalUnits} u. ({totalLines} {totalLines === 1 ? 'ítem' : 'ítems'})
                          </span>
                        </div>
                      </div>

                      {/* Fila 3: Botones de Acción Táctiles para Mobile */}
                      <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setSelectedVenta(v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition active:scale-95 cursor-pointer"
                        >
                          <Eye size={13} className="text-slate-500" />
                          <span>Ver</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openVentaReceipt(v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-[#087f73] text-xs font-bold transition active:scale-95 cursor-pointer"
                        >
                          <Receipt size={13} />
                          <span>Ticket</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openRestoredSale(v)}
                          title="Cargar al carrito"
                          className="w-8 h-8 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition active:scale-95 cursor-pointer"
                        >
                          <ShoppingCart size={14} />
                        </button>

                        {!isAnulada && puedeAnularDevolver && (
                          <button
                            type="button"
                            onClick={() => setRehacerTarget(v)}
                            title="Rehacer venta"
                            className="w-8 h-8 inline-flex items-center justify-center rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition active:scale-95 cursor-pointer"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}

                        {!isAnulada && puedeEditarBoleta && (
                          <button
                            type="button"
                            onClick={() => openEditPago(v)}
                            title="Editar pago"
                            className="w-8 h-8 inline-flex items-center justify-center rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 transition active:scale-95 cursor-pointer"
                          >
                            <Edit3 size={14} />
                          </button>
                        )}

                        {!isAnulada && puedeAnularDevolver && (
                          <button
                            type="button"
                            onClick={() => { setDeleteTarget(v); setDeletePin(''); setDeleteMotivo(''); setDeletePinError(false); }}
                            title="Anular venta"
                            className="w-8 h-8 inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition active:scale-95 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ─── VISTA DESKTOP: TABLA COMPLETA CON SCROLL HORIZONTAL ─── */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#f7f9f6] border-b border-slate-200/80 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap">Comprobante / Folio</th>
                      <th className="px-3 py-3 whitespace-nowrap">Hora · Fecha</th>
                      <th className="px-3 py-3 whitespace-nowrap">Operador / Cliente</th>
                      <th className="px-3 py-3 whitespace-nowrap">Medio de Pago</th>
                      <th className="px-3 py-3 text-center whitespace-nowrap">Ítems</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Importe</th>
                      <th className="px-3 py-3 text-center whitespace-nowrap">Estado</th>
                      <th className="px-3 py-3 text-center whitespace-nowrap">Tipo</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {paged.map((v) => {
                      const isAnulada = v.estado === 'anulada';
                      const fechaObj = (v.fecha?.toDate ? v.fecha.toDate() : null)
                        || (v.fechaTs ? new Date(v.fechaTs) : null)
                        || (v.createdAtTs ? new Date(v.createdAtTs) : null);
                      const horaStr = fechaObj ? new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }).format(fechaObj) : '--:--';
                      const diaStr = fechaObj ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', timeZone: 'America/Santiago' }).format(fechaObj) : (v.fechaStr || '');
                      const totalUnits = (v.items || []).reduce((acc, it) => acc + Number(it.cantidad || 0), 0);
                      const totalLines = v.items?.length || 0;

                      return (
                        <tr
                          key={v.id}
                          className={`hover:bg-slate-50/90 transition-colors ${isAnulada ? 'bg-rose-50/25 text-slate-400' : ''}`}
                        >
                          {/* 1. Folio / Boleta con icono de ticket Asistora */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-9 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                                <Receipt size={16} />
                              </div>
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedVenta(v)}
                                  className="font-mono font-black text-xs text-[#087f73] hover:text-[#06695f] hover:underline block text-left cursor-pointer"
                                  title="Ver detalle completo del ticket"
                                >
                                  {v.boletaNumero ? `#${String(v.boletaNumero).padStart(6, '0')}` : `#${v.id.slice(-6).toUpperCase()}`}
                                </button>
                                <span className="text-[10px] text-slate-400 block font-medium">ID: {v.id.slice(0, 8)}</span>
                              </div>
                            </div>
                          </td>

                          {/* 2. Hora y Fecha */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="flex items-baseline gap-1.5">
                              <strong className="text-slate-900 font-bold text-xs">{horaStr}</strong>
                              <span className="text-[11px] text-slate-400 font-medium">{diaStr}</span>
                            </div>
                          </td>

                          {/* 3. Operador / Cliente */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800 text-xs">{v.cajeroNombre || 'Cajera'}</span>
                              {v.clienteNombre && v.clienteNombre !== 'Cliente' && v.clienteNombre !== 'Genérico' && (
                                <span className="rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 truncate max-w-[130px]" title={v.clienteNombre}>
                                  {v.clienteNombre}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 4. Medio de Pago */}
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {v.pagos && v.pagos.length > 0 ? (
                                v.pagos.map((p, idx) => {
                                  const m = (p.metodo || '').toLowerCase().trim();
                                  const badgeStyle = m === 'transferencia'
                                    ? 'bg-[#fff7dc] text-[#7c6111] border-[#fef08a]'
                                    : m === 'debito'
                                    ? 'bg-[#f0f4f2] text-[#3e564a] border-[#cfdfd4]'
                                    : 'bg-[#edf6ef] text-[#326446] border-[#bdddd1]';
                                  return (
                                    <span key={idx} className={`capitalize px-2 py-0.5 rounded-md text-[11px] font-bold border whitespace-nowrap ${badgeStyle}`}>
                                      {p.metodo}: {fmtCLP(p.monto)}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="capitalize px-2 py-0.5 rounded-md text-[11px] font-bold border bg-[#edf6ef] text-[#326446] border-[#bdddd1] whitespace-nowrap">
                                  {v.metodoPago || 'efectivo'}: {fmtCLP(v.total)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 5. Ítems */}
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            <span className="text-xs font-bold text-slate-800">{totalUnits}</span>
                            <span className="text-[11px] text-slate-400 font-medium ml-1">({totalLines} {totalLines === 1 ? 'ítem' : 'ítems'})</span>
                          </td>

                          {/* 6. Importe */}
                          <td className="px-4 py-3 text-right font-black text-xs sm:text-sm text-slate-950 whitespace-nowrap">
                            {fmtCLP(v.total)}
                          </td>

                          {/* 7. Estado */}
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                              isAnulada
                                ? 'bg-[#fff0f3] text-[#ab2847] border border-[#fecdd3]'
                                : 'bg-[#edf6ef] text-[#326446] border border-[#cfdfd4]'
                            }`}>
                              {v.estado}
                            </span>
                          </td>

                          {/* 8. Tipo Comprobante */}
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 border border-slate-200 text-slate-700">
                              {(v as any).tipoComprobante === 'boleta' ? 'Boleta' : 'Comprob.'}
                            </span>
                          </td>

                          {/* 9. Acciones */}
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <div className="inline-flex items-center justify-center gap-1">
                              {/* Ver Detalle */}
                              <button
                                type="button"
                                onClick={() => setSelectedVenta(v)}
                                title="Ver detalle de la venta"
                                className="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition cursor-pointer"
                              >
                                <Eye size={14} />
                              </button>

                              {/* Reimprimir comprobante interno */}
                              <button
                                type="button"
                                onClick={() => openVentaReceipt(v)}
                                title="Reimprimir comprobante interno"
                                className="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100 text-[#087f73] transition cursor-pointer"
                              >
                                <Receipt size={14} />
                              </button>

                              {/* Cargar a Carrito */}
                              <button
                                type="button"
                                onClick={() => openRestoredSale(v)}
                                title="Reingresar productos al carrito en otra pestaña"
                                className="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition cursor-pointer"
                              >
                                <ShoppingCart size={14} />
                              </button>

                              {/* Rehacer Venta (si tiene permiso) */}
                              {!isAnulada && puedeAnularDevolver && (
                                <button
                                  type="button"
                                  onClick={() => setRehacerTarget(v)}
                                  title="Rehacer Venta (Anular y cargar al carrito actual)"
                                  className="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition cursor-pointer"
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}

                              {/* Editar Venta (si tiene permiso) */}
                              {!isAnulada && puedeEditarBoleta && (
                                <button
                                  type="button"
                                  onClick={() => openEditPago(v)}
                                  title="Editar Pago / Productos"
                                  className="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 transition cursor-pointer"
                                >
                                  <Edit3 size={14} />
                                </button>
                              )}

                              {/* Anular Venta (si tiene permiso) */}
                              {!isAnulada && puedeAnularDevolver && (
                                <button
                                  type="button"
                                  onClick={() => { setDeleteTarget(v); setDeletePin(''); setDeleteMotivo(''); setDeletePinError(false); }}
                                  title="Anular Venta"
                                  className="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ─── PAGINACIÓN RESPONSIVE ─── */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3.5 sm:px-4 py-3 border-t border-slate-100 bg-[#f7f9f6] text-xs">
              <span className="text-slate-500 font-medium text-center sm:text-left">
                Mostrando {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length} ventas · Pág. {page} de {totalPages}
              </span>
              <div className="flex items-center justify-center gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-bold cursor-pointer transition text-xs shadow-2xs"
                >
                  Anterior
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pNum = i + 1;
                    if (totalPages > 5 && page > 3) {
                      pNum = page - 2 + i;
                      if (pNum > totalPages) pNum = totalPages - (4 - i);
                    }
                    return (
                      <button
                        key={pNum}
                        onClick={() => setPage(pNum)}
                        className={`w-8 h-8 rounded-xl text-xs font-black transition cursor-pointer ${
                          page === pNum
                            ? 'bg-[#087f73] text-white shadow-2xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {pNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-bold cursor-pointer transition text-xs shadow-2xs"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ─── MODAL VER DETALLE ─── */}
        {selectedVenta && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setSelectedVenta(null)}>
            <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#087f73]">
                    <Receipt size={18} />
                  </span>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Ticket #{selectedVenta.boletaNumero || selectedVenta.id.slice(-6)}
                    </h3>
                    <p className="text-xs text-slate-500">{selectedVenta.fechaStr} · {fmtDateTime(selectedVenta)}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedVenta(null)} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div>
                    <span className="block text-[11px] text-slate-500 font-semibold">Cajera:</span>
                    <strong className="text-slate-900 font-bold text-xs">{selectedVenta.cajeroNombre}</strong>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 font-semibold">Cliente:</span>
                    <strong className="text-slate-900 font-bold text-xs">{selectedVenta.clienteNombre || 'Cliente general'}</strong>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <p className="font-bold text-slate-800 mb-2">Ítems comprados ({selectedVenta.items?.length || 0}):</p>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {selectedVenta.items?.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl text-xs border border-slate-100">
                        {it.imageUrl ? (
                          <div
                            onClick={() => setZoomImage({ url: it.imageUrl!, title: it.nombre })}
                            className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-white shrink-0 cursor-zoom-in group shadow-2xs"
                            title="Click para ampliar imagen"
                          >
                            <img src={it.imageUrl} alt={it.nombre} className="w-full h-full object-cover group-hover:scale-105 transition" />
                            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                              <ZoomIn size={14} />
                            </div>
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                            <Package size={20} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 truncate" title={it.nombre}>
                            {it.nombre}
                            {it && formatEmbalajeBoletaLabel(it) ? (
                              <strong className="font-black text-[#087f73] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[11px] ml-1.5">
                                {formatEmbalajeBoletaLabel(it).trim()}
                              </strong>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded text-[10px] border border-slate-200">
                              {formatProductCodeLabel(it) || `SKU: ${it.sku}`}
                            </span>
                            <span>Cant: <strong className="text-slate-800">{it.cantidad}</strong></span>
                            <span>c/u: <strong className="text-slate-800">{fmtCLP(it.precioUnitario || (it.cantidad > 0 ? it.subtotal / it.cantidad : 0))}</strong></span>
                          </div>
                        </div>
                        <span className="font-black text-slate-900 text-sm shrink-0">{fmtCLP(it.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-1.5">
                  <div className="flex justify-between text-slate-600 text-xs">
                    <span>Subtotal:</span>
                    <span>{fmtCLP(selectedVenta.subtotal || selectedVenta.total)}</span>
                  </div>
                  {Number(selectedVenta.descuentoGlobal || 0) > 0 && (
                    <div className="flex justify-between text-amber-700 text-xs font-bold">
                      <span>Descuento ({selectedVenta.descuentoGlobalPct}%):</span>
                      <span>-{fmtCLP(selectedVenta.descuentoGlobal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-950 font-black text-base border-t border-slate-200 pt-2">
                    <span>Total Venta:</span>
                    <span className="text-[#087f73]">{fmtCLP(selectedVenta.total)}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2">
                  {selectedVenta.estado !== 'anulada' && puedeAnularDevolver && (
                    <>
                      <button
                        onClick={() => {
                          const v = selectedVenta;
                          setSelectedVenta(null);
                          setDeleteTarget(v);
                          setDeletePin('');
                          setDeleteMotivo('');
                          setDeletePinError(false);
                        }}
                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                      >
                        <Trash2 size={14} className="text-rose-600" /> Anular
                      </button>
                      <button
                        onClick={() => {
                          const v = selectedVenta;
                          setSelectedVenta(null);
                          setRehacerTarget(v);
                        }}
                        className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                      >
                        <RotateCcw size={14} className="text-amber-600" /> Rehacer Venta
                      </button>
                      {puedeEditarBoleta && (
                        <button
                          onClick={() => {
                            const v = selectedVenta;
                            setSelectedVenta(null);
                            openEditPago(v);
                          }}
                          className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                        >
                          <Edit3 size={14} className="text-purple-600" /> Editar
                        </button>
                      )}
                    </>
                  )}
                </div>
                <button
                  onClick={() => openVentaReceipt(selectedVenta)}
                  className="px-4 py-2 bg-[#087f73] hover:bg-[#06695f] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition"
                >
                  <Receipt size={14} /> Reimprimir comprobante interno
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL REHACER VENTA ─── */}
        {rehacerTarget && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setRehacerTarget(null)}>
            <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2.5 text-amber-600">
                <span className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold">
                  <RotateCcw size={18} />
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900">Rehacer Venta</h3>
                  <p className="text-xs text-slate-500">Ticket #{rehacerTarget.boletaNumero || rehacerTarget.id.slice(-6)}</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Esta acción marcará el ticket como <strong>ANULADO</strong>, restituirá el stock en tienda física y web, y cargará todos los ítems directamente al carrito de tu POS para que puedas modificarlos y volver a cobrar.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Motivo de rehacer / anulación:</label>
                <input
                  type="text"
                  value={rehacerMotivo}
                  onChange={e => setRehacerMotivo(e.target.value)}
                  placeholder="Ej. Cambio de producto, corrección de precio..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setRehacerTarget(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Cancelar
                </button>
                <button
                  disabled={!rehacerMotivo.trim() || rehacerSaving}
                  onClick={handleRehacerConfirm}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                >
                  {rehacerSaving ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  <span>Confirmar y Cargar a Caja</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL ANULAR VENTA ─── */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
            <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2.5 text-rose-600">
                <span className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 font-bold">
                  <ShieldAlert size={18} />
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900">Anular Ticket #{deleteTarget.boletaNumero || deleteTarget.id.slice(-6)}</h3>
                  <p className="text-xs text-slate-500">{isPermisoAlto ? 'Acceso Autorizado' : 'Autorización requerida'}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Motivo de Anulación:</label>
                  <input
                    type="text"
                    value={deleteMotivo}
                    onChange={e => setDeleteMotivo(e.target.value)}
                    placeholder="Ej. Devolución de cliente, error de cobro..."
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500"
                  />
                </div>

                {isPermisoAlto ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>Autorizado como {isSupreme ? 'Administrador' : 'Cajera (Permiso Alto)'} — no requiere PIN.</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Ingresa PIN de Autorización (Jefe):</label>
                    <input
                      type="password"
                      value={deletePin}
                      onChange={e => { setDeletePin(e.target.value); setDeletePinError(false); }}
                      placeholder="****"
                      className={`w-full p-2.5 border rounded-xl text-xs outline-none ${deletePinError ? 'border-rose-500 bg-rose-50' : 'border-slate-200'}`}
                    />
                    {deletePinError && <p className="text-[11px] text-rose-600 font-semibold">PIN incorrecto.</p>}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Cancelar
                </button>
                <button
                  disabled={deleting || (!isPermisoAlto && !deletePin)}
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  <span>Anular Ticket Definitivamente</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL EDITAR VENTA ─── */}
        {editTarget && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setEditTarget(null)}>
            <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 p-6 sm:p-7 space-y-5 my-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5 text-purple-700">
                  <div className="p-2 bg-purple-100 rounded-xl">
                    <Edit3 size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      Editar Venta #{editTarget.boletaNumero || editTarget.id.slice(-6)}
                    </h3>
                    <p className="text-xs text-slate-500">Modifica productos, cantidades, precios y forma de pago con sincronización de stock.</p>
                  </div>
                </div>
                <button onClick={() => setEditTarget(null)} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400">
                  <X size={18} />
                </button>
              </div>

              {!editPinOk && !isPermisoAlto ? (
                <div className="space-y-4 py-2">
                  <p className="text-xs text-slate-600 font-medium">
                    Esta acción modifica el comprobante emitido y ajusta el inventario. Ingresa el <strong>PIN de Autorización (Jefe)</strong> para continuar:
                  </p>
                  <input
                    type="password"
                    value={editPin}
                    onChange={e => { setEditPin(e.target.value); setEditPinError(false); }}
                    placeholder="****"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (editPin === EDIT_PIN) { setEditPinOk(true); setEditPinError(false); }
                        else { setEditPinError(true); }
                      }
                    }}
                    className={`w-full p-3 border rounded-xl text-center text-lg tracking-widest font-mono outline-none ${editPinError ? 'border-rose-500 bg-rose-50' : 'border-slate-300 focus:border-purple-500'}`}
                  />
                  {editPinError && <p className="text-xs text-rose-600 font-semibold text-center">PIN incorrecto. Inténtalo de nuevo.</p>}
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setEditTarget(null)} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition">
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (editPin === EDIT_PIN) { setEditPinOk(true); setEditPinError(false); }
                        else { setEditPinError(true); }
                      }}
                      className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition shadow-sm"
                    >
                      Verificar PIN
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-slate-700">Motivo de la edición · obligatorio para auditoría</span>
                    <textarea value={editReason} onChange={e => setEditReason(e.target.value)} maxLength={500} rows={2} placeholder="Explica por qué se modifica esta boleta" className="w-full resize-y rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-violet-500" />
                  </label>

                  {/* Método de pago, Cajero y Monto */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Método de Pago:</label>
                      <select
                        value={editMetodo}
                        onChange={e => setEditMetodo(e.target.value as MetodoPago)}
                        className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none bg-white focus:border-purple-500"
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="debito">Débito</option>
                        <option value="transferencia">Transferencia</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Cajero/a Responsable:</label>
                      <select
                        value={knownCajeros.includes(editCajero) ? editCajero : (editCajero ? '__otro__' : '')}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '__otro__') {
                            setIsCustomCajero(true);
                          } else {
                            setIsCustomCajero(false);
                            setEditCajero(val);
                          }
                        }}
                        className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none bg-white focus:border-purple-500 cursor-pointer"
                      >
                        <option value="" disabled>Selecciona cajera/o...</option>
                        {knownCajeros.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        <option value="__otro__">✏️ Escribir otro nombre...</option>
                      </select>

                      <div className="flex flex-wrap gap-1 pt-1">
                        {['Paola', 'Fernanda', 'Lissy', 'Daniel'].map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => { setEditCajero(c); setIsCustomCajero(false); }}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition ${
                              editCajero === c && !isCustomCajero
                                ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-xs'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>

                      {isCustomCajero && (
                        <input
                          type="text"
                          value={editCajero}
                          onChange={e => setEditCajero(e.target.value)}
                          placeholder="Escribe el nombre del cajero/a..."
                          className="w-full mt-1.5 p-2 border border-purple-300 rounded-xl text-xs font-semibold outline-none bg-purple-50 focus:border-purple-600"
                          autoFocus
                        />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Monto Cobrado (CLP):</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editMonto ? Number(editMonto.replace(/[^0-9]/g, '')).toLocaleString('es-CL') : ''}
                        onChange={e => setEditMonto(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder={editTotal.toLocaleString('es-CL')}
                        className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  {/* Lista de Productos con Fotos */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">Productos en la Venta ({editItems.length}):</label>
                      <span className="text-[11px] text-slate-500">Escribe la cantidad (0 para eliminar)</span>
                    </div>

                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {editItems.map((it, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-3 p-3 rounded-2xl border transition ${it.cantidad <= 0 ? 'bg-rose-50/50 border-rose-200 opacity-60' : 'bg-slate-50/70 border-slate-200'}`}
                        >
                          {it.imageUrl ? (
                            <div
                              onClick={() => setZoomImage({ url: it.imageUrl!, title: it.nombre })}
                              className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200 bg-white shrink-0 cursor-zoom-in group shadow-2xs"
                              title="Click para ampliar imagen"
                            >
                              <img src={it.imageUrl} alt={it.nombre} className="w-full h-full object-cover group-hover:scale-105 transition" />
                              <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                <ZoomIn size={14} />
                              </div>
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                              <Package size={20} />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 text-xs truncate" title={it.nombre}>
                              {it.nombre}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                              SKU: {it.sku}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <span className="text-[9px] text-slate-400 block">Precio unit.</span>
                              <div className="relative">
                                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">$</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={it.precioUnitario ? it.precioUnitario.toLocaleString('es-CL') : ''}
                                  onChange={e => handleUpdateEditItemPrice(idx, e.target.value)}
                                  className="w-20 pl-4 pr-1.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-right outline-none focus:border-purple-500"
                                />
                              </div>
                            </div>

                            <div className="text-center">
                              <span className="text-[9px] text-slate-400 block">Cant.</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={it.cantidad === 0 ? '0' : String(it.cantidad)}
                                onChange={e => handleUpdateEditItemQty(idx, e.target.value)}
                                className="w-12 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-center outline-none focus:border-purple-500"
                              />
                            </div>

                            <div className="w-20 text-right">
                              <span className="text-[9px] text-slate-400 block">Subtotal</span>
                              <span className="text-xs font-black text-slate-900">
                                {fmtCLP(it.subtotal)}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveEditItem(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition ml-1 cursor-pointer"
                              title="Eliminar producto de la venta"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}

                      {editItems.length === 0 && (
                        <div className="p-6 text-center text-xs text-rose-600 font-semibold bg-rose-50 rounded-2xl border border-rose-200">
                          Se han eliminado todos los productos. Debes tener al menos un producto para guardar o anular la venta.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resumen de Totales */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal Productos:</span>
                      <span className="font-bold text-slate-900">{fmtCLP(editSubtotal)}</span>
                    </div>
                    {editDescuento > 0 && (
                      <div className="flex justify-between text-amber-700">
                        <span>Descuento Global:</span>
                        <span className="font-bold">-{fmtCLP(editDescuento)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-1.5">
                      <span>Nuevo Total Venta:</span>
                      <span className="text-purple-700 text-base">{fmtCLP(editTotal)}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 p-3 rounded-xl text-blue-900 text-[11px] leading-relaxed">
                    <AlertCircle size={16} className="shrink-0 text-blue-600 mt-0.5" />
                    <span>
                      <strong>Sincronización de Inventario:</strong> Al guardar los cambios, el inventario se ajustará automáticamente. Si disminuyes unidades o eliminas productos, el stock se restituirá; si aumentas unidades, se descontará.
                    </span>
                  </div>

                  <div className="flex justify-end gap-2.5 pt-2">
                    <button
                      onClick={() => setEditTarget(null)}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={editSaving || !editReason.trim() || editItems.filter(it => it.cantidad > 0).length === 0}
                      onClick={handleEditSave}
                      className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                    >
                      {editSaving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      Guardar Cambios y Sincronizar Stock
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── MODAL ZOOM IMAGEN ─── */}
        {zoomImage && (
          <div
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setZoomImage(null)}
          >
            <div className="relative max-w-lg w-full bg-white rounded-3xl p-3 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setZoomImage(null)}
                className="absolute top-4 right-4 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full p-2 transition z-10 cursor-pointer"
                title="Cerrar"
              >
                <X size={18} />
              </button>
              <img src={zoomImage.url} alt={zoomImage.title} className="w-full max-h-[75vh] object-contain rounded-2xl bg-white" />
              <div className="p-3 text-center">
                <p className="text-sm font-bold text-slate-900">{zoomImage.title}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
