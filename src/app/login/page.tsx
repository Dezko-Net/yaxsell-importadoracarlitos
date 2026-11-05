'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from '@/components/StoreImage';
import { Eye, EyeOff, AlertCircle, Loader2, ArrowLeft, Mail, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import { getSectionConfigAsync, type SectionConfig } from '@/lib/section-config';
import { useStoreSettings } from '@/hooks/useStoreSettings';

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, register, loginWithGoogle, isLoggedIn, isLoading } = useAuth();

  const [tab, setTab] = useState<'login' | 'register'>(
    params.get('tab') === 'register' ? 'register' : 'login'
  );
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const { storeName: settingsStoreName, logoUrl: settingsLogoUrl } = useStoreSettings();
  const [storeName, setStoreName] = useState<string>('Importadora Carlitos');
  const [logoUrl, setLogoUrl] = useState<string>('');

  useEffect(() => {
    if (settingsStoreName) setStoreName(settingsStoreName);
    if (settingsLogoUrl) setLogoUrl(settingsLogoUrl);
  }, [settingsStoreName, settingsLogoUrl]);

  const emailParam = params.get('email') || '';
  const [loginForm, setLoginForm] = useState({ email: emailParam, password: '' });
  const [regForm, setRegForm] = useState({ email: '', password: '', confirm: '' });

  const redirectTo = (() => {
    const r = params.get('redirect');
    return r && r.startsWith('/') ? r : '/cuenta';
  })();

  useEffect(() => {
    if (!isLoading && isLoggedIn) router.replace(redirectTo);
  }, [isLoggedIn, isLoading, router, redirectTo]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginForm.email || !loginForm.password) { setError('Completá todos los campos'); return; }
    setSubmitting(true); setError('');
    const res = await login(loginForm.email, loginForm.password);
    setSubmitting(false);
    if (res.success) router.replace(redirectTo);
    else setError(res.error || 'Error al iniciar sesión');
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!regForm.email || !regForm.password) { setError('Ingresá tu correo y contraseña'); return; }
    if (regForm.password !== regForm.confirm) { setError('Las contraseñas no coinciden'); return; }
    if (regForm.password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return; }
    setSubmitting(true); setError('');
    // Solo pedimos correo + contraseña. El nombre y demás datos (RUT, teléfono,
    // dirección) se piden y se guardan al hacer el primer pedido. Como nombre
    // inicial usamos la parte del correo, hasta que el cliente complete el suyo.
    const placeholderName = regForm.email.split('@')[0] || 'Cliente';
    const res = await register(regForm.email, regForm.password, placeholderName);
    setSubmitting(false);
    if (res.success) {
      router.replace(redirectTo);
    }
    else setError(res.error || 'Error al registrarse');
  }

  async function handleGoogleLogin() {
    setSubmitting(true); setError('');
    const res = await loginWithGoogle();
    setSubmitting(false);
    if (res.success) router.replace(redirectTo);
    else setError(res.error || 'Error al iniciar sesi\u00F3n con Google');
  }

  return (
    <div className="min-h-screen min-h-[100dvh] font-['DM_Sans'] flex flex-col relative overflow-hidden bg-slate-50">
      {/* Premium Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-300 mix-blend-multiply filter blur-[100px] opacity-30 animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-400 mix-blend-multiply filter blur-[120px] opacity-30" style={{ animation: 'pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
        <div className="absolute top-[20%] right-[20%] w-[30%] h-[30%] rounded-full bg-blue-200 mix-blend-multiply filter blur-[80px] opacity-40" />
      </div>

      {/* Top Navbar */}
      <nav className="relative z-10 w-full px-4 sm:px-6 pt-4 pb-2 sm:py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center group">
          {logoUrl ? (
            <img src={logoUrl} alt={storeName} className="h-7 sm:h-8 md:h-10 w-auto transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <span className="text-lg sm:text-xl font-bold text-gray-800">{storeName}</span>
          )}
        </Link>
        <Link href="/" className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-0 sm:py-0 rounded-xl bg-white/70 sm:bg-transparent border border-slate-200/60 sm:border-0 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors shadow-2xs sm:shadow-none">
          <ArrowLeft size={15} />
          <span>Volver</span>
          <span className="hidden sm:inline"> a la tienda</span>
        </Link>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-2 py-3 sm:p-4 relative z-10 w-full max-w-7xl mx-auto">
        <div className="w-full flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-24">
          
          {/* Left Text / Branding Area (Hidden on small screens) */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
            className="hidden lg:flex flex-col max-w-md"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold tracking-wide uppercase mb-6 w-fit">
              <SparklesIcon /> Exclusivo
            </div>
            <h1 className="text-5xl font-black text-slate-900 leading-tight mb-6 tracking-tight">
              Desbloquea el acceso a <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-blue-600">ofertas premium</span>.
            </h1>
            <p className="text-lg text-slate-500 mb-8 leading-relaxed">
              Únete a nuestra comunidad para disfrutar de envíos rápidos, beneficios del programa de lealtad y atención personalizada.
            </p>
            <div className="grid grid-cols-2 gap-6">
              {[
                { label: 'Envíos Priority', desc: 'Recibe antes que nadie' },
                { label: 'Niveles VIP', desc: 'Gana puntos y sube de nivel' },
                { label: 'Ofertas Flash', desc: 'Acceso anticipado' },
                { label: 'Soporte 24/7', desc: 'Atención prioritaria' },
              ].map((b, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-slate-900 font-bold">
                    <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">✓</div>
                    {b.label}
                  </div>
                  <span className="text-sm text-slate-500 pl-7">{b.desc}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right Form Area */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full max-w-[440px] px-1 sm:px-0"
          >
            <div className="bg-white/90 sm:bg-white/80 backdrop-blur-xl rounded-2xl sm:rounded-[32px] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] border border-white/60 overflow-hidden relative">
              
              {/* Form Header Tabs */}
              <div className="flex relative p-1.5 bg-slate-100/70 m-3 sm:m-6 rounded-xl sm:rounded-2xl">
                <div 
                  className="absolute inset-y-1.5 w-[calc(50%-6px)] bg-white rounded-lg sm:rounded-xl shadow-xs transition-all duration-300 ease-out"
                  style={{ left: tab === 'login' ? '6px' : 'calc(50%)' }}
                />
                {(['login', 'register'] as const).map(t => (
                  <button 
                    key={t} onClick={() => { setTab(t); setError(''); }}
                    className={`relative flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-bold z-10 transition-colors duration-200 cursor-pointer ${tab === t ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {t === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                  </button>
                ))}
              </div>

              <div className="px-3.5 sm:px-8 pb-5 sm:pb-8">
                <div className="mb-5 sm:mb-8 text-center">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-1 sm:mb-2">
                    {tab === 'login' ? '¡Hola de nuevo!' : 'Comienza tu viaje'}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500">
                    {tab === 'login' ? 'Ingresa tus credenciales para continuar.' : 'Completá tus datos para unirte.'}
                  </p>
                </div>

                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="flex items-start gap-2.5 p-3.5 mb-5 bg-blue-50 border border-blue-100 rounded-xl text-blue-600 text-xs sm:text-sm font-medium"
                    >
                      <AlertCircle size={17} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Google Login Button */}
                <div className="mt-1 mb-1">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2.5 py-3 sm:py-3.5 bg-white hover:bg-slate-50 active:scale-[0.99] text-slate-700 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm border border-slate-200 transition-all disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-xs cursor-pointer"
                  >
                    {submitting ? (
                      <Loader2 size={18} className="animate-spin text-slate-400" />
                    ) : (
                      <GoogleIcon size={19} />
                    )}
                    <span>Continuar con Google</span>
                  </button>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 sm:gap-4 my-4 sm:my-6">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">o con tu correo</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <div className="relative">
                  <AnimatePresence mode="wait">
                    {/* ── LOGIN FORM ── */}
                    {tab === 'login' && (
                      <motion.form 
                        key="login"
                        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}
                        onSubmit={handleLogin} className="flex flex-col gap-3.5 sm:gap-5"
                      >
                        <InputField 
                          label="Correo electrónico" icon={<Mail size={17} />} type="email" placeholder="tu@correo.com"
                          value={loginForm.email} onChange={(e: any) => setLoginForm(f => ({ ...f, email: e.target.value }))} autoFocus
                        />
                        <div className="flex flex-col gap-1.5 sm:gap-2">
                          <div className="flex justify-between items-center">
                            <label className="text-xs sm:text-sm font-bold text-slate-700">Contraseña</label>
                            <button type="button" className="text-[11px] sm:text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors">
                              ¿Olvidaste tu contraseña?
                            </button>
                          </div>
                          <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3.5 sm:pl-4 flex items-center text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                              <Lock size={17} />
                            </div>
                            <input 
                              type={showPass ? 'text' : 'password'} value={loginForm.password}
                              onChange={(e: any) => setLoginForm(f => ({ ...f, password: e.target.value }))}
                              placeholder="••••••••"
                              className="w-full pl-10 pr-10 sm:pl-11 sm:pr-12 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl text-slate-900 text-sm font-medium focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                            />
                            <button 
                              type="button" onClick={() => setShowPass(!showPass)}
                              className="absolute inset-y-0 right-0 pr-3.5 sm:pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                            >
                              {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                            </button>
                          </div>
                        </div>

                        <button 
                          type="submit" disabled={submitting}
                          className="mt-2 sm:mt-4 w-full group relative flex items-center justify-center gap-2 py-3.5 sm:py-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_8px_20px_rgba(0,0,0,0.12)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.18)] cursor-pointer"
                          style={{ background: '#0f172a', color: '#fff' }}
                        >
                          {submitting ? (
                            <><Loader2 size={18} className="animate-spin" /> Ingresando...</>
                          ) : (
                            <>Ingresar <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></>
                          )}
                        </button>
                      </motion.form>
                    )}

                    {/* ── REGISTER FORM ── */}
                    {tab === 'register' && (
                      <motion.form 
                        key="register"
                        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}
                        onSubmit={handleRegister} className="flex flex-col gap-3.5 sm:gap-4"
                      >
                        <InputField label="Correo electrónico" icon={<Mail size={17} />} type="email" value={regForm.email} onChange={(e: any) => setRegForm(f => ({ ...f, email: e.target.value }))} placeholder="tu@correo.com" autoFocus />
                        <p className="text-[11px] text-slate-400 -mt-1 leading-snug">Solo necesitas tu correo y una contraseña. Tus datos (nombre, RUT, teléfono) los completas en tu primer pedido.</p>

                        <div className="flex flex-col gap-1.5 sm:gap-2">
                          <label className="text-xs sm:text-sm font-bold text-slate-700">Contraseña *</label>
                          <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3.5 sm:pl-4 flex items-center text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                              <Lock size={17} />
                            </div>
                            <input 
                              type={showPass ? 'text' : 'password'} value={regForm.password}
                              onChange={(e: any) => setRegForm(f => ({ ...f, password: e.target.value }))}
                              placeholder="Mínimo 8 caracteres"
                              className="w-full pl-10 pr-10 sm:pl-11 sm:pr-12 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl text-slate-900 text-sm font-medium focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                            />
                            <button 
                              type="button" onClick={() => setShowPass(!showPass)}
                              className="absolute inset-y-0 right-0 pr-3.5 sm:pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                            >
                              {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5 sm:gap-2">
                          <label className="text-xs sm:text-sm font-bold text-slate-700">Confirmar contraseña *</label>
                          <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3.5 sm:pl-4 flex items-center text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                              <Lock size={17} />
                            </div>
                            <input 
                              type="password" value={regForm.confirm}
                              onChange={(e: any) => setRegForm(f => ({ ...f, confirm: e.target.value }))}
                              placeholder="Repite tu contraseña"
                              className={`w-full pl-10 pr-4 sm:pl-11 py-3 sm:py-3.5 bg-slate-50 border rounded-xl sm:rounded-2xl text-slate-900 text-sm font-medium focus:bg-white focus:ring-4 transition-all outline-none
                                ${regForm.confirm && regForm.confirm !== regForm.password ? 'border-blue-400 focus:border-blue-500 focus:ring-blue-500/10' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10'}`}
                            />
                          </div>
                        </div>

                        <button 
                          type="submit" disabled={submitting}
                          className="mt-2 sm:mt-4 w-full group relative flex items-center justify-center gap-2 py-3.5 sm:py-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_8px_20px_rgba(0,0,0,0.12)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.18)] cursor-pointer"
                          style={{ background: '#0f172a', color: '#fff' }}
                        >
                          {submitting ? (
                            <><Loader2 size={18} className="animate-spin" /> Creando cuenta...</>
                          ) : (
                            <>Crear cuenta <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></>
                          )}
                        </button>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            <p className="text-center text-[11px] sm:text-xs text-slate-400 mt-5 sm:mt-8 font-medium">
              Al continuar, aceptas nuestros{' '}
              <a href="#" className="text-slate-600 hover:text-blue-600 underline decoration-slate-300 hover:decoration-blue-500 transition-colors">Términos y condiciones</a>
              {' '}y{' '}
              <a href="#" className="text-slate-600 hover:text-blue-600 underline decoration-slate-300 hover:decoration-blue-500 transition-colors">Política de privacidad</a>.
            </p>
          </motion.div>
        </div>
      </div>

    </div>
  );
}

function InputField({ label, icon, ...props }: any) {
  return (
    <div className="flex flex-col gap-1.5 sm:gap-2">
      <label className="text-xs sm:text-sm font-bold text-slate-700">{label}</label>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3.5 sm:pl-4 flex items-center text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
          {icon}
        </div>
        <input 
          {...props}
          className="w-full pl-10 pr-3 sm:pl-11 sm:pr-4 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl text-slate-900 text-sm font-medium focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
        />
      </div>
    </div>
  );
}

function SparklesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
