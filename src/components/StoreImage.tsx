'use client';

import { useEffect, useState } from 'react';
import Image, { type ImageProps } from 'next/image';

const buckets = new Set([
  'importadora-carlitos.firebasestorage.app',
  'asistoraerp.firebasestorage.app',
  'geminai-449212.firebasestorage.app',
]);

// Only allow known public buckets into the paid image optimizer. Other image
// sources still render directly, including third-party and authenticated URLs.
function canOptimize(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return true;
  if (src.startsWith('/') && !src.startsWith('//')) return !src.startsWith('/api/');
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:') return false;
    if (url.hostname === 'storage.googleapis.com') return buckets.has(url.pathname.split('/')[1]);
    if (url.hostname === 'firebasestorage.googleapis.com') {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\//);
      return !!match && buckets.has(match[1]);
    }
  } catch {
    return false;
  }
  return false;
}

export default function StoreImage(props: ImageProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [props.src]);
  return <Image {...props} unoptimized={props.unoptimized || failed || !canOptimize(props.src)} onError={(event) => {
    if (!failed) setFailed(true);
    props.onError?.(event);
  }} />;
}
