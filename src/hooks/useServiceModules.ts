'use client';
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SERVICE_MODULES, normalizeServiceModules, type ServiceModules } from '@/lib/module-access';

export function useServiceModules() {
  const [modules, setModules] = useState<ServiceModules>(DEFAULT_SERVICE_MODULES);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/module-access', { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudo cargar el estado de los servicios.');
      const data = await res.json();
      setModules(normalizeServiceModules(data.modules));
      setError('');
      setReady(true);
    } catch (err) {
      setReady(false);
      setError(err instanceof Error ? err.message : 'No se pudo cargar el estado de los servicios.');
    }
  }, []);
  useEffect(() => {
    void refresh();
    const update = () => { void refresh(); };
    window.addEventListener('focus', update);
    window.addEventListener('yaxsell:services-changed', update);
    return () => { window.removeEventListener('focus', update); window.removeEventListener('yaxsell:services-changed', update); };
  }, [refresh]);
  return { modules, ready, error, refresh };
}
