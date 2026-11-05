'use client';

import AdminRouteGuard from '@/components/admin/AdminRouteGuard';

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminRouteGuard>
      <style>{`
        .global-mobile-nav,
        .tpl1-bottom-nav,
        .fusion-mobile-bottom-nav,
        [data-bottom-nav],
        nav[class*='bottom'],
        .bottom-nav {
          display: none !important;
        }
        body {
          padding-bottom: 0 !important;
        }
      `}</style>
      {children}
    </AdminRouteGuard>
  );
}

