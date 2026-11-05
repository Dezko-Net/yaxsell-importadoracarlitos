/**
 * 📦 Precios por Volumen — 3 niveles según cantidad comprada.
 *
 * Fuente única de verdad para calcular qué precio unitario corresponde
 * a una cantidad dada. SIN descuentos artificiales.
 *
 *  Nivel       | Cálculo                    | Rango (packQty=12, boxQty=24)
 *  ------------|----------------------------|--------------------
 *  Detalle     | WHOLESALEPRICE × 1.5       | 1 – 11
 *  Mayor       | WHOLESALEPRICE             | 12 – 23
 *  Caja        | BOXPRICE                   | 24+ (boxQty)
 *
 * Los umbrales son DINÁMICOS según el PACKQTY y BOXQTY de cada producto:
 *  - mayor arranca en 1 paquete completo (packQty).
 *  - caja arranca en BOXQTY (si está definido) o packQty × 2 como fallback.
 */

export type VolumeTierKey = 'detalle' | 'mayor' | 'caja';

export interface VolumeTier {
  key: VolumeTierKey;
  label: string;
  /** Cantidad mínima (inclusive) para activar este nivel */
  minQty: number;
  /** Cantidad máxima (inclusive); null = sin tope */
  maxQty: number | null;
  unitPrice: number;
}

export interface VolumePricedProduct {
  PRICE: number;
  INTERMEDIATEPRICE?: number | null;
  WHOLESALEPRICE?: number | null;
  BOXPRICE?: number | null;
  PACKQTY?: number | null;
  BOXQTY?: number | null;
  WHOLESALEMINQUANTITY?: number | null;
}

/** Cantidad por paquete del producto (0 si no maneja paquetes). */
export function getPackQty(p: VolumePricedProduct): number {
  const raw = Number(p.PACKQTY || p.WHOLESALEMINQUANTITY || 0);
  return !isNaN(raw) && raw > 1 ? Math.round(raw) : 0;
}

/**
 * Niveles de precio del producto, ordenados por cantidad ascendente.
 * Solo incluye niveles que realmente mejoran el precio; un producto sin
 * WHOLESALEPRICE o sin packQty devuelve únicamente el nivel Detalle.
 *
 * Precio Detalle = WHOLESALEPRICE × 1.5 (mayor + 50%), desde 1 unidad.
 */
export function getVolumeTiers(p: VolumePricedProduct): VolumeTier[] {
  // 🌐 Si el producto tiene precio web exclusivo (WEBPRICE / web_price), se respeta dicho precio sin aplicar precios mayoristas de POS
  const webPrice = Number((p as any)?.WEBPRICE ?? (p as any)?.web_price ?? 0);
  if (webPrice > 0) {
    return [{ key: 'detalle', label: 'Web', minQty: 1, maxQty: null, unitPrice: webPrice }];
  }

  const packQty = getPackQty(p);
  const mayor = p.WHOLESALEPRICE && p.WHOLESALEPRICE > 0 ? p.WHOLESALEPRICE : 0;

  // Sin sistema de volumen → precio único (usa PRICE de Appwrite como fallback)
  if (!packQty || !mayor) {
    const fallback = p.PRICE || mayor || 0;
    return [{ key: 'detalle', label: 'Detalle', minQty: 1, maxQty: null, unitPrice: fallback }];
  }

  // Detalle = mayor + 50%
  const detalle = Math.round(mayor * 1.5);

  // Caja: usa BOXQTY si está definido, sino packQty × 2 como fallback
  const cajaMin = (p.BOXQTY && p.BOXQTY > packQty) ? Math.round(p.BOXQTY) : packQty * 2;

  // Caja: solo si existe y realmente mejora el precio mayor
  const caja = p.BOXPRICE && p.BOXPRICE > 0 && p.BOXPRICE < mayor ? p.BOXPRICE : 0;

  const tiers: VolumeTier[] = [
    { key: 'detalle', label: 'Detalle', minQty: 1, maxQty: packQty - 1, unitPrice: detalle },
  ];

  if (caja) {
    tiers.push({ key: 'mayor', label: 'Por mayor', minQty: packQty, maxQty: cajaMin - 1, unitPrice: mayor });
    tiers.push({ key: 'caja', label: 'Por caja', minQty: cajaMin, maxQty: null, unitPrice: caja });
  } else {
    tiers.push({ key: 'mayor', label: 'Por mayor', minQty: packQty, maxQty: null, unitPrice: mayor });
  }

  return tiers;
}

/** Nivel activo para una cantidad dada. */
export function resolveVolumeTier(p: VolumePricedProduct, qty: number): VolumeTier {
  const tiers = getVolumeTiers(p);
  const q = Math.max(1, Math.round(qty || 1));
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (q >= tiers[i].minQty) return tiers[i];
  }
  return tiers[0];
}

/** Precio unitario que corresponde a una cantidad dada. */
export function resolveVolumeUnitPrice(p: VolumePricedProduct, qty: number): number {
  return resolveVolumeTier(p, qty).unitPrice;
}

/** ¿El producto tiene más de un nivel de precio? */
export function hasVolumePricing(p: VolumePricedProduct): boolean {
  return getVolumeTiers(p).length > 1;
}

/**
 * Puntos de control para el selector de cantidad:
 * unidades sueltas hasta el umbral mayor, luego saltos por paquete.
 * Ej packQty 12: [1,2,3,4,5,6,7,8,9,10,11,12,24,36,48,...]
 */
export function getQtyCheckpoints(p: VolumePricedProduct, maxStock = 99999): number[] {
  const packQty = getPackQty(p);
  if (!packQty || !hasVolumePricing(p)) return [];
  const pts: number[] = [];
  for (let i = 1; i < packQty; i++) pts.push(i);
  const maxMultiples = 8; // hasta 8 paquetes por stepper; más se escribe a mano
  for (let m = packQty; m <= packQty * maxMultiples; m += packQty) pts.push(m);
  return pts.filter(v => v <= maxStock);
}

/** Siguiente punto de control hacia arriba (para el botón +). */
export function nextCheckpoint(p: VolumePricedProduct, current: number, maxStock = 99999): number {
  const pts = getQtyCheckpoints(p, maxStock);
  if (!pts.length) return Math.min(maxStock, current + 1);
  for (const pt of pts) {
    if (pt > current) return pt;
  }
  // Más allá del último checkpoint: sigue sumando paquetes completos
  const packQty = getPackQty(p) || 1;
  return Math.min(maxStock, current + packQty);
}

/** Punto de control anterior hacia abajo (para el botón −). */
export function prevCheckpoint(p: VolumePricedProduct, current: number): number {
  const pts = getQtyCheckpoints(p);
  if (!pts.length) return Math.max(1, current - 1);
  const packQty = getPackQty(p) || 1;
  const last = pts[pts.length - 1];
  if (current > last) {
    // Bajando desde arriba del último checkpoint: resta paquetes
    const stepped = current - packQty;
    return stepped >= last ? stepped : last;
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    if (pts[i] < current) return pts[i];
  }
  return 1;
}
