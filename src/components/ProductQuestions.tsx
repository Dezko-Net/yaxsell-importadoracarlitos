'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, Send, ChevronDown } from 'lucide-react';
import { getServices, getFirebaseConfig, PRODUCT_QUESTIONS_COLLECTION } from '@/lib/db';
import { ID } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';

// La lista pública se sirve desde el endpoint con caché compartido; al publicar,
// la pregunta se agrega de forma optimista para que aparezca de inmediato.
const QUESTIONS_COLLECTION = PRODUCT_QUESTIONS_COLLECTION;

interface Question {
  $id: string;
  $createdAt: string;
  PRODUCTID: string;
  USERID: string;
  USERNAME?: string;
  QUESTION: string;
  ANSWER?: string;
  ANSWEREDBY?: string;
  CREATEDAT?: number;
  ANSWEREDAT?: number;
}

// Flag de módulo: si la colección no existe, evita repetir solicitudes fallidas.
let _collectionExists: boolean | null = null;

export default function ProductQuestions({ productId }: { productId: string }) {
  const { user, isLoggedIn } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [newQuestion, setNewQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Deshabilitado si ya sabemos que la colección no existe
  const [disabled, setDisabled] = useState(_collectionExists === false);

  const load = useCallback(async () => {
    if (_collectionExists === false) { setLoading(false); return; }
    try {
      const response = await fetch(`/api/public-data/product-social?kind=questions&productId=${encodeURIComponent(productId)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const res = await response.json();
      _collectionExists = true;
      setQuestions((res.documents || []) as Question[]);
    } catch (e: any) {
      if (e?.message?.includes('HTTP 404') || e?.message?.includes('could not be found')) {
        // Colección no existe — silenciar permanentemente sin spam
        _collectionExists = false;
        setDisabled(true);
      }
      // Solo loguear en desarrollo, no en producción
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ProductQuestions] Colección no disponible:', e?.message || e);
      }
    }
    finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuestion.trim() || !isLoggedIn || !user) return;
    setSubmitting(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const created = await databases.createDocument(databaseId, QUESTIONS_COLLECTION, ID.unique(), {
        PRODUCTID: productId,
        USERID: user.id,
        USERNAME: user.name || user.email.split('@')[0] || 'Usuario',
        QUESTION: newQuestion.trim(),
        CREATEDAT: Math.floor(Date.now() / 1000),
      }, [
        `read("any")`,
        `update("user:${user.id}")`,
        `delete("user:${user.id}")`,
      ]);
      setNewQuestion('');
      // Append optimista en vez de recargar: la lista se sirve del proxy
      // cacheado, así que un load() devolvería datos sin esta pregunta.
      setQuestions(prev => [created as unknown as Question, ...prev]);
    } catch (e) { console.warn('Error submitting question (handled gracefully):', e); }
    finally { setSubmitting(false); }
  }

  const visible = showAll ? questions : questions.slice(0, 5);
  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `hace ${days}d`;
  };

  // Si la colección no existe, no renderizar nada (sin spam, sin UI rota)
  if (disabled) return null;

  return (
    <div style={{ background: '#fff', borderRadius: 4, padding: '24px 28px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <MessageCircle size={20} color="#3483fa" />
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 400, color: '#333' }}>
          Preguntas y respuestas ({questions.length})
        </h2>
      </div>

      {/* Ask form */}
      {isLoggedIn ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            placeholder="Hacé una pregunta sobre este producto..."
            maxLength={500}
            style={{
              flex: 1, padding: '10px 14px', fontSize: 14, border: '1px solid #ddd',
              borderRadius: 6, outline: 'none', color: '#333',
              transition: 'border-color .15s',
            }}
            onFocus={e => (e.target.style.borderColor = '#3483fa')}
            onBlur={e => (e.target.style.borderColor = '#ddd')}
          />
          <button type="submit" disabled={submitting || !newQuestion.trim()}
            style={{
              padding: '10px 18px', background: '#3483fa', color: '#fff', border: 'none',
              borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: submitting || !newQuestion.trim() ? 0.5 : 1,
            }}>
            <Send size={14} /> Preguntar
          </button>
        </form>
      ) : (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#999', background: '#f9f9f9', padding: '10px 14px', borderRadius: 6 }}>
          <a href="/login" style={{ color: '#3483fa' }}>Inicia sesión</a> para hacer una pregunta.
        </p>
      )}

      {/* Questions list */}
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>Cargando preguntas...</div>
      ) : questions.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: '#999' }}>
          <MessageCircle size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
          <p style={{ margin: 0, fontSize: 14 }}>Aún no hay preguntas. ¡Sé el primero!</p>
        </div>
      ) : (
        <>
          {visible.map(q => (
            <div key={q.$id} style={{ padding: '12px 0', borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 3, background: '#3483fa', borderRadius: 2, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 14, color: '#333', lineHeight: 1.4 }}>{q.QUESTION}</p>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#999' }}>
                    <span>{q.USERNAME || 'Usuario'}</span>
                    <span>·</span>
                    <span>{timeAgo(q.$createdAt)}</span>
                  </div>
                </div>
              </div>
              {q.ANSWER && (
                <div style={{ marginLeft: 13, marginTop: 8, padding: '8px 12px', background: '#f5f8ff', borderRadius: 6, borderLeft: '3px solid #00a650' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 14, color: '#333', lineHeight: 1.4 }}>{q.ANSWER}</p>
                  <span style={{ fontSize: 11, color: '#00a650', fontWeight: 600 }}>{q.ANSWEREDBY || 'Vendedor'}</span>
                </div>
              )}
            </div>
          ))}
          {questions.length > 5 && !showAll && (
            <button onClick={() => setShowAll(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '12px 0 0', padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#3483fa', fontWeight: 600 }}>
              Ver todas las preguntas ({questions.length}) <ChevronDown size={16} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
