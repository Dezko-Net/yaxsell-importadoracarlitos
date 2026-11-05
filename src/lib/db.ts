/**
 * db.ts — Capa de abstracción Firebase Firestore
 * Reemplaza completamente a appwrite.ts y node-appwrite
 * Mantiene la misma API pública para compatibilidad con el resto del código.
 */
import { trackRead, trackReadsBatch } from './firebase-read-tracker';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Query as FirestoreQuery,
  CollectionReference,
  DocumentData,
  runTransaction,
  QueryConstraint,
  WhereFilterOp,
} from 'firebase/firestore';
import { db, storage } from './firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

// ============================================
// COLECCIONES — mismos nombres que Appwrite
// ============================================
export const PRODUCTS_COLLECTION                  = 'products';
export const INVENTORY_PRODUCTS_COLLECTION        = 'inventory_products';
export const CATALOG_PRODUCTS_COLLECTION          = 'catalog_products';
export const CATEGORIES_COLLECTION                = 'categories';
export const BANNERS_COLLECTION                   = 'banners';
export const ORDERS_COLLECTION                    = 'orders';
export const WHOLESALE_ORDERS_COLLECTION          = 'wholesale_orders';
export const TIMED_OFFERS_COLLECTION              = 'timed_offers';
export const SEQUENCES_COLLECTION                 = 'sequences';
export const COUPONS_COLLECTION                   = 'discount_coupons';
export const POINTS_STORE_COLLECTION              = 'points_store_items';
export const USERS_COLLECTION                     = 'users';
export const LIVE_STREAMS_COLLECTION              = 'live_streams';
export const BANNER_OVERLAY_POSITIONS_COLLECTION  = 'banner_overlay_positions';
export const HOUSE_PRODUCT_POSITIONS_COLLECTION   = 'house_product_positions';
export const HOTSPOT_PANELS_COLLECTION            = 'hotspot_panels';
export const PRODUCT_VOTES_COLLECTION             = 'product_votes';
export const SUBCATEGORIES_COLLECTION             = 'subcategories';
export const REVIEWS_COLLECTION                   = 'reviews';
export const PRODUCT_QUESTIONS_COLLECTION         = 'product_questions';
export const CLIPS_COLLECTION                     = 'clips';
export const FAVORITES_COLLECTION                 = 'favorites';
export const CART_ITEMS_COLLECTION                = 'cart_items';
export const CART_SNAPSHOTS_COLLECTION            = 'cart_snapshots';
export const RAFFLES_COLLECTION                   = 'live_raffles';
export const RAFFLE_PARTICIPANTS_COLLECTION       = 'raffle_participants';
export const STOCK_ALERTS_COLLECTION              = 'stock_alerts';
export const STOCK_REQUESTS_COLLECTION            = 'stock_requests';
export const NOTIFICATIONS_COLLECTION             = 'notifications';
export const THEME_CONFIG_COLLECTION             = 'theme_config';
export const APERTURA_SETTINGS_COLLECTION         = 'apertura_settings';
export const PRODUCT_VIEWS_COLLECTION             = 'product_views';
export const STORE_SETTINGS_COLLECTION            = 'store_settings';
export const ADMIN_CHAT_COLLECTION                = 'admin_chat';
export const ADDRESSES_COLLECTION                 = 'addresses';
export const COTIZACION_COLLECTION                = 'cotizaciones';
export const SUPPORT_TICKETS_COLLECTION           = 'support_tickets';

// Aliases para *_COLLECTION_ID
export const PRODUCTS_COLLECTION_ID = PRODUCTS_COLLECTION;
export const INVENTORY_PRODUCTS_COLLECTION_ID = INVENTORY_PRODUCTS_COLLECTION;
export const CATALOG_PRODUCTS_COLLECTION_ID = CATALOG_PRODUCTS_COLLECTION;
export const USERS_COLLECTION_ID = USERS_COLLECTION;
export const CATEGORIES_COLLECTION_ID = CATEGORIES_COLLECTION;
export const SUBCATEGORIES_COLLECTION_ID = SUBCATEGORIES_COLLECTION;
export const ORDERS_COLLECTION_ID = ORDERS_COLLECTION;
export const WHOLESALE_ORDERS_COLLECTION_ID = WHOLESALE_ORDERS_COLLECTION;
export const APERTURA_SETTINGS_COLLECTION_ID = APERTURA_SETTINGS_COLLECTION;
export const STORE_SETTINGS_COLLECTION_ID = STORE_SETTINGS_COLLECTION;
export const COUPONS_COLLECTION_ID = COUPONS_COLLECTION;
export const ADDRESSES_COLLECTION_ID = ADDRESSES_COLLECTION;
export const ADMIN_CHAT_COLLECTION_ID = ADMIN_CHAT_COLLECTION;
export const COTIZACION_COLLECTION_ID = COTIZACION_COLLECTION;
export const FAVORITES_COLLECTION_ID = FAVORITES_COLLECTION;
export const VENDORS_COLLECTION_ID = 'vendors';
export const VENDOR_ORDERS_COLLECTION_ID = 'vendor_orders';
export const AGENCIES_COLLECTION_ID = 'agencies';
export const CART_ITEMS_COLLECTION_ID = CART_ITEMS_COLLECTION;
export const CART_SNAPSHOTS_COLLECTION_ID = CART_SNAPSHOTS_COLLECTION;
export const SUPPORT_TICKETS_COLLECTION_ID = SUPPORT_TICKETS_COLLECTION;
export const STOCK_ALERTS_COLLECTION_ID = STOCK_ALERTS_COLLECTION;
export const POINTS_STORE_COLLECTION_ID = POINTS_STORE_COLLECTION;
export const DATABASE_ID = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || '(default)';

// ============================================
// Colecciones públicas cacheables (lectura pública sin auth)
// ============================================
export const PUBLIC_CACHEABLE_COLLECTIONS = [
  PRODUCTS_COLLECTION,
  CATEGORIES_COLLECTION,
  BANNERS_COLLECTION,
  TIMED_OFFERS_COLLECTION,
  LIVE_STREAMS_COLLECTION,
  HOTSPOT_PANELS_COLLECTION,
  BANNER_OVERLAY_POSITIONS_COLLECTION,
  SUBCATEGORIES_COLLECTION,
  THEME_CONFIG_COLLECTION,
  APERTURA_SETTINGS_COLLECTION,
  REVIEWS_COLLECTION,
  PRODUCT_QUESTIONS_COLLECTION,
  STORE_SETTINGS_COLLECTION,
];

// ============================================
// STORAGE — Firebase Storage equivalente
// ============================================
export const MEDIA_BUCKET_ID = 'media';
export const ORDER_BOX_PHOTOS_BUCKET_ID = 'order_box_photos';
export const MEDIA_PREFIXES = {
  products:     'carlitos/productos/',
  banners:      'carlitos/banners/',
  categories:   'carlitos/categorias/',
  comprobantes: 'comprobantes/carlitos/',
  thumbnails:   'carlitos/thumbnails/',
  chat:         'carlitos/chat/',
} as const;
export type MediaPrefix = keyof typeof MEDIA_PREFIXES;

// Firebase Config & Multi-Tenant Helpers
export function getFirebaseConfig() {
  return {
    endpoint: '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos',
    // El navegador escribe en el database público configurado en Firebase.
    // El servidor debe resolver los mismos documentos que escribió el checkout.
    databaseId: DATABASE_ID,
    bucketId: 'media',
  };
}

export function getAdminDb() { return db; }
export function isFirebaseConfigured(): boolean { return true; }
export function saveFirebaseConfig(config: any): any { return config; }
export function clearFirebaseConfig(): void {}
export function exportFirebaseConfig(): any { return {}; }
export type FirebaseConfig = any;

export function getServices() {
  return {
    databases: {
      listDocuments: (dbId: string, colId: string, queries?: any[]) => listDocuments(colId, queries || []),
      getDocument: (dbId: string, colId: string, docId: string) => getDocument(colId, docId),
      createDocument: (dbId: string, colId: string, docId: string, data: any, _permissions?: any) => createDocument(colId, docId, data),
      updateDocument: (dbId: string, colId: string, docId: string, data: any, _permissions?: any) => updateDocument(colId, docId, data),
      deleteDocument: (dbId: string, colId: string, docId: string) => deleteDocument(colId, docId),
    },
    account: {
      get: async () => ({ $id: 'guest', name: 'Guest', email: '' }),
      updatePrefs: async (prefs: any) => ({ prefs }),
      deleteSession: async (id: string) => ({}),
      listSessions: async () => [],
      createEmailPasswordSession: async (e: string, p: string) => ({}),
      create: async (id: string, e: string, p: string, n: string) => ({}),
      updateName: async (n: string) => ({}),
      createRecovery: async (e: string, u: string) => ({}),
      createOAuth2Session: async (p: any, s: string, f: string) => ({}),
    },
    storage: {
      createFile: async (bucketId: string, fileId: string, file: any) => {
        const path = `${bucketId}/${fileId === 'unique()' ? Date.now() : fileId}`;
        const res = await uploadFile(path, file);
        return res;
      },
      getFileView: (bucketId: string, fileId: string) => getFileUrl(`${bucketId}/${fileId}`),
      getFilePreview: (bucketId: string, fileId: string) => getFileUrl(`${bucketId}/${fileId}`),
      deleteFile: async (bucketId: string, fileId: string) => deleteFile(`${bucketId}/${fileId}`),
      listFiles: async (bucketId: string, queries?: any[]) => ({ files: [], total: 0 }),
    },
    client: {},
  };
}

export class Client {
  setEndpoint(val?: any) { return this; }
  setProject(val?: any) { return this; }
  setKey(val?: any) { return this; }
}

export class Account {
  constructor(client?: any) {}
  async get() { throw new Error('AppwriteException: Account no disponible en modo Firebase'); }
  async create(email: string, password: string) { throw new Error('AppwriteException: Usar Firebase Auth'); }
  async createEmailPasswordSession(email: string, password: string) { throw new Error('AppwriteException: Usar Firebase Auth'); }
  async deleteSession(sessionId?: string) { throw new Error('AppwriteException: Usar Firebase Auth'); }
}

export class Databases {
  constructor(client?: any) {}
  async listDocuments(dbId: string, colId: string, queries?: any[]) {
    return listDocuments(colId, queries || []);
  }
  async getDocument(dbId: string, colId: string, docId: string) {
    return getDocument(colId, docId);
  }
  async createDocument(dbId: string, colId: string, docId: string, data: any, _permissions?: any) {
    return createDocument(colId, docId, data);
  }
  async updateDocument(dbId: string, colId: string, docId: string, data: any, _permissions?: any) {
    return updateDocument(colId, docId, data);
  }
  async deleteDocument(dbId: string, colId: string, docId: string) {
    return deleteDocument(colId, docId);
  }
}

export class Users {
  constructor(client?: any) {}
  async list(opts?: any) {
    const res = await listDocuments(USERS_COLLECTION_ID, opts?.queries || []);
    return { users: res.documents, total: res.total };
  }
  async get(id: string) {
    return getDocument(USERS_COLLECTION_ID, id);
  }
  async updatePrefs(id: string, prefs: any) {
    return updateDocument(USERS_COLLECTION_ID, id, { prefs });
  }
}

// Security mocks for Appwrite Permission & Role & OAuthProvider
export const Permission = {
  read: (role: string) => `read(${role})`,
  write: (role: string) => `write(${role})`,
  update: (role: string) => `update(${role})`,
  delete: (role: string) => `delete(${role})`,
};

export const Role = {
  any: () => 'any',
  user: (id: string) => `user:${id}`,
  guests: () => 'guests',
  users: () => 'users',
};

export const OAuthProvider = {
  Google: 'google',
};

// ============================================
// TIPOS INTERNOS
// ============================================
export interface DbDocument {
  $id: string;
  [key: string]: unknown;
}
export interface DbList<T = DbDocument> {
  documents: T[];
  total: number;
}

// ============================================
// PARSER DE QUERIES Appwrite → Firestore
// Convierte strings tipo "equal(\"field\", [\"value\"])" a QueryConstraint[]
// ============================================
function parseQueries(queries: (string | QueryConstraint)[]): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];
  for (const q of queries) {
    if (typeof q !== 'string') {
      constraints.push(q);
      continue;
    }
    try {
      // equal("field", ["val1", "val2"]) or equal("field", ["value"])
      const eqMatch = q.match(/^equal\("([^"]+)",\s*\[([^\]]*)\]\)/);
      if (eqMatch) {
        const field = eqMatch[1];
        const rawInner = eqMatch[2].trim();
        const items = rawInner
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(rawVal => {
            const clean = rawVal.replace(/^"|"$/g, '').trim();
            return clean === 'true' ? true : clean === 'false' ? false : (clean !== '' && !isNaN(Number(clean)) && !rawVal.startsWith('"')) ? Number(clean) : clean;
          });
        if (items.length > 1) {
          if (field === '$id') {
            constraints.push(where('__name__', 'in', items.slice(0, 30)));
          } else {
            constraints.push(where(field, 'in', items.slice(0, 30)));
          }
          continue;
        }
        const rawVal = rawInner.replace(/^"|"$/g, '').trim();
        const val = rawVal === 'true' ? true : rawVal === 'false' ? false : (rawVal !== '' && !isNaN(Number(rawVal))) ? Number(rawVal) : rawVal;
        // $id en Firestore se mapea a __name__
        if (field === '$id') {
          constraints.push(where('__name__', '==', val));
        } else {
          constraints.push(where(field, '==', val));
        }
        continue;
      }
      // in("field", ["val1", "val2"])
      const inMatch = q.match(/^in\("([^"]+)",\s*\[([^\]]*)\]\)/);
      if (inMatch) {
        const field = inMatch[1];
        const items = inMatch[2]
          .split(',')
          .map(s => s.replace(/^"|"$/g, '').trim())
          .filter(Boolean);
        if (items.length > 0) {
          constraints.push(where(field === '$id' ? '__name__' : field, 'in', items.slice(0, 30)));
        }
        continue;
      }
      // notEqual("field", ["value"])
      const neqMatch = q.match(/^notEqual\("([^"]+)",\s*\[([^\]]*)\]\)/);
      if (neqMatch) {
        const field = neqMatch[1];
        const rawVal = neqMatch[2].replace(/^"|"$/g, '').trim();
        const val = rawVal === 'true' ? true : rawVal === 'false' ? false : (rawVal !== '' && !isNaN(Number(rawVal))) ? Number(rawVal) : rawVal;
        constraints.push(where(field, '!=', val));
        continue;
      }
      // greaterThanEqual("field", [value])
      const gteMatch = q.match(/^greaterThanEqual\("([^"]+)",\s*\[([^\]]*)\]\)/);
      if (gteMatch) {
        const raw = gteMatch[2].replace(/^"|"$/g, '').trim();
        const val = raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw;
        constraints.push(where(gteMatch[1], '>=', val));
        continue;
      }
      // greaterThan("field", [value])
      const gtMatch = q.match(/^greaterThan\("([^"]+)",\s*\[([^\]]*)\]\)/);
      if (gtMatch) {
        const raw = gtMatch[2].replace(/^"|"$/g, '').trim();
        const val = raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw;
        constraints.push(where(gtMatch[1], '>', val));
        continue;
      }
      // lessThanEqual("field", [value])
      const lteMatch = q.match(/^lessThanEqual\("([^"]+)",\s*\[([^\]]*)\]\)/);
      if (lteMatch) {
        const raw = lteMatch[2].replace(/^"|"$/g, '').trim();
        const val = raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw;
        constraints.push(where(lteMatch[1], '<=', val));
        continue;
      }
      // lessThan("field", [value])
      const ltMatch = q.match(/^lessThan\("([^"]+)",\s*\[([^\]]*)\]\)/);
      if (ltMatch) {
        const raw = ltMatch[2].replace(/^"|"$/g, '').trim();
        const val = raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw;
        constraints.push(where(ltMatch[1], '<', val));
        continue;
      }
      // arrayContains("field", ["value"])
      const acMatch = q.match(/^arrayContains\("([^"]+)",\s*\[([^\]]*)\]\)/);
      if (acMatch) {
        const raw = acMatch[2].replace(/^"|"$/g, '').trim();
        const val = raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw;
        constraints.push(where(acMatch[1], 'array-contains', val));
        continue;
      }
      // orderDesc("field") / orderAsc("field")
      // $createdAt, $updatedAt, $id no son campos reales en Firestore — ignorar
      const orderDescMatch = q.match(/^orderDesc\("([^"]+)"\)/);
      if (orderDescMatch) {
        const f = orderDescMatch[1];
        if (f === '$createdAt' || f === '$updatedAt' || f === '$id') continue;
        constraints.push(orderBy(f, 'desc')); continue;
      }
      const orderAscMatch = q.match(/^orderAsc\("([^"]+)"\)/);
      if (orderAscMatch) {
        const f = orderAscMatch[1];
        if (f === '$createdAt' || f === '$updatedAt' || f === '$id') continue;
        constraints.push(orderBy(f, 'asc')); continue;
      }
      // limit(n)
      const limitMatch = q.match(/^limit\((\d+)\)/);
      if (limitMatch) { constraints.push(limit(Number(limitMatch[1]))); continue; }
    } catch {
      // ignore unparseable queries
    }
  }
  return constraints;
}

// ============================================
// CRUD — API compatible con Firebase SDK
// ============================================

/** Listar documentos. queries: strings Appwrite-style o QueryConstraint[] */
export async function listDocuments<T = DbDocument>(
  collectionId: string,
  queries: (string | QueryConstraint)[] = []
): Promise<DbList<T>> {
  // Fast-path: check if query is filtering by $id (single or multiple IDs)
  for (const q of queries) {
    if (typeof q === 'string') {
      const idArrMatch = q.match(/^equal\("\$id",\s*\[(.*)\]\)$/);
      if (idArrMatch) {
        const rawInner = idArrMatch[1].trim();
        const ids = rawInner
          .split(',')
          .map(s => s.replace(/^"|"$/g, '').trim())
          .filter(Boolean);
        if (ids.length === 0) return { documents: [], total: 0 };
        const snaps = await Promise.all(
          ids.map(id => getDoc(doc(db, collectionId, id)).catch(() => null))
        );
        const documents: T[] = [];
        for (const snap of snaps) {
          if (snap && snap.exists()) {
            trackRead('get', collectionId, snap.id, new Error().stack || '');
            documents.push({
              $id: snap.id,
              $createdAt: (snap.data() as any)?.$createdAt || (snap as any).createTime?.toMillis?.()?.toString() || '',
              $updatedAt: (snap.data() as any)?.$updatedAt || (snap as any).updateTime?.toMillis?.()?.toString() || '',
              ...snap.data(),
            } as T);
          }
        }
        return { documents, total: documents.length };
      }
    }
  }

  const colRef = collection(db, collectionId) as CollectionReference<DocumentData>;
  const constraints = parseQueries(queries);
  const q = constraints.length ? query(colRef, ...constraints) : query(colRef);
  const snap = await getDocs(q);
  const count = snap.size;
  // Firestore cobra 1 lectura POR DOCUMENTO retornado, no por query
  if (count > 0) {
    trackReadsBatch('list', collectionId, count, `docs:${count}`, new Error().stack || '');
  }
  const documents = snap.docs.map(d => ({
    $id: d.id,
    $createdAt: (d.data() as any)?.$createdAt || (d as any).createTime?.toMillis?.()?.toString() || '',
    $updatedAt: (d.data() as any)?.$updatedAt || (d as any).updateTime?.toMillis?.()?.toString() || '',
    ...d.data(),
  })) as T[];
  return { documents, total: documents.length };
}

/** Listar documentos aislados por tienda (Multi-Tenant Fail-Safe) */
export async function listStoreDocuments<T = DbDocument>(
  storeId: string = 'main_store',
  collectionId: string,
  queries: (string | QueryConstraint)[] = []
): Promise<DbList<T>> {
  return listDocuments<T>(collectionId, [where('storeId', '==', storeId), ...queries]);
}

/** Obtener un documento por ID */
export async function getDocument<T = DbDocument>(
  collectionId: string,
  documentId: string
): Promise<T> {
  const ref = doc(db, collectionId, documentId);
  const snap = await getDoc(ref);
  trackRead('get', collectionId, documentId, new Error().stack || '');
  if (!snap.exists()) {
    const err: any = new Error(`Document ${documentId} not found in ${collectionId}`);
    err.code = 404;
    err.status = 404;
    throw err;
  }
  return {
    $id: snap.id,
    $createdAt: (snap.data() as any)?.$createdAt || (snap as any).createTime?.toMillis?.()?.toString() || '',
    $updatedAt: (snap.data() as any)?.$updatedAt || (snap as any).updateTime?.toMillis?.()?.toString() || '',
    ...snap.data(),
  } as T;
}

/** Crear documento (con ID fijo o auto-generado) */
export async function createDocument<T = DbDocument>(
  collectionId: string,
  documentId: string | 'unique()',
  data: Record<string, unknown>
): Promise<T> {
  const cleanData = { ...data };
  delete (cleanData as any).$id;
  Object.keys(cleanData).forEach(k => {
    if ((cleanData as any)[k] === undefined) delete (cleanData as any)[k];
  });
  if (!(cleanData as any).storeId) {
    (cleanData as any).storeId = 'main_store';
  }
  if (collectionId === PRODUCTS_COLLECTION && typeof (cleanData as any).updatedAt !== 'number') {
    (cleanData as any).updatedAt = Date.now();
  }
  if (documentId === 'unique()' || !documentId) {
    const colRef = collection(db, collectionId);
    const newRef = await addDoc(colRef, cleanData);
    trackRead('create', collectionId, newRef.id, new Error().stack || '');
    return { ...cleanData, $id: newRef.id } as unknown as T;
  } else {
    const ref = doc(db, collectionId, documentId);
    await setDoc(ref, cleanData);
    trackRead('create', collectionId, documentId, new Error().stack || '');
    return { ...cleanData, $id: documentId } as unknown as T;
  }
}

/** Actualizar campos de un documento (0 lecturas adicionales post-update) */
export async function updateDocument<T = DbDocument>(
  collectionId: string,
  documentId: string,
  data: Record<string, unknown>
): Promise<T> {
  const ref = doc(db, collectionId, documentId);
  const cleanData = { ...data };
  delete (cleanData as any).$id;
  Object.keys(cleanData).forEach(k => {
    if ((cleanData as any)[k] === undefined) delete (cleanData as any)[k];
  });
  if (collectionId === PRODUCTS_COLLECTION && typeof (cleanData as any).updatedAt !== 'number') {
    (cleanData as any).updatedAt = Date.now();
  }
  await updateDoc(ref, cleanData);
  return Object.assign({}, cleanData, { $id: documentId }) as unknown as T;
}

/** Eliminar un documento */
export async function deleteDocument(
  collectionId: string,
  documentId: string
): Promise<void> {
  const ref = doc(db, collectionId, documentId);
  await deleteDoc(ref);
}

// Aliases para compatibilidad client-side
export const serverListDocuments = listDocuments;
export const serverGetDocument = getDocument;
export const serverCreateDocument = createDocument;
export const serverUpdateDocument = updateDocument;
export const serverDeleteDocument = deleteDocument;
export const serverUploadFile = uploadFile;
export const getPublicFileUrl = getFileUrl;

export async function uploadFiles(filesOrPath: File[] | string, file?: File): Promise<{ id: string; url: string; name: string }[]> {
  if (typeof filesOrPath === 'string' && file) {
    const res = await uploadFile(filesOrPath, file);
    return [{ id: res.$id, url: res.url, name: file.name }];
  }
  const files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath as any];
  const out: { id: string; url: string; name: string }[] = [];
  for (const f of files) {
    try {
      const res = await uploadFile(`media/${Date.now()}_${f.name}`, f);
      out.push({ id: res.$id, url: res.url, name: f.name });
    } catch (e) {
      console.error('Error subiendo archivo:', e);
    }
  }
  return out;
}

// ============================================
// SECUENCIAS — equivalente a getNextOrderIndex
// ============================================
export async function getNextOrderIndex(): Promise<number> {
  const seqRef = doc(db, SEQUENCES_COLLECTION, 'order_sequence');
  try {
    const next = await runTransaction(db, async (tx) => {
      const snap = await tx.get(seqRef);
      const current = snap.exists() ? ((snap.data().value as number) || 0) : 0;
      const next = current + 1;
      tx.set(seqRef, { value: next });
      return next;
    });
    return next;
  } catch {
    return Date.now(); // fallback a timestamp si falla la transacción
  }
}

// ============================================
// STORAGE — helpers equivalentes
// ============================================
export function withPrefix(prefix: MediaPrefix, fileName: string): string {
  return MEDIA_PREFIXES[prefix] + fileName;
}

export async function uploadFile(
  path: string,
  file: File | Blob | ArrayBuffer
): Promise<{ $id: string; url: string }> {
  const blob = file instanceof ArrayBuffer ? new Blob([file]) : file;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { cacheControl: 'public, max-age=31536000, immutable' });
  const url = await getDownloadURL(storageRef);
  return { $id: path, url };
}

export async function deleteFile(path: string): Promise<void> {
  const storageRef = ref(storage, path);
  await deleteObject(storageRef);
}

export async function getFileUrl(path: string): Promise<string> {
  const storageRef = ref(storage, path);
  return getDownloadURL(storageRef);
}

// ============================================
// UTILIDADES
// ============================================
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(price);
}

/** ID único — equivalente a Firebase ID.unique() */
export function uniqueId(): string {
  return doc(collection(db, '_')).id;
}

// Re-export ID helper para compatibilidad
export const ID = {
  unique: () => uniqueId(),
};

// Re-export Query helper (no-op, las queries se pasan como strings o constraints)
export const QueryBuilder = {
  equal: (field: string, value: unknown) => {
    if (Array.isArray(value)) {
      return `equal("${field}", [${value.map(v => `"${v}"`).join(', ')}])`;
    }
    return `equal("${field}", ["${value}"])`;
  },
  notEqual: (field: string, value: unknown) => `notEqual("${field}", ["${value}"])`,
  greaterThan: (field: string, value: number | string) =>
    typeof value === 'string' ? `greaterThan("${field}", ["${value}"])` : `greaterThan("${field}", [${value}])`,
  greaterThanEqual: (field: string, value: number | string) =>
    typeof value === 'string' ? `greaterThanEqual("${field}", ["${value}"])` : `greaterThanEqual("${field}", [${value}])`,
  greaterEqual: (field: string, value: number | string) =>
    typeof value === 'string' ? `greaterThanEqual("${field}", ["${value}"])` : `greaterThanEqual("${field}", [${value}])`,
  lessThan: (field: string, value: number | string) =>
    typeof value === 'string' ? `lessThan("${field}", ["${value}"])` : `lessThan("${field}", [${value}])`,
  lessThanEqual: (field: string, value: number | string) =>
    typeof value === 'string' ? `lessThanEqual("${field}", ["${value}"])` : `lessThanEqual("${field}", [${value}])`,
  lessEqual: (field: string, value: number | string) =>
    typeof value === 'string' ? `lessThanEqual("${field}", ["${value}"])` : `lessThanEqual("${field}", [${value}])`,
  orderDesc: (field: string) => `orderDesc("${field}")`,
  orderAsc: (field: string) => `orderAsc("${field}")`,
  limit: (n: number) => `limit(${n})`,
  offset: (n: number) => ``,
  isTrue: (field: string) => `equal("${field}", ["true"])`,
  isFalse: (field: string) => `equal("${field}", ["false"])`,
  search: (field: string, value: string) => `equal("${field}", ["${value}"])`,
  cursorAfter: (id: string) => ``,
  or: (...queries: any[]) => ``,
  isNull: (field: string) => ``,
  isNotNull: (field: string) => ``,
  contains: (field: string, value: any) => `equal("${field}", ["${Array.isArray(value) ? value.join(',') : value}"])`,
  startsWith: (field: string, value: string) => `equal("${field}", ["${value}"])`,
  endsWith: (field: string, value: string) => `equal("${field}", ["${value}"])`,
  between: (field: string, start: number, end: number) => `greaterThanEqual("${field}", [${start}])`,
  in: (field: string, values: any[]) => `in("${field}", [${(values || []).map(v => `"${v}"`).join(', ')}])`,
  arrayContains: (field: string, value: any) => `arrayContains("${field}", ["${value}"])`,
  arrayContainsAny: (field: string, values: any[]) => `in("${field}", [${(values || []).map(v => `"${v}"`).join(', ')}])`,
  select: (...fields: string[]) => ``,
};

export const Query = QueryBuilder;
