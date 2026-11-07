"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import CatalogoClient from "@/app/productos/CatalogoClient";
import Script from "next/script";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Gift,
  Heart,
  HelpCircle,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  Trophy,
  UserRound,
} from "lucide-react";
import { getServices, getFirebaseConfig, MEDIA_BUCKET_ID } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { useWebClientConfig } from "@/hooks/useWebClientConfig";
import { LoyaltyService } from "@/services/loyaltyService";
import PedidosMultiChannelSection from "@/components/cuenta/PedidosMultiChannelSection";
import OrdersCloudMascot from "@/components/admin/OrdersCloudMascot";
import styles from "./account.module.css";

const LINKS = [
  {
    icon: Heart,
    label: "Mis favoritos",
    detail: "Eso que te gustó",
    href: "/favoritos",
  },
  {
    icon: ShoppingCart,
    label: "Mi carrito",
    detail: "Retoma tu compra",
    href: "/carrito",
  },
  {
    icon: Ticket,
    label: "Mis cupones",
    detail: "Descuentos para ti",
    href: "/cuenta/cupones",
  },
  {
    icon: Gift,
    label: "Mis regalos",
    detail: "Descubre tus beneficios",
    href: "/cuenta/regalos",
  },
  {
    icon: MapPin,
    label: "Direcciones",
    detail: "Tus datos de entrega",
    href: "/cuenta/direcciones",
  },
  {
    icon: HelpCircle,
    label: "Centro de ayuda",
    detail: "Estamos para ayudarte",
    href: "/cuenta/tickets",
  },
  {
    icon: Trophy,
    label: "Mis niveles",
    detail: "Puntos y beneficios",
    href: "/cuenta/niveles",
  },
  {
    icon: MessageCircle,
    label: "Conversaciones",
    detail: "Retoma tus consultas",
    href: "/cuenta/conversaciones",
  },
];
const LEVEL_NAMES: Record<string, string> = {
  bronze: "Bronce",
  silver: "Plata",
  gold: "Oro",
  diamond: "Diamante",
  ruby: "Rubí",
};
function previewUrl(fileId: string) {
  const { endpoint, projectId } = getFirebaseConfig();
  return `${endpoint}/storage/buckets/${MEDIA_BUCKET_ID}/files/${fileId}/view?project=${projectId}`;
}

export default function CuentaPage() {
  return (
    <Suspense fallback={<div className={styles.loading} role="status"><Loader2 size={26} /><p>Preparando tu espacio…</p></div>}>
      <CuentaWrapper />
    </Suspense>
  );
}

function CuentaWrapper() {
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get("embed") === "1";

  if (!isEmbed) {
    return <CatalogoClient defaultHash="#/account" />;
  }

  return <ActualCuentaPage />;
}

function ActualCuentaPage() {
  const { user, isLoggedIn, isLoading, logout, loginWithGoogle } = useAuth();
  const { config: webConfig } = useWebClientConfig();
  const reduced = useReducedMotion();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [level, setLevel] = useState("bronze");
  const [syncedName, setSyncedName] = useState("");
  const rootRef = useRef<HTMLElement>(null);
  const mascotRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("customerName") || "";
      if (stored.trim()) setSyncedName(stored.trim());
    } catch {
      /* ignore */
    }

    const onNameUpdate = (e: any) => {
      const val = e.detail;
      if (typeof val === "string" && val.trim()) {
        setSyncedName(val.trim());
      }
    };
    window.addEventListener("customerNameUpdated", onNameUpdate);
    return () => window.removeEventListener("customerNameUpdated", onNameUpdate);
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !user?.id) {
      setAvatarUrl("");
      setCoverUrl("");
      setLevel("bronze");
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { account } = getServices();
        const details = await account.get();
        const prefs = (details as any)?.prefs || {};
        if (active) {
          setAvatarUrl(
            prefs.avatarFileId ? previewUrl(prefs.avatarFileId) : "",
          );
          setCoverUrl(prefs.coverFileId ? previewUrl(prefs.coverFileId) : "");
        }
        const loyalty = await LoyaltyService.getLoyaltyData(user.id);
        if (active) setLevel(loyalty?.currentLevel || "bronze");
      } catch (error) {
        console.error(
          "[Cuenta] No se pudieron cargar los datos del perfil:",
          error,
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [isLoggedIn, user?.id]);

  // The mascot follows the curtain into the header. The scene stops rendering offscreen.
  useEffect(() => {
    if (isLoading) return;
    const root = rootRef.current,
      mascot = mascotRef.current,
      slot = slotRef.current;
    if (!root || !mascot || !slot) return;
    let frame = 0;
    function update() {
      frame = 0;
      if (!root || !mascot || !slot) return;
      const progress = reduced
        ? window.scrollY > 160
          ? 1
          : 0
        : Math.min(1, Math.max(0, window.scrollY / 220));
      const ease = 1 - Math.pow(1 - progress, 3);
      const rect = slot.getBoundingClientRect();
      const x = rect.left + rect.width / 2 - 98;
      const y = rect.top + rect.height / 2 - 76;
      const endX = window.innerWidth - 90;
      const endY = 16;
      mascot.style.transform = `translate3d(${x + (endX - x) * ease}px, ${y + (endY - y) * ease}px, 0) scale(${1 - 0.53 * ease})`;
      mascot.dataset.ready = "true";
      root.dataset.docked = ease > 0.7 ? "true" : "false";
      root.style.setProperty("--scroll-progress", ease.toFixed(3));
      root.classList.toggle(styles.skyOffscreen, window.scrollY > 440);
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(slot);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [isLoading, reduced]);

  async function signIn() {
    setGoogleLoading(true);
    setGoogleError("");
    try {
      const result = await loginWithGoogle();
      if (!result.success)
        setGoogleError(
          result.error || "No se pudo iniciar sesión. Intenta nuevamente.",
        );
    } catch {
      setGoogleError("No pudimos conectar con Google. Intenta nuevamente.");
    } finally {
      setGoogleLoading(false);
    }
  }
  async function signOut() {
    await logout();
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      window.parent.location.hash = "#/";
      window.location.reload();
    } else {
      window.location.href = "/";
    }
  }
  function scrollToOrders() {
    document.getElementById("historial-pedidos")?.scrollIntoView({
      behavior: reduced ? "instant" : "smooth",
      block: "start",
    });
  }
  if (isLoading)
    return (
      <div className={styles.loading} role="status">
        <Loader2 size={26} />
        <p>Preparando tu espacio…</p>
      </div>
    );
  const guest = !isLoggedIn || !user;
  const rawFullName = (
    user?.name?.trim() ||
    syncedName.trim() ||
    (user?.email ? user.email.split("@")[0] : "")
  ).trim();

  const firstWord = rawFullName ? rawFullName.split(/\s+/)[0] : "";
  const firstName = firstWord
    ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1)
    : "";

  const name = user?.name?.trim() || syncedName.trim() || "Mi cuenta";
  const initials = (name.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, "").trim() || "DB")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <main ref={rootRef} className={styles.page} data-docked="false">
      <header className={styles.topbar}>
        <Link
          href="/productos"
          className={styles.back}
          aria-label="Volver al catálogo"
          onClick={(e) => {
            if (typeof window !== "undefined" && window.parent && window.parent !== window) {
              e.preventDefault();
              window.parent.location.hash = "#/";
            }
          }}
        >
          <ArrowLeft size={16} />
          <span>Volver al catálogo</span>
        </Link>
        <Link
          href="/"
          className={styles.brand}
          aria-label={`${webConfig.storeName}, inicio`}
          onClick={(e) => {
            if (typeof window !== "undefined" && window.parent && window.parent !== window) {
              e.preventDefault();
              window.parent.location.hash = "#/";
            }
          }}
        >
          {webConfig.logoUrl ? <img src={webConfig.logoUrl} alt={`Logo de ${webConfig.storeName}`} width={96} height={96} /> : <span className="text-sm font-bold text-slate-900">{webConfig.storeName.slice(0, 2).toUpperCase()}</span>}
        </Link>
        <button
          type="button"
          className={styles.orderJump}
          onClick={scrollToOrders}
        >
          <Package size={15} />
          <span>Mis pedidos</span>
        </button>
      </header>
      <div className={styles.sky} aria-hidden="true">
        <CoverArtwork />
      </div>
      <div className={styles.skySpacer} aria-hidden="true" />
      <div className={styles.curtain}>
        <div className={styles.intro}>
          <div className={styles.mascotSlot} ref={slotRef} aria-hidden="true" />
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
          >
            <span className={styles.welcome}>
              <span />
              Tu espacio {webConfig.storeName}
            </span>
            <h1>
              {firstName ? (
                <>Qué gusto verte, {firstName}.</>
              ) : (
                <>Comprar es solo el comienzo.</>
              )}
            </h1>
            <p>
              {firstName
                ? "Sigue tus compras y encuentra todo lo tuyo, en un mismo lugar."
                : "Tus pedidos, tus próximos favoritos y un equipo que te acompaña."}
            </p>
            <button
              type="button"
              className={styles.explore}
              onClick={scrollToOrders}
            >
              Vamos a tus pedidos <ArrowDown size={15} />
            </button>
          </motion.div>
        </div>
        <div className={styles.content}>
          <aside className={styles.accountRail}>
            {guest ? (
              <section
                className={styles.accessCard}
                aria-labelledby="access-title"
              >
                <div className={styles.accessIcon}>
                  <UserRound size={22} />
                  <span>
                    <Check size={10} />
                  </span>
                </div>
                <h2 id="access-title">Hazlo tuyo.</h2>
                <p>
                  Una cuenta, todas tus compras.
                  <br />Y más razones para volver.
                </p>
                <button
                  type="button"
                  className={styles.google}
                  disabled={googleLoading}
                  onClick={signIn}
                >
                  {googleLoading ? (
                    <Loader2 size={17} className={styles.spin} />
                  ) : (
                    <GoogleIcon />
                  )}
                  <span>Continuar con Google</span>
                  <ChevronRight size={15} />
                </button>
                {googleError && (
                  <p className={styles.error} role="alert">
                    {googleError}
                  </p>
                )}
                <div className={styles.authLinks}>
                  <Link href="/login">
                    <Mail size={14} /> Usar mi correo
                  </Link>
                  <Link href="/login?tab=register">
                    Crear cuenta <ArrowRight size={13} />
                  </Link>
                </div>
                <div className={styles.benefits}>
                  <span>
                    <Heart size={14} /> Guarda tus favoritos
                  </span>
                  <span>
                    <Package size={14} /> Reúne tus compras web
                  </span>
                  <span>
                    <Ticket size={14} /> Accede a tus beneficios
                  </span>
                </div>
                <p className={styles.privacy}>
                  <ShieldCheck size={12} /> Tus datos, en tu cuenta.
                </p>
              </section>
            ) : (
              <section
                className={styles.profileCard}
                aria-labelledby="profile-title"
              >
                <Link
                  href="/cuenta/perfil"
                  className={styles.profileCover}
                  aria-label="Editar portada"
                >
                  {coverUrl && <img src={coverUrl} alt="" />}
                  <Pencil size={13} />
                </Link>
                <div className={styles.profileBody}>
                  <Link
                    href="/cuenta/perfil"
                    className={styles.avatar}
                    aria-label="Editar foto de perfil"
                  >
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : initials}
                  </Link>
                  <h2 id="profile-title">{name}</h2>
                  <p className={styles.email}>{user?.email}</p>
                  <Link href="/cuenta/niveles" className={styles.level}>
                    <Trophy size={13} /> Nivel {LEVEL_NAMES[level] || "Bronce"}
                    <ChevronRight size={13} />
                  </Link>
                  <Link href="/cuenta/info" className={styles.profileInfo}>
                    <UserRound size={15} />
                    <span>
                      Mis datos personales
                      <small>{user?.phone || "Agregar teléfono"}</small>
                    </span>
                    <ChevronRight size={14} />
                  </Link>
                  <Link href="/cuenta/perfil" className={styles.profileInfo}>
                    <Pencil size={15} />
                    <span>Personalizar mi perfil</span>
                    <ChevronRight size={14} />
                  </Link>
                  <button
                    type="button"
                    className={styles.logout}
                    onClick={signOut}
                  >
                    <LogOut size={14} /> Cerrar sesión
                  </button>
                </div>
              </section>
            )}
            <Link href="/productos" className={styles.catalogCard}>
              <span className={styles.catalogDrawing} aria-hidden="true">
                <ShoppingBag size={32} strokeWidth={1.2} />
                <span>DB</span>
              </span>
              <div>
                <p>Tu próxima buena compra.</p>
                <span>
                  Explorar catálogo <ArrowRight size={15} />
                </span>
              </div>
            </Link>
          </aside>
          <section
            id="historial-pedidos"
            className={styles.orders}
            aria-label="Seguimiento de tus pedidos"
          >
            <PedidosMultiChannelSection />
          </section>
        </div>
        <section className={styles.shortcuts} aria-labelledby="shortcuts-title">
          <div className={styles.shortcutsHeading}>
            <h2 id="shortcuts-title">Más de tu mundo.</h2>
            <span>Todo a un toque</span>
          </div>
          <div className={styles.shortcutGrid}>
            {LINKS.map(({ icon: Icon, label, detail, href }) => (
              <Link
                key={href}
                href={href}
                className={styles.shortcut}
                onClick={(e) => {
                  if (typeof window !== "undefined" && window.parent && window.parent !== window) {
                    if (href === "/cuenta/favoritos" || href === "/favoritos") {
                      e.preventDefault();
                      window.parent.location.hash = "#/favorites";
                    } else if (href === "/carrito") {
                      e.preventDefault();
                      window.parent.postMessage({ type: "YAXSEL_OPEN_CART" }, "*");
                    }
                  }
                }}
              >
                <span className={styles.shortcutIcon}>
                  <Icon size={21} strokeWidth={1.6} />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
                <ArrowRight size={15} />
              </Link>
            ))}
          </div>
        </section>
        <footer className={styles.footer}>
          <span>
            {webConfig.storeName} <span>·</span> Cerca de ti, en cada compra.
          </span>
          {(webConfig.supportPhone || webConfig.botPhone) && <a
            href={`https://wa.me/${webConfig.supportPhone || webConfig.botPhone}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={14} /> Conversemos
          </a>}
        </footer>
      </div>
      <div className={styles.mascot} ref={mascotRef} aria-hidden="true">
        <OrdersCloudMascot variant="cover" />
      </div>
    </main>
  );
}

function CoverArtwork() {
  useEffect(() => {
    (
      window as Window & { mountVolumetricHero?: () => void }
    ).mountVolumetricHero?.();
  }, []);
  return (
    <>
      <div className={`${styles.skySurface} hero-sky-surface`}>
        <canvas className="hero-sky-canvas" data-sky="account" />
        <div className="hero-sky-shade" />
      </div>
      <Script
        src="/shopify/catalogo-original/hero-sky.js?v=20261022_argon_volumetric_sky"
        strategy="afterInteractive"
        onReady={() =>
          (
            window as Window & { mountVolumetricHero?: () => void }
          ).mountVolumetricHero?.()
        }
      />
    </>
  );
}
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
