'use client';

import { useEffect, useState, useRef } from 'react';
import { Query, ID } from '@/lib/db';
import { getServices, getFirebaseConfig, ADMIN_CHAT_COLLECTION } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { MessageCircle, Send, X } from 'lucide-react';

const FF = '"DM Sans",system-ui,sans-serif';
const PINK = '#3b82f6';

export default function ChatPage() {
  const { user, isLoggedIn } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = async () => {
    if (!isLoggedIn || !user) return;
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const res = await databases.listDocuments(databaseId, ADMIN_CHAT_COLLECTION, [
        Query.equal('userId', user.id),
        Query.orderDesc('$createdAt'),
        Query.limit(50),
      ]);
      res.documents.reverse();
      setMessages(res.documents as any[]);
      // Mark user messages as read
      const unread = res.documents.filter((d: any) => d.senderRole === 'admin' && !d.readByUser);
      for (const doc of unread) {
        try { await databases.updateDocument(databaseId, ADMIN_CHAT_COLLECTION, doc.$id, { readByUser: true }); } catch {}
      }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { loadMessages(); }, [isLoggedIn, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 🚀 Bucle de recarga de chat eliminado por petición del administrador (ahorra miles de reads diarios)
  // Si el usuario quiere ver nuevos mensajes, simplemente recarga la página o entra y sale.

  const sendMessage = async () => {
    if (!user || !draft.trim()) return;
    setSending(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const msg = await databases.createDocument(databaseId, ADMIN_CHAT_COLLECTION, ID.unique(), {
        userId: user.id,
        senderRole: 'user',
        message: draft.trim(),
        readByUser: true,
        readByAdmin: false,
      });
      setMessages(prev => [...prev, msg]);
      setDraft('');
    } catch {}
    finally { setSending(false); }
  };

  if (!isLoggedIn) {
    return (
      <div style={{ fontFamily: FF, padding: 40, textAlign: 'center', color: '#9ca3af' }}>
        Inicia sesión para chatear con nosotros
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FF }}>
      <style>{`
        .chat-bubble-admin { background: #f3f4f6; color: #1f2937; border-radius: 16px 16px 16px 4px; }
        .chat-bubble-user { background: ${PINK}; color: #fff; border-radius: 16px 16px 4px 16px; }
        .chat-input:focus { outline: none; box-shadow: 0 0 0 2px ${PINK}40; }
      `}</style>

      <div style={{ background: '#fff', borderRadius: 18, border: '1.5px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={18} style={{ color: PINK }} />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#1f2937' }}>Chat con Admin</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>Tus mensajes son privados</p>
          </div>
        </div>

        {/* Messages */}
        <div style={{ height: 420, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Cargando...</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <MessageCircle size={40} style={{ color: '#e5e7eb', margin: '0 auto 12px' }} />
              <p style={{ color: '#9ca3af', fontSize: 14 }}>No hay mensajes aún</p>
              <p style={{ color: '#d1d5db', fontSize: 12, marginTop: 4 }}>Escribe algo para iniciar la conversación</p>
            </div>
          ) : (
            messages.map((msg: any) => {
              const isUser = msg.senderRole === 'user';
              return (
                <div key={msg.$id} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                  <div className={isUser ? 'chat-bubble-user' : 'chat-bubble-admin'} style={{ maxWidth: '75%', padding: '10px 14px', fontSize: 14, lineHeight: 1.5 }}>
                    <p style={{ margin: 0 }}>{msg.message}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 10, opacity: 0.6 }}>
                      {new Date(msg.$createdAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 8 }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Escribe un mensaje..."
            className="chat-input"
            style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: 14, fontFamily: FF }}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !draft.trim()}
            style={{ width: 42, height: 42, borderRadius: 12, border: 'none', background: PINK, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: sending || !draft.trim() ? 0.5 : 1 }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
