'use client'

import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Upload, Loader2 } from 'lucide-react'
import { SECTION_STYLES, type SectionTone } from './helpers'

export function Img({ src, alt, fallback, className = '' }: { src?: string; alt: string; fallback: string; className?: string }) {
  if (src) return <img src={src} alt={alt} className={`object-cover ${className}`} />
  return <div className={`flex items-center justify-center bg-slate-100 text-2xl ${className}`}>{fallback}</div>
}

export function Stat({ label, value, icon, gradient = 'from-slate-500 to-slate-700' }: { label: string; value: string; icon?: React.ReactNode; gradient?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs hover:shadow-sm transition">
      {icon && <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} text-white shadow-xs`}>{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
        <div className="mt-0.5 truncate text-[13px] font-bold text-slate-900">{value || '—'}</div>
      </div>
    </div>
  )
}

export function Section({ icon, title, subtitle, children, defaultOpen = true, tone }: {
  icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode; defaultOpen?: boolean; tone: SectionTone
}) {
  const [open, setOpen] = useState(defaultOpen)
  const style = SECTION_STYLES[tone]
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 border-b border-slate-100">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.icon} shadow-xs`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-bold text-slate-900">{title}</h2>
          <p className="text-[12px] text-slate-500">{subtitle}</p>
        </div>
        {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4 pt-3">{children}</div>}
    </section>
  )
}

export function ImageUploader({ value, onChange, fallback, shape = 'landscape', disabled, hidePreview = false, slot = 'logo' }: {
  value: string; onChange: (v: string) => void; fallback: string; shape?: 'landscape' | 'square' | 'circle'; disabled?: boolean; hidePreview?: boolean; slot?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sizeMap = {
    landscape: 'h-16 w-16 sm:h-20 sm:w-20 rounded-lg',
    square: 'h-14 w-14 sm:h-16 sm:w-16 rounded-lg',
    circle: 'h-12 w-12 sm:h-14 sm:w-14 rounded-full',
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('slot', slot)
      const res = await fetch('/api/admin-supreme/upload-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Error al subir')
      onChange(data.imageUrl)
    } catch (err: any) {
      setError(err.message || 'Error al subir imagen')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 transition hover:border-slate-300">
      <div className="flex items-center gap-2.5">
        {!hidePreview && (
          <div className={`shrink-0 overflow-hidden ${sizeMap[shape]} border border-slate-200 bg-slate-50`}>
            {uploading ? (
              <div className="flex h-full w-full items-center justify-center bg-slate-50">
                <Loader2 size={16} className="animate-spin text-slate-400" />
              </div>
            ) : (
              <Img src={value} alt="" fallback={fallback} className={`h-full w-full ${shape === 'circle' ? 'rounded-full' : 'rounded-lg'}`} />
            )}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || uploading}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-xs transition hover:bg-slate-900 disabled:opacity-40 disabled:pointer-events-none"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading ? 'Subiendo...' : 'Subir'}
            </button>
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="o pega URL..."
              className="block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-sky-400 focus:ring-1 focus:ring-sky-100"
              disabled={disabled}
            />
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          {error && <div className="text-[10px] text-red-500">{error}</div>}
        </div>
      </div>
    </div>
  )
}

