'use client';
import { usePathname } from 'next/navigation';
import Navbar3 from '@/templates/plantilla3/Navbar';
import Navbar23 from '@/components/Navbar23';

export default function DynamicNavbar() {
  const pathname = usePathname();
  if (
    pathname === '/carrito' ||
    pathname?.startsWith('/cuenta') ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/inventario') ||
    pathname?.startsWith('/checkout') ||
    pathname?.startsWith('/confirmar-pedido') ||
    pathname?.startsWith('/verificar-stock') ||
    pathname?.startsWith('/pedido') ||
    pathname?.startsWith('/comprobante') ||
    pathname?.startsWith('/datos-envio')
  ) {
    return null;
  }

  // ── HOME (pathname === '/') ──
  // La Plantilla 3 inyecta su propio header/navbar de Shopify en el DOM;
  // Navbar3 retorna null para evitar duplicados.
  if (pathname === '/') return <Navbar3 />;

  // ── RESTO DE PÁGINAS ──
  // En todas las demás páginas (detalle de producto, catálogo, carrito, cuenta)
  // usamos el navbar React reutilizable.
  return <Navbar23 />;
}
