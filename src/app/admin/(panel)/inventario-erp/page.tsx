'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InventarioErpRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/inventario');
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans text-slate-400 text-sm">
      Cargando Base de Datos e Inventario ERP...
    </div>
  );
}
