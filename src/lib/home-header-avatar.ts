import { getServices, getFirebaseConfig, MEDIA_BUCKET_ID, MEDIA_PREFIXES } from '@/lib/db';
import { getAvatarRingStyle, getLevelMeta } from '@/lib/loyalty-levels';

const STYLE_ID = 'yaxsel-header-avatar-styles';

function getFilePreviewUrl(fileId: string): string {
  const { endpoint, projectId } = getFirebaseConfig();
  const path = fileId;
  return `${endpoint}/storage/buckets/${MEDIA_BUCKET_ID}/files/${path}/view?project=${projectId}`;
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    header.musk-main-header .user-toggle,
    header.musk-main-header .account-icon {
      padding: 0 !important;
      width: auto !important;
      height: auto !important;
      overflow: visible !important;
      background: transparent !important;
      box-shadow: none !important;
      border: none !important;
    }
    header.musk-main-header .user-toggle::before,
    header.musk-main-header .user-toggle::after,
    header.musk-main-header .account-icon::before,
    header.musk-main-header .account-icon::after {
      display: none !important;
      content: none !important;
    }
    .yaxsel-header-avatar-wrap {
      position: relative;
      display: block;
      width: 44px;
      height: 44px;
      flex-shrink: 0;
    }
    .yaxsel-header-avatar-wrap--mobile {
      width: 36px;
      height: 36px;
    }
    @keyframes yaxsel-avatar-ring-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes yaxsel-avatar-ring-pulse {
      0%, 100% { opacity: 0.85; filter: blur(0); }
      50% { opacity: 1; filter: blur(0.5px); }
    }
    .yaxsel-header-avatar-ring {
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
      background: conic-gradient(
        from 0deg,
        var(--yaxsel-ring-color, #f5a8cf),
        var(--yaxsel-ring-glow, rgba(249,168,212,0.6)),
        #fff,
        var(--yaxsel-ring-color, #f5a8cf)
      );
      animation: yaxsel-avatar-ring-spin 3.2s linear infinite, yaxsel-avatar-ring-pulse 2.4s ease-in-out infinite;
      -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px));
      mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px));
    }
    .yaxsel-header-avatar-ring::after {
      content: '';
      position: absolute;
      inset: 2px;
      border-radius: 50%;
      box-shadow: 0 0 12px var(--yaxsel-ring-glow, rgba(227,150,191,0.45));
      pointer-events: none;
    }
    .yaxsel-header-avatar-img,
    .yaxsel-header-avatar-initial {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      display: block;
      object-fit: cover;
      position: relative;
      z-index: 1;
      margin: 0 !important;
      border: 2px solid #fff;
      box-shadow: 0 2px 10px rgba(236, 72, 153, 0.2);
    }
    .yaxsel-header-avatar-initial {
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #e396bf, #f5a8cf);
      color: #fff;
      font-size: 16px;
      font-weight: 800;
      font-family: 'DM Sans', system-ui, sans-serif;
    }
    .yaxsel-header-avatar-wrap--mobile .yaxsel-header-avatar-initial {
      font-size: 14px;
    }
    .yaxsel-level-badge {
      position: absolute;
      bottom: -3px;
      right: -4px;
      width: 18px;
      height: 18px;
      object-fit: contain;
      z-index: 2;
      pointer-events: none;
      filter: drop-shadow(0 1px 3px rgba(0,0,0,0.2));
    }
    .yaxsel-header-avatar-wrap--mobile .yaxsel-level-badge {
      width: 15px;
      height: 15px;
      bottom: -2px;
      right: -3px;
    }
  `;
  document.head.appendChild(style);
}

function buildAvatarWrap(
  avatarUrl: string | null,
  initial: string,
  levelId: string,
  mobile: boolean,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `yaxsel-header-avatar-wrap${mobile ? ' yaxsel-header-avatar-wrap--mobile' : ''}`;
  wrap.dataset.yaxselAvatar = '1';

  const ring = document.createElement('span');
  ring.className = 'yaxsel-header-avatar-ring';
  ring.setAttribute('aria-hidden', 'true');
  Object.assign(ring.style, getAvatarRingStyle(levelId) as Record<string, string>);
  wrap.appendChild(ring);

  if (avatarUrl) {
    const img = document.createElement('img');
    img.className = 'yaxsel-header-avatar-img';
    img.src = avatarUrl;
    img.alt = '';
    wrap.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.className = 'yaxsel-header-avatar-initial';
    span.textContent = initial;
    wrap.appendChild(span);
  }

  const level = getLevelMeta(levelId);
  if (level.badge) {
    const badge = document.createElement('img');
    badge.className = 'yaxsel-level-badge';
    badge.src = level.badge;
    badge.alt = level.name;
    badge.title = `Nivel ${level.name}`;
    wrap.appendChild(badge);
  }

  return wrap;
}

/** Sincroniza avatar + medalla en el header Shopify de la home (PC y móvil). */
export async function syncHomeHeaderUserAvatar(
  user: { name?: string | null } | null,
  isLoggedIn: boolean,
): Promise<boolean> {
  const toggles = Array.from(
    document.querySelectorAll('header.musk-main-header .user-toggle, header.musk-main-header .account-icon, .user-info a')
  ) as HTMLElement[];

  if (!toggles.length) return false;
  injectStyles();

  if (!isLoggedIn || !user) {
    toggles.forEach((el) => {
      const existing = el.querySelector('[data-yaxsel-avatar]');
      if (existing) el.innerHTML = '';
    });
    return true;
  }

  let avatarUrl: string | null = null;
  let levelId = 'bronze';
  try {
    const { account } = getServices();
    const acc = await account.get();
    const prefs = (acc as { prefs?: Record<string, unknown> }).prefs || {};
    if (prefs.avatarFileId) avatarUrl = getFilePreviewUrl(String(prefs.avatarFileId));
    if (prefs.loyaltyLevel) levelId = String(prefs.loyaltyLevel);
  } catch {
    /* prefs opcionales */
  }

  const initial = user.name?.charAt(0).toUpperCase() || 'U';

  toggles.forEach((el) => {
    const mobile = el.closest('.user-info') !== null || window.innerWidth <= 768;
    const wrap = buildAvatarWrap(avatarUrl, initial, levelId, mobile);
    el.innerHTML = '';
    el.appendChild(wrap);
    el.style.padding = '0';
    el.style.width = 'auto';
    el.style.height = 'auto';
  });

  return true;
}

/** Reintenta hasta que el header exista en el DOM (navegación client-side). */
export function scheduleHomeHeaderAvatarSync(
  user: { name?: string | null } | null,
  isLoggedIn: boolean,
  maxMs = 8000,
): () => void {
  let cancelled = false;
  const start = Date.now();

  const tick = async () => {
    if (cancelled) return;
    const ok = await syncHomeHeaderUserAvatar(user, isLoggedIn);
    if (ok || Date.now() - start > maxMs) return;
    setTimeout(tick, 200);
  };

  tick();
  return () => { cancelled = true; };
}
