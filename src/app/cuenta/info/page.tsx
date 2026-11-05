'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Phone, CreditCard, Loader2, Check, MessageCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getServices } from '@/lib/db';

const FF = '"Proxima Nova",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif';

export default function InfoPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ phone: '', rut: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) router.replace('/login');
  }, [isLoggedIn, authLoading, router]);

  useEffect(() => {
    if (user) {
      (async () => {
        try {
          const { account } = getServices();
          const acc = await account.get();
          const prefs = (acc as any).prefs || {};
          setForm({
            phone: prefs.phone || user.phone || '',
            rut: prefs.rut || '',
          });
        } catch {}
      })();
    }
  }, [user]);

  function formatRut(val: string) {
    const clean = val.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length <= 1) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { account } = getServices();
      const acc = await account.get();
      const currentPrefs = (acc as any).prefs || {};
      const updatedPrefs = {
        ...currentPrefs,
        phone: form.phone,
        rut: form.rut,
      };
      await account.updatePrefs(updatedPrefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ebebeb' }}>
        <Loader2 size={32} color="#3483fa" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!isLoggedIn || !user) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#ebebeb', fontFamily: FF, paddingTop: 64 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10, marginTop: -64 }}>
        <Link href="/cuenta" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <ArrowLeft size={22} color="#333" />
        </Link>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#333' }}>Información Personal</span>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 12px 40px' }}>
        
        {/* User info card */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#3483fa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700 }}>
              {(user?.name || 'Usuario').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'U'}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#333' }}>{user.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#666' }}>{user.email}</p>
            </div>
          </div>

          <p style={{ margin: '0 0 16px', fontSize: 14, color: '#555' }}>
            Actualizá tu información de contacto. Estos datos se usarán automáticamente en tus compras.
          </p>

          {/* Phone */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              <Phone size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Teléfono
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+56 9 1234 5678"
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s' }}
              onFocus={e => (e.target.style.borderColor = '#3483fa')}
              onBlur={e => (e.target.style.borderColor = '#e0e0e0')}
            />
          </div>

          {/* RUT */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              <CreditCard size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              RUT
            </label>
            <input
              value={form.rut}
              onChange={e => setForm(f => ({ ...f, rut: formatRut(e.target.value) }))}
              placeholder="12.345.678-9"
              maxLength={12}
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s' }}
              onFocus={e => (e.target.style.borderColor = '#3483fa')}
              onBlur={e => (e.target.style.borderColor = '#e0e0e0')}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{ width: '100%', padding: '14px 0', background: saving ? '#85b0f5' : (saved ? '#00a650' : '#3483fa'), color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s' }}>
            {saving ? (
              <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />Guardando...</>
            ) : saved ? (
              <><Check size={18} />Guardado</>
            ) : (
              'Guardar cambios'
            )}
          </button>
        </div>

        {/* Info card */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#666', lineHeight: 1.5 }}>
            💡 <strong>Tip:</strong> Al guardar tu teléfono y RUT, estos datos se rellenarán automáticamente en tus futuras compras, ahorrándote tiempo en el checkout.
          </p>
        </div>

        {/* WhatsApp Link Section */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1.5px solid #dcfce7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <MessageCircle size={22} color="#25D366" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>Conectar WhatsApp</h3>
          </div>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: '#555', lineHeight: 1.5 }}>
            ¿Escribiste mal tu número al registrarte? Haz click aquí para vincular tu WhatsApp actual a Yaxbot y recibir notificaciones.
          </p>
          <a
            href={`https://wa.me/56962293893?text=vincular_cuenta%20${user.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', background: '#25D366', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 15, transition: 'all .2s' }}
          >
            <MessageCircle size={18} /> Vincular mi WhatsApp
          </a>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
