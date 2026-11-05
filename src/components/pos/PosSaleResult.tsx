'use client';

import { useEffect, useRef } from 'react';
import { Check, Printer, X } from 'lucide-react';
import PosSakuraChargeParticles from './PosSakuraChargeParticles';
import PosNekoChargeParticles from './PosNekoChargeParticles';
import PosCapyChargeParticles from './PosCapyChargeParticles';
import PosJasmineChargeParticles from './PosJasmineChargeParticles';
import {
  PosSakuraAmbientField,
  PosSakuraCheckMedallion,
  PosSakuraModalHeaderArt,
} from './PosSakuraDecor';
import {
  PosNekoAmbientField,
  PosNekoCheckMedallion,
  PosNekoModalHeaderArt,
  type PosNekoVariant,
} from './PosNekoDecor';
import {
  PosCapyAmbientField,
  PosCapyCheckMedallion,
  PosCapyModalHeaderArt,
} from './PosCapyDecor';
import {
  PosJasmineAmbientField,
  PosJasmineCheckMedallion,
  PosJasmineModalHeaderArt,
} from './PosJasmineDecor';
import styles from './pos-sale-result.module.css';

export default function PosSaleResult({
  receipt,
  operator,
  total,
  method,
  change,
  popupBlocked,
  sakuraMode = false,
  nekoMode = false,
  nekoVariant = 'mikan',
  capyMode = false,
  jasmineMode = false,
  onPrint,
  onClose,
}: {
  receipt: string;
  operator: string;
  total: string;
  method: string;
  change?: string;
  popupBlocked: boolean;
  sakuraMode?: boolean;
  nekoMode?: boolean;
  nekoVariant?: PosNekoVariant;
  capyMode?: boolean;
  jasmineMode?: boolean;
  onPrint: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (sakuraMode || nekoMode || capyMode || jasmineMode) {
      nextBtnRef.current?.focus();
      return;
    }
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [sakuraMode, nekoMode, capyMode, jasmineMode]);

  if (jasmineMode) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-sale-result-title"
        className={styles.jasmineOverlay}
        onClick={event => {
          if (event.target === event.currentTarget) onClose();
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === 'Enter') {
            event.stopPropagation();
          }
        }}
      >
        <div className={styles.jasmineCard}>
          <div className={styles.header}>
            <PosJasmineModalHeaderArt />
            <PosJasmineCheckMedallion />
            <div className={styles.sakuraHeaderText}>
              <span className={styles.jasmineBadgeTag}>&#x1F48E; &middot; Venta Real</span>
              <h2 id="pos-sale-result-title">Venta cobrada</h2>
              <p>{receipt}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar resultado de la venta">
              <X size={20} />
            </button>
          </div>
          <div className={styles.body}>
            <PosJasmineAmbientField variant="modal" />
            <div className={styles.sakuraBodyContent}>
              <div className={styles.amount}>
                <span>Total cobrado</span>
                <strong>{total}</strong>
              </div>
              <dl className={styles.info}>
                <div>
                  <dt>Medio de pago</dt>
                  <dd>{method}</dd>
                </div>
                <div>
                  <dt>Atendido por</dt>
                  <dd>{operator}</dd>
                </div>
              </dl>
              {change && (
                <div className={styles.change}>
                  <span>Vuelto a entregar</span>
                  <strong>{change}</strong>
                </div>
              )}
              {popupBlocked && (
                <div className={styles.notice} role="status">
                  <Printer size={19} />
                  <p>
                    <strong>Falta abrir el comprobante</strong>El navegador bloque&oacute; la ventana. Usa el bot&oacute;n de impresi&oacute;n o permite ventanas emergentes para este sitio.
                  </p>
                </div>
              )}
              <div className={styles.actions}>
                <button
                  ref={nextBtnRef}
                  type="button"
                  onClick={onClose}
                  autoFocus
                  className={styles.next}
                >
                  <PosJasmineChargeParticles />
                  <span className={styles.sakuraNextLabel}>
                    Siguiente venta <span>Enter</span>
                  </span>
                </button>
                <button type="button" onClick={onPrint}>
                  <Printer size={18} /> Imprimir comprobante interno
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (capyMode) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-sale-result-title"
        className={styles.capyOverlay}
        onClick={event => {
          if (event.target === event.currentTarget) onClose();
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === 'Enter') {
            event.stopPropagation();
          }
        }}
      >
        <div className={styles.capyCard}>
          <div className={styles.header}>
            <PosCapyModalHeaderArt />
            <PosCapyCheckMedallion />
            <div className={styles.sakuraHeaderText}>
              <span className={styles.capyBadgeTag}>茶 · Capy venta</span>
              <h2 id="pos-sale-result-title">Venta cobrada</h2>
              <p>{receipt}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar resultado de la venta">
              <X size={20} />
            </button>
          </div>
          <div className={styles.body}>
            <PosCapyAmbientField variant="modal" />
            <div className={styles.sakuraBodyContent}>
              <div className={styles.amount}>
                <span>Total cobrado</span>
                <strong>{total}</strong>
              </div>
              <dl className={styles.info}>
                <div>
                  <dt>Medio de pago</dt>
                  <dd>{method}</dd>
                </div>
                <div>
                  <dt>Atendido por</dt>
                  <dd>{operator}</dd>
                </div>
              </dl>
              {change && (
                <div className={styles.change}>
                  <span>Vuelto a entregar</span>
                  <strong>{change}</strong>
                </div>
              )}
              {popupBlocked && (
                <div className={styles.notice} role="status">
                  <Printer size={19} />
                  <p>
                    <strong>Falta abrir el comprobante</strong>El navegador bloque&oacute; la ventana. Usa el bot&oacute;n de impresi&oacute;n o permite ventanas emergentes para este sitio.
                  </p>
                </div>
              )}
              <div className={styles.actions}>
                <button
                  ref={nextBtnRef}
                  type="button"
                  onClick={onClose}
                  autoFocus
                  className={styles.next}
                >
                  <PosCapyChargeParticles />
                  <span className={styles.sakuraNextLabel}>
                    Siguiente venta <span>Enter</span>
                  </span>
                </button>
                <button type="button" onClick={onPrint}>
                  <Printer size={18} /> Imprimir comprobante interno
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (nekoMode) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-sale-result-title"
        className={styles.nekoOverlay}
        onClick={event => {
          if (event.target === event.currentTarget) onClose();
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === 'Enter') {
            event.stopPropagation();
          }
        }}
      >
        <div className={styles.nekoCard}>
          <div className={styles.header}>
            <PosNekoModalHeaderArt nekoVariant={nekoVariant} />
            <PosNekoCheckMedallion nekoVariant={nekoVariant} />
            <div className={styles.sakuraHeaderText}>
              <span className={styles.nekoBadgeTag}>
                {nekoVariant === 'fernanda' ? '🌙 · Michi de Fernanda' : '猫 · Michi venta'}
              </span>
              <h2 id="pos-sale-result-title">Venta cobrada</h2>
              <p>{receipt}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar resultado de la venta">
              <X size={20} />
            </button>
          </div>
          <div className={styles.body}>
            <PosNekoAmbientField variant="modal" nekoVariant={nekoVariant} />
            <div className={styles.sakuraBodyContent}>
              <div className={styles.amount}>
                <span>Total cobrado</span>
                <strong>{total}</strong>
              </div>
              <dl className={styles.info}>
                <div>
                  <dt>Medio de pago</dt>
                  <dd>{method}</dd>
                </div>
                <div>
                  <dt>Atendido por</dt>
                  <dd>{operator}</dd>
                </div>
              </dl>
              {change && (
                <div className={styles.change}>
                  <span>Vuelto a entregar</span>
                  <strong>{change}</strong>
                </div>
              )}
              {popupBlocked && (
                <div className={styles.notice} role="status">
                  <Printer size={19} />
                  <p>
                    <strong>Falta abrir el comprobante</strong>El navegador bloque&oacute; la ventana. Usa el bot&oacute;n de impresi&oacute;n o permite ventanas emergentes para este sitio.
                  </p>
                </div>
              )}
              <div className={styles.actions}>
                <button
                  ref={nextBtnRef}
                  type="button"
                  onClick={onClose}
                  autoFocus
                  className={styles.next}
                >
                  <PosNekoChargeParticles nekoVariant={nekoVariant} />
                  <span className={styles.sakuraNextLabel}>
                    Siguiente venta <span>Enter</span>
                  </span>
                </button>
                <button type="button" onClick={onPrint}>
                  <Printer size={18} /> Imprimir comprobante interno
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sakuraMode) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-sale-result-title"
        className={styles.sakuraOverlay}
        onClick={event => {
          if (event.target === event.currentTarget) onClose();
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === 'Enter') {
            event.stopPropagation();
          }
        }}
      >
        <div className={styles.sakuraCard}>
          <div className={styles.header}>
            <PosSakuraModalHeaderArt />
            <PosSakuraCheckMedallion />
            <div className={styles.sakuraHeaderText}>
              <span className={styles.sakuraBadgeTag}>桜 · Dulce venta</span>
              <h2 id="pos-sale-result-title">Venta cobrada</h2>
              <p>{receipt}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar resultado de la venta">
              <X size={20} />
            </button>
          </div>
          <div className={styles.body}>
            <PosSakuraAmbientField variant="modal" />
            <div className={styles.sakuraBodyContent}>
              <div className={styles.amount}>
                <span>Total cobrado</span>
                <strong>{total}</strong>
              </div>
              <dl className={styles.info}>
                <div>
                  <dt>Medio de pago</dt>
                  <dd>{method}</dd>
                </div>
                <div>
                  <dt>Atendido por</dt>
                  <dd>{operator}</dd>
                </div>
              </dl>
              {change && (
                <div className={styles.change}>
                  <span>Vuelto a entregar</span>
                  <strong>{change}</strong>
                </div>
              )}
              {popupBlocked && (
                <div className={styles.notice} role="status">
                  <Printer size={19} />
                  <p>
                    <strong>Falta abrir el comprobante</strong>El navegador bloque&oacute; la ventana. Usa el bot&oacute;n de impresi&oacute;n o permite ventanas emergentes para este sitio.
                  </p>
                </div>
              )}
              <div className={styles.actions}>
                <button
                  ref={nextBtnRef}
                  type="button"
                  onClick={onClose}
                  autoFocus
                  className={styles.next}
                >
                  <PosSakuraChargeParticles />
                  <span className={styles.sakuraNextLabel}>
                    Siguiente venta <span>Enter</span>
                  </span>
                </button>
                <button type="button" onClick={onPrint}>
                  <Printer size={18} /> Imprimir comprobante interno
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="pos-sale-result-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') event.stopPropagation(); }}>
    <div className={styles.header}>
      <span className={styles.check}><Check size={24} strokeWidth={2.5} /></span>
      <div><h2 id="pos-sale-result-title">Venta cobrada</h2><p>{receipt}</p></div>
      <button type="button" onClick={onClose} aria-label="Cerrar resultado de la venta"><X size={20} /></button>
    </div>
    <div className={styles.body}>
      <div className={styles.amount}><span>Total cobrado</span><strong>{total}</strong></div>
      <dl className={styles.info}><div><dt>Medio de pago</dt><dd>{method}</dd></div><div><dt>Atendido por</dt><dd>{operator}</dd></div></dl>
      {change && <div className={styles.change}><span>Vuelto a entregar</span><strong>{change}</strong></div>}
      {popupBlocked && <div className={styles.notice} role="status"><Printer size={19} /><p><strong>Falta abrir el comprobante</strong>El navegador bloqueó la ventana. Usa el botón de impresión o permite ventanas emergentes para este sitio.</p></div>}
      <div className={styles.actions}>
        <button type="button" onClick={onClose} autoFocus className={styles.next}>Siguiente venta <span>Enter</span></button>
        <button type="button" onClick={onPrint}><Printer size={18} /> Imprimir comprobante interno</button>
      </div>
    </div>
  </dialog>;
}
