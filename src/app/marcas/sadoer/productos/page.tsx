'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Menu, 
  Search, 
  User, 
  ShoppingBag, 
  X 
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/hooks/useAuth';
import DynamicCollectionAll from '@/components/DynamicCollectionAll';
import NavAvatarWithBadge from '@/components/NavAvatarWithBadge';
import { getServices, getFirebaseConfig, MEDIA_BUCKET_ID, formatPrice } from '@/lib/db';

const LOGO = '';

export default function SadoerProductsPage() {
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loyaltyLevelId, setLoyaltyLevelId] = useState<string | null>(null);

  const { totalItems, subtotal } = useCart();
  const { isLoggedIn, user } = useAuth();

  // Load user avatar and VIP level
  useEffect(() => {
    if (!isLoggedIn) { setAvatarUrl(null); setLoyaltyLevelId(null); return; }
    (async () => {
      try {
        const { account } = getServices();
        const acc = await account.get();
        const prefs = (acc as { prefs?: Record<string, unknown> }).prefs || {};
        const { endpoint, projectId } = getFirebaseConfig();
        if (prefs.avatarFileId) {
          setAvatarUrl(`${endpoint}/storage/buckets/${MEDIA_BUCKET_ID}/files/${prefs.avatarFileId}/view?project=${projectId}`);
        } else {
          setAvatarUrl(null);
        }
        setLoyaltyLevelId(prefs.loyaltyLevel ? String(prefs.loyaltyLevel) : 'bronze');
      } catch {
        setAvatarUrl(null);
        setLoyaltyLevelId(null);
      }
    })();
  }, [isLoggedIn, user?.id]);

  return (
    <div className="w-full bg-white font-sans antialiased text-gray-800">
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.3s ease-out forwards;
        }
        .sadoer-header-logo {
          height: 42px !important;
          max-height: 42px !important;
          width: auto !important;
          display: block !important;
        }
        @media (min-width: 768px) {
          .sadoer-header-logo {
            height: 52px !important;
            max-height: 52px !important;
          }
        }
        .sadoer-drawer-logo {
          height: 48px !important;
          max-height: 48px !important;
          width: auto !important;
          display: block !important;
        }
        .tpl1-nav {
          display: none !important;
        }
        .yaxsel-nav-avatar-wrap img {
          border-radius: 50% !important;
          object-fit: cover !important;
        }
      `}</style>

      {/* Announcement Bar */}
      <div className="w-full bg-[#d08395] text-white py-2.5 px-4 text-center text-xs font-semibold tracking-wider relative flex items-center justify-center min-h-[36px]">
        <span>Importadora Carlitos te da la bienvenida al apartado de Sadoer.</span>
      </div>

      {/* Bespoke Header */}
      <header className="sticky top-0 z-40 w-full bg-white border-b border-gray-100 px-4 py-2 md:py-2.5 md:px-8 flex items-center justify-between min-h-[56px] md:min-h-[64px]">
        {/* Left: Menu & Search */}
        <div className="flex items-center gap-1 md:gap-2">
          <button 
            onClick={() => setMenuOpen(true)}
            className="p-2 border border-gray-200 rounded hover:bg-gray-50 transition-colors focus:outline-none"
            aria-label="Menú"
          >
            <Menu size={16} className="text-gray-700" />
          </button>
          <Link href="/marcas/sadoer/productos" className="p-2 text-gray-500 hover:text-[#ca7d90] transition-colors">
            <Search size={16} />
          </Link>
        </div>

        {/* Center: Brand Logo */}
        <div className="flex-1 flex justify-center">
          <Link href="/" className="flex items-center">
            <img src={LOGO} alt="SADOER" className="sadoer-header-logo object-contain" />
          </Link>
        </div>

        {/* Right: Account & Cart */}
        <div className="flex items-center gap-2 md:gap-3">
          {isLoggedIn && user ? (
            <Link href="/cuenta" className="hover:opacity-85 transition-opacity flex items-center justify-center shrink-0 mx-1">
              <NavAvatarWithBadge 
                avatarUrl={avatarUrl} 
                userName={user.name} 
                size={26} 
                loyaltyLevelId={loyaltyLevelId} 
              />
            </Link>
          ) : (
            <Link href="/login" className="p-2 text-gray-500 hover:text-[#ca7d90] transition-colors">
              <User size={16} />
            </Link>
          )}
          
          <Link href="/carrito" className="flex items-center gap-1.5 p-2 hover:text-[#ca7d90] transition-colors">
            <span className="text-xs font-bold text-gray-600 hidden sm:inline">{formatPrice(subtotal)}</span>
            <div className="relative">
              <ShoppingBag size={16} className="text-gray-700" />
              <span className="absolute -top-1.5 -right-1.5 bg-[#ca7d90] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white">
                {totalItems}
              </span>
            </div>
          </Link>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative w-full max-w-[280px] bg-white h-full p-6 shadow-2xl flex flex-col justify-between animate-slide-in">
            <div>
              <div className="flex justify-between items-center mb-8">
                <img src={LOGO} alt="SADOER" className="sadoer-drawer-logo object-contain" />
                <button onClick={() => setMenuOpen(false)} className="p-1 hover:bg-gray-100 rounded-full focus:outline-none">
                  <X size={18} className="text-gray-400" />
                </button>
              </div>
              <nav className="flex flex-col gap-4 text-sm font-semibold text-gray-700">
                <Link href="/marcas/sadoer" className="hover:text-[#ca7d90] transition py-1" onClick={() => setMenuOpen(false)}>Inicio</Link>
                <Link href="/marcas/sadoer/productos" className="hover:text-[#ca7d90] transition py-1" onClick={() => setMenuOpen(false)}>Catálogo Sadoer</Link>
                <Link href="/productos?brand=SADOER" className="hover:text-[#ca7d90] transition py-1" onClick={() => setMenuOpen(false)}>Catálogo Completo</Link>
              </nav>
            </div>
            <div className="border-t border-gray-100 pt-6">
              <Link 
                href={isLoggedIn ? "/cuenta" : "/login"} 
                className="flex items-center gap-3 text-sm font-semibold text-gray-700 hover:text-[#ca7d90] transition py-1"
                onClick={() => setMenuOpen(false)}
              >
                <User size={18} />
                <span>{isLoggedIn ? "Mi Cuenta" : "Iniciar Sesión"}</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Catalog Section */}
      <main className="w-full min-h-screen">
        <DynamicCollectionAll initialBrand="SADOER" />
      </main>
    </div>
  );
}

