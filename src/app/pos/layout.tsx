import RequireAdminAuth from '@/components/pos/RequireAdminAuth';

// Todo /pos/* requiere sesión de administrador principal (ver /admin/login)
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdminAuth>
      {children}
    </RequireAdminAuth>
  );
}
