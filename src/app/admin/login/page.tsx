'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { isFirebaseConfigured } from '@/lib/db';
import { isAdminEmail } from '@/lib/admin-access';
import { DISABLED_MODULE_PATHS, MODULE_ACCESS } from '@/lib/module-access';
import {
  getErpUserByEmail,
  getRedirectForModules,
  hasModuleAccess,
  AppModule,
} from '@/lib/erpUserService';
import {
  Eye,
  EyeOff,
  AlertCircle,
  Lock,
  Mail,
  Loader2,
  ArrowRight,
  ArrowUp,
  LogOut,
  Sparkles,
} from 'lucide-react';

type TargetPlatform = 'erp' | 'yaxsell';
type LoginQualityMode = 'light' | 'promax' | 'mobile' | null;
const WEB_ONLY = !MODULE_ACCESS.erp && !MODULE_ACCESS.pos;

const LOGIN_QUALITY_STORAGE_KEY = 'asistora-admin-login-promax';

function buildAnimatedSpans(text: string, dir: 'left' | 'right' | 'center') {
  const delay = dir === 'center' ? 0.35 : 0.45;
  const duration = 0.82;
  const stagger = 0.052;
  const chars = Array.from(text);
  return chars.map((ch, idx) => {
    const order = dir === 'left' ? chars.length - idx - 1 : idx;
    const d = (delay + order * stagger).toFixed(3);
    const shift = dir === 'left' ? '-36px' : dir === 'right' ? '36px' : '0px';
    const rot = dir === 'left' ? '-26deg' : dir === 'right' ? '26deg' : '0deg';
    const displayCh = ch === ' ' ? '\u00A0' : ch;
    return (
      <span
        key={`${dir}-${idx}`}
        className="astra-label-letter"
        style={
          {
            '--astra-label-delay': `${d}s`,
            '--astra-label-duration': `${duration}s`,
            '--astra-label-shift': shift,
            '--astra-label-rot': rot,
          } as React.CSSProperties
        }
      >
        {displayCh}
      </span>
    );
  });
}

export default function LoginPage() {
  const [animKey, setAnimKey] = useState(0);
  const [visualReady, setVisualReady] = useState(false);
  const [visualEngineReady, setVisualEngineReady] = useState(false);
  const [platform, setPlatform] = useState<TargetPlatform>(WEB_ONLY ? 'yaxsell' : 'erp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [qualityMode, setQualityMode] = useState<LoginQualityMode>(null);

  const engineRef = useRef<{
    setTheme?: (t: 'light' | 'dark', immediate?: boolean) => void;
    replayAnimation?: () => void;
    getScrollTarget?: () => number;
    destroy?: () => void;
  } | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const visualStartRef = useRef(0);
  const morphismRigRef = useRef<HTMLDivElement>(null);
  const glassCardRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const { login, logout, isLoggedIn, isLoading, user } = useAuth();
  const [testUser, setTestUser] = useState<{ email: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkTest = () => {
        if ((window as any).__TEST_USER__) {
          setTestUser((window as any).__TEST_USER__);
        }
      };
      checkTest();
      window.addEventListener('astra-test-user', checkTest);
      return () => window.removeEventListener('astra-test-user', checkTest);
    }
  }, []);

  const activeUser = user || testUser;
  const hasActiveSession = (!isLoading && isLoggedIn && user?.email) || Boolean(testUser?.email);

  // Mobile always uses the lightweight scene; desktop can opt into Max.
  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 769px)');
    const resolveMode = () => {
      if (!desktopQuery.matches) {
        setQualityMode('mobile');
        return;
      }

      let useProMax = false;
      try {
        useProMax = window.localStorage.getItem(LOGIN_QUALITY_STORAGE_KEY) === 'true';
      } catch {
        /* localStorage can be unavailable in restricted browser contexts. */
      }
      setQualityMode(useProMax ? 'promax' : 'light');
    };

    resolveMode();
    desktopQuery.addEventListener('change', resolveMode);
    return () => desktopQuery.removeEventListener('change', resolveMode);
  }, []);

  // Preserve the live scene at reduced cost on desktop and mobile.
  useEffect(() => {
    if (!qualityMode) {
      engineRef.current?.destroy?.();
      engineRef.current = null;
      return;
    }

    let cancelled = false;
    visualStartRef.current = performance.now();
    import('./argonAstraEngine')
      .then(({ mountArgonAstraEngine }) => {
        if (cancelled) return;
        const ctrl = mountArgonAstraEngine({
          quality: qualityMode === 'promax' ? 'full' : 'light',
          theme: themeRef.current,
        });
        engineRef.current = ctrl ?? null;
        ctrl?.setTheme?.(themeRef.current, true);
        setVisualEngineReady(true);
      })
      .catch((loadError) => {
        console.error('[admin/login] No se pudo cargar el fondo animado:', loadError);
        if (!cancelled) setVisualEngineReady(true);
      });

    return () => {
      cancelled = true;
      engineRef.current?.destroy?.();
      engineRef.current = null;
    };
  }, [qualityMode]);

  // Let the login artwork, fonts and the first WebGL frames settle before
  // revealing the controls. Auth initialization is included, with a fallback
  // so a slow Firebase response cannot keep the login covered indefinitely.
  useEffect(() => {
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    let revealTimer = 0;
    const reveal = () => {
      if (cancelled) return;
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          if (!cancelled) setVisualReady(true);
        });
      });
    };

    if (!isLoading && qualityMode !== null && visualEngineReady) {
      const fontsReady = typeof document !== 'undefined' && 'fonts' in document
        ? document.fonts.ready.catch(() => undefined)
        : Promise.resolve();
      void fontsReady.then(() => {
        const minDisplayMs = 280;
        const elapsed = performance.now() - visualStartRef.current;
        revealTimer = window.setTimeout(reveal, Math.max(0, minDisplayMs - elapsed));
      });
    }

    return () => {
      cancelled = true;
      window.clearTimeout(revealTimer);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [isLoading, qualityMode, visualEngineReady]);

  useEffect(() => {
    if (visualReady) return;
    const fallback = window.setTimeout(() => setVisualReady(true), 1800);
    return () => window.clearTimeout(fallback);
  }, [visualReady]);

  // Restore saved email & optional URL platform param
  useEffect(() => {
    setConfigured(isFirebaseConfigured());
    try {
      const savedEmail = localStorage.getItem('asistora_saved_email');
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberEmail(true);
      }
      const p = new URLSearchParams(window.location.search).get('platform');
      if (p === 'yaxsell' || (p === 'erp' && !WEB_ONLY)) {
        setPlatform(p);
      }
      if (WEB_ONLY && new URLSearchParams(window.location.search).get('reason') === 'web-access') {
        setError('Tu cuenta no tiene acceso al panel web. Contacta al administrador.');
      }
    } catch {
      /* noop */
    }
  }, []);

  const getNext = useCallback(() => {
    try {
      const n = new URLSearchParams(window.location.search).get('next');
      if (!n || !n.startsWith('/') || n.startsWith('//')) return null;
      const destination = new URL(n, window.location.origin);
      if (destination.origin !== window.location.origin) return null;
      const path = destination.pathname;
      if (DISABLED_MODULE_PATHS.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return null;
      if (WEB_ONLY && (!(path === '/admin' || path.startsWith('/admin/')) || path === '/admin/login' || path.startsWith('/admin/login/'))) return null;
      return destination.pathname + destination.search + destination.hash;
    } catch {
      /* noop */
    }
    return null;
  }, []);

  const isNextAllowed = useCallback(
    (next: string, modules: AppModule[], isSupreme: boolean): boolean => {
      if (isSupreme) return true;
      if (next.startsWith('/erp-dashboard/base-datos') || next.startsWith('/base-datos')) {
        return (
          hasModuleAccess(modules, 'base_datos') ||
          hasModuleAccess(modules, 'erp') ||
          hasModuleAccess(modules, 'erp_admin')
        );
      }
      if (next.startsWith('/pos-admin') || next.startsWith('/pos')) {
        return hasModuleAccess(modules, 'pos') || hasModuleAccess(modules, 'pos_admin');
      }
      if (next.startsWith('/erp-dashboard')) {
        return hasModuleAccess(modules, 'erp') || hasModuleAccess(modules, 'erp_admin');
      }
      if (next.startsWith('/admin')) {
        return hasModuleAccess(modules, 'web');
      }
      return false;
    },
    []
  );

  const resolveDestinationAndRedirect = useCallback(
    async (userEmail: string, targetPlatform: TargetPlatform) => {
      const emailLower = userEmail.toLowerCase().trim();
      const next = getNext();
      const isSupreme = isAdminEmail(emailLower);

      if (WEB_ONLY) {
        if (!isSupreme) {
          const account = await getErpUserByEmail(emailLower, true);
          if (!hasModuleAccess(account?.modules, 'web')) {
            await logout();
            setError('Tu cuenta no tiene acceso al panel web. Contacta al administrador.');
            return false;
          }
        }
        router.replace(next || '/admin/dashboard');
        return true;
      }

      if (isSupreme) {
        if (next) {
          router.replace(next);
          return true;
        }
        router.replace(targetPlatform === 'yaxsell' ? '/admin/dashboard' : '/erp-dashboard');
        return true;
      }

      const erpUser = await getErpUserByEmail(emailLower, true);
      if (!erpUser) {
        await logout();
        setError('Tu cuenta no tiene módulos asignados. Contacta al Administrador.');
        return false;
      }

      if (next && isNextAllowed(next, erpUser.modules, false)) {
        router.replace(next);
        return true;
      }

      if (targetPlatform === 'yaxsell') {
        if (hasModuleAccess(erpUser.modules, 'web')) {
          router.replace('/admin/dashboard');
          return true;
        }
      } else {
        if (hasModuleAccess(erpUser.modules, 'erp') || hasModuleAccess(erpUser.modules, 'erp_admin')) {
          router.replace('/erp-dashboard');
          return true;
        }
        if (hasModuleAccess(erpUser.modules, 'base_datos')) {
          router.replace('/erp-dashboard/base-datos');
          return true;
        }
      }

      const fallbackDest = getRedirectForModules(
        erpUser.modules,
        false,
        erpUser.defaultModule
      );
      router.replace(fallbackDest);
      return true;
    },
    [getNext, isNextAllowed, logout, router]
  );

  // If URL has explicit ?next= and user is already authenticated, honor it
  useEffect(() => {
    if (isLoading || !isLoggedIn || !user?.email) return;
    const next = getNext();
    if (next) {
      void resolveDestinationAndRedirect(user.email, platform);
    }
  }, [isLoading, isLoggedIn, user?.email, getNext, resolveDestinationAndRedirect, platform]);

  const scrollToLoginSection = (targetPlatform?: TargetPlatform) => {
    if (targetPlatform) {
      setPlatform(WEB_ONLY ? 'yaxsell' : targetPlatform);
      setError('');
    }
    // Prevent on-screen virtual keyboard from popping up on mobile devices
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const targetScrollTop =
      engineRef.current?.getScrollTarget?.() ??
      Math.round(Math.max(820, window.innerHeight * 1.35) * 1.08);
    window.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  };

  // Mobile single-swipe snap controller ("solo una jalada para abajo pase al segmento 2")
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024));
    if (!isMobile) return;

    let touchStartY = 0;
    let touchStartX = 0;
    let touchStartTime = 0;
    let isTransitioning = false;

    const getTargetScroll = () => {
      return engineRef.current?.getScrollTarget?.() ?? Math.round(Math.max(820, window.innerHeight * 1.35) * 1.08);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      touchStartTime = Date.now();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isTransitioning || e.changedTouches.length !== 1) return;
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndX = e.changedTouches[0].clientX;
      const deltaY = touchStartY - touchEndY; // > 0: dragged up (swipe down to next segment)
      const deltaX = Math.abs(touchStartX - touchEndX);
      const deltaTime = Date.now() - touchStartTime;

      if (Math.abs(deltaY) > 28 && Math.abs(deltaY) > deltaX * 1.1 && deltaTime < 900) {
        const currentScroll = window.scrollY || document.documentElement.scrollTop || 0;
        const targetScroll = getTargetScroll();

        // En Segmento 1: una jalada hacia abajo pasa directamente al Segmento 2
        if (deltaY > 28 && currentScroll < targetScroll * 0.45) {
          isTransitioning = true;
          scrollToLoginSection();
          setTimeout(() => { isTransitioning = false; }, 950);
        }
        // En Segmento 2: un deslizamiento hacia arriba regresa limpiamente al Segmento 1
        else if (deltaY < -35 && currentScroll > targetScroll * 0.55) {
          const targetEl = e.target as HTMLElement | null;
          if (targetEl && (targetEl.tagName === 'INPUT' || targetEl.tagName === 'BUTTON' || targetEl.closest('.astra-login-form'))) {
            return;
          }
          isTransitioning = true;
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(() => { isTransitioning = false; }, 950);
        }
      }
    };

    // Auto-snap inmediato para bloquear scroll fraccional o espacios en blanco
    let snapTimer: any = null;
    const onScrollSnap = () => {
      if (isTransitioning) return;
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        const currentScroll = window.scrollY || document.documentElement.scrollTop || 0;
        const targetScroll = getTargetScroll();
        if (currentScroll > 15 && currentScroll < targetScroll * 0.88) {
          if (currentScroll >= targetScroll * 0.32) {
            scrollToLoginSection();
          } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      }, 70);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('scroll', onScrollSnap, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('scroll', onScrollSnap);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Por favor, completa tus credenciales corporativas.');
      return;
    }
    setIsSubmitting(true);
    setError('');

    try {
      if (rememberEmail) {
        localStorage.setItem('asistora_saved_email', email.trim());
      } else {
        localStorage.removeItem('asistora_saved_email');
      }
    } catch {
      /* noop */
    }

    const result = await login(email.trim(), password);
    if (result.success) {
      try {
        const ok = await resolveDestinationAndRedirect(email.trim(), platform);
        if (!ok) setIsSubmitting(false);
      } catch (err) {
        console.error('[login] Error al consultar erp_users:', err);
        setError('Error al verificar permisos de acceso. Intenta nuevamente.');
        setIsSubmitting(false);
      }
    } else {
      setError(result.error || 'Correo o contraseña incorrectos. Revisa tus credenciales.');
      setIsSubmitting(false);
    }
  };

  const handleContinueActiveSession = async (targetPlatform: TargetPlatform) => {
    if (!user?.email) return;
    setPlatform(WEB_ONLY ? 'yaxsell' : targetPlatform);
    setIsSubmitting(true);
    setError('');
    try {
      const ok = await resolveDestinationAndRedirect(user.email, targetPlatform);
      if (!ok) setIsSubmitting(false);
    } catch {
      setIsSubmitting(false);
    }
  };

  const handleKeyModifier = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  };

  // Smooth window-level pointer tracking for soft specular sheen on glass card (desktop mouse only)
  useEffect(() => {
    if (qualityMode !== 'promax') return;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const card = glassCardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const mx = ((e.clientX - rect.left) / rect.width) * 100;
      const my = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--glass-mx', `${mx.toFixed(1)}%`);
      card.style.setProperty('--glass-my', `${my.toFixed(1)}%`);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [qualityMode]);

  const toggleSkyTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    engineRef.current?.setTheme?.(next);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleQualityMode = () => {
    const enableProMax = qualityMode !== 'promax';
    const nextMode: LoginQualityMode = enableProMax ? 'promax' : 'light';
    setQualityMode(nextMode);
    try {
      window.localStorage.setItem(LOGIN_QUALITY_STORAGE_KEY, String(enableProMax));
    } catch {
      /* The selection still applies for this visit if storage is unavailable. */
    }
  };

  // Keep mobile browser navbar / status bar pure white on mobile (never celeste #487eb8)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.innerWidth <= 768;
    const isNight = theme === 'dark';
    const targetColor = isMobile
      ? (isNight ? '#000000' : '#ffffff')
      : qualityMode === 'light'
        ? (isNight ? '#111827' : '#eaf3ff')
        : (isNight ? '#000000' : '#487eb8');

    // 1. Meta theme-color
    let metaTheme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!metaTheme) {
      metaTheme = document.createElement('meta');
      metaTheme.name = 'theme-color';
      document.head.appendChild(metaTheme);
    }
    const prevColor = metaTheme.content;
    metaTheme.content = targetColor;

    // 2. Apple iOS Safari status bar style
    let metaApple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') as HTMLMetaElement | null;
    if (!metaApple) {
      metaApple = document.createElement('meta');
      metaApple.name = 'apple-mobile-web-app-status-bar-style';
      document.head.appendChild(metaApple);
    }
    metaApple.content = isMobile && !isNight ? 'default' : 'black-translucent';

    // 3. Android / Windows mobile nav bar color
    let metaNav = document.querySelector('meta[name="msapplication-navbutton-color"]') as HTMLMetaElement | null;
    if (!metaNav) {
      metaNav = document.createElement('meta');
      metaNav.name = 'msapplication-navbutton-color';
      document.head.appendChild(metaNav);
    }
    metaNav.content = targetColor;

    // 4. Force body background so mobile browser Chrome/Safari address bar inherits pure white
    if (isMobile) {
      document.body.style.backgroundColor = isNight ? '#000000' : '#ffffff';
      document.documentElement.style.backgroundColor = isNight ? '#000000' : '#ffffff';
    }

    return () => {
      if (metaTheme && prevColor) {
        metaTheme.content = prevColor;
      }
    };
  }, [theme, qualityMode]);

  const styleElement = React.useMemo(
    () => (
      <style>{`
        :root {
          --astra-ambient-color: #23435F;
          --astra-ambient-fade-duration: 5.5s;
          --astra-ambient-opacity: 0.55;
          --theme-bg: #487eb8;
          --label-color: #ffffff;
          --label-shadow: 0 2px 16px rgba(12, 32, 68, 0.55), 0 0 28px rgba(20, 50, 95, 0.35);
          --controls-bg: rgba(255, 255, 255, 0.45);
          --controls-border: rgba(255, 255, 255, 0.85);
          --controls-btn-color: rgba(255, 255, 255, 0.95);
          --controls-btn-hover: #ffffff;
          --ambient-opacity: 0;
          --vignette-opacity: 0;
        }

        [data-theme="dark"] {
          --theme-bg: #000000;
          --label-color: #fafafa;
          --label-shadow: 0 2px 8px rgba(0, 0, 0, 0.75), 0 0 1.5rem rgba(0, 0, 0, 0.5);
          --controls-bg: rgba(15, 18, 25, 0.62);
          --controls-border: rgba(255, 255, 255, 0.12);
          --controls-btn-color: rgba(255, 255, 255, 0.72);
          --controls-btn-hover: #ffffff;
          --ambient-opacity: 0.55;
          --vignette-opacity: 1;
        }

        html, body {
          background: var(--theme-bg) !important;
          scrollbar-width: none;
          -ms-overflow-style: none;
          overflow-x: hidden !important;
          max-width: 100vw !important;
          width: 100%;
        }
        html::-webkit-scrollbar, body::-webkit-scrollbar {
          display: none;
        }

        .astra-login-root {
          position: relative;
          width: 100%;
          max-width: 100vw;
          overflow-x: hidden;
          min-height: 100vh;
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          user-select: none;
        }

        .astra-scroll-track {
          position: relative;
          width: 100%;
          height: 380vh;
          height: 380dvh;
          pointer-events: none;
          z-index: 0;
        }

        .astra-backdrop {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100vh;
          height: 100dvh;
          background: var(--theme-bg);
          overflow: hidden;
          z-index: 0;
          pointer-events: none;
          transition: background-color 0.4s ease;
        }

        .astra-scene {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        canvas[data-astra-canvas] {
          position: absolute;
          inset: 0;
          display: block;
          width: 100%;
          height: 100%;
        }

        .astra-ambient-backdrop {
          pointer-events: none;
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse farthest-corner at center,
            transparent 0%,
            rgba(35, 67, 95, 0.06) 25%,
            rgba(35, 67, 95, 0.25) 50%,
            rgba(35, 67, 95, 0.56) 75%,
            #23435f 100%
          );
          mix-blend-mode: plus-lighter;
          opacity: var(--ambient-opacity);
          transition: opacity 0.4s ease;
        }

        .astra-vignette {
          pointer-events: none;
          position: absolute;
          inset: 0;
          opacity: var(--vignette-opacity);
          transition: opacity 0.4s ease;
          background: radial-gradient(
            circle,
            transparent 47%,
            rgba(0, 0, 0, 0.18) 72%,
            rgba(0, 0, 0, 0.78) 100%
          );
        }

        .astra-drag-surface {
          position: fixed;
          inset: 0;
          z-index: 1;
          width: 100%;
          height: 100%;
          cursor: grab;
          touch-action: pan-y pinch-zoom;
          background: transparent;
          border: 0;
          padding: 0;
          outline: none;
        }

        .astra-drag-surface[data-dragging="true"] {
          cursor: grabbing;
        }

        /* Hero Interactive Side Labels */
        .astra-fixed-chrome {
          pointer-events: none;
          position: fixed;
          inset: 0;
          z-index: 3;
          opacity: var(--astra-copy-opacity, 1);
          transition: opacity 0.35s ease;
        }

        /* Top-Center Header: PLATAFORMA */
        .astra-top-header {
          position: absolute;
          top: max(2.2rem, env(safe-area-inset-top));
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          user-select: none;
          z-index: 4;
        }

        .astra-top-label {
          color: var(--label-color);
          font-size: clamp(1.2rem, 2.4vw, 2.1rem);
          font-weight: 800;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          line-height: 1.1;
          text-shadow: var(--label-shadow);
          margin: 0;
          white-space: nowrap;
          text-align: center;
          padding-left: 0.28em;
        }

        .astra-top-sub-bar {
          width: 52px;
          height: 2px;
          margin-top: 0.45rem;
          background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.75), rgba(167, 139, 250, 0.75), transparent);
          border-radius: 9999px;
          opacity: 0;
          animation: astra-badge-reveal 0.8s cubic-bezier(0.22, 1, 0.36, 1) 1.2s forwards;
        }

        /* Mobile-Only Brand Title: Strictly hidden on Desktop / PC */
        .astra-mobile-logo-brand {
          display: none !important;
        }

        .astra-side-trigger {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          background: transparent;
          border: 0;
          padding: 0.5rem 0.25rem;
          cursor: pointer;
          pointer-events: var(--astra-trigger-events, auto);
          user-select: none;
          transition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
          outline: none;
        }

        .astra-side-trigger-left {
          left: clamp(1.25rem, 4vw, 4.5rem);
          align-items: flex-start;
          text-align: left;
        }

        .astra-side-trigger-right {
          right: clamp(1.25rem, 4vw, 4.5rem);
          align-items: flex-end;
          text-align: right;
        }

        .astra-side-trigger:hover {
          transform: translateY(-50%) scale(1.045);
          background: transparent;
          box-shadow: none;
        }

        .astra-side-trigger:active {
          transform: translateY(-50%) scale(0.985);
        }

        .astra-label {
          color: var(--label-color);
          font-size: clamp(1.75rem, 3.2vw, 3.25rem);
          font-weight: 700;
          letter-spacing: -0.025em;
          line-height: 1.06;
          text-shadow: var(--label-shadow);
          margin: 0;
          white-space: nowrap;
          transition: color 0.35s ease, text-shadow 0.35s ease, letter-spacing 0.35s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .astra-side-trigger-left:hover .astra-label {
          color: #ffffff;
          letter-spacing: -0.01em;
          text-shadow:
            0 0 10px rgba(255, 255, 255, 0.45),
            0 0 22px rgba(56, 189, 248, 0.32),
            0 2px 10px rgba(12, 32, 68, 0.45);
        }

        .astra-side-trigger-right:hover .astra-label {
          color: #ffffff;
          letter-spacing: -0.01em;
          text-shadow:
            0 0 10px rgba(255, 255, 255, 0.45),
            0 0 22px rgba(167, 139, 250, 0.32),
            0 2px 10px rgba(12, 32, 68, 0.45);
        }

        .astra-side-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.38rem 0.85rem;
          border-radius: 9999px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #ffffff;
          background: linear-gradient(135deg, rgba(16, 38, 76, 0.48) 0%, rgba(28, 60, 110, 0.32) 100%);
          border: 1px solid rgba(255, 255, 255, 0.48);
          box-shadow: 0 6px 18px rgba(10, 28, 60, 0.22), inset 0 1px 1px rgba(255, 255, 255, 0.65);
          opacity: 0;
          transform: translateY(6px);
          animation: astra-badge-reveal 0.8s cubic-bezier(0.22, 1, 0.36, 1) 1.55s forwards;
          transition: all 0.25s ease;
        }

        /* Daytime bright crystal glass pills with pure white text and black borders */
        /* Daytime Liquid Glass Gel Pills (1:1 match to user reference image) */
        :root:not([data-theme="dark"]) .astra-side-badge {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.55rem 1.25rem;
          border-radius: 9999px;
          font-size: 0.76rem;
          font-weight: 600;
          letter-spacing: 0.025em;
          text-transform: none;
          backdrop-filter: blur(28px) saturate(200%);
          -webkit-backdrop-filter: blur(28px) saturate(200%);
          overflow: hidden;
          color: #554e60; /* Soft muted lavender-gray from user arrow reference */
          text-shadow: 0 1px 1px rgba(255, 255, 255, 0.9);
          transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.28s ease, color 0.28s ease;
        }

        .astra-login-icon {
          display: inline-flex;
          flex-shrink: 0;
          color: #ffffff !important;
          stroke: #ffffff !important;
        }

        :root:not([data-theme="dark"]) .astra-side-badge > *,
        :root:not([data-theme="dark"]) .astra-scroll-cue > * {
          position: relative;
          z-index: 3;
        }

        /* Top-edge specular glossy highlight arc */
        :root:not([data-theme="dark"]) .astra-side-badge::before,
        :root:not([data-theme="dark"]) .astra-scroll-cue::before {
          content: "";
          position: absolute;
          top: 2px;
          left: 6px;
          right: 6px;
          height: 42%;
          border-radius: 9999px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.5) 45%, rgba(255, 255, 255, 0) 100%);
          pointer-events: none;
          z-index: 2;
        }

        /* Inner translucent glass rim refraction */
        :root:not([data-theme="dark"]) .astra-side-badge::after,
        :root:not([data-theme="dark"]) .astra-scroll-cue::after {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.7);
          border-bottom-color: rgba(255, 255, 255, 0.2);
          pointer-events: none;
          z-index: 1;
        }

        /* ERP Liquid Glass (Ice Periwinkle - matching top pill in user reference) */
        :root:not([data-theme="dark"]) .astra-side-trigger-left .astra-side-badge {
          background: linear-gradient(
            180deg,
            rgba(215, 230, 255, 0.78) 0%,
            rgba(195, 218, 255, 0.46) 48%,
            rgba(180, 210, 255, 0.70) 100%
          );
          border: 2px solid rgba(175, 202, 250, 0.82);
          border-top-color: rgba(255, 255, 255, 0.98);
          box-shadow:
            0 12px 28px -4px rgba(96, 165, 250, 0.45),
            0 4px 12px rgba(12, 38, 75, 0.08),
            inset 0 2px 2px #ffffff,
            inset 0 -3px 8px rgba(147, 197, 253, 0.65),
            inset 2px 0 4px rgba(255, 255, 255, 0.75),
            inset -2px 0 4px rgba(165, 205, 255, 0.6);
        }

        :root:not([data-theme="dark"]) .astra-side-trigger-left:hover .astra-side-badge {
          transform: translateY(-2px) scale(1.03);
          box-shadow:
            0 16px 36px -4px rgba(96, 165, 250, 0.65),
            0 6px 16px rgba(12, 38, 75, 0.12),
            inset 0 2px 3px #ffffff,
            inset 0 -3px 8px rgba(56, 189, 248, 0.75);
          color: #3b3445;
        }

        /* YAXSELL Liquid Glass (Soft Lilac / Violet) */
        :root:not([data-theme="dark"]) .astra-side-trigger-right .astra-side-badge {
          background: linear-gradient(
            180deg,
            rgba(238, 228, 255, 0.78) 0%,
            rgba(225, 210, 255, 0.46) 48%,
            rgba(215, 195, 255, 0.70) 100%
          );
          border: 2px solid rgba(205, 185, 250, 0.82);
          border-top-color: rgba(255, 255, 255, 0.98);
          box-shadow:
            0 12px 28px -4px rgba(167, 139, 250, 0.45),
            0 4px 12px rgba(12, 38, 75, 0.08),
            inset 0 2px 2px #ffffff,
            inset 0 -3px 8px rgba(196, 181, 253, 0.65),
            inset 2px 0 4px rgba(255, 255, 255, 0.75),
            inset -2px 0 4px rgba(200, 180, 255, 0.6);
        }

        :root:not([data-theme="dark"]) .astra-side-trigger-right:hover .astra-side-badge {
          transform: translateY(-2px) scale(1.03);
          box-shadow:
            0 16px 36px -4px rgba(167, 139, 250, 0.65),
            0 6px 16px rgba(12, 38, 75, 0.12),
            inset 0 2px 3px #ffffff,
            inset 0 -3px 8px rgba(167, 139, 250, 0.75);
          color: #3b3445;
        }

        .astra-side-badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: #38bdf8;
          box-shadow: 0 0 8px #38bdf8;
        }

        .astra-side-trigger-right .astra-side-badge-dot {
          background: #a78bfa;
          box-shadow: 0 0 8px #a78bfa;
        }

        .astra-side-badge .astra-login-icon {
          display: none;
        }

        @keyframes astra-badge-reveal {
          to {
            opacity: 0.92;
            transform: translateY(0);
          }
        }

        .astra-scroll-cue {
          position: absolute;
          bottom: max(1.6rem, env(safe-area-inset-bottom));
          left: 50%;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.45rem 1rem;
          border-radius: 9999px;
          font-size: 0.74rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: #ffffff;
          background: rgba(15, 32, 62, 0.34);
          border: 1px solid rgba(255, 255, 255, 0.28);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 8px 24px rgba(10, 25, 55, 0.2);
          pointer-events: var(--astra-trigger-events, auto);
          cursor: pointer;
          transition: all 0.25s ease;
        }

        :root:not([data-theme="dark"]) .astra-scroll-cue {
          position: absolute;
          bottom: max(1.6rem, env(safe-area-inset-bottom));
          left: 50%;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.55rem 1.35rem;
          border-radius: 9999px;
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: none;
          background: linear-gradient(
            180deg,
            rgba(235, 245, 255, 0.78) 0%,
            rgba(215, 235, 255, 0.46) 48%,
            rgba(200, 230, 255, 0.70) 100%
          );
          border: 2px solid rgba(185, 215, 250, 0.82);
          border-top-color: rgba(255, 255, 255, 0.98);
          box-shadow:
            0 12px 28px -4px rgba(56, 189, 248, 0.38),
            0 4px 12px rgba(12, 38, 75, 0.08),
            inset 0 2px 2px #ffffff,
            inset 0 -3px 8px rgba(147, 197, 253, 0.55);
          color: #ffffff !important;
          text-shadow: 0 1px 3px rgba(12, 35, 75, 0.55);
          backdrop-filter: blur(28px) saturate(200%);
          -webkit-backdrop-filter: blur(28px) saturate(200%);
          overflow: hidden;
          transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.28s ease, color 0.28s ease;
        }

        :root:not([data-theme="dark"]) .astra-scroll-cue:hover {
          transform: translateX(-50%) translateY(-2px) scale(1.02);
          box-shadow:
            0 16px 32px -4px rgba(56, 189, 248, 0.55),
            0 6px 14px rgba(12, 38, 75, 0.12),
            inset 0 2px 3px #ffffff,
            inset 0 -3px 8px rgba(56, 189, 248, 0.7);
          color: #ffffff !important;
        }

        .astra-label-letter {
          display: inline-block;
          opacity: 0;
          will-change: transform, opacity, filter;
          transform: translate3d(var(--astra-label-shift), 0, -32px) rotateY(var(--astra-label-rot, 25deg)) scale(0.68);
          filter: blur(12px);
          animation: astra-label-reveal var(--astra-label-duration) cubic-bezier(0.16, 1, 0.3, 1) var(--astra-label-delay) forwards;
        }

        @keyframes astra-label-reveal {
          0% {
            opacity: 0;
            transform: translate3d(var(--astra-label-shift), 0, -32px) rotateY(var(--astra-label-rot, 25deg)) scale(0.68);
            filter: blur(12px);
          }
          65% {
            opacity: 0.95;
            transform: translate3d(calc(var(--astra-label-shift) * -0.06), 0, 6px) rotateY(0deg) scale(1.035);
            filter: blur(0px);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) rotateY(0deg) scale(1);
            filter: blur(0px);
          }
        }

        /* =========================================================================
           RESPONSIVE RULES (Compact Corner Triggers & Textless Animated Scroll Cue ONLY on Mobile)
           ========================================================================= */
        @media (max-width: 768px) {
          :root {
            --theme-bg: #ffffff !important;
          }
          [data-theme="dark"] {
            --theme-bg: #000000 !important;
          }
          html, body {
            overscroll-behavior-y: none !important;
            background: #ffffff !important;
          }
          [data-theme="dark"] html, [data-theme="dark"] body {
            background: #000000 !important;
          }

          /* Exact viewport backdrop: eliminates distorted camera zoom and framing */
          .astra-backdrop {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            min-height: 100% !important;
            contain: strict !important;
          }

          /* Bloquear giro con táctil 3D en móvil (solo disponible con ratón en PC) */
          .astra-drag-surface {
            display: none !important;
            pointer-events: none !important;
          }

          canvas[data-astra-canvas] {
            width: 100% !important;
            height: 100% !important;
          }

          .astra-top-header {
            top: max(1.15rem, env(safe-area-inset-top)) !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            z-index: 10 !important;
          }

          .astra-top-label {
            font-size: 1.05rem !important;
            letter-spacing: 0.22em !important;
            padding-left: 0.22em !important;
          }

          .astra-top-sub-bar {
            width: 38px !important;
            margin-top: 0.35rem !important;
          }

          /* 1. Corner Triggers: placed with generous clearance below top header */
          .astra-side-trigger-left {
            top: max(3.85rem, calc(env(safe-area-inset-top) + 2.85rem)) !important;
            left: 0.85rem !important;
            transform: none !important;
            align-items: flex-start !important;
            text-align: left !important;
            padding: 0 !important;
            gap: 0.35rem !important;
          }

          .astra-side-trigger-right {
            top: max(3.85rem, calc(env(safe-area-inset-top) + 2.85rem)) !important;
            right: 0.85rem !important;
            left: auto !important;
            transform: none !important;
            align-items: flex-end !important;
            text-align: right !important;
            padding: 0 !important;
            gap: 0.35rem !important;
          }

          .astra-side-trigger:active {
            transform: scale(0.96) !important;
          }

          .astra-side-trigger {
            max-width: fit-content !important;
          }

          /* Compact mobile titles in corners */
          .astra-label {
            font-size: 1.15rem !important;
            line-height: 1.1 !important;
            letter-spacing: -0.01em !important;
          }

          /* Mobile: Substantially larger circular liquid glass entry button with prominent SVG icon */
          .astra-side-badge {
            width: 54px !important;
            height: 54px !important;
            min-width: 54px !important;
            border-radius: 50% !important;
            padding: 0 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            position: relative !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            border-width: 2px !important;
            box-shadow: 0 10px 24px -2px rgba(12, 38, 75, 0.28), inset 0 2px 3px #ffffff !important;
            transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease !important;
          }

          .astra-side-badge .astra-badge-text,
          .astra-side-badge .astra-side-badge-dot {
            display: none !important;
          }

          .astra-side-badge .astra-login-icon {
            display: inline-flex !important;
            width: 26px !important;
            height: 26px !important;
            position: relative !important;
            z-index: 3 !important;
          }

          /* Specular reflection gloss on circular entry button */
          .astra-side-badge::before {
            content: "" !important;
            position: absolute !important;
            top: 2px !important;
            left: 6px !important;
            right: 6px !important;
            height: 44% !important;
            border-radius: 50% 50% 36% 36% !important;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.35) 50%, transparent 100%) !important;
            pointer-events: none !important;
            z-index: 2 !important;
          }

          .astra-side-trigger:active .astra-side-badge {
            transform: scale(0.90) !important;
          }

          /* 2. Scroll cue: Compact animated button WITHOUT text */
          .astra-scroll-cue {
            width: 44px !important;
            height: 44px !important;
            min-width: 44px !important;
            padding: 0 !important;
            border-radius: 50% !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            bottom: max(1.15rem, env(safe-area-inset-bottom)) !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
          }

          .astra-scroll-cue span {
            display: none !important;
          }

          .astra-scroll-cue svg {
            width: 20px !important;
            height: 20px !important;
            stroke: #ffffff !important;
            filter: drop-shadow(0 1px 2px rgba(10, 20, 45, 0.45)) !important;
            animation: astra-CueBounceMobile 1.6s ease-in-out infinite !important;
          }

          @keyframes astra-CueBounceMobile {
            0%, 100% { transform: translateY(-2px); }
            50% { transform: translateY(3px); }
          }

          /* 3. Mobile-Only Grand White Brand Title Under 3D Core Logo */
          .astra-mobile-logo-brand {
            display: flex !important;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            position: absolute;
            top: calc(50% + 176px);
            left: 50%;
            transform: translateX(-50%);
            z-index: 5;
            pointer-events: none;
            user-select: none;
            text-align: center;
            white-space: nowrap;
          }

          .astra-mobile-brand-title {
            color: #ffffff !important;
            font-size: clamp(2.05rem, 8.2vw, 2.75rem);
            font-weight: 900;
            letter-spacing: 0.30em;
            padding-left: 0.30em;
            text-transform: uppercase;
            line-height: 1;
            margin: 0;
            text-shadow:
              0 2px 12px rgba(12, 32, 68, 0.40),
              0 0 18px rgba(56, 189, 248, 0.32),
              0 1px 3px rgba(0, 0, 0, 0.25);
          }

          [data-theme="dark"] .astra-mobile-brand-title {
            color: #ffffff !important;
            text-shadow:
              0 2px 14px rgba(0, 0, 0, 0.50),
              0 0 22px rgba(56, 189, 248, 0.42),
              0 0 10px rgba(255, 255, 255, 0.35);
          }

          .astra-mobile-brand-bar {
            width: 54px;
            height: 2px;
            margin-top: 0.65rem;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.90) 25%, rgba(56, 189, 248, 0.85) 50%, rgba(167, 139, 250, 0.85) 75%, transparent);
            border-radius: 9999px;
            box-shadow: 0 0 6px rgba(56, 189, 248, 0.45);
            opacity: 0;
            animation: astra-badge-reveal 0.8s cubic-bezier(0.22, 1, 0.36, 1) 1.1s forwards;
          }

          @media (max-height: 720px) {
            .astra-mobile-logo-brand {
              top: calc(50% + 148px);
            }
            .astra-mobile-brand-title {
              font-size: clamp(1.65rem, 7vw, 2.2rem);
            }
          }

          @media (max-height: 620px) {
            .astra-mobile-logo-brand {
              top: calc(50% + 120px);
            }
          }

          /* 4. Corner dock: bottom-right on mobile */
          .astra-corner-dock {
            bottom: max(1.15rem, env(safe-area-inset-bottom)) !important;
            right: 0.85rem !important;
            gap: 0.35rem !important;
          }

          .astra-theme-toggle {
            padding: 0.28rem 0.65rem 0.28rem 0.32rem !important;
            font-size: 0.68rem !important;
          }

          .astra-dock-icon {
            width: 22px !important;
            height: 22px !important;
            font-size: 0.75rem !important;
          }

          .astra-dock-label {
            font-size: 0.65rem !important;
          }

          .astra-replay-btn,
          .astra-replay {
            width: 38px !important;
            height: 38px !important;
          }

          .astra-replay-btn svg,
          .astra-replay svg {
            width: 16px !important;
            height: 16px !important;
          }

          /* 5. Mobile Platform Navigation Bar (Switcher): Strictly stay pure solid white, never celeste */
          .astra-platform-switcher {
            background: #ffffff !important;
            border: 1.5px solid #ffffff !important;
            box-shadow: 0 4px 18px rgba(18, 52, 98, 0.12), inset 0 1px 2px #ffffff !important;
            padding: 0.28rem !important;
          }

          [data-theme="dark"] .astra-platform-switcher {
            background: rgba(255, 255, 255, 0.12) !important;
            border-color: rgba(255, 255, 255, 0.35) !important;
            box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.3), 0 4px 16px rgba(0, 0, 0, 0.35) !important;
          }

          .astra-platform-tab {
            color: #1e3a66 !important;
            font-weight: 800 !important;
            padding: 0.52rem 0.85rem !important;
            transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1) !important;
          }

          [data-theme="dark"] .astra-platform-tab {
            color: rgba(255, 255, 255, 0.85) !important;
          }

          /* Active / Selected Tab on Mobile: PURE SOLID WHITE, NOT CELESTE */
          .astra-platform-tab[data-selected="true"] {
            background: #ffffff !important;
            color: #0b2546 !important;
            border: 1.4px solid #ffffff !important;
            box-shadow: 0 4px 18px rgba(255, 255, 255, 0.65), 0 2px 8px rgba(11, 37, 70, 0.14) !important;
            text-shadow: none !important;
            font-weight: 800 !important;
          }

          [data-theme="dark"] .astra-platform-tab[data-selected="true"] {
            background: #ffffff !important;
            color: #040914 !important;
            border: 1.4px solid #ffffff !important;
            box-shadow: 0 4px 20px rgba(255, 255, 255, 0.45), 0 2px 8px rgba(0, 0, 0, 0.4) !important;
            text-shadow: none !important;
            font-weight: 800 !important;
          }

          .astra-back-top-btn {
            background: rgba(255, 255, 255, 0.85) !important;
            border: 1.4px solid #ffffff !important;
            box-shadow: 0 3px 12px rgba(255, 255, 255, 0.4), 0 2px 6px rgba(18, 52, 98, 0.08) !important;
            color: #0b2546 !important;
          }

          .astra-top-sub-bar {
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.95), transparent) !important;
            box-shadow: 0 0 6px rgba(255, 255, 255, 0.6) !important;
          }

          /* 6. Mobile GPU Layer & Compositor Optimization */
          .astra-morphism-rig,
          .morphism-orb,
          .morphism-cube-wrap,
          .morphism-shard {
            will-change: transform;
            transform: translateZ(0);
          }

          /* Optimized backdrop blur on mobile: identical look on high-DPI displays, 4x faster fill-rate */
          .astra-glass-card {
            backdrop-filter: blur(14px) !important;
            -webkit-backdrop-filter: blur(14px) !important;
          }

          .astra-active-session-box {
            backdrop-filter: blur(14px) !important;
            -webkit-backdrop-filter: blur(14px) !important;
          }

          .astra-input-well {
            backdrop-filter: blur(10px) !important;
            -webkit-backdrop-filter: blur(10px) !important;
          }
        }

        /* =========================================================================
           3D GLASSMORPHISM LOGIN STAGE (Exact replica of login.mp4 in Starfield)
           ========================================================================= */
        /* =========================================================================
           3D GLASSMORPHISM LOGIN STAGE: SCROLL-DRIVEN 3D ASSEMBLY + CONVERGENCE
           ========================================================================= */
        .astra-login-stage {
          --rig-scale: 1;
          position: fixed;
          inset: 0;
          z-index: 6;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          pointer-events: none;
          perspective: 1350px;
          transform:
            translate3d(0, calc(var(--astra-disperse, 1) * 44px), calc(var(--astra-disperse, 1) * -80px))
            scale(calc(var(--rig-scale) * (0.90 + 0.10 * (1 - var(--astra-disperse, 1)))));
        }

        .astra-login-stage[data-interactive="true"] .astra-morphism-rig,
        .astra-login-stage[data-interactive="true"] .astra-glass-card {
          pointer-events: auto;
        }

        /* 3D Perspective Rig holding the Glass Slab + Orbiting 3D Glass Cubes & Spheres
           Note: No preserve-3d on parent rig so Chromium never BSP-splits 3D cubes across
           the backdrop-filter glass card plane (eliminates all face flickering/teleporting). */
        .astra-morphism-rig {
          position: relative;
          width: 100%;
          max-width: 416px;
          will-change: transform;
          animation: astra-rig-float 13s ease-in-out infinite;
        }

        @keyframes astra-rig-float {
          0%, 100% {
            transform: perspective(1350px) translate3d(0, 4px, 0) rotateX(4.2deg) rotateY(-10.5deg) scale3d(0.965, 0.965, 1);
          }
          50% {
            transform: perspective(1350px) translate3d(0, -6px, 0) rotateX(1.6deg) rotateY(-5.5deg) scale3d(1.035, 1.035, 1);
          }
        }

        /* =========================================================================
           ORBITING 3D FROSTED SPHERES: SCROLL CONVERGENCE + FLUID AMBIENT DRIFT
           ========================================================================= */
        .morphism-orb-anchor {
          position: absolute;
          pointer-events: none;
          opacity: var(--astra-login-opacity, 0);
          will-change: transform;
        }

        .morphism-orb-anchor.morphism-orb-tl {
          z-index: 1;
          top: -28px;
          left: -36px;
          width: 72px;
          height: 72px;
          transform:
            translate3d(calc(var(--astra-disperse, 1) * -130px), calc(var(--astra-disperse, 1) * -110px), 0)
            scale(calc(1 - var(--astra-disperse, 1) * 0.45));
        }

        .morphism-orb-anchor.morphism-orb-bl {
          z-index: 4;
          bottom: 24px;
          left: -46px;
          width: 78px;
          height: 78px;
          transform:
            translate3d(calc(var(--astra-disperse, 1) * -140px), calc(var(--astra-disperse, 1) * 120px), 0)
            scale(calc(1 - var(--astra-disperse, 1) * 0.45));
        }

        .morphism-orb {
          width: 100%;
          height: 100%;
          border-radius: 9999px;
          pointer-events: none;
          will-change: transform;
          background:
            radial-gradient(circle at 28% 26%, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.62) 20%, rgba(165, 218, 255, 0.42) 55%, rgba(59, 130, 246, 0.34) 90%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.58) 0%, rgba(125, 211, 252, 0.28) 100%);
          border: 1.5px solid rgba(255, 255, 255, 0.86);
          box-shadow:
            inset 0 4px 10px rgba(255, 255, 255, 0.96),
            inset -4px -6px 14px rgba(125, 211, 252, 0.48),
            0 8px 20px rgba(25, 75, 145, 0.16);
        }

        [data-theme="dark"] .morphism-orb {
          background:
            radial-gradient(circle at 28% 26%, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.45) 18%, rgba(148, 205, 255, 0.24) 52%, rgba(16, 38, 76, 0.42) 88%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.46) 0%, rgba(56, 189, 248, 0.18) 100%);
          border-color: rgba(255, 255, 255, 0.78);
        }

        .morphism-orb-anchor.morphism-orb-tl .morphism-orb {
          animation: orb-bob-1 13s ease-in-out infinite;
        }

        .morphism-orb-anchor.morphism-orb-bl .morphism-orb {
          animation: orb-bob-2 14s ease-in-out infinite;
        }

        @keyframes orb-bob-1 {
          0%, 100% {
            transform: translate3d(0px, 0px, 0px) scale(0.92);
          }
          50% {
            transform: translate3d(-10px, -12px, 0px) scale(1.14);
          }
        }

        @keyframes orb-bob-2 {
          0%, 100% {
            transform: translate3d(0px, 0px, 0px) scale(0.92);
          }
          50% {
            transform: translate3d(-14px, 10px, 0px) scale(1.16);
          }
        }

        /* =========================================================================
           3D CRYSTAL CUBES: SCROLL CONVERGENCE + FLUID 3D CAMERA FLOATING
           ========================================================================= */
        .morphism-cube-anchor {
          position: absolute;
          z-index: 4;
          pointer-events: none;
          opacity: var(--astra-login-opacity, 0);
          transform-style: preserve-3d;
          will-change: transform;
        }

        .morphism-cube-anchor.morphism-cube-tr {
          --cube-size: 56px;
          width: var(--cube-size);
          height: var(--cube-size);
          top: 14px;
          right: -56px;
          transform:
            translate3d(calc(var(--astra-disperse, 1) * 160px), calc(var(--astra-disperse, 1) * -110px), calc(var(--astra-disperse, 1) * 130px))
            rotateX(calc(var(--astra-disperse, 1) * 45deg))
            rotateY(calc(var(--astra-disperse, 1) * -60deg))
            scale(calc(1 - var(--astra-disperse, 1) * 0.45));
        }

        .morphism-cube-anchor.morphism-cube-br {
          --cube-size: 74px;
          width: var(--cube-size);
          height: var(--cube-size);
          bottom: -14px;
          right: -46px;
          transform:
            translate3d(calc(var(--astra-disperse, 1) * 180px), calc(var(--astra-disperse, 1) * 130px), calc(var(--astra-disperse, 1) * 150px))
            rotateX(calc(var(--astra-disperse, 1) * -50deg))
            rotateY(calc(var(--astra-disperse, 1) * 70deg))
            scale(calc(1 - var(--astra-disperse, 1) * 0.45));
        }

        .morphism-cube-anchor.morphism-cube-bl {
          --cube-size: 44px;
          width: var(--cube-size);
          height: var(--cube-size);
          bottom: 84px;
          left: -104px;
          transform:
            translate3d(calc(var(--astra-disperse, 1) * -160px), calc(var(--astra-disperse, 1) * 110px), calc(var(--astra-disperse, 1) * -90px))
            rotateX(calc(var(--astra-disperse, 1) * 60deg))
            rotateY(calc(var(--astra-disperse, 1) * -70deg))
            scale(calc(1 - var(--astra-disperse, 1) * 0.45));
        }

        .morphism-cube-anchor.morphism-cube-far-tr {
          --cube-size: 28px;
          width: var(--cube-size);
          height: var(--cube-size);
          top: 138px;
          right: -102px;
          transform:
            translate3d(calc(var(--astra-disperse, 1) * 200px), calc(var(--astra-disperse, 1) * -80px), calc(var(--astra-disperse, 1) * -160px))
            rotateX(calc(var(--astra-disperse, 1) * 35deg))
            rotateY(calc(var(--astra-disperse, 1) * 50deg))
            scale(calc(1 - var(--astra-disperse, 1) * 0.55));
        }

        .morphism-cube-wrap {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
          will-change: transform;
        }

        .morphism-cube-anchor.morphism-cube-tr .morphism-cube-wrap {
          animation: cube-float-tr 13s ease-in-out infinite;
        }
        .morphism-cube-anchor.morphism-cube-br .morphism-cube-wrap {
          animation: cube-float-br 14.5s ease-in-out infinite;
        }
        .morphism-cube-anchor.morphism-cube-bl .morphism-cube-wrap {
          animation: cube-float-bl 13.5s ease-in-out infinite;
        }
        .morphism-cube-anchor.morphism-cube-far-tr .morphism-cube-wrap {
          animation: cube-float-far-tr 15s ease-in-out infinite;
        }

        @keyframes cube-float-tr {
          0%, 100% {
            transform: perspective(900px) translate3d(0px, 0px, 0px) rotateX(-24deg) rotateY(-38deg) rotateZ(12deg) scale3d(0.90, 0.90, 0.90);
          }
          50% {
            transform: perspective(900px) translate3d(14px, -12px, 0px) rotateX(-15deg) rotateY(-26deg) rotateZ(20deg) scale3d(1.15, 1.15, 1.15);
          }
        }

        @keyframes cube-float-br {
          0%, 100% {
            transform: perspective(900px) translate3d(0px, 0px, 0px) rotateX(22deg) rotateY(-34deg) rotateZ(-16deg) scale3d(0.90, 0.90, 0.90);
          }
          50% {
            transform: perspective(900px) translate3d(16px, 12px, 0px) rotateX(31deg) rotateY(-22deg) rotateZ(-8deg) scale3d(1.16, 1.16, 1.16);
          }
        }

        @keyframes cube-float-bl {
          0%, 100% {
            transform: perspective(900px) translate3d(0px, 0px, 0px) rotateX(26deg) rotateY(32deg) rotateZ(-20deg) scale3d(0.88, 0.88, 0.88);
          }
          50% {
            transform: perspective(900px) translate3d(-16px, -10px, 0px) rotateX(18deg) rotateY(44deg) rotateZ(-11deg) scale3d(1.15, 1.15, 1.15);
          }
        }

        @keyframes cube-float-far-tr {
          0%, 100% {
            transform: perspective(900px) translate3d(0px, 0px, 0px) rotateX(30deg) rotateY(-26deg) rotateZ(24deg) scale3d(0.88, 0.88, 0.88);
          }
          50% {
            transform: perspective(900px) translate3d(14px, -9px, 0px) rotateX(21deg) rotateY(-38deg) rotateZ(33deg) scale3d(1.16, 1.16, 1.16);
          }
        }

        .morphism-cube-face {
          position: absolute;
          inset: 0;
          border-radius: 3px;
          opacity: var(--astra-login-opacity, 0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.68) 0%,
            rgba(215, 240, 255, 0.45) 52%,
            rgba(125, 211, 252, 0.35) 100%
          );
          border: 1.5px solid rgba(255, 255, 255, 0.94);
          box-shadow:
            inset 0 0 14px rgba(255, 255, 255, 0.68),
            0 0 18px rgba(125, 211, 252, 0.35);
        }

        [data-theme="dark"] .morphism-cube-face {
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.44) 0%,
            rgba(175, 222, 255, 0.22) 52%,
            rgba(24, 58, 118, 0.34) 100%
          );
          border-color: rgba(255, 255, 255, 0.85);
          box-shadow:
            inset 0 0 14px rgba(255, 255, 255, 0.48),
            0 0 18px rgba(56, 189, 248, 0.24);
        }

        .morphism-cube-face.front  { transform: translateZ(calc(var(--cube-size) * 0.5)); }
        .morphism-cube-face.back   { transform: rotateY(180deg) translateZ(calc(var(--cube-size) * 0.5)); }
        .morphism-cube-face.right  { transform: rotateY(90deg) translateZ(calc(var(--cube-size) * 0.5)); background: linear-gradient(135deg, rgba(186, 230, 253, 0.68), rgba(59, 130, 246, 0.35)); }
        .morphism-cube-face.left   { transform: rotateY(-90deg) translateZ(calc(var(--cube-size) * 0.5)); }
        .morphism-cube-face.top    { transform: rotateX(90deg) translateZ(calc(var(--cube-size) * 0.5)); background: linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(186, 230, 253, 0.50)); }
        .morphism-cube-face.bottom { transform: rotateX(-90deg) translateZ(calc(var(--cube-size) * 0.5)); }

        /* =========================================================================
           DYNAMIC FLOATING GLASS PARTICLES & CRYSTAL SHARDS (ALIVE & DRIFTING IN 3D)
           ========================================================================= */
        .morphism-shard-anchor {
          position: absolute;
          z-index: 4;
          pointer-events: none;
          opacity: var(--astra-login-opacity, 0);
          will-change: transform;
        }

        /* Dispersed assembly trajectories for each glass particle */
        .shard-a1 { top: -48px; right: 28px; transform: translate3d(calc(var(--astra-disperse, 1) * 90px), calc(var(--astra-disperse, 1) * -120px), 0) scale(calc(1 - var(--astra-disperse, 1) * 0.6)); }
        .shard-a2 { top: 38%; right: -86px; transform: translate3d(calc(var(--astra-disperse, 1) * 140px), calc(var(--astra-disperse, 1) * -30px), 0) scale(calc(1 - var(--astra-disperse, 1) * 0.6)); }
        .shard-a3 { bottom: -44px; left: 26%; transform: translate3d(calc(var(--astra-disperse, 1) * -60px), calc(var(--astra-disperse, 1) * 130px), 0) scale(calc(1 - var(--astra-disperse, 1) * 0.6)); }
        .shard-a4 { top: 24%; left: -82px; transform: translate3d(calc(var(--astra-disperse, 1) * -140px), calc(var(--astra-disperse, 1) * -40px), 0) scale(calc(1 - var(--astra-disperse, 1) * 0.6)); }
        .shard-a5 { top: -20px; left: 32px; transform: translate3d(calc(var(--astra-disperse, 1) * -80px), calc(var(--astra-disperse, 1) * -90px), 0) scale(calc(1 - var(--astra-disperse, 1) * 0.6)); }
        .shard-a6 { bottom: -28px; right: 18%; transform: translate3d(calc(var(--astra-disperse, 1) * 70px), calc(var(--astra-disperse, 1) * 110px), 0) scale(calc(1 - var(--astra-disperse, 1) * 0.6)); }
        .shard-a7 { bottom: 32%; right: -72px; transform: translate3d(calc(var(--astra-disperse, 1) * 120px), calc(var(--astra-disperse, 1) * 60px), 0) scale(calc(1 - var(--astra-disperse, 1) * 0.6)); }
        .shard-a8 { top: -38px; left: 48%; transform: translate3d(calc(var(--astra-disperse, 1) * 10px), calc(var(--astra-disperse, 1) * -130px), 0) scale(calc(1 - var(--astra-disperse, 1) * 0.6)); }

        .shard-sp1 { top: 12%; right: -42px; transform: translate3d(calc(var(--astra-disperse, 1) * 80px), calc(var(--astra-disperse, 1) * -60px), 0); }
        .shard-sp2 { bottom: 18%; left: -68px; transform: translate3d(calc(var(--astra-disperse, 1) * -90px), calc(var(--astra-disperse, 1) * 80px), 0); }
        .shard-sp3 { top: -32px; right: 110px; transform: translate3d(calc(var(--astra-disperse, 1) * 40px), calc(var(--astra-disperse, 1) * -100px), 0); }
        .shard-sp4 { bottom: -32px; left: 60%; transform: translate3d(calc(var(--astra-disperse, 1) * 50px), calc(var(--astra-disperse, 1) * 100px), 0); }

        /* Crystal Glass Shards: translucent acrylic crystals with glowing prismatic borders */
        .morphism-shard {
          pointer-events: none;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(186, 230, 253, 0.62) 50%, rgba(56, 189, 248, 0.38) 100%);
          border: 1px solid rgba(255, 255, 255, 0.92);
          box-shadow:
            inset 0 0 8px rgba(255, 255, 255, 0.85),
            0 0 16px rgba(125, 211, 252, 0.55);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          will-change: transform;
        }

        .morphism-shard.s1 {
          width: 14px; height: 18px;
          clip-path: polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%);
          animation: shard-float-1 11s ease-in-out infinite;
        }
        .morphism-shard.s2 {
          width: 16px; height: 22px;
          clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
          animation: shard-float-2 13.5s ease-in-out infinite;
        }
        .morphism-shard.s3 {
          width: 11px; height: 15px;
          clip-path: polygon(30% 0%, 100% 35%, 70% 100%, 0% 65%);
          animation: shard-float-3 12s ease-in-out infinite;
        }
        .morphism-shard.s4 {
          width: 15px; height: 19px;
          clip-path: polygon(50% 0%, 100% 40%, 80% 100%, 20% 100%, 0% 40%);
          animation: shard-float-4 14s ease-in-out infinite;
        }
        .morphism-shard.s5 {
          width: 10px; height: 14px;
          clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
          animation: shard-float-5 10.5s ease-in-out infinite;
        }
        .morphism-shard.s6 {
          width: 13px; height: 17px;
          clip-path: polygon(40% 0%, 100% 45%, 60% 100%, 0% 55%);
          animation: shard-float-6 13s ease-in-out infinite;
        }
        .morphism-shard.s7 {
          width: 12px; height: 16px;
          clip-path: polygon(50% 0%, 100% 38%, 80% 100%, 20% 100%, 0% 38%);
          animation: shard-float-7 15s ease-in-out infinite;
        }
        .morphism-shard.s8 {
          width: 9px; height: 13px;
          clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
          animation: shard-float-8 11.5s ease-in-out infinite;
        }

        /* Twinkling micro-sparkles: diamond crystals that pulse and twinkle in 3D starfield */
        .morphism-sparkle {
          width: 6px;
          height: 6px;
          border-radius: 1px;
          background: #ffffff;
          box-shadow:
            0 0 8px rgba(255, 255, 255, 0.98),
            0 0 16px rgba(56, 189, 248, 0.85);
          will-change: transform, opacity;
        }
        .morphism-sparkle.sp1 { animation: sparkle-float-1 7.5s ease-in-out infinite; }
        .morphism-sparkle.sp2 { animation: sparkle-float-2 9s ease-in-out infinite; }
        .morphism-sparkle.sp3 { animation: sparkle-float-3 8s ease-in-out infinite; }
        .morphism-sparkle.sp4 { animation: sparkle-float-4 10s ease-in-out infinite; }

        /* Continuous Fluid Orbit & Drift Keyframes for all glass particles */
        @keyframes shard-float-1 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(18deg) scale(0.9); }
          50% { transform: translate3d(14px, -18px, 0) rotate(48deg) scale(1.12); }
        }
        @keyframes shard-float-2 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-32deg) scale(0.95); }
          50% { transform: translate3d(18px, 16px, 0) rotate(-6deg) scale(1.15); }
        }
        @keyframes shard-float-3 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(42deg) scale(0.85); }
          50% { transform: translate3d(-16px, 18px, 0) rotate(75deg) scale(1.08); }
        }
        @keyframes shard-float-4 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-22deg) scale(0.88); }
          50% { transform: translate3d(-20px, -14px, 0) rotate(12deg) scale(1.12); }
        }
        @keyframes shard-float-5 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(35deg) scale(0.85); }
          50% { transform: translate3d(-12px, -16px, 0) rotate(65deg) scale(1.15); }
        }
        @keyframes shard-float-6 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-15deg) scale(0.9); }
          50% { transform: translate3d(16px, 12px, 0) rotate(22deg) scale(1.1); }
        }
        @keyframes shard-float-7 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(52deg) scale(0.86); }
          50% { transform: translate3d(14px, -15px, 0) rotate(88deg) scale(1.12); }
        }
        @keyframes shard-float-8 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-28deg) scale(0.82); }
          50% { transform: translate3d(-10px, -18px, 0) rotate(5deg) scale(1.08); }
        }

        @keyframes sparkle-float-1 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(45deg) scale(0.8); opacity: 0.45; }
          50% { transform: translate3d(10px, -12px, 0) rotate(135deg) scale(1.25); opacity: 1; }
        }
        @keyframes sparkle-float-2 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(45deg) scale(0.75); opacity: 0.4; }
          50% { transform: translate3d(-12px, 10px, 0) rotate(225deg) scale(1.2); opacity: 0.95; }
        }
        @keyframes sparkle-float-3 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(45deg) scale(0.85); opacity: 0.5; }
          50% { transform: translate3d(8px, -14px, 0) rotate(-45deg) scale(1.3); opacity: 1; }
        }
        @keyframes sparkle-float-4 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(45deg) scale(0.7); opacity: 0.35; }
          50% { transform: translate3d(-8px, 12px, 0) rotate(135deg) scale(1.15); opacity: 0.9; }
        }

        /* Day Mode Default: Bright, transparent crystal acrylic slab */
        .astra-glass-card {
          --glass-mx: 35%;
          --glass-my: 22%;
          --accent-primary: #38bdf8;
          --accent-secondary: #2563eb;
          --accent-glow: rgba(56, 189, 248, 0.55);
          position: relative;
          z-index: 2;
          width: 100%;
          opacity: var(--astra-login-opacity, 0);
          transform:
            translate3d(0, calc(var(--astra-disperse, 1) * 28px), calc(var(--astra-disperse, 1) * -40px))
            scale(calc(1 - var(--astra-disperse, 1) * 0.08));
          border-radius: 34px;
          padding: 2.35rem 2.25rem 2.1rem;
          color: #0f2d5c;
          background:
            linear-gradient(
              128deg,
              rgba(255, 255, 255, 0.38) 0%,
              rgba(235, 246, 255, 0.22) 36%,
              rgba(215, 238, 255, 0.16) 70%,
              rgba(255, 255, 255, 0.30) 100%
            );
          border: 1.5px solid rgba(255, 255, 255, 0.82);
          box-shadow:
            0 18px 48px -10px rgba(20, 60, 115, 0.14),
            0 4px 16px rgba(56, 189, 248, 0.12),
            inset 0 2px 3px rgba(255, 255, 255, 0.98),
            inset -2px -2px 5px rgba(186, 230, 253, 0.35),
            inset 2px 0 4px rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          transition: border-color 0.35s ease, box-shadow 0.35s ease, background 0.35s ease;
        }

        /* Staggered assembly of interior console elements with scroll */
        .astra-login-header {
          transform: translate3d(0, calc(var(--astra-disperse, 1) * 16px), 0);
        }
        .astra-field {
          transform: translate3d(0, calc(var(--astra-disperse, 1) * 24px), 0);
        }
        .astra-login-options {
          transform: translate3d(0, calc(var(--astra-disperse, 1) * 30px), 0);
        }
        .astra-glass-submit {
          transform: translate3d(0, calc(var(--astra-disperse, 1) * 36px), 0);
        }

        /* Night Mode: Deep cosmic crystal glass with high transparency */
        [data-theme="dark"] .astra-glass-card {
          color: #ffffff;
          background:
            linear-gradient(
              126deg,
              rgba(255, 255, 255, 0.10) 0%,
              rgba(148, 197, 255, 0.04) 32%,
              rgba(10, 20, 42, 0.25) 64%,
              rgba(16, 34, 68, 0.28) 100%
            );
          border-color: rgba(255, 255, 255, 0.58);
          box-shadow:
            10px 12px 36px -6px rgba(56, 189, 248, 0.14),
            inset 0 2px 3px rgba(255, 255, 255, 0.55),
            inset -2px -2px 4px rgba(56, 189, 248, 0.18);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .astra-glass-card[data-platform="yaxsell"] {
          --accent-primary: #a78bfa;
          --accent-secondary: #7c3aed;
          --accent-glow: rgba(167, 139, 250, 0.6);
        }

        .astra-glass-slab-edge {
          position: absolute;
          inset: -1px;
          z-index: -2;
          border-radius: 34px;
          pointer-events: none;
          transform: translate(8px, 6px);
          border: 1.5px solid rgba(186, 230, 253, 0.28);
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.04) 0%,
            rgba(56, 189, 248, 0.05) 100%
          );
          box-shadow:
            inset 0 0 16px rgba(125, 211, 252, 0.12),
            4px 4px 18px rgba(14, 165, 233, 0.10);
        }

        .astra-glass-slab-edge-mid {
          position: absolute;
          inset: -1px;
          z-index: -1;
          border-radius: 34px;
          pointer-events: none;
          transform: translate(4px, 3px);
          border: 1px solid rgba(255, 255, 255, 0.25);
        }

        .astra-glass-sheen {
          position: absolute;
          inset: 0;
          border-radius: 33px;
          pointer-events: none;
          overflow: hidden;
          z-index: 0;
        }

        .astra-glass-sheen::before {
          content: "";
          position: absolute;
          top: -25%;
          left: -35%;
          width: 140%;
          height: 85%;
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.32) 0%,
            rgba(255, 255, 255, 0.10) 48%,
            rgba(255, 255, 255, 0.0) 100%
          );
          transform: rotate(-28deg);
          pointer-events: none;
        }

        .astra-glass-sheen::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(
            340px circle at var(--glass-mx) var(--glass-my),
            rgba(255, 255, 255, 0.24),
            transparent 62%
          );
          pointer-events: none;
        }

        .astra-glass-inner {
          position: relative;
          z-index: 2;
        }

        .astra-glass-topbar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          margin-bottom: 0.65rem;
          margin-top: -0.45rem;
        }

        .astra-back-top-btn {
          appearance: none;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.34rem 0.82rem;
          border-radius: 9999px;
          font-size: 0.72rem;
          font-weight: 700;
          color: #0f3460;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.65) 0%, rgba(225, 240, 255, 0.42) 100%);
          border: 1.4px solid rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          box-shadow: 0 4px 16px rgba(18, 52, 98, 0.12), inset 0 1.5px 2px #ffffff;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
          z-index: 10;
        }

        [data-theme="dark"] .astra-back-top-btn {
          color: rgba(255, 255, 255, 0.95);
          background: linear-gradient(135deg, rgba(20, 38, 72, 0.62) 0%, rgba(12, 24, 48, 0.42) 100%);
          border-color: rgba(255, 255, 255, 0.55);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.45);
        }

        .astra-back-top-btn:hover {
          transform: translateY(-2px) scale(1.05);
          border-color: #ffffff;
          box-shadow: 0 8px 24px rgba(56, 189, 248, 0.35), inset 0 2px 4px #ffffff;
        }

        .astra-back-top-btn:active {
          transform: scale(0.96);
        }

        .astra-login-header {
          text-align: center;
          margin-bottom: 1.15rem;
        }

        .astra-login-title {
          display: none;
        }

        .astra-login-subtitle {
          font-size: 0.92rem;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: rgba(15, 45, 85, 0.82);
          text-shadow: none;
          margin: 0.15rem 0 0.85rem 0;
        }

        [data-theme="dark"] .astra-login-subtitle {
          color: rgba(255, 255, 255, 0.92);
          text-shadow: 0 1px 8px rgba(8, 22, 52, 0.45);
        }

        .astra-platform-switcher {
          display: inline-grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.28rem;
          padding: 0.24rem;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.52);
          border: 1.2px solid rgba(255, 255, 255, 0.92);
          box-shadow: inset 0 1px 3px rgba(255, 255, 255, 0.9), 0 2px 8px rgba(18, 52, 98, 0.06);
          width: 100%;
        }

        [data-theme="dark"] .astra-platform-switcher {
          background: rgba(12, 28, 58, 0.32);
          border-color: rgba(255, 255, 255, 0.42);
          box-shadow: inset 0 2px 6px rgba(6, 16, 38, 0.26);
        }

        .astra-platform-tab {
          appearance: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.46rem 0.75rem;
          border-radius: 9999px;
          border: 1px solid transparent;
          background: transparent;
          color: rgba(15, 45, 85, 0.78);
          font-size: 0.73rem;
          font-weight: 800;
          letter-spacing: 0.03em;
          cursor: pointer;
          transition: all 0.22s ease;
        }

        .astra-platform-tab:hover {
          color: #0f2d5c;
        }

        [data-theme="dark"] .astra-platform-tab {
          color: rgba(255, 255, 255, 0.78);
        }

        [data-theme="dark"] .astra-platform-tab:hover {
          color: #ffffff;
        }

        .astra-platform-tab[data-selected="true"] {
          color: #ffffff;
          background: linear-gradient(90deg, #38bdf8 0%, #2563eb 100%);
          border-color: #ffffff;
          box-shadow: 0 3px 14px rgba(56, 189, 248, 0.38), inset 0 1px 1px #ffffff;
          text-shadow: 0 1px 2px rgba(10, 30, 70, 0.3);
        }

        .astra-platform-tab:focus {
          outline: none;
        }

        .astra-platform-tab:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 3px;
        }

        .astra-login-form {
          display: flex;
          flex-direction: column;
          gap: 1.05rem;
        }

        .astra-field-group {
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .astra-input-well {
          position: relative;
          display: flex;
          align-items: center;
          height: 52px;
          border-radius: 9999px;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.68) 0%,
            rgba(240, 248, 255, 0.52) 55%,
            rgba(255, 255, 255, 0.62) 100%
          );
          border: 1.5px solid rgba(255, 255, 255, 0.92);
          box-shadow:
            inset 0 1px 3px rgba(255, 255, 255, 0.95),
            0 4px 14px rgba(18, 52, 98, 0.06);
          transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        }

        [data-theme="dark"] .astra-input-well {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.22) 0%,
            rgba(186, 220, 255, 0.14) 55%,
            rgba(255, 255, 255, 0.18) 100%
          );
          border-color: rgba(255, 255, 255, 0.48);
          box-shadow:
            inset 0 2px 6px rgba(6, 16, 38, 0.20),
            inset 0 1px 1px rgba(255, 255, 255, 0.65),
            0 4px 14px rgba(6, 16, 38, 0.14);
        }

        .astra-input-well:hover {
          border-color: #ffffff;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.82) 0%,
            rgba(240, 248, 255, 0.65) 55%,
            rgba(255, 255, 255, 0.74) 100%
          );
        }

        [data-theme="dark"] .astra-input-well:hover {
          border-color: rgba(255, 255, 255, 0.78);
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.26) 0%,
            rgba(186, 220, 255, 0.18) 55%,
            rgba(255, 255, 255, 0.22) 100%
          );
        }

        .astra-input-well:focus-within {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.92) 0%,
            rgba(224, 242, 254, 0.82) 50%,
            rgba(255, 255, 255, 0.92) 100%
          );
          border-color: #ffffff;
          box-shadow:
            0 0 16px rgba(56, 189, 248, 0.65),
            0 0 32px rgba(37, 99, 235, 0.32),
            inset 0 0 10px rgba(186, 230, 253, 0.5),
            inset 0 1px 2px #ffffff;
          transform: scale(1.015);
        }

        [data-theme="dark"] .astra-input-well:focus-within {
          background: linear-gradient(
            90deg,
            rgba(56, 189, 248, 0.26) 0%,
            rgba(37, 99, 235, 0.22) 50%,
            rgba(56, 189, 248, 0.28) 100%
          );
          box-shadow:
            0 0 18px rgba(56, 189, 248, 0.92),
            0 0 38px rgba(37, 99, 235, 0.55),
            inset 0 0 16px rgba(125, 211, 252, 0.55),
            inset 0 1px 2px #ffffff;
        }

        .astra-input-icon {
          position: absolute;
          left: 0.95rem;
          width: 28px;
          height: 28px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.94);
          color: #0284c7;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.25s ease;
        }

        [data-theme="dark"] .astra-input-icon {
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(255, 255, 255, 0.35);
          color: #ffffff;
        }

        .astra-input {
          width: 100%;
          height: 100%;
          padding: 0 2.8rem 0 3.25rem;
          border: 0;
          border-radius: 9999px;
          background: transparent;
          color: #0f2d5c;
          font-size: 0.9rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          outline: none;
        }

        [data-theme="dark"] .astra-input {
          color: #ffffff;
          text-shadow: 0 1px 4px rgba(6, 16, 38, 0.35);
        }

        .astra-input::placeholder {
          color: rgba(15, 45, 85, 0.48);
          font-weight: 500;
        }

        [data-theme="dark"] .astra-input::placeholder {
          color: rgba(255, 255, 255, 0.75);
        }

        .astra-eye-btn {
          position: absolute;
          right: 0.85rem;
          appearance: none;
          border: 0;
          background: transparent;
          color: #0284c7;
          width: 30px;
          height: 30px;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        [data-theme="dark"] .astra-eye-btn {
          color: rgba(255, 255, 255, 0.85);
        }

        .astra-login-options {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          padding: 0.1rem 0.35rem;
        }

        .astra-remember-label {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.78rem;
          font-weight: 600;
          color: rgba(15, 45, 85, 0.85);
          cursor: pointer;
          user-select: none;
        }

        [data-theme="dark"] .astra-remember-label {
          color: rgba(255, 255, 255, 0.92);
          text-shadow: 0 1px 4px rgba(6, 16, 38, 0.35);
        }

        .astra-remember-label input {
          appearance: none;
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 4px;
          border: 1.5px solid rgba(15, 45, 85, 0.35);
          background: rgba(255, 255, 255, 0.65);
          cursor: pointer;
          display: grid;
          place-content: center;
          transition: all 0.2s ease;
        }

        [data-theme="dark"] .astra-remember-label input {
          border-color: rgba(255, 255, 255, 0.78);
          background: rgba(255, 255, 255, 0.14);
        }

        .astra-remember-label input:checked {
          background: linear-gradient(135deg, #38bdf8, #2563eb);
          border-color: #ffffff;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.7);
        }

        .astra-remember-label input:checked::before {
          content: "✓";
          color: #ffffff;
          font-size: 0.68rem;
          font-weight: 900;
          line-height: 1;
        }

        .astra-dest-tag {
          font-size: 0.76rem;
          font-weight: 600;
          color: rgba(15, 45, 85, 0.85);
          text-decoration: underline;
          text-underline-offset: 3px;
          text-decoration-color: rgba(15, 45, 85, 0.45);
        }

        [data-theme="dark"] .astra-dest-tag {
          color: rgba(255, 255, 255, 0.92);
          text-decoration-color: rgba(255, 255, 255, 0.55);
          text-shadow: 0 1px 4px rgba(6, 16, 38, 0.35);
        }

        .astra-login-alert {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.65rem 1rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          background: rgba(244, 63, 94, 0.42);
          border: 1px solid rgba(255, 180, 195, 0.82);
          color: #ffffff;
          box-shadow: 0 0 20px rgba(244, 63, 94, 0.35);
        }

        /* =========================================================================
           ACTIVE SESSION GLASSMORPHISM CARD (High-End Identity Console)
           ========================================================================= */
        .astra-active-session-box {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          padding: 1rem 1.15rem;
          border-radius: 24px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.65) 0%,
            rgba(240, 249, 255, 0.45) 50%,
            rgba(224, 242, 254, 0.55) 100%
          );
          border: 1.2px solid rgba(255, 255, 255, 0.95);
          box-shadow:
            0 12px 30px -6px rgba(12, 45, 90, 0.12),
            0 2px 8px rgba(56, 189, 248, 0.10),
            inset 0 1.5px 2px #ffffff;
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          margin-bottom: 0.85rem;
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        [data-theme="dark"] .astra-active-session-box {
          background: linear-gradient(
            135deg,
            rgba(18, 38, 70, 0.62) 0%,
            rgba(14, 28, 56, 0.45) 50%,
            rgba(12, 22, 46, 0.60) 100%
          );
          border-color: rgba(56, 189, 248, 0.38);
          box-shadow:
            0 16px 36px rgba(0, 0, 0, 0.45),
            0 0 20px rgba(56, 189, 248, 0.15),
            inset 0 1px 1px rgba(255, 255, 255, 0.30);
        }

        .astra-session-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .astra-session-user-info {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          min-width: 0;
        }

        .astra-session-avatar {
          width: 36px;
          height: 36px;
          min-width: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
          border: 1.5px solid rgba(255, 255, 255, 0.90);
          box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-weight: 800;
          font-size: 0.82rem;
          text-transform: uppercase;
          position: relative;
        }

        .astra-session-avatar-dot {
          position: absolute;
          bottom: -1px;
          right: -1px;
          width: 10px;
          height: 10px;
          background: #10b981;
          border: 2px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 8px #10b981;
        }

        [data-theme="dark"] .astra-session-avatar-dot {
          border-color: #0f172a;
        }

        .astra-session-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .astra-session-status-tag {
          font-size: 0.64rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #0284c7;
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        [data-theme="dark"] .astra-session-status-tag {
          color: #38bdf8;
        }

        .astra-session-email {
          font-size: 0.82rem;
          font-weight: 700;
          color: #0f2d5c;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        [data-theme="dark"] .astra-session-email {
          color: #ffffff;
        }

        .astra-session-logout-btn {
          appearance: none;
          display: inline-flex;
          align-items: center;
          gap: 0.32rem;
          padding: 0.32rem 0.72rem;
          border-radius: 9999px;
          font-size: 0.68rem;
          font-weight: 700;
          color: #0369a1;
          background: rgba(255, 255, 255, 0.65);
          border: 1px solid rgba(2, 132, 199, 0.28);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          cursor: pointer;
          transition: all 0.22s cubic-bezier(0.22, 1, 0.36, 1);
          white-space: nowrap;
        }

        [data-theme="dark"] .astra-session-logout-btn {
          color: #e0f2fe;
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.28);
        }

        .astra-session-logout-btn:hover {
          background: #ffffff;
          color: #0284c7;
          border-color: #38bdf8;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(56, 189, 248, 0.25);
        }

        [data-theme="dark"] .astra-session-logout-btn:hover {
          background: rgba(56, 189, 248, 0.25);
          color: #ffffff;
          border-color: #38bdf8;
        }

        .astra-session-continue-btn {
          position: relative;
          width: 100%;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.55rem;
          border-radius: 9999px;
          border: 1.2px solid rgba(255, 255, 255, 0.55);
          background:
            radial-gradient(ellipse at 50% -20%, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0.08) 55%, transparent 80%),
            linear-gradient(135deg, #0284c7 0%, #2563eb 50%, #1d4ed8 100%);
          color: #ffffff;
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 0.015em;
          text-shadow: 0 1px 2px rgba(10, 25, 60, 0.45);
          cursor: pointer;
          box-shadow:
            0 8px 22px -4px rgba(37, 99, 235, 0.42),
            inset 0 1.5px 2px rgba(255, 255, 255, 0.65);
          transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
          overflow: hidden;
        }

        .astra-session-continue-btn:hover {
          transform: translateY(-1px) scale(1.015);
          box-shadow:
            0 12px 28px -4px rgba(37, 99, 235, 0.58),
            0 0 20px rgba(56, 189, 248, 0.45),
            inset 0 2px 2px #ffffff;
        }

        .astra-session-continue-btn:active {
          transform: scale(0.985);
        }

        .astra-session-divider {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin: 0.25rem 0 0.85rem;
          color: rgba(15, 45, 92, 0.55);
          font-size: 0.70rem;
          font-weight: 600;
        }

        [data-theme="dark"] .astra-session-divider {
          color: rgba(255, 255, 255, 0.45);
        }

        .astra-session-divider::before,
        .astra-session-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(15, 45, 92, 0.12), transparent);
        }

        [data-theme="dark"] .astra-session-divider::before,
        [data-theme="dark"] .astra-session-divider::after {
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
        }

        /* Sophisticated Sapphire Acrylic Pill Login Button (Refined crystal styling, no harsh neon) */
        .astra-glass-submit {
          position: relative;
          width: 100%;
          height: 52px;
          margin-top: 0.25rem;
          padding: 0 1.5rem;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.40);
          background:
            radial-gradient(ellipse at 50% -20%, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.08) 55%, transparent 80%),
            linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #1e40af 100%);
          color: #ffffff;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.015em;
          text-shadow: 0 1px 3px rgba(10, 25, 60, 0.45);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.55rem;
          box-shadow:
            0 8px 22px -4px rgba(29, 78, 216, 0.35),
            0 2px 6px rgba(15, 23, 42, 0.12),
            inset 0 1.5px 1px rgba(255, 255, 255, 0.55),
            inset 0 -2px 4px rgba(10, 25, 60, 0.30);
          transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.28s ease, border-color 0.28s ease;
          overflow: hidden;
        }

        .astra-glass-card[data-platform="yaxsell"] .astra-glass-submit {
          background:
            radial-gradient(ellipse at 50% -20%, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.08) 55%, transparent 80%),
            linear-gradient(135deg, #6d28d9 0%, #7c3aed 50%, #5b21b6 100%);
          box-shadow:
            0 8px 22px -4px rgba(109, 40, 217, 0.35),
            0 2px 6px rgba(15, 23, 42, 0.12),
            inset 0 1.5px 1px rgba(255, 255, 255, 0.55),
            inset 0 -2px 4px rgba(45, 10, 80, 0.30);
        }

        /* Fluid Liquid Light Shimmer Sweep across the button */
        .astra-glass-submit::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: linear-gradient(
            105deg,
            transparent 20%,
            rgba(255, 255, 255, 0.0) 35%,
            rgba(255, 255, 255, 0.32) 50%,
            rgba(255, 255, 255, 0.0) 65%,
            transparent 80%
          );
          transform: translateX(-120%);
          will-change: transform, opacity;
          animation: astra-submit-shimmer 4.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          pointer-events: none;
        }

        @keyframes astra-submit-shimmer {
          0%, 25% {
            transform: translateX(-120%);
            opacity: 0;
          }
          32% {
            opacity: 1;
          }
          62% {
            transform: translateX(120%);
            opacity: 1;
          }
          68%, 100% {
            transform: translateX(120%);
            opacity: 0;
          }
        }

        /* Subtle ambient breathing depth inside button core */
        .astra-glass-submit::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: radial-gradient(ellipse at 50% 50%, rgba(255, 255, 255, 0.16) 0%, transparent 70%);
          opacity: 0.4;
          will-change: opacity, transform;
          animation: astra-submit-breath 4s ease-in-out infinite alternate;
          pointer-events: none;
        }

        @keyframes astra-submit-breath {
          0% {
            opacity: 0.25;
            transform: scale(0.96);
          }
          100% {
            opacity: 0.65;
            transform: scale(1.04);
          }
        }

        .astra-glass-submit:hover:not(:disabled),
        .astra-glass-submit:focus-visible:not(:disabled) {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.70);
          box-shadow:
            0 12px 28px -4px rgba(29, 78, 216, 0.42),
            0 4px 12px rgba(37, 99, 235, 0.22),
            inset 0 1.5px 2px rgba(255, 255, 255, 0.70);
        }

        .astra-glass-card[data-platform="yaxsell"] .astra-glass-submit:hover:not(:disabled),
        .astra-glass-card[data-platform="yaxsell"] .astra-glass-submit:focus-visible:not(:disabled) {
          box-shadow:
            0 12px 28px -4px rgba(109, 40, 217, 0.42),
            0 4px 12px rgba(124, 58, 237, 0.22),
            inset 0 1.5px 2px rgba(255, 255, 255, 0.70);
        }

        .astra-glass-submit:active:not(:disabled) {
          transform: translateY(1px) scale(0.985);
          box-shadow:
            0 4px 12px -2px rgba(29, 78, 216, 0.30),
            inset 0 2px 4px rgba(10, 25, 60, 0.30);
        }

        .astra-glass-submit:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none !important;
        }



        /* =========================================================================
           BOTTOM-RIGHT DOCK: THEME TOGGLE & CIRCULAR LIQUID FROSTED GLASS REPLAY
           ========================================================================= */
        .astra-corner-dock {
          position: fixed;
          bottom: max(1rem, env(safe-area-inset-bottom));
          right: 1.25rem;
          z-index: 10;
          display: flex;
          align-items: center;
          gap: 0.55rem;
          pointer-events: auto;
        }

        /* 1. Theme Toggle with clearly differentiated Icon Well & Typography */
        .astra-theme-toggle {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.35rem 0.95rem 0.35rem 0.45rem;
          border-radius: 9999px;
          cursor: pointer;
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1.5px solid rgba(255, 255, 255, 0.92);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(235, 245, 255, 0.75) 100%);
          color: #554e60;
          box-shadow:
            0 10px 24px -2px rgba(56, 189, 248, 0.25),
            0 4px 10px rgba(12, 38, 75, 0.08),
            inset 0 1.5px 2px #ffffff;
          transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.25s ease, color 0.25s ease;
          overflow: hidden;
        }

        .astra-theme-toggle::before {
          content: "";
          position: absolute;
          top: 1.5px;
          left: 4px;
          right: 4px;
          height: 40%;
          border-radius: 9999px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.35) 50%, transparent 100%);
          pointer-events: none;
          z-index: 2;
        }

        .astra-dock-icon {
          position: relative;
          z-index: 3;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 2px 6px rgba(12, 38, 75, 0.12), inset 0 1px 1px #ffffff;
          font-size: 0.85rem;
          line-height: 1;
        }

        .astra-dock-label {
          position: relative;
          z-index: 3;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #554e60;
          text-shadow: 0 1px 1px rgba(255, 255, 255, 0.85);
        }

        .astra-theme-toggle:hover {
          transform: translateY(-2px) scale(1.03);
          box-shadow:
            0 14px 30px -2px rgba(56, 189, 248, 0.4),
            0 6px 14px rgba(12, 38, 75, 0.12),
            inset 0 1.5px 2px #ffffff;
          color: #383042;
        }

        /* Night theme styling for theme toggle */
        [data-theme="dark"] .astra-theme-toggle {
          background: linear-gradient(180deg, rgba(28, 38, 62, 0.85) 0%, rgba(14, 20, 35, 0.92) 100%);
          border-color: rgba(255, 255, 255, 0.22);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.25);
          color: #ffffff;
        }

        [data-theme="dark"] .astra-theme-toggle::before {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.08) 50%, transparent 100%);
        }

        [data-theme="dark"] .astra-dock-icon {
          background: rgba(255, 255, 255, 0.12);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.25);
        }

        [data-theme="dark"] .astra-dock-label {
          color: #ffffff;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
        }

        /* 2. Circular Liquid Frosted Glass Replay Button (Matches user reference image 1:1) */
        .astra-replay-btn,
        .astra-replay {
          position: relative;
          width: 44px;
          height: 44px;
          padding: 0;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          overflow: hidden;
          background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.96) 0%, rgba(240, 246, 255, 0.78) 55%, rgba(215, 235, 255, 0.65) 100%);
          border: 1.5px solid rgba(255, 255, 255, 0.95);
          box-shadow:
            0 10px 24px -2px rgba(56, 189, 248, 0.28),
            0 4px 10px rgba(12, 38, 75, 0.08),
            inset 0 2px 3px rgba(255, 255, 255, 0.98),
            inset 0 -2px 5px rgba(147, 197, 253, 0.45);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          color: #554e60; /* Soft muted lavender-gray from user arrow reference */
          transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.25s ease, color 0.25s ease;
        }

        .astra-replay-btn::before,
        .astra-replay::before {
          content: "";
          position: absolute;
          top: 2px;
          left: 6px;
          right: 6px;
          height: 42%;
          border-radius: 50% 50% 38% 38%;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.45) 50%, transparent 100%);
          pointer-events: none;
          z-index: 2;
        }

        .astra-replay-btn svg,
        .astra-replay svg {
          position: relative;
          z-index: 3;
          transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .astra-replay-btn:hover,
        .astra-replay:hover {
          transform: translateY(-2px) scale(1.05);
          box-shadow:
            0 14px 30px -2px rgba(56, 189, 248, 0.45),
            0 6px 14px rgba(12, 38, 75, 0.12),
            inset 0 2px 3px #ffffff;
          color: #383042;
        }

        .astra-replay-btn:hover svg,
        .astra-replay:hover svg {
          transform: rotate(180deg);
        }

        .astra-replay-btn:active,
        .astra-replay:active {
          transform: scale(0.94);
        }

        /* Night theme styling for replay button */
        [data-theme="dark"] .astra-replay-btn,
        [data-theme="dark"] .astra-replay {
          background: radial-gradient(circle at 35% 30%, rgba(35, 45, 70, 0.85) 0%, rgba(18, 26, 45, 0.7) 60%, rgba(10, 16, 30, 0.85) 100%);
          border: 1.5px solid rgba(255, 255, 255, 0.28);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), inset 0 1.5px 2px rgba(255, 255, 255, 0.35);
          color: rgba(255, 255, 255, 0.9);
        }

        [data-theme="dark"] .astra-replay-btn::before,
        [data-theme="dark"] .astra-replay::before {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%);
        }

        /* Keep the 3D login stage and its floating pieces inside shorter viewports. */
        @media (max-height: 780px) {
          .astra-login-stage {
            --rig-scale: 0.86;
          }
        }

        @media (max-height: 640px) {
          .astra-login-stage {
            --rig-scale: 0.72;
          }
        }

        @media (max-width: 480px) {
          .astra-morphism-rig {
            max-width: calc(100vw - 2rem);
          }

          .morphism-cube-tr { right: -28px; --cube-size: 42px; }
          .morphism-cube-br { right: -24px; bottom: -8px; --cube-size: 54px; }
          .morphism-cube-bl { left: -44px; }
          .morphism-cube-far-tr { right: -44px; }
          .morphism-orb-tl { left: -24px; width: 58px; height: 58px; }
          .morphism-orb-bl { left: -32px; width: 60px; height: 60px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .astra-morphism-rig,
          .morphism-orb,
          .morphism-cube-wrap,
          .morphism-shard,
          .morphism-sparkle,
          .astra-glass-submit::before,
          .astra-glass-submit::after {
            animation: none !important;
          }
        }

        .astra-loading-screen {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 1.25rem;
          background: rgba(232, 243, 255, 0.38);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          opacity: 1;
          visibility: visible;
          transition: opacity 220ms ease, visibility 220ms ease;
        }

        .astra-loading-screen[data-ready="true"] {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }

        .astra-loading-card {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          min-width: min(270px, calc(100vw - 2.5rem));
          padding: 1rem 1.15rem;
          border: 1px solid rgba(255, 255, 255, 0.9);
          border-radius: 1.1rem;
          background: rgba(255, 255, 255, 0.78);
          box-shadow: 0 16px 42px rgba(35, 81, 133, 0.15), inset 0 1px 0 #fff;
          color: #1e3a5f;
        }

        .astra-loading-icon-wrap {
          display: grid;
          place-items: center;
          width: 2.65rem;
          height: 2.65rem;
          flex: 0 0 auto;
          border: 1px solid rgba(59, 130, 246, 0.16);
          border-radius: 0.85rem;
          background: linear-gradient(145deg, #fff, #e8f3ff);
          color: #2877d4;
        }

        .astra-loading-spinner {
          animation: astra-loading-spin 850ms linear infinite;
        }

        .astra-loading-copy {
          display: grid;
          gap: 0.12rem;
          font-size: 0.92rem;
          font-weight: 750;
          letter-spacing: -0.01em;
        }

        .astra-loading-copy small {
          color: #6b819e;
          font-size: 0.76rem;
          font-weight: 500;
        }

        @keyframes astra-loading-spin {
          to { transform: rotate(360deg); }
        }

        /* Preserve the original composition; only reduce its blur cost in light mode. */
        .astra-login-root[data-performance-mode="light"] .astra-glass-card {
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .astra-login-root[data-performance-mode="light"] .astra-input-well,
        .astra-login-root[data-performance-mode="light"] .astra-active-session-box {
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }

        .astra-login-root[data-performance-mode="light"] .astra-drag-surface {
          pointer-events: none;
          cursor: default;
        }

        .astra-login-root[data-performance-mode="light"] .astra-morphism-rig,
        .astra-login-root[data-performance-mode="light"] .morphism-orb,
        .astra-login-root[data-performance-mode="light"] .morphism-cube-wrap,
        .astra-login-root[data-performance-mode="light"] .morphism-shard,
        .astra-login-root[data-performance-mode="light"] .morphism-sparkle {
          animation-play-state: paused !important;
        }

        .astra-login-root[data-performance-mode="light"] .morphism-shard {
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          will-change: auto;
        }

        .astra-login-root[data-performance-mode="light"] .morphism-shard-anchor,
        .astra-login-root[data-performance-mode="light"] .morphism-sparkle {
          will-change: auto;
        }

        .astra-quality-toggle {
          position: fixed;
          top: max(1rem, env(safe-area-inset-top));
          right: max(1rem, env(safe-area-inset-right));
          z-index: 130;
          display: inline-flex;
          align-items: center;
          gap: 0.7rem;
          min-height: 48px;
          padding: 0.45rem 0.55rem 0.45rem 0.8rem;
          border: 1px solid rgba(255, 255, 255, 0.9);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.9);
          color: #234b78;
          box-shadow: 0 8px 24px rgba(39, 82, 132, 0.13), inset 0 1px 0 #fff;
          cursor: pointer;
          font: inherit;
          transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .astra-quality-toggle:hover {
          border-color: #9bc9ff;
          box-shadow: 0 10px 28px rgba(39, 82, 132, 0.19), inset 0 1px 0 #fff;
        }

        .astra-quality-toggle-copy {
          display: grid;
          gap: 0.05rem;
          text-align: left;
          line-height: 1.1;
        }

        .astra-quality-toggle-copy strong {
          font-size: 0.78rem;
          font-weight: 850;
          letter-spacing: -0.015em;
        }

        .astra-quality-toggle-copy small {
          color: #7286a0;
          font-size: 0.65rem;
          font-weight: 650;
        }

        .astra-quality-toggle-track {
          position: relative;
          display: block;
          width: 42px;
          height: 24px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: #c8d5e5;
          box-shadow: inset 0 1px 3px rgba(26, 48, 77, 0.16);
          transition: background-color 160ms ease;
        }

        .astra-quality-toggle-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 4px rgba(15, 35, 60, 0.24);
          transition: transform 160ms ease;
        }

        .astra-quality-toggle[aria-pressed="true"] .astra-quality-toggle-track {
          background: #1674d1;
        }

        .astra-quality-toggle[aria-pressed="true"] .astra-quality-toggle-thumb {
          transform: translateX(18px);
        }

        @media (max-width: 768px) {
          .astra-quality-toggle { display: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .astra-loading-screen { transition-duration: 0ms; }
          .astra-loading-spinner { animation: none; }
        }

      `}</style>
    ),
    []
  );

  const platformTitleSpans = React.useMemo(() => buildAnimatedSpans('PLATAFORMA', 'center'), [animKey]);
  const erpTitleSpans = React.useMemo(() => buildAnimatedSpans('ERP / POS', 'left'), [animKey]);
  const yaxsellTitleSpans = React.useMemo(() => buildAnimatedSpans('WEB', 'right'), [animKey]);
  const asistoraMobileSpans = React.useMemo(() => buildAnimatedSpans('ASISTORA', 'center'), [animKey]);

  return (
    <div
      className="astra-login-root"
      data-performance-mode={qualityMode === 'promax' ? 'promax' : 'light'}
    >
      {styleElement}

      {(qualityMode === 'light' || qualityMode === 'promax') && (
        <button
          type="button"
          className="astra-quality-toggle"
          onClick={toggleQualityMode}
          aria-pressed={qualityMode === 'promax'}
          aria-label={qualityMode === 'promax' ? 'Desactivar Max +++ y usar modo ligero' : 'Activar Max +++'}
          title="La elección se guarda en este navegador"
        >
          <Sparkles size={17} aria-hidden="true" />
          <span className="astra-quality-toggle-copy">
            <strong>Max +++</strong>
            <small>{qualityMode === 'promax' ? 'Activado' : 'Modo ligero'}</small>
          </span>
          <span className="astra-quality-toggle-track" aria-hidden="true">
            <span className="astra-quality-toggle-thumb" />
          </span>
        </button>
      )}

      <div
        className="astra-loading-screen"
        data-ready={visualReady}
        role="status"
        aria-live="polite"
        aria-hidden={visualReady}
      >
        <div className="astra-loading-card">
          <span className="astra-loading-icon-wrap" aria-hidden="true">
            <Loader2 className="astra-loading-spinner" size={21} strokeWidth={2.3} />
          </span>
          <span className="astra-loading-copy">
            Preparando el acceso
            <small>Cargando tu plataforma</small>
          </span>
        </div>
      </div>

      {/* Fixed WebGL Volumetric Sky & 3D Starfield Backdrop */}
      <div
        className="astra-backdrop"
        data-astra-backdrop="true"
        data-astra-active={qualityMode ? 'true' : 'false'}
      >
        <div className="astra-scene" data-astra-scene="ready">
          {qualityMode !== null && (
            <canvas key={qualityMode} id="astra-canvas" data-astra-canvas="true" aria-hidden="true" />
          )}
        </div>
        <div id="astra-ambient" className="astra-ambient-backdrop" />
        <div className="astra-vignette" />
      </div>

      {/* Hero Interactive Side Triggers: ERP / POS & WEB with top-center PLATAFORMA */}
      <div id="astra-chrome" className="astra-fixed-chrome" data-hidden="false">
        {/* Top-Center Header: PLATAFORMA */}
        <div className="astra-top-header" key={`top-platform-${animKey}`}>
          <span className="astra-top-label">{platformTitleSpans}</span>
          <span className="astra-top-sub-bar" />
        </div>

        {/* Mobile-Only Grand White Brand Title Under 3D Core Logo */}
        <div className="astra-mobile-logo-brand" key={`mobile-brand-${animKey}`} aria-label="ASISTORA">
          <span className="astra-mobile-brand-title">{asistoraMobileSpans}</span>
          <span className="astra-mobile-brand-bar" aria-hidden="true" />
        </div>

        {!WEB_ONLY && <button
          type="button"
          onClick={() => scrollToLoginSection('erp')}
          className="astra-side-trigger astra-side-trigger-left"
          title="Iniciar sesión en ERP / POS"
        >
          <span className="astra-label" key={`erp-label-${animKey}`}>{erpTitleSpans}</span>
          <span className="astra-side-badge">
            <span className="astra-side-badge-dot" />
            <span className="astra-badge-text">Entrar a ERP / POS ↓</span>
            <svg
              className="astra-login-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(10, 20, 45, 0.45))' }}
              aria-label="Icono ERP / POS"
            >
              {/* POS Terminal Screen */}
              <rect x="3" y="2" width="18" height="13" rx="2" />
              <path d="M7 6h10M7 9h6" />
              {/* POS Cash Drawer / Base */}
              <path d="M2 17h20v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4z" />
              <circle cx="12" cy="19.5" r="1" fill="#ffffff" />
            </svg>
          </span>
        </button>}

        <button
          type="button"
          onClick={() => scrollToLoginSection('yaxsell')}
          className="astra-side-trigger astra-side-trigger-right"
          title="Iniciar sesión en Web"
        >
          <span className="astra-label" key={`yaxsell-label-${animKey}`}>{yaxsellTitleSpans}</span>
          <span className="astra-side-badge">
            <span className="astra-side-badge-dot" />
            <span className="astra-badge-text">Entrar a Web ↓</span>
            <svg
              className="astra-login-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(10, 20, 45, 0.45))' }}
              aria-label="Icono Web"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </span>
        </button>

        <button
          type="button"
          onClick={() => scrollToLoginSection(platform)}
          className="astra-scroll-cue"
        >
          <span>{WEB_ONLY ? 'Desliza hacia abajo para iniciar sesión' : 'Desliza hacia abajo o selecciona tu plataforma'}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(10, 20, 45, 0.45))' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Scrolled-Down 3D Glassmorphism Login Window (Exact replica of login.mp4) */}
      <div
        id="astra-login-stage"
        className="astra-login-stage"
        data-interactive="false"
      >
        <div
          ref={morphismRigRef}
          id="astra-morphism-rig"
          className="astra-morphism-rig"
        >
          {/* Orbiting 3D Frosted Glass Spheres (Scroll-Assembled Anchors + Floating Orbs) */}
          <div className="morphism-orb-anchor morphism-orb-tl" aria-hidden="true">
            <div className="morphism-orb" />
          </div>
          <div className="morphism-orb-anchor morphism-orb-bl" aria-hidden="true">
            <div className="morphism-orb" />
          </div>

          {/* Orbiting 6-Faced 3D Translucent Crystal Cubes (Scroll-Assembled Anchors + Floating 3D Cubes) */}
          <div className="morphism-cube-anchor morphism-cube-tr" aria-hidden="true">
            <div className="morphism-cube-wrap">
              <div className="morphism-cube-face front" />
              <div className="morphism-cube-face back" />
              <div className="morphism-cube-face right" />
              <div className="morphism-cube-face left" />
              <div className="morphism-cube-face top" />
              <div className="morphism-cube-face bottom" />
            </div>
          </div>

          <div className="morphism-cube-anchor morphism-cube-br" aria-hidden="true">
            <div className="morphism-cube-wrap">
              <div className="morphism-cube-face front" />
              <div className="morphism-cube-face back" />
              <div className="morphism-cube-face right" />
              <div className="morphism-cube-face left" />
              <div className="morphism-cube-face top" />
              <div className="morphism-cube-face bottom" />
            </div>
          </div>

          <div className="morphism-cube-anchor morphism-cube-bl" aria-hidden="true">
            <div className="morphism-cube-wrap">
              <div className="morphism-cube-face front" />
              <div className="morphism-cube-face back" />
              <div className="morphism-cube-face right" />
              <div className="morphism-cube-face left" />
              <div className="morphism-cube-face top" />
              <div className="morphism-cube-face bottom" />
            </div>
          </div>

          <div className="morphism-cube-anchor morphism-cube-far-tr" aria-hidden="true">
            <div className="morphism-cube-wrap">
              <div className="morphism-cube-face front" />
              <div className="morphism-cube-face back" />
              <div className="morphism-cube-face right" />
              <div className="morphism-cube-face left" />
              <div className="morphism-cube-face top" />
              <div className="morphism-cube-face bottom" />
            </div>
          </div>

          {/* Dynamic Floating Glass Particles & Prismatic Crystal Shards (Scroll-assembled + Continuous fluid drift) */}
          <div className="morphism-shard-anchor shard-a1" aria-hidden="true"><div className="morphism-shard s1" /></div>
          <div className="morphism-shard-anchor shard-a2" aria-hidden="true"><div className="morphism-shard s2" /></div>
          <div className="morphism-shard-anchor shard-a3" aria-hidden="true"><div className="morphism-shard s3" /></div>
          <div className="morphism-shard-anchor shard-a4" aria-hidden="true"><div className="morphism-shard s4" /></div>
          <div className="morphism-shard-anchor shard-a5" aria-hidden="true"><div className="morphism-shard s5" /></div>
          <div className="morphism-shard-anchor shard-a6" aria-hidden="true"><div className="morphism-shard s6" /></div>
          <div className="morphism-shard-anchor shard-a7" aria-hidden="true"><div className="morphism-shard s7" /></div>
          <div className="morphism-shard-anchor shard-a8" aria-hidden="true"><div className="morphism-shard s8" /></div>
          {/* Twinkling crystalline micro-sparkles */}
          <div className="morphism-shard-anchor shard-sp1" aria-hidden="true"><div className="morphism-sparkle sp1" /></div>
          <div className="morphism-shard-anchor shard-sp2" aria-hidden="true"><div className="morphism-sparkle sp2" /></div>
          <div className="morphism-shard-anchor shard-sp3" aria-hidden="true"><div className="morphism-sparkle sp3" /></div>
          <div className="morphism-shard-anchor shard-sp4" aria-hidden="true"><div className="morphism-sparkle sp4" /></div>

          {/* Main 3D Extruded Acrylic Glass Slab */}
          <div
            ref={glassCardRef}
            className="astra-glass-card"
            data-platform={platform}
          >
            {/* 3D Physical Glass Thickness Layers */}
            <div className="astra-glass-slab-edge" aria-hidden="true" />
            <div className="astra-glass-slab-edge-mid" aria-hidden="true" />
            <div className="astra-glass-sheen" aria-hidden="true" />

            <div className="astra-glass-inner">
              <div className="astra-glass-topbar">
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="astra-back-top-btn"
                  title="Subir al inicio"
                  aria-label="Subir al inicio"
                >
                  <ArrowUp size={13} strokeWidth={2.4} />
                  <span>Subir</span>
                </button>
              </div>

              {/* Centered Header & Platform Morphism Switcher */}
              <div className="astra-login-header">
                <p className="astra-login-subtitle">
                  {WEB_ONLY ? 'Accede al panel de tu tienda web' : 'Selecciona tu plataforma de acceso'}
                </p>

                {!WEB_ONLY && <div
                  className="astra-platform-switcher"
                  role="tablist"
                  aria-label="Seleccionar plataforma de destino"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={platform === 'erp'}
                    data-selected={platform === 'erp'}
                    onClick={() => {
                      setPlatform('erp');
                      setError('');
                    }}
                    className="astra-platform-tab"
                  >
                    <span>ERP / POS</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={platform === 'yaxsell'}
                    data-selected={platform === 'yaxsell'}
                    onClick={() => {
                      setPlatform('yaxsell');
                      setError('');
                    }}
                    className="astra-platform-tab"
                  >
                    <span>WEB</span>
                  </button>
                </div>}
              </div>

              {!configured && (
                <div className="astra-login-alert" style={{ marginBottom: '0.85rem' }}>
                  <AlertCircle size={16} />
                  <span>Verifica las variables de entorno Firebase en el servidor.</span>
                </div>
              )}

              {/* Quick Launch if already logged in */}
              {hasActiveSession && activeUser?.email && (
                <>
                  <div className="astra-active-session-box">
                    <div className="astra-session-header-row">
                      <div className="astra-session-user-info">
                        <div className="astra-session-avatar">
                          <span>{activeUser.email.charAt(0).toUpperCase()}</span>
                          <span className="astra-session-avatar-dot" aria-hidden="true" />
                        </div>
                        <div className="astra-session-meta">
                          <span className="astra-session-status-tag">
                            Sesión activa
                          </span>
                          <span className="astra-session-email" title={activeUser.email}>
                            {activeUser.email}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => logout()}
                        className="astra-session-logout-btn"
                        title="Cambiar de usuario o cerrar sesión"
                      >
                        <LogOut size={12} />
                        <span>Cambiar</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleContinueActiveSession(platform)}
                      className="astra-session-continue-btn"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Accediendo...</span>
                        </>
                      ) : (
                        <>
                          <span>Continuar a {platform === 'erp' ? 'ERP / POS' : 'Plataforma Web'}</span>
                          <ArrowRight size={15} />
                        </>
                      )}
                    </button>
                  </div>

                  <div className="astra-session-divider">
                    <span>o accede con otra credencial</span>
                  </div>
                </>
              )}

              {/* Pill Capsule Credentials Form */}
              <form onSubmit={handleSubmit} className="astra-login-form" noValidate>
                {error && (
                  <div className="astra-login-alert">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="astra-field-group">
                  <div className="astra-input-well">
                    <span className="astra-input-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <input
                      ref={emailInputRef}
                      id="astra-email"
                      type="email"
                      required
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError('');
                      }}
                      placeholder="Correo corporativo"
                      className="astra-input"
                    />
                  </div>
                </div>

                <div className="astra-field-group">
                  <div className="astra-input-well">
                    <span className="astra-input-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                        <path d="M2 12h20" />
                      </svg>
                    </span>
                    <input
                      ref={passInputRef}
                      id="astra-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError('');
                      }}
                      onKeyUp={handleKeyModifier}
                      onKeyDown={handleKeyModifier}
                      placeholder="Contraseña"
                      className="astra-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="astra-eye-btn"
                      title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {capsLockActive && (
                    <span
                      style={{
                        color: '#fde047',
                        fontSize: '0.68rem',
                        padding: '0.25rem 0 0 0.85rem',
                        fontWeight: 700,
                      }}
                    >
                      ⚠ Bloq Mayús activado
                    </span>
                  )}
                </div>

                <div className="astra-login-options">
                  <label className="astra-remember-label">
                    <input
                      type="checkbox"
                      checked={rememberEmail}
                      onChange={(e) => setRememberEmail(e.target.checked)}
                    />
                    <span>Recordar sesión</span>
                  </label>
                </div>

                <button type="submit" disabled={isSubmitting} className="astra-glass-submit">
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Autenticando...</span>
                    </>
                  ) : (
                    <span>
                      {platform === 'erp'
                        ? 'Iniciar en ERP / POS'
                        : 'Iniciar en Plataforma Web'}
                    </span>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Invisible Scroll Track (drives native 3D starfield dispersion & cloud parallax) */}
      <div id="astra-scroll-track" className="astra-scroll-track" aria-hidden="true" />

      {/* Fullscreen Interactive Drag & Repel Surface */}
      <div
        id="astra-drag"
        className="astra-drag-surface"
        data-dragging="false"
        aria-label="Arrastra para rotar el campo estelar o haz scroll para expandir las estrellas"
      />

      {/* Bottom-right Theme & Circular Frosted Glass Replay Dock */}
      <div className="astra-corner-dock">
        <button
          type="button"
          onClick={toggleSkyTheme}
          className="astra-dock-btn astra-theme-toggle"
          title={theme === 'light' ? 'Cambiar a modo Noche' : 'Cambiar a modo Día'}
        >
          <span className="astra-dock-icon">{theme === 'light' ? '🌙' : '☀️'}</span>
          <span className="astra-dock-label">{theme === 'light' ? 'Noche' : 'Día'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setAnimKey((prev) => prev + 1);
            engineRef.current?.replayAnimation?.();
          }}
          className="astra-dock-btn astra-replay-btn"
          title="Repetir animación 3D"
          aria-label="Repetir animación 3D"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
