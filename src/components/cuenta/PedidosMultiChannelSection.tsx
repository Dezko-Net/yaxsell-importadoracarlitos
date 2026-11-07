"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Globe2,
  HelpCircle,
  Info,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Truck,
  User,
  X,
} from "lucide-react";
import { formatPrice } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { getOrderAutoCancelDeadline } from "@/lib/order-expiration";
import styles from "./OrderJourney.module.css";

type RawOrder = Record<string, any>;

type Order = {
  id: string;
  code: string;
  status: string;
  total: number;
  subtotal: number;
  discount: number;
  shippingCost: number;
  date: number;
  store: string;
  channels: string[];
  items: RawOrder[];
  agency: string;
  tracking: string;
  proof: string;
  deadline: number;
  shippingAddress: string;
  shippingCity: string;
  shippingRegion: string;
  shippingMethod: string;
  customerName: string;
  customerPhone: string;
};

type Filter = "all" | "active" | "attention" | "closed";

const CLOSED = ["delivered", "cancelled"];
const NEEDS_PAYMENT = [
  "paid",
  "pending",
  "pending_stock",
  "processing",
  "payment_expired",
];

type StatusInfo = {
  label: string;
  tag: string;
  stage: number;
  stepIndex: number; // 0: Pedido, 1: Pago, 2: Bodega, 3: Despacho
  badgeVariant:
    | "warning"
    | "info"
    | "success"
    | "purple"
    | "emerald"
    | "danger"
    | "muted";
  why: string;
  whatIsHappening: string;
  whatToExpect: string;
  customerAction: string;
  requiresCustomerAction: boolean;
};

const STATUS_DETAILS: Record<string, StatusInfo> = {
  pending: {
    label: "Pendiente de pago",
    tag: "Requiere tu pago",
    stage: 0,
    stepIndex: 1,
    badgeVariant: "warning",
    why: "Registramos tu pedido y reservamos tu stock. Falta realizar la transferencia bancaria y adjuntar tu comprobante para comenzar la preparación en bodega.",
    whatIsHappening: "Tus productos están apartados temporalmente en bodega.",
    whatToExpect:
      "Apenas subas tu comprobante, finanzas verificará el abono y pasará tu orden a bodega.",
    customerAction:
      "Realiza la transferencia y adjunta tu comprobante antes del plazo límite.",
    requiresCustomerAction: true,
  },
  pending_stock: {
    label: "Stock confirmado · Pendiente de pago",
    tag: "Stock reservado",
    stage: 0,
    stepIndex: 1,
    badgeVariant: "warning",
    why: "¡Stock 100% confirmado y reservado! Solo falta que realices la transferencia bancaria y subas tu comprobante para asegurar tus productos.",
    whatIsHappening:
      "Tus unidades están reservadas exclusivamente a tu nombre en bodega.",
    whatToExpect:
      "Al adjuntar tu comprobante, finanzas valida el pago y tu pedido pasa a empaque.",
    customerAction:
      "Sube tu comprobante de pago bancario para confirmar la compra.",
    requiresCustomerAction: true,
  },
  processing: {
    label: "Pendiente de pago",
    tag: "Falta comprobante",
    stage: 0,
    stepIndex: 1,
    badgeVariant: "warning",
    why: "Tu pedido está registrado en el sistema. Para continuar con el proceso de despacho, necesitamos tu comprobante de transferencia bancaria.",
    whatIsHappening: "Esperando confirmación del abono bancario en Importadora Carlitos.",
    whatToExpect:
      "Al recibir tu comprobante, el equipo iniciará la revisión y preparación de tus productos.",
    customerAction: "Subir comprobante de pago bancario.",
    requiresCustomerAction: true,
  },
  paid: {
    label: "Stock confirmado · Esperando comprobante",
    tag: "Adjuntar comprobante",
    stage: 0,
    stepIndex: 1,
    badgeVariant: "warning",
    why: "El pedido está confirmado en nuestro sistema. Adjunta tu comprobante de transferencia bancaria para que administración lo apruebe.",
    whatIsHappening: "Esperando comprobante de transferencia bancaria.",
    whatToExpect: "Revisión contable y posterior empaque en bodega.",
    customerAction: "Subir tu comprobante de transferencia bancaria.",
    requiresCustomerAction: true,
  },
  payment_review: {
    label: "Comprobante en revisión",
    tag: "Verificando con el banco",
    stage: 1,
    stepIndex: 1,
    badgeVariant: "info",
    why: "¡Recibimos tu comprobante! Nuestro equipo de finanzas está cuadrando el abono con el banco para aprobar tu pedido.",
    whatIsHappening:
      "Verificando la transferencia en la cuenta bancaria de Importadora Carlitos.",
    whatToExpect:
      "El proceso toma normalmente de 15 a 60 minutos en horario hábil. Apenas esté verificado, tu pedido pasa a empaque en bodega.",
    customerAction:
      "¡Todo listo! No necesitas hacer nada más. Nosotros te notificaremos en cuanto quede confirmado.",
    requiresCustomerAction: false,
  },
  payment_confirmed: {
    label: "Pago aprobado · En preparación",
    tag: "Bodega preparando",
    stage: 2,
    stepIndex: 2,
    badgeVariant: "success",
    why: "¡Tu pago fue verificado con éxito! Tu pedido ingresó a la cola de bodega para recolección de artículos y control de calidad.",
    whatIsHappening:
      "Bodega está recolectando y revisando minuciosamente cada producto de tu pedido.",
    whatToExpect:
      "Una vez empacado y sellado de forma segura, se rotulará para su entrega a la agencia de transporte o retiro.",
    customerAction:
      "No tienes que hacer nada. Te avisaremos cuando el paquete esté embalado y rotulado.",
    requiresCustomerAction: false,
  },
  shipped: {
    label: "Embalado · Listo para despacho",
    tag: "Embalaje completado",
    stage: 2,
    stepIndex: 2,
    badgeVariant: "purple",
    why: "¡Tus productos ya fueron revisados, embalados y sellados con seguridad! Están a la espera de entrega a la agencia de transporte o listos para retiro en local.",
    whatIsHappening:
      "El bulto está rotulado y en espera del camión de transporte o disponible en tienda.",
    whatToExpect:
      "Apenas la agencia lo reciba y escanee en sistema, se activará tu Orden de Transporte (OT) para seguimiento en vivo.",
    customerAction:
      "Revisar los datos de envío y estar atento al número de seguimiento (OT).",
    requiresCustomerAction: false,
  },
  delivered: {
    label: "Entregado a agencia / En viaje",
    tag: "En camino o entregado",
    stage: 3,
    stepIndex: 3,
    badgeVariant: "emerald",
    why: "¡Tu compra ya fue entregada a la empresa de transporte o completó su retiro! La agencia está a cargo de trasladarlo hasta tu destino.",
    whatIsHappening:
      "El paquete viaja con la empresa de transporte hacia tu comuna o sucursal seleccionada.",
    whatToExpect:
      "Puedes rastrear el trayecto en tiempo real con el número de guía (OT).",
    customerAction:
      "Hacer seguimiento con el código OT y esperar la entrega o acudir a retirar si es sucursal.",
    requiresCustomerAction: false,
  },
  payment_expired: {
    label: "Plazo de pago vencido",
    tag: "Stock liberado",
    stage: -1,
    stepIndex: -1,
    badgeVariant: "danger",
    why: "El tiempo para registrar la transferencia terminó y el stock reservado fue liberado. Si ya transferiste, contáctanos de inmediato por WhatsApp.",
    whatIsHappening:
      "El pedido quedó congelado por vencimiento del plazo de transferencia.",
    whatToExpect:
      "Si envías tu comprobante por WhatsApp, un asesor podrá validar el stock y reactivar tu pedido manualmente.",
    customerAction:
      "Contactar de urgencia a soporte con tu comprobante de pago.",
    requiresCustomerAction: true,
  },
  cancelled: {
    label: "Pedido cancelado",
    tag: "Cancelado",
    stage: -1,
    stepIndex: -1,
    badgeVariant: "muted",
    why: "Este pedido fue anulado y cerrado en el sistema. No tiene pagos pendientes ni despachos asociados.",
    whatIsHappening: "Pedido cerrado en el sistema.",
    whatToExpect:
      "Si tienes dudas sobre este pedido o necesitas realizar una nueva compra, nuestro equipo está disponible por WhatsApp.",
    customerAction: "Sin acciones requeridas.",
    requiresCustomerAction: false,
  },
  negotiation: {
    label: "En revisión de catálogo",
    tag: "Ajustando pedido",
    stage: 0,
    stepIndex: 1,
    badgeVariant: "info",
    why: "Estamos ajustando o confirmando la disponibilidad de algunos artículos de tu compra con nuestro equipo de inventario.",
    whatIsHappening:
      "Un ejecutivo de Importadora Carlitos está revisando los detalles.",
    whatToExpect:
      "Te escribiremos a tu WhatsApp con las confirmaciones pertinentes.",
    customerAction: "Estar atento a los mensajes de nuestro equipo.",
    requiresCustomerAction: false,
  },
};

const STAGES = [
  {
    key: "order",
    label: "1. Pedido Registrado",
    shortLabel: "Pedido",
    icon: Box,
    detail:
      "Tu compra ingresó con éxito a Importadora Carlitos y se reservaron los productos en bodega.",
  },
  {
    key: "payment",
    label: "2. Pago y Verificación",
    shortLabel: "Pago",
    icon: CreditCard,
    detail:
      "El área de finanzas revisa y valida tu comprobante de transferencia con el banco.",
  },
  {
    key: "packing",
    label: "3. Bodega y Empaque",
    shortLabel: "Bodega",
    icon: Package,
    detail:
      "Recolección de productos, control de calidad y embalaje seguro con film.",
  },
  {
    key: "delivery",
    label: "4. Despacho y Entrega",
    shortLabel: "Despacho",
    icon: Truck,
    detail:
      "Entrega a la empresa de envíos con número de seguimiento (OT) o retiro en tienda.",
  },
];

const STORE_BANK_INFO = {
  holder: "Importadora Carlitos",
  rut: "78.267.426-9",
  bank: "Banco de Chile",
  accountType: "Cuenta Corriente",
  accountNumber: "4081220201",
  email: "contacto@yaxsell.cl",
};

function timestamp(value: any): number {
  if (!value) return 0;
  if (typeof value === "object" && (value.seconds || value._seconds))
    return Number(value.seconds || value._seconds) * 1000;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0)
    return numeric < 1e12 ? numeric * 1000 : numeric;
  return Date.parse(String(value)) || 0;
}

function normalize(raw: RawOrder, channel: string): Order | null {
  const id = String(raw.id || raw.$id || "");
  if (!id) return null;
  let items = raw.items || raw.ITEMS || [];
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }

  const shippingAddress = String(
    raw.shippingAddress ||
      raw.SHIPPINGADDRESS ||
      raw.customerAddress ||
      raw.CUSTOMERADDRESS ||
      raw.address ||
      raw.ADDRESS ||
      "",
  );
  const shippingCity = String(
    raw.shippingCity || raw.SHIPPINGCITY || raw.city || raw.CITY || "",
  );
  const shippingRegion = String(
    raw.shippingRegion || raw.SHIPPINGREGION || raw.region || raw.REGION || "",
  );
  const customerName = String(
    raw.customerName ||
      raw.CUSTOMERNAME ||
      raw.name ||
      raw.NAME ||
      raw.customer ||
      "",
  );
  const customerPhone = String(
    raw.customerPhone || raw.CUSTOMERPHONE || raw.phone || raw.PHONE || "",
  );
  const shippingMethod = String(
    raw.shippingMethod ||
      raw.SHIPPINGMETHOD ||
      raw.shippingType ||
      raw.SHIPPINGTYPE ||
      "",
  );

  return {
    id,
    code: String(raw.orderCode || raw.ORDERCODE || raw.REQCODE || id),
    status: raw.status || raw.STATUS || "pending",
    total: Number(raw.total ?? raw.TOTAL ?? raw.SUBTOTAL ?? 0),
    subtotal: Number(raw.subtotal ?? raw.SUBTOTAL ?? raw.total ?? raw.TOTAL ?? 0),
    discount: Number(raw.discount ?? raw.DISCOUNT ?? 0),
    shippingCost: Number(raw.shippingCost ?? raw.SHIPPINGCOST ?? 0),
    date: timestamp(raw.createdAt || raw.CREATEDAT || raw.$createdAt),
    store: raw.storeName || raw.STORE_LABEL || "Importadora Carlitos",
    channels: [channel],
    items: Array.isArray(items) ? items : [],
    agency: raw.shippingAgency || raw.SHIPPINGAGENCY || "",
    tracking: raw.trackingNumber || raw.TRACKINGNUMBER || "",
    proof: raw.paymentProofUrl || raw.PAYMENTPROOFURL || "",
    deadline: getOrderAutoCancelDeadline({
      ...raw,
      AUTOCANCELAT: raw.autoCancelAt || raw.AUTOCANCELAT,
    }),
    shippingAddress,
    shippingCity,
    shippingRegion,
    shippingMethod,
    customerName,
    customerPhone,
  };
}

function phoneDigits(raw: string) {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("56") && digits.length > 9) digits = digits.slice(2);
  return digits.slice(0, 9);
}

function phoneDisplay(raw: string) {
  return raw.replace(/(\d)(\d{4})(\d{0,4})/, "$1 $2 $3").trim();
}

function formatOrderDate(timestamp: number) {
  if (!timestamp) return "Fecha no disponible";
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const timeStr = date.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });

  if (isToday) {
    return `Hoy a las ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Santiago",
  });

  return `${dateStr} · ${timeStr}`;
}

function formatDeadlineLabel(deadline: number) {
  if (!deadline) return "";
  const diff = deadline - Date.now();
  if (diff <= 0) return "Plazo inicial cumplido";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `Quedan ${days} día${days > 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    return `Te quedan ${hours}h y ${minutes}m`;
  }
  return `¡Urgente! Te quedan ${minutes}m`;
}

function formatDeadlineDate(deadline: number) {
  if (!deadline) return "";
  return new Date(deadline).toLocaleString("es-CL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });
}

function itemQty(item: RawOrder) {
  return Number(item.qty ?? item.quantity ?? item.QUANTITY ?? 1);
}

function itemPrice(item: RawOrder) {
  return Number(item.price ?? item.PRICE ?? 0);
}

function itemName(item: RawOrder) {
  return item.name || item.NAME || item.productName || "Producto";
}

function itemNamesSummary(items: RawOrder[]) {
  if (!items.length) return "Productos de tu compra";
  const names = items.slice(0, 2).map(itemName);
  const remaining = items.length - 2;
  if (remaining > 0) {
    return `${names.join(", ")} +${remaining} más`;
  }
  return names.join(", ");
}

function totalUnits(items: RawOrder[]) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + itemQty(item), 0);
}

function needsAction(order: Order) {
  return NEEDS_PAYMENT.includes(order.status) && !order.proof;
}

function getTrackingUrl(agency: string, tracking: string): string | null {
  if (!tracking) return null;
  const cleanTracking = tracking.trim();
  const cleanAgency = agency.toLowerCase();
  if (cleanAgency.includes("starken")) {
    return `https://www.starken.cl/seguimiento?codigo=${encodeURIComponent(cleanTracking)}`;
  }
  if (cleanAgency.includes("blue") || cleanAgency.includes("bluexpress")) {
    return `https://www.bluex.cl/seguimiento/?tracking=${encodeURIComponent(cleanTracking)}`;
  }
  if (cleanAgency.includes("chilexpress")) {
    return `https://www.chilexpress.cl/seguimiento?orden=${encodeURIComponent(cleanTracking)}`;
  }
  if (cleanAgency.includes("pullman")) {
    return "https://www.pullmancargo.cl/";
  }
  return null;
}

export default function PedidosMultiChannelSection({
  showHeaderTitle = true,
}: {
  defaultTab?: "whatsapp" | "web";
  showHeaderTitle?: boolean;
}) {
  const { user, isLoggedIn } = useAuth();
  const reduced = useReducedMotion();
  const instance = useId();
  const detailRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  const [phone, setPhone] = useState("");
  const [linkedPhone, setLinkedPhone] = useState("");
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneOrders, setPhoneOrders] = useState<RawOrder[]>([]);
  const [webOrders, setWebOrders] = useState<RawOrder[]>([]);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [webLoading, setWebLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [webError, setWebError] = useState("");
  const [queried, setQueried] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [bankCopied, setBankCopied] = useState(false);
  const [allItems, setAllItems] = useState(false);
  const [stageInfo, setStageInfo] = useState<number | null>(null);
  const [guideStage, setGuideStage] = useState<number | null>(null);

  const lookupPhone = useCallback(async (digits: string, resetView = true) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setPhoneLoading(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/catalogo/my-orders?phone=56${digits}`,
        { signal: controller.signal, cache: "no-store" },
      );
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!data.success || !Array.isArray(data.orders)) throw new Error();
      setPhoneOrders(data.orders);
      setLinkedPhone(digits);
      setQueried(true);
      setPhoneOpen(false);

      const foundOrderWithName = data.orders.find(
        (o: any) => o.customerName || o.CUSTOMERNAME || o.name || o.NAME,
      );
      const extractedName = String(
        foundOrderWithName?.customerName ||
          foundOrderWithName?.CUSTOMERNAME ||
          foundOrderWithName?.name ||
          foundOrderWithName?.NAME ||
          "",
      ).trim();

      if (extractedName) {
        try {
          localStorage.setItem("customerName", extractedName);
          window.dispatchEvent(
            new CustomEvent("customerNameUpdated", { detail: extractedName }),
          );
        } catch {
          /* Optional convenience */
        }
      }
      if (resetView) {
        setSelectedId("");
        setFilter("all");
        setQuery("");
      }
      setFeedback({
        error: false,
        text: data.orders.length
          ? `${data.orders.length} compra${data.orders.length === 1 ? "" : "s"} vinculada${data.orders.length === 1 ? "" : "s"} a tu número.`
          : "No encontramos compras con este número. Revisa que sea el mismo que usaste al comprar.",
      });
      try {
        localStorage.setItem("customerPhone", `56${digits}`);
      } catch {
        /* Optional convenience */
      }
    } catch {
      if (!controller.signal.aborted)
        setFeedback({
          error: true,
          text: "No pudimos conectar. Revisa tu conexión y vuelve a buscar.",
        });
    } finally {
      if (!controller.signal.aborted) setPhoneLoading(false);
    }
  }, []);

  useEffect(() => {
    let stored = "";
    try {
      stored = localStorage.getItem("customerPhone") || "";
    } catch {
      /* Optional convenience */
    }
    const digits = phoneDigits(stored);
    if (/^9\d{8}$/.test(digits)) {
      setPhone(digits);
      void lookupPhone(digits);
    }
    return () => requestRef.current?.abort();
  }, [lookupPhone]);

  const loadWeb = useCallback(
    async (signal?: AbortSignal, force = false) => {
      if (!isLoggedIn || !user?.id) {
        setWebOrders([]);
        setWebLoading(false);
        setWebError("");
        return;
      }
      setWebLoading(true);
      setWebError("");
      try {
        const params = new URLSearchParams({
          userId: user.id,
          email: user.email || "",
        });
        if (force) params.set("force", "1");
        const response = await fetch(`/api/public-data/my-orders?${params}`, {
          signal,
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data.orders)) throw new Error();
        setWebOrders(data.orders);

        const foundOrderWithName = data.orders.find(
          (o: any) => o.customerName || o.CUSTOMERNAME || o.name || o.NAME,
        );
        const extractedName = String(
          foundOrderWithName?.customerName ||
            foundOrderWithName?.CUSTOMERNAME ||
            foundOrderWithName?.name ||
            foundOrderWithName?.NAME ||
            "",
        ).trim();

        if (extractedName) {
          try {
            localStorage.setItem("customerName", extractedName);
            window.dispatchEvent(
              new CustomEvent("customerNameUpdated", { detail: extractedName }),
            );
          } catch {
            /* Optional convenience */
          }
        }
      } catch {
        if (!signal?.aborted)
          setWebError(
            "No se pudieron cargar tus compras web. Intenta actualizar.",
          );
      } finally {
        if (!signal?.aborted) setWebLoading(false);
      }
    },
    [isLoggedIn, user?.id, user?.email],
  );

  useEffect(() => {
    const controller = new AbortController();
    setWebOrders([]);
    void loadWeb(controller.signal);
    return () => controller.abort();
  }, [loadWeb]);

  const orders = useMemo(() => {
    const merged = new Map<string, Order>();
    for (const [list, channel] of [
      [webOrders, "Web"],
      [phoneOrders, "WhatsApp"],
    ] as const) {
      for (const raw of list) {
        const order = normalize(raw, channel);
        if (!order) continue;
        const existing = merged.get(order.id);
        merged.set(
          order.id,
          existing
            ? {
                ...order,
                channels: [
                  ...new Set([...existing.channels, ...order.channels]),
                ],
                items: order.items.length ? order.items : existing.items,
                shippingAddress:
                  order.shippingAddress || existing.shippingAddress,
                shippingCity: order.shippingCity || existing.shippingCity,
                agency: order.agency || existing.agency,
                tracking: order.tracking || existing.tracking,
                proof: order.proof || existing.proof,
              }
            : order,
        );
      }
    }
    return [...merged.values()].sort((a, b) => b.date - a.date);
  }, [webOrders, phoneOrders]);

  const counts = {
    all: orders.length,
    active: orders.filter((o) => !CLOSED.includes(o.status)).length,
    attention: orders.filter(needsAction).length,
    closed: orders.filter((o) => CLOSED.includes(o.status)).length,
  };

  const visible = orders.filter((order) => {
    const matches =
      filter === "all" ||
      (filter === "active" && !CLOSED.includes(order.status)) ||
      (filter === "attention" && needsAction(order)) ||
      (filter === "closed" && CLOSED.includes(order.status));
    return (
      matches &&
      `${order.code} ${order.store} ${order.agency} ${order.tracking} ${order.items.map(itemName).join(" ")}`
        .toLocaleLowerCase("es")
        .includes(query.toLocaleLowerCase("es").trim())
    );
  });

  const selected =
    visible.find((o) => o.id === selectedId) ||
    visible.find(needsAction) ||
    visible[0];

  const meta = selected
    ? STATUS_DETAILS[selected.status] || {
        label: "En proceso",
        tag: "En revisión",
        stage: 0,
        stepIndex: 1,
        badgeVariant: "info" as const,
        why: "Tu compra está registrada en Importadora Carlitos. Consulta el detalle para conocer las novedades de tu pedido.",
        whatIsHappening: "El equipo está revisando los detalles de tu compra.",
        whatToExpect: "Te mantendremos informado del avance de tu pedido.",
        customerAction: "Revisar los datos de tu pedido.",
        requiresCustomerAction: false,
      }
    : null;

  const busy = phoneLoading || webLoading;

  const refresh = () => {
    if (linkedPhone) void lookupPhone(linkedPhone, false);
    if (isLoggedIn) void loadWeb(undefined, true);
  };

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      setFeedback({
        error: true,
        text: "No se pudo copiar al portapapeles.",
      });
    }
  }

  async function copyBankDetails() {
    const details = `Banco: ${STORE_BANK_INFO.bank}\nTitular: ${STORE_BANK_INFO.holder}\nRUT: ${STORE_BANK_INFO.rut}\nTipo: ${STORE_BANK_INFO.accountType}\nN° Cuenta: ${STORE_BANK_INFO.accountNumber}\nEmail: ${STORE_BANK_INFO.email}`;
    try {
      await navigator.clipboard.writeText(details);
      setBankCopied(true);
      setTimeout(() => setBankCopied(false), 2500);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(""), 2200);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    setAllItems(false);
    setStageInfo(null);
  }, [selected?.id]);

  function openOrder(order: Order) {
    setSelectedId(order.id);
    if (window.matchMedia("(max-width: 820px)").matches) {
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({
          behavior: reduced ? "instant" : "smooth",
          block: "start",
        }),
      );
    }
  }

  return (
    <div className={styles.journey}>
      {showHeaderTitle && (
        <header className={styles.heading}>
          <div>
            <span className={styles.headingIcon}>
              <Package size={20} />
            </span>
            <h2>Tus compras y pedidos</h2>
            <p>
              Conoce en qué paso va tu pedido, por qué está en ese estado y qué
              sigue a continuación.
            </p>
          </div>
          <a
            className={styles.helpLink}
            aria-label="Hablar con soporte por WhatsApp"
            href="https://wa.me/56936599658"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={15} /> ¿Dudas con un pedido? Escríbenos{" "}
            <ArrowRight size={14} />
          </a>
        </header>
      )}

      {/* PHONE CONNECTION BANNER */}
      <div className={styles.connection}>
        <div className={styles.connectionTop}>
          <span className={styles.connectionSymbol}>
            <MessageCircle size={20} />
          </span>
          <div>
            <strong>
              {linkedPhone ? (
                <>
                  Compras WhatsApp vinculadas:{" "}
                  <span className={styles.phoneNumber}>
                    +56 {phoneDisplay(linkedPhone)}
                  </span>
                </>
              ) : (
                "¿Hiciste un pedido por WhatsApp o con un asesor?"
              )}
            </strong>
            <p>
              {linkedPhone
                ? "Tus compras de WhatsApp aparecen unificadas aquí con tus compras web."
                : "Ingresa el número con el que compraste para reunir tus pedidos en un solo lugar."}
            </p>
          </div>
          {linkedPhone && (
            <button
              type="button"
              className={styles.textButton}
              aria-expanded={phoneOpen}
              onClick={() => setPhoneOpen(!phoneOpen)}
            >
              {phoneOpen ? "Cerrar" : "Cambiar número"} <ChevronDown size={14} />
            </button>
          )}
        </div>

        {(!linkedPhone || phoneOpen) && (
          <form
            className={styles.phoneForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (/^9\d{8}$/.test(phone)) void lookupPhone(phone);
              else
                setFeedback({
                  error: true,
                  text: "Ingresa los 9 dígitos de tu celular, comenzando por 9.",
                });
            }}
          >
            <label htmlFor={instance + "-phone"} className={styles.srOnly}>
              Número de WhatsApp
            </label>
            <div className={styles.phoneField}>
              <span>+56</span>
              <input
                id={instance + "-phone"}
                data-order-phone
                inputMode="tel"
                autoComplete="tel-national"
                type="tel"
                placeholder="9 1234 5678"
                value={phoneDisplay(phone)}
                onChange={(event) => setPhone(phoneDigits(event.target.value))}
                aria-describedby={instance + "-feedback"}
              />
            </div>
            <button
              type="submit"
              className={styles.primary}
              disabled={phoneLoading}
            >
              {phoneLoading ? (
                <Loader2 size={17} className={styles.spin} />
              ) : (
                <Search size={17} />
              )}{" "}
              {phoneLoading ? "Buscando…" : "Encontrar mis compras"}
            </button>
          </form>
        )}

        <div id={instance + "-feedback"} aria-live="polite">
          {feedback && (
            <p className={feedback.error ? styles.error : styles.feedback}>
              {feedback.text}
            </p>
          )}
        </div>

        {isLoggedIn && (
          <span className={styles.webConnected}>
            <Globe2 size={13} /> Compras web asociadas a tu cuenta incluidas{" "}
            {webLoading && <Loader2 size={12} className={styles.spin} />}
          </span>
        )}
      </div>

      {webError && (
        <div role="alert" className={styles.error}>
          {webError}{" "}
          <button
            className={styles.textButton}
            onClick={() => void loadWeb(undefined, true)}
          >
            Reintentar
          </button>
        </div>
      )}

      {orders.length > 0 ? (
        <>
          {/* FILTERS & SEARCH */}
          <div className={styles.collectionBar}>
            <div className={styles.filters} aria-label="Filtrar pedidos">
              {(
                [
                  ["all", "Todos"],
                  ["active", "En curso"],
                  ["attention", "Requieren pago"],
                  ["closed", "Finalizados"],
                ] as [Filter, string][]
              ).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={filter === key}
                  className={filter === key ? styles.filterActive : ""}
                  onClick={() => setFilter(key)}
                >
                  {filter === key && (
                    <motion.span
                      aria-hidden="true"
                      className={styles.filterIndicator}
                      layoutId={instance + "-filter"}
                      transition={
                        reduced
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 450, damping: 35 }
                      }
                    />
                  )}
                  {label}
                  <span>{counts[key]}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.refresh}
              onClick={refresh}
              disabled={busy}
              aria-label="Actualizar compras"
              title="Actualizar compras"
            >
              <RefreshCw size={15} className={busy ? styles.spin : ""} />
            </button>
          </div>

          <label className={styles.search}>
            <Search size={16} />
            <input
              placeholder="Buscar por código, transporte, agencia o producto…"
              aria-label="Buscar pedidos"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </label>

          {visible.length ? (
            <div className={styles.workspace}>
              {/* LIST OF CARDS */}
              <div className={styles.orderList} aria-label="Tus pedidos">
                {visible.map((order) => {
                  const statusInfo =
                    STATUS_DETAILS[order.status] || {
                      label: "En proceso",
                      tag: "En revisión",
                      stage: 0,
                      stepIndex: 1,
                      badgeVariant: "info" as const,
                      why: "Tu pedido está registrado y en revisión por el equipo.",
                      whatIsHappening: "Procesando compra.",
                      whatToExpect: "Pronto se actualizará el estado.",
                      customerAction: "Revisar el detalle.",
                      requiresCustomerAction: false,
                    };

                  const isSelected = selected?.id === order.id;
                  const orderNeedsAction = needsAction(order);
                  const isCancelled =
                    order.status === "cancelled" ||
                    order.status === "payment_expired";

                  // Mini stepper progress logic
                  let fillPercentage = 25;
                  if (statusInfo.stepIndex === 1) {
                    fillPercentage = order.proof ? 50 : 35;
                  } else if (statusInfo.stepIndex === 2) {
                    fillPercentage = 75;
                  } else if (statusInfo.stepIndex === 3) {
                    fillPercentage = 100;
                  }

                  return (
                    <article
                      key={order.id}
                      aria-current={isSelected ? "true" : undefined}
                      className={`${styles.orderTicket} ${styles[`ticket_${statusInfo.badgeVariant}`]} ${isSelected ? styles.selectedTicket : ""}`}
                      onClick={() => openOrder(order)}
                    >
                      {/* Store and channel identify where the order was placed. */}
                      <div className={styles.cardHeader}>
                        <div className={styles.cardHeaderBadges}>
                          {order.channels.map((ch) =>
                            ch === "WhatsApp" ? (
                              <span
                                key={ch}
                                className={styles.channelBadgeWa}
                                title="Pedido por WhatsApp"
                              >
                                <MessageCircle size={11} /> WhatsApp
                              </span>
                            ) : (
                              <span
                                key={ch}
                                className={styles.channelBadgeWeb}
                                title="Compra en la tienda web"
                              >
                                <Globe2 size={11} /> Web
                              </span>
                            ),
                          )}
                          <span className={styles.storeBadge}>
                            {order.store}
                          </span>
                        </div>
                      </div>

                      {/* CARD CODE & AMOUNT */}
                      <div className={styles.cardCodeRow}>
                        <div className={styles.cardCodeBox}>
                          <strong className={styles.cardCode}>Pedido #{order.code}</strong>
                          <button
                            type="button"
                            className={`${styles.cardCopyBtn} ${copied === order.code ? styles.copied : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void copyText(order.code);
                            }}
                            title="Copiar código de pedido"
                          >
                            {copied === order.code ? (
                              <Check size={11} />
                            ) : (
                              <Copy size={11} />
                            )}
                            {copied === order.code ? "Copiado" : "Copiar"}
                          </button>
                        </div>
                        <span className={styles.cardDate}>
                          {formatOrderDate(order.date)}
                        </span>
                      </div>

                      {/* STATUS EXPLAINER BANNER (THE "POR QUÉ") */}
                      <div
                        className={`${styles.cardStatusExplainer} ${styles[`status_${statusInfo.badgeVariant}`]}`}
                      >
                        <div className={styles.cardStatusHeader}>
                          <span className={styles.cardStatusDot} />
                          <span className={styles.cardStatusTag}>
                            {statusInfo.label}
                          </span>
                          {statusInfo.requiresCustomerAction && (
                            <span className={styles.actionRequiredBadge}>
                              <AlertTriangle size={10} /> Acción requerida
                            </span>
                          )}
                        </div>
                        <p className={styles.cardWhyText}>{statusInfo.why}</p>
                      </div>

                      {/* MINI STEPPER BAR */}
                      {!isCancelled && (
                        <div className={styles.miniStepperContainer}>
                          <div className={styles.miniStepperBar}>
                            <div
                              className={styles.miniStepperFill}
                              style={{ width: `${fillPercentage}%` }}
                            />
                          </div>
                          <div className={styles.miniStepper}>
                            {STAGES.map((s, idx) => {
                              const isStepDone = idx < statusInfo.stepIndex;
                              const isStepCurrent =
                                idx === statusInfo.stepIndex;
                              const isStepAlert =
                                isStepCurrent &&
                                statusInfo.requiresCustomerAction;

                              return (
                                <div
                                  key={s.key}
                                  className={`${styles.miniStep} ${
                                    isStepDone
                                      ? styles.stepDone
                                      : isStepAlert
                                        ? styles.stepAlert
                                        : isStepCurrent
                                          ? styles.stepCurrent
                                          : styles.stepPending
                                  }`}
                                >
                                  <span className={styles.stepDot}>
                                    {isStepDone ? (
                                      <Check size={10} strokeWidth={3} />
                                    ) : (
                                      idx + 1
                                    )}
                                  </span>
                                  <span className={styles.stepName}>
                                    {s.shortLabel}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ITEM PREVIEW (THUMBNAILS & SUMMARY) */}
                      <div className={styles.cardItemPreview}>
                        <div className={styles.cardThumbnails}>
                          {order.items.slice(0, 3).map((item, idx) => (
                            <span
                              key={idx}
                              className={styles.cardThumb}
                              title={itemName(item)}
                            >
                              <ProductImage item={item} />
                            </span>
                          ))}
                          {order.items.length > 3 && (
                            <span className={styles.cardMoreThumb}>
                              +{order.items.length - 3}
                            </span>
                          )}
                        </div>
                        <div className={styles.cardItemsText}>
                          <strong>{itemNamesSummary(order.items)}</strong>
                          <span>
                            {order.items.length} producto
                            {order.items.length === 1 ? "" : "s"} ·{" "}
                            {totalUnits(order.items)} {totalUnits(order.items) === 1 ? "unidad" : "unidades"}
                          </span>
                        </div>
                      </div>

                      {/* DELIVERY / SHIPPING BADGES */}
                      {(order.agency ||
                        order.tracking ||
                        order.shippingCity) && (
                        <div className={styles.cardDeliveryRow}>
                          {order.agency && (
                            <span className={styles.deliveryBadge}>
                              <Truck size={12} /> {order.agency}
                            </span>
                          )}
                          {order.tracking && (
                            <span className={styles.trackingBadge}>
                              OT: <strong>{order.tracking}</strong>
                            </span>
                          )}
                          {order.shippingCity && (
                            <span className={styles.cityBadge}>
                              <MapPin size={11} /> {order.shippingCity}
                            </span>
                          )}
                        </div>
                      )}

                      {/* DEADLINE BANNER */}
                      {orderNeedsAction && order.deadline > 0 && (
                        <div className={styles.cardDeadlineBanner}>
                          <Clock size={13} />
                          <span>
                            {order.deadline > Date.now()
                              ? `Plazo de pago: hasta el ${formatDeadlineDate(order.deadline)} (${formatDeadlineLabel(order.deadline)})`
                              : "Plazo inicial de pago vencido. Contáctanos para revisar tu stock."}
                          </span>
                        </div>
                      )}

                      {/* CARD FOOTER & ACTIONS */}
                      <div className={styles.cardFooter}>
                        <div className={styles.cardPriceBox}>
                          <small>Total del pedido</small>
                          <strong>{formatPrice(order.total)}</strong>
                        </div>
                        <div className={styles.cardActions}>
                          {orderNeedsAction && (
                            <Link
                              href={`/pedido/${encodeURIComponent(order.id)}`}
                              className={styles.cardCtaButton}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <CreditCard size={13} /> Subir comprobante
                            </Link>
                          )}
                          <button
                            type="button"
                            className={styles.cardSelectPrompt}
                            onClick={(event) => {
                              event.stopPropagation();
                              openOrder(order);
                            }}
                          >
                            Ver detalle <ArrowRight size={14} />
                          </button>
                          <a
                            href={`https://wa.me/56936599658?text=${encodeURIComponent(
                              `Hola Importadora Carlitos, tengo una consulta sobre mi pedido #${order.code} (Estado: ${statusInfo.label})`,
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.cardWhatsappBtn}
                            title="Preguntar por WhatsApp por este pedido"
                            aria-label={`Consultar por WhatsApp sobre el pedido ${order.code}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MessageCircle size={15} />
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
                <p className={styles.listHint}>
                  <ShieldCheck size={14} /> Todas tus compras están protegidas y
                  respaldadas en Importadora Carlitos.
                </p>
              </div>

              {/* DETAIL PANEL (RIGHT SIDE) */}
              <div
                ref={detailRef}
                id={instance + "-detail"}
                className={styles.detail}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {selected && meta && (
                    <motion.article
                      key={selected.id}
                      initial={reduced ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduced ? 0 : 0.2 }}
                    >
                      {/* DETAIL TOP BAR */}
                      <div className={styles.detailTop}>
                        <div className={styles.detailTopLeft}>
                          <strong>{selected.store}</strong>
                          <span>·</span>
                          <span>{selected.channels.join(" + ")}</span>
                          <span>·</span>
                          <span>{formatOrderDate(selected.date)}</span>
                        </div>
                        <span
                          className={`${styles.statusHeaderPill} ${styles[`pill_${meta.badgeVariant}`]}`}
                        >
                          <span className={styles.statusPillDot} />
                          {meta.label}
                        </span>
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => copyText(selected.code)}
                        >
                          {copied === selected.code ? (
                            <Check size={13} />
                          ) : (
                            <Copy size={13} />
                          )}
                          {copied === selected.code
                            ? "Código copiado"
                            : "Copiar código"}
                        </button>
                      </div>

                      {/* STATUS HERO BANNER */}
                      <div
                        className={`${styles.statusHero} ${styles[`hero_${meta.badgeVariant}`]}`}
                      >
                        <div>
                          <p className={styles.orderReference}>
                            <Tag size={13} /> Pedido #{selected.code}
                          </p>
                          <h3>{meta.label}</h3>
                          <p className={styles.statusHeroDesc}>{meta.why}</p>
                        </div>
                        <div
                          className={`${styles.parcelScene} ${meta.stage < 0 ? styles.parcelClosed : ""}`}
                          aria-hidden="true"
                        >
                          <div className={styles.parcelOrbit} />
                          <div className={styles.parcel}>
                            <span />
                            <Package size={42} strokeWidth={1.3} />
                          </div>
                          <span className={styles.parcelStamp}>
                            {meta.stage === 3 ? (
                              <Check size={17} />
                            ) : meta.stage === 2 ? (
                              <Package size={17} />
                            ) : meta.stage === 1 ? (
                              <CreditCard size={17} />
                            ) : (
                              <Box size={17} />
                            )}
                          </span>
                        </div>
                      </div>

                      {/* 3-POINT DIAGNOSIS GRID ("¿QUÉ PASA, QUÉ SIGUE, QUÉ DEBES HACER?") */}
                      <div className={styles.diagnosisGrid}>
                        <div className={styles.diagnosisTile}>
                          <div className={styles.diagnosisTileHeader}>
                            <Clock size={13} /> En este momento
                          </div>
                          <p>{meta.whatIsHappening}</p>
                        </div>
                        <div className={styles.diagnosisTile}>
                          <div className={styles.diagnosisTileHeader}>
                            <ArrowRight size={13} /> Próximo paso
                          </div>
                          <p>{meta.whatToExpect}</p>
                        </div>
                        <div className={styles.diagnosisTile}>
                          <div className={styles.diagnosisTileHeader}>
                            <User size={13} /> ¿Qué debes hacer?
                          </div>
                          <p>{meta.customerAction}</p>
                        </div>
                      </div>

                      {/* ACTION REQUIRED NOTICE */}
                      {meta.requiresCustomerAction && needsAction(selected) && (
                        <div className={styles.actionRequiredNotice}>
                          <div>
                            <p>
                              Tu pedido está a la espera de comprobante para
                              iniciar el empaque.
                            </p>
                          </div>
                          <Link
                            href={`/pedido/${encodeURIComponent(selected.id)}`}
                          >
                            <CreditCard size={13} /> Subir comprobante ahora
                          </Link>
                        </div>
                      )}

                      {/* INTERACTIVE ROUTE STEPPER */}
                      {meta.stage >= 0 && (
                        <>
                          <ol
                            className={styles.route}
                            aria-label="Recorrido del pedido"
                          >
                            {STAGES.map((stage, index) => {
                              const isReached = index <= meta.stepIndex;
                              const isCurrent = index === meta.stepIndex;

                              return (
                                <li
                                  key={stage.key}
                                  className={isReached ? styles.reached : ""}
                                  aria-current={isCurrent ? "step" : undefined}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setStageInfo(
                                        stageInfo === index ? null : index,
                                      )
                                    }
                                    aria-expanded={stageInfo === index}
                                    aria-label={`${stage.label}: ${index < meta.stepIndex ? "completado" : index === meta.stepIndex ? "etapa actual" : "pendiente"}`}
                                  >
                                    <span>
                                      {index < meta.stepIndex ? (
                                        <Check size={16} />
                                      ) : (
                                        <stage.icon size={16} />
                                      )}
                                    </span>
                                    {stage.shortLabel}
                                  </button>
                                </li>
                              );
                            })}
                          </ol>
                          <AnimatePresence>
                            {stageInfo !== null && (
                              <motion.p
                                className={styles.stageInfo}
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                              >
                                <strong>{STAGES[stageInfo].label}:</strong>{" "}
                                {STAGES[stageInfo].detail}
                              </motion.p>
                            )}
                          </AnimatePresence>
                        </>
                      )}

                      {/* DEADLINE BANNER */}
                      {needsAction(selected) && selected.deadline > 0 && (
                        <div className={styles.deadline}>
                          <Clock size={16} />
                          <div>
                            <strong>Plazo de reserva: </strong>
                            {selected.deadline > Date.now()
                              ? `Tienes hasta el ${formatDeadlineDate(selected.deadline)} (${formatDeadlineLabel(selected.deadline)}) para subir tu comprobante de pago.`
                              : "El plazo inicial sugerido para el comprobante ya expiró. Contáctanos por WhatsApp para validar tu reserva de stock."}
                          </div>
                        </div>
                      )}

                      {/* SHIPPING & TRACKING CARD */}
                      {(selected.agency ||
                        selected.tracking ||
                        selected.shippingAddress ||
                        selected.shippingCity) && (
                        <div className={styles.shippingBox}>
                          <div className={styles.shippingBoxHeader}>
                            <span className={styles.shippingAgencyTag}>
                              <Truck size={15} />{" "}
                              {selected.agency || "Agencia de transporte"}
                            </span>
                            {selected.tracking && (
                              <button
                                type="button"
                                onClick={() => copyText(selected.tracking)}
                                className={styles.textButton}
                                title="Copiar número de seguimiento"
                              >
                                {copied === selected.tracking ? (
                                  <Check size={13} />
                                ) : (
                                  <Copy size={13} />
                                )}
                                {copied === selected.tracking
                                  ? "Guía copiada"
                                  : "Copiar guía"}
                              </button>
                            )}
                          </div>

                          {selected.tracking ? (
                            <div className={styles.trackingNumberRow}>
                              <span>Orden de Transporte (OT):</span>
                              <strong>{selected.tracking}</strong>
                              {getTrackingUrl(
                                selected.agency,
                                selected.tracking,
                              ) && (
                                <a
                                  href={
                                    getTrackingUrl(
                                      selected.agency,
                                      selected.tracking,
                                    )!
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.trackingExtLink}
                                >
                                  Rastrear en {selected.agency}{" "}
                                  <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                          ) : (
                            <p
                              style={{
                                fontSize: "11.5px",
                                color: "#5b6f84",
                                margin: 0,
                              }}
                            >
                              Tu compra está en preparación. El número de guía
                              (OT) se asignará una vez entregado a la agencia.
                            </p>
                          )}

                          {(selected.shippingAddress ||
                            selected.shippingCity) && (
                            <div className={styles.shippingAddressInfo}>
                              <MapPin size={13} color="#059669" />
                              <span>
                                Entrega en:{" "}
                                <strong>
                                  {selected.shippingAddress
                                    ? `${selected.shippingAddress}, `
                                    : ""}
                                  {selected.shippingCity}
                                  {selected.shippingRegion
                                    ? `, ${selected.shippingRegion}`
                                    : ""}
                                </strong>
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* PAYMENT & PROOF CARD */}
                      <div
                        className={`${styles.paymentProofCard} ${
                          selected.proof
                            ? styles.proofUploaded
                            : styles.proofPending
                        }`}
                      >
                        <div className={styles.proofCardHeader}>
                          <strong>
                            {selected.proof ? (
                              <>
                                <CheckCircle2 size={16} color="#15803d" />{" "}
                                Comprobante adjuntado
                              </>
                            ) : (
                              <>
                                <CreditCard size={16} color="#d97706" /> Pago
                                por transferencia bancaria
                              </>
                            )}
                          </strong>
                          {selected.proof ? (
                            <a
                              href={selected.proof}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.proofViewBtn}
                            >
                              Ver archivo adjunto <ExternalLink size={12} />
                            </a>
                          ) : (
                            <Link
                              href={`/pedido/${encodeURIComponent(selected.id)}`}
                              className={styles.proofViewBtn}
                              style={{
                                borderColor: "#fde68a",
                                color: "#92400e",
                              }}
                            >
                              Subir comprobante ➔
                            </Link>
                          )}
                        </div>

                        {selected.proof ? (
                          <p
                            style={{
                              fontSize: "11.5px",
                              margin: 0,
                              lineHeight: 1.5,
                            }}
                          >
                            Comprobante recibido con éxito. El equipo de
                            finanzas está cuadrando la transferencia con la
                            cartola bancaria.
                          </p>
                        ) : (
                          <div className={styles.bankDetailsBox}>
                            <span>
                              Transfiere a los datos oficiales de Importadora Carlitos:
                            </span>
                            <div className={styles.bankDetailsGrid}>
                              <span>Banco:</span>
                              <span>{STORE_BANK_INFO.bank}</span>
                              <span>Titular:</span>
                              <span>{STORE_BANK_INFO.holder}</span>
                              <span>RUT:</span>
                              <span>{STORE_BANK_INFO.rut}</span>
                              <span>Cuenta:</span>
                              <span>
                                {STORE_BANK_INFO.accountType} N°{" "}
                                {STORE_BANK_INFO.accountNumber}
                              </span>
                              <span>Email:</span>
                              <span>{STORE_BANK_INFO.email}</span>
                            </div>
                            <button
                              type="button"
                              className={styles.copyBankBtn}
                              onClick={copyBankDetails}
                            >
                              {bankCopied ? (
                                <Check size={11} />
                              ) : (
                                <Copy size={11} />
                              )}
                              {bankCopied
                                ? "¡Datos bancarios copiados!"
                                : "Copiar datos de transferencia"}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* PRODUCTS LIST */}
                      <div className={styles.productHeading}>
                        <h4>Artículos en este pedido</h4>
                        <span>
                          {selected.items.length} producto
                          {selected.items.length === 1 ? "" : "s"} (
                          {totalUnits(selected.items)} unidades)
                        </span>
                      </div>

                      <motion.div layout={!reduced} className={styles.products}>
                        {(allItems
                          ? selected.items
                          : selected.items.slice(0, 4)
                        ).map((item, index) => (
                          <div className={styles.product} key={index}>
                            <span className={styles.productImage}>
                              <ProductImage item={item} />
                            </span>
                            <div>
                              <strong>{itemName(item)}</strong>
                              <span>
                                {itemQty(item)} unid. ×{" "}
                                {formatPrice(itemPrice(item))}
                              </span>
                            </div>
                            <b>
                              {formatPrice(itemQty(item) * itemPrice(item))}
                            </b>
                          </div>
                        ))}

                        {!selected.items.length && (
                          <p className={styles.feedback}>
                            Los productos se pueden consultar en la página de
                            detalle de la compra.
                          </p>
                        )}
                      </motion.div>

                      {selected.items.length > 4 && (
                        <button
                          type="button"
                          className={styles.moreItems}
                          aria-expanded={allItems}
                          onClick={() => setAllItems(!allItems)}
                        >
                          {allItems
                            ? "Mostrar menos productos"
                            : `Ver todos los ${selected.items.length} productos`}
                          <ChevronDown
                            size={14}
                            style={{
                              transform: allItems
                                ? "rotate(180deg)"
                                : undefined,
                            }}
                          />
                        </button>
                      )}

                      {/* DETAIL FOOTER */}
                      <div className={styles.detailFooter}>
                        <div>
                          <span>Total final de la compra</span>
                          <strong>{formatPrice(selected.total)}</strong>
                        </div>
                        <Link
                          href={`/pedido/${encodeURIComponent(selected.id)}`}
                          className={styles.primary}
                        >
                          {needsAction(selected)
                            ? "Subir comprobante de pago"
                            : "Ver pedido completo"}
                          <ArrowRight size={16} />
                        </Link>
                      </div>

                      {/* WHATSAPP SUPPORT LINK */}
                      <a
                        className={styles.orderHelp}
                        href={`https://wa.me/56936599658?text=${encodeURIComponent(
                          `Hola Importadora Carlitos, tengo una consulta sobre mi pedido #${selected.code} (${meta.label})`,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MessageCircle size={15} /> ¿Dudas con este pedido?
                        Habla con un asesor de Importadora Carlitos{" "}
                        <ArrowRight size={13} />
                      </a>
                    </motion.article>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className={styles.noResults}>
              <Search size={26} />
              <h3>No encontramos coincidencias</h3>
              <p>Prueba con otro código, nombre de producto o filtro.</p>
              <button
                className={styles.textButton}
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Ver todos los pedidos
              </button>
            </div>
          )}
        </>
      ) : busy ? (
        <div className={styles.loading} role="status">
          <Loader2 size={26} className={styles.spin} />
          <p>Reuniendo el historial de tus pedidos…</p>
        </div>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyIllustration} aria-hidden="true">
            <div className={styles.emptyLine} />
            <div className={styles.emptyBox}>
              <Package size={40} strokeWidth={1.2} />
            </div>
            <span>
              <Search size={20} />
            </span>
          </div>
          <div>
            <h3>
              {queried
                ? "No encontramos compras con ese número."
                : isLoggedIn
                  ? "Aún no tienes pedidos registrados."
                  : "Tu pedido tiene una historia y seguimiento."}
            </h3>
            <p>
              {queried
                ? "Revisa que hayas ingresado los 9 dígitos correctos de tu WhatsApp o comunícate con nuestro equipo para ayudarte a ubicarla."
                : isLoggedIn
                  ? "Cuando compres, verás aquí en vivo el estado del pago, el embalaje en bodega y el despacho a tu comuna."
                  : "Ingresa tu número de WhatsApp arriba y conoce exactamente en qué paso va tu pedido sin necesidad de registrarte."}
            </p>
            <div className={styles.emptySteps}>
              {STAGES.map((stage, index) => (
                <button
                  type="button"
                  key={stage.key}
                  aria-expanded={guideStage === index}
                  onClick={() =>
                    setGuideStage(guideStage === index ? null : index)
                  }
                >
                  <stage.icon size={14} />
                  {stage.shortLabel}
                </button>
              ))}
            </div>
            <AnimatePresence initial={false}>
              {guideStage !== null && (
                <motion.div
                  className={styles.guideDetail}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.22 }}
                >
                  <p>{STAGES[guideStage].detail}</p>
                </motion.div>
              )}
            </AnimatePresence>
            {(queried || isLoggedIn) && (
              <Link href="/productos" className={styles.textButton}>
                Explorar catálogo de Importadora Carlitos <ArrowRight size={15} />
              </Link>
            )}
          </div>
        </div>
      )}

      {!isLoggedIn && (
        <p className={styles.accountHint}>
          <ShieldCheck size={14} /> ¿Compraste desde la tienda web?{" "}
          <Link href="/login">Inicia sesión para ver todas tus compras.</Link>
        </p>
      )}
    </div>
  );
}

function ProductImage({ item }: { item: RawOrder }) {
  const [failed, setFailed] = useState(false);
  const src = item.image || item.img || item.IMAGEURL;
  return src && !failed ? (
    <img
      src={src}
      alt={itemName(item)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <Package size={18} />
  );
}
