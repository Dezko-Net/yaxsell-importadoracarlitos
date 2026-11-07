'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Save, Monitor, Smartphone, Tablet, Eye, EyeOff, GripVertical,
  ChevronRight, ChevronDown, Plus, Trash2, Type, Link,
  Palette, Hash, Columns, Loader, CheckCircle, X,
  PanelTop, PanelBottom, LayoutGrid, Settings2, Undo2,
  PanelLeftClose, PanelLeftOpen, ExternalLink,
  Navigation, Megaphone, Radio, Image, Ticket, CreditCard, FolderOpen,
  Clock, Sofa, Target, ShoppingBag, Star, FileText, MessageSquare,
  Mail, Play, Tag, Timer, HelpCircle, MapPin,
  Newspaper, ArrowLeftRight, Video, History, RotateCcw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { gradientTemplates } from '@/lib/gradient-templates';
import { SectionConfig, SectionSettings, getSectionConfig, getSectionConfigAsync, invalidateSectionCache, saveSectionConfig, saveSectionConfigAsync, SECTION_DEFAULTS, FontConfig, FONT_OPTIONS, getFontConfig, saveFontConfig, buildGoogleFontsUrl, CollectionItem, MediaGalleryItem } from '@/lib/section-config';
import { cacheInvalidate } from '@/lib/cache';
import { getServices, getFirebaseConfig, BANNERS_COLLECTION, PRODUCTS_COLLECTION, CATEGORIES_COLLECTION, SUBCATEGORIES_COLLECTION, TIMED_OFFERS_COLLECTION, THEME_CONFIG_COLLECTION } from '@/lib/db';
import { Query } from '@/lib/db';
import { Banner, Product, Category, TimedOffer } from '@/types';

/* ═══════════════════════════════════════════════════════════════════
   SECTION ICON MAP  Lucide icons for each section type
   ═══════════════════════════════════════════════════════════════════ */
const SECTION_ICON_MAP: Record<string, LucideIcon> = {
  navbar: Navigation,
  announcement_bar: Megaphone,
  live_banner: Radio,
  hero_carousel: Image,
  coupon_banner: Ticket,
  feature_cards: CreditCard,
  categories: FolderOpen,
  offers_featured: Clock,
  collage: Palette,
  recommended: Target,
  products_grid: ShoppingBag,
  tpl1_product_widget: ShoppingBag,
  banner_image: Image,
  featured_collection: Star,
  image_text: FileText,
  collections_list: LayoutGrid,
  testimonials: MessageSquare,
  newsletter: Mail,
  video: Play,
  rich_text: FileText,
  logo_list: Tag,
  countdown: Timer,
  faq: HelpCircle,
  map: MapPin,
  tpl1_announcement_bar: Megaphone,
  tpl1_hero: Image,
  tpl1_coupon_banner: Ticket,
  tpl1_collection_list: FolderOpen,
  tpl1_marquee: Megaphone,
  tpl1_featured_collection: Star,
  tpl1_media_gallery: Columns,
  tpl1_featured_product: ShoppingBag,
  tpl1_countdown: Timer,
  tpl1_products_filter: LayoutGrid,
  tpl1_before_after: ArrowLeftRight,
  tpl1_faq: HelpCircle,
  tpl1_shop_the_look: Tag,
  tpl1_marquee_2: Megaphone,
  tpl1_image_overlay: Image,
  tpl1_video_text: Video,
  tpl1_testimonials: MessageSquare,
  tpl1_brand_logos: Tag,
  tpl1_blog: Newspaper,
  tpl1_service_icons: CreditCard,
  tpl1_subscribe_popup: Mail,
  tpl1_whatsapp_button: MessageSquare,
  tpl1_chatbot_button: MessageSquare,
  tpl1_map: MapPin,
  tpl1_footer: PanelBottom,
};

function SectionIcon({ sectionId, size = 15, color, className }: { sectionId: string; size?: number; color?: string; className?: string }) {
  const baseId = getSectionBaseId(sectionId);
  const Icon = SECTION_ICON_MAP[baseId] || LayoutGrid;
  return <Icon size={size} color={color} className={className} />;
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION CATALOG  new sections the user can add
   ═══════════════════════════════════════════════════════════════════ */
const SECTION_CATALOG = [
  { id: 'banner_image', label: 'Banner de Imagen', desc: 'Banner grande con imagen de fondo y texto' },
  { id: 'featured_collection', label: 'Colección Destacada', desc: 'Grid de productos de una colección' },
  { id: 'image_text', label: 'Imagen con Texto', desc: 'Imagen a un lado y texto al otro' },
  { id: 'collections_list', label: 'Lista de Colecciones', desc: 'Muestra varias colecciones en cuadrícula' },
  { id: 'testimonials', label: 'Testimonios', desc: 'Carrusel de opiniones de clientes' },
  { id: 'newsletter', label: 'Newsletter', desc: 'Formulario de captura de email' },
  { id: 'video', label: 'Video', desc: 'Embed de video de YouTube o Vimeo' },
  { id: 'rich_text', label: 'Texto Enriquecido', desc: 'Bloque de texto libre con formato' },
  { id: 'logo_list', label: 'Lista de Logos', desc: 'Marcas o partners en fila horizontal' },
  { id: 'countdown', label: 'Cuenta Regresiva', desc: 'Timer con llamada a la acción' },
  { id: 'faq', label: 'Preguntas Frecuentes', desc: 'Acordeón de preguntas y respuestas' },
  { id: 'map', label: 'Mapa', desc: 'Google Maps embed con ubicación' },
];

const CM_SECTION_CATALOG = [
  { id: 'cm_hero', label: 'Hero Banner', desc: 'Sección principal con fondo de imagen' },
  { id: 'cm_services', label: 'Servicios', desc: 'Tarjetas de servicios con imágenes' },
  { id: 'cm_about', label: 'Nosotros', desc: 'Sección historia con imagen y texto' },
  { id: 'cm_products', label: 'Productos', desc: 'Grid de productos destacados' },
  { id: 'cm_testimonials', label: 'Testimonios', desc: 'Tarjetas de testimonios de clientes' },
  { id: 'cm_contact', label: 'Contacto', desc: 'Formulario de contacto con información' },
  { id: 'cm_banner_image', label: 'Banner de Imagen', desc: 'Banner grande con imagen de fondo y texto' },
  { id: 'cm_video', label: 'Video', desc: 'Embed de video de YouTube o Vimeo' },
  { id: 'cm_newsletter', label: 'Newsletter', desc: 'Formulario de captura de email' },
  { id: 'cm_faq', label: 'Preguntas Frecuentes', desc: 'Acordeón de preguntas y respuestas' },
  { id: 'cm_map', label: 'Mapa', desc: 'Google Maps embed con ubicación' },
  { id: 'cm_rich_text', label: 'Texto Enriquecido', desc: 'Bloque de texto libre con formato' },
  { id: 'cm_countdown', label: 'Cuenta Regresiva', desc: 'Timer con llamada a la acción' },
  { id: 'cm_logo_list', label: 'Lista de Logos', desc: 'Marcas o partners en fila horizontal' },
  { id: 'cm_gallery', label: 'Galería', desc: 'Grid de imágenes con lightbox' },
  { id: 'cm_stats', label: 'Estadísticas', desc: 'Números y métricas destacadas' },
  { id: 'cm_cta', label: 'Call to Action', desc: 'Bloque de llamada a la acción con botón' },
];

/* ═══════════════════════════════════════════════════════════════════
   GROUPING
   ═══════════════════════════════════════════════════════════════════ */
interface EditorSection extends SectionConfig {
  group: 'header' | 'body' | 'footer';
}

const HEADER_IDS = ['announcement_bar', 'navbar', 'live_banner', 'hero_carousel'];
const FOOTER_IDS: string[] = [];
const CM_HEADER_IDS = ['cm_navbar'];
const CM_FOOTER_IDS = ['cm_footer'];
const TPL1_HEADER_IDS = ['tpl1_announcement_bar', 'tpl1_hero', 'tpl1_product_widget'];
const TPL1_FOOTER_IDS = ['tpl1_map', 'tpl1_subscribe_popup', 'tpl1_whatsapp_button', 'tpl1_chatbot_button', 'tpl1_footer'];

function assignGroup(s: SectionConfig, isCustom = false, isTemplate1 = false): EditorSection {
  if (isTemplate1) {
    if (TPL1_HEADER_IDS.includes(s.id)) return { ...s, group: 'header' };
    if (TPL1_FOOTER_IDS.includes(s.id)) return { ...s, group: 'footer' };
    if (s.id.startsWith('tpl1_')) return { ...s, group: 'body' };
    return { ...s, group: 'body', enabled: false };
  }
  if (isCustom) {
    if (CM_HEADER_IDS.includes(s.id)) return { ...s, group: 'header' };
    if (CM_FOOTER_IDS.includes(s.id)) return { ...s, group: 'footer' };
    if (s.id.startsWith('cm_')) return { ...s, group: 'body' };
    return { ...s, group: 'body', enabled: false };
  }
  if (HEADER_IDS.includes(s.id)) return { ...s, group: 'header' };
  if (FOOTER_IDS.includes(s.id)) return { ...s, group: 'footer' };
  return { ...s, group: 'body' };
}

/* ═══════════════════════════════════════════════════════════════════
   DEVICE SIZES
   ═══════════════════════════════════════════════════════════════════ */
const DEVICES = {
  desktop: { icon: Monitor, width: '100%', label: 'Escritorio' },
  tablet:  { icon: Tablet,  width: '768px', label: 'Tablet' },
  mobile:  { icon: Smartphone, width: '375px', label: 'Móvil' },
} as const;
type DeviceKey = keyof typeof DEVICES;

/* ═══════════════════════════════════════════════════════════════════
   MAIN EDITOR
   ═══════════════════════════════════════════════════════════════════ */
function ThemeEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('t') || '2';
  const isCustomTemplate = templateId === '4';
  const isTemplate1 = templateId === '1';

  const [sections, setSections] = useState<EditorSection[]>([]);
  const [mounted, setMounted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceKey>('desktop');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState<'header' | 'body' | 'footer' | null>(null);
  const [expandedGroups, setExpandedGroups] = useState({ header: true, body: true, footer: true });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fontConfig, setFontConfig] = useState<FontConfig>({ globalFont: 'Inter', globalHeadingFont: '' });
  const [generalOpen, setGeneralOpen] = useState(true);
  const [showFontPanel, setShowFontPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showTemplatesPanel, setShowTemplatesPanel] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; timestamp: number; sections: SectionConfig[]; label?: string }>>([]);
  const [templates, setTemplates] = useState<Array<{ $id: string; NAME: string; SECTIONS: string; UPDATED: string }>>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>(() => { try { return localStorage.getItem('te-active-template') || 'original'; } catch { return 'original'; } });
  const [newTemplateName, setNewTemplateName] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load sections + fonts (from Appwrite with localStorage fallback)
  useEffect(() => {
    // Invalidate cache to ensure fresh data with new tpl1_ sections
    invalidateSectionCache();
    getSectionConfigAsync().then(config => {
      let mapped = config.map(s => assignGroup(s, isCustomTemplate, isTemplate1));
      let filtered = isTemplate1
        ? mapped.filter(s => s.id.startsWith('tpl1_'))
        : isCustomTemplate
          ? mapped.filter(s => s.id.startsWith('cm_'))
          : mapped.filter(s => !s.id.startsWith('cm_') && !s.id.startsWith('tpl1_'));
      // No forced reset  respect whatever config is saved (even if empty)
      // Merge missing tpl1_ sections (e.g. newly added whatsapp/chatbot)
      if (isTemplate1) {
        const allTpl1Defaults = SECTION_DEFAULTS.filter(s => s.id.startsWith('tpl1_')).map(s => assignGroup(s, false, true));
        const existingIds = new Set(filtered.map(s => s.id));
        const missing = allTpl1Defaults.filter(s => !existingIds.has(s.id));
        if (missing.length > 0) {
          filtered = [...filtered, ...missing];
          saveSectionConfig([...config.filter(s => !s.id.startsWith('tpl1_')), ...filtered]);
        }
      }
      // Enforce fixed header order for template 1
      if (isTemplate1) {
        const headerSections = filtered.filter(s => s.group === 'header');
        const bodySections = filtered.filter(s => s.group === 'body');
        const footerSections = filtered.filter(s => s.group === 'footer');
        // Sort header sections by FIXED_HEADER_ORDER
        const sortedHeader = [...headerSections].sort((a, b) => {
          const idxA = FIXED_HEADER_ORDER.indexOf(a.id);
          const idxB = FIXED_HEADER_ORDER.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
        // Sort footer sections by FIXED_FOOTER_ORDER
        const sortedFooter = [...footerSections].sort((a, b) => {
          const idxA = FIXED_FOOTER_ORDER.indexOf(a.id);
          const idxB = FIXED_FOOTER_ORDER.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
        filtered = [...sortedHeader, ...bodySections, ...sortedFooter];
      }
      setSections(filtered);
      setMounted(true);
    }).catch(() => {
      let mapped = getSectionConfig().map(s => assignGroup(s, isCustomTemplate, isTemplate1));
      let filtered = isTemplate1
        ? mapped.filter(s => s.id.startsWith('tpl1_'))
        : isCustomTemplate
          ? mapped.filter(s => s.id.startsWith('cm_'))
          : mapped.filter(s => !s.id.startsWith('cm_') && !s.id.startsWith('tpl1_'));
      // No forced reset  respect whatever config is saved (even if empty)
      // Merge missing tpl1_ sections in catch path too
      if (isTemplate1) {
        const allTpl1Defaults = SECTION_DEFAULTS.filter(s => s.id.startsWith('tpl1_')).map(s => assignGroup(s, false, true));
        const existingIds = new Set(filtered.map(s => s.id));
        const missing = allTpl1Defaults.filter(s => !existingIds.has(s.id));
        if (missing.length > 0) {
          filtered = [...filtered, ...missing];
        }
      }
      setSections(filtered);
      setMounted(true);
    });
    setFontConfig(getFontConfig());
  }, [isCustomTemplate, isTemplate1]);

  const headerSections = sections.filter(s => s.group === 'header');
  const bodySections = sections.filter(s => s.group === 'body');
  const footerSections = sections.filter(s => s.group === 'footer');
  const selectedSection = sections.find(s => s.id === selectedId) || null;

  // ── Send postMessage to iframe ──
  const postToPreview = useCallback((msg: Record<string, unknown>) => {
    console.log('[Theme Editor] postMessage to iframe:', msg);
    iframeRef.current?.contentWindow?.postMessage(msg, '*');
  }, []);

  // ── Listen for section selection and reorder from iframe ──
  useEffect(() => {
    function handleIframeMsg(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'object') return;
      const { type, sectionId, fromSectionId, toSectionId, position } = e.data;
      if (type === 'te:select' && sectionId) {
        setSelectedId(sectionId);
        postToPreview({ type: 'te:highlight', sectionId });
      }
      if (type === 'te:hover' && sectionId) {
        setHoveredId(sectionId);
      }
      if (type === 'te:hoverOut') {
        setHoveredId(null);
      }
      // Reordenar secciones desde el iframe
      if (type === 'te:reorder' && fromSectionId && toSectionId) {
        setSections(prev => {
          const fromSec = prev.find(s => s.id === fromSectionId);
          const toSec = prev.find(s => s.id === toSectionId);
          if (!fromSec || !toSec || fromSec.group !== toSec.group) return prev; // solo dentro del mismo grupo
          
          const group = fromSec.group;
          const groupIds = prev.filter(s => s.group === group).map(s => s.id);
          const fromLocalIdx = groupIds.indexOf(fromSectionId);
          const toLocalIdx = groupIds.indexOf(toSectionId);
          if (fromLocalIdx === -1 || toLocalIdx === -1) return prev;
          
          // Reorder within group
          const [movedId] = groupIds.splice(fromLocalIdx, 1);
          let insertIdx = toLocalIdx;
          if (fromLocalIdx < toLocalIdx) insertIdx = position === 'before' ? toLocalIdx - 1 : toLocalIdx;
          else insertIdx = position === 'before' ? toLocalIdx : toLocalIdx + 1;
          groupIds.splice(insertIdx, 0, movedId);
          
          // Rebuild full section list preserving other groups
          const headerIds = group === 'header' ? groupIds : prev.filter(s => s.group === 'header').map(s => s.id);
          const bodyIds = group === 'body' ? groupIds : prev.filter(s => s.group === 'body').map(s => s.id);
          const footerIds = group === 'footer' ? groupIds : prev.filter(s => s.group === 'footer').map(s => s.id);
          const idOrder = [...headerIds, ...bodyIds, ...footerIds];
          const reordered = idOrder.map((id, i) => {
            const s = prev.find(x => x.id === id)!;
            return { ...s, order: i };
          });
          
          persistAndSync(reordered);
          return reordered;
        });
      }
    }
    window.addEventListener('message', handleIframeMsg);
    return () => window.removeEventListener('message', handleIframeMsg);
  }, [postToPreview]);

  // ── Auto-save + notify iframe on every change ──
  const persistAndSync = useCallback((newSections: EditorSection[]) => {
    const reordered = newSections.map((s, i) => ({ ...s, order: i }));
    // Merge with sections from the other template to avoid data loss
    // We fetch current from localStorage to ensure we have the most up-to-date state
    const allCurrent = getSectionConfig(); 
    
    let otherSections: SectionConfig[];
    if (isTemplate1) {
      otherSections = allCurrent.filter(s => !s.id.startsWith('tpl1_'));
    } else if (isCustomTemplate) {
      otherSections = allCurrent.filter(s => !s.id.startsWith('cm_'));
    } else {
      otherSections = allCurrent.filter(s => s.id.startsWith('cm_') || s.id.startsWith('tpl1_'));
    }
    
    // IMPORTANT: newSections already have the latest settings from the editor UI
    // We only need to merge them with otherSections (the ones not being edited right now)
    const newConfig = [...otherSections, ...reordered];
    
    saveSectionConfig(newConfig);
    // Invalidar todos los caches de localStorage para que la página en vivo refresque
    cacheInvalidate('banners:');
    cacheInvalidate('products:');
    cacheInvalidate('categories:');
    cacheInvalidate('offers:');
    setHasChanges(true);
    // Tell iframe to update its local state instantly
    postToPreview({ type: 'te:reloadConfig', sections: newConfig });
  }, [postToPreview, isTemplate1, isCustomTemplate]);

  // ── History (backups) management ──
  const HISTORY_KEY = 'theme-editor-history';
  const MAX_HISTORY = 30;

  // Load history on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  const saveHistorySnapshot = useCallback((snapshotSections: EditorSection[]) => {
    const newSnapshot = {
      id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      sections: snapshotSections.map(s => ({ ...s })) as SectionConfig[],
    };
    setHistory(prev => {
      const next = [newSnapshot, ...prev].slice(0, MAX_HISTORY);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const restoreHistorySnapshot = useCallback((id: string) => {
    const snap = history.find(h => h.id === id);
    if (!snap) return;
    if (!confirm('¿Restaurar este backup? Se reemplazarán las secciones actuales.')) return;
    const restored = snap.sections.map(s => assignGroup(s, isCustomTemplate, isTemplate1));
    setSections(restored as EditorSection[]);
    persistAndSync(restored as EditorSection[]);
  }, [history, isCustomTemplate, isTemplate1, persistAndSync]);

  const deleteHistorySnapshot = useCallback((id: string) => {
    setHistory(prev => {
      const next = prev.filter(h => h.id !== id);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clearAllHistory = useCallback(() => {
    if (!confirm('¿Eliminar todo el historial de backups?')) return;
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  }, []);

  // ── Templates: load from Appwrite ──
  const loadTemplates = useCallback(async () => {
    try {
      const { databases } = getServices();
      const dbId = getFirebaseConfig().databaseId;
      const res = await databases.listDocuments(dbId, THEME_CONFIG_COLLECTION, [Query.orderDesc('$updatedAt')]);
      setTemplates(res.documents.map((d: Record<string, unknown>) => ({
        $id: d.$id as string,
        NAME: d.NAME as string,
        SECTIONS: d.SECTIONS as string,
        UPDATED: d.$updatedAt as string,
      })));
    } catch { /* collection may not exist yet */ }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // ── Templates: save current sections to a template doc ──
  const saveTemplateToAppwrite = useCallback(async (docId: string, secs: EditorSection[]) => {
    try {
      const { databases } = getServices();
      const dbId = getFirebaseConfig().databaseId;
      const data = { SECTIONS: JSON.stringify(secs.map(s => ({ id: s.id, label: s.label, description: s.description, icon: s.icon, enabled: s.enabled, order: s.order, locked: s.locked, settings: s.settings, group: s.group }))) };
      await databases.updateDocument(dbId, THEME_CONFIG_COLLECTION, docId, data);
    } catch (e) { console.error('[Templates] save error:', e); }
  }, []);

  // ── Templates: create new ──
  const createTemplate = useCallback(async () => {
    const name = newTemplateName.trim();
    if (!name) return;
    setTemplateLoading(true);
    try {
      const { databases } = getServices();
      const dbId = getFirebaseConfig().databaseId;
      const data = {
        NAME: name,
        SECTIONS: JSON.stringify(sections.map(s => ({ id: s.id, label: s.label, description: s.description, icon: s.icon, enabled: s.enabled, order: s.order, locked: s.locked, settings: s.settings, group: s.group }))),
      };
      const doc = await databases.createDocument(dbId, THEME_CONFIG_COLLECTION, 'unique()', data);
      setTemplates(prev => [{ $id: doc.$id, NAME: name, SECTIONS: data.SECTIONS, UPDATED: new Date().toISOString() }, ...prev]);
      setActiveTemplateId(doc.$id);
      try { localStorage.setItem('te-active-template', doc.$id); } catch {}
      setNewTemplateName('');
      await loadTemplates();
    } catch (e) { console.error('[Templates] create error:', e); }
    setTemplateLoading(false);
  }, [newTemplateName, sections, loadTemplates]);

  // ── Templates: load (switch to) ── always fetch fresh from Appwrite
  const loadTemplate = useCallback(async (templateId: string) => {
    if (templateId === 'original') {
      // Restore defaults
      if (!confirm('¿Restaurar valores predeterminados? Se perderán los cambios actuales.')) return;
      const defaults = isTemplate1
        ? SECTION_DEFAULTS.filter(s => s.id.startsWith('tpl1_')).map(s => assignGroup(s, false, true))
        : isCustomTemplate
          ? SECTION_DEFAULTS.filter(s => s.id.startsWith('cm_')).map(s => assignGroup(s, true, false))
          : SECTION_DEFAULTS.filter(s => !s.id.startsWith('cm_') && !s.id.startsWith('tpl1_')).map(s => assignGroup(s, false, false));
      setSections(defaults as EditorSection[]);
      persistAndSync(defaults as EditorSection[]);
      setActiveTemplateId('original');
      try { localStorage.setItem('te-active-template', 'original'); } catch {}
      return;
    }
    // Fetch fresh from Appwrite (not stale in-memory)
    try {
      const { databases } = getServices();
      const dbId = getFirebaseConfig().databaseId;
      const doc = await databases.getDocument(dbId, THEME_CONFIG_COLLECTION, templateId);
      const raw = doc.SECTIONS as string;
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const restored = parsed.map((s: SectionConfig) => assignGroup(s, isCustomTemplate, isTemplate1));
      setSections(restored as EditorSection[]);
      persistAndSync(restored as EditorSection[]);
      setActiveTemplateId(templateId);
      try { localStorage.setItem('te-active-template', templateId); } catch {}
    } catch (e) { console.error('[Templates] load error:', e); }
  }, [isTemplate1, isCustomTemplate, persistAndSync]);

  // ── Templates: delete ──
  const deleteTemplate = useCallback(async (templateId: string) => {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    try {
      const { databases } = getServices();
      const dbId = getFirebaseConfig().databaseId;
      await databases.deleteDocument(dbId, THEME_CONFIG_COLLECTION, templateId);
      setTemplates(prev => prev.filter(t => t.$id !== templateId));
      if (activeTemplateId === templateId) { setActiveTemplateId('original'); try { localStorage.setItem('te-active-template', 'original'); } catch {} }
    } catch (e) { console.error('[Templates] delete error:', e); }
  }, [activeTemplateId]);

  // ── Save (explicit) ──
  const handleSave = useCallback(() => {
    setSaving(true);
    persistAndSync(sections);
    saveHistorySnapshot(sections);
    // Also save to active template in Appwrite if not 'original'
    if (activeTemplateId !== 'original') {
      saveTemplateToAppwrite(activeTemplateId, sections).then(() => loadTemplates());
    }
    setSaving(false);
    setSaved(true);
    setHasChanges(false);
    setTimeout(() => setSaved(false), 2500);
  }, [sections, persistAndSync, saveHistorySnapshot, activeTemplateId, saveTemplateToAppwrite, loadTemplates]);

  // ── Toggle section enabled ──
  function toggleEnabled(id: string) {
    setSections(prev => {
      const next = prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
      persistAndSync(next);
      return next;
    });
  }

  // ── Update settings ──
  function updateSettings(id: string, patch: Partial<SectionSettings>) {
    setSections(prev => {
      const next = prev.map(s => s.id === id ? { ...s, settings: { ...s.settings, ...patch } } : s);
      persistAndSync(next);
      return next;
    });
  }

  // ── Remove section ──
  function removeSection(id: string) {
    if (!confirm('¿Eliminar esta sección?')) return;
    setSections(prev => {
      const next = prev.filter(s => s.id !== id);
      persistAndSync(next);
      return next;
    });
    if (selectedId === id) setSelectedId(null);
  }

  // ── Add section from catalog ──
  function addSection(catalogId: string, group: 'header' | 'body' | 'footer') {
    const catalog = isTemplate1 ? [] : isCustomTemplate ? CM_SECTION_CATALOG : SECTION_CATALOG;
    const cat = catalog.find(c => c.id === catalogId);
    if (!cat) return;
    const isCm = catalogId.startsWith('cm_');
    const newSection: EditorSection = {
      id: isCm ? catalogId : `${cat.id}_${Date.now()}`,
      label: cat.label,
      description: cat.desc,
      icon: '',
      enabled: true,
      order: sections.length,
      settings: {},
      group,
    };
    setSections(prev => {
      let next: EditorSection[];
      if (group === 'header') {
        const lastH = prev.filter(s => s.group === 'header').length;
        next = [...prev]; next.splice(lastH, 0, newSection);
      } else if (group === 'footer') {
        next = [...prev, newSection];
      } else {
        const footerStart = prev.findIndex(s => s.group === 'footer');
        if (footerStart === -1) next = [...prev, newSection];
        else { next = [...prev]; next.splice(footerStart, 0, newSection); }
      }
      persistAndSync(next);
      return next;
    });
    setAddModalOpen(null);
    setSelectedId(newSection.id);
  }

  // ── Update font config ──
  function updateFontConfig(patch: Partial<FontConfig>) {
    const next = { ...fontConfig, ...patch };
    setFontConfig(next);
    saveFontConfig(next);
    setHasChanges(true);
    postToPreview({ type: 'te:reloadConfig' });
  }

  // ── Reset to defaults ──
  function handleReset() {
    if (!confirm('¿Restaurar todas las secciones a los valores predeterminados?')) return;
    const mapped = SECTION_DEFAULTS.map(s => assignGroup(s, isCustomTemplate, isTemplate1));
    const defaults = isTemplate1
      ? mapped.filter(s => s.id.startsWith('tpl1_'))
      : isCustomTemplate
        ? mapped.filter(s => s.id.startsWith('cm_'))
        : mapped.filter(s => !s.id.startsWith('cm_') && !s.id.startsWith('tpl1_'));
    setSections(defaults);
    persistAndSync(defaults);
    setSelectedId(null);
  }

  // ── Drag & drop (per-group) ──
  const [dragGroup, setDragGroup] = useState<'header'|'body'|'footer'|null>(null);
  const [dragLocalIdx, setDragLocalIdx] = useState<number|null>(null);
  const [dragOverLocalIdx, setDragOverLocalIdx] = useState<number|null>(null);

  // Header sections con orden fijo inmutable
  const FIXED_HEADER_ORDER = ['tpl1_announcement_bar', 'tpl1_hero', 'tpl1_product_widget'];
  // Footer sections con orden fijo inmutable
  const FIXED_FOOTER_ORDER = ['tpl1_map', 'tpl1_subscribe_popup', 'tpl1_whatsapp_button', 'tpl1_chatbot_button', 'tpl1_footer'];

  function handleGroupDragStart(group: 'header'|'body'|'footer', localIdx: number, sectionId: string) {
    // Bloquear drag para secciones con orden fijo en header o footer
    if (group === 'header' && FIXED_HEADER_ORDER.includes(sectionId)) return;
    if (group === 'footer' && FIXED_FOOTER_ORDER.includes(sectionId)) return;
    setDragGroup(group); setDragLocalIdx(localIdx);
  }
  function handleGroupDragOver(group: 'header'|'body'|'footer', e: React.DragEvent, localIdx: number) {
    if (dragGroup !== group) { e.preventDefault(); return; } // solo dentro del mismo grupo
    e.preventDefault(); setDragOverLocalIdx(localIdx);
  }
  function handleGroupDrop(group: 'header'|'body'|'footer', localIdx: number) {
    if (dragGroup === group && dragLocalIdx !== null && dragLocalIdx !== localIdx) {
      setSections(prev => {
        const groupIds = prev.filter(s => s.group === group).map(s => s.id);
        const otherSections = prev.filter(s => s.group !== group);
        // Reorder within group
        const [movedId] = groupIds.splice(dragLocalIdx, 1);
        groupIds.splice(localIdx, 0, movedId);
        // Rebuild sections: header group, then body, then footer
        const headerIds = group === 'header' ? groupIds : prev.filter(s => s.group === 'header').map(s => s.id);
        const bodyIds = group === 'body' ? groupIds : prev.filter(s => s.group === 'body').map(s => s.id);
        const footerIds = group === 'footer' ? groupIds : prev.filter(s => s.group === 'footer').map(s => s.id);
        const idOrder = [...headerIds, ...bodyIds, ...footerIds];
        const next = idOrder.map((id, i) => {
          const s = prev.find(x => x.id === id)!;
          return { ...s, order: i };
        });
        persistAndSync(next);
        return next;
      });
    }
    setDragGroup(null); setDragLocalIdx(null); setDragOverLocalIdx(null);
  }
  function handleGroupDragEnd() { setDragGroup(null); setDragLocalIdx(null); setDragOverLocalIdx(null); }

  const toggleGroup = (g: 'header' | 'body' | 'footer') => {
    setExpandedGroups(prev => ({ ...prev, [g]: !prev[g] }));
  };

  // ── Highlight section in iframe on hover ──
  useEffect(() => {
    if (hoveredId) {
      postToPreview({ type: 'te:highlight', sectionId: hoveredId });
    } else {
      postToPreview({ type: 'te:unhighlight' });
    }
  }, [hoveredId, postToPreview]);

  // ── Scroll to section in iframe on select ──
  useEffect(() => {
    if (selectedId) {
      postToPreview({ type: 'te:scrollTo', sectionId: selectedId });
      postToPreview({ type: 'te:highlight', sectionId: selectedId });
    }
  }, [selectedId, postToPreview]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'row', background: '#f3f4f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <style>{`
        @keyframes te-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes te-slideIn { from { opacity:0; transform: translateY(-4px) scale(0.97); } to { opacity:1; transform: translateY(0) scale(1); } }
        @keyframes te-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0.3)} 50%{box-shadow:0 0 0 6px rgba(99,102,241,0)} }
        @keyframes te-insertLine { 0%{opacity:0;transform:scaleX(0.3)} 100%{opacity:1;transform:scaleX(1)} }
        @keyframes te-fadeExpand { from { opacity:0; max-height:0; } to { opacity:1; max-height:800px; } }

        .te-item {
          transition: transform 0.25s cubic-bezier(0.2,1,0.3,1), background 0.15s, border-color 0.15s, box-shadow 0.2s, opacity 0.2s;
          will-change: transform;
        }
        .te-item:hover { background: #f8fafc !important; }
        .te-item-dragging {
          z-index: 100 !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08) !important;
          transform: scale(1.02) rotate(0.5deg) !important;
          border-color: #818cf8 !important;
          background: #fff !important;
          opacity: 0.95;
        }
        .te-insert-indicator {
          position: absolute; left: 8px; right: 8px; height: 3px;
          background: linear-gradient(90deg, #6366f1, #818cf8);
          border-radius: 3px; z-index: 50; pointer-events: none;
          animation: te-insertLine 0.2s cubic-bezier(0.2,1,0.3,1) both;
        }
        .te-insert-indicator::before, .te-insert-indicator::after {
          content: ''; position: absolute; top: -3px; width: 9px; height: 9px;
          border-radius: 50%; background: #6366f1;
        }
        .te-insert-indicator::before { left: -4px; }
        .te-insert-indicator::after { right: -4px; }
        .te-grp-header { transition: background 0.15s; }
        .te-grp-header:hover { background: #f8fafc; }
        .te-grp-items {
          overflow: hidden;
          animation: te-fadeExpand 0.3s cubic-bezier(0.2,1,0.3,1) both;
        }
        .te-add-btn { transition: all 0.15s; }
        .te-add-btn:hover { background: #eff6ff !important; color: #2563eb !important; }
        .te-cat:hover { border-color: #a5b4fc !important; background: #f5f3ff !important; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(99,102,241,0.12); }
        .te-cat { transition: all 0.15s; }
        .te-preview-btn { transition: all 0.15s; }
        .te-preview-btn:hover { background: #f3f4f6 !important; }
        .te-grip { opacity: 0; transition: opacity 0.15s; cursor: grab; }
        .te-item:hover .te-grip { opacity: 1; }
        .te-item-dragging .te-grip { opacity: 1; cursor: grabbing; }
        .te-vis-btn { opacity: 0; transition: all 0.15s; }
        .te-item:hover .te-vis-btn { opacity: 1; }
        .te-item.disabled .te-vis-btn { opacity: 1 !important; }
        .te-del-btn { opacity: 0; transition: all 0.15s; }
        .te-item:hover .te-del-btn { opacity: 1; }
        .te-item.disabled .te-del-btn { opacity: 1 !important; }
        .te-sidebar {
          transition: width 0.3s cubic-bezier(0.2,1,0.3,1), min-width 0.3s cubic-bezier(0.2,1,0.3,1);
        }
        .te-sidebar-scroll::-webkit-scrollbar { width: 5px; }
        .te-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .te-sidebar-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 3px; }
        .te-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
        .te-collapse-btn { transition: all 0.2s; }
        .te-collapse-btn:hover { background: #f3f4f6 !important; color: #4338ca !important; }
      `}</style>

      {/* ── LEFT SIDEBAR (full height, Jumpseller-style) ── */}
        <aside className="te-sidebar" style={{
          width: sidebarCollapsed ? 0 : 280,
          minWidth: sidebarCollapsed ? 0 : 280,
          background: '#fff', borderRight: sidebarCollapsed ? 'none' : '1px solid #e5e7eb',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          overflow: 'hidden',
        }}>
          {/* Sidebar header  brand + back */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => router.push('/admin/engagement/plantillas')}
                className="te-preview-btn"
                style={{ width: 30, height: 30, borderRadius: 8, background: '#f3f4f6', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ArrowLeft size={14} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Editor Visual</div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>Plantilla {templateId}{isCustomTemplate ? '  Chinamart' : ''}</div>
              </div>
              <span style={{ fontSize: 8, padding: '2px 7px', borderRadius: 10, background: '#ecfdf5', color: '#059669', fontWeight: 700, letterSpacing: '0.03em', flexShrink: 0 }}>ACTIVA</span>
            </div>
          </div>

          {/* Configuración del tema link */}
          <button onClick={handleReset} className="te-preview-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', border: 'none', borderBottom: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
            <Settings2 size={14} color="#6b7280" />
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#374151' }}>Restaurar valores</span>
            <ChevronRight size={13} color="#d1d5db" />
          </button>

          {/* Section page title */}
          <div style={{ padding: '10px 14px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>Página de inicio</div>
            <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 500 }}>
              {mounted ? `${sections.filter(s => s.enabled).length}/${sections.length}` : ''}
            </span>
          </div>

          <div className="te-sidebar-scroll" style={{ flex: 1, overflowY: 'auto', padding: '2px 0 8px' }}>
            {/* GENERAL */}
            <div style={{ marginBottom: 4, padding: '0 8px' }}>
              <button onClick={() => setGeneralOpen(!generalOpen)} className="te-grp-header"
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: generalOpen ? '#fef3c7' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: generalOpen ? '#d97706' : '#9ca3af', transition: 'all 0.2s' }}>
                  <Settings2 size={12} />
                </div>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#374151', textAlign: 'left', letterSpacing: '-0.01em' }}>General</span>
                <div style={{ color: '#9ca3af', transition: 'transform 0.2s', transform: generalOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                  <ChevronDown size={13} />
                </div>
              </button>
              {generalOpen && (
                <div style={{ paddingLeft: 4, marginLeft: 11, borderLeft: '1.5px solid #e5e7eb' }}>
                  <div className="te-item"
                    onClick={() => { setShowFontPanel(true); setSelectedId(null); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: showFontPanel ? '#eef2ff' : 'transparent', border: showFontPanel ? '1.5px solid #c7d2fe' : '1.5px solid transparent', marginBottom: 2, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: -5, top: '50%', width: 8, height: 1.5, background: showFontPanel ? '#c7d2fe' : '#e5e7eb' }} />
                    <span style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: showFontPanel ? '#e0e7ff' : '#f3f4f6', color: showFontPanel ? '#4338ca' : '#6b7280', flexShrink: 0 }}><Type size={13} /></span>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: showFontPanel ? 600 : 500, color: showFontPanel ? '#4338ca' : '#374151' }}>Fuentes</span>
                  </div>
                  <div className="te-item"
                    onClick={() => { setSelectedId('_catalog_cover'); setShowFontPanel(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: selectedId === '_catalog_cover' ? '#eef2ff' : 'transparent', border: selectedId === '_catalog_cover' ? '1.5px solid #c7d2fe' : '1.5px solid transparent', marginBottom: 2, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: -5, top: '50%', width: 8, height: 1.5, background: selectedId === '_catalog_cover' ? '#c7d2fe' : '#e5e7eb' }} />
                    <span style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: selectedId === '_catalog_cover' ? '#e0e7ff' : '#f3f4f6', color: selectedId === '_catalog_cover' ? '#4338ca' : '#6b7280', flexShrink: 0 }}><Image size={13} /></span>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: selectedId === '_catalog_cover' ? 600 : 500, color: selectedId === '_catalog_cover' ? '#4338ca' : '#374151' }}>Portada Catálogo</span>
                  </div>
                </div>
              )}
            </div>
            {/* HEADER */}
            <GroupBlock label="Encabezado" icon={<PanelTop size={12} />}
              group="header"
              open={expandedGroups.header} onToggle={() => toggleGroup('header')}
              items={headerSections} allSections={sections}
              selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setShowFontPanel(false); }}
              hoveredId={hoveredId} onHover={setHoveredId}
              onRemove={removeSection} onToggleVisibility={toggleEnabled}
              dragLocalIdx={dragLocalIdx} dragOverLocalIdx={dragOverLocalIdx} dragGroup={dragGroup}
              onGroupDragStart={handleGroupDragStart} onGroupDragOver={handleGroupDragOver}
              onGroupDrop={handleGroupDrop} onGroupDragEnd={handleGroupDragEnd}
              onAdd={() => setAddModalOpen('header')}
              fixedHeaderOrder={isTemplate1 ? FIXED_HEADER_ORDER : undefined}
            />
            {/* TEMPLATE / BODY */}
            <GroupBlock label="Template" icon={<LayoutGrid size={12} />}
              group="body"
              open={expandedGroups.body} onToggle={() => toggleGroup('body')}
              items={bodySections} allSections={sections}
              selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setShowFontPanel(false); }}
              hoveredId={hoveredId} onHover={setHoveredId}
              onRemove={removeSection} onToggleVisibility={toggleEnabled}
              dragLocalIdx={dragLocalIdx} dragOverLocalIdx={dragOverLocalIdx} dragGroup={dragGroup}
              onGroupDragStart={handleGroupDragStart} onGroupDragOver={handleGroupDragOver}
              onGroupDrop={handleGroupDrop} onGroupDragEnd={handleGroupDragEnd}
              onAdd={() => setAddModalOpen('body')}
              fixedHeaderOrder={undefined}
            />
            {/* FOOTER */}
            <GroupBlock label="Pie de página" icon={<PanelBottom size={12} />}
              group="footer"
              open={expandedGroups.footer} onToggle={() => toggleGroup('footer')}
              items={footerSections} allSections={sections}
              selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setShowFontPanel(false); }}
              hoveredId={hoveredId} onHover={setHoveredId}
              onRemove={removeSection} onToggleVisibility={toggleEnabled}
              dragLocalIdx={dragLocalIdx} dragOverLocalIdx={dragOverLocalIdx} dragGroup={dragGroup}
              onGroupDragStart={handleGroupDragStart} onGroupDragOver={handleGroupDragOver}
              onGroupDrop={handleGroupDrop} onGroupDragEnd={handleGroupDragEnd}
              onAdd={() => setAddModalOpen('footer')}
              fixedHeaderOrder={undefined}
              fixedFooterOrder={isTemplate1 ? FIXED_FOOTER_ORDER : undefined}
            />
          </div>
        </aside>

        {/* ── SETTINGS PANEL (when section selected) ── */}
        {selectedSection && !showFontPanel && (
          <div style={{ width: 320, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'auto', animation: 'te-slideIn 0.2s cubic-bezier(0.2,1,0.3,1) both' }}>
            <SettingsPanel
              section={selectedSection}
              onClose={() => { setSelectedId(null); postToPreview({ type: 'te:unhighlight' }); }}
              onUpdate={(patch) => updateSettings(selectedSection.id, patch)}
              onToggle={() => toggleEnabled(selectedSection.id)}
              onIframeReload={() => { const w = iframeRef.current?.contentWindow; if (w) w.location.reload(); }}
            />
          </div>
        )}
        {/* ── FONT PANEL ── */}
        {showFontPanel && (
          <div style={{ width: 320, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'auto', animation: 'te-slideIn 0.2s cubic-bezier(0.2,1,0.3,1) both' }}>
            <FontPanel fontConfig={fontConfig} onUpdate={updateFontConfig} onClose={() => setShowFontPanel(false)} />
          </div>
        )}
        {/* ── CATALOG COVER PANEL ── */}
        {selectedId === '_catalog_cover' && !showFontPanel && (() => {
          const heroSec = sections.find(s => s.id === 'tpl1_hero');
          const cs = heroSec?.settings || {};
          const onUpdateCatalog = (patch: Record<string, unknown>) => {
            if (heroSec) updateSettings('tpl1_hero', patch);
          };
          return (
            <div style={{ width: 320, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'auto', animation: 'te-slideIn 0.2s cubic-bezier(0.2,1,0.3,1) both' }}>
              <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4338ca' }}><Image size={14} /></div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Portada del Catálogo</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Imagen de fondo en página /productos</div>
                </div>
                <button onClick={() => setSelectedId(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SH>Imagen de portada</SH>
                <ImageUploadField label="Imagen del catálogo" value={cs.catalogCoverImage || ''} onChange={v => onUpdateCatalog({ catalogCoverImage: v })} />
                <SH>Texto</SH>
                <Field icon={<Type size={13} />} label="Título" value={cs.catalogCoverTitle || ''} onChange={v => onUpdateCatalog({ catalogCoverTitle: v })} placeholder="Productos" />
                <Field icon={<Type size={13} />} label="Subtítulo" value={cs.catalogCoverSubtitle || ''} onChange={v => onUpdateCatalog({ catalogCoverSubtitle: v })} placeholder="Descubrí nuestra selección de productos exclusivos" />
                <SH>Overlay</SH>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
                  <input type="checkbox" checked={cs.catalogCoverOverlayEnabled !== false} onChange={e => onUpdateCatalog({ catalogCoverOverlayEnabled: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
                  Capa oscura (overlay)
                </label>
                {cs.catalogCoverOverlayEnabled !== false && (<>
                  <RangeField label="Opacidad" value={cs.catalogCoverOverlayOpacity ?? 40} onChange={v => onUpdateCatalog({ catalogCoverOverlayOpacity: v })} min={0} max={100} unit="%" />
                  <ColorField label="Color overlay" value={cs.catalogCoverOverlayColor || '#000000'} onChange={v => onUpdateCatalog({ catalogCoverOverlayColor: v })} />
                </>)}
              </div>
            </div>
          );
        })()}
        {/* ── HISTORY PANEL ── */}
        {showHistoryPanel && (
          <div style={{ width: 340, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden', animation: 'te-slideIn 0.2s cubic-bezier(0.2,1,0.3,1) both' }}>
            <HistoryPanel
              history={history}
              onClose={() => setShowHistoryPanel(false)}
              onRestore={restoreHistorySnapshot}
              onDelete={deleteHistorySnapshot}
              onClearAll={clearAllHistory}
            />
          </div>
        )}
        {/* ── TEMPLATES PANEL ── */}
        {showTemplatesPanel && (
          <div style={{ width: 320, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden', animation: 'te-slideIn 0.2s cubic-bezier(0.2,1,0.3,1) both' }}>
            {/* Header */}
            <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LayoutGrid size={16} color="#6366f1" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Plantillas</span>
              </div>
              <button onClick={() => setShowTemplatesPanel(false)} style={{ width: 28, height: 28, borderRadius: 6, background: '#f3f4f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} color="#6b7280" />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
              {/* Active template indicator */}
              <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: activeTemplateId === 'original' ? '#f0fdf4' : '#eef2ff', border: `1px solid ${activeTemplateId === 'original' ? '#bbf7d0' : '#c7d2fe'}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: activeTemplateId === 'original' ? '#16a34a' : '#4338ca', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Plantilla activa
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginTop: 2 }}>
                  {activeTemplateId === 'original' ? 'Original (predeterminada)' : templates.find(t => t.$id === activeTemplateId)?.NAME || 'Desconocida'}
                </div>
              </div>

              {/* Original template */}
              <button onClick={() => loadTemplate('original')}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, border: `2px solid ${activeTemplateId === 'original' ? '#6366f1' : '#e5e7eb'}`, background: activeTemplateId === 'original' ? '#eef2ff' : '#fff', cursor: 'pointer', marginBottom: 8, transition: 'all 0.15s', textAlign: 'left' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <RotateCcw size={16} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Original</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>Restaurar valores predeterminados</div>
                </div>
                {activeTemplateId === 'original' && <CheckCircle size={16} color="#6366f1" />}
              </button>

              {/* Separator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Plantillas por cliente</span>
                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
              </div>

              {/* Create new template */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} placeholder="Nombre del cliente..." onKeyDown={e => e.key === 'Enter' && createTemplate()}
                  style={{ flex: 1, fontSize: 12, padding: '7px 10px', borderRadius: 8, border: '1px solid #e5e7eb', outline: 'none' }} />
                <button onClick={createTemplate} disabled={templateLoading || !newTemplateName.trim()}
                  style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: newTemplateName.trim() ? '#6366f1' : '#e5e7eb', color: newTemplateName.trim() ? '#fff' : '#9ca3af', fontSize: 11, fontWeight: 700, cursor: newTemplateName.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                  <Plus size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Crear
                </button>
              </div>

              {/* Template list */}
              {templates.length === 0 && (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <FileText size={28} color="#d1d5db" style={{ margin: '0 auto 8px', display: 'block' }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Sin plantillas de cliente</div>
                  <div style={{ fontSize: 11, marginTop: 4, color: '#9ca3af', lineHeight: 1.5 }}>
                    Crea una plantilla para personalizar la tienda de cada cliente por separado.
                  </div>
                </div>
              )}
              {templates.map(tpl => (
                <div key={tpl.$id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, border: `2px solid ${activeTemplateId === tpl.$id ? '#6366f1' : '#e5e7eb'}`, background: activeTemplateId === tpl.$id ? '#eef2ff' : '#fff', marginBottom: 6, cursor: 'pointer', transition: 'all 0.15s' }}
                  onClick={() => loadTemplate(tpl.$id)}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: activeTemplateId === tpl.$id ? '#6366f1' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={14} color={activeTemplateId === tpl.$id ? '#fff' : '#9ca3af'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.NAME}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>
                      {tpl.UPDATED ? new Date(tpl.UPDATED).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sin guardar'}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteTemplate(tpl.$id); }}
                    style={{ width: 24, height: 24, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', transition: 'color 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#d1d5db'; }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RIGHT COLUMN: Preview top bar + iframe ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* White preview top bar */}
          <header style={{
            height: 48, background: '#fff', borderBottom: '1px solid #e5e7eb',
            display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8, flexShrink: 0,
          }}>
            {/* Sidebar toggle */}
            <button onClick={() => setSidebarCollapsed(c => !c)} className="te-collapse-btn"
              title={sidebarCollapsed ? 'Mostrar panel' : 'Ocultar panel'}
              style={{ width: 32, height: 32, borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>

            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />

            {/* Previewing label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Eye size={13} color="#9ca3af" />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Previsualizando</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Inicio</span>
            </div>

            {hasChanges && (
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                Sin guardar
              </span>
            )}

            <div style={{ flex: 1 }} />

            {/* Device toggle */}
            <div style={{ display: 'flex', gap: 1, background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
              {(Object.keys(DEVICES) as DeviceKey[]).map(key => {
                const D = DEVICES[key]; const Icon = D.icon; const active = device === key;
                return (
                  <button key={key} onClick={() => setDevice(key)} title={D.label} className="te-preview-btn"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer', background: active ? '#fff' : 'transparent', color: active ? '#111827' : '#9ca3af', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>
                    <Icon size={14} />
                  </button>
                );
              })}
            </div>

            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />

            <a href="/" target="_blank" rel="noreferrer" className="te-preview-btn"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6b7280', textDecoration: 'none', padding: '5px 8px', borderRadius: 6, background: 'transparent' }}>
              <ExternalLink size={12} /> Ver tienda
            </a>

            <button
              onClick={() => setShowHistoryPanel(v => !v)}
              title="Historial de cambios"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, background: showHistoryPanel ? '#eef2ff' : '#fff', color: showHistoryPanel ? '#4338ca' : '#374151', border: `1px solid ${showHistoryPanel ? '#c7d2fe' : '#e5e7eb'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
              <History size={13} />
              Historial
              {history.length > 0 && (
                <span style={{ background: showHistoryPanel ? '#4338ca' : '#6366f1', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, minWidth: 16, textAlign: 'center' }}>
                  {history.length}
                </span>
              )}
            </button>

            <button onClick={handleSave} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8, background: saved ? '#10b981' : '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', transition: 'background 0.15s' }}>
              {saving ? <Loader size={12} style={{ animation: 'te-spin 1s linear infinite' }} /> : saved ? <CheckCircle size={12} /> : <Save size={12} />}
              {saved ? 'Guardado' : 'Guardar'}
            </button>

            <button
              onClick={() => setShowTemplatesPanel(v => !v)}
              title="Plantillas"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, background: showTemplatesPanel ? '#eef2ff' : '#fff', color: showTemplatesPanel ? '#4338ca' : '#374151', border: `1px solid ${showTemplatesPanel ? '#c7d2fe' : '#e5e7eb'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
              <LayoutGrid size={13} />
              Plantillas
            </button>
          </header>

          {/* LIVE PREVIEW (iframe) */}
          <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'auto', background: '#e5e7eb', padding: device === 'desktop' ? 0 : 24 }}>
            <div style={{
              width: DEVICES[device].width,
              maxWidth: '100%',
              height: device === 'desktop' ? '100%' : 'calc(100vh - 100px)',
              background: '#fff',
              borderRadius: device === 'desktop' ? 0 : 12,
              boxShadow: device === 'desktop' ? 'none' : '0 4px 24px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              transition: 'width 0.3s ease',
            }}>
              <iframe
                ref={iframeRef}
                src={isTemplate1 ? '/?_tpl=1' : isCustomTemplate ? '/?_tpl=4' : '/'}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Vista previa de la tienda"
              />
            </div>
          </main>
        </div>

      {/* ═══ ADD SECTION MODAL ═══ */}
      {addModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setAddModalOpen(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'relative', width: 560, maxHeight: '80vh', background: '#fff', borderRadius: 20, boxShadow: '0 24px 80px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'te-slideIn 0.25s cubic-bezier(0.2,1,0.3,1) both' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={18} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>Agregar sección</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                    Grupo: <strong style={{ color: '#6366f1' }}>{addModalOpen === 'header' ? 'Encabezado' : addModalOpen === 'footer' ? 'Pie de página' : 'Template'}</strong>
                  </div>
                </div>
              </div>
              <button onClick={() => setAddModalOpen(null)}
                style={{ width: 32, height: 32, borderRadius: 8, background: '#f3f4f6', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6'; }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(isCustomTemplate ? CM_SECTION_CATALOG : SECTION_CATALOG).map(cat => (
                  <button key={cat.id} className="te-cat"
                    onClick={() => addSection(cat.id, addModalOpen!)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 12, border: '1.5px solid #f0f0f0', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eef2ff', borderRadius: 8, color: '#6366f1', flexShrink: 0 }}><SectionIcon sectionId={cat.id} size={16} /></span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', letterSpacing: '-0.01em' }}>{cat.label}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3, lineHeight: 1.5 }}>{cat.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   GROUP BLOCK (sidebar section group)
   ═══════════════════════════════════════════════════════════════════ */
function GroupBlock({ label, icon, group, open, onToggle, items, allSections, selectedId, onSelect, hoveredId, onHover, onRemove, onToggleVisibility, dragLocalIdx, dragOverLocalIdx, dragGroup, onGroupDragStart, onGroupDragOver, onGroupDrop, onGroupDragEnd, onAdd, fixedHeaderOrder, fixedFooterOrder }: {
  label: string; icon: React.ReactNode; group: 'header'|'body'|'footer'; open: boolean; onToggle: () => void;
  items: EditorSection[]; allSections: EditorSection[];
  selectedId: string | null; onSelect: (id: string) => void;
  hoveredId: string | null; onHover: (id: string | null) => void;
  onRemove: (id: string) => void; onToggleVisibility: (id: string) => void; onAdd: () => void;
  dragLocalIdx: number | null; dragOverLocalIdx: number | null; dragGroup: 'header'|'body'|'footer'|null;
  onGroupDragStart: (group: 'header'|'body'|'footer', localIdx: number, sectionId: string) => void;
  onGroupDragOver: (group: 'header'|'body'|'footer', e: React.DragEvent, localIdx: number) => void;
  onGroupDrop: (group: 'header'|'body'|'footer', localIdx: number) => void;
  onGroupDragEnd: () => void;
  fixedHeaderOrder?: string[];
  fixedFooterOrder?: string[];
}) {
  return (
    <div style={{ marginBottom: 4, padding: '0 8px' }}>
      {/* Group header */}
      <button onClick={onToggle} className="te-grp-header"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 10px', border: 'none', background: 'transparent',
          cursor: 'pointer', borderRadius: 8,
        }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: open ? '#eef2ff' : '#f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: open ? '#6366f1' : '#9ca3af',
          transition: 'all 0.2s',
        }}>
          {icon}
        </div>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#374151', textAlign: 'left', letterSpacing: '-0.01em' }}>
          {label}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 600, color: '#9ca3af',
          background: '#f3f4f6', padding: '1px 7px', borderRadius: 10, minWidth: 20, textAlign: 'center',
        }}>{items.length}</span>
        <div style={{ color: '#9ca3af', transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          <ChevronDown size={13} />
        </div>
      </button>

      {/* Items list */}
      {open && (
        <div className="te-grp-items" style={{ position: 'relative', paddingLeft: 4, marginLeft: 11, borderLeft: '1.5px solid #e5e7eb' }}>
          {items.map((section, localIdx) => {
            const isSelected = selectedId === section.id;
            const isHovered = hoveredId === section.id;
            const isDragging = dragGroup === group && dragLocalIdx === localIdx;
            const isDragOver = dragGroup === group && dragOverLocalIdx === localIdx;
            return (
              <div key={section.id} style={{ position: 'relative' }}>
                {/* Insertion indicator line */}
                {isDragOver && dragLocalIdx !== null && dragLocalIdx !== localIdx && (
                  <div className="te-insert-indicator" style={{ top: -2 }} />
                )}
                <div
                  draggable onDragStart={() => onGroupDragStart(group, localIdx, section.id)}
                  onDragOver={(e) => onGroupDragOver(group, e, localIdx)}
                  onDrop={() => onGroupDrop(group, localIdx)} onDragEnd={onGroupDragEnd}
                  className={`te-item ${isDragging ? 'te-item-dragging' : ''} ${!section.enabled ? 'disabled' : ''}`}
                  onClick={() => onSelect(section.id)}
                  onMouseEnter={() => onHover(section.id)}
                  onMouseLeave={() => onHover(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    background: isSelected ? '#eef2ff' : isHovered ? '#f5f3ff' : 'transparent',
                    border: isSelected ? '1.5px solid #c7d2fe' : isHovered ? '1.5px solid #ddd6fe' : '1.5px solid transparent',
                    opacity: isDragging ? 0.4 : section.enabled ? 1 : 0.45,
                    marginBottom: 2, position: 'relative',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}>
                  {/* Tree branch connector */}
                  <div style={{
                    position: 'absolute', left: -5, top: '50%', width: 8, height: 1.5,
                    background: isSelected ? '#c7d2fe' : '#e5e7eb',
                  }} />
                  {/* Drag handle - hide for fixed header/footer sections */}
                  {((!fixedHeaderOrder || !fixedHeaderOrder.includes(section.id)) && 
                   (!fixedFooterOrder || !fixedFooterOrder.includes(section.id))) && (
                    <GripVertical size={12} className="te-grip" style={{ color: '#c4c4c4', flexShrink: 0 }} />
                  )}
                  {/* Icon */}
                  <span style={{
                    width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 5, background: isSelected ? '#e0e7ff' : isHovered ? '#ede9fe' : '#f3f4f6',
                    color: isSelected ? '#4338ca' : isHovered ? '#6d28d9' : section.enabled ? '#6b7280' : '#d1d5db',
                    flexShrink: 0, transition: 'all 0.15s',
                  }}><SectionIcon sectionId={section.id} size={13} /></span>
                  {/* Label */}
                  <span style={{
                    flex: 1, fontSize: 12, fontWeight: isSelected ? 600 : isHovered ? 600 : 500,
                    color: isSelected ? '#4338ca' : isHovered ? '#6d28d9' : section.enabled ? '#374151' : '#9ca3af',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    letterSpacing: '-0.01em', transition: 'color 0.15s',
                  }}>
                    {section.label}
                  </span>
                  {/* Badges */}
                  {!section.enabled && (
                    <span style={{
                      fontSize: 8, padding: '2px 5px', borderRadius: 4,
                      background: '#fef2f2', color: '#dc2626', fontWeight: 700,
                      letterSpacing: '0.02em',
                    }}>OCULTA</span>
                  )}
                  {section.locked && (
                    <span style={{
                      fontSize: 8, padding: '2px 5px', borderRadius: 4,
                      background: '#fefce8', color: '#a16207', fontWeight: 700,
                    }}>FIJA</span>
                  )}
                  {/* Visibility toggle */}
                  <button onClick={(e) => { e.stopPropagation(); onToggleVisibility(section.id); }}
                    className="te-vis-btn"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: section.enabled ? '#10b981' : '#374151',
                      padding: 2, display: 'flex',
                    }}
                    title={section.enabled ? 'Ocultar sección' : 'Mostrar sección'}>
                    {section.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  {/* Delete */}
                  {!section.locked && (
                    <button onClick={(e) => { e.stopPropagation(); onRemove(section.id); }}
                      className="te-del-btn"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: section.enabled ? '#d1d5db' : '#374151', padding: 2, display: 'flex',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = section.enabled ? '#d1d5db' : '#374151'; }}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {/* Add section button */}
          <button onClick={onAdd} className="te-add-btn"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: '8px 10px', borderRadius: 8,
              border: '1.5px dashed #d1d5db', background: 'transparent',
              cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#6b7280',
              marginTop: 4, marginBottom: 4,
            }}>
            <Plus size={13} /> Agregar sección
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SETTINGS PANEL  inline design controls per section type
   ═══════════════════════════════════════════════════════════════════ */

function getSectionBaseId(id: string): string {
  const parts = id.split('_');
  const last = parts[parts.length - 1];
  if (/^\d{10,}$/.test(last)) return parts.slice(0, -1).join('_');
  // Strip tpl1_ / cm_ prefix so tpl1_announcement_bar → announcement_bar
  if (id.startsWith('tpl1_')) return id.slice(5);
  if (id.startsWith('cm_')) return id.slice(3);
  return id;
}

function SettingsPanel({ section, onClose, onUpdate, onToggle, onIframeReload }: {
  section: EditorSection; onClose: () => void;
  onUpdate: (p: Partial<SectionSettings>) => void; onToggle: () => void; onIframeReload: () => void;
}) {
  const baseId = getSectionBaseId(section.id);
  const [activeTab, setActiveTab] = useState<'content' | 'style'>('content');

  return (
    <>
      {/* Header */}
      <div style={{ padding: '14px 16px 0', borderBottom: '1px solid #f0f0f0', flexShrink: 0, background: '#fafbfc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 7, background: '#f3f4f6', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6'; }}>
            <ArrowLeft size={14} />
          </button>
          <span style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: '#eef2ff', color: '#6366f1', flexShrink: 0 }}><SectionIcon sectionId={section.id} size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{section.label}</div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{section.description || 'Sección personalizable'}</div>
          </div>
          <button onClick={onToggle} disabled={section.locked}
            style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 10, fontWeight: 700, cursor: section.locked ? 'default' : 'pointer', background: section.enabled ? '#ecfdf5' : '#fef2f2', color: section.enabled ? '#059669' : '#dc2626', opacity: section.locked ? 0.5 : 1, transition: 'all 0.15s' }}>
            {section.enabled ? '● Visible' : '○ Oculta'}
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginTop: 10 }}>
          <button onClick={() => setActiveTab('content')}
            style={{ flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700, border: 'none', borderBottom: activeTab === 'content' ? '2px solid #6366f1' : '2px solid transparent', background: 'transparent', color: activeTab === 'content' ? '#6366f1' : '#9ca3af', cursor: 'pointer', transition: 'all 0.15s' }}>
            Contenido
          </button>
          <button onClick={() => setActiveTab('style')}
            style={{ flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700, border: 'none', borderBottom: activeTab === 'style' ? '2px solid #6366f1' : '2px solid transparent', background: 'transparent', color: activeTab === 'style' ? '#6366f1' : '#9ca3af', cursor: 'pointer', transition: 'all 0.15s' }}>
            Estilo
          </button>
        </div>
      </div>

      <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto' }}>
        {activeTab === 'content' ? (
          <ContentFields baseId={baseId} section={section} onUpdate={onUpdate} onIframeReload={onIframeReload} />
        ) : (
          <DesignFields baseId={baseId} section={section} onUpdate={onUpdate} />
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DESIGN TAB  visual controls per section (colors, spacing, typo)
   ═══════════════════════════════════════════════════════════════════ */
function DesignFields({ baseId, section, onUpdate }: {
  baseId: string; section: EditorSection; onUpdate: (p: Partial<SectionSettings>) => void;
}) {
  const s = section.settings;
  const [availCoupons, setAvailCoupons] = useState<Array<{$id: string; code: string; type: string; value: number}>>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);

  useEffect(() => {
    if (baseId !== 'coupon_banner' && baseId !== 'tpl1_coupon_banner') return;
    setCouponsLoading(true);
    (async () => {
      try {
        const { databases } = getServices();
        const { databaseId } = getFirebaseConfig();
        const res = await databases.listDocuments(databaseId, 'discount_coupons', [Query.equal('isActive', true), Query.limit(50)]);
        setAvailCoupons(res.documents as any);
      } catch (e) { console.error(e); }
      finally { setCouponsLoading(false); }
    })();
  }, [baseId]);

  /* ── Shared design blocks ── */
  const ColorsBlock = () => (
    <>
      <SH>Colores</SH>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <ColorField label="Fondo sección" value={s.bgColor || ''} onChange={v => onUpdate({ bgColor: v })} />
        <ColorField label="Texto general" value={s.textColor || ''} onChange={v => onUpdate({ textColor: v })} />
        <ColorField label="Títulos" value={s.headingColor || ''} onChange={v => onUpdate({ headingColor: v })} />
        <ColorField label="Acento / Links" value={s.accentColor || ''} onChange={v => onUpdate({ accentColor: v })} />
      </div>
    </>
  );

  const CardColorsBlock = () => (
    <>
      <SH>Colores de tarjetas</SH>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <ColorField label="Fondo card" value={s.cardBgColor || ''} onChange={v => onUpdate({ cardBgColor: v })} />
        <ColorField label="Texto card" value={s.cardTextColor || ''} onChange={v => onUpdate({ cardTextColor: v })} />
        <ColorField label="Borde card" value={s.borderColor || ''} onChange={v => onUpdate({ borderColor: v })} />
        <ColorField label="Enlace" value={s.linkColor || ''} onChange={v => onUpdate({ linkColor: v })} />
      </div>
    </>
  );

  const ButtonBlock = () => (
    <>
      <SH>Botón</SH>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <ColorField label="Fondo botón" value={s.buttonColor || ''} onChange={v => onUpdate({ buttonColor: v })} />
        <ColorField label="Texto botón" value={s.buttonTextColor || ''} onChange={v => onUpdate({ buttonTextColor: v })} />
      </div>
      <RangeField label="Radio botón" value={s.buttonRadius ?? 8} onChange={v => onUpdate({ buttonRadius: v })} min={0} max={24} unit="px" />
    </>
  );

  const TypographyBlock = () => (
    <>
      <SH>Tipografía</SH>
      <RangeField label="Tamaño título" value={s.headingSize ?? 18} onChange={v => onUpdate({ headingSize: v })} min={12} max={36} unit="px" />
      <RangeField label="Tamaño texto" value={s.textSize ?? 13} onChange={v => onUpdate({ textSize: v })} min={10} max={20} unit="px" />
      <SelectField label="Peso fuente" value={s.fontWeight || '600'} onChange={v => onUpdate({ fontWeight: v })}
        options={[{ v: '400', l: 'Normal' }, { v: '500', l: 'Medium' }, { v: '600', l: 'Semi-bold' }, { v: '700', l: 'Bold' }, { v: '800', l: 'Extra-bold' }]} />
    </>
  );

  const FontBlock = () => (
    <>
      <SH>Fuentes</SH>
      <p style={{ fontSize: 9, color: '#9ca3af', margin: '0 0 6px', lineHeight: 1.4 }}>
        Deja vacío para usar la fuente global.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <SelectField label="Texto" value={s.fontFamily || ''} onChange={v => onUpdate({ fontFamily: v })}
          options={FONT_OPTIONS.map(f => ({ v: f.value, l: f.label }))} />
        <SelectField label="Títulos" value={s.headingFontFamily || ''} onChange={v => onUpdate({ headingFontFamily: v })}
          options={FONT_OPTIONS.map(f => ({ v: f.value, l: f.label }))} />
      </div>
    </>
  );

  const SpacingBlock = () => (
    <>
      <SH>Espaciado y diseño</SH>
      <RangeField label="Padding sección" value={s.padding ?? 16} onChange={v => onUpdate({ padding: v })} min={0} max={60} unit="px" />
      <RangeField label="Espacio entre items" value={s.gap ?? 10} onChange={v => onUpdate({ gap: v })} min={0} max={30} unit="px" />
      <RangeField label="Radio de borde" value={s.borderRadius ?? 6} onChange={v => onUpdate({ borderRadius: v })} min={0} max={24} unit="px" />
      <SelectField label="Sombra" value={s.shadow || 'sm'} onChange={v => onUpdate({ shadow: v as SectionSettings['shadow'] })}
        options={[{ v: 'none', l: 'Ninguna' }, { v: 'sm', l: 'Sutil' }, { v: 'md', l: 'Media' }, { v: 'lg', l: 'Grande' }]} />
    </>
  );

  const LayoutBlock = () => (
    <>
      <SH>Layout</SH>
      <RangeField label="Columnas" value={s.columns ?? 4} onChange={v => onUpdate({ columns: v })} min={1} max={6} unit="" />
      <RangeField label="Radio tarjetas" value={s.cardRadius ?? 12} onChange={v => onUpdate({ cardRadius: v })} min={0} max={24} unit="px" />
    </>
  );

  const NAV_MODELS: { id: string; layout?: 'classic' | 'centered' | 'stacked' | 'minimal-fashion' | 'topbar' | 'split' | 'glass-float' | 'nebula-premium'; label: string; desc: string; bg: string; text: string; accent: string; overlay: string; navH: number; logoH: number; border: boolean; borderCol: string; searchBg: string; searchIcon: string; badge: string; showSearch?: boolean; sBg?: string; radius?: number; sBtn?: string; catBarBg?: string; catBarText?: string; bgGradient?: string; gradientAnimated?: boolean; }[] = [
    { id: 'original', layout: 'classic', label: 'Original', desc: 'Diseño original del tema Venice', bg: 'transparent', text: '#fff', accent: '#fff', overlay: 'rgba(0,0,0,0.15)', navH: 80, logoH: 40, border: false, borderCol: 'transparent', searchBg: 'rgba(255,255,255,0.1)', searchIcon: '#fff', badge: '#fff' },
    { id: 'dark-elegance', layout: 'centered', label: 'Dark Elegance', desc: 'Negro elegante centrado', bg: '#0d0d0d', text: '#f5f5f5', accent: '#d4a853', overlay: 'rgba(0,0,0,0)', navH: 72, logoH: 38, border: true, borderCol: '#2a2a2a', searchBg: 'rgba(255,255,255,0.08)', searchIcon: '#d4a853', badge: '#d4a853' },
    { id: 'minimal-white', layout: 'minimal-fashion', label: 'Minimal White', desc: 'Blanco limpio fashion', bg: '#ffffff', text: '#1a1a1a', accent: '#333333', overlay: 'rgba(0,0,0,0)', navH: 68, logoH: 36, border: true, borderCol: '#f0f0f0', searchBg: '#f5f5f5', searchIcon: '#1a1a1a', badge: '#333333' },
    { id: 'rose-blush', layout: 'topbar', label: 'Rose Blush', desc: 'Topbar romántico', bg: '#fff5f5', text: '#4a1a2e', accent: '#e8788a', overlay: 'rgba(0,0,0,0)', navH: 72, logoH: 38, border: true, borderCol: '#fce4e4', searchBg: '#fce4e4', searchIcon: '#e8788a', badge: '#e8788a' },
    { id: 'midnight-blue', layout: 'split', label: 'Midnight Blue', desc: 'Azul profundo split', bg: '#0a1628', text: '#e8ecf1', accent: '#4da8da', overlay: 'rgba(0,0,0,0.1)', navH: 76, logoH: 40, border: true, borderCol: '#1a2a44', searchBg: 'rgba(255,255,255,0.06)', searchIcon: '#4da8da', badge: '#4da8da' },
    { id: 'forest-green', layout: 'stacked', label: 'Forest Green', desc: 'Stacked orgánico', bg: '#0d2818', text: '#e8f5e9', accent: '#4caf50', overlay: 'rgba(0,0,0,0.1)', navH: 72, logoH: 36, border: true, borderCol: '#1a3d28', searchBg: 'rgba(255,255,255,0.06)', searchIcon: '#4caf50', badge: '#4caf50' },
    { id: 'lavender-dream', layout: 'glass-float', label: 'Lavender Dream', desc: 'Floating Glass Premium', bg: 'rgba(248,245,255,0.85)', text: '#3d2a5c', accent: '#8b5cf6', overlay: 'rgba(0,0,0,0)', navH: 72, logoH: 38, border: true, borderCol: 'rgba(237,228,255,0.5)', searchBg: 'rgba(237,228,255,0.8)', searchIcon: '#8b5cf6', badge: '#8b5cf6' },
    { id: 'charcoal-modern', layout: 'nebula-premium', label: 'Charcoal Modern', desc: 'Nebula SciFi Premium', bg: '#1e1e24', text: '#e0e0e0', accent: '#a0a0b0', overlay: 'rgba(0,0,0,0.05)', navH: 68, logoH: 36, border: true, borderCol: '#2e2e34', searchBg: 'rgba(255,255,255,0.06)', searchIcon: '#a0a0b0', badge: '#a0a0b0' },
    { id: 'liquid-metal', layout: 'split', label: 'Liquid Metal', desc: 'Silver animado fluido', bg: '#e5e7eb', bgGradient: 'linear-gradient(270deg, #d1d5db, #f3f4f6, #e5e7eb, #9ca3af)', gradientAnimated: true, text: '#111827', accent: '#374151', overlay: 'rgba(0,0,0,0)', navH: 76, logoH: 38, border: true, borderCol: 'rgba(0,0,0,0.1)', searchBg: 'rgba(255,255,255,0.5)', searchIcon: '#374151', badge: '#111827' },
    { id: 'sunset-vibes', layout: 'glass-float', label: 'Sunset Vibes', desc: 'Gradiente animado cálido', bg: '#ff7e5f', bgGradient: 'linear-gradient(270deg, #ff7e5f, #feb47b, #ff7e5f)', gradientAnimated: true, text: '#ffffff', accent: '#ffffff', overlay: 'rgba(0,0,0,0.05)', navH: 72, logoH: 40, border: false, borderCol: 'transparent', searchBg: 'rgba(255,255,255,0.2)', searchIcon: '#fff', badge: '#fff' },
    { id: 'cyberpunk-neon', layout: 'centered', label: 'Cyberpunk Neon', desc: 'Neon interactivo vibrante', bg: '#09090b', bgGradient: 'linear-gradient(270deg, #09090b, #1f0533, #021f30, #09090b)', gradientAnimated: true, text: '#ffffff', accent: '#22d3ee', overlay: 'rgba(0,0,0,0)', navH: 72, logoH: 38, border: true, borderCol: '#a855f7', searchBg: 'rgba(255,255,255,0.1)', searchIcon: '#22d3ee', badge: '#a855f7' },
  ];

  switch (baseId) {
    case 'navbar': {
      const applyModel = (m: typeof NAV_MODELS[0]) => {
        onUpdate({
          navModel: m.id,
          navLayout: m.layout || 'classic',
          bgColor: m.bg, 
          bgGradient: m.bgGradient,
          gradientAnimated: m.gradientAnimated,
          textColor: m.text, 
          accentColor: m.accent,
          navHeight: m.navH, 
          logoSize: m.logoH,
          borderBottom: m.border, 
          borderBottomColor: m.borderCol,
          searchBgColor: m.searchBg, 
          cartBadgeColor: m.badge,
        });
      };
      /* Mini preview renderers per layout type */
      const MiniClassic = ({ m }: { m: typeof NAV_MODELS[0] }) => {
        const t = m.text === '#fff' || m.text === '#e5e5e5' || m.text === '#e2e8f0' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.3)';
        const isML = m.id === 'mercadolibre';
        // Preview premium especial para MercadoLibre
        if (isML) return (
          <div style={{ position: 'relative', overflow: 'hidden' }}>
            <style>{`
              @keyframes mlPreviewShimmer { 0%{transform:translateX(-120%) skewX(-18deg)} 100%{transform:translateX(220%) skewX(-18deg)} }
              @keyframes mlPreviewFloat { 0%,100%{transform:translate(0,0);opacity:.4} 50%{transform:translate(2px,-2px);opacity:.7} }
            `}</style>
            <div style={{ height: 36, background: 'linear-gradient(135deg,#fff9c4 0%,#ffe94e 25%,#ffe600 50%,#ffd500 75%,#f4b400 100%)', display: 'flex', flexDirection: 'column', padding: '3px 6px 2px', position: 'relative', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.5), inset 0 -1px 0 rgba(180,130,0,.15)' }}>
              {/* Shimmer overlay */}
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '45%', height: '100%', background: 'linear-gradient(105deg,transparent 30%,rgba(255,255,255,.4) 50%,transparent 70%)', animation: 'mlPreviewShimmer 3.5s ease-in-out infinite' }} />
              </div>
              {/* Partículas decorativas */}
              <span style={{ position: 'absolute', top: 4, left: '25%', fontSize: 5, fontWeight: 800, color: '#3483fa', opacity: .5, animation: 'mlPreviewFloat 2.8s ease-in-out infinite' }}>IC</span>
              <span style={{ position: 'absolute', top: 8, right: '30%', fontSize: 4, color: '#3483fa', opacity: .45, animation: 'mlPreviewFloat 3.2s ease-in-out infinite .5s' }}>✦</span>
              {/* Fila 1: logo + search + promo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, position: 'relative', zIndex: 1 }}>
                <div style={{ width: 16, height: 5, background: 'rgba(0,0,0,.55)', borderRadius: 1, flexShrink: 0 }} />
                <div style={{ flex: 1, height: 11, background: '#fff', borderRadius: 6, display: 'flex', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.1)' }}>
                  <div style={{ width: 3, height: 3, background: 'rgba(0,0,0,.2)', borderRadius: '50%', margin: '0 0 0 3px' }} />
                </div>
                <div style={{ width: 10, height: 11, background: 'linear-gradient(135deg,#3483fa,#2968c8)', borderRadius: 6, flexShrink: 0 }} />
                {/* Promo tag gradient */}
                <div style={{ width: 14, height: 9, background: 'linear-gradient(135deg,#6366f1,#a855f7)', borderRadius: 3, flexShrink: 0, boxShadow: '0 1px 3px rgba(99,102,241,.3)' }} />
              </div>
              {/* Fila 2: nav links */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2, position: 'relative', zIndex: 1 }}>
                {[0,1,2,3].map(i => <div key={i} style={{ width: 8, height: 2, background: 'rgba(0,0,0,.35)', borderRadius: 1 }} />)}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 1.5 }}>
                  <div style={{ width: 5, height: 5, background: 'linear-gradient(135deg,#3483fa,#2968c8)', borderRadius: '50%' }} />
                  <div style={{ width: 5, height: 2, background: 'rgba(0,0,0,.35)', borderRadius: 1, alignSelf: 'center' }} />
                </div>
              </div>
            </div>
          </div>
        );
        return (<div style={{ height: 28, background: m.bgGradient || m.bg, backgroundSize: m.gradientAnimated ? '200% 200%' : 'auto', animation: m.gradientAnimated ? 'mlPreviewShimmer 3s ease infinite' : 'none', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4 }}>
          <div style={{ width: 18, height: 6, background: t, borderRadius: 2, flexShrink: 0 }} />
          {m.showSearch && <div style={{ flex: 1, height: 12, background: m.sBg, borderRadius: Math.min(m.radius || 0, 6), opacity: .85 }} />}
          {m.showSearch && <div style={{ width: 10, height: 12, background: m.sBtn, borderRadius: Math.min(m.radius || 0, 6), opacity: .85, flexShrink: 0 }} />}
          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>{[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: t }} />)}</div>
        </div>);
      };
      const MiniStacked = ({ m }: { m: typeof NAV_MODELS[0] }) => {
        const t = 'rgba(255,255,255,0.7)';
        return (<div>
          <div style={{ height: 22, background: m.bgGradient || m.bg, backgroundSize: m.gradientAnimated ? '200% 200%' : 'auto', animation: m.gradientAnimated ? 'mlPreviewShimmer 3s ease infinite' : 'none', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4 }}>
            <div style={{ width: 16, height: 5, background: t, borderRadius: 2 }} />
            <div style={{ flex: 1, height: 10, background: m.sBg, borderRadius: 2, opacity: .85 }} />
            <div style={{ width: 8, height: 10, background: m.sBtn, borderRadius: 2, opacity: .85 }} />
            <div style={{ display: 'flex', gap: 2 }}>{[0,1].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: t }} />)}</div>
          </div>
          <div style={{ height: 12, background: m.catBarBg || '#232f3e', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 3 }}>
            {['☰','Inicio','Ofertas','Cats'].map((l,i) => <div key={i} style={{ fontSize: 5, color: m.catBarText || '#ddd', fontWeight: 600, opacity: .8 }}>{l}</div>)}
          </div>
        </div>);
      };
      const MiniCentered = ({ m }: { m: typeof NAV_MODELS[0] }) => {
        const t = m.text === '#fff' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.35)';
        return (<div style={{ height: 28, background: m.bgGradient || m.bg, backgroundSize: m.gradientAnimated ? '200% 200%' : 'auto', animation: m.gradientAnimated ? 'mlPreviewShimmer 3s ease infinite' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', borderBottom: `1px solid ${m.borderCol}` }}>
          <div style={{ display: 'flex', gap: 2 }}>{[0,1].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: t }} />)}</div>
          <div style={{ width: 28, height: 7, background: t, borderRadius: 2 }} />
          <div style={{ display: 'flex', gap: 2 }}>{[0,1].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: t }} />)}</div>
        </div>);
      };
      const MiniFashion = ({ m }: { m: typeof NAV_MODELS[0] }) => {
        const t = 'rgba(0,0,0,0.4)';
        return (<div style={{ height: 30, background: m.bgGradient || m.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', borderBottom: `1px solid ${m.borderCol}` }}>
          <div style={{ width: 8, height: 6, display: 'flex', flexDirection: 'column', gap: 1.5 }}>{[0,1,2].map(i => <div key={i} style={{ height: 1, background: t, borderRadius: 1 }} />)}</div>
          <div style={{ fontSize: 8, fontWeight: 900, color: m.text, letterSpacing: 2, textTransform: 'uppercase' as const }}>LOGO</div>
          <div style={{ display: 'flex', gap: 3 }}>{[0,1].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: t }} />)}</div>
        </div>);
      };
      const MiniTopbar = ({ m }: { m: typeof NAV_MODELS[0] }) => {
        return (<div style={{ height: 36, background: m.bgGradient || m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', position: 'relative' }}>
          {/* Aurora gradient border simulation */}
          <div style={{ position: 'absolute', inset: 3, borderRadius: 12, border: '1px solid transparent', background: 'linear-gradient(90deg, #ff3366, #00d4ff, #ff3366) border-box', WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', opacity: 0.6 }} />
          <div style={{ flex: 1, height: 26, background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(10px)', borderRadius: 10, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4, position: 'relative', zIndex: 1 }}>
            <div style={{ width: 16, height: 6, background: `linear-gradient(135deg, ${m.accent}, #ff6b9d)`, borderRadius: 2, boxShadow: `0 0 6px ${m.accent}88` }} />
            <div style={{ display: 'flex', gap: 4, flex: 1, marginLeft: 6 }}>{['Inicio','Explorar','Ofertas'].map(l => <span key={l} style={{ fontSize: 5, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{l}</span>)}</div>
            <div style={{ display: 'flex', gap: 3 }}>{[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: `rgba(255,255,255,0.${7+i*0.1})` }} />)}</div>
          </div>
        </div>);
      };
      const MiniSplit = ({ m }: { m: typeof NAV_MODELS[0] }) => {
        const t = m.text === '#fff' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.3)';
        return (<div>
          <div style={{ height: 20, background: m.bgGradient || m.bg, backgroundSize: m.gradientAnimated ? '200% 200%' : 'auto', animation: m.gradientAnimated ? 'mlPreviewShimmer 3s ease infinite' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px' }}>
            <div style={{ width: 18, height: 5, background: t, borderRadius: 2 }} />
            <div style={{ display: 'flex', gap: 2 }}>{[0,1,2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: t }} />)}</div>
          </div>
          <div style={{ height: 14, background: m.catBarBg || '#f5f5f5', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 3 }}>
            <div style={{ flex: 1, height: 8, background: m.sBg, borderRadius: 2, opacity: .85 }} />
            <div style={{ width: 8, height: 8, background: m.sBtn, borderRadius: 2, opacity: .85 }} />
          </div>
        </div>);
      };
      const MiniGlassFloat = ({ m }: { m: typeof NAV_MODELS[0] }) => {
        return (<div style={{ height: 34, background: m.bgGradient || m.bg, backgroundSize: m.gradientAnimated ? '200% 200%' : 'auto', animation: m.gradientAnimated ? 'mlPreviewShimmer 3s ease infinite' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px 6px' }}>
          <div style={{ flex: 1, height: 24, background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)', borderRadius: 12, border: '1px solid rgba(167,139,250,0.2)', display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4, margin: '0 4px' }}>
            <div style={{ width: 14, height: 5, background: m.accent, borderRadius: 2, opacity: .8 }} />
            <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 10, marginLeft: 4 }} />
            <div style={{ display: 'flex', gap: 2 }}>{[0,1,2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: m.accent, opacity: .6 }} />)}</div>
          </div>
        </div>);
      };
      const MiniNebula = ({ m }: { m: typeof NAV_MODELS[0] }) => {
        return (<div style={{ height: 34, background: '#030014', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px 6px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', width: 40, height: 40, background: 'radial-gradient(circle, rgba(139,92,246,0.3), transparent 60%)', left: -10, top: -10, filter: 'blur(4px)' }} />
          <div style={{ flex: 1, height: 26, background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(10px)', borderRadius: 14, padding: '1px', backgroundImage: 'linear-gradient(135deg, rgba(139,92,246,0.5), rgba(56,189,248,0.3))', display: 'flex', zIndex: 1, margin: '0 4px' }}>
            <div style={{ flex: 1, background: '#090524', borderRadius: 13, display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4 }}>
              <div style={{ width: 14, height: 5, background: '#fff', borderRadius: 2, opacity: .9 }} />
              <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 10, marginLeft: 4, display: 'flex', alignItems: 'center', padding: '0 2px' }}>
                <div style={{ width: 4, height: 4, background: m.accent, borderRadius: 2 }} />
              </div>
              <div style={{ display: 'flex', gap: 2 }}>{[0,1,2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff', opacity: .7 }} />)}</div>
            </div>
          </div>
        </div>);
      };
      const MiniPreview = ({ m }: { m: typeof NAV_MODELS[0] }) => {
        if (m.layout === 'stacked') return <MiniStacked m={m} />;
        if (m.layout === 'centered') return <MiniCentered m={m} />;
        if (m.layout === 'minimal-fashion') return <MiniFashion m={m} />;
        if (m.layout === 'topbar') return <MiniTopbar m={m} />;
        if (m.layout === 'split') return <MiniSplit m={m} />;
        if (m.layout === 'glass-float') return <MiniGlassFloat m={m} />;
        if (m.layout === 'nebula-premium') return <MiniNebula m={m} />;
        return <MiniClassic m={m} />;
      };
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Modelos Preset</SH>
        <style>{`
          @keyframes mlPreviewShimmer { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        `}</style>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {NAV_MODELS.map(m => (
            <button key={m.id} onClick={() => applyModel(m)}
              style={{ padding: 0, border: `2px solid ${s.navModel === m.id ? '#5850ec' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', overflow: 'hidden', transition: 'all .15s', background: 'none' }}>
              <MiniPreview m={m} />
              <div style={{ padding: '3px 6px', background: s.navModel === m.id ? '#ede9fe' : '#fff', textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>{m.label}</div>
                <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.2 }}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>
        <SH>Degradado navbar (opcional)</SH>
        {(() => {
          const NB_GRADS = [
            { id:'sol',      l:'Sol Premium', g:'linear-gradient(135deg,#fff9c4 0%,#fff176 25%,#ffee58 50%,#fff176 75%,#fff9c4 100%)', preview:'linear-gradient(135deg,#fff9c4,#fff176,#ffee58)' },
            { id:'white',    l:'Blanco', g:'linear-gradient(135deg,#ffffff 0%,#f8fafc 35%,#eef2f7 65%,#ffffff 100%)', preview:'linear-gradient(135deg,#ffffff,#f8fafc,#e5e7eb)' },
            { id:'luxury-gold', l:'Oro Lujo', g:'linear-gradient(135deg,#bf953f 0%,#fcf6ba 25%,#b38728 50%,#fbf5b7 75%,#aa771c 100%)', preview:'linear-gradient(135deg,#bf953f,#fcf6ba,#aa771c)' },
            { id:'aurora',   l:'Aurora',   g:'linear-gradient(135deg,#6366f1,#a855f7,#e396bf,#6366f1)', preview:'linear-gradient(135deg,#6366f1,#a855f7,#e396bf)' },
            { id:'ocean',    l:'Océano',   g:'linear-gradient(135deg,#0ea5e9,#06b6d4,#0d9488,#0ea5e9)', preview:'linear-gradient(135deg,#0ea5e9,#06b6d4,#0d9488)' },
            { id:'dark',     l:'Oscuro',   g:'linear-gradient(135deg,#111827,#1f2937,#374151,#111827)', preview:'linear-gradient(135deg,#111827,#1f2937,#374151)' },
            { id:'flame',    l:'Llama',    g:'linear-gradient(135deg,#dc2626,#c0547a,#f59e0b,#dc2626)', preview:'linear-gradient(135deg,#dc2626,#c0547a,#f59e0b)' },
            { id:'lime',     l:'Lima',     g:'linear-gradient(135deg,#84cc16,#22c55e,#10b981,#84cc16)', preview:'linear-gradient(135deg,#84cc16,#22c55e,#10b981)' },
          ];
          const hasNbGrad = !!s.bgGradient;
          return (<>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
              {NB_GRADS.map(g => (
                <button key={g.id} onClick={() => onUpdate({ bgGradient: g.g, gradientAnimated: true })}
                  style={{ padding: 0, border: `2px solid ${s.bgGradient === g.g ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}>
                  <div style={{ height: 22, background: g.preview }} />
                  <div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgGradient === g.g ? '#ede9fe' : '#fff', color: '#374151' }}>{g.l}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => onUpdate({ bgGradient: undefined })}
                style={{ flex: 1, fontSize: 10, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 5, background: !hasNbGrad ? '#eef2ff' : '#fff', color: !hasNbGrad ? '#5850ec' : '#6b7280', cursor: 'pointer', fontWeight: 600 }}>
                ✕ Sin degradado
              </button>
              {hasNbGrad && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: '#374151', padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 5 }}>
                  <input type="checkbox" checked={s.gradientAnimated ?? true} onChange={e => onUpdate({ gradientAnimated: e.target.checked })} style={{ width: 13, height: 13, accentColor: '#5850ec' }} />
                  Animar
                </label>
              )}
            </div>
          </>);
        })()}
        <SH>Colores Principales</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ColorField label="Fondo navbar" value={s.bgColor || '#ffe600'} onChange={v => onUpdate({ bgColor: v })} />
          <ColorField label="Texto / iconos" value={s.textColor || '#333'} onChange={v => onUpdate({ textColor: v })} />
          <ColorField label="Color acento" value={s.accentColor || '#3483fa'} onChange={v => onUpdate({ accentColor: v })} />
          <ColorField label="Badge carrito" value={s.cartBadgeColor || '#3483fa'} onChange={v => onUpdate({ cartBadgeColor: v })} />
          <ColorField label="Hover items" value={s.itemHoverBg || '#fff'} onChange={v => onUpdate({ itemHoverBg: v })} />
          <ColorField label="Borde inferior" value={s.borderBottomColor || '#e6e6e6'} onChange={v => onUpdate({ borderBottomColor: v })} />
        </div>
        <SH>Barra de Búsqueda</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ColorField label="Fondo input" value={s.searchBgColor || '#fff'} onChange={v => onUpdate({ searchBgColor: v })} />
          <ColorField label="Fondo botón" value={s.searchBtnColor || '#fff'} onChange={v => onUpdate({ searchBtnColor: v })} />
          <ColorField label="Ícono botón" value={s.searchBtnTextColor || '#333'} onChange={v => onUpdate({ searchBtnTextColor: v })} />
        </div>
        <RangeField label="Radio búsqueda" value={s.searchRadius ?? 2} onChange={v => onUpdate({ searchRadius: v })} min={0} max={24} unit="px" />
        <FontBlock />
        <SH>Dimensiones</SH>
        <RangeField label="Altura navbar" value={s.navHeight ?? 64} onChange={v => onUpdate({ navHeight: v })} min={48} max={96} unit="px" />
        <RangeField label="Altura logo" value={s.logoSize ?? 34} onChange={v => onUpdate({ logoSize: v })} min={20} max={200} unit="px" />
        <SH>Opciones</SH>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: 'Logo centrado', key: 'logoPosition', checked: s.logoPosition === 'center', value: (v: boolean) => onUpdate({ logoPosition: v ? 'center' : 'left' }) },
            { label: 'Fijar barra arriba al hacer scroll', key: 'sticky', checked: s.sticky !== false, value: (v: boolean) => onUpdate({ sticky: v }) },
            { label: 'Borde inferior', key: 'borderBottom', checked: s.borderBottom === true, value: (v: boolean) => onUpdate({ borderBottom: v }) },
          ].map(opt => (
            <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
              <input type="checkbox" checked={opt.checked} onChange={e => opt.value(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>);
    }

    case 'cm_navbar': {
      type CmNavPreset = { id: string; label: string; desc: string; bg: string; sBg: string; sR: number; lH: number; slH: number; lC: string; aC: string; slC: string; bBg: string; bR: number; bT: string; bL: string; sS: boolean; lP: 'left'|'center'; sh: string; fS: number; bB: boolean; bCol: string };
      const CM_NAV: CmNavPreset[] = [
        { id: 'default',   label: 'Original',       desc: 'Pill blanca al hacer scroll',          bg: 'transparent',           sBg: 'rgba(255,255,255,0.95)', sR: 16, lH: 110, slH: 60, lC: '#fff',    aC: '#F97316', slC: '#374151', bBg: '#F97316', bR: 8,  bT: 'WhatsApp', bL: 'https://wa.me/56912345678', sS: false, lP: 'left',   sh: 'md', fS: 14, bB: false, bCol: 'transparent' },
        { id: 'squared',   label: 'Cuadrada',       desc: 'Barra recta sin bordes redondeados',   bg: 'transparent',           sBg: 'rgba(255,255,255,0.98)', sR: 0,  lH: 90,  slH: 50, lC: '#fff',    aC: '#ef4444', slC: '#1f2937', bBg: '#ef4444', bR: 0,  bT: 'Contactar', bL: '#contacto', sS: false, lP: 'left',   sh: 'sm', fS: 13, bB: true, bCol: '#e5e7eb' },
        { id: 'pill',      label: 'Píldora',        desc: 'Redondeada extrema tipo cápsula',       bg: 'transparent',           sBg: 'rgba(255,255,255,0.98)', sR: 50, lH: 80,  slH: 46, lC: '#fff',    aC: '#F97316', slC: '#374151', bBg: '#F97316', bR: 50, bT: 'WhatsApp', bL: 'https://wa.me/56912345678', sS: true, lP: 'left',   sh: 'lg', fS: 12, bB: false, bCol: 'transparent' },
        { id: 'dark',      label: 'Oscura',         desc: 'Barra negra sólida, links blancos',    bg: 'transparent',           sBg: 'rgba(17,17,17,0.97)',    sR: 12, lH: 100, slH: 55, lC: '#fff',    aC: '#F97316', slC: '#e5e7eb', bBg: '#F97316', bR: 8,  bT: 'WhatsApp', bL: 'https://wa.me/56912345678', sS: false, lP: 'left',   sh: 'lg', fS: 14, bB: false, bCol: 'transparent' },
        { id: 'centered',  label: 'Logo Centro',    desc: 'Logo centrado, links a los lados',     bg: 'transparent',           sBg: 'rgba(255,255,255,0.95)', sR: 16, lH: 120, slH: 65, lC: '#fff',    aC: '#F97316', slC: '#374151', bBg: '#F97316', bR: 8,  bT: 'WhatsApp', bL: 'https://wa.me/56912345678', sS: false, lP: 'center', sh: 'md', fS: 13, bB: false, bCol: 'transparent' },
        { id: 'glass',     label: 'Cristal',        desc: 'Glass blur desde inicio',               bg: 'rgba(255,255,255,0.15)', sBg: 'rgba(255,255,255,0.6)',   sR: 20, lH: 95,  slH: 52, lC: '#fff',    aC: '#fbbf24', slC: '#1f2937', bBg: '#fbbf24', bR: 12, bT: 'Escríbenos', bL: '#contacto', sS: true, lP: 'left',   sh: 'md', fS: 13, bB: false, bCol: 'transparent' },
        { id: 'gradient',  label: 'Degradado',      desc: 'Fondo degradado naranja-rojo',         bg: 'transparent',           sBg: 'linear-gradient(135deg,#F97316,#ef4444)', sR: 14, lH: 100, slH: 55, lC: '#fff', aC: '#fef3c7', slC: '#fff', bBg: '#fff', bR: 8, bT: 'Contacto', bL: '#contacto', sS: false, lP: 'left', sh: 'lg', fS: 14, bB: false, bCol: 'transparent' },
        { id: 'minimal',   label: 'Minimal',        desc: 'Ultra limpia, sin sombra, delgada',    bg: 'transparent',           sBg: 'rgba(255,255,255,0.98)', sR: 6,  lH: 70,  slH: 40, lC: '#fff',    aC: '#F97316', slC: '#6b7280', bBg: '#F97316', bR: 6,  bT: 'Contacto', bL: '#contacto', sS: false, lP: 'left', sh: 'none', fS: 12, bB: true, bCol: '#f0f0f0' },
      ];
      const applyCmNav = (m: CmNavPreset) => onUpdate({
        cmNavModel: m.id, cmNavBg: m.bg, cmNavScrolledBg: m.sBg, cmNavScrolledRadius: m.sR,
        cmNavLogoHeight: m.lH, cmNavScrolledLogoHeight: m.slH,
        cmNavLinkColor: m.lC, cmNavLinkActiveColor: m.aC, cmNavScrolledLinkColor: m.slC,
        cmNavBtnBg: m.bBg, cmNavBtnRadius: m.bR, cmNavBtnText: m.bT, cmNavBtnLink: m.bL,
        cmNavShowSearch: m.sS, cmNavLogoPosition: m.lP, cmNavShadow: m.sh as SectionSettings['cmNavShadow'],
        cmNavFontSize: m.fS, cmNavBorderBottom: m.bB, cmNavBorderColor: m.bCol,
      });
      /* Mini preview for each model */
      const MiniCmNav = ({ m }: { m: CmNavPreset }) => {
        const dark = m.sBg.includes('17,17,17') || m.sBg.includes('ef4444');
        const t = dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.3)';
        const isGrad = m.sBg.includes('gradient');
        const boxR = m.sR > 24 ? 14 : m.sR > 8 ? 6 : m.sR;
        return (<div style={{ height: 32, background: isGrad ? m.sBg : `linear-gradient(180deg, ${m.bg === 'transparent' ? 'rgba(40,40,40,0.7)' : m.bg} 0%, ${m.sBg} 60%)`, display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4, borderRadius: boxR, borderBottom: m.bB ? `2px solid ${m.bCol}` : 'none' }}>
          {m.lP === 'center' ? <>
            <div style={{ flex: 1, display: 'flex', gap: 2 }}>{[0,1].map(i => <div key={i} style={{ width: 10, height: 2.5, borderRadius: 2, background: t }} />)}</div>
            <div style={{ width: 18, height: 7, borderRadius: 2, background: t, opacity: .8 }} />
            <div style={{ flex: 1, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>{m.sS && <div style={{ width: 6, height: 6, borderRadius: '50%', border: `1px solid ${t}` }} />}<div style={{ width: 20, height: 8, borderRadius: m.bR > 20 ? 8 : m.bR / 3, background: m.bBg }} /></div>
          </> : <>
            <div style={{ width: 18, height: 7, borderRadius: 2, background: t, flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', gap: 2, justifyContent: 'center' }}>{[0,1,2].map(i => <div key={i} style={{ width: 10, height: 2.5, borderRadius: 2, background: t }} />)}</div>
            {m.sS && <div style={{ width: 6, height: 6, borderRadius: '50%', border: `1px solid ${t}`, flexShrink: 0 }} />}
            <div style={{ width: 20, height: 8, borderRadius: m.bR > 20 ? 8 : m.bR / 3, background: m.bBg, flexShrink: 0 }} />
          </>}
        </div>);
      };
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Modelos Preset</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {CM_NAV.map(m => (
            <button key={m.id} onClick={() => applyCmNav(m)}
              style={{ padding: 0, border: `2px solid ${s.cmNavModel === m.id ? '#F97316' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', overflow: 'hidden', background: 'none' }}>
              <MiniCmNav m={m} />
              <div style={{ padding: '3px 6px', background: s.cmNavModel === m.id ? '#fdf2f8' : '#fff', textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>{m.label}</div>
                <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.2 }}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <SH>Colores</SH>
        <ColorField label="Color links (transparente)" value={s.cmNavLinkColor || '#fff'} onChange={v => onUpdate({ cmNavLinkColor: v })} />
        <ColorField label="Color link activo" value={s.cmNavLinkActiveColor || '#F97316'} onChange={v => onUpdate({ cmNavLinkActiveColor: v })} />
        <ColorField label="Color links (scrolled)" value={s.cmNavScrolledLinkColor || '#374151'} onChange={v => onUpdate({ cmNavScrolledLinkColor: v })} />
        <ColorField label="Fondo scrolled" value={s.cmNavScrolledBg || 'rgba(255,255,255,0.95)'} onChange={v => onUpdate({ cmNavScrolledBg: v })} />

        <SH>Logo</SH>
        <RangeField label="Altura logo" value={s.cmNavLogoHeight ?? 110} onChange={v => onUpdate({ cmNavLogoHeight: v })} min={30} max={200} unit="px" />
        <RangeField label="Altura logo (scrolled)" value={s.cmNavScrolledLogoHeight ?? 60} onChange={v => onUpdate({ cmNavScrolledLogoHeight: v })} min={20} max={120} unit="px" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {(['left', 'center'] as const).map(p => (
            <button key={p} onClick={() => onUpdate({ cmNavLogoPosition: p })}
              style={{ padding: '6px 0', fontSize: 11, fontWeight: 600, border: `2px solid ${s.cmNavLogoPosition === p ? '#F97316' : '#e5e7eb'}`, borderRadius: 6, background: s.cmNavLogoPosition === p ? '#fdf2f8' : '#fff', cursor: 'pointer', color: '#374151' }}>
              {p === 'left' ? 'Izquierda' : 'Centro'}
            </button>
          ))}
        </div>

        <SH>Forma y Tamaño</SH>
        <RangeField label="Border radius (scrolled)" value={s.cmNavScrolledRadius ?? 16} onChange={v => onUpdate({ cmNavScrolledRadius: v })} min={0} max={50} unit="px" />
        <RangeField label="Tamaño fuente links" value={s.cmNavFontSize ?? 14} onChange={v => onUpdate({ cmNavFontSize: v })} min={10} max={20} unit="px" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
          {([['none','Sin'], ['sm','S'], ['md','M'], ['lg','XL']] as const).map(([v, l]) => (
            <button key={v} onClick={() => onUpdate({ cmNavShadow: v })}
              style={{ padding: '5px 0', fontSize: 10, fontWeight: 600, border: `1.5px solid ${s.cmNavShadow === v ? '#F97316' : '#e5e7eb'}`, borderRadius: 4, background: s.cmNavShadow === v ? '#fdf2f8' : '#fff', cursor: 'pointer', color: '#374151' }}>
              {l}
            </button>
          ))}
        </div>

        <SH>Botón CTA</SH>
        <Field icon={<Type size={13} />} label="Texto" value={s.cmNavBtnText || 'WhatsApp'} onChange={v => onUpdate({ cmNavBtnText: v })} placeholder="WhatsApp" />
        <Field icon={<Link size={13} />} label="Link" value={s.cmNavBtnLink || 'https://wa.me/56912345678'} onChange={v => onUpdate({ cmNavBtnLink: v })} placeholder="https://wa.me/..." />
        <ColorField label="Color fondo botón" value={s.cmNavBtnBg || '#F97316'} onChange={v => onUpdate({ cmNavBtnBg: v })} />
        <RangeField label="Redondez botón" value={s.cmNavBtnRadius ?? 8} onChange={v => onUpdate({ cmNavBtnRadius: v })} min={0} max={50} unit="px" />

        <SH>Opciones</SH>
        {[
          { label: 'Mostrar icono de búsqueda', key: 'cmNavShowSearch', val: s.cmNavShowSearch === true },
          { label: 'Borde inferior', key: 'cmNavBorderBottom', val: s.cmNavBorderBottom === true },
        ].map(opt => (
          <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
            <input type="checkbox" checked={opt.val} onChange={e => onUpdate({ [opt.key]: e.target.checked } as Partial<SectionSettings>)} style={{ width: 14, height: 14, accentColor: '#F97316' }} />
            {opt.label}
          </label>
        ))}
        {s.cmNavBorderBottom && <ColorField label="Color borde inferior" value={s.cmNavBorderColor || '#e5e7eb'} onChange={v => onUpdate({ cmNavBorderColor: v })} />}
      </div>);
    }

    case 'cm_hero': {
      type CmHeroPreset = { id: string; label: string; desc: string; bg: string; text: string; ov: number; h: number; tS: number; bBg: string; bTxt: string; bR: number; align: 'left'|'center'|'right' };
      const CM_HERO: CmHeroPreset[] = [
        { id: 'default',   label: 'Original',     desc: 'Imagen fondo + overlay oscuro',       bg: '#111827', text: '#ffffff', ov: 0.55, h: 700, tS: 48, bBg: '#ef4444', bTxt: '#ffffff', bR: 12, align: 'center' },
        { id: 'bright',    label: 'Luminoso',      desc: 'Overlay claro, texto oscuro',          bg: '#f8fafc', text: '#111827', ov: 0.25, h: 650, tS: 52, bBg: '#F97316', bTxt: '#ffffff', bR: 8,  align: 'center' },
        { id: 'left',      label: 'Alineado Izq.', desc: 'Texto a la izquierda, más alto',       bg: '#111827', text: '#ffffff', ov: 0.6,  h: 800, tS: 56, bBg: '#ef4444', bTxt: '#ffffff', bR: 8,  align: 'left' },
        { id: 'compact',   label: 'Compacto',      desc: 'Más bajo, ideal con más secciones',    bg: '#111827', text: '#ffffff', ov: 0.5,  h: 500, tS: 40, bBg: '#F97316', bTxt: '#ffffff', bR: 50, align: 'center' },
        { id: 'gradient',  label: 'Degradado',     desc: 'Overlay degradado naranja',            bg: '#7c2d12', text: '#ffffff', ov: 0.7,  h: 700, tS: 48, bBg: '#ffffff', bTxt: '#F97316', bR: 8,  align: 'center' },
        { id: 'minimal',   label: 'Minimal',       desc: 'Sin overlay, texto con sombra',        bg: 'transparent', text: '#ffffff', ov: 0.1, h: 600, tS: 44, bBg: '#ef4444', bTxt: '#ffffff', bR: 6, align: 'left' },
      ];
      const applyCmHero = (m: CmHeroPreset) => onUpdate({
        cmHeroModel: m.id, cmHeroBgColor: m.bg, cmHeroTextColor: m.text, cmHeroOverlayOpacity: m.ov,
        cmHeroHeight: m.h, cmHeroTitleSize: m.tS, cmHeroBtnBg: m.bBg, cmHeroBtnText: m.bTxt,
        cmHeroBtnRadius: m.bR, cmHeroAlign: m.align,
      });
      const MiniHero = ({ m }: { m: CmHeroPreset }) => {
        const isDark = m.text === '#ffffff';
        const tC = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)';
        return (<div style={{ height: 40, background: isDark ? `linear-gradient(135deg, rgba(17,24,39,${m.ov}), rgba(17,24,39,${Math.min(m.ov+0.2,1)}))` : `linear-gradient(135deg, rgba(248,250,252,${m.ov}), rgba(241,245,249,${m.ov+0.1}))`, display: 'flex', flexDirection: 'column', alignItems: m.align === 'left' ? 'flex-start' : 'center', justifyContent: 'center', padding: '0 8px', gap: 3, borderRadius: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: tC }} />
          <div style={{ width: 24, height: 3, borderRadius: 2, background: tC, opacity: 0.5 }} />
          <div style={{ width: 22, height: 6, borderRadius: m.bR > 20 ? 4 : m.bR / 4, background: m.bBg, marginTop: 1 }} />
        </div>);
      };
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Modelos Preset</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {CM_HERO.map(m => (
            <button key={m.id} onClick={() => applyCmHero(m)}
              style={{ padding: 0, border: `2px solid ${s.cmHeroModel === m.id ? '#F97316' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', overflow: 'hidden', background: 'none' }}>
              <MiniHero m={m} />
              <div style={{ padding: '3px 6px', background: s.cmHeroModel === m.id ? '#fdf2f8' : '#fff', textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>{m.label}</div>
                <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.2 }}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <SH>Colores</SH>
        <ColorField label="Color de texto" value={s.cmHeroTextColor || '#ffffff'} onChange={v => onUpdate({ cmHeroTextColor: v })} />
        <ColorField label="Color fondo overlay" value={s.cmHeroBgColor || '#111827'} onChange={v => onUpdate({ cmHeroBgColor: v })} />
        <RangeField label="Opacidad overlay" value={s.cmHeroOverlayOpacity ?? 0.55} onChange={v => onUpdate({ cmHeroOverlayOpacity: v })} min={0} max={1} unit="" />

        <SH>Dimensiones</SH>
        <RangeField label="Altura hero" value={s.cmHeroHeight ?? 700} onChange={v => onUpdate({ cmHeroHeight: v })} min={300} max={1000} unit="px" />
        <RangeField label="Tamaño título" value={s.cmHeroTitleSize ?? 48} onChange={v => onUpdate({ cmHeroTitleSize: v })} min={24} max={80} unit="px" />

        <SH>Alineación</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {(['left', 'center', 'right'] as const).map(a => (
            <button key={a} onClick={() => onUpdate({ cmHeroAlign: a })}
              style={{ padding: '6px 0', fontSize: 11, fontWeight: 600, border: `2px solid ${s.cmHeroAlign === a ? '#F97316' : '#e5e7eb'}`, borderRadius: 6, background: s.cmHeroAlign === a ? '#fdf2f8' : '#fff', cursor: 'pointer', color: '#374151' }}>
              {a === 'left' ? 'Izquierda' : a === 'center' ? 'Centro' : 'Derecha'}
            </button>
          ))}
        </div>

        <SH>Botón</SH>
        <ColorField label="Fondo botón" value={s.cmHeroBtnBg || '#ef4444'} onChange={v => onUpdate({ cmHeroBtnBg: v })} />
        <ColorField label="Texto botón" value={s.cmHeroBtnText || '#ffffff'} onChange={v => onUpdate({ cmHeroBtnText: v })} />
        <RangeField label="Redondez botón" value={s.cmHeroBtnRadius ?? 12} onChange={v => onUpdate({ cmHeroBtnRadius: v })} min={0} max={50} unit="px" />
      </div>);
    }

    case 'footer': {
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ColorsBlock />
        <TypographyBlock />
        <SpacingBlock />
      </div>);
    }

    case 'cm_footer': {
      type CmFooterPreset = { id: string; label: string; desc: string; bg: string; text: string; accent: string; lH: number; bT: boolean; bCol: string };
      const CM_FOOTER: CmFooterPreset[] = [
        { id: 'default', label: 'Original',   desc: 'Oscuro con acento naranja',    bg: '#111827', text: '#d1d5db', accent: '#F97316', lH: 50, bT: false, bCol: 'transparent' },
        { id: 'light',   label: 'Claro',       desc: 'Fondo blanco, texto oscuro',    bg: '#ffffff', text: '#6b7280', accent: '#F97316', lH: 50, bT: true,  bCol: '#e5e7eb' },
        { id: 'dark',    label: 'Negro',       desc: 'Fondo negro puro',              bg: '#000000', text: '#9ca3af', accent: '#ef4444', lH: 45, bT: false, bCol: 'transparent' },
        { id: 'brand',   label: 'Marca',       desc: 'Fondo rojo con texto blanco',   bg: '#991b1b', text: '#fecaca', accent: '#fbbf24', lH: 50, bT: false, bCol: 'transparent' },
      ];
      const applyCmFtr = (m: CmFooterPreset) => onUpdate({
        cmFooterBg: m.bg, cmFooterTextColor: m.text, cmFooterAccentColor: m.accent,
        cmFooterLogoHeight: m.lH, cmFooterBorderTop: m.bT, cmFooterBorderColor: m.bCol,
      });
      const MiniFtr = ({ m }: { m: CmFooterPreset }) => {
        const t = m.text;
        return (<div style={{ height: 28, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', borderTop: m.bT ? `2px solid ${m.bCol}` : 'none', borderRadius: '0 0 4px 4px' }}>
          <div style={{ display: 'flex', gap: 3 }}>{[0,1,2].map(i => <div key={i} style={{ width: 10, height: 2, borderRadius: 1, background: t, opacity: .5 }} />)}</div>
          <div style={{ width: 16, height: 5, borderRadius: 2, background: m.accent, opacity: .8 }} />
        </div>);
      };
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Modelos Preset</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {CM_FOOTER.map(m => (
            <button key={m.id} onClick={() => applyCmFtr(m)}
              style={{ padding: 0, border: `2px solid ${s.cmFooterBg === m.bg ? '#F97316' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', overflow: 'hidden', background: 'none' }}>
              <MiniFtr m={m} />
              <div style={{ padding: '3px 6px', background: s.cmFooterBg === m.bg ? '#fdf2f8' : '#fff', textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>{m.label}</div>
                <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.2 }}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <SH>Colores</SH>
        <ColorField label="Fondo" value={s.cmFooterBg || '#111827'} onChange={v => onUpdate({ cmFooterBg: v })} />
        <ColorField label="Texto" value={s.cmFooterTextColor || '#d1d5db'} onChange={v => onUpdate({ cmFooterTextColor: v })} />
        <ColorField label="Acento (links)" value={s.cmFooterAccentColor || '#F97316'} onChange={v => onUpdate({ cmFooterAccentColor: v })} />

        <SH>Logo</SH>
        <RangeField label="Altura logo" value={s.cmFooterLogoHeight ?? 50} onChange={v => onUpdate({ cmFooterLogoHeight: v })} min={20} max={120} unit="px" />

        <SH>Opciones</SH>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" checked={s.cmFooterBorderTop === true} onChange={e => onUpdate({ cmFooterBorderTop: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#F97316' }} />
          Borde superior
        </label>
        {s.cmFooterBorderTop && <ColorField label="Color borde" value={s.cmFooterBorderColor || '#e5e7eb'} onChange={v => onUpdate({ cmFooterBorderColor: v })} />}
      </div>);
    }

    case 'announcement_bar': {
      const ABAR_GRADS = [
        { id:'original',  l:'Original',    g:'',                                                                    tc:'',  preview:'linear-gradient(90deg,#f5f5f5,#e8e8e8,#f5f5f5)' },
        { id:'noir',      l:'Noir',        g:'linear-gradient(90deg,#0a0a0a,#1a1a1a,#0a0a0a)',                     tc:'#ffffff',  preview:'linear-gradient(90deg,#0a0a0a,#1a1a1a,#0a0a0a)' },
        { id:'silver',    l:'Plata',       g:'linear-gradient(90deg,#e5e5e5,#f5f5f5,#e5e5e5)',                     tc:'#374151',  preview:'linear-gradient(90deg,#e5e5e5,#f5f5f5,#e5e5e5)' },
        { id:'charcoal',  l:'Carbón',      g:'linear-gradient(90deg,#2d2d2d,#3d3d3d,#2d2d2d)',                     tc:'#f9fafb',  preview:'linear-gradient(90deg,#2d2d2d,#3d3d3d,#2d2d2d)' },
        { id:'ivory',     l:'Marfil',      g:'linear-gradient(90deg,#fffff0,#faf8f0,#fffff0)',                     tc:'#78350f',  preview:'linear-gradient(90deg,#fffff0,#faf8f0,#fffff0)' },
        { id:'rose',      l:'Rosa',        g:'linear-gradient(90deg,#fff1f2,#ffe4e6,#fff1f2)',                     tc:'#9f1239',  preview:'linear-gradient(90deg,#fff1f2,#ffe4e6,#fff1f2)' },
        { id:'sage',      l:'Salvia',      g:'linear-gradient(90deg,#f0fdf4,#dcfce7,#f0fdf4)',                     tc:'#14532d',  preview:'linear-gradient(90deg,#f0fdf4,#dcfce7,#f0fdf4)' },
        { id:'sand',      l:'Arena',       g:'linear-gradient(90deg,#fef3c7,#fde68a,#fef3c7)',                     tc:'#78350f',  preview:'linear-gradient(90deg,#fef3c7,#fde68a,#fef3c7)' },
        { id:'slate',     l:'Pizarra',     g:'linear-gradient(90deg,#1e293b,#334155,#1e293b)',                     tc:'#e2e8f0',  preview:'linear-gradient(90deg,#1e293b,#334155,#1e293b)' },
        { id:'obsidian',  l:'Obsidiana',   g:'linear-gradient(90deg,#18181b,#27272a,#18181b)',                     tc:'#fafafa',  preview:'linear-gradient(90deg,#18181b,#27272a,#18181b)' },
        { id:'cream',     l:'Crema',       g:'linear-gradient(90deg,#fefce8,#fef9c3,#fefce8)',                     tc:'#713f12',  preview:'linear-gradient(90deg,#fefce8,#fef9c3,#fefce8)' },
        { id:'mist',      l:'Neblina',     g:'linear-gradient(90deg,#f8fafc,#e2e8f0,#f8fafc)',                     tc:'#334155',  preview:'linear-gradient(90deg,#f8fafc,#e2e8f0,#f8fafc)' },
        { id:'white',     l:'Blanco',      g:'linear-gradient(90deg,#ffffff,#f8fafc,#ffffff)',                     tc:'#111827',  preview:'linear-gradient(90deg,#ffffff,#f8fafc,#ffffff)' },
        // ── Degradados vibrantes ──
        { id:'sunset',    l:'Atardecer',   g:'linear-gradient(90deg,#ffecd2,#fcb69f,#ff9a9e)',                     tc:'#7c2d12',  preview:'linear-gradient(90deg,#ffecd2,#fcb69f,#ff9a9e)' },
        { id:'ocean',     l:'Océano',      g:'linear-gradient(90deg,#a1c4fd,#c2e9fb,#e0c3fc)',                     tc:'#1e3a5f',  preview:'linear-gradient(90deg,#a1c4fd,#c2e9fb,#e0c3fc)' },
        { id:'forest',    l:'Bosque',      g:'linear-gradient(90deg,#d4fc79,#96e6a1,#a8e6cf)',                     tc:'#14532d',  preview:'linear-gradient(90deg,#d4fc79,#96e6a1,#a8e6cf)' },
        { id:'lavender',  l:'Lavanda',     g:'linear-gradient(90deg,#e0c3fc,#c2a5f9,#b794f4)',                     tc:'#ffffff',  preview:'linear-gradient(90deg,#e0c3fc,#c2a5f9,#b794f4)' },
        { id:'peach',     l:'Durazno',     g:'linear-gradient(90deg,#ffd89b,#f7b733,#fc4a1a)',                     tc:'#ffffff',  preview:'linear-gradient(90deg,#ffd89b,#f7b733,#fc4a1a)' },
        { id:'mint',      l:'Menta',       g:'linear-gradient(90deg,#a8e6cf,#dcedc1,#c8e6c9)',                     tc:'#14532d',  preview:'linear-gradient(90deg,#a8e6cf,#dcedc1,#c8e6c9)' },
        { id:'cherry',    l:'Cereza',      g:'linear-gradient(90deg,#f9d5e5,#eeac99,#e06377)',                     tc:'#ffffff',  preview:'linear-gradient(90deg,#f9d5e5,#eeac99,#e06377)' },
        { id:'twilight',  l:'Crepúsculo',  g:'linear-gradient(90deg,#2c3e50,#3498db,#8e44ad)',                     tc:'#ffffff',  preview:'linear-gradient(90deg,#2c3e50,#3498db,#8e44ad)' },
        { id:'golden',    l:'Dorado',      g:'linear-gradient(90deg,#f5af19,#f12711,#f5af19)',                     tc:'#ffffff',  preview:'linear-gradient(90deg,#f5af19,#f12711,#f5af19)' },
        { id:'coral',     l:'Coral',       g:'linear-gradient(90deg,#ff9a9e,#fecfef,#fdfcfb)',                     tc:'#881337',  preview:'linear-gradient(90deg,#ff9a9e,#fecfef,#fdfcfb)' },
        { id:'sky',       l:'Cielo',       g:'linear-gradient(90deg,#89f7fe,#66a6ff,#c2e9fb)',                     tc:'#1e3a5f',  preview:'linear-gradient(90deg,#89f7fe,#66a6ff,#c2e9fb)' },
        { id:'grape',     l:'Uva',         g:'linear-gradient(90deg,#e8d5b7,#c9a7eb,#a18cd1)',                     tc:'#ffffff',  preview:'linear-gradient(90deg,#e8d5b7,#c9a7eb,#a18cd1)' },
        { id:'neon',      l:'Neón',        g:'linear-gradient(90deg,#f093fb,#f5576c,#4facfe)',                     tc:'#ffffff',  preview:'linear-gradient(90deg,#f093fb,#f5576c,#4facfe)' },
        { id:'blush',     l:'Rubor',       g:'linear-gradient(90deg,#fbc2eb,#a6c1ee,#fbc2eb)',                     tc:'#1e3a5f',  preview:'linear-gradient(90deg,#fbc2eb,#a6c1ee,#fbc2eb)' },
        { id:'emerald',   l:'Esmeralda',   g:'linear-gradient(90deg,#11998e,#38ef7d,#11998e)',                     tc:'#ffffff',  preview:'linear-gradient(90deg,#11998e,#38ef7d,#11998e)' },
        { id:'midnight',  l:'Medianoche',  g:'linear-gradient(90deg,#0f0c29,#302b63,#24243e)',                     tc:'#ffffff',  preview:'linear-gradient(90deg,#0f0c29,#302b63,#24243e)' },
        { id:'flamingo',  l:'Flamenco',    g:'linear-gradient(90deg,#f9d423,#ff4e50,#f9d423)',                     tc:'#ffffff',  preview:'linear-gradient(90deg,#f9d423,#ff4e50,#f9d423)' },
        { id:'arctic',    l:'Ártico',      g:'linear-gradient(90deg,#e0eafc,#cfdef3,#e0eafc)',                     tc:'#1e3a5f',  preview:'linear-gradient(90deg,#e0eafc,#cfdef3,#e0eafc)' },
        { id:'rosegold',  l:'Rosa Oro',    g:'linear-gradient(90deg,#f9d5e5,#f7cac9,#f5b7b1)',                     tc:'#881337',  preview:'linear-gradient(90deg,#f9d5e5,#f7cac9,#f5b7b1)' },
        // ── Bicolor ──
        { id:'bw',        l:'Blanco/Negro', g:'linear-gradient(90deg,#ffffff,#111111)',                            tc:'#111111',  preview:'linear-gradient(90deg,#ffffff,#111111)' },
        { id:'wb',        l:'Negro/Blanco', g:'linear-gradient(90deg,#111111,#ffffff)',                            tc:'#ffffff',  preview:'linear-gradient(90deg,#111111,#ffffff)' },
        { id:'pinkwhite', l:'Rosa/Blanco',  g:'linear-gradient(90deg,#e396bf,#ffffff)',                           tc:'#831843',  preview:'linear-gradient(90deg,#e396bf,#ffffff)' },
        { id:'purpleorange', l:'Morado/Naranja', g:'linear-gradient(90deg,#a855f7,#f97316)',                     tc:'#ffffff',  preview:'linear-gradient(90deg,#a855f7,#f97316)' },
        { id:'bluepink',  l:'Azul/Rosa',   g:'linear-gradient(90deg,#3b82f6,#e396bf)',                           tc:'#ffffff',  preview:'linear-gradient(90deg,#3b82f6,#e396bf)' },
        { id:'greenwhite', l:'Verde/Blanco', g:'linear-gradient(90deg,#22c55e,#ffffff)',                          tc:'#14532d',  preview:'linear-gradient(90deg,#22c55e,#ffffff)' },
      ];
      const hasGrad = !!s.bgGradient;
      const isOriginal = !s.bgGradient && !s.bgColor && !s.textColor && !s._useOriginal;
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Estilo base</SH>
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={() => onUpdate({ _useOriginal: undefined, bgGradient: undefined, bgColor: undefined, textColor: undefined, gradientAnimated: undefined, textSize: undefined, textGradientStyle: undefined, textGradientAnimated: undefined, textHoverEffect: undefined })}
            style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 5, border: `2px solid ${isOriginal ? '#5850ec' : '#e5e7eb'}`, background: isOriginal ? '#eef2ff' : '#fff', color: isOriginal ? '#5850ec' : '#374151', cursor: 'pointer' }}>
            🎨 Diseño original del tema
          </button>
        </div>
        <SH>Degradados</SH>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
          {ABAR_GRADS.map(g => (
            <button key={g.id} onClick={() => onUpdate({ bgGradient: g.g, gradientAnimated: true, ...(g.tc ? { textColor: g.tc } : { textColor: undefined }) })}
              style={{ padding: 0, border: `2px solid ${s.bgGradient === g.g ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}>
              <div style={{ height: 22, background: g.preview }} />
              <div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgGradient === g.g ? '#ede9fe' : '#fff', color: '#374151' }}>{g.l}</div>
            </button>
          ))}
        </div>
        <button onClick={() => onUpdate({ bgGradient: undefined })}
          style={{ fontSize: 10, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 5, background: !hasGrad ? '#eef2ff' : '#fff', color: !hasGrad ? '#5850ec' : '#6b7280', cursor: 'pointer', fontWeight: 600 }}>
            Usar color sólido
        </button>
        {hasGrad && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
            <input type="checkbox" checked={s.gradientAnimated ?? true} onChange={e => onUpdate({ gradientAnimated: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
            Animar degradado (flujo suave)
          </label>
        )}
        <SH>Color sólido {hasGrad ? '(ignorado con degradado)' : ''}</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ColorField label="Fondo" value={s.bgColor || '#6366f1'} onChange={v => onUpdate({ bgColor: v })} />
          <ColorField label="Texto" value={s.textColor || '#fff'} onChange={v => onUpdate({ textColor: v })} />
        </div>
        <SH>Degradado de texto</SH>
        {(() => {
          const TXT_GRADS = gradientTemplates.map(t => ({ id: t.id, l: t.label, g: t.gradient, preview: t.preview }));
          const hasTG = !!s.textGradientStyle;
          return (<>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {TXT_GRADS.map(tg => {
                const isSelected = s.textGradientStyle === tg.g;
                return (
                  <button key={tg.id} onClick={() => onUpdate({ textGradientStyle: tg.g, textGradientAnimated: true })}
                    style={{ 
                      padding: 0, 
                      border: isSelected ? '2px solid #6366f1' : '2px solid #e5e7eb',
                      borderRadius: 12, 
                      cursor: 'pointer', 
                      overflow: 'hidden', 
                      background: '#fff',
                      boxShadow: isSelected ? '0 4px 12px rgba(99,102,241,0.25)' : '0 1px 3px rgba(0,0,0,0.1)',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    <div style={{ 
                      height: 32, 
                      backgroundImage: `linear-gradient(90deg,${tg.preview[0]},${tg.preview[1]},${tg.preview[2]})`,
                      position: 'relative',
                    }}>
                      {isSelected && (
                        <div style={{ 
                          position: 'absolute', 
                          inset: 0, 
                          background: 'linear-gradient(135deg,rgba(255,255,255,0.3),transparent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: 14, color: '#fff', fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{'>'}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ 
                      fontSize: 10, 
                      padding: '6px 8px', 
                      fontWeight: 600, 
                      background: isSelected ? '#eef2ff' : '#fff', 
                      color: isSelected ? '#4f46e5' : '#374151', 
                      textAlign: 'center',
                      borderTop: '1px solid #f0f0f0',
                    }}>{tg.l}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => onUpdate({ textGradientStyle: undefined })}
              style={{ fontSize: 10, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 5, background: !hasTG ? '#eef2ff' : '#fff', color: !hasTG ? '#5850ec' : '#6b7280', cursor: 'pointer', fontWeight: 600 }}>
                Sin degradado en texto
            </button>
            {hasTG && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
                <input type="checkbox" checked={s.textGradientAnimated ?? true} onChange={e => onUpdate({ textGradientAnimated: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
                Animar degradado de texto
              </label>
            )}
          </>);
        })()}
        <SH>Efecto al pasar el mouse</SH>
        {(() => {
          const HOVER_FX = [
            { id:'none',   l:'Ninguno',   icon:'' },
            { id:'fall',   l:'Caída',     icon:'' },
            { id:'bounce', l:'Rebote',    icon:'' },
            { id:'wave',   l:'Ola',       icon:'' },
            { id:'shake',  l:'Vibración', icon:':' },
          ];
          return (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {HOVER_FX.map(fx => (
                <button key={fx.id} onClick={() => onUpdate({ textHoverEffect: fx.id })}
                  style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 5, border: `2px solid ${(s.textHoverEffect||'none') === fx.id ? '#5850ec' : '#e5e7eb'}`, background: (s.textHoverEffect||'none') === fx.id ? '#eef2ff' : '#fff', color: (s.textHoverEffect||'none') === fx.id ? '#5850ec' : '#374151', cursor: 'pointer' }}>
                  {fx.icon} {fx.l}
                </button>
              ))}
            </div>
          );
        })()}
        <RangeField label="Padding" value={s.padding ?? 4} onChange={v => onUpdate({ padding: v })} min={0} max={60} unit="px" />
        <FontBlock />
      </div>);
    }

    case 'live_banner': {
      const LB_GRADS = [
        { id:'white',    l:'Blanco',    g:'linear-gradient(90deg,#ffffff,#f8fafc,#eef2f7,#ffffff)', gI:'linear-gradient(90deg,#f3f4f6,#e5e7eb,#d1d5db,#f3f4f6)', preview:'linear-gradient(90deg,#ffffff,#f8fafc,#e5e7eb)' },
        { id:'fire',     l:'Fuego',     g:'linear-gradient(90deg,#dc2626,#c0547a,#fbbf24,#dc2626)', gI:'linear-gradient(90deg,#f87171,#fb923c,#fbbf24,#f87171)', preview:'linear-gradient(90deg,#dc2626,#c0547a,#fbbf24)' },
        { id:'aurora',   l:'Aurora',    g:'linear-gradient(90deg,#6366f1,#a855f7,#e396bf,#6366f1)', gI:'linear-gradient(90deg,#8b5cf6,#a855f7,#e396bf,#8b5cf6)', preview:'linear-gradient(90deg,#6366f1,#a855f7,#e396bf)' },
        { id:'ocean',    l:'Océano',    g:'linear-gradient(90deg,#0ea5e9,#06b6d4,#0d9488,#0ea5e9)', gI:'linear-gradient(90deg,#0ea5e9,#06b6d4,#14b8a6,#0ea5e9)', preview:'linear-gradient(90deg,#0ea5e9,#06b6d4,#0d9488)' },
        { id:'emerald',  l:'Esmeralda', g:'linear-gradient(90deg,#059669,#10b981,#34d399,#059669)', gI:'linear-gradient(90deg,#10b981,#34d399,#6ee7b7,#10b981)', preview:'linear-gradient(90deg,#059669,#10b981,#34d399)' },
        { id:'neon',     l:'Neón',      g:'linear-gradient(90deg,#7c3aed,#2563eb,#0ea5e9,#7c3aed)', gI:'linear-gradient(90deg,#7c3aed,#2563eb,#0ea5e9,#7c3aed)', preview:'linear-gradient(90deg,#7c3aed,#2563eb,#0ea5e9)' },
        { id:'golden',   l:'Dorado',    g:'linear-gradient(90deg,#d97706,#f59e0b,#fbbf24,#d97706)', gI:'linear-gradient(90deg,#f59e0b,#fbbf24,#fcd34d,#f59e0b)', preview:'linear-gradient(90deg,#d97706,#f59e0b,#fbbf24)' },
      ];
      const hasGrad = !!s.bgGradient;
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Degradados animados</SH>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
          {LB_GRADS.map(g => (
            <button key={g.id} onClick={() => onUpdate({ bgGradient: g.g, bgGradientIdle: g.gI, gradientAnimated: true })}
              style={{ padding: 0, border: `2px solid ${s.bgGradient === g.g ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}>
              <div style={{ height: 22, background: g.preview }} />
              <div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgGradient === g.g ? '#ede9fe' : '#fff', color: '#374151' }}>{g.l}</div>
            </button>
          ))}
        </div>
        <button onClick={() => onUpdate({ bgGradient: undefined, bgGradientIdle: undefined })}
          style={{ fontSize: 10, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 5, background: !hasGrad ? '#eef2ff' : '#fff', color: !hasGrad ? '#5850ec' : '#6b7280', cursor: 'pointer', fontWeight: 600 }}>
            Usar color sólido
        </button>
        {hasGrad && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
            <input type="checkbox" checked={s.gradientAnimated ?? true} onChange={e => onUpdate({ gradientAnimated: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
            Animar degradado (flujo suave)
          </label>
        )}
        <SH>Color sólido {hasGrad ? '(ignorado con degradado)' : ''}</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ColorField label="Fondo en vivo" value={s.bgColor || '#dc2626'} onChange={v => onUpdate({ bgColor: v })} />
          <ColorField label="Fondo inactivo" value={s.bgColorIdle || '#374151'} onChange={v => onUpdate({ bgColorIdle: v })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ColorField label="Texto" value={s.textColor || '#fff'} onChange={v => onUpdate({ textColor: v })} />
          <ColorField label="Acento" value={s.accentColor || '#fbbf24'} onChange={v => onUpdate({ accentColor: v })} />
        </div>
        <SH>Efectos</SH>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" checked={s.showBadge ?? true} onChange={e => onUpdate({ showBadge: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
          Mostrar badge (EN VIVO / PRÓXIMAMENTE)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" checked={s.pulseAnimation ?? true} onChange={e => onUpdate({ pulseAnimation: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
          Animación pulso (solo en vivo)
        </label>
        <RangeField label="Padding" value={s.padding ?? 10} onChange={v => onUpdate({ padding: v })} min={6} max={20} unit="px" />
        <RangeField label="Radio" value={s.borderRadius ?? 0} onChange={v => onUpdate({ borderRadius: v })} min={0} max={12} unit="px" />
        <FontBlock />
      </div>);
    }

    case 'hero_carousel':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Carrusel</SH>
        <RangeField label="Altura máx." value={s.height ?? 340} onChange={v => onUpdate({ height: v })} min={200} max={600} unit="px" />
        <RangeField label="Radio de borde" value={s.borderRadius ?? 0} onChange={v => onUpdate({ borderRadius: v })} min={0} max={24} unit="px" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" checked={s.autoplay ?? true} onChange={e => onUpdate({ autoplay: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
          Autoplay
        </label>
        <RangeField label="Velocidad (seg)" value={s.autoplaySpeed ?? 5} onChange={v => onUpdate({ autoplaySpeed: v })} min={2} max={15} unit="s" />
        <SH>Degradado inferior</SH>
        <ColorField label="Color degradado" value={s.bgColor || ''} onChange={v => onUpdate({ bgColor: v })} />
        <FontBlock />
      </div>);

    case 'tpl1_coupon_banner':
    case 'coupon_banner': {
      type CouponLayoutId = NonNullable<SectionSettings['couponLayout']>;
      const P: { id: string; l: string; layout: CouponLayoutId; bg: string; tx: string; ac: string; r: number; pd: number; sh: 'none'|'sm'|'md'|'lg'; previewHint: 'split'|'noir'|'ticket'|'magazine'|'stamp'|'classic' }[] = [
        // /  5 layouts B/N únicos (cada uno cambia diseño completo) ) 
        { id: 'yaxsell-split',  l: 'Yaxsell Split',  layout: 'yaxsell-split',  bg: '', tx: '#000', ac: '#000', r: 18, pd: 24, sh: 'lg', previewHint: 'split' },
        { id: 'noir-premium',   l: 'Noir Premium',   layout: 'noir-premium',   bg: '', tx: '#fff', ac: '#d4a853', r: 16, pd: 22, sh: 'lg', previewHint: 'noir' },
        { id: 'mono-ticket',    l: 'Mono Ticket',    layout: 'mono-ticket',    bg: '', tx: '#000', ac: '#000', r: 14, pd: 22, sh: 'lg', previewHint: 'ticket' },
        { id: 'mono-magazine',  l: 'Editorial',      layout: 'mono-magazine',  bg: '', tx: '#000', ac: '#000', r: 12, pd: 22, sh: 'lg', previewHint: 'magazine' },
        { id: 'mono-stamp',     l: 'Sello Postal',   layout: 'mono-stamp',     bg: '', tx: '#000', ac: '#000', r: 10, pd: 20, sh: 'md', previewHint: 'stamp' },
        // /  Classic (layout original) con paletas de color r 
        { id: 'classic-bn',   l: 'B/N Negro',   layout: 'classic', bg: '#0a0a0a', tx: '#ffffff', ac: '#ffffff', r: 16, pd: 22, sh: 'lg', previewHint: 'classic' },
        { id: 'classic-nb',  l: 'B/N Blanco',   layout: 'classic', bg: '#ffffff', tx: '#111111', ac: '#111111', r: 16, pd: 22, sh: 'lg', previewHint: 'classic' },
        { id: 'aurora',    l: 'Aurora',    layout: 'classic', bg: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #e396bf 100%)', tx: '#fff', ac: '#fbbf24', r: 16, pd: 20, sh: 'lg', previewHint: 'classic' },
        { id: 'urgent',    l: 'Urgente',   layout: 'classic', bg: 'linear-gradient(135deg, #dc2626, #f97316)', tx: '#fff', ac: '#fbbf24', r: 14, pd: 20, sh: 'lg', previewHint: 'classic' },
        { id: 'neon',      l: 'Neón',      layout: 'classic', bg: 'linear-gradient(135deg, #7c3aed, #e396bf)', tx: '#fff', ac: '#34d399', r: 20, pd: 22, sh: 'lg', previewHint: 'classic' },
        { id: 'nature',    l: 'Natural',   layout: 'classic', bg: 'linear-gradient(135deg, #059669, #10b981)', tx: '#fff', ac: '#fef3c7', r: 14, pd: 20, sh: 'md', previewHint: 'classic' },
        { id: 'ocean',     l: 'Oceánico',  layout: 'classic', bg: 'linear-gradient(135deg, #0369a1, #0891b2)', tx: '#fff', ac: '#fbbf24', r: 16, pd: 20, sh: 'lg', previewHint: 'classic' },
        { id: 'warm',      l: 'Cálido',    layout: 'classic', bg: 'linear-gradient(135deg, #c0547a, #f59e0b)', tx: '#fff', ac: '#fdf2f8', r: 14, pd: 20, sh: 'md', previewHint: 'classic' },
        { id: 'rose',      l: 'Rosado',    layout: 'classic', bg: 'linear-gradient(135deg, #fbcfe8, #fda4af)', tx: '#831843', ac: '#c0547a', r: 16, pd: 20, sh: 'lg', previewHint: 'classic' },
        { id: 'sky',       l: 'Cielo',     layout: 'classic', bg: '#f0f9ff', tx: '#0c4a6e', ac: '#0ea5e9', r: 16, pd: 24, sh: 'lg', previewHint: 'classic' },
        { id: 'minimal',   l: 'Minimal',   layout: 'classic', bg: '#ffffff', tx: '#0f172a', ac: '#6366f1', r: 12, pd: 18, sh: 'md', previewHint: 'classic' },
      ];
      const renderPreview = (m: typeof P[0]) => {
        const sel = (s.couponLayout || 'classic') === m.layout && (m.layout !== 'classic' || s.bgColor === m.bg);
        const wrap: React.CSSProperties = { padding: 0, border: `2px solid ${sel ? '#5850ec' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', overflow: 'hidden', background: 'none' };
        // Mini-previews diferenciadas por layout
        if (m.previewHint === 'split') return (<button key={m.id} onClick={() => onUpdate({ couponLayout: m.layout, bgColor: m.bg, textColor: m.tx, accentColor: m.ac, borderRadius: m.r, padding: m.pd, shadow: m.sh })} style={wrap}>
          <div style={{ height: 32, display: 'flex' }}>
            <div style={{ flex: 1.1, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px dashed #000' }}><span style={{ fontSize: 11, fontWeight: 900, color: '#000', letterSpacing: -1 }}>10%</span></div>
            <div style={{ flex: 1, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 14, height: 4, background: '#fff', borderRadius: 1 }} /></div>
          </div>
          <div style={{ fontSize: 9, padding: '3px 4px', fontWeight: 700, background: sel ? '#ede9fe' : '#fff', color: '#1f2937', textAlign: 'center' }}>{m.l}</div>
        </button>);
        if (m.previewHint === 'noir') return (<button key={m.id} onClick={() => onUpdate({ couponLayout: m.layout, bgColor: m.bg, textColor: m.tx, accentColor: m.ac, borderRadius: m.r, padding: m.pd, shadow: m.sh })} style={wrap}>
          <div style={{ height: 32, background: 'linear-gradient(135deg, #050505, #2a2a2a, #050505)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div style={{ width: 18, height: 7, background: 'linear-gradient(90deg, #fff, #d4a853)', WebkitBackgroundClip: 'text', borderRadius: 1 }} />
            <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 1 }}>{[0,1,2,3].map(i => <div key={i} style={{ width: 1.5, height: 6, background: '#d4a853', opacity: 0.5 + i*0.15 }} />)}</div>
          </div>
          <div style={{ fontSize: 9, padding: '3px 4px', fontWeight: 700, background: sel ? '#ede9fe' : '#fff', color: '#1f2937', textAlign: 'center' }}>{m.l}</div>
        </button>);
        if (m.previewHint === 'ticket') return (<button key={m.id} onClick={() => onUpdate({ couponLayout: m.layout, bgColor: m.bg, textColor: m.tx, accentColor: m.ac, borderRadius: m.r, padding: m.pd, shadow: m.sh })} style={wrap}>
          <div style={{ height: 32, display: 'flex', background: '#fff' }}>
            <div style={{ width: 14, background: '#000', flexShrink: 0 }} />
            <div style={{ width: 1, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 4px)', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#000' }}>10%</span>
              <div style={{ marginLeft: 'auto', width: 18, height: 7, background: '#000', borderRadius: 1 }} />
            </div>
          </div>
          <div style={{ fontSize: 9, padding: '3px 4px', fontWeight: 700, background: sel ? '#ede9fe' : '#fff', color: '#1f2937', textAlign: 'center' }}>{m.l}</div>
        </button>);
        if (m.previewHint === 'magazine') return (<button key={m.id} onClick={() => onUpdate({ couponLayout: m.layout, bgColor: m.bg, textColor: m.tx, accentColor: m.ac, borderRadius: m.r, padding: m.pd, shadow: m.sh })} style={wrap}>
          <div style={{ height: 32, background: '#fff', position: 'relative' }}>
            <div style={{ height: 6, background: '#000', display: 'flex', alignItems: 'center', padding: '0 4px', overflow: 'hidden' }}>
              <div style={{ fontSize: 5, color: '#fff', letterSpacing: 1, fontWeight: 800 }}>{'} YAXSELL L DESC C YAXSELL L'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', height: 26, padding: '0 4px', gap: 4 }}>
              <div style={{ borderRight: '1px solid #000', paddingRight: 4, fontSize: 8, fontWeight: 900, fontStyle: 'italic', fontFamily: 'serif' }}>10%</div>
              <div style={{ flex: 1, fontSize: 6, color: '#666', fontFamily: 'serif' }}>« cupón »</div>
              <div style={{ width: 14, height: 6, background: '#000' }} />
            </div>
          </div>
          <div style={{ fontSize: 9, padding: '3px 4px', fontWeight: 700, background: sel ? '#ede9fe' : '#fff', color: '#1f2937', textAlign: 'center' }}>{m.l}</div>
        </button>);
        if (m.previewHint === 'stamp') return (<button key={m.id} onClick={() => onUpdate({ couponLayout: m.layout, bgColor: m.bg, textColor: m.tx, accentColor: m.ac, borderRadius: m.r, padding: m.pd, shadow: m.sh })} style={wrap}>
          <div style={{ height: 32, background: '#fff', border: '1px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 4px', position: 'relative' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px double #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 900 }}>10%</div>
            <div style={{ width: 18, height: 8, border: '1px dashed #000', borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 9, padding: '3px 4px', fontWeight: 700, background: sel ? '#ede9fe' : '#fff', color: '#1f2937', textAlign: 'center' }}>{m.l}</div>
        </button>);
        // classic preview (gradient + dot)
        return (<button key={m.id} onClick={() => onUpdate({ couponLayout: m.layout, bgColor: m.bg, textColor: m.tx, accentColor: m.ac, borderRadius: m.r, padding: m.pd, shadow: m.sh, copyBtnColor: undefined, copyBtnTextColor: undefined })} style={wrap}>
          <div style={{ height: 32, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div style={{ width: 16, height: 6, background: m.ac, borderRadius: 2, opacity: 0.95, boxShadow: `0 0 6px ${m.ac}66` }} />
            <div style={{ position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
            <div style={{ position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
          </div>
          <div style={{ fontSize: 9, padding: '3px 4px', fontWeight: 700, background: sel ? '#ede9fe' : '#fff', color: '#1f2937', textAlign: 'center' }}>{m.l}</div>
        </button>);
      };
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Diseños (cambian layout completo)</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {P.filter(m => m.layout !== 'classic').map(renderPreview)}
        </div>
        <SH>Paletas color (diseño clásico)</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {P.filter(m => m.layout === 'classic').map(renderPreview)}
        </div>
        <SH>Texto del cupón</SH>
        <Field icon={<Type size={13} />} label="Título (DESCUENTO)" value={s.couponTitle || 'DESCUENTO'} onChange={v => onUpdate({ couponTitle: v })} placeholder="DESCUENTO" />
        <Field icon={<Type size={13} />} label="Subtítulo con cupón" value={s.couponSubtitle || 'Código exclusivo por tiempo limitado'} onChange={v => onUpdate({ couponSubtitle: v })} placeholder="Código exclusivo por tiempo limitado" />
        <Field icon={<Type size={13} />} label="Mensaje sin cupón" value={s.couponMessage || 'Oferta especial por tiempo limitado'} onChange={v => onUpdate({ couponMessage: v })} placeholder="Oferta especial por tiempo limitado" />
        <Field icon={<Type size={13} />} label="Texto del sello" value={s.couponStampText || 'EXCLUSIVO'} onChange={v => onUpdate({ couponStampText: v })} placeholder="EXCLUSIVO" />
        <Field icon={<Type size={13} />} label="Etiqueta del código" value={s.couponCodeLabel || 'Tu código'} onChange={v => onUpdate({ couponCodeLabel: v })} placeholder="Tu código" />
        <Field icon={<Type size={13} />} label="Texto botón copiar" value={s.couponCopyText || 'Copiar'} onChange={v => onUpdate({ couponCopyText: v })} placeholder="Copiar" />
        <Field icon={<Type size={13} />} label="Texto botón copiado" value={s.couponCopiedText || '¡Copiado!'} onChange={v => onUpdate({ couponCopiedText: v })} placeholder="¡Copiado!" />
        <SH>Cupón vinculado</SH>
        <a href="/admin/coupons" target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#5850ec', fontWeight: 600, textDecoration: 'none', padding: '5px 0', marginBottom: 2 }}>
          <Ticket size={12} /> Gestionar cupones &rarr;
        </a>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>Selecciona un cupón existente. Si no seleccionas ninguno, se mostrará el primer cupón activo.</div>
          {couponsLoading ? (
            <div style={{ fontSize: 11, color: '#9ca3af', padding: '6px 0' }}>Cargando cupones...</div>
          ) : (
            <select value={s.couponId || ''} onChange={e => onUpdate({ couponId: e.target.value || undefined })}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 12, color: '#374151', background: '#fff', outline: 'none' }}>
              <option value=''> Automático (primer cupón activo) </option>
              {availCoupons.map(c => (
                <option key={c.$id} value={c.$id}>
                  {c.code}  {c.type === 'percent' || c.type === 'percentage' ? `${c.value}%` : `$${c.value?.toLocaleString()}`}
                </option>
              ))}
            </select>
          )}
        </div>
        <SH>Colores</SH>
        <ColorField label="Fondo" value={s.bgColor || ''} onChange={v => onUpdate({ bgColor: v })} />
        <ColorField label="Texto" value={s.textColor || ''} onChange={v => onUpdate({ textColor: v })} />
        <ColorField label="Acento (código + botón)" value={s.accentColor || ''} onChange={v => onUpdate({ accentColor: v })} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ColorField label="Fondo botón Copiar" value={s.copyBtnColor || ''} onChange={v => onUpdate({ copyBtnColor: v })} />
          <ColorField label="Texto botón Copiar" value={s.copyBtnTextColor || ''} onChange={v => onUpdate({ copyBtnTextColor: v })} />
        </div>
        <TypographyBlock />
        <SH>Layout</SH>
        <RangeField label="Radio de borde" value={s.borderRadius ?? 16} onChange={v => onUpdate({ borderRadius: v })} min={0} max={32} unit="px" />
        <RangeField label="Padding" value={s.padding ?? 20} onChange={v => onUpdate({ padding: v })} min={8} max={48} unit="px" />
        <RangeField label="Altura mínima" value={s.height ?? 0} onChange={v => onUpdate({ height: v })} min={0} max={200} unit="px" />
        <SH>Sombra</SH>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['none', 'sm', 'md', 'lg'] as const).map(v => (
            <button key={v} onClick={() => onUpdate({ shadow: v })} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: `1.5px solid ${s.shadow === v ? '#6366f1' : '#e5e7eb'}`, background: s.shadow === v ? '#eef2ff' : '#fff', cursor: 'pointer', fontSize: 10, fontWeight: 600, color: s.shadow === v ? '#4338ca' : '#6b7280' }}>{v === 'none' ? 'Sin' : v.toUpperCase()}</button>
          ))}
        </div>
      </div>);
    }

    case 'feature_cards':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <CardColorsBlock />
        <TypographyBlock />
        <FontBlock />
        <SpacingBlock />
        <LayoutBlock />
      </div>);

    case 'categories': {
      const CAT_MODELS: { id: string; l: string; desc: string }[] = [
        { id: 'default',   l: 'Predeterminado', desc: 'Grid 3D con iconos, tilt y subcategorías expandibles' },
        { id: 'carousel',  l: 'Carousel',       desc: 'Scroll horizontal con tarjetas pill alargadas' },
        { id: 'bubble',    l: 'Burbujas',       desc: 'Círculos tipo Instagram Stories con glow' },
        { id: 'list',      l: 'Lista Premium',  desc: 'Filas horizontales con icono grande a la izquierda' },
        { id: 'glass',     l: 'Glassmorphism',  desc: 'Tarjetas translúcidas con blur y bordes de luz' },
        { id: 'magazine',  l: 'Magazine',       desc: 'Una categoría destacada grande + grid compacto' },
        { id: 'neon',      l: 'Neón Glow',      desc: 'Bordes neón brillantes sobre fondo oscuro' },
        { id: 'minimal',   l: 'Minimalista',    desc: 'Limpio, sin bordes, solo tipografía e icono' },
        { id: 'luxury',    l: 'Lujo Dorado',    desc: 'Fondo negro, detalles dorados, tipografía serif' },
      ];
      const curModel = s.catModel || 'default';
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {CAT_MODELS.map(m => {
            const sel = curModel === m.id;
            return (
              <button key={m.id} onClick={() => onUpdate({ catModel: m.id as SectionSettings['catModel'] })}
                style={{ padding: 0, border: `2px solid ${sel ? '#5850ec' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', overflow: 'hidden', background: 'none', textAlign: 'left', transition: 'border-color .15s' }}>
                <div style={{ height: 48, background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', gap: 4, position: 'relative', overflow: 'hidden' }}>
                  {m.id === 'default' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, width: '100%' }}>
                      {[0,1,2].map(i => <div key={i} style={{ height: 16, borderRadius: 4, background: '#fff', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}><div style={{ width: 8, height: 8, borderRadius: 3, background: `hsl(${i * 120}, 60%, 85%)` }} /><div style={{ width: 14, height: 2, borderRadius: 1, background: '#d1d5db' }} /></div>)}
                    </div>
                  )}
                  {m.id === 'carousel' && (
                    <div style={{ display: 'flex', gap: 3, width: '100%', overflow: 'hidden' }}>
                      {[0,1,2,3].map(i => <div key={i} style={{ minWidth: 28, height: 32, borderRadius: 16, background: '#fff', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}><div style={{ width: 12, height: 12, borderRadius: '50%', background: `hsl(${i * 90}, 65%, 82%)` }} /><div style={{ width: 16, height: 2, borderRadius: 1, background: '#d1d5db' }} /></div>)}
                      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 16, background: 'linear-gradient(to right, transparent, #f9fafb)' }} />
                    </div>
                  )}
                  {m.id === 'bubble' && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                      {[0,1,2,3,4].map(i => <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}><div style={{ width: 18, height: 18, borderRadius: '50%', background: `linear-gradient(135deg, hsl(${i * 72}, 70%, 80%), hsl(${i * 72}, 70%, 65%))`, boxShadow: `0 0 6px hsl(${i * 72}, 70%, 75%)`, border: '2px solid #fff' }} /><div style={{ width: 10, height: 2, borderRadius: 1, background: '#d1d5db' }} /></div>)}
                    </div>
                  )}
                  {m.id === 'list' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                      {[0,1,2].map(i => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', background: '#fff', borderRadius: 4, border: '1px solid #f0f0f0' }}><div style={{ width: 10, height: 10, borderRadius: 3, background: `hsl(${i * 120}, 55%, 80%)`, flexShrink: 0 }} /><div style={{ flex: 1, height: 2, borderRadius: 1, background: '#e5e7eb' }} /><div style={{ width: 8, height: 5, borderRadius: 2, background: '#f3f4f6', fontSize: 4, color: '#999', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{'>'}</div></div>)}
                    </div>
                  )}
                  {m.id === 'glass' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, width: '100%', background: 'linear-gradient(135deg, #667eea, #764ba2)', borderRadius: 4, padding: 4 }}>
                      {[0,1,2].map(i => <div key={i} style={{ height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.6)' }} /><div style={{ width: 12, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.35)' }} /></div>)}
                    </div>
                  )}
                  {m.id === 'magazine' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, width: '100%' }}>
                      <div style={{ gridRow: 'span 2', borderRadius: 4, background: 'linear-gradient(145deg, #f0f9ff, #dbeafe)', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}><div style={{ width: 14, height: 14, borderRadius: 4, background: '#93c5fd' }} /><div style={{ width: 18, height: 2, borderRadius: 1, background: '#93c5fd' }} /></div>
                      {[0,1].map(i => <div key={i} style={{ height: 14, borderRadius: 3, background: '#fff', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}><div style={{ width: 6, height: 6, borderRadius: 2, background: `hsl(${210 + i * 30}, 60%, 82%)` }} /><div style={{ width: 12, height: 2, borderRadius: 1, background: '#d1d5db' }} /></div>)}
                    </div>
                  )}
                  {m.id === 'neon' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, width: '100%', background: '#0a0a0a', borderRadius: 4, padding: 4 }}>
                      {[0,1,2].map(i => <div key={i} style={{ height: 16, borderRadius: 4, border: `1px solid hsl(${i * 120}, 100%, 55%)`, boxShadow: `0 0 4px hsl(${i * 120}, 100%, 55%)40, inset 0 0 4px hsl(${i * 120}, 100%, 55%)15`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, background: 'rgba(0,0,0,0.6)' }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: `hsl(${i * 120}, 100%, 60%)`, boxShadow: `0 0 4px hsl(${i * 120}, 100%, 60%)` }} /><div style={{ width: 10, height: 2, borderRadius: 1, background: `hsl(${i * 120}, 100%, 70%)`, opacity: 0.7 }} /></div>)}
                    </div>
                  )}
                  {m.id === 'minimal' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, width: '100%', padding: 4 }}>
                      {[0,1,2].map(i => <div key={i} style={{ height: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: `hsl(${i * 120 + 200}, 15%, 92%)` }} /><div style={{ width: 16, height: 2, borderRadius: 1, background: '#d1d5db' }} /></div>)}
                    </div>
                  )}
                  {m.id === 'luxury' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, width: '100%', background: '#0a0a0a', borderRadius: 4, padding: 4 }}>
                      {[0,1,2].map(i => <div key={i} style={{ height: 16, borderRadius: 3, border: '1px solid rgba(212,168,83,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, background: 'rgba(212,168,83,0.04)' }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: 'linear-gradient(135deg, #d4a853, #f0d78c)', boxShadow: '0 0 3px rgba(212,168,83,0.4)' }} /><div style={{ width: 10, height: 1.5, borderRadius: 1, background: 'rgba(212,168,83,0.5)' }} /></div>)}
                    </div>
                  )}
                </div>
                <div style={{ padding: '4px 6px', background: sel ? '#ede9fe' : '#fff' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: sel ? '#5850ec' : '#374151', lineHeight: 1.2 }}>{m.l}</div>
                  <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.3, marginTop: 1 }}>{m.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
        <ColorsBlock /><CardColorsBlock /><TypographyBlock /><FontBlock /><SpacingBlock /><LayoutBlock />
      </div>);
    }

    case 'offers_featured': {
      const P = [
        { id: 'classic', l: 'Clásico',   bg: '#fff',    tx: '#1a1a1a', hd: '#111', cBg: '#fff', cTx: '#333', ac: '#ef4444', btn: '#ef4444', btnTx: '#fff', r: 12 },
        { id: 'dark',    l: 'Oscuro',    bg: '#111827', tx: '#e5e7eb', hd: '#fff', cBg: '#1f2937', cTx: '#e5e7eb', ac: '#f59e0b', btn: '#f59e0b', btnTx: '#111', r: 12 },
        { id: 'blue',    l: 'Azul',      bg: '#eff6ff', tx: '#1e40af', hd: '#1e3a8a', cBg: '#dbeafe', cTx: '#1e40af', ac: '#3b82f6', btn: '#3b82f6', btnTx: '#fff', r: 8 },
        { id: 'urgent',  l: 'Urgente',   bg: '#fef2f2', tx: '#991b1b', hd: '#7f1d1d', cBg: '#fee2e2', cTx: '#991b1b', ac: '#dc2626', btn: '#dc2626', btnTx: '#fff', r: 0 },
        { id: 'purple',  l: 'Violeta',   bg: '#faf5ff', tx: '#6b21a8', hd: '#581c87', cBg: '#ede9fe', cTx: '#6b21a8', ac: '#a855f7', btn: '#a855f7', btnTx: '#fff', r: 16 },
        { id: 'nature',  l: 'Natural',   bg: '#f0fdf4', tx: '#166534', hd: '#14532d', cBg: '#dcfce7', cTx: '#166534', ac: '#22c55e', btn: '#22c55e', btnTx: '#fff', r: 12 },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, cardBgColor: m.cBg, cardTextColor: m.cTx, accentColor: m.ac, buttonColor: m.btn, buttonTextColor: m.btnTx, borderRadius: m.r })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.accentColor === m.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}><div style={{ width: 18, height: 8, background: m.ac, borderRadius: 2, opacity: 0.7 }} /><div style={{ width: 10, height: 10, background: m.cBg, borderRadius: m.r / 4 }} /></div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.accentColor === m.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock /><CardColorsBlock /><ButtonBlock /><TypographyBlock /><FontBlock /><SpacingBlock />
      </div>);
    }

    case 'collage': {
      const P = [
        { id: 'clean',  l: 'Limpio',   bg: '#fff',    tx: '#1a1a1a', hd: '#111', ac: '#3483fa', r: 8,  g: 4 },
        { id: 'dark',   l: 'Oscuro',   bg: '#0f172a', tx: '#e2e8f0', hd: '#f8fafc', ac: '#38bdf8', r: 8,  g: 4 },
        { id: 'rounded',l: 'Redondeado',bg: '#f8fafc', tx: '#374151', hd: '#111', ac: '#6366f1', r: 20, g: 8 },
        { id: 'flat',   l: 'Plano',    bg: '#fff',    tx: '#525252', hd: '#262626', ac: '#525252', r: 0,  g: 0 },
        { id: 'warm',   l: 'Cálido',   bg: '#fffbeb', tx: '#92400e', hd: '#78350f', ac: '#f59e0b', r: 12, g: 6 },
        { id: 'bold',   l: 'Bold',     bg: '#1e1b4b', tx: '#c7d2fe', hd: '#e0e7ff', ac: '#f97316', r: 12, g: 6 },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, accentColor: m.ac, borderRadius: m.r, gap: m.g })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.accentColor === m.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>{[0,1,2].map(i => <div key={i} style={{ width: i === 0 ? 16 : 8, height: 14, background: m.ac, opacity: 0.2, borderRadius: m.r / 4 }} />)}</div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.accentColor === m.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock />
        <SH>Grid del collage</SH>
        <RangeField label="Espacio entre celdas" value={s.gap ?? 4} onChange={v => onUpdate({ gap: v })} min={0} max={16} unit="px" />
        <RangeField label="Radio de borde" value={s.borderRadius ?? 8} onChange={v => onUpdate({ borderRadius: v })} min={0} max={24} unit="px" />
        <TypographyBlock />
        <FontBlock />
      </div>);
    }

    case 'recommended':
    case 'products_grid': {
      const CARD_STYLES: { id: string; l: string; desc: string; preview: { bg: string; cardBg: string; accent: string; border: string; imgH: number; radius: number; shadow: string } }[] = [
        { id: 'classic', l: 'Classic', desc: 'Limpio estilo MercadoLibre', preview: { bg: '#fff', cardBg: '#fff', accent: '#3483fa', border: '1px solid #eee', imgH: 60, radius: 12, shadow: '0 1px 4px rgba(0,0,0,.06)' } },
        { id: 'elegant', l: 'Elegant', desc: 'Minimalista estilo Apple', preview: { bg: '#fafafa', cardBg: '#fff', accent: '#111', border: '1px solid #e5e5e5', imgH: 70, radius: 16, shadow: '0 2px 8px rgba(0,0,0,.04)' } },
        { id: 'glassmorphism', l: 'Glass', desc: 'Cristal esmerilado moderno', preview: { bg: 'linear-gradient(135deg,#667eea,#764ba2)', cardBg: 'rgba(255,255,255,0.15)', accent: '#fff', border: '1px solid rgba(255,255,255,.2)', imgH: 55, radius: 14, shadow: '0 8px 32px rgba(0,0,0,.1)' } },
        { id: 'neon', l: 'Neon', desc: 'Dark con bordes brillantes', preview: { bg: '#0a0a0a', cardBg: '#141414', accent: '#00ff88', border: '1px solid #00ff8844', imgH: 55, radius: 10, shadow: '0 0 15px rgba(0,255,136,.1)' } },
        { id: 'magazine', l: 'Magazine', desc: 'Editorial, texto sobre imagen', preview: { bg: '#f5f5f5', cardBg: '#333', accent: '#fff', border: 'none', imgH: 80, radius: 8, shadow: '0 4px 20px rgba(0,0,0,.15)' } },
        { id: 'floating', l: 'Floating', desc: 'Elevadas con sombras grandes', preview: { bg: '#f0f4ff', cardBg: '#fff', accent: '#6366f1', border: 'none', imgH: 60, radius: 20, shadow: '0 10px 40px rgba(99,102,241,.12)' } },
        { id: 'luxury', l: 'Luxury', desc: 'Dorado premium elegante', preview: { bg: '#fffdf8', cardBg: '#fffdf8', accent: '#c9a96e', border: '1px solid #e8dcc8', imgH: 65, radius: 6, shadow: '0 4px 16px rgba(160,120,60,.08)' } },
        { id: 'brutalist', l: 'Brutalist', desc: 'Bold crudo con sombras duras', preview: { bg: '#fff', cardBg: '#fff', accent: '#000', border: '3px solid #000', imgH: 55, radius: 0, shadow: '4px 4px 0 #000' } },
        { id: 'gradient', l: 'Gradient', desc: 'Bordes arcoíris vibrantes', preview: { bg: '#faf5ff', cardBg: '#fff', accent: '#764ba2', border: '2px solid #c084fc', imgH: 60, radius: 16, shadow: '0 4px 16px rgba(118,75,162,.1)' } },
        { id: 'minimal', l: 'Minimal', desc: 'Ultra limpio sin decoración', preview: { bg: '#fff', cardBg: '#fff', accent: '#1a1a1a', border: '1px solid #f0f0f0', imgH: 60, radius: 4, shadow: 'none' } },
      ];
      const COLOR_PRESETS = [
        { id: 'light', l: 'Claro', bg: '#fff', tx: '#1a1a1a', hd: '#111', cBg: '#fff', cTx: '#333', ac: '#3483fa', btn: '#3483fa', btnTx: '#fff' },
        { id: 'dark', l: 'Oscuro', bg: '#111827', tx: '#e5e7eb', hd: '#fff', cBg: '#1f2937', cTx: '#e5e7eb', ac: '#818cf8', btn: '#818cf8', btnTx: '#fff' },
        { id: 'warm', l: 'Cálido', bg: '#fffbeb', tx: '#92400e', hd: '#78350f', cBg: '#fef3c7', cTx: '#92400e', ac: '#f59e0b', btn: '#f59e0b', btnTx: '#111' },
        { id: 'nature', l: 'Natural', bg: '#f0fdf4', tx: '#166534', hd: '#14532d', cBg: '#dcfce7', cTx: '#166534', ac: '#22c55e', btn: '#22c55e', btnTx: '#fff' },
        { id: 'ocean', l: 'Oceánico', bg: '#ecfeff', tx: '#155e75', hd: '#164e63', cBg: '#cffafe', cTx: '#155e75', ac: '#06b6d4', btn: '#06b6d4', btnTx: '#fff' },
        { id: 'bold', l: 'Vibrante', bg: '#1e1b4b', tx: '#c7d2fe', hd: '#e0e7ff', cBg: '#312e81', cTx: '#c7d2fe', ac: '#f97316', btn: '#f97316', btnTx: '#fff' },
      ];
      const curStyle = s.cardStyle || 'classic';
      const isGrid = baseId === 'products_grid';
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Card Style Picker */}
        <SH>Diseño de Tarjetas</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {CARD_STYLES.map(cs => {
            const active = curStyle === cs.id;
            return (
              <button key={cs.id} onClick={() => onUpdate({ cardStyle: cs.id as SectionSettings['cardStyle'] })}
                style={{ padding: 0, border: `2px solid ${active ? '#5850ec' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', overflow: 'hidden', background: '#fff', textAlign: 'left', transition: 'all .15s' }}>
                <div style={{ height: 48, background: cs.preview.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 8px' }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: 28, display: 'flex', flexDirection: 'column', borderRadius: cs.preview.radius / 3, overflow: 'hidden', background: cs.preview.cardBg, border: cs.preview.border, boxShadow: cs.preview.shadow }}>
                      <div style={{ height: cs.preview.imgH / 4, background: cs.id === 'neon' ? '#222' : cs.id === 'magazine' ? '#555' : '#e8e8e8' }} />
                      <div style={{ padding: 2 }}>
                        <div style={{ height: 2, width: '80%', background: cs.preview.accent, borderRadius: 1, opacity: 0.7 }} />
                        <div style={{ height: 1.5, width: '50%', background: cs.preview.accent, borderRadius: 1, opacity: 0.3, marginTop: 1.5 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '4px 6px', background: active ? '#ede9fe' : '#fff' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: active ? '#5850ec' : '#374151' }}>{cs.l}</div>
                  <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.2 }}>{cs.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Color Presets */}
        <SH>Paleta de colores</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          {COLOR_PRESETS.map(cp => (
            <button key={cp.id} onClick={() => onUpdate({ bgColor: cp.bg, textColor: cp.tx, headingColor: cp.hd, cardBgColor: cp.cBg, cardTextColor: cp.cTx, accentColor: cp.ac, buttonColor: cp.btn, buttonTextColor: cp.btnTx })}
              style={{ padding: 0, border: `2px solid ${s.bgColor === cp.bg && s.accentColor === cp.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}>
              <div style={{ height: 18, background: cp.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: cp.ac }} />
                <div style={{ width: 10, height: 3, borderRadius: 2, background: cp.cBg, border: '0.5px solid rgba(0,0,0,.1)' }} />
              </div>
              <div style={{ fontSize: 8, padding: '2px 4px', fontWeight: 600, background: s.bgColor === cp.bg && s.accentColor === cp.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{cp.l}</div>
            </button>
          ))}
        </div>

        {/* Animations & Effects */}
        <SH>Animaciones y efectos</SH>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {([
            { key: 'cardHoverTilt', label: 'Inclinación 3D al hover', icon: ' ' },
            { key: 'cardHoverZoom', label: 'Zoom imagen al hover', icon: ':' },
            { key: 'cardShimmer', label: 'Reflejo shine al hover', icon: 'n' },
            { key: 'cardBadgePulse', label: 'Pulso en badges', icon: 'n' },
            { key: 'cardBtnShimmer', label: 'Shimmer en botón', icon: 'o' },
            { key: 'cardBorderGlow', label: 'Borde luminoso al hover', icon: 'c' },
            { key: 'cardOverlayGradient', label: 'Gradiente sobre imagen', icon: 'i' },
          ] as { key: string; label: string; icon: string }[]).map(opt => (
            <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#374151', cursor: 'pointer', padding: '3px 0' }}>
              <input type="checkbox" checked={!!(s as Record<string, unknown>)[opt.key]} onChange={e => onUpdate({ [opt.key]: e.target.checked })}
                style={{ width: 14, height: 14, accentColor: '#5850ec', cursor: 'pointer' }} />
              <span>{opt.icon}</span>
              <span style={{ fontWeight: 500 }}>{opt.label}</span>
            </label>
          ))}
        </div>

        {/* Card Sizing */}
        <SH>Tamaño de tarjetas</SH>
        <RangeField label="Altura imagen" value={s.cardImageHeight ?? 180} onChange={v => onUpdate({ cardImageHeight: v })} min={100} max={320} unit="px" />
        <RangeField label="Radio tarjetas" value={s.cardRadius ?? 12} onChange={v => onUpdate({ cardRadius: v })} min={0} max={32} unit="px" />
        <SelectField label="Ajuste imagen" value={s.cardImageFit || 'cover'} onChange={v => onUpdate({ cardImageFit: v as SectionSettings['cardImageFit'] })}
          options={[{ v: 'cover', l: 'Cubrir (cover)' }, { v: 'contain', l: 'Contener (contain)' }]} />
        <SelectField label="Sombra tarjetas" value={s.shadow || 'md'} onChange={v => onUpdate({ shadow: v as SectionSettings['shadow'] })}
          options={[{ v: 'none', l: 'Sin sombra' }, { v: 'sm', l: 'Sutil' }, { v: 'md', l: 'Media' }, { v: 'lg', l: 'Grande' }]} />
        <RangeField label="Espaciado entre tarjetas" value={s.gap ?? 18} onChange={v => onUpdate({ gap: v })} min={6} max={32} unit="px" />

        {/* Layout for grid only */}
        {isGrid && <>
          <SH>Layout</SH>
          <RangeField label="Columnas" value={s.columns ?? 4} onChange={v => onUpdate({ columns: v })} min={2} max={6} unit="" />
        </>}

        {/* Button Style */}
        <SH>Estilo de botones</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          {[
            { id: 'default', l: 'Estándar', bg: 'linear-gradient(135deg,#3483fa,#2968c8)', r: 8 },
            { id: 'pill', l: 'Píldora', bg: 'linear-gradient(135deg,#3483fa,#2968c8)', r: 20 },
            { id: 'sharp', l: 'Angular', bg: '#1a1a1a', r: 2 },
            { id: 'outline', l: 'Outline', bg: 'transparent', r: 8 },
            { id: 'soft', l: 'Suave', bg: 'rgba(52,131,250,0.1)', r: 10 },
            { id: 'gradient', l: 'Gradiente', bg: 'linear-gradient(135deg,#667eea,#764ba2)', r: 8 },
          ].map(bs => {
            const active = (s.cardBtnStyle || 'default') === bs.id;
            return (
              <button key={bs.id} onClick={() => onUpdate({ cardBtnStyle: bs.id as SectionSettings['cardBtnStyle'] })}
                style={{ padding: 0, border: `2px solid ${active ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: '#fff' }}>
                <div style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>
                  <div style={{ height: 14, width: '100%', borderRadius: bs.r / 2, background: bs.bg, border: bs.id === 'outline' ? '1.5px solid #3483fa' : 'none' }} />
                </div>
                <div style={{ fontSize: 8, padding: '2px 4px', fontWeight: 600, background: active ? '#ede9fe' : '#fff', color: active ? '#5850ec' : '#666' }}>{bs.l}</div>
              </button>
            );
          })}
        </div>

        {/*  ─ Favorite Button Design  ─ */}
        <SH>Botón favorito av</SH>
        {(() => {
          const FAV_PRESETS: { id: string; l: string; desc: string; style: string; bg: string; bgA: string; ic: string; icA: string; shadow: boolean; border: boolean; anim: string }[] = [
            { id: 'circle', l: 'Círculo', desc: 'Clásico redondo', style: 'circle', bg: '#ffffff', bgA: '#fff5f5', ic: '#999999', icA: '#e53935', shadow: true, border: true, anim: 'pulse' },
            { id: 'rounded', l: 'Redondeado', desc: 'Esquinas suaves', style: 'rounded', bg: '#f8f8f8', bgA: '#fce4ec', ic: '#aaaaaa', icA: '#d32f2f', shadow: true, border: true, anim: 'bounce' },
            { id: 'minimal', l: 'Minimal', desc: 'Sin fondo, solo ícono', style: 'minimal', bg: 'transparent', bgA: 'transparent', ic: '#bbbbbb', icA: '#e53935', shadow: false, border: false, anim: 'pop' },
            { id: 'pill', l: 'Píldora', desc: 'Forma alargada', style: 'pill', bg: '#f0f0f0', bgA: '#ffebee', ic: '#888888', icA: '#c62828', shadow: true, border: true, anim: 'pulse' },
            { id: 'glass', l: 'Glass', desc: 'Cristal esmerilado', style: 'glassmorphism', bg: 'rgba(255,255,255,0.15)', bgA: 'rgba(255,200,200,0.25)', ic: '#cccccc', icA: '#ff5252', shadow: true, border: true, anim: 'ripple' },
            { id: 'neon', l: 'Neon', desc: 'Oscuro con brillo', style: 'neon', bg: '#0a0a0a', bgA: '#1a0505', ic: '#555555', icA: '#ff1744', shadow: true, border: true, anim: 'ripple' },
          ];
          const curFav = s.favStyle || 'circle';
          return (<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
              {FAV_PRESETS.map(fp => {
                const sel = curFav === fp.style;
                return (
                  <button key={fp.id} onClick={() => onUpdate({ favStyle: fp.style as SectionSettings['favStyle'], favBgColor: fp.bg, favBgColorActive: fp.bgA, favIconColor: fp.ic, favIconColorActive: fp.icA, favShadow: fp.shadow, favBorder: fp.border, favAnimation: fp.anim as SectionSettings['favAnimation'] })}
                    style={{ padding: 0, border: `2px solid ${sel ? '#e53935' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: '#fff', textAlign: 'center' }}>
                    <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: fp.id === 'neon' ? '#111' : fp.id === 'glass' ? 'linear-gradient(135deg,#667eea,#764ba2)' : '#f9f9f9' }}>
                      <div style={{ width: fp.style === 'pill' ? 28 : 22, height: 22, borderRadius: fp.style === 'circle' ? '50%' : fp.style === 'pill' ? '50%' : fp.style === 'rounded' ? 5 : fp.style === 'glassmorphism' ? 7 : fp.style === 'neon' ? 4 : 2, background: fp.id === 'minimal' ? 'transparent' : fp.id === 'neon' ? '#1a1a1a' : fp.id === 'glass' ? 'rgba(255,255,255,0.2)' : '#fff', border: fp.border ? `1px solid ${fp.id === 'neon' ? '#ff174444' : 'rgba(0,0,0,0.1)'}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: fp.shadow ? '0 1px 4px rgba(0,0,0,.1)' : 'none' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={fp.ic} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </div>
                    </div>
                    <div style={{ padding: '2px 4px', background: sel ? '#fce4ec' : '#fff' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: sel ? '#c62828' : '#374151' }}>{fp.l}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <label style={{ flex: 1, fontSize: 10, color: '#555' }}>Fondo inactivo
                  <input type="color" value={s.favBgColor || '#ffffff'} onChange={e => onUpdate({ favBgColor: e.target.value })} style={{ width: '100%', height: 22, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', padding: 0 }} />
                </label>
                <label style={{ flex: 1, fontSize: 10, color: '#555' }}>Fondo activo
                  <input type="color" value={s.favBgColorActive || '#fff5f5'} onChange={e => onUpdate({ favBgColorActive: e.target.value })} style={{ width: '100%', height: 22, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', padding: 0 }} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <label style={{ flex: 1, fontSize: 10, color: '#555' }}>Ícono inactivo
                  <input type="color" value={s.favIconColor || '#999999'} onChange={e => onUpdate({ favIconColor: e.target.value })} style={{ width: '100%', height: 22, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', padding: 0 }} />
                </label>
                <label style={{ flex: 1, fontSize: 10, color: '#555' }}>Ícono activo
                  <input type="color" value={s.favIconColorActive || '#e53935'} onChange={e => onUpdate({ favIconColorActive: e.target.value })} style={{ width: '100%', height: 22, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', padding: 0 }} />
                </label>
              </div>
            </div>
            <RangeField label="Tamaño ícono" value={s.favSize ?? 18} onChange={v => onUpdate({ favSize: v })} min={12} max={28} unit="px" />
            <SelectField label="Animación" value={s.favAnimation || 'pulse'} onChange={v => onUpdate({ favAnimation: v as SectionSettings['favAnimation'] })}
              options={[{ v: 'pulse', l: 'Pulso' }, { v: 'bounce', l: 'Rebote' }, { v: 'pop', l: 'Pop' }, { v: 'ripple', l: 'Onda' }, { v: 'none', l: 'Sin animación' }]} />
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={s.favShadow !== false} onChange={e => onUpdate({ favShadow: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#e53935' }} />
                <span>Sombra</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={s.favBorder !== false} onChange={e => onUpdate({ favBorder: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#e53935' }} />
                <span>Borde</span>
              </label>
            </div>
          </div>);
        })()}

        {/* Fine-tune Colors */}
        <ColorsBlock /><CardColorsBlock /><ButtonBlock /><TypographyBlock /><FontBlock /><SpacingBlock />
      </div>);
    }

    /*  ─ Catalog sections with presets  ─ */
    case 'banner_image': {
      const P = [
        { id: 'hero',     l: 'Hero Oscuro',  bg: '#111827', tx: '#fff',     ac: '#6366f1', btn: '#6366f1', btnTx: '#fff', r: 0,  h: 400 },
        { id: 'light',    l: 'Claro',        bg: '#f9fafb', tx: '#111827',  ac: '#2563eb', btn: '#2563eb', btnTx: '#fff', r: 12, h: 350 },
        { id: 'gradient', l: 'Gradiente',    bg: 'linear-gradient(135deg,#667eea,#764ba2)', tx: '#fff', ac: '#fbbf24', btn: '#fbbf24', btnTx: '#333', r: 16, h: 420 },
        { id: 'warm',     l: 'Cálido',       bg: '#7c2d12', tx: '#fef3c7',  ac: '#f59e0b', btn: '#f59e0b', btnTx: '#111', r: 0,  h: 380 },
        { id: 'nature',   l: 'Natural',      bg: '#14532d', tx: '#dcfce7',  ac: '#4ade80', btn: '#4ade80', btnTx: '#111', r: 8,  h: 400 },
        { id: 'minimal',  l: 'Minimal',      bg: '#ffffff', tx: '#1a1a1a',  ac: '#000',    btn: '#000',    btnTx: '#fff', r: 0,  h: 320 },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, accentColor: m.ac, buttonColor: m.btn, buttonTextColor: m.btnTx, borderRadius: m.r, height: m.h })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg }} /><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock /><ButtonBlock />
        <RangeField label="Altura" value={s.height ?? 400} onChange={v => onUpdate({ height: v })} min={200} max={700} unit="px" />
        <RangeField label="Radio" value={s.borderRadius ?? 0} onChange={v => onUpdate({ borderRadius: v })} min={0} max={24} unit="px" />
        <TypographyBlock />
        <FontBlock />
      </div>);
    }

    case 'featured_collection': {
      const P = [
        { id: 'clean',  l: 'Limpio',     bg: '#fff',     tx: '#1a1a1a', hd: '#111', cBg: '#fff',     cTx: '#333',  ac: '#3483fa', sh: 'sm' as const, r: 8  },
        { id: 'dark',   l: 'Oscuro',     bg: '#111827',  tx: '#e5e7eb', hd: '#fff', cBg: '#1f2937',  cTx: '#f3f4f6', ac: '#818cf8', sh: 'md' as const, r: 12 },
        { id: 'pastel', l: 'Pastel',     bg: '#faf5ff',  tx: '#581c87', hd: '#6b21a8', cBg: '#f3e8ff', cTx: '#581c87', ac: '#a855f7', sh: 'sm' as const, r: 16 },
        { id: 'warm',   l: 'Cálido',     bg: '#fffbeb',  tx: '#78350f', hd: '#92400e', cBg: '#fef3c7', cTx: '#78350f', ac: '#f59e0b', sh: 'sm' as const, r: 12 },
        { id: 'bold',   l: 'Vibrante',   bg: '#0f172a',  tx: '#e2e8f0', hd: '#f8fafc', cBg: '#1e293b', cTx: '#e2e8f0', ac: '#06b6d4', sh: 'lg' as const, r: 8  },
        { id: 'flat',   l: 'Plano',      bg: '#f1f5f9',  tx: '#334155', hd: '#0f172a', cBg: '#fff',    cTx: '#334155', ac: '#2563eb', sh: 'none' as const, r: 4 },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, cardBgColor: m.cBg, cardTextColor: m.cTx, accentColor: m.ac, shadow: m.sh, borderRadius: m.r })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.accentColor === m.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>{[0,1,2].map(i => <div key={i} style={{ width: 12, height: 14, background: m.cBg, borderRadius: m.r / 3, opacity: 0.9 }} />)}</div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.accentColor === m.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock /><CardColorsBlock /><TypographyBlock /><FontBlock /><SpacingBlock /><LayoutBlock />
      </div>);
    }

    case 'image_text': {
      const IT_MODELS = [
        { id: 'classic',   l: 'Clásico',    desc: 'Imagen y texto lado a lado' },
        { id: 'overlap',   l: 'Overlap',    desc: 'Imagen sobresale del contenedor' },
        { id: 'fullbleed', l: 'Full Bleed', desc: 'Imagen de fondo con texto encima' },
        { id: 'card',      l: 'Tarjeta',    desc: 'Imagen arriba, texto abajo' },
        { id: 'split',     l: 'Diagonal',   desc: 'Corte diagonal entre imagen y texto' },
      ];
      const MiniIT = ({ id }: { id: string }) => {
        const bg = '#e5e7eb', tx = '#9ca3af', ac = '#6366f1';
        if (id === 'classic') return (<div style={{ height: 32, display: 'flex', gap: 2, padding: 3 }}><div style={{ flex: 1, background: bg, borderRadius: 3 }} /><div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, padding: '0 4px' }}><div style={{ height: 3, width: '70%', background: tx, borderRadius: 1 }} /><div style={{ height: 2, width: '90%', background: tx, borderRadius: 1, opacity: .5 }} /><div style={{ height: 4, width: '40%', background: ac, borderRadius: 1 }} /></div></div>);
        if (id === 'overlap') return (<div style={{ height: 32, position: 'relative', padding: 3 }}><div style={{ position: 'absolute', left: 3, top: 1, width: '45%', height: '110%', background: bg, borderRadius: 4, boxShadow: '0 2px 6px rgba(0,0,0,.15)', zIndex: 1 }} /><div style={{ marginLeft: '48%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, height: '100%' }}><div style={{ height: 3, width: '60%', background: tx, borderRadius: 1 }} /><div style={{ height: 2, width: '80%', background: tx, borderRadius: 1, opacity: .5 }} /></div></div>);
        if (id === 'fullbleed') return (<div style={{ height: 32, background: bg, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2, position: 'relative' }}><div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.3)', borderRadius: 3 }} /><div style={{ height: 3, width: '50%', background: '#fff', borderRadius: 1, zIndex: 1 }} /><div style={{ height: 4, width: '30%', background: ac, borderRadius: 1, zIndex: 1 }} /></div>);
        if (id === 'card') return (<div style={{ height: 32, display: 'flex', flexDirection: 'column', padding: 3 }}><div style={{ flex: 1, background: bg, borderRadius: '3px 3px 0 0' }} /><div style={{ padding: '3px 4px', display: 'flex', flexDirection: 'column', gap: 1 }}><div style={{ height: 2, width: '60%', background: tx, borderRadius: 1 }} /><div style={{ height: 2, width: '40%', background: ac, borderRadius: 1 }} /></div></div>);
        if (id === 'split') return (<div style={{ height: 32, display: 'flex', padding: 3, overflow: 'hidden', borderRadius: 3 }}><div style={{ flex: 1, background: bg, clipPath: 'polygon(0 0,100% 0,80% 100%,0 100%)' }} /><div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, padding: '0 4px' }}><div style={{ height: 3, width: '60%', background: tx, borderRadius: 1 }} /><div style={{ height: 2, width: '80%', background: tx, borderRadius: 1, opacity: .5 }} /></div></div>);
        return null;
      };
      const P = [
        { id: 'clean',    l: 'Limpio',     bg: '#fff',    tx: '#374151', hd: '#111',    ac: '#3483fa', btn: '#3483fa', btnTx: '#fff', r: 12 },
        { id: 'dark',     l: 'Oscuro',     bg: '#111827', tx: '#d1d5db', hd: '#f9fafb', ac: '#818cf8', btn: '#818cf8', btnTx: '#fff', r: 12 },
        { id: 'bold',     l: 'Bold',       bg: '#312e81', tx: '#c7d2fe', hd: '#e0e7ff', ac: '#818cf8', btn: '#818cf8', btnTx: '#fff', r: 20 },
        { id: 'coral',    l: 'Coral',      bg: '#fff1f2', tx: '#881337', hd: '#4c0519', ac: '#f43f5e', btn: '#f43f5e', btnTx: '#fff', r: 16 },
        { id: 'ocean',    l: 'Océano',     bg: '#ecfeff', tx: '#155e75', hd: '#083344', ac: '#06b6d4', btn: '#06b6d4', btnTx: '#fff', r: 14 },
        { id: 'nature',   l: 'Natural',    bg: '#ecfdf5', tx: '#065f46', hd: '#064e3b', ac: '#10b981', btn: '#10b981', btnTx: '#fff', r: 16 },
        { id: 'luxury',   l: 'Lujo',       bg: '#1c1917', tx: '#d6d3d1', hd: '#fef3c7', ac: '#d97706', btn: '#d97706', btnTx: '#fff', r: 8  },
        { id: 'lavender', l: 'Lavanda',    bg: '#f5f3ff', tx: '#5b21b6', hd: '#3b0764', ac: '#8b5cf6', btn: '#8b5cf6', btnTx: '#fff', r: 18 },
        { id: 'minimal',  l: 'Minimal',    bg: '#f8fafc', tx: '#475569', hd: '#0f172a', ac: '#334155', btn: '#334155', btnTx: '#fff', r: 4  },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Diseño</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {IT_MODELS.map(m => (
            <button key={m.id} onClick={() => onUpdate({ imageTextModel: m.id as SectionSettings['imageTextModel'] })}
              style={{ padding: 0, border: `2px solid ${(s.imageTextModel || 'classic') === m.id ? '#5850ec' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', overflow: 'hidden', background: 'none' }}>
              <MiniIT id={m.id} />
              <div style={{ padding: '3px 6px', background: (s.imageTextModel || 'classic') === m.id ? '#ede9fe' : '#fff' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>{m.l}</div>
                <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.2 }}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>
        <SH>Colores</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, accentColor: m.ac, buttonColor: m.btn, buttonTextColor: m.btnTx, borderRadius: m.r })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.accentColor === m.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}><div style={{ width: 16, height: 14, background: m.tx, opacity: 0.2, borderRadius: m.r / 3 }} /><div style={{ width: 20, height: 4, background: m.hd, opacity: 0.6, borderRadius: 2 }} /></div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.accentColor === m.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock /><ButtonBlock /><TypographyBlock />
        <RangeField label="Radio" value={s.borderRadius ?? 12} onChange={v => onUpdate({ borderRadius: v })} min={0} max={24} unit="px" />
        <FontBlock />
      </div>);
    }

    case 'collection_list': {
      const P = [
        { id: 'editorial', l: 'Cinemático', bg: '#0a0908', tx: 'rgba(250,250,249,0.7)', hd: '#fafaf9', cBg: 'rgba(255,255,255,0.04)', cTx: '#fff', ac: '#fb7185', sh: 'lg' as const, r: 24, cols: 3 },
        { id: 'cards',  l: 'Tarjetas',  bg: '#fff',    tx: '#1a1a1a', hd: '#111', cBg: '#f9fafb', cTx: '#333', ac: '#3483fa', sh: 'sm' as const, r: 12, cols: 3 },
        { id: 'dark',   l: 'Oscuro',    bg: '#0f172a', tx: '#e2e8f0', hd: '#f8fafc', cBg: '#1e293b', cTx: '#e2e8f0', ac: '#38bdf8', sh: 'lg' as const, r: 12, cols: 3 },
        { id: 'flat',   l: 'Plano',     bg: '#f1f5f9', tx: '#334155', hd: '#0f172a', cBg: '#fff', cTx: '#334155', ac: '#2563eb', sh: 'none' as const, r: 4, cols: 4 },
        { id: 'round',  l: 'Redondeado',bg: '#fff',    tx: '#374151', hd: '#111', cBg: '#f0fdf4', cTx: '#166534', ac: '#16a34a', sh: 'sm' as const, r: 20, cols: 3 },
        { id: 'pastel', l: 'Pastel',    bg: '#fdf2f8', tx: '#831843', hd: '#9d174d', cBg: '#fce7f3', cTx: '#831843', ac: '#e396bf', sh: 'sm' as const, r: 16, cols: 3 },
        { id: 'bold',   l: 'Vibrante',  bg: '#1e1b4b', tx: '#c7d2fe', hd: '#e0e7ff', cBg: '#312e81', cTx: '#c7d2fe', ac: '#f97316', sh: 'md' as const, r: 8, cols: 2 },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, cardBgColor: m.cBg, cardTextColor: m.cTx, accentColor: m.ac, shadow: m.sh, borderRadius: m.r, columns: m.cols, modelId: m.id })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.accentColor === m.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>{[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, background: m.cBg, borderRadius: m.r / 4, opacity: 0.85 }} />)}</div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.accentColor === m.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock /><CardColorsBlock /><TypographyBlock /><FontBlock /><SpacingBlock /><LayoutBlock />
      </div>);
    }

    case 'testimonials': {
      const P = [
        { id: 'light',  l: 'Claro',    bg: '#f9fafb', tx: '#374151', hd: '#111', cBg: '#fff',    cTx: '#374151', ac: '#f59e0b', sh: 'sm' as const, r: 12 },
        { id: 'dark',   l: 'Oscuro',   bg: '#111827', tx: '#d1d5db', hd: '#fff', cBg: '#1f2937', cTx: '#e5e7eb', ac: '#fbbf24', sh: 'md' as const, r: 12 },
        { id: 'purple', l: 'Violeta',  bg: '#f5f3ff', tx: '#5b21b6', hd: '#6b21a8', cBg: '#ede9fe', cTx: '#5b21b6', ac: '#a855f7', sh: 'sm' as const, r: 16 },
        { id: 'blue',   l: 'Azul',     bg: '#eff6ff', tx: '#1e40af', hd: '#1e3a8a', cBg: '#dbeafe', cTx: '#1e40af', ac: '#3b82f6', sh: 'sm' as const, r: 8  },
        { id: 'bold',   l: 'Bold',     bg: '#0f172a', tx: '#e2e8f0', hd: '#f8fafc', cBg: '#1e293b', cTx: '#e2e8f0', ac: '#f97316', sh: 'lg' as const, r: 20 },
        { id: 'min',    l: 'Minimal',  bg: '#fff',    tx: '#6b7280', hd: '#111827', cBg: '#f8fafc', cTx: '#374151', ac: '#6b7280', sh: 'none' as const, r: 4  },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, cardBgColor: m.cBg, cardTextColor: m.cTx, accentColor: m.ac, shadow: m.sh, borderRadius: m.r })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.accentColor === m.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}><div style={{ width: 24, height: 10, background: m.cBg, borderRadius: m.r / 3 }} /><div style={{ width: 6, height: 6, background: m.ac, borderRadius: '50%' }} /></div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.accentColor === m.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock /><CardColorsBlock /><TypographyBlock /><FontBlock /><SpacingBlock />
      </div>);
    }

    case 'newsletter': {
      const P = [
        { id: 'dark',     l: 'Oscuro',    bg: '#111827', tx: '#f3f4f6', hd: '#fff',     ac: '#6366f1', btn: '#6366f1', btnTx: '#fff', r: 0  },
        { id: 'gradient', l: 'Gradiente', bg: 'linear-gradient(135deg,#6366f1,#e396bf)', tx: '#fff', hd: '#fff', ac: '#fbbf24', btn: '#fbbf24', btnTx: '#111', r: 12 },
        { id: 'light',    l: 'Claro',     bg: '#f1f5f9', tx: '#475569', hd: '#0f172a',  ac: '#2563eb', btn: '#2563eb', btnTx: '#fff', r: 8  },
        { id: 'warm',     l: 'Cálido',    bg: '#451a03', tx: '#fde68a', hd: '#fef3c7',  ac: '#f59e0b', btn: '#f59e0b', btnTx: '#111', r: 0  },
        { id: 'nature',   l: 'Natural',   bg: '#14532d', tx: '#bbf7d0', hd: '#dcfce7',  ac: '#4ade80', btn: '#4ade80', btnTx: '#111', r: 16 },
        { id: 'minimal',  l: 'Minimal',   bg: '#fff',    tx: '#6b7280', hd: '#111827',  ac: '#111827', btn: '#111827', btnTx: '#fff', r: 4  },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, accentColor: m.ac, buttonColor: m.btn, buttonTextColor: m.btnTx, borderRadius: m.r })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.accentColor === m.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}><div style={{ width: 28, height: 8, background: m.tx, opacity: 0.3, borderRadius: 3 }} /><div style={{ width: 14, height: 8, background: m.btn, borderRadius: m.r / 2 }} /></div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.accentColor === m.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock /><ButtonBlock /><TypographyBlock /><FontBlock /><SpacingBlock />
      </div>);
    }

    case 'video': {
      const P = [
        { id: 'theater', l: 'Cine',     bg: '#000',    tx: '#fff',    hd: '#fff',    ac: '#ef4444', r: 12 },
        { id: 'dark',    l: 'Oscuro',   bg: '#0f172a', tx: '#e2e8f0', hd: '#f8fafc', ac: '#38bdf8', r: 8  },
        { id: 'light',   l: 'Claro',    bg: '#f8fafc', tx: '#475569', hd: '#0f172a', ac: '#2563eb', r: 12 },
        { id: 'warm',    l: 'Cálido',   bg: '#451a03', tx: '#fde68a', hd: '#fef3c7', ac: '#f59e0b', r: 16 },
        { id: 'bold',    l: 'Bold',     bg: '#312e81', tx: '#c7d2fe', hd: '#e0e7ff', ac: '#fbbf24', r: 20 },
        { id: 'minimal', l: 'Minimal',  bg: '#fff',    tx: '#6b7280', hd: '#111827', ac: '#6b7280', r: 0  },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, accentColor: m.ac, borderRadius: m.r })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.accentColor === m.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 0, height: 0, borderLeft: '8px solid ' + m.ac, borderTop: '5px solid transparent', borderBottom: '5px solid transparent' }} /></div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.accentColor === m.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock />
        <RangeField label="Radio" value={s.borderRadius ?? 12} onChange={v => onUpdate({ borderRadius: v })} min={0} max={24} unit="px" />
        <RangeField label="Padding" value={s.padding ?? 40} onChange={v => onUpdate({ padding: v })} min={0} max={80} unit="px" />
        <TypographyBlock />
        <FontBlock />
      </div>);
    }

    case 'rich_text': {
      const P = [
        { id: 'clean',  l: 'Limpio',   bg: '#fff',    tx: '#374151', hd: '#111827', ac: '#6366f1', r: 0  },
        { id: 'dark',   l: 'Oscuro',   bg: '#111827', tx: '#d1d5db', hd: '#f9fafb', ac: '#818cf8', r: 0  },
        { id: 'paper',  l: 'Papel',    bg: '#fefce8', tx: '#713f12', hd: '#422006', ac: '#b45309', r: 8  },
        { id: 'blue',   l: 'Azul',     bg: '#eff6ff', tx: '#1e40af', hd: '#1e3a8a', ac: '#3b82f6', r: 12 },
        { id: 'green',  l: 'Verde',    bg: '#f0fdf4', tx: '#166534', hd: '#14532d', ac: '#22c55e', r: 8  },
        { id: 'card',   l: 'Card',     bg: '#f1f5f9', tx: '#475569', hd: '#0f172a', ac: '#2563eb', r: 16 },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, accentColor: m.ac, borderRadius: m.r })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.accentColor === m.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '0 6px' }}><div style={{ width: '100%', height: 3, background: m.hd, opacity: 0.5, borderRadius: 2 }} /></div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.accentColor === m.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock /><TypographyBlock />
        <RangeField label="Padding" value={s.padding ?? 48} onChange={v => onUpdate({ padding: v })} min={16} max={80} unit="px" />
        <RangeField label="Radio" value={s.borderRadius ?? 0} onChange={v => onUpdate({ borderRadius: v })} min={0} max={24} unit="px" />
        <FontBlock />
      </div>);
    }

    case 'logo_list': {
      const P = [
        { id: 'clean',  l: 'Limpio',   bg: '#fff',    tx: '#9ca3af', hd: '#6b7280', g: 32 },
        { id: 'dark',   l: 'Oscuro',   bg: '#111827', tx: '#6b7280', hd: '#9ca3af', g: 40 },
        { id: 'gray',   l: 'Gris',     bg: '#f1f5f9', tx: '#94a3b8', hd: '#64748b', g: 28 },
        { id: 'brand',  l: 'Color',    bg: '#eff6ff', tx: '#3b82f6', hd: '#1e40af', g: 36 },
        { id: 'bold',   l: 'Bold',     bg: '#0f172a', tx: '#38bdf8', hd: '#7dd3fc', g: 32 },
        { id: 'minimal',l: 'Minimal',  bg: '#fafafa', tx: '#d4d4d4', hd: '#a3a3a3', g: 48 },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, gap: m.g })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.headingColor === m.hd ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>{[0,1,2,3].map(i => <div key={i} style={{ width: 10, height: 10, background: m.tx, borderRadius: 2, opacity: 0.5 }} />)}</div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.headingColor === m.hd ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock />
        <RangeField label="Espacio" value={s.gap ?? 32} onChange={v => onUpdate({ gap: v })} min={12} max={64} unit="px" />
        <RangeField label="Padding" value={s.padding ?? 32} onChange={v => onUpdate({ padding: v })} min={12} max={64} unit="px" />
        <FontBlock />
      </div>);
    }

    case 'countdown': {
      const P = [
        { id: 'urgente', l: 'Urgente',   bg: '#dc2626', tx: '#fff',    hd: '#fff',    ac: '#fbbf24', btn: '#fbbf24', btnTx: '#111', r: 0  },
        { id: 'dark',    l: 'Oscuro',    bg: '#0f172a', tx: '#e2e8f0', hd: '#f8fafc', ac: '#06b6d4', btn: '#06b6d4', btnTx: '#fff', r: 12 },
        { id: 'grad',    l: 'Gradiente', bg: 'linear-gradient(135deg,#f97316,#dc2626)', tx: '#fff', hd: '#fff', ac: '#fff', btn: '#fff', btnTx: '#dc2626', r: 16 },
        { id: 'purple',  l: 'Violeta',   bg: '#581c87', tx: '#e9d5ff', hd: '#f3e8ff', ac: '#d946ef', btn: '#d946ef', btnTx: '#fff', r: 8  },
        { id: 'nature',  l: 'Natural',   bg: '#14532d', tx: '#bbf7d0', hd: '#dcfce7', ac: '#4ade80', btn: '#4ade80', btnTx: '#111', r: 12 },
        { id: 'minimal', l: 'Minimal',   bg: '#fff',    tx: '#374151', hd: '#111827', ac: '#ef4444', btn: '#ef4444', btnTx: '#fff', r: 4  },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, accentColor: m.ac, buttonColor: m.btn, buttonTextColor: m.btnTx, borderRadius: m.r })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.accentColor === m.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>{['H','M','S'].map(c => <div key={c} style={{ fontSize: 7, fontWeight: 700, color: m.tx, background: m.ac, width: 12, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, opacity: 0.9 }}>{c}</div>)}</div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.accentColor === m.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock /><ButtonBlock /><TypographyBlock />
        <RangeField label="Padding" value={s.padding ?? 48} onChange={v => onUpdate({ padding: v })} min={16} max={80} unit="px" />
        <RangeField label="Radio" value={s.borderRadius ?? 0} onChange={v => onUpdate({ borderRadius: v })} min={0} max={24} unit="px" />
        <FontBlock />
      </div>);
    }

    case 'faq': {
      const P = [
        { id: 'clean',  l: 'Limpio',   bg: '#fff',    tx: '#374151', hd: '#111827', ac: '#6366f1', r: 0  },
        { id: 'dark',   l: 'Oscuro',   bg: '#111827', tx: '#d1d5db', hd: '#f9fafb', ac: '#818cf8', r: 0  },
        { id: 'card',   l: 'Card',     bg: '#f8fafc', tx: '#475569', hd: '#0f172a', ac: '#2563eb', r: 12 },
        { id: 'purple', l: 'Violeta',  bg: '#faf5ff', tx: '#6b21a8', hd: '#581c87', ac: '#a855f7', r: 8  },
        { id: 'warm',   l: 'Cálido',   bg: '#fffbeb', tx: '#92400e', hd: '#78350f', ac: '#f59e0b', r: 8  },
        { id: 'minimal',l: 'Minimal',  bg: '#fff',    tx: '#6b7280', hd: '#111827', ac: '#374151', r: 0  },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, accentColor: m.ac, borderRadius: m.r })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.accentColor === m.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>{[0,1].map(i => <div key={i} style={{ width: 28, height: 4, background: m.hd, opacity: 0.3, borderRadius: 2 }} />)}</div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.accentColor === m.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock /><TypographyBlock />
        <RangeField label="Padding" value={s.padding ?? 48} onChange={v => onUpdate({ padding: v })} min={16} max={80} unit="px" />
        <RangeField label="Radio" value={s.borderRadius ?? 0} onChange={v => onUpdate({ borderRadius: v })} min={0} max={24} unit="px" />
        <FontBlock />
      </div>);
    }

    case 'map': {
      const P = [
        { id: 'clean',  l: 'Limpio',   bg: '#fff',    tx: '#374151', hd: '#111827', ac: '#6366f1', r: 0,  h: 400 },
        { id: 'dark',   l: 'Oscuro',   bg: '#111827', tx: '#d1d5db', hd: '#f9fafb', ac: '#818cf8', r: 0,  h: 450 },
        { id: 'card',   l: 'Card',     bg: '#f1f5f9', tx: '#475569', hd: '#0f172a', ac: '#2563eb', r: 16, h: 380 },
        { id: 'full',   l: 'Full',     bg: '#fff',    tx: '#6b7280', hd: '#111827', ac: '#ef4444', r: 0,  h: 500 },
        { id: 'warm',   l: 'Cálido',   bg: '#fffbeb', tx: '#92400e', hd: '#78350f', ac: '#f59e0b', r: 12, h: 400 },
        { id: 'minimal',l: 'Minimal',  bg: '#fafafa', tx: '#a3a3a3', hd: '#525252', ac: '#525252', r: 8,  h: 350 },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SH>Modelos</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {P.map(m => <button key={m.id} onClick={() => onUpdate({ bgColor: m.bg, textColor: m.tx, headingColor: m.hd, accentColor: m.ac, borderRadius: m.r, height: m.h })} style={{ padding: 0, border: `2px solid ${s.bgColor === m.bg && s.accentColor === m.ac ? '#5850ec' : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', background: 'none' }}><div style={{ height: 24, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 20, height: 14, background: m.ac, opacity: 0.2, borderRadius: m.r / 4 }} /></div><div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: s.bgColor === m.bg && s.accentColor === m.ac ? '#ede9fe' : '#fff', color: '#374151' }}>{m.l}</div></button>)}
        </div>
        <ColorsBlock />
        <RangeField label="Altura mapa" value={s.height ?? 400} onChange={v => onUpdate({ height: v })} min={250} max={600} unit="px" />
        <RangeField label="Radio" value={s.borderRadius ?? 0} onChange={v => onUpdate({ borderRadius: v })} min={0} max={24} unit="px" />
        <RangeField label="Padding" value={s.padding ?? 32} onChange={v => onUpdate({ padding: v })} min={0} max={64} unit="px" />
        <FontBlock />
      </div>);
    }

    default:
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ColorsBlock />
        <CardColorsBlock />
        <ButtonBlock />
        <TypographyBlock />
        <FontBlock />
        <SpacingBlock />
        <LayoutBlock />
      </div>);
  }
}

/* â
â/ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   CONTENT TAB  text, images, items, data management
   âtâ ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
function ContentFields({ baseId, section, onUpdate, onIframeReload }: {
  baseId: string; section: EditorSection; onUpdate: (p: Partial<SectionSettings>) => void; onIframeReload: () => void;
}) {
  const s = section.settings;

  // Product selector for product-related tpl1 sections (hooks must be at top level)
  const [widgetProducts, setWidgetProducts] = useState<Product[]>([]);
  const [widgetProdLoading, setWidgetProdLoading] = useState(false);
  useEffect(() => {
    if (baseId !== 'product_widget' && baseId !== 'featured_product') return;
    (async () => {
      try {
        setWidgetProdLoading(true);
        const { databaseId } = getFirebaseConfig();
        const { databases } = getServices();
        const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION, [Query.greaterThan('STOCK', 0), Query.orderAsc('NAME'), Query.limit(200)]);
        setWidgetProducts(res.documents as unknown as Product[]);
      } catch { /* ignore */ }
      finally { setWidgetProdLoading(false); }
    })();
  }, [baseId]);

  // Category selector for collection_list + product_widget (hooks must be at top level)
  const [collCategories, setCollCategories] = useState<Category[]>([]);
  const [collCatLoading, setCollCatLoading] = useState(false);
  // Subcategories for product_widget
  const [widgetSubcategories, setWidgetSubcategories] = useState<any[]>([]);
  useEffect(() => {
    if (baseId !== 'collection_list' && baseId !== 'featured_collection' && baseId !== 'products_filter' && baseId !== 'product_widget') return;
    (async () => {
      try {
        setCollCatLoading(true);
        const { databaseId } = getFirebaseConfig();
        const { databases } = getServices();
        const res = await databases.listDocuments(databaseId, CATEGORIES_COLLECTION, [Query.orderAsc('name'), Query.limit(100)]);
        const cats = res.documents as unknown as Category[];
        setCollCategories(cats);
        // Auto-sync: update names/images of existing items from Appwrite
        const items = (baseId === 'featured_collection' ? (s.featuredCollectionItems || []) : (s.collectionItems || [])) as CollectionItem[];
        if (items.length > 0) {
          let changed = false;
          const updated = items.map(item => {
            if (!item.categoryId) return item;
            const cat = cats.find((c: Category) => c.$id === item.categoryId);
            if (!cat) return item;
            const newImg = baseId === 'featured_collection' ? (cat.iconUrl || (cat as any).BACKGROUND_IMAGE_URL || '') : ((cat as any).BACKGROUND_IMAGE_URL || cat.iconUrl || '');
            if (cat.name !== item.name || (newImg && newImg !== item.imageUrl)) {
              changed = true;
              return { ...item, name: cat.name, imageUrl: newImg || item.imageUrl };
            }
            return item;
          });
          if (changed) onUpdate(baseId === 'featured_collection' ? { featuredCollectionItems: updated } : { collectionItems: updated });
        }
      } catch { /* ignore */ }
      finally { setCollCatLoading(false); }
    })();
  }, [baseId]);

  // Fetch subcategories when product_widget category changes
  useEffect(() => {
    if (baseId !== 'product_widget') return;
    const catId = s.productWidgetCategoryId;
    if (!catId) { setWidgetSubcategories([]); return; }
    (async () => {
      try {
        const { databaseId } = getFirebaseConfig();
        const { databases } = getServices();
        const res = await databases.listDocuments(databaseId, SUBCATEGORIES_COLLECTION, [
          Query.equal('categoryId', catId),
          Query.orderAsc('name'),
          Query.limit(100),
        ]);
        setWidgetSubcategories(res.documents as any[]);
      } catch { setWidgetSubcategories([]); }
    })();
  }, [baseId, s.productWidgetCategoryId]);

  // Coupon selector for coupon_banner (hooks must be at top level)
  const [availCoupons, setAvailCoupons] = useState<{ $id: string; code: string; value: number; type: string }[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  useEffect(() => {
    if (baseId !== 'coupon_banner' && baseId !== 'tpl1_coupon_banner') return;
    (async () => {
      try {
        setCouponsLoading(true);
        const { databaseId } = getFirebaseConfig();
        const { databases } = getServices();
        const res = await databases.listDocuments(databaseId, 'discount_coupons', [Query.orderDesc('$createdAt'), Query.limit(100)]);
        setAvailCoupons(res.documents as any[]);
      } catch { /* ignore */ }
      finally { setCouponsLoading(false); }
    })();
  }, [baseId]);

  // Timed offer selector for countdown (hooks must be at top level)
  const [countdownOffers, setCountdownOffers] = useState<TimedOffer[]>([]);
  const [countdownOffersLoading, setCountdownOffersLoading] = useState(false);
  useEffect(() => {
    if (baseId !== 'countdown') return;
    (async () => {
      try {
        setCountdownOffersLoading(true);
        const { databaseId } = getFirebaseConfig();
        const { databases } = getServices();
        const res = await databases.listDocuments(databaseId, TIMED_OFFERS_COLLECTION, [Query.orderDesc('$createdAt'), Query.limit(50)]);
        setCountdownOffers(res.documents as unknown as TimedOffer[]);
      } catch { /* ignore */ }
      finally { setCountdownOffersLoading(false); }
    })();
  }, [baseId]);

  switch (baseId) {
    case 'navbar':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Logo</SH>
        <ImageUploadField label="Imagen del logo" value={s.logoUrl || ''} onChange={v => onUpdate({ logoUrl: v })} />
        <SH>Etiqueta promocional (esquina derecha)</SH>
        {(() => {
          const TAG_PRESETS: { id: string; l: string; preview: React.CSSProperties }[] = [
            //  ─ Minimalistas  ─
            { id: 'pill',    l: 'Píldora',   preview: { background: '#3483fa', color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 9, fontWeight: 600 } },
            { id: 'outline', l: 'Contorno',  preview: { background: 'transparent', color: '#333', borderRadius: 20, padding: '3px 11px', fontSize: 9, fontWeight: 600, border: '1.5px solid #333' } },
            { id: 'soft',    l: 'Suave',     preview: { background: '#eef2ff', color: '#4338ca', borderRadius: 8, padding: '4px 12px', fontSize: 9, fontWeight: 600 } },
            { id: 'dark',    l: 'Oscuro',    preview: { background: '#18181b', color: '#fafafa', borderRadius: 8, padding: '4px 12px', fontSize: 9, fontWeight: 600 } },
            //  ─ Con acento  ─
            { id: 'accent-left', l: 'Acento izq.', preview: { background: '#fff', color: '#1e293b', borderRadius: 6, padding: '4px 12px', fontSize: 9, fontWeight: 600, borderLeft: '3px solid #3483fa' } },
            { id: 'underline',   l: 'Subrayado',   preview: { background: '#fafafa', color: '#18181b', borderRadius: 0, padding: '4px 12px', fontSize: 9, fontWeight: 700, borderBottom: '2px solid #ef4444' } },
            { id: 'ribbon', l: 'Cinta',     preview: { background: '#ef4444', color: '#fff', borderRadius: '0 6px 6px 0', padding: '4px 14px 4px 10px', fontSize: 9, fontWeight: 600, borderLeft: '3px solid #b91c1c' } },
            { id: 'stamp',  l: 'Sello',     preview: { background: '#fff', color: '#dc2626', borderRadius: 4, padding: '3px 10px', fontSize: 8, fontWeight: 800, border: '2px solid #dc2626', textTransform: 'uppercase' as const, letterSpacing: 1.5 } },
            //  ─ Premium  ─
            { id: 'glass',  l: 'Glass',     preview: { background: 'rgba(255,255,255,.25)', backdropFilter: 'blur(8px)', color: '#1a1a1a', borderRadius: 10, padding: '4px 12px', fontSize: 9, fontWeight: 600, border: '1px solid rgba(0,0,0,.08)' } },
            { id: 'gold',   l: 'Dorado',    preview: { background: 'linear-gradient(135deg,#d4a03c,#f0d060)', color: '#3d2200', borderRadius: 6, padding: '4px 12px', fontSize: 9, fontWeight: 700 } },
            { id: 'neon',   l: 'Neón',      preview: { background: '#0a0a14', color: '#00e5c3', borderRadius: 6, padding: '4px 12px', fontSize: 9, fontWeight: 600, border: '1px solid #00e5c3' } },
            { id: 'gradient', l: 'Gradiente', preview: { background: 'linear-gradient(135deg,#6366f1,#a855f7)', color: '#fff', borderRadius: 10, padding: '4px 12px', fontSize: 9, fontWeight: 600 } },
          ];
          const cur = s.promoTagStyle || '';
          return (<>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              {TAG_PRESETS.map(t => (
                <button key={t.id} onClick={() => onUpdate({ promoTagStyle: t.id, promoTagText: s.promoTagText || 'Ofertas exclusivas' })}
                  style={{ padding: 0, border: `2px solid ${cur === t.id ? '#5850ec' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', overflow: 'hidden', background: '#f9fafb', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                  <div style={{ padding: '8px 6px', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', minHeight: 32, background: cur === t.id ? '#faf5ff' : '#f9fafb' }}>
                    <span style={{ ...t.preview, whiteSpace: 'nowrap' }}>Promo</span>
                  </div>
                  <div style={{ fontSize: 9, padding: '2px 4px', fontWeight: 600, background: cur === t.id ? '#ede9fe' : '#fff', color: '#374151', width: '100%', textAlign: 'center' }}>{t.l}</div>
                </button>
              ))}
            </div>
            {s.promoTagStyle && (
              <button onClick={() => onUpdate({ promoTagStyle: undefined, promoTagText: undefined, promoTagSecondary: undefined })}
                style={{ fontSize: 10, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 5, background: '#fff', color: '#6b7280', cursor: 'pointer', fontWeight: 600 }}>
                  Quitar etiqueta
              </button>
            )}
          </>);
        })()}
        {s.promoTagStyle && (<>
          <Field icon={<Type size={13} />} label="Texto principal" value={s.promoTagText || ''} onChange={v => onUpdate({ promoTagText: v })} placeholder="Ofertas exclusivas" />
          <Field icon={<Type size={13} />} label="Texto secundario (opcional)" value={s.promoTagSecondary || ''} onChange={v => onUpdate({ promoTagSecondary: v })} placeholder="Hasta 50% OFF" />
          <Field icon={<Link size={13} />} label="Link al hacer clic" value={s.promoTagLink || ''} onChange={v => onUpdate({ promoTagLink: v })} placeholder="/productos" />
        </>)}
        <SH>Imagen promocional (alternativa)</SH>
        <ImageUploadField label="Imagen promo (usa esto O la etiqueta)" value={s.promoImageUrl || ''} onChange={v => onUpdate({ promoImageUrl: v })} />
        <Field icon={<Link size={13} />} label="Link imagen promo" value={s.promoImageLink || ''} onChange={v => onUpdate({ promoImageLink: v })} placeholder="/productos" />
        <SH>Buscador</SH>
        <Field icon={<Type size={13} />} label="Placeholder búsqueda" value={s.searchPlaceholder || ''} onChange={v => onUpdate({ searchPlaceholder: v })} placeholder="Buscar productos, marcas y más..." />
        <SH>Partículas flotantes</SH>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" checked={s.navParticlesEnabled === true} onChange={e => onUpdate({ navParticlesEnabled: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
          Activar partículas en navbar
        </label>
        <Field
          icon={<Type size={13} />}
          label="Contenido de partículas"
          value={s.navParticlesText || ''}
          onChange={v => onUpdate({ navParticlesText: v })}
          placeholder="I,C,R,7"
        />
        <ColorField label="Color partículas" value={s.navParticlesColor || '#3483fa'} onChange={v => onUpdate({ navParticlesColor: v })} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <RangeField label="Cantidad" value={s.navParticlesCount ?? 24} onChange={v => onUpdate({ navParticlesCount: v })} min={8} max={80} unit="" />
          <RangeField label="Tamaño" value={s.navParticlesSize ?? 14} onChange={v => onUpdate({ navParticlesSize: v })} min={10} max={28} unit="px" />
        </div>
        <RangeField label="Opacidad" value={s.navParticlesOpacity ?? 0.35} onChange={v => onUpdate({ navParticlesOpacity: v })} min={0.05} max={1} unit="" />
        <SH>Elementos visibles</SH>
        {[
          { label: 'Mostrar dirección de envío', key: 'showAddress', val: s.showAddress !== false },
          { label: 'Mostrar Categorías', key: 'showCategories', val: s.showCategories !== false },
          { label: 'Mostrar Ofertas', key: 'showOffers', val: s.showOffers !== false },
          { label: 'Mostrar Favoritos', key: 'showFavorites', val: s.showFavorites !== false },
          { label: 'Fijar barra arriba al hacer scroll', key: 'sticky', val: s.sticky !== false },
        ].map(opt => (
          <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
            <input type="checkbox" checked={opt.val} onChange={e => onUpdate({ [opt.key]: e.target.checked } as Partial<SectionSettings>)} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
            {opt.label}
          </label>
        ))}
      </div>);

    case 'cm_navbar':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Logo</SH>
        <ImageUploadField label="Imagen del logo" value={s.logoUrl || ''} onChange={v => onUpdate({ logoUrl: v })} />
        <SH>Enlace del botón CTA</SH>
        <Field icon={<Type size={13} />} label="Texto botón" value={s.cmNavBtnText || 'WhatsApp'} onChange={v => onUpdate({ cmNavBtnText: v })} placeholder="WhatsApp" />
        <Field icon={<Link size={13} />} label="URL botón" value={s.cmNavBtnLink || 'https://wa.me/56912345678'} onChange={v => onUpdate({ cmNavBtnLink: v })} placeholder="https://wa.me/..." />
      </div>);

    case 'cm_hero':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Imagen de fondo</SH>
        <ImageUploadField label="Imagen hero" value={s.imageUrl || ''} onChange={v => onUpdate({ imageUrl: v })} />
        <SH>Textos</SH>
        <Field icon={<Type size={13} />} label="Título principal" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="¡Tu mundo de alimentos asiáticos!" />
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.subtitle || ''} onChange={v => onUpdate({ subtitle: v })} placeholder="Importación y distribución" />
        <Field icon={<Type size={13} />} label="Texto del botón" value={s.buttonText || 'Compra Ahora'} onChange={v => onUpdate({ buttonText: v })} placeholder="Compra Ahora" />
        <Field icon={<Link size={13} />} label="URL del botón" value={s.buttonLink || ''} onChange={v => onUpdate({ buttonLink: v })} placeholder="https://..." />
      </div>);

    case 'footer':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Logo</SH>
        <ImageUploadField label="Logo del footer" value={s.logoUrl || ''} onChange={v => onUpdate({ logoUrl: v })} />
        <Field icon={<Monitor size={13} />} label="Ancho logo (px)" value={String(s.footerLogoWidth ?? 170)} onChange={v => onUpdate({ footerLogoWidth: Number(v) || 170 })} placeholder="170" />
        <SH>Empresa</SH>
        <Field icon={<Type size={13} />} label="Nombre" value={s.companyName || 'Importadora Carlitos'} onChange={v => onUpdate({ companyName: v })} placeholder="Importadora Carlitos" />
        <Field icon={<Type size={13} />} label="Descripción" value={s.companyDescription || 'Tu tienda de maquillaje y artículos de beauty favoritos'} onChange={v => onUpdate({ companyDescription: v })} placeholder="Tu tienda de maquillaje..." />
        <SH>Columnas</SH>
        <Field icon={<Type size={13} />} label="Título columna 1" value={s.footerCol1Title || 'Comprar'} onChange={v => onUpdate({ footerCol1Title: v })} placeholder="Comprar" />
        <Field icon={<Link size={13} />} label="Links columna 1 (uno por línea, formato: Título|URL)" value={(s.footerCol1Links || []).map(l => `${l.title}|${l.url}`).join('\n')} onChange={v => {
          const lines = v.split('\n').filter(Boolean).map(line => {
            const [title, url] = line.split('|');
            return { title: title?.trim() || '', url: url?.trim() || '' };
          });
          onUpdate({ footerCol1Links: lines });
        }} placeholder="Todos los productos|/productos&#10;Kits de maquillaje|/productos?categoria=kits" />
        <Field icon={<Type size={13} />} label="Título columna 2" value={s.footerCol2Title || 'Ayuda'} onChange={v => onUpdate({ footerCol2Title: v })} placeholder="Ayuda" />
        <Field icon={<Link size={13} />} label="Links columna 2 (uno por línea, formato: Título|URL)" value={(s.footerCol2Links || []).map(l => `${l.title}|${l.url}`).join('\n')} onChange={v => {
          const lines = v.split('\n').filter(Boolean).map(line => {
            const [title, url] = line.split('|');
            return { title: title?.trim() || '', url: url?.trim() || '' };
          });
          onUpdate({ footerCol2Links: lines });
        }} placeholder="Envíos y entregas|/envios&#10;Devoluciones|/devoluciones" />
        <Field icon={<Type size={13} />} label="Título columna 3" value={s.footerCol3Title || 'Contacto'} onChange={v => onUpdate({ footerCol3Title: v })} placeholder="Contacto" />
        <Field icon={<Link size={13} />} label="Links columna 3 (uno por línea, formato: Título|URL)" value={(s.footerCol3Links || []).map(l => `${l.title}|${l.url}`).join('\n')} onChange={v => {
          const lines = v.split('\n').filter(Boolean).map(line => {
            const [title, url] = line.split('|');
            return { title: title?.trim() || '', url: url?.trim() || '' };
          });
          onUpdate({ footerCol3Links: lines });
        }} placeholder="WhatsApp|https://wa.me/56912345678&#10;Instagram|https://instagram.com/yaxsell" />
        <Field icon={<Type size={13} />} label="Título columna 4 / Newsletter" value={s.footerCol4Title || 'Suscríbete'} onChange={v => onUpdate({ footerCol4Title: v })} placeholder="Suscríbete" />
        <SH>Contacto</SH>
        <Field icon={<Type size={13} />} label="Dirección" value={s.address || ''} onChange={v => onUpdate({ address: v })} placeholder="Calle, Ciudad, País" />
        <Field icon={<Type size={13} />} label="Teléfono" value={s.phone || ''} onChange={v => onUpdate({ phone: v })} placeholder="+56 9 1234 5678" />
        <Field icon={<Type size={13} />} label="Email" value={s.email || 'contacto@yaxsell.cl'} onChange={v => onUpdate({ email: v })} placeholder="contacto@yaxsell.cl" />
        <SH>Redes sociales</SH>
        <Field icon={<Type size={13} />} label="Instagram" value={s.instagram || ''} onChange={v => onUpdate({ instagram: v })} placeholder="@usuario" />
        <Field icon={<Type size={13} />} label="Facebook" value={s.facebook || ''} onChange={v => onUpdate({ facebook: v })} placeholder="pagina" />
        <Field icon={<Type size={13} />} label="TikTok" value={s.tiktok || ''} onChange={v => onUpdate({ tiktok: v })} placeholder="@usuario" />
        <Field icon={<Type size={13} />} label="WhatsApp" value={s.whatsapp || ''} onChange={v => onUpdate({ whatsapp: v })} placeholder="+56912345678" />
        <SH>Newsletter</SH>
        <Field icon={<Type size={13} />} label="Texto newsletter" value={s.newsletterText || ''} onChange={v => onUpdate({ newsletterText: v })} placeholder="Recibe ofertas exclusivas" />
        <SH>Copyright</SH>
        <Field icon={<Type size={13} />} label="Texto copyright" value={s.copyrightText || ''} onChange={v => onUpdate({ copyrightText: v })} placeholder="© 2025 Mi tienda" />
      </div>);

    case 'tpl1_map':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Visibilidad</SH>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={s.showMap !== false} onChange={e => onUpdate({ showMap: e.target.checked })} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Mostrar mapa interactivo</span>
        </div>
        <SH>Dirección</SH>
        <Field icon={<MapPin size={13} />} label="Dirección de la tienda" value={s.address || ''} onChange={v => onUpdate({ address: v })} placeholder="Av. Apoquindo 3000, Las Condes, Chile" />
        <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.4 }}>Si no configuras dirección, se usará la de <Link href="/admin/store-settings" target="_blank" style={{ color: '#6366f1', textDecoration: 'underline' }}>Mi Tienda</Link></div>
        <SH>Estilo</SH>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['dark', 'light', 'minimal'] as const).map(style => (
            <button key={style} onClick={() => onUpdate({ mapStyle: style })} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: s.mapStyle === style ? '2px solid #6366f1' : '1.5px solid #e5e7eb',
              background: s.mapStyle === style ? '#eef2ff' : '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: s.mapStyle === style ? '#4f46e5' : '#6b7280', textTransform: 'capitalize',
            }}>{style === 'dark' ? 'd Oscuro' : style === 'light' ? 'li Claro' : 'Cl Minimal'}</button>
          ))}
        </div>
        <Field icon={<Type size={13} />} label="Altura del mapa (px)" value={String(s.mapHeight || 280)} onChange={v => onUpdate({ mapHeight: parseInt(v) || 280 })} placeholder="280" />
        <SH>Embed personalizado</SH>
        <Field icon={<MapPin size={13} />} label="HTML del mapa (opcional, sobreescribe dirección)" value={s.mapEmbed || ''} onChange={v => onUpdate({ mapEmbed: v })} placeholder='<iframe src="https://www.google.com/maps/embed?..." />' />
        <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.4 }}>Pega aquí el código de embed de Google Maps para tener control total del mapa mostrado.</div>
      </div>);

    case 'cm_footer':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Logo</SH>
        <ImageUploadField label="Imagen del logo" value={s.logoUrl || ''} onChange={v => onUpdate({ logoUrl: v })} />
        <SH>Texto de marca</SH>
        <Field icon={<Type size={13} />} label="Descripción" value={s.description || ''} onChange={v => onUpdate({ description: v })} placeholder="Importación y distribución de alimentos asiáticos..." />
        <SH>Redes sociales</SH>
        <Field icon={<Link size={13} />} label="Instagram URL" value={s.buttonLink || ''} onChange={v => onUpdate({ buttonLink: v })} placeholder="https://instagram.com/..." />
      </div>);

    case 'announcement_bar':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Contenido</SH>
        <Field icon={<Type size={13} />} label="Texto del anuncio" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="c Envío gratis en compras sobre $30.000  ¡Aprovecha!" />
        <Field icon={<Link size={13} />} label="Link (opcional)" value={s.buttonLink || ''} onChange={v => onUpdate({ buttonLink: v })} placeholder="/productos" />
      </div>);

    case 'hero': {
      const slides = s.heroSlides || [];
      const updateSlide = (idx: number, patch: Partial<typeof slides[0]>) => {
        const updated = slides.map((sl, i) => i === idx ? { ...sl, ...patch } : sl);
        onUpdate({ heroSlides: updated });
      };
      const addSlide = () => {
        onUpdate({ heroSlides: [...slides, { imageUrl: '', title: 'Yaxsell', subtitle: 'E-COMMERCE', alignment: 'center' }] });
      };
      const removeSlide = (idx: number) => {
        onUpdate({ heroSlides: slides.filter((_, i) => i !== idx) });
      };
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Logo de la tienda</SH>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          {(['text', 'image'] as const).map(m => (
            <button key={m} onClick={() => onUpdate({ heroStoreLogoMode: m })}
              style={{ flex: 1, padding: '6px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1.5px solid ${s.heroStoreLogoMode === m ? '#5850ec' : '#e5e7eb'}`, background: s.heroStoreLogoMode === m ? '#eef2ff' : '#fff', color: s.heroStoreLogoMode === m ? '#5850ec' : '#374151', cursor: 'pointer' }}>
              {m === 'text' ? '  Texto' : '  Imagen'}
            </button>
          ))}
        </div>
        {s.heroStoreLogoMode === 'text' ? (
          <Field icon={<Type size={13} />} label="Nombre" value={s.heroStoreName || ''} onChange={v => onUpdate({ heroStoreName: v })} placeholder="Yaxsell" />
        ) : (
          <>
            <ImageUploadField label="Logo principal" value={s.heroStoreLogoUrl || ''} onChange={v => onUpdate({ heroStoreLogoUrl: v })} />
            <ImageUploadField label="Logo navbar (al scrollear)" value={s.heroStoreLogoScrollUrl || ''} onChange={v => onUpdate({ heroStoreLogoScrollUrl: v })} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
              <Field icon={<Monitor size={13} />} label="Altura Desktop (px)" value={String(s.heroStoreLogoHeight ?? 40)} onChange={v => onUpdate({ heroStoreLogoHeight: Number(v) || 40 })} placeholder="40" />
              <Field icon={<Smartphone size={13} />} label="Altura Móvil (px)" value={String(s.heroStoreLogoMobileHeight ?? 30)} onChange={v => onUpdate({ heroStoreLogoMobileHeight: Number(v) || 30 })} placeholder="30" />
            </div>
          </>
        )}

        <SH>Colores del texto</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ColorField label="Título" value={s.heroTitleColor || ''} onChange={v => onUpdate({ heroTitleColor: v })} />
          <ColorField label="Subtítulo" value={s.heroSubtitleColor || ''} onChange={v => onUpdate({ heroSubtitleColor: v })} />
        </div>

        <SH>Animación del título</SH>
        {(() => {
          const ANIMS = [
            { id: 'typing',     l: 'ng Typing',     desc: 'Efecto máquina de escribir' },
            { id: 'fadeIn',     l: 'I Fade In',     desc: 'Aparece suavemente' },
            { id: 'slideUp',    l: 'eU Slide Up',    desc: 'Sube desde abajo' },
            { id: 'scaleIn',    l: 'e Scale In',    desc: 'Crece desde el centro' },
            { id: 'blurIn',     l: 'rI Blur In',     desc: 'De borroso a nítido' },
            { id: 'splitChars', l: 'l Split Chars', desc: 'Cada letra aparece sola' },
            { id: 'glitch',     l: 'l Glitch',      desc: 'Efecto digital glitch' },
            { id: 'none',       l: ' Sin animación', desc: 'Sin efecto' },
          ];
          const current = s.heroTitleAnimation || 'typing';
          return (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {ANIMS.map(a => (
              <button key={a.id} onClick={() => onUpdate({ heroTitleAnimation: a.id as any })}
                style={{ padding: '5px 8px', fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1.5px solid ${current === a.id ? '#5850ec' : '#e5e7eb'}`, background: current === a.id ? '#eef2ff' : '#fff', color: current === a.id ? '#5850ec' : '#374151', cursor: 'pointer', textAlign: 'left' }}>
                {a.l}
              </button>
            ))}
          </div>);
        })()}

        <SH>Opciones</SH>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" checked={s.heroAutoplay ?? false} onChange={e => onUpdate({ heroAutoplay: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
          Autoplay
        </label>
        {s.heroAutoplay && (
          <RangeField label="Intervalo" value={s.heroDelay ?? 5000} onChange={v => onUpdate({ heroDelay: v })} min={2000} max={10000} unit="ms" />
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" checked={s.heroOverlayEnabled !== false} onChange={e => onUpdate({ heroOverlayEnabled: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
          Overlay oscuro
        </label>

        <SH>Partículas (solo desktop)</SH>
        <RangeField label="Cantidad" value={s.heroParticlesCount ?? 50} onChange={v => onUpdate({ heroParticlesCount: v })} min={0} max={50} unit="" />
        <RangeField label="Tamaño" value={s.heroParticlesSize ?? 2} onChange={v => onUpdate({ heroParticlesSize: v })} min={0.5} max={5} unit="px" step={0.1} />
        <ColorField label="Color base" value={s.heroParticlesColor || '#ffffff'} onChange={v => onUpdate({ heroParticlesColor: v })} />

        <SH>Slides ({slides.length})</SH>
        {slides.map((sl, idx) => (
          <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#5850ec' }}>Slide {idx + 1}</span>
              {slides.length > 1 && <button onClick={() => removeSlide(idx)} style={{ fontSize: 10, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>× Eliminar</button>}
            </div>
            <ImageUploadField label="Imagen de fondo (Desktop)" value={sl.imageUrl || ''} onChange={v => updateSlide(idx, { imageUrl: v })} />
            <ImageUploadField label="Imagen de fondo (Móvil)" value={sl.mobileImageUrl || ''} onChange={v => updateSlide(idx, { mobileImageUrl: v })} />
            {!sl.mobileImageUrl && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: -6 }}>Si no se define, se usa la imagen de Desktop</div>}
            <Field icon={<Type size={13} />} label="Título" value={sl.title || ''} onChange={v => updateSlide(idx, { title: v })} placeholder="Yaxsell" />
            <Field icon={<Type size={13} />} label="Subtítulo" value={sl.subtitle || ''} onChange={v => updateSlide(idx, { subtitle: v })} placeholder="E-COMMERCE" />
            <Field icon={<Type size={13} />} label="Descripción" value={sl.description || ''} onChange={v => updateSlide(idx, { description: v })} placeholder="Texto descriptivo opcional" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <Field icon={<Type size={13} />} label="Botón 1" value={sl.btnPrimaryText || ''} onChange={v => updateSlide(idx, { btnPrimaryText: v })} placeholder="MÁS INFO" />
              <Field icon={<Link size={13} />} label="Link" value={sl.btnPrimaryLink || ''} onChange={v => updateSlide(idx, { btnPrimaryLink: v })} placeholder="/productos" />
              <Field icon={<Type size={13} />} label="Botón 2" value={sl.btnSecondaryText || ''} onChange={v => updateSlide(idx, { btnSecondaryText: v })} placeholder="COMPRAR AHORA" />
              <Field icon={<Link size={13} />} label="Link" value={sl.btnSecondaryLink || ''} onChange={v => updateSlide(idx, { btnSecondaryLink: v })} placeholder="/colecciones" />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['left', 'center', 'right'] as const).map(a => (
                <button key={a} onClick={() => updateSlide(idx, { alignment: a })}
                  style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, borderRadius: 4, border: `1.5px solid ${sl.alignment === a ? '#5850ec' : '#e5e7eb'}`, background: sl.alignment === a ? '#eef2ff' : '#fff', color: sl.alignment === a ? '#5850ec' : '#374151', cursor: 'pointer' }}>
                  {a === 'left' ? 'a Izq' : a === 'center' ? '= Centro' : 'Der  '}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button onClick={addSlide} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1.5px dashed #5850ec', background: '#fafafe', color: '#5850ec', cursor: 'pointer' }}>
          + Agregar slide
        </button>
      </div>);
    }

    case 'hero_carousel':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <HeroBannerEditor onSaved={onIframeReload} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" checked={s.showViewAll ?? false} onChange={e => onUpdate({ showViewAll: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
          Mostrar flechas de navegación
        </label>
      </div>);

    case 'categories':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Contenido</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Categorías" />
        <AdminLink href="/admin/categories" label="Las categorías se gestionan desde Categorías" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" checked={s.showViewAll ?? true} onChange={e => onUpdate({ showViewAll: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
          Mostrar "Ver todas"
        </label>
      </div>);

    case 'products_grid':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Contenido</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Productos destacados" />
        <Field icon={<Hash size={13} />} label="Cantidad" value={String(s.itemsCount || '')} onChange={v => onUpdate({ itemsCount: parseInt(v) || undefined })} placeholder="12" type="number" />
        <AdminLink href="/admin/products" label="Los productos se gestionan desde Productos" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" checked={s.showViewAll ?? true} onChange={e => onUpdate({ showViewAll: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
          Mostrar "Ver todos"
        </label>
      </div>);

    case 'offers_featured':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Contenido</SH>
        <Field icon={<Type size={13} />} label="Título ofertas" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Oferta limitada" />
        <Field icon={<Type size={13} />} label="Título destacados" value={s.subtitle || ''} onChange={v => onUpdate({ subtitle: v })} placeholder="Productos destacados" />
      </div>);

    case 'collage':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Contenido</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Explora nuestra colección" />
        <AdminLink href="/admin/hotspot-banners" label="El collage se gestiona desde Collage Interactivo" />
      </div>);

    case 'recommended':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Contenido</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Recomendados para ti" />
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.subtitle || ''} onChange={v => onUpdate({ subtitle: v })} placeholder="Sabemos lo que te gusta" />
        <Field icon={<Hash size={13} />} label="Cantidad" value={String(s.itemsCount || '')} onChange={v => onUpdate({ itemsCount: parseInt(v) || undefined })} placeholder="8" type="number" />
      </div>);

    case 'tpl1_coupon_banner':
    case 'coupon_banner':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Contenido</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Ej: Oferta especial" />
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.subtitle || ''} onChange={v => onUpdate({ subtitle: v })} placeholder="Ej: Usa este código en tu compra" />
        <Field icon={<Link size={13} />} label="Link del botón" value={s.buttonLink || ''} onChange={v => onUpdate({ buttonLink: v })} placeholder="/productos" />
        <div style={{ padding: 10, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#166534', marginBottom: 4 }}>Info</div>
          <div style={{ fontSize: 10, color: '#15803d', lineHeight: 1.5 }}>
            El cupón se carga automáticamente desde la base de datos. Si no hay cupones activos, se muestra un demo.
          </div>
        </div>
      </div>);

    case 'feature_cards':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Contenido</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Título" />
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.subtitle || ''} onChange={v => onUpdate({ subtitle: v })} placeholder="Subtítulo" />
      </div>);

    case 'before_after':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Texto de la sección</SH>
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.beforeAfterSubtitle || ''} onChange={v => onUpdate({ beforeAfterSubtitle: v })} placeholder="COMPRA NUESTROS FAVORITOS" />
        <Field icon={<Type size={13} />} label="Título" value={s.beforeAfterTitle || ''} onChange={v => onUpdate({ beforeAfterTitle: v })} placeholder="ANTES Y DESPUÉS" />
        <Field icon={<Type size={13} />} label="Descripción" value={s.beforeAfterDescription || ''} onChange={v => onUpdate({ beforeAfterDescription: v })} placeholder="Ve resultados reales..." />
        <SH>Imágenes</SH>
        <ImageUploadField label="Imagen antes" value={s.beforeAfterBeforeImage || ''} onChange={v => onUpdate({ beforeAfterBeforeImage: v })} />
        <ImageUploadField label="Imagen después" value={s.beforeAfterAfterImage || ''} onChange={v => onUpdate({ beforeAfterAfterImage: v })} />
        <SH>Etiquetas</SH>
        <Field icon={<Type size={13} />} label="Texto antes" value={s.beforeAfterBeforeLabel || ''} onChange={v => onUpdate({ beforeAfterBeforeLabel: v })} placeholder="Antes" />
        <Field icon={<Type size={13} />} label="Texto después" value={s.beforeAfterAfterLabel || ''} onChange={v => onUpdate({ beforeAfterAfterLabel: v })} placeholder="Después" />
      </div>);

    case 'products_filter': {
      const selectedIds = s.productsFilterCategoryIds || [];
      const toggleCat = (id: string) => {
        const next = selectedIds.includes(id)
          ? selectedIds.filter(x => x !== id)
          : [...selectedIds, id];
        onUpdate({ productsFilterCategoryIds: next });
      };
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Texto de la sección</SH>
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.productsFilterSubtitle || ''} onChange={v => onUpdate({ productsFilterSubtitle: v })} placeholder="SELECCIONES TOP" />
        <Field icon={<Type size={13} />} label="Título" value={s.productsFilterTitle || ''} onChange={v => onUpdate({ productsFilterTitle: v })} placeholder="PESTAÑA DE COLECCIÓN" />
        <Field icon={<Type size={13} />} label="Descripción" value={s.productsFilterDescription || ''} onChange={v => onUpdate({ productsFilterDescription: v })} placeholder="Navega por nuestras colecciones..." />
        <SH>Categorías a mostrar como pestañas</SH>
        <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>
          {collCatLoading ? 'Cargando categorías...' : `${collCategories.length} categorías disponibles · ${selectedIds.length} seleccionadas`}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, padding: 6, background: '#f9fafb' }}>
          {collCategories.map(cat => {
            const checked = selectedIds.includes(cat.$id);
            return (
              <label key={cat.$id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, background: checked ? '#eef2ff' : '#fff', cursor: 'pointer', border: checked ? '1px solid #c7d2fe' : '1px solid #e5e7eb' }}>
                <input type="checkbox" checked={checked} onChange={() => toggleCat(cat.$id)} />
                {cat.iconUrl && <img src={cat.iconUrl} alt={cat.name} style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 4 }} />}
                <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{cat.name}</span>
              </label>
            );
          })}
        </div>
        <SH>Productos por categoría</SH>
        <RangeField label="Cantidad" value={s.productsFilterPerCategory ?? 8} onChange={v => onUpdate({ productsFilterPerCategory: v })} min={4} max={20} unit="" />
      </div>);
    }

    case 'countdown': {
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Oferta de Appwrite</SH>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Vincular a oferta de tiempo limitado</label>
          <select
            value={s.countdownOfferId || ''}
            onChange={e => onUpdate({ countdownOfferId: e.target.value })}
            style={{ padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#1f2937' }}
          >
            <option value="">{countdownOffersLoading ? 'Cargando...' : ' Sin oferta vinculada (modo manual) '}</option>
            {countdownOffers.map(o => {
              const status = !o.isActive ? '  Pausada' : o.status === 'active' ? '= Activa' : '? ' + o.status;
              return <option key={o.$id} value={o.$id}>{o.title}  {o.productName} ({status})</option>;
            })}
          </select>
        </div>
        <SH>Texto de la sección</SH>
        <Field icon={<Type size={13} />} label="Texto del slider superior" value={s.countdownSlideText || ''} onChange={v => onUpdate({ countdownSlideText: v })} placeholder="COMPRA UNO Y LLEVA OTRO GRATIS" />
        <Field icon={<Type size={13} />} label="Título principal" value={s.countdownTitle || ''} onChange={v => onUpdate({ countdownTitle: v })} placeholder="MASCARILLA FACIAL FEMENINA" />
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.countdownSubtitle || ''} onChange={v => onUpdate({ countdownSubtitle: v })} placeholder="Entra al mundo de la elegancia..." />
        <Field icon={<Type size={13} />} label="Texto del botón" value={s.countdownButtonText || ''} onChange={v => onUpdate({ countdownButtonText: v })} placeholder="COMPRAR AHORA" />
        <SH>Imagen y efectos visuales</SH>
        <ImageUploadField label="Imagen de fondo" value={s.countdownBackgroundImage || ''} onChange={v => onUpdate({ countdownBackgroundImage: v })} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <input
            type="checkbox"
            checked={s.countdownHideOverlay || false}
            onChange={e => onUpdate({ countdownHideOverlay: e.target.checked })}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }} onClick={() => onUpdate({ countdownHideOverlay: !s.countdownHideOverlay })}>
            Ocultar capa oscura y carrusel de texto
          </label>
        </div>
        {!s.countdownHideOverlay && (
          <RangeField label="Opacidad de la capa oscura" value={s.countdownOverlayOpacity ?? 50} onChange={v => onUpdate({ countdownOverlayOpacity: v })} min={0} max={100} unit="%" />
        )}
      </div>);
    }

    case 'featured_product': {
      const onProductSelect = (pid: string) => {
        onUpdate({ featuredProductProductId: pid });
      };

      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Texto de sección</SH>
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.featuredProductSubtitle || ''} onChange={v => onUpdate({ featuredProductSubtitle: v })} placeholder="REVERSO INSTANTÁNEO DE LA EDAD" />
        <Field icon={<Type size={13} />} label="Título" value={s.featuredProductTitle || ''} onChange={v => onUpdate({ featuredProductTitle: v })} placeholder="PRODUCTO DESTACADO" />
        <Field icon={<Type size={13} />} label="Descripción" value={s.featuredProductDescription || ''} onChange={v => onUpdate({ featuredProductDescription: v })} placeholder="Conoce nuestro producto destacado..." />
        <SH>Tipografía</SH>
        <Field icon={<Type size={13} />} label="Fuente" value={s.featuredProductFontFamily || ''} onChange={v => onUpdate({ featuredProductFontFamily: v })} placeholder="Playfair Display, Georgia, serif" />
        <RangeField label="Tamaño" value={s.featuredProductFontSize ?? 24} onChange={v => onUpdate({ featuredProductFontSize: v })} min={12} max={72} unit="px" />
        <RangeField label="Peso" value={s.featuredProductFontWeight ?? 600} onChange={v => onUpdate({ featuredProductFontWeight: v })} min={100} max={900} unit="" />
        <Field icon={<Palette size={13} />} label="Color" value={s.featuredProductColor || ''} onChange={v => onUpdate({ featuredProductColor: v })} placeholder="#000000" />
        <SH>Contenido visual</SH>
        <ImageUploadField label="Imagen personalizada (reemplaza la del producto)" value={s.featuredProductPosterImage || ''} onChange={v => onUpdate({ featuredProductPosterImage: v })} />
        <Field icon={<Video size={13} />} label="Video URL (MP4/WebM opcional)" value={s.featuredProductVideoUrl || ''} onChange={v => onUpdate({ featuredProductVideoUrl: v })} placeholder="https://cdn.example.com/video.mp4" />
        <SH>Producto de Appwrite</SH>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Vincular producto</label>
          <select
            value={s.featuredProductProductId || ''}
            onChange={e => onProductSelect(e.target.value)}
            style={{ padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#1f2937' }}
          >
            <option value="">{widgetProdLoading ? 'Cargando...' : ' Seleccionar producto '}</option>
            {widgetProducts.map(p => (
              <option key={p.$id} value={p.$id}>{p.NAME}  ${p.CURRENTPRICE ?? p.PRICE}</option>
            ))}
          </select>
        </div>
      </div>);
    }

    case 'product_widget': {
      const onProductSelect = (pid: string) => {
        const p = widgetProducts.find(x => x.$id === pid);
        if (p) {
          onUpdate({
            productWidgetProductId: pid,
            productWidgetTitle: p.NAME,
            productWidgetPrice: p.CURRENTPRICE ? `$${p.CURRENTPRICE}` : p.PRICE ? `$${p.PRICE}` : '',
            productWidgetImageUrl: p.IMAGEURL || '',
            productWidgetLink: `/producto/${p.$id}`,
          });
        } else {
          onUpdate({ productWidgetProductId: '' });
        }
      };

      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Producto flotante del Hero</SH>
        <SelectField label="Modo de productos" value={s.productWidgetMode || 'single'} onChange={v => onUpdate({ productWidgetMode: v as SectionSettings['productWidgetMode'] })}
          options={[{ v: 'single', l: 'Producto único' }, { v: 'category', l: 'Por categoría' }, { v: 'subcategory', l: 'Por subcategoría' }, { v: 'random', l: 'Todos aleatorios' }]} />

        {s.productWidgetMode === 'single' || !s.productWidgetMode ? (<>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>r Vincular producto</label>
            <select
              value={s.productWidgetProductId || ''}
              onChange={e => onProductSelect(e.target.value)}
              style={{ padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#1f2937' }}
            >
              <option value="">{widgetProdLoading ? 'Cargando...' : ' Seleccionar producto '}</option>
              {widgetProducts.map(p => (
                <option key={p.$id} value={p.$id}>{p.NAME}  ${p.CURRENTPRICE ?? p.PRICE}</option>
              ))}
            </select>
          </div>
          <ImageUploadField label="Foto del producto" value={s.productWidgetImageUrl || ''} onChange={v => onUpdate({ productWidgetImageUrl: v })} />
          <Field icon={<Type size={13} />} label="Nombre / título" value={s.productWidgetTitle || ''} onChange={v => onUpdate({ productWidgetTitle: v })} placeholder="Título del Producto" />
          <Field icon={<Type size={13} />} label="Precio" value={s.productWidgetPrice || ''} onChange={v => onUpdate({ productWidgetPrice: v })} placeholder="$20.00" />
        </>) : (<>
          <SelectField label="Cantidad de productos" value={String(s.productWidgetProductCount || 10)} onChange={v => onUpdate({ productWidgetProductCount: parseInt(v) })}
            options={[{ v: '10', l: '10 productos' }, { v: '20', l: '20 productos' }, { v: '30', l: '30 productos' }]} />
          {(s.productWidgetMode === 'category' || s.productWidgetMode === 'subcategory') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>o Categoría</label>
              <select
                value={s.productWidgetCategoryId || ''}
                onChange={e => onUpdate({ productWidgetCategoryId: e.target.value, productWidgetSubcategoryId: '' })}
                style={{ padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#1f2937' }}
              >
                <option value="">{collCatLoading ? 'Cargando...' : ' Seleccionar categoría '}</option>
                {collCategories.map(c => (
                  <option key={c.$id} value={c.$id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          {s.productWidgetMode === 'subcategory' && s.productWidgetCategoryId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>l Subcategoría</label>
              <select
                value={s.productWidgetSubcategoryId || ''}
                onChange={e => onUpdate({ productWidgetSubcategoryId: e.target.value })}
                style={{ padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#1f2937' }}
              >
                <option value=""> Seleccionar subcategoría </option>
                {widgetSubcategories.map(sc => (
                  <option key={sc.$id} value={sc.$id}>{sc.NAME}</option>
                ))}
              </select>
            </div>
          )}
        </>)}

        <SH>Diseño de tarjeta</SH>
        <ColorField label="Color de fondo" value={s.productWidgetBgColor || 'rgba(255, 192, 203, 0.15)'} onChange={v => onUpdate({ productWidgetBgColor: v })} />
        <ColorField label="Color de borde" value={s.productWidgetBorderColor || 'rgba(255, 192, 203, 0.3)'} onChange={v => onUpdate({ productWidgetBorderColor: v })} />
        <RangeField label="Blur del fondo" value={s.productWidgetBlur ?? 10} onChange={v => onUpdate({ productWidgetBlur: v })} min={0} max={30} unit="px" />
        <RangeField label="Redondez de tarjeta" value={s.productWidgetBorderRadius ?? 16} onChange={v => onUpdate({ productWidgetBorderRadius: v })} min={0} max={30} unit="px" />
        <SH>Diseño de botón</SH>
        <ColorField label="Color de botón" value={s.productWidgetButtonColor || '#e396bf'} onChange={v => onUpdate({ productWidgetButtonColor: v })} />
        <ColorField label="Color de texto del botón" value={s.productWidgetButtonTextColor || '#ffffff'} onChange={v => onUpdate({ productWidgetButtonTextColor: v })} />
        <RangeField label="Redondez del botón" value={s.productWidgetButtonRadius ?? 8} onChange={v => onUpdate({ productWidgetButtonRadius: v })} min={0} max={30} unit="px" />
        <RangeField label="Padding del botón" value={s.productWidgetButtonPadding ?? 12} onChange={v => onUpdate({ productWidgetButtonPadding: v })} min={8} max={24} unit="px" />
        <RangeField label="Tamaño de texto del botón" value={s.productWidgetButtonFontSize ?? 14} onChange={v => onUpdate({ productWidgetButtonFontSize: v })} min={10} max={20} unit="px" />
        <SelectField label="Sombra del botón" value={s.productWidgetShadow || 'none'} onChange={v => onUpdate({ productWidgetShadow: v as SectionSettings['productWidgetShadow'] })}
          options={[{ v: 'none', l: 'Sin sombra' }, { v: 'sm', l: 'Pequeña' }, { v: 'md', l: 'Mediana' }, { v: 'lg', l: 'Grande' }]} />
        <SelectField label="Acción del botón" value={s.productWidgetButtonAction || 'link'} onChange={v => onUpdate({ productWidgetButtonAction: v as SectionSettings['productWidgetButtonAction'] })}
          options={[{ v: 'link', l: 'Ir al producto' }, { v: 'add_to_cart', l: 'Añadir al carrito' }]} />
        <Field icon={<Type size={13} />} label="Texto botón" value={s.productWidgetButtonText || ''} onChange={v => onUpdate({ productWidgetButtonText: v })} placeholder="Comprar Ahora" />
        {(!s.productWidgetButtonAction || s.productWidgetButtonAction === 'link') && (
          <Field icon={<Link size={13} />} label="Link botón / producto" value={s.productWidgetLink || ''} onChange={v => onUpdate({ productWidgetLink: v })} placeholder="/productos" />
        )}
        <SH>Posición</SH>
        <RangeField label="Posición vertical" value={s.productWidgetPositionY ?? 70} onChange={v => onUpdate({ productWidgetPositionY: v })} min={0} max={100} unit="%" />
        <RangeField label="Posición horizontal" value={s.productWidgetPositionX ?? 50} onChange={v => onUpdate({ productWidgetPositionX: v })} min={0} max={100} unit="%" />
        <Field icon={<Hash size={13} />} label="Duración por slide (segundos)" value={String(s.productWidgetDuration || '')} onChange={v => onUpdate({ productWidgetDuration: parseInt(v) || undefined })} placeholder="5" type="number" />
      </div>);
    }

    /*  ─ Catalog sections with rich content  ─ */
    case 'banner_image':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Imagen de fondo</SH>
        <ImageUploadField label="Imagen del banner" value={s.imageUrl || ''} onChange={v => onUpdate({ imageUrl: v })} />
        <RangeField label="Opacidad de máscara" value={s.maskOpacity ?? 1} onChange={v => onUpdate({ maskOpacity: v })} min={0} max={1} unit="" />
        <SH>Contenido</SH>
        <Field icon={<Type size={13} />} label="Título principal" value={s.overlayText || ''} onChange={v => onUpdate({ overlayText: v })} placeholder="¡Gran promoción de temporada!" />
        <TextArea label="Subtítulo / descripción" value={s.subtitle || ''} onChange={v => onUpdate({ subtitle: v })} placeholder="Texto secundario debajo del título..." rows={2} />
        <Field icon={<Type size={13} />} label="Texto del botón" value={s.buttonText || ''} onChange={v => onUpdate({ buttonText: v })} placeholder="Ver más" />
        <Field icon={<Link size={13} />} label="Link del botón" value={s.buttonLink || ''} onChange={v => onUpdate({ buttonLink: v })} placeholder="/productos" />
      </div>);

    case 'image_text':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Imagen</SH>
        <ImageUploadField label="Imagen de la sección" value={s.imageUrl || ''} onChange={v => onUpdate({ imageUrl: v })} />
        <SH>Posición de imagen</SH>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['left', 'right'] as const).map(pos => (
            <button key={pos} onClick={() => onUpdate({ imagePosition: pos })}
              style={{ flex: 1, padding: '8px', borderRadius: 6, border: `1.5px solid ${(s.imagePosition || 'left') === pos ? '#5850ec' : '#e5e7eb'}`, background: (s.imagePosition || 'left') === pos ? '#ede9fe' : '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: (s.imagePosition || 'left') === pos ? '#5850ec' : '#6b7280' }}>
              {pos === 'left' ? 'Imagen izquierda' : 'Imagen derecha'}
            </button>
          ))}
        </div>
        <SH>Texto</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Nuestra historia" />
        <TextArea label="Descripción" value={s.description || ''} onChange={v => onUpdate({ description: v })} placeholder="Cuenta la historia de tu marca aquí..." rows={4} />
        <Field icon={<Type size={13} />} label="Texto del botón" value={s.buttonText || ''} onChange={v => onUpdate({ buttonText: v })} placeholder="Saber más" />
        <Field icon={<Link size={13} />} label="Link del botón" value={s.buttonLink || ''} onChange={v => onUpdate({ buttonLink: v })} placeholder="/nosotros" />
      </div>);

    case 'video':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Video</SH>
        <Field icon={<span>{'>'}</span>} label="URL (YouTube/Vimeo)" value={s.videoUrl || ''} onChange={v => onUpdate({ videoUrl: v })} placeholder="https://youtube.com/watch?v=..." />
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Título del video" />
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.subtitle || ''} onChange={v => onUpdate({ subtitle: v })} placeholder="Descripción breve" />
      </div>);

    case 'testimonials':
      return <TestimonialsEditor settings={s} onUpdate={onUpdate} />;

    case 'brand_logos':
      return <LogosEditor settings={s} onUpdate={onUpdate} />;

    case 'faq':
      return <FaqEditor settings={s} onUpdate={onUpdate} />;

    case 'tpl1_service_icons': {
      const svcItems = (s.items || []) as { icon: string; title: string; description: string }[];
      const addSvcItem = () => onUpdate({ items: [...svcItems, { icon: 'truck', title: '', description: '' }] });
      const removeSvcItem = (i: number) => { const n = [...svcItems]; n.splice(i, 1); onUpdate({ items: n }); };
      const updateSvcItem = (i: number, key: string, val: string) => { const n = [...svcItems]; n[i] = { ...n[i], [key]: val }; onUpdate({ items: n }); };
      const iconOptions = [
        { value: 'truck', label: ': Envío' },
        { value: 'shield-check', label: 'el Seguridad' },
        { value: 'message-circle', label: 'a Mensaje' },
        { value: 'sparkles', label: ': Destacado' },
        { value: 'heart-handshake', label: 't Confianza' },
        { value: 'refresh-cw', label: '  Devolución' },
        { value: 'gift', label: '  Regalo' },
        { value: 'headset', label: 'a Soporte' },
        { value: 'lock', label: '  Protegido' },
        { value: 'badge-check', label: 'u Verificado' },
        { value: 'package', label: '  Paquete' },
        { value: 'credit-card', label: 'l Pago' },
        { value: 'map-pin', label: '  Ubicación' },
        { value: 'phone', label: '  Teléfono' },
        { value: 'star', label: '  Estrella' },
      ];
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Iconos de Servicios</SH>
        <Field icon={<Type size={13} />} label="Título de sección" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="¿Por qué elegirnos?" />
        {svcItems.map((item, i) => (
          <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>Servicio #{i + 1}</span>
              <button onClick={() => removeSvcItem(i)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>S</button>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, display: 'block' }}>Icono</label>
              <select value={item.icon} onChange={e => updateSvcItem(i, 'icon', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none', background: '#fff' }}>
                {iconOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <Field icon={<Type size={13} />} label="Título" value={item.title} onChange={v => updateSvcItem(i, 'title', v)} placeholder="Envío a Todo Chile" />
            <Field icon={<Type size={13} />} label="Descripción" value={item.description} onChange={v => updateSvcItem(i, 'description', v)} placeholder="Despacho rápido y seguro" />
          </div>
        ))}
        <DashedAddBtn onClick={addSvcItem} label="+ Agregar servicio" />
      </div>);
    }

    case 'tpl1_footer':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Logo de la empresa</SH>
        <ImageUploadField label="Logo del footer" value={s.logoUrl || ''} onChange={v => onUpdate({ logoUrl: v })} />
        <RangeField label="Ancho del logo" value={s.footerLogoWidth ?? 170} onChange={v => onUpdate({ footerLogoWidth: v })} min={60} max={400} unit="px" />
        <Field icon={<Type size={13} />} label="Nombre empresa" value={s.companyName || ''} onChange={v => onUpdate({ companyName: v })} placeholder="Yaxsell" />
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, display: 'block' }}>Descripción</label>
          <textarea value={s.companyDescription || ''} onChange={e => onUpdate({ companyDescription: e.target.value })} 
            placeholder="Descripción de la empresa..." rows={3} 
            style={{ width: '100%', padding: '8px 10px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none', resize: 'vertical' }} />
        </div>
        
        <SH>Títulos de columnas</SH>
        <Field icon={<Type size={13} />} label="Columna 1 (Soporte)" value={s.footerCol1Title || ''} onChange={v => onUpdate({ footerCol1Title: v })} placeholder="Soporte" />
        <Field icon={<Type size={13} />} label="Columna 2 (Enlaces)" value={s.footerCol2Title || ''} onChange={v => onUpdate({ footerCol2Title: v })} placeholder="Enlaces útiles" />
        <Field icon={<Type size={13} />} label="Columna 3 (Enlaces 2)" value={s.footerCol3Title || ''} onChange={v => onUpdate({ footerCol3Title: v })} placeholder="Enlaces útiles" />
        <Field icon={<Type size={13} />} label="Columna 4 (Newsletter)" value={s.footerCol4Title || ''} onChange={v => onUpdate({ footerCol4Title: v })} placeholder="Suscríbete para recibir correos" />
        
        <SH>Contacto</SH>
        <Field icon={<span>H</span>} label="Dirección" value={s.address || ''} onChange={v => onUpdate({ address: v })} placeholder="Dirección de la empresa" />
        <Field icon={<span> </span>} label="Teléfono" value={s.phone || ''} onChange={v => onUpdate({ phone: v })} placeholder="+56 9 1234 5678" />
        <Field icon={<span>"</span>} label="Email" value={s.email || ''} onChange={v => onUpdate({ email: v })} placeholder="info@yaxsell.com" />
        <Field icon={<span>m</span>} label="WhatsApp" value={s.whatsapp || ''} onChange={v => onUpdate({ whatsapp: v })} placeholder="+56912345678" />
        
        <SH>Redes Sociales</SH>
        <Field icon={<span>s</span>} label="Instagram" value={s.instagram || ''} onChange={v => onUpdate({ instagram: v })} placeholder="@yaxsell" />
        <Field icon={<span>e</span>} label="Facebook" value={s.facebook || ''} onChange={v => onUpdate({ facebook: v })} placeholder="yaxsell" />
        <Field icon={<span>s</span>} label="TikTok" value={s.tiktok || ''} onChange={v => onUpdate({ tiktok: v })} placeholder="@yaxsell" />
        
        <SH>Newsletter</SH>
        <Field icon={<Type size={13} />} label="Texto newsletter" value={s.newsletterText || ''} onChange={v => onUpdate({ newsletterText: v })} placeholder="Recibe ofertas exclusivas" />
        
        <SH>Copyright</SH>
        <Field icon={<Type size={13} />} label="Texto copyright" value={s.copyrightText || ''} onChange={v => onUpdate({ copyrightText: v })} placeholder="© 2025 Yaxsell" />
      </div>);

    case 'newsletter':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Newsletter</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Suscríbete" />
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.subtitle || ''} onChange={v => onUpdate({ subtitle: v })} placeholder="Recibe ofertas exclusivas" />
        <Field icon={<Type size={13} />} label="Placeholder" value={s.placeholder || ''} onChange={v => onUpdate({ placeholder: v })} placeholder="tu@email.com" />
        <Field icon={<Type size={13} />} label="Texto botón" value={s.buttonText || ''} onChange={v => onUpdate({ buttonText: v })} placeholder="Suscribirme" />
      </div>);

    case 'countdown':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Cuenta regresiva</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="¡Gran venta!" />
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="¡Gran venta!" />
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, display: 'block' }}> m Fecha objetivo</label>
          <input type="datetime-local" value={s.targetDate || ''} onChange={e => onUpdate({ targetDate: e.target.value })}
            style={{ width: '100%', padding: '8px 10px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none' }} />
        </div>
        <Field icon={<Type size={13} />} label="Texto CTA" value={s.ctaText || ''} onChange={v => onUpdate({ ctaText: v })} placeholder="Comprar ahora" />
        <Field icon={<Type size={13} />} label="Link CTA" value={s.ctaLink || ''} onChange={v => onUpdate({ ctaLink: v })} placeholder="/ofertas" />
        <Field icon={<span>ns</span>} label="Imagen fondo" value={s.imageUrl || ''} onChange={v => onUpdate({ imageUrl: v })} placeholder="https://..." />
      </div>);

    case 'logo_list':
      return <LogoListEditor settings={s} onUpdate={onUpdate} />;

    case 'rich_text':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Texto enriquecido</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Título" />
        <TextArea label="Contenido HTML" value={s.htmlContent || ''} onChange={v => onUpdate({ htmlContent: v })} placeholder="<h2>Título</h2><p>Contenido...</p>" rows={8} />
      </div>);

    case 'map':
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Mapa</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Encuéntranos" />
        <TextArea label="Embed Google Maps" value={s.mapEmbed || ''} onChange={v => onUpdate({ mapEmbed: v })} placeholder='<iframe src="..."...' rows={4} />
      </div>);

    case 'collection_list': {
      const items = (s.collectionItems || []) as CollectionItem[];
      const updateCollItems = (newItems: CollectionItem[]) => onUpdate({ collectionItems: newItems });
      const addCategory = (cat: Category) => {
        const exists = items.find(i => i.categoryId === cat.$id);
        if (exists) return;
        const imgUrl = (cat as any).BACKGROUND_IMAGE_URL || cat.iconUrl || '';
        updateCollItems([...items, { categoryId: cat.$id, name: cat.name, imageUrl: imgUrl, link: `/categoria/${cat.$id}` }]);
      };
      const removeItem = (idx: number) => updateCollItems(items.filter((_, i) => i !== idx));
      const updateItem = (idx: number, patch: Partial<CollectionItem>) => updateCollItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it));

      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Texto</SH>
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.collectionSubtitle || ''} onChange={v => onUpdate({ collectionSubtitle: v })} placeholder="COSMÉTICOS ACCESIBLES" />
        <Field icon={<Type size={13} />} label="Título" value={s.collectionTitle || ''} onChange={v => onUpdate({ collectionTitle: v })} placeholder="NUESTRAS COLECCIONES" />
        <Field icon={<Type size={13} />} label="Descripción" value={s.collectionDescription || ''} onChange={v => onUpdate({ collectionDescription: v })} placeholder="Explora nuestras colecciones..." />
        <SH>Agregar categoría</SH>
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value=""
            onChange={e => { const c = collCategories.find(x => x.$id === e.target.value); if (c) addCategory(c); }}
            style={{ flex: 1, padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}
          >
            <option value="">{collCatLoading ? 'Cargando...' : ' Seleccionar categoría '}</option>
            {collCategories.filter(c => !items.find(i => i.categoryId === c.$id)).map(c => (
              <option key={c.$id} value={c.$id}>{c.name}</option>
            ))}
          </select>
          <button onClick={() => collCategories.filter(c => !items.find(i => i.categoryId === c.$id)).forEach(c => addCategory(c))}
            style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Todas
          </button>
        </div>
        <SH>Colecciones ({items.length})</SH>
        <button onClick={() => updateCollItems([...items, { name: 'Nueva colección', imageUrl: '', link: '' }])}
          style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: '2px dashed #d1d5db', background: '#fff', cursor: 'pointer', color: '#6b7280' }}>
          + Agregar item manual
        </button>
        {items.length === 0 && <div style={{ fontSize: 11, color: '#9ca3af' }}>No hay colecciones. Agrega categorías arriba o crea un item manual.</div>}
        {items.map((item, idx) => (
          <div key={idx} style={{ background: '#f9fafb', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{item.name}</span>
              <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14 }}>{'×'}</button>
            </div>
            <ImageUploadField label="Imagen (subir archivo)" value={item.imageUrl || ''} onChange={v => updateItem(idx, { imageUrl: v })} />
            <Field icon={<Link size={13} />} label="O pegar URL de imagen" value={item.imageUrl || ''} onChange={v => updateItem(idx, { imageUrl: v })} placeholder="https://..." />
            <Field icon={<Type size={13} />} label="Nombre" value={item.name} onChange={v => updateItem(idx, { name: v })} placeholder="Nombre colección" />
            <Field icon={<Link size={13} />} label="Link al hacer click" value={item.link || ''} onChange={v => updateItem(idx, { link: v })} placeholder="/categoria/..." />
          </div>
        ))}
      </div>);
    }

    case 'featured_collection': {
      const items = (s.featuredCollectionItems || []) as CollectionItem[];
      const updateItems = (newItems: CollectionItem[]) => onUpdate({ featuredCollectionItems: newItems });
      const addCategory = (cat: Category) => {
        if (items.find(i => i.categoryId === cat.$id)) return;
        const iconUrl = cat.iconUrl || (cat as any).BACKGROUND_IMAGE_URL || '';
        updateItems([...items, { categoryId: cat.$id, name: cat.name, imageUrl: iconUrl, link: `/categoria/${cat.$id}` }]);
      };
      const removeItem = (idx: number) => updateItems(items.filter((_, i) => i !== idx));
      const updateItem = (idx: number, patch: Partial<CollectionItem>) => updateItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it));

      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Texto</SH>
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.featuredCollectionSubtitle || ''} onChange={v => onUpdate({ featuredCollectionSubtitle: v })} placeholder="ESTUDIO DE BELLEZA" />
        <Field icon={<Type size={13} />} label="Título" value={s.featuredCollectionTitle || ''} onChange={v => onUpdate({ featuredCollectionTitle: v })} placeholder="COLECCIONES DESTACADAS" />
        <Field icon={<Type size={13} />} label="Descripción" value={s.featuredCollectionDescription || ''} onChange={v => onUpdate({ featuredCollectionDescription: v })} placeholder="Descubre nuestras colecciones..." />
        <SH>Agregar categoría</SH>
        <div style={{ display: 'flex', gap: 6 }}>
          <select value="" onChange={e => { const c = collCategories.find(x => x.$id === e.target.value); if (c) addCategory(c); }}
            style={{ flex: 1, padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>
            <option value="">{collCatLoading ? 'Cargando...' : ' Seleccionar categoría '}</option>
            {collCategories.filter(c => !items.find(i => i.categoryId === c.$id)).map(c => <option key={c.$id} value={c.$id}>{c.name}</option>)}
          </select>
          <button onClick={() => collCategories.filter(c => !items.find(i => i.categoryId === c.$id)).forEach(c => addCategory(c))}
            style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Todas
          </button>
        </div>
        <SH>Categorías destacadas ({items.length})</SH>
        {items.length === 0 && <div style={{ fontSize: 11, color: '#9ca3af' }}>Agrega categorías para mostrarlas con su ícono al centro.</div>}
        {items.map((item, idx) => (
          <div key={idx} style={{ background: '#f9fafb', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{item.name}</span>
              <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14 }}>r</button>
            </div>
            <ImageUploadField label="Ícono de categoría" value={item.imageUrl || ''} onChange={v => updateItem(idx, { imageUrl: v })} />
            <Field icon={<Type size={13} />} label="Nombre" value={item.name} onChange={v => updateItem(idx, { name: v })} placeholder="Nombre categoría" />
            <Field icon={<Link size={13} />} label="Link" value={item.link || ''} onChange={v => updateItem(idx, { link: v })} placeholder="/categoria/..." />
          </div>
        ))}
      </div>);
    }

    case 'marquee': {
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Texto</SH>
        <Field icon={<Type size={13} />} label="Texto principal" value={s.marqueeText1 || ''} onChange={v => onUpdate({ marqueeText1: v })} placeholder="Beauty Redefined" />
        <Field icon={<Type size={13} />} label="Texto secundario (cursiva)" value={s.marqueeText2 || ''} onChange={v => onUpdate({ marqueeText2: v })} placeholder="Gracefully Ageless" />
        <Field icon={<Type size={13} />} label="Texto terciario" value={s.marqueeText3 || ''} onChange={v => onUpdate({ marqueeText3: v })} placeholder="Timeless Elegance" />
        <SH>Tipografía</SH>
        <Field icon={<Type size={13} />} label="Fuente" value={s.marqueeFontFamily || ''} onChange={v => onUpdate({ marqueeFontFamily: v })} placeholder="Playfair Display, Georgia, serif" />
        <RangeField label="Tamaño" value={s.marqueeFontSize ?? 24} onChange={v => onUpdate({ marqueeFontSize: v })} min={12} max={72} unit="px" />
        <RangeField label="Peso" value={s.marqueeFontWeight ?? 600} onChange={v => onUpdate({ marqueeFontWeight: v })} min={100} max={900} unit="" />
        <Field icon={<Palette size={13} />} label="Color" value={s.marqueeColor || ''} onChange={v => onUpdate({ marqueeColor: v })} placeholder="#000000" />
        <SH>Imágenes entre textos</SH>
        <ImageUploadField label="Imagen 1 (después del texto principal)" value={s.marqueeImage1 || ''} onChange={v => onUpdate({ marqueeImage1: v })} />
        <ImageUploadField label="Imagen 2 (después del texto secundario)" value={s.marqueeImage2 || ''} onChange={v => onUpdate({ marqueeImage2: v })} />
        <ImageUploadField label="Imagen 3 (después del texto terciario)" value={s.marqueeImage3 || ''} onChange={v => onUpdate({ marqueeImage3: v })} />
        <SH>Ajustes</SH>
        <RangeField label="Velocidad (duración)" value={s.marqueeSpeed ?? 18} onChange={v => onUpdate({ marqueeSpeed: v })} min={5} max={60} unit="s" />
        <RangeField label="Altura imagen" value={s.marqueeImageHeight ?? 50} onChange={v => onUpdate({ marqueeImageHeight: v })} min={20} max={150} unit="px" />
      </div>);
    }

    case 'marquee_2': {
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Texto</SH>
        <Field icon={<Type size={13} />} label="Texto principal" value={s.marquee2Text1 || ''} onChange={v => onUpdate({ marquee2Text1: v })} placeholder="Beauty Redefined" />
        <Field icon={<Type size={13} />} label="Texto secundario (cursiva)" value={s.marquee2Text2 || ''} onChange={v => onUpdate({ marquee2Text2: v })} placeholder="Gracefully Ageless" />
        <Field icon={<Type size={13} />} label="Texto terciario" value={s.marquee2Text3 || ''} onChange={v => onUpdate({ marquee2Text3: v })} placeholder="Timeless Elegance" />
        <SH>Tipografía</SH>
        <Field icon={<Type size={13} />} label="Fuente" value={s.marquee2FontFamily || ''} onChange={v => onUpdate({ marquee2FontFamily: v })} placeholder="Playfair Display, Georgia, serif" />
        <RangeField label="Tamaño" value={s.marquee2FontSize ?? 24} onChange={v => onUpdate({ marquee2FontSize: v })} min={12} max={72} unit="px" />
        <RangeField label="Peso" value={s.marquee2FontWeight ?? 600} onChange={v => onUpdate({ marquee2FontWeight: v })} min={100} max={900} unit="" />
        <Field icon={<Palette size={13} />} label="Color" value={s.marquee2Color || ''} onChange={v => onUpdate({ marquee2Color: v })} placeholder="#000000" />
        <SH>Imágenes entre textos</SH>
        <ImageUploadField label="Imagen 1 (después del texto principal)" value={s.marquee2Image1 || ''} onChange={v => onUpdate({ marquee2Image1: v })} />
        <ImageUploadField label="Imagen 2 (después del texto secundario)" value={s.marquee2Image2 || ''} onChange={v => onUpdate({ marquee2Image2: v })} />
        <ImageUploadField label="Imagen 3 (después del texto terciario)" value={s.marquee2Image3 || ''} onChange={v => onUpdate({ marquee2Image3: v })} />
        <SH>Ajustes</SH>
        <RangeField label="Velocidad (duración)" value={s.marquee2Speed ?? 18} onChange={v => onUpdate({ marquee2Speed: v })} min={5} max={60} unit="s" />
        <RangeField label="Altura imagen" value={s.marquee2ImageHeight ?? 32} onChange={v => onUpdate({ marquee2ImageHeight: v })} min={20} max={150} unit="px" />
      </div>);
    }

    case 'media_gallery': {
      const items = (s.mediaGalleryItems || [
        { title: 'Producto 1', mediaUrl: '', mediaType: 'video' },
        { title: 'Producto 2', mediaUrl: '', mediaType: 'video' },
        { title: 'Producto 3', mediaUrl: '', mediaType: 'video' },
        { title: 'Producto 4', mediaUrl: '', mediaType: 'video' },
        { title: 'Producto 5', mediaUrl: '', mediaType: 'video' },
      ]) as MediaGalleryItem[];
      const updateItems = (newItems: MediaGalleryItem[]) => onUpdate({ mediaGalleryItems: newItems });
      const updateItem = (idx: number, patch: Partial<MediaGalleryItem>) => updateItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it));

      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Título superior</SH>
        <Field icon={<Type size={13} />} label="Texto superior (ej. LLEGAN PRONTO A:)" value={s.mediaGalleryTopText || ''} onChange={v => onUpdate({ mediaGalleryTopText: v })} placeholder="LLEGAN PRONTO A:" />
        <Field icon={<Type size={13} />} label="Texto grande" value={s.mediaGalleryTitle || ''} onChange={v => onUpdate({ mediaGalleryTitle: v })} placeholder="Yaxsell" />
        <RangeField label="Altura del título" value={s.mediaGalleryTitleHeight ?? 0} onChange={v => onUpdate({ mediaGalleryTitleHeight: v })} min={0} max={50} unit="%" />
        <ColorField label="Color del texto" value={s.mediaGalleryTitleColor || '#000000'} onChange={v => onUpdate({ mediaGalleryTitleColor: v })} />
        <ColorField label="Color degradado (opcional)" value={s.mediaGalleryTitleGradientColor || ''} onChange={v => onUpdate({ mediaGalleryTitleGradientColor: v })} />
        <SelectField label="Animación" value={s.mediaGalleryTitleAnimation || 'none'} onChange={v => onUpdate({ mediaGalleryTitleAnimation: v as SectionSettings['mediaGalleryTitleAnimation'] })}
          options={[{ v: 'none', l: 'Sin animación' }, { v: 'pulse', l: 'Pulso' }, { v: 'fadeIn', l: 'Fade In' }, { v: 'slideUp', l: 'Slide Up' }]} />
        <SH>Bloques de productos (hasta 5)</SH>
        {items.map((item, idx) => (
          <div key={idx} style={{ background: '#f9fafb', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Producto {idx + 1}</div>
            <Field icon={<Type size={13} />} label="Nombre del producto" value={item.title || ''} onChange={v => updateItem(idx, { title: v })} placeholder="Nombre del producto" />
            {item.mediaType === 'video' ? (
              <>
                <Field icon={<Video size={13} />} label="URL del video" value={item.mediaUrl || ''} onChange={v => updateItem(idx, { mediaUrl: v })} placeholder="https://...mp4" />
                <ImageUploadField label="Poster / Thumbnail (opcional)" value={item.posterUrl || ''} onChange={v => updateItem(idx, { posterUrl: v })} />
              </>
            ) : (
              <ImageUploadField label="Imagen" value={item.mediaUrl || ''} onChange={v => updateItem(idx, { mediaUrl: v })} />
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => updateItem(idx, { mediaType: 'image' })} style={{ flex: 1, padding: '6px', borderRadius: 6, border: item.mediaType !== 'video' ? '1px solid #5850ec' : '1px solid #d1d5db', background: item.mediaType !== 'video' ? '#eef2ff' : '#fff', fontSize: 11, cursor: 'pointer' }}>Imagen</button>
              <button onClick={() => updateItem(idx, { mediaType: 'video' })} style={{ flex: 1, padding: '6px', borderRadius: 6, border: item.mediaType === 'video' ? '1px solid #5850ec' : '1px solid #d1d5db', background: item.mediaType === 'video' ? '#eef2ff' : '#fff', fontSize: 11, cursor: 'pointer' }}>Video</button>
              {items.length > 1 && (
                <button
                  onClick={() => updateItems(items.filter((_, i) => i !== idx))}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #ef4444',
                    background: '#fef2f2',
                    color: '#ef4444',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fee2e2';
                    e.currentTarget.style.borderColor = '#dc2626';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fef2f2';
                    e.currentTarget.style.borderColor = '#ef4444';
                  }}
                >
                  Eliminar
                </button>
              )}
            </div>
          </div>
        ))}
        {items.length < 5 && (
          <button
            onClick={() => updateItems([...items, { title: `Producto ${items.length + 1}`, mediaUrl: '', mediaType: 'video' }])}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 8,
              border: '2px dashed #5850ec',
              background: '#eef2ff',
              color: '#5850ec',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#dbeafe';
              e.currentTarget.style.borderColor = '#4f46e5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#eef2ff';
              e.currentTarget.style.borderColor = '#5850ec';
            }}
          >
            + Agregar bloque
          </button>
        )}
      </div>);
    }
    case 'shop_the_look': {
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Imágenes de productos (reemplazo)</SH>
        <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Dejar vacío para usar la imagen original del producto.</p>
        <ImageUploadField label="Producto 1" value={s.stlProductImage1 || ''} onChange={v => onUpdate({ stlProductImage1: v })} />
        <ImageUploadField label="Producto 2" value={s.stlProductImage2 || ''} onChange={v => onUpdate({ stlProductImage2: v })} />
        <ImageUploadField label="Producto 3" value={s.stlProductImage3 || ''} onChange={v => onUpdate({ stlProductImage3: v })} />
        <ImageUploadField label="Producto 4" value={s.stlProductImage4 || ''} onChange={v => onUpdate({ stlProductImage4: v })} />
      </div>);
    }

    case 'video_text': {
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Media (Video o Imagen)</SH>
        <Field icon={<Video size={13} />} label="URL del video (MP4/YouTube)" value={s.vtVideoUrl || ''} onChange={v => onUpdate({ vtVideoUrl: v })} placeholder="https://...mp4" />
        <ImageUploadField label="Imagen poster / reemplazo (PC)" value={s.vtPosterImage || ''} onChange={v => onUpdate({ vtPosterImage: v })} />
        <ImageUploadField label="Imagen poster (Móvil)" value={s.vtMobilePosterImage || ''} onChange={v => onUpdate({ vtMobilePosterImage: v })} />
        <SH>Posición y Diseño</SH>
        <SelectField label="Media a la" value={s.vtMediaPosition || 'left'} onChange={v => onUpdate({ vtMediaPosition: v as 'left'|'right' })}
          options={[{ v: 'left', l: 'Izquierda' }, { v: 'right', l: 'Derecha' }]} />
        <RangeField label="Border radius" value={s.vtBorderRadius ?? 50} onChange={v => onUpdate({ vtBorderRadius: v })} min={0} max={80} unit="px" />
        <ColorField label="Color de fondo" value={s.vtBgColor || ''} onChange={v => onUpdate({ vtBgColor: v })} />
        <SH>Texto</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.vtHeading || ''} onChange={v => onUpdate({ vtHeading: v })} placeholder="MUSK SUPER SHOCK HIGHLIGHTER" />
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.vtSubtitle || ''} onChange={v => onUpdate({ vtSubtitle: v })} placeholder="Tu opción favorita para ese brillo..." />
        <Field icon={<Type size={13} />} label="Descripción" value={s.vtDescription || ''} onChange={v => onUpdate({ vtDescription: v })} placeholder="Disfruta de envío rápido..." />
        <ColorField label="Color del título" value={s.vtHeadingColor || ''} onChange={v => onUpdate({ vtHeadingColor: v })} />
        <ColorField label="Color del texto" value={s.vtTextColor || ''} onChange={v => onUpdate({ vtTextColor: v })} />
        <SH>Botón</SH>
        <Field icon={<Type size={13} />} label="Texto del botón" value={s.vtBtnText || ''} onChange={v => onUpdate({ vtBtnText: v })} placeholder="MÁS INFO" />
        <Field icon={<Link size={13} />} label="Link del botón" value={s.vtBtnLink || ''} onChange={v => onUpdate({ vtBtnLink: v })} placeholder="/productos" />
      </div>);
    }

    case 'image_overlay': {
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Imagen / Video de fondo</SH>
        <ImageUploadField label="Imagen de fondo (PC)" value={s.overlayBgImage || ''} onChange={v => onUpdate({ overlayBgImage: v })} />
        <ImageUploadField label="Imagen de fondo (Móvil)" value={s.overlayMobileBgImage || ''} onChange={v => onUpdate({ overlayMobileBgImage: v })} />
        <RangeField label="Blur de imagen" value={s.overlayBlurAmount ?? 0} onChange={v => onUpdate({ overlayBlurAmount: v })} min={0} max={20} unit="px" />
        <Field icon={<Video size={13} />} label="Video de fondo (URL)" value={s.overlayVideoUrl || ''} onChange={v => onUpdate({ overlayVideoUrl: v })} placeholder="https://...mp4" />
        <SH>Overlay</SH>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" checked={s.overlayEnabled !== false} onChange={e => onUpdate({ overlayEnabled: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#5850ec' }} />
          Capa oscura (overlay)
        </label>
        {s.overlayEnabled !== false && (<>
          <RangeField label="Opacidad del overlay" value={s.overlayOpacity ?? 40} onChange={v => onUpdate({ overlayOpacity: v })} min={0} max={100} unit="%" />
          <ColorField label="Color del overlay" value={s.overlayColor || '#000000'} onChange={v => onUpdate({ overlayColor: v })} />
        </>)}
        <RangeField label="Border radius" value={s.overlayBorderRadius ?? 50} onChange={v => onUpdate({ overlayBorderRadius: v })} min={0} max={100} unit="px" />
        <SH>Texto</SH>
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.overlaySubheading || ''} onChange={v => onUpdate({ overlaySubheading: v })} placeholder="BRILLA CON ESTILO" />
        <Field icon={<Type size={13} />} label="Título" value={s.overlayHeading || ''} onChange={v => onUpdate({ overlayHeading: v })} placeholder="PRESUME TU FABULOSIDAD" />
        <Field icon={<Type size={13} />} label="Párrafo" value={s.overlayParagraph || ''} onChange={v => onUpdate({ overlayParagraph: v })} placeholder="Eleva tu look con elecciones audaces..." />
        <SH>Tipografía</SH>
        <Field icon={<Type size={13} />} label="Fuente" value={s.overlayFontFamily || ''} onChange={v => onUpdate({ overlayFontFamily: v })} placeholder="Playfair Display, Georgia, serif" />
        <RangeField label="Tamaño" value={s.overlayFontSize ?? 40} onChange={v => onUpdate({ overlayFontSize: v })} min={16} max={80} unit="px" />
        <RangeField label="Peso" value={s.overlayFontWeight ?? 700} onChange={v => onUpdate({ overlayFontWeight: v })} min={100} max={900} unit="" />
        <ColorField label="Color de texto" value={s.overlayTextColor || '#ffffff'} onChange={v => onUpdate({ overlayTextColor: v })} />
        <ColorField label="Color subtítulo" value={s.overlaySubheadingColor || '#f472b6'} onChange={v => onUpdate({ overlaySubheadingColor: v })} />
        <SH>Botón</SH>
        <Field icon={<Type size={13} />} label="Texto del botón" value={s.overlayBtnText || ''} onChange={v => onUpdate({ overlayBtnText: v })} placeholder="COMPRAR AHORA" />
        <Field icon={<Link size={13} />} label="Link del botón" value={s.overlayBtnLink || ''} onChange={v => onUpdate({ overlayBtnLink: v })} placeholder="/productos" />
        <SH>Partículas p</SH>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={s.overlayParticlesEnabled ?? false} onChange={e => onUpdate({ overlayParticlesEnabled: e.target.checked })} style={{ accentColor: '#6366f1' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Activar partículas</span>
        </label>
        {s.overlayParticlesEnabled && (<>
          <ColorField label="Color partículas" value={s.overlayParticlesColor || '#ffffff'} onChange={v => onUpdate({ overlayParticlesColor: v })} />
          <RangeField label="Tamaño" value={s.overlayParticlesSize ?? 3} onChange={v => onUpdate({ overlayParticlesSize: v })} min={1} max={8} unit="px" />
          <RangeField label="Opacidad" value={Math.round((s.overlayParticlesOpacity ?? 0.6) * 100)} onChange={v => onUpdate({ overlayParticlesOpacity: v / 100 })} min={10} max={100} unit="%" />
          <RangeField label="Cantidad" value={s.overlayParticlesCount ?? 30} onChange={v => onUpdate({ overlayParticlesCount: v })} min={5} max={80} unit="" />
        </>)}
      </div>);
    }

    default:
      return (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SH>Contenido</SH>
        <Field icon={<Type size={13} />} label="Título" value={s.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Título" />
        <Field icon={<Type size={13} />} label="Subtítulo" value={s.subtitle || ''} onChange={v => onUpdate({ subtitle: v })} placeholder="Subtítulo" />
        <Field icon={<Hash size={13} />} label="Items" value={String(s.itemsCount || '')} onChange={v => onUpdate({ itemsCount: parseInt(v) || undefined })} placeholder="8" type="number" />
      </div>);
  }
}

/* ârâ/â
â â âdâ>â
â â
â
â/ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   HERO BANNER EDITOR  inline Appwrite banner management
   âlâeâpârâeâaâeâmâaâmâtâ ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
function HeroBannerEditor({ onSaved }: { onSaved: () => void }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { databaseId } = getFirebaseConfig();
      const { databases } = getServices();
      const res = await databases.listDocuments(databaseId, BANNERS_COLLECTION, [Query.orderAsc('DISPLAYORDER'), Query.limit(20)]);
      setBanners(res.documents as unknown as Banner[]);
    } catch { setError('Error al cargar banners'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (id: string, data: Record<string, unknown>) => {
    try {
      setSaving(id);
      const { databaseId } = getFirebaseConfig();
      const { databases } = getServices();
      await databases.updateDocument(databaseId, BANNERS_COLLECTION, id, data);
      await load();
      onSaved();
    } catch { setError('Error al guardar'); }
    finally { setSaving(null); }
  };

  const createBanner = async () => {
    try {
      setAdding(true);
      const { databaseId } = getFirebaseConfig();
      const { databases } = getServices();
      const maxOrder = banners.length > 0 ? Math.max(...banners.map(b => b.DISPLAYORDER ?? 0)) : -1;
      await databases.createDocument(databaseId, BANNERS_COLLECTION, 'unique()', {
        TITLE: `Banner ${banners.length + 1}`,
        IMAGEURL: '',
        LINKURL: '',
        ISACTIVE: true,
        DISPLAYORDER: maxOrder + 1,
        DURATION: 5,
      });
      await load();
      onSaved();
    } catch { setError('Error al crear banner'); }
    finally { setAdding(false); }
  };

  const deleteBanner = async (id: string) => {
    if (!confirm('¿Eliminar este banner?')) return;
    try {
      setSaving(id);
      const { databaseId } = getFirebaseConfig();
      const { databases } = getServices();
      await databases.deleteDocument(databaseId, BANNERS_COLLECTION, id);
      await load();
      onSaved();
    } catch { setError('Error al eliminar'); }
    finally { setSaving(null); }
  };

  const toggleActive = (b: Banner) => save(b.$id, { ISACTIVE: !b.ISACTIVE });
  const moveUp = (i: number) => {
    if (i === 0) return;
    const prev = banners[i - 1]; const curr = banners[i];
    save(curr.$id, { DISPLAYORDER: prev.DISPLAYORDER ?? i - 1 }).then(() =>
      save(prev.$id, { DISPLAYORDER: curr.DISPLAYORDER ?? i })
    );
  };

  if (loading) return <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#9ca3af' }}><Loader size={14} style={{ animation: 'te-spin 1s linear infinite', display: 'inline-block' }} /> Cargando banners...</div>;
  if (error) return <div style={{ padding: 10, fontSize: 11, color: '#ef4444' }}>{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SH>Banners del carrusel ({banners.length}/5)</SH>
        {banners.length < 5 && (
          <button onClick={createBanner} disabled={adding}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 5, border: 'none', background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', opacity: adding ? 0.6 : 1 }}>
            <Plus size={12} /> {adding ? 'Creando...' : 'Agregar'}
          </button>
        )}
      </div>
      {banners.map((b, i) => (
        <BannerCard key={b.$id} banner={b} index={i} saving={saving === b.$id}
          onSave={(data) => save(b.$id, data)} onToggle={() => toggleActive(b)} onMoveUp={() => moveUp(i)} canMoveUp={i > 0} onDelete={() => deleteBanner(b.$id)} />
      ))}
      {banners.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>No hay banners. Haz clic en "Agregar" para crear uno.</div>}
    </div>
  );
}

function BannerCard({ banner, index, saving, onSave, onToggle, onMoveUp, canMoveUp, onDelete }: {
  banner: Banner; index: number; saving: boolean;
  onSave: (data: Record<string, unknown>) => void; onToggle: () => void; onMoveUp: () => void; canMoveUp: boolean; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(banner.TITLE || '');
  const [imageUrl, setImageUrl] = useState(banner.IMAGEURL || '');
  const [linkUrl, setLinkUrl] = useState(banner.LINKURL || '');

  const handleSave = () => { onSave({ TITLE: title, IMAGEURL: imageUrl, LINKURL: linkUrl }); setEditing(false); };

  return (
    <div style={{ background: banner.ISACTIVE ? '#fff' : '#f9fafb', borderRadius: 8, border: `1px solid ${banner.ISACTIVE ? '#e5e7eb' : '#fecaca'}`, overflow: 'hidden', opacity: banner.ISACTIVE ? 1 : 0.6 }}>
      {/* Preview */}
      {banner.IMAGEURL && (
        <div style={{ position: 'relative', height: 60, overflow: 'hidden' }}>
          <img src={banner.IMAGEURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>#{index + 1}</div>
        </div>
      )}
      {/* Info bar */}
      <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{banner.TITLE || 'Sin título'}</div>
          <div style={{ fontSize: 9, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{banner.LINKURL || 'Sin link'}</div>
        </div>
        {canMoveUp && <button onClick={onMoveUp} title="Subir" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#6b7280', fontSize: 12 }}>{'↑'}</button>}
        <button onClick={onToggle} title={banner.ISACTIVE ? 'Desactivar' : 'Activar'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: banner.ISACTIVE ? '#10b981' : '#ef4444', fontSize: 12 }}>
          {banner.ISACTIVE ? <Eye size={12} /> : <X size={12} />}
        </button>
        <button onClick={() => setEditing(!editing)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#5850ec', fontSize: 10, fontWeight: 700 }}>
          {editing ? 'Cerrar' : 'Editar'}
        </button>
        <button onClick={onDelete} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#ef4444', fontSize: 12 }}>
          <Trash2 size={12} />
        </button>
      </div>
      {/* Inline editor */}
      {editing && (
        <div style={{ padding: '6px 8px 8px', borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del banner" style={miniInput} />
          <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="URL de la imagen" style={miniInput} />
          <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="Link destino (ej: /productos)" style={miniInput} />
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '6px', borderRadius: 5, border: 'none', background: '#5850ec', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando...' : ': Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  );
}

/* â â â)â
â â/âvâ
â)â
â
â/ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   SUB-EDITORS (Testimonials, FAQ, Logos)
   âTâSâTâtâoâaâ,âAâ âgâ)â ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
function TestimonialsEditor({ settings, onUpdate }: { settings: SectionSettings; onUpdate: (p: Partial<SectionSettings>) => void }) {
  const items = settings.testimonials || [];
  const update = (n: typeof items) => onUpdate({ testimonials: n });
  const add = () => update([...items, { name: '', text: '', rating: 5, avatar: '', productId: '', productImage: '', productName: '' }]);
  const rm = (i: number) => update(items.filter((_, x) => x !== i));
  const p = (i: number, v: Partial<typeof items[0]>) => update(items.map((t, x) => x === i ? { ...t, ...v } : t));

  // Product selector
  const [products, setProducts] = useState<Product[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        setProdLoading(true);
        const { databaseId } = getFirebaseConfig();
        const { databases } = getServices();
        const res = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION, [Query.greaterThan('STOCK', 0), Query.orderAsc('NAME'), Query.limit(200)]);
        setProducts(res.documents as unknown as Product[]);
      } catch { /* ignore */ }
      finally { setProdLoading(false); }
    })();
  }, []);

  const onProductSelect = (idx: number, pid: string) => {
    const prod = products.find(x => x.$id === pid);
    if (prod) {
      p(idx, { productId: pid, productImage: prod.IMAGEURL || '', productName: prod.NAME });
    } else {
      p(idx, { productId: '', productImage: '', productName: '' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SH>Testimonios ({items.length})</SH>
      <Field icon={<Type size={13} />} label="Título sección" value={settings.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Lo que dicen nuestros clientes" />
      {items.map((t, i) => (
        <div key={i} style={{ background: '#f9fafb', borderRadius: 8, padding: 10, border: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>#{i + 1}</span>
            <button onClick={() => rm(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 11, fontWeight: 600 }}>Eliminar</button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {/* Columna izquierda: avatar + info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <ImageUploadField label="Foto" value={t.avatar || ''} onChange={v => p(i, { avatar: v })} />
              <input value={t.name} onChange={e => p(i, { name: e.target.value })} placeholder="Nombre" style={miniInput} />
              <textarea value={t.text} onChange={e => p(i, { text: e.target.value })} placeholder="Opinión..." rows={2} style={{ ...miniInput, resize: 'vertical' as const }} />
            </div>
            {/* Columna derecha: producto + estrellas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <SH>Producto mencionado</SH>
              <select
                value={t.productId || ''}
                onChange={e => onProductSelect(i, e.target.value)}
                style={{ padding: '6px 8px', fontSize: 11, borderRadius: 5, border: '1px solid #e5e7eb', background: '#fff', width: '100%' }}
              >
                <option value="">{prodLoading ? 'Cargando...' : ' Sin producto '}</option>
                {products.map(pr => (
                  <option key={pr.$id} value={pr.$id}>{pr.NAME}  ${pr.CURRENTPRICE ?? pr.PRICE}</option>
                ))}
              </select>
              {t.productImage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <img src={t.productImage} alt={t.productName} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
                  <span style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.3 }}>{t.productName}</span>
                </div>
              )}
              <SH>Rating</SH>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexDirection: 'row' }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => p(i, { rating: n })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#f59e0b', opacity: n <= (t.rating || 5) ? 1 : 0.2, padding: 0, lineHeight: 1 }}>1</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
      <DashedAddBtn onClick={add} label="+ Agregar testimonio" />
    </div>
  );
}

function FaqEditor({ settings, onUpdate }: { settings: SectionSettings; onUpdate: (p: Partial<SectionSettings>) => void }) {
  const items = settings.faqs || [];
  const update = (n: typeof items) => onUpdate({ faqs: n });
  const add = () => update([...items, { question: '', answer: '' }]);
  const rm = (i: number) => update(items.filter((_, x) => x !== i));
  const p = (i: number, v: Partial<typeof items[0]>) => update(items.map((t, x) => x === i ? { ...t, ...v } : t));

  // Cargar preguntas por default al montar si está vacío
  useEffect(() => {
    if (items.length === 0) {
      const defaultFaqs = [
        { question: '¿Cómo realizo una compra en Yaxsel?', answer: 'Navega por nuestro catálogo, agrega productos al carrito y procede al checkout. Aceptamos transferencia bancaria como método de pago.' },
        { question: '¿Cuánto tarda el envío?', answer: 'Santiago: 2-5 días hábiles. Regiones: 3-7 días hábiles. Zonas extremas: 5-10 días hábiles.' },
        { question: '¿Realizan envíos a todo Chile?', answer: 'Sí, realizamos envíos a todo Chile continental. Algunas zonas extremas pueden tener restricciones.' },
        { question: '¿Quién paga el costo de envío?', answer: 'El costo de envío es pagado por el destinatario. El costo varía según destino, peso y volumen.' },
        { question: '¿Qué formas de pago aceptan?', answer: 'Actualmente aceptamos transferencia bancaria como método principal. Los pedidos se procesan una vez confirmado el pago.' },
        { question: '¿Cuál es el tiempo de validación del pago?', answer: 'El tiempo de validación es de 24-48 horas hábiles. Debe enviar comprobante de transferencia para validación.' },
        { question: '¿Puedo devolver un producto?', answer: 'Sí, conforme a la Ley del Consumidor chilena, tiene derecho a retractarse dentro de 10 días corridos desde la recepción del producto.' },
        { question: '¿Cómo puedo rastrear mi pedido?', answer: 'Una vez despachado, recibirá un correo con el código de seguimiento y el enlace para rastrear su envío en tiempo real.' },
        { question: '¿Los precios incluyen IVA?', answer: 'Sí, todos los precios están expresados en pesos chilenos (CLP) e incluyen IVA cuando corresponda.' },
        { question: '¿Cómo contacto a soporte?', answer: 'Puede escribirnos a través del formulario de contacto en la web o por WhatsApp. Respondemos en un plazo de 24 horas hábiles.' }
      ];
      update(defaultFaqs);
    }
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SH>Preguntas ({items.length})</SH>
      <Field icon={<Type size={13} />} label="Título sección" value={settings.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Preguntas frecuentes" />
      <SH>Respuestas rápidas</SH>
      <Field icon={<Mail size={13} />} label="Correo de contacto" value={settings.faqContactEmail || 'info@yaxsell.com'} onChange={v => onUpdate({ faqContactEmail: v })} placeholder="info@yaxsell.com" />
      <ImageUploadField label="Imagen de fondo" value={settings.faqBackgroundImage || ''} onChange={v => onUpdate({ faqBackgroundImage: v })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
        <input
          type="checkbox"
          checked={settings.faqEnableParticles || false}
          onChange={e => onUpdate({ faqEnableParticles: e.target.checked })}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }} onClick={() => onUpdate({ faqEnableParticles: !settings.faqEnableParticles })}>
          Activar partículas animadas
        </label>
      </div>
      <SH>Imágenes</SH>
      <ImageUploadField label="Imagen grande (círculo superior)" value={settings.faqAvatarLarge || ''} onChange={v => onUpdate({ faqAvatarLarge: v })} />
      <ImageUploadField label="Avatar 1" value={settings.faqAvatar1 || ''} onChange={v => onUpdate({ faqAvatar1: v })} />
      <ImageUploadField label="Avatar 2" value={settings.faqAvatar2 || ''} onChange={v => onUpdate({ faqAvatar2: v })} />
      <ImageUploadField label="Avatar 3" value={settings.faqAvatar3 || ''} onChange={v => onUpdate({ faqAvatar3: v })} />
      <ImageUploadField label="Avatar 4" value={settings.faqAvatar4 || ''} onChange={v => onUpdate({ faqAvatar4: v })} />
      <button onClick={() => {
        const defaultFaqs = [
          { question: '¿Cómo realizo una compra en Yaxsel?', answer: 'Navega por nuestro catálogo, agrega productos al carrito y procede al checkout. Aceptamos transferencia bancaria como método de pago.' },
          { question: '¿Cuánto tarda el envío?', answer: 'Santiago: 2-5 días hábiles. Regiones: 3-7 días hábiles. Zonas extremas: 5-10 días hábiles.' },
          { question: '¿Realizan envíos a todo Chile?', answer: 'Sí, realizamos envíos a todo Chile continental. Algunas zonas extremas pueden tener restricciones.' },
          { question: '¿Quién paga el costo de envío?', answer: 'El costo de envío es pagado por el destinatario. El costo varía según destino, peso y volumen.' },
          { question: '¿Qué formas de pago aceptan?', answer: 'Actualmente aceptamos transferencia bancaria como método principal. Los pedidos se procesan una vez confirmado el pago.' },
          { question: '¿Cuál es el tiempo de validación del pago?', answer: 'El tiempo de validación es de 24-48 horas hábiles. Debe enviar comprobante de transferencia para validación.' },
          { question: '¿Puedo devolver un producto?', answer: 'Sí, conforme a la Ley del Consumidor chilena, tiene derecho a retractarse dentro de 10 días corridos desde la recepción del producto.' },
          { question: '¿Cómo puedo rastrear mi pedido?', answer: 'Una vez despachado, recibirá un correo con el código de seguimiento y el enlace para rastrear su envío en tiempo real.' },
          { question: '¿Los precios incluyen IVA?', answer: 'Sí, todos los precios están expresados en pesos chilenos (CLP) e incluyen IVA cuando corresponda.' },
          { question: '¿Cómo contacto a soporte?', answer: 'Puede escribirnos a través del formulario de contacto en la web o por WhatsApp. Respondemos en un plazo de 24 horas hábiles.' }
        ];
        update(defaultFaqs);
      }} style={{ padding: '8px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>' Cargar preguntas por default</button>
      {items.map((q, i) => (
        <div key={i} style={{ background: '#f9fafb', borderRadius: 8, padding: 10, border: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>#{i + 1}</span>
            <button onClick={() => rm(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 11, fontWeight: 600 }}>Eliminar</button>
          </div>
          <input value={q.question} onChange={e => p(i, { question: e.target.value })} placeholder="¿Pregunta?" style={{ ...miniInput, fontWeight: 600 }} />
          <textarea value={q.answer} onChange={e => p(i, { answer: e.target.value })} placeholder="Respuesta..." rows={2} style={{ ...miniInput, resize: 'vertical' as const, marginTop: 4 }} />
        </div>
      ))}
      <DashedAddBtn onClick={add} label="+ Agregar pregunta" />
    </div>
  );
}

function LogoListEditor({ settings, onUpdate }: { settings: SectionSettings; onUpdate: (p: Partial<SectionSettings>) => void }) {
  const items = settings.logos || [];
  const update = (n: typeof items) => onUpdate({ logos: n });
  const add = () => update([...items, { url: '', alt: '', link: '' }]);
  const rm = (i: number) => update(items.filter((_, x) => x !== i));
  const p = (i: number, v: Partial<typeof items[0]>) => update(items.map((t, x) => x === i ? { ...t, ...v } : t));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SH>Logos ({items.length})</SH>
      <Field icon={<Type size={13} />} label="Título sección" value={settings.title || ''} onChange={v => onUpdate({ title: v })} placeholder="Marcas que confían en nosotros" />
      {items.map((logo, i) => (
        <div key={i} style={{ background: '#f9fafb', borderRadius: 8, padding: 10, border: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Logo #{i + 1}</span>
            <button onClick={() => rm(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 11, fontWeight: 600 }}>Eliminar</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <ImageUploadField label="Imagen del logo" value={logo.url} onChange={v => p(i, { url: v })} />
            <input value={logo.alt || ''} onChange={e => p(i, { alt: e.target.value })} placeholder="Nombre de la marca" style={miniInput} />
            <input value={logo.link || ''} onChange={e => p(i, { link: e.target.value })} placeholder="Link (opcional)" style={miniInput} />
          </div>
        </div>
      ))}
      <DashedAddBtn onClick={add} label="+ Agregar logo" />
    </div>
  );
}

// Alias para tpl1_brand_logos
const LogosEditor = LogoListEditor;

/* â âgâEâtâ âLâoâsâdâoâ
â
â ══════════════════════════════════════════════════════
   FONT PANEL  Global font selection only
   âL╀âGâbâ ânâsâeâiâ âlâ
â ══════════════════════════════════════════════════════ */
function FontPanel({ fontConfig, onUpdate, onClose }: {
  fontConfig: FontConfig; onUpdate: (p: Partial<FontConfig>) => void; onClose: () => void;
}) {
  const FontSelect = ({ label, value, onChange, previewText }: { label: string; value: string; onChange: (v: string) => void; previewText?: string }) => (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4, display: 'block' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none', background: '#fff', fontFamily: value || 'inherit' }}>
        {FONT_OPTIONS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value || 'inherit' }}>{f.label}</option>)}
      </select>
      {value && previewText && (
        <div style={{ marginTop: 6, padding: '8px 10px', background: '#f9fafb', borderRadius: 6, border: '1px solid #f0f0f0' }}>
          <p style={{ margin: 0, fontFamily: `"${value}", sans-serif`, fontSize: 16, fontWeight: 700, color: '#111', lineHeight: 1.3 }}>{previewText}</p>
          <p style={{ margin: '4px 0 0', fontFamily: `"${value}", sans-serif`, fontSize: 12, color: '#666', lineHeight: 1.4 }}>Texto de ejemplo para previsualizar la fuente seleccionada.</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Header */}
      <div style={{ padding: '14px 16px 0', borderBottom: '1px solid #f0f0f0', flexShrink: 0, background: '#fafbfc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 14 }}>
          <button onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 7, background: '#f3f4f6', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6'; }}>
            <ArrowLeft size={14} />
          </button>
          <span style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: '#fef3c7', color: '#d97706', flexShrink: 0 }}><Type size={16} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', letterSpacing: '-0.01em' }}>Fuentes globales</div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>Tipografía para toda la página</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
        {/* Global Fonts */}
        <SH>Fuente global (toda la página)</SH>
        <FontSelect label="Cuerpo / Texto general" value={fontConfig.globalFont} onChange={v => onUpdate({ globalFont: v })} previewText="Tu tienda online" />
        <FontSelect label="Títulos / Encabezados" value={fontConfig.globalHeadingFont} onChange={v => onUpdate({ globalHeadingFont: v })} previewText="Ofertas del día" />

        <div style={{ height: 1, background: '#e5e7eb', margin: '16px 0' }} />

        <p style={{ fontSize: 10, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
            Para cambiar la fuente de una sección específica, selecciona esa sección y busca la opción "Fuentes" en su panel de configuración.
        </p>
      </div>
    </>
  );
}

/* â â â<âiâ
â â<â
â â
â
â
â ══════════════════════════════════════════════════════
   SHARED UI HELPERS
   ════â âSâRâ â âLâRâ
â ══════════════════════════════════════════════════════ */
const miniInput: React.CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid #e5e7eb', borderRadius: 5, outline: 'none' };

function SH({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2, marginTop: 6 }}>{children}</div>;
}

function AdminLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 6, background: '#f0f9ff', border: '1px solid #e0f2fe', textDecoration: 'none', color: '#0369a1', fontSize: 11 }}>
      <Settings2 size={12} /> <span style={{ flex: 1 }}>{label}</span> <ChevronRight size={12} />
    </a>
  );
}

function DashedAddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return <button onClick={onClick} style={{ width: '100%', padding: '7px', borderRadius: 6, border: '1px dashed #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#3b82f6' }}>{label}</button>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4, display: 'block' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="color" value={value || '#ffffff'} onChange={e => onChange(e.target.value)}
          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', padding: 0, cursor: 'pointer' }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="#hex"
          style={{ flex: 1, padding: '5px 8px', fontSize: 11, border: '1px solid #e5e7eb', borderRadius: 5, outline: 'none', fontFamily: 'monospace' }} />
      </div>
    </div>
  );
}

function RangeField({ label, value, onChange, min, max, unit, step }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; unit: string; step?: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280' }}>{label}</label>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step ?? (min < 1 ? 0.05 : 1)} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: '#5850ec', height: 4 }} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4, display: 'block' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid #e5e7eb', borderRadius: 5, outline: 'none', background: '#fff', color: '#1f2937' }}>
        {options.map(o => <option key={o.v} value={o.v} style={{ background: '#fff', color: '#1f2937' }}>{o.l}</option>)}
      </select>
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, display: 'block' }}>{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        style={{ width: '100%', padding: '8px 10px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none', resize: 'vertical' }} />
    </div>
  );
}

/* âaâ â â
â â<âiâ
â â
â
â
â ══════════════════════════════════════════════════════
   FIELD INPUT
   ══════â âFâLâIâUâ
â ══════════════════════════════════════════════════════ */
function Field({ icon, label, value, onChange, placeholder, type = 'text' }: {
  icon: React.ReactNode; label: string; value: string;
  onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5 }}>
        {icon} {label}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 10px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none', transition: 'border 0.12s' }}
        onFocus={e => { e.target.style.borderColor = '#a78bfa'; }}
        onBlur={e => { e.target.style.borderColor = '#e5e7eb'; }}
      />
    </div>
  );
}

/* â
â â â
â â<âiâ
â â
â
â
â ══════════════════════════════════════════════════════
   IMAGE UPLOAD FIELD  URL + upload from PC
   âDâIâD╀âUâ âuâoâ âoâPâ
â ══════════════════════════════════════════════════════ */
function ImageUploadField({ label, value, onChange }: {
  label: string; value: string; onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { storage } = getServices();
      const { projectId, endpoint } = getFirebaseConfig();
      const { ID } = await import('@/lib/db');
      const res = await storage.createFile('67f41e05000d0adb6f12', ID.unique(), file);
      const url = `${endpoint}/storage/buckets/67f41e05000d0adb6f12/files/${res.$id}/view?project=${projectId}`;
      onChange(url);
    } catch (err) {
      alert('Error al subir imagen: ' + (err as any)?.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5 }}>
        <Image size={13} /> {label}
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="https://... o sube desde PC e"
          style={{ flex: 1, padding: '8px 10px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none' }}
          onFocus={e => { e.target.style.borderColor = '#a78bfa'; }}
          onBlur={e => { e.target.style.borderColor = '#e5e7eb'; }}
        />
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          style={{ padding: '0 10px', fontSize: 11, background: '#5850ec', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', opacity: uploading ? .6 : 1 }}>
          {uploading ? 'Subiendo...' : 'ð  PC'}
        </button>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      </div>
      {value && (
        <div style={{ marginTop: 6, position: 'relative', display: 'inline-block' }}>
          <img src={value} alt="" style={{ height: 40, width: 'auto', borderRadius: 4, border: '1px solid #e5e7eb', objectFit: 'contain' }} />
          <button onClick={() => onChange('')} style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, background: '#ef4444', border: 'none', borderRadius: '50%', color: '#fff', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>'</button>
        </div>
      )}
    </div>
  );
}

/* >
      )}
    </div>
  );
}

/* 
/* ═══════════════════════
   HISTORY PANEL  Lista de backups con restaurar/eliminar
sta de backups con restaurar/eliminar
nar
═══════════════════════ */
type HistoryItem = { id: string; timestamp: number; sections: SectionConfig[]; label?: string };

function HistoryPanel({
  history, onClose, onRestore, onDelete, onClearAll,
}: {
  history: HistoryItem[];
  onClose: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Hoy ${time}`;
    if (isYesterday) return `Ayer ${time}`;
    return `${d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })} ${time}`;
  };

  const getRelativeTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'hace un momento';
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `hace ${days}d`;
  };

  return (
    <>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <History size={14} color="#4338ca" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Historial de cambios</div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>{history.length} {history.length === 1 ? 'backup' : 'backups'}</div>
        </div>
        <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={14} />
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        {history.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <History size={32} color="#d1d5db" style={{ margin: '0 auto 8px', display: 'block' }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Sin backups todavía</div>
            <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
              Cada vez que pulses <strong>Guardar</strong>, se creará un backup automático aquí.
            </div>
          </div>
        ) : (
          history.map((h, idx) => (
            <div key={h.id} style={{
              padding: '10px 12px',
              marginBottom: 6,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: idx === 0 ? '#f0fdf4' : '#fff',
              borderColor: idx === 0 ? '#bbf7d0' : '#e5e7eb',
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: idx === 0 ? '#10b981' : '#a78bfa',
                  marginTop: 5, flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {formatDate(h.timestamp)}
                    {idx === 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, background: '#10b981', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>
                        ACTUAL
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                    {getRelativeTime(h.timestamp)} · {h.sections.length} secciones
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingLeft: 16 }}>
                <button onClick={() => onRestore(h.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', cursor: 'pointer' }}>
                  <RotateCcw size={11} /> Restaurar
                </button>
                <button onClick={() => onDelete(h.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {history.length > 0 && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
          <button onClick={onClearAll}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>
            <Trash2 size={11} /> Eliminar todo el historial
          </button>
        </div>
      )}
    </>
  );
}

export { ThemeEditorPage as default };
