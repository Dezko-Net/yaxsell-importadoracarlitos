'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageCircle, Loader2, Clock } from 'lucide-react';
import { getServices, getFirebaseConfig } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Query } from '@/lib/db';

const FF = '"Proxima Nova",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif';
const LIVE_COLLECTION = 'live_streams';

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'Justo ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const day = Math.floor(h / 24);
  if (day === 1) return 'Ayer';
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

export default function ConversacionesPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [streams, setStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // No forzar login - mostrar prompt si no está logueado

  useEffect(() => {
    if (!isLoggedIn) return;
    (async () => {
      setLoading(true);
      try {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        const res = await databases.listDocuments(databaseId, LIVE_COLLECTION, [
          Query.orderDesc('$createdAt'),
          Query.limit(20),
        ]);
        setStreams(res.documents);
      } catch { setStreams([]); }
      finally { setLoading(false); }
    })();
  }, [isLoggedIn]);

  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={32} color="#3483fa" style={{ animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: FF }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
        <Link href="/cuenta" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <ArrowLeft size={22} color="#333" />
        </Link>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#333' }}>Historial de Lives</span>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 12px 40px' }}>
        {/* Info banner */}
        <div style={{ background: '#eef2ff', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <MessageCircle size={18} color="#3483fa" style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13, color: '#3483fa', lineHeight: 1.4 }}>
            Aquí ves los streams en vivo pasados y activos de la tienda donde podés interactuar en tiempo real.
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <Loader2 size={28} color="#3483fa" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : streams.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <MessageCircle size={48} color="#ddd" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: '#999', fontSize: 15, fontWeight: 600 }}>Sin transmisiones aún</p>
            <p style={{ color: '#bbb', fontSize: 13, marginTop: 4 }}>Pronto habrá eventos en vivo con ofertas exclusivas</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {streams.map(s => {
              const thumb = s.thumbnailUrl || s.THUMBNAILURL || null;
              const title = s.title || s.TITLE || 'Live sin título';
              const live = s.isLive || s.ISLIVE || false;
              const viewers = s.viewerCount || s.VIEWERCOUNT || 0;
              return (
                <div key={s.$id} style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
                  {/* Thumbnail */}
                  <div style={{ height: 140, background: '#222', position: 'relative', overflow: 'hidden' }}>
                    {thumb
                      ? <img src={thumb} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <MessageCircle size={40} color="#444" />
                        </div>
                    }
                    {live && (
                      <span style={{ position: 'absolute', top: 10, left: 10, background: '#e53935', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, letterSpacing: '.5px' }}>● EN VIVO</span>
                    )}
                  </div>
                  {/* Info */}
                  <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#333' }}>{title}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: '#aaa' }}>
                          <Clock size={12} /> {timeAgo(s.$createdAt)}
                        </span>
                        {viewers > 0 && <span style={{ fontSize: 12, color: '#aaa' }}>· {viewers} viewers</span>}
                      </div>
                    </div>
                    {live && (
                      <Link href={`/live/${s.$id}`}
                        style={{ padding: '7px 16px', background: '#e53935', color: '#fff', borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 12 }}>
                        Ver live
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
