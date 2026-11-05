'use client';

/** Skeleton premium para hero + header mientras carga la home (solo móvil). */
export default function HeroSkeletonMobile({ visible = true }: { visible?: boolean }) {
  if (!visible) return null;

  return (
    <div className="tpl1-hero-skeleton" aria-hidden aria-busy="true">
      <style>{`
        .tpl1-hero-skeleton {
          position: fixed;
          inset: 0;
          z-index: 9990;
          pointer-events: none;
          background: linear-gradient(180deg, #fdf2f8 0%, #fce7f3 40%, #fdf2f8 100%);
          display: flex;
          flex-direction: column;
        }
        @keyframes tpl1-sk-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes tpl1-sk-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        .tpl1-hero-skeleton .sk {
          background: linear-gradient(
            105deg,
            #fce7f3 0%,
            #fbcfe8 35%,
            #fdf2f8 50%,
            #fce7f3 65%,
            #fdf2f8 100%
          );
          background-size: 200% 100%;
          animation: tpl1-sk-shimmer 1.6s ease-in-out infinite;
        }
        .tpl1-hero-skeleton .sk-hero {
          flex: 1;
          margin: 0 14px;
          border-radius: 22px;
          min-height: 58vh;
          max-height: 72vh;
          animation: tpl1-sk-pulse 2s ease-in-out infinite;
        }
        .tpl1-hero-skeleton .sk-nav {
          height: 58px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          border-bottom: 1px solid rgba(236, 72, 153, 0.08);
          flex-shrink: 0;
        }
        .tpl1-hero-skeleton .sk-footer {
          padding: 28px 24px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }
        @media (min-width: 769px) {
          .tpl1-hero-skeleton { display: none !important; }
        }
      `}</style>

      <div className="sk-nav">
        <div className="sk" style={{ width: 96, height: 30, borderRadius: 10 }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="sk" style={{ width: 34, height: 34, borderRadius: '50%' }} />
          <div className="sk" style={{ width: 34, height: 34, borderRadius: '50%' }} />
          <div className="sk" style={{ width: 34, height: 34, borderRadius: '50%' }} />
        </div>
      </div>

      <div className="sk sk-hero" />

      <div className="sk-footer">
        <div className="sk" style={{ width: '78%', height: 26, borderRadius: 10 }} />
        <div className="sk" style={{ width: '55%', height: 16, borderRadius: 8 }} />
        <div className="sk" style={{ width: 140, height: 44, borderRadius: 999, marginTop: 4 }} />
      </div>
    </div>
  );
}
