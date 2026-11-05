'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

/**
 * Hook que devuelve el número de pedidos del usuario con estado 'paid'
 * (Stock confirmado — esperando transferencia bancaria).
 * También retorna el $id del primer pedido para enlace directo.
 * Refresca cada 5 minutos.
 *
 * NOTA: los pedidos se pueden crear con USERID = 'guest' (checkout sin sesión)
 * o con un id distinto, pero siempre guardan CUSTOMEREMAIL. Por eso la API
 * replica la misma cadena de fallback que usa /cuenta/pedidos: USERID ->
 * CUSTOMEREMAIL -> userId (minúsculas). Sin este fallback el conteo queda en 0
 * para pedidos hechos como invitado.
 *
 * ⚠️ Este hook se monta en GlobalMobileNav, que vive en el ROOT LAYOUT: corre en
 * TODAS las páginas. Antes consultaba 'orders' con el SDK del navegador —una
 * colección fuera de PUBLIC_CACHEABLE_COLLECTIONS, o sea sin caché de ningún
 * tipo— cada 60s y hasta 3 veces por ciclo. Ahora pega a una API cacheada 5 min
 * (ver src/app/api/public-data/my-orders-status/route.ts) y el ClientFetchCache
 * deduplica entre navegaciones. NO le pongas cache: 'no-store' al fetch: eso
 * anula el interceptor y revive la fuga.
 */
export function useStockConfirmedOrders() {
  const { user, isLoggedIn, isLoading } = useAuth();
  const [stockConfirmedCount, setStockConfirmedCount] = useState(0);
  const [firstOrderId, setFirstOrderId] = useState<string | null>(null);
  const [firstOrderStatus, setFirstOrderStatus] = useState<string | null>(null);
  const [shippedCount, setShippedCount] = useState(0);
  const [shippedOrderId, setShippedOrderId] = useState<string | null>(null);
  const [shippedStatus, setShippedStatus] = useState<string | null>(null);
  const [firstUpdatedAt, setFirstUpdatedAt] = useState<number | null>(null);
  const [shippedUpdatedAt, setShippedUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (isLoading || !isLoggedIn || !user?.id) {
      setStockConfirmedCount(0);
      setFirstOrderId(null);
      setFirstOrderStatus(null);
      setShippedCount(0);
      setShippedOrderId(null);
      setShippedStatus(null);
      setFirstUpdatedAt(null);
      setShippedUpdatedAt(null);
      return;
    }

    let active = true;

    const fetchOrders = async () => {
      try {
        const res = await fetch(
          `/api/public-data/my-orders-status?userId=${encodeURIComponent(user.id)}` +
          `&email=${encodeURIComponent(user.email || '')}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (active) {
          setStockConfirmedCount(data.count || 0);
          setFirstOrderId(data.firstOrderId ?? null);
          setFirstOrderStatus(data.firstOrderStatus ?? null);
          setShippedCount(data.shippedCount || 0);
          setShippedOrderId(data.shippedOrderId ?? null);
          setShippedStatus(data.shippedStatus ?? null);
          setFirstUpdatedAt(data.firstUpdatedAt ?? null);
          setShippedUpdatedAt(data.shippedUpdatedAt ?? null);
        }
      } catch {
        if (active) {
          setStockConfirmedCount(0);
          setFirstOrderId(null);
          setFirstOrderStatus(null);
          setShippedCount(0);
          setShippedOrderId(null);
          setShippedStatus(null);
          setFirstUpdatedAt(null);
          setShippedUpdatedAt(null);
        }
      }
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 86_400_000); // 24h — el evento 'orders-updated' refresca si hay cambio

    const onOrdersUpdated = () => fetchOrders();
    window.addEventListener('orders-updated', onOrdersUpdated);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('orders-updated', onOrdersUpdated);
    };
  }, [isLoggedIn, isLoading, user?.id, user?.email]);

  return { stockConfirmedCount, firstOrderId, firstOrderStatus, firstUpdatedAt, shippedCount, shippedOrderId, shippedStatus, shippedUpdatedAt };
}
