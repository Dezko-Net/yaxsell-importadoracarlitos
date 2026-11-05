'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Lock, ExternalLink, Loader, Zap, Eye, Palette, Pencil, LayoutDashboard, Package, ShoppingCart, CreditCard, Grid, List } from 'lucide-react';

interface Template {
  id: number;
  name: string;
  description: string;
  emoji: string;
  tags: string[];
  accent: string;
  accentDark: string;
  bg: string;
  navBg: string;
  locked?: boolean;
  badge?: string;
  sections?: string[];
}

interface SectionConfig {
  key: string;
  label: string;
  icon: React.ReactNode;
  previewPath: (tplId: number) => string;
}

const SECTIONS: SectionConfig[] = [
  {
    key: 'landing',
    label: 'Landing / Página Principal',
    icon: <LayoutDashboard size={16} />,
    previewPath: (tplId) => `/preview/plantilla/${tplId}`,
  },
  {
    key: 'collections',
    label: 'Colecciones (Categorías)',
    icon: <Grid size={16} />,
    previewPath: (tplId) => `/preview/plantilla/${tplId}/collections`,
  },
  {
    key: 'catalog',
    label: 'Catálogo (Todos los productos)',
    icon: <List size={16} />,
    previewPath: (tplId) => `/preview/plantilla/${tplId}/collections/all`,
  },
  {
    key: 'productDetail',
    label: 'Detalle de Producto',
    icon: <Package size={16} />,
    previewPath: (tplId) => `/preview/plantilla/${tplId}/producto/preview`,
  },
  {
    key: 'cart',
    label: 'Carrito de Compras',
    icon: <ShoppingCart size={16} />,
    previewPath: (tplId) => `/carrito?_tpl=${tplId}&section=cart`,
  },
  {
    key: 'checkout',
    label: 'Checkout / Pago',
    icon: <CreditCard size={16} />,
    previewPath: (tplId) => `/checkout?_tpl=${tplId}&section=checkout`,
  },
];

const TEMPLATES: Template[] = [
  { id: 25, name: 'Plantilla 25 (Concept Theme)', description: 'Diseño ultra moderno con navegación dock móvil, header interactivo, mega menú y carruseles fluidos.', emoji: '✨', tags: ['Concept', 'Shopify', 'Principal'], accent: '#0ea5e9', accentDark: '#0369a1', bg: '#f0f9ff', navBg: '#171717', badge: 'Principal', sections: ['landing'] },
  { id: 3, name: 'Retail', description: 'Estilo tienda por departamentos. Cabecera dinámica, carruseles, destacados y diseño responsive.', emoji: '🟠', tags: ['Retail', 'Shopify'], accent: '#f96302', accentDark: '#c94d00', bg: '#f5f5f5', navBg: '#f96302', sections: ['landing', 'collections', 'catalog', 'productDetail', 'cart', 'checkout'] },
];

function TemplatePreview({ t, isActive }: { t: Template; isActive: boolean }) {
  return (
    <div style={{ height: 120, background: t.bg, borderRadius: '10px 10px 0 0', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
      {/* Navbar */}
      <div style={{ height: 26, background: t.navBg, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}>
        <div style={{ width: 40, height: 6, borderRadius: 3, background: t.id === 2 ? '#333' : 'rgba(255,255,255,0.7)' }} />
        {t.id === 2 && <div style={{ flex: 1, height: 14, borderRadius: 3, background: '#fff', margin: '0 4px' }} />}
        <div style={{ marginLeft: t.id === 2 ? 0 : 'auto', display: 'flex', gap: 3 }}>
          <div style={{ width: 16, height: 5, borderRadius: 2, background: t.id === 2 ? '#999' : 'rgba(255,255,255,0.5)' }} />
          <div style={{ width: 16, height: 5, borderRadius: 2, background: t.id === 2 ? '#999' : 'rgba(255,255,255,0.5)' }} />
        </div>
      </div>

      {/* Hero */}
      <div style={{ height: 22, background: `linear-gradient(90deg, ${t.accent}22, ${t.accentDark}11)`, borderBottom: `2px solid ${t.accent}30`, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6 }}>
        <div style={{ width: 60, height: 5, borderRadius: 2, background: `${t.accent}80` }} />
        <div style={{ width: 30, height: 10, borderRadius: 3, background: t.accent, marginLeft: 3 }} />
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flex: 1, padding: 4, gap: 4 }}>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: t.id === 1 ? '1fr 1fr' : '1fr 1fr 1fr', gap: 3 }}>
          {[...Array(t.id === 1 ? 4 : 6)].map((_, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 4, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
              <div style={{ height: 16, background: `linear-gradient(135deg, ${t.accent}25, ${t.accentDark}15)` }} />
              <div style={{ padding: '2px 3px' }}>
                <div style={{ height: 3, borderRadius: 1, background: '#e5e7eb', width: '75%', marginBottom: 1 }} />
                <div style={{ height: 4, borderRadius: 1, background: t.accent, width: '50%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lock overlay */}
      {t.locked && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(249,250,251,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5, boxShadow: '0 2px 6px rgba(0,0,0,0.1)', fontSize: 10, color: '#6b7280', fontWeight: 600 }}>
            <Lock size={10} /> Próximamente
          </div>
        </div>
      )}

      {/* Active badge */}
      {isActive && (
        <div style={{ position: 'absolute', top: 6, right: 6, background: '#10b981', color: '#fff', fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 2, letterSpacing: '0.04em' }}>
          <Check size={8} /> EN USO
        </div>
      )}
    </div>
  );
}

export default function PlantillasPage() {
  const [sectionTemplates, setSectionTemplates] = useState<Record<string, number>>({ landing: 25, collections: 3, catalog: 3, productDetail: 3, cart: 3, checkout: 3 });
  const [saving, setSaving] = useState<string | null>(null); // section key being saved
  const [loading, setLoading] = useState(true);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [hovered, setHovered] = useState<`${number}-${string}` | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/template', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const global = Number(data.template) || 25;
          if (data.sections) {
            setSectionTemplates({
              landing: Number(data.sections.landing) || 25,
              collections: Number(data.sections.collections) || global,
              catalog: Number(data.sections.catalog) || global,
              productDetail: Number(data.sections.productDetail) || global,
              cart: Number(data.sections.cart) || global,
              checkout: Number(data.sections.checkout) || global,
            });
          } else {
            setSectionTemplates({ landing: 25, collections: global, catalog: global, productDetail: global, cart: global, checkout: global });
          }
        }
      } catch {
        setSectionTemplates({ landing: 25, collections: 3, catalog: 3, productDetail: 3, cart: 3, checkout: 3 });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function activateTemplate(section: string, templateId: number) {
    setSaving(section);
    try {
      const res = await fetch('/api/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: templateId, section }),
      });
      if (res.ok) {
        setSectionTemplates(prev => ({ ...prev, [section]: templateId }));
        setSavedSection(section);
        setTimeout(() => setSavedSection(null), 3000);
      } else {
        const err = await res.json();
        alert('Error al guardar: ' + (err.error || 'desconocido'));
      }
    } catch (e) {
      console.error(e);
      alert('Error al guardar la plantilla.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '4px 0 32px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Palette size={18} color="#fff" />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>Plantillas de Tienda</h1>
          </div>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Configura la plantilla para cada sección de tu tienda. Activa y previsualiza independientemente.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <a
            href="http://localhost:3003"
            target="_blank"
            rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', background: '#fff', border: '1px solid #e5e7eb', padding: '7px 14px', borderRadius: 8, fontWeight: 600, textDecoration: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
          >
            <Eye size={13} /> Ver tienda
          </a>
        </div>
      </div>

      {/* ── Sections ── */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <Loader size={24} style={{ color: '#667eea', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : (
        SECTIONS.map(section => {
          const activeTplId = sectionTemplates[section.key] || 1;
          const activeInfo = TEMPLATES.find(t => t.id === activeTplId);
          const isSaving = saving === section.key;
          const justSaved = savedSection === section.key;

          return (
            <div key={section.key} style={{ marginBottom: 32 }}>
              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '12px 16px', background: '#f9fafb', borderRadius: 12, border: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: activeInfo ? activeInfo.accent : '#667eea', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {section.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{section.label}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
                      Activa: <span style={{ fontWeight: 600, color: activeInfo?.accent || '#667eea' }}>{activeInfo ? `Plantilla ${activeInfo.id} — ${activeInfo.name}` : 'Sin asignar'}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {justSaved && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#059669', background: '#ecfdf5', border: '1px solid #6ee7b7', padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>
                      <Check size={11} /> ¡Guardado!
                    </span>
                  )}
                  <a
                    href={section.previewPath(activeTplId)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 7, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', cursor: 'pointer', textDecoration: 'none' }}
                  >
                    <Eye size={11} /> Preview
                  </a>
                </div>
              </div>

              {/* Template grid for this section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {TEMPLATES.filter(t => !t.sections || t.sections.includes(section.key)).map(t => {
                  const isActive = activeTplId === t.id;
                  const hoverKey = `${t.id}-${section.key}` as const;
                  const isHov = hovered === hoverKey && !t.locked && !isActive;
                  return (
                    <div
                      key={t.id}
                      onMouseEnter={() => setHovered(hoverKey)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        background: '#fff',
                        borderRadius: 12,
                        border: isActive ? `2px solid ${t.accent}` : isHov ? '2px solid #d1d5db' : '2px solid #f3f4f6',
                        boxShadow: isActive ? `0 3px 14px ${t.accent}20` : isHov ? '0 3px 10px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.03)',
                        overflow: 'hidden',
                        transition: 'all 0.15s ease',
                        opacity: t.locked ? 0.6 : 1,
                        cursor: t.locked ? 'default' : 'pointer',
                      }}
                    >
                      <TemplatePreview t={t} isActive={isActive} />

                      <div style={{ padding: '10px 12px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{t.emoji} #{t.id} - {t.name}</span>
                          {t.badge && (
                            <span style={{ fontSize: 8, fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 20, letterSpacing: '0.04em' }}>
                              {t.badge.toUpperCase()}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
                          {t.tags.map(tag => (
                            <span key={tag} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, background: '#f3f4f6', color: '#4b5563', fontWeight: 600 }}>
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {[t.accent, t.accentDark, t.navBg].map((c, i) => (
                              <div key={i} title={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c, border: '2px solid #f3f4f6', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }} />
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <a
                              href={section.previewPath(t.id)}
                              target="_blank"
                              rel="noreferrer"
                              title="Previsualizar"
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, background: '#f3f4f6', color: '#4b5563', transition: 'all 0.15s' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                              onMouseLeave={e => e.currentTarget.style.background = '#f3f4f6'}
                            >
                              <Eye size={14} />
                            </a>
                            {t.locked ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>
                                <Lock size={10} /> Bloqueada
                              </span>
                            ) : isActive ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#059669', fontWeight: 700 }}>
                                <Check size={12} /> En uso
                              </span>
                            ) : (
                              <button
                                onClick={() => activateTemplate(section.key, t.id)}
                                disabled={!!saving}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  fontSize: 11, fontWeight: 700,
                                  padding: '5px 12px', borderRadius: 7,
                                  background: isHov ? t.accent : '#111827',
                                  color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                                  opacity: saving ? 0.5 : 1,
                                  transition: 'background 0.15s',
                                }}
                              >
                                {isSaving ? <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={10} />}
                                Activar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* ── Info ── */}
      <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
        <div>
          <strong>¿Cómo funciona?</strong> Cada sección de la tienda puede tener su propia plantilla independiente.
          Al activar una plantilla para una sección, solo esa sección cambia. Los cambios son inmediatos — recarga{' '}
          <a href="http://localhost:3003" target="_blank" rel="noreferrer" style={{ color: '#b45309', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            localhost:3003 <ExternalLink size={11} />
          </a>.
        </div>
      </div>
    </div>
  );
}
