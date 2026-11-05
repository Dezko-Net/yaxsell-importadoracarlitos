'use client';

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell, Info, AlertTriangle, CheckCircle, Tag, ShoppingBag, Loader2, X, Gift, Package, Trash2, ShoppingCart, Plus
} from 'lucide-react';
import { getServices, getFirebaseConfig, formatPrice } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/context/NotificationContext';
import { useCart } from '@/context/CartContext';
import {
  markNotificationRead,
  isNotificationUnread,
  getNotificationLink,
} from '@/services/notificationClient';
import { Query } from '@/lib/db';

const PINK = '#e396bf';
const NOTIF_COLLECTION = 'notifications';

const TYPE_STYLE: Record<string, { icon: typeof Info; bg: string; color: string }> = {
  info:    { icon: Info,          bg: '#e3f2fd', color: '#1565c0' },
  success: { icon: CheckCircle,   bg: '#e8f5e9', color: '#2e7d32' },
  warning: { icon: AlertTriangle, bg: '#fff8e1', color: '#f57f17' },
  error:   { icon: AlertTriangle, bg: '#ffebee', color: '#c62828' },
  promo:   { icon: Tag,           bg: '#f3e5f5', color: '#7b1fa2' },
  order:   { icon: ShoppingBag,   bg: '#e8f5e9', color: '#1b5e20' },
  gift:    { icon: Gift,          bg: '#fdf2f8', color: '#e396bf' },
  product: { icon: Package,       bg: '#e3f2fd', color: '#1565c0' },
  stock:   { icon: Package,       bg: '#e8f5e9', color: '#2e7d32' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Justo ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

interface Props {
  onClose: () => void;
}

export default function NotificationsOverlay({ onClose }: Props) {
  const { user, isLoggedIn } = useAuth();
  const { refreshCount } = useNotifications();
  const { addItem, items } = useCart();
  const router = useRouter();
  const [notifs, setNotifs] = useState<Record<string, unknown>[]>([]);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isLoggedIn || !user) {
      setNotifs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const res = await databases.listDocuments(databaseId, NOTIF_COLLECTION, [
        Query.in('userId', [user.id, 'all']),
        Query.orderDesc('$createdAt'),
        Query.limit(50),
      ]);
      
      // Filter out dismissed ones locally
      let dismissedList: string[] = [];
      try {
        const stored = localStorage.getItem('dismissed_notifications');
        if (stored) dismissedList = JSON.parse(stored);
      } catch {}
      
      const filtered = (res.documents as unknown as Record<string, unknown>[]).filter(
        d => !dismissedList.includes(d.$id as string)
      );
      
      setNotifs(filtered);
    } catch {
      setNotifs([]);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, user]);

  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [swipingId, setSwipingId] = useState<string | null>(null);
  const [swipeStartX, setSwipeStartX] = useState<number>(0);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);

  const handleDismiss = async (id: string, userId: string) => {
    // 1. Trigger slide-out / height shrink animation
    setDismissedIds((prev) => [...prev, id]);

    // 2. Wait 300ms for CSS transition
    setTimeout(async () => {
      // 3. Remove from the local rendering state list
      setNotifs((prev) => prev.filter((n) => n.$id !== id));

      // 4. Save to localStorage dismissed list (for broadcast fallback / 'all')
      try {
        const stored = localStorage.getItem('dismissed_notifications');
        const list = stored ? JSON.parse(stored) : [];
        if (!list.includes(id)) {
          list.push(id);
          localStorage.setItem('dismissed_notifications', JSON.stringify(list));
        }
      } catch {}

      // 5. If it's a personal notification (userId !== 'all'), we can delete from DB
      if (userId !== 'all') {
        try {
          const { databases } = getServices();
          const { databaseId } = getFirebaseConfig();
          await databases.deleteDocument(databaseId, NOTIF_COLLECTION, id);
        } catch (err) {
          console.error('Failed to delete personal notification:', err);
        }
      }

      // 6. Refresh the notification badge count (force to bypass cache)
      refreshCount(true);
    }, 300);
  };

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    setSwipingId(id);
    setSwipeStartX(e.touches[0].clientX);
    setSwipeOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent, id: string) => {
    if (swipingId !== id) return;
    const currentX = e.touches[0].clientX;
    const diffX = swipeStartX - currentX;
    // Only allow left swiping (diffX > 0)
    if (diffX > 0) {
      setSwipeOffset(diffX);
    } else {
      setSwipeOffset(0);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent, id: string, userId: string) => {
    if (swipingId !== id) return;
    if (swipeOffset > 100) {
      handleDismiss(id, userId);
    }
    setSwipingId(null);
    setSwipeOffset(0);
  };

  useEffect(() => {
    load();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [load, onClose]);

  const handleOpen = async (n: Record<string, unknown>, overrideLink?: string) => {
    const id = n.$id as string;
    const link = overrideLink || getNotificationLink(n);
    if (id && isNotificationUnread(n)) {
      try {
        await markNotificationRead(id);
        setNotifs((prev) =>
          prev.map((doc) => (doc.$id === id ? { ...doc, isRead: true } : doc))
        );
        refreshCount(true);
      } catch { /* ignore */ }
    }
    if (link) {
      onClose();
      router.push(link);
    } else {
      onClose();
    }
  };

  const handleAddToCart = async (n: Record<string, unknown>, parsedPid: string | null, parsedQty: number | null) => {
    if (!parsedPid) return;
    const notifId = n.$id as string;
    setAddingToCart(notifId);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const prod = await databases.getDocument(databaseId, 'products', parsedPid);
      const qty = parsedQty || 1;
      addItem(prod as any, qty);
    } catch {
      // Product not found in products collection
      console.warn('Could not add product to cart, PID not found:', parsedPid);
    } finally {
      setAddingToCart(null);
    }
  };

  const panelStyle: CSSProperties = {
    background: '#fff',
    maxWidth: 560,
    margin: '0 auto',
    maxHeight: '85vh',
    overflow: 'hidden',
    borderRadius: 16,
    marginTop: 12,
    boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
  };

  if (!isLoggedIn) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
        <div style={{ ...panelStyle, padding: 32, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
          <Bell size={40} color={PINK} style={{ marginBottom: 12 }} />
          <p style={{ margin: '0 0 16px', color: '#6b7280' }}>Iniciá sesión para ver tus notificaciones</p>
          <button type="button" onClick={() => { onClose(); router.push('/login'); }} style={{ padding: '10px 24px', background: `linear-gradient(135deg,${PINK},#c0547a)`, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, cursor: 'pointer' }}>
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  const unread = notifs.filter(isNotificationUnread).length;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid #fce7f3', background: 'linear-gradient(135deg, #fdf2f8, #fdf2f8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bell size={22} color={PINK} fill={PINK} />
            <span style={{ fontSize: 17, fontWeight: 800, color: '#1a1a1a' }}>Notificaciones</span>
            {unread > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: PINK, borderRadius: 999, padding: '2px 8px' }}>{unread}</span>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid #fce7f3', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={18} color="#6b7280" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Loader2 size={32} color={PINK} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : notifs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px' }}>
              <Bell size={48} color={PINK} style={{ opacity: 0.5, marginBottom: 12 }} />
              <p style={{ margin: 0, fontWeight: 700, color: '#374151' }}>Sin notificaciones</p>
              <p style={{ margin: '8px 0 0', fontSize: 14, color: '#9ca3af' }}>Tus avisos y promociones aparecerán aquí</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {notifs.map((n) => {
                const id = n.$id as string;
                const type = (n.type || n.TYPE || 'info') as string;
                const ts = TYPE_STYLE[type] || TYPE_STYLE.info;
                const Icon = ts.icon;
                const title = (n.title || n.TITLE || 'Notificación') as string;
                const body = (n.body || n.message || n.MESSAGE || n.BODY || '') as string;
                const read = !isNotificationUnread(n);
                const isDismissed = dismissedIds.includes(id);

                // Parse image from data JSON field
                let notifImage: string | null = null;
                try {
                  const dataVal = n.data || n.DATA;
                  if (typeof dataVal === 'string' && dataVal) {
                    const parsed = JSON.parse(dataVal);
                    if (parsed.image) notifImage = parsed.image;
                  } else if (typeof dataVal === 'object' && dataVal) {
                    // Appwrite might return already parsed object
                    notifImage = (dataVal as any).image || null;
                  }
                } catch {}

                // Parse rich metadata from body string e.g. [IMG:url][PRICE:1500][STOCK:100][QTY:2][PID:abc123]
                let finalBody = body;
                let parsedPrice: number | null = null;
                let parsedStock: number | null = null;
                let parsedQty: number | null = null;
                let parsedPid: string | null = null;

                if (finalBody) {
                  const imgMatch = finalBody.match(/\[IMG:(.*?)\]/);
                  if (imgMatch) {
                    notifImage = imgMatch[1];
                    finalBody = finalBody.replace(/\[IMG:(.*?)\]/g, '');
                  }
                  const priceMatch = finalBody.match(/\[PRICE:(.*?)\]/);
                  if (priceMatch) {
                    parsedPrice = parseFloat(priceMatch[1]);
                    finalBody = finalBody.replace(/\[PRICE:(.*?)\]/g, '');
                  }
                  const stockMatch = finalBody.match(/\[STOCK:(.*?)\]/);
                  if (stockMatch) {
                    parsedStock = parseInt(stockMatch[1], 10);
                    finalBody = finalBody.replace(/\[STOCK:(.*?)\]/g, '');
                  }
                  const qtyMatch = finalBody.match(/\[QTY:(.*?)\]/);
                  if (qtyMatch) {
                    parsedQty = parseInt(qtyMatch[1], 10);
                    finalBody = finalBody.replace(/\[QTY:(.*?)\]/g, '');
                  }
                  const pidMatch = finalBody.match(/\[PID:(.*?)\]/);
                  if (pidMatch) {
                    parsedPid = pidMatch[1];
                    finalBody = finalBody.replace(/\[PID:(.*?)\]/g, '');
                  }
                  // Fallback: try to get productId from notification data
                  if (!parsedPid) {
                    try {
                      const dataVal = n.data || n.DATA;
                      if (typeof dataVal === 'string' && dataVal) {
                        const parsed = JSON.parse(dataVal);
                        if (parsed.productId) parsedPid = parsed.productId;
                      } else if (typeof dataVal === 'object' && dataVal) {
                        parsedPid = (dataVal as any).productId || null;
                      }
                    } catch {}
                    // Also check direct productId attribute
                    if (!parsedPid && n.productId) parsedPid = n.productId as string;
                  }
                }

                return (
                  <div
                    key={id}
                    style={{
                      position: 'relative',
                      width: '100%',
                      overflow: 'hidden',
                      maxHeight: isDismissed ? 0 : 500,
                      opacity: isDismissed ? 0 : 1,
                      margin: isDismissed ? 0 : '0px 0px',
                      padding: isDismissed ? 0 : '0px 0px',
                      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                      borderRadius: 14,
                    }}
                  >
                    {/* Red swipe-to-delete background */}
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: '#ef4444',
                      borderRadius: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      paddingRight: 20,
                      color: '#fff',
                      zIndex: 1,
                    }}>
                      <Trash2
                        size={22}
                        style={{
                          transform: swipingId === id && swipeOffset > 100 ? 'scale(1.15)' : 'scale(1)',
                          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        }}
                      />
                    </div>

                    {/* Actual notification card */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpen(n, parsedPid ? `/productos/${parsedPid}` : undefined)}
                      onTouchStart={(e) => handleTouchStart(e, id)}
                      onTouchMove={(e) => handleTouchMove(e, id)}
                      onTouchEnd={(e) => handleTouchEnd(e, id, (n.userId || n.USERID || '') as string)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleOpen(n, parsedPid ? `/productos/${parsedPid}` : undefined); }}
                      style={{
                        display: 'flex', gap: 12, padding: 14, borderRadius: 14, border: '1px solid #f0f0f0',
                        background: read ? '#fff' : 'linear-gradient(135deg,#fdf2f8,#fff)',
                        borderLeft: read ? '1px solid #f0f0f0' : `3px solid ${PINK}`,
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                        position: 'relative',
                        zIndex: 2,
                        transform: swipingId === id ? `translateX(-${swipeOffset}px)` : 'translateX(0)',
                        transition: swipingId === id ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    >
                      {/* Left Icon or Product Image */}
                      {notifImage ? (
                        <img
                          src={notifImage}
                          alt={title}
                          style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: ts.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={20} color={ts.color} />
                        </div>
                      )}

                      {/* Right Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#1a1a1a' }}>{title}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span style={{ fontSize: 12, color: '#9ca3af' }}>{timeAgo((n.$createdAt as string) || '')}</span>
                            {/* Fast Dismiss X Button for PC */}
                            <button
                              type="button"
                              title="Eliminar notificación"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDismiss(id, (n.userId || n.USERID || '') as string);
                              }}
                              style={{
                                border: 'none',
                                background: 'none',
                                padding: 2,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 4,
                                transition: 'background 0.2s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                            >
                              <X size={14} color="#9ca3af" />
                            </button>
                          </div>
                        </div>
                        {finalBody && <p style={{ margin: 0, fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>{finalBody}</p>}
                        
                        {/* Rich Metadata Badges (Price, Stock) + Add to Cart Button */}
                        {(parsedPrice !== null || parsedStock !== null || parsedPid) && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                            {parsedPrice !== null && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '2px 7px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 3 }}>
                                💵 Precio: {formatPrice(parsedPrice)}
                              </span>
                            )}
                            {parsedStock !== null && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 7px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 3 }}>
                                📦 Stock: {parsedStock} uds
                              </span>
                            )}
                            {parsedPid && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddToCart(n, parsedPid, parsedQty);
                                }}
                                disabled={addingToCart === (n.$id as string)}
                                style={{
                                  fontSize: 11, fontWeight: 700, color: '#fff',
                                  background: addingToCart === (n.$id as string) ? '#9ca3af' : 'linear-gradient(135deg, #e396bf, #d946a8)',
                                  border: 'none', padding: '4px 10px', borderRadius: 10,
                                  cursor: addingToCart === (n.$id as string) ? 'wait' : 'pointer',
                                  display: 'flex', alignItems: 'center', gap: 3,
                                  transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => { if (addingToCart !== (n.$id as string)) e.currentTarget.style.transform = 'scale(1.05)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                              >
                                {addingToCart === (n.$id as string) ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={12} />}
                                Agregar al carrito
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          )}
        </div>
      </div>
    </div>
    </>
  );
}
