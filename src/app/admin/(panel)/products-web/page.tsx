'use client';

import { BaseDatosEmbedded } from '@/components/erp/BaseDatosWorkspace';
import WebProductsWorkspace from '@/components/admin/WebProductsWorkspace';
import { useStoreSettings } from '@/hooks/useStoreSettings';

export default function AdminWebProductsPage() {
  const { isLoading, inventoryMode } = useStoreSettings();
  if (isLoading) {
    return (
      <div className="wpw-app space-y-3.5 animate-pulse">
        <style>{`.admin-main-content:has(.wpw-app), .admin-content-wrap:has(.wpw-app) { background: #eef2f6 !important; }`}</style>
        {/* Mobile Bento Hero Skeleton */}
        <div className="sm:hidden h-36 rounded-[24px] bg-white border border-slate-300 border-t-[3px] border-t-indigo-500 p-4 flex flex-col justify-between shadow-sm">
          <div className="h-5 w-40 rounded-lg bg-slate-200/80" />
          <div className="grid grid-cols-3 gap-2">
            <div className="h-14 rounded-2xl bg-slate-100 border border-slate-200" />
            <div className="h-14 rounded-2xl bg-slate-100 border border-slate-200" />
            <div className="h-14 rounded-2xl bg-slate-100 border border-slate-200" />
          </div>
        </div>
        {/* Desktop Header + Bento Skeleton */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="h-7 w-48 rounded-xl bg-slate-200/80" />
          <div className="flex gap-2">
            <div className="h-9 w-28 rounded-xl bg-white border border-slate-300" />
            <div className="h-9 w-40 rounded-xl bg-indigo-200/70" />
          </div>
        </div>
        <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white border border-slate-300 border-t-[3px] border-t-indigo-400 shadow-xs" />
          ))}
        </div>
        <div className="h-24 rounded-[22px] bg-white border border-slate-300 shadow-xs" />
        <div className="h-64 rounded-[24px] bg-white border border-slate-300 shadow-xs" />
      </div>
    );
  }
  return inventoryMode === 'web_independent' ? (
    <WebProductsWorkspace />
  ) : (
    <BaseDatosEmbedded view="productos-web" />
  );
}
