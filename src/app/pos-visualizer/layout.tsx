import RequireAdminAuth from '@/components/pos/RequireAdminAuth';

// 🔒 La pantalla de cliente también requiere sesión admin (dominio público)
export default function PosVisualizerLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdminAuth>{children}</RequireAdminAuth>;
}
