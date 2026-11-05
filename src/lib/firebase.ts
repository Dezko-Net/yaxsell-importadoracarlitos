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

const FIREBASE_CONFIG = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            || "AIzaSyClqpsQ5eHECOQAXz3ls6-RUgoH8nthdkE",
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        || "importadora-carlitos.firebaseapp.com",
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         || "importadora-carlitos",
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     || "importadora-carlitos.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID|| "289604179340",
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             || "1:289604179340:web:9d3f876c8aafeceedef2a9",
};

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
