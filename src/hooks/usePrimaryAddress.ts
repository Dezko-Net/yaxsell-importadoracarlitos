'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  syncAddressesForUser,
  getPrimaryAddressLabel,
  TPL1_ADDRESS_UPDATED,
} from '@/lib/addresses';

// ── Caché simple ──
let addrCacheLabel: string | null = null;
let addrCacheTimestamp = 0;
let addrCacheUserId: string | null = null;
const ADDR_CACHE_TTL = 60 * 1000; // 1 minuto

// Global lock to prevent concurrent fetches and event storm loops
let isGloballyRefreshing = false;

export function usePrimaryAddress() {
  const { user, isLoggedIn } = useAuth();
  const [primaryAddress, setPrimaryAddress] = useState<string | null>(
    addrCacheUserId === user?.id ? addrCacheLabel : null
  );
  
  // Guard to avoid self-triggering within the same instance
  const isRefreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (!isLoggedIn || !user?.id) {
      setPrimaryAddress(null);
      return;
    }
    
    // Use cache if fresh and for the same user
    const now = Date.now();
    if (addrCacheUserId === user.id && (now - addrCacheTimestamp) < ADDR_CACHE_TTL && addrCacheLabel !== null) {
      setPrimaryAddress(addrCacheLabel);
      return;
    }
    
    if (isGloballyRefreshing) return;
    isGloballyRefreshing = true;
    isRefreshing.current = true;
    
    try {
      const list = await syncAddressesForUser(user.id);
      const label = getPrimaryAddressLabel(list);
      
      const hasChanged = label !== addrCacheLabel || user.id !== addrCacheUserId;
      setPrimaryAddress(label);
      addrCacheLabel = label;
      addrCacheTimestamp = Date.now();
      addrCacheUserId = user.id;
      
      if (hasChanged) {
        window.dispatchEvent(
          new CustomEvent(TPL1_ADDRESS_UPDATED, { detail: { label } })
        );
      }
    } catch (err) {
      console.error('[usePrimaryAddress] Error in refresh:', err);
    } finally {
      isRefreshing.current = false;
      isGloballyRefreshing = false;
    }
  }, [isLoggedIn, user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user?.id) return;
    
    const onStorage = (e: StorageEvent) => {
      if (e.key === `addr_${user.id}`) {
        addrCacheTimestamp = 0;
        refresh();
      }
    };
    
    const onCustom = (e: Event) => {
      // If this instance is currently in the middle of refreshing, ignore external updates
      if (isRefreshing.current) return;
      
      const customEv = e as CustomEvent;
      const label = customEv.detail?.label;
      
      if (label === undefined) {
        // Event from addresses manager without a label payload (needs a fresh sync)
        addrCacheTimestamp = 0;
        refresh();
      } else if (label !== primaryAddress) {
        // Synchronize state from payload directly without re-fetching
        setPrimaryAddress(label);
        addrCacheLabel = label;
        addrCacheTimestamp = Date.now();
        addrCacheUserId = user.id;
      }
    };
    
    const onFocus = () => {
      if (Date.now() - addrCacheTimestamp > 30 * 1000) {
        refresh();
      }
    };
    
    window.addEventListener('storage', onStorage);
    window.addEventListener(TPL1_ADDRESS_UPDATED, onCustom);
    window.addEventListener('focus', onFocus);
    
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(TPL1_ADDRESS_UPDATED, onCustom);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id, primaryAddress, refresh]);

  return { primaryAddress, refreshPrimaryAddress: refresh };
}
