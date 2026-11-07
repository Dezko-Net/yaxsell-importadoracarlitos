const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'importadora-carlitos';
export const SUPREME_OWNER_UID = process.env.NEXT_PUBLIC_SUPREME_OWNER_UID || (projectId === 'importadora-carlitos' ? '2qwk74HeaneMQzDfjugIl72cT9G3' : '');
export const SUPREME_OWNER_EMAIL = (process.env.NEXT_PUBLIC_SUPREME_OWNER_EMAIL || 'dezkonet@gmail.com').trim().toLowerCase();

export function isSupremeOwner(uid?: string | null, email?: string | null): boolean {
  return Boolean(SUPREME_OWNER_UID && uid === SUPREME_OWNER_UID && email?.trim().toLowerCase() === SUPREME_OWNER_EMAIL);
}
