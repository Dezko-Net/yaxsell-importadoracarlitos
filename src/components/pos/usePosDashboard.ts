'use client';
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { authReady, db } from '@/lib/firebase';
import { fetchAllFirebaseErpProducts, type FirebaseErpProduct } from '@/lib/firebaseErpService';
import { useLiveDataVisibility } from '@/hooks/useLiveDataVisibility';

type SaleItem = {
  sku?: string;
  nombre?: string;
  cantidad?: number;
  subtotal?: number;
  precioUnitario?: number;
};

type SalePayment = { metodo?: string; monto?: number };

type DashboardSale = {
  id: string;
  estado: string;
  total: number;
  cajeroNombre: string;
  boletaNumero?: number;
  tipoComprobante: string;
  vuelto: number;
  fechaTs: number;
  metodoPago?: string;
  items: SaleItem[];
  pagos: SalePayment[];
};

export type DashboardManualClose = {
  totalBruto: number;
  efectivoSistema: number;
  efectivoReal: number;
  transferencias: number;
  gastosTotales: number;
  devolucionesTotal: number;
  cashiers: Array<{ nombre: string; efectivo: number; transferencia: number; total: number }>;
};

export const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n || 0));

export const fmtCount = (n: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n || 0);

const chileDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

function parseArray(value: unknown, jsonValue: unknown): any[] {
  const objectsOnly = (items: unknown[]) => items.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item));
  if (Array.isArray(value) && value.length > 0) return objectsOnly(value);
  if (typeof jsonValue === 'string') {
    try {
      const parsed = JSON.parse(jsonValue);
      return Array.isArray(parsed) ? objectsOnly(parsed) : [];
    } catch {}
  }
  if (Array.isArray(value)) return objectsOnly(value);
  return [];
}

function timestampMs(value: any): number {
  try {
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
  } catch {}
  if (Number(value?.seconds) > 0) return Number(value.seconds) * 1000;
  return Number(value) || 0;
}

function objectValue(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {}
  }
  return {};
}

function storedRows(value: unknown, jsonValue: unknown): Record<string, any>[] {
  if (Array.isArray(value)) return value.filter(row => row && typeof row === 'object' && !Array.isArray(row)) as Record<string, any>[];
  if (typeof jsonValue === 'string') {
    try {
      const parsed = JSON.parse(jsonValue);
      return Array.isArray(parsed) ? parsed.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
    } catch {}
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
    } catch {}
  }
  return [];
}

function normalizeManualClose(data: Record<string, any>): DashboardManualClose {
  const montos = objectValue(data.montos);
  const calculos = objectValue(data.calculos);
  const cashierValues = objectValue(data.montosPorCajera);
  const cashierNames = Array.isArray(data.cajerosListos)
    ? data.cajerosListos.map((name: unknown) => String(name || '').trim()).filter(Boolean)
    : Object.keys(cashierValues);
  const cashiers = [...new Set([...cashierNames, ...Object.keys(cashierValues)])].map(nombre => {
    const row = objectValue(cashierValues[nombre]);
    const efectivo = Number(row.efectivoReal ?? row.efectivo ?? row.efectivoRecibido) || 0;
    const transferencia = Number(row.transferencia ?? row.transferencias) || 0;
    const total = Number(row.totalBruto) || efectivo + transferencia + (Number(row.debito) || 0);
    return { nombre, efectivo, transferencia, total };
  });
  const efectivoSistema = Number(data.efectivoSistema ?? montos.efectivoSistema) || 0;
  const transferencias = Number(data.transferencias ?? montos.transferencias) || 0;
  const debitoSistema = Number(data.debitoSistema ?? montos.debitoSistema) || 0;
  const gastosTotales = storedRows(data.gastos, data.gastosJson).reduce((sum, row) => sum + Math.max(0, Number(row.monto) || 0), 0);
  const devolucionesTotal = storedRows(data.devoluciones, data.devolucionesJson).reduce((sum, row) => sum + Math.max(0, Number(row.monto) || 0), 0);
  const totalBruto = Number(data.totalBruto ?? calculos.totalBruto) || efectivoSistema + debitoSistema + transferencias;

  return {
    totalBruto,
    efectivoSistema,
    efectivoReal: Number(data.efectivoReal ?? montos.efectivoReal) || 0,
    transferencias,
    gastosTotales,
    devolucionesTotal,
    cashiers,
  };
}

export function usePosDashboard(sedeSlug: string) {
  const liveDataVisible = useLiveDataVisibility();
  const [retry, setRetry] = useState(0);
  const [fromCache, setFromCache] = useState(true);
  const [catalogRequested, setCatalogRequested] = useState(false);
  const [todayKey, setTodayKey] = useState(chileDateKey);
  const [todaySales, setTodaySales] = useState<DashboardSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState(false);
  const [manualClose, setManualClose] = useState<DashboardManualClose | null>(null);
  const [manualCloseLoading, setManualCloseLoading] = useState(true);
  const [manualCloseError, setManualCloseError] = useState(false);
  const [products, setProducts] = useState<FirebaseErpProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setTodayKey(chileDateKey()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!liveDataVisible) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setTodaySales([]);
    setSalesLoading(true);
    setSalesError(false);

    void (async () => {
      try {
        await authReady;
        if (!active) return;
        if (!db) throw new Error('Firebase no está disponible.');

        const salesQuery = query(
          collection(db, 'ventas_pos'),
          where('sede', '==', sedeSlug),
          where('fechaStr', '==', todayKey),
        );
        unsubscribe = onSnapshot(salesQuery, { includeMetadataChanges: true }, snapshot => {
          if (!active) return;
          const rows = snapshot.docs.map(document => {
            const data = document.data() as any;
            const items = parseArray(data.items, data.itemsJson) as SaleItem[];
            let pagos = parseArray(data.pagos, data.pagosJson) as SalePayment[];
            const total = Number(data.total) || 0;
            const metodoPago = String(data.metodoPago || (data.debitoOrdenNumero ? 'debito' : 'sin_detalle')).toLowerCase();
            if (pagos.length === 0 && total > 0) pagos = [{ metodo: metodoPago, monto: total }];

            return {
              id: document.id,
              estado: String(data.estado || 'completada').toLowerCase(),
              total,
              vuelto: Math.max(0, Number(data.vuelto) || 0),
              tipoComprobante: String(data.tipoComprobante || (data.boletaNumero ? "boleta" : "comprobante")),
              cajeroNombre: String(data.cajeroNombre || data.cajeraNombre || 'Cajero/a'),
              boletaNumero: Number(data.boletaNumero) || undefined,
              fechaTs: timestampMs(data.fecha) || Number(data.fechaTs) || Number(data.createdAtTs) || 0,
              metodoPago,
              items,
              pagos,
            } satisfies DashboardSale;
          });
          rows.sort((a, b) => b.fechaTs - a.fechaTs);
          setFromCache(snapshot.metadata.fromCache);
          setTodaySales(rows);
          setSalesLoading(false);
          setSalesError(false);
        }, error => {
          console.error('[pos-admin] No se pudieron cargar las ventas de hoy:', error);
          if (active) {
            setSalesError(true);
            setSalesLoading(false);
          }
        });
      } catch (error) {
        console.error('[pos-admin] No se pudo iniciar el resumen de ventas:', error);
        if (active) {
          setSalesError(true);
          setSalesLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [sedeSlug, todayKey, retry, liveDataVisible]);

  useEffect(() => {
    if (!liveDataVisible) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setManualClose(null);
    setManualCloseLoading(true);
    setManualCloseError(false);

    void (async () => {
      try {
        await authReady;
        if (!active) return;
        if (!db) throw new Error('Firebase no está disponible.');

        const closeRef = doc(db, 'cuadres_erp', `${sedeSlug}__${todayKey}`);
        unsubscribe = onSnapshot(closeRef, { includeMetadataChanges: true }, snapshot => {
          if (!active) return;
          setManualClose(snapshot.exists() ? normalizeManualClose(snapshot.data()) : null);
          setManualCloseLoading(false);
          setManualCloseError(false);
        }, error => {
          console.error('[pos-admin] No se pudo cargar el cierre manual de hoy:', error);
          if (active) {
            setManualCloseError(true);
            setManualCloseLoading(false);
          }
        });
      } catch (error) {
        console.error('[pos-admin] No se pudo iniciar la consulta del cierre manual:', error);
        if (active) {
          setManualCloseError(true);
          setManualCloseLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [sedeSlug, todayKey, retry, liveDataVisible]);

  useEffect(() => {
    if (!catalogRequested) return;
    let active = true;
    setCatalogLoading(true);
    setCatalogError(false);
    fetchAllFirebaseErpProducts()
      .then(result => {
        if (!active) return;
        setProducts(Array.isArray(result) ? result : []);
        setCatalogLoading(false);
      })
      .catch(error => {
        console.error('[pos-admin] No se pudo cargar el catálogo:', error);
        if (active) {
          setCatalogError(true);
          setCatalogLoading(false);
        }
      });
    return () => { active = false; };
  }, [catalogRequested, retry]);

  const summary = useMemo(() => {
    const completed = todaySales.filter(sale => sale.estado === 'completada');
    const annulled = todaySales.filter(sale => sale.estado === 'anulada');
    const totalSales = completed.reduce((sum, sale) => sum + Math.max(0, sale.total), 0);
    const unitsSold = completed.reduce((sum, sale) => sum + sale.items.reduce((count, item) => count + Math.max(0, Number(item.cantidad) || 0), 0), 0);
    const payments = { efectivo: 0, debito: 0, transferencia: 0, otros: 0 };
    const productMap = new Map<string, { nombre: string; cantidad: number; ventas: number }>();

    let paymentMismatchCount = 0;
    completed.forEach(sale => {
      // Normal cash payments already store the sale total. Split payments can
      // store tendered cash: subtract only the evidenced excess, once per sale.
      const paid = sale.pagos.reduce((sum, p) => sum + Math.max(0, Number(p.monto) || 0), 0);
      let changeRemaining = Math.min(sale.vuelto, Math.max(0, paid - sale.total));
      let allocated = 0;
      sale.pagos.forEach(payment => {
        const method = String(payment.metodo || sale.metodoPago || 'otros').toLowerCase();
        const key = method.includes('efectivo') ? 'efectivo'
          : method.includes('debit') ? 'debito'
          : method.includes('transfer') ? 'transferencia'
          : 'otros';
        let amount = Math.max(0, Number(payment.monto) || 0);
        if (key === 'efectivo') {
          const change = Math.min(amount, changeRemaining);
          amount -= change;
          changeRemaining -= change;
        }
        payments[key] += amount;
        allocated += amount;
      });

      if (Math.abs(allocated - sale.total) > 1) paymentMismatchCount += 1;
      sale.items.forEach(item => {
        const nombre = String(item.nombre || item.sku || 'Producto sin nombre');
        const sku = String(item.sku || '').trim();
        const key = sku || nombre.toLocaleLowerCase('es-CL');
        const cantidad = Math.max(0, Number(item.cantidad) || 0);
        const subtotal = Number(item.subtotal);
        const ventas = subtotal > 0 ? subtotal : cantidad * (Number(item.precioUnitario) || 0);
        const current = productMap.get(key) || { nombre, cantidad: 0, ventas: 0 };
        current.cantidad += cantidad;
        current.ventas += ventas;
        productMap.set(key, current);
      });
    });

    const bestSellers = [...productMap.values()]
      .sort((a, b) => b.cantidad - a.cantidad || b.ventas - a.ventas)
      .slice(0, 4);

    return {
      completed,
      annulled,
      totalSales,
      tickets: completed.length,
      averageTicket: completed.length > 0 ? totalSales / completed.length : 0,
      unitsSold,
      payments,
      bestSellers,
      recentSales: todaySales.slice(0, 6),
      pending: todaySales.filter(sale => sale.estado === "pre_venta"),
      paymentMismatchCount,
    };
  }, [todaySales]);

  const catalogStats = useMemo(() => {
    const totalCount = products.length;
    const inStock = products.filter(product => Number(product.stock) > 0).length;
    const outOfStock = products.filter(product => Number(product.stock) <= 0).length;
    const negativeStock = products.filter(product => Number(product.stock) < 0).length;
    return { totalCount, inStock, outOfStock, negativeStock };
  }, [products]);

  return { summary, salesLoading, salesError, fromCache, todayKey, manualClose, manualCloseLoading, manualCloseError, catalogStats, catalogLoading, catalogError, catalogRequested,
    retrySales: () => setRetry(value => value + 1), requestCatalog: () => setCatalogRequested(true) };
}
