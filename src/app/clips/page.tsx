'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Play, Pause, Heart, ShoppingCart, Volume2, VolumeX, ChevronUp, ChevronDown, Eye, ArrowLeft } from 'lucide-react';
import { getServices, getFirebaseConfig, CLIPS_COLLECTION, formatPrice } from '@/lib/db';
import { Query } from '@/lib/db';
import { Clip } from '@/types';
import { useCart } from '@/context/CartContext';

export default function ClipsPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { addItem } = useCart();

  useEffect(() => {
    (async () => {
      try {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        const res = await databases.listDocuments(databaseId, CLIPS_COLLECTION, [
          Query.equal('ISACTIVE', true),
          Query.orderDesc('CREATEDAT'),
          Query.limit(30),
        ]);
        setClips(res.documents as unknown as Clip[]);
      } catch (e) { console.error('Error loading clips:', e); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [current, playing, clips]);

  const goNext = useCallback(() => {
    if (current < clips.length - 1) setCurrent(c => c + 1);
  }, [current, clips.length]);

  const goPrev = useCallback(() => {
    if (current > 0) setCurrent(c => c - 1);
  }, [current]);

  // Keyboard + scroll navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') goNext();
      else if (e.key === 'ArrowUp' || e.key === 'k') goPrev();
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
      else if (e.key === 'm') setMuted(m => !m);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev]);

  // Touch swipe
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let startY = 0;
    const onStart = (e: TouchEvent) => { startY = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      const diff = startY - e.changedTouches[0].clientY;
      if (diff > 60) goNext();
      else if (diff < -60) goPrev();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd); };
  }, [goNext, goPrev]);

  const clip = clips[current];

  if (loading) return (
    <div style={{ height: '100dvh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (clips.length === 0) return (
    <div style={{ height: '100dvh', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', gap: 16 }}>
      <Play size={48} style={{ opacity: 0.3 }} />
      <p style={{ fontSize: 16, opacity: 0.6 }}>No hay clips disponibles</p>
      <Link href="/" style={{ color: '#3483fa', textDecoration: 'none', fontSize: 14 }}>Volver al inicio</Link>
    </div>
  );

  return (
    <div ref={containerRef} style={{ height: '100dvh', background: '#000', position: 'relative', overflow: 'hidden', userSelect: 'none' }}>
      {/* Video */}
      <video
        ref={videoRef}
        key={clip.$id}
        src={clip.VIDEOURL}
        poster={clip.THUMBNAILURL}
        loop
        muted={muted}
        playsInline
        autoPlay
        onClick={() => setPlaying(p => !p)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
      />

      {/* Play/Pause overlay */}
      {!playing && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={32} color="#fff" fill="#fff" />
          </div>
        </div>
      )}

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '16px 16px 40px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fff', textDecoration: 'none' }}>
            <ArrowLeft size={20} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Volver</span>
          </Link>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{current + 1}/{clips.length}</span>
        </div>
      </div>

      {/* Right sidebar actions */}
      <div style={{ position: 'absolute', right: 12, bottom: 180, display: 'flex', flexDirection: 'column', gap: 20, zIndex: 3, alignItems: 'center' }}>
        <button onClick={() => setMuted(m => !m)} style={{ background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          {muted ? <VolumeX size={20} color="#fff" /> : <Volume2 size={20} color="#fff" />}
        </button>
        {clip.VIEWS != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Eye size={22} color="#fff" />
            <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{clip.VIEWS}</span>
          </div>
        )}
        <button onClick={goPrev} disabled={current === 0} style={{ background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: current === 0 ? 'not-allowed' : 'pointer', opacity: current === 0 ? 0.3 : 1 }}>
          <ChevronUp size={22} color="#fff" />
        </button>
        <button onClick={goNext} disabled={current >= clips.length - 1} style={{ background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: current >= clips.length - 1 ? 'not-allowed' : 'pointer', opacity: current >= clips.length - 1 ? 0.3 : 1 }}>
          <ChevronDown size={22} color="#fff" />
        </button>
      </div>

      {/* Bottom info */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '60px 16px 24px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', zIndex: 2 }}>
        <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#fff' }}>{clip.TITLE}</p>
        {clip.DESCRIPTION && <p style={{ margin: '0 0 10px', fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>{clip.DESCRIPTION}</p>}
        {clip.USERNAME && <p style={{ margin: '0 0 12px', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>@{clip.USERNAME}</p>}

        {/* Product card */}
        {clip.PRODUCTID && (
          <Link prefetch={false} href={`/productos/${clip.PRODUCTID}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.12)', borderRadius: 10, textDecoration: 'none', backdropFilter: 'blur(10px)' }}>
            {clip.PRODUCTIMAGEURL && (
              <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#fff' }}>
                <img src={clip.PRODUCTIMAGEURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clip.PRODUCTNAME || 'Ver producto'}</p>
              {clip.PRODUCTPRICE != null && <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: '#00e676' }}>{formatPrice(clip.PRODUCTPRICE)}</p>}
            </div>
            <div style={{ background: '#3483fa', borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <ShoppingCart size={14} color="#fff" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Ver</span>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
