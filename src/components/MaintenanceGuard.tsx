'use client';

import { useState, useEffect } from 'react';
import { Wrench, Clock, Mail } from 'lucide-react';

export default function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('maintenance_config');
      if (stored) {
        const c = JSON.parse(stored);
        setMaintenance({ enabled: c.enabled || false, message: c.message || '' });
      } else {
        setMaintenance({ enabled: false, message: '' });
      }
    } catch {
      setMaintenance({ enabled: false, message: '' });
    }
  }, []);

  // Still loading
  if (maintenance === null) return null;

  // Not in maintenance mode
  if (!maintenance.enabled) return <>{children}</>;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Animated wrench icon */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-pink-100 flex items-center justify-center animate-pulse">
              <Wrench className="w-12 h-12 text-pink-500" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-pink-500 animate-ping" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          En Mantenimiento
        </h1>
        <p className="text-pink-500 font-medium text-sm uppercase tracking-widest mb-6">
          ¡Volveremos pronto!
        </p>

        {/* Message */}
        <div className="bg-pink-50 border border-pink-100 rounded-2xl p-6 mb-6">
          <p className="text-gray-700 text-base leading-relaxed">
            {maintenance.message || 'Estamos realizando mejoras en nuestra tienda. Volveremos pronto.'}
          </p>
        </div>

        {/* Info items */}
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <Clock className="w-4 h-4" />
            <span>Trabajando para mejorar tu experiencia</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <Mail className="w-4 h-4" />
            <span>Para consultas, contáctanos por WhatsApp</span>
          </div>
        </div>

        {/* Animated dots */}
        <div className="flex justify-center gap-1.5 mt-8">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-pink-500"
              style={{
                animation: `bounce 1.4s infinite ${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
