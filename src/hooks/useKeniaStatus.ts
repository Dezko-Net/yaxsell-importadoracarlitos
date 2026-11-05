'use client';

import { useEffect, useState } from 'react';

// Singleton cache: shared across all components that need kenia-status
let cachedEnabled: boolean | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let pendingPromise: Promise<boolean> | null = null;

async function loadKeniaStatus(): Promise<boolean> {
  const now = Date.now();
  if (cachedEnabled !== null && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedEnabled;
  }
  if (pendingPromise) return pendingPromise;

  pendingPromise = (async () => {
    try {
      const res = await fetch('/api/public-data/kenia-status');
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.isEnabled === 'boolean') {
          cachedEnabled = data.isEnabled;
          cacheTimestamp = Date.now();
          return data.isEnabled;
        }
      }
    } catch {
      // fall through to default
    }
    cachedEnabled = true;
    cacheTimestamp = Date.now();
    return true;
  })().finally(() => {
    pendingPromise = null;
  });

  return pendingPromise;
}

export function useKeniaStatus() {
  const [isEnabled, setIsEnabled] = useState<boolean>(cachedEnabled ?? true);
  const [isLoading, setIsLoading] = useState(cachedEnabled === null);

  useEffect(() => {
    let cancelled = false;
    loadKeniaStatus().then((enabled) => {
      if (cancelled) return;
      setIsEnabled(enabled);
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { isEnabled, isLoading };
}
