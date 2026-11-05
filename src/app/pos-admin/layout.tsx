import RequireAdminAuth from '@/components/pos/RequireAdminAuth';

// 🔒 Todo /pos-admin/* requiere sesión de administrador principal (ver /admin/login)
export default function PosAdminRootLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdminAuth>{children}</RequireAdminAuth>;
}
