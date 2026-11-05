'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, Camera, Save, X, ImagePlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getServices, getFirebaseConfig, MEDIA_BUCKET_ID, MEDIA_PREFIXES } from '@/lib/db';

const FF = '"DM Sans",system-ui,sans-serif';
const PINK = '#3b82f6';

export default function PerfilPage() {
  const { user, isLoggedIn, updateProfile } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [currentCoverUrl, setCurrentCoverUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isLoggedIn && user) {
      setName(user.name);
      (async () => {
        try {
          const { account } = getServices();
          const acc = await account.get();
          const prefs = (acc as any).prefs || {};
          if (prefs.coverFileId) setCurrentCoverUrl(getFilePreviewUrl(prefs.coverFileId));
        } catch {}
      })();
    }
  }, [isLoggedIn, user]);

  if (!isLoggedIn || !user) {
    return null;
  }

  const userName = user?.name || 'Usuario';
  const initials = userName.split(' ').filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';

  function getFilePreviewUrl(fileId: string): string {
    const { endpoint, projectId } = getFirebaseConfig();
    const path = fileId;
    return `${endpoint}/storage/buckets/${MEDIA_BUCKET_ID}/files/${path}/view?project=${projectId}`;
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setCoverPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await updateProfile({ name });
      const { storage, account } = getServices();
      const acc = await account.get();
      const prefs = (acc as any).prefs || {};
      if (avatarFile) {
        const fileId = 'avatar-' + Date.now();
        const file = await storage.createFile(MEDIA_BUCKET_ID, fileId, avatarFile);
        prefs.avatarFileId = fileId;
      }
      if (coverFile) {
        const fileId = 'cover-' + Date.now();
        const file = await storage.createFile(MEDIA_BUCKET_ID, fileId, coverFile);
        prefs.coverFileId = fileId;
      }
      if (avatarFile || coverFile) {
        await account.updatePrefs(prefs);
      }
      router.push('/cuenta');
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={{ fontFamily: FF, padding: '24px', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '32px', border: '1px solid #f0f0f0', boxShadow: '0 8px 28px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1a', margin: '0 0 24px', letterSpacing: '-0.02em' }}>
          Editar perfil
        </h1>

        {/* Cover section */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
            Portada
          </label>
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', height: 140, background: '#f3f4f6' }}>
            {(coverPreview || currentCoverUrl) ? (
              <img src={coverPreview || currentCoverUrl || ''} alt="Cover preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexDirection: 'column', gap: 6 }}>
                <ImagePlus size={28} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>Sin portada</span>
              </div>
            )}
            <label htmlFor="cover-input" style={{
              position: 'absolute', top: 10, right: 10,
              padding: '6px 12px', borderRadius: 10,
              background: 'rgba(0,0,0,0.5)', color: '#fff',
              display: 'flex', alignItems: 'center', gap: 5,
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              backdropFilter: 'blur(8px)',
            }}>
              <Camera size={13} /> Cambiar
            </label>
            <input
              id="cover-input"
              type="file"
              accept="image/*"
              onChange={handleCoverChange}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Avatar section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 100, height: 100, borderRadius: '50%',
              background: avatarPreview ? 'transparent' : '#eff6ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, fontWeight: 800, color: PINK, overflow: 'hidden',
              border: '4px solid #fff', boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
            }}>
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : initials}
            </div>
            <label htmlFor="avatar-input" style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 32, height: 32, borderRadius: '50%',
              background: PINK, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', border: '3px solid #fff',
            }}>
              <Camera size={14} />
            </label>
            <input
              id="avatar-input"
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
            />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>
              {user.name}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              {user.email}
            </p>
          </div>
        </div>

        {/* Name field */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
            Nombre completo
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: '100%', padding: '12px 16px',
              borderRadius: 12, border: '1.5px solid #e5e7eb',
              fontSize: 14, color: '#1a1a1a', outline: 'none',
              fontFamily: FF, transition: 'all 0.2s',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = PINK}
            onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 24px', background: PINK, color: '#fff',
              borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 700,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontFamily: FF, transition: 'all 0.2s',
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            <Save size={16} />
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <button
            onClick={() => router.push('/cuenta')}
            style={{
              padding: '12px 20px', background: '#fff', color: '#6b7280',
              borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: FF, transition: 'all 0.2s',
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
