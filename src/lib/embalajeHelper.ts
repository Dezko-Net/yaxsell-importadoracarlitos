import skuEmbalajesJson from './skuEmbalajesMap.json';
import skuBoxCodesJson from './skuBoxCodesMap.json';

export const SKU_EMBALAJES_MAP: Record<string, number> = skuEmbalajesJson as Record<string, number>;
export const SKU_BOX_CODES_MAP: Record<string, string> = skuBoxCodesJson as Record<string, string>;

export interface EmbalajeResolvable {
  sku?: string;
  nombre?: string;
  cantidad?: number;
  embalajeQty?: number | null;
  packageQty?: string | number | null;
  boxCode?: string | null;
  codigoCaja?: string | null;
}

/**
 * Obtiene el código de caja asignado a un producto (ej: '8781', '0802', '3B-2605R').
 * Prioridad:
 * 1. item.boxCode / item.codigoCaja explícito
 * 2. Mapeo SKU_BOX_CODES_MAP por SKU
 */
export function resolveBoxCode(item: { sku?: string; boxCode?: string | null; codigoCaja?: string | null }): string {
  if (item.boxCode && item.boxCode.trim()) {
    return item.boxCode.trim();
  }
  if (item.codigoCaja && item.codigoCaja.trim()) {
    return item.codigoCaja.trim();
  }
  if (item.sku) {
    const cleanSku = item.sku.trim().toUpperCase();
    return SKU_BOX_CODES_MAP[cleanSku] || '';
  }
  return '';
}

/**
 * Genera la etiqueta del código que se imprime en la boleta para el bodeguero:
 * Si el producto tiene código de caja, imprime "(COD 8781)" o "(COD 0802)".
 * Si no tiene código de caja, imprime el SKU "(IDB1007)" como respaldo.
 */
export function formatProductCodeLabel(item: { sku?: string; boxCode?: string | null; codigoCaja?: string | null }): string {
  const bc = resolveBoxCode(item);
  if (bc) {
    const cleanBc = bc.replace(/^COD[:\s\-]*/i, '').trim();
    return `(COD ${cleanBc})`;
  }
  if (item.sku && item.sku !== '-') {
    return `(${item.sku})`;
  }
  return '';
}

/**
 * Obtiene numéricamente la cantidad por embalaje asignada a un producto.
 * Prioridad:
 * 1. item.embalajeQty (numérico explícito)
 * 2. item.packageQty (ej: "24PCS" -> 24)
 * 3. Mapa SKU_EMBALAJES_MAP por SKU
 * Retorna el número de unidades por embalaje si es válido (> 1), o 0 si no tiene.
 */
export function resolveEmbalajeQty(item: EmbalajeResolvable): number {
  if (item.embalajeQty && typeof item.embalajeQty === 'number' && item.embalajeQty > 1) {
    return item.embalajeQty;
  }
  if (item.packageQty) {
    if (typeof item.packageQty === 'number' && item.packageQty > 1) {
      return item.packageQty;
    }
    if (typeof item.packageQty === 'string') {
      const match = item.packageQty.match(/\d+/);
      if (match) {
        const val = parseInt(match[0], 10);
        if (val > 1) return val;
      }
    }
  }
  if (item.sku) {
    const cleanSku = item.sku.trim().toUpperCase();
    const mapVal = SKU_EMBALAJES_MAP[cleanSku];
    if (mapVal && mapVal > 1) return mapVal;
  }
  return 0;
}

/**
 * Calcula cuántos embalajes completos y unidades sueltas componen la cantidad.
 * Condición:
 * - El producto debe tener cantidad por embalaje asignada (embQty > 1).
 * - La cantidad comprada debe incluir al menos 1 embalaje completo.
 */
export function isEmbalajeCerrado(item: EmbalajeResolvable): { esCerrado: boolean; numEmbalajes: number; embQty: number; unidadesSueltas: number } {
  const qty = Number(item.cantidad || 0);
  const embQty = resolveEmbalajeQty(item);

  if (embQty > 1 && qty >= embQty) {
    const numEmbalajes = Math.floor(qty / embQty);
    return { esCerrado: true, numEmbalajes, embQty, unidadesSueltas: qty % embQty };
  }

  return { esCerrado: false, numEmbalajes: 0, embQty, unidadesSueltas: qty };
}

/**
 * Entrega los componentes desglosados del texto de embalaje para estilizado fino:
 * - boldPart: "(X embalajes)" -> solo esta parte va en negrita gruesa para el bodeguero
 * - restPart indica el tamaño del embalaje o las unidades sueltas restantes.
 */
export function getEmbalajeHtmlParts(item: EmbalajeResolvable): {
  esCerrado: boolean;
  numEmbalajes: number;
  embWord: string;
  embQty: number;
  unidadesSueltas: number;
  boldPart: string;
  restPart: string;
  fullText: string;
  whatsappText: string;
} | null {
  const { esCerrado, numEmbalajes, embQty, unidadesSueltas } = isEmbalajeCerrado(item);
  if (!esCerrado) return null;

  const embWord = numEmbalajes === 1 ? 'embalaje' : 'embalajes';
  const boldPart = `(${numEmbalajes} ${embWord})`;
  const unidadWord = unidadesSueltas === 1 ? 'unidad suelta' : 'unidades sueltas';
  const restPart = unidadesSueltas > 0
    ? ` y ${unidadesSueltas} ${unidadWord}`
    : ` de ${embQty} unidades`;
  const fullText = `${boldPart}${restPart}`;
  const whatsappText = `*${boldPart}*${restPart}`;

  return {
    esCerrado: true,
    numEmbalajes,
    embWord,
    embQty,
    unidadesSueltas,
    boldPart,
    restPart,
    fullText,
    whatsappText,
  };
}

/**
 * Genera la etiqueta en texto plano para la boleta al lado del nombre del producto:
 * Ejemplos:
 * - 40 unidades con emb 10: " (4 embalajes) de 10 unidades"
 * - 41 unidades con emb 10: " (4 embalajes) y 1 unidad suelta"
 * - 23 unidades con emb 24: "" (no completa ningún embalaje)
 * - Sin embalaje o compra menor al embalaje: "" (sigue como está)
 */
export function formatEmbalajeBoletaLabel(item: EmbalajeResolvable): string {
  const parts = getEmbalajeHtmlParts(item);
  if (!parts) return '';
  return ` ${parts.fullText}`;
}
