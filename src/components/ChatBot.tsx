'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { CHATBOT_ENABLED } from '@/lib/feature-flags';
import { useKeniaStatus } from '@/hooks/useKeniaStatus';

// Numero y datos de Importadora Carlitos
const KENIA_PHONE = '56936599658';
const KENIA_WA_URL = `https://wa.me/${KENIA_PHONE}?text=${encodeURIComponent('Hola Importadora Carlitos! Te escribo desde la tienda, quiero hacer una consulta.')}`;

export default function ChatBot() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const { isEnabled: enabled } = useKeniaStatus();

  const isHiddenRoute =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/inventario') ||
    pathname.startsWith('/linktree');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!CHATBOT_ENABLED || isHiddenRoute || !mounted || !enabled) return null;

  return (
    <>
      <style>{`
        #tpl1-chatbot-button { display: none !important; }
        @keyframes kenia-pulse {
          0%, 100% { box-shadow: 0 4px 18px rgba(227,150,191,0.45); }
          50%       { box-shadow: 0 6px 28px rgba(227,150,191,0.7); }
        }
        .kenia-fab {
          position: fixed;
          bottom: 90px;
          right: 20px;
          z-index: 9999;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 18px 8px 8px;
          border-radius: 999px;
          background: linear-gradient(135deg, #e396bf, #f472b6);
          color: #fff;
          text-decoration: none;
          font-family: "DM Sans", system-ui, sans-serif;
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.3px;
          animation: kenia-pulse 2.5s ease-in-out infinite;
          transition: transform 0.2s ease;
          white-space: nowrap;
        }
        .kenia-fab:hover {
          transform: scale(1.06);
          animation: none;
          box-shadow: 0 6px 24px rgba(227,150,191,0.6);
        }
        .kenia-fab__avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.7);
          object-fit: cover;
          flex-shrink: 0;
        }
        .kenia-fab__label {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }
        .kenia-fab__name {
          font-size: 11px;
          opacity: 0.88;
          font-weight: 500;
        }
        .kenia-fab__action {
          font-size: 13px;
          font-weight: 700;
        }
        .kenia-fab__wa-icon {
          width: 16px;
          height: 16px;
          opacity: 0.9;
          flex-shrink: 0;
        }
        @media (max-width: 480px) {
          .kenia-fab {
            bottom: 112px;
            right: 12px;
            padding: 6px 12px 6px 6px;
            max-width: min(250px, calc(100vw - 32px));
            z-index: 9990;
          }
          .kenia-fab__avatar { width: 34px; height: 34px; }
          .kenia-fab__name { font-size: 10px; }
          .kenia-fab__action { font-size: 12px; }
          .kenia-fab__wa-icon { width: 15px; height: 15px; }
        }
      `}</style>

      <a
        href={KENIA_WA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="kenia-fab"
        aria-label="Hablar con Importadora Carlitos por WhatsApp"
      >
        <img
          src=""
          alt="Importadora Carlitos"
          className="kenia-fab__avatar"
        />
        <div className="kenia-fab__label">
          <span className="kenia-fab__name">Importadora Carlitos</span>
          <span className="kenia-fab__action">Hablar por WhatsApp</span>
        </div>
        {/* WhatsApp icon */}
        <svg className="kenia-fab__wa-icon" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </a>
    </>
  );
}
