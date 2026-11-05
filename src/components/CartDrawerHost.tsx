'use client';

import { useEffect, useState } from 'react';
import CartDrawer from '@/components/CartDrawer';

export default function CartDrawerHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openCart = () => setOpen(true);
    const closeCart = () => setOpen(false);
    window.addEventListener('yaxsel:open-cart', openCart);
    window.addEventListener('yaxsel:close-cart', closeCart);

    // Escuchar postMessage del iframe del catálogo (/productos)
    // para abrir el React CartDrawer en lugar del drawer interno del iframe.
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'YAXSEL_OPEN_CART') {
        setOpen(true);
      }
    };
    window.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('yaxsel:open-cart', openCart);
      window.removeEventListener('yaxsel:close-cart', closeCart);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return <CartDrawer open={open} onClose={() => setOpen(false)} />;
}
