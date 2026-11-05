import { jsPDF } from 'jspdf';

export type PosPriceLabel = {
  name: string;
  sku?: string;
  barcode?: string;
  unitPrice: number;
  quantityPrice?: number;
  quantity?: number;
  quantityLabel?: string;
  copies?: number;
};

export type LabelTheme = 'bw' | 'blue' | 'red' | 'green' | 'purple' | 'amber';
export type NumberWeight = 'normal' | 'heavy' | 'black';
export type TitleSize = 'small' | 'normal' | 'large' | 'giant';
export type PriceSize = 'normal' | 'large' | 'giant' | 'ultra';

export type PosPriceLabelConfig = {
  // Layout en hoja A4
  columns?: number; // 1, 2 o 3 (default: 2)
  rows?: number; // 2, 4, 5, 6, 8 (default: 5 -> 10 por hoja, 2 -> 4 por hoja)
  format?: 'a4' | 'letter';

  // Tema y colores
  theme?: LabelTheme;
  headerText?: string; // Ej: "Importadora Carlitos", "OFERTA", o vacío
  borderStyle?: 'dashed' | 'solid' | 'none';

  // Tipografía y tamaños ajustables
  fontSize?: 'normal' | 'large' | 'giant' | 'ultra'; // Compatibilidad
  priceSize?: PriceSize;
  titleSize?: TitleSize;
  numberWeight?: NumberWeight;

  // Opciones de visibilidad
  showSecondPrice?: boolean;
  secondPriceLabel?: string; // Ej: "X 6", "X 3", "PACK"
  showSku?: boolean;
  showBarcode?: boolean;
};

export const THEMES: Record<LabelTheme, {
  name: string;
  badgeBgHex: string;
  badgeTextHex: string;
  primary: [number, number, number];
  secondary: [number, number, number];
  border: [number, number, number];
  bgBadge: [number, number, number];
  textBadge: [number, number, number];
  textName: [number, number, number];
}> = {
  bw: {
    name: 'Blanco y Negro / Papel Flúor',
    badgeBgHex: '#e2e8f0',
    badgeTextHex: '#0f172a',
    primary: [0, 0, 0],
    secondary: [0, 0, 0],
    border: [0, 0, 0],
    bgBadge: [226, 232, 240],
    textBadge: [15, 23, 42],
    textName: [0, 0, 0],
  },
  blue: {
    name: 'Azul Importadora Carlitos (Corporativo)',
    badgeBgHex: '#0284c7',
    badgeTextHex: '#ffffff',
    primary: [15, 23, 42],
    secondary: [2, 132, 199],
    border: [56, 189, 248],
    bgBadge: [2, 132, 199],
    textBadge: [255, 255, 255],
    textName: [15, 23, 42],
  },
  red: {
    name: 'Rojo Oferta (Promoción)',
    badgeBgHex: '#e11d48',
    badgeTextHex: '#ffffff',
    primary: [190, 18, 60],
    secondary: [225, 29, 72],
    border: [244, 63, 94],
    bgBadge: [225, 29, 72],
    textBadge: [255, 255, 255],
    textName: [15, 23, 42],
  },
  green: {
    name: 'Verde Mayorista (Abarrotes)',
    badgeBgHex: '#059669',
    badgeTextHex: '#ffffff',
    primary: [20, 83, 45],
    secondary: [5, 150, 105],
    border: [16, 185, 129],
    bgBadge: [5, 150, 105],
    textBadge: [255, 255, 255],
    textName: [15, 23, 42],
  },
  purple: {
    name: 'Violeta Moderno (Destacado)',
    badgeBgHex: '#9333ea',
    badgeTextHex: '#ffffff',
    primary: [88, 28, 135],
    secondary: [147, 51, 234],
    border: [168, 85, 247],
    bgBadge: [147, 51, 234],
    textBadge: [255, 255, 255],
    textName: [15, 23, 42],
  },
  amber: {
    name: 'Ámbar Dorado',
    badgeBgHex: '#d97706',
    badgeTextHex: '#ffffff',
    primary: [120, 53, 15],
    secondary: [217, 119, 6],
    border: [245, 158, 11],
    bgBadge: [217, 119, 6],
    textBadge: [255, 255, 255],
    textName: [15, 23, 42],
  },
};

const formatPrice = (value: number) =>
  `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(value))}`;

const drawFittedPrice = (
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  initialSize: number,
  minSize: number,
  weight: NumberWeight = 'normal',
) => {
  let size = initialSize;
  pdf.setFontSize(size);
  while (pdf.getTextWidth(text) > maxWidth && size > minSize) {
    size -= 0.5;
    pdf.setFontSize(size);
  }
  pdf.text(text, x, y);

  // Grosor enriquecido mediante micro-trazos
  if (weight === 'heavy') {
    pdf.text(text, x + 0.12, y);
    pdf.text(text, x, y + 0.12);
  } else if (weight === 'black') {
    pdf.text(text, x + 0.16, y);
    pdf.text(text, x - 0.16, y);
    pdf.text(text, x, y + 0.16);
    pdf.text(text, x + 0.16, y + 0.16);
    pdf.text(text, x - 0.16, y + 0.16);
  }
};

const drawLabel = (
  pdf: jsPDF,
  item: PosPriceLabel,
  x: number,
  y: number,
  width: number,
  height: number,
  config: PosPriceLabelConfig = {},
) => {
  const theme = THEMES[config.theme || 'bw'] || THEMES.bw;
  const borderStyle = config.borderStyle || 'dashed';

  // Multiplicadores de tamaño
  const priceMultiplier =
    (config.priceSize === 'ultra' || config.fontSize === 'ultra') ? 1.45 :
    (config.priceSize === 'giant' || config.fontSize === 'giant') ? 1.30 :
    (config.priceSize === 'large' || config.fontSize === 'large') ? 1.15 : 1.0;

  const titleMultiplier =
    config.titleSize === 'giant' ? 1.45 :
    config.titleSize === 'large' ? 1.25 :
    config.titleSize === 'small' ? 0.85 : 1.0;

  const numberWeight: NumberWeight = config.numberWeight || 'normal';
  const showHeader = Boolean(config.headerText && config.headerText.trim());
  const showFooter = Boolean(config.showSku || config.showBarcode);

  // 1. Líneas de corte / borde
  if (borderStyle !== 'none') {
    pdf.setDrawColor(...theme.border);
    pdf.setLineWidth(borderStyle === 'solid' ? 0.35 : 0.2);
    if (borderStyle === 'dashed') {
      pdf.setLineDashPattern([1.2, 1.1], 0);
    } else {
      pdf.setLineDashPattern([], 0);
    }
    pdf.rect(x, y, width, height);
    pdf.setLineDashPattern([], 0);
  }

  // 2. Encabezado / Badge superior
  const contentTop = y + (height > 90 ? 7 : 5);
  if (showHeader) {
    const badgeText = config.headerText!.trim().toUpperCase();
    pdf.setFillColor(...theme.bgBadge);
    const badgeH = height > 90 ? 5.5 : 4.4;
    const badgeW = Math.min(width * 0.42, Math.max(24, pdf.getTextWidth(badgeText) + 8));
    pdf.roundedRect(x + width - badgeW - 3, y + 2.5, badgeW, badgeH, 1.2, 1.2, 'F');
    pdf.setTextColor(...theme.textBadge);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(height > 90 ? 8.5 : 7.5);
    pdf.text(badgeText, x + width - badgeW / 2 - 3, y + (height > 90 ? 6.2 : 5.2), { align: 'center' });
  }

  // 3. Nombre del producto (Título con tamaño ajustable)
  const name = String(item.name || 'Producto').trim();
  pdf.setTextColor(...theme.textName);
  pdf.setFont('helvetica', 'bold');
  const nameWidth = showHeader ? width - (height > 90 ? 48 : 42) : width - 8;

  // Escala base según altura de tarjeta (para tamaño 4-tarjetas 141mm escala automáticamente)
  const baseNameMax = Math.min(26, Math.max(9, Math.floor(height * (height > 90 ? 0.16 : 0.22))));
  let nameSize = Math.max(8.5, Math.round(baseNameMax * titleMultiplier));
  pdf.setFontSize(nameSize);

  const maxNameLines = height > 90 ? 3 : 2;
  let nameLines = pdf.splitTextToSize(name, nameWidth);
  while (nameLines.length > maxNameLines && nameSize > 8.5) {
    nameSize -= 0.5;
    pdf.setFontSize(nameSize);
    nameLines = pdf.splitTextToSize(name, nameWidth);
  }
  if (nameLines.length > maxNameLines) {
    nameLines = nameLines.slice(0, maxNameLines);
    let lastLine = nameLines[maxNameLines - 1];
    while (lastLine.length > 1 && pdf.getTextWidth(`${lastLine}…`) > nameWidth) {
      lastLine = lastLine.slice(0, -1);
    }
    nameLines[maxNameLines - 1] = `${lastLine}…`;
  }
  pdf.text(nameLines, x + 4, contentTop + 2, { lineHeightFactor: 1.05 });

  // Cálculo del área disponible para precios
  const nameBlockHeight = nameLines.length * (nameSize * 0.38) + 3;
  const priceAreaTop = contentTop + nameBlockHeight + (height > 90 ? 4 : 2);
  const footerHeight = showFooter ? (height > 90 ? 7 : 5.5) : 1.5;
  const priceAreaHeight = (y + height - footerHeight) - priceAreaTop;

  // 4. Precios
  const hasSecondPrice = Boolean(
    config.showSecondPrice !== false &&
    item.quantityPrice &&
    item.quantity &&
    item.quantity > 1,
  );

  pdf.setFont('helvetica', 'bold');

  if (hasSecondPrice) {
    // 2 Niveles de Precio: Unitario (arriba) + Pack X3 o X6 (abajo)
    const halfHeight = priceAreaHeight / 2;
    const unitY = priceAreaTop + halfHeight * 0.72;
    const packY = priceAreaTop + halfHeight + halfHeight * 0.72;

    // Precio Unitario (Arriba)
    pdf.setTextColor(...theme.primary);
    const unitText = formatPrice(item.unitPrice);
    const unitBadgeText = 'X 1';
    pdf.setFont('helvetica', 'bold');
    const unitBadgeFontSize = (height > 90 ? 17 : 13) * (priceMultiplier > 1.2 ? 1.1 : 1);
    pdf.setFontSize(unitBadgeFontSize);
    const unitBadgeW = pdf.getTextWidth(unitBadgeText);

    const unitMaxW = width - unitBadgeW - 10;
    const initialUnitSize = Math.min(height > 90 ? 68 : 48, Math.round(halfHeight * 2.1 * priceMultiplier));
    drawFittedPrice(pdf, unitText, x + 4, unitY, unitMaxW, initialUnitSize, 18, numberWeight);

    // Texto "X 1" limpio a la derecha (sin relleno ni contorno)
    pdf.setTextColor(...theme.primary);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(unitBadgeFontSize);
    pdf.text(unitBadgeText, x + width - 4, unitY, { align: 'right' });

    // Precio Pack (Abajo)
    pdf.setTextColor(...theme.secondary);
    const packText = formatPrice(item.quantityPrice!);
    const packLabel = item.quantityLabel || config.secondPriceLabel || (item.quantity ? `X ${item.quantity}` : 'PACK');
    pdf.setFont('helvetica', 'bold');
    const packBadgeFontSize = (height > 90 ? 19 : 15) * (priceMultiplier > 1.2 ? 1.1 : 1);
    pdf.setFontSize(packBadgeFontSize);
    const packBadgeW = pdf.getTextWidth(packLabel);

    const packMaxW = width - packBadgeW - 10;
    const initialPackSize = Math.min(height > 90 ? 78 : 54, Math.round(halfHeight * 2.4 * priceMultiplier));
    drawFittedPrice(pdf, packText, x + 4, packY, packMaxW, initialPackSize, 20, numberWeight);

    // Texto Pack ("X 6" o "X 3") limpio a la derecha (sin relleno ni contorno)
    pdf.setTextColor(...theme.secondary);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(packBadgeFontSize);
    pdf.text(packLabel, x + width - 4, packY, { align: 'right' });
  } else {
    // 1 Solo Precio Unitario Grande
    pdf.setTextColor(...theme.primary);
    const unitText = formatPrice(item.unitPrice);
    const priceY = priceAreaTop + priceAreaHeight * 0.72;

    const singleBadgeText = 'X 1';
    pdf.setFont('helvetica', 'bold');
    const singleBadgeFontSize = (height > 90 ? 22 : 17) * (priceMultiplier > 1.2 ? 1.1 : 1);
    pdf.setFontSize(singleBadgeFontSize);
    const singleBadgeW = pdf.getTextWidth(singleBadgeText);

    const initialSingleSize = Math.min(height > 90 ? 104 : 76, Math.round(priceAreaHeight * 1.5 * priceMultiplier));
    drawFittedPrice(
      pdf,
      unitText,
      x + 4,
      priceY,
      width - singleBadgeW - 12,
      initialSingleSize,
      24,
      numberWeight,
    );

    // Texto "X 1" limpio a la derecha (sin relleno ni contorno)
    pdf.setTextColor(...theme.primary);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(singleBadgeFontSize);
    pdf.text(singleBadgeText, x + width - 4, priceY, { align: 'right' });
  }

  // 5. Pie de etiqueta: SKU y Código de Barras
  if (showFooter) {
    pdf.setTextColor(100, 116, 139);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(height > 90 ? 8.5 : 7);
    const footerY = y + height - (height > 90 ? 2.8 : 2);
    if (config.showSku && item.sku) {
      pdf.text(`SKU: ${item.sku}`, x + 4, footerY);
    }
    if (config.showBarcode && item.barcode) {
      pdf.text(`BARRA: ${item.barcode}`, x + width - 4, footerY, { align: 'right' });
    }
  }
};

export function createPosPriceLabelsPdf(
  labels: PosPriceLabel[],
  config: PosPriceLabelConfig = {},
) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: config.format || 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const marginX = 6;
  const marginY = 6;
  const gapX = 4;
  const gapY = 3;

  const columns = config.columns && config.columns > 0 ? config.columns : 2;
  const rows = config.rows && config.rows > 0 ? config.rows : 5;

  const labelWidth = (pageWidth - marginX * 2 - gapX * (columns - 1)) / columns;
  const labelHeight = (pageHeight - marginY * 2 - gapY * (rows - 1)) / rows;

  // Multiplicar según número de copias
  const expandedLabels: PosPriceLabel[] = [];
  labels.forEach(label => {
    const copies = Math.max(1, Math.min(100, Number(label.copies) || 1));
    for (let c = 0; c < copies; c++) {
      expandedLabels.push(label);
    }
  });

  expandedLabels.forEach((label, index) => {
    if (index > 0 && index % (columns * rows) === 0) {
      pdf.addPage(config.format || 'a4', 'portrait');
    }
    const position = index % (columns * rows);
    const column = position % columns;
    const row = Math.floor(position / columns);
    const x = marginX + column * (labelWidth + gapX);
    const y = marginY + row * (labelHeight + gapY);
    drawLabel(pdf, label, x, y, labelWidth, labelHeight, config);
  });

  return pdf;
}
