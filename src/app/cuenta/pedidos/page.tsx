'use client';

import CuentaPageShell from '@/components/cuenta/CuentaPageShell';
import PedidosMultiChannelSection from '@/components/cuenta/PedidosMultiChannelSection';
import { useCuentaBg } from '../CuentaBgContext';

const BG_PEDIDOS = 'https://img.freepik.com/free-photo/shipment-delivery-by-truck-bell-notification-delivery-transportation-concept-3d-rendering_56104-1309.jpg?semt=ais_hybrid&w=740&q=80';

export default function MisPedidosPage() {
  useCuentaBg(BG_PEDIDOS);

  return (
    <CuentaPageShell
      title="Mis Pedidos"
      subtitle="Sigue tus compras de WhatsApp y tienda Web en tiempo real"
    >
      <PedidosMultiChannelSection defaultTab="whatsapp" showHeaderTitle={false} />
    </CuentaPageShell>
  );
}
