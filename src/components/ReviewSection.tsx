'use client';

import { useState, useEffect } from 'react';
import { getServices, getFirebaseConfig, REVIEWS_COLLECTION, PRODUCTS_COLLECTION } from '@/lib/db';
import { ID } from '@/lib/db';
import { Review } from '@/types';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  productId: string;
  rating: number;
  numReviews: number;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days}d`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? 'es' : ''}`;
}

function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24"
            fill={(hover || value) >= i ? '#f6a500' : 'none'}
            stroke={(hover || value) >= i ? '#f6a500' : '#ccc'}
            strokeWidth="1.5"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export default function ReviewSection({ productId, rating, numReviews }: Props) {
  const { user, isLoggedIn } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formRating, setFormRating] = useState(0);
  const [formComment, setFormComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    loadReviews();
  }, [productId]);

  async function loadReviews() {
    try {
      const response = await fetch(`/api/public-data/product-social?kind=reviews&productId=${encodeURIComponent(productId)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const res = await response.json();
      const loaded = (res.documents || []) as Review[];
      setReviews(loaded);

      if (user) {
        const mine = loaded.find(r => r.USERID === user.id);
        if (mine) setUserReview(mine);
      }
    } catch (e) {
      console.warn('Error loading reviews (handled gracefully):', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || formRating === 0) return;
    setSubmitting(true);
    setSubmitMsg('');

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const now = Math.floor(Date.now() / 1000);

      const created = await databases.createDocument(databaseId, REVIEWS_COLLECTION, ID.unique(), {
        PRODUCTID: productId,
        USERID: user.id,
        USERNAME: user.name || 'Usuario',
        RATING: formRating,
        COMMENT: formComment.trim(),
        CREATEDAT: now,
        REVIEWDATE: now,
      });

      // Update product RATING and NUMREVIEWS
      const newCount = numReviews + 1;
      const newRating = ((rating * numReviews) + formRating) / newCount;
      try {
        await databases.updateDocument(databaseId, PRODUCTS_COLLECTION, productId, {
          RATING: Math.round(newRating * 10) / 10,
          NUMREVIEWS: newCount,
        });
      } catch { /* non-critical */ }

      setSubmitMsg('¡Gracias por tu opinión!');
      setShowForm(false);
      setFormRating(0);
      setFormComment('');
      // Append optimista en vez de recargar: 'reviews' se sirve del proxy
      // cacheado (24h), así que un loadReviews() devolvería la lista sin esta
      // reseña y parecería que no se guardó.
      const mine = created as unknown as Review;
      setReviews(prev => [mine, ...prev]);
      setUserReview(mine);
    } catch (err: any) {
      setSubmitMsg(err?.message || 'Error al enviar reseña');
    } finally {
      setSubmitting(false);
    }
  }

  // Distribution calculation from real reviews
  const dist = [0, 0, 0, 0, 0];
  reviews.forEach(r => { if (r.RATING >= 1 && r.RATING <= 5) dist[r.RATING - 1]++; });
  const total = reviews.length || numReviews || 1;
  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.RATING, 0) / reviews.length
    : rating;

  const visibleReviews = showAll ? reviews : reviews.slice(0, 4);

  return (
    <div style={{ background: '#fff', borderRadius: 4, padding: '28px 32px', marginBottom: 16 }}>
      <h2 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 400, color: '#333' }}>Opiniones del producto</h2>

      {/* Summary */}
      {total > 0 && avgRating > 0 ? (
        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', marginBottom: 24 }}>
          {/* Score */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 140 }}>
            <span style={{ fontSize: 64, fontWeight: 300, color: '#333', lineHeight: 1 }}>{avgRating.toFixed(1)}</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill={i <= Math.round(avgRating) ? '#f6a500' : '#e0e0e0'} stroke="none">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              ))}
            </div>
            <span style={{ fontSize: 13, color: '#999' }}>{reviews.length || numReviews} {(reviews.length || numReviews) === 1 ? 'opinión' : 'opiniones'}</span>
          </div>

          {/* Bars */}
          <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
            {[5, 4, 3, 2, 1].map(star => {
              const count = dist[star - 1];
              const pct = reviews.length > 0 ? Math.round((count / reviews.length) * 100) : (star === Math.round(avgRating) ? 65 : star === Math.round(avgRating) - 1 ? 20 : 4);
              return (
                <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#666', width: 10, textAlign: 'right' }}>{star}</span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#f6a500" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                  <div style={{ flex: 1, height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: '#f6a500', borderRadius: 4, transition: 'width .4s' }} />
                  </div>
                  <span style={{ fontSize: 12, color: '#999', width: 35 }}>{reviews.length > 0 ? `(${count})` : `${pct}%`}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 12 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <svg key={i} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="1.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            ))}
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 500, color: '#333' }}>Aún no hay opiniones</p>
          <p style={{ margin: 0, fontSize: 14, color: '#999' }}>Sé el primero en opinar sobre este producto</p>
        </div>
      )}

      {/* Individual reviews list */}
      {reviews.length > 0 && (
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
          {visibleReviews.map(r => (
            <div key={r.$id} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: r.USERPROFILEIMAGEURL ? `url(${r.USERPROFILEIMAGEURL}) center/cover` : 'linear-gradient(135deg,#3483fa,#6366f1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
                }}>
                  {!r.USERPROFILEIMAGEURL && (r.USERNAME?.charAt(0).toUpperCase() || 'U')}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{r.USERNAME}</span>
                    {r.ISEDITED && <span style={{ fontSize: 10, color: '#999' }}>(editada)</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 1 }}>
                      {[1, 2, 3, 4, 5].map(i => (
                        <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill={i <= r.RATING ? '#f6a500' : '#e0e0e0'} stroke="none">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      ))}
                    </div>
                    <span style={{ fontSize: 11, color: '#999' }}>{timeAgo(r.CREATEDAT)}</span>
                  </div>
                </div>
              </div>
              {r.COMMENT && <p style={{ margin: 0, fontSize: 14, color: '#555', lineHeight: 1.6 }}>{r.COMMENT}</p>}
            </div>
          ))}

          {reviews.length > 4 && !showAll && (
            <button onClick={() => setShowAll(true)} style={{
              background: 'none', border: '1.5px solid #3483fa', color: '#3483fa',
              padding: '10px 24px', borderRadius: 6, fontSize: 14, fontWeight: 600,
              cursor: 'pointer', width: '100%',
            }}>
              Ver todas las opiniones ({reviews.length})
            </button>
          )}
        </div>
      )}

      {/* Divider */}
      <div style={{ borderTop: '1px solid #f0f0f0', margin: '20px 0' }} />

      {/* Submit message */}
      {submitMsg && (
        <div style={{
          padding: '12px 16px', borderRadius: 6, marginBottom: 16,
          background: submitMsg.includes('Gracias') ? '#e8f5e9' : '#fef2f2',
          color: submitMsg.includes('Gracias') ? '#2e7d32' : '#c62828',
          fontSize: 14, fontWeight: 500,
        }}>
          {submitMsg}
        </div>
      )}

      {/* Review Form or CTA */}
      {showForm && isLoggedIn && !userReview ? (
        <form onSubmit={handleSubmit}>
          <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#333' }}>Tu opinión</p>
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: '#666' }}>¿Cómo calificarías este producto?</p>
            <StarInput value={formRating} onChange={setFormRating} />
          </div>
          <textarea
            value={formComment}
            onChange={e => setFormComment(e.target.value)}
            placeholder="Cuéntanos tu experiencia con este producto..."
            rows={4}
            style={{
              width: '100%', padding: '12px 16px', border: '1px solid #ddd', borderRadius: 6,
              fontSize: 14, resize: 'vertical', fontFamily: 'inherit', marginBottom: 16,
              outline: 'none',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = '#3483fa')}
            onBlur={e => (e.currentTarget.style.borderColor = '#ddd')}
          />
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" disabled={submitting || formRating === 0} style={{
              padding: '11px 24px', background: formRating > 0 ? '#3483fa' : '#ccc', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600,
              cursor: formRating > 0 ? 'pointer' : 'not-allowed', opacity: submitting ? 0.6 : 1,
            }}>
              {submitting ? 'Enviando...' : 'Publicar opinión'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{
              padding: '11px 24px', background: '#fff', color: '#666',
              border: '1px solid #ddd', borderRadius: 6, fontSize: 14, cursor: 'pointer',
            }}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 600, color: '#333' }}>
              {userReview ? 'Ya dejaste tu opinión' : '¿Compraste este producto?'}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
              {userReview ? 'Gracias por compartir tu experiencia.' : 'Comparte tu experiencia con otros compradores.'}
            </p>
          </div>
          {!userReview && (
            isLoggedIn ? (
              <button onClick={() => setShowForm(true)} style={{
                padding: '11px 24px', background: '#fff', color: '#3483fa',
                border: '1.5px solid #3483fa', borderRadius: 6, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                Dejar mi opinión
              </button>
            ) : (
              <a href="/login" style={{
                padding: '11px 24px', background: '#fff', color: '#3483fa',
                border: '1.5px solid #3483fa', borderRadius: 6, fontSize: 14, fontWeight: 600,
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}>
                Inicia sesión para opinar
              </a>
            )
          )}
        </div>
      )}
    </div>
  );
}
