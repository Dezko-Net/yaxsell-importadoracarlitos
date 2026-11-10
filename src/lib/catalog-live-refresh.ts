/** Avisar al catálogo solo después de invalidar la caché del servidor. */
export async function signalCatalogChanged(): Promise<void> {
  if (typeof window === 'undefined') return;
  const revision = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try { localStorage.setItem('carlitos_catalog_changed', revision); } catch {}
  try {
    const [{ db, auth, authReady }, { doc, setDoc }] = await Promise.all([
      import('@/lib/firebase'),
      import('firebase/firestore'),
    ]);
    await authReady;
    if (!auth.currentUser) throw new Error('No hay una sesión de administrador activa');
    await setDoc(doc(db, 'catalog_sync', 'current'), { revision });
  } catch (error) {
    console.error('[catalog] No se pudo avisar a los clientes del cambio:', error);
  }
}
