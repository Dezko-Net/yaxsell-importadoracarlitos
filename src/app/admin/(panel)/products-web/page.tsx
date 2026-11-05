'use client';

import { BaseDatosEmbedded } from '@/components/erp/BaseDatosWorkspace';
import WebProductsWorkspace from '@/components/admin/WebProductsWorkspace';
import { useStoreSettings } from '@/hooks/useStoreSettings';

export default function AdminWebProductsPage() {
  const { isLoading, inventoryMode } = useStoreSettings();
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-7 w-44 rounded-xl bg-gray-100" />
          <div className="flex gap-2">
            <div className="h-9 w-28 rounded-xl bg-gray-100" />
            <div className="h-9 w-36 rounded-xl bg-indigo-100" />
          </div>
        </div>
        <div className="h-28 rounded-3xl bg-sky-50/70 border border-sky-100 flex items-center px-6">
          <p className="text-xs font-semibold text-slate-500">Cargando productos web…</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-100/80" />
          ))}
        </div>
        <div className="h-28 rounded-[20px] bg-indigo-50/50" />
        <div className="h-64 rounded-2xl bg-gray-100/70" />
      </div>
    );
  }
  return inventoryMode === 'web_independent' ? (
    <WebProductsWorkspace />
  ) : (
    <BaseDatosEmbedded view="productos-web" />
  );
}
