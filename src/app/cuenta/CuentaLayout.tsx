'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  User, ShoppingBag, Heart, MapPin, HelpCircle, Gift,
  LogOut, ChevronRight, MessageCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getServices, getFirebaseConfig, MEDIA_BUCKET_ID, MEDIA_PREFIXES } from '@/lib/db';
import { CuentaBgProvider, useCuentaBgUrl } from './CuentaBgContext';

const FF = '"DM Sans",system-ui,sans-serif';
const PINK = '#3b82f6';

const SIDEBAR_NAV = [
  { icon: User,         label: 'Mi cuenta',      href: '/cuenta'               },
  { icon: Heart,        label: 'Favoritos',        href: '/favoritos'             },
  { icon: MessageCircle,label: 'Chat Admin',       href: '/cuenta/chat'          },
  { icon: HelpCircle,   label: 'Soporte',          href: '/cuenta/tickets'        },
];

function getFilePreviewUrl(fileId: string): string {
  const { endpoint, projectId } = getFirebaseConfig();
  const path = fileId;
  return `${endpoint}/storage/buckets/${MEDIA_BUCKET_ID}/files/${path}/view?project=${projectId}`;
}

export default function CuentaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/cuenta' || pathname?.startsWith('/cuenta/favoritos')) {
    return <>{children}</>;
  }

  return (
    <CuentaBgProvider>
      <CuentaLayoutInner>{children}</CuentaLayoutInner>
    </CuentaBgProvider>
  );
}

function CuentaLayoutInner({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const { user, isLoggedIn, logout } = useAuth();
  const pathname = usePathname();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hasGifts, setHasGifts] = useState(false);
  const bgUrl = useCuentaBgUrl();
  const isPerfil = pathname === '/cuenta/perfil';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isLoggedIn || pathname === '/cuenta') return;
    (async () => {
      try {
        const { account } = getServices();
        const acc = await account.get();
        const prefs = (acc as any).prefs || {};
        if (prefs.avatarFileId) setAvatarUrl(getFilePreviewUrl(prefs.avatarFileId));
        setHasGifts(!prefs.welcomeGiftClaimed);
      } catch (err) {
        console.error('[CuentaLayout] Error fetching account:', err);
        const errStr = String(err);
        if (errStr.includes('401') || errStr.includes('unauthorized') || errStr.includes('Unauthorized') || (err as any).code === 401) {
          console.log('[CuentaLayout] Session unauthorized, logging out...');
          logout().then(() => {
            window.location.href = '/login';
          });
        }
      }
    })();
  }, [isLoggedIn, pathname]);

  // The account home owns its full-width scene and account navigation.
  if (pathname === '/cuenta' || pathname?.startsWith('/cuenta/favoritos')) return <>{children}</>;

  if (!mounted || !isLoggedIn || !user) {
    return (
      <div style={{ minHeight: '100vh', fontFamily: FF, background: '#f8fafc' }}>
        {children}
      </div>
    );
  }

  const userName = user?.name || 'Usuario';
  const initials = userName.split(' ').filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';

  async function handleLogout() {
    await logout();
    window.location.href = '/';
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative', fontFamily: FF }}>
      {/* Fondo neutro para que el contenido de la cuenta tenga una jerarquía limpia. */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, background: '#f3f4f6' }} />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
      <style>{`
        body { background-color: #f3f4f6 !important; }
        .cl-sidebar { display: none }
        @media (min-width: 900px) {
          .cl-sidebar { display: flex !important }
          .cl-main { padding-top: 86px !important; }
        }
        .sb-link {
          display: flex; align-items: center; justify-content: space-between; gap: 14px;
          padding: 13px 16px; border-radius: 12px;
          text-decoration: none; color: #4b5563; font-size: 15px; font-weight: 600;
          width: 100%; box-sizing: border-box; border: none; background: transparent; cursor: pointer;
          font-family: ${FF}; transition: all 0.18s;
        }
        .sb-link:hover { background: #f9fafb; color: #1a1a1a; }
        .sb-link.active { background: #eff6ff; color: ${PINK}; font-weight: 700; }
        .sb-link-content { display: flex; align-items: center; gap: 14px; }
        @keyframes pageSlideIn {
          0% { opacity: 0; transform: translateX(24px) scale(0.98); filter: blur(4px); }
          40% { opacity: 0.6; filter: blur(2px); }
          100% { opacity: 1; transform: translateX(0) scale(1); filter: blur(0); }
        }
        .cl-content-fade { animation: pageSlideIn 0.4s cubic-bezier(0.22, 1, 0.36, 1); }
        .account-mobile-dock {
          display: flex !important; flex-direction: row !important; position: fixed !important;
          z-index: 1000 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
          width: 100vw !important; max-width: 100vw !important; height: 64px !important;
          align-items: stretch !important; justify-content: space-around !important;
          padding: 7px 6px max(7px, env(safe-area-inset-bottom)) !important;
          margin: 0 !important; background: #fff !important;
          border-top: 1px solid rgba(0,0,0,.1) !important;
          box-shadow: 0 -4px 18px rgba(0,0,0,.08) !important; box-sizing: border-box !important;
        }
        .account-mobile-dock__item {
          display: flex !important; flex: 1 1 0 !important; flex-direction: column !important;
          align-items: center !important; justify-content: center !important; min-width: 0 !important;
          gap: 3px !important; color: #4b5563 !important; text-decoration: none !important;
          font-size: 10px !important; font-weight: 600 !important; line-height: 1.1 !important;
        }
        .account-mobile-dock__item svg { display: block !important; width: 19px !important; height: 19px !important; }
        .account-mobile-dock__item--active { color: ${PINK} !important; }
        @media (min-width: 900px) { .account-mobile-dock { display: none !important; } }
      `}</style>

      {/* ── Main content (flex layout on desktop) ── */}
      <div className="cl-main" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 12px 60px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* ── Sidebar (flex on desktop, hidden on mobile) ── */}
          <aside className="cl-sidebar" style={{ display: 'none', width: 280, flexShrink: 0 }}>
            <div style={{ background: '#fff', borderRadius: 18, padding: 20, border: '1.5px solid #d1d5db', boxShadow: 'inset 0 1px 2px 0 rgba(0,0,0,0.02), 0 1px 2px 0 rgba(0,0,0,0.03), 0 2px 8px 0 rgba(0,0,0,0.04), 0 4px 16px 0 rgba(0,0,0,0.02)', position: 'sticky', top: 92 }}>
              {/* Profile mini */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 8px 20px', borderBottom: '1px solid #f3f4f6', marginBottom: 10 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: avatarUrl ? 'transparent' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, color: PINK, fontWeight: 700, fontSize: 17 }}>
                  {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 13, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {SIDEBAR_NAV.map(({ icon: Icon, label, href }) => {
                  const isActive = pathname === href || (href !== '/cuenta' && pathname.startsWith(href));
                  const isRegalos = label === 'Regalos';
                  return (
                    <Link key={label} href={href} prefetch={false} className={`sb-link ${isActive ? 'active' : ''}`}>
                      <div className="sb-link-content" style={{ position: 'relative' }}>
                        <Icon size={20} strokeWidth={2} />
                        <span>{label}</span>
                        {isRegalos && hasGifts && (
                          <div className="gift-badge" style={{ 
                            position: 'absolute', 
                            top: '-4px', 
                            right: '-8px', 
                            width: 18, 
                            height: 18, 
                            background: '#3b82f6', 
                            color: '#fff', 
                            borderRadius: '50%', 
                            fontSize: 11, 
                            fontWeight: 900, 
                            display: 'flex',
                            alignItems: 'center', 
                            justifyContent: 'center',
                            border: '2px solid #fff'
                          }}>
                            1
                          </div>
                        )}
                      </div>
                      <ChevronRight size={14} style={{ opacity: 0.3 }} />
                    </Link>
                  );
                })}

                <div style={{ height: 1, background: '#f3f4f6', margin: '8px 0' }}></div>

                <button onClick={handleLogout} className="sb-link" style={{ color: '#dc2626', padding: '13px 16px' }}>
                  <div className="sb-link-content">
                    <LogOut size={20} strokeWidth={2} />
                    <span>Cerrar sesión</span>
                  </div>
                </button>
              </div>
            </div>
          </aside>

          {/* ── Content area ── */}
          <div key={pathname} style={{ flex: 1, minWidth: 0 }} className="cl-content-fade">
            {children}
          </div>
        </div>
      </div>

      </div>
    </div>
  );
}
