'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { SEDES, DEFAULT_SEDE, SedeSlug } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { useServiceModules } from '@/hooks/useServiceModules';
import { auth } from '@/lib/firebase';
import { isAdminEmail } from '@/lib/admin-access';
import { isSupremeOwner } from '@/lib/supreme-owner';
import { getErpUserByEmail, hasModuleAccess, type AppModule } from '@/lib/erpUserService';
import { normalizePosAccessLevel, type PosAccessLevel } from '@/lib/posAccessLevels';
import { isSellerCargo } from '@/lib/posSellerRoles';
import { workerBranchSlugs, matchBranchSlug } from '@/lib/posBranchAccess';
import { getDefaultRuntimeConfig } from '@/app/admin-supreme/helpers';
import { LayoutDashboard, ShoppingCart, RotateCcw, FileText, Store,
  Lock, Settings, Menu, X, ArrowLeft, ArrowRight, Boxes, ClipboardList,
  PackageCheck, UserCog, LogOut, Tag, Edit3, Database, Globe, Shield } from 'lucide-react';

import PosBrand from '@/components/pos/PosBrand';
import design from '@/components/pos/pos-design.module.css';
import styles from './admin-shell.module.css';

const navigation = [
  { label: 'Operación de sucursal', items: [
    { label: 'Ventas y comprobantes', path: 'ventas', icon: FileText },
    { label: 'Cierres de caja', path: 'cortes', icon: ClipboardList },
    { label: 'Gestionar cajas', path: 'caja-cerrar', icon: Lock },
    { label: 'Devoluciones y Anulaciones', path: 'devoluciones', icon: RotateCcw },
    { label: 'Ediciones y Precios Especiales', path: 'modificaciones', icon: Edit3 },
  ] },
  { label: 'Catálogo de productos', items: [
    { label: 'Inventario', path: 'stock', icon: Boxes },
    { label: 'Listas de precios', path: 'precios', icon: Tag },
    { label: 'Recepciones', path: 'recepciones', icon: PackageCheck },
  ] },
];

function getCachedStaffProfile(): { photoURL?: string; nombre?: string; cargo?: string } {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('asistora_pos_session') || localStorage.getItem('yaxsel_pos_session');
    if (raw) {
      const p = JSON.parse(raw);
      if (p && (p.fotoUrl || p.nombre)) {
        return { photoURL: p.fotoUrl || '', nombre: p.nombre, cargo: p.cargo };
      }
    }
  } catch {}
  try {
    const rawUser = localStorage.getItem('yaxsel_auth_user');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u && (u.photoURL || u.name)) {
        return { photoURL: u.photoURL || '', nombre: u.name };
      }
    }
  } catch {}
  return {};
}

export default function PosAdminSedeLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ sede: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const currentSede = ((params?.sede) || DEFAULT_SEDE) as SedeSlug;
  const { user, isLoading: authLoading, isLoggedIn, logout } = useAuth();
  const { modules: services, ready: servicesReady } = useServiceModules();
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname }, [pathname]);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [allowedBranches, setAllowedBranches] = useState<string[]>([]);
  const [userInfo, setUserInfo] = useState<{ displayName: string; cargo: string; photoURL: string; nivelAccesoPos: PosAccessLevel; isSupreme: boolean; modules: AppModule[] }>({
    displayName: '', cargo: '', photoURL: '', nivelAccesoPos: 'bajo', isSupreme: false, modules: [],
  });
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [userInfo.photoURL]);

  // Guard: verificar acceso al módulo POS y resolver foto/datos completos del usuario/personal
  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) { router.replace('/admin/login?next=' + pathnameRef.current); return; }

    const isSup = isAdminEmail(user?.email);
    if (!isSup) setHasAccess(null);
    const cached = getCachedStaffProfile();
    const defaultOwnerPhoto = getDefaultRuntimeConfig().ownerProfile?.photoURL || getDefaultRuntimeConfig().branding?.defaultUserAvatarUrl || '';

    // Si es administrador supremo, habilitar acceso y foto de forma inmediata
    if (isSup) {
      setHasAccess(true);
      const immediatePhoto =
        auth.currentUser?.photoURL ||
        user?.photoURL ||
        cached.photoURL ||
        defaultOwnerPhoto ||
        '';
      setUserInfo({
        displayName: user?.name || cached.nombre || 'Administrador',
        cargo: 'Administrador',
        photoURL: immediatePhoto,
        nivelAccesoPos: 'alto',
        isSupreme: true,
        modules: ['admin_supreme'],
      });
    }

    let cancelled = false;

    (async () => {
      try {
        const info = await getErpUserByEmail(user?.email || '', false);
        let level = isSup ? 'alto' : normalizePosAccessLevel(info?.nivelAccesoPos, info?.modules?.includes('pos_admin'));
        let cargo = isSup ? 'Administrador' : (info?.role || 'Trabajador');
        let isSeller = isSup ? false : isSellerCargo(cargo);
        let photoURL =
          info?.photoURL ||
          auth.currentUser?.photoURL ||
          user?.photoURL ||
          cached.photoURL ||
          (isSup ? defaultOwnerPhoto : '');
        let displayName =
          info?.displayName ||
          user?.name ||
          cached.nombre ||
          (isSup ? 'Administrador' : (user?.email?.split('@')[0] || 'Usuario'));

        let workerBranches: string[] | null = null;
        if (info?.trabajadorId || info?.displayName || user?.email) {
          try {
            const { fetchTrabajadorERP } = await import('@/lib/trabajadoresErpService');
            const trab = await fetchTrabajadorERP(info?.trabajadorId, info?.displayName || displayName);
            if (trab) {
              workerBranches = workerBranchSlugs(trab);
              if (trab.fotoUrl) photoURL = trab.fotoUrl;
              if (trab.nombre && !info?.displayName) displayName = trab.nombre;
              if (!isSup) {
                cargo = trab.cargo || cargo;
                isSeller = isSellerCargo(cargo);
                level = isSeller ? 'bajo' : normalizePosAccessLevel(trab.nivelAccesoPos, trab.puedeGestionarCaja);
              }
            }
          } catch {}
        }

        if (isSup && !photoURL) {
          photoURL = defaultOwnerPhoto;
        }

        if (cancelled) return;

        const branches = isSup ? [] : workerBranches ?? (info?.trabajadorId ? [] : (Array.isArray(info?.branchSlugs) ? info.branchSlugs : []));
        const canEnterPosAdmin = isSup || (!isSeller && level !== 'bajo' && branches.some(b => matchBranchSlug(b, currentSede)));
        const modules: AppModule[] = isSup
          ? ['admin_supreme']
          : Array.isArray(info?.modules) ? info.modules : [];
        setAllowedBranches(branches);
        setUserInfo({
          displayName,
          cargo,
          photoURL,
          nivelAccesoPos: level,
          isSupreme: isSup,
          modules,
        });
        setHasAccess(canEnterPosAdmin);
      } catch (err) {
        console.error('Error cargando perfil en POS Admin:', err);
        if (!cancelled) setHasAccess(isSup);
      }
    })();

    return () => { cancelled = true; };
  }, [authLoading, isLoggedIn, user?.email, user?.name, user?.photoURL, router, currentSede]);

  useEffect(() => {
    if (!hasAccess || userInfo.isSupreme) return
    const path = pathname.split('/').slice(3).join('/')
    if ((path === 'config' || path.startsWith('config/')) || ((path === 'usuarios' || path.startsWith('usuarios/')) && userInfo.nivelAccesoPos !== 'alto')) {
      router.replace(`${basePath}/ventas`)
    }
  }, [hasAccess, userInfo.isSupreme, userInfo.nivelAccesoPos, pathname, router, currentSede])

  const [dynamicBranches, setDynamicBranches] = useState<Array<{ slug: string; name: string }>>([
    { slug: DEFAULT_SEDE, name: SEDES[DEFAULT_SEDE] || 'Importadora Carlitos Central' },
  ]);
  const [configLoaded, setConfigLoaded] = useState(false);

  React.useEffect(() => {
    fetch('/api/admin-supreme/load-config')
      .then(res => res.json())
      .then(res => {
        if (res.ok && res.data) {
          try {
            const parsed = JSON.parse(res.data);
            if (Array.isArray(parsed.branches) && parsed.branches.length > 0) {
              const active = parsed.branches
                .filter((b: any) => b.active !== false)
                .map((b: any) => ({
                  slug: b.slug || b.name?.toLowerCase().replace(/\s+/g, '-'),
                  name: b.name || b.slug,
                }));
              if (active.length > 0) setDynamicBranches(active);
            }
            const configPhoto = parsed.ownerProfile?.photoURL || parsed.branding?.defaultUserAvatarUrl;
            if (configPhoto) {
              setUserInfo(prev => {
                if (!prev.photoURL || prev.isSupreme) {
                  return { ...prev, photoURL: prev.photoURL || configPhoto };
                }
                return prev;
              });
            }
          } catch (e) {
            console.error('Error parsing POS Admin config:', e);
          }
        }
      })
      .catch(err => console.error('Error fetching POS Admin config:', err))
      .finally(() => setConfigLoaded(true));
  }, []);

  React.useEffect(() => {
    if (!configLoaded) return;
    if (dynamicBranches.length > 0) {
      const isCurrentActive = dynamicBranches.some(b => matchBranchSlug(b.slug, currentSede));
      if (!isCurrentActive) {
        const pathParts = pathname.split('/');
        const subPath = pathParts.slice(3).join('/') || 'ventas';
        router.replace(`/pos-admin/${dynamicBranches[0].slug}/${subPath}`);
      }
    }
  }, [configLoaded, dynamicBranches, currentSede, pathname, router]);

  const activeBranchObj = dynamicBranches.find(b => matchBranchSlug(b.slug, currentSede));
  const visibleBranches = userInfo.isSupreme ? dynamicBranches : dynamicBranches.filter(branch => allowedBranches.some(b => matchBranchSlug(b, branch.slug)));
  const sedeNombre = activeBranchObj ? activeBranchObj.name : (SEDES[currentSede] || currentSede.replace(/-/g, ' '));
  const basePath = `/pos-admin/${currentSede}`;
  const handleTopBack = () => {
    const canNavigate = window.dispatchEvent(new Event('pos-admin-back', { cancelable: true }));
    if (!canNavigate) return;
    router.push(pathname.replace(/\/$/, '') === basePath ? '/erp-dashboard' : basePath);
  };
  const canManageTeam = userInfo.isSupreme || userInfo.nivelAccesoPos === 'alto';
  const canAccessModule = (module: AppModule) => userInfo.isSupreme || hasModuleAccess(userInfo.modules, module);
  const platformLinks = ([
    { label: 'Base de datos', href: '/erp-dashboard/base-datos', icon: Database, module: 'base_datos' },
    { label: 'Web', href: '/admin/dashboard', icon: Globe, module: 'web' },
    { label: 'Dashboard ERP', href: '/erp-dashboard', icon: LayoutDashboard, module: 'erp' },
  ] satisfies Array<{ label: string; href: string; icon: typeof Store; module: AppModule }>).filter(item => servicesReady && (item.module === 'web' ? services.web : services.erp) && canAccessModule(item.module));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pos_admin_sidebar_collapsed');
      if (saved === 'true') setSidebarCollapsed(true);
    } catch {}
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('pos_admin_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  const pageLabel = navigation.flatMap(group => group.items).find(item => pathname === basePath + '/' + item.path)?.label
    || (pathname.endsWith('/usuarios') ? 'Usuarios y roles' : pathname.endsWith('/config') ? 'Configuración' : 'Resumen de sucursal');
  const navLink = (label: string, path: string, Icon: typeof Store) => (
    <Link key={path} href={path ? basePath + '/' + path : basePath}
      onClick={() => setMobileOpen(false)} className={styles.navLink}
      aria-current={pathname.replace(/\/$/, '') === (path ? basePath + '/' + path : basePath) ? 'page' : undefined}>
      <Icon size={18} strokeWidth={1.7} /><span>{label}</span>
    </Link>
  );
  const platformNavLink = (label: string, href: string, Icon: typeof Store) => (
    <Link key={href} href={href}
      onClick={() => setMobileOpen(false)} className={styles.navLink}
      aria-current={pathname === href || (href !== '/erp-dashboard' && pathname.startsWith(`${href}/`)) ? 'page' : undefined}>
      <Icon size={18} strokeWidth={1.7} /><span>{label}</span>
    </Link>
  );
  const sidebarContent = (
    <div className={styles.sidebarInner}>
      <div className={styles.brandRow}>
        <PosBrand href={basePath} />
        {!mobileOpen && (
          <button
            type="button"
            onClick={toggleSidebar}
            className={styles.sidebarToggleButton}
            aria-label="Contraer barra lateral"
            title="Ocultar menú lateral"
          >
            <ArrowLeft size={16} />
          </button>
        )}
      </div>
      <div className={styles.branch}>
        <label htmlFor={mobileOpen ? 'pos-sede-mobile' : 'pos-sede-desktop'}><Store size={13} /> Sucursal de trabajo</label>
        {visibleBranches.length > 1 ? (
          <select id={mobileOpen ? 'pos-sede-mobile' : 'pos-sede-desktop'} value={currentSede}
            onChange={event => router.push('/pos-admin/' + event.target.value)}>
            {visibleBranches.map(branch => <option key={branch.slug} value={branch.slug}>{branch.name}</option>)}
          </select>
        ) : <strong>{sedeNombre}</strong>}
      </div>
      <nav className={styles.nav} aria-label="Administración POS">
        {navLink('Resumen', '', LayoutDashboard)}
        {navigation.map(group => <div className={styles.group} key={group.label}>
          <p className={styles.groupLabel}>{group.label}</p>
          {group.items.map(item => navLink(item.label, item.path, item.icon))}
        </div>)}
        {(canManageTeam || userInfo.isSupreme) && <div className={styles.group}>
          <p className={styles.groupLabel}>Administración</p>
          {canManageTeam && navLink('Usuarios y roles', 'usuarios', UserCog)}
          {userInfo.isSupreme && navLink('Configuración', 'config', Settings)}
          {isSupremeOwner(user?.id, user?.email) && navLink('Admin Supreme POS', 'supreme', Shield)}
        </div>}
        {platformLinks.length > 0 && <div className={styles.group}>
          <p className={styles.groupLabel}>Plataformas</p>
          {platformLinks.map(item => platformNavLink(item.label, item.href, item.icon))}
        </div>}
      </nav>
      <div className={styles.sidebarFooter}>
        <Link className={design.primary} href={'/pos/' + currentSede}><ShoppingCart size={17} /> Ir al punto de venta</Link>
        <button onClick={async () => { try { await logout() } catch {} router.replace('/admin/login') }}><LogOut size={15} /> Cerrar sesión</button>
      </div>
    </div>
  );

  if (authLoading || hasAccess === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-gray-200 border-t-gray-700 animate-spin" />
          <p className="text-sm text-gray-500">Verificando acceso...</p>
        </div>
      </div>
    )
  }

  if (hasAccess === false) {
    const isAllowedCurrent = userInfo.isSupreme || allowedBranches.some(b => matchBranchSlug(b, currentSede))
    const branchDenied = !isAllowedCurrent
    const accessReason = branchDenied
      ? 'Esta sucursal no está asignada en tu ficha de planilla. Pide que te habiliten allí si necesitas operar en ambas.'
      : isSellerCargo(userInfo.cargo)
      ? 'Los perfiles de vendedor solo tienen acceso al POS y no pueden entrar a POS Admin.'
      : 'Tu cuenta tiene nivel Bajo. Para entrar a POS Admin se necesita nivel Medio o Alto.'

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl shadow-slate-900/5 sm:p-9">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <Lock size={27} strokeWidth={2.1} />
          </div>
          <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.16em] text-amber-700">Acceso restringido</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">No tienes permiso para entrar aquí</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">{accessReason}</p>
          <div className="mx-auto mt-5 inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            <span className="truncate">{userInfo.displayName || user?.email || 'Cuenta actual'}</span>
            {userInfo.cargo && <span className="hidden text-slate-400 sm:inline">· {userInfo.cargo}</span>}
          </div>
          <Link
            href={`/pos/${allowedBranches[0] || currentSede}`}
            className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 sm:w-auto"
          >
            <ShoppingCart size={17} />
            Ir a la caja POS
          </Link>
        </section>
      </main>
    )
  }

  return (
    <div className={design.surface + ' ' + styles.shell}>
      <a href="#pos-admin-content" className={styles.skip}>Saltar al contenido</a>
      <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>{sidebarContent}</aside>
      {mobileOpen && (
        <div className={styles.drawerBackdrop} onClick={() => setMobileOpen(false)}>
          <div className={styles.drawer} onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Navegación POS Admin">
            <button className={styles.drawerClose} onClick={() => setMobileOpen(false)} aria-label="Cerrar menú"><X size={20} /></button>
            {sidebarContent}
          </div>
        </div>
      )}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <button onClick={() => setMobileOpen(true)} className={styles.menuButton} aria-label="Abrir menú" aria-expanded={mobileOpen}><Menu size={20} /></button>
            {sidebarCollapsed && (
              <div className={styles.collapsedBrandBlock}>
                <PosBrand href={basePath} />
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className={styles.sidebarToggleButton}
                  aria-label="Expandir barra lateral"
                  title="Mostrar menú lateral"
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
            <div><p>POS Admin</p><strong>{pageLabel}</strong></div>
          </div>
          <div className={styles.account}>
            <div className={styles.accountText}>
              <strong>{userInfo.displayName || user?.name || 'Administrador'}</strong>
              <span>{userInfo.cargo || 'Administrador'}</span>
            </div>
            <div className={styles.avatar}>
              {userInfo.photoURL && !avatarError ? (
                <img
                  src={userInfo.photoURL}
                  alt={userInfo.displayName || 'Personal'}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                (userInfo.displayName || user?.name || 'A').slice(0, 1).toUpperCase()
              )}
            </div>
          </div>
        </header>
        <main id="pos-admin-content" tabIndex={-1} className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
