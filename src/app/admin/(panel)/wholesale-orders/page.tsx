'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Query } from '@/lib/db';
import { MODULE_ACCESS } from '@/lib/module-access';
import { getServices, getFirebaseConfig, WHOLESALE_ORDERS_COLLECTION_ID, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import {
  RefreshCw, AlertTriangle, Search, X, Package, Save, Download, Eye,
  ArrowUpDown, ArrowUp, ArrowDown, MapPin, Calendar, Copy, Image as ImageIcon, Loader2, Printer
} from 'lucide-react';
import { getWarehouseLocationFromFeatures } from '@/lib/product-features';
import EpicPagination from '@/components/admin/EpicPagination';

interface WholesaleOrder {
  $id: string;
  USERID: string;
  ITEMS: string; // JSON string of items
  CUSTOMERNAME: string;
  CUSTOMERRUT?: string;
  CUSTOMERPHONE: string;
  CUSTOMEREMAIL: string;
  REGION?: string;
  COMUNA?: string;
  ADDRESS: string;
  ADDITIONALINFO?: string;
  SHIPPINGAGENCY?: string;
  SUBTOTAL: number;
  TOTAL: number;
  REQCODE: string;
  STATUS: string;
  CREATEDAT: number;
  PAYMENTPROOFURL?: string;
  CUSTOMERNOTE?: string;
  ADMINNOTES?: string;
  $createdAt: string;
  $updatedAt: string;
}

// Flujo principal del pedido; negotiation / cancelled son ramas laterales
const STATUS_FLOW = ['pending', 'paid', 'payment_review', 'payment_confirmed', 'shipped', 'delivered'];

const STATUS_SVG: Record<string, React.ReactNode> = {
  pending:            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/></svg>,
  paid:               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path d="M9 11.5l2 2 4-4"/></svg>,
  payment_review:     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21z"/><path d="M9 8h6M9 12h4"/></svg>,
  payment_confirmed:  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-5"/></svg>,
  negotiation:        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H8l-4 3V5a2 2 0 012-2h13a2 2 0 012 2z"/><path d="M8.5 10h.01M12 10h.01M15.5 10h.01"/></svg>,
  shipped:            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4h13v11H1z"/><path d="M14 8h4l3 3v4h-7z"/><circle cx="5.5" cy="18" r="2"/><circle cx="18.5" cy="18" r="2"/></svg>,
  delivered:          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V8l9-5 9 5v13"/><path d="M3 21h18"/><path d="M9 21v-7h6v7"/></svg>,
  cancelled:          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
};

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  pending:            { color: '#10b981', bg: '#ecfdf5' },
  paid:               { color: '#10b981', bg: '#ecfdf5' },
  payment_review:     { color: '#2563eb', bg: '#eff6ff' },
  payment_confirmed:  { color: '#059669', bg: '#d1fae5' },
  negotiation:        { color: '#ec4899', bg: '#fdf2f8' },
  shipped:            { color: '#8b5cf6', bg: '#f5f3ff' },
  delivered:          { color: '#22c55e', bg: '#f0fdf4' },
  cancelled:          { color: '#ef4444', bg: '#fef2f2' },
};

const PAGE_SIZE = 10;

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  all:                { label: 'Todos',                bg: 'bg-gray-100',    text: 'text-gray-700' },
  paid_group:         { label: 'Confirmados',          bg: 'bg-green-100',   text: 'text-green-700' },
  pending:            { label: 'Stock Confirmado',     bg: 'bg-emerald-100', text: 'text-emerald-700' },
  paid:               { label: 'Stock Confirmado',  bg: 'bg-emerald-100', text: 'text-emerald-700' },
  payment_review:     { label: 'Revisando Pago',      bg: 'bg-blue-100',    text: 'text-blue-700' },
  payment_confirmed:  { label: 'Pago Confirmado',   bg: 'bg-green-100',   text: 'text-green-700' },
  negotiation:        { label: 'Negociando',           bg: 'bg-pink-100',    text: 'text-pink-700' },
  shipped:            { label: 'Embalado',         bg: 'bg-violet-100',  text: 'text-violet-700' },
  delivered:          { label: 'Entregado a Agencia', bg: 'bg-green-100',   text: 'text-green-700' },
  cancelled:          { label: 'Cancelado',            bg: 'bg-red-100',     text: 'text-red-700' },
};

const SHORT_LABEL: Record<string, string> = {
  pending:            'Stock Conf.',
  paid:               'Stock Conf.',
  payment_review:     'Rev. Pago',
  payment_confirmed:  'Pago Conf.',
  negotiation:        'Negociando',
  shipped:            'Embalado',
  delivered:          'Entregado',
  cancelled:          'Cancelado',
};

const PAID_GROUP_STATUSES = ['pending', 'paid', 'payment_review', 'payment_confirmed', 'shipped', 'delivered'];
const ALL_STATUS_KEYS = STATUS_FLOW.concat(['negotiation', 'cancelled']);

const STATUS_DESC: Record<string, string> = {
  pending:            'El stock del pedido fue confirmado. Pendiente de pago.',
  pending_stock:      'El stock del pedido fue confirmado. Pendiente de pago.',
  processing:         'El stock del pedido fue confirmado. Pendiente de pago.',
  paid:               'El stock del pedido fue confirmado. Pendiente de pago.',
  payment_review:     'Se recibió el comprobante de pago, hay que verificarlo.',
  payment_confirmed:  'El pago fue confirmado y verificado correctamente.',
  negotiation:        'Faltan productos, se está negociando con el cliente.',
  shipped:            'El pedido fue embalado y está listo para la agencia.',
  delivered:          'El pedido fue entregado a la agencia de transporte.',
  cancelled:          'El pedido fue cancelado.',
};

type DateFilter = 'all' | 'today' | 'yesterday' | 'day_before' | 'custom';
const DATE_FILTER_LABELS: Record<DateFilter, string> = { all: 'Todos', today: 'Hoy', yesterday: 'Ayer', day_before: 'Anteayer', custom: 'Rango' };

function formatPrice(val: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val);
}

function formatDate(ts: number | string) {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function WholesaleOrdersPage() {
  const [orders, setOrders] = useState<WholesaleOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'total'>('date');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [proofOnly, setProofOnly] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [timelineOrderId, setTimelineOrderId] = useState<string | null>(null);
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [productLocations, setProductLocations] = useState<Record<string, { section: number | null; gondola: string | null }>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDateStart, setExportDateStart] = useState('');
  const [exportDateEnd, setExportDateEnd] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  // Admin notes editing state
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const queries = [Query.orderDesc('$createdAt'), Query.limit(100)];

      const resp = await databases.listDocuments(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, queries);
      const ordersData = resp.documents as unknown as WholesaleOrder[];

      // Enrich items with SKU and barcode if missing (for orders created before the fix)
      const allItems = ordersData.flatMap(o => {
        const parsed = parseItems(o.ITEMS);
        return parsed.filter((it: any) => it.id && (!it.sku || !it.barcode));
      });
      const productIds = [...new Set(allItems.map((it: any) => it.id))];
      const productMap: Record<string, any> = {};
      if (productIds.length > 0) {
        try {
          const cachedProds = typeof window !== 'undefined' ? sessionStorage.getItem('carlitos_admin_products_all_v1') : null;
          if (cachedProds) {
            const parsed = JSON.parse(cachedProds);
            if (Array.isArray(parsed.products)) {
              for (const p of parsed.products) {
                productMap[p.$id] = p;
              }
            }
          }
        } catch (e) {
          console.warn('Error reading cached products for SKU enrichment:', e);
        }
      }
      const enrichedOrders = ordersData.map(o => {
        const parsed = parseItems(o.ITEMS);
        let changed = false;
        const enrichedItems = parsed.map((it: any) => {
          if ((!it.sku || !it.barcode) && productMap[it.id]) {
            const p = productMap[it.id];
            changed = true;
            return {
              ...it,
              sku: it.sku || p.SKU || p.sku || '',
              barcode: it.barcode || p.BARCODE || p.barcode || '',
            };
          }
          return it;
        });
        return changed ? { ...o, ITEMS: JSON.stringify(enrichedItems) } : o;
      });

      setOrders(enrichedOrders);
    } catch (e: any) {
      setError('Error al cargar pedidos: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, id, { STATUS: status });
      setOrders(prev => prev.map(o => o.$id === id ? { ...o, STATUS: status } : o));
    } catch (e: any) {
      alert('Error al actualizar estado: ' + e.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleSelect = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => setSelected(s => s.size === filtered.length ? new Set() : new Set(filtered.map(o => o.$id)));

  const bulkUpdateStatus = async (newStatus: string) => {
    if (selected.size === 0) return;
    setBulkUpdating(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const selectedOrders = orders.filter(o => selected.has(o.$id));
      await Promise.all(selectedOrders.map(o =>
        databases.updateDocument(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, o.$id, { STATUS: newStatus })
      ));
      setOrders(prev => prev.map(o => selected.has(o.$id) ? { ...o, STATUS: newStatus } : o));
      setSelected(new Set());
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setBulkUpdating(false); }
  };

  const saveAdminNotes = async (id: string) => {
    setSavingNotes(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, WHOLESALE_ORDERS_COLLECTION_ID, id, { ADMINNOTES: notesDraft });
      setOrders(prev => prev.map(o => o.$id === id ? { ...o, ADMINNOTES: notesDraft } : o));
      setEditingNotesId(null);
    } catch (e: any) {
      alert('Error al guardar notas: ' + e.message);
    } finally {
      setSavingNotes(false);
    }
  };

  const downloadOrderPrint = (order: WholesaleOrder) => {
    const items = parseItems(order.ITEMS);
    const cfg = STATUS_CONFIG[order.STATUS] || { label: order.STATUS };
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Pedido ${order.REQCODE}</title>
      <style>
        * { font-family: 'Inter', system-ui, sans-serif; box-sizing: border-box; }
        body { margin: 0; padding: 32px; color: #1f2937; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        h2 { font-size: 14px; margin: 24px 0 8px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 16px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #fef3c7; color: #92400e; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .info-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; }
        .info-card p { margin: 2px 0; font-size: 13px; }
        .info-card .label { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { text-align: left; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; padding: 8px 10px; border-bottom: 2px solid #e5e7eb; }
        td { padding: 10px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
        .total-row { font-weight: 800; font-size: 16px; }
        .total-row td { border-top: 2px solid #e5e7eb; border-bottom: none; padding-top: 12px; }
        .notes { background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 14px; margin-top: 16px; font-size: 13px; }
        .print-btn { position: fixed; bottom: 24px; right: 24px; padding: 12px 24px; background: #4f46e5; color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        .check-col { width: 32px; text-align: center; }
        @media print { .print-btn { display: none; } body { padding: 16px; } }
      </style>
      </head><body>
      <div class="header">
        <div>
          <h1>Pedido Mayorista #${order.REQCODE}</h1>
          <p style="font-size:13px;color:#6b7280;margin:4px 0 0">${formatDate(order.CREATEDAT)}</p>
        </div>
        <div style="text-align:right">
          <span class="badge">${cfg.label}</span>
          <p style="font-size:20px;font-weight:800;margin:8px 0 0">${formatPrice(order.TOTAL)}</p>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-card">
          <p class="label">Cliente</p>
          <p style="font-weight:700;font-size:15px">${order.CUSTOMERNAME}</p>
          ${order.CUSTOMERRUT ? `<p>RUT: ${order.CUSTOMERRUT}</p>` : ''}
          <p>${order.CUSTOMEREMAIL}</p>
          <p>📱 ${order.CUSTOMERPHONE}</p>
        </div>
        <div class="info-card">
          <p class="label">Envío</p>
          <p>${order.ADDRESS}</p>
          ${order.COMUNA ? `<p>${order.COMUNA}${order.REGION ? ', ' + order.REGION : ''}</p>` : ''}
          ${order.SHIPPINGAGENCY ? `<p style="font-weight:700;color:#4f46e5">Agencia: ${order.SHIPPINGAGENCY}</p>` : ''}
          ${order.ADDITIONALINFO ? `<p style="color:#6b7280;font-size:12px;margin-top:6px"><em>Indicaciones: ${order.ADDITIONALINFO}</em></p>` : ''}
        </div>
      </div>

      <h2>Productos a Verificar (${items.length})</h2>
      <table>
        <thead>
          <tr>
            <th class="check-col">✓</th>
            <th>Producto</th>
            <th>SKU</th>
            <th>Código de Barras</th>
            <th style="text-align:center">Cant.</th>
            <th style="text-align:right">Precio</th>
            <th style="text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it: any) => `
            <tr>
              <td class="check-col" style="border:2px solid #d1d5db;border-radius:4px;height:24px"></td>
              <td style="display:flex;align-items:center;gap:10px">
                ${it.img ? `<img src="${it.img}" alt="${it.name}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb" />` : '<div style="width:48px;height:48px;background:#f3f4f6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px">📦</div>'}
                <div>
                  <p style="font-weight:600;margin:0">${it.name}</p>
                  ${it.isPack ? `<span style="font-size:11px;color:#7c3aed;font-weight:700">Paquete de ${it.packQty || 1} un.</span>` : ''}
                </div>
              </td>
              <td style="font-family:monospace;font-size:12px;font-weight:700">${it.sku || '-'}</td>
              <td style="font-family:monospace;font-size:12px">${it.barcode || '-'}</td>
              <td style="text-align:center;font-weight:700;font-size:15px">${it.qty}</td>
              <td style="text-align:right">${formatPrice(it.price)}</td>
              <td style="text-align:right;font-weight:700">${formatPrice(it.total)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="6" style="text-align:right">TOTAL</td>
            <td style="text-align:right">${formatPrice(order.TOTAL)}</td>
          </tr>
        </tbody>
      </table>

      ${order.CUSTOMERNOTE ? `<div class="notes"><strong>Nota del cliente:</strong> ${order.CUSTOMERNOTE}</div>` : ''}
      ${order.ADMINNOTES ? `<div class="notes" style="background:#eff6ff;border-color:#bfdbfe"><strong>Notas admin:</strong> ${order.ADMINNOTES}</div>` : ''}

      <button class="print-btn" onclick="window.print()">🖨️ Imprimir / PDF</button>
      </body></html>
    `);
    win.document.close();
  };

  const exportOrdersImage = async () => {
    setExportLoading(true);
    try {
      const nowCLT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
      const todayStr = nowCLT.toISOString().slice(0, 10);
      const yesterday = new Date(nowCLT.getTime() - 86400000);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      const startDateStr = exportDateStart || yesterdayStr;
      const endDateStr = exportDateEnd || todayStr;

      const startTs = new Date(startDateStr + 'T00:00:00-03:00').getTime();
      const endTs = new Date(endDateStr + 'T23:59:59-03:00').getTime();

      const exportOrders = orders.filter((o) => {
        if (['pending', 'cancelled', 'negotiation'].includes(o.STATUS)) return false;
        const ts = o.CREATEDAT || new Date(o.$createdAt).getTime();
        return ts >= startTs && ts <= endTs;
      });

      if (exportOrders.length === 0) {
        alert('No hay pedidos mayoristas para exportar en el rango seleccionado.');
        return;
      }

      const W = 800;
      const rowH = 40;
      const headerH = 120;
      const footerH = 60;
      const tableHeaderH = 36;
      const H = headerH + tableHeaderH + exportOrders.length * rowH + footerH;

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#6366f1');
      grad.addColorStop(1, '#8b5cf6');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, headerH);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('Resumen de Pedidos Mayoristas', 24, 40);

      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const rangeLabel = `${new Date(startTs).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })} — ${new Date(endTs).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}`;
      ctx.fillText(rangeLabel, 24, 64);

      const totalSum = exportOrders.reduce((s: number, o: any) => s + (o.TOTAL || 0), 0);
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${exportOrders.length} pedidos · Total: ${formatPrice(totalSum)}`, 24, 92);

      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, headerH, W, tableHeaderH);
      ctx.fillStyle = '#374151';
      ctx.font = 'bold 12px sans-serif';
      const cols = [
        { label: 'Código', x: 24, w: 120 },
        { label: 'Cliente', x: 154, w: 200 },
        { label: 'Estado', x: 364, w: 140 },
        { label: 'Agencia', x: 514, w: 100 },
        { label: 'Total', x: 624, w: 150 },
      ];
      cols.forEach(c => { ctx.fillText(c.label, c.x, headerH + 23); });

      ctx.strokeStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(0, headerH + tableHeaderH);
      ctx.lineTo(W, headerH + tableHeaderH);
      ctx.stroke();

      ctx.font = '12px sans-serif';
      exportOrders.forEach((o: any, i: number) => {
        const y = headerH + tableHeaderH + i * rowH;
        if (i % 2 === 0) {
          ctx.fillStyle = '#fafafa';
          ctx.fillRect(0, y, W, rowH);
        }
        ctx.fillStyle = '#111827';
        ctx.fillText(('#' + (o.REQCODE || '')).slice(0, 14), cols[0].x, y + 25);
        ctx.fillText((o.CUSTOMERNAME || '').slice(0, 28), cols[1].x, y + 25);

        const stCfg = STATUS_CONFIG[o.STATUS] || { label: o.STATUS };
        ctx.fillStyle = STATUS_COLORS[o.STATUS]?.color || '#6b7280';
        ctx.fillText(stCfg.label.slice(0, 18), cols[2].x, y + 25);

        ctx.fillStyle = '#374151';
        ctx.fillText((o.SHIPPINGAGENCY || '-').slice(0, 14), cols[3].x, y + 25);

        ctx.fillStyle = '#059669';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(formatPrice(o.TOTAL || 0), cols[4].x, y + 25);
        ctx.font = '12px sans-serif';

        ctx.strokeStyle = '#f3f4f6';
        ctx.beginPath();
        ctx.moveTo(0, y + rowH);
        ctx.lineTo(W, y + rowH);
        ctx.stroke();
      });

      const footerY = headerH + tableHeaderH + exportOrders.length * rowH;
      ctx.fillStyle = '#f9fafb';
      ctx.fillRect(0, footerY, W, footerH);
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px sans-serif';
      ctx.fillText(`Generado el ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}`, 24, footerY + 35);
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Total: ${formatPrice(totalSum)}`, W - 24, footerY + 35);
      ctx.textAlign = 'left';

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `pedidos_mayoristas_${startDateStr}_a_${endDateStr}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setShowExportModal(false);
    } catch (e: any) {
      console.error('Export image error:', e);
      alert('Error al generar la imagen: ' + e.message);
    } finally {
      setExportLoading(false);
    }
  };

  const parseItems = (raw: string): any[] => {
    try {
      return JSON.parse(raw || '[]');
    } catch {
      return [];
    }
  };

  const toggleSort = (col: 'date' | 'total') => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const fmt = formatPrice;

  // ---- Filtering / sorting (client-side; wholesale volume is low) ----
  const sortedOrders = [...orders].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'total') return (a.TOTAL - b.TOTAL) * mul;
    const ta = a.CREATEDAT || new Date(a.$createdAt).getTime();
    const tb = b.CREATEDAT || new Date(b.$createdAt).getTime();
    return (ta - tb) * mul;
  });

  const filtered = sortedOrders.filter(o => {
    if (activeFilter === 'paid_group') {
      if (!PAID_GROUP_STATUSES.includes(o.STATUS)) return false;
    } else if (activeFilter !== 'all' && o.STATUS !== activeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(
        o.REQCODE?.toLowerCase().includes(q) ||
        o.CUSTOMERNAME?.toLowerCase().includes(q) ||
        o.CUSTOMERRUT?.toLowerCase().includes(q) ||
        o.CUSTOMERPHONE?.includes(q) ||
        o.CUSTOMEREMAIL?.toLowerCase().includes(q) ||
        o.ADMINNOTES?.toLowerCase().includes(q)
      )) return false;
    }
    if (dateFilter !== 'all' && (dateFilter !== 'custom' || customDateStart || customDateEnd)) {
      const ts = o.CREATEDAT || new Date(o.$createdAt).getTime();
      const nowCLT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
      const startToday = new Date(nowCLT.getFullYear(), nowCLT.getMonth(), nowCLT.getDate(), 0, 0, 0, 0).getTime();
      if (dateFilter === 'today') {
        if (ts < startToday) return false;
      } else if (dateFilter === 'yesterday') {
        const startY = startToday - 86400000;
        if (ts < startY || ts >= startToday) return false;
      } else if (dateFilter === 'day_before') {
        const startY = startToday - 86400000;
        const startDB = startToday - 2 * 86400000;
        if (ts < startDB || ts >= startY) return false;
      } else if (dateFilter === 'custom') {
        if (customDateStart) {
          const startTs = new Date(customDateStart + 'T00:00:00-03:00').getTime();
          if (ts < startTs) return false;
        }
        if (customDateEnd) {
          const endTs = new Date(customDateEnd + 'T23:59:59-03:00').getTime();
          if (ts > endTs) return false;
        }
      }
    }
    if (proofOnly && !o.PAYMENTPROOFURL) return false;
    return true;
  });

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [activeFilter, search, dateFilter, customDateStart, customDateEnd, proofOnly]);

  // ---- Stats (computed from loaded orders) ----
  const stats = (() => {
    const nowCLT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const startToday = new Date(nowCLT.getFullYear(), nowCLT.getMonth(), nowCLT.getDate(), 0, 0, 0, 0).getTime();
    const startYesterday = startToday - 86400000;
    const startDayBefore = startToday - 2 * 86400000;
    const tsOf = (o: WholesaleOrder) => o.CREATEDAT || new Date(o.$createdAt).getTime();

    const todayOrders = orders.filter(o => tsOf(o) >= startToday);
    const yesterdayOrders = orders.filter(o => { const ts = tsOf(o); return ts >= startYesterday && ts < startToday; });
    const dayBeforeOrders = orders.filter(o => { const ts = tsOf(o); return ts >= startDayBefore && ts < startYesterday; });
    const paidOrdersToday = todayOrders.filter(o => PAID_GROUP_STATUSES.includes(o.STATUS));

    const byCustomer: Record<string, { name: string; total: number }> = {};
    for (const o of todayOrders) {
      const key = o.CUSTOMERRUT || o.CUSTOMERNAME || 'anon';
      if (!byCustomer[key]) byCustomer[key] = { name: o.CUSTOMERNAME || key, total: 0 };
      byCustomer[key].total += o.TOTAL || 0;
    }
    const topEntries = Object.values(byCustomer).sort((a, b) => b.total - a.total);

    const countBy = (list: WholesaleOrder[]) => {
      const m: Record<string, number> = {};
      for (const o of list) m[o.STATUS] = (m[o.STATUS] || 0) + 1;
      return m;
    };

    return {
      totalToday: todayOrders.reduce((s, o) => s + (o.TOTAL || 0), 0),
      countToday: todayOrders.length,
      totalYesterday: yesterdayOrders.reduce((s, o) => s + (o.TOTAL || 0), 0),
      countYesterday: yesterdayOrders.length,
      topCustomer: topEntries[0] || null,
      avgTicket: paidOrdersToday.length > 0 ? Math.round(paidOrdersToday.reduce((s, o) => s + (o.TOTAL || 0), 0) / paidOrdersToday.length) : 0,
      totalPaid: paidOrdersToday.reduce((s, o) => s + (o.TOTAL || 0), 0),
      countPaid: paidOrdersToday.length,
      byStatus: countBy(todayOrders),
      byStatusYesterday: countBy(yesterdayOrders),
      byStatusDayBefore: countBy(dayBeforeOrders),
      byStatusAll: countBy(orders),
    };
  })();

  return (
    <div className="space-y-3 sm:space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base sm:text-xl font-bold text-gray-900">Pedidos Mayoristas</h1>
          <p className="text-xs sm:text-sm text-gray-500">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            {(() => { const items = filtered.reduce((s, o) => { try { return s + (JSON.parse(o.ITEMS || '[]') as any[]).reduce((a: number, i: any) => a + (i.qty || 1), 0); } catch { return s; } }, 0); return items > 0 ? <span className="ml-2 text-xs text-gray-400">{items} unidades</span> : null; })()}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Date range selector */}
          <button onClick={() => setShowDatePicker(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs sm:text-sm font-medium hover:bg-gray-50 transition">
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">{dateFilter === 'custom' && customDateStart ? `${customDateStart}${customDateEnd ? ' → ' + customDateEnd : ''}` : DATE_FILTER_LABELS[dateFilter]}</span>
          </button>
          <button onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-emerald-700 transition">
            <ImageIcon className="w-4 h-4" /><span className="hidden sm:inline">Descargar imagen</span>
          </button>
          <button onClick={load} disabled={isLoading}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Export Image Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => !exportLoading && setShowExportModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-gray-800">Descargar imagen de pedidos mayoristas</h3>
              </div>
              <button onClick={() => !exportLoading && setShowExportModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xl leading-none">×</button>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-emerald-700 font-medium">
                Se excluirán los pedidos en estado: <b>Pendiente</b>, <b>Negociación</b> y <b>Cancelado</b>.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Fecha inicio (opcional)</label>
                <input type="date" value={exportDateStart} onChange={e => setExportDateStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Fecha fin (opcional)</label>
                <input type="date" value={exportDateEnd} onChange={e => setExportDateEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <p className="text-[11px] text-gray-400">
                Si no seleccionas fechas, se usará por defecto: ayer → hoy.
              </p>
              <button onClick={exportOrdersImage} disabled={exportLoading}
                className="w-full px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-60 flex items-center justify-center gap-2">
                {exportLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generando imagen...</>
                ) : (
                  <><Download className="w-4 h-4" /> Descargar PNG</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date Picker Modal */}
      {showDatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => setShowDatePicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800">Seleccionar fecha</h3>
              <button onClick={() => setShowDatePicker(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xl leading-none">×</button>
            </div>
            <div className="space-y-2 mb-4">
            {(['today', 'yesterday', 'day_before'] as DateFilter[]).map(d => (
              <button key={d} onClick={() => { setDateFilter(d); setShowDatePicker(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${dateFilter === d ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                <Calendar className="w-4 h-4" />
                {DATE_FILTER_LABELS[d]}
              </button>
            ))}
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Rango personalizado</p>
              <div className="flex flex-col gap-2">
                <input type="date" value={customDateStart} onChange={e => setCustomDateStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Desde" />
                <input type="date" value={customDateEnd} onChange={e => setCustomDateEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Hasta" />
                <button onClick={() => { if (customDateStart) { setDateFilter('custom'); setShowDatePicker(false); } }}
                  disabled={!customDateStart}
                  className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition disabled:opacity-40">
                  Aplicar rango
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Dashboard */}
      {!isLoading && orders.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Total Hoy */}
          <div className="relative rounded-2xl border border-gray-100/80 p-3 sm:p-4 overflow-hidden"
            style={{ background: 'linear-gradient(145deg, rgba(238,242,255,0.6), rgba(255,255,255,0.95))', boxShadow: '0 4px 16px -8px rgba(79,70,229,0.12)' }}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #6366f1, #4f46e5)' }} />
            <div className="flex items-center gap-2 mb-2 mt-0.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(99,102,241,0.12), rgba(79,70,229,0.06))' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-bold">Total Hoy</p>
            </div>
            <p className="text-lg sm:text-2xl font-extrabold text-gray-900 tracking-tight">{fmt(stats.totalToday)}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-[10px] text-gray-400 font-medium">{stats.countToday} pedidos hoy</p>
              {stats.countYesterday > 0 && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${stats.totalToday > stats.totalYesterday ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                  {stats.totalToday > stats.totalYesterday ? '↑' : '↓'} {fmt(Math.abs(stats.totalToday - stats.totalYesterday))}
                </span>
              )}
            </div>
          </div>
          {/* Ventas Confirmadas */}
          <div className="relative rounded-2xl border border-gray-100/80 p-3 sm:p-4 overflow-hidden"
            style={{ background: 'linear-gradient(145deg, rgba(236,253,245,0.6), rgba(255,255,255,0.95))', boxShadow: '0 4px 16px -8px rgba(5,150,105,0.12)' }}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #10b981, #059669)' }} />
            <div className="flex items-center gap-2 mb-2 mt-0.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(16,185,129,0.12), rgba(5,150,105,0.06))' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-bold">Ventas Confirmadas</p>
            </div>
            <p className="text-lg sm:text-2xl font-extrabold text-gray-900 tracking-tight">{fmt(stats.totalPaid)}</p>
            <p className="text-[10px] text-gray-400 font-medium mt-1">{stats.countPaid} pagados hoy</p>
          </div>
          {/* Cliente Top */}
          <div className="relative rounded-2xl border border-gray-100/80 p-3 sm:p-4 overflow-hidden"
            style={{ background: 'linear-gradient(145deg, rgba(255,251,235,0.6), rgba(255,255,255,0.95))', boxShadow: '0 4px 16px -8px rgba(217,119,6,0.12)' }}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #f59e0b, #d97706)' }} />
            <div className="flex items-center gap-2 mb-2 mt-0.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(245,158,11,0.12), rgba(217,119,6,0.06))' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-bold">Top Cliente</p>
            </div>
            {stats.topCustomer ? (
              <>
                <p className="text-sm sm:text-base font-extrabold text-gray-900 truncate tracking-tight">{stats.topCustomer.name.split(' ').slice(0, 2).join(' ')}</p>
                <p className="text-[10px] text-amber-600 mt-0.5 font-bold">{fmt(stats.topCustomer.total)} hoy</p>
              </>
            ) : <p className="text-sm text-gray-400 mt-1">Sin datos</p>}
          </div>
          {/* Ticket Promedio */}
          <div className="relative rounded-2xl border border-gray-100/80 p-3 sm:p-4 overflow-hidden"
            style={{ background: 'linear-gradient(145deg, rgba(240,253,244,0.6), rgba(255,255,255,0.95))', boxShadow: '0 4px 16px -8px rgba(22,163,74,0.12)' }}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #22c55e, #16a34a)' }} />
            <div className="flex items-center gap-2 mb-2 mt-0.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(34,197,94,0.12), rgba(22,163,74,0.06))' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-bold">Ticket Prom.</p>
            </div>
            <p className="text-lg sm:text-2xl font-extrabold text-gray-900 tracking-tight">{fmt(stats.avgTicket)}</p>
            <p className="text-[10px] text-gray-400 font-medium mt-1">por pedido pagado</p>
          </div>
        </div>
      )}

      {/* Process Timeline */}
      {(() => {
        const goFilter = (status: string, isActive: boolean) => {
          setActiveFilter(isActive ? 'all' : status);
        };
        let statusCounts: Record<string, number>;
        if (dateFilter === 'today') statusCounts = stats.byStatus;
        else if (dateFilter === 'yesterday') statusCounts = stats.byStatusYesterday;
        else if (dateFilter === 'day_before') statusCounts = stats.byStatusDayBefore;
        else statusCounts = stats.byStatusAll;
        const counts = STATUS_FLOW.map(st => statusCounts[st] || 0);
        let furthestIdx = -1;
        counts.forEach((c, i) => { if (c > 0) furthestIdx = i; });
        const flowTotal = counts.reduce((s, c) => s + c, 0);

        // Nodo del flujo principal — glossy + anillo activo + badge
        const renderNode = (status: string, idx: number) => {
          const sc = STATUS_COLORS[status] || { color: '#6b7280', bg: '#f3f4f6' };
          const cfg = STATUS_CONFIG[status] || { label: status };
          const count = counts[idx];
          const isActive = activeFilter === status;
          const dim = count === 0;
          return (
            <button
              key={status}
              onClick={() => goFilter(status, isActive)}
              title={`${cfg.label}${count ? ` · ${count} pedido${count !== 1 ? 's' : ''}` : ''}`}
              className="group flex flex-col items-center gap-1.5 sm:gap-2 flex-shrink-0 relative z-10"
              style={{ width: 64 }}>
              <div className="relative" style={{ animation: isActive ? 'kwFloat 2.6s ease-in-out infinite' : undefined }}>
                {isActive && (
                  <span className="absolute inset-0 rounded-[12px] sm:rounded-[14px]" style={{ ['--kw' as any]: `${sc.color}66`, animation: 'kwPulseRing 1.9s ease-out infinite' }} />
                )}
                <div
                  className="relative flex items-center justify-center rounded-[12px] sm:rounded-[14px] transition-all duration-300 group-hover:-translate-y-0.5"
                  style={{
                    width: isActive ? 42 : 36,
                    height: isActive ? 42 : 36,
                    background: dim
                      ? 'linear-gradient(160deg,#ffffff,#eef2f7)'
                      : `linear-gradient(160deg, rgba(255,255,255,0.28), rgba(0,0,0,0.16)), ${sc.color}`,
                    border: dim ? `1.5px dashed ${sc.color}4d` : '1px solid rgba(255,255,255,0.35)',
                    boxShadow: isActive
                      ? `0 0 0 3px ${sc.color}18, 0 6px 14px -6px ${sc.color}66, inset 0 1px 1px rgba(255,255,255,0.5)`
                      : dim ? 'none' : `0 4px 10px -4px ${sc.color}55, inset 0 1px 1px rgba(255,255,255,0.4)`,
                  }}>
                  {STATUS_SVG[status] && React.cloneElement(STATUS_SVG[status] as any, {
                    width: isActive ? 18 : 15,
                    height: isActive ? 18 : 15,
                    style: { color: dim ? sc.color : '#fff', opacity: dim ? 0.55 : 1, filter: dim ? 'none' : 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' },
                  })}
                  {!dim && <span className="absolute inset-x-1 top-1 h-1/3 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.45), transparent)' }} />}
                  {count > 0 && (
                    <span
                      className="absolute -top-2 -right-2 min-w-[18px] h-[18px] sm:min-w-[21px] sm:h-[21px] flex items-center justify-center text-[9px] sm:text-[10px] font-extrabold rounded-full px-1 border-2 sm:border-[2.5px] border-white"
                      style={{ background: isActive ? '#0f172a' : `linear-gradient(135deg, ${sc.color}, ${sc.color}cc)`, color: '#fff', boxShadow: `0 2px 5px -1px ${sc.color}55`, animation: 'kwBadgePop 0.45s cubic-bezier(0.34,1.56,0.64,1)' }}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </div>
              </div>
              <span
                className="text-[8px] sm:text-[10px] font-bold leading-tight text-center transition"
                style={{ color: isActive ? sc.color : dim ? '#c2cbd6' : '#475569' }}>
                {cfg.label}
              </span>
            </button>
          );
        };

        // Nodo lateral (Stock Parcial / Negociación / Cancelado)
        const renderSideNode = (status: string) => {
          const sc = STATUS_COLORS[status] || { color: '#6b7280', bg: '#f3f4f6' };
          const cfg = STATUS_CONFIG[status] || { label: status };
          const count = statusCounts[status] || 0;
          const isActive = activeFilter === status;
          const dim = count === 0;
          return (
            <button
              key={status}
              onClick={() => goFilter(status, isActive)}
              title={`${cfg.label}${count ? ` · ${count} pedido${count !== 1 ? 's' : ''}` : ''}`}
              className="group flex flex-col items-center gap-1.5 sm:gap-2 flex-shrink-0 relative z-10"
              style={{ width: 64 }}>
              <div className="relative" style={{ animation: isActive ? 'kwFloat 2.6s ease-in-out infinite' : undefined }}>
                {isActive && (
                  <span className="absolute inset-0 rounded-[12px] sm:rounded-[14px]" style={{ ['--kw' as any]: `${sc.color}66`, animation: 'kwPulseRing 1.9s ease-out infinite' }} />
                )}
                <div
                  className="relative flex items-center justify-center rounded-[12px] sm:rounded-[14px] transition-all duration-300 group-hover:-translate-y-0.5"
                  style={{
                    width: isActive ? 42 : 36,
                    height: isActive ? 42 : 36,
                    background: dim
                      ? 'linear-gradient(160deg,#ffffff,#eef2f7)'
                      : `linear-gradient(160deg, rgba(255,255,255,0.28), rgba(0,0,0,0.16)), ${sc.color}`,
                    border: dim ? `1.5px dashed ${sc.color}4d` : '1px solid rgba(255,255,255,0.35)',
                    boxShadow: isActive
                      ? `0 0 0 3px ${sc.color}18, 0 6px 14px -6px ${sc.color}66, inset 0 1px 1px rgba(255,255,255,0.5)`
                      : dim ? 'none' : `0 4px 10px -4px ${sc.color}55, inset 0 1px 1px rgba(255,255,255,0.4)`,
                  }}>
                  {STATUS_SVG[status] && React.cloneElement(STATUS_SVG[status] as any, {
                    width: isActive ? 18 : 15,
                    height: isActive ? 18 : 15,
                    style: { color: dim ? sc.color : '#fff', opacity: dim ? 0.55 : 1, filter: dim ? 'none' : 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' },
                  })}
                  {!dim && <span className="absolute inset-x-1 top-1 h-1/3 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.45), transparent)' }} />}
                  {count > 0 && (
                    <span
                      className="absolute -top-2 -right-2 min-w-[18px] h-[18px] sm:min-w-[21px] sm:h-[21px] flex items-center justify-center text-[9px] sm:text-[10px] font-extrabold rounded-full px-1 border-2 sm:border-[2.5px] border-white"
                      style={{ background: isActive ? '#0f172a' : `linear-gradient(135deg, ${sc.color}, ${sc.color}cc)`, color: '#fff', boxShadow: `0 2px 5px -1px ${sc.color}55`, animation: 'kwBadgePop 0.45s cubic-bezier(0.34,1.56,0.64,1)' }}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </div>
              </div>
              <span
                className="text-[8px] sm:text-[10px] font-bold leading-tight text-center transition"
                style={{ color: isActive ? sc.color : dim ? '#c2cbd6' : '#475569' }}>
                {cfg.label}
              </span>
            </button>
          );
        };

        const renderDashedSep = (key: string) => (
          <div key={key} className="flex items-center self-start mt-[18px] sm:mt-[25px] flex-shrink-0">
            <div className="flex items-center gap-0.5">
              <div className="w-1.5 h-0.5 bg-gray-300 rounded-full" />
              <div className="w-1 h-0.5 bg-gray-300 rounded-full" />
              <div className="w-1.5 h-0.5 bg-gray-300 rounded-full" />
            </div>
          </div>
        );

        return (
          <div className="relative rounded-[20px] overflow-hidden border border-white/70 shadow-[0_6px_24px_-12px_rgba(79,70,229,0.12)]"
            style={{ background: 'linear-gradient(135deg, rgba(238,242,255,0.85), rgba(255,255,255,0.92) 45%, rgba(248,250,252,0.9))', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
            {/* Ambient blobs */}
            <div className="absolute -top-16 -left-10 w-56 h-56 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.05), transparent 70%)' }} />
            <div className="absolute -bottom-20 right-10 w-56 h-56 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.03), transparent 70%)' }} />
            {/* Sheen animado superior */}
            <div className="absolute top-0 left-0 right-0 h-px overflow-hidden pointer-events-none">
              <div className="h-px w-1/3" style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)', animation: 'kwSheen 4.5s linear infinite' }} />
            </div>

            {/* Header */}
            <div className="relative flex items-start sm:items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-1 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(145deg,#6366f1,#4f46e5)', boxShadow: '0 4px 10px -4px rgba(79,70,229,0.4), inset 0 1px 1px rgba(255,255,255,0.4)' }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                </span>
                <div>
                  <p className="text-sm font-extrabold text-gray-900 leading-tight tracking-tight">Flujo del Pedido Mayorista</p>
                  <p className="text-[10px] sm:text-[11px] text-gray-400 leading-tight font-medium">{flowTotal} en proceso · toca un estado para filtrar</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {activeFilter !== 'all' && (
                  <button onClick={() => goFilter('all', false)}
                    className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-gray-900 text-white hover:bg-gray-800 transition flex-shrink-0 shadow-sm">
                    Ver todos
                  </button>
                )}
              </div>
            </div>

            {/* Track */}
            <div className="relative px-4 sm:px-5 pb-5 pt-3 overflow-x-auto">
              <div className="flex items-start gap-0 min-w-max relative">
                {STATUS_FLOW.map((status, idx) => {
                  const a = STATUS_COLORS[status]?.color || '#6b7280';
                  const b = STATUS_COLORS[STATUS_FLOW[idx + 1]]?.color || a;
                  const filled = idx < furthestIdx;
                  return (
                    <React.Fragment key={status}>
                      {renderNode(status, idx)}
                      {idx < STATUS_FLOW.length - 1 && (
                        <div className="relative self-start mt-[18px] sm:mt-[25px] flex-shrink-0 -mx-1 sm:-mx-1.5 rounded-full overflow-hidden"
                          style={{ height: 3, width: 20, background: filled ? `linear-gradient(90deg, ${a}, ${b})` : '#e5e7eb' }}>
                          {filled && (
                            <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)', animation: `kwShimmer 2.4s linear ${idx * 0.18}s infinite` }} />
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
                {/* Estados desconectados (extremo derecho) */}
                <div className="flex-1 min-w-[24px]" />
                {renderSideNode('negotiation')}
                {renderDashedSep('sep-neg')}
                {renderSideNode('negotiation')}
                {renderDashedSep('sep-cancel')}
                {renderSideNode('cancelled')}
              </div>
            </div>

            <style>{`
              @keyframes kwShimmer { 0% { transform: translateX(-110%); } 100% { transform: translateX(220%); } }
              @keyframes kwSheen { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
              @keyframes kwPulseRing { 0% { box-shadow: 0 0 0 0 var(--kw); } 70% { box-shadow: 0 0 0 11px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
              @keyframes kwFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
              @keyframes kwBadgePop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.18); } 100% { transform: scale(1); opacity: 1; } }
            `}</style>
          </div>
        );
      })()}

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2 overflow-x-auto -mx-1 px-1 pb-1 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
        {/* Todos — black bg white text */}
        <button onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${activeFilter === 'all' ? 'bg-gray-900 text-white shadow-md ring-2 ring-gray-900 ring-inset' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
          Todos
        </button>
        {/* Pagados — soft green */}
        <button onClick={() => setActiveFilter('paid_group')}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition bg-green-100 text-green-700 border border-green-200 ${activeFilter === 'paid_group' ? 'ring-2 ring-green-500 ring-inset shadow-sm' : 'hover:opacity-80'}`}>
          Confirmados
        </button>
        {/* Recibido — soft orange */}
        <button onClick={() => setActiveFilter('pending')}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition bg-orange-100 text-orange-700 border border-orange-200 ${activeFilter === 'pending' ? 'ring-2 ring-orange-500 ring-inset shadow-sm' : 'hover:opacity-80'}`}>
          Recibido
        </button>
        {/* Cancelado — soft red */}
        <button onClick={() => setActiveFilter('cancelled')}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition bg-red-100 text-red-700 border border-red-200 ${activeFilter === 'cancelled' ? 'ring-2 ring-red-500 ring-inset shadow-sm' : 'hover:opacity-80'}`}>
          Cancelado
        </button>
        {/* More states — opens modal */}
        <button onClick={() => setShowStatusModal(true)}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 ${ALL_STATUS_KEYS.filter(k => !['pending', 'cancelled'].includes(k)).includes(activeFilter) ? 'ring-2 ring-indigo-500 ring-inset shadow-sm' : ''}`}>
          Más estados ▾
        </button>
        {(() => { const n = orders.filter(o => !!o.PAYMENTPROOFURL).length; return n > 0 ? (
          <button onClick={() => setProofOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition border ${proofOnly ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}>
            💰 Con comprobante <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${proofOnly ? 'bg-white/25' : 'bg-emerald-200 text-emerald-800'}`}>{n}</span>
          </button>
        ) : null; })()}
        {/* Quick date buttons */}
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden sm:ml-auto">
          {(['all', 'today', 'yesterday', 'day_before'] as DateFilter[]).map(d => (
            <button key={d} onClick={() => setDateFilter(d)}
              className={`px-3 py-1.5 text-xs font-medium transition ${dateFilter === d ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {DATE_FILTER_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Status Modal — floating cards with blurred backdrop */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => setShowStatusModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-sm font-bold text-gray-800">Seleccionar estado</h3>
              <button onClick={() => setShowStatusModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {ALL_STATUS_KEYS.filter(k => !['pending', 'cancelled'].includes(k)).map(key => {
                const color = STATUS_COLORS[key]?.color || '#6b7280';
                const bg = STATUS_COLORS[key]?.bg || '#f3f4f6';
                return (
                  <button key={key} onClick={() => { setActiveFilter(key); setShowStatusModal(false); }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition ${activeFilter === key ? 'ring-2 ring-offset-1 shadow-sm' : 'hover:shadow-md'} hover:scale-105`}
                    style={{ background: bg, borderColor: color + '33', color }}>
                    <div style={{ color }}>{STATUS_SVG[key] && React.cloneElement(STATUS_SVG[key] as any, { width: 32, height: 32 })}</div>
                    <span className="text-xs font-semibold text-center" style={{ color }}>{STATUS_CONFIG[key]?.label || key}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Timeline Modal — vertical timeline to change order status */}
      {timelineOrderId && (() => {
        const tOrder = orders.find(o => o.$id === timelineOrderId);
        if (!tOrder) return null;
        const currentIdx = STATUS_FLOW.indexOf(tOrder.STATUS);
        const isCancelled = tOrder.STATUS === 'cancelled';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
            onClick={() => setTimelineOrderId(null)}>
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Header with gradient */}
              <div className="px-4 py-3 sm:px-6 sm:py-4" style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center rounded-2xl" style={{ width: 40, height: 40, background: STATUS_COLORS[tOrder.STATUS]?.bg || '#f3f4f6' }}>
                      <div style={{ color: STATUS_COLORS[tOrder.STATUS]?.color || '#6b7280' }}>
                        {STATUS_SVG[tOrder.STATUS] || STATUS_SVG.cancelled}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-800">Línea de tiempo del pedido</h3>
                      <p className="text-xs text-gray-400 font-mono">#{tOrder.REQCODE || tOrder.$id.slice(-6)}</p>
                    </div>
                  </div>
                  <button onClick={() => setTimelineOrderId(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition text-xl leading-none">×</button>
                </div>
              </div>

              {/* Timeline */}
              <div className="px-4 py-3 sm:px-6 sm:py-4 max-h-[50vh] overflow-y-auto">
                <div className="relative">
                  {STATUS_FLOW.map((status, idx) => {
                    const isPast = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    const isFuture = idx > currentIdx;
                    const sc = STATUS_COLORS[status];
                    const isClickable = !isCancelled && status !== tOrder.STATUS;
                    return (
                      <div key={status} className="flex items-start gap-3 relative pb-1" style={{ minHeight: 60 }}>
                        {idx < STATUS_FLOW.length - 1 && (
                          <div className="absolute left-[15px] top-9 bottom-0 w-[2px] rounded-full" style={{ background: isPast ? sc.color : '#e5e7eb', opacity: isPast ? 0.4 : 1 }} />
                        )}
                        <button
                          onClick={() => { if (isClickable) { updateStatus(tOrder.$id, status); } }}
                          disabled={!isClickable}
                          className="relative z-10 flex items-center justify-center rounded-full flex-shrink-0 transition-all"
                          style={{
                            width: 32, height: 32,
                            background: isCurrent ? sc.color : (isPast ? sc.bg : '#fff'),
                            border: `2.5px solid ${isCurrent ? sc.color : (isPast ? sc.color + '88' : '#e5e7eb')}`,
                            cursor: isClickable ? 'pointer' : 'default',
                            opacity: isFuture && !isClickable ? 0.5 : 1,
                          }}>
                          <div style={{ color: isCurrent ? '#fff' : (isPast ? sc.color : '#cbd5e1'), display: 'flex' }}>
                            {STATUS_SVG[status] && React.cloneElement(STATUS_SVG[status] as any, { width: 15, height: 15 })}
                          </div>
                          {isCurrent && (
                            <div className="absolute -right-1 -top-1 w-3 h-3 rounded-full border-2 border-white animate-pulse" style={{ background: sc.color }} />
                          )}
                        </button>
                        <div className={`pt-1.5 pb-2 flex-1 ${isClickable ? 'cursor-pointer' : ''}`}
                          onClick={() => { if (isClickable) updateStatus(tOrder.$id, status); }}>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold transition" style={{ color: isCurrent ? sc.color : (isPast ? '#374151' : '#9ca3af') }}>
                              {STATUS_CONFIG[status]?.label || status}
                            </p>
                            {isCurrent && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: sc.color }}>ACTUAL</span>
                            )}
                            {isPast && !isCurrent && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sc.color} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{STATUS_DESC[status]}</p>
                        </div>
                      </div>
                    );
                  })}
                  {/* Side branch nodes */}
                  {(['negotiation'] as const).map(branch => {
                    const isBranch = tOrder.STATUS === branch;
                    const ncol = STATUS_COLORS[branch];
                    return (
                      <div key={branch} className="flex items-start gap-3 relative pt-2 mt-2 border-t border-dashed border-gray-200">
                        <button
                          onClick={() => { if (!isBranch && !isCancelled) updateStatus(tOrder.$id, branch); }}
                          disabled={isBranch || isCancelled}
                          className="relative z-10 flex items-center justify-center rounded-full flex-shrink-0 transition-all"
                          style={{ width: 32, height: 32, background: isBranch ? ncol.color : ncol.bg, border: `2.5px solid ${ncol.color}`, cursor: (isBranch || isCancelled) ? 'default' : 'pointer', opacity: isCancelled ? 0.4 : (isBranch ? 1 : 0.7) }}>
                          <div style={{ color: isBranch ? '#fff' : ncol.color, display: 'flex' }}>
                            {STATUS_SVG[branch] && React.cloneElement(STATUS_SVG[branch] as any, { width: 15, height: 15 })}
                          </div>
                        </button>
                        <div className={`pt-1.5 pb-2 flex-1 ${(isBranch || isCancelled) ? '' : 'cursor-pointer'}`}
                          onClick={() => { if (!isBranch && !isCancelled) updateStatus(tOrder.$id, branch); }}>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold" style={{ color: isBranch ? ncol.color : '#9ca3af' }}>{STATUS_CONFIG[branch]?.label}</p>
                            {isBranch && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: ncol.color }}>ACTUAL</span>}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{STATUS_DESC[branch]}</p>
                        </div>
                      </div>
                    );
                  })}
                  {/* Cancelled node */}
                  <div className="flex items-start gap-3 relative pt-2 mt-2 border-t border-dashed border-gray-200">
                    <button
                      onClick={() => { if (tOrder.STATUS !== 'cancelled') { updateStatus(tOrder.$id, 'cancelled'); setTimelineOrderId(null); } }}
                      disabled={isCancelled}
                      className="relative z-10 flex items-center justify-center rounded-full flex-shrink-0 transition-all"
                      style={{
                        width: 32, height: 32,
                        background: isCancelled ? STATUS_COLORS.cancelled.color : STATUS_COLORS.cancelled.bg,
                        border: `2.5px solid ${STATUS_COLORS.cancelled.color}`,
                        cursor: isCancelled ? 'default' : 'pointer',
                        opacity: isCancelled ? 1 : 0.6,
                      }}>
                      <div style={{ color: isCancelled ? '#fff' : STATUS_COLORS.cancelled.color, display: 'flex' }}>
                        {STATUS_SVG.cancelled}
                      </div>
                    </button>
                    <div className="pt-1.5 pb-2 flex-1"
                      onClick={() => { if (!isCancelled) { updateStatus(tOrder.$id, 'cancelled'); setTimelineOrderId(null); } }}>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold" style={{ color: isCancelled ? STATUS_COLORS.cancelled.color : '#9ca3af' }}>Cancelado</p>
                        {isCancelled && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: STATUS_COLORS.cancelled.color }}>ACTUAL</span>}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{STATUS_DESC.cancelled}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer — navigation buttons */}
              {!isCancelled && (
                <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-100 flex gap-2">
                  <button
                    onClick={() => { if (currentIdx > 0) updateStatus(tOrder.$id, STATUS_FLOW[currentIdx - 1]); }}
                    disabled={currentIdx <= 0 || updatingId === tOrder.$id}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-200 transition disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                    Anterior
                  </button>
                  <button
                    onClick={() => { if (currentIdx < STATUS_FLOW.length - 1) updateStatus(tOrder.$id, STATUS_FLOW[currentIdx + 1]); }}
                    disabled={currentIdx >= STATUS_FLOW.length - 1 || updatingId === tOrder.$id}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-white rounded-xl text-xs font-bold transition disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ background: STATUS_COLORS[tOrder.STATUS]?.color || '#4f46e5' }}>
                    Siguiente
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              )}
              {isCancelled && (
                <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-100">
                  <button
                    onClick={() => { updateStatus(tOrder.$id, 'pending'); }}
                    disabled={updatingId === tOrder.$id}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold hover:bg-amber-100 transition disabled:opacity-40">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                    Reactivar pedido
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Quick Drawer (Cortina lateral) */}
      {drawerOrderId && (() => {
        const order = orders.find(o => o.$id === drawerOrderId);
        if (!order) return null;

        const date = order.CREATEDAT ? new Date(order.CREATEDAT) : new Date(order.$createdAt);
        const ageMs = Date.now() - date.getTime();
        const ageH = Math.floor(ageMs / 3600000);
        const ageD = Math.floor(ageH / 24);
        const ageStrRel = ageH < 1 ? 'ahora' : ageH < 24 ? `${ageH}h` : `${ageD}d ${ageH % 24}h`;
        const exactTime = date.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
        const ageStr = `${ageStrRel} (${exactTime})`;

        const statusColor = STATUS_COLORS[order.STATUS]?.color || '#6b7280';
        const statusBg = STATUS_COLORS[order.STATUS]?.bg || '#f3f4f6';
        const statusLabel = STATUS_CONFIG[order.STATUS]?.label || order.STATUS;

        const phoneClean = order.CUSTOMERPHONE ? order.CUSTOMERPHONE.replace(/\D/g, '') : '';
        const waPhone = phoneClean.startsWith('56') ? phoneClean : '56' + phoneClean;

        const msg1 = `Hola ${order.CUSTOMERNAME || ''}, te contactamos de Yaxsell por tu pedido mayorista #${order.REQCODE || ''}. Queríamos confirmar si tienes alguna duda con tu cotización o con el proceso de pago. ¡Avísanos y te ayudamos!`;
        const msg2 = `Hola ${order.CUSTOMERNAME || ''}, te escribimos de Yaxsell. Ya confirmamos el stock de tu pedido mayorista #${order.REQCODE || ''}. ¿Te enviamos los datos de transferencia para completar el pago?`;
        const msg3 = `Hola ${order.CUSTOMERNAME || ''}, te escribimos de Yaxsell por tu pedido mayorista #${order.REQCODE || ''}. Para poder liberar el stock a otros clientes, el pedido se cancelará automáticamente en unas horas. Si aún deseas tus productos, envíanos el comprobante de transferencia hoy mismo. ¡Quedamos atentos!`;

        const waUrl1 = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg1)}`;
        const waUrl2 = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg2)}`;
        const waUrl3 = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg3)}`;

        const copyToClipboard = (key: string, text: string) => {
          navigator.clipboard.writeText(text);
          setCopiedField(key);
          setTimeout(() => setCopiedField(null), 1500);
        };

        const copyAllShipping = () => {
          const text = `Destinatario: ${order.CUSTOMERNAME || ''}\nRUT: ${order.CUSTOMERRUT || ''}\nTeléfono: ${order.CUSTOMERPHONE || ''}\nEmail: ${order.CUSTOMEREMAIL || ''}\nDirección: ${order.ADDRESS || ''}\nComuna: ${order.COMUNA || ''}\nRegión: ${order.REGION || ''}\nAgencia: ${order.SHIPPINGAGENCY || ''}`;
          copyToClipboard('all_shipping', text);
        };

        return (
          <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.3)', animation: 'kwFadeIn 0.2s ease-out' }} onClick={() => setDrawerOrderId(null)}>
            <div className="bg-white h-full w-full max-w-md shadow-2xl flex flex-col relative border-l border-gray-200"
              style={{ animation: 'kwSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    Pedido Mayorista <span className="font-mono text-indigo-600 font-extrabold">#{order.REQCODE || '—'}</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Creado hace {ageStr} ({date.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })})</p>
                </div>
                <button onClick={() => setDrawerOrderId(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xl font-bold leading-none transition">×</button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
                {/* Total & Current Status card */}
                <div className="bg-indigo-50/40 rounded-2xl p-4 border border-indigo-100/40 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider block">Monto Total</span>
                    <span className="text-2xl font-black text-gray-900">{fmt(order.TOTAL)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider block mb-1">Estado Actual</span>
                    <span className="text-xs font-bold px-3 py-1 rounded-full inline-block shadow-sm" style={{ background: statusBg, color: statusColor }}>
                      {statusLabel}
                    </span>
                  </div>
                </div>

                {/* Comprobante de Pago */}
                {order.PAYMENTPROOFURL && (
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 space-y-3">
                    <h4 className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-2">
                      💰 Comprobante de Pago
                    </h4>
                    <a href={order.PAYMENTPROOFURL} target="_blank" rel="noopener noreferrer" className="inline-block">
                      {order.PAYMENTPROOFURL.match(/\.pdf|ext=pdf/i) ? (
                        <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-emerald-100 hover:border-emerald-300 transition">
                          <Download className="w-5 h-5 text-emerald-600" />
                          <span className="text-xs font-bold text-emerald-700">Ver comprobante (PDF)</span>
                        </div>
                      ) : (
                        <img src={order.PAYMENTPROOFURL} alt="Comprobante" className="max-h-48 rounded-xl border border-emerald-100 hover:border-emerald-300 transition" />
                      )}
                    </a>
                  </div>
                )}

                {/* WhatsApp Messages section */}
                {MODULE_ACCESS.whatsappManagement && (
                <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#10b981" className="shrink-0">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.73-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.528 1.977 14.07 .953 11.996.953c-5.44 0-9.866 4.372-9.87 9.802-.001 1.77.463 3.5 1.34 5.016l-.995 3.633 3.731-.977zm11.367-7.79c-.273-.136-1.62-.8-1.87-.89-.25-.09-.432-.136-.613.136-.18.272-.7.89-.858 1.072-.158.18-.317.2-.59.064-1.286-.64-2.138-1.053-2.996-2.525-.227-.39.227-.362.649-1.201.07-.14.035-.262-.017-.37-.053-.107-.432-1.04-.593-1.43-.157-.38-.344-.326-.473-.326-.122 0-.262-.01-.403-.01-.14 0-.37.052-.563.262-.193.21-.738.722-.738 1.762s.755 2.04 1.884 2.19c1.129.15 2.2 1.59 3.56 2.09.4.15.78.16 1.07.12.33-.05 1.02-.42 1.16-.83.14-.41.14-.77.1-.84-.04-.07-.16-.11-.43-.24z"/>
                    </svg>
                    <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Mensajes de WhatsApp</h4>
                  </div>
                  <div className="flex flex-col gap-2">
                    <a href={waUrl1} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-extrabold transition shadow-sm hover:scale-[1.01] active:scale-95 text-left leading-normal">
                      <span>1. Recordatorio / Dudas de la Cotización</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0 ml-2"><polyline points="9 18 15 12 9 6"/></svg>
                    </a>
                    <a href={waUrl2} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition shadow-sm hover:scale-[1.01] active:scale-95 text-left leading-normal">
                      <span>2. Stock Confirmado / Enviar Datos de Pago</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0 ml-2"><polyline points="9 18 15 12 9 6"/></svg>
                    </a>
                    <a href={waUrl3} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-extrabold transition shadow-sm hover:scale-[1.01] active:scale-95 text-left leading-normal">
                      <span>3. Último Aviso / Liberar Stock</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0 ml-2"><polyline points="9 18 15 12 9 6"/></svg>
                    </a>
                  </div>
                </div>
                )}

                {/* Shipping Details card */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Datos para Despacho</h4>
                    <button
                      onClick={copyAllShipping}
                      className={`text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${copiedField === 'all_shipping' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      <Copy size={11} />
                      {copiedField === 'all_shipping' ? '✓ Todo Copiado' : 'Copiar todo'}
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {/* Destinatario */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Nombre Destinatario</span>
                        <span className="font-bold text-gray-800 truncate block">{order.CUSTOMERNAME || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('name', order.CUSTOMERNAME || '')}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'name' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar nombre">
                        {copiedField === 'name' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* RUT */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">RUT</span>
                        <span className="font-bold text-gray-800 block">{order.CUSTOMERRUT || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('rut', order.CUSTOMERRUT || '')}
                        disabled={!order.CUSTOMERRUT}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'rut' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar RUT">
                        {copiedField === 'rut' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* Telefono */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Teléfono</span>
                        <span className="font-bold text-indigo-600 font-mono block">{order.CUSTOMERPHONE || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('phone', order.CUSTOMERPHONE || '')}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'phone' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar teléfono">
                        {copiedField === 'phone' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* Email */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Email</span>
                        <span className="font-bold text-gray-700 block truncate max-w-[220px]" title={order.CUSTOMEREMAIL}>{order.CUSTOMEREMAIL || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('email', order.CUSTOMEREMAIL || '')}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'email' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar email">
                        {copiedField === 'email' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* Direccion */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Dirección de despacho</span>
                        <span className="text-xs text-gray-700 leading-normal font-bold block">{order.ADDRESS || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('address', order.ADDRESS || '')}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'address' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar dirección">
                        {copiedField === 'address' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* Comuna */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Comuna</span>
                        <span className="font-bold text-gray-800 block">{order.COMUNA || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('comune', order.COMUNA || '')}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'comune' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar comuna">
                        {copiedField === 'comune' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* Region */}
                    <div className="flex items-start justify-between text-xs gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Región</span>
                        <span className="font-bold text-gray-800 block">{order.REGION || '—'}</span>
                      </div>
                      <button onClick={() => copyToClipboard('region', order.REGION || '')}
                        className={`p-1.5 rounded-md border text-gray-400 hover:text-indigo-600 hover:bg-white transition shrink-0 ${copiedField === 'region' ? 'text-emerald-500 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-150'}`} title="Copiar región">
                        {copiedField === 'region' ? <span className="text-[9px] font-extrabold px-0.5">✓</span> : <Copy size={11} />}
                      </button>
                    </div>

                    {/* Agencia */}
                    <div className="flex items-start justify-between text-xs gap-3 border-t border-gray-200/50 pt-2.5">
                      <div className="min-w-0">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Agencia</span>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {order.SHIPPINGAGENCY ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">{order.SHIPPINGAGENCY}</span>
                          ) : <span className="text-gray-300">—</span>}
                        </div>
                      </div>
                    </div>

                    {/* Indicaciones */}
                    {order.ADDITIONALINFO && (
                      <div className="mt-2 p-2 bg-gray-50 rounded-lg text-[11px] text-gray-500 border border-gray-100">
                        <p className="font-semibold mb-0.5">Indicaciones:</p>
                        {order.ADDITIONALINFO}
                      </div>
                    )}
                  </div>
                </div>

                {/* Customer Notes */}
                {order.CUSTOMERNOTE && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Notas del Cliente</h4>
                    <div className="bg-amber-50/50 border border-amber-100 text-amber-900 rounded-xl p-3 text-xs leading-relaxed font-medium">
                      {order.CUSTOMERNOTE}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer action buttons */}
              <div className="p-4 sm:p-5 border-t border-gray-100 bg-gray-50 flex items-center justify-center gap-2">
                <button
                  onClick={() => downloadOrderPrint(order)}
                  className="flex-1 py-3.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-bold transition flex items-center justify-center gap-2 active:scale-95"
                >
                  <Printer size={16} />
                  PDF
                </button>
                <button
                  onClick={() => { window.location.href = `/admin/wholesale-orders/${order.$id}`; }}
                  className="flex-[2] py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/10 hover:scale-[1.01] active:scale-95"
                >
                  <Eye size={16} />
                  Ver Detalle Completo
                </button>
              </div>
            </div>

            <style>{`
              @keyframes kwSlideIn {
                0% { transform: translateX(100%); }
                100% { transform: translateX(0); }
              }
              @keyframes kwFadeIn {
                0% { opacity: 0; }
                100% { opacity: 1; }
              }
            `}</style>
          </div>
        );
      })()}

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código, nombre, RUT o teléfono..."
            className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap p-3 bg-indigo-50 border border-indigo-200 rounded-xl overflow-x-auto">
          <span className="text-sm font-medium text-indigo-700">{selected.size} seleccionado{selected.size !== 1 ? 's' : ''}</span>
          <span className="text-indigo-300">|</span>
          <span className="text-xs text-indigo-600">Cambiar a:</span>
          {ALL_STATUS_KEYS.map(s => (
            <button key={s} onClick={() => bulkUpdateStatus(s)} disabled={bulkUpdating}
              className={`px-3 py-1 rounded-xl text-xs font-medium transition disabled:opacity-60 ${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].text} hover:opacity-80`}>
              {STATUS_CONFIG[s].label}
            </button>
          ))}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-indigo-500 hover:text-indigo-700">Limpiar</button>
        </div>
      )}

      {/* Mobile Card List & Desktop Table view */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Mobile View: Modern Cards */}
        <div className="block sm:hidden divide-y divide-gray-100">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 space-y-3 animate-pulse">
                <div className="flex justify-between"><div className="h-4 w-24 bg-gray-100 rounded" /><div className="h-4 w-16 bg-gray-100 rounded" /></div>
                <div className="h-4 w-40 bg-gray-100 rounded" />
                <div className="h-4 w-32 bg-gray-100 rounded" />
              </div>
            ))
          ) : paged.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No se encontraron pedidos mayoristas</div>
          ) : (
            paged.map(order => {
              const date = order.CREATEDAT ? new Date(order.CREATEDAT) : new Date(order.$createdAt);
              const ageMs = Date.now() - date.getTime();
              const isOverdue = order.STATUS === 'pending' && ageMs > 3 * 86400000;
              const items = parseItems(order.ITEMS);
              const scfg = STATUS_CONFIG[order.STATUS];
              const statusColor = STATUS_COLORS[order.STATUS]?.color || '#6b7280';
              const ageH = Math.floor(ageMs / 3600000);
              const ageD = Math.floor(ageH / 24);
              const ageStrRel = ageH < 1 ? 'ahora' : ageH < 24 ? `${ageH}h` : `${ageD}d ${ageH % 24}h`;
              const exactTime = date.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
              const ageStr = `${ageStrRel} (${exactTime})`;
              const totalItems = items.reduce((s: number, it: any) => s + (it.qty || 1), 0);

              return (
                <div key={order.$id}
                  className={`relative p-4 hover:bg-gray-50 transition-colors cursor-pointer ${selected.has(order.$id) ? 'bg-indigo-50/60' : isOverdue ? 'bg-red-50/50' : ''}`}
                  onClick={() => setDrawerOrderId(order.$id)}>
                  {/* Status left border */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r" style={{ background: statusColor }} />

                  {/* Row 1: Code + Time + Status */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(order.$id)}
                        onChange={() => toggleSelect(order.$id)}
                        className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer" />
                      <span className="font-mono text-xs text-indigo-600 font-bold">#{order.REQCODE || '—'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400 font-medium">{ageStr}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: STATUS_COLORS[order.STATUS]?.bg || '#f3f4f6', color: statusColor }}>
                        {SHORT_LABEL[order.STATUS] || scfg?.label || order.STATUS}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Customer + Total */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 truncate">{order.CUSTOMERNAME}</p>
                      <p className="text-[11px] text-gray-400 truncate">{order.CUSTOMERPHONE || ''} · {order.COMUNA || '—'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold text-gray-900">{fmt(order.TOTAL)}</p>
                      <p className="text-[10px] text-gray-400">{totalItems} uds · {items.length} art.</p>
                    </div>
                  </div>

                  {/* Row 3: Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isOverdue && <span className="text-[9px] font-bold px-1 py-0.5 bg-red-500 text-white rounded">VENCIDO</span>}
                    {order.PAYMENTPROOFURL && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded border border-emerald-200">💰 COMPROBANTE</span>}
                    {order.CUSTOMERNOTE && <span className="w-2 h-2 rounded-full bg-amber-400" title={order.CUSTOMERNOTE} />}
                    {order.ADMINNOTES && <span className="w-2 h-2 rounded-full bg-blue-400" title="Tiene notas internas" />}
                    {order.SHIPPINGAGENCY && <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">{order.SHIPPINGAGENCY}</span>}
                    {/* Status change button */}
                    <button onClick={(e) => { e.stopPropagation(); setTimelineOrderId(order.$id); }}
                      className="ml-auto text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                      Estado
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View: Modern Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Código</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide hidden lg:table-cell">Agencia</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                  <button onClick={() => toggleSort('total')} className="flex items-center gap-1 ml-auto hover:text-gray-700 transition">
                    Total
                    {sortBy === 'total' ? (sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                  </button>
                </th>
                <th className="text-center px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                  <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-gray-700 transition">
                    Fecha
                    {sortBy === 'date' ? (sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                  </button>
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {[1,2,3,4,5,6,7,8].map(j => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No se encontraron pedidos mayoristas</td></tr>
              ) : (
                paged.map(order => {
                  const date = order.CREATEDAT ? new Date(order.CREATEDAT) : new Date(order.$createdAt);
                  const isUpdating = updatingId === order.$id;
                  const ageMs = Date.now() - date.getTime();
                  const isOverdue = order.STATUS === 'pending' && ageMs > 3 * 86400000;
                  const ageH = Math.floor(ageMs / 3600000);
                  const ageD = Math.floor(ageH / 24);
                  const ageStrRel = ageH < 1 ? 'ahora' : ageH < 24 ? `${ageH}h` : `${ageD}d ${ageH % 24}h`;
                  const exactTime = date.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
                  const ageStr = `${ageStrRel} (${exactTime})`;

                  const items = parseItems(order.ITEMS);
                  const totalItems = items.reduce((s: number, it: any) => s + (it.qty || 1), 0);
                  const statusColor = STATUS_COLORS[order.STATUS]?.color || '#6b7280';

                  return (
                    <React.Fragment key={order.$id}>
                    <tr className={`hover:bg-gray-50/80 transition-colors cursor-pointer ${selected.has(order.$id) ? 'bg-indigo-50/60' : isOverdue ? 'bg-red-50/50' : ''}`}
                      onClick={() => setDrawerOrderId(order.$id)}>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(order.$id)}
                          onChange={() => toggleSelect(order.$id)}
                          className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                          <div>
                            <p className="font-mono text-xs text-indigo-600 font-bold">#{order.REQCODE || '—'}</p>
                            <p className="text-[10px] text-gray-400">{totalItems} uds · {items.length} art.</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-gray-900 truncate max-w-[140px]">{order.CUSTOMERNAME}</p>
                          {isOverdue && <span className="text-[9px] font-bold px-1 py-0.5 bg-red-500 text-white rounded shrink-0">VENCIDO</span>}
                          {order.PAYMENTPROOFURL && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded shrink-0 border border-emerald-200">💰</span>}
                          {order.CUSTOMERNOTE && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title={order.CUSTOMERNOTE} />}
                          {order.ADMINNOTES && <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" title="Tiene notas internas" />}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-gray-400">{order.CUSTOMERPHONE || ''}</p>
                          <span className="text-[10px] text-gray-300">·</span>
                          <span className="text-[10px] text-gray-400">{order.COMUNA || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {order.SHIPPINGAGENCY ? (
                          <span className="px-2 py-0.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 border-indigo-100">
                            {order.SHIPPINGAGENCY}
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-bold text-gray-900">{fmt(order.TOTAL)}</p>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setTimelineOrderId(order.$id)}
                          disabled={isUpdating}
                          className="text-xs font-bold px-2.5 py-1.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 transition hover:opacity-80 inline-flex items-center gap-1.5"
                          style={{ background: STATUS_COLORS[order.STATUS]?.bg || '#f3f4f6', color: statusColor }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                          {SHORT_LABEL[order.STATUS] || STATUS_CONFIG[order.STATUS]?.label || order.STATUS}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-600 font-medium">{date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'America/Santiago' })}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          <span className={`font-semibold ${ageH < 3 ? 'text-indigo-500' : ageH < 24 ? 'text-gray-400' : 'text-gray-300'}`}>{ageStr}</span>
                        </p>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button onClick={async () => {
                          const newId = expandedOrderId === order.$id ? null : order.$id;
                          setExpandedOrderId(newId);
                          // Fetch product locations for this order
                          if (newId) {
                            try {
                              const ids = parseItems(order.ITEMS).map((i: any) => i.id).filter(Boolean) as string[];
                              if (ids.length > 0) {
                                const { databases } = getServices();
                                const { databaseId } = getFirebaseConfig();
                                const locs: Record<string, { section: number | null; gondola: string | null }> = { ...productLocations };
                                for (const pid of ids) {
                                  if (locs[pid]) continue; // already cached
                                  try {
                                    const doc: any = await databases.getDocument(databaseId, PRODUCTS_COLLECTION_ID, pid);
                                    const wh = getWarehouseLocationFromFeatures(doc.FEATURES);
                                    locs[pid] = { section: wh.section, gondola: wh.gondola };
                                  } catch { locs[pid] = { section: null, gondola: null }; }
                                }
                                setProductLocations(locs);
                              }
                            } catch {}
                          }
                        }}
                          className={`p-1.5 rounded-lg transition-colors inline-flex ${expandedOrderId === order.$id ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-indigo-50 text-gray-400 hover:text-indigo-600'}`}>
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {expandedOrderId === order.$id && (
                      <tr className="bg-gray-50/50">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* Items */}
                            <div className="lg:col-span-2">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Productos ({items.length})</p>
                                <button onClick={() => downloadOrderPrint(order)}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition">
                                  <Printer className="w-3 h-3" /> Imprimir / PDF
                                </button>
                              </div>
                              <div className="space-y-1.5">
                                {items.map((it: any, i: number) => {
                                  const loc = it.id ? productLocations[it.id] : null;
                                  return (
                                    <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5 border bg-white border-gray-100">
                                      {it.img ? <img src={it.img} alt="" className="w-9 h-9 object-contain rounded-lg" /> : <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center"><Package className="w-4 h-4 text-gray-300" /></div>}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate text-gray-900">{it.name}</p>
                                        <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                          {it.sku && <span>SKU: <span className="font-mono text-gray-600">{it.sku}</span></span>}
                                          {it.isPack && <span className="bg-purple-50 text-purple-700 px-1 py-0.5 rounded font-bold">Paquete de {it.packQty || 1} un.</span>}
                                          <span>{fmt(it.price)} c/u</span>
                                        </div>
                                      </div>
                                      {loc && loc.section !== null && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-bold shrink-0">
                                          <MapPin className="w-2.5 h-2.5" /> G{loc.gondola} S{loc.section}
                                        </span>
                                      )}
                                      <div className="text-right flex-shrink-0">
                                        <p className="text-xs text-gray-400">×{it.qty}</p>
                                        <p className="text-sm font-bold text-gray-900">{fmt(it.total || it.price * it.qty)}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Payment proof */}
                              {order.PAYMENTPROOFURL && (
                                <div className="mt-3">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Comprobante de Pago</p>
                                  <a href={order.PAYMENTPROOFURL} target="_blank" rel="noopener noreferrer" className="inline-block">
                                    {order.PAYMENTPROOFURL.match(/\.pdf|ext=pdf/i) ? (
                                      <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-gray-100 hover:border-emerald-300 transition">
                                        <Download className="w-5 h-5 text-emerald-600" />
                                        <span className="text-xs font-bold text-emerald-700">Ver comprobante (PDF)</span>
                                      </div>
                                    ) : (
                                      <img src={order.PAYMENTPROOFURL} alt="Comprobante" className="max-h-48 rounded-xl border border-gray-100 hover:border-emerald-300 transition" />
                                    )}
                                  </a>
                                </div>
                              )}
                            </div>
                            {/* Details sidebar */}
                            <div className="space-y-3">
                              <div className="bg-white rounded-xl border border-gray-100 p-3">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Envío</p>
                                <p className="text-sm text-gray-800 font-medium">{order.ADDRESS || '—'}</p>
                                <p className="text-xs text-gray-500">{order.COMUNA}{order.REGION ? `, ${order.REGION}` : ''}</p>
                                {order.SHIPPINGAGENCY && <p className="text-xs text-indigo-600 font-semibold mt-1">{order.SHIPPINGAGENCY}</p>}
                                {order.ADDITIONALINFO && <p className="text-[11px] text-gray-500 mt-1.5 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100">{order.ADDITIONALINFO}</p>}
                              </div>
                              <div className="bg-white rounded-xl border border-gray-100 p-3">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Contacto</p>
                                <p className="text-sm text-gray-800 font-medium">{order.CUSTOMERNAME}</p>
                                <p className="text-xs text-gray-500">{order.CUSTOMERPHONE} · {order.CUSTOMEREMAIL}</p>
                                <p className="text-xs text-gray-500">RUT: {order.CUSTOMERRUT || '—'}</p>
                              </div>
                              {order.CUSTOMERNOTE && (
                                <div className="bg-white rounded-xl border border-gray-100 p-3">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Nota del Cliente</p>
                                  <p className="text-sm text-gray-700 bg-amber-50 rounded-lg px-2 py-1.5 border border-amber-100">{order.CUSTOMERNOTE}</p>
                                </div>
                              )}
                              {/* Admin notes (editable) */}
                              <div className="bg-white rounded-xl border border-gray-100 p-3">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center justify-between">
                                  <span>Notas de Administración</span>
                                  {editingNotesId !== order.$id && (
                                    <button onClick={() => {
                                      setEditingNotesId(order.$id);
                                      setNotesDraft(order.ADMINNOTES || '');
                                    }} className="text-indigo-600 hover:text-indigo-700 text-[10px] font-bold">
                                      Editar
                                    </button>
                                  )}
                                </p>
                                {editingNotesId === order.$id ? (
                                  <div className="space-y-1.5">
                                    <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)}
                                      placeholder="Ej: Stock verificado en bodega principal, esperando transferencia."
                                      className="w-full text-xs p-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" rows={2} />
                                    <div className="flex justify-end gap-1.5">
                                      <button onClick={() => setEditingNotesId(null)} className="px-2.5 py-1 text-[10px] font-bold border border-gray-200 bg-white rounded-lg text-gray-500 hover:bg-gray-100 transition">
                                        Cancelar
                                      </button>
                                      <button onClick={() => saveAdminNotes(order.$id)} disabled={savingNotes}
                                        className="px-2.5 py-1 text-[10px] font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-1">
                                        <Save className="w-3 h-3" /> Guardar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-700">
                                    {order.ADMINNOTES || <span className="text-gray-400 italic text-xs">No hay notas agregadas.</span>}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && !isLoading && (() => {
              const totalSum = filtered.reduce((s, o) => s + o.TOTAL, 0);
              const paidOrders = filtered.filter(o => PAID_GROUP_STATUSES.includes(o.STATUS));
              const avgTicket = paidOrders.length > 0 ? Math.round(paidOrders.reduce((s, o) => s + o.TOTAL, 0) / paidOrders.length) : 0;
              return (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-gray-500">
                      <p>{filtered.length} pedido{filtered.length !== 1 ? 's' : ''}</p>
                      {(() => {
                        const byCustomer: Record<string, { name: string; total: number }> = {};
                        for (const o of filtered) {
                          const key = o.CUSTOMERRUT || o.CUSTOMERNAME || 'anon';
                          if (!byCustomer[key]) byCustomer[key] = { name: o.CUSTOMERNAME || key, total: 0 };
                          byCustomer[key].total += o.TOTAL;
                        }
                        const top = Object.values(byCustomer).sort((a, b) => b.total - a.total)[0];
                        return top && Object.keys(byCustomer).length > 1 ? (
                          <p className="text-[10px] text-gray-400 mt-0.5 font-normal truncate max-w-[120px]">
                            Top: {top.name.split(' ')[0]} {fmt(top.total)}
                          </p>
                        ) : null;
                      })()}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell" />
                    <td className="px-4 py-3 text-right">
                      <p className="font-bold text-gray-900">{fmt(totalSum)}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-400">
                      {fmt(paidOrders.reduce((s, o) => s + o.TOTAL, 0))} pagados
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400">
                      {avgTicket > 0 && <p>{`∅ ${fmt(avgTicket)}`}</p>}
                      {(() => {
                        const totalItems = filtered.reduce((s, o) => { try { return s + (JSON.parse(o.ITEMS || '[]') as any[]).reduce((a: number, i: any) => a + (i.qty || 1), 0); } catch { return s; } }, 0);
                        const avgItems = filtered.length > 0 ? (totalItems / filtered.length).toFixed(1) : null;
                        return avgItems ? <p className="text-gray-400">∅ {avgItems} uds/pedido</p> : null;
                      })()}
                    </td>
                    <td className="hidden" />
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>

        <EpicPagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={(page) => setCurrentPage(page)}
          isLoading={isLoading}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          className="border-t border-gray-100"
        />
      </div>
    </div>
  );
}
