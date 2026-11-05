'use client';

import { useState, useRef, useEffect } from 'react';
import { Share2, Link2, Check, MessageCircle } from 'lucide-react';

interface Props {
  url?: string;
  title: string;
  text?: string;
  image?: string;
}

export default function ShareButton({ url, title, text, image }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const shareText = text || title;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1500);
    } catch {}
  }

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`, '_blank');
    setOpen(false);
  }

  function shareFacebook() {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank', 'width=600,height=400');
    setOpen(false);
  }

  function shareTwitter() {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank', 'width=600,height=400');
    setOpen(false);
  }

  async function handleNativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: shareText, url: shareUrl });
      } catch {}
    } else {
      setOpen(o => !o);
    }
  }

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '10px 14px', background: 'none', border: 'none',
    fontSize: 13, color: '#333', cursor: 'pointer', borderRadius: 6,
    transition: 'background .15s',
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={handleNativeShare}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 13, color: '#555', cursor: 'pointer', transition: 'all .15s' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#eee'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#f5f5f5'; }}>
        <Share2 size={15} /> Compartir
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          background: '#fff', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,.18)',
          border: '1px solid #e5e5e5', minWidth: 210, zIndex: 50, overflow: 'hidden',
          animation: 'sharePopIn .15s ease-out',
        }}>
          <style>{`@keyframes sharePopIn { from { opacity:0; transform:translateY(-4px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>
          <div style={{ padding: 4 }}>
            <button onClick={shareWhatsApp} style={btnStyle}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <MessageCircle size={16} color="#25D366" /> WhatsApp
            </button>
            <button onClick={shareFacebook} style={btnStyle}
              onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Facebook
            </button>
            <button onClick={shareTwitter} style={btnStyle}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1DA1F2"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
              Twitter
            </button>
            <div style={{ borderTop: '1px solid #f0f0f0', margin: '2px 0' }} />
            <button onClick={copyLink} style={btnStyle}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              {copied ? <><Check size={16} color="#00a650" /> <span style={{ color: '#00a650', fontWeight: 600 }}>Copiado</span></> : <><Link2 size={16} /> Copiar enlace</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
