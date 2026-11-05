'use client';

import dynamic from 'next/dynamic';

const WhatsAppButton = dynamic(() => import('./WhatsAppButton'), { ssr: false });

export default function ClientSideWidgets() {
  return <WhatsAppButton />;
}
