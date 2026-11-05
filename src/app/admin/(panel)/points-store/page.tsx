'use client';

import { useCallback, useEffect, useState } from 'react';
import { Query, ID } from '@/lib/db';
import { getServices, getFirebaseConfig, POINTS_STORE_COLLECTION_ID } from '@/lib/db';
import { Plus, Pencil, Trash2, X, RefreshCw, AlertTriangle, Coins, ToggleLeft, ToggleRight } from 'lucide-react';
import type { PointsStoreItemType } from '@/services/pointsStoreService';

interface Item {
  $id: string;
  TITLE: string;
  DESCRIPTION?: string;
  TYPE: PointsStoreItemType;
  POINTSCOST: number;
  IMAGEURL?: string;
  LINK?: string;
  COUPONCODE?: string;
  PRODUCTID?: string;
  ISACTIVE: boolean;
  SORTORDER?: number;
  STOCK?: number;
}

const TYPES: { value: PointsStoreItemType; label: string }[] = [
  { value: 'product', label: 'Producto' },
  { value: 'coupon', label: 'Cupón' },
  { value: 'offer', label: 'Oferta' },
  { value: 'gift', label: 'Regalo' },
  { value: 'shipping', label: 'Envío' },
];

const empty: Partial<Item> = {
  TITLE: '',
  DESCRIPTION: '',
  TYPE: 'coupon',
  POINTSCOST: 500,
  IMAGEURL: '',
  LINK: '',
  COUPONCODE: '',
  PRODUCTID: '',
  ISACTIVE: true,
  SORTORDER: 0,
  STOCK: -1,
};

export default function PointsStoreAdminPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; data: Partial<Item> } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const res = await databases.listDocuments(databaseId, POINTS_STORE_COLLECTION_ID, [
        Query.orderAsc('$createdAt'),
        Query.limit(100),
      ]);
      setItems(res.documents as unknown as Item[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar';
      if (msg.includes('Collection') || msg.includes('collection') || msg.includes('404')) {
        setError('Crea la colección "points_store_items" en Appwrite con: TITLE, DESCRIPTION, TYPE, POINTSCOST, IMAGEURL, LINK, COUPONCODE, PRODUCTID, ISACTIVE, SORTORDER, STOCK');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!modal?.data.TITLE?.trim()) return alert('Título obligatorio');
    setSaving(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const d = modal.data;
      const payload: Record<string, any> = {
        TITLE: d.TITLE!.trim(),
        DESCRIPTION: d.DESCRIPTION || '',
        TYPE: d.TYPE || 'coupon',
        POINTSCOST: Number(d.POINTSCOST) || 0,
        IMAGEURL: d.IMAGEURL || '',
        LINK: d.LINK || '',
        COUPONCODE: d.COUPONCODE || '',
        PRODUCTID: d.PRODUCTID || '',
        ISACTIVE: d.ISACTIVE !== false,
      };
      // Solo agregar si existen en el schema
      if (d.SORTORDER != null) payload.SORTORDER = Number(d.SORTORDER) || 0;
      if (d.STOCK != null) payload.STOCK = Number(d.STOCK) ?? -1;
      if (modal.mode === 'add') {
        await databases.createDocument(databaseId, POINTS_STORE_COLLECTION_ID, ID.unique(), payload);
      } else if (d.$id) {
        await databases.updateDocument(databaseId, POINTS_STORE_COLLECTION_ID, d.$id, payload);
      }
      setModal(null);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este ítem?')) return;
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.deleteDocument(databaseId, POINTS_STORE_COLLECTION_ID, id);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error');
    }
  }

  async function toggleActive(item: Item) {
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, POINTS_STORE_COLLECTION_ID, item.$id, { ISACTIVE: !item.ISACTIVE });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error');
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#111' }}>Tienda de puntos</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>Productos, cupones, ofertas y regalos canjeables</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={load} style={btnSec}><RefreshCw size={16} /> Actualizar</button>
          <button type="button" onClick={() => setModal({ mode: 'add', data: { ...empty } })} style={btnPri}><Plus size={16} /> Nuevo ítem</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, marginBottom: 16, display: 'flex', gap: 10 }}>
          <AlertTriangle size={20} color="#dc2626" />
          <p style={{ margin: 0, fontSize: 13, color: '#991b1b' }}>{error}</p>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#9ca3af' }}>Cargando...</p>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb' }}>
          <Coins size={40} color="#e396bf" style={{ marginBottom: 12 }} />
          <p style={{ margin: 0, fontWeight: 700 }}>Sin ítems</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => (
            <div key={item.$id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb' }}>
              {item.IMAGEURL ? (
                <img src={item.IMAGEURL} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 12, background: '#fdf2f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Coins size={24} color="#e396bf" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{item.TITLE}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f3f4f6', color: '#6b7280', textTransform: 'uppercase' }}>{item.TYPE}</span>
                  {!item.ISACTIVE && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>Inactivo</span>}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>{item.DESCRIPTION || '—'}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 700, color: '#e396bf' }}>{item.POINTSCOST.toLocaleString()} pts</p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => toggleActive(item)} style={btnIcon}>
                  {item.ISACTIVE ? <ToggleRight size={18} color="#10b981" /> : <ToggleLeft size={18} color="#9ca3af" />}
                </button>
                <button type="button" onClick={() => setModal({ mode: 'edit', data: { ...item } })} style={btnIcon}><Pencil size={16} /></button>
                <button type="button" onClick={() => remove(item.$id)} style={btnIcon}><Trash2 size={16} color="#ef4444" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{modal.mode === 'add' ? 'Nuevo ítem' : 'Editar ítem'}</h2>
              <button type="button" onClick={() => setModal(null)} style={btnIcon}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Título *" value={modal.data.TITLE || ''} onChange={(v) => setModal({ ...modal, data: { ...modal.data, TITLE: v } })} />
              <Field label="Descripción" value={modal.data.DESCRIPTION || ''} onChange={(v) => setModal({ ...modal, data: { ...modal.data, DESCRIPTION: v } })} />
              <label style={lbl}>Tipo
                <select value={modal.data.TYPE || 'coupon'} onChange={(e) => setModal({ ...modal, data: { ...modal.data, TYPE: e.target.value as PointsStoreItemType } })} style={inp}>
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <Field label="Costo en puntos *" type="number" value={String(modal.data.POINTSCOST ?? 0)} onChange={(v) => setModal({ ...modal, data: { ...modal.data, POINTSCOST: Number(v) } })} />
              <Field label="URL imagen" value={modal.data.IMAGEURL || ''} onChange={(v) => setModal({ ...modal, data: { ...modal.data, IMAGEURL: v } })} />
              <Field label="Enlace" value={modal.data.LINK || ''} onChange={(v) => setModal({ ...modal, data: { ...modal.data, LINK: v } })} />
              <Field label="Código cupón" value={modal.data.COUPONCODE || ''} onChange={(v) => setModal({ ...modal, data: { ...modal.data, COUPONCODE: v } })} />
              <Field label="ID producto" value={modal.data.PRODUCTID || ''} onChange={(v) => setModal({ ...modal, data: { ...modal.data, PRODUCTID: v } })} />
              <Field label="Orden" type="number" value={String(modal.data.SORTORDER ?? 0)} onChange={(v) => setModal({ ...modal, data: { ...modal.data, SORTORDER: Number(v) } })} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={modal.data.ISACTIVE !== false} onChange={(e) => setModal({ ...modal, data: { ...modal.data, ISACTIVE: e.target.checked } })} />
                Activo
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button type="button" onClick={() => setModal(null)} style={{ ...btnSec, flex: 1 }}>Cancelar</button>
              <button type="button" onClick={save} disabled={saving} style={{ ...btnPri, flex: 1, opacity: saving ? 0.7 : 1 }}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={lbl}>{label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inp} />
    </label>
  );
}

const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#374151' };
const inp: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 };
const btnPri: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: '#e396bf', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnSec: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13 };
const btnIcon: React.CSSProperties = { padding: 8, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
