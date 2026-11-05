'use client';

import { useState, useEffect } from 'react';
import { HelpCircle, Plus, ChevronRight, Loader2, Send, X } from 'lucide-react';
import { getServices, getFirebaseConfig } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Query, ID } from '@/lib/db';
import { useCuentaBg } from '../CuentaBgContext';

const PINK = '#3b82f6';
const FF = '"DM Sans",system-ui,sans-serif';
const TICKETS_COLLECTION = 'support_tickets';

const BG_TICKETS = 'https://img.freepik.com/free-photo/3d-render-help-support-icon-with-live-chat-bubble-symbol-service-hotline-pink-background-concept_56104-3364.jpg?semt=ais_hybrid&w=740&q=80';

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  open:        { label: 'Abierto',      bg: '#e3f2fd', color: '#1565c0' },
  in_progress: { label: 'En revisión', bg: '#fff8e1', color: '#f57f17' },
  closed:      { label: 'Cerrado',      bg: '#f5f5f5', color: '#777'    },
};

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'Justo ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

export default function TicketsPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ subject: '', message: '', category: 'Pedido' });
  useCuentaBg(BG_TICKETS);

  const CATEGORIES = ['Pedido', 'Pago', 'Envío', 'Producto', 'Cuenta', 'Otro'];

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    fetchTickets();
  }, [isLoggedIn, user]);

  async function fetchTickets() {
    setLoading(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const res = await databases.listDocuments(databaseId, TICKETS_COLLECTION, [
        Query.equal('userEmail', user!.email),
        Query.orderDesc('$createdAt'),
        Query.limit(30),
      ]);
      setTickets(res.documents);
    } catch { setTickets([]); }
    finally { setLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setSubmitting(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.createDocument(databaseId, TICKETS_COLLECTION, ID.unique(), {
        subject: form.subject,
        message: form.message,
        category: form.category,
        userEmail: user!.email,
        userName: user!.name,
        userId: user!.id,
        status: 'open',
      });
      setForm({ subject: '', message: '', category: 'Pedido' });
      setShowForm(false);
      await fetchTickets();
    } catch (err) {
      console.error(err);
      alert('No se pudo crear el ticket. Intentá de nuevo.');
    } finally { setSubmitting(false); }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fafafa', fontFamily: FF, transition: 'border-color 0.2s' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 6 };

  return (
    <>
      <style>{`
        .ticket-card {
          background: #fff; border-radius: 14px; padding: 16px; border: 1px solid #f0f0f0;
          transition: all 0.2s;
        }
        .ticket-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.06); border-color: rgba(59,130,246,0.2); }
        .ticket-form {
          background: #fff; border-radius: 16px; padding: 24px; border: 1px solid #f0f0f0;
          margin-bottom: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.04);
        }
        .cat-btn {
          padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 12px;
          cursor: pointer; transition: all 0.2s; font-family: ${FF};
        }
        .cat-btn.active { border: 1.5px solid ${PINK}; background: #eff6ff; color: ${PINK}; }
        .cat-btn.inactive { border: 1.5px solid #e5e7eb; background: #fff; color: #6b7280; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 10 }}>
          <HelpCircle size={22} color={PINK} /> Soporte
          {tickets.length > 0 && <span style={{ fontSize: 14, fontWeight: 500, color: '#9ca3af' }}>({tickets.length})</span>}
        </h1>
        <button onClick={() => setShowForm(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: showForm ? '#f3f4f6' : PINK, color: showForm ? '#555' : '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: FF, transition: 'all 0.2s' }}>
          {showForm ? <><X size={15} /> Cancelar</> : <><Plus size={15} /> Nuevo ticket</>}
        </button>
      </div>

      {/* New ticket form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="ticket-form">
          <p style={{ margin: '0 0 20px', fontWeight: 700, fontSize: 16, color: '#1a1a1a' }}>Crear nuevo ticket</p>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Categoría</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, category: c }))}
                  className={`cat-btn ${form.category === c ? 'active' : 'inactive'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Asunto *</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} style={inp} placeholder="¿En qué podemos ayudarte?" required />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Descripción *</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              rows={4} required
              style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }}
              placeholder="Describí tu problema con el mayor detalle posible..." />
          </div>

          <button type="submit" disabled={submitting}
            style={{ width: '100%', padding: '13px 0', background: submitting ? '#60a5fa' : PINK, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: FF, boxShadow: '0 4px 14px rgba(59,130,246,0.3)', transition: 'background 0.2s' }}>
            {submitting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
            {submitting ? 'Enviando...' : 'Enviar ticket'}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <Loader2 size={32} color={PINK} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : tickets.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', paddingTop: 60, paddingBottom: 40 }}>
          <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', boxShadow: '0 8px 24px rgba(59,130,246,0.15)' }}>
            <HelpCircle size={64} color={PINK} style={{ opacity: 0.7 }} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1a', margin: '0 0 12px', letterSpacing: '-0.01em' }}>Sin tickets de soporte</h2>
          <p style={{ fontSize: 15, color: '#6b7280', marginBottom: 32, maxWidth: 400, margin: '0 auto 32px', lineHeight: 1.6 }}>
            ¿Tenés algún problema o consulta? Creá un ticket y nuestro equipo te ayudará lo antes posible.
          </p>
          <button onClick={() => setShowForm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 36px', background: PINK, color: '#fff', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 6px 20px rgba(59,130,246,0.35)', fontFamily: FF }}>
            <Plus size={18} /> Crear ticket
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tickets.map(t => {
            const st = STATUS_STYLE[t.status] || STATUS_STYLE.open;
            return (
              <div key={t.$id} className="ticket-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a' }}>{t.subject}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color, textTransform: 'uppercase' }}>{st.label}</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0, fontWeight: 500 }}>{timeAgo(t.$createdAt)}</span>
                </div>
                {t.category && <span style={{ display: 'inline-block', fontSize: 11, color: PINK, background: '#eff6ff', borderRadius: 20, padding: '3px 10px', marginBottom: 8, fontWeight: 600 }}>{t.category}</span>}
                <p style={{ margin: 0, fontSize: 14, color: '#6b7280', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.message}</p>
                {t.adminNotes && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, borderLeft: `3px solid #22c55e` }}>
                    <p style={{ margin: 0, fontSize: 12, color: '#16a34a', fontWeight: 700 }}>Respuesta del equipo:</p>
                    <p style={{ margin: '4px 0 0', fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{t.adminNotes}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
