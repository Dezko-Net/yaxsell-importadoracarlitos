'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { isAdminEmail } from '@/lib/admin-access';
import { getErpUserByEmail, getRedirectForModules, hasModuleAccess } from '@/lib/erpUserService';
import { moduleForPath } from '@/lib/module-access';
import { useServiceModules } from '@/hooks/useServiceModules';

/** Protege rutas /admin/* (excepto login) y puede reutilizarse en /inventario */
export default function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoggedIn, isLoading, logout } = useAuth();
  const { modules: services, ready: servicesReady } = useServiceModules();
  const router = useRouter();
  const pathname = usePathname();
  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  const isLoginRoute = pathname === '/admin/login' || pathname?.startsWith('/admin/login/');

  useEffect(() => {
    if (isLoginRoute || isLoading || !servicesReady) return;
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
        let dest = !services.erp && !services.pos
          ? '/admin/login?reason=web-access'
          : getRedirectForModules(info?.modules || [], false)
        const target = moduleForPath(dest.split('?')[0]);
        if (target && !services[target]) {
          dest = services.pos && (hasModuleAccess(info?.modules, 'pos') || hasModuleAccess(info?.modules, 'pos_admin'))
            ? '/pos-acceso'
            : services.erp && (hasModuleAccess(info?.modules, 'erp') || hasModuleAccess(info?.modules, 'erp_admin'))
              ? '/erp-dashboard' : '/admin/login?reason=web-access';
        }
        router.replace(dest)
      }
      setAccessChecked(true)
    })()
  }, [isLoginRoute, isLoading, isLoggedIn, user?.email, router, servicesReady, services]);

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
