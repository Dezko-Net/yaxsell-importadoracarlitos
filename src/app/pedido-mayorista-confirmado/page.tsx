'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense, useEffect } from 'react';
import { CheckCircle, Package, MessageCircle, Clock, ArrowRight } from 'lucide-react';

const FF = '"DM Sans", system-ui, sans-serif';

function ConfirmacionMayoristaInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';

  // Lock body scroll on mount (prevents background scroll on mobile)
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);

  return (
    <div className="pk-mayorista-confirm" style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#fef9f4 0%,#fff 300px)', fontFamily: FF, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        {/* Success icon */}
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#fef9f4,#eed9c4)', border: '2px solid #eed9c4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 8px 32px rgba(198,139,89,0.15)' }}>
          <CheckCircle size={38} color="#c68b59" />
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(90deg,#c68b59,#e09b6f)', color: '#fff', padding: '4px 14px', borderRadius: 999, fontSize: 11, fontWeight: 800, marginBottom: 16, letterSpacing: '0.04em' }}>
          PEDIDO MAYORISTA RECIBIDO
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 900, color: '#5c3d24', margin: '0 0 12px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          ¡Solicitud enviada!
        </h1>
        <p style={{ fontSize: 15, color: '#92400e', margin: '0 0 32px', lineHeight: 1.6 }}>
          Hemos recibido tu pedido mayorista correctamente. Antes del pago, verificaremos la disponibilidad de stock de cada producto.
        </p>

        {/* Steps */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #eed9c4', padding: '24px', marginBottom: 24, textAlign: 'left', boxShadow: '0 4px 20px rgba(198,139,89,0.08)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#5c3d24', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>¿Qué pasa ahora?</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { icon: <Clock size={16} color="#c68b59" />, title: 'Verificación de stock', desc: 'Revisamos la disponibilidad de cada producto en tu pedido.' },
              { icon: <MessageCircle size={16} color="#c68b59" />, title: 'Te avisamos por WhatsApp', desc: 'Te contactamos para confirmarte qué productos hay disponibles.' },
              { icon: <Package size={16} color="#c68b59" />, title: 'Confirmás y pagás', desc: 'Desde "Mis Pedidos Mayoristas" podés ver el estado y confirmar.' },
            ].map((step, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fef9f4', border: '1.5px solid #eed9c4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {step.icon}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#374151' }}>{step.title}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af', lineHeight: 1.4 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {id && (
          <p style={{ fontSize: 11, color: '#b0b0b0', margin: '0 0 24px', fontFamily: 'monospace' }}>
            Código de solicitud: {id.slice(-10).toUpperCase()}
          </p>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link href="/cuenta/pedidos-mayoristas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 24px', background: 'linear-gradient(135deg,#c68b59,#e09b6f)', color: '#fff', borderRadius: 14, fontSize: 14, fontWeight: 800, textDecoration: 'none', boxShadow: '0 6px 20px rgba(198,139,89,0.25)' }}>
            <Package size={16} /> Ver mis pedidos mayoristas <ArrowRight size={14} />
          </Link>
          <Link href="/productos" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 24px', background: '#fef9f4', color: '#c68b59', borderRadius: 14, fontSize: 13, fontWeight: 700, textDecoration: 'none', border: '1.5px solid #eed9c4' }}>
            Seguir comprando
          </Link>
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .pk-mayorista-confirm { padding: 16px 12px calc(70px + env(safe-area-inset-bottom, 0px)) !important; }
          .pk-mayorista-confirm h1 { font-size: 24px !important; }
          .pk-mayorista-confirm > div { max-width: 100% !important; }
          .tpl1-bottom-nav { display: none !important; }
        }
      `}</style>
    </div>
  );
}

export default function PedidoMayoristaConfirmadoPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Cargando...</div>}>
      <ConfirmacionMayoristaInner />
    </Suspense>
  );
}
