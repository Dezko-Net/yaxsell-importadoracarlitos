'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { SEDES, DEFAULT_SEDE, SedeSlug } from '@/types';
import { branchSlugQueryValues, matchBranchSlug } from '@/lib/posBranchAccess';
import { getChileDateStr, shiftDateStr } from '@/lib/chileDate';
import {
  ClipboardList, RefreshCw, Printer, Receipt, Calendar, User,
  DollarSign, CheckCircle2, AlertCircle, TrendingUp, TrendingDown,
  ArrowUpRight, FileText, Eye, X, ChevronRight, Clock, CreditCard,
  Wallet, Store, RotateCcw, Download, Search, AlertTriangle, ArrowLeft,
  Send, ShoppingBag
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, or, getDocs, orderBy, onSnapshot, limit } from 'firebase/firestore';
import {
  openCorteCajaPrintWindow,
  openCorteGeneralPrintWindow,
  openReceiptPrintWindow,
  CorteCajaData,
  CorteGeneralData,
  ReceiptData,
  DEFAULT_COMPANY_CONFIG,
  VentaVendedorEnvioItem
} from '@/lib/posReceipt';

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n || 0));

const fmtNum = (n: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(n || 0));

const normalizeStaffName = (name: string) =>
  String(name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

function StaffAvatar({ name, photoUrl, className }: { name: string; photoUrl?: string; className: string }) {
  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden ${className}`}>
      <span aria-hidden="true">{String(name || '?').trim().charAt(0).toUpperCase()}</span>
      {photoUrl && (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
    </div>
  );
}

export interface CorteRegistro {
  id: string;
  cajeroNombre: string;
  sede: string;
  fechaCierreStr: string;
  horaCierreStr: string;
  aperturaAtTs?: number;
  cierreAtTs?: number;
  montoApertura: number;
  ventasCount: number;
  totalVentas: number;
  totalEfectivo: number;
  totalDebito: number;
  totalTransferencia: number;
  totalVueltos?: number;
  efectivoTeorico: number;
  efectivoReal: number;
  diferencia: number;
  gastos?: number;
  gastosItems?: Array<{ monto: number; detalle?: string; observacion?: string; tipoGasto?: string; categoria?: string }>;
  totalDevoluciones?: number;
  devolucionesItems?: Array<{ monto: number; detalle?: string; observacion?: string }>;
  sesionCajaId?: string;
  createdAtTs?: number;
  anulado?: boolean;
  estado?: string;
  motivoAnulacion?: string;
  anuladoAtTs?: number;
  anuladoPorNombre?: string;
  origenManual?: boolean;
}

export interface VentaPOSSimple {
  id: string;
  boletaNumero?: number;
  cajeroNombre: string;
  clienteNombre?: string;
  vendedorNombre?: string;
  fechaHora?: string;
  fechaStr?: string;
  fechaTs?: number;
  total: number;
  subtotal?: number;
  metodoPago?: string;
  pagos?: Array<{ metodo: string; monto: number }>;
  vuelto?: number;
  items?: Array<{ sku: string; nombre: string; cantidad: number; precioUnitario: number; subtotal: number; embalajeQty?: number | null }>;
  sesionCajaId?: string;
  estado?: string;
  tipoComprobante?: 'boleta' | 'factura' | 'comprobante';
  debitoOrdenNumero?: number | null;
}

export interface VentaPendienteRegistro {
  id: string;
  vendedorNombre: string;
  vendedoraId?: string;
  cajeraNombre: string;
  cajeraId?: string;
  sede: string;
  total: number;
  subtotal?: number;
  estado: string; // 'pendiente' | 'aceptada' | 'completada' | 'rechazada'
  creadoAtTs: number;
  fechaStr: string; // YYYY-MM-DD
  clienteNombre?: string;
  itemsCount?: number;
}

function resolveVentaPendienteDate(d: any): { fechaStr: string; creadoAtTs: number } {
  let ts = 0;
  if (typeof d.creadoAtTs === 'number' && d.creadoAtTs > 0) {
    ts = d.creadoAtTs;
  } else if (d.creadoAt?.toMillis) {
    ts = d.creadoAt.toMillis();
  } else if (d.creadoAt?.seconds) {
    ts = d.creadoAt.seconds * 1000;
  } else if (typeof d.id === 'string' && d.id.startsWith('venta_pending_')) {
    const parts = d.id.split('_');
    const parsed = Number(parts[2]);
    if (!isNaN(parsed) && parsed > 1600000000000) ts = parsed;
  }
  let fStr = typeof d.fechaStr === 'string' ? d.fechaStr.trim() : '';
  if (!fStr && ts > 0) {
    try {
      fStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(ts));
    } catch {
      fStr = getChileDateStr(new Date(ts));
    }
  }
  return { fechaStr: fStr, creadoAtTs: ts };
}

export default function CortesYCierresPage() {
  const params = useParams<{ sede: string }>();
  const router = useRouter();
  const currentSede = ((params?.sede) || DEFAULT_SEDE) as SedeSlug;
  const sedeNombre = SEDES[currentSede] || currentSede;
  const [trabajadorFotos, setTrabajadorFotos] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void import('@/lib/trabajadoresErpService')
      .then(({ fetchTrabajadoresERP }) => fetchTrabajadoresERP())
      .then((trabajadores) => {
        if (!active) return;
        const fotos: Record<string, string> = {};
        trabajadores.forEach((trabajador) => {
          const nombre = normalizeStaffName(trabajador.nombre);
          const foto = String(trabajador.fotoUrl || '').trim();
          if (nombre && foto) fotos[nombre] = foto;
        });
        setTrabajadorFotos(fotos);
      })
      .catch((error) => console.warn('No se pudieron cargar las fotos del equipo:', error));
    return () => { active = false; };
  }, []);

  // Fecha de hoy por defecto (en zona horaria de Chile)
  const todayStr = useMemo(() => {
    return getChileDateStr();
  }, []);

  const [cortes, setCortes] = useState<CorteRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFecha, setFilterFecha] = useState<string>(todayStr);
  const [filterCajero, setFilterCajero] = useState<string>('todos');
  const [filterDiferencia, setFilterDiferencia] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [enviosAbiertos, setEnviosAbiertos] = useState(false);

  const yesterdayStr = useMemo(() => {
    return shiftDateStr(todayStr, -1);
  }, [todayStr]);

  // Modal para ver boletas individuales del turno
  const [selectedCorte, setSelectedCorte] = useState<CorteRegistro | null>(null);
  const [corteVentas, setCorteVentas] = useState<VentaPOSSimple[]>([]);
  const [loadingVentas, setLoadingVentas] = useState(false);
  const [ventasSearch, setVentasSearch] = useState('');
  const [ventasPendientes, setVentasPendientes] = useState<VentaPendienteRegistro[]>([]);

  // Cargar cortes desde Firestore (cortes_caja y caja_sesiones)
  const loadCortes = async () => {
    setLoading(true);
    try {
      // 1. Intentar client SDK
      const cortesRef = collection(db, 'cortes_caja');
      const [year, month, day] = filterFecha ? filterFecha.split('-') : ['', '', ''];
      const localizedDate = filterFecha ? `${day}-${month}-${year}` : '';
      const branchValues = branchSlugQueryValues(currentSede).slice(0, 30);
      const isCentral = matchBranchSlug(currentSede, 'donbalato-central');

      // Si hay filtro de fecha activo, consultar directamente por los índices automáticos de fecha
      // sin ejecutar el barrido adicional de 50 documentos recientes (que luego se descartaban en memoria).
      const sources: Array<{ docs: any[] }> = [];
      if (filterFecha) {
        const [byFechaSnap, byCierreSnap] = await Promise.all([
          getDocs(query(cortesRef, where('fechaStr', '==', filterFecha), limit(200))),
          getDocs(query(cortesRef, where('fechaCierreStr', '==', localizedDate), limit(200))),
        ]);
        sources.push(byFechaSnap, byCierreSnap);
      } else {
        const recentSnap = await getDocs(query(
          cortesRef,
          ...(!isCentral && branchValues.length ? [where('sede', 'in', branchValues)] : []),
          limit(50),
        ));
        sources.push(recentSnap);
      }

      const corteDocs = new Map<string, any>();
      for (const source of sources) {
        source.docs.forEach((docSnap) => corteDocs.set(docSnap.id, docSnap));
      }
      const list: CorteRegistro[] = [];

      corteDocs.forEach((docSnap) => {
        const d = docSnap.data() as any;
        const cSede = d.sede || 'donbalato-central';
        if (!matchBranchSlug(cSede, currentSede)) return;

        let devolucionesItems: any[] = [];
        if (Array.isArray(d.devolucionesItems)) {
          devolucionesItems = d.devolucionesItems;
        } else if (d.anulacionesItemsJson) {
          try {
            const parsed = JSON.parse(d.anulacionesItemsJson);
            if (Array.isArray(parsed.devoluciones)) devolucionesItems = parsed.devoluciones;
          } catch {}
        }

        let gastosItems: any[] = [];
        if (Array.isArray(d.gastosItems)) {
          gastosItems = d.gastosItems;
        } else if (d.gastosItemsJson) {
          try { gastosItems = JSON.parse(d.gastosItemsJson); } catch {}
        }

        list.push({
          id: docSnap.id,
          cajeroNombre: String(d.cajeroNombre || 'Cajero').trim(),
          sede: cSede,
          fechaCierreStr: String(d.fechaCierreStr || d.fechaStr || ''),
          horaCierreStr: String(d.horaCierreStr || ''),
          aperturaAtTs: Number(d.aperturaAtTs || 0),
          cierreAtTs: Number(d.cierreAtTs || d.createdAtTs || 0),
          montoApertura: Number(d.montoApertura || 0),
          ventasCount: Number(d.ventasCount || 0),
          totalVentas: Number(d.totalVentas || 0),
          totalEfectivo: Number(d.totalEfectivo || d.efectivoTeorico || 0),
          totalDebito: Number(d.totalDebito || 0),
          totalTransferencia: Number(d.totalTransferencia || 0),
          totalVueltos: Number(d.totalVueltos || 0),
          efectivoTeorico: Number(d.efectivoTeorico || d.totalEfectivo || 0),
          efectivoReal: Number(d.efectivoReal || 0),
          diferencia: Number(d.diferencia || 0),
          gastos: Number(d.gastos || 0),
          gastosItems,
          totalDevoluciones: Number(d.totalDevoluciones || (devolucionesItems.reduce((s, it) => s + (Number(it.monto) || 0), 0))),
          devolucionesItems,
          sesionCajaId: d.sesionCajaId,
          createdAtTs: Number(d.createdAtTs || 0),
          anulado: Boolean(d.anulado || d.estado === 'anulado'),
          estado: d.estado || (d.anulado ? 'anulado' : 'cerrado'),
          motivoAnulacion: d.motivoAnulacion || '',
          anuladoAtTs: Number(d.anuladoAtTs || 0),
          anuladoPorNombre: d.anuladoPorNombre || '',
          origenManual: d.origenManual === true,
        });
      });

      // Ordenar por fecha y timestamp descendente
      list.sort((a, b) => (b.cierreAtTs || b.createdAtTs || 0) - (a.cierreAtTs || a.createdAtTs || 0));
      setCortes(list);
    } catch (err: any) {
      console.warn('Error cargando cortes de caja:', err);
      // Fallback REST directo si falla SDK
      try {
        const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyClqpsQ5eHECOQAXz3ls6-RUgoH8nthdkE";
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "importadora-carlitos";
        const databaseId = process.env.FIREBASE_DATABASE_ID || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "(default)";
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/cortes_caja?key=${apiKey}&pageSize=100`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const docs = (data.documents || []).map((doc: any) => {
            const docId = doc.name ? doc.name.split('/').pop() : '';
            const fields: any = {};
            for (const [k, val] of Object.entries(doc.fields || {})) {
              const v: any = val;
              if (v.stringValue !== undefined) fields[k] = v.stringValue;
              else if (v.integerValue !== undefined) fields[k] = Number(v.integerValue);
              else if (v.doubleValue !== undefined) fields[k] = Number(v.doubleValue);
              else if (v.booleanValue !== undefined) fields[k] = v.booleanValue;
            }
            return {
              id: docId,
              cajeroNombre: String(fields.cajeroNombre || 'Cajero').trim(),
              sede: fields.sede || currentSede,
              fechaCierreStr: String(fields.fechaCierreStr || fields.fechaStr || ''),
              horaCierreStr: String(fields.horaCierreStr || ''),
              aperturaAtTs: Number(fields.aperturaAtTs || 0),
              cierreAtTs: Number(fields.cierreAtTs || fields.createdAtTs || 0),
              montoApertura: Number(fields.montoApertura || 0),
              ventasCount: Number(fields.ventasCount || 0),
              totalVentas: Number(fields.totalVentas || 0),
              totalEfectivo: Number(fields.totalEfectivo || fields.efectivoTeorico || 0),
              totalDebito: Number(fields.totalDebito || 0),
              totalTransferencia: Number(fields.totalTransferencia || 0),
              totalVueltos: Number(fields.totalVueltos || 0),
              efectivoTeorico: Number(fields.efectivoTeorico || fields.totalEfectivo || 0),
              efectivoReal: Number(fields.efectivoReal || 0),
              diferencia: Number(fields.diferencia || 0),
              gastos: Number(fields.gastos || 0),
              totalDevoluciones: Number(fields.totalDevoluciones || 0),
              sesionCajaId: fields.sesionCajaId,
              createdAtTs: Number(fields.createdAtTs || 0),
              anulado: Boolean(fields.anulado || fields.estado === 'anulado'),
              estado: fields.estado || (fields.anulado ? 'anulado' : 'cerrado'),
              motivoAnulacion: fields.motivoAnulacion || '',
              anuladoAtTs: Number(fields.anuladoAtTs || 0),
              anuladoPorNombre: fields.anuladoPorNombre || '',
              origenManual: fields.origenManual === true,
            };
          });
          const filteredDocs = docs.filter((d: any) => matchBranchSlug(d.sede, currentSede));
          filteredDocs.sort((a: any, b: any) => (b.cierreAtTs || b.createdAtTs || 0) - (a.cierreAtTs || a.createdAtTs || 0));
          setCortes(filteredDocs);
        }
      } catch (fErr) {
        console.error('Error en fallback REST de cortes:', fErr);
      }
    }

    try {
      // 2. Cargar envíos de vendedores a cajeras desde pos_ventas_pendientes acotando por fecha
      try {
        const pendientesRef = collection(db, 'pos_ventas_pendientes');
        const pQuery = filterFecha
          ? query(pendientesRef, where('fechaStr', '==', filterFecha), limit(80))
          : query(pendientesRef, where('sede', '==', currentSede), limit(50));
        const pSnap = await getDocs(pQuery);
        const pList: VentaPendienteRegistro[] = [];
        pSnap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          const pSede = d.sede || 'donbalato-central';
          if (!matchBranchSlug(pSede, currentSede)) return;
          const { fechaStr, creadoAtTs } = resolveVentaPendienteDate({ id: docSnap.id, ...d });
          const vNombre = String(d.vendedoraNombre || d.vendedorNombre || d.enviadoPorNombre || 'Vendedor').trim();
          const cNombre = String(d.cajeraNombre || 'Cajera').trim();
          pList.push({
            id: docSnap.id,
            vendedorNombre: vNombre,
            vendedoraId: d.vendedoraId || d.enviadoPorId,
            cajeraNombre: cNombre,
            cajeraId: d.cajeraId,
            sede: pSede,
            total: Number(d.total || 0),
            subtotal: Number(d.subtotal || 0),
            estado: String(d.estado || 'pendiente'),
            creadoAtTs,
            fechaStr,
            clienteNombre: d.clienteNombre || '',
            itemsCount: Array.isArray(d.items) ? d.items.length : Number(d.totalItems || 0),
          });
        });
        pList.sort((a, b) => b.creadoAtTs - a.creadoAtTs);
        setVentasPendientes(pList);
      } catch (pErr) {
        console.warn('Error cargando pos_ventas_pendientes:', pErr);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCortes();
  }, [currentSede, filterFecha]);

  // Lista única de cajeros encontrados en los cortes
  const cajerosDisponibles = useMemo(() => {
    const set = new Set<string>();
    cortes.forEach((c) => {
      if (c.cajeroNombre) set.add(c.cajeroNombre);
    });
    return Array.from(set).sort();
  }, [cortes]);

  // Filtrado de cortes
  const cortesFiltrados = useMemo(() => {
    return cortes.filter((c) => {
      // Filtro de fecha
      if (filterFecha) {
        const cDate = c.fechaCierreStr;
        // cDate puede venir como "21-09-2026" o "2026-09-21"
        const [y, m, d] = filterFecha.split('-');
        const format1 = `${d}-${m}-${y}`; // "21-09-2026"
        const format2 = filterFecha;       // "2026-09-21"
        const matchesDate = cDate.includes(format1) || cDate.includes(format2);
        if (!matchesDate) return false;
      }

      // Filtro de cajero
      if (filterCajero !== 'todos') {
        if (c.cajeroNombre.toLowerCase() !== filterCajero.toLowerCase()) return false;
      }

      // Filtro de diferencia
      if (filterDiferencia === 'sobrante') {
        if (c.diferencia <= 0) return false;
      } else if (filterDiferencia === 'faltante') {
        if (c.diferencia >= 0) return false;
      } else if (filterDiferencia === 'exacto') {
        if (Math.abs(c.diferencia) > 5) return false;
      }

      // Buscador texto
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matches =
          c.cajeroNombre.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.horaCierreStr && c.horaCierreStr.toLowerCase().includes(q)) ||
          String(c.efectivoReal).includes(q) ||
          String(c.totalVentas).includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [cortes, filterFecha, filterCajero, filterDiferencia, searchTerm]);

  // Totales de la selección actual (excluyendo cortes anulados por reanudación de caja)
  const statsSeleccion = useMemo(() => {
    const cortesValidos = cortesFiltrados.filter(c => !c.anulado);
    const count = cortesValidos.length;
    const anuladosCount = cortesFiltrados.length - count;
    const totalVentas = cortesValidos.reduce((s, c) => s + c.totalVentas, 0);
    const efectivoTeorico = cortesValidos.reduce((s, c) => s + c.efectivoTeorico, 0);
    const efectivoReal = cortesValidos.reduce((s, c) => s + c.efectivoReal, 0);
    const totalTransferencia = cortesValidos.reduce((s, c) => s + c.totalTransferencia, 0);
    const totalDebito = cortesValidos.reduce((s, c) => s + c.totalDebito, 0);
    const diferenciaTotal = cortesValidos.reduce((s, c) => s + c.diferencia, 0);
    const totalDevoluciones = cortesValidos.reduce((s, c) => s + (c.totalDevoluciones || 0), 0);
    return {
      count,
      anuradosCount: anuladosCount,
      totalVentas,
      efectivoTeorico,
      efectivoReal,
      totalTransferencia,
      totalDebito,
      diferenciaTotal,
      totalDevoluciones,
    };
  }, [cortesFiltrados]);

  // Envíos de vendedores filtrados por la fecha activa
  const enviosVendedoresDelDia = useMemo(() => {
    return ventasPendientes.filter((vp) => {
      if (!filterFecha) return true;
      const [y, m, d] = filterFecha.split('-');
      const format1 = `${d}-${m}-${y}`; // DD-MM-YYYY
      const format2 = filterFecha;       // YYYY-MM-DD
      return vp.fechaStr.includes(format2) || vp.fechaStr.includes(format1);
    });
  }, [ventasPendientes, filterFecha]);

  // Agrupado y estadísticas de vendedores
  const statsVendedores = useMemo(() => {
    const porVendedor = new Map<string, {
      vendedorNombre: string;
      totalEnvios: number;
      totalMonto: number;
      completadas: number;
      pendientes: number;
      rechazadas: number;
      porCajera: Map<string, { cajeraNombre: string; cantidad: number; totalMonto: number; completadas: number; pendientes: number; rechazadas: number }>;
    }>();

    enviosVendedoresDelDia.forEach((vp) => {
      const vName = vp.vendedorNombre || 'Vendedor';
      const cName = vp.cajeraNombre || 'Cajera';
      let vData = porVendedor.get(vName);
      if (!vData) {
        vData = {
          vendedorNombre: vName,
          totalEnvios: 0,
          totalMonto: 0,
          completadas: 0,
          pendientes: 0,
          rechazadas: 0,
          porCajera: new Map(),
        };
        porVendedor.set(vName, vData);
      }
      vData.totalEnvios += 1;
      vData.totalMonto += vp.total;
      if (vp.estado === 'completada' || vp.estado === 'aceptada') vData.completadas += 1;
      else if (vp.estado === 'rechazada') vData.rechazadas += 1;
      else vData.pendientes += 1;

      let cData = vData.porCajera.get(cName);
      if (!cData) {
        cData = { cajeraNombre: cName, cantidad: 0, totalMonto: 0, completadas: 0, pendientes: 0, rechazadas: 0 };
        vData.porCajera.set(cName, cData);
      }
      cData.cantidad += 1;
      cData.totalMonto += vp.total;
      if (vp.estado === 'completada' || vp.estado === 'aceptada') cData.completadas += 1;
      else if (vp.estado === 'rechazada') cData.rechazadas += 1;
      else cData.pendientes += 1;
    });

    const listaVendedores = Array.from(porVendedor.values()).map((v) => ({
      ...v,
      cajerasDetalle: Array.from(v.porCajera.values()).sort((a, b) => b.cantidad - a.cantidad),
    })).sort((a, b) => b.totalEnvios - a.totalEnvios);

    const totalEnviosGlobal = enviosVendedoresDelDia.length;
    const totalMontoGlobal = enviosVendedoresDelDia.reduce((s, vp) => s + vp.total, 0);

    return {
      listaVendedores,
      totalEnviosGlobal,
      totalMontoGlobal,
      vendedoresCount: listaVendedores.length,
    };
  }, [enviosVendedoresDelDia]);

  // Reimprimir ticket térmico 80mm oficial de Corte de Caja
  const handlePrintCorte = (corte: CorteRegistro) => {
    // Filtrar envíos recibidos por esta cajera específica en la fecha del corte
    const enviosParaEstaCajera = enviosVendedoresDelDia.filter((vp) => {
      const matchCajero = vp.cajeraNombre.toLowerCase().trim() === corte.cajeroNombre.toLowerCase().trim();
      if (!matchCajero) return false;
      if (corte.fechaCierreStr) {
        const [dDay, dMonth, dYear] = corte.fechaCierreStr.split('-');
        const iso = `${dYear}-${dMonth}-${dDay}`;
        return vp.fechaStr.includes(iso) || vp.fechaStr.includes(corte.fechaCierreStr);
      }
      return true;
    });

    const vMap = new Map<string, { vendedorNombre: string; cantidad: number; totalMonto: number }>();
    enviosParaEstaCajera.forEach((vp) => {
      const v = vp.vendedorNombre || 'Vendedor';
      const cur = vMap.get(v) || { vendedorNombre: v, cantidad: 0, totalMonto: 0 };
      cur.cantidad += 1;
      cur.totalMonto += vp.total;
      vMap.set(v, cur);
    });
    const ventasRecibidasDeVendedores = Array.from(vMap.values()).sort((a, b) => b.cantidad - a.cantidad);

    const printData: CorteCajaData = {
      corteId: corte.id,
      sesionCajaId: corte.sesionCajaId || corte.id,
      sede: corte.sede,
      sedeNombre,
      cajeroNombre: corte.cajeroNombre,
      fechaStr: corte.fechaCierreStr,
      fechaCierreStr: corte.fechaCierreStr,
      horaCierreStr: corte.horaCierreStr,
      aperturaAt: corte.aperturaAtTs ? new Date(corte.aperturaAtTs) : undefined,
      montoApertura: corte.montoApertura,
      ventasCount: corte.ventasCount,
      totalVentas: corte.totalVentas,
      totalEfectivo: corte.totalEfectivo,
      totalDebito: corte.totalDebito,
      totalTransferencia: corte.totalTransferencia,
      totalVueltos: corte.totalVueltos || 0,
      efectivoTeorico: corte.efectivoTeorico,
      efectivoReal: corte.efectivoReal,
      gastos: corte.gastos || 0,
      gastosItems: (corte.gastosItems || []).map((g) => ({
        monto: Number(g.monto) || 0,
        detalle: g.detalle || g.observacion || '',
        tipoGasto: g.tipoGasto || (g as any).tipo || '',
        categoria: g.categoria || '',
      })),
      devolucionesItems: (corte.devolucionesItems || []).map((d) => ({
        monto: Number(d.monto) || 0,
        detalle: d.detalle || d.observacion || '',
      })),
      totalDevoluciones: corte.totalDevoluciones || 0,
      diferencia: corte.diferencia,
      ventasRecibidasDeVendedores,
    };

    openCorteCajaPrintWindow(printData);
  };

  // Cortes que aplican para el Corte General (por defecto todos los del día seleccionado o vista activa)
  const cortesGeneralesDelDia = useMemo(() => {
    if (filterFecha) {
      return cortes.filter((c) => {
        const cDate = c.fechaCierreStr;
        const [y, m, d] = filterFecha.split('-');
        const format1 = `${d}-${m}-${y}`;
        const format2 = filterFecha;
        return cDate.includes(format1) || cDate.includes(format2);
      });
    }
    return cortesFiltrados;
  }, [cortes, filterFecha, cortesFiltrados]);

  // Generar y descargar/imprimir Corte General Consolidado de todas las cajeras (PDF / 80mm)
  const handlePrintCorteGeneral = (sourceCortes = cortesGeneralesDelDia) => {
    if (!sourceCortes || sourceCortes.length === 0) {
      alert('No hay cortes de caja registrados para consolidar en la fecha o filtros seleccionados.');
      return;
    }

    const cajerasMap = new Map<string, CorteRegistro[]>();
    sourceCortes.forEach((c) => {
      const name = c.cajeroNombre?.trim() || 'Cajera';
      const arr = cajerasMap.get(name) || [];
      arr.push(c);
      cajerasMap.set(name, arr);
    });

    const uniqueCajeras = Array.from(cajerasMap.keys());

    // Desglose detallado por cajera
    const desgloseCajeras = uniqueCajeras.map((cajero) => {
      const turnos = cajerasMap.get(cajero) || [];
      return {
        cajeroNombre: cajero,
        ventasCount: turnos.reduce((s, t) => s + (t.ventasCount || 0), 0),
        totalVentas: turnos.reduce((s, t) => s + (t.totalVentas || 0), 0),
        totalEfectivo: turnos.reduce((s, t) => s + (t.totalEfectivo || 0), 0),
        totalDebito: turnos.reduce((s, t) => s + (t.totalDebito || 0), 0),
        totalTransferencia: turnos.reduce((s, t) => s + (t.totalTransferencia || 0), 0),
        montoApertura: turnos.reduce((s, t) => s + (t.montoApertura || 0), 0),
        efectivoTeorico: turnos.reduce((s, t) => s + (t.efectivoTeorico || 0), 0),
        efectivoReal: turnos.reduce((s, t) => s + (t.efectivoReal || 0), 0),
        diferencia: turnos.reduce((s, t) => s + (t.diferencia || 0), 0),
        gastos: turnos.reduce((s, t) => s + (t.gastos || 0), 0),
        horaCierreStr: turnos[turnos.length - 1]?.horaCierreStr || '',
      };
    });

    // Gastos consolidados de todas las cajeras
    const todosGastos: Array<{ monto: number; detalle?: string; observacion?: string; cajeroNombre?: string; tipoGasto?: string; categoria?: string }> = [];
    sourceCortes.forEach((c) => {
      if (Array.isArray(c.gastosItems)) {
        c.gastosItems.forEach((g) => {
          if (g && Number(g.monto) > 0) {
            todosGastos.push({
              monto: Number(g.monto),
              detalle: g.detalle || g.observacion || 'Gasto justificado',
              cajeroNombre: c.cajeroNombre,
              tipoGasto: g.tipoGasto || g.tipo || '',
              categoria: g.categoria || '',
            });
          }
        });
      }
    });

    // Envíos de vendedores consolidados para el reporte PDF
    const ventasVendedoresItems: VentaVendedorEnvioItem[] = [];
    statsVendedores.listaVendedores.forEach((v) => {
      v.cajerasDetalle.forEach((c) => {
        ventasVendedoresItems.push({
          vendedorNombre: v.vendedorNombre,
          cajeraNombre: c.cajeraNombre,
          cantidad: c.cantidad,
          totalMonto: c.totalMonto,
        });
      });
    });

    const totalVentas = sourceCortes.reduce((s, c) => s + (c.totalVentas || 0), 0);
    const totalEfectivo = sourceCortes.reduce((s, c) => s + (c.totalEfectivo || 0), 0);
    const totalDebito = sourceCortes.reduce((s, c) => s + (c.totalDebito || 0), 0);
    const totalTransferencia = sourceCortes.reduce((s, c) => s + (c.totalTransferencia || 0), 0);
    const totalVueltos = sourceCortes.reduce((s, c) => s + (c.totalVueltos || 0), 0);
    const montoAperturaTotal = sourceCortes.reduce((s, c) => s + (c.montoApertura || 0), 0);
    const efectivoTeorico = sourceCortes.reduce((s, c) => s + (c.efectivoTeorico || 0), 0);
    const efectivoReal = sourceCortes.reduce((s, c) => s + (c.efectivoReal || 0), 0);
    const diferencia = efectivoReal - efectivoTeorico;
    const gastosTotal = sourceCortes.reduce((s, c) => s + (c.gastos || 0), 0);
    const ventasCountTotal = sourceCortes.reduce((s, c) => s + (c.ventasCount || 0), 0);

    const generalData: CorteGeneralData = {
      sede: currentSede,
      sedeNombre,
      fechaStr: filterFecha || todayStr,
      fechaCierreStr: sourceCortes[0]?.fechaCierreStr || filterFecha || todayStr,
      horaCierreStr: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      cajerasNombres: uniqueCajeras,
      cortesCount: sourceCortes.length,
      ventasCount: ventasCountTotal,
      totalVentas,
      totalEfectivo,
      totalDebito,
      totalTransferencia,
      totalVueltos,
      montoAperturaTotal,
      efectivoTeorico,
      efectivoReal,
      diferencia,
      gastos: gastosTotal,
      gastosItems: todosGastos,
      desgloseCajeras,
      ventasVendedores: ventasVendedoresItems,
    };

    openCorteGeneralPrintWindow(generalData);
  };

  // Cargar ventas de un corte para modal de detalle
  const handleOpenVentasModal = async (corte: CorteRegistro) => {
    setSelectedCorte(corte);
    setLoadingVentas(true);
    setCorteVentas([]);
    setVentasSearch('');

    try {
      const ventasRef = collection(db, 'ventas_pos');
      // Optimización: si el corte tiene sesionCajaId, filtramos exactamente por ese campo (muy eficiente).
      // Si no, filtramos por cajeroNombre + fechaStr con limit para evitar escanear todo el historial.
      let snap: any;
      if (corte.sesionCajaId) {
        snap = await getDocs(query(ventasRef, where('sesionCajaId', '==', corte.sesionCajaId)));
      } else {
        // Normalizar fechaCierreStr a ISO (puede venir como DD-MM-YYYY o YYYY-MM-DD)
        const parts = corte.fechaCierreStr.split('-');
        const isoDate = parts[0].length === 4
          ? corte.fechaCierreStr  // ya es YYYY-MM-DD
          : `${parts[2]}-${parts[1]}-${parts[0]}`; // DD-MM-YYYY → YYYY-MM-DD
        snap = await getDocs(
          query(ventasRef, where('cajeroNombre', '==', corte.cajeroNombre), where('fechaStr', '>=', isoDate), where('fechaStr', '<', isoDate + 'z'), limit(500))
        );
      }
      const list: VentaPOSSimple[] = [];

      snap.forEach((docSnap: any) => {
        const d = docSnap.data() as any;
        // Si vino de sesionCajaId, todos los docs ya son del corte; si vino de fallback, todos ya son del día correcto.
        let match = true;
        if (!corte.sesionCajaId) {
          // Doble check por seguridad (filtro de sede)
          const s = d.sede || 'donbalato-central';
          if (!matchBranchSlug(s, currentSede)) match = false;
        }

        if (match) {
          const vNombre = d.vendedorNombre || d.vendedoraNombre || d.originVendorName || '';
          list.push({
            id: docSnap.id,
            boletaNumero: Number(d.boletaNumero || 0),
            cajeroNombre: d.cajeroNombre,
            clienteNombre: d.clienteNombre || 'Cliente',
            vendedorNombre: vNombre ? String(vNombre) : undefined,
            fechaHora: d.fechaHora || (d.fechaTs ? new Date(d.fechaTs).toLocaleTimeString('es-CL') : ''),
            fechaStr: d.fechaStr,
            fechaTs: Number(d.fechaTs || 0),
            total: Number(d.total || 0),
            subtotal: Number(d.subtotal || 0),
            metodoPago: d.metodoPago || (d.pagos?.[0]?.metodo || 'efectivo'),
            pagos: Array.isArray(d.pagos) ? d.pagos : [],
            vuelto: Number(d.vuelto || 0),
            items: Array.isArray(d.items) ? d.items : [],
            sesionCajaId: d.sesionCajaId,
            estado: d.estado || 'completada',
            tipoComprobante: d.tipoComprobante || 'boleta',
            debitoOrdenNumero: d.debitoOrdenNumero ?? null,
          });
        }
      });

      list.sort((a, b) => (a.boletaNumero || 0) - (b.boletaNumero || 0));
      setCorteVentas(list);
    } catch (err) {
      console.warn('Error cargando ventas del corte:', err);
    } finally {
      setLoadingVentas(false);
    }
  };

  // Reimprimir comprobante interno de venta
  const handlePrintBoletaVenta = (venta: VentaPOSSimple) => {
    const formattedData: ReceiptData = {
      ventaId: venta.id,
      boletaNumero: venta.boletaNumero || 0,
      debitoOrdenNumero: venta.debitoOrdenNumero ?? null,
      cajero: venta.cajeroNombre,
      sedeNombre,
      fechaHora: venta.fechaHora,
      subtotal: venta.subtotal || venta.total,
      total: venta.total,
      vuelto: venta.vuelto || 0,
      metodoPago: venta.metodoPago,
      pagos: venta.pagos || [{ metodo: venta.metodoPago || 'efectivo', monto: venta.total }],
      items: (venta.items || []).map((it) => ({
        sku: it.sku,
        nombre: it.nombre,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        subtotal: it.subtotal,
        embalajeQty: it.embalajeQty,
      })),
      tipoComprobante: 'comprobante',
    };

    openReceiptPrintWindow(formattedData);
  };

  // Ventas filtradas en el modal
  const filteredVentasModal = useMemo(() => {
    if (!ventasSearch.trim()) return corteVentas;
    const q = ventasSearch.toLowerCase().trim();
    return corteVentas.filter(
      (v) =>
        String(v.boletaNumero).includes(q) ||
        String(v.total).includes(q) ||
        (v.metodoPago && v.metodoPago.toLowerCase().includes(q)) ||
        (v.items && v.items.some((it) => it.nombre.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)))
    );
  }, [corteVentas, ventasSearch]);

  return (
    <div data-pos-page="cortes" className="w-full min-w-0 space-y-5 pb-10">
      {/* ── Top Bar con Switcher de Pestañas (Historial de Ventas / Cortes de Caja) ── */}
      <div className="flex flex-col gap-3 rounded-none border-b border-slate-200 bg-white p-3 px-[3%] shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-full items-center gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto">
          <Link
            href={`/pos-admin/${currentSede}/ventas`}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-white hover:text-[#405566] sm:flex-none sm:px-4 sm:py-2.5 sm:text-sm"
          >
            <FileText size={16} />
            <span>Historial de Ventas</span>
          </Link>
          <div className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#087f73] px-3 py-2 text-xs font-extrabold text-white shadow-xs sm:flex-none sm:px-4 sm:py-2.5 sm:text-sm">
            <ClipboardList size={16} />
            <span>Cortes y cierres</span>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <button
            onClick={loadCortes}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2.5 text-xs font-bold text-slate-800 transition hover:bg-slate-200 disabled:opacity-50"
            title="Refrescar cortes"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
          <Link
            href={`/pos/${currentSede}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <Store size={14} />
            <span>Terminal POS</span>
          </Link>
        </div>
      </div>

      {/* Contenedor de tarjetas internas con padding de 3% a cada lado */}
      <div className="space-y-5 px-[3%]">
        {/* Encabezado del módulo */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-emerald-600" />
        <div className="flex flex-col gap-5 p-5 pl-6 sm:p-6 sm:pl-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <ClipboardList size={15} />
              </span>
              <span>Control de caja</span>
              <span className="text-slate-300">/</span>
              <span className="normal-case tracking-normal text-slate-600">{sedeNombre}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Cortes y cierres
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Revisa ventas, efectivo entregado y diferencias de cada turno.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="mr-1 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              <Calendar size={15} className="text-emerald-700" />
              <span>
                {filterFecha === todayStr
                  ? 'Hoy'
                  : filterFecha === yesterdayStr
                  ? 'Ayer'
                  : filterFecha
                  ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' }).format(new Date(`${filterFecha}T12:00:00`))
                  : 'Todos los días'}
              </span>
            </div>
            <button
              onClick={() => handlePrintCorteGeneral()}
              disabled={loading || cortesGeneralesDelDia.length === 0}
              className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
              title="Descargar corte general consolidado en PDF"
            >
              <Printer size={15} />
              <span>Corte general</span>
              <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px]">{cortesGeneralesDelDia.length}</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── Tarjetas de Métricas Resumen (KPIs) con colores de Asistora ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {/* Total Vendido en Cortes (ROJO / MAGENTA DE ASISTORA: #e83462) */}
        <div className="rounded-2xl border border-slate-200 border-l-4 border-l-[#e83462] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-[#e83462]">
                <Store size={16} />
              </span>
              Ventas en cortes
            </span>
            <span className="rounded-lg bg-rose-50 px-2 py-1 font-mono font-bold text-[#e83462]">
              {statsSeleccion.count} cierres
            </span>
          </div>
          <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-[1.7rem]">
            {fmtCLP(statsSeleccion.totalVentas)}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-slate-500">
            Transf. <span className="font-semibold text-slate-700">{fmtCLP(statsSeleccion.totalTransferencia)}</span><span className="px-1.5 text-slate-300">·</span>Débito <span className="font-semibold text-slate-700">{fmtCLP(statsSeleccion.totalDebito)}</span>
          </div>
        </div>

        {/* Efectivo Teórico / Sistema (VERDE AZULADO DE ASISTORA: #087f73) */}
        <div className="rounded-2xl border border-slate-200 border-l-4 border-l-[#087f73] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-[#087f73]">
                <Wallet size={16} />
              </span>
              Efectivo sistema
            </span>
          </div>
          <div className="mt-3 text-2xl font-black tracking-tight text-[#087f73] sm:text-[1.7rem]">
            {fmtCLP(statsSeleccion.efectivoTeorico)}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-slate-500">
            Monto esperado según boletas de venta
          </div>
        </div>

        {/* Efectivo Real Declarado / Entregado (AMARILLO DE ASISTORA: #f3c437) */}
        <div className="rounded-2xl border border-slate-200 border-l-4 border-l-[#f3c437] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-[#b48608]">
                <CheckCircle2 size={16} />
              </span>
              Efectivo entregado
            </span>
          </div>
          <div className="mt-3 text-2xl font-black tracking-tight text-[#b48608] sm:text-[1.7rem]">
            {fmtCLP(statsSeleccion.efectivoReal)}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-slate-500">
            Declarado físicamente por cajeras
          </div>
        </div>

        {/* Balance / Diferencia Total */}
        <div className={`rounded-2xl border border-l-4 p-4 shadow-sm sm:p-5 ${
          statsSeleccion.diferenciaTotal > 0
            ? 'bg-emerald-50/70 border-emerald-200 border-l-emerald-500'
            : statsSeleccion.diferenciaTotal < 0
            ? 'bg-rose-50/70 border-rose-200 border-l-rose-500'
            : 'bg-slate-50 border-slate-200 border-l-slate-400'
        }`}>
          <div className="flex items-center justify-between gap-2 text-xs font-bold">
            <span className={statsSeleccion.diferenciaTotal >= 0 ? 'text-emerald-800' : 'text-rose-800'}>
              Balance de Cuadre
            </span>
            {statsSeleccion.diferenciaTotal > 0 ? (
              <TrendingUp size={14} className="text-emerald-600" />
            ) : statsSeleccion.diferenciaTotal < 0 ? (
              <TrendingDown size={14} className="text-rose-600" />
            ) : (
              <CheckCircle2 size={14} className="text-gray-500" />
            )}
          </div>
          <div className={`mt-3 text-2xl font-black tracking-tight sm:text-[1.7rem] ${
            statsSeleccion.diferenciaTotal > 0
              ? 'text-emerald-700'
              : statsSeleccion.diferenciaTotal < 0
              ? 'text-rose-700'
              : 'text-gray-700'
          }`}>
            {statsSeleccion.diferenciaTotal > 0 ? '+' : ''}{fmtCLP(statsSeleccion.diferenciaTotal)}
          </div>
          <div className="mt-1 text-[11px] font-semibold leading-5">
            {statsSeleccion.diferenciaTotal > 0 ? (
              <span className="text-emerald-700 font-bold">🟢 Sobrante total en caja</span>
            ) : statsSeleccion.diferenciaTotal < 0 ? (
              <span className="text-rose-700 font-bold">🔴 Faltante total en caja</span>
            ) : (
              <span className="text-gray-600">Caja cuadrada exactamente</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Filtros y Buscador ── */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Calendar size={16} /></span>
            <span>Buscar cierres</span>
          </div>

          {/* Accesos rápidos de fecha */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
            <button
              onClick={() => setFilterFecha(todayStr)}
              className={`rounded-lg py-2 px-2 text-center text-xs font-bold transition sm:px-3 ${
                filterFecha === todayStr
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => setFilterFecha(yesterdayStr)}
              className={`rounded-lg py-2 px-2 text-center text-xs font-bold transition sm:px-3 ${
                filterFecha === yesterdayStr
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              Ayer
            </button>
            <button
              onClick={() => setFilterFecha('')}
              className={`rounded-lg py-2 px-2 text-center text-xs font-bold transition sm:px-3 ${
                filterFecha === ''
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              Todos
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* Fecha personalizada */}
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Fecha de cierre</label>
            <input
              type="date"
              value={filterFecha}
              onChange={(e) => setFilterFecha(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {/* Selector de Cajera */}
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Cajera o cajero</label>
            <select
              value={filterCajero}
              onChange={(e) => setFilterCajero(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="todos">Todos los Cajeros</option>
              {cajerosDisponibles.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Cuadre */}
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Estado del cuadre</label>
            <select
              value={filterDiferencia}
              onChange={(e) => setFilterDiferencia(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="todos">Todos los balances</option>
              <option value="sobrante">🟢 Con Sobrante (+)</option>
              <option value="faltante">🔴 Con Faltante (-)</option>
              <option value="exacto">⚪ Cuadre Exacto ($0)</option>
            </select>
          </div>

          {/* Buscador */}
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Buscar cierre</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Nombre, ID o monto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Sección Informativa: Envíos de Vendedores a Cajeras ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          aria-expanded={enviosAbiertos}
          onClick={() => setEnviosAbiertos((open) => !open)}
          className="flex w-full flex-col gap-4 bg-slate-50/70 p-4 text-left transition hover:bg-slate-50 md:flex-row md:items-center md:justify-between md:p-5"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-teal-100 p-2 text-teal-700">
                <Send size={18} />
              </span>
              <h2 className="text-base font-black tracking-tight text-[#405566] sm:text-lg">
                Ventas enviadas por vendedores
              </h2>
              <span className="rounded-full bg-teal-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-800">
                {statsVendedores.totalEnviosGlobal} envíos
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              Registro de pedidos generados en sala por vendedores y derivados a las cajeras para su cobro.{' '}
              <span className="font-semibold text-slate-700">Es informativo y no modifica el arqueo ni el cuadre.</span>
            </p>
          </div>

          {statsVendedores.totalEnviosGlobal > 0 && (
            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-teal-100 bg-white px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Monto ref.</div>
                <div className="text-sm font-black text-[#405566]">{fmtCLP(statsVendedores.totalMontoGlobal)}</div>
              </div>
            </div>
          )}
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition ${enviosAbiertos ? 'rotate-90' : ''}`}>
              <ChevronRight size={17} />
            </span>
        </button>

        {enviosAbiertos && <div className="border-t border-slate-100 p-4 md:p-5">
          {statsVendedores.listaVendedores.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              <Send size={24} className="mx-auto mb-2 opacity-30" />
              <p className="font-medium">No se registran envíos de vendedores en la fecha seleccionada ({filterFecha || 'todos los días'}).</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {statsVendedores.listaVendedores.map((vend) => (
                <div key={vend.vendedorNombre} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2.5">
                      <StaffAvatar
                        name={vend.vendedorNombre}
                        photoUrl={trabajadorFotos[normalizeStaffName(vend.vendedorNombre)]}
                        className="h-9 w-9 rounded-xl bg-teal-100 text-sm font-black text-teal-800"
                      />
                      <div>
                        <h3 className="font-black text-sm text-gray-900 leading-none">
                          {vend.vendedorNombre}
                        </h3>
                        <span className="text-[11px] font-medium text-gray-500">Vendedor de sala</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-block rounded-full bg-teal-700 px-2.5 py-0.5 text-xs font-black text-white">
                        {vend.totalEnvios} {vend.totalEnvios === 1 ? 'envío' : 'envíos'}
                      </span>
                      <div className="text-[11px] font-bold text-gray-600 mt-0.5">
                        {fmtCLP(vend.totalMonto)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      Destino por Cajera:
                    </div>
                    <div className="space-y-1">
                      {vend.cajerasDetalle.map((c) => (
                        <div key={c.cajeraNombre} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-xl border border-gray-200 text-xs">
                          <span className="font-bold text-gray-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            A {c.cajeraNombre}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-teal-50 px-2 py-0.5 font-black text-teal-800">
                              {c.cantidad} {c.cantidad === 1 ? 'venta' : 'ventas'}
                            </span>
                            <span className="text-gray-500 font-medium text-[11px]">
                              {fmtCLP(c.totalMonto)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-[11px] text-gray-500 border-t border-slate-200/60 font-medium">
                    <span className="text-emerald-700 font-bold">{vend.completadas} completadas</span>
                    {vend.pendientes > 0 && <span className="text-amber-600 font-bold">{vend.pendientes} en caja</span>}
                    {vend.rechazadas > 0 && <span className="text-rose-500">{vend.rechazadas} canceladas</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>}
      </div>

      {/* ── Lista de Cortes Registrados ── */}
      {loading ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
          <RefreshCw size={28} className="mx-auto animate-spin text-emerald-700" />
          <p className="font-bold text-sm">Cargando cortes de caja y balances...</p>
        </div>
      ) : cortesFiltrados.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm sm:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <ClipboardList size={28} />
          </div>
          <h3 className="text-lg font-black text-[#405566]">No hay cierres para estos filtros</h3>
          <p className="mx-auto max-w-md text-sm text-slate-500">
            No hay registros de cierre para la fecha y filtros seleccionados. Intenta cambiar la fecha o seleccionar "Todos los Días".
          </p>
          <button
            onClick={() => {
              setFilterFecha('');
              setFilterCajero('todos');
              setFilterDiferencia('todos');
              setSearchTerm('');
            }}
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800"
          >
            Ver Todos los Cortes
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs font-bold text-slate-500">
            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" />{cortesFiltrados.length} {cortesFiltrados.length === 1 ? 'cierre encontrado' : 'cierres encontrados'}</span>
            <span className="text-slate-400">Ordenados por fecha de cierre</span>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {cortesFiltrados.map((corte) => {
              const esSobrante = corte.diferencia > 0;
              const esFaltante = corte.diferencia < 0;
              const esAnulado = Boolean(corte.anulado);
              return (
                <div
                  key={corte.id}
                  className={`overflow-hidden rounded-2xl border border-slate-200 border-l-4 bg-white shadow-sm transition hover:shadow-md ${
                    esAnulado
                      ? 'border-l-rose-400 bg-slate-50/40 opacity-85'
                      : esSobrante
                      ? 'border-l-emerald-500'
                      : esFaltante
                      ? 'border-l-rose-500'
                      : 'border-l-slate-400'
                  }`}
                >
                  {/* Cabecera del Corte */}
                  <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                      {/* Avatar Cajera */}
                      <StaffAvatar
                        name={corte.cajeroNombre}
                        photoUrl={trabajadorFotos[normalizeStaffName(corte.cajeroNombre)]}
                        className={`h-12 w-12 rounded-2xl text-lg font-black ${
                        esAnulado ? 'bg-slate-200 text-slate-600' : esSobrante ? 'bg-emerald-100 text-emerald-800' : esFaltante ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                      }`}
                      />
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-lg font-black text-slate-950">{corte.cajeroNombre}</h2>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                            {corte.origenManual ? 'Resumen importado' : 'Cierre de Caja'}
                          </span>
                          {esAnulado && (
                            <span className="rounded-full border border-rose-300 bg-rose-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-rose-800">
                              Anulado (Caja reanudada)
                            </span>
                          )}
                          {(() => {
                            const recibidas = enviosVendedoresDelDia.filter(
                              (vp) => vp.cajeraNombre.toLowerCase().trim() === corte.cajeroNombre.toLowerCase().trim()
                            );
                            if (recibidas.length === 0) return null;
                            return (
                              <span className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
                                <Send size={11} />
                                {recibidas.length} de vendedores
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-1 font-medium">
                          <span className="flex items-center gap-1">
                            <Clock size={12} className="text-slate-400" />
                            {corte.fechaCierreStr} · {corte.horaCierreStr || 'Hora oficial'}
                          </span>
                          <span>•</span>
                          <span className="font-mono text-gray-400 text-[11px]">
                            ID: #{corte.id.replace(/^corte_/, '').slice(0, 14)}
                          </span>
                        </div>
                        {esAnulado && (
                          <p className="mt-1.5 text-xs font-bold text-rose-700">
                            ⚠ Corte anulado: la caja fue reanudada. Todas las ventas y gastos continúan activos en la sesión.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Badge de Balance / Cuadre */}
                    <div className="flex items-center gap-3">
                      {esAnulado ? (
                        <div className="min-w-36 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-right text-rose-800">
                          <div className="text-[10px] font-black uppercase tracking-wider text-rose-600">
                            🚫 Corte Anulado
                          </div>
                          <div className="text-xs font-bold text-rose-700 mt-0.5">
                            Caja reanudada
                          </div>
                        </div>
                      ) : (
                        <div className={`min-w-36 rounded-xl border px-4 py-2.5 text-right ${
                        esSobrante
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : esFaltante
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-gray-100 border-gray-200 text-gray-700'
                      }`}>
                        <div className="text-[10px] font-black uppercase tracking-wider">
                          {esSobrante ? '🟢 Sobró Dinero' : esFaltante ? '🔴 Faltó Dinero' : '⚪ Cuadre Exacto'}
                        </div>
                        <div className="text-base font-black">
                          {esSobrante ? '+' : ''}{fmtCLP(corte.diferencia)}
                        </div>
                      </div>
                      )}
                    </div>
                  </div>

                  {/* Cuerpo con 3 Columnas de Desglose */}
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
                    {/* Columna 1: Ventas del Turno */}
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                        <Store size={14} className="text-teal-700" />
                        <span>Ventas del Turno</span>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500">Boletas emitidas</span>
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-black text-[#405566]">
                            {corte.ventasCount} ventas
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500">Total bruto de ventas</span>
                          <span className="font-black text-slate-950">{fmtCLP(corte.totalVentas)}</span>
                        </div>
                        {Number(corte.totalVueltos || 0) > 0 && (
                          <div className="flex justify-between items-center text-xs text-gray-500 pt-1 border-t border-gray-200">
                            <span>Vueltos Entregados:</span>
                            <span className="font-semibold">{fmtCLP(corte.totalVueltos || 0)}</span>
                          </div>
                        )}
                        {(() => {
                          const recibidas = enviosVendedoresDelDia.filter(
                            (vp) => vp.cajeraNombre.toLowerCase().trim() === corte.cajeroNombre.toLowerCase().trim()
                          );
                          if (recibidas.length === 0) return null;
                          const vMap = new Map<string, { count: number; total: number }>();
                          recibidas.forEach((r) => {
                            const vName = r.vendedorNombre || 'Vendedor';
                            const prev = vMap.get(vName) || { count: 0, total: 0 };
                            prev.count += 1;
                            prev.total += r.total;
                            vMap.set(vName, prev);
                          });
                          const list = Array.from(vMap.entries()).sort((a, b) => b[1].count - a[1].count);
                          return (
                            <div className="pt-2 border-t border-slate-100">
                              <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-teal-800" title="Ventas enviadas por vendedores a esta cajera">
                                <Send size={11} />
                                De Vendedores ({recibidas.length}):
                              </span>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {list.map(([vName, data]) => (
                                  <span key={vName} className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50/70 px-2 py-1 text-[11px] font-bold text-teal-900">
                                    <StaffAvatar name={vName} photoUrl={trabajadorFotos[normalizeStaffName(vName)]} className="h-4 w-4 rounded-full bg-teal-200 text-[8px] font-black" />
                                    <span>{vName}:</span>
                                    <span className="text-teal-800 font-extrabold">{data.count}</span>
                                    <span className="text-[10px] font-medium text-slate-500">({fmtCLP(data.total)})</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Columna 2: Desglose por Medio de Pago */}
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                        <CreditCard size={14} className="text-teal-700" />
                        <span>Medios de Pago</span>
                      </div>
                      <div className="space-y-1.5 pt-1 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Efectivo Sistema:
                          </span>
                          <span className="font-bold text-emerald-700">{fmtCLP(corte.efectivoTeorico)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-teal-500"></span> Transferencias:
                          </span>
                          <span className="font-bold text-teal-700">{fmtCLP(corte.totalTransferencia)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-teal-500"></span> Tarjeta Débito:
                          </span>
                          <span className="font-bold text-teal-700">{fmtCLP(corte.totalDebito)}</span>
                        </div>

                        {Number(corte.totalDevoluciones || 0) > 0 && (
                          <div className="flex justify-between items-center text-xs text-rose-700 pt-1 border-t border-gray-200 font-bold">
                            <span>(-) Devolución de Dinero:</span>
                            <span>-{fmtCLP(corte.totalDevoluciones || 0)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Columna 3: Arqueo Físico y Balance */}
                      <div className={`space-y-3 rounded-xl border p-4 ${
                        esSobrante ? 'border-emerald-200 bg-emerald-50/60' : esFaltante ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-slate-50'
                      }`}>
                      <div className={`flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider ${
                        esSobrante ? 'text-emerald-800' : esFaltante ? 'text-rose-800' : 'text-slate-600'
                      }`}>
                        <Wallet size={14} />
                        <span>Arqueo en Gaveta</span>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between items-center text-xs text-slate-500">
                          <span>Efectivo Teórico:</span>
                          <span className="font-bold text-gray-700">{fmtCLP(corte.efectivoTeorico)}</span>
                        </div>
                        <div className="flex justify-between items-center gap-3 border-t border-slate-200/80 pt-2 text-sm">
                          <span className="font-bold text-[#405566]">Efectivo entregado</span>
                          <span className="text-base font-black text-slate-950">
                            {fmtCLP(corte.efectivoReal)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs pt-1">
                          <span className="font-bold text-gray-600">Diferencia Final:</span>
                          <span className={`font-black px-2 py-0.5 rounded-md ${
                            esSobrante
                              ? 'bg-emerald-100 text-emerald-800'
                              : esFaltante
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-gray-200 text-gray-800'
                          }`}>
                            {esSobrante ? '+' : ''}{fmtCLP(corte.diferencia)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Alerta de Devolución / Gastos si existieron */}
                  {Number(corte.totalDevoluciones || 0) > 0 && (
                    <div className="mx-5 md:mx-6 mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                      <span>
                        <strong>Observación de Cierre:</strong> Se registró una devolución de dinero por <strong>{fmtCLP(corte.totalDevoluciones || 0)}</strong>
                        {corte.devolucionesItems?.[0]?.detalle ? ` ("${corte.devolucionesItems[0].detalle}")` : ''}.
                      </span>
                    </div>
                  )}

                  {/* Barra Inferior con Botones de Acción */}
                  <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="text-xs text-slate-500">
                      Sucursal <span className="font-bold text-slate-700">{sedeNombre}</span>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      {corte.origenManual ? (
                        <span className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
                          Capturado desde comprobante · sin detalle de boletas POS
                        </span>
                      ) : (
                        <>
                          {/* Botón Ver Boletas */}
                          <button
                            onClick={() => handleOpenVentasModal(corte)}
                            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                          >
                            <Eye size={15} className="text-gray-500" />
                            <span>Ver Boletas del Turno ({corte.ventasCount})</span>
                          </button>

                          {/* Botón Reimprimir Comprobante de Corte 80mm */}
                          <button
                            onClick={() => handlePrintCorte(corte)}
                            className="flex items-center justify-center gap-2 rounded-xl bg-[#087f73] hover:bg-[#06695f] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition"
                            title="Reimprimir comprobante térmico oficial de corte de caja de 80mm"
                          >
                            <Printer size={15} />
                            <span>Reimprimir Boleta de Corte (80mm)</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>

      {/* ── Modal Detalle de Boletas del Turno ── */}
      {selectedCorte && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Cabecera Modal */}
            <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-teal-700 font-mono text-xs font-bold uppercase tracking-wider">
                  <Receipt size={14} /> Turno de Ventas
                </div>
                <h3 className="text-xl font-black text-gray-900 mt-1">
                  Boletas emitidas por {selectedCorte.cajeroNombre}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Corte del {selectedCorte.fechaCierreStr} a las {selectedCorte.horaCierreStr} · Total: {fmtCLP(selectedCorte.totalVentas)}
                </p>
              </div>
              <button
                onClick={() => setSelectedCorte(null)}
                className="w-10 h-10 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 flex items-center justify-center transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Buscador dentro del modal */}
            <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Filtrar por número de boleta, monto o producto..."
                  value={ventasSearch}
                  onChange={(e) => setVentasSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
              </div>
              <span className="text-xs text-gray-500 font-mono shrink-0">
                {filteredVentasModal.length} de {corteVentas.length} boletas
              </span>
            </div>

            {/* Cuerpo Modal: Lista de Boletas */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {loadingVentas ? (
                <div className="p-12 text-center text-gray-400 space-y-2">
                  <RefreshCw size={24} className="animate-spin mx-auto text-teal-600" />
                  <p className="text-xs font-bold">Cargando boletas del corte...</p>
                </div>
              ) : filteredVentasModal.length === 0 ? (
                <div className="p-12 text-center text-gray-400 text-xs font-bold">
                  No se encontraron boletas que coincidan con la búsqueda.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredVentasModal.map((v) => {
                    const met = (v.metodoPago || '').toLowerCase();
                    return (
                      <div
                        key={v.id}
                        className="p-4 rounded-2xl border border-gray-200 bg-white hover:border-teal-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-gray-900 text-sm">
                              Boleta #{v.boletaNumero || 'S/N'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                              met === 'efectivo'
                                ? 'bg-emerald-100 text-emerald-800'
                                : met === 'transferencia'
                                ? 'bg-teal-100 text-teal-800'
                                : 'bg-teal-100 text-teal-800'
                            }`}>
                              {v.metodoPago || 'Efectivo'}
                            </span>
                            {v.debitoOrdenNumero && (
                              <span className="text-[10px] font-mono text-gray-500">
                                Op: #{v.debitoOrdenNumero}
                              </span>
                            )}
                            {v.vendedorNombre && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1">
                                <Send size={9} />
                                Vendedor: {v.vendedorNombre}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            <span>{v.fechaHora || v.fechaStr}</span> · <span className="font-medium text-gray-700">{v.items?.length || 0} producto(s)</span>
                          </div>
                          {v.items && v.items.length > 0 && (
                            <div className="text-[11px] text-gray-400 truncate max-w-md">
                              {v.items.map((it) => `${it.cantidad}x ${it.nombre}`).join(' · ')}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-4 justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100">
                          <div className="text-right">
                            <div className="text-base font-black text-gray-900">
                              {fmtCLP(v.total)}
                            </div>
                            {Number(v.vuelto || 0) > 0 && (
                              <div className="text-[10px] text-gray-400">
                                Vuelto: {fmtCLP(v.vuelto || 0)}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => handlePrintBoletaVenta(v)}
                            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold px-3 py-2 rounded-xl text-xs transition shrink-0"
                            title="Reimprimir comprobante interno en ticketera térmica"
                          >
                            <Printer size={14} className="text-gray-600" />
                            <span>Reimprimir</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pie Modal */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <button
                onClick={() => setSelectedCorte(null)}
                className="px-4 py-2 rounded-xl font-bold text-xs text-gray-700 bg-gray-200 hover:bg-gray-300 transition"
              >
                Cerrar
              </button>
              <button
                onClick={() => handlePrintCorte(selectedCorte)}
                className="flex items-center gap-2 px-5 py-2 rounded-xl font-black text-xs text-white bg-[#087f73] hover:bg-teal-700 shadow-md transition"
              >
                <Printer size={15} />
                <span>Reimprimir Reporte de Corte Completo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
