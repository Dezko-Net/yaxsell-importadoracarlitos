'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { isAdminEmail } from '@/lib/admin-access';
import { getErpUserByEmail, getRedirectForModules, hasModuleAccess } from '@/lib/erpUserService';
import { MODULE_ACCESS } from '@/lib/module-access';

/** Protege rutas /admin/* (excepto login) y puede reutilizarse en /inventario */
export default function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoggedIn, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  const isLoginRoute = pathname === '/admin/login' || pathname?.startsWith('/admin/login/');

  useEffect(() => {
    if (isLoginRoute || isLoading) return;
    if (!isLoggedIn) {
      router.replace('/admin/login');
      return;
    }
    // Admin supremo siempre tiene acceso
    if (isAdminEmail(user?.email)) {
      setHasAccess(true)
      setAccessChecked(true)
      return
    }
    // Verificar módulo web en erp_users
    ;(async () => {
      const info = await getErpUserByEmail(user?.email || '')
      if (hasModuleAccess(info?.modules, 'web')) {
        setHasAccess(true)
      } else {
        setHasAccess(false)
        // Redirigir al módulo correcto del usuario en vez de al login
        const dest = !MODULE_ACCESS.erp && !MODULE_ACCESS.pos
          ? '/admin/login?reason=web-access'
          : getRedirectForModules(info?.modules || [], false)
        router.replace(dest)
      }
      setAccessChecked(true)
    })()
  }, [isLoginRoute, isLoading, isLoggedIn, user?.email, router]);

  if (isLoginRoute) return <>{children}</>;
  if (isLoading || (isLoggedIn && !accessChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!isLoggedIn || !hasAccess) return null;

  return <>{children}</>;
}
