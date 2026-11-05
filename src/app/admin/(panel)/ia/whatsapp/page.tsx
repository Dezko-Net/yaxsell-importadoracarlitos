'use client';
/* Yaxbot WhatsApp Business Admin - Premium light UI
   100dvh, fully responsive (desktop split-view + mobile view-switch + drawer) */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Bot,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  MessageCircle,
  MoreVertical,
  Package,
  Phone,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  Shield,
  ShoppingBag,
  Trash2,
  TrendingUp,
  Unlock,
  User,
  UserCheck,
  X,
  Zap,
  Filter,
  Plus,
  MessageSquarePlus,
  Link2,
} from 'lucide-react';

type OrderDetail = {
  id: string;
  code: string;
  status: string;
  total: number;
  date: string;
  items: string;
};

type CustomerInfo = {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  orderCount: number;
  totalSpent: number;
  registered: boolean;
  orders?: OrderDetail[];
};

type ThreadSummary = {
  phone: string;
  displayName: string;
  preview: string;
  lastAt: string;
  totalMessages: number;
  unreadCount: number;
  customerMessages: number;
  adminMessages: number;
  segment: 'customer' | 'admin';
  blocked: boolean;
  adminTakeover?: boolean;
  escalated?: boolean;
  spamBlocked?: boolean;
  tokenLimit: number;
  totalTokens: number;
  promptTokens: number;
  responseTokens: number;
  overLimit: boolean;
  lastUsageAt: string;
};

type ThreadMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  readByAdmin: boolean;
  readByUser: boolean;
};

type FilterTab = 'all' | 'unread' | 'blocked' | 'escalated';

type KeniaConfig = {
  adminPrompt: string;
  customerPrompt: string;
  adminAlertPhone: string;
  tokenLimitPerCustomer: number;
  smartNotifications: boolean;
  messageThresholdForPause: number;
  updatedAt: string;
  isEnabled?: boolean;
};

type ThreadDetail = {
  phone: string;
  messages: ThreadMessage[];
  usage: {
    phone: string;
    totalTokens: number;
    promptTokens: number;
    responseTokens: number;
    messageCount: number;
    blocked: boolean;
    adminTakeover?: boolean;
    escalated?: boolean;
    spamBlocked?: boolean;
    updatedAt: string;
    overLimit: boolean;
    tokenLimit: number;
  };
};

const emptyConfig: KeniaConfig = {
  adminPrompt: '',
  customerPrompt: '',
  adminAlertPhone: '',
  tokenLimitPerCustomer: 15000,
  smartNotifications: true,
  messageThresholdForPause: 10,
  updatedAt: '',
  isEnabled: true,
};

function formatDate(value: string) {
  if (!value) return 'Sin actividad';
  try {
    return new Date(value).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function formatRelativeDate(value: string) {
  if (!value) return '';
  try {
    const d = new Date(value);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return d.toLocaleString('es-CL', { timeStyle: 'short' });
    if (diffDays === 1) return 'ayer';
    if (diffDays < 7) return d.toLocaleString('es-CL', { weekday: 'short' });
    return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit' });
  } catch {
    return value;
  }
}

function getInitials(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-2);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function progressPct(value: number, max: number) {
  if (!max) return 0;
  return Math.min(100, Math.round((value / max) * 100));
}

/* --- Avatar color palette --- */
const AVATAR_COLORS = [
  ['#dff6e7','#128c7e'],['#e8f4fd','#0078d4'],['#fef3e2','#d97706'],
  ['#fce7f3','#be185d'],['#ede9fe','#7c3aed'],['#fef9c3','#854d0e'],
];
function getAvatarColors(phone: string) {
  const n = phone.replace(/\D/g,'').split('').reduce((a,c)=>a+parseInt(c),0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

export default function AdminIAWhatsAppPage() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [stats, setStats] = useState({
    totalThreads: 0,
    customerThreads: 0,
    unreadThreads: 0,
    blockedThreads: 0,
    overLimitThreads: 0,
    totalTokens: 0,
  });
  const [selectedPhone, setSelectedPhone] = useState('');
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [config, setConfig] = useState<KeniaConfig>(emptyConfig);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [newChatOrders, setNewChatOrders] = useState<OrderDetail[]>([]);
  const [newChatOrdersLoading, setNewChatOrdersLoading] = useState(false);
  const [linkingPhone, setLinkingPhone] = useState(false);
  const [sendingNewTemplate, setSendingNewTemplate] = useState(false);
  const [savingBlock, setSavingBlock] = useState(false);
  const [promptTab, setPromptTab] = useState<'customer' | 'admin'>('customer');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [customerMap, setCustomerMap] = useState<Record<string, CustomerInfo>>({});
  const [showOrdersPanel, setShowOrdersPanel] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | { type: 'clear' | 'delete'; phone: string }>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const selectedPhoneRef = useRef('');
  const customerMapRef = useRef<Record<string, CustomerInfo>>({});
  const threadRequestRef = useRef(0);
  const threadsRequestRef = useRef(0);
  const requestedPhoneHandledRef = useRef(false);
  const threadsCacheHydratedRef = useRef(false);

  const selectedSummary = useMemo(
    () => threads.find((item) => item.phone === selectedPhone) || null,
    [threads, selectedPhone]
  );
  const selectedCustomerName = useMemo(() => {
    const candidates = [customerMap[selectedPhone]?.name, selectedSummary?.displayName]
      .map(name => String(name || '').trim())
      .filter(name => name && name.toLowerCase() !== 'cliente' && name !== `+${selectedPhone}`);
    return candidates[0] || 'Cliente';
  }, [customerMap, selectedPhone, selectedSummary]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Fetch orders preview for new chat modal
  useEffect(() => {
    const phone = newChatPhone.replace(/\D/g, '').trim();
    if (phone.length < 8) { setNewChatOrders([]); return; }
    const finalPhone = phone.startsWith('56') ? phone : (phone.length === 9 && phone.startsWith('9') ? '56' + phone : phone);
    setNewChatOrdersLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/ia/customer-lookup?phones=${encodeURIComponent(finalPhone)}&detail=true`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        const info = data?.customers?.[finalPhone];
        if (info?.orders) setNewChatOrders(info.orders.slice(0, 10));
        else setNewChatOrders([]);
        if (info?.name && !newChatName) setNewChatName(info.name);
      } catch { if (!cancelled) setNewChatOrders([]); }
      finally { if (!cancelled) setNewChatOrdersLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [newChatPhone]);

  useEffect(() => {
    if (!loadingThread && thread?.messages.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [thread, loadingThread]);

  function handleChatScroll() {
    const el = chatScrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 160);
  }

  useEffect(() => {
    selectedPhoneRef.current = selectedPhone;
  }, [selectedPhone]);

  useEffect(() => {
    customerMapRef.current = customerMap;
  }, [customerMap]);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const res = await fetch('/api/admin/ia/config', { cache: 'no-store' });
      const data = await res.json();
      if (data?.success) setConfig(data.config);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const loadThreads = useCallback(async (keepSelection = true, silent = false) => {
    if (!silent) setLoadingThreads(true);
    const requestId = ++threadsRequestRef.current;
    try {
      const query = search ? `?q=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/admin/ia/threads${query}`, { cache: 'no-store' });
      const data = await res.json();
      if (requestId !== threadsRequestRef.current) return;
      if (data?.success) {
        const nextThreads = data.threads as ThreadSummary[];
        setThreads(nextThreads);
        setStats(data.stats);
        const currentSelected = selectedPhoneRef.current;
        if ((!keepSelection || !currentSelected) && nextThreads[0]) {
          setSelectedPhone(nextThreads[0].phone);
        } else if (currentSelected && !nextThreads.some((item) => item.phone === currentSelected)) {
          setSelectedPhone(nextThreads[0]?.phone || '');
        }
        // Enrich every customer thread in small batches. The lookup endpoint caps each
        // request, and Firestore `in` queries have a limited number of operands.
        if (nextThreads.length > 0 && !silent) {
          const phones = nextThreads
            .filter(t => t.segment === 'customer')
            .filter(t => !customerMapRef.current[t.phone]?.name && (!t.displayName || t.displayName === `+${t.phone}`))
            .map(t => t.phone);
          if (phones.length) {
            const phoneBatches: string[][] = [];
            for (let i = 0; i < phones.length; i += 12) phoneBatches.push(phones.slice(i, i + 12));
            void Promise.all(phoneBatches.map(async batch => {
              try {
                const response = await fetch(`/api/admin/ia/customer-lookup?phones=${encodeURIComponent(batch.join(','))}`, { cache: 'no-store' });
                const lookup = await response.json();
                return lookup?.customers || {};
              } catch {
                return {};
              }
            })).then(results => {
              if (requestId !== threadsRequestRef.current) return;
              const foundCustomers = Object.assign({}, ...results);
              setCustomerMap(prev => {
                const merged = { ...prev, ...foundCustomers };
                sessionStorage.setItem('admin_whatsapp_cache', JSON.stringify({ threads: nextThreads, stats: data.stats, customerMap: merged }));
                return merged;
              });
            });
          } else {
            sessionStorage.setItem('admin_whatsapp_cache', JSON.stringify({ threads: nextThreads, stats: data.stats }));
          }
        } else {
          sessionStorage.setItem('admin_whatsapp_cache', JSON.stringify({ threads: nextThreads, stats: data.stats }));
        }
      }
    } finally {
      if (requestId === threadsRequestRef.current && !silent) setLoadingThreads(false);
    }
  }, [search]);

  const loadThread = useCallback(async (phone: string) => {
    if (!phone) return;
    const requestId = ++threadRequestRef.current;
    setLoadingThread(true);
    setThread(null);
    try {
      const res = await fetch(`/api/admin/ia/thread?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
      const data = await res.json();
      if (requestId !== threadRequestRef.current) return;
      if (data?.success) {
        setThread(data.thread);
      }
    } finally {
      if (requestId === threadRequestRef.current) setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (threadsCacheHydratedRef.current) return;
    threadsCacheHydratedRef.current = true;

    const cached = sessionStorage.getItem('admin_whatsapp_cache');
    let hasCachedThreads = false;
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.threads && parsed.stats) {
          setThreads(parsed.threads);
          setStats(parsed.stats);
          if (parsed.customerMap) setCustomerMap(parsed.customerMap);
          if (parsed.threads[0]) setSelectedPhone(parsed.threads[0].phone);
          setLoadingThreads(false);
          hasCachedThreads = true;
        }
      } catch {}
    }
    // Paint cached chats immediately, then refresh from the shared BOT/IA inbox.
    void loadThreads(false, hasCachedThreads);
  }, [loadThreads]);

  useEffect(() => {
    if (requestedPhoneHandledRef.current || threads.length === 0) return;
    const requestedPhone = new URLSearchParams(window.location.search).get('phone')?.replace(/\D/g, '') || '';
    if (requestedPhone && threads.some((item) => item.phone === requestedPhone)) {
      requestedPhoneHandledRef.current = true;
      setSelectedPhone(requestedPhone);
      setMobileView('chat');
    }
  }, [threads]);

  useEffect(() => {
    setDraft('');
    setShowOrdersPanel(false);
    if (selectedPhone) loadThread(selectedPhone);
  }, [selectedPhone, loadThread]);

  // Auto-polling removed to save Appwrite reads. User must manually click refresh.

  function showToast(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    window.clearTimeout((showToast as any)._timer);
    (showToast as any)._timer = window.setTimeout(() => setMessage(null), 2800);
  }

  async function handleSetBlock(blocked: boolean, reason?: 'admin_takeover' | 'spam' | 'manual') {
    if (!selectedPhone) return;
    setSavingBlock(true);
    try {
      const res = await fetch('/api/admin/ia/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selectedPhone, blocked, reason }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'No se pudo actualizar');
      await loadThread(selectedPhone);
      await loadThreads(true);

      let msgText = 'Cliente reactivado para IA';
      if (blocked) {
        if (reason === 'admin_takeover') msgText = 'Has tomado el control del chat';
        else if (reason === 'spam') msgText = 'Cliente bloqueado por spam';
        else msgText = 'Cliente bloqueado para IA';
      }
      showToast('success', msgText);
    } catch (error: any) {
      showToast('error', error?.message || 'No se pudo actualizar el estado del chat');
    } finally {
      setSavingBlock(false);
    }
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/admin/ia/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'No se pudo guardar');
      setConfig(data.config);
      showToast('success', 'Configuración de Yaxbot guardada');
    } catch (error: any) {
      showToast('error', error?.message || 'No se pudo guardar la configuración');
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveKeniaStatusDirectly(newValue: boolean) {
    const next = { ...config, isEnabled: newValue };
    try {
      const res = await fetch('/api/admin/ia/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (data?.success) {
        setConfig(data.config);
        showToast('success', newValue ? 'Yaxbot activada' : 'Yaxbot desactivada');
      } else {
        showToast('error', 'No se pudo cambiar el estado de Yaxbot');
      }
    } catch {
      showToast('error', 'Error al cambiar el estado de Yaxbot');
    }
  }

  async function handleSend() {
    if (!selectedPhone || !draft.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/ia/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selectedPhone, text: draft.trim() }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'No se pudo enviar');
      setDraft('');
      await loadThread(selectedPhone);
      await loadThreads(true);
      showToast('success', 'Mensaje enviado por WhatsApp');
    } catch (error: any) {
      showToast('error', error?.message || 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  }

  async function handleSendTestTemplate(phone: string) {
    if (!phone) return;
    setSendingTemplate(true);
    try {
      const res = await fetch('/api/admin/ia/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'No se pudo enviar la plantilla');
      await loadThread(phone);
      await loadThreads(true);
      showToast('success', 'Plantilla de prueba enviada');
    } catch (error: any) {
      showToast('error', error?.message || 'No se pudo enviar la plantilla');
    } finally {
      setSendingTemplate(false);
    }
  }

  function handleCreateNewChat() {
    if (!newChatPhone) return;
    const phone = newChatPhone.replace(/\D/g, '').trim();
    if (phone.length < 8) {
      showToast('error', 'El número de teléfono es muy corto');
      return;
    }
    const finalPhone = phone.startsWith('56') ? phone : (phone.length === 9 && phone.startsWith('9') ? '56' + phone : phone);

    // Check if exists
    if (!threads.find(t => t.phone === finalPhone)) {
      setThreads(prev => [{
        phone: finalPhone,
        displayName: newChatName || 'Desconocido',
        preview: '',
        lastAt: new Date().toISOString(),
        totalMessages: 0,
        unreadCount: 0,
        customerMessages: 0,
        adminMessages: 0,
        segment: 'customer',
        blocked: false,
        tokenLimit: config.tokenLimitPerCustomer,
        totalTokens: 0,
        promptTokens: 0,
        responseTokens: 0,
        overLimit: false,
        lastUsageAt: new Date().toISOString(),
      }, ...prev]);
    }
    setSelectedPhone(finalPhone);
    setMobileView('chat');
    setShowNewChatModal(false);
    setNewChatPhone('');
    setNewChatName('');
    setNewChatOrders([]);
  }

  async function handleSendNewTestTemplate() {
    if (!newChatPhone) return;
    setSendingNewTemplate(true);
    try {
      const phone = newChatPhone.replace(/\D/g, '').trim();
      const finalPhone = phone.startsWith('56') ? phone : (phone.length === 9 && phone.startsWith('9') ? '56' + phone : phone);
      const res = await fetch('/api/admin/ia/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: finalPhone }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'No se pudo enviar la plantilla');
      showToast('success', 'Plantilla enviada exitosamente');
      handleCreateNewChat();
    } catch (error: any) {
      showToast('error', error?.message || 'No se pudo enviar la plantilla');
    } finally {
      setSendingNewTemplate(false);
    }
  }

  async function handleClearHistory(phone: string) {
    setConfirmAction(null);
    try {
      const res = await fetch('/api/admin/ia/clear-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, deleteUsage: false }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Error');
      await loadThread(phone);
      showToast('success', 'Historial borrado');
    } catch (e: any) {
      showToast('error', e?.message || 'No se pudo borrar el historial');
    }
  }

  async function handleDeleteThread(phone: string) {
    setConfirmAction(null);
    try {
      const res = await fetch('/api/admin/ia/delete-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Error');
      setCustomerMap(prev => { const n = { ...prev }; delete n[phone]; return n; });
      setSelectedPhone('');
      setThread(null);
      setShowOrdersPanel(false);
      setShowRightPanel(false);
      setMobileView('list');
      await loadThreads(false);
      showToast('success', 'Conversación eliminada completamente');
    } catch (e: any) {
      showToast('error', e?.message || 'No se pudo eliminar');
    }
  }

  async function handleLoadOrders(phone: string) {
    const existing = customerMap[phone];
    if (existing?.orders) { setShowOrdersPanel(true); return; }
    setLoadingOrders(true);
    setShowOrdersPanel(true);
    try {
      const res = await fetch(`/api/admin/ia/customer-lookup?phones=${encodeURIComponent(phone)}&detail=true`, { cache: 'no-store' });
      const data = await res.json();
      if (data?.customers?.[phone]) {
        setCustomerMap(prev => ({ ...prev, [phone]: { ...(prev[phone] || data.customers[phone]), ...data.customers[phone] } }));
      }
    } catch { /* ignore */ } finally {
      setLoadingOrders(false);
    }
  }

  async function handleLinkPhone(phone: string) {
    setLinkingPhone(true);
    try {
      const orders = customerMap[phone]?.orders || [];
      if (orders.length === 0) { showToast('error', 'No hay pedidos para vincular'); return; }
      const res = await fetch('/api/admin/ia/link-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, orderIds: orders.map(o => o.id) }),
      });
      const data = await res.json();
      if (data?.success) {
        showToast('success', `Vinculado a ${orders.length} pedido(s) correctamente`);
        await handleLoadOrders(phone);
      } else {
        throw new Error(data?.error || 'Error al vincular');
      }
    } catch (e: any) {
      showToast('error', e?.message || 'No se pudo vincular');
    } finally {
      setLinkingPhone(false);
    }
  }

  const usagePct = progressPct(thread?.usage.totalTokens || 0, thread?.usage.tokenLimit || config.tokenLimitPerCustomer);
  const usageColor = usagePct >= 100 ? '#ef4444' : usagePct >= 75 ? '#f59e0b' : '#00a884';

  const [currentPage, setCurrentPage] = useState(1);
  const CHATS_PER_PAGE = 10;

  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      const query = search.trim().toLowerCase();
      const phoneQuery = query.replace(/\D/g, '');
      const matchesSearch = !query || Boolean(
        (phoneQuery && t.phone.includes(phoneQuery)) ||
        t.displayName.toLowerCase().includes(query) ||
        t.preview.toLowerCase().includes(query) ||
        customerMap[t.phone]?.name?.toLowerCase().includes(query)
      );
      if (!matchesSearch) return false;
      if (filterTab === 'unread') return t.unreadCount > 0;
      if (filterTab === 'blocked') return t.blocked;
      if (filterTab === 'escalated') return t.escalated;
      return true;
    });
  }, [threads, filterTab, search, customerMap]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterTab]);

  const totalPages = Math.max(1, Math.ceil(filteredThreads.length / CHATS_PER_PAGE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedThreads = useMemo(() => {
    const start = (safePage - 1) * CHATS_PER_PAGE;
    return filteredThreads.slice(start, start + CHATS_PER_PAGE);
  }, [filteredThreads, safePage]);

  const keniaOn = config.isEnabled !== false;

  /* ── Reusable bits ─────────────────────────────────────────── */
  const renderAvatar = (phone: string, size: number, ring = true) => {
    const [bg, fg] = getAvatarColors(phone);
    const cinfo = customerMap[phone];
    if (cinfo?.avatarUrl) {
      return (
        <img src={cinfo.avatarUrl} alt={cinfo.name || phone}
          style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0, border: ring ? '2px solid rgba(0,168,132,0.25)' : 'none' }}
          onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
      );
    }
    return (
      <div style={{ width:size, height:size, borderRadius:'50%', background:bg, color:fg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.32, fontWeight:800, flexShrink:0, boxShadow:'inset 0 0 0 2px rgba(255,255,255,0.4)' }}>
        {cinfo?.name ? cinfo.name.split(' ').map((w: string) => w[0]).slice(0,2).join('').toUpperCase() : getInitials(phone)}
      </div>
    );
  };

  const statusLine = loadingThread ? 'Cargando…' :
    thread?.usage.adminTakeover ? '👤 Bajo control manual' :
    thread?.usage.escalated ? '⚠️ Conversación escalada' :
    thread?.usage.spamBlocked ? '🚫 Bloqueado por spam' :
    thread?.usage.blocked ? '🔒 IA bloqueada' :
    thread?.usage.overLimit ? '⚡ Límite de tokens alcanzado' :
    '🟢 Yaxbot activa';

  return (
    <div className="wa-root">
      <style>{`
        /* ════════════════════ DESIGN TOKENS ════════════════════ */
        .wa-root {
          --green:#00a884; --green-2:#02c999; --green-d:#047857;
          --ink:#0b1f17; --ink-2:#374151; --muted:#6b7280; --faint:#9ca3af;
          --line:rgba(15,23,42,0.08); --line-2:rgba(15,23,42,0.05);
          --surface:#ffffff; --surface-2:#f7f9fb; --surface-3:#eef2f6;
          --wallpaper:#d5dfd0;
          --r-sm:10px; --r:14px; --r-lg:20px; --r-xl:26px;
          --sh-sm:0 1px 3px rgba(15,23,42,0.08);
          --sh:0 4px 16px rgba(15,23,42,0.10);
          --sh-lg:0 12px 40px rgba(15,23,42,0.16);
          --sh-green:0 6px 20px rgba(0,168,132,0.35);
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
          display:flex;
          height:100dvh; height:100svh;
          width:100%;
          overflow:hidden;
          background:var(--surface-3);
          color:var(--ink);
          position:relative;
          -webkit-tap-highlight-color:transparent;
        }
        .wa-root *,.wa-root *::before,.wa-root *::after { box-sizing:border-box; }
        .admin-content-wrap,.admin-main-content { border-radius:0!important; border:none!important; padding:0!important; }

        /* ════════════════════ ANIMATIONS ════════════════════ */
        @keyframes wa-mesh { 0%{transform:translate(0,0) scale(1)} 33%{transform:translate(3%,-2%) scale(1.08)} 66%{transform:translate(-2%,3%) scale(1.05)} 100%{transform:translate(0,0) scale(1)} }
        @keyframes orbA { 0%,100%{transform:translate(0,0) scale(1);opacity:.5} 25%{transform:translate(50px,-40px) scale(1.2);opacity:.7} 50%{transform:translate(-30px,30px) scale(.85);opacity:.3} 75%{transform:translate(20px,50px) scale(1.1);opacity:.5} }
        @keyframes orbB { 0%,100%{transform:translate(0,0) scale(1);opacity:.3} 50%{transform:translate(-60px,50px) scale(1.3);opacity:.5} }
        @keyframes orbC { 0%,100%{transform:translate(0,0) scale(1);opacity:.25} 40%{transform:translate(40px,60px) scale(1.15);opacity:.4} 80%{transform:translate(-50px,-30px) scale(.9);opacity:.2} }
        @keyframes orbD { 0%,100%{transform:translate(0,0) scale(1);opacity:.2} 50%{transform:translate(70px,-50px) scale(1.25);opacity:.34} }
        @keyframes wa-slide-up { from{transform:translateY(24px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes wa-pop { from{transform:scale(.92);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes wa-fade { from{opacity:0} to{opacity:1} }
        @keyframes wa-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes wa-bubble-in { from{transform:translateY(8px) scale(.98);opacity:0} to{transform:translateY(0) scale(1);opacity:1} }
        @keyframes wa-shimmer { 0%{background-position:-400% 0} 100%{background-position:400% 0} }
        @keyframes wa-drawer-in { from{transform:translateX(100%)} to{transform:translateX(0)} }
        @keyframes wa-ring { 0%{box-shadow:0 0 0 0 rgba(0,168,132,.5)} 100%{box-shadow:0 0 0 8px rgba(0,168,132,0)} }

        /* ════════════════════ SCROLLBARS ════════════════════ */
        .wa-sb::-webkit-scrollbar { width:6px; height:6px; }
        .wa-sb::-webkit-scrollbar-track { background:transparent; }
        .wa-sb::-webkit-scrollbar-thumb { background:rgba(15,23,42,0.14); border-radius:6px; }
        .wa-sb::-webkit-scrollbar-thumb:hover { background:rgba(0,168,132,0.45); }
        .wa-noscroll::-webkit-scrollbar { display:none; }
        .wa-noscroll { scrollbar-width:none; }

        /* ════════════════════ LAYOUT ════════════════════ */
        .wa-col-list {
          width:30%; min-width:300px; max-width:420px; flex-shrink:0;
          background:var(--surface);
          display:flex; flex-direction:column; overflow:hidden;
          border-right:1px solid var(--line);
          box-shadow:1px 0 12px rgba(15,23,42,0.04);
          z-index:2;
        }
        .wa-col-chat { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; background:var(--wallpaper); position:relative; }

        /* ════════════════════ WALLPAPER ════════════════════ */
        .wa-wall { position:relative; overflow:hidden; background:var(--wallpaper);
          background-image:
            radial-gradient(ellipse 70% 55% at 18% 16%, rgba(34,197,160,0.14) 0%, transparent 55%),
            radial-gradient(ellipse 55% 65% at 84% 80%, rgba(59,130,246,0.08) 0%, transparent 55%),
            radial-gradient(ellipse 45% 42% at 50% 45%, rgba(255,255,255,0.5) 0%, transparent 60%),
            radial-gradient(ellipse 48% 38% at 8% 90%, rgba(255,255,255,0.45) 0%, transparent 55%);
        }
        .wa-wall::before {
          content:""; position:absolute; inset:-30%;
          background:
            radial-gradient(ellipse 60% 50% at 15% 15%, rgba(34,197,160,0.10) 0%, transparent 50%),
            radial-gradient(ellipse 50% 60% at 85% 75%, rgba(59,130,246,0.06) 0%, transparent 50%),
            radial-gradient(ellipse 30% 30% at 60% 20%, rgba(0,100,80,0.04) 0%, transparent 50%);
          animation:wa-mesh 32s ease-in-out infinite; z-index:0; pointer-events:none;
        }
        .wa-wall::after {
          content:""; position:absolute; inset:0; z-index:0; pointer-events:none; opacity:1;
          background-repeat:repeat; background-size:200px 200px;
          background-image:url("data:image/svg+xml,%3Csvg width='200' height='200' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%232d5a40' stroke-width='0.8' opacity='0.06'%3E%3Cpath d='M20 20c8 0 14 5 14 13 0 7-6 13-14 13-2 0-4 0-6-1l-6 2 2-6c-1-2-2-5-2-8 0-8 6-13 12-13z'/%3E%3Crect x='45' y='12' width='12' height='20' rx='3'/%3E%3Ccircle cx='51' cy='28' r='1.5'/%3E%3Cpath d='M80 18c2-3 7-3 9 0 2 3 0 7-4 10-4-3-7-7-5-10z'/%3E%3Crect x='105' y='15' width='18' height='14' rx='2'/%3E%3Ccircle cx='114' cy='22' r='4'/%3E%3Cpath d='M140 22l4 4 8-8' stroke-linecap='round'/%3E%3Cpath d='M148 22l4 4 8-8' stroke-linecap='round'/%3E%3Cpath d='M175 14l2 5 5 0-4 3 2 5-5-3-5 3 2-5-4-3 5 0z'/%3E%3Ccircle cx='20' cy='55' r='8'/%3E%3Cpath d='M15 58c2 2 5 3 8 1' stroke-linecap='round'/%3E%3Cpath d='M48 48c3-3 7-3 10 0l5 5c2 2 2 5 0 7s-5 2-7 0l-5-5c-1-1-1-3 0-4s3-1 4 0l4 4' stroke-linecap='round'/%3E%3Crect x='78' y='48' width='6' height='12' rx='3'/%3E%3Cpath d='M75 56c0 4 3 7 6 7s6-3 6-7'/%3E%3Cpath d='M110 50l10-5-5 10-2-4z'/%3E%3Cpath d='M140 45c4 0 7 3 7 7v3l2 3h-18l2-3v-3c0-4 3-7 7-7z'/%3E%3Ccircle cx='20' cy='90' r='8'/%3E%3Cpath d='M12 90h16'/%3E%3Cpath d='M20 82c4 3 4 13 0 16'/%3E%3Cpath d='M20 82c-4 3-4 13 0 16'/%3E%3Crect x='42' y='85' width='16' height='11' rx='1'/%3E%3Cpath d='M42 86l8 6 8-6'/%3E%3Ccircle cx='108' cy='90' r='7'/%3E%3Cpath d='M108 86v4l3 2' stroke-linecap='round'/%3E%3Cpath d='M135 82c4 0 7 3 7 7 0 5-7 12-7 12s-7-7-7-12c0-4 3-7 7-7z'/%3E%3Ccircle cx='135' cy='89' r='2.5'/%3E%3Ccircle cx='165' cy='90' r='5'/%3E%3Ccircle cx='188' cy='88' r='5'/%3E%3Cpath d='M192 92l4 4' stroke-linecap='round'/%3E%3Cpath d='M15 125l5-8 3 5 4-3-5 8-3-5z'/%3E%3Cpath d='M45 118l8-3 8 3v6c0 5-4 8-8 10-4-2-8-5-8-10z'/%3E%3Cpath d='M49 124l3 3 5-5' stroke-linecap='round'/%3E%3Cpath d='M78 115h10l2 12h-14z'/%3E%3Cpath d='M80 115v-3c0-2 2-4 4-4s4 2 4 4v3'/%3E%3Ccircle cx='50' cy='155' r='2'/%3E%3Ccircle cx='57' cy='155' r='2'/%3E%3Ccircle cx='64' cy='155' r='2'/%3E%3Cpath d='M110 180l3 8h10l3-8-5 4-3-6-3 6z'/%3E%3Cpath d='M140 175c3 3 5 6 5 10 0 4-3 7-6 7s-5-3-5-6c0-2 1-4 3-5-1 3 1 4 3 4 0-3-1-6 0-10z'/%3E%3Ccircle cx='20' cy='245' r='4'/%3E%3Cpath d='M14 255c0-4 3-7 6-7s6 3 6 7'/%3E%3Ccircle cx='50' cy='278' r='7'/%3E%3Ccircle cx='50' cy='278' r='4'/%3E%3Ccircle cx='50' cy='278' r='1.5'/%3E%3C/g%3E%3C/svg%3E");
        }
        .wa-orb { position:absolute; border-radius:50%; filter:blur(80px); pointer-events:none; z-index:0; }
        .wa-orb-1 { width:380px;height:380px; background:radial-gradient(circle,rgba(34,197,160,0.18) 0%,transparent 65%); top:6%;left:10%; animation:orbA 22s ease-in-out infinite; }
        .wa-orb-2 { width:480px;height:480px; background:radial-gradient(circle,rgba(59,130,246,0.12) 0%,transparent 65%); bottom:4%;right:6%; animation:orbB 28s ease-in-out infinite; }
        .wa-orb-3 { width:300px;height:300px; background:radial-gradient(circle,rgba(251,191,36,0.08) 0%,transparent 65%); top:44%;left:52%; animation:orbC 24s ease-in-out infinite; }
        .wa-orb-4 { width:220px;height:220px; background:radial-gradient(circle,rgba(34,197,160,0.10) 0%,transparent 65%); bottom:28%;left:22%; animation:orbD 20s ease-in-out infinite; }
        .wa-wall > * { position:relative; z-index:1; }

        /* ════════════════════ SIDEBAR HEADER ════════════════════ */
        .wa-side-head {
          background:linear-gradient(135deg,var(--green) 0%,var(--green-2) 100%);
          padding:14px 16px calc(14px + env(safe-area-inset-top,0px));
          padding-top:max(14px,env(safe-area-inset-top,0px));
          display:flex; align-items:center; justify-content:space-between; gap:10px;
          flex-shrink:0; box-shadow:0 4px 16px rgba(0,168,132,0.28); position:relative; z-index:3;
        }
        .wa-ico-btn {
          width:38px; height:38px; border-radius:50%; flex-shrink:0;
          background:transparent; border:none; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          color:rgba(255,255,255,0.92); transition:background .18s, transform .12s;
        }
        .wa-ico-btn:hover { background:rgba(255,255,255,0.2); }
        .wa-ico-btn:active { transform:scale(.92); }

        /* ════════════════════ STATS ════════════════════ */
        .wa-stats { display:flex; gap:7px; padding:10px 12px; overflow-x:auto; flex-shrink:0; background:#f8fffe; border-bottom:1px solid rgba(0,168,132,0.10); }
        .wa-stat { flex:1; min-width:72px; background:#fff; border:1px solid var(--line-2); border-radius:var(--r-sm); padding:8px 6px; text-align:center; box-shadow:var(--sh-sm); }
        .wa-stat b { font-size:17px; font-weight:800; line-height:1; display:block; }
        .wa-stat span { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--faint); }

        /* ════════════════════ SEARCH + FILTERS ════════════════════ */
        .wa-search-wrap { padding:10px 12px 6px; background:var(--surface); flex-shrink:0; }
        .wa-search { display:flex; align-items:center; gap:8px; background:var(--surface-3); border:1.5px solid transparent; border-radius:24px; padding:9px 14px; transition:border-color .18s, background .18s; }
        .wa-search:focus-within { border-color:rgba(0,168,132,0.45); background:#fff; box-shadow:0 0 0 4px rgba(0,168,132,0.08); }
        .wa-search input { flex:1; background:transparent; border:none; outline:none; color:var(--ink); font-size:14.5px; min-width:0; }
        .wa-search input::placeholder { color:var(--faint); }
        .wa-filters { display:flex; gap:6px; padding:4px 12px 10px; overflow-x:auto; flex-shrink:0; background:var(--surface); }
        .wa-pill { padding:6px 15px; border-radius:20px; font-size:12.5px; font-weight:600; cursor:pointer; border:1.5px solid var(--line); background:#fff; color:var(--muted); white-space:nowrap; transition:all .18s; display:flex; align-items:center; gap:5px; }
        .wa-pill:hover { border-color:rgba(0,168,132,0.4); color:var(--green); }
        .wa-pill.on { background:linear-gradient(135deg,var(--green),var(--green-2)); color:#fff; border-color:transparent; box-shadow:var(--sh-green); }
        .wa-pill .cnt { background:rgba(255,255,255,0.3); border-radius:10px; padding:0 6px; font-size:10px; font-weight:800; }
        .wa-pill:not(.on) .cnt { background:var(--green); color:#fff; }

        /* ════════════════════ THREAD ITEMS ════════════════════ */
        .wa-threads { flex:1; overflow-y:auto; padding:6px; }
        .wa-thread { display:flex; gap:12px; align-items:center; padding:11px 12px; margin-bottom:3px; border-radius:var(--r); cursor:pointer; transition:background .16s, transform .1s; position:relative; }
        .wa-thread:hover { background:rgba(0,168,132,0.06); }
        .wa-thread:active { transform:scale(.99); }
        .wa-thread.on { background:linear-gradient(135deg,rgba(0,168,132,0.13),rgba(0,168,132,0.05)); }
        .wa-thread.unread { background:linear-gradient(135deg,rgba(147,197,253,0.22),rgba(147,197,253,0.08)); }
        .wa-thread.unread:hover { background:linear-gradient(135deg,rgba(147,197,253,0.30),rgba(147,197,253,0.12)); }
        .wa-thread.unread.on { background:linear-gradient(135deg,rgba(0,168,132,0.13),rgba(0,168,132,0.05)); }
        .wa-thread.on::before { content:''; position:absolute; left:0; top:14px; bottom:14px; width:3.5px; border-radius:4px; background:var(--green); }
        .wa-thread-name { font-size:15px; font-weight:600; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:62%; }
        .wa-thread-prev { font-size:13px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; }
        .wa-tag { font-size:9px; font-weight:800; border-radius:5px; padding:1.5px 6px; flex-shrink:0; letter-spacing:.02em; }

        /* ════════════════════ CHAT HEADER ════════════════════ */
        .wa-chat-head { display:flex; align-items:center; gap:12px; padding:9px 14px; flex-shrink:0; background:rgba(255,255,255,0.88); backdrop-filter:blur(16px) saturate(140%); border-bottom:1px solid var(--line); box-shadow:0 2px 10px rgba(15,23,42,0.05); z-index:3; }
        .wa-chat-ico { width:40px; height:40px; border-radius:50%; flex-shrink:0; background:transparent; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--muted); transition:background .18s; }
        .wa-chat-ico:hover { background:rgba(0,168,132,0.1); color:var(--green); }
        .wa-chat-ico.on { background:rgba(0,168,132,0.14); color:var(--green); }

        /* ════════════════════ BANNERS ════════════════════ */
        .wa-banner { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 16px; flex-shrink:0; font-size:13px; font-weight:600; z-index:2; }
        .wa-banner.blue  { background:rgba(59,130,246,0.10); border-bottom:1px solid rgba(59,130,246,0.2); color:#1d4ed8; }
        .wa-banner.amber { background:rgba(245,158,11,0.10); border-bottom:1px solid rgba(245,158,11,0.2); color:#b45309; }
        .wa-banner.red   { background:rgba(239,68,68,0.10); border-bottom:1px solid rgba(239,68,68,0.2); color:#dc2626; }
        .wa-banner-btn { background:rgba(59,130,246,0.2); border:1px solid rgba(59,130,246,0.3); color:#1d4ed8; border-radius:8px; padding:5px 13px; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap; }

        /* ════════════════════ MESSAGES ════════════════════ */
        .wa-msgs { flex:1; overflow-y:auto; padding:14px 6% 16px; display:flex; flex-direction:column; gap:3px; }
        .wa-daysep { display:flex; justify-content:center; margin:12px 0 8px; }
        .wa-daysep span { background:rgba(255,255,255,0.8); backdrop-filter:blur(8px); color:var(--muted); font-size:11.5px; font-weight:600; padding:5px 14px; border-radius:20px; box-shadow:0 1px 6px rgba(15,23,42,0.1); border:1px solid rgba(255,255,255,0.8); }
        .wa-bubble { max-width:min(68%,560px); position:relative; border-radius:16px; padding:9px 64px 22px 13px; font-size:14.5px; line-height:1.5; min-width:80px; box-shadow:0 1px 3px rgba(15,23,42,0.10); animation:wa-bubble-in .22s ease; word-break:break-word; }
        .wa-bubble.out { background:linear-gradient(150deg,#e8fedf 0%,#d2f8c6 100%); color:#143021; margin-left:auto; border:1px solid rgba(0,168,132,0.14); border-bottom-right-radius:5px; }
        .wa-bubble.in  { background:#fff; color:#143021; margin-right:auto; border:1px solid var(--line); border-bottom-left-radius:5px; }
        .wa-bubble.in.unread-admin { background:linear-gradient(135deg,#dbeafe,#bfdbfe); border-color:rgba(59,130,246,0.25); }
        .wa-bubble.out.unread-admin { background:linear-gradient(150deg,#dbeafe 0%,#bfdbfe 100%); border-color:rgba(59,130,246,0.25); color:#1e3a5f; }
        .wa-bubble-meta { position:absolute; bottom:6px; right:11px; font-size:11px; color:rgba(15,23,42,0.4); display:flex; align-items:center; gap:3px; }

        /* ════════════════════ COMPOSE ════════════════════ */
        .wa-compose { display:flex; align-items:flex-end; gap:10px; padding:10px 14px; padding-bottom:max(10px,env(safe-area-inset-bottom,0px)); flex-shrink:0; background:rgba(255,255,255,0.92); backdrop-filter:blur(16px); border-top:1px solid var(--line); box-shadow:0 -2px 14px rgba(15,23,42,0.06); z-index:2; }
        .wa-compose textarea { flex:1; background:var(--surface-3); border:1.5px solid transparent; border-radius:24px; padding:11px 18px; color:var(--ink); font-size:15px; outline:none; resize:none; min-height:46px; max-height:150px; line-height:1.45; transition:border-color .18s, box-shadow .18s, background .18s; font-family:inherit; }
        .wa-compose textarea:focus { border-color:rgba(0,168,132,0.4); box-shadow:0 0 0 4px rgba(0,168,132,0.08); background:#fff; }
        .wa-compose textarea::placeholder { color:var(--faint); }
        .wa-send { width:46px; height:46px; border-radius:50%; flex-shrink:0; background:linear-gradient(135deg,var(--green),var(--green-2)); border:none; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:var(--sh-green); transition:transform .16s, box-shadow .16s; }
        .wa-send:hover { transform:scale(1.08); box-shadow:0 8px 22px rgba(0,168,132,0.5); }
        .wa-send:active { transform:scale(.96); }
        .wa-send:disabled { background:#d1d5db; box-shadow:none; cursor:not-allowed; transform:none; }

        /* ════════════════════ RIGHT DRAWER ════════════════════ */
        .wa-drawer-bg { position:fixed; inset:0; background:rgba(15,23,42,0.4); backdrop-filter:blur(3px); z-index:40; animation:wa-fade .25s ease; }
        .wa-drawer {
          position:fixed; top:0; right:0; bottom:0; width:400px; max-width:100%;
          background:var(--surface-2); z-index:41; display:flex; flex-direction:column; overflow:hidden;
          box-shadow:-12px 0 48px rgba(15,23,42,0.22); animation:wa-drawer-in .3s cubic-bezier(.4,0,.2,1);
        }
        .wa-drawer-head { background:linear-gradient(135deg,var(--green),var(--green-2)); padding:16px; padding-top:max(16px,env(safe-area-inset-top,0px)); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; box-shadow:0 4px 16px rgba(0,168,132,0.25); }
        .wa-drawer-body { flex:1; overflow-y:auto; padding-bottom:env(safe-area-inset-bottom,0px); }

        .wa-psec { padding:16px; border-bottom:1px solid var(--line-2); }
        .wa-plabel { font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.14em; color:var(--green-d); margin-bottom:12px; display:flex; align-items:center; gap:8px; }
        .wa-plabel::after { content:''; flex:1; height:1px; background:linear-gradient(90deg,rgba(0,168,132,0.25),transparent); }

        /* ════════════════════ BUTTONS ════════════════════ */
        .wa-btn { width:100%; display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:var(--r-sm); border:1.5px solid var(--line); background:#fff; color:var(--ink-2); font-size:13.5px; font-weight:600; cursor:pointer; text-align:left; transition:all .18s; box-shadow:var(--sh-sm); }
        .wa-btn:hover:not(:disabled) { border-color:rgba(0,168,132,0.3); box-shadow:var(--sh); transform:translateY(-1px); }
        .wa-btn:active:not(:disabled) { transform:translateY(0); }
        .wa-btn:disabled { opacity:.4; cursor:not-allowed; }
        .wa-btn.blue  { background:rgba(59,130,246,0.08); border-color:rgba(59,130,246,0.3); color:#1d4ed8; }
        .wa-btn.red   { background:rgba(239,68,68,0.08); border-color:rgba(239,68,68,0.3); color:#dc2626; }
        .wa-btn.green { background:rgba(0,168,132,0.1); border-color:rgba(0,168,132,0.35); color:var(--green-d); }
        .wa-btn.slate { background:rgba(100,116,139,0.08); border-color:rgba(100,116,139,0.25); color:#475569; }
        .wa-btn .badge { margin-left:auto; font-size:9.5px; font-weight:800; padding:2px 8px; border-radius:6px; background:currentColor; }
        .wa-btn .badge span { color:#fff; }

        .wa-cta { width:100%; border:none; border-radius:var(--r-sm); padding:13px; color:#fff; font-size:14px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg,var(--green),var(--green-2)); box-shadow:var(--sh-green); transition:transform .14s, box-shadow .14s, opacity .14s; }
        .wa-cta:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 8px 22px rgba(0,168,132,0.45); }
        .wa-cta:disabled { opacity:.45; cursor:not-allowed; }
        .wa-cta.ghost { background:#f9fafb; color:var(--ink-2); border:1.5px solid var(--line); box-shadow:none; }

        /* ════════════════════ TOGGLE ════════════════════ */
        .wa-switch { position:relative; width:50px; height:28px; flex-shrink:0; }
        .wa-switch input { opacity:0; width:0; height:0; }
        .wa-switch .track { position:absolute; cursor:pointer; inset:0; background:#cbd5e1; border-radius:28px; transition:.3s; box-shadow:inset 0 1px 3px rgba(0,0,0,0.15); }
        .wa-switch .track:before { content:''; position:absolute; width:22px; height:22px; left:3px; bottom:3px; background:#fff; border-radius:50%; transition:.3s; box-shadow:0 1px 4px rgba(0,0,0,0.25); }
        .wa-switch input:checked + .track { background:linear-gradient(135deg,var(--green),var(--green-2)); }
        .wa-switch input:checked + .track:before { transform:translateX(22px); }

        .wa-input { width:100%; background:#f9fafb; border:1.5px solid var(--line); border-radius:var(--r-sm); padding:11px 14px; color:var(--ink); font-size:14.5px; outline:none; transition:border-color .18s; }
        .wa-input:focus { border-color:var(--green); box-shadow:0 0 0 3px rgba(0,168,132,0.1); }

        /* ════════════════════ MODALS / TOAST / FAB ════════════════════ */
        .wa-modal-bg { position:fixed; inset:0; background:rgba(15,23,42,0.55); backdrop-filter:blur(8px); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px; animation:wa-fade .2s ease; }
        .wa-modal { background:#fff; border-radius:var(--r-lg); padding:28px 24px; padding-bottom:max(28px,calc(20px + env(safe-area-inset-bottom,0px))); width:100%; box-shadow:var(--sh-lg); animation:wa-pop .25s ease; }
        .wa-toast { position:fixed; bottom:max(28px,env(safe-area-inset-bottom,12px)); left:50%; transform:translateX(-50%); z-index:9999; animation:wa-slide-up .35s cubic-bezier(.34,1.56,.64,1); max-width:92vw; }
        .wa-fab { display:none; }

        /* ════════════════════ SKELETON ════════════════════ */
        .wa-skel { background:linear-gradient(90deg,#eef2f6 25%,#e2e8f0 50%,#eef2f6 75%); background-size:400% 100%; animation:wa-shimmer 1.4s linear infinite; border-radius:8px; }

        /* ════════════════════════════════════════════════════════
           RESPONSIVE — MOBILE
           ════════════════════════════════════════════════════════ */
        @media (max-width:860px) {
          .wa-col-list { width:46%; min-width:280px; }
        }
        @media (max-width:768px) {
          .wa-col-list { width:100%; max-width:100%; min-width:0; border-right:none; box-shadow:none; }
          .wa-col-chat { width:100%; }
          .wa-mobile-hide { display:none !important; }
          .wa-show.list .wa-col-chat { display:none !important; }
          .wa-show.chat .wa-col-list { display:none !important; }
          .wa-drawer { width:100%; }
          .wa-back { display:flex !important; }
          .wa-msgs { padding:12px 12px 14px; }
          .wa-bubble { max-width:82%; font-size:15px; }
          .wa-stat b { font-size:16px; }
          .wa-chat-head { padding:9px 10px; }
          .wa-fab {
            display:flex; position:fixed; right:18px; bottom:max(22px,calc(18px + env(safe-area-inset-bottom,0px)));
            width:58px; height:58px; border-radius:50%; z-index:30;
            background:linear-gradient(135deg,var(--green),var(--green-2)); color:#fff;
            border:none; cursor:pointer; align-items:center; justify-content:center;
            box-shadow:0 8px 24px rgba(0,168,132,0.5); animation:wa-pop .3s ease;
          }
          .wa-fab:active { transform:scale(.92); }
        }
        @media (min-width:769px) {
          .wa-back { display:none !important; }
          .wa-col-list, .wa-col-chat { display:flex !important; }
        }
        @media (max-width:420px) {
          .wa-stat { min-width:64px; padding:7px 4px; }
          .wa-bubble { max-width:86%; }
          .wa-modal { padding:22px 18px; }
        }
        @media (prefers-reduced-motion:reduce) {
          .wa-root *, .wa-wall::before, .wa-orb { animation:none !important; transition:none !important; }
        }
      `}</style>

      <div className={`wa-show ${mobileView}`} style={{ display:'flex', width:'100%', height:'100%', overflow:'hidden' }}>

        {/* ═══════════════ COLUMN: LIST ═══════════════ */}
        <aside className="wa-col-list">
          {/* Header */}
          <div className="wa-side-head">
            <div style={{ display:'flex', alignItems:'center', gap:11, minWidth:0 }}>
              <div style={{ position:'relative', flexShrink:0 }}>
                <div aria-label="Yaxbot" style={{ width:42, height:42, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', background:'linear-gradient(135deg,#14b88a,#087f69)', border:'2px solid rgba(255,255,255,0.5)' }}>
                  <Bot size={22} />
                </div>
                <span style={{ position:'absolute', bottom:0, right:0, width:12, height:12, borderRadius:'50%', background: keniaOn ? '#4ade80' : '#9ca3af', border:'2px solid #06a983' }} />
              </div>
              <div style={{ minWidth:0 }}>
                <p style={{ fontSize:16, fontWeight:800, color:'#fff', lineHeight:1.15, letterSpacing:'-.01em' }}>Importadora Carlitos · WhatsApp</p>
                <p style={{ fontSize:12, color:'rgba(255,255,255,0.88)', display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:7, height:7, background:'#fff', borderRadius:'50%', animation:'wa-pulse 2s infinite' }} />
                  {keniaOn ? 'Atención activa · respondiendo' : 'En mantenimiento'}
                </p>
              </div>
            </div>
            <div style={{ display:'flex', gap:2, flexShrink:0 }}>
              <button onClick={() => setShowNewChatModal(true)} title="Nuevo chat" className="wa-ico-btn"><MessageSquarePlus className="h-5 w-5" /></button>
              <button onClick={() => loadThreads(true)} title="Actualizar" className="wa-ico-btn"><RefreshCw className={`h-5 w-5 ${loadingThreads ? 'animate-spin' : ''}`} /></button>
              <Link href="/admin/ia" title="Volver" className="wa-ico-btn"><ArrowLeft className="h-5 w-5" /></Link>
            </div>
          </div>

          {/* Stats */}
          <div className="wa-stats wa-noscroll">
            {[
              { label:'Hilos', value: compactNumber(stats.totalThreads), color:'#374151', dot:'#9ca3af' },
              { label:'Sin leer', value: stats.unreadThreads, color: stats.unreadThreads>0?'#b45309':'#374151', dot: stats.unreadThreads>0?'#f59e0b':'#9ca3af' },
              { label:'Bloq.', value: stats.blockedThreads, color: stats.blockedThreads>0?'#dc2626':'#374151', dot: stats.blockedThreads>0?'#ef4444':'#9ca3af' },
              { label:'Tokens', value: compactNumber(stats.totalTokens), color:'#047857', dot:'#00a884' },
            ].map(s => (
              <div key={s.label} className="wa-stat">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, marginBottom:2 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:s.dot, flexShrink:0 }} />
                  <b style={{ color:s.color }}>{s.value}</b>
                </div>
                <span>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="wa-search-wrap">
            <div className="wa-search">
              <Search className="h-4 w-4 shrink-0" style={{ color:'#9ca3af' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversación…" />
              {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', display:'flex' }}><X className="h-4 w-4" /></button>}
            </div>
          </div>

          {/* Filters */}
          <div className="wa-filters wa-noscroll">
            {([['all','Todos'],['unread','Sin leer'],['escalated','Escalados'],['blocked','Bloqueados']] as [FilterTab,string][]).map(([key,label]) => (
              <button key={key} onClick={() => setFilterTab(key)} className={`wa-pill ${filterTab===key?'on':''}`}>
                {label}
                {key==='unread' && stats.unreadThreads>0 && <span className="cnt">{stats.unreadThreads}</span>}
                {key==='blocked' && stats.blockedThreads>0 && <span className="cnt">{stats.blockedThreads}</span>}
              </button>
            ))}
          </div>

          {/* Thread list */}
          <div className="wa-threads wa-sb">
            {loadingThreads ? (
              [...Array(7)].map((_,i) => (
                <div key={i} style={{ display:'flex', gap:12, alignItems:'center', padding:'11px 12px' }}>
                  <div className="wa-skel" style={{ width:49, height:49, borderRadius:'50%', flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div className="wa-skel" style={{ height:13, width:'55%', marginBottom:8 }} />
                    <div className="wa-skel" style={{ height:11, width:'82%' }} />
                  </div>
                </div>
              ))
            ) : filteredThreads.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'70%', gap:12, color:'#9ca3af', padding:20, textAlign:'center' }}>
                <div style={{ width:70, height:70, borderRadius:'50%', background:'rgba(0,168,132,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <MessageCircle className="h-8 w-8" style={{ color:'#00a884', opacity:.6 }} />
                </div>
                <p style={{ fontSize:14, fontWeight:600, color:'#6b7280' }}>Sin resultados</p>
                <button onClick={() => setShowNewChatModal(true)} className="wa-cta" style={{ width:'auto', padding:'9px 18px', fontSize:13 }}>
                  <Plus className="h-4 w-4" /> Nuevo chat
                </button>
              </div>
            ) : paginatedThreads.map(t => {
              const active = t.phone === selectedPhone;
              const statusDot = t.spamBlocked ? '#ef4444' : t.adminTakeover ? '#3b82f6' : t.escalated ? '#f59e0b' : t.blocked ? '#9ca3af' : null;
              const cinfo = customerMap[t.phone];
              const displayName = cinfo?.name?.trim() || t.displayName?.trim() || `+${t.phone}`;
              return (
                <div key={t.phone} className={`wa-thread ${active?'on':''} ${t.unreadCount>0 && !active?'unread':''}`}
                  onClick={() => { setSelectedPhone(t.phone); setMobileView('chat'); }}>
                  <div style={{ position:'relative', flexShrink:0 }}>
                    {renderAvatar(t.phone, 49)}
                    {statusDot && <span style={{ position:'absolute', bottom:1, right:1, width:13, height:13, borderRadius:'50%', background:statusDot, border:'2.5px solid #fff' }} />}
                    {t.unreadCount > 0 && !active && (
                      <span style={{ position:'absolute', top:-3, right:-3, minWidth:19, height:19, borderRadius:10, background:'#00a884', color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 5px', border:'2px solid #fff', boxShadow:'0 2px 6px rgba(0,168,132,0.4)' }}>
                        {t.unreadCount > 99 ? '99+' : t.unreadCount}
                      </span>
                    )}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:2, gap:6 }}>
                      <p className="wa-thread-name">{displayName}</p>
                      <span style={{ fontSize:11.5, color: t.unreadCount>0 ? '#00a884' : '#9ca3af', fontWeight: t.unreadCount>0?700:400, flexShrink:0 }}>{formatRelativeDate(t.lastAt)}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <p className="wa-thread-prev">
                        {cinfo?.registered && cinfo.name ? (t.preview || 'Sin mensajes') : `+${t.phone} · ${t.preview || 'Sin mensajes'}`}
                      </p>
                      {cinfo?.orderCount != null && cinfo.orderCount > 0 && (
                        <span className="wa-tag" style={{ background:'rgba(0,168,132,0.13)', color:'#047857' }}>{cinfo.orderCount} ped</span>
                      )}
                      {t.escalated && <span className="wa-tag" style={{ background:'rgba(245,158,11,0.18)', color:'#b45309' }}>ESC</span>}
                      {t.spamBlocked && <span className="wa-tag" style={{ background:'rgba(239,68,68,0.18)', color:'#dc2626' }}>SPAM</span>}
                    </div>
                    {cinfo?.registered && (
                      <p style={{ fontSize:10.5, color:'#10b981', marginTop:2, fontWeight:600 }}>
                        {cinfo.totalSpent > 0 ? `$${cinfo.totalSpent.toLocaleString('es-CL')} en compras` : 'Cliente registrado'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination controls */}
          {filteredThreads.length > CHATS_PER_PAGE && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderTop: '1px solid #e5e7eb',
              background: '#f9fafb',
              fontSize: 12,
              fontWeight: 600,
              color: '#4b5563',
              flexShrink: 0
            }}>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  background: safePage <= 1 ? '#f3f4f6' : '#fff',
                  color: safePage <= 1 ? '#9ca3af' : '#1f2937',
                  cursor: safePage <= 1 ? 'not-allowed' : 'pointer'
                }}
              >
                ← Anterior
              </button>
              <span>
                Pág. {safePage} de {totalPages} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({filteredThreads.length} chats)</span>
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  background: safePage >= totalPages ? '#f3f4f6' : '#fff',
                  color: safePage >= totalPages ? '#9ca3af' : '#1f2937',
                  cursor: safePage >= totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Siguiente →
              </button>
            </div>
          )}
        </aside>

        {/* ═══════════════ COLUMN: CHAT ═══════════════ */}
        <section className="wa-col-chat">
          {!selectedPhone ? (
            <div className="wa-wall" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:18, padding:24, textAlign:'center' }}>
              <div className="wa-orb wa-orb-1" /><div className="wa-orb wa-orb-2" /><div className="wa-orb wa-orb-3" /><div className="wa-orb wa-orb-4" />
              <div style={{ width:104, height:104, borderRadius:'50%', background:'rgba(255,255,255,0.7)', backdropFilter:'blur(10px)', border:'3px solid rgba(0,168,132,0.3)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 12px 40px rgba(0,168,132,0.22)', animation:'wa-ring 2.4s ease-out infinite' }}>
                <MessageCircle className="h-12 w-12" style={{ color:'#00a884' }} />
              </div>
              <div style={{ animation:'wa-pop .4s ease' }}>
                <p style={{ fontSize:26, fontWeight:700, color:'#1f2937', marginBottom:8, letterSpacing:'-.02em' }}>Importadora Carlitos · WhatsApp Admin</p>
                <p style={{ fontSize:14.5, color:'#6b7280', maxWidth:360, lineHeight:1.6 }}>Selecciona una conversación para ver los mensajes y atender a tus clientes con Importadora Carlitos.</p>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
                {[
                  { label:`${stats.totalThreads} chats`, bg:'rgba(255,255,255,0.7)', color:'#374151' },
                  { label:`${compactNumber(stats.totalTokens)} tokens`, bg:'rgba(0,168,132,0.1)', color:'#047857' },
                  { label:`${stats.unreadThreads} sin leer`, bg: stats.unreadThreads>0?'rgba(251,191,36,0.16)':'rgba(255,255,255,0.7)', color: stats.unreadThreads>0?'#92400e':'#374151' },
                ].map(s => (
                  <span key={s.label} style={{ background:s.bg, backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.6)', borderRadius:20, padding:'7px 17px', fontSize:13, color:s.color, fontWeight:600, boxShadow:'0 1px 5px rgba(15,23,42,0.08)' }}>{s.label}</span>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="wa-chat-head">
                <button className="wa-back wa-chat-ico" style={{ display:'none' }} onClick={() => setMobileView('list')}>
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {renderAvatar(selectedPhone, 42)}
                <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={() => setShowRightPanel(true)}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <p style={{ fontSize:15.5, fontWeight:700, color:'var(--ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {customerMap[selectedPhone]?.name?.trim() || selectedSummary?.displayName?.trim() || `+${selectedPhone}`}
                    </p>
                    {customerMap[selectedPhone]?.registered && (
                      <span style={{ fontSize:10, background:'rgba(0,168,132,0.13)', color:'#047857', borderRadius:5, padding:'1.5px 6px', fontWeight:700, flexShrink:0 }}>
                        {customerMap[selectedPhone].orderCount > 0 ? `${customerMap[selectedPhone].orderCount} pedidos` : 'Registrado'}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize:12.5, color:'#6b7280' }}>{statusLine}</p>
                </div>
                <button onClick={() => selectedPhone && handleLoadOrders(selectedPhone)} title="Pedidos" className="wa-chat-ico wa-mobile-hide"><ShoppingBag className="h-5 w-5" /></button>
                <button onClick={() => setShowRightPanel(p => !p)} title="Panel de control" className={`wa-chat-ico ${showRightPanel?'on':''}`}><Settings2 className="h-5 w-5" /></button>
              </div>

              {/* Status banners */}
              {thread?.usage.adminTakeover && (
                <div className="wa-banner blue">
                  <span style={{ display:'flex', alignItems:'center', gap:8 }}><UserCheck className="h-4 w-4" /> Control manual activo — Yaxbot está pausada</span>
                  <button className="wa-banner-btn" onClick={() => handleSetBlock(false)} disabled={savingBlock}>Devolver a Yaxbot</button>
                </div>
              )}
              {thread?.usage.escalated && !thread?.usage.adminTakeover && (
                <div className="wa-banner amber"><span style={{ display:'flex', alignItems:'center', gap:8 }}><AlertTriangle className="h-4 w-4" /> Conversación escalada — Se necesita atención humana</span></div>
              )}
              {thread?.usage.spamBlocked && (
                <div className="wa-banner red"><span style={{ display:'flex', alignItems:'center', gap:8 }}><Ban className="h-4 w-4" /> Número bloqueado por spam — Yaxbot ignora los mensajes</span></div>
              )}

              {/* Messages */}
              <div ref={chatScrollRef} onScroll={handleChatScroll} className="wa-msgs wa-sb wa-wall">
                <div className="wa-orb wa-orb-1" /><div className="wa-orb wa-orb-2" /><div className="wa-orb wa-orb-3" /><div className="wa-orb wa-orb-4" />
                {loadingThread ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, gap:12, color:'#6b7280' }}>
                    <Loader2 className="h-8 w-8 animate-spin" style={{ color:'#00a884' }} />
                    <span style={{ fontSize:13 }}>Cargando mensajes…</span>
                  </div>
                ) : thread && thread.messages.length > 0 ? (
                  <>
                    {thread.messages.map((msg, idx) => {
                      const isOut = msg.role === 'assistant';
                      const mediaUrl = msg.text.match(/https?:\/\/\S+/)?.[0] || '';
                      const displayText = msg.text.replace(/https?:\/\/\S+/g, '').trim();
                      const prev = thread.messages[idx - 1];
                      const showDateDiv = !prev || new Date(msg.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();
                      const msgDate = new Date(msg.createdAt);
                      const timeStr = msgDate.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });
                      return (
                        <div key={msg.id}>
                          {showDateDiv && (
                            <div className="wa-daysep"><span>{msgDate.toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' })}</span></div>
                          )}
                          <div style={{ display:'flex', justifyContent: isOut ? 'flex-end' : 'flex-start', marginBottom:2 }}>
                            <div className={`wa-bubble ${isOut ? 'out' : 'in'} ${!msg.readByAdmin ? 'unread-admin' : ''}`}>
                              {!isOut && <p style={{ fontSize:11, fontWeight:800, color:'#00a884', marginBottom:3 }}>{selectedCustomerName}</p>}
                              {mediaUrl && <img src={mediaUrl} alt="Imagen enviada por WhatsApp" style={{ display:'block', maxWidth:'min(280px, 100%)', maxHeight:320, objectFit:'contain', borderRadius:10, marginBottom: displayText ? 8 : 0, background:'#f8fafc' }} />}
                              {displayText && <span style={{ whiteSpace:'pre-wrap' }}>{displayText}</span>}
                              <div className="wa-bubble-meta">
                                <span>{timeStr}</span>
                                {isOut && <CheckCheck className="h-3.5 w-3.5" style={{ color: msg.readByUser ? '#53bdeb' : 'rgba(15,23,42,0.4)' }} />}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, gap:10, color:'#6b7280' }}>
                    <MessageCircle className="h-10 w-10" style={{ opacity:.3 }} />
                    <p style={{ fontSize:14 }}>Sin mensajes en este chat</p>
                  </div>
                )}
              </div>

              {/* Scroll-to-bottom */}
              {showScrollBtn && (
                <button onClick={() => messagesEndRef.current?.scrollIntoView({ behavior:'smooth' })}
                  style={{ position:'absolute', bottom:84, right:18, width:44, height:44, borderRadius:'50%', background:'#fff', border:'1px solid var(--line)', color:'#6b7280', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'var(--sh)', zIndex:10, animation:'wa-slide-up .25s ease' }}>
                  <ChevronDown className="h-5 w-5" />
                </button>
              )}

              {/* Compose */}
              <div className="wa-compose">
                <textarea className="wa-sb" value={draft} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Escribe un mensaje…" rows={1} />
                <button className="wa-send" onClick={handleSend} disabled={!draft.trim() || sending}>
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* FAB mobile — nuevo chat (visible solo en la vista de lista en móvil) */}
      {mobileView === 'list' && (
        <button className="wa-fab" onClick={() => setShowNewChatModal(true)} title="Nuevo chat">
          <MessageSquarePlus className="h-6 w-6" />
        </button>
      )}

      {/* ═══════════════ RIGHT DRAWER (control panel) ═══════════════ */}
      {showRightPanel && (
        <>
          <div className="wa-drawer-bg" onClick={() => setShowRightPanel(false)} />
          <aside className="wa-drawer">
            <div className="wa-drawer-head">
              <p style={{ fontSize:15, fontWeight:800, color:'#fff', display:'flex', alignItems:'center', gap:8 }}>
                <Settings2 className="h-5 w-5" style={{ color:'rgba(255,255,255,0.85)' }} /> Panel de control
              </p>
              <button onClick={() => setShowRightPanel(false)} className="wa-ico-btn" style={{ background:'rgba(255,255,255,0.15)' }}><X className="h-5 w-5" /></button>
            </div>

            <div className="wa-drawer-body wa-sb">
              {/* Yaxbot per-client switch */}
              <div className="wa-psec">
                <p className="wa-plabel"><Bot className="h-3.5 w-3.5" /> Bot de WhatsApp {selectedPhone ? `· +${selectedPhone}` : ''}</p>
                {selectedPhone ? (
                  <label style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, background: (!thread?.usage.blocked) ? 'rgba(0,168,132,0.07)' : '#f9fafb', border:`1.5px solid ${(!thread?.usage.blocked) ? 'rgba(0,168,132,0.25)' : 'var(--line)'}`, borderRadius:'var(--r)', padding:'13px 15px', cursor:'pointer' }}>
                    <div>
                      <span style={{ fontSize:14, fontWeight:700, color:'var(--ink)', display:'block' }}>{!thread?.usage.blocked ? 'Yaxbot activa para este cliente' : 'Yaxbot en pausa para este cliente'}</span>
                      <span style={{ fontSize:11.5, color:'#6b7280' }}>{!thread?.usage.blocked ? 'Responde automáticamente' : 'No responderá hasta reactivar'}</span>
                    </div>
                    <span className="wa-switch">
                      <input type="checkbox" checked={!thread?.usage.blocked} onChange={e => handleSetBlock(!e.target.checked, 'manual')} disabled={savingBlock} />
                      <span className="track" />
                    </span>
                  </label>
                ) : (
                  <label style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, background: keniaOn ? 'rgba(0,168,132,0.07)' : '#f9fafb', border:`1.5px solid ${keniaOn ? 'rgba(0,168,132,0.25)' : 'var(--line)'}`, borderRadius:'var(--r)', padding:'13px 15px', cursor:'pointer' }}>
                    <div>
                      <span style={{ fontSize:14, fontWeight:700, color:'var(--ink)', display:'block' }}>{keniaOn ? 'Yaxbot activa (global)' : 'Yaxbot en pausa (global)'}</span>
                      <span style={{ fontSize:11.5, color:'#6b7280' }}>Selecciona un chat para controlar por cliente</span>
                    </div>
                    <span className="wa-switch">
                      <input type="checkbox" checked={keniaOn} onChange={e => saveKeniaStatusDirectly(e.target.checked)} />
                      <span className="track" />
                    </span>
                  </label>
                )}
              </div>

              {/* Selected client */}
              {selectedPhone && (
                <div className="wa-psec">
                  <p className="wa-plabel"><User className="h-3.5 w-3.5" /> Cliente seleccionado</p>
                  {(() => {
                    const cinfo = customerMap[selectedPhone];
                    return (
                      <div>
                        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom: cinfo?.registered ? 12 : 14 }}>
                          {renderAvatar(selectedPhone, 48)}
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontSize:15, fontWeight:700, color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cinfo?.name || `+${selectedPhone}`}</p>
                            <p style={{ fontSize:12, color:'#6b7280' }}>{cinfo?.name ? `+${selectedPhone} · ` : ''}{selectedSummary?.totalMessages || 0} mensajes</p>
                          </div>
                          {thread?.usage && (
                            thread.usage.spamBlocked ? <span className="wa-tag" style={{ background:'rgba(239,68,68,0.15)', color:'#dc2626', fontSize:10, padding:'4px 9px' }}>SPAM</span> :
                            thread.usage.adminTakeover ? <span className="wa-tag" style={{ background:'rgba(59,130,246,0.15)', color:'#1d4ed8', fontSize:10, padding:'4px 9px' }}>ADMIN</span> :
                            thread.usage.escalated ? <span className="wa-tag" style={{ background:'rgba(245,158,11,0.15)', color:'#b45309', fontSize:10, padding:'4px 9px' }}>ESC</span> :
                            thread.usage.blocked ? <span className="wa-tag" style={{ background:'rgba(100,116,139,0.15)', color:'#475569', fontSize:10, padding:'4px 9px' }}>OFF</span> :
                            <span className="wa-tag" style={{ background:'rgba(0,168,132,0.15)', color:'#047857', fontSize:10, padding:'4px 9px' }}>OK</span>
                          )}
                        </div>
                        {cinfo?.registered && (
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                            {cinfo.email && <span style={{ fontSize:11, color:'#6b7280', background:'#f3f4f6', borderRadius:7, padding:'4px 9px', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{cinfo.email}</span>}
                            {cinfo.orderCount > 0 && <span style={{ fontSize:11, color:'#047857', background:'rgba(0,168,132,0.1)', borderRadius:7, padding:'4px 9px', fontWeight:600 }}>{cinfo.orderCount} pedido{cinfo.orderCount!==1?'s':''}</span>}
                            {cinfo.totalSpent > 0 && <span style={{ fontSize:11, color:'#059669', background:'rgba(16,185,129,0.1)', borderRadius:7, padding:'4px 9px', fontWeight:600 }}>${cinfo.totalSpent.toLocaleString('es-CL')} comprado</span>}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Quick orders preview & link */}
                  {selectedPhone && (
                    <div style={{ marginTop:12 }}>
                      {!customerMap[selectedPhone]?.orders ? (
                        <button className="wa-btn" style={{ width:'100%', justifyContent:'center' }} onClick={() => handleLoadOrders(selectedPhone)}>
                          <ShoppingBag className="h-4 w-4" style={{ flexShrink:0 }} /> Cargar pedidos del cliente
                        </button>
                      ) : customerMap[selectedPhone]!.orders!.length === 0 ? (
                        <p style={{ fontSize:12.5, color:'#9ca3af', textAlign:'center', padding:'10px 0' }}>Sin pedidos para este número</p>
                      ) : (
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
                            <span style={{ fontSize:12, fontWeight:700, color:'#374151' }}>Últimos {customerMap[selectedPhone]!.orders!.length} pedidos</span>
                            {!customerMap[selectedPhone]?.registered && (
                              <button onClick={() => handleLinkPhone(selectedPhone)} disabled={linkingPhone} style={{ fontSize:11, fontWeight:700, color:'#fff', background:'linear-gradient(135deg,#00a884,#059669)', border:'none', borderRadius:7, padding:'5px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                                {linkingPhone ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />} Vincular
                              </button>
                            )}
                          </div>
                          {customerMap[selectedPhone]!.orders!.slice(0, 10).map(o => (
                            <div key={o.id} style={{ background:'#f9fafb', borderRadius:8, padding:'9px 11px', border:'1px solid var(--line)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                                <span style={{ fontSize:12, fontWeight:800, color:'#111827' }}>#{o.code}</span>
                                <span style={{ fontSize:9.5, fontWeight:800, padding:'2px 7px', borderRadius:5,
                                  background: o.status==='Entregado'?'rgba(16,185,129,0.13)':o.status==='Cancelado'?'rgba(239,68,68,0.13)':o.status.includes('Pendiente')?'rgba(245,158,11,0.13)':'rgba(0,168,132,0.13)',
                                  color: o.status==='Entregado'?'#059669':o.status==='Cancelado'?'#dc2626':o.status.includes('Pendiente')?'#b45309':'#047857' }}>{o.status}</span>
                              </div>
                              <div style={{ display:'flex', justifyContent:'space-between', fontSize:10.5, color:'#6b7280' }}>
                                <span>{o.date}</span>
                                <span style={{ fontWeight:700, color:'#374151' }}>${o.total.toLocaleString('es-CL')}</span>
                              </div>
                              {o.items && <p style={{ fontSize:10, color:'#9ca3af', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.items}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Token meter */}
                  <div style={{ marginTop:14, background:'linear-gradient(135deg,#f0fdf8,#e8faf3)', borderRadius:'var(--r)', padding:'14px 15px', border:'1px solid rgba(0,168,132,0.15)', boxShadow:'0 2px 8px rgba(0,168,132,0.08)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <span style={{ fontSize:12, color:'#374151', fontWeight:700, display:'flex', alignItems:'center', gap:5 }}><Zap className="h-3.5 w-3.5" style={{ color:'#00a884' }} /> Historial de uso de IA</span>
                      <span style={{ fontSize:13, fontWeight:800, color:usageColor, background: usagePct>=100?'rgba(239,68,68,0.1)':usagePct>=75?'rgba(245,158,11,0.1)':'rgba(0,168,132,0.12)', padding:'2px 9px', borderRadius:8 }}>{usagePct}%</span>
                    </div>
                    <div style={{ height:8, background:'rgba(15,23,42,0.08)', borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${usagePct}%`, borderRadius:4, transition:'width .6s cubic-bezier(.4,0,.2,1)', background: usagePct>=100?'linear-gradient(90deg,#ef4444,#dc2626)':usagePct>=75?'linear-gradient(90deg,#f59e0b,#d97706)':'linear-gradient(90deg,#00a884,#059669)' }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:11, color:'#6b7280' }}>
                      <span>{thread?.usage.totalTokens.toLocaleString('es-CL') || 0} usados</span>
                      <span>lím. {thread?.usage.tokenLimit?.toLocaleString('es-CL') || config.tokenLimitPerCustomer.toLocaleString('es-CL')}</span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:10 }}>
                      {[['Prompt', thread?.usage.promptTokens || 0],['Respuesta', thread?.usage.responseTokens || 0]].map(([l,v]) => (
                        <div key={l as string} style={{ background:'rgba(255,255,255,0.7)', borderRadius:10, padding:'8px 10px', textAlign:'center', border:'1px solid rgba(0,168,132,0.12)' }}>
                          <p style={{ fontSize:9.5, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:3, fontWeight:700 }}>{l}</p>
                          <p style={{ fontSize:15, fontWeight:800, color:'#047857' }}>{(v as number).toLocaleString('es-CL')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* IA control */}
              {selectedPhone && (
                <div className="wa-psec">
                  <p className="wa-plabel"><Shield className="h-3.5 w-3.5" /> Control del bot</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                    <button className={`wa-btn${thread?.usage.adminTakeover?' blue':''}`} onClick={() => handleSetBlock(true,'admin_takeover')} disabled={!selectedPhone||savingBlock||!!thread?.usage.adminTakeover}>
                      <User className="h-4 w-4" style={{ flexShrink:0 }} /> <span>Tomar control manual</span>
                      {thread?.usage.adminTakeover && <span className="badge" style={{ background:'rgba(59,130,246,0.2)' }}><span style={{ color:'#1d4ed8' }}>ACTIVO</span></span>}
                    </button>
                    <button className={`wa-btn${(!thread?.usage.blocked && !thread?.usage.adminTakeover && !thread?.usage.spamBlocked)?' green':''}`} onClick={() => handleSetBlock(false)} disabled={!selectedPhone||savingBlock||(!thread?.usage.blocked && !thread?.usage.adminTakeover && !thread?.usage.spamBlocked)}>
                      <Bot className="h-4 w-4" style={{ flexShrink:0 }} /> <span>Devolver a Yaxbot</span>
                      {(!thread?.usage.blocked && !thread?.usage.adminTakeover && !thread?.usage.spamBlocked) && <span className="badge" style={{ background:'rgba(0,168,132,0.2)' }}><span style={{ color:'#047857' }}>ACTIVO</span></span>}
                    </button>
                    <button className={`wa-btn${thread?.usage.spamBlocked?' red':''}`} onClick={() => handleSetBlock(true,'spam')} disabled={!selectedPhone||savingBlock||!!thread?.usage.spamBlocked}>
                      <Ban className="h-4 w-4" style={{ flexShrink:0 }} /> <span>Bloquear por spam</span>
                      {thread?.usage.spamBlocked && <span className="badge" style={{ background:'rgba(239,68,68,0.2)' }}><span style={{ color:'#dc2626' }}>SPAM</span></span>}
                    </button>
                    <button className={`wa-btn${(thread?.usage.blocked && !thread?.usage.adminTakeover && !thread?.usage.spamBlocked)?' slate':''}`} onClick={() => handleSetBlock(true,'manual')} disabled={!selectedPhone||savingBlock||!!(thread?.usage.blocked && !thread?.usage.adminTakeover && !thread?.usage.spamBlocked)}>
                      <Lock className="h-4 w-4" style={{ flexShrink:0 }} /> <span>Pausar bot (manual)</span>
                      {(thread?.usage.blocked && !thread?.usage.adminTakeover && !thread?.usage.spamBlocked) && <span className="badge" style={{ background:'rgba(100,116,139,0.2)' }}><span style={{ color:'#475569' }}>BLOQ</span></span>}
                    </button>
                  </div>
                </div>
              )}

              {/* Smart status */}
              {selectedPhone && thread && (
                <div className="wa-psec">
                  <p className="wa-plabel"><TrendingUp className="h-3.5 w-3.5" /> Estado inteligente</p>
                  <div style={{ background: thread.usage.overLimit?'rgba(239,68,68,0.07)':thread.usage.escalated?'rgba(245,158,11,0.07)':'rgba(0,168,132,0.07)', border:`1px solid ${thread.usage.overLimit?'rgba(239,68,68,0.2)':thread.usage.escalated?'rgba(245,158,11,0.2)':'rgba(0,168,132,0.2)'}`, borderRadius:'var(--r)', padding:'13px 15px', display:'flex', alignItems:'flex-start', gap:10 }}>
                    {thread.usage.overLimit ? <TrendingUp className="h-4 w-4" style={{ color:'#dc2626', flexShrink:0, marginTop:2 }} /> : thread.usage.escalated ? <AlertTriangle className="h-4 w-4" style={{ color:'#b45309', flexShrink:0, marginTop:2 }} /> : <Shield className="h-4 w-4" style={{ color:'#059669', flexShrink:0, marginTop:2 }} />}
                    <p style={{ fontSize:13, lineHeight:1.55, color: thread.usage.overLimit?'#dc2626':thread.usage.escalated?'#b45309':'#059669' }}>
                      {thread.usage.overLimit ? 'Se alcanzó el límite histórico de IA. Las respuestas fijas actuales del bot no consumen esos tokens.' : thread.usage.escalated ? 'Conversación escalada. El cliente necesita atención humana.' : 'El bot está respondiendo con el flujo automático.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Config */}
              <div className="wa-psec">
                <p className="wa-plabel"><Settings2 className="h-3.5 w-3.5" /> Configuración global</p>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div>
                    <p style={{ fontSize:12, color:'#6b7280', marginBottom:6, fontWeight:600 }}>Límite de tokens por cliente</p>
                    <input type="number" min={1000} step={500} value={config.tokenLimitPerCustomer} onChange={e => setConfig(p => ({ ...p, tokenLimitPerCustomer: Number(e.target.value || 0) }))} className="wa-input" />
                  </div>
                  <div>
                    <p style={{ fontSize:12, color:'#6b7280', marginBottom:6, fontWeight:600 }}>Pausar tras N mensajes sin respuesta</p>
                    <input type="number" min={1} step={1} value={config.messageThresholdForPause} onChange={e => setConfig(p => ({ ...p, messageThresholdForPause: Number(e.target.value || 10) }))} className="wa-input" />
                  </div>
                  <label style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, background:'#f9fafb', border:'1.5px solid var(--line)', borderRadius:'var(--r-sm)', padding:'11px 14px', cursor:'pointer' }}>
                    <div>
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--ink)', display:'block' }}>Notificación inteligente</span>
                      <span style={{ fontSize:11, color:'#6b7280' }}>Avisa al iniciar, al pausar y cada ~10 mensajes</span>
                    </div>
                    <span className="wa-switch">
                      <input type="checkbox" checked={config.smartNotifications} onChange={e => setConfig(p => ({ ...p, smartNotifications: e.target.checked }))} />
                      <span className="track" />
                    </span>
                  </label>
                </div>
                <button onClick={handleSaveConfig} disabled={savingConfig || loadingConfig} className="wa-cta" style={{ marginTop:14 }}>
                  {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar configuración
                </button>
              </div>

              {/* Conversation actions */}
              {selectedPhone && (
                <div className="wa-psec">
                  <p className="wa-plabel"><MessageCircle className="h-3.5 w-3.5" /> Conversación</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                    <button className="wa-btn" onClick={() => selectedPhone && handleLoadOrders(selectedPhone)}>
                      <ShoppingBag className="h-4 w-4" style={{ flexShrink:0 }} /> <span>Ver pedidos del cliente</span>
                      {customerMap[selectedPhone]?.orderCount != null && customerMap[selectedPhone].orderCount > 0 && <span style={{ marginLeft:'auto', fontSize:10, background:'rgba(0,168,132,0.18)', color:'#047857', padding:'2px 8px', borderRadius:6, fontWeight:800 }}>{customerMap[selectedPhone].orderCount}</span>}
                    </button>
                    <button className="wa-btn green" onClick={() => handleSendTestTemplate(selectedPhone)} disabled={sendingTemplate}>
                      <Send className="h-4 w-4" style={{ flexShrink:0 }} /> <span>Enviar plantilla de prueba</span>
                      {sendingTemplate && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ marginLeft:'auto' }} />}
                    </button>
                    <button className="wa-btn" onClick={() => setConfirmAction({ type:'clear', phone:selectedPhone })}>
                      <RefreshCw className="h-4 w-4" style={{ flexShrink:0 }} /> <span>Borrar historial de chat</span>
                    </button>
                    <button className="wa-btn red" onClick={() => setConfirmAction({ type:'delete', phone:selectedPhone })}>
                      <Trash2 className="h-4 w-4" style={{ flexShrink:0 }} /> <span>Eliminar este número</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Orders */}
              {showOrdersPanel && selectedPhone && (
                <div className="wa-psec">
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                    <p className="wa-plabel" style={{ margin:0 }}><Package className="h-3.5 w-3.5" /> Pedidos</p>
                    <button onClick={() => setShowOrdersPanel(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', display:'flex' }}><X className="h-4 w-4" /></button>
                  </div>
                  {loadingOrders ? (
                    <div style={{ display:'flex', justifyContent:'center', padding:'20px 0' }}><Loader2 className="h-5 w-5 animate-spin" style={{ color:'#9ca3af' }} /></div>
                  ) : !customerMap[selectedPhone]?.orders?.length ? (
                    <p style={{ fontSize:13, color:'#9ca3af', textAlign:'center', padding:'12px 0' }}>Sin pedidos registrados</p>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                      {customerMap[selectedPhone]!.orders!.map(o => (
                        <div key={o.id} style={{ background:'#fff', borderRadius:'var(--r-sm)', padding:'11px 13px', border:'1px solid var(--line)', boxShadow:'var(--sh-sm)' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                            <span style={{ fontSize:12.5, fontWeight:800, color:'var(--ink)' }}>#{o.code}</span>
                            <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:6,
                              background: o.status==='Entregado'?'rgba(16,185,129,0.13)':o.status==='Cancelado'?'rgba(239,68,68,0.13)':o.status.includes('Pendiente')?'rgba(245,158,11,0.13)':'rgba(0,168,132,0.13)',
                              color: o.status==='Entregado'?'#059669':o.status==='Cancelado'?'#dc2626':o.status.includes('Pendiente')?'#b45309':'#047857' }}>{o.status}</span>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#6b7280', marginBottom: o.items?4:0 }}>
                            <span>{o.date}</span>
                            <span style={{ fontWeight:800, color:'var(--ink-2)' }}>${o.total.toLocaleString('es-CL')}</span>
                          </div>
                          {o.items && <p style={{ fontSize:11, color:'#9ca3af', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.items}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {/* ═══════════════ CONFIRM MODAL ═══════════════ */}
      {confirmAction && (
        <div className="wa-modal-bg" onClick={() => setConfirmAction(null)}>
          <div className="wa-modal" style={{ maxWidth:360 }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <div style={{ width:44, height:44, borderRadius:13, flexShrink:0, background: confirmAction.type==='delete'?'rgba(239,68,68,0.1)':'rgba(245,158,11,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {confirmAction.type==='delete' ? <Trash2 className="h-5 w-5" style={{ color:'#dc2626' }} /> : <RefreshCw className="h-5 w-5" style={{ color:'#b45309' }} />}
              </div>
              <p style={{ fontSize:17, fontWeight:800, color:'#111827' }}>{confirmAction.type==='delete' ? 'Eliminar número' : 'Borrar historial'}</p>
            </div>
            <p style={{ fontSize:13.5, color:'#6b7280', lineHeight:1.65, marginBottom:22 }}>
              {confirmAction.type==='delete' ? 'Se eliminarán todos los mensajes y el registro de este número. Esta acción no se puede deshacer.' : 'Se borrarán todos los mensajes del historial de este chat. El estado de IA se mantiene.'}
            </p>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setConfirmAction(null)} style={{ flex:1, background:'#f3f4f6', border:'1.5px solid #e5e7eb', borderRadius:12, padding:'12px', color:'#374151', fontSize:13.5, fontWeight:700, cursor:'pointer' }}>Cancelar</button>
              <button onClick={() => confirmAction.type==='delete' ? handleDeleteThread(confirmAction.phone) : handleClearHistory(confirmAction.phone)}
                style={{ flex:1, border:'none', borderRadius:12, padding:'12px', color:'#fff', fontSize:13.5, fontWeight:800, cursor:'pointer', background: confirmAction.type==='delete'?'linear-gradient(135deg,#ef4444,#dc2626)':'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: confirmAction.type==='delete'?'0 4px 14px rgba(239,68,68,0.35)':'0 4px 14px rgba(245,158,11,0.35)' }}>
                {confirmAction.type==='delete' ? 'Eliminar' : 'Borrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ TOAST ═══════════════ */}
      {message && (
        <div className="wa-toast">
          <div style={{ display:'flex', alignItems:'center', gap:10, borderRadius:14, padding:'13px 20px', fontSize:13.5, fontWeight:600, boxShadow:'var(--sh-lg)', background:'#fff', color: message.type==='success'?'#047857':'#991b1b', borderLeft:`4px solid ${message.type==='success'?'#00a884':'#ef4444'}` }}>
            {message.type==='success' ? <CheckCheck className="h-4 w-4" style={{ color:'#00a884' }} /> : <AlertTriangle className="h-4 w-4" style={{ color:'#ef4444' }} />}
            {message.text}
          </div>
        </div>
      )}

      {/* ═══════════════ NEW CHAT MODAL ═══════════════ */}
      {showNewChatModal && (
        <div className="wa-modal-bg" onClick={() => setShowNewChatModal(false)}>
          <div className="wa-modal" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
              <div>
                <h3 style={{ margin:0, color:'#111827', fontSize:19, fontWeight:800, letterSpacing:'-.02em' }}>Nuevo chat</h3>
                <p style={{ margin:'3px 0 0', color:'#9ca3af', fontSize:12.5 }}>Inicia conversación o envía plantilla de prueba</p>
              </div>
              <button onClick={() => setShowNewChatModal(false)} style={{ background:'#f3f4f6', border:'none', borderRadius:'50%', width:34, height:34, cursor:'pointer', color:'#6b7280', display:'flex', alignItems:'center', justifyContent:'center' }}><X className="h-4 w-4" /></button>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', color:'#374151', fontSize:12.5, fontWeight:700, marginBottom:7 }}>Número de teléfono</label>
              <input type="text" inputMode="numeric" value={newChatPhone} onChange={e => setNewChatPhone(e.target.value)} placeholder="56912345678" className="wa-input" />
            </div>
            <div style={{ marginBottom:24 }}>
              <label style={{ display:'block', color:'#374151', fontSize:12.5, fontWeight:700, marginBottom:7 }}>Nombre <span style={{ color:'#9ca3af', fontWeight:400 }}>(opcional)</span></label>
              <input type="text" value={newChatName} onChange={e => setNewChatName(e.target.value)} placeholder="Ej: Juan Pérez" className="wa-input" />
            </div>
            {newChatPhone.replace(/\D/g,'').length >= 8 && (
              <div style={{ marginBottom:24 }}>
                <label style={{ display:'block', color:'#374151', fontSize:12.5, fontWeight:700, marginBottom:7 }}>Pedidos recientes <span style={{ color:'#9ca3af', fontWeight:400 }}>(últimos 10)</span></label>
                {newChatOrdersLoading ? (
                  <div style={{ display:'flex', justifyContent:'center', padding:'16px 0' }}><Loader2 className="h-5 w-5 animate-spin" style={{ color:'#9ca3af' }} /></div>
                ) : newChatOrders.length === 0 ? (
                  <p style={{ fontSize:13, color:'#9ca3af', textAlign:'center', padding:'12px 0' }}>Sin pedidos para este número</p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:240, overflowY:'auto' }}>
                    {newChatOrders.map(o => (
                      <div key={o.id} style={{ background:'#f9fafb', borderRadius:8, padding:'9px 11px', border:'1px solid var(--line)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                          <span style={{ fontSize:12, fontWeight:800, color:'#111827' }}>#{o.code}</span>
                          <span style={{ fontSize:9.5, fontWeight:800, padding:'2px 7px', borderRadius:5,
                            background: o.status==='Entregado'?'rgba(16,185,129,0.13)':o.status==='Cancelado'?'rgba(239,68,68,0.13)':o.status.includes('Pendiente')?'rgba(245,158,11,0.13)':'rgba(0,168,132,0.13)',
                            color: o.status==='Entregado'?'#059669':o.status==='Cancelado'?'#dc2626':o.status.includes('Pendiente')?'#b45309':'#047857' }}>{o.status}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10.5, color:'#6b7280' }}>
                          <span>{o.date}</span>
                          <span style={{ fontWeight:700, color:'#374151' }}>${o.total.toLocaleString('es-CL')}</span>
                        </div>
                        {o.items && <p style={{ fontSize:10, color:'#9ca3af', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.items}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button onClick={handleCreateNewChat} disabled={!newChatPhone || newChatPhone.length < 8} className="wa-cta">Abrir panel del cliente</button>
              <button onClick={handleSendNewTestTemplate} disabled={!newChatPhone || newChatPhone.length < 8 || sendingNewTemplate} className="wa-cta ghost">
                {sendingNewTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" style={{ color:'#00a884' }} />} Enviar plantilla de prueba
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
