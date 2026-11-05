'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from '@/components/StoreImage';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useFavorites } from '@/context/FavoritesContext';
import { formatPrice } from '@/lib/db';
import { resolveStorageImageUrl } from '@/lib/product-images';
import { Product } from '@/types';
import gsap from 'gsap';

const RECENTLY_VIEWED_KEY = 'recently_viewed';
const MAX_CARDS = 6;

interface SmartCard {
  id: string;
  icon?: string;
  title: string;
  desc: string;
  href: string;
  productImage?: string;
  productPrice?: number;
  accent: string;
  priority: number;
}

function getRecentIds(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]'); } catch { return []; }
}

export default function SmartCards() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const { favorites, favoriteProducts } = useFavorites();
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [cards, setCards] = useState<SmartCard[]>([]);
  const cardsWrapRef = useRef<HTMLDivElement>(null);
  const cardsAnimatedRef = useRef(false);

  // Load recently viewed products
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ids = getRecentIds().slice(0, 3);
    if (ids.length === 0) return;
    fetch(`/api/public-data/products?ids=${ids.join(',')}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch recent products');
        return res.json();
      })
      .then(data => {
        if (data && data.products) {
          setRecentProducts(data.products as Product[]);
        }
      })
      .catch(e => console.error(e));
  }, []);

  // Build cards based on user state
  useEffect(() => {
    if (authLoading) return;

    const result: SmartCard[] = [];

    if (!isLoggedIn || !user) {
      // ── NOT LOGGED IN ──
      result.push({
        id: 'register',
        icon: '/ml/da/registration-da.svg',
        title: 'Ingresa a tu cuenta',
        desc: 'Regístrate y disfruta de ofertas exclusivas.',
        href: '/login?tab=register',
        accent: '#3483fa',
        priority: 1,
      });
      result.push({
        id: 'location-guest',
        icon: '/ml/da/location.svg',
        title: 'Ingresa tu ubicación',
        desc: 'Regístrate para consultar costos de envío.',
        href: '/login?tab=register',
        accent: '#00a650',
        priority: 2,
      });
      result.push({
        id: 'payments-guest',
        icon: '/ml/da/payment-methods.svg',
        title: 'Medios de pago',
        desc: 'Paga tus compras de forma rápida y segura.',
        href: '/login?tab=register',
        accent: '#db2777',
        priority: 3,
      });

      // Show recently viewed if any (even as guest)
      if (recentProducts.length > 0) {
        const p = recentProducts[0];
        const price = p.CURRENTPRICE && p.CURRENTPRICE > 0 ? p.CURRENTPRICE : p.PRICE;
        result.push({
          id: `recent-${p.$id}`,
          title: p.NAME?.slice(0, 30) || 'Producto',
          desc: formatPrice(price),
          href: `/productos/${p.$id}`,
          productImage: resolveStorageImageUrl(p.IMAGEURL),
          productPrice: price,
          accent: '#8b5cf6',
          priority: 4,
        });
      }

      result.push({
        id: 'offers-guest',
        icon: '/ml/da/top-sale.svg',
        title: 'Descubre ofertas',
        desc: 'Mira los productos más populares.',
        href: '/productos',
        accent: '#e53935',
        priority: 5,
      });
      result.push({
        id: 'secure-guest',
        icon: '/ml/da/new-buyer.svg',
        title: 'Compra segura',
        desc: 'Tu primera compra protegida.',
        href: '/login?tab=register',
        accent: '#0288d1',
        priority: 6,
      });

    } else {
      // ── LOGGED IN ──
      const hasPhone = !!user.phone;
      const hasName = !!user.name && user.name.trim().length > 1;

      // Missing profile data cards (high priority, one-time actions)
      if (!hasName) {
        result.push({
          id: 'complete-name',
          icon: '/ml/da/registration-da.svg',
          title: 'Completa tu perfil',
          desc: 'Agrega tu nombre para personalizar tu experiencia.',
          href: '/cuenta/perfil',
          accent: '#3483fa',
          priority: 1,
        });
      }

      result.push({
        id: 'add-address',
        icon: '/ml/da/location.svg',
        title: 'Ingresa tu dirección',
        desc: 'Para calcular envíos y tiempos de entrega.',
        href: '/cuenta/direcciones',
        accent: '#00a650',
        priority: 2,
      });

      if (!hasPhone) {
        result.push({
          id: 'add-phone',
          icon: '/ml/da/payment-methods.svg',
          title: 'Agrega tu teléfono',
          desc: 'Recibe notificaciones de tus pedidos.',
          href: '/cuenta/perfil',
          accent: '#db2777',
          priority: 3,
        });
      }

      // Recently viewed products (personalized)
      recentProducts.forEach((p, i) => {
        if (result.length >= MAX_CARDS) return;
        const price = p.CURRENTPRICE && p.CURRENTPRICE > 0 ? p.CURRENTPRICE : p.PRICE;
        result.push({
          id: `recent-${p.$id}`,
          title: p.NAME?.length > 28 ? p.NAME.slice(0, 28) + '…' : (p.NAME || 'Producto'),
          desc: formatPrice(price),
          href: `/productos/${p.$id}`,
          productImage: resolveStorageImageUrl(p.IMAGEURL),
          productPrice: price,
          accent: '#8b5cf6',
          priority: 10 + i,
        });
      });

      // Favorites card
      if (favorites.length > 0 && favoriteProducts.length > 0) {
        const fav = favoriteProducts[0];
        result.push({
          id: 'favorites',
          title: `${favorites.length} favorito${favorites.length > 1 ? 's' : ''}`,
          desc: fav ? (fav.NAME?.slice(0, 30) || '') : 'Ve tus productos guardados',
          href: '/favoritos',
          productImage: resolveStorageImageUrl(fav?.IMAGEURL),
          accent: '#e53935',
          priority: 8,
        });
      }

      // Orders / shopping card
      result.push({
        id: 'my-orders',
        icon: '/ml/da/new-buyer.svg',
        title: 'Mis compras',
        desc: 'Revisa el estado de tus pedidos.',
        href: '/cuenta/pedidos',
        accent: '#0288d1',
        priority: 15,
      });

      // Discover offers
      result.push({
        id: 'discover',
        icon: '/ml/da/top-sale.svg',
        title: 'Ofertas del día',
        desc: 'Descubre descuentos exclusivos.',
        href: '/productos',
        accent: '#e53935',
        priority: 20,
      });
    }

    // Sort by priority and take max 6
    result.sort((a, b) => a.priority - b.priority);
    setCards(result.slice(0, MAX_CARDS));
  }, [authLoading, isLoggedIn, user, recentProducts, favorites, favoriteProducts]);

  // One-time stable entrance animation (prevents refresh flicker/re-trigger)
  useEffect(() => {
    if (authLoading || cards.length === 0 || cardsAnimatedRef.current || !cardsWrapRef.current) return;
    cardsAnimatedRef.current = true;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-smart-card="1"]',
        { y: 22, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.46,
          stagger: 0.07,
          ease: 'power3.out',
          clearProps: 'transform,opacity,visibility',
        }
      );
    }, cardsWrapRef);
    return () => ctx.revert();
  }, [authLoading, cards.length]);

  if (authLoading || cards.length === 0) {
    // Skeleton while loading
    return (
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', paddingTop: 6, paddingBottom: 6 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', flex: '1 1 0', minWidth: 148, minHeight: 170, padding: '24px 14px', animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.5 }} />
        ))}
      </div>
    );
  }

  return (
    <>
      <div ref={cardsWrapRef} style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollbarWidth: 'none', paddingTop: 8, paddingBottom: 8 }}>
        {cards.map(card => (
          <Link key={card.id} href={card.href} data-smart-card="1" className="smart-card"
            style={{
              background: `linear-gradient(180deg, #fff 0%, #fcfcfd 100%)`,
              borderRadius: 16,
              boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 2px 6px rgba(0,0,0,.04)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '22px 14px 18px',
              flex: '1 1 0',
              minWidth: 160,
              minHeight: 184,
              cursor: 'pointer',
              gap: 10,
              transition: 'all .35s cubic-bezier(0.4,0,0.2,1)',
              border: `1.5px solid transparent`,
              outline: `1.5px solid ${card.accent}28`,
              outlineOffset: '-1.5px',
              position: 'relative',
              overflow: 'hidden',
              textDecoration: 'none',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform = 'translateY(-8px)';
              el.style.boxShadow = '0 8px 20px rgba(0,0,0,.07), 0 2px 6px rgba(0,0,0,.04)';
              el.style.outline = `1.5px solid ${card.accent}80`;
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform = '';
              el.style.boxShadow = '0 1px 2px rgba(0,0,0,.04), 0 2px 6px rgba(0,0,0,.04)';
              el.style.outline = `1.5px solid ${card.accent}28`;
            }}
          >
            {/* Glow background orbe */}
            <div style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${card.accent}22 0%, transparent 70%)`,
              pointerEvents: 'none',
              transition: 'opacity .35s, transform .5s cubic-bezier(0.4,0,0.2,1)',
              opacity: 0.6,
            }} className="smart-card-glow" />

            {/* Top accent strip */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, transparent 0%, ${card.accent} 50%, transparent 100%)`, opacity: 0.75 }} />

            {/* Shimmer sweep on hover */}
            <div className="smart-card-shimmer" style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: `linear-gradient(105deg, transparent 30%, ${card.accent}18 50%, transparent 70%)`,
              transform: 'translateX(-120%)',
              transition: 'transform .7s cubic-bezier(0.4,0,0.2,1)',
            }} />

            {/* Icon or Product Image con fondo tintado */}
            {card.productImage ? (
              <div style={{
                width: 76, height: 76, borderRadius: 14, overflow: 'hidden',
                background: `linear-gradient(135deg, ${card.accent}08 0%, ${card.accent}14 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${card.accent}22`,
                flexShrink: 0, position: 'relative', zIndex: 1,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,.6), 0 1px 3px ${card.accent}14`,
              }}>
                <Image src={card.productImage} alt={card.title} width={76} height={76} style={{ width: 64, height: 64, objectFit: 'contain' }} />
              </div>
            ) : card.icon ? (
              <div className="smart-card-icon-wrap" style={{
                width: 76, height: 76, borderRadius: 16,
                background: `linear-gradient(135deg, ${card.accent}0f 0%, ${card.accent}1f 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, position: 'relative', zIndex: 1,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,.7), 0 2px 6px ${card.accent}18`,
                transition: 'transform .35s cubic-bezier(0.4,0,0.2,1)',
              }}>
                <Image src={card.icon} alt={card.title} width={56} height={56} style={{ width: 56, height: 56, objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.08))' }} />
              </div>
            ) : null}

            {/* Title */}
            <p style={{ margin: '2px 0 0', fontSize: 13.5, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3, letterSpacing: '-0.1px', position: 'relative', zIndex: 1 }}>{card.title}</p>

            {/* Description / Price */}
            {card.productPrice ? (
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: card.accent, lineHeight: 1.3, position: 'relative', zIndex: 1, letterSpacing: '-0.2px' }}>{card.desc}</p>
            ) : (
              <p style={{ margin: 0, fontSize: 11.5, color: '#6b7280', lineHeight: 1.5, position: 'relative', zIndex: 1, padding: '0 2px' }}>{card.desc}</p>
            )}

            {/* Arrow indicator (aparece en hover) */}
            <div className="smart-card-arrow" style={{
              position: 'absolute',
              bottom: 10,
              right: 12,
              width: 22, height: 22,
              borderRadius: '50%',
              background: card.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transform: 'translateX(-6px)',
              transition: 'opacity .3s, transform .35s cubic-bezier(0.4,0,0.2,1)',
              boxShadow: `0 2px 6px ${card.accent}55`,
              zIndex: 2,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        .smart-card:hover {
          transform: translateY(-8px) !important;
          box-shadow: 0 8px 20px rgba(0,0,0,.07), 0 2px 6px rgba(0,0,0,.04) !important;
        }
        .smart-card:hover .smart-card-shimmer {
          transform: translateX(120%);
        }
        .smart-card:hover .smart-card-icon-wrap {
          transform: scale(1.08) rotate(-3deg);
        }
        .smart-card:hover .smart-card-arrow {
          opacity: 1;
          transform: translateX(0);
        }
        .smart-card:hover .smart-card-glow {
          opacity: 1;
          transform: scale(1.4);
        }
        .smart-card:active {
          transform: translateY(-3px) scale(0.99);
          transition: transform .1s;
        }
      `}</style>
    </>
  );
}
