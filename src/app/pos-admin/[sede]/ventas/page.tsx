'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DEFAULT_COMPANY_CONFIG, openReceiptPrintWindow } from '@/lib/posReceipt';
import type { ReceiptCompanyConfig } from '@/lib/posReceipt';
import { SEDES, DEFAULT_SEDE, SedeSlug } from '@/types';
import { branchSlugQueryValues, matchBranchSlug } from '@/lib/posBranchAccess';
import {
  RefreshCw, Eye, Loader2, Search, Filter, ArrowLeft, ChevronRight,
  Wallet, TrendingUp, User, Receipt, Trash2, ShieldAlert, Edit3,
  Check, X, RotateCcw, ClipboardList, FileText, Calendar,
} from 'lucide-react';

// ─── Firebase ──────────────────────────────────────────────────────────────────
import { db, auth, authReady } from '@/lib/firebase';
import { usePosAccessLevel } from '@/hooks/usePosAccessLevel';
import { POS_ACCESS_RANK } from '@/lib/posAccessLevels';
import { saleBelongsToCashier } from '@/lib/posCashierVisibility';
import { getChileDateStr, shiftDateStr } from '@/lib/chileDate';
import { collection, query, where, onSnapshot, updateDoc, doc, deleteDoc, getDoc, getDocs, getDocsFromServer, limit, runTransaction } from 'firebase/firestore';
type Timestamp = { toDate?: () => Date; seconds?: number };

// ─── Types ────────────────────────────────────────────────────────────────────
interface VentaPOS {
  id: string;
  sede: string;
  cajeroNombre: string;
  cajeroId?: string;
  total: number;
  subtotal: number;
  estado: 'completada' | 'anulada';
  fecha: Timestamp;
  fechaStr: string;
  items: Array<{ sku: string; nombre: string; cantidad: number; subtotal: number; precioUnitario?: number }>;
  pagos: Array<{ metodo: string; monto: number }>;
  metodoPago?: string;
  sesionCajaId?: string;
  descuentoGlobalPct: number;
  descuentoGlobal: number;
  efectivoPagado?: number;
  vuelto?: number;
  boletaNumero?: number;
  debitoOrdenNumero?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n));

// const PAGE_SIZE = 10;
const SALES_CACHE_TTL_MS = 30_000;
const salesRangeCache = new Map<string, { cachedAt: number; rows: VentaPOS[] }>();
const makeSalesCacheKey = (sede: string, desde: string, hasta: string) => `${sede}::${desde}::${hasta}`;
const normalizeCashierName = (name: string) => String(name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const salePaymentTotals = (sale: any, pagosOverride?: Array<{ metodo: string; monto: number }>, totalOverride?: number) => {
  const total = Math.max(0, Number(totalOverride ?? sale?.total) || 0);
  if (sale?.estado !== 'completada') return { total: 0, efectivo: 0, debito: 0, transferencia: 0, ventasCount: 0, vueltos: 0 };
  let pagos = Array.isArray(pagosOverride) ? pagosOverride : (Array.isArray(sale?.pagos) ? sale.pagos : []);
  if (!pagos.length && typeof sale?.pagosJson === 'string') {
    try { pagos = JSON.parse(sale.pagosJson); } catch {}
  }
  if (!pagos.length) pagos = [{ metodo: sale?.metodoPago || (sale?.debitoOrdenNumero ? 'debito' : 'efectivo'), monto: total }];
  pagos = pagos.map((p: any) => {
    let monto = Math.max(0, Number(p?.monto) || 0);
    if (pagos.length === 1 && total > 0 && monto > total) monto = total;
    return { metodo: String(p?.metodo || 'efectivo').toLowerCase().trim(), monto };
  });
  const efectivoBruto = pagos.filter((p: any) => p.metodo === 'efectivo').reduce((s: number, p: any) => s + p.monto, 0);
  const efectivo = (pagos.length > 1 || String(sale?.metodoPago || '').toLowerCase() === 'mixto')
    ? Math.max(0, efectivoBruto - (Number(sale?.vuelto) || 0))
    : efectivoBruto;
  return {
    total,
    efectivo,
    debito: pagos.filter((p: any) => p.metodo === 'debito').reduce((s: number, p: any) => s + p.monto, 0),
    transferencia: pagos.filter((p: any) => p.metodo === 'transferencia').reduce((s: number, p: any) => s + p.monto, 0),
    ventasCount: 1,
    vueltos: Math.max(0, Number(sale?.vuelto) || 0),
  };
};
const invalidateSalesCache = (sede: string) => {
  const prefix = `${sede}::`;
  for (const key of salesRangeCache.keys()) if (key.startsWith(prefix)) salesRangeCache.delete(key);
};

export default function HistorialVentasPage() {
  const params = useParams<{ sede: string }>();
  const router = useRouter();
  const currentSede = ((params?.sede) || DEFAULT_SEDE) as SedeSlug;
  const sedeNombre = SEDES[currentSede] || currentSede;
  const { level: accessLevel, isSupreme, workerId, displayName, sellerRole, ready: accessReady } = usePosAccessLevel();
  const canOperateSales = isSupreme || accessLevel === 'alto';
  const canEditBoletas = isSupreme || accessLevel === 'alto';
  const restrictToOwnSales = !isSupreme && (accessLevel !== 'alto' || Boolean(sellerRole));

  const [ventasRaw, setVentasRaw] = useState<VentaPOS[]>([]);
  const [cajeroFotos, setCajeroFotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [salesSyncStatus, setSalesSyncStatus] = useState<'loading' | 'cache' | 'synced' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    void import('@/lib/trabajadoresErpService').then(({ fetchTrabajadoresERP }) => fetchTrabajadoresERP()).then(trabajadores => {
      if (!active) return;
      const fotos: Record<string, string> = {};
      trabajadores.forEach(trabajador => {
        const foto = String(trabajador.fotoUrl || '').trim();
        if (!foto) return;
        if (trabajador.$id) fotos[`id:${trabajador.$id}`] = foto;
        const nombre = normalizeCashierName(trabajador.nombre);
        if (nombre) fotos[`nombre:${nombre}`] = foto;
      });
      setCajeroFotos(fotos);
    }).catch(error => console.warn('No se pudieron cargar las fotos del equipo:', error));
    return () => { active = false; };
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMetodo, setFilterMetodo] = useState<string>('todos');
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [filterCajero, setFilterCajero] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedVenta, setSelectedVenta] = useState<VentaPOS | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VentaPOS | null>(null);
  const [deletePin, setDeletePin] = useState('');
  const [deletePinError, setDeletePinError] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const estado = new URLSearchParams(window.location.search).get('estado');
    if (estado === 'anulada') {
      setFilterEstado('anulada');
      setPage(1);
    }
  }, []);

  // Rehacer venta
  const [rehacerTarget, setRehacerTarget] = useState<VentaPOS | null>(null);
  const [rehacerMotivo, setRehacerMotivo] = useState('');
  const [rehacerSaving, setRehacerSaving] = useState(false);

  const openRehacer = (v: VentaPOS) => { if (!canOperateSales) return; setRehacerTarget(v); setRehacerMotivo(''); };

  const handleRehacerConfirm = async () => {
    if (!rehacerTarget || !canOperateSales) return;
    if (!rehacerMotivo.trim()) return;
    setRehacerSaving(true);
    try {
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
        console.warn('Error restituyendo stock en rehacer venta (pos-admin):', stockErr);
      }

      await updateDoc(doc(db, 'ventas_pos', rehacerTarget.id), {
        estado: 'anulada', motivoAnulacion: rehacerMotivo.trim(), anuladaAt: Date.now(),
      });
      invalidateSalesCache(currentSede);
      const POS_DRAFTS_KEY = 'asistora_pos_drafts_v1';
      const draftsKey = `${POS_DRAFTS_KEY}_${currentSede}`;
      let drafts: any[] = [];
      try { drafts = JSON.parse(localStorage.getItem(draftsKey) || '[]'); } catch {}
      const totalLabel = fmtCLP(rehacerTarget.total);
      drafts.push({
        id: `draft_${Date.now()}`,
        label: `Rehaciendo boleta #${rehacerTarget.boletaNumero || rehacerTarget.id.slice(-6)} · ${totalLabel}`,
        cart: (rehacerTarget.items || []).map(it => ({
          sku: it.sku, nombre: it.nombre, cantidad: it.cantidad,
          precioUnitario: it.precioUnitario || (it.cantidad > 0 ? it.subtotal / it.cantidad : 0),
          costoUnitario: 0, descuentoPct: 0, subtotal: it.subtotal, stockDisponible: 999,
        })),
        descuentoGlobalPct: rehacerTarget.descuentoGlobalPct || 0,
        savedAt: Date.now(),
      });
      localStorage.setItem(draftsKey, JSON.stringify(drafts));
      setRehacerTarget(null);
      router.push(`/pos/${currentSede}`);
    } catch (e: any) { alert('Error: ' + e.message); }
    setRehacerSaving(false);
  };

  // Editar método de pago
  const EDIT_PIN = '988189813';
  type MetodoPago = 'efectivo' | 'debito' | 'transferencia';
  const [editTarget, setEditTarget] = useState<VentaPOS | null>(null);
  const [editPin, setEditPin] = useState('');
  const [editPinError, setEditPinError] = useState(false);
  const [editPinOk, setEditPinOk] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [editMetodo, setEditMetodo] = useState<MetodoPago>('efectivo');
  const [editCajero, setEditCajero] = useState<string>('');
  const [isCustomCajero, setIsCustomCajero] = useState(false);
  const [editCantidades, setEditCantidades] = useState<number[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  const knownCajeros = useMemo(() => {
    const list = ['Paola', 'Fernanda', 'Lissy', 'Daniel'];
    ventasRaw.forEach(v => {
      const n = (v.cajeroNombre || '').trim();
      if (n && !list.includes(n)) list.push(n);
    });
    return list;
  }, [ventasRaw]);

  const openEditPago = (v: VentaPOS) => {
    if (!canEditBoletas) return;
    setEditTarget(v); setEditPin(''); setEditPinError(false); setEditPinOk(false);
    setEditPinOk(true); setEditReason('');
    setEditMetodo(((v.pagos?.[0]?.metodo as MetodoPago) || 'efectivo'));
    const cName = (v.cajeroNombre || '').trim() || 'Paola';
    setEditCajero(cName);
    setIsCustomCajero(!knownCajeros.includes(cName));
    setEditCantidades((v.items || []).map(it => it.cantidad));
  };

  const handleEditPin = () => {
    if (editPin !== EDIT_PIN) { setEditPinError(true); setEditPin(''); return; }
    setEditPinError(false); setEditPinOk(true);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!canEditBoletas || !editReason.trim()) return alert('Escribe el motivo de la edición para dejarlo registrado.');
    setEditSaving(true);
    try {
      const newItems = (editTarget.items || []).map((it, i) => {
        const qty = Math.max(1, editCantidades[i] ?? it.cantidad);
        const precio = it.precioUnitario || (qty > 0 ? it.subtotal / it.cantidad : 0);
        return { ...it, cantidad: qty, subtotal: Math.round(precio * qty) };
      });
      const newSubtotal = newItems.reduce((s, it) => s + it.subtotal, 0);
      const newTotal = Math.max(0, newSubtotal - (editTarget.descuentoGlobal || 0));
      const finalPagos = (editTarget.pagos && editTarget.pagos.length > 0)
        ? editTarget.pagos.map((p, i) => i === 0 ? { ...p, metodo: editMetodo } : p)
        : [{ metodo: editMetodo, monto: newTotal }];
      const cashierName = editCajero.trim() || editTarget.cajeroNombre || 'Cajero';
      const saleTs = Number((editTarget as any).fechaTs)
        || (editTarget.fecha?.toDate ? editTarget.fecha.toDate().getTime() : 0)
        || (Number((editTarget.fecha as any)?.seconds) ? Number((editTarget.fecha as any).seconds) * 1000 : 0);
      const saleDay = editTarget.fechaStr || (saleTs
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(saleTs))
        : '');
      const currentSessionSnap = editTarget.sesionCajaId
        ? await getDoc(doc(db, 'caja_sesiones', editTarget.sesionCajaId))
        : null;
      const currentSession = currentSessionSnap?.exists() ? currentSessionSnap.data() as any : null;
      const sessionMismatch = Boolean(editTarget.sesionCajaId && (
        !currentSession
        || normalizeCashierName(currentSession.cajeroNombre) !== normalizeCashierName(cashierName)
        || (saleDay && currentSession.fechaStr && currentSession.fechaStr !== saleDay)
      ));
      const cashierChanged = normalizeCashierName(editTarget.cajeroNombre) !== normalizeCashierName(cashierName);
      let targetSessionId = editTarget.sesionCajaId || '';

      // El cajero visible y la sesión de caja son datos distintos. Si no coinciden,
      // ubicar la sesión del cajero para la fecha y hora de la venta.
      if ((sessionMismatch || cashierChanged) && saleDay) {
        const sameDaySessions = await getDocs(query(collection(db, 'caja_sesiones'), where('fechaStr', '==', saleDay)));
        const namedSessions = sameDaySessions.docs
          .map(sessionDoc => ({ id: sessionDoc.id, ...sessionDoc.data() } as any))
          .filter(session => matchBranchSlug(session.sede || 'donbalato-central', currentSede)
            && normalizeCashierName(session.cajeroNombre) === normalizeCashierName(cashierName));
        const timeMatches = saleTs
          ? namedSessions.filter(session => {
            const openedAt = Number(session.aperturaAtTs || 0);
            const closedAt = Number(session.cierreAtTs || 0);
            return (!openedAt || saleTs >= openedAt) && (!closedAt || saleTs <= closedAt);
          })
          : namedSessions;
        const candidates = timeMatches.length ? timeMatches : namedSessions.length === 1 ? namedSessions : [];
        if (candidates.length === 1) targetSessionId = candidates[0].id;
        else if (sessionMismatch || cashierChanged) {
          throw new Error(candidates.length > 1
            ? `Hay más de una sesión de ${cashierName} para esa venta. No se guardó para evitar asignarla al corte equivocado.`
            : `No encontré una sesión de caja de ${cashierName} para la fecha de esta venta. No se guardó para evitar descuadrar el cierre.`);
        }
      }

      const saleRef = doc(db, 'ventas_pos', editTarget.id);
      const saleDayCuadreRef = saleDay ? doc(db, 'cuadres_erp', `${currentSede}__${saleDay}`) : null;
      const sessionIds = [...new Set([editTarget.sesionCajaId || '', targetSessionId].filter(Boolean))];
      const sessionRefs = sessionIds.map(id => ({ id, ref: doc(db, 'caja_sesiones', id) }));
      const cutRefs = sessionIds.map(id => ({ id, ref: doc(db, 'cortes_caja', `corte_${id}`) }));
      const updatedBy = auth.currentUser?.email || 'Usuario POS';
      const editedAt = Date.now();

      await runTransaction(db, async transaction => {
        const [saleSnap, ...relatedSnaps] = await Promise.all([
          transaction.get(saleRef),
          ...sessionRefs.map(item => transaction.get(item.ref)),
          ...cutRefs.map(item => transaction.get(item.ref)),
          ...(saleDayCuadreRef ? [transaction.get(saleDayCuadreRef)] : []),
        ]);
        if (!saleSnap.exists()) throw new Error('La boleta ya no existe. Actualiza el historial e inténtalo de nuevo.');
        const currentSale = saleSnap.data() as any;
        const oldSessionId = String(currentSale.sesionCajaId || '');
        const newSessionId = targetSessionId || oldSessionId;
        if (oldSessionId && !sessionIds.includes(oldSessionId)) throw new Error('La sesión de caja de la boleta cambió. Actualiza el historial e inténtalo de nuevo.');
        if (newSessionId && !sessionIds.includes(newSessionId)) throw new Error('No se pudo validar la sesión de destino. Actualiza el historial e inténtalo de nuevo.');

        const sessionSnapById = new Map<string, any>();
        const cutSnapById = new Map<string, any>();
        let snapIndex = 1;
        for (const item of sessionRefs) sessionSnapById.set(item.id, relatedSnaps[snapIndex++]);
        for (const item of cutRefs) cutSnapById.set(item.id, relatedSnaps[snapIndex++]);
        const cuadreSnap = saleDayCuadreRef ? relatedSnaps[snapIndex] : null;

        const oldContribution = salePaymentTotals(currentSale);
        const newContribution = salePaymentTotals({ ...currentSale, estado: currentSale.estado, vuelto: currentSale.vuelto, metodoPago: editMetodo }, finalPagos, newTotal);
        const deltas = new Map<string, ReturnType<typeof salePaymentTotals>>();
        const addDelta = (id: string, contribution: ReturnType<typeof salePaymentTotals>, sign: number) => {
          const previous = deltas.get(id) || { total: 0, efectivo: 0, debito: 0, transferencia: 0, ventasCount: 0, vueltos: 0 };
          deltas.set(id, {
            total: previous.total + contribution.total * sign,
            efectivo: previous.efectivo + contribution.efectivo * sign,
            debito: previous.debito + contribution.debito * sign,
            transferencia: previous.transferencia + contribution.transferencia * sign,
            ventasCount: previous.ventasCount + contribution.ventasCount * sign,
            vueltos: previous.vueltos + contribution.vueltos * sign,
          });
        };
        if (oldSessionId && oldSessionId !== newSessionId) addDelta(oldSessionId, oldContribution, -1);
        if (newSessionId) addDelta(newSessionId, newContribution, 1);
        if (oldSessionId && oldSessionId === newSessionId) addDelta(oldSessionId, oldContribution, -1);

        for (const [id, delta] of deltas) {
          const sessionSnap = sessionSnapById.get(id);
          if (!sessionSnap?.exists()) throw new Error(`No se encontró la sesión de caja ${id}.`);
          const sessionData = sessionSnap.data() as any;
          const sessionUpdate: Record<string, number> = {};
          for (const field of ['totalEfectivo', 'totalDebito', 'totalTransferencia'] as const) {
            const key = field === 'totalEfectivo' ? 'efectivo' : field === 'totalDebito' ? 'debito' : 'transferencia';
            const next = (Number(sessionData[field]) || 0) + delta[key];
            if (next < -1) throw new Error(`El ajuste dejaría negativo ${field} en la sesión de ${sessionData.cajeroNombre || 'caja'}.`);
            sessionUpdate[field] = Math.max(0, next);
          }
          sessionUpdate.ventasCount = Math.max(0, (Number(sessionData.ventasCount) || 0) + delta.ventasCount);
          if (typeof sessionData.totalVentas === 'number') sessionUpdate.totalVentas = Math.max(0, sessionData.totalVentas + delta.total);
          if (typeof sessionData.totalVueltos === 'number') sessionUpdate.totalVueltos = Math.max(0, sessionData.totalVueltos + delta.vueltos);
          transaction.update(sessionRefs.find(item => item.id === id)!.ref, sessionUpdate);

          const cutSnap = cutSnapById.get(id);
          if (cutSnap?.exists()) {
            const cut = cutSnap.data() as any;
            const nextTheoretical = (Number(cut.efectivoTeorico) || 0) + delta.efectivo;
            const cutUpdate: Record<string, number> = {
              totalVentas: Math.max(0, (Number(cut.totalVentas) || 0) + delta.total),
              totalEfectivo: Math.max(0, (Number(cut.totalEfectivo) || 0) + delta.efectivo),
              totalDebito: Math.max(0, (Number(cut.totalDebito) || 0) + delta.debito),
              totalTransferencia: Math.max(0, (Number(cut.totalTransferencia) || 0) + delta.transferencia),
              efectivoTeorico: Math.max(0, nextTheoretical),
              ventasCount: Math.max(0, (Number(cut.ventasCount) || 0) + delta.ventasCount),
              totalVueltos: Math.max(0, (Number(cut.totalVueltos) || 0) + delta.vueltos),
            };
            cutUpdate.diferencia = (Number(cut.efectivoReal) || 0) - cutUpdate.efectivoTeorico;
            transaction.update(cutRefs.find(item => item.id === id)!.ref, cutUpdate);
          }
        }

        // Mantener el resumen diario que consume /cuadres sincronizado con los
        // cierres individuales. Este resumen se construye desde montosPorCajera;
        // editar solo cortes_caja deja la tarjeta diaria mostrando el valor viejo.
        if (saleDayCuadreRef && cuadreSnap?.exists()) {
          const cuadre = cuadreSnap.data() as any;
          const rows: Record<string, any> = { ...(cuadre.montosPorCajera || {}) };
          const summaryDeltas = new Map<string, { total: number; efectivo: number; debito: number; transferencia: number; ventasCount: number; diferencia: number }>();
          const addSummaryDelta = (sessionId: string, contribution: ReturnType<typeof salePaymentTotals>, sign: number) => {
            if (!sessionId || !cutSnapById.get(sessionId)?.exists()) return;
            const session = sessionSnapById.get(sessionId)?.data() as any;
            const cashier = String(session?.cajeroNombre || '').trim();
            if (!cashier) return;
            const normalized = normalizeCashierName(cashier);
            const prior = summaryDeltas.get(normalized) || { total: 0, efectivo: 0, debito: 0, transferencia: 0, ventasCount: 0, diferencia: 0 };
            summaryDeltas.set(normalized, {
              total: prior.total + contribution.total * sign,
              efectivo: prior.efectivo + contribution.efectivo * sign,
              debito: prior.debito + contribution.debito * sign,
              transferencia: prior.transferencia + contribution.transferencia * sign,
              ventasCount: prior.ventasCount + contribution.ventasCount * sign,
              diferencia: prior.diferencia - contribution.efectivo * sign,
            });
          };
          if (oldSessionId) addSummaryDelta(oldSessionId, oldContribution, -1);
          if (newSessionId) addSummaryDelta(newSessionId, newContribution, 1);

          const sessionsByCashier = new Map<string, { id: string; name: string }>();
          for (const [id, snap] of sessionSnapById) {
            const name = String((snap.data() as any)?.cajeroNombre || '').trim();
            if (name) sessionsByCashier.set(normalizeCashierName(name), { id, name });
          }
          for (const [normalized, delta] of summaryDeltas) {
            const existingKey = Object.keys(rows).find(key => normalizeCashierName(key) === normalized);
            const session = sessionsByCashier.get(normalized);
            const key = existingKey || session?.name || '';
            if (!key) continue;
            const cut = cutSnapById.get(session?.id || '')?.data() as any;
            const row = rows[key] || {
              efectivo: Number(cut?.totalEfectivo) || 0,
              efectivoReal: Number(cut?.efectivoReal) || 0,
              debito: Number(cut?.totalDebito) || 0,
              transferencia: Number(cut?.totalTransferencia) || 0,
              totalBruto: Number(cut?.totalVentas) || 0,
              diferencia: Number(cut?.diferencia) || 0,
              ventasCount: Number(cut?.ventasCount) || 0,
            };
            rows[key] = {
              ...row,
              efectivo: Math.max(0, (Number(row.efectivo) || 0) + delta.efectivo),
              debito: Math.max(0, (Number(row.debito) || 0) + delta.debito),
              transferencia: Math.max(0, (Number(row.transferencia) || 0) + delta.transferencia),
              totalBruto: Math.max(0, (Number(row.totalBruto) || 0) + delta.total),
              ventasCount: Math.max(0, (Number(row.ventasCount) || 0) + delta.ventasCount),
              diferencia: (Number(row.diferencia) || 0) + delta.diferencia,
            };
          }

          const cashierRows = Object.values(rows);
          const montos = {
            ...(cuadre.montos || {}),
            efectivoSistema: cashierRows.reduce((sum: number, row: any) => sum + (Number(row.efectivo) || 0), 0),
            efectivoReal: cashierRows.reduce((sum: number, row: any) => sum + (Number(row.efectivoReal) || 0), 0),
            debitoSistema: cashierRows.reduce((sum: number, row: any) => sum + (Number(row.debito) || 0), 0),
            debitoReal: cashierRows.reduce((sum: number, row: any) => sum + (Number(row.debitoReal ?? row.debito) || 0), 0),
            transferencias: cashierRows.reduce((sum: number, row: any) => sum + (Number(row.transferencia) || 0), 0),
          };
          const totalBruto = cashierRows.reduce((sum: number, row: any) => sum + (Number(row.totalBruto) || 0), 0);
          const diferenciaTotal = cashierRows.reduce((sum: number, row: any) => sum + (Number(row.diferencia) || 0), 0);
          const gastosTotales = Number(cuadre.calculos?.gastosTotales ?? cuadre.gastosTotales) || 0;
          const calculos = {
            ...(cuadre.calculos || {}),
            totalBruto,
            totalNeto: totalBruto - gastosTotales,
            diferenciaTotal,
            diferenciaEfectivo: montos.efectivoReal - montos.efectivoSistema,
          };
          transaction.update(saleDayCuadreRef, {
            montosPorCajera: rows,
            montos,
            calculos,
            efectivoSistema: montos.efectivoSistema,
            efectivoReal: montos.efectivoReal,
            debitoSistema: montos.debitoSistema,
            debitoReal: montos.debitoReal,
            transferencias: montos.transferencias,
            totalBruto,
            totalNeto: calculos.totalNeto,
            diferenciaTotal,
            diferenciaEfectivo: calculos.diferenciaEfectivo,
            updatedAt: new Date().toISOString(),
          });
        }

        const history = Array.isArray(currentSale.historialEdiciones) ? currentSale.historialEdiciones : [];
        transaction.update(saleRef, {
          items: newItems,
          subtotal: newSubtotal,
          total: newTotal,
          pagos: finalPagos,
          pagosJson: JSON.stringify(finalPagos),
          metodoPago: editMetodo,
          cajeroNombre: cashierName,
          ...(newSessionId ? { sesionCajaId: newSessionId } : {}),
          historialEdiciones: [...history, { razon: editReason.trim(), editadoPor: updatedBy, editadoEn: editedAt }],
        });
      });
      invalidateSalesCache(currentSede);
      setRefreshTrigger(k => k + 1);
      setEditTarget(null);
    } catch (e: any) { alert('Error: ' + e.message); }
    setEditSaving(false);
  };

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

  const todayFilter = useMemo(() => {
    return getChileDateStr();
  }, []);

  const firstOfMonth = useMemo(() => {
    return `${todayFilter.slice(0, 7)}-01`;
  }, [todayFilter]);

  const [fechaDesde, setFechaDesde] = useState(todayFilter);
  const [fechaHasta, setFechaHasta] = useState(todayFilter);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const qSearch = sp.get('search')?.trim();
    const qFecha = sp.get('fecha')?.trim();
    if (qSearch) {
      setSearchTerm(qSearch);
      setPage(1);
    }
    if (qFecha && /^\d{4}-\d{2}-\d{2}$/.test(qFecha)) {
      setFechaDesde(qFecha);
      setFechaHasta(qFecha);
      setPage(1);
    }
  }, []);

  const recentDateFilters = useMemo(() => {
    return Array.from({ length: 3 }, (_, offset) => {
      const value = shiftDateStr(todayFilter, -offset);
      const label = offset === 0 ? 'Hoy' : offset === 1 ? 'Ayer' : 'Anteayer';
      return { value, label, offset };
    });
  }, [todayFilter]);

  const ventas = useMemo(() => {
    if (!accessReady) return []
    return ventasRaw.filter((v: any) => {
      const fechaStr = String(v?.fechaStr || '').slice(0, 10);
      const inRange = fechaStr >= fechaDesde && fechaStr <= fechaHasta;
      return inRange && (!restrictToOwnSales || saleBelongsToCashier(v, { id: workerId, name: displayName }));
    });
  }, [ventasRaw, fechaDesde, fechaHasta, accessReady, restrictToOwnSales, workerId, displayName]);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let active = true;
    const cacheKey = makeSalesCacheKey(currentSede, fechaDesde, fechaHasta);
    const cached = salesRangeCache.get(cacheKey);
    const isTodayRange = fechaDesde === todayFilter && fechaHasta === todayFilter;
    const hasFreshCache = Boolean(cached && Date.now() - cached.cachedAt < SALES_CACHE_TTL_MS);
    if (hasFreshCache && cached) {
      setVentasRaw(cached.rows);
      setSalesSyncStatus('cache');
      if (!isTodayRange) {
        setLoading(false);
        return () => { active = false; };
      }
    }
    if (cached && !hasFreshCache) salesRangeCache.delete(cacheKey);
    (async () => {
      try {
        if (!hasFreshCache) {
          setLoading(true);
          setSalesSyncStatus('loading');
        }
        await authReady;
        if (!active || !db) return;
        let snap: any;
        if (fechaDesde && fechaDesde === fechaHasta) {
          // Si se consulta un solo día (ej. hoy), consultar directamente por fechaStr (evita leer miles de documentos)
          snap = await getDocsFromServer(
            query(
              collection(db, 'ventas_pos'),
              where('sede', 'in', branchSlugQueryValues(currentSede)),
              where('fechaStr', '==', fechaDesde),
            )
          );
        } else if (fechaDesde && fechaHasta) {
          // Consulta acotada por rango de fecha para evitar leer todo el historial histórico de la tienda
          snap = await getDocsFromServer(
            query(
              collection(db, 'ventas_pos'),
              where('sede', 'in', branchSlugQueryValues(currentSede)),
              where('fechaStr', '>=', fechaDesde),
              where('fechaStr', '<=', fechaHasta),
              limit(300)
            )
          );
        } else {
          snap = await getDocsFromServer(
            query(collection(db, 'ventas_pos'), where('sede', 'in', branchSlugQueryValues(currentSede)), limit(150))
          );
        }

        if (!active) return;
        const list = (snap.docs || [])
          .map((d: any) => ({ ...d.data(), id: d.id }))
          .filter((data: any) => {
            const s = data.sede || 'donbalato-central';
            return matchBranchSlug(s, currentSede);
          })
          .map((data: any) => {
          // Deserializar itemsJson y pagosJson con fallback robusto
          let items: any[] = [];
          let pagos: any[] = [];
          if (Array.isArray(data.items) && data.items.length > 0) {
            items = data.items;
          } else if (typeof data.itemsJson === 'string') {
            try { items = JSON.parse(data.itemsJson); } catch {}
          }

          if (Array.isArray(data.pagos) && data.pagos.length > 0) {
            pagos = data.pagos;
          } else if (typeof data.pagosJson === 'string' && data.pagosJson !== '[]') {
            try { pagos = JSON.parse(data.pagosJson); } catch {}
          }

          const total = Number(data.total || 0);
          const rawMetodo = data.metodoPago || (pagos.length > 0 ? pagos[0].metodo : (data.debitoOrdenNumero ? 'debito' : 'efectivo'));
          const metodoPago = String(rawMetodo).toLowerCase().trim();

          if (pagos.length === 0 && total > 0) {
            pagos = [{ metodo: metodoPago, monto: total }];
          }

          // Construir fecha desde fechaTs si no existe fecha como Timestamp
          let fecha: Timestamp = data.fecha;
          if (!fecha?.toDate && data.fechaTs) {
            fecha = { toDate: () => new Date(data.fechaTs) };
          } else if (!fecha?.toDate && data.createdAtTs) {
            fecha = { toDate: () => new Date(data.createdAtTs) };
          }
          return {
            id: data.id,
            ...data,
            items,
            pagos,
            metodoPago,
            fecha,
            cajeroNombre: data.cajeroNombre || data.cajeraNombre || 'Sin nombre',
            fechaStr: data.fechaStr || (data.fechaTs ? new Date(data.fechaTs).toISOString().split('T')[0] : ''),
          } as VentaPOS;
        });
        list.sort((a: any, b: any) => {
          const aMs = a?.fecha?.toDate ? a.fecha.toDate().getTime() : (a?.fechaTs || 0);
          const bMs = b?.fecha?.toDate ? b.fecha.toDate().getTime() : (b?.fechaTs || 0);
          return bMs - aMs;
        });
        salesRangeCache.set(cacheKey, { cachedAt: Date.now(), rows: list });
        setVentasRaw(list);
        setSalesSyncStatus('synced');
        setLoading(false);
      } catch (err) {
        console.error('[pos-admin/ventas] load error:', err);
        setSalesSyncStatus('error');
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [currentSede, fechaDesde, fechaHasta, refreshTrigger, todayFilter]);

  const DELETE_PIN = '988189813';

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (!canOperateSales) return;
    if (!canEditBoletas && deletePin !== DELETE_PIN) { setDeletePinError(true); setDeletePin(''); return; }
    setDeleting(true);
    try {
      // 1. Restituir stock atómicamente en Firestore products (Web & POS Sync)
      if (deleteTarget.items && deleteTarget.items.length > 0) {
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
          console.warn('Error restituyendo stock al eliminar venta (pos-admin):', stockErr);
        }
      }

      await deleteDoc(doc(db, 'ventas_pos', deleteTarget.id));
      invalidateSalesCache(currentSede);
      setVentasRaw(rows => rows.filter(v => v.id !== deleteTarget.id));
      setRefreshTrigger(k => k + 1);
      setDeleteTarget(null); setDeletePin(''); setDeletePinError(false);
    } catch (e: any) { alert('Error al eliminar: ' + e.message); }
    setDeleting(false);
  };

  const openVentaReceipt = (venta: VentaPOS) => {
    const resolvedDate = (venta.fecha?.toDate ? venta.fecha.toDate() : null)
      || (venta.fecha instanceof Date ? venta.fecha : null)
      || ((venta as any).fechaTs ? new Date((venta as any).fechaTs) : null)
      || ((venta as any).createdAtTs ? new Date((venta as any).createdAtTs) : null)
      || ((venta as any).createdAt?.toDate ? (venta as any).createdAt.toDate() : null)
      || ((venta as any).createdAt ? new Date((venta as any).createdAt) : null)
      || (venta.fechaStr ? new Date(`${venta.fechaStr}T12:00:00`) : new Date());

    openReceiptPrintWindow({
      tipoComprobante: 'comprobante',
      boletaNumero: 0,
      debitoOrdenNumero: venta.debitoOrdenNumero ?? null,
      fechaHora: resolvedDate.toLocaleString('es-CL'),
      fecha: resolvedDate,
      fechaTs: (venta as any).fechaTs,
      createdAtTs: (venta as any).createdAtTs,
      fechaStr: venta.fechaStr,
      cajeraNombre: venta.cajeroNombre,
      sedeNombre,
      subtotal: Number(venta.subtotal || 0),
      descuentoGlobalMonto: Number(venta.descuentoGlobal || 0),
      total: Number(venta.total || 0),
      efectivoPagado: Number(venta.efectivoPagado || 0),
      metodoPago: (venta as any).metodoPago || ((venta.pagos && venta.pagos.length > 0) ? venta.pagos[0].metodo : undefined),
      pagos: (venta.pagos || []).map(p => ({ metodo: p.metodo, monto: Number(p.monto || 0) })),
      vuelto: Number(venta.vuelto || 0),
      items: (venta.items || []).map(it => ({
        sku: it.sku,
        nombre: it.nombre,
        cantidad: Number(it.cantidad || 0),
        precioUnitario: Number(it.precioUnitario || 0),
        subtotal: Number(it.subtotal || 0),
      })),
    }, empresaConfig);
  };

  const filtered = useMemo(() => {
    let result = ventas;
    if (filterEstado !== 'todos') result = result.filter(v => v.estado === filterEstado);
    if (filterMetodo !== 'todos') {
      result = result.filter(v =>
        v.pagos?.some(p => (p.metodo || '').toLowerCase().trim() === filterMetodo) ||
        ((v as any).metodoPago && (v as any).metodoPago.toLowerCase().trim() === filterMetodo)
      );
    }
    if (filterCajero !== 'todos') result = result.filter(v => (v.cajeroNombre || '').trim() === filterCajero);
    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim();
      const cleanNum = term.replace(/[$.,\s]/g, '');
      const isNumeric = /^\d+$/.test(cleanNum);
      result = result.filter(v => {
        if (isNumeric) return String(Math.round(v.total)).includes(cleanNum);
        return (
          v.cajeroNombre?.toLowerCase().includes(term) ||
          v.id.toLowerCase().includes(term) ||
          v.items?.some(i => i.nombre?.toLowerCase().includes(term) || i.sku?.toLowerCase().includes(term))
        );
      });
    }
    return result;
  }, [ventas, filterEstado, filterMetodo, filterCajero, searchTerm]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const resumen = useMemo(() => {
    const completed = filtered.filter(v => v.estado === 'completada');
    const totalVentas = completed.reduce((s, v) => s + Number(v.total || 0), 0);
    const totalBoletas = completed.length;
    const anuladas = filtered.filter(v => v.estado === 'anulada').length;
    const totalItems = completed.reduce((s, v) => s + (v.items || []).reduce((s2, it) => s2 + Number(it.cantidad || 0), 0), 0);
    const ticketPromedio = totalBoletas > 0 ? totalVentas / totalBoletas : 0;

    const pagosMap = new Map<string, { monto: number; count: number }>();
    const productosMap = new Map<string, { sku: string; nombre: string; cantidad: number; total: number }>();
    const cajerosMap = new Map<string, number>();

    completed.forEach((v) => {
      const cajero = String(v.cajeroNombre || 'Sin nombre').trim();
      cajerosMap.set(cajero, (cajerosMap.get(cajero) || 0) + 1);
      ;(v.pagos || []).forEach((p) => {
        const key = String(p.metodo || 'otro').toLowerCase();
        const prev = pagosMap.get(key) || { monto: 0, count: 0 };
        const rawMonto = Number(p.monto || 0);
        // p.monto ya representa el monto neto cobrado de la venta imputado a este medio de pago
        const safeMonto = Math.min(rawMonto, Number(v.total || 0) || rawMonto);
        pagosMap.set(key, { monto: prev.monto + safeMonto, count: prev.count + 1 });
      });
      ;(v.items || []).forEach((it) => {
        const key = String(it.sku || '').toUpperCase();
        if (!key) return;
        const prev = productosMap.get(key) || { sku: key, nombre: it.nombre || key, cantidad: 0, total: 0 };
        productosMap.set(key, { ...prev, cantidad: prev.cantidad + Number(it.cantidad || 0), total: prev.total + Number(it.subtotal || 0) });
      });
    });

    return {
      totalVentas, totalBoletas, anuladas, totalItems, ticketPromedio,
      topProductos: Array.from(productosMap.values()).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5),
      topCajeros: Array.from(cajerosMap.entries()).map(([nombre, ventas]) => ({ nombre, ventas })).sort((a, b) => b.ventas - a.ventas).slice(0, 5),
      pagos: Array.from(pagosMap.entries()).map(([metodo, data]) => ({ metodo, ...data })).sort((a, b) => b.monto - a.monto),
    };
  }, [filtered]);

  const fmtDate = (ts: Timestamp, venta?: any) => {
    if (ts?.toDate) return ts.toDate!().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (venta?.fechaTs) return new Date(venta.fechaTs).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (venta?.createdAtTs) return new Date(venta.createdAtTs).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return '--';
  };
  const fmtTime = (ts: Timestamp, venta?: any) => {
    if (ts?.toDate) return ts.toDate!().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    if (venta?.fechaTs) return new Date(venta.fechaTs).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    if (venta?.createdAtTs) return new Date(venta.createdAtTs).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    return '';
  };

  return (
    <div data-pos-page="ventas" className="w-full min-w-0 space-y-4 pb-10">
      {/* ── Top Bar con Switcher de Pestañas (Historial de Ventas / Cortes de Caja) ── */}
      <div className="flex flex-col gap-3 rounded-none border-b border-slate-200 bg-white p-3 px-[3%] shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-full items-center gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto">
          <div className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-extrabold text-[#405566] shadow-sm sm:flex-none sm:text-sm">
            <FileText size={16} className="text-teal-700" />
            <span>Historial de Ventas</span>
          </div>
          <Link
            href={`/pos-admin/${currentSede}/cortes`}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-white hover:text-[#405566] sm:flex-none sm:px-4 sm:text-sm"
          >
            <ClipboardList size={16} />
            <span>Cortes y cierres</span>
          </Link>
        </div>

        <Link
          href={`/pos-admin/${currentSede}/cortes`}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 sm:shrink-0"
        >
          <ClipboardList size={15} className="text-teal-700" />
          <span>Ver arqueos y cuadres</span>
          <ChevronRight size={14} />
        </Link>
      </div>

      {/* Contenedor de tarjetas internas con padding de 3% a cada lado */}
      <div className="space-y-4 sm:space-y-5 px-[3%]">
        {/* Header */}
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-teal-800 sm:text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#087f73]" />
              {sedeNombre} <span className="text-teal-300">/</span> {fechaDesde === fechaHasta ? fechaDesde : `${fechaDesde} — ${fechaHasta}`}
            </div>
            <div className={`mb-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
              salesSyncStatus === 'synced'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : salesSyncStatus === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${salesSyncStatus === 'synced' ? 'bg-emerald-500' : salesSyncStatus === 'error' ? 'bg-rose-500' : 'bg-amber-500'}`} />
              {salesSyncStatus === 'synced' ? 'Leído desde Firestore' : salesSyncStatus === 'error' ? 'Servidor no confirmó; puede ser caché' : salesSyncStatus === 'cache' ? 'Copia local; validando Firestore' : 'Consultando Firestore'}
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Historial de ventas</h1>
            <p className="mt-1 text-sm text-slate-500">Consulta boletas, medios de pago y actividad de caja.</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button
              onClick={() => { invalidateSalesCache(currentSede); setRefreshTrigger(k => k + 1); }}
              disabled={loading}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 sm:min-h-11 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
              title="Refrescar ventas bajo demanda"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin text-teal-700' : 'text-slate-500'} />
              <span>Actualizar</span>
            </button>
            <button
              onClick={() => router.push(`/pos/${currentSede}`)}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#087f73] hover:bg-[#06695f] px-2.5 py-2 text-xs font-bold text-white shadow-xs transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 sm:min-h-11 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <ArrowLeft size={16} /> Ir al POS
            </button>
          </div>
        </div>
      </section>

      {/* KPI cards */}
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><div className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 sm:text-xs">Ventas completadas</div><div className="grid h-8 w-8 place-items-center rounded-lg bg-white text-emerald-700"><Wallet size={16} /></div></div>
          <div className="text-lg font-black tracking-tight text-emerald-950 sm:text-xl">{fmtCLP(resumen.totalVentas)}</div>
        </div>
        <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-3.5 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><div className="text-[10px] font-bold uppercase tracking-wide text-teal-800 sm:text-xs">Boletas emitidas</div><div className="grid h-8 w-8 place-items-center rounded-lg bg-white text-teal-700"><FileText size={16} /></div></div>
          <div className="text-lg font-black tracking-tight text-teal-950 sm:text-xl">{resumen.totalBoletas}</div>
        </div>
        <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-3.5 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><div className="text-[10px] font-bold uppercase tracking-wide text-teal-800 sm:text-xs">Ticket promedio</div><div className="grid h-8 w-8 place-items-center rounded-lg bg-white text-teal-700"><TrendingUp size={16} /></div></div>
          <div className="text-lg font-black tracking-tight text-teal-950 sm:text-xl">{fmtCLP(resumen.ticketPromedio)}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><div className="text-[10px] font-bold uppercase tracking-wide text-amber-800 sm:text-xs">Unidades vendidas</div><div className="grid h-8 w-8 place-items-center rounded-lg bg-white text-amber-700"><Receipt size={16} /></div></div>
          <div className="text-lg font-black tracking-tight text-amber-950 sm:text-xl">{resumen.totalItems}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><div className="text-[10px] font-bold uppercase tracking-wide text-rose-800 sm:text-xs">Boletas anuladas</div><div className="grid h-8 w-8 place-items-center rounded-lg bg-white text-rose-700"><Trash2 size={16} /></div></div>
          <div className="text-lg font-black tracking-tight text-rose-950 sm:text-xl">{resumen.anuladas}</div>
        </div>
      </div>

      {/* Secondary panels */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-50 text-teal-700"><TrendingUp size={17} /></div>
              <div><h3 className="text-sm font-bold text-[#405566]">Productos más vendidos</h3><p className="text-[11px] text-slate-500">Por unidades en el período</p></div>
            </div>
          </div>
          <div className="space-y-2">
            {resumen.topProductos.length === 0 ? <div className="rounded-xl bg-slate-50 px-3 py-5 text-center text-xs text-slate-400">Sin registros en este período</div> : resumen.topProductos.map((p, index) => (
              <div key={p.sku} className="flex min-w-0 items-center gap-3 rounded-xl bg-slate-50/80 px-3 py-2.5">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black ${index === 0 ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500'}`}>{index + 1}</span>
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-800">{p.nombre}</div><div className="font-mono text-[10px] text-slate-400">{p.sku}</div></div>
                <div className="shrink-0 text-right"><div className="text-xs font-bold text-[#405566]">{p.cantidad} uds.</div><div className="text-[10px] text-slate-500">{fmtCLP(p.total)}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-50 text-teal-700"><User size={17} /></div>
            <div><h3 className="text-sm font-bold text-[#405566]">Actividad por cajero</h3><p className="text-[11px] text-slate-500">Ventas completadas</p></div>
          </div>
          <div className="space-y-2">
            {resumen.topCajeros.length === 0 ? <div className="rounded-xl bg-slate-50 px-3 py-5 text-center text-xs text-slate-400">Sin registros en este período</div> : resumen.topCajeros.map((c, index) => (
              <div key={c.nombre} className="flex items-center gap-3 rounded-xl bg-slate-50/80 px-3 py-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-xs font-black text-teal-700">{index + 1}</span>
                <div className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{c.nombre}</div>
                <div className="shrink-0 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">{c.ventas} ventas</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Wallet size={17} /></div>
            <div><h3 className="text-sm font-bold text-[#405566]">Medios de pago</h3><p className="text-[11px] text-slate-500">Montos registrados por método</p></div>
          </div>
          <div className="space-y-2">
            {resumen.pagos.length === 0 ? <div className="rounded-xl bg-slate-50 px-3 py-5 text-center text-xs text-slate-400">Sin registros en este período</div> : resumen.pagos.map((p) => (
              <div key={p.metodo} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50/80 px-3 py-2.5 text-xs capitalize">
                <div className="flex min-w-0 items-center gap-2 text-slate-700"><span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><span className="truncate">{p.metodo}</span></div>
                <div className="shrink-0 text-right"><div className="font-bold text-[#405566]">{fmtCLP(p.monto)}</div><div className="text-[10px] text-slate-500">{p.count} pagos</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters (Compact Pro Toolbar) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs space-y-2.5">
        {/* Row 1: Search Input + Date Range + Quick Date Pills + Sales Count */}
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="Buscar por boleta, SKU, producto, cajero o monto…"
              className="w-full h-9 pl-9 pr-8 text-xs rounded-xl border border-slate-200 bg-slate-50/80 text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => { setSearchTerm(''); setPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                title="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
            {/* Integrated Date Range */}
            <div className="inline-flex w-full items-center justify-between gap-1.5 h-8.5 rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 sm:w-auto sm:justify-start">
              <Calendar size={13} className="text-teal-700 shrink-0" />
              <span className="text-[11px] font-semibold text-slate-400">Del</span>
              <input
                aria-label="Fecha desde"
                type="date"
                value={fechaDesde}
                onChange={e => { setFechaDesde(e.target.value); setPage(1); }}
                className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer w-24 sm:w-auto"
              />
              <span className="text-[11px] font-semibold text-slate-400">al</span>
              <input
                aria-label="Fecha hasta"
                type="date"
                value={fechaHasta}
                onChange={e => { setFechaHasta(e.target.value); setPage(1); }}
                className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer w-24 sm:w-auto"
              />
            </div>

            {recentDateFilters.map(day => {
              const selected = fechaDesde === day.value && fechaHasta === day.value;
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => { setFechaDesde(day.value); setFechaHasta(day.value); setPage(1); }}
                  className={`h-8 px-2.5 text-xs font-bold rounded-lg border transition whitespace-nowrap flex-1 sm:flex-none ${
                    selected
                      ? 'border-teal-700 bg-teal-700 text-white shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800'
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => { setFechaDesde(firstOfMonth); setFechaHasta(todayFilter); setPage(1); }}
              className={`h-8 px-2.5 text-xs font-bold rounded-lg border transition whitespace-nowrap flex-1 sm:flex-none ${
                fechaDesde === firstOfMonth && fechaHasta === todayFilter
                  ? 'border-teal-700 bg-teal-700 text-white shadow-xs'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800'
              }`}
            >
              Este mes
            </button>
            <span className="h-8 inline-flex items-center justify-center rounded-lg bg-teal-50 border border-teal-100 px-2.5 text-xs font-black text-teal-800 whitespace-nowrap">
              {filtered.length} {filtered.length === 1 ? 'venta' : 'ventas'}
            </span>
          </div>
        </div>

        {/* Row 2: Estado, Pago y Cajero en 1 SOLA FILA (grid-cols-3) */}
        <div className="flex items-center gap-2 pt-0.5">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 flex-1 min-w-0">
            {/* Select: Estado */}
            <select
              aria-label="Filtrar por estado"
              value={filterEstado}
              onChange={e => { setFilterEstado(e.target.value); setPage(1); }}
              className="w-full h-8.5 min-w-0 truncate cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-1 sm:px-2.5 text-[11px] sm:text-xs font-semibold text-slate-700 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
            >
              <option value="todos">Estado: Todos</option>
              <option value="completada">Completadas</option>
              <option value="anulada">Anuladas</option>
            </select>

            {/* Select: Método de pago */}
            <select
              aria-label="Filtrar por medio de pago"
              value={filterMetodo}
              onChange={e => { setFilterMetodo(e.target.value); setPage(1); }}
              className="w-full h-8.5 min-w-0 truncate cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-1 sm:px-2.5 text-[11px] sm:text-xs font-semibold text-slate-700 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
            >
              <option value="todos">Pago: Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="debito">Débito</option>
              <option value="transferencia">Transferencia</option>
            </select>

            {/* Select: Cajero */}
            <select
              aria-label="Filtrar por cajero"
              id="ventas-cajero"
              value={filterCajero}
              onChange={e => { setFilterCajero(e.target.value); setPage(1); }}
              className="w-full h-8.5 min-w-0 truncate cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-1 sm:px-2.5 text-[11px] sm:text-xs font-semibold text-slate-700 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
            >
              <option value="todos">Cajero: Todos</option>
              {knownCajeros.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Reset Filters button */}
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
              className="inline-flex items-center gap-1 h-8.5 px-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition shrink-0"
              title="Restablecer filtros a hoy"
            >
              <RotateCcw size={12} />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
          )}
        </div>
      </section>

      {/* Pagination toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            Mostrando <strong className="font-bold text-slate-800">{filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}</strong>–<strong className="font-bold text-slate-800">{Math.min(page * pageSize, filtered.length)}</strong> de <strong className="font-bold text-slate-800">{filtered.length}</strong> ventas del período
          </span>
          <div className="inline-flex items-center gap-1.5 ml-0 sm:ml-2 pl-0 sm:pl-3 sm:border-l border-slate-200">
            <span className="text-[11px] text-slate-400 font-semibold">Ver:</span>
            <select
              aria-label="Ventas por página"
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="h-7 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 outline-none cursor-pointer hover:border-teal-300 transition"
            >
              <option value={10}>10 por pág.</option>
              <option value={25}>25 por pág.</option>
              <option value={50}>50 por pág.</option>
              <option value={100}>100 por pág.</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-xs font-semibold text-slate-500">Página {page} de {totalPages || 1}</span>
          <div className="flex gap-2">
            <button
              aria-label="Página anterior"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              aria-label="Página siguiente"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-xl bg-[#087f73] hover:bg-[#06695f] px-3.5 py-2 text-xs font-bold text-white transition shadow-xs disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* Sales list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <RefreshCw size={48} className="animate-spin text-emerald-400 mb-4" />
          <p className="text-sm text-gray-500 font-medium animate-pulse">Cargando ventas...</p>
          <div className="mt-3 w-48 sm:w-64 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full animate-[loadingBar_1.5s_ease-in-out_infinite]" style={{ width: '40%' }} />
          </div>
          <style>{`@keyframes loadingBar { 0%{transform:translateX(-100%)} 50%{transform:translateX(150%)} 100%{transform:translateX(-100%)} }`}</style>
        </div>
      ) : (
        <>
          {/* Mobile: Card view */}
          <div className="space-y-3 md:hidden">
            {paged.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-400">No se encontraron ventas con esos filtros</div>}
            {paged.map(v => {
              const metodos = (v.pagos || []).map(p => p.metodo).join(', ');
              const cantItems = (v.items || []).reduce((s, i) => s + i.cantidad, 0);
              const isAnulada = v.estado === 'anulada';
              return (
                <div key={v.id} className={`rounded-2xl border overflow-hidden shadow-sm transition-all ${isAnulada ? 'bg-rose-50/40 border-rose-200' : 'bg-white border-slate-200 hover:border-teal-200'}`}>
                  <div className="flex items-stretch">
                    <div className={`w-1.5 shrink-0 ${isAnulada ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                    <div className="min-w-0 flex-1 p-3.5">
                      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${isAnulada ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isAnulada ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
                            {isAnulada ? 'Anulada' : 'Completada'}
                          </span>
                          <span className="font-mono text-[10px] text-gray-400">
                            #{v.boletaNumero ? String(v.boletaNumero).padStart(7, '0') : v.id.slice(-6).toUpperCase()}
                          </span>
                        </div>
                        <span className="shrink-0 text-sm font-black text-gray-900">{fmtCLP(v.total)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] text-gray-500">
                        <span className="whitespace-nowrap">{fmtDate(v.fecha, v)} {fmtTime(v.fecha, v)}</span>
                        <span className={`capitalize px-1.5 py-0.5 rounded text-[10px] font-bold border ${(v.pagos?.some(p => p.metodo === 'transferencia') || (v as any).metodoPago === 'transferencia') ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {metodos || (v as any).metodoPago || 'efectivo'}
                        </span>
                        <span className="ml-auto whitespace-nowrap text-gray-400">{cantItems} items</span>
                      </div>
                      <div className="mt-1 truncate text-[11px] font-medium text-gray-500">{v.cajeroNombre}</div>
                      <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-gray-100 pt-3 sm:flex sm:flex-wrap sm:gap-2">
                        <button onClick={() => { setSelectedVenta(v); openVentaReceipt(v); }}
                          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-teal-50 px-2.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-100"><Eye size={13} /> Ver</button>
                        <button onClick={() => openVentaReceipt(v)}
                          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"><Receipt size={13} /> Boleta</button>
                        {canEditBoletas && !isAnulada && (
                          <button onClick={() => openEditPago(v)}
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-teal-50 px-2.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-100"><Edit3 size={13} /> Pago</button>
                        )}
                        {canOperateSales && !isAnulada && (
                          <button onClick={() => openRehacer(v)}
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"><RotateCcw size={13} /> Rehacer</button>
                        )}
                        {canOperateSales && <button onClick={() => { setDeleteTarget(v); setDeletePin(''); setDeletePinError(false); }}
                          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 col-span-2 sm:col-span-1"><Trash2 size={13} /> Eliminar</button>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {totalPages > 1 && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-xs md:hidden">
                <span className="font-semibold text-slate-600">Página {page} de {totalPages}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-bold text-slate-700 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded-lg bg-[#087f73] px-3 py-1.5 font-bold text-white shadow-xs disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Desktop: Table view */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-4 text-left text-[10px] font-extrabold uppercase tracking-[.12em] text-slate-500">Folio</th>
                  <th className="px-5 py-4 text-left text-[10px] font-extrabold uppercase tracking-[.12em] text-slate-500">Fecha y hora</th>
                  <th className="px-5 py-4 text-left text-[10px] font-extrabold uppercase tracking-[.12em] text-slate-500">Forma de pago</th>
                  <th className="px-5 py-4 text-left text-[10px] font-extrabold uppercase tracking-[.12em] text-slate-500">Cajero</th>
                  <th className="px-5 py-4 text-center text-[10px] font-extrabold uppercase tracking-[.12em] text-slate-500">Cant.</th>
                  <th className="px-5 py-4 text-left text-[10px] font-extrabold uppercase tracking-[.12em] text-slate-500">Estado</th>
                  <th className="px-5 py-4 text-right text-[10px] font-extrabold uppercase tracking-[.12em] text-slate-500">Total venta</th>
                  <th className="px-4 py-4"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map(v => {
                  const cantItems = (v.items || []).reduce((s, i) => s + i.cantidad, 0);
                  const fotoCajero = (v.cajeroId && cajeroFotos[`id:${v.cajeroId}`]) || cajeroFotos[`nombre:${normalizeCashierName(v.cajeroNombre)}`];
                  return (
                    <tr key={v.id} className="group transition-colors even:bg-slate-50/35 hover:bg-teal-50/60">
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-700 shadow-sm">
                          <Receipt size={13} className="text-teal-600" />
                          {v.boletaNumero ? String(v.boletaNumero).padStart(7, '0') : v.id.slice(-6).toUpperCase()}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <div className="text-xs font-bold text-slate-800">{fmtDate(v.fecha, v)}</div>
                        <div className="mt-1 text-[11px] font-medium text-slate-500">{fmtTime(v.fecha, v)}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {v.pagos && v.pagos.length > 0 ? (
                          <div className="flex max-w-[230px] flex-wrap items-center gap-1.5">
                            {v.pagos.map((p, i) => {
                              const m = (p.metodo || '').toLowerCase().trim();
                              const badge = m === 'transferencia'
                                ? 'border-teal-200 bg-teal-50 text-teal-800'
                                : m === 'debito'
                                ? 'border-teal-200 bg-teal-50 text-teal-800'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800';
                              return (
                                <span key={i} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold ${badge}`}>
                                  <span className="capitalize">{p.metodo}</span><span className="opacity-80">{fmtCLP(p.monto)}</span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold ${(v as any).metodoPago === 'transferencia' ? 'border-teal-200 bg-teal-50 text-teal-800' : (v as any).metodoPago === 'debito' ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                            <span className="capitalize">{(v as any).metodoPago || 'efectivo'}</span><span className="opacity-80">{fmtCLP(v.total)}</span>
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          {fotoCajero
                            ? <img src={fotoCajero} alt={`Foto de ${v.cajeroNombre}`} className="block h-8 w-8 shrink-0 rounded-full object-cover" />
                            : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500"><User size={15} aria-hidden="true" /></span>}
                          <span className="text-xs font-semibold text-slate-700">{v.cajeroNombre}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex min-w-9 justify-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-700">{cantItems}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-extrabold ${v.estado === 'completada' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-100'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${v.estado === 'completada' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {v.estado === 'completada' ? 'Completada' : 'Anulada'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <span className="font-black tabular-nums text-slate-950">{fmtCLP(v.total)}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setSelectedVenta(v); openVentaReceipt(v); }} className="grid h-8 w-8 place-items-center rounded-lg text-teal-700 transition hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300" title="Ver comprobante interno" aria-label="Ver comprobante interno"><Eye size={16} /></button>
                          <button onClick={() => openVentaReceipt(v)} className="grid h-8 w-8 place-items-center rounded-lg text-emerald-700 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300" title="Reimprimir comprobante interno" aria-label="Reimprimir comprobante interno"><Receipt size={16} /></button>
                          {canEditBoletas && v.estado === 'completada' && (
                            <button onClick={() => openEditPago(v)} className="grid h-8 w-8 place-items-center rounded-lg text-teal-600 transition hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300" title="Editar forma de pago" aria-label="Editar forma de pago"><Edit3 size={16} /></button>
                          )}
                          {canOperateSales && v.estado === 'completada' && (
                            <button onClick={() => openRehacer(v)} className="grid h-8 w-8 place-items-center rounded-lg text-amber-700 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" title="Rehacer venta" aria-label="Rehacer venta"><RotateCcw size={16} /></button>
                          )}
                          {canOperateSales && <button onClick={() => { setDeleteTarget(v); setDeletePin(''); setDeletePinError(false); }} className="grid h-8 w-8 place-items-center rounded-lg text-rose-600 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300" title="Anular venta" aria-label="Eliminar venta"><Trash2 size={16} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paged.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No se encontraron ventas</td></tr>
                )}
              </tbody>
            </table>
            </div>
            {/* Table Footer with pagination */}
            {filtered.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Mostrando <strong className="font-bold text-slate-800">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)}</strong> de <strong className="font-bold text-slate-800">{filtered.length}</strong> ventas del período
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <span className="text-slate-500 font-semibold mr-1">Página {page} de {totalPages}</span>
                    <button
                      type="button"
                      aria-label="Página anterior inferior"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-bold text-slate-700 hover:bg-teal-50 hover:border-teal-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      aria-label="Página siguiente inferior"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="rounded-lg bg-[#087f73] hover:bg-[#06695f] px-3 py-1.5 font-bold text-white transition shadow-xs disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
      </div>

      {/* Detail Modal */}
      {selectedVenta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Detalle de Venta</h2>
              <button onClick={() => setSelectedVenta(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Folio:</span><span className="font-mono text-gray-900">{selectedVenta.id.slice(-8).toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Cajero:</span><span className="text-gray-900">{selectedVenta.cajeroNombre}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Fecha:</span><span className="text-gray-900">{fmtDate(selectedVenta.fecha)} {fmtTime(selectedVenta.fecha)}</span></div>
              <div className="flex justify-between">
                <span className="text-gray-500">Estado:</span>
                <span className={selectedVenta.estado === 'completada' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                  {selectedVenta.estado === 'completada' ? 'Venta Exitosa' : 'Anulada'}
                </span>
              </div>
              <div className="border-t border-gray-200 pt-3">
                <div className="font-semibold text-gray-700 mb-2">Productos:</div>
                {(selectedVenta.items || []).map((it, i) => (
                  <div key={i} className="flex justify-between text-gray-600 py-1">
                    <span>{it.cantidad}x {it.nombre} <span className="text-gray-400 text-xs">({it.sku})</span></span>
                    <span className="font-semibold text-gray-900">{fmtCLP(it.subtotal)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 pt-3">
                <div className="font-semibold text-gray-700 mb-2">Pagos:</div>
                {(selectedVenta.pagos || []).map((p, i) => (
                  <div key={i} className="flex justify-between text-gray-600 py-1 capitalize">
                    <span>{p.metodo}</span><span className="font-semibold text-gray-900">{fmtCLP(p.monto)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between text-lg font-bold">
                <span>Total:</span><span className="text-green-600">{fmtCLP(selectedVenta.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal rehacer venta */}
      {rehacerTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-orange-100 bg-orange-50 shrink-0">
              <div className="flex items-center gap-2"><RotateCcw size={16} className="text-orange-600" /><span className="font-bold text-orange-900 text-sm">Rehacer venta</span></div>
              <button onClick={() => setRehacerTarget(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm">
                <div className="font-bold text-orange-900">Boleta #{rehacerTarget.boletaNumero ? String(rehacerTarget.boletaNumero).padStart(7, '0') : rehacerTarget.id.slice(-6).toUpperCase()}</div>
                <div className="text-xs text-orange-700 mt-0.5">{fmtCLP(rehacerTarget.total)} · {rehacerTarget.cajeroNombre}</div>
                <p className="text-xs text-orange-600 mt-2">La boleta quedara <strong>anulada</strong> con registro y los productos pasaran al POS como borrador.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-2">Motivo de anulacion <span className="text-red-500">*</span></label>
                  <textarea value={rehacerMotivo} onChange={e => setRehacerMotivo(e.target.value)}
                    placeholder="Ej: Error en cantidad, producto equivocado, cambio de metodo de pago..." rows={3} autoFocus
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 resize-none" />
                  {!rehacerMotivo.trim() && <p className="text-xs text-red-500 mt-1">Debes ingresar un motivo</p>}
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
                  <div className="font-semibold text-gray-700 mb-1.5">Productos que pasaran al POS:</div>
                  {(rehacerTarget.items || []).map((it, i) => (
                    <div key={i} className="flex justify-between"><span>{it.cantidad}x {it.nombre}</span><span className="font-semibold">{fmtCLP(it.subtotal)}</span></div>
                  ))}
                </div>
                <button onClick={handleRehacerConfirm} disabled={rehacerSaving || !rehacerMotivo.trim()}
                  className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2">
                  {rehacerSaving ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                  {rehacerSaving ? 'Procesando...' : 'Anular y rehacer en POS'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar boleta */}
      {editTarget && (() => {
        const newItems = (editTarget.items || []).map((it, i) => {
          const qty = Math.max(1, editCantidades[i] ?? it.cantidad);
          const precio = it.precioUnitario || (it.cantidad > 0 ? it.subtotal / it.cantidad : 0);
          return { ...it, cantidad: qty, subtotal: Math.round(precio * qty) };
        });
        const newTotal = newItems.reduce((s, it) => s + it.subtotal, 0);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2"><Edit3 size={16} className="text-teal-600" /><span className="font-bold text-gray-900 text-sm">Editar boleta</span></div>
                <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
                {!editPinOk && !canEditBoletas ? (
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
                      <div className="font-bold text-gray-900">{fmtCLP(editTarget.total)}</div>
                      <div className="text-xs text-gray-500 mt-0.5 capitalize">Pago: {(editTarget.pagos || []).map(p => p.metodo).join(' + ')}</div>
                    </div>
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">PIN de autorizacion</label>
                    <input type="password" value={editPin}
                      onChange={e => { setEditPin(e.target.value); setEditPinError(false); }}
                      onKeyDown={e => e.key === 'Enter' && handleEditPin()}
                      placeholder="••••••••••" autoFocus
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm text-center font-mono tracking-widest focus:outline-none focus:ring-2 ${editPinError ? 'border-red-400 ring-red-100 text-red-600' : 'border-gray-200 focus:ring-teal-100 focus:border-teal-400'}`} />
                    {editPinError && <p className="text-xs text-red-600 text-center font-medium">PIN incorrecto</p>}
                    <button onClick={handleEditPin} className="w-full py-2.5 bg-[#087f73] hover:bg-teal-700 text-white rounded-xl text-sm font-bold transition">Confirmar PIN</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label className="block text-xs font-semibold text-gray-600">Motivo de la edición · obligatorio<textarea value={editReason} onChange={e => setEditReason(e.target.value)} maxLength={500} rows={2} placeholder="Explica por qué se modifica esta boleta" className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-teal-500" /></label>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-2">Cantidades</label>
                      <div className="space-y-2">
                        {(editTarget.items || []).map((it, i) => (
                          <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-gray-800 truncate">{it.nombre}</div>
                              <div className="text-[10px] text-gray-400">{it.sku} · {fmtCLP(it.precioUnitario || 0)} c/u</div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button onClick={() => setEditCantidades(prev => prev.map((q, j) => j === i ? Math.max(1, q - 1) : q))}
                                className="w-7 h-7 rounded-lg bg-white border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-sm font-bold">−</button>
                              <input type="number" min={1} value={editCantidades[i] ?? it.cantidad}
                                onChange={e => setEditCantidades(prev => prev.map((q, j) => j === i ? Math.max(1, Number(e.target.value) || 1) : q))}
                                className="w-10 text-center border border-gray-300 rounded-lg py-1 text-sm font-bold" />
                              <button onClick={() => setEditCantidades(prev => prev.map((q, j) => j === i ? q + 1 : q))}
                                className="w-7 h-7 rounded-lg bg-white border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-sm font-bold">+</button>
                            </div>
                            <div className="text-xs font-bold text-gray-900 w-16 text-right shrink-0">
                              {fmtCLP(Math.round((it.precioUnitario || (it.cantidad > 0 ? it.subtotal / it.cantidad : 0)) * (editCantidades[i] ?? it.cantidad)))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between text-sm font-bold text-gray-900 mt-2 pt-2 border-t border-gray-200">
                        <span>Nuevo total:</span><span className="text-teal-700">{fmtCLP(newTotal)}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-2">Metodo de pago</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['efectivo', 'debito', 'transferencia'] as MetodoPago[]).map(m => (
                          <button key={m} onClick={() => setEditMetodo(m)}
                            className={`py-2 rounded-xl text-xs font-bold border-2 transition ${editMetodo === m ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                            {m === 'efectivo' ? 'Efectivo' : m === 'debito' ? 'Debito' : 'Transfer'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-2">Cajero/a Responsable</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                        {['Paola', 'Fernanda', 'Lissy', 'Daniel'].map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => { setEditCajero(c); setIsCustomCajero(false); }}
                            className={`py-2 px-2 rounded-xl text-xs font-bold border-2 transition text-center ${
                              editCajero === c && !isCustomCajero
                                ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
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
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 cursor-pointer bg-white"
                      >
                        <option value="" disabled>O selecciona de la lista...</option>
                        {knownCajeros.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="__otro__">✏️ Escribir otro nombre...</option>
                      </select>
                      {isCustomCajero && (
                        <input
                          type="text"
                          value={editCajero}
                          onChange={e => setEditCajero(e.target.value)}
                          placeholder="Nombre del cajero/a"
                          className="w-full mt-2 border border-teal-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 bg-teal-50"
                          autoFocus
                        />
                      )}
                    </div>
                    <button onClick={handleEditSave} disabled={editSaving || !editReason.trim()}
                      className="w-full py-2.5 bg-[#087f73] hover:bg-teal-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2">
                      {editSaving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      {editSaving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal eliminar con PIN */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0"><ShieldAlert size={20} className="text-red-600" /></div>
              <div>
                <div className="font-bold text-gray-900 text-base">Eliminar venta</div>
                <div className="text-xs text-gray-500">Esta accion es permanente e irreversible</div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm space-y-1 border border-gray-200">
              <div className="flex justify-between"><span className="text-gray-500">Boleta N°</span><span className="font-mono font-semibold text-gray-900">{deleteTarget.boletaNumero ? String(deleteTarget.boletaNumero).padStart(7, '0') : deleteTarget.id.slice(-8).toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-bold text-red-600">{fmtCLP(deleteTarget.total)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Cajero</span><span className="text-gray-900">{deleteTarget.cajeroNombre}</span></div>
            </div>
            {canEditBoletas ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-xs font-bold text-emerald-800 flex items-center gap-2">
                <Check size={16} className="text-emerald-600 shrink-0" />
                <span>Autorizado como {isSupreme ? 'Administrador' : 'Cajera (Permiso Alto)'} — no requiere PIN.</span>
              </div>
            ) : (
              <>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Ingresa el PIN de autorizacion</label>
                <input type="password" value={deletePin}
                  onChange={e => { setDeletePin(e.target.value); setDeletePinError(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleDeleteConfirm(); }}
                  placeholder="••••••••••" autoFocus
                  className={`w-full border rounded-xl px-4 py-3 text-center text-lg font-bold tracking-widest focus:outline-none focus:ring-2 ${deletePinError ? 'border-red-400 focus:ring-red-100 bg-red-50 text-red-700' : 'border-gray-300 focus:ring-teal-100 focus:border-teal-400'}`} />
                {deletePinError && <p className="text-red-600 text-xs mt-1.5 text-center font-medium">PIN incorrecto. Intentalo de nuevo.</p>}
              </>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setDeleteTarget(null); setDeletePin(''); setDeletePinError(false); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium transition">Cancelar</button>
              <button onClick={handleDeleteConfirm} disabled={deleting || (!canEditBoletas && deletePin.length === 0)}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Eliminar permanentemente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
