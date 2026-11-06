'use client';

import { auth } from '@/lib/firebase';

/** Adjunta el ID token de la sesión Firebase a llamadas de la bandeja. */
export async function whatsappAdminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = await auth.currentUser?.getIdToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
