/** Client SDK configuration. These fields are public Firebase identifiers. */
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos';
const isCarlitos = projectId === 'importadora-carlitos';
export const FIREBASE_PUBLIC_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (isCarlitos ? 'AIzaSyClqpsQ5eHECOQAXz3ls6-RUgoH8nthdkE' : ''),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (isCarlitos ? 'importadora-carlitos.firebaseapp.com' : ''),
  projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || (isCarlitos ? 'importadora-carlitos.firebasestorage.app' : ''),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || (isCarlitos ? '289604179340' : ''),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || (isCarlitos ? '1:289604179340:web:9d3f876c8aafeceedef2a9' : ''),
};

export function hasFirebasePublicConfig() {
  return Object.values(FIREBASE_PUBLIC_CONFIG).every(Boolean);
}
