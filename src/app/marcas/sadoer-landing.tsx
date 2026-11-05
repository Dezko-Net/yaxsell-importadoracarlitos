'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ChevronRight, 
  Star, 
  Sparkles, 
  Droplet, 
  Leaf, 
  Shield, 
  Menu, 
  Search, 
  User, 
  ShoppingBag, 
  X, 
  ArrowRight 
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/hooks/useAuth';
import { useProductsCache } from '@/hooks/useProductsCache';
import { getProductImageUrl } from '@/lib/product-images';
import NavAvatarWithBadge from '@/components/NavAvatarWithBadge';
import { getServices, getFirebaseConfig, MEDIA_BUCKET_ID, formatPrice } from '@/lib/db';

const SADOER_IMG = 'https://sadoerskincare.com/wp-content/uploads';
const LOGO = '';

const CATEGORIES = [
  { name: 'Skincare Facial (49)', realName: 'Skincare Facial', img: `${SADOER_IMG}/2026/03/sadoer-face-creams-300x300.webp` },
  { name: 'Tónicos y Esencias (12)', realName: 'Tónicos y Esencias', img: `${SADOER_IMG}/2026/03/sadoer-eye-creams-300x300.webp` },
  { name: 'Limpiadores Faciales (12)', realName: 'Limpiadores Faciales', img: `${SADOER_IMG}/2026/03/sadoer-facial-cleansers-300x300.webp` },
  { name: 'Otros (2)', realName: 'Otros', img: `${SADOER_IMG}/2026/03/sadoer-face-masks-300x300.webp` },
  { name: 'Rubor e Iluminador (1)', realName: 'Rubor e Iluminador', img: `${SADOER_IMG}/2026/03/sadoer-eye-masks-300x300.webp` },
];

const REVIEWS_24K = [
  `${SADOER_IMG}/2026/03/sadoer-24k-gold-pearl-face-cream-review-1.webp`,
  `${SADOER_IMG}/2026/03/sadoer-24k-gold-pearl-face-cream-review-2.webp`,
  `${SADOER_IMG}/2026/03/sadoer-24k-gold-pearl-face-cream-review-3.webp`,
  `${SADOER_IMG}/2026/03/sadoer-24k-gold-pearl-face-cream-review-4.webp`,
  `${SADOER_IMG}/2026/03/sadoer-24k-gold-pearl-face-cream-review-5.webp`,
];

const FAQS = [
  { q: '¿Los productos SADOER son auténticos?', a: 'Sí. Todos nuestros productos son 100% auténticos y directamente importados.' },
  { q: '¿Cómo hago un pedido?', a: 'Explora nuestro catálogo de productos SADOER, agrega al carrito y completa tu compra.' },
  { q: '¿Necesito una cuenta para comprar?', a: 'Puedes comprar como invitado, pero crear una cuenta te da acceso a descuentos exclusivos y seguimiento de pedidos.' },
  { q: '¿Qué métodos de pago aceptan?', a: 'Aceptamos tarjetas de crédito, débito, transferencias y pago contra entrega.' },
  { q: '¿Hacen envíos a todo el país?', a: 'Sí, enviamos a todo el país. El tiempo de entrega varía según tu ubicación.' },
  { q: '¿Cuál es la política de devoluciones?', a: 'Aceptamos devoluciones dentro de los 30 días posteriores a la compra, siempre que el producto esté sin usar.' },
];

const WHY_CHOOSE = [
  { icon: Sparkles, title: 'Piel Radiante', desc: 'Fórmulas diseñadas para iluminar y revitalizar tu piel.' },
  { icon: Droplet, title: 'Hidratación Duradera', desc: 'Ingredientes que mantienen tu piel hidratada todo el día.' },
  { icon: Leaf, title: 'Fórmulas Suaves', desc: 'Productos libres de químicos agresivos, aptos para piel sensible.' },
  { icon: Shield, title: 'Calidad Garantizada', desc: 'Productos auténticos con estándares de calidad internacional.' },
];

export default function SadoerLanding() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loyaltyLevelId, setLoyaltyLevelId] = useState<string | null>(null);
  
  const { totalItems, subtotal, addItem } = useCart();
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

  // Load real Sadoer products dynamically from Cache Hook
  const { products: realProducts, isLoadingInitialData: isLoading } = useProductsCache({
    brand: 'SADOER',
    serverPaginated: true,
    pageSize: 8
  });

  // Filter products for showcase categories
  const bestsellers = realProducts && realProducts.length > 0
    ? realProducts.slice(0, 4)
    : [];

  const essentials = realProducts && realProducts.length > 4
    ? realProducts.slice(4, 8)
    : (realProducts && realProducts.length > 0 ? realProducts.slice(0, Math.min(4, realProducts.length)) : []);

  const renderSkeletons = () => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 w-full">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-xs border border-[#ffeef2] animate-pulse">
          <div className="aspect-square bg-gray-100 w-full" />
          <div className="p-4 space-y-3">
            <div className="h-4 bg-gray-100 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );

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
                <Link href="#categorias" className="hover:text-[#ca7d90] transition py-1" onClick={() => setMenuOpen(false)}>Categorías</Link>
                <Link href="#productos" className="hover:text-[#ca7d90] transition py-1" onClick={() => setMenuOpen(false)}>Productos Destacados</Link>
                <Link href="/productos?brand=SADOER" className="hover:text-[#ca7d90] transition py-1" onClick={() => setMenuOpen(false)}>Catálogo Completo</Link>
                <Link href="#faq" className="hover:text-[#ca7d90] transition py-1" onClick={() => setMenuOpen(false)}>Preguntas Frecuentes</Link>
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

      {/* Hero Section */}
      <section className="relative w-full bg-[#ffeef2] pt-12 sm:pt-16 pb-0 flex flex-col items-center overflow-hidden">
        <div className="max-w-3xl mx-auto text-center px-6 z-10">
          {/* Eyebrow */}
          <span className="text-gray-500 tracking-[0.2em] text-xs sm:text-sm uppercase font-semibold">
            Importadora Carlitos
          </span>
          {/* Divider */}
          <div className="w-16 h-[1px] bg-[#ca7d90] my-4 mx-auto" />
          {/* Heading */}
          <h1 className="font-serif text-[#1c1c1c] text-3xl sm:text-5xl lg:text-[3.5rem] font-medium leading-tight max-w-2xl mx-auto mb-6" style={{ fontFamily: 'Georgia, serif' }}>
            Somos Distribuidores Oficiales de Sadoer en Chile
          </h1>
          {/* Subheading */}
          <p className="text-gray-600 text-sm sm:text-base lg:text-lg max-w-2xl mx-auto font-sans leading-relaxed mb-8 px-2">
            Importadora Carlitos trabaja directamente con la marca oficial. Tenemos todos sus productos para que disfrutes de una excelente experiencia y un cuidado óptimo de tu piel.
          </p>
          {/* Button */}
          <div className="mb-10">
            <Link href="#esenciales-diarios" className="inline-flex items-center gap-2 px-10 py-4 bg-[#b36b7c] hover:bg-[#a15a6b] text-white font-bold text-xs sm:text-sm tracking-widest uppercase transition-all duration-300 shadow-md rounded-none">
              Comprar Ahora <ArrowRight size={14} className="stroke-[2]" />
            </Link>
          </div>
        </div>
        
        {/* Model Image */}
        <div className="w-full max-w-[480px] sm:max-w-[540px] px-4 flex justify-center mt-2">
          <img
            src="/assets/sadoer-hero-model.jpg"
            alt="Sadoer Skincare Model"
            className="w-full h-auto object-contain"
          />
        </div>
      </section>

      {/* Shop by Category */}
      <section id="categorias" className="py-16 px-6 max-w-7xl mx-auto scroll-mt-20">
        <div className="text-center mb-10">
          <p className="text-[#ca7d90] text-xs font-bold uppercase tracking-widest mb-2">Explora</p>
          <h2 className="text-3xl font-bold text-gray-900">Comprar por Categoría</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {CATEGORIES.map((cat) => (
            <Link key={cat.name} href={`/marcas/sadoer/productos?categoria=${encodeURIComponent(cat.realName)}`} className="group cursor-pointer block" style={{ textDecoration: 'none' }}>
              <div className="aspect-square rounded-2xl overflow-hidden bg-[#ffeef2]/50 mb-3 transition-all group-hover:shadow-lg group-hover:scale-105">
                <img src={cat.img} alt={cat.name} className="w-full h-full object-cover" />
              </div>
              <p className="text-xs font-bold text-center text-gray-700 group-hover:text-[#ca7d90] transition">{cat.name}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Bestsellers */}
      <section id="productos" className="py-16 px-6 bg-[#ffeef2]/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[#ca7d90] text-xs font-bold uppercase tracking-widest mb-2">Favoritos</p>
            <h2 className="text-3xl font-bold text-gray-900">Nuestros Más Vendidos</h2>
          </div>
          
          {isLoading && bestsellers.length === 0 ? renderSkeletons() : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 w-full">
              {bestsellers.map((prod) => {
                const imgUrl = getProductImageUrl(prod) || 'https://via.placeholder.com/300';
                return (
                  <div key={prod.$id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all group flex flex-col justify-between">
                    <Link href={`/productos/${prod.$id}`} className="block">
                      <div className="aspect-square overflow-hidden bg-pink-50">
                        <img src={imgUrl} alt={prod.NAME} className="w-full h-full object-cover group-hover:scale-105 transition" />
                      </div>
                    </Link>
                    <div className="p-4 flex flex-col flex-1 justify-between">
                      <Link href={`/productos/${prod.$id}`} className="block">
                        <p className="text-sm sm:text-base font-bold text-gray-800 leading-snug mb-2 line-clamp-2 min-h-[48px] hover:text-[#ca7d90] transition">{prod.NAME}</p>
                      </Link>
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <Link href={`/productos/${prod.$id}`} className="text-xs font-bold text-[#ca7d90] hover:text-[#b36b7c] inline-flex items-center gap-1">
                          Ver producto <ChevronRight size={12} />
                        </Link>
                        <button 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); addItem(prod as any); }}
                          className="p-2 bg-[#ca7d90] hover:bg-[#b36b7c] text-white rounded-full transition-colors flex items-center justify-center focus:outline-none"
                          title="Añadir al carrito"
                        >
                          <ShoppingBag size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Daily Essentials */}
      <section id="esenciales-diarios" className="py-16 px-6 max-w-7xl mx-auto scroll-mt-20">
        <div className="text-center mb-10">
          <p className="text-[#ca7d90] text-xs font-bold uppercase tracking-widest mb-2">Diario</p>
          <h2 className="text-3xl font-bold text-gray-900">Esenciales Diarios</h2>
        </div>

        {isLoading && essentials.length === 0 ? renderSkeletons() : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 w-full">
            {essentials.map((prod) => {
              const imgUrl = getProductImageUrl(prod) || 'https://via.placeholder.com/300';
              return (
                <div key={prod.$id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all group border border-pink-100 flex flex-col justify-between">
                  <Link href={`/productos/${prod.$id}`} className="block">
                    <div className="aspect-square overflow-hidden bg-pink-50">
                      <img src={imgUrl} alt={prod.NAME} className="w-full h-full object-cover group-hover:scale-105 transition" />
                    </div>
                  </Link>
                  <div className="p-4 flex flex-col flex-1 justify-between">
                    <Link href={`/productos/${prod.$id}`} className="block">
                      <p className="text-sm sm:text-base font-bold text-gray-800 leading-snug mb-2 line-clamp-2 min-h-[48px] hover:text-[#ca7d90] transition">{prod.NAME}</p>
                    </Link>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <Link href={`/productos/${prod.$id}`} className="text-xs font-bold text-[#ca7d90] hover:text-[#b36b7c] inline-flex items-center gap-1">
                        Ver producto <ChevronRight size={12} />
                      </Link>
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); addItem(prod as any); }}
                        className="p-2 bg-[#ca7d90] hover:bg-[#b36b7c] text-white rounded-full transition-colors flex items-center justify-center focus:outline-none"
                        title="Añadir al carrito"
                      >
                        <ShoppingBag size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Button to view all Sadoer products */}
        <div className="flex justify-center mt-12">
          <Link 
            href="/marcas/sadoer/productos" 
            className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-[#ca7d90] text-[#ca7d90] hover:bg-[#ca7d90] hover:text-white font-bold text-xs sm:text-sm tracking-widest uppercase transition-all duration-300 shadow-sm"
          >
            Ver todos los productos de Sadoer <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Simple Skincare Banner */}
      <section className="py-16 px-6 bg-gradient-to-br from-[#ffeef2] via-[#fff5f7] to-white">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-[#ca7d90] text-xs font-bold uppercase tracking-widest mb-3">Cuidado Simple</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Cuidado de la Piel Simple para<br />Hidratación, Suavidad y Cuidado Diario</h2>
          <p className="text-gray-600 max-w-2xl mx-auto mb-8">En SADOER creemos que el cuidado de la piel no tiene que ser complicado. Nuestras fórmulas están diseñadas para ser efectivas y simples de usar en tu rutina diaria.</p>
          <Link href="/productos?brand=SADOER" className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#ca7d90] text-white font-bold rounded-full text-sm hover:bg-[#b36b7c] transition-all shadow-md">
            Ver todos los productos <ChevronRight size={16} />
          </Link>
        </div>
      </section>

      {/* Reviews - 24K Gold Pearl */}
      <section className="py-16 px-6 max-w-7xl mx-auto scroll-mt-20">
        <div className="text-center mb-12">
          <p className="text-[#ca7d90] text-xs font-bold uppercase tracking-widest mb-2">Testimonios</p>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Lo Que Dicen Nuestras Clientas</h2>
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="text-yellow-400">★★★★★</span>
            <span className="text-gray-600 text-sm font-bold">4.9/5</span>
            <span className="text-gray-400 text-sm">· Basado en más de 120 opiniones de Chile</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              name: "Camila Espinoza",
              location: "Santiago",
              comment: "Increíble la hidratación de los productos Sadoer. Mi piel solía ser muy seca y ahora tiene un brillo súper sano y natural. ¡Muy recomendado!",
              avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80",
              rating: 5,
              product: "Crema de Naranja Vitamin C"
            },
            {
              name: "Valentina Henríquez",
              location: "Viña del Mar",
              comment: "Las mascarillas hidratantes son otro nivel. Se siente una frescura inmediata y el aroma es exquisito. Importadora Carlitos las entrega rapidísimo.",
              avatar: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80",
              rating: 5,
              product: "Mascarillas Faciales Sadoer"
            },
            {
              name: "Francisca Rojas",
              location: "Concepción",
              comment: "Llevo usando el contorno de ojos Sadoer dos semanas y las ojeras han disminuido un montón. La textura no es grasosa y se absorbe al instante.",
              avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
              rating: 5,
              product: "Contorno de Ojos Aloe Vera"
            }
          ].map((item, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-pink-100/80 shadow-xs hover:shadow-lg transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1 text-yellow-400 mb-3.5">
                  {[...Array(item.rating)].map((_, idx) => (
                    <span key={idx}>★</span>
                  ))}
                </div>
                <p className="text-gray-600 text-sm italic leading-relaxed mb-6">
                  "{item.comment}"
                </p>
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-gray-50">
                <img 
                  src={item.avatar} 
                  alt={item.name} 
                  className="w-10 h-10 rounded-full object-cover border border-pink-100"
                />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-gray-800 leading-tight">{item.name}</h4>
                  <p className="text-[10px] text-gray-400 font-medium">{item.location} · {item.product}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[#ca7d90] text-xs font-bold uppercase tracking-widest mb-2">Por Qué Elegirnos</p>
            <h2 className="text-3xl font-bold text-gray-900">La Diferencia SADOER</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {WHY_CHOOSE.map((item) => (
              <div key={item.title} className="bg-white rounded-2xl p-6 text-center hover:shadow-md transition border border-[#ffeef2]">
                <div className="w-12 h-12 rounded-full bg-[#ffeef2] flex items-center justify-center mx-auto mb-4">
                  <item.icon size={24} className="text-[#ca7d90]" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 px-6 max-w-3xl mx-auto scroll-mt-20">
        <div className="text-center mb-10">
          <p className="text-[#ca7d90] text-xs font-bold uppercase tracking-widest mb-2">Preguntas Frecuentes</p>
          <h2 className="text-3xl font-bold text-gray-900">¿Tienes Dudas?</h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#ffeef2] overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full px-5 py-4 flex items-center justify-between text-left font-bold text-gray-800 hover:bg-[#ffeef2]/20 transition focus:outline-none"
              >
                <span className="text-sm">{faq.q}</span>
                <ChevronRight size={16} className={`shrink-0 transition-transform ${openFaq === i ? 'rotate-90' : ''}`} />
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 text-sm text-gray-600">{faq.a}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-16 px-6 bg-gradient-to-r from-[#ca7d90] to-[#e4a3b4]">
        <div className="max-w-4xl mx-auto text-center">
          <img src={LOGO} alt="SADOER" className="h-10 object-contain brightness-0 invert mx-auto mb-6 opacity-90" />
          <h2 className="text-3xl font-bold text-white mb-4">Comienza Tu Rutina de Cuidado Hoy</h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">Descubre la colección completa de productos SADOER y encuentra el adecuado para tu piel.</p>
          <Link href="/productos?brand=SADOER" className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[#ca7d90] font-bold rounded-full text-sm hover:bg-pink-50 transition-all shadow-md">
            Ver Catálogo Completo <ChevronRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}

