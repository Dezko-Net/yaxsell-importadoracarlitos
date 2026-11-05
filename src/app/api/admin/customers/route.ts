import { NextResponse } from 'next/server';
import {
  dedupeUserDocuments,
  isRegisteredUserProfile,
  mergeAuthUsersWithProfiles,
  type UserProfileDoc,
} from '@/lib/users-db';
import {
  aggregateOrdersForUser,
  calculateLoyaltyFromPaidOrders,
  emptyOrderStats,
  estimatePoints,
  pickPrefs,
  type AdminCustomerRow,
} from '@/lib/admin-customers';
import type { LoyaltyLevelId } from '@/lib/loyalty-levels';
import { getLevelMeta } from '@/lib/loyalty-levels';
import { getAdminDb } from '@/lib/db-server';

export const dynamic = 'force-dynamic';

// Cache server-side global (TTL 15 minutos) compartido entre todos los workers
const gCustomers = globalThis as unknown as {
  __yaxsellAdminCustomersCache?: { data: any; ts: number } | null;
};
const SERVER_CACHE_TTL = 15 * 60 * 1000;

type AuthUserFull = {
  $id: string;
  email?: string;
  name?: string;
  phone?: string;
  status?: boolean;
  labels?: string[];
  emailVerification?: boolean;
  phoneVerification?: boolean;
  registration?: string;
  accessedAt?: string;
  passwordUpdate?: string;
  $createdAt?: string;
  prefs?: Record<string, unknown>;
};

// Firebase Auth no tiene el mismo modelo que Appwrite Auth.
// Por ahora, usamos los perfiles de la colección 'users' y 'app_users'.
// Las prefs se guardan en el documento de la colección 'users'.

async function listProfiles(): Promise<UserProfileDoc[]> {
  const db = getAdminDb();
  const all: UserProfileDoc[] = [];
  try {
    const snap = await db.collection('users').orderBy('createdAt', 'desc').limit(500).get();
    for (const doc of snap.docs) {
      const data = doc.data() as any;
      all.push({
        $id: doc.id,
        $createdAt: data.createdAt?.toString?.() || data.createdAt || '',
        ...data,
      } as UserProfileDoc);
    }
  } catch (e) {
    console.error('[customers] Error listing profiles:', e);
  }
  return all;
}

async function listAppUsers(): Promise<AuthUserFull[]> {
  const db = getAdminDb();
  const all: AuthUserFull[] = [];
  try {
    const snap = await db.collection('app_users').orderBy('createdAt', 'desc').limit(500).get();
    for (const doc of snap.docs) {
      const data = doc.data() as any;
      all.push({
        $id: doc.id,
        email: data.email,
        name: data.displayName,
        phone: data.phone,
        status: data.status !== false,
        labels: data.labels || [],
        emailVerification: data.emailVerified || false,
        phoneVerification: data.phoneVerified || false,
        registration: data.createdAt?.toString?.() || '',
        accessedAt: data.lastLoginAt || '',
        passwordUpdate: '',
        $createdAt: data.createdAt?.toString?.() || '',
        prefs: data.prefs || {},
      });
    }
  } catch (e) {
    console.error('[customers] Error listing app_users:', e);
  }
  return all;
}

type OrderDoc = {
  $id: string;
  USERID?: string;
  STATUS?: string;
  TOTAL?: number;
  CREATEDAT?: number;
  $createdAt?: string;
  CUSTOMERPHONE?: string;
  CUSTOMERNAME?: string;
  CUSTOMEREMAIL?: string;
};

async function listAllOrders(): Promise<OrderDoc[]> {
  const db = getAdminDb();
  const all: OrderDoc[] = [];
  try {
    const snap = await db.collection('orders').limit(500).get();
    for (const doc of snap.docs) {
      const data = doc.data() as any;
      if (data._seed) continue;
      all.push({
        $id: doc.id,
        USERID: data.USERID,
        STATUS: data.STATUS,
        TOTAL: data.TOTAL,
        CREATEDAT: data.CREATEDAT,
        $createdAt: data.$createdAt || data.createdAt?.toString?.() || '',
        CUSTOMERPHONE: data.CUSTOMERPHONE || '',
        CUSTOMERNAME: data.CUSTOMERNAME || '',
        CUSTOMEREMAIL: data.CUSTOMEREMAIL || '',
      });
    }
  } catch (e) {
    console.error('[customers] Error listing orders:', e);
  }
  // Tambien incluir vendor_orders (pedidos de tiendas aliadas, incluyendo WhatsApp)
  try {
    const vsnap = await db.collection('vendor_orders').limit(500).get();
    for (const doc of vsnap.docs) {
      const data = doc.data() as any;
      all.push({
        $id: doc.id,
        USERID: data.USERID,
        STATUS: data.STATUS,
        TOTAL: data.TOTAL,
        CREATEDAT: data.CREATEDAT,
        $createdAt: data.$createdAt || data.createdAt?.toString?.() || '',
        CUSTOMERPHONE: data.CUSTOMERPHONE || '',
        CUSTOMERNAME: data.CUSTOMERNAME || '',
        CUSTOMEREMAIL: data.CUSTOMEREMAIL || '',
      });
    }
  } catch (e) {
    console.error('[customers] Error listing vendor_orders:', e);
  }
  return all;
}

// Extrae clientes de WhatsApp desde las órdenes con ORDER_SOURCE=whatsapp o PAYMENTMETHOD=WhatsApp
function extractWhatsAppCustomers(orders: OrderDoc[]): AdminCustomerRow[] {
  const PAID_STATUSES = ['paid', 'payment_confirmed', 'negotiation', 'shipped', 'delivered'];
  const phoneMap = new Map<string, { name: string; orders: OrderDoc[]; firstAt: string; lastAt: string }>();

  for (const o of orders) {
    const phone = (o.CUSTOMERPHONE || '').replace(/\D/g, '');
    if (!phone) continue;
    // Solo contar pedidos pagados/confirmados
    const status = (o.STATUS || '').toLowerCase();
    if (!PAID_STATUSES.includes(status)) continue;
    // Detectar WhatsApp: sin USERID real o sin email (guest/whatsapp)
    const isWa = !o.USERID || o.USERID === 'catalogo-guest' || !o.CUSTOMEREMAIL;
    if (!isWa) continue;

    const existing = phoneMap.get(phone);
    if (existing) {
      existing.orders.push(o);
      const t = o.$createdAt || '';
      if (t > existing.lastAt) existing.lastAt = t;
      if (t && (!existing.firstAt || t < existing.firstAt)) existing.firstAt = t;
    } else {
      phoneMap.set(phone, {
        name: o.CUSTOMERNAME || `+${phone}`,
        orders: [o],
        firstAt: o.$createdAt || '',
        lastAt: o.$createdAt || '',
      });
    }
  }

  const rows: AdminCustomerRow[] = [];
  for (const [phone, info] of phoneMap) {
    // Calcular stats directamente (no usar aggregateOrdersForUser porque filtra por USERID)
    const myOrders = info.orders;
    const orderStats = emptyOrderStats();
    orderStats.total = myOrders.length;
    for (const o of myOrders) {
      const status = (o.STATUS || 'pending').toLowerCase();
      const total = Number(o.TOTAL) || 0;
      orderStats.revenueAll += total;
      if (['paid', 'payment_confirmed', 'negotiation', 'shipped', 'delivered'].includes(status)) {
        orderStats.revenuePaid += total;
        if (status === 'paid' || status === 'payment_confirmed') orderStats.paid++;
        if (status === 'shipped') orderStats.shipped++;
        if (status === 'delivered') orderStats.delivered++;
      } else if (status === 'pending' || status === 'verification_pending') {
        orderStats.pending++;
      } else if (status === 'cancelled') {
        orderStats.cancelled++;
      }
    }
    orderStats.lastOrderAt = info.lastAt || null;
    orderStats.firstOrderAt = info.firstAt || null;

    rows.push({
      $id: `wa:${phone}`,
      userId: phone,
      email: '',
      name: info.name,
      phone: `+${phone}`,
      region: '',
      comuna: '',
      address: '',
      isWholesale: false,
      isBanned: false,
      adminNotes: '',
      profileCreatedAt: info.firstAt || info.lastAt,
      authCreatedAt: '',
      lastAccessAt: info.lastAt,
      registrationAt: '',
      passwordUpdatedAt: '',
      emailVerified: false,
      phoneVerified: true,
      authStatus: 'whatsapp',
      authLabels: [],
      prefs: {},
      loyaltyStored: 'bronze',
      loyaltyCalculated: 'bronze',
      loyaltyName: '—',
      pointsEstimate: 0,
      orders: orderStats,
      hasProfileDoc: false,
      isAuthOnly: false,
      registrationType: 'whatsapp',
    });
  }

  return rows.sort((a, b) => new Date(b.profileCreatedAt).getTime() - new Date(a.profileCreatedAt).getTime());
}

function buildCustomerRow(
  profile: UserProfileDoc,
  authById: Map<string, AuthUserFull>,
  orders: OrderDoc[],
): AdminCustomerRow {
  const uid = profile.userId?.trim() || (profile.$id.startsWith('auth:') ? profile.$id.slice(5) : profile.$id);
  const auth = authById.get(uid);
  const prefsRaw = auth?.prefs || {};
  const prefs = pickPrefs(prefsRaw);

  const orderStats = aggregateOrdersForUser(orders, uid);
  const paidCount = orders.filter(o =>
    o.USERID === uid &&
    ['paid', 'payment_confirmed', 'negotiation', 'shipped', 'delivered'].includes((o.STATUS || '').toLowerCase())
  ).length;
  const loyaltyCalculated = calculateLoyaltyFromPaidOrders(paidCount);
  const loyaltyStored = (String(prefs.loyaltyLevel || 'bronze') as LoyaltyLevelId);
  const loyaltyEffective = loyaltyCalculated;
  const meta = getLevelMeta(loyaltyEffective);

  return {
    $id: profile.$id,
    userId: uid,
    email: (profile.email || auth?.email || '').trim(),
    name: profile.name || auth?.name || profile.email?.split('@')[0] || 'Sin nombre',
    phone: profile.phone || auth?.phone || prefs.phone as string | undefined,
    region: profile.region,
    comuna: profile.comuna,
    address: profile.address,
    isWholesale: Boolean(profile.isWholesale),
    isBanned: Boolean(profile.isBanned),
    adminNotes: profile.adminNotes,
    profileCreatedAt: profile.$createdAt,
    authCreatedAt: auth?.$createdAt,
    lastAccessAt: auth?.accessedAt,
    registrationAt: auth?.registration,
    passwordUpdatedAt: auth?.passwordUpdate,
    emailVerified: Boolean(auth?.emailVerification),
    phoneVerified: Boolean(auth?.phoneVerification),
    authStatus: auth?.status === false ? 'bloqueado_auth' : auth ? 'activo' : 'sin_auth',
    authLabels: auth?.labels || [],
    prefs,
    loyaltyStored,
    loyaltyCalculated,
    loyaltyName: meta.name,
    pointsEstimate: estimatePoints(orderStats.revenuePaid, loyaltyEffective) + Number(prefs.pointsAdjustment || 0),
    orders: orderStats,
    hasProfileDoc: !profile.$id.startsWith('auth:'),
    isAuthOnly: profile.$id.startsWith('auth:'),
    registrationType: (auth?.phone && !auth?.email) ? 'whatsapp' : (auth?.email ? 'web' : (profile.phone && !profile.email ? 'whatsapp' : (profile.email ? 'web' : 'unknown'))),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1' || searchParams.get('force') === 'true';

    // Cache server-side global
    if (!force && gCustomers.__yaxsellAdminCustomersCache && Date.now() - gCustomers.__yaxsellAdminCustomersCache.ts < SERVER_CACHE_TTL) {
      return NextResponse.json(gCustomers.__yaxsellAdminCustomersCache.data, {
        headers: { 'Cache-Control': 'private, max-age=300' }
      });
    }

    const [profiles, authUsers, orders] = await Promise.all([
      listProfiles(),
      listAppUsers(),
      listAllOrders(),
    ]);

    const merged = mergeAuthUsersWithProfiles(profiles, authUsers);
    const registered = dedupeUserDocuments(merged).filter(isRegisteredUserProfile);

    const authById = new Map(authUsers.map(a => [a.$id, a]));

    const rows: AdminCustomerRow[] = registered.map(p =>
      buildCustomerRow(p, authById, orders),
    );

    // Agregar clientes de WhatsApp extraídos de órdenes sin USERID
    const existingIds = new Set(rows.map(r => r.userId));
    const waCustomers = extractWhatsAppCustomers(orders).filter(wa => !existingIds.has(wa.userId));
    rows.push(...waCustomers);

    // Detectar clientes "ambos" (web + whatsapp) cruzando telefonos en ordenes
    // Un telefono es "ambos" si aparece en ordenes con email (web) y sin email (whatsapp)
    const PAID_STATUSES = ['paid', 'payment_confirmed', 'negotiation', 'shipped', 'delivered'];
    const phonesWithWeb = new Set<string>();
    const phonesWithWa = new Set<string>();
    for (const o of orders) {
      const phone = (o.CUSTOMERPHONE || '').replace(/\D/g, '');
      if (!phone) continue;
      const status = (o.STATUS || '').toLowerCase();
      if (!PAID_STATUSES.includes(status)) continue;
      if (o.CUSTOMEREMAIL) {
        phonesWithWeb.add(phone);
      } else {
        phonesWithWa.add(phone);
      }
    }
    const bothPhones = new Set<string>();
    for (const p of phonesWithWeb) {
      if (phonesWithWa.has(p)) bothPhones.add(p);
    }

    // Marcar clientes existentes como "ambos"
    for (const row of rows) {
      const phone = (row.phone || '').replace(/\D/g, '');
      if (phone && bothPhones.has(phone)) {
        (row as any).hasBothChannels = true;
      }
    }

    // Filtrar: solo clientes con al menos 1 pedido
    const withOrders = rows.filter(r => r.orders.total > 0);

    withOrders.sort((a, b) => new Date(b.profileCreatedAt).getTime() - new Date(a.profileCreatedAt).getTime());

    const responseData = {
      users: withOrders,
      total: withOrders.length,
      passwordNote: 'Los usuarios se gestionan con Firebase Auth.',
    };

    // Guardar en cache server-side global
    gCustomers.__yaxsellAdminCustomersCache = { data: responseData, ts: Date.now() };

    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'private, max-age=300' }
    });
  } catch (e) {
    return NextResponse.json(
      { users: [], error: e instanceof Error ? e.message : 'Error al cargar clientes' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    gCustomers.__yaxsellAdminCustomersCache = null; // Invalidar cache al actualizar
    const body = await request.json();
    const userId = body.userId || body.id || body.uid;
    const targetPointsRaw = body.targetPoints;
    const targetPoints = typeof targetPointsRaw === 'number'
      ? targetPointsRaw
      : parseInt(String(targetPointsRaw || '0'), 10);

    if (!userId || isNaN(targetPoints)) {
      return NextResponse.json({
        error: `Faltan parámetros obligatorios. userId recibido: "${userId || ''}", targetPoints recibido: "${targetPointsRaw ?? ''}"`
      }, { status: 400 });
    }

    const db = getAdminDb();

    // 1. Calcular basePoints basado en pedidos
    const ordersSnap = await db.collection('orders')
      .where('USERID', '==', userId)
      .where('STATUS', 'in', ['paid', 'payment_confirmed', 'negotiation', 'shipped', 'delivered'])
      .get();

    const paidOrdersCount = ordersSnap.size;
    const totalSpent = ordersSnap.docs.reduce((sum, doc) => sum + (Number(doc.data().TOTAL) || 0), 0);

    const LEVELS = [
      { id: 'bronze', name: 'Bronce', requiredOrders: 0, pointsMultiplier: 1 },
      { id: 'silver', name: 'Plata', requiredOrders: 5, pointsMultiplier: 1.5 },
      { id: 'gold', name: 'Oro', requiredOrders: 10, pointsMultiplier: 2 },
      { id: 'diamond', name: 'Diamante', requiredOrders: 20, pointsMultiplier: 3 },
      { id: 'ruby', name: 'Ruby', requiredOrders: 30, pointsMultiplier: 5 },
    ];

    let calculatedLevel = 'bronze';
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (paidOrdersCount >= LEVELS[i].requiredOrders) {
        calculatedLevel = LEVELS[i].id;
        break;
      }
    }

    const levelIndex = LEVELS.findIndex(l => l.id === calculatedLevel);
    const pointsMultiplier = LEVELS[levelIndex >= 0 ? levelIndex : 0].pointsMultiplier;
    const basePoints = Math.floor((totalSpent / 1000) * pointsMultiplier);
    const pointsAdjustment = targetPoints - basePoints;

    // 2. Actualizar prefs en el documento del usuario
    const userDoc = db.collection('users').doc(userId);
    const userSnap = await userDoc.get();
    if (userSnap.exists) {
      const currentPrefs = (userSnap.data() as any)?.prefs || {};
      await userDoc.update({
        prefs: {
          ...currentPrefs,
          pointsAdjustment,
        },
      });
    } else {
      // Intentar en app_users
      const appUserDoc = db.collection('app_users').doc(userId);
      const appUserSnap = await appUserDoc.get();
      if (appUserSnap.exists) {
        const currentPrefs = (appUserSnap.data() as any)?.prefs || {};
        await appUserDoc.update({
          prefs: {
            ...currentPrefs,
            pointsAdjustment,
          },
        });
      }
    }

    return NextResponse.json({ success: true, pointsAdjustment });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error al actualizar puntos' },
      { status: 500 }
    );
  }
}
