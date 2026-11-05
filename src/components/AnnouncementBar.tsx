'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Phone, Mail, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSectionSettings, isSectionEnabled, SectionConfig } from '@/lib/section-config';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'announcement_dismissed';
const DEFAULT_TEXT = '✨ Productos premium a precios mayoristas — sin sorpresas'

// Función para detectar si un color es claro
function isLightColor(color: string): boolean {
  // Extraer el color principal del gradiente
  const colors = color.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgb\([^)]+\)|rgba\([^)]+\)/g);
  if (!colors || colors.length === 0) return false;
  
  // Tomar el primer color del gradiente
  const firstColor = colors[0];
  
  // Convertir a RGB
  let r = 0, g = 0, b = 0;
  if (firstColor.startsWith('#')) {
    const hex = firstColor.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
  } else if (firstColor.startsWith('rgb')) {
    const matches = firstColor.match(/\d+/g);
    if (matches && matches.length >= 3) {
      r = parseInt(matches[0]);
      g = parseInt(matches[1]);
      b = parseInt(matches[2]);
    }
  }
  
  // Calcular luminosidad (fórmula estándar)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Si la luminosidad es mayor a 0.6, considerarlo color claro
  return luminance > 0.6;
}

interface StoreInfo {
  storeName: string;
  phone: string;
  email: string;
  address: string;
  showInAnnouncementBar: boolean;
}

interface Props {
  sectionCfg?: SectionConfig[];
  navbarGradient?: string;
}

export default function AnnouncementBar({ sectionCfg, navbarGradient }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const { settings: storeSettings } = useStoreSettings();
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (storeSettings) {
      setStoreInfo({
        storeName: storeSettings.storeName || '',
        phone: storeSettings.phone || '',
        email: storeSettings.email || '',
        address: storeSettings.address || '',
        showInAnnouncementBar: storeSettings.showInAnnouncementBar ?? false,
      });
    }
  }, [storeSettings]);

  const isSadoerBrand = pathname.includes('/marcas/sadoer') || (typeof window !== 'undefined' && window.location.search.includes('brand=SADOER'));
  const settings = sectionCfg ? getSectionSettings(sectionCfg, 'announcement_bar') : {};
  const text = isSadoerBrand ? "Importadora Carlitos te da la bienvenida al apartado de Sadoer." : (settings.title || DEFAULT_TEXT);
  const link = settings.buttonLink || '/productos';
  const enabled = sectionCfg ? isSectionEnabled(sectionCfg, 'announcement_bar') : true;
  const padding = settings.padding ?? 12; // Usar padding del editor, default 12px (mínimo para botón X)

  if (!enabled || dismissed) return null;

  function dismiss() {
    setDismissed(true);
  }

  // Determinar el color de fondo
  let bgColor = settings.bgGradient;
  if (!bgColor) {
    // Si no hay gradiente configurado, verificar si navbar es dorado
    if (navbarGradient && navbarGradient.includes('#FFD700')) {
      // Usar el gradiente dorado del navbar
      bgColor = 'linear-gradient(90deg, #FFD700, #FFA500, #FFD700)';
    } else {
      // Gradiente por defecto
      bgColor = '#f3f4f6';
    }
  }

  // Detectar si el fondo es claro
  const isLight = isLightColor(bgColor);
  
  // Texto: degradado si textGradientStyle está definido, sino color sólido
  const hasTextGradient = !!settings.textGradientStyle;
  const textColor = settings.textColor || (isLight ? '#1a1a1a' : '#ffffff');
  const textGradient = settings.textGradientStyle || '';
  const textGradientAnimated = settings.textGradientAnimated ?? false;
  const textSize = settings.textSize ?? 13;
  const textHoverEffect = settings.textHoverEffect || 'none';
  
  // Color para el botón de cerrar
  const closeButtonColor = isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';

  const textContent = (
    <motion.p
      animate={hasTextGradient && textGradientAnimated ? {
        backgroundPosition: ['0% center', '200% center'],
      } : {}}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: 'linear',
      }}
      style={{
        fontSize: `clamp(${Math.max(textSize - 2, 12)}px, 3.2vw, ${textSize + 2}px)`,
        fontWeight: 800,
        fontFamily: 'Syne, sans-serif',
        ...(hasTextGradient ? {
          backgroundImage: textGradient,
          backgroundSize: textGradientAnimated ? '200% auto' : '100% auto',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
        } : {
          color: textColor,
        }),
        letterSpacing: '0.5px',
        margin: 0,
        display: 'inline-block',
      }}
    >
      {text}
    </motion.p>
  );

  const announceButton = (
    <motion.a
      href={link}
      animate={textGradientAnimated ? {
        backgroundPosition: ['0% center', '200% center'],
      } : {}}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: 'linear',
      }}
      className="announcement-bar__cta"
      style={{
        fontSize: 'clamp(10px, 2.5vw, 13px)',
        fontWeight: 700,
        fontFamily: 'Syne, sans-serif',
        color: '#ffffff',
        letterSpacing: '0.3px',
        textDecoration: 'none',
        marginLeft: '12px',
        padding: '4px 12px',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: '4px',
        display: 'inline-block',
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      VER TODOS NUESTROS PRODUCTOS
    </motion.a>
  );

  // 1. Prioridad: degradado propio de la barra de anuncios
  const ownBg = settings.bgGradient || settings.bgColor;
  const ownHasGradient = ownBg && (ownBg.includes('gradient') || ownBg.includes('linear') || ownBg.includes('radial'));

  // 2. Solo sincronizar con navbar si es template dorado de Mercado Libre
  const isYellowNavbar = navbarGradient && (
    navbarGradient.includes('#ffe600') ||
    navbarGradient.includes('#ffe633') ||
    navbarGradient.includes('#ffd500') ||
    navbarGradient.includes('#fff4b0')
  );
  const navHasGradient = navbarGradient && navbarGradient.includes('gradient');

  // Decidir background: navbar dorado (máx prioridad) > propio > default
  let bgStyle: React.CSSProperties;

  if (isYellowNavbar && navHasGradient) {
    // Template dorado: SIEMPRE sincroniza con navbar, ignora ajustes propios
    bgStyle = { backgroundImage: navbarGradient, backgroundSize: '400% 400%', animation: 'nbGradientFlow 15s ease infinite' };
  } else if (isYellowNavbar) {
    bgStyle = { backgroundColor: navbarGradient };
  } else if (ownBg) {
    // Otros templates: usa el degradado/color propio de la barra de anuncios
    bgStyle = ownHasGradient
      ? { backgroundImage: ownBg, backgroundSize: '400% 400%', animation: 'nbGradientFlow 15s ease infinite' }
      : { backgroundColor: ownBg };
  } else {
    // Default elegante
    bgStyle = { backgroundColor: '#f3f4f6' };
  }

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          data-section-id="announcement_bar"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'relative', zIndex: 100, overflow: 'hidden', width: '100%', ...bgStyle }}
        >
          <style>{`
            @keyframes nbGradientFlow {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
            @media screen and (max-width: 640px) {
              .announcement-bar__cta { display: none !important; }
              .announcement-bar__store-info { display: none !important; }
              .announcement-bar__message { flex: 1 !important; }
            }
          `}</style>
          {/* Noise overlay for texture */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize: '128px 128px', pointerEvents: 'none' }} />

          {/* Content */}
          <div style={{ position: 'relative', padding: `${padding}px 40px ${padding}px 16px`, display: 'flex', alignItems: 'center', justifyContent: storeInfo?.showInAnnouncementBar ? 'space-between' : 'center', gap: '16px' }}>
            
            {/* Datos de empresa (izquierda) */}
            {storeInfo?.showInAnnouncementBar && (
              <div className="announcement-bar__store-info" style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: 'clamp(10px, 1vw, 12px)', color: isLight ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.9)', flexShrink: 0 }}>
                {storeInfo.storeName && (
                  <span style={{ fontWeight: 700 }}>{storeInfo.storeName}</span>
                )}
                {storeInfo.phone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Phone size={12} />
                    {storeInfo.phone}
                  </span>
                )}
                {storeInfo.email && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Mail size={12} />
                    {storeInfo.email}
                  </span>
                )}
                {storeInfo.address && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} />
                    {storeInfo.address}
                  </span>
                )}
              </div>
            )}

            {/* Mensaje principal (centro o derecha) */}
            <div className="announcement-bar__message" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', flex: storeInfo?.showInAnnouncementBar ? '0 1 auto' : '1' }}>
              {textContent}
              {link && !isSadoerBrand && announceButton}
            </div>

            {/* Botón cerrar */}
            <motion.button
              onClick={dismiss}
              whileHover={{ scale: 1.2, opacity: 1 }}
              whileTap={{ scale: 0.9 }}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: closeButtonColor, padding: 0, zIndex: 10 }}
            >
              <X size={13} />
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

