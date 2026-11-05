'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles, Package, Loader2, CheckCircle2, AlertCircle, ImagePlus } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  action?: ProductAction | null;
  actionStatus?: 'pending' | 'done' | 'error';
  displayedContent?: string;
  typed?: boolean;
}

interface ProductAction {
  type: 'create' | 'update' | 'delete' | 'create_category';
  name: string;
  price?: number;
  description?: string;
  category?: string;
  stock?: number;
  productId?: string;
  imageUrl?: string;
  imageUrl2?: string;
  imageUrl3?: string;
  tags?: string;
  sku?: string;
  barcode?: string;
  icon?: string;
  wholesalePrice?: number;
  wholesaleMinQuantity?: number;
  packQty?: number;
  internalCode?: string;
  section?: number;
  features?: string;
}

function parseAction(text: string): { clean: string; action: ProductAction | null } {
  const createMatch = text.match(/\[ACTION:CREATE_PRODUCT\]([\s\S]*?)\[\/ACTION\]/);
  if (createMatch) {
    try {
      const raw = JSON.parse(createMatch[1]);
      const clean = text.replace(/\[ACTION:CREATE_PRODUCT\][\s\S]*?\[\/ACTION\]/, '').trim();
      return { clean, action: { type: 'create', ...raw } };
    } catch { return { clean: text, action: null }; }
  }
  const updateMatch = text.match(/\[ACTION:UPDATE_PRODUCT\]([\s\S]*?)\[\/ACTION\]/);
  if (updateMatch) {
    try {
      const raw = JSON.parse(updateMatch[1]);
      const clean = text.replace(/\[ACTION:UPDATE_PRODUCT\][\s\S]*?\[\/ACTION\]/, '').trim();
      return { clean, action: { type: 'update', ...raw } };
    } catch { return { clean: text, action: null }; }
  }
  const deleteMatch = text.match(/\[ACTION:DELETE_PRODUCT\]([\s\S]*?)\[\/ACTION\]/);
  if (deleteMatch) {
    try {
      const raw = JSON.parse(deleteMatch[1]);
      const clean = text.replace(/\[ACTION:DELETE_PRODUCT\][\s\S]*?\[\/ACTION\]/, '').trim();
      return { clean, action: { type: 'delete', ...raw } };
    } catch { return { clean: text, action: null }; }
  }
  const categoryMatch = text.match(/\[ACTION:CREATE_CATEGORY\]([\s\S]*?)\[\/ACTION\]/);
  if (categoryMatch) {
    try {
      const raw = JSON.parse(categoryMatch[1]);
      const clean = text.replace(/\[ACTION:CREATE_CATEGORY\][\s\S]*?\[\/ACTION\]/, '').trim();
      return { clean, action: { type: 'create_category', ...raw } };
    } catch { return { clean: text, action: null }; }
  }
  return { clean: text, action: null };
}

const SUGGESTIONS = [
  { text: 'Crea un producto "Polo blanco" de $25000', icon: '📦' },
  { text: '¿Cómo puedo mejorar mis ventas?', icon: '📈' },
  { text: 'Crea 3 productos de ejemplo', icon: '✨' },
  { text: '¿Qué estrategias de marketing?', icon: '🎯' },
];

const PLACEHOLDERS = ['Crea un producto...', 'Pregunta lo que quieras...', 'Genera ideas...', 'Pide consejo...'];

export default function AISidekick({ open, onClose, onProductChange }: { open: boolean; onClose: () => void; onProductChange?: () => void }) {
  const notifyChange = useCallback(() => {
    onProductChange?.();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('yaxsel-data-change'));
  }, [onProductChange]);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '¡Hola! Soy **Importadora Carlitos**, tu copiloto de IA y dueño virtual. Puedo ayudarte a crear productos, gestionar pedidos, analizar ventas, crear descuentos y mucho más. ¿En qué te ayudo hoy?', typed: true },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [placeholder, setPlaceholder] = useState('');
  const [phIdx, setPhIdx] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) { setVisible(true); setClosing(false); }
    else if (visible) { setClosing(true); const t = setTimeout(() => { setClosing(false); setVisible(false); }, 350); return () => clearTimeout(t); }
  }, [open]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 200); }, [open]);

  // Typing placeholder animation
  useEffect(() => {
    if (inputFocused || input) { setPlaceholder(''); return; }
    let charIdx = 0;
    const word = PLACEHOLDERS[phIdx % PLACEHOLDERS.length];
    setPlaceholder('');
    const interval = setInterval(() => {
      charIdx++;
      setPlaceholder(word.slice(0, charIdx));
      if (charIdx >= word.length) {
        clearInterval(interval);
        setTimeout(() => setPhIdx(p => p + 1), 2000);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [phIdx, inputFocused, input]);

  // Typewriter effect for assistant messages
  const typewriterEffect = useCallback((msgIndex: number, fullText: string) => {
    let i = 0;
    const tick = () => {
      i += Math.floor(Math.random() * 3) + 1;
      if (i >= fullText.length) {
        setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, displayedContent: fullText, typed: true } : m));
        return;
      }
      setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, displayedContent: fullText.slice(0, i) } : m));
      typingRef.current = setTimeout(tick, 15 + Math.random() * 20);
    };
    tick();
  }, []);

  const executeProductAction = async (msgIndex: number, action: ProductAction) => {
    setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'pending' } : m));
    try {
      if (action.type === 'create_category') {
        const res = await fetch('/api/categories/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: action.name, description: action.description, icon: action.icon }),
        });
        const data = await res.json();
        if (data.success) {
          setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'done' } : m));
        } else {
          console.error('Error creating category:', data.error);
          setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'error' } : m));
        }
      } else if (action.type === 'update') {
        // For update, first search for the product by name if no productId
        let productId = action.productId;
        if (!productId && action.name) {
          const searchRes = await fetch(`/api/products/search?name=${encodeURIComponent(action.name)}&limit=1`);
          const searchData = await searchRes.json();
          if (searchData.success && searchData.products?.length > 0) {
            productId = searchData.products[0].$id;
          } else {
            setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'error' } : m));
            return;
          }
        }
        if (!productId) {
          setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'error' } : m));
          return;
        }
        const res = await fetch('/api/products/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            name: action.name,
            price: action.price,
            description: action.description,
            category: action.category,
            stock: action.stock,
            imageUrl: action.imageUrl,
            imageUrl2: action.imageUrl2,
            imageUrl3: action.imageUrl3,
            tags: action.tags,
            sku: action.sku,
            barcode: action.barcode,
            wholesalePrice: action.wholesalePrice,
            wholesaleMinQuantity: action.wholesaleMinQuantity,
            packQty: action.packQty,
            internalCode: action.internalCode,
            section: action.section,
            features: action.features,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'done' } : m));
          notifyChange();
        } else {
          console.error('Error updating product:', data.error);
          setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'error' } : m));
        }
      } else if (action.type === 'delete') {
        const res = await fetch('/api/products/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: action.name }),
        });
        const data = await res.json();
        if (data.success) {
          setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'done' } : m));
          notifyChange();
        } else {
          console.error('Error deleting product:', data.error);
          setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'error' } : m));
        }
      } else {
        const res = await fetch('/api/products/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: action.name,
            price: action.price || 0,
            description: action.description || '',
            category: action.category || '',
            stock: action.stock || 0,
            tags: action.tags || '',
            sku: action.sku || '',
            barcode: action.barcode || '',
            imageUrl: action.imageUrl || '',
            imageUrl2: action.imageUrl2 || '',
            imageUrl3: action.imageUrl3 || '',
            wholesalePrice: action.wholesalePrice || 0,
            wholesaleMinQuantity: action.wholesaleMinQuantity || 0,
            packQty: action.packQty || 0,
            internalCode: action.internalCode || '',
            section: action.section || 0,
            features: action.features || '',
          }),
        });
        const data = await res.json();
        if (data.success) {
          setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'done' } : m));
          notifyChange();
        } else {
          console.error('Error creating product:', data.error);
          setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'error' } : m));
        }
      }
    } catch (error) {
      console.error('Error executing product action:', error);
      setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: 'error' } : m));
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPendingImage({ file, preview, name: file.name });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if ((!content && !pendingImage) || loading) return;
    setInput('');

    // Upload image if pending (server-side to avoid permission issues)
    let imageUrl: string | undefined;
    if (pendingImage) {
      try {
        const formData = new FormData();
        formData.append('file', pendingImage.file);
        const res = await fetch('/api/products/upload-image', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success && data.imageUrl) {
          imageUrl = data.imageUrl;
        } else {
          throw new Error(data.error || 'Upload failed');
        }
      } catch (e: any) {
        setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error al subir la imagen: ${e.message}` }]);
        URL.revokeObjectURL(pendingImage.preview);
        setPendingImage(null);
        setLoading(false);
        return;
      }
      URL.revokeObjectURL(pendingImage.preview);
      setPendingImage(null);
    }

    const imageTag = imageUrl ? `[Imagen adjunta: ${imageUrl}]` : '';
    const fullContent = [content, imageTag].filter(Boolean).join(' ');
    const userMsg: Message = { role: 'user', content: fullContent, typed: true };
    const history = [...messages, userMsg];
    setMessages(history);
    setLoading(true);
    try {
      const res = await fetch('/api/ai-sidekick', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) }),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('API error:', errorText);
        throw new Error(`API error: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (!data.text) {
        console.error('No text in response:', data);
        throw new Error('No text in response');
      }
      
      const raw = data.text;
      const { clean, action } = parseAction(raw);
      const newIdx = history.length;
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: clean, 
        displayedContent: '', 
        action, 
        actionStatus: action ? 'pending' : undefined, 
        typed: false 
      }]);
      setTimeout(() => typewriterEffect(newIdx, clean), 100);
      // Auto-execute action after typewriter starts
      if (action) {
        setTimeout(() => executeProductAction(newIdx, action), 300);
      }
    } catch (error) {
      console.error('Error in sendMessage:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Ocurrió un error al procesar la respuesta. Por favor intenta de nuevo.', 
        typed: true 
      }]);
    } finally { 
      setLoading(false); 
    }
  };

  const renderText = (text: string) => text
    .replace(/\[Imagen adjunta: (https?:\/\/[^\]]+)\]/g, '<img src="$1" alt="" style="max-width:100%;border-radius:10px;margin:4px 0;display:block" />')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');

  return (
    <>
      <style>{`
        @keyframes sk-slide { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
        @keyframes sk-slide-out { from { transform:translateX(0); opacity:1; } to { transform:translateX(100%); opacity:0; } }
        @keyframes sk-msg-user { from { opacity:0; transform:translateX(16px) scale(0.95); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes sk-msg-ai { from { opacity:0; transform:translateX(-16px) scale(0.95); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes sk-pulse { 0%,100%{opacity:.3;transform:scale(0.85);} 50%{opacity:1;transform:scale(1.1);} }
        @keyframes sk-glow-pulse { 0%,100%{box-shadow:0 0 8px rgba(139,92,246,0.2);} 50%{box-shadow:0 0 18px rgba(139,92,246,0.5);} }
        @keyframes sk-border-spin { from{transform:translate(-50%,-50%) rotate(0deg);} to{transform:translate(-50%,-50%) rotate(360deg);} }
        @keyframes sk-cursor { 0%,100%{opacity:1;} 50%{opacity:0;} }
        @keyframes sk-suggestion-in { from{opacity:0;clip-path:inset(0 0 100% 0);transform:translateY(-4px);} to{opacity:1;clip-path:inset(0 0 0% 0);transform:translateY(0);} }
        @keyframes sk-header-glow { 0%,100%{background-position:0% 50%;} 50%{background-position:100% 50%;} }
        @keyframes sk-card-in { from{opacity:0;transform:translateY(8px) scale(0.96);} to{opacity:1;transform:translateY(0) scale(1);} }
        @keyframes spin { to{transform:rotate(360deg);} }
        .sk-panel-enter { animation: sk-slide 0.35s cubic-bezier(0.16,1,0.3,1) both; }
        .sk-panel-exit { animation: sk-slide-out 0.35s cubic-bezier(0.36,0,0.66,-0.56) both; }
        .sk-msg-u { animation: sk-msg-user 0.35s cubic-bezier(0.16,1,0.3,1) both; }
        .sk-msg-a { animation: sk-msg-ai 0.35s cubic-bezier(0.16,1,0.3,1) both; }
        .sk-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#a78bfa; animation:sk-pulse 1.2s ease-in-out infinite; }
        .sk-dot:nth-child(2){animation-delay:.2s;} .sk-dot:nth-child(3){animation-delay:.4s;}
        .sk-send:hover:not(:disabled) { background:rgba(139,92,246,0.35)!important; transform:scale(1.08); }
        .sk-suggestion:hover { background:rgba(139,92,246,0.1)!important; border-color:rgba(139,92,246,0.4)!important; transform:translateX(3px); }
        .sk-bubble-ai { position:relative; }
        .sk-bubble-ai::before { content:''; position:absolute; inset:-1px; border-radius:inherit; background:linear-gradient(135deg,rgba(139,92,246,0.15),rgba(139,92,246,0.03)); z-index:-1; pointer-events:none; }
        .sk-typing-cursor::after { content:'|'; animation:sk-cursor 0.7s step-end infinite; color:#a78bfa; font-weight:300; margin-left:1px; }
      `}</style>

      <div className={`${closing ? 'sk-panel-exit' : 'sk-panel-enter'} sk-side-panel`} style={{
        width: 370, flexShrink: 0, display: visible ? 'flex' : 'none', flexDirection: 'column',
        background: '#131313', borderLeft: '1px solid rgba(255,255,255,0.06)',
        position: 'relative', overflow: 'hidden',
      }}>

        {/* Ambient glow */}
        <div style={{ position:'absolute', top:0, left:0, right:0, height:180,
          background:'radial-gradient(ellipse at 50% -20%, rgba(139,92,246,0.12) 0%, transparent 65%)',
          pointerEvents:'none', zIndex:0
        }}/>

        {/* Header with animated gradient border bottom */}
        <div style={{
          display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
          position:'relative', flexShrink:0, zIndex:1,
          borderBottom:'1px solid rgba(139,92,246,0.15)',
        }}>
          <div style={{
            width:92, height:92, borderRadius:23, flexShrink:0, position:'relative', overflow:'hidden',
            display:'flex', alignItems:'center', justifyContent:'center',
            animation:'sk-glow-pulse 2s ease-in-out infinite',
            boxShadow:'0 0 32px rgba(139,92,246,0.9)',
            alignSelf: 'flex-end',
            marginTop: 4,
          }}>
            <img
              src="https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/09/1789051062597-pegada-1789051061671.png"
              alt="Importadora Carlitos"
              style={{ width:88, height:88, borderRadius:21, objectFit:'cover', objectPosition: 'center 20%' }}
            />
          </div>
          <div>
            <p style={{ margin:0, color:'#fff', fontSize:18, fontWeight:700 }}>Importadora Carlitos IA</p>
            <p style={{ margin:0, color:'rgba(255,255,255,0.9)', fontSize:11, letterSpacing:'0.3px' }}>Asistente inteligente</p>
          </div>
          <button onClick={onClose} style={{
            marginLeft:'auto', width:26, height:26, borderRadius:6,
            border:'none', cursor:'pointer', background:'rgba(255,255,255,0.05)',
            color:'rgba(255,255,255,0.4)', display:'flex', alignItems:'center', justifyContent:'center',
            transition:'all .15s',
          }}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.1)';e.currentTarget.style.color='#fff';}}
          onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.05)';e.currentTarget.style.color='rgba(255,255,255,0.4)';}}>
            <X size={13}/>
          </button>
        </div>

        {/* Messages */}
        <div ref={messagesRef} style={{ flex:1, overflowY:'auto', padding:'14px', display:'flex', flexDirection:'column', gap:10, zIndex:1 }}>
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            const displayText = (!isUser && !msg.typed) ? (msg.displayedContent || '') : msg.content;
            return (
              <div key={i} className={isUser ? 'sk-msg-u' : 'sk-msg-a'} style={{
                display:'flex', flexDirection:'column',
                alignItems:isUser ? 'flex-end' : 'flex-start', gap:6,
              }}>
                {/* Avatar for AI */}
                {!isUser && (
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                    <img
                      src="https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/09/1789051041357-pegada-1789051039694.png"
                      alt="Importadora Carlitos"
                      style={{ width:30, height:30, borderRadius:7, objectFit:'cover', flexShrink:0 }}
                    />
                    <span style={{ fontSize:10, color:'rgba(167,139,250,0.6)', fontWeight:500 }}>Importadora Carlitos</span>
                  </div>
                )}
                <div className={isUser ? '' : 'sk-bubble-ai'} style={{
                  maxWidth:'90%', padding:'10px 13px',
                  borderRadius:isUser ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                  background:isUser ? 'linear-gradient(135deg,#7c3aed,#5b21b6)' : 'rgba(255,255,255,0.04)',
                  color:isUser ? '#fff' : 'rgba(255,255,255,0.88)',
                  fontSize:13, lineHeight:1.6,
                  border:isUser ? 'none' : '1px solid rgba(255,255,255,0.06)',
                  boxShadow:isUser ? '0 2px 12px rgba(124,58,237,0.25)' : 'none',
                }}>
                  <span className={(!isUser && !msg.typed) ? 'sk-typing-cursor' : ''}
                    dangerouslySetInnerHTML={{ __html: renderText(displayText) }}/>
                </div>

                {/* Product action card */}
                {msg.action && msg.typed && (
                  <div style={{
                    width:'90%', borderRadius:10, overflow:'hidden',
                    border:'1px solid rgba(139,92,246,0.25)', background:'rgba(139,92,246,0.06)',
                    animation:'sk-card-in 0.4s cubic-bezier(0.16,1,0.3,1) both',
                  }}>
                    <div style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:28, height:28, borderRadius:7, background:'rgba(139,92,246,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Package size={13} style={{ color:'#a78bfa' }}/>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ margin:0, color:'#e9d5ff', fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{msg.action.name}</p>
                        <p style={{ margin:0, color:'rgba(167,139,250,0.6)', fontSize:10 }}>
                          {msg.action.type === 'create_category' ? 'Nueva categoría' : msg.action.type === 'update' ? 'Modificar' : `${msg.action.price?.toLocaleString() ?? '—'} · ${msg.action.category || '—'}${msg.action.sku ? ` · SKU: ${msg.action.sku}` : ''}`}
                        </p>
                      </div>
                      {msg.actionStatus === 'pending' && (
                        <button onClick={() => executeProductAction(i, msg.action!)} style={{
                          padding:'5px 10px', borderRadius:6, border:'1px solid rgba(139,92,246,0.3)', cursor:'pointer',
                          background:'rgba(139,92,246,0.2)', color:'#c4b5fd', fontSize:11, fontWeight:600,
                          transition:'all .15s', flexShrink:0,
                        }}
                        onMouseEnter={e=>{e.currentTarget.style.background='rgba(139,92,246,0.4)';e.currentTarget.style.borderColor='rgba(139,92,246,0.6)';}}
                        onMouseLeave={e=>{e.currentTarget.style.background='rgba(139,92,246,0.2)';e.currentTarget.style.borderColor='rgba(139,92,246,0.3)';}}
                        >{msg.action.type === 'create_category' ? 'Crear cat.' : msg.action.type === 'update' ? 'Aplicar' : 'Crear'}</button>
                      )}
                      {msg.actionStatus === 'done' && <CheckCircle2 size={16} style={{ color:'#4ade80', flexShrink:0 }}/>}
                      {msg.actionStatus === 'error' && <AlertCircle size={16} style={{ color:'#f87171', flexShrink:0 }}/>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Loading */}
          {loading && (
            <div className="sk-msg-a" style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                <div style={{ width:18, height:18, borderRadius:5, background:'linear-gradient(135deg,#7c3aed,#a78bfa)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Sparkles size={9} style={{ color:'#fff' }}/>
                </div>
                <span style={{ fontSize:10, color:'rgba(167,139,250,0.6)', fontWeight:500 }}>Importadora Carlitos está pensando...</span>
              </div>
              <div style={{
                padding:'12px 16px', borderRadius:'4px 14px 14px 14px',
                background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)',
                display:'flex', gap:6, alignItems:'center',
              }}>
                <span className="sk-dot"/><span className="sk-dot"/><span className="sk-dot"/>
              </div>
            </div>
          )}
        </div>

        {/* Suggestions */}
        {messages.length === 1 && (
          <div style={{ padding:'0 14px 10px', display:'flex', flexDirection:'column', gap:5, zIndex:1, alignItems:'flex-start', maxWidth:'95%' }}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} className="sk-suggestion" onClick={() => sendMessage(s.text)} style={{
                textAlign:'left', padding:'8px 11px', borderRadius:8, width:'100%',
                background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)',
                color:'rgba(255,255,255,0.6)', fontSize:12, cursor:'pointer',
                transition:'all .2s', display:'flex', alignItems:'center', gap:8,
                animation:`sk-suggestion-in 0.4s cubic-bezier(0.16,1,0.3,1) ${0.1+i*0.08}s both`,
              }}>
                <span style={{ fontSize:14 }}>{s.icon}</span>{s.text}
              </button>
            ))}
          </div>
        )}

        {/* Input area with rotating border */}
        <div style={{ padding:'10px 14px', borderTop:'1px solid rgba(255,255,255,0.06)', flexShrink:0, zIndex:1 }}>
          {pendingImage && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 4px', marginBottom:8 }}>
              <img src={pendingImage.preview} alt="" style={{ width:40, height:40, objectFit:'cover', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)' }} />
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pendingImage.name}</span>
              <button onClick={() => setPendingImage(null)} style={{ background:'none', border:'none', cursor:'pointer', padding:2 }}>
                <X size={14} color="#ef4444" />
              </button>
            </div>
          )}
          <div style={{ display:'flex', gap:8, alignItems:'flex-end', position:'relative' }}>
            <input type="file" ref={fileInputRef} accept="image/*" onChange={handleImageUpload} style={{ display:'none' }} />
            <button onClick={() => fileInputRef.current?.click()} disabled={imageUploading}
              style={{
                width:36, height:36, borderRadius:10, border:'none', cursor:imageUploading?'wait':'pointer',
                background:'rgba(255,255,255,0.04)', color: imageUploading ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.3)',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'all .2s', flexShrink:0,
              }}>
              {imageUploading ? <Loader2 size={15} style={{ animation:'spin 1s linear infinite' }}/> : <ImagePlus size={15}/>}
            </button>
            <div style={{ flex:1, position:'relative', borderRadius:11, overflow:'hidden' }}>
              {/* Rotating conic gradient border */}
              <div style={{
                position:'absolute', top:'50%', left:'50%',
                width:500, height:500,
                background: inputFocused
                  ? 'conic-gradient(from 0deg, transparent 0%, transparent 55%, rgba(139,92,246,0.4) 70%, rgba(167,139,250,0.9) 77%, rgba(139,92,246,0.4) 84%, transparent 100%)'
                  : 'conic-gradient(from 0deg, transparent 0%, transparent 70%, rgba(255,255,255,0.08) 80%, rgba(255,255,255,0.15) 85%, rgba(255,255,255,0.08) 90%, transparent 100%)',
                animation:'sk-border-spin 3s linear infinite',
                pointerEvents:'none', zIndex:0,
              }}/>
              <textarea ref={inputRef} value={input}
                onChange={e=>setInput(e.target.value)}
                onFocus={()=>setInputFocused(true)} onBlur={()=>setInputFocused(false)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}}}
                placeholder={pendingImage ? 'Añade un mensaje (opcional)...' : placeholder}
                rows={1}
                style={{
                  position:'relative', zIndex:1, width:'100%', background:'#1a1a1a',
                  border:'none', borderRadius:10, padding:'9px 12px', color:'#fff', fontSize:13,
                  resize:'none', outline:'none', fontFamily:'inherit', lineHeight:1.5,
                  maxHeight:100, overflowY:'auto', margin:1,
                }}
              />
            </div>
            <button className="sk-send" onClick={()=>sendMessage()} disabled={(!input.trim() && !pendingImage)||loading}
              style={{
                width:36, height:36, borderRadius:10, border:'none', cursor:'pointer',
                background:(input.trim()||pendingImage)&&!loading ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                color:(input.trim()||pendingImage)&&!loading ? '#a78bfa' : 'rgba(255,255,255,0.2)',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'all .2s', flexShrink:0,
              }}>
              {loading ? <Loader2 size={15} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={15}/>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
