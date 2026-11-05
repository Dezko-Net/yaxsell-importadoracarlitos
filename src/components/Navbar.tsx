'use client';

import Link from 'next/link';
import { ShoppingCart, User, Search, Menu, X, Package } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useState } from 'react';

export default function Navbar() {
  const { totalItems } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 glass border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold gradient-text">Tienda</Link>

        <div className="hidden md:flex items-center gap-6 text-sm text-gray-600">
          <Link href="/productos" className="hover:text-gray-900 transition-colors">Productos</Link>
          <Link href="/cuenta/pedidos" className="hover:text-gray-900 transition-colors">Mis Pedidos</Link>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/productos" className="p-2 text-gray-500 hover:text-gray-900 transition-colors hidden md:flex">
            <Search size={18} />
          </Link>
          <Link href="/cuenta/pedidos" className="p-2 text-gray-500 hover:text-gray-900 transition-colors hidden md:flex">
            <User size={18} />
          </Link>
          <Link href="/carrito" className="relative p-2 text-gray-700 hover:text-gray-900 transition-colors">
            <ShoppingCart size={20} />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {totalItems > 9 ? '9+' : totalItems}
              </span>
            )}
          </Link>
          <button className="md:hidden p-2 text-gray-500 hover:text-gray-900" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden glass border-t border-gray-200 px-6 py-4 flex flex-col gap-4 text-sm">
          <Link href="/productos" onClick={() => setMenuOpen(false)} className="text-gray-600 hover:text-gray-900 flex items-center gap-2"><Package size={16}/> Productos</Link>
          <Link href="/cuenta/pedidos" onClick={() => setMenuOpen(false)} className="text-gray-600 hover:text-gray-900 flex items-center gap-2"><User size={16}/> Mis Pedidos</Link>
        </div>
      )}
    </nav>
  );
}
