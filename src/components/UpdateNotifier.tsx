'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * UpdateNotifier — Detecta cuando el admin guarda cambios en el Theme Editor
 * y muestra un banner prominente para que los clientes recarguen la página.
 *
 * Consulta /api/version cada 30s y compara el timestamp con el inicial.
 */
export default function UpdateNotifier() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [initialTimestamp, setInitialTimestamp] = useState<number>(0);

  // Obtener timestamp inicial al cargar
  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then(data => {
        if (data.updatedAt) {
          setInitialTimestamp(data.updatedAt);
        }
      })
      .catch(() => {});
  }, []);

  // Poll cada 12 horas (43,200,000ms) a petición del administrador para ahorrar llamadas
  useEffect(() => {
    if (initialTimestamp === 0) return;

    const interval = setInterval(() => {
      fetch('/api/version')
        .then(r => r.json())
        .then(data => {
          if (data.updatedAt && data.updatedAt > initialTimestamp) {
            setShowUpdate(true);
          }
        })
        .catch(() => {});
    }, 43200000);

    return () => clearInterval(interval);
  }, [initialTimestamp]);

  const handleReload = useCallback(() => {
    // Hard reload — limpiar caches y recargar
    const clearAndReload = () => window.location.reload();
    if ('caches' in window && (window as any).caches) {
      (window as any).caches.keys().then((names: string[]) => {
        names.forEach((name: string) => (window as any).caches.delete(name));
      }).then(clearAndReload);
    } else {
      clearAndReload();
    }
  }, []);

  if (!showUpdate) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999]">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <p className="text-sm font-medium truncate">
              ¡Hay una actualización disponible! Recarga para ver los cambios.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleReload}
              className="flex items-center gap-2 px-4 py-1.5 bg-white text-blue-700 rounded-lg text-sm font-bold hover:bg-blue-50 transition shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Recargar
            </button>
            <button
              onClick={() => setShowUpdate(false)}
              className="p-1.5 hover:bg-white/20 rounded-lg transition"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
