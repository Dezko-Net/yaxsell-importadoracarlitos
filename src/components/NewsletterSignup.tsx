'use client';

import { useState } from 'react';
import { Mail, Send, Check } from 'lucide-react';

export default function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) return;
    try {
      const subs: string[] = JSON.parse(localStorage.getItem('newsletter_subs') || '[]');
      if (!subs.includes(email.toLowerCase())) {
        subs.push(email.toLowerCase());
        localStorage.setItem('newsletter_subs', JSON.stringify(subs));
      }
    } catch {}
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'rgba(255,255,255,0.1)', borderRadius: 8 }}>
        <Check size={18} color="#22c55e" />
        <span style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>¡Gracias! Te mantendremos informado.</span>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Mail size={18} color="#ffe600" />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Suscríbete a nuestro newsletter</span>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
        Recibe ofertas exclusivas, novedades y descuentos directo en tu correo.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          type="email"
          placeholder="tu@email.com"
          style={{
            flex: 1, padding: '10px 14px', fontSize: 14, border: 'none',
            borderRadius: 6, background: 'rgba(255,255,255,0.15)', color: '#fff',
            outline: 'none',
          }}
        />
        <button type="submit" disabled={!email.trim()}
          style={{
            padding: '10px 18px', background: '#ffe600', color: '#333', border: 'none',
            borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: !email.trim() ? 0.5 : 1,
          }}>
          <Send size={14} /> Suscribir
        </button>
      </form>
    </div>
  );
}
