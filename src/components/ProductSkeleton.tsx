'use client';

export default function ProductSkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      <style>{`
        @keyframes skPulse { 0%,100%{opacity:.6} 50%{opacity:.3} }
        .sk-pulse { animation: skPulse 1.5s ease-in-out infinite; }
      `}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebeb', overflow: 'hidden' }}>
            <div className="sk-pulse" style={{ height: 180, background: '#f0f0f0' }} />
            <div style={{ padding: 12 }}>
              <div className="sk-pulse" style={{ height: 14, background: '#f0f0f0', borderRadius: 4, marginBottom: 8, width: '85%' }} />
              <div className="sk-pulse" style={{ height: 14, background: '#f0f0f0', borderRadius: 4, marginBottom: 12, width: '60%' }} />
              <div className="sk-pulse" style={{ height: 20, background: '#f0f0f0', borderRadius: 4, width: '40%' }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
