'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PosDefaultRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/pos-acceso');
  }, [router]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3 font-sans">
      <div className="w-9 h-9 border-[3px] border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      <p className="text-slate-500 text-sm">Redirigiendo a tu sucursal…</p>
    </div>
  );
}
