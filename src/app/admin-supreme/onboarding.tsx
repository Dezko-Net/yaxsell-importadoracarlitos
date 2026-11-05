'use client'

import { useState } from 'react'

const ASIS_AVATAR_URL = 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%2260%22%20viewBox%3D%220%200%20200%2060%22%3E%3Crect%20width%3D%22200%22%20height%3D%2260%22%20fill%3D%22%231a1a2e%22%2F%3E%3Ctext%20x%3D%22100%22%20y%3D%2230%22%20font-family%3D%22sans-serif%22%20font-size%3D%2214%22%20fill%3D%22%23fff%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3ELogo%3C%2Ftext%3E%3C%2Fsvg%3E'
const LOGO_PRESETS = [
  { id: 'default1', url: 'https://img.freepik.com/vector-premium/vector-diseno-logotipo-minimalista-abstracto-creativo-elegante-cualquier-empresa-marca_1253202-135975.jpg?semt=ais_rp_progressive&w=740&q=80', label: 'Abstracto' },
  { id: 'default2', url: 'https://cdn-icons-png.flaticon.com/512/3139/3139056.jpg', label: 'Tienda' },
  { id: 'default3', url: 'https://cdn-icons-png.flaticon.com/512/9472/9472146.png', label: 'Negocio' },
  { id: 'default4', url: 'https://cdn-icons-png.flaticon.com/512/6213/6213150.png', label: 'Corporativo' },
]
const AVATAR_PRESETS = [
  { id: 'av1', url: 'https://www.shutterstock.com/image-photo/confident-middle-aged-business-man-600nw-2516789501.jpg', label: 'Hombre 1' },
  { id: 'av2', url: 'https://img.freepik.com/foto-gratis/retrato-mujer-sonriente_176532-100509.jpg', label: 'Mujer 1' },
  { id: 'av3', url: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png', label: 'Avatar' },
  { id: 'av4', url: 'https://cdn-icons-png.flaticon.com/512/924/924874.png', label: 'Usuario' },
]
const GRADIENT_PRESETS = [
  { id: 'sky', css: 'from-sky-500 via-cyan-500 to-blue-600', label: 'Cielo' },
  { id: 'violet', css: 'from-violet-500 via-purple-500 to-indigo-600', label: 'Violeta' },
  { id: 'emerald', css: 'from-emerald-500 via-teal-500 to-cyan-600', label: 'Esmeralda' },
  { id: 'rose', css: 'from-rose-500 via-pink-500 to-fuchsia-600', label: 'Rosa' },
  { id: 'amber', css: 'from-amber-500 via-orange-500 to-red-500', label: 'Fuego' },
  { id: 'slate', css: 'from-slate-700 via-slate-800 to-slate-900', label: 'Oscuro' },
]

export function AdminOnboarding({ open, onClose, obCompanyName, setObCompanyName, obOwnerName, setObOwnerName, obBranchName, setObBranchName, obBranchSlug, setObBranchSlug, obBranchImage, setObBranchImage, obSparkMode, setObSparkMode, obLogoUrl, setObLogoUrl, obAvatarUrl, setObAvatarUrl, obGradient, setObGradient, obWorkerName, setObWorkerName, obWorkerNac, setObWorkerNac, obWorkerGenero, setObWorkerGenero, onFinish }: {
  open: boolean
  onClose?: () => void
  obCompanyName: string; setObCompanyName: (v: string) => void
  obOwnerName: string; setObOwnerName: (v: string) => void
  obBranchName: string; setObBranchName: (v: string) => void
  obBranchSlug: string; setObBranchSlug: (v: string) => void
  obBranchImage: string; setObBranchImage: (v: string) => void
  obSparkMode: boolean; setObSparkMode: (v: boolean) => void
  obLogoUrl: string; setObLogoUrl: (v: string) => void
  obAvatarUrl: string; setObAvatarUrl: (v: string) => void
  obGradient: string; setObGradient: (v: string) => void
  obWorkerName: string; setObWorkerName: (v: string) => void
  obWorkerNac: string; setObWorkerNac: (v: string) => void
  obWorkerGenero: 'HOMBRE' | 'MUJER'; setObWorkerGenero: (v: 'HOMBRE' | 'MUJER') => void
  onFinish: () => void
}) {
  const [step, setStep] = useState(0)
  const totalSteps = 4
  if (!open) return null

  const canNext = step === 0 ? !!(obCompanyName.trim() && obOwnerName.trim())
    : step === 1 ? !!(obBranchName.trim() && obBranchSlug.trim())
    : true

  const handleNext = () => { if (step < totalSteps - 1) setStep(step + 1); else onFinish() }
  const stepLabels = ['Empresa', 'Sucursal', 'Branding', 'Cajera']

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-sky-50/60" />
      <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-cyan-300/50 blur-3xl animate-[blobDrift1_8s_ease-in-out_infinite]" />
      <div className="absolute -bottom-32 -right-20 h-[28rem] w-[28rem] rounded-full bg-sky-300/50 blur-3xl animate-[blobDrift2_10s_ease-in-out_infinite]" />
      <div className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-200/40 blur-3xl animate-[blobDrift3_12s_ease-in-out_infinite]" />
      <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-violet-200/30 blur-3xl animate-[blobDrift2_9s_ease-in-out_infinite_1s]" />

      <div className="pointer-events-none absolute inset-0">
        {[...Array(14)].map((_, i) => (
          <span key={`p_${i}`} className="absolute rounded-full animate-[particleFloat_6s_ease-in-out_infinite]" style={{
            left: `${(i * 17) % 95}%`, top: `${(i * 13 + 5) % 90}%`,
            width: `${3 + (i % 4) * 2}px`, height: `${3 + (i % 4) * 2}px`,
            background: i % 3 === 0 ? 'rgba(56,189,248,0.6)' : i % 3 === 1 ? 'rgba(99,102,241,0.5)' : 'rgba(168,85,247,0.45)',
            boxShadow: '0 0 12px rgba(125,211,252,0.5)',
            animationDelay: `${(i * 0.3) % 3}s`, animationDuration: `${4 + (i % 5) * 1.5}s`,
          }} />
        ))}
      </div>

      <div className="relative h-full w-full flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-3xl mb-6 animate-[fadeInUp_0.5s_ease-out_both]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <img src={ASIS_AVATAR_URL} alt="ASIS" className="w-7 h-7 rounded-full border-2 border-white shadow" />
              <span className="text-[11px] font-black tracking-[0.2em] text-sky-700/80">SETUP</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold text-slate-400">{step + 1} / {totalSteps}</span>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition-colors"
                  title="Cerrar y volver al panel"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-1.5">
            {stepLabels.map((label, i) => (
              <div key={label} className="flex-1 flex flex-col items-center gap-1">
                <div className={`h-1.5 w-full rounded-full transition-all duration-500 ${i <= step ? 'bg-gradient-to-r from-sky-400 to-cyan-400' : 'bg-slate-200/60'}`} />
                <span className={`text-[9px] font-bold transition-colors ${i === step ? 'text-sky-600' : i < step ? 'text-sky-400' : 'text-slate-300'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-3xl animate-[fadeInUp_0.6s_ease-out_both]" key={step}>
          <div className="rounded-3xl border border-white/60 bg-white/65 backdrop-blur-2xl shadow-[0_20px_60px_rgba(14,165,233,0.12)] p-8 sm:p-10">

            {step === 0 && (
              <div className="space-y-5">
                <div className="text-center mb-4">
                  <div className="mx-auto relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
                    <div className="absolute inset-[-15px] rounded-full bg-gradient-to-br from-cyan-400/20 via-sky-300/15 to-indigo-300/10 blur-xl animate-[pulse_4s_ease-in-out_infinite]" />
                    <div className="relative rounded-full border-[3px] border-white/70 bg-white/40 shadow-[0_0_100px_rgba(125,211,252,0.5)] overflow-hidden animate-[asisFloat_3s_ease-in-out_infinite]" style={{ width: 120, height: 120 }}>
                      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.96), rgba(186,230,253,0.45) 45%, rgba(14,165,233,0.15) 100%)' }} />
                      <img src={ASIS_AVATAR_URL} alt="ASIS" className="relative h-full w-full rounded-full object-cover" />
                    </div>
                  </div>
                  <h2 className="mt-5 text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-sky-600 to-cyan-500" style={{
                    backgroundImage: 'linear-gradient(90deg, #0f172a 0%, #0369a1 25%, #0ea5e9 50%, #7c3aed 75%, #0f172a 100%)',
                    backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'textShine 5s linear infinite',
                  }}>HOLA, SOY ASIS</h2>
                  <p className="mt-2 text-sm text-slate-500">Cuéntame sobre tu empresa</p>
                </div>
                <label className="block group">
                  <span className="text-[11px] font-black tracking-[0.16em] text-slate-600 group-focus-within:text-sky-600 transition-colors">NOMBRE DE LA EMPRESA</span>
                  <input value={obCompanyName} onChange={(e) => setObCompanyName(e.target.value)} placeholder="Ej: Mi Empresa" className="mt-1.5 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100/80 transition-all" autoFocus required />
                </label>
                <label className="block group">
                  <span className="text-[11px] font-black tracking-[0.16em] text-slate-600 group-focus-within:text-sky-600 transition-colors">NOMBRE DEL OPERADOR</span>
                  <input value={obOwnerName} onChange={(e) => setObOwnerName(e.target.value)} placeholder="Ej: Juan Pérez" className="mt-1.5 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100/80 transition-all" required />
                </label>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <h2 className="text-xl font-black text-slate-800">Tu primera sucursal</h2>
                  <p className="mt-1 text-sm text-slate-500">Puedes agregar más después</p>
                </div>
                <label className="block group">
                  <span className="text-[11px] font-black tracking-[0.16em] text-slate-600 group-focus-within:text-sky-600 transition-colors">NOMBRE</span>
                  <input value={obBranchName} onChange={(e) => { setObBranchName(e.target.value); setObBranchSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')) }} placeholder="Ej: Sucursal Central" className="mt-1.5 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100/80 transition-all placeholder:text-slate-400" autoFocus required />
                </label>
                <div>
                  <span className="text-[11px] font-black tracking-[0.16em] text-slate-600">IMAGEN DE LA SUCURSAL</span>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="shrink-0 h-16 w-16 rounded-xl border border-slate-200/60 bg-white/80 overflow-hidden flex items-center justify-center">
                      {obBranchImage ? <img src={obBranchImage} alt="Sucursal" className="h-full w-full object-cover" /> : <span className="text-2xl">🏪</span>}
                    </div>
                    <div className="flex-1 space-y-2">
                      <input value={obBranchImage} onChange={(e) => setObBranchImage(e.target.value)} placeholder="Pega una URL de imagen…" className="w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100/80 transition-all placeholder:text-slate-400" />
                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200/80 bg-white/90 text-sm font-bold text-slate-600 cursor-pointer hover:bg-slate-50 transition-all">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => setObBranchImage(reader.result as string)
                          reader.readAsDataURL(file)
                        }} />
                        📁 Subir desde PC
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div className="text-center mb-2">
                  <h2 className="text-xl font-black text-slate-800">Personaliza tu marca</h2>
                  <p className="mt-1 text-sm text-slate-500">Logo, avatar y colores del sistema</p>
                </div>
                <div>
                  <span className="text-[11px] font-black tracking-[0.16em] text-slate-600">LOGO DE EMPRESA</span>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="shrink-0 h-16 w-16 rounded-xl border border-slate-200/60 bg-white/80 overflow-hidden flex items-center justify-center">
                      {obLogoUrl ? <img src={obLogoUrl} alt="Logo" className="h-full w-full object-cover" /> : <span className="text-2xl">🖼️</span>}
                    </div>
                    <div className="flex-1 space-y-2">
                      <input value={obLogoUrl} onChange={(e) => setObLogoUrl(e.target.value)} placeholder="Pega una URL de imagen…" className="w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100/80 transition-all placeholder:text-slate-400" />
                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200/80 bg-white/90 text-sm font-bold text-slate-600 cursor-pointer hover:bg-slate-50 transition-all">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => setObLogoUrl(reader.result as string)
                          reader.readAsDataURL(file)
                        }} />
                        📁 Subir desde PC
                      </label>
                    </div>
                  </div>
                </div>
                <div>
                  <span className="text-[11px] font-black tracking-[0.16em] text-slate-600">AVATAR POR DEFECTO</span>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="shrink-0 h-16 w-16 rounded-full border border-slate-200/60 bg-white/80 overflow-hidden flex items-center justify-center">
                      {obAvatarUrl ? <img src={obAvatarUrl} alt="Avatar" className="h-full w-full object-cover rounded-full" /> : <span className="text-2xl">👤</span>}
                    </div>
                    <div className="flex-1 space-y-2">
                      <input value={obAvatarUrl} onChange={(e) => setObAvatarUrl(e.target.value)} placeholder="Pega una URL de imagen…" className="w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100/80 transition-all placeholder:text-slate-400" />
                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200/80 bg-white/90 text-sm font-bold text-slate-600 cursor-pointer hover:bg-slate-50 transition-all">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => setObAvatarUrl(reader.result as string)
                          reader.readAsDataURL(file)
                        }} />
                        📁 Subir desde PC
                      </label>
                    </div>
                  </div>
                </div>
                <div>
                  <span className="text-[11px] font-black tracking-[0.16em] text-slate-600">COLOR PRINCIPAL</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">Se usa en botones, barras y acentos del sistema</p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="shrink-0 h-12 w-12 rounded-xl border border-slate-200/60 overflow-hidden" style={{ background: obGradient ? `linear-gradient(135deg, ${obGradient})` : '#cbd5e1' }} />
                    <div className="flex-1 space-y-2">
                      <input value={obGradient} onChange={(e) => setObGradient(e.target.value)} placeholder="Ej: #3b82f6 o from-sky-500 via-cyan-500 to-blue-600" className="w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100/80 transition-all placeholder:text-slate-400" />
                      <p className="text-[10px] text-slate-400">Pega un color hex (ej: #3b82f6) o clases de gradiente Tailwind</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <div className="text-4xl mb-2">👩‍💼</div>
                  <h2 className="text-xl font-black text-slate-800">Tu primer trabajador</h2>
                  <p className="mt-1 text-sm text-slate-500">Agrega a tu primera cajera para la planilla. Es necesario para realizar cortes de caja.</p>
                </div>
                <label className="block group">
                  <span className="text-[11px] font-black tracking-[0.16em] text-slate-600 group-focus-within:text-sky-600 transition-colors">NOMBRE COMPLETO</span>
                  <input value={obWorkerName} onChange={(e) => setObWorkerName(e.target.value)} placeholder="Ej: María González" className="mt-1.5 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100/80 transition-all" autoFocus />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block group">
                    <span className="text-[11px] font-black tracking-[0.16em] text-slate-600">NACIONALIDAD</span>
                    <select value={obWorkerNac} onChange={(e) => setObWorkerNac(e.target.value)} className="mt-1.5 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100/80 transition-all">
                      <option value="CHILENA">Chilena</option><option value="VENEZOLANA">Venezolana</option>
                      <option value="COLOMBIANA">Colombiana</option><option value="PERUANA">Peruana</option>
                      <option value="ECUATORIANA">Ecuatoriana</option><option value="BOLIVIANA">Boliviana</option>
                      <option value="ARGENTINA">Argentina</option><option value="HAITIANA">Haitiana</option>
                      <option value="OTRA">Otra</option>
                    </select>
                  </label>
                  <label className="block group">
                    <span className="text-[11px] font-black tracking-[0.16em] text-slate-600">GÉNERO</span>
                    <div className="mt-1.5 flex gap-2">
                      <button type="button" onClick={() => setObWorkerGenero('MUJER')} className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-bold transition-all ${obWorkerGenero === 'MUJER' ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-slate-200/80 text-slate-500 hover:border-pink-200'}`}>Mujer</button>
                      <button type="button" onClick={() => setObWorkerGenero('HOMBRE')} className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-bold transition-all ${obWorkerGenero === 'HOMBRE' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200/80 text-slate-500 hover:border-blue-200'}`}>Hombre</button>
                    </div>
                  </label>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-2.5">
                  <p className="text-[11px] text-sky-700 font-semibold">📋 Se creará como <strong>CAJERA</strong> en la sucursal <strong>{obBranchName || 'tu sucursal'}</strong></p>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-3">
              {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className="px-5 py-2.5 rounded-xl border border-slate-200/80 bg-white/80 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-all">← Atrás</button>}
              {onClose && <button type="button" onClick={onClose} className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">Volver al panel</button>}
              {step === totalSteps - 1 && <button type="button" onClick={() => onFinish()} className="text-sm text-slate-400 hover:text-slate-600 font-medium transition-colors ml-auto">Omitir</button>}
              <button type="button" onClick={handleNext} disabled={!canNext} className={`relative flex-1 rounded-2xl font-black py-3 shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] overflow-hidden group ${canNext ? 'bg-gradient-to-r from-sky-500 via-cyan-500 to-blue-600 text-white shadow-sky-400/25 hover:shadow-sky-400/40' : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}`}>
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <span className="relative">{step < totalSteps - 1 ? 'Siguiente →' : '🎉 Completar Configuración'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blobDrift1 { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(30px,-20px) scale(1.05); } 66% { transform: translate(-20px,15px) scale(0.95); } }
        @keyframes blobDrift2 { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(-25px,20px) scale(1.08); } 66% { transform: translate(20px,-15px) scale(0.92); } }
        @keyframes blobDrift3 { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.1); } }
        @keyframes particleFloat { 0%,100% { transform: translateY(0) scale(1); opacity: 0.7; } 50% { transform: translateY(-18px) scale(1.3); opacity: 1; } }
        @keyframes asisFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes textShine { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </div>
  )
}
