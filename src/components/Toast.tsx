'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++toastId;
    console.log('🔔 Toast:', message, type);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const remove = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const iconMap: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle size={20} color="#fff" strokeWidth={2.5} />,
    error: <AlertTriangle size={20} color="#fca5a5" strokeWidth={2.5} />,
    warning: <AlertTriangle size={20} color="#fde68a" strokeWidth={2.5} />,
    info: <Info size={20} color="#fff" strokeWidth={2.5} />,
  };

  const bgMap: Record<ToastType, string> = {
    success: 'linear-gradient(135deg, #fbcfe8, #f5a8cf)',
    error: 'linear-gradient(135deg, #dc2626, #991b1b)',
    warning: 'linear-gradient(135deg, #f59e0b, #d97706)',
    info: 'linear-gradient(135deg, #3b82f6, #2563eb)',
  };

  const borderMap: Record<ToastType, string> = {
    success: 'rgba(255,255,255,0.25)',
    error: 'rgba(255,255,255,0.2)',
    warning: 'rgba(255,255,255,0.2)',
    info: 'rgba(255,255,255,0.2)',
  };

  return (
    <>
      {React.createElement(ToastContext.Provider, { value: { showToast } }, children)}
      {toasts.length > 0 && (
        <div className="toast-container" style={{ position: 'fixed', top: 20, right: 20, zIndex: 999999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380, pointerEvents: 'none' }}>
          <style>{`
            @keyframes slideIn { 
              from { opacity: 0; transform: translateX(40px) scale(0.9) translateY(-8px); } 
              to { opacity: 1; transform: translateX(0) scale(1) translateY(0); } 
            }
            @media (max-width: 768px) {
              .toast-container {
                top: 8px !important;
                right: 8px !important;
                left: 8px !important;
                max-width: none !important;
              }
              .toast-item {
                padding: 10px 12px !important;
                border-radius: 12px !important;
                gap: 8px !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
              }
              .toast-item .toast-icon {
                width: 24px !important;
                height: 24px !important;
              }
              .toast-item .toast-icon svg {
                width: 14px !important;
                height: 14px !important;
              }
              .toast-item .toast-msg {
                font-size: 12px !important;
              }
            }
          `}</style>
          {toasts.map(t => (
            <div key={t.id} className="toast-item" style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
              background: bgMap[t.type], border: `1px solid ${borderMap[t.type]}`,
              backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
              animation: 'slideIn .4s cubic-bezier(0.16,1,0.3,1)',
              pointerEvents: 'auto',
            }}>
              <div className="toast-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                {iconMap[t.type]}
              </div>
              <span className="toast-msg" style={{ flex: 1, fontSize: 14.5, color: t.type === 'success' || t.type === 'info' ? '#fff' : '#1f2937', fontWeight: 600, letterSpacing: '0.01em', textShadow: (t.type === 'success' || t.type === 'info') ? '0 1px 2px rgba(0,0,0,0.15)' : 'none' }}>{t.message}</span>
              <button onClick={() => remove(t.id)} style={{ background: (t.type === 'success' || t.type === 'info') ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: (t.type === 'success' || t.type === 'info') ? 'rgba(255,255,255,0.8)' : '#6b7280', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.background = (t.type === 'success' || t.type === 'info') ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'; e.currentTarget.style.color = (t.type === 'success' || t.type === 'info') ? '#fff' : '#1f2937'; }}
                onMouseLeave={e => { e.currentTarget.style.background = (t.type === 'success' || t.type === 'info') ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = (t.type === 'success' || t.type === 'info') ? 'rgba(255,255,255,0.8)' : '#6b7280'; }}>
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
