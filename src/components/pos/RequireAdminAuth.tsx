'use client';

/**
 * RequireAdminAuth — Guard de acceso para zonas POS (/pos, /pos-admin, /pos-visualizer).
 *
 * Deja pasar a:
 * - El admin supremo (isAdminEmail)
 * - Usuarios con módulo "pos" en erp_users
 *
 * Si no hay sesión, redirige a /admin/login?next=<ruta>.
 */

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { isAdminEmail } from '@/lib/admin-access';
import { getErpUserByEmail } from '@/lib/erpUserService';
import { ShieldCheck } from 'lucide-react';

export default function RequireAdminAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isLoggedIn, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [accessChecked, setAccessChecked] = useState(false);
  const [hasPosAccess, setHasPosAccess] = useState(false);

  useEffect(() => {
    if (isLoading || !isLoggedIn) return;
    // Admin supremo siempre tiene acceso
    if (isAdminEmail(user?.email)) { setHasPosAccess(true); setAccessChecked(true); return }
    // Verificar módulo pos en erp_users (con fallback a módulos cacheados en localStorage)
    ;(async () => {
      try {
        const info = await getErpUserByEmail(user?.email || '')
        if (info) {
          const allowed = !!(info.modules?.includes('pos') || info.modules?.includes('pos_admin') || info.modules?.includes('admin_supreme'))
          setHasPosAccess(allowed)
          if (allowed) {
            try { localStorage.setItem('asistora_pos_user_modules', JSON.stringify(info.modules)) } catch {}
          }
        } else {
          // Fallback a módulos guardados previamente en el equipo si hubo micro-corte de red
          const cachedModsRaw = typeof window !== 'undefined' ? localStorage.getItem('asistora_pos_user_modules') : null
          const cachedMods = cachedModsRaw ? JSON.parse(cachedModsRaw) : []
          setHasPosAccess(Array.isArray(cachedMods) && (cachedMods.includes('pos') || cachedMods.includes('pos_admin') || cachedMods.includes('admin_supreme')))
        }
      } catch {
        setHasPosAccess(true)
      }
      setAccessChecked(true)
    })()
  }, [isLoading, isLoggedIn, user?.email]);

  useEffect(() => {
    if (isLoading) return;
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    const next = encodeURIComponent(`${pathname}${qs}`);

    if (!isLoggedIn) {
      router.replace(`/admin/login?next=${next}`);
      return;
    }
    if (accessChecked && !hasPosAccess) {
      // Redirigir sin destruir la sesión (no llamar a logout() automático)
      router.replace(`/admin/login?next=${next}`);
    }
  }, [isLoading, isLoggedIn, accessChecked, hasPosAccess, pathname, router]);

  // Splash mientras se resuelve la sesión
  if (isLoading || (isLoggedIn && !accessChecked)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center shadow-lg shadow-slate-500/30">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <div className="w-8 h-8 border-[3px] border-slate-300 border-t-slate-700 rounded-full animate-spin" />
        <p className="text-slate-500 text-xs font-medium tracking-wide">Verificando acceso autorizado…</p>
      </div>
    );
  }

  // Mientras redirige no renderizar NADA del contenido protegido
  if (!isLoggedIn || !hasPosAccess) return null;

  return <>{children}</>;
}
