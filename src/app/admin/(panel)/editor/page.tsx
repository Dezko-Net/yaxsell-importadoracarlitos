'use client';

const FF = '"DM Sans","Proxima Nova",-apple-system,BlinkMacSystemFont,sans-serif';

export default function HeroBannerEditorPage() {
  return (
    <div style={{ maxWidth: 800, margin: '60px auto', padding: '35px', fontFamily: FF, textAlign: 'center', backgroundColor: '#fff', borderRadius: '20px', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6' }}>
      <div style={{ fontSize: '64px', marginBottom: '24px' }}>⚙️</div>
      <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#111827', margin: '0 0 12px', letterSpacing: '-0.5px' }}>
        Editor Desactivado
      </h1>
      <p style={{ fontSize: '15px', color: '#4b5563', lineHeight: '1.6', maxWidth: '580px', margin: '0 auto 28px' }}>
        El cambio dinámico de banners ha sido removido del panel de administración para evitar consultas (reads) repetitivas a la base de datos de Appwrite y reducir costos de cuota diaria.
      </p>
      <div style={{ backgroundColor: '#f9fafb', padding: '20px 24px', borderRadius: '16px', textAlign: 'left', fontSize: '13.5px', color: '#1f2937', borderLeft: '4px solid #6366f1', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
        <p style={{ fontWeight: 'bold', margin: '0 0 10px', color: '#111827', fontSize: '14px' }}>¿Cómo cambiar los banners ahora?</p>
        <p style={{ margin: '0 0 8px', color: '#4b5563' }}>Los banners ahora se configuran de forma manual directamente en el archivo del storefront:</p>
        <code style={{ display: 'block', backgroundColor: '#f3f4f6', padding: '12px 16px', borderRadius: '8px', fontFamily: 'Consolas, Monaco, monospace', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre', border: '1px solid #e5e7eb', color: '#111827' }}>
{`// Archivo: src/templates/plantilla23/HomePage.tsx

const MANUAL_HERO_CONFIG = {
  hero1: {
    desktopImg: '',  // Dejar vacío para usar el video original
    mobileImg: '',   // Dejar vacío para usar el video original
    title: 'Poderosamente Bella',
    btnText: 'Tienda',
    btnLink: '/productos',
  },
  hero2: {
    desktopImg: 'https://...', // URL de imagen Yaxbot (PC)
    mobileImg: 'https://...',  // URL de imagen Yaxbot (Móvil)
  }
};`}
        </code>
      </div>
    </div>
  );
}
