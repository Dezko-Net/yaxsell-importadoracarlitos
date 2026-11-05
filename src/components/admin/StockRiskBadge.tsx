'use client'

/**
 * StockRiskBadge — Micro-componente reutilizable
 * Muestra el semáforo de riesgo de stock con porcentaje y barra de progreso animada.
 *
 * Diseño premium: barra líquida con gradiente, shimmer, ondas, glow pulsante,
 * partículas flotantes y animación de carga al montar. CSS puro, sin librerías.
 *
 * Uso: <StockRiskBadge risk={getProductRisk({ stock, salesVelocity7d, maxBatchSize, daysSinceCreated })} />
 *      <StockRiskBadge risk={risk} compact />  // versión compacta para tablas
 */

import { useEffect, useState } from 'react'
import { getProductRisk, RISK_COLORS, type RiskInput, type ProductRisk } from '@/lib/stock-risk'

interface Props {
  risk?: ProductRisk
  input?: RiskInput
  compact?: boolean
  size?: 'sm' | 'md'
}

export default function StockRiskBadge({ risk, input, compact = false, size = 'sm' }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  if (!risk && input) risk = getProductRisk(input)
  if (!risk) return null

  const colors = RISK_COLORS[risk.level]
  const pct = risk.pct

  // Acentos de alta gama: gradientes ricos, partículas y faro pulsante
  const accent =
    risk.level === 'rojo'
      ? {
          gradient: 'from-rose-500 via-red-500 to-rose-600',
          glow: 'rgba(244, 63, 94, 0.32)',
          beacon: '#f87171',
          particle: 'rgba(255, 255, 255, 0.9)',
          pulseDuration: '1.1s',
        }
      : risk.level === 'amarillo'
      ? {
          gradient: 'from-amber-400 via-orange-400 to-amber-500',
          glow: 'rgba(245, 158, 11, 0.32)',
          beacon: '#fbbf24',
          particle: 'rgba(255, 255, 255, 0.9)',
          pulseDuration: '1.8s',
        }
      : {
          gradient: 'from-emerald-500 via-teal-400 to-emerald-500',
          glow: 'rgba(16, 185, 129, 0.28)',
          beacon: '#34d399',
          particle: 'rgba(255, 255, 255, 0.9)',
          pulseDuration: '2.8s',
        }

  return (
    <>
      {compact ? (
        /* Versión Compacta para Tablas de Catálogo */
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colors.badge} select-none`}
          title={risk.label}
          style={{ boxShadow: `0 1px 3px rgba(0,0,0,0.04), 0 0 7px ${accent.glow}` }}
        >
          <span className="text-[10px] leading-none">{colors.emoji}</span>

          {/* Barra Líquida Mini con contraste nítido */}
          <span
            className="relative w-14 h-2.5 rounded-full bg-slate-200/90 overflow-hidden [isolation:isolate] [transform:translateZ(0)] border border-slate-300/60"
            style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12)' }}
          >
            {/* Relleno Líquido con animación de entrada */}
            <span
              className={`absolute left-0 top-0 h-full rounded-full bg-gradient-to-r ${accent.gradient} transition-[width] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden [isolation:isolate]`}
              style={{ width: mounted ? `${pct}%` : '0%' }}
            >
              {/* 1. Ondas líquidas continuas */}
              <span
                className="absolute inset-0 opacity-45 rounded-full"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0px, rgba(255,255,255,0.45) 3px, transparent 3px, transparent 7px)',
                  backgroundSize: '14px 14px',
                  animation: 'riskLiquidFlow 1.6s linear infinite',
                }}
              />

              {/* 2. Haz de Luz / Shimmer fluido (curvado, sin línea dura) */}
              <span
                className="absolute inset-0 opacity-60 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'riskLiquidShimmer 2.6s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                }}
              />

              {/* 3. Micro-partículas líquidas flotantes dentro del fill */}
              {[...Array(3)].map((_, i) => (
                <span
                  key={`cp_${i}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: `${1.2 + (i % 2) * 0.6}px`,
                    height: `${1.2 + (i % 2) * 0.6}px`,
                    backgroundColor: accent.particle,
                    boxShadow: `0 0 3px ${accent.particle}`,
                    left: `${18 + i * 28}%`,
                    top: '50%',
                    animation: `riskParticleFloat ${1.8 + (i % 3) * 0.4}s ease-in-out infinite`,
                    animationDelay: `${i * 0.4}s`,
                  }}
                />
              ))}

              {/* 4. Faro pulsante en la cresta */}
              {pct > 4 && (
                <span
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white"
                  style={{
                    boxShadow: `0 0 5px ${accent.beacon}, 0 0 2px #fff`,
                    animation: `riskBeaconPulse ${accent.pulseDuration} ease-in-out infinite`,
                  }}
                />
              )}
            </span>
          </span>

          <span className="font-mono text-[11px] font-black tabular-nums tracking-tight">
            {pct}%
          </span>
        </span>
      ) : (
        /* Versión Expandida */
        <div
          className={`flex flex-col gap-1.5 select-none ${size === 'sm' ? 'w-28' : 'w-36'}`}
          title={risk.label}
        >
          {/* Badge superior */}
          <div
            className={`flex items-center justify-between px-2 py-0.5 rounded-full text-xs font-semibold border ${colors.badge}`}
            style={{ boxShadow: `0 1px 3px rgba(0,0,0,0.04), 0 0 8px ${accent.glow}` }}
          >
            <span className="flex items-center gap-1">
              <span className="text-[10px]">{colors.emoji}</span>
              <span className="capitalize text-[11px] font-bold">{risk.level}</span>
            </span>
            <span className="font-mono text-xs font-black tabular-nums">{pct}%</span>
          </div>

          {/* Barra de progreso premium */}
          <div
            className="relative h-3 rounded-full bg-slate-200/90 overflow-hidden [isolation:isolate] [transform:translateZ(0)] border border-slate-300/60"
            style={{
              boxShadow: `inset 0 1px 2px rgba(0,0,0,0.12), 0 0 8px ${accent.glow}`,
            }}
          >
            {/* Fill con gradiente */}
            <div
              className={`absolute left-0 top-0 h-full rounded-full bg-gradient-to-r ${accent.gradient} transition-[width] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden [isolation:isolate]`}
              style={{ width: mounted ? `${pct}%` : '0%' }}
            >
              {/* Ondas líquidas */}
              <div
                className="absolute inset-0 opacity-40 rounded-full"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0px, rgba(255,255,255,0.45) 4px, transparent 4px, transparent 9px)',
                  backgroundSize: '18px 18px',
                  animation: 'riskLiquidFlow 1.6s linear infinite',
                }}
              />

              {/* Haz de Luz / Shimmer */}
              <div
                className="absolute inset-0 opacity-60 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'riskLiquidShimmer 2.6s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                }}
              />

              {/* Partículas líquidas flotantes */}
              {[...Array(5)].map((_, i) => (
                <div
                  key={`pb_${i}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: `${1.5 + (i % 2) * 0.8}px`,
                    height: `${1.5 + (i % 2) * 0.8}px`,
                    backgroundColor: accent.particle,
                    boxShadow: `0 0 4px ${accent.particle}`,
                    left: `${12 + i * 18}%`,
                    top: `${25 + (i % 2) * 30}%`,
                    animation: `riskParticleFloat ${1.8 + (i % 3) * 0.4}s ease-in-out infinite`,
                    animationDelay: `${i * 0.35}s`,
                  }}
                />
              ))}

              {/* Faro pulsante en la cresta */}
              {pct > 5 && (
                <div
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white"
                  style={{
                    boxShadow: `0 0 6px ${accent.beacon}, 0 0 3px #fff`,
                    animation: `riskBeaconPulse ${accent.pulseDuration} ease-in-out infinite`,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animaciones CSS compartidas (siempre activas tanto en compact como en expandido) */}
      <style>{`
        @keyframes riskLiquidFlow {
          0% {
            background-position: 0 0;
          }
          100% {
            background-position: 18px 0;
          }
        }
        @keyframes riskLiquidShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
        @keyframes riskParticleFloat {
          0%, 100% {
            transform: translateY(-50%) scale(0.7);
            opacity: 0.35;
          }
          50% {
            transform: translateY(-80%) scale(1.3);
            opacity: 1;
          }
        }
        @keyframes riskBeaconPulse {
          0%, 100% {
            transform: translateY(-50%) scale(0.85);
            opacity: 0.8;
          }
          50% {
            transform: translateY(-50%) scale(1.3);
            opacity: 1;
          }
        }
      `}</style>
    </>
  )
}
