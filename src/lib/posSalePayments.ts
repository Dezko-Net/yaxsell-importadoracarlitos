export function getSalePagos(sale: any): Array<{ metodo: string; monto: number }> {
  const total = Number(sale?.total || 0)
  let payments: any[] = Array.isArray(sale?.pagos) ? sale.pagos : []
  if (!payments.length && typeof sale?.pagosJson === 'string') {
    try {
      const parsed = JSON.parse(sale.pagosJson)
      if (Array.isArray(parsed)) payments = parsed
    } catch {}
  }
  if (!payments.length) {
    return [{ metodo: String(sale?.metodoPago || (sale?.debitoOrdenNumero ? 'debito' : 'efectivo')).toLowerCase().trim(), monto: total }]
  }
  return payments.map(payment => {
    const amount = Number(payment?.monto || 0)
    return {
      metodo: String(payment?.metodo || 'efectivo').toLowerCase().trim(),
      monto: payments.length === 1 && total > 0 && amount > total ? total : amount,
    }
  })
}

export function getSaleEfectivoNeto(sale: any): number {
  const payments = getSalePagos(sale)
  const cash = payments.filter(payment => payment.metodo === 'efectivo').reduce((sum, payment) => sum + (Number(payment.monto) || 0), 0)
  if (cash <= 0) return 0
  return payments.length > 1 || String(sale?.metodoPago).toLowerCase() === 'mixto'
    ? Math.max(0, cash - (Number(sale?.vuelto) || 0))
    : cash
}
