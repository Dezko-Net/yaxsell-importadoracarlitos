import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { FIREBASE_PUBLIC_CONFIG } from './firebase-public-config';

const FIREBASE_CONFIG = FIREBASE_PUBLIC_CONFIG;

const app        = !getApps().length ? initializeApp(FIREBASE_CONFIG) : getApp();
const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || '(default)';

function initFirestoreInstance(): Firestore {
  if (typeof window !== 'undefined') {
    try {
      return initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      }, databaseId);
    } catch {
      return getFirestore(app, databaseId);
    }
  }
  return getFirestore(app, databaseId);
}

export const db      = initFirestoreInstance();
export const auth    = getAuth(app);
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}
export const storage = getStorage(app);

export const authReady = new Promise<void>((resolve) => {
  onAuthStateChanged(auth, () => {
    resolve();
  });
});
export const firebaseProjectId = FIREBASE_CONFIG.projectId;
export function assertFirebaseConfigured(): boolean { return true; }
