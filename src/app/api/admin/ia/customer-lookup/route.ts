import { NextRequest, NextResponse } from 'next/server';
import { serverListDocuments, getHeaders, getServerConfig } from '@/lib/db-server';
import { USERS_COLLECTION_ID, ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID } from '@/lib/db';
import { MEDIA_BUCKET_ID, MEDIA_PREFIXES } from '@/lib/db';

export interface OrderDetail {
  id: string;
  code: string;
  status: string;
  total: number;
  date: string;
  items: string;
}

export interface CustomerInfo {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  orderCount: number;
  totalSpent: number;
  registered: boolean;
  orders?: OrderDetail[];
}

function phoneVariants(raw: string): string[] {
  const d = raw.replace(/\D/g, '');
  const variants = new Set<string>([d]);
  if (d.startsWith('56') && d.length > 9) {
    variants.add(d.slice(2));
    variants.add(`+${d}`);
    variants.add(`+56${d.slice(2)}`);
  } else if (!d.startsWith('56') && d.length >= 8) {
    variants.add(`56${d}`);
    variants.add(`+56${d}`);
    variants.add(`+${d}`);
  }
  return Array.from(variants);
}

async function getAuthUserPrefs(userId: string): Promise<{ avatarFileId?: string } | null> {
  try {
    const { endpoint, projectId } = getServerConfig();
    const res = await fetch(`${endpoint}/users/${userId}`, { headers: getHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.prefs || null) as { avatarFileId?: string } | null;
  } catch {
    return null;
  }
}

function buildAvatarUrl(fileId: string): string {
  const { endpoint, projectId } = getServerConfig();
      const path = fileId;
  return `${endpoint}/storage/buckets/${MEDIA_BUCKET_ID}/files/${path}/view?project=${projectId}`;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Stock Confirmado',
  pending_stock: 'Stock Confirmado',
  processing: 'Stock Confirmado',
  paid: 'Stock Confirmado',
  payment_review: 'Revisando Pago',
  payment_confirmed: 'Pago Confirmado',
  negotiation: 'En negociación',
  shipped: 'Embalado',
  delivered: 'Entregado a Agencia',
  cancelled: 'Cancelado',
};

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('phones') || '';
  const withDetail = req.nextUrl.searchParams.get('detail') === 'true';
  if (!raw.trim()) return NextResponse.json({ customers: {} });

  const phones = raw.split(',').map(p => p.trim()).filter(Boolean).slice(0, 50);

  const result: Record<string, CustomerInfo> = {};

  // Collect all phone variants for a single orders query
  const allVariants: string[] = [];
  for (const phone of phones) {
    allVariants.push(...phoneVariants(phone));
  }

  // Firestore `in` queries accept at most 30 values. Query the main and vendor
  // order collections in safe batches so older customers are found too.
  let allOrders: any[] = [];
  const uniqueVariants = Array.from(new Set(allVariants));
  const variantBatches: string[][] = [];
  for (let i = 0; i < uniqueVariants.length; i += 30) variantBatches.push(uniqueVariants.slice(i, i + 30));
  const seenOrderIds = new Set<string>();
  for (const collectionId of [ORDERS_COLLECTION_ID, VENDOR_ORDERS_COLLECTION_ID]) {
    const batchResults = await Promise.all(variantBatches.map(async (batch) => {
      try {
        // Use typed constraints so phone strings are not coerced to numbers by
        // the legacy JSON query adapter.
        const ordersRes = await serverListDocuments(collectionId, [
          { field: 'CUSTOMERPHONE', op: 'in', value: batch },
          { limit: 100 },
        ]);
        return ordersRes.documents as any[];
      } catch {
        return [];
      }
    }));
    for (const order of batchResults.flat()) {
      const key = `${collectionId}:${order.$id || ''}`;
      if (!seenOrderIds.has(key)) {
        seenOrderIds.add(key);
        allOrders.push(order);
      }
    }
  }
  allOrders.sort((a, b) => {
    const dateA = new Date(String(a.$createdAt || a.createdAt || a.CREATEDAT || 0)).getTime() || Number(a.CREATEDAT) || 0;
    const dateB = new Date(String(b.$createdAt || b.createdAt || b.CREATEDAT || 0)).getTime() || Number(b.CREATEDAT) || 0;
    return dateB - dateA;
  });

  await Promise.all(phones.map(async (phone) => {
    const variants = phoneVariants(phone);

    let name: string | null = null;
    let email: string | null = null;
    let avatarUrl: string | null = null;
    let registered = false;

    try {
      const usersRes = await serverListDocuments(USERS_COLLECTION_ID, [
        { field: 'phone', op: 'in', value: variants },
        { limit: 1 },
      ]);
      const userDoc = usersRes.documents[0] as any;
      if (userDoc) {
        name = userDoc.name || null;
        email = userDoc.email || null;
        registered = true;

        if (userDoc.userId) {
          const prefs = await getAuthUserPrefs(userDoc.userId);
          if (prefs?.avatarFileId) {
            avatarUrl = buildAvatarUrl(prefs.avatarFileId);
          }
        }
      }
    } catch { /* silently ignore */ }

    // Filter orders from the single fetch for this phone
    const cleanPhone = phone.replace(/\D/g, '');
    const docs = allOrders.filter(o => {
      const oPhone = String(o.CUSTOMERPHONE || '').replace(/\D/g, '');
      if (oPhone) {
        if (oPhone === cleanPhone) return true;
        const tailA = oPhone.slice(-8);
        const tailB = cleanPhone.slice(-8);
        if (tailA.length === 8 && tailA === tailB) return true;
      }
      const linked: string[] = Array.isArray(o.LINKED_WHATSAPP) ? o.LINKED_WHATSAPP : [];
      return linked.some((p: string) => {
        const lp = p.replace(/\D/g, '');
        if (lp === cleanPhone) return true;
        const lt = lp.slice(-8);
        return lt.length === 8 && lt === cleanPhone.slice(-8);
      });
    });

    let orderCount = 0;
    let totalSpent = 0;
    let orders: OrderDetail[] | undefined;
    orderCount = docs.length;
    if (withDetail) orders = [];
    for (const o of docs) {
      const status = String(o.STATUS || o.status || 'pending');
      const total = Number(o.TOTAL || o.total || 0);
      if (!['pending', 'cancelled'].includes(status)) totalSpent += total;
      if (!name && o.CUSTOMERNAME) name = String(o.CUSTOMERNAME);
      if (!email && o.CUSTOMEREMAIL) email = String(o.CUSTOMEREMAIL);
      if (withDetail && orders) {
        orders.push({
          id: String(o.$id || ''),
          code: String(o.ORDERCODE || String(o.$id || '').slice(-6).toUpperCase()),
          status: STATUS_LABELS[status] || status,
          total,
          date: o.$createdAt ? new Date(String(o.$createdAt)).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—',
          items: (() => {
            try {
              const parsed = JSON.parse(o.ITEMS || '[]');
              if (Array.isArray(parsed)) return parsed.slice(0, 3).map((i: any) => i.name || i.NAME || '').filter(Boolean).join(', ') + (parsed.length > 3 ? ` +${parsed.length - 3}` : '');
            } catch {}
            return '';
          })(),
        });
      }
    }

    result[phone] = { name, email, avatarUrl, orderCount, totalSpent, registered, ...(withDetail ? { orders } : {}) };
  }));

  return NextResponse.json({ customers: result });
}
