'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronDown, Maximize2, Minimize2, Lock, Wallet, Send, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import PosBrand from './PosBrand';
import styles from './pos-toolbar.module.css';

export type PosToolbarAction = { label: string; icon: LucideIcon; onClick: () => void; count?: number; disabled?: boolean; danger?: boolean };

export type PosAccessLevelBadge = 'alto' | 'medio' | 'bajo' | 'supremo';

export default function PosToolbar({
  branch,
  operator,
  photo,
  clock,
  roleLabel,
  accessLevel,
  accessLevelLabel,
  hasSession,
  seller,
  sessionDetail,
  loadingSession,
  onSession,
  onAdmin,
  fullscreen,
  onFullscreen,
  actions,
  children
}: {
  branch: string;
  operator?: string;
  photo?: string;
  clock: string;
  roleLabel?: string;
  accessLevel?: PosAccessLevelBadge;
  accessLevelLabel?: string;
  hasSession: boolean;
  seller?: boolean;
  sessionDetail?: string;
  loadingSession: boolean;
  onSession: () => void;
  onAdmin?: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  actions: PosToolbarAction[];
  children?: ReactNode;
}) {
  const toolsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: Event) => {
      if (toolsRef.current?.open && event.target instanceof Node && !toolsRef.current.contains(event.target)) toolsRef.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', dismiss); };
  }, []);
  return <header data-pos="toolbar" className={styles.toolbar}>
    <div className={styles.identity}>
      <div data-pos="toolbar-logo" className={styles.logo}><PosBrand compact /></div>
      {onAdmin && <button type="button" data-pos="toolbar-admin" onClick={onAdmin} className={styles.admin} title="Volver a POS Admin"><ChevronLeft size={16} /><span>Administración</span></button>}
      <div data-pos="toolbar-branch" className={styles.branch}><strong>{branch}</strong><span>Punto de venta</span></div>
    </div>
    <div className={styles.actions}>
      {children}
      {seller ? <div data-pos="session-pill" className={styles.session} data-open="true"><Send size={17} /><span><strong>Venta asistida</strong><small>Envío a cajera</small></span></div> : <button type="button" data-pos="session-pill" className={styles.session} data-open={hasSession} onClick={onSession} disabled={loadingSession}>
        {hasSession ? <Wallet size={17} /> : <Lock size={17} />}
        <span><strong>{loadingSession ? 'Consultando caja…' : hasSession ? 'Caja abierta' : 'Caja cerrada'}</strong><small>{sessionDetail || 'Revisar apertura'}</small></span>
      </button>}
      <div
        data-pos="toolbar-operator"
        className={styles.operator}
        title={`${operator || 'Operador'} · ${roleLabel || 'Operador'} (${accessLevelLabel || 'POS'})`}
      >
        <div className={styles.avatarWrap}>
          {photo ? (
            <img src={photo} alt={operator || 'Operador'} className={styles.avatarImg} />
          ) : (
            <span className={styles.avatarInitial}>{(operator || 'C').charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className={styles.operatorBody}>
          <div className={styles.operatorMainRow}>
            <strong data-pos="operator-name" className={styles.operatorName}>{operator || 'Operador'}</strong>
            {clock && <small data-pos="operator-clock" className={styles.operatorClock}>{clock}</small>}
          </div>
          <div className={styles.operatorBadgeRow}>
            {roleLabel && <span data-pos="operator-role" className={styles.roleTag}>{roleLabel}</span>}
            {accessLevelLabel && (
              <span
                className={`${styles.levelBadge} ${styles['level_' + (accessLevel || 'bajo')]}`}
                data-level={accessLevel || 'bajo'}
              >
                {accessLevelLabel}
              </span>
            )}
          </div>
        </div>
      </div>
      <details ref={toolsRef} data-pos="toolbar-tools" className={styles.tools} onKeyDown={event => { if (event.key === 'Escape' && toolsRef.current) { toolsRef.current.open = false; toolsRef.current.querySelector('summary')?.focus(); event.stopPropagation(); } }}>
        <summary aria-label="Herramientas del punto de venta"><SlidersHorizontal size={16} /><span>Herramientas</span><ChevronDown size={14} /></summary>
        <div data-pos="toolbar-menu" className={styles.menu}>
          {actions.map(action => <button key={action.label} type="button" disabled={action.disabled} data-danger={action.danger} onClick={() => { if (toolsRef.current) toolsRef.current.open = false; action.onClick(); }}>
            <action.icon size={17} /><span>{action.label}</span>{!!action.count && <b>{action.count}</b>}
          </button>)}
          <button type="button" onClick={() => { if (toolsRef.current) toolsRef.current.open = false; onFullscreen(); }}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}<span>{fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}</span></button>
        </div>
      </details>
    </div>
  </header>;
}
