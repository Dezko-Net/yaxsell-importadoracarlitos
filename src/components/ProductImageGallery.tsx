'use client';

import { useMemo, useState } from 'react';
import { Product } from '@/types';
import { resolveStorageImageUrl } from '@/lib/product-images';
import StoreImage from '@/components/StoreImage';

const IMAGE_KEYS = ['IMAGEURL', 'IMAGEURL2', 'IMAGEURL3', 'IMAGEURL4', 'IMAGEURL5'] as const;

export function getProductImages(product: Product): string[] {
  const storedImages = Array.isArray((product as any).images) ? (product as any).images : [];
  const values = storedImages.length > 0 ? storedImages : IMAGE_KEYS.map(key => (product as any)[key]);
  return values.map((value: unknown) => resolveStorageImageUrl(typeof value === 'string' ? value : '')).filter(Boolean);
}

type Props = {
  product: Product;
  alt?: string;
  onImageClick?: (imageSrc: string) => void;
  sizes?: string;
  compact?: boolean;
  hideThumbnails?: boolean;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
};

export default function ProductImageGallery({ product, alt, onImageClick, sizes = '(max-width: 768px) 50vw, 25vw', compact = false, hideThumbnails = false, activeIndex: controlledIndex, onActiveIndexChange }: Props) {
  const images: string[] = useMemo(() => getProductImages(product), [product]);
  const [internalIndex, setInternalIndex] = useState(0);
  const activeIndex = controlledIndex ?? internalIndex;
  const setActiveIndex = (i: number) => {
    if (onActiveIndexChange) onActiveIndexChange(i);
    else setInternalIndex(i);
  };
  const activeImage = images[activeIndex] || images[0];
  const productAlt = alt || product.NAME || 'Producto';

  return (
    <div style={{ width: '100%', position: 'relative', zIndex: 2 }}>
      <div
        onClick={() => onImageClick?.(activeImage)}
        style={{ position: 'relative', aspectRatio: '1 / 1', width: '100%', cursor: onImageClick ? 'pointer' : 'default', background: '#fff', overflow: 'hidden' }}
      >
        {activeImage ? (
          <StoreImage
            src={activeImage}
            alt={productAlt}
            referrerPolicy="no-referrer"
            loading="lazy"
            fill
            sizes={sizes}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              backgroundColor: '#fff',
            }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: compact ? 36 : 48, color: '#facc15' }}>📦</div>
        )}
      </div>
      {!hideThumbnails && images.length > 0 && (
        <div role="group" aria-label={`Imágenes de ${productAlt}`} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: compact ? 6 : 7, padding: compact ? '8px 4px 10px' : '9px 4px 12px' }}>
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              aria-label={`Ver imagen ${index + 1} de ${images.length}`}
              aria-pressed={index === activeIndex}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setActiveIndex(index);
              }}
              style={{ width: compact ? 21 : 34, height: compact ? 21 : 34, padding: 2, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', flexShrink: 0, border: `${index === activeIndex ? 2 : 1}px solid ${index === activeIndex ? '#eab308' : '#e5e7eb'}`, background: '#fff', boxShadow: index === activeIndex ? '0 0 0 2px rgba(234,179,8,0.14)' : 'none', opacity: index === activeIndex ? 1 : 0.78, transition: 'all 0.18s ease' }}
            >
              <StoreImage src={image} alt="" width={68} height={68} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%', display: 'block', background: '#fff' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type ThumbnailsProps = {
  images: string[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  compact?: boolean;
};

export function ProductThumbnails({ images, activeIndex, onIndexChange, compact = false }: ThumbnailsProps) {
  if (!images || images.length <= 1) return null;
  return (
    <div role="group" className="pk-card-thumbs" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: compact ? 5 : 6, flexShrink: 0 }}>
      {images.map((image, index) => (
        <button
          key={`${image}-${index}`}
          type="button"
          aria-label={`Ver imagen ${index + 1} de ${images.length}`}
          aria-pressed={index === activeIndex}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onIndexChange(index);
          }}
          style={{ width: compact ? 20 : 28, height: compact ? 20 : 28, padding: 2, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', flexShrink: 0, border: `${index === activeIndex ? 2 : 1}px solid ${index === activeIndex ? '#3b82f6' : '#e5e7eb'}`, background: '#fff', opacity: index === activeIndex ? 1 : 0.6, transition: 'all 0.18s ease' }}
        >
          <StoreImage src={image} alt="" width={56} height={56} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%', display: 'block' }} />
        </button>
      ))}
    </div>
  );
}
