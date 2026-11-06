/**
 * db-server.ts — Capa server-side Firebase Admin SDK
 * Reemplaza completamente a appwrite-server.ts y appwrite-admin.ts
 * Solo se usa en Next.js API Routes y Server Components (nunca en el cliente).
 */
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  PRODUCTS_COLLECTION,
  USERS_COLLECTION,
  CATEGORIES_COLLECTION,
  ORDERS_COLLECTION,
  PRODUCTS_COLLECTION_ID,
  INVENTORY_PRODUCTS_COLLECTION_ID,
  CATALOG_PRODUCTS_COLLECTION_ID,
  USERS_COLLECTION_ID,
  CATEGORIES_COLLECTION_ID,
  SUBCATEGORIES_COLLECTION_ID,
  ORDERS_COLLECTION_ID,
  WHOLESALE_ORDERS_COLLECTION_ID,
  APERTURA_SETTINGS_COLLECTION_ID,
  COUPONS_COLLECTION_ID,
  ADDRESSES_COLLECTION_ID,
  ADMIN_CHAT_COLLECTION_ID,
  ADMIN_CHAT_COLLECTION,
  COTIZACION_COLLECTION_ID,
  FAVORITES_COLLECTION_ID,
  CART_ITEMS_COLLECTION_ID,
  CART_SNAPSHOTS_COLLECTION_ID,
  SUPPORT_TICKETS_COLLECTION_ID,
  SUPPORT_TICKETS_COLLECTION,
  STOCK_ALERTS_COLLECTION_ID,
  POINTS_STORE_COLLECTION_ID,
  SEQUENCES_COLLECTION,
  STORE_SETTINGS_COLLECTION,
  STORE_SETTINGS_COLLECTION_ID,
  APERTURA_SETTINGS_COLLECTION,
  VENDORS_COLLECTION_ID,
  VENDOR_ORDERS_COLLECTION_ID,
  AGENCIES_COLLECTION_ID,
  THEME_CONFIG_COLLECTION,
  NOTIFICATIONS_COLLECTION,
  DATABASE_ID,
  MEDIA_BUCKET_ID,
  ORDER_BOX_PHOTOS_BUCKET_ID,
  getFirebaseConfig,
  isFirebaseConfigured,
  saveFirebaseConfig,
  clearFirebaseConfig,
  exportFirebaseConfig,
  FirebaseConfig,
  getServices,
  QueryBuilder,
  Query,
  ID,
  Client,
  Databases,
  Users,
} from './db';
import { trackRead, trackReadsBatch } from './firebase-read-tracker';
import { db as clientDb } from './firebase';
import {
  collection as clientCollection,
  doc as clientDoc,
  getDoc as clientGetDoc,
  getDocs as clientGetDocs,
  setDoc as clientSetDoc,
  addDoc as clientAddDoc,
  updateDoc as clientUpdateDoc,
  deleteDoc as clientDeleteDoc,
  query as createClientQuery,
  where as clientWhere,
  orderBy as clientOrderBy,
  limit as clientLimit,
  startAfter as clientStartAfter,
  QueryConstraint as ClientQueryConstraint,
} from 'firebase/firestore';

export {
  PRODUCTS_COLLECTION,
  USERS_COLLECTION,
  CATEGORIES_COLLECTION,
  ORDERS_COLLECTION,
  PRODUCTS_COLLECTION_ID,
  INVENTORY_PRODUCTS_COLLECTION_ID,
  CATALOG_PRODUCTS_COLLECTION_ID,
  USERS_COLLECTION_ID,
  CATEGORIES_COLLECTION_ID,
  SUBCATEGORIES_COLLECTION_ID,
  ORDERS_COLLECTION_ID,
  WHOLESALE_ORDERS_COLLECTION_ID,
  APERTURA_SETTINGS_COLLECTION_ID,
  COUPONS_COLLECTION_ID,
  ADDRESSES_COLLECTION_ID,
  ADMIN_CHAT_COLLECTION_ID,
  ADMIN_CHAT_COLLECTION,
  COTIZACION_COLLECTION_ID,
  FAVORITES_COLLECTION_ID,
  CART_ITEMS_COLLECTION_ID,
  CART_SNAPSHOTS_COLLECTION_ID,
  SUPPORT_TICKETS_COLLECTION_ID,
  SUPPORT_TICKETS_COLLECTION,
  STOCK_ALERTS_COLLECTION_ID,
  POINTS_STORE_COLLECTION_ID,
  SEQUENCES_COLLECTION,
  STORE_SETTINGS_COLLECTION,
  STORE_SETTINGS_COLLECTION_ID,
  APERTURA_SETTINGS_COLLECTION,
  VENDORS_COLLECTION_ID,
  VENDOR_ORDERS_COLLECTION_ID,
  AGENCIES_COLLECTION_ID,
  THEME_CONFIG_COLLECTION,
  NOTIFICATIONS_COLLECTION,
  DATABASE_ID,
  MEDIA_BUCKET_ID,
  ORDER_BOX_PHOTOS_BUCKET_ID,
  getFirebaseConfig,
  isFirebaseConfigured,
  saveFirebaseConfig,
  clearFirebaseConfig,
  exportFirebaseConfig,
  getServices,
  QueryBuilder,
  Query,
  ID,
  Client,
  Databases,
  Users,
};
export type { FirebaseConfig };

export function getHeaders() {
  return { 'Content-Type': 'application/json' };
}

export function getServerConfig() {
  return {
    endpoint: '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos',
    databaseId: DATABASE_ID,
  };
}

// ============================================
// INICIALIZACIÓN FIREBASE ADMIN (singleton)
// ============================================
let adminApp: App;
let adminDb: Firestore;

export function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  // Intentar inicializar con Service Account JSON del env
  const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credJson) {
    try {
      const cred = typeof credJson === 'string' ? JSON.parse(credJson) : credJson;
      const targetProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos';
      if (cred.project_id && cred.project_id !== targetProjectId) {
        throw new Error(`Admin credential project does not match configured Firebase project (${targetProjectId}).`);
      }
      if (cred.private_key && typeof cred.private_key === 'string') {
        cred.private_key = cred.private_key.replace(/\\n/g, '\n');
      }
      adminApp = initializeApp({
        credential: cert(cred),
        projectId: targetProjectId,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'importadora-carlitos.firebasestorage.app',
      });
      return adminApp;
    } catch (e) {
      console.error('[db-server] Error using GOOGLE_APPLICATION_CREDENTIALS_JSON:', e);
    }
  }

  // Soporte para credenciales individuales (común en Vercel)
  const privateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  if (privateKey && clientEmail) {
    try {
      adminApp = initializeApp({
        credential: cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'importadora-carlitos',
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'importadora-carlitos.firebasestorage.app',
      });
      return adminApp;
    } catch (e) {
      console.error('[db-server] Error initializing with individual Firebase env vars:', e);
    }
  }

  // Fallback: Application Default Credentials
  adminApp = initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'importadora-carlitos.firebasestorage.app',
  });
  return adminApp;
}

let adminAuthFailed = false;

export function isAuthError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.details || err || '');
  const code = err.code;
  return (
    code === 16 ||
    code === 'UNAUTHENTICATED' ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('ACCESS_TOKEN_EXPIRED') ||
    msg.includes('invalid authentication credentials') ||
    msg.includes('OAuth 2 access token')
  );
}

function createClientQueryWrapper(colId: string, constraints: ClientQueryConstraint[] = [], offsetVal = 0, limitVal = 0): any {
  return {
    where(field: string, op: any, val: any) {
      return createClientQueryWrapper(colId, [...constraints, clientWhere(field, op, val)], offsetVal, limitVal);
    },
    orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
      return createClientQueryWrapper(colId, [...constraints, clientOrderBy(field, dir)], offsetVal, limitVal);
    },
    limit(n: number) {
      return createClientQueryWrapper(colId, [...constraints], offsetVal, n);
    },
    offset(n: number) {
      return createClientQueryWrapper(colId, [...constraints], n, limitVal);
    },
    startAfter(cursor: any) {
      return createClientQueryWrapper(colId, [...constraints, clientStartAfter(cursor)], offsetVal, limitVal);
    },
    async get() {
      const activeConstraints = [...constraints];
      if (limitVal > 0) {
        activeConstraints.push(clientLimit(limitVal + offsetVal));
      }
      const cRef = clientCollection(clientDb, colId);
      const q = activeConstraints.length ? createClientQuery(cRef, ...activeConstraints) : createClientQuery(cRef);
      const snap = await clientGetDocs(q);
      let docs = snap.docs.map(d => ({
        id: d.id,
        ref: { id: d.id, path: `${colId}/${d.id}` },
        exists: d.exists(),
        data: () => ({ ...d.data(), $id: d.id }),
      }));
      if (offsetVal > 0) docs = docs.slice(offsetVal);
      if (limitVal > 0 && docs.length > limitVal) docs = docs.slice(0, limitVal);
      return {
        docs,
        size: docs.length,
        empty: docs.length === 0,
        forEach(cb: (d: any) => void) { docs.forEach(cb); },
      };
    },
  };
}

function createClientDbAdapter(): any {
  return {
    collection(colId: string) {
      const queryWrapper = createClientQueryWrapper(colId);
      return {
        ...queryWrapper,
        doc(docId: string) {
          return {
            id: docId,
            path: `${colId}/${docId}`,
            async get() {
              const snap = await clientGetDoc(clientDoc(clientDb, colId, docId));
              return {
                id: snap.id,
                exists: snap.exists(),
                data: () => snap.exists() ? ({ ...snap.data(), $id: snap.id }) : undefined,
              };
            },
            async set(data: any, options?: any) {
              const cleanData = { ...data };
              delete cleanData.$id;
              await clientSetDoc(clientDoc(clientDb, colId, docId), cleanData, options);
            },
            async update(data: any) {
              const cleanData = { ...data };
              delete cleanData.$id;
              await clientUpdateDoc(clientDoc(clientDb, colId, docId), cleanData);
            },
            async delete() {
              await clientDeleteDoc(clientDoc(clientDb, colId, docId));
            },
          };
        },
        async add(data: any) {
          const cleanData = { ...data };
          delete cleanData.$id;
          const ref = await clientAddDoc(clientCollection(clientDb, colId), cleanData);
          return { id: ref.id, path: `${colId}/${ref.id}` };
        },
      };
    },
    async getAll(...refs: any[]) {
      const results = [];
      for (const r of refs) {
        const id = r.id || (r.path ? r.path.split('/').pop() : String(r));
        const colId = r.parent?.id || (r.path ? r.path.split('/')[0] : '');
        if (colId && id) {
          const snap = await clientGetDoc(clientDoc(clientDb, colId, id));
          results.push({
            id: snap.id,
            exists: snap.exists(),
            data: () => snap.exists() ? ({ ...snap.data(), $id: snap.id }) : undefined,
          });
        }
      }
      return results;
    },
  };
}

export function getAdminDb(): Firestore {
  if (adminAuthFailed) {
    return createClientDbAdapter() as unknown as Firestore;
  }
  if (adminDb) return adminDb;
  const databaseId = DATABASE_ID;
  try {
    adminDb = getFirestore(getAdminApp(), databaseId);
    return adminDb;
  } catch (err: any) {
    if (isAuthError(err)) {
      console.warn('[db-server] Service Account auth failed, using client SDK adapter');
      adminAuthFailed = true;
      return createClientDbAdapter() as unknown as Firestore;
    }
    throw err;
  }
}

// ============================================
// CRUD Server-Side
// ============================================

export type ServerQueryConstraint = 
  | string
  | { field?: string; op?: FirebaseFirestore.WhereFilterOp; value?: unknown; orderBy?: string; orderDir?: 'asc' | 'desc'; limit?: number };

function decodeFirestoreValue(v: any): any {
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return Boolean(v.booleanValue);
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(decodeFirestoreValue);
  if (v.mapValue !== undefined) {
    const obj: Record<string, any> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
      obj[k] = decodeFirestoreValue(val);
    }
    return obj;
  }
  return undefined;
}

function decodeFirestoreDoc(doc: any): Record<string, unknown> {
  const docId = doc.name ? doc.name.split('/').pop() : '';
  const obj: Record<string, any> = { $id: docId };
  if (doc.fields) {
    for (const [k, val] of Object.entries(doc.fields)) {
      obj[k] = decodeFirestoreValue(val);
    }
  }
  // Preserve the Appwrite-style timestamps used throughout the app, including
  // for older Firestore docs that were created before `createdAt` was stored.
  if (doc.createTime) obj.$createdAt = doc.createTime;
  if (doc.updateTime) obj.$updatedAt = doc.updateTime;
  return obj;
}

async function fallbackClientListDocuments(
  collectionId: string,
  queries: ServerQueryConstraint[] = []
): Promise<{ documents: Record<string, unknown>[]; total: number }> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyClqpsQ5eHECOQAXz3ls6-RUgoH8nthdkE";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "importadora-carlitos";
  const databaseId = DATABASE_ID;

  // Check if query is looking for a specific single $id
  for (const q of queries) {
    if (typeof q === 'string') {
      try {
        const parsed = JSON.parse(q);
        if (parsed.method === 'equal' && parsed.attribute === '$id' && parsed.values?.length === 1) {
          const docId = String(parsed.values[0]);
          const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collectionId}/${docId}?key=${apiKey}`;
          const res = await fetch(url);
          if (!res.ok) return { documents: [], total: 0 };
          const data: any = await res.json();
          trackRead('get', collectionId, docId, new Error().stack || '');
          return { documents: [decodeFirestoreDoc(data)], total: 1 };
        }
      } catch {}
    }
  }

  let url: string | null = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collectionId}?key=${apiKey}&pageSize=300`;
  const allDocs: Record<string, any>[] = [];

  while (url) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (collectionId === PRODUCTS_COLLECTION) throw new Error(`No se pudieron consultar los productos en Firestore (HTTP ${res.status}).`);
        break;
      }
      const data: any = await res.json();
      if (data.documents) {
        for (const d of data.documents) {
          allDocs.push(decodeFirestoreDoc(d));
        }
      }
      if (data.nextPageToken) {
        url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collectionId}?key=${apiKey}&pageSize=300&pageToken=${data.nextPageToken}`;
      } else {
        url = null;
      }
    } catch (error) {
      if (collectionId === PRODUCTS_COLLECTION) throw error;
      break;
    }
  }

  const count = allDocs.length;
  if (count > 0) {
    trackReadsBatch('list', collectionId, count, `docs:${count}`, new Error().stack || '');
  }

  // Filter and sort in memory
  let filtered = allDocs;
  let offsetVal = 0;
  let limitVal = 0;

  for (const q of queries) {
    if (typeof q === 'string') {
      try {
        let parsed: any = null;
        try { parsed = JSON.parse(q); } catch {}

        if (parsed && parsed.method) {
          if (parsed.method === 'equal' && parsed.attribute && parsed.values) {
            const field = parsed.attribute;
            const vals = parsed.values;
            filtered = filtered.filter(doc => {
              const v = doc[field];
              return vals.some((expected: any) =>
                typeof expected === 'boolean'
                  ? Boolean(v) === expected
                  : String(v).toLowerCase() === String(expected).toLowerCase() || v === expected
              );
            });
            continue;
          }
          if (parsed.method === 'limit' && parsed.values) {
            limitVal = Number(parsed.values[0]);
            continue;
          }
          if (parsed.method === 'offset' && parsed.values) {
            offsetVal = Number(parsed.values[0]);
            continue;
          }
        }

        const eqMatch = q.match(/^equal\("([^"]+)",\s*\[([^\]]*)\]\)/);
        if (eqMatch) {
          const field = eqMatch[1];
          const rawVal = eqMatch[2].replace(/^"|"$/g, '').trim();
          const expected = rawVal === 'true' ? true : rawVal === 'false' ? false : isNaN(Number(rawVal)) ? rawVal : Number(rawVal);
          filtered = filtered.filter(doc => doc[field] === expected || String(doc[field]) === String(expected));
          continue;
        }
        const limitMatch = q.match(/^limit\((\d+)\)/);
        if (limitMatch) {
          limitVal = Number(limitMatch[1]);
          continue;
        }
      } catch {}
    } else if (q && typeof q === 'object') {
      if (q.field && q.op === '==' && q.value !== undefined) {
        filtered = filtered.filter(doc => doc[q.field!] === q.value);
      }
      if (q.limit) {
        limitVal = q.limit;
      }
    }
  }

  if (offsetVal > 0) filtered = filtered.slice(offsetVal);
  if (limitVal > 0 && filtered.length > limitVal) filtered = filtered.slice(0, limitVal);

  return { documents: filtered, total: filtered.length };
}

async function fallbackClientGetDocument(
  collectionId: string,
  documentId: string
): Promise<Record<string, unknown>> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyClqpsQ5eHECOQAXz3ls6-RUgoH8nthdkE";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "importadora-carlitos";
  const databaseId = DATABASE_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collectionId}/${documentId}?key=${apiKey}`;
  const res = await fetch(url);
  trackRead('get', collectionId, documentId, new Error().stack || '');
  if (!res.ok) {
    const err: any = new Error(`Document ${documentId} not found in ${collectionId}`);
    err.code = 404;
    err.status = 404;
    throw err;
  }
  const data: any = await res.json();
  return decodeFirestoreDoc(data);
}

async function fallbackClientCreateDocument(
  collectionId: string,
  documentId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const cleanData = { ...data };
  delete (cleanData as any).$id;
  if (!(cleanData as any).storeId) {
    (cleanData as any).storeId = 'main_store';
  }
  if (collectionId === PRODUCTS_COLLECTION && typeof (cleanData as any).updatedAt !== 'number') {
    (cleanData as any).updatedAt = Date.now();
  }
  if (documentId === 'unique()' || !documentId) {
    const ref = await clientAddDoc(clientCollection(clientDb, collectionId), cleanData);
    trackRead('create', collectionId, ref.id, new Error().stack || '');
    return { ...cleanData, $id: ref.id };
  }
  await clientSetDoc(clientDoc(clientDb, collectionId, documentId), cleanData);
  trackRead('create', collectionId, documentId, new Error().stack || '');
  return { ...cleanData, $id: documentId };
}

async function fallbackClientUpdateDocument(
  collectionId: string,
  documentId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const cleanData = { ...data };
  delete (cleanData as any).$id;
  if (collectionId === PRODUCTS_COLLECTION && typeof (cleanData as any).updatedAt !== 'number') {
    (cleanData as any).updatedAt = Date.now();
  }
  await clientUpdateDoc(clientDoc(clientDb, collectionId, documentId), cleanData);
  return { ...cleanData, $id: documentId };
}

async function fallbackClientDeleteDocument(
  collectionId: string,
  documentId: string
): Promise<void> {
  await clientDeleteDoc(clientDoc(clientDb, collectionId, documentId));
}

export async function serverListDocuments(
  collectionId: string,
  queries: ServerQueryConstraint[] = []
): Promise<{ documents: Record<string, unknown>[]; total: number }> {
  if (adminAuthFailed) {
    return fallbackClientListDocuments(collectionId, queries);
  }

  try {
    const adminDb = getAdminDb();
    let q: FirebaseFirestore.Query = adminDb.collection(collectionId);

    for (const constraint of queries) {
      if (typeof constraint === 'string') {
        try {
          // Formato 1: JSON string generado por q() — {"method":"equal","attribute":"STATUS","values":["paid",...]}
          let parsed: any = null;
          try {
            parsed = JSON.parse(constraint);
          } catch {
            // No es JSON, intentar formato legacy abajo
          }

          if (parsed && parsed.method) {
            if (parsed.method === 'equal' && parsed.attribute && parsed.values) {
              const field = parsed.attribute;
              const vals = parsed.values;
              // $id en Firestore se maneja con .doc() para 1 valor, o getAll() para múltiples
              if (field === '$id') {
                if (vals.length === 1) {
                  // Single doc lookup — use .doc() for efficiency
                  const docSnap = await adminDb.collection(collectionId).doc(String(vals[0])).get();
                  return {
                    documents: docSnap.exists ? [{ $id: docSnap.id, ...docSnap.data() }] : [],
                    total: docSnap.exists ? 1 : 0,
                  };
                } else {
                  // Multiple IDs — use adminDb.getAll for single-RPC parallel fetch
                  const refs = vals.map((v: any) => adminDb.collection(collectionId).doc(String(v)));
                  const docSnaps = await adminDb.getAll(...refs);
                  const docs: any[] = [];
                  for (const ds of docSnaps) {
                    if (ds.exists) docs.push({ $id: ds.id, ...ds.data() });
                  }
                  return { documents: docs, total: docs.length };
                }
              }
              // Folios de pedido son identificadores de texto: conservar ceros iniciales
              // (por ejemplo, "00458") al resolver pedidos sin prefijo.
              const isCodeField = ['SKU', 'BARCODE', 'sku', 'barcode', 'codigo_barra', 'id', '$id', 'ORDERCODE', 'REQCODE', 'VENDOR_ORDER_CODE', 'orderCode'].includes(field);
              if (vals.length === 1) {
                const rawVal = vals[0];
                const val = typeof rawVal === 'boolean' || typeof rawVal === 'number'
                  ? rawVal
                  : rawVal === 'true' ? true : rawVal === 'false' ? false : (!isCodeField && !isNaN(Number(rawVal)) && rawVal !== '') ? Number(rawVal) : rawVal;
                q = q.where(field, '==', val);
              } else {
                // Múltiples valores → IN query
                const cleanVals = vals.map((v: any) =>
                  typeof v === 'boolean' || typeof v === 'number'
                    ? v
                    : v === 'true' ? true : v === 'false' ? false : (!isCodeField && !isNaN(Number(v)) && v !== '') ? Number(v) : v
                );
                q = q.where(field, 'in', cleanVals);
              }
              continue;
            }
            if (parsed.method === 'orderDesc' && parsed.attribute) {
              // $createdAt se mapea a createdAt en Firestore nativo
              const field = parsed.attribute === '$createdAt' ? 'createdAt' : parsed.attribute;
              q = q.orderBy(field, 'desc');
              continue;
            }
            if (parsed.method === 'orderAsc' && parsed.attribute) {
              const field = parsed.attribute === '$createdAt' ? 'createdAt' : parsed.attribute;
              q = q.orderBy(field, 'asc');
              continue;
            }
            if (parsed.method === 'limit' && parsed.values) {
              q = q.limit(Number(parsed.values[0]));
              continue;
            }
            if (parsed.method === 'offset' && parsed.values) {
              const off = Number(parsed.values[0]);
              if (off > 0) q = (q as any).offset(off);
              continue;
            }
            if (parsed.method === 'cursorAfter' && parsed.values) {
              // Cursor de paginación — values[0] es el docId
              const cursorSnap = await adminDb.collection(collectionId).doc(String(parsed.values[0])).get();
              if (cursorSnap.exists) {
                q = (q as any).startAfter(cursorSnap);
              }
              continue;
            }
          }

          // Formato 2 (legacy): equal("field", ["value"])
          const eqMatch = constraint.match(/^equal\("([^"]+)",\s*\[([^\]]*)\]\)/);
          if (eqMatch) {
            const field = eqMatch[1];
            const rawVal = eqMatch[2].replace(/^"|"$/g, '').trim();
            const val = rawVal === 'true' ? true : rawVal === 'false' ? false : isNaN(Number(rawVal)) ? rawVal : Number(rawVal);
            q = q.where(field, '==', val);
            continue;
          }
          const gtMatch = constraint.match(/^greaterThan\("([^"]+)",\s*\[([^\]]*)\]\)/);
          if (gtMatch) {
            const rawVal = gtMatch[2].replace(/^"|"$/g, '').trim();
            const val = rawVal !== '' && !isNaN(Number(rawVal)) ? Number(rawVal) : rawVal;
            q = q.where(gtMatch[1], '>', val);
            continue;
          }
          const gteMatch = constraint.match(/^greaterThanEqual\("([^"]+)",\s*\[([^\]]*)\]\)/);
          if (gteMatch) {
            const rawVal = gteMatch[2].replace(/^"|"$/g, '').trim();
            const val = rawVal !== '' && !isNaN(Number(rawVal)) ? Number(rawVal) : rawVal;
            q = q.where(gteMatch[1], '>=', val);
            continue;
          }
          const ltMatch = constraint.match(/^lessThan\("([^"]+)",\s*\[([^\]]*)\]\)/);
          if (ltMatch) {
            const rawVal = ltMatch[2].replace(/^"|"$/g, '').trim();
            const val = rawVal !== '' && !isNaN(Number(rawVal)) ? Number(rawVal) : rawVal;
            q = q.where(ltMatch[1], '<', val);
            continue;
          }
          const lteMatch = constraint.match(/^lessThanEqual\("([^"]+)",\s*\[([^\]]*)\]\)/);
          if (lteMatch) {
            const rawVal = lteMatch[2].replace(/^"|"$/g, '').trim();
            const val = rawVal !== '' && !isNaN(Number(rawVal)) ? Number(rawVal) : rawVal;
            q = q.where(lteMatch[1], '<=', val);
            continue;
          }
          const orderDescMatch = constraint.match(/^orderDesc\("([^"]+)"\)/);
          if (orderDescMatch) {
            const field = orderDescMatch[1] === '$createdAt' ? 'createdAt' : orderDescMatch[1];
            q = q.orderBy(field, 'desc');
            continue;
          }
          const orderAscMatch = constraint.match(/^orderAsc\("([^"]+)"\)/);
          if (orderAscMatch) {
            const field = orderAscMatch[1] === '$createdAt' ? 'createdAt' : orderAscMatch[1];
            q = q.orderBy(field, 'asc');
            continue;
          }
          const limitMatch = constraint.match(/^limit\((\d+)\)/);
          if (limitMatch) { q = q.limit(Number(limitMatch[1])); continue; }
        } catch {}
      } else {
        if (constraint.field && constraint.op !== undefined && constraint.value !== undefined) {
          q = q.where(constraint.field, constraint.op, constraint.value);
        }
        if (constraint.orderBy) {
          q = q.orderBy(constraint.orderBy, constraint.orderDir || 'asc');
        }
        if (constraint.limit) {
          q = q.limit(constraint.limit);
        }
      }
    }

    const snap = await q.get();
    const count = snap.size;
    // Firestore cobra 1 lectura POR DOCUMENTO retornado
    if (count > 0) {
      trackReadsBatch('list', collectionId, count, `docs:${count}`, new Error().stack || '');
    }
    const documents = snap.docs.map(d => ({
      ...d.data(),
      $id: d.id,
      $createdAt: d.createTime.toDate().toISOString(),
      $updatedAt: d.updateTime.toDate().toISOString(),
    }));
    return { documents, total: documents.length };
  } catch (err: any) {
    if (isAuthError(err)) {
      console.warn('[db-server] Service Account auth failed/expired in serverListDocuments. Falling back to client Firestore SDK...');
      adminAuthFailed = true;
      return fallbackClientListDocuments(collectionId, queries);
    }
    throw err;
  }
}

/** Listar documentos en servidor aislados por tienda (Multi-Tenant Fail-Safe) */
export async function serverListStoreDocuments(
  storeId: string = 'main_store',
  collectionId: string,
  queries: (string | ServerQueryConstraint)[] = []
) {
  const storeConstraint = `equal("storeId", ["${storeId}"])`;
  return serverListDocuments(collectionId, [storeConstraint, ...queries]);
}

export async function serverGetDocument(
  collectionId: string,
  documentId: string
): Promise<Record<string, unknown>> {
  if (adminAuthFailed) {
    return fallbackClientGetDocument(collectionId, documentId);
  }
  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection(collectionId).doc(documentId).get();
    trackRead('get', collectionId, documentId, new Error().stack || '');
    if (!snap.exists) {
      const err: any = new Error(`Document ${documentId} not found in ${collectionId}`);
      err.code = 404;
      err.status = 404;
      throw err;
    }
    return { $id: snap.id, ...snap.data() };
  } catch (err: any) {
    if (isAuthError(err)) {
      console.warn('[db-server] Service Account auth failed/expired in serverGetDocument. Falling back to client Firestore SDK...');
      adminAuthFailed = true;
      return fallbackClientGetDocument(collectionId, documentId);
    }
    throw err;
  }
}

export async function serverCreateDocument(
  collectionId: string,
  documentId: string,
  data: Record<string, unknown>,
  permissions?: any
): Promise<Record<string, unknown>> {
  if (adminAuthFailed) {
    return fallbackClientCreateDocument(collectionId, documentId, data);
  }
  try {
    const adminDb = getAdminDb();
    const cleanData = { ...data };
    delete (cleanData as any).$id;
    if (!(cleanData as any).storeId) {
      (cleanData as any).storeId = 'main_store';
    }
    if (collectionId === PRODUCTS_COLLECTION && typeof (cleanData as any).updatedAt !== 'number') {
      (cleanData as any).updatedAt = Date.now();
    }
    if (documentId === 'unique()' || !documentId) {
      const ref = await adminDb.collection(collectionId).add(cleanData);
      return { ...cleanData, $id: ref.id };
    }
    await adminDb.collection(collectionId).doc(documentId).set(cleanData);
    return { ...cleanData, $id: documentId };
  } catch (err: any) {
    if (isAuthError(err)) {
      console.warn('[db-server] Service Account auth failed/expired in serverCreateDocument. Falling back to client Firestore SDK...');
      adminAuthFailed = true;
      return fallbackClientCreateDocument(collectionId, documentId, data);
    }
    throw err;
  }
}

export async function serverUpdateDocument(
  collectionId: string,
  documentId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (adminAuthFailed) {
    return fallbackClientUpdateDocument(collectionId, documentId, data);
  }
  try {
    const adminDb = getAdminDb();
    const cleanData = { ...data };
    delete (cleanData as any).$id;
    if (collectionId === PRODUCTS_COLLECTION && typeof (cleanData as any).updatedAt !== 'number') {
      (cleanData as any).updatedAt = Date.now();
    }
    await adminDb.collection(collectionId).doc(documentId).update(cleanData);
    return { ...cleanData, $id: documentId };
  } catch (err: any) {
    if (isAuthError(err)) {
      console.warn('[db-server] Service Account auth failed/expired in serverUpdateDocument. Falling back to client Firestore SDK...');
      adminAuthFailed = true;
      return fallbackClientUpdateDocument(collectionId, documentId, data);
    }
    throw err;
  }
}

export async function serverDeleteDocument(
  collectionId: string,
  documentId: string
): Promise<void> {
  if (adminAuthFailed) {
    return fallbackClientDeleteDocument(collectionId, documentId);
  }
  try {
    const adminDb = getAdminDb();
    await adminDb.collection(collectionId).doc(documentId).delete();
  } catch (err: any) {
    if (isAuthError(err)) {
      console.warn('[db-server] Service Account auth failed/expired in serverDeleteDocument. Falling back to client Firestore SDK...');
      adminAuthFailed = true;
      return fallbackClientDeleteDocument(collectionId, documentId);
    }
    throw err;
  }
}

// ============================================
// STORAGE SERVER-SIDE
// ============================================

export async function serverUploadFile(
  bucketIdOrPath: string,
  file: Buffer | Blob | ArrayBuffer,
  fileName: string = 'file.jpg',
  contentType?: string,
): Promise<{ $id: string; url: string }> {
  const bucket = getStorage(getAdminApp()).bucket();
  const buffer = file instanceof ArrayBuffer ? Buffer.from(file) : file instanceof Blob ? Buffer.from(await file.arrayBuffer()) : file;
  const path = `${bucketIdOrPath}/${fileName}`;
  const fileRef = bucket.file(path);
  await fileRef.save(buffer, {
    metadata: {
      cacheControl: 'public, max-age=31536000, immutable',
      ...(contentType ? { contentType } : {}),
    },
  });

  // Generar download token (Firebase Storage usa tokens para acceso público)
  const crypto = await import('crypto');
  const token = crypto.randomUUID();
  await fileRef.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });

  const bucketName = bucket.name;
  const encodedPath = encodeURIComponent(path);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
  return { $id: path, url };
}

export function getServerFileUrl(bucketIdOrPath: string, fileId?: string): string {
  let path = bucketIdOrPath;
  if (fileId) {
    if (fileId.startsWith(bucketIdOrPath + '/')) {
      path = fileId;
    } else {
      path = `${bucketIdOrPath}/${fileId}`;
    }
  }
  path = path.replace(/^media\/media\//, 'media/').replace(/^(comprobantes\/carlitos\/)\1+/, '$1');
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'importadora-carlitos.firebasestorage.app';
  return `https://storage.googleapis.com/${bucket}/${path}`;
}

export function getPublicFileUrl(bucketIdOrPath: string, fileId?: string): string {
  return getServerFileUrl(bucketIdOrPath, fileId);
}

/** Limpia URLs de Firebase Storage (compatibilidad con datos legacy) */
export function cleanStorageUrl(url: string): string {
  if (!url) return url;
  return url.replace(/&?mode=admin/, '').replace(/\?mode=admin/, '?').replace(/\?$/, '');
}
