'use client';
import ServiceModuleSettings from '@/components/admin/ServiceModuleSettings';
import { useAuth } from '@/hooks/useAuth';
import { isSupremeOwner } from '@/lib/supreme-owner';

export default function SupremePosPage() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <main className="p-6">Cargando…</main>;
  if (!isSupremeOwner(user?.id, user?.email)) return <main className="p-6">Acceso restringido.</main>;
  return <main className="mx-auto max-w-4xl space-y-6 p-6"><div><h1 className="text-2xl font-bold">Admin Supreme POS</h1><p className="mt-1 text-sm text-slate-600">Administración de servicios de la tienda.</p></div><ServiceModuleSettings source="pos" /></main>;
}
