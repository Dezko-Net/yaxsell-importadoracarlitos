'use client';

import { ArrowRightLeft } from 'lucide-react';
import styles from './pos-checkout-summary.module.css';

export default function PosCheckoutSummary({
  total,
  units,
  lines,
  change,
  remaining,
  sending,
  showTotal = false,
}: {
  total?: string;
  units?: number;
  lines?: number;
  change?: string;
  remaining?: string;
  sending?: boolean;
  showTotal?: boolean;
}) {
  if (!showTotal && !change && !remaining) return null;

  return (
    <div className={styles.summary}>
      {showTotal && (
        <div className={styles.total}>
          <div>
            <span>{sending ? 'Total a enviar' : 'Total de esta venta'}</span>
            {units != null && lines != null && (
              <small>
                {units} {units === 1 ? 'unidad' : 'unidades'} · {lines} {lines === 1 ? 'línea' : 'líneas'}
              </small>
            )}
          </div>
          {total && <strong>{total}</strong>}
        </div>
      )}
      {change && (
        <div className={styles.change}>
          <ArrowRightLeft size={16} />
          <span>Vuelto a entregar</span>
          <strong>{change}</strong>
        </div>
      )}
      {remaining && (
        <div className={styles.remaining}>
          <span>Falta asignar en el pago dividido</span>
          <strong>{remaining}</strong>
        </div>
      )}
    </div>
  );
}
