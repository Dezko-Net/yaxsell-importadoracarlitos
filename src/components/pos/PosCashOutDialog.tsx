'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDownRight,
  Banknote,
  Brush,
  Check,
  Coins,
  FileText,
  Info,
  Loader2,
  Package,
  RotateCcw,
  Store,
  Truck,
  User,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import styles from './pos-cash-out-dialog.module.css';

const presets = [
  { label: 'Sencillo / Vuelto', hint: 'Operacional · Suministros', icon: Coins, detalle: 'Sencillo para dar vuelto', tipo: 'Operacional', categoria: 'Suministros' },
  { label: 'Colación / Turno', hint: 'Alimentación', icon: Utensils, detalle: 'Colación / Almuerzo de turno', tipo: 'Alimentación', categoria: 'Alimentación' },
  { label: 'Insumos y Aseo', hint: 'Operacional · Suministros', icon: Brush, detalle: 'Artículos de aseo e insumos local', tipo: 'Operacional', categoria: 'Suministros' },
  { label: 'Flete / Encomienda', hint: 'Transporte', icon: Truck, detalle: 'Pago de flete / encomienda mercadería', tipo: 'Transporte', categoria: 'Transporte' },
  { label: 'Anticipo Sueldo', hint: 'Personal · RR.HH.', icon: User, detalle: 'Anticipo sueldo personal', tipo: 'Personal', categoria: 'Recursos Humanos' },
  { label: 'Mercadería Efectivo', hint: 'No resta ganancia neta', icon: Package, detalle: 'Pago mercadería en efectivo', tipo: 'Gasto de mercadería', categoria: 'Otros' },
] as const;

const quickDenominations = [1000, 2000, 5000, 10000, 20000, 50000] as const;

export default function PosCashOutDialog({
  editing,
  branch,
  operator,
  availableCash,
  recordedCount = 0,
  amount,
  detail,
  expenseType,
  category,
  types,
  categories,
  saving,
  formatMoney,
  onAmount,
  onDetail,
  onType,
  onCategory,
  onPreset,
  onViewRecorded,
  onSave,
  onClose,
}: {
  editing: boolean;
  branch?: string;
  operator: string;
  availableCash?: number;
  recordedCount?: number;
  amount: string;
  detail: string;
  expenseType: string;
  category: string;
  types: readonly string[];
  categories: readonly string[];
  saving: boolean;
  formatMoney: (value: number) => string;
  onAmount: (value: string) => void;
  onDetail: (value: string) => void;
  onType: (value: string) => void;
  onCategory: (value: string) => void;
  onPreset: (preset: { detalle: string; tipo: string; categoria: string }) => void;
  onViewRecorded?: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const detailInputRef = useRef<HTMLTextAreaElement>(null);
  const typeSelectRef = useRef<HTMLSelectElement>(null);
  const categorySelectRef = useRef<HTMLSelectElement>(null);
  const [additiveChips, setAdditiveChips] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    requestAnimationFrame(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    });
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const numericAmount = Math.round(Number(amount) || 0);
  const hasDetail = Boolean(detail.trim());
  const hasClassification = Boolean(expenseType) && Boolean(category);
  const canSave = numericAmount > 0 && hasDetail && hasClassification;
  const remainingCash = availableCash !== undefined ? availableCash - numericAmount : undefined;
  const exceedsDrawer = remainingCash !== undefined && numericAmount > 0 && remainingCash < 0;

  const validationHint = (() => {
    if (canSave) {
      return expenseType === 'Gasto de mercadería'
        ? `${expenseType} · No descuenta ganancia neta`
        : `${expenseType} · ${category}`;
    }
    if (numericAmount <= 0) return 'Ingresa el monto que sale de la caja';
    if (!hasDetail) return 'Escribe o elige un motivo frecuente';
    if (!expenseType) return 'Selecciona el tipo de gasto';
    return 'Selecciona la categoría del gasto';
  })();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (canSave) {
      onSave();
      return;
    }
    if (numericAmount <= 0) {
      amountInputRef.current?.focus();
    } else if (!hasDetail) {
      detailInputRef.current?.focus();
    } else if (!expenseType) {
      typeSelectRef.current?.focus();
    } else if (!category) {
      categorySelectRef.current?.focus();
    }
  };

  const handleQuickAmount = (value: number) => {
    const next = additiveChips ? numericAmount + value : value;
    onAmount(String(Math.min(next, 99999999)));
    amountInputRef.current?.focus();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="caja-gasto-form-title"
      aria-describedby="caja-gasto-form-description"
      onCancel={event => {
        event.preventDefault();
        if (!saving) onClose();
      }}
      onClick={event => {
        if (!saving && event.target === event.currentTarget && (event.clientX > 0 || event.clientY > 0)) {
          onClose();
        }
      }}
      onKeyDown={event => {
        event.stopPropagation();
      }}
    >
      <form className={styles.sheet} onSubmit={handleSubmit} noValidate>
        <header className={styles.header}>
          <div className={styles.icon} aria-hidden="true">
            <Banknote size={22} />
            <span className={styles.iconBadge}>
              <ArrowDownRight size={11} strokeWidth={2.75} />
            </span>
          </div>

          <div className={styles.heading}>
            <div className={styles.eyebrowRow}>
              <span className={styles.eyebrow}>Control de gaveta</span>
              {branch && (
                <span className={styles.branchTag}>
                  <Store size={11} />
                  {branch}
                </span>
              )}
            </div>
            <h2 id="caja-gasto-form-title">
              {editing ? 'Editar Salida de Efectivo' : 'Registrar Salida de Efectivo'}
            </h2>
            <p id="caja-gasto-form-description">
              Descuenta efectivo del arqueo actual y clasifica el movimiento para el cierre de turno.
            </p>
          </div>

          <div className={styles.headerActions}>
            {onViewRecorded && recordedCount > 0 && (
              <button
                type="button"
                className={styles.recordedButton}
                disabled={saving}
                onClick={onViewRecorded}
                title="Ver retiros y gastos registrados en este turno"
              >
                <FileText size={14} />
                <span>Salidas ({recordedCount})</span>
              </button>
            )}
            <button
              type="button"
              className={styles.close}
              disabled={saving}
              onClick={onClose}
              aria-label="Cerrar ventana"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className={styles.body}>
          <fieldset disabled={saving} className={styles.fields}>
            <div className={styles.main}>
              <section className={styles.amountPanel}>
                <div className={styles.sectionLabel}>
                  <label htmlFor="pos-cash-out-amount">
                    Monto que sale de caja <span>*</span>
                  </label>
                  <div className={styles.amountHeaderControls}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={additiveChips}
                      aria-label="Sumar atajos de efectivo al monto"
                      className={styles.modeSwitch}
                      data-active={additiveChips}
                      onClick={() => setAdditiveChips(current => !current)}
                      title={additiveChips ? 'Cada botón suma al monto actual' : 'Cada botón reemplaza el monto'}
                    >
                      <span>{additiveChips ? 'Sumar' : 'Fijar'}</span>
                      <i aria-hidden="true"><b /></i>
                    </button>
                    {numericAmount > 0 && (
                      <button
                        type="button"
                        className={styles.clearAmount}
                        onClick={() => {
                          onAmount('');
                          amountInputRef.current?.focus();
                        }}
                      >
                        <RotateCcw size={11} />
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>

                <div className={styles.amountInput}>
                  <span className={styles.currencyPrefix} aria-hidden="true">$</span>
                  <input
                    ref={amountInputRef}
                    id="pos-cash-out-amount"
                    inputMode="numeric"
                    autoComplete="off"
                    value={numericAmount > 0 ? numericAmount.toLocaleString('es-CL') : ''}
                    placeholder="0"
                    onChange={event => onAmount(event.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                  />
                  <span className={styles.currencyCode}>CLP</span>
                </div>

                <div className={styles.quickAmounts}>
                  {quickDenominations.map(value => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => handleQuickAmount(value)}
                    >
                      {additiveChips ? `+${formatMoney(value)}` : formatMoney(value)}
                    </button>
                  ))}
                </div>

                {availableCash !== undefined && (
                  <div className={styles.drawerBar} data-warn={exceedsDrawer}>
                    <div className={styles.drawerStat}>
                      <Wallet size={14} />
                      <span>Efectivo esperado en gaveta:</span>
                      <strong>{formatMoney(availableCash)}</strong>
                    </div>
                    {numericAmount > 0 && remainingCash !== undefined && (
                      <div className={styles.drawerAfter}>
                        <span>Quedará:</span>
                        <strong>{formatMoney(remainingCash)}</strong>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className={styles.reasons}>
                <div className={styles.sectionHeader}>
                  <h3>Motivos frecuentes</h3>
                  <span>1 toque · autocompleta clasificación</span>
                </div>
                <div className={styles.presetGrid}>
                  {presets.map(preset => {
                    const selected = detail === preset.detalle;
                    const Icon = preset.icon;
                    return (
                      <button
                        type="button"
                        key={preset.label}
                        aria-pressed={selected}
                        onClick={() => onPreset(preset)}
                      >
                        <span className={styles.presetIcon} aria-hidden="true">
                          <Icon size={16} />
                        </span>
                        <span className={styles.presetText}>
                          <strong>{preset.label}</strong>
                          <small>{preset.hint}</small>
                        </span>
                        {selected && (
                          <span className={styles.presetCheck} aria-hidden="true">
                            <Check size={13} strokeWidth={2.6} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className={styles.details}>
              <section className={styles.descriptionCard}>
                <div className={styles.sectionLabel}>
                  <label htmlFor="pos-cash-out-detail">
                    Detalle o concepto de la salida <span>*</span>
                  </label>
                  <small>{detail.length}/180</small>
                </div>
                <textarea
                  ref={detailInputRef}
                  id="pos-cash-out-detail"
                  value={detail}
                  onChange={event => onDetail(event.target.value)}
                  onKeyDown={event => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && canSave && !saving) {
                      event.preventDefault();
                      onSave();
                    }
                  }}
                  maxLength={180}
                  rows={3}
                  placeholder="Ej.: Sencillo para dar vuelto, colación de turno, pago de flete de mercadería..."
                />
              </section>

              <section className={styles.classificationCard}>
                <div className={styles.sectionHeader}>
                  <h3>Clasificación contable</h3>
                  <span className={styles.erpBadge}>Sincronizado ERP</span>
                </div>

                <div className={styles.selects}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="pos-cash-out-type">
                      Tipo de gasto <span>*</span>
                    </label>
                    <select
                      ref={typeSelectRef}
                      id="pos-cash-out-type"
                      required
                      value={expenseType}
                      onChange={event => onType(event.target.value)}
                    >
                      <option value="">Selecciona el tipo</option>
                      {types.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="pos-cash-out-category">
                      Categoría <span>*</span>
                    </label>
                    <select
                      ref={categorySelectRef}
                      id="pos-cash-out-category"
                      required
                      value={category}
                      onChange={event => onCategory(event.target.value)}
                    >
                      <option value="">Selecciona la categoría</option>
                      {categories.map(item => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div
                  className={styles.notice}
                  data-merchandise={expenseType === 'Gasto de mercadería'}
                >
                  <Info size={15} />
                  <p>
                    {expenseType === 'Gasto de mercadería'
                      ? 'Compra de mercadería: descuenta el efectivo de la caja, pero no resta la ganancia neta en el ERP.'
                      : 'Al cerrar la caja, este retiro quedará reflejado automáticamente en el módulo de Gastos del ERP.'}
                  </p>
                </div>
              </section>

              <div className={styles.operatorBar}>
                <span className={styles.operatorAvatar} aria-hidden="true">
                  {(operator || 'C').charAt(0).toUpperCase()}
                </span>
                <div className={styles.operatorMeta}>
                  <span>Responsable del movimiento</span>
                  <strong>{operator}</strong>
                </div>
              </div>
            </div>
          </fieldset>
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerAmount}>
            <span>Salida de efectivo</span>
            <strong data-active={numericAmount > 0}>
              {numericAmount > 0 ? `−${formatMoney(numericAmount)}` : formatMoney(0)}
            </strong>
            <small data-ready={canSave}>{validationHint}</small>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancel}
              disabled={saving}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.save}
              disabled={saving || !canSave}
            >
              {saving ? (
                <Loader2 size={17} className={styles.spinner} />
              ) : (
                <Check size={17} strokeWidth={2.5} />
              )}
              <span>
                {saving
                  ? 'Guardando…'
                  : editing
                  ? 'Guardar cambios'
                  : 'Registrar salida'}
              </span>
              {!saving && canSave && <kbd>Enter</kbd>}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
