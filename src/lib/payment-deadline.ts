import { calculatePaymentDeadline } from '@/lib/store-schedule';

/** Plazo estándar de pago usado por los pedidos que requieren transferencia. */
export const STANDARD_PAYMENT_WINDOW_MS = 20 * 60 * 1000;
export const PAYMENT_PROOF_GRACE_MS = 5 * 60 * 1000;

export function getPaymentDeadline(date: Date = new Date()): number {
  return date.getTime() + STANDARD_PAYMENT_WINDOW_MS;
}

/**
 * El cliente ve 15 minutos cuando hay un producto con riesgo moderado y el
 * servidor conserva 5 minutos de gracia. En los demás casos se muestran y
 * aplican 20 minutos. El plazo es igual a cualquier hora del día.
 */
export function getPaymentDeadlineByRisk(
  hasYellowItem: boolean,
  date: Date = new Date(),
  configuredWindowMinutes?: number,
): { visible: number; backend: number } {
  if (Number.isFinite(configuredWindowMinutes) && Number(configuredWindowMinutes) > 0) {
    const visible = calculatePaymentDeadline(date.getTime(), Number(configuredWindowMinutes));
    return { visible, backend: visible + PAYMENT_PROOF_GRACE_MS };
  }
  const backend = getPaymentDeadline(date);
  return {
    visible: hasYellowItem ? date.getTime() + 15 * 60 * 1000 : backend,
    backend: hasYellowItem ? date.getTime() + 20 * 60 * 1000 : backend,
  };
}
