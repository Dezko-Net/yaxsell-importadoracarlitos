'use client';

import { useState, type CSSProperties, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Package, Plus } from 'lucide-react';
import styles from './pos-product-card.module.css';
import StoreImage from '@/components/StoreImage';

type PriceOption = { field: string; label: string; formatted: string };
type ImagePreviewPosition = {
  left: number;
  top: number;
  accent: string;
  accentBorder: string;
  panel: string;
  panelSub: string;
  soft: string;
  ink: string;
};

// Presentation only: pricing, stock validation and cart writes stay in the POS page.
export default function PosProductCard({ name, sku, image, stock, stockLabel, price, prices, selectedPrice, cost, packageLabel, boxCode, barcode, reservation, onAdd, onImage, onPriceChange, proMode = false }: {
  name: string; sku: string; image?: string; stock: number; stockLabel: string;
  price: string; prices: PriceOption[]; selectedPrice?: string; cost?: string;
  packageLabel?: string; boxCode?: string; barcode?: string;
  reservation?: { label: string; detail: string };
  proMode?: boolean;
  onAdd: () => void; onImage: () => void; onPriceChange: (field: string) => void;
}) {
  const [previewPosition, setPreviewPosition] = useState<ImagePreviewPosition | null>(null);

  const showImagePreview = (event: MouseEvent<HTMLButtonElement>) => {
    if (!image || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const previewWidth = 240;
    const previewHeight = 320;
    const gap = 12;
    const opensLeft = rect.right + previewWidth + gap > window.innerWidth;
    const left = opensLeft
      ? Math.max(12, rect.left - previewWidth - gap)
      : Math.min(rect.right + gap, window.innerWidth - previewWidth - 12);
    const top = Math.max(12, Math.min(
      rect.top + rect.height / 2 - previewHeight / 2,
      window.innerHeight - previewHeight - 12,
    ));
    const themeRoot = event.currentTarget.closest<HTMLElement>('[data-pos-personal-theme="true"]');
    const theme = window.getComputedStyle(themeRoot || document.documentElement);
    const themeColor = (property: string, fallback: string) => theme.getPropertyValue(property).trim() || fallback;

    setPreviewPosition({
      left,
      top,
      accent: themeColor('--pos-accent', '#087f73'),
      accentBorder: themeColor('--pos-personal-accent-border', '#a7dfd0'),
      panel: themeColor('--pos-panel-bg', '#fff'),
      panelSub: themeColor('--pos-panel-sub-bg', '#f8fafc'),
      soft: themeColor('--pos-soft', '#f5f7f3'),
      ink: themeColor('--pos-ink', '#21352c'),
    });
  };

  return <article data-pos="product-card" className={styles.card}>
    <div className={styles.top}>
      {image ? <button
        type="button"
        data-pos="product-image"
        className={styles.image}
        onClick={onImage}
        onMouseEnter={showImagePreview}
        onMouseLeave={() => setPreviewPosition(null)}
        aria-label={`Ampliar imagen de ${name}`}
      >
        <StoreImage src={image} alt="" width={112} height={128} loading="lazy" />
        <span aria-hidden="true"><Maximize2 size={12} /></span>
      </button> : <button type="button" data-pos="product-image" className={styles.image} onClick={onImage} aria-label={`Ver o editar ${name}`} title={`Ver o editar ${name}`}>
        <Package size={24} />
      </button>}
      <button type="button" onClick={onAdd} className={styles.add} aria-label={`Agregar ${name}, ${price}`}>
        <span className={styles.description}>
          <strong title={name}>{name}</strong>
          <span className={styles.sku}>SKU {sku}</span>
          <span data-pos="product-price" className={styles.price}>{price}</span>
        </span>
        <span data-pos="product-plus" className={styles.plus} aria-hidden="true"><Plus size={19} /></span>
      </button>
    </div>
    <div className={styles.meta}>
      <span data-pos="product-stock" className={styles.stock} data-level={stock <= 0 ? 'empty' : stock <= 10 ? 'low' : 'available'}>{stockLabel}</span>
      {packageLabel && <span>{packageLabel}</span>}
      {reservation && <span className={styles.reserved} title={reservation.detail}>{reservation.label}</span>}
    </div>
    {(boxCode || barcode || cost) && <div className={styles.details}>
      {boxCode && <span>Caja: {boxCode}</span>}
      {barcode && <span title="Código de barras">{barcode}</span>}
      {cost && <span>Costo: {cost}</span>}
    </div>}
    {prices.length > 1 ? <label data-pos="product-price-bar" className={styles.priceSelector}>
      <span>Precio</span>
      <select aria-label={`Precio de ${name}`} value={selectedPrice} onChange={event => onPriceChange(event.target.value)}>
        {prices.map(option => <option key={option.field} value={option.field}>{option.label} · {option.formatted}</option>)}
      </select>
    </label> : prices[0] && <div className={styles.singlePrice}>{prices[0].label}</div>}
    {image && previewPosition && typeof document !== 'undefined' && createPortal(
      <div
        className={styles.preview}
        style={{
          left: previewPosition.left,
          top: previewPosition.top,
          '--pos-accent': previewPosition.accent,
          '--pos-personal-accent-border': previewPosition.accentBorder,
          '--pos-panel-bg': previewPosition.panel,
          '--pos-panel-sub-bg': previewPosition.panelSub,
          '--pos-soft': previewPosition.soft,
          '--pos-ink': previewPosition.ink,
        } as CSSProperties}
        aria-hidden="true"
      >
        <StoreImage src={image} alt="" width={480} height={600} className={styles.previewImage} />
        <span className={styles.previewCaption}>{name}</span>
      </div>,
      document.body,
    )}
  </article>;
}
