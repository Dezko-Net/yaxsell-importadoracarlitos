'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowUpRight, Check, Clock3, CreditCard, FileText, LockKeyhole, Package, PackageCheck, Receipt, RefreshCw, RotateCcw, ShoppingCart, Warehouse, AlertCircle } from 'lucide-react';
import { DEFAULT_SEDE, SEDES, type SedeSlug } from '@/types';
import { getBranchDisplayName } from '@/lib/posBranchAccess';
import { usePosDashboard, fmtCLP, fmtCount } from '@/components/pos/usePosDashboard';
import design from '@/components/pos/pos-design.module.css';
import styles from './dashboard.module.css';

const paymentLabels = { efectivo: 'Efectivo', debito: 'Débito', transferencia: 'Transferencia', otros: 'Otros / sin detalle' };

export default function PosAdminSedeDashboardPage() {
  const params = useParams();
  const sede = String(params?.sede || DEFAULT_SEDE) as SedeSlug;
  const branch = SEDES[sede] || getBranchDisplayName(sede);
  const basePath = `/pos-admin/${sede}`;
  const { summary, salesLoading, salesError, fromCache, todayKey, manualClose, manualCloseLoading, manualCloseError, catalogStats, catalogLoading, catalogError, catalogRequested, retrySales, requestCatalog } = usePosDashboard(sede);
  const value = (formatted: string) => salesLoading ? '…' : salesError ? '—' : formatted;
  const date = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${todayKey}T12:00:00Z`));
  const payments = Object.entries(summary.payments) as Array<[keyof typeof paymentLabels, number]>;
  const paymentTotal = payments.reduce((sum, [, amount]) => sum + amount, 0);

  return (
    <div className={styles.dashboard}>
      <header className={styles.heading}>
        <div><p>{date}</p><h1>Tu sucursal, al día.</h1><span>{branch}</span></div>
        <Link href={`/pos/${sede}`} className={design.primary}><ShoppingCart size={17} /> Ir al punto de venta</Link>
      </header>
      {salesError && <div role="alert" className={design.notice}><AlertCircle size={20} /><p>No pudimos cargar las ventas de hoy. Los importes no están disponibles.</p><button className={design.secondary} onClick={retrySales}>Reintentar</button></div>}
      <div className={styles.overview}>
        <section className={styles.day} aria-labelledby="day-title" aria-busy={salesLoading}>
          <div className={styles.sectionTop}>
            <div className={styles.dayTitleGroup}>
              <span className={styles.brandAccent} aria-hidden="true" title="Asistora">
                <i style={{ backgroundColor: '#e83462' }} />
                <i style={{ backgroundColor: '#f3c437' }} />
                <i style={{ backgroundColor: '#08a88f' }} />
              </span>
              <h2 id="day-title">La jornada de hoy</h2>
            </div>
            <span className={styles.sync} data-ready={!salesLoading && !salesError && !fromCache}><i />{salesError ? 'Sin conexión a ventas' : salesLoading ? 'Cargando ventas' : fromCache ? 'Datos guardados en este equipo' : 'Actualizado en vivo'}</span>
          </div>
          <div className={styles.dayAmount}>
            <div><p>Ventas completadas</p><strong>{value(fmtCLP(summary.totalSales))}</strong><span>Importe de tickets, antes de devoluciones</span></div>
            <span className={styles.dayIcon}><Receipt size={32} strokeWidth={1.4} /></span>
          </div>
          <dl className={styles.dayMetrics}>
            <div><dt>Tickets completados</dt><dd>{value(fmtCount(summary.tickets))}</dd></div>
            <div><dt>Ticket promedio</dt><dd>{value(summary.tickets ? fmtCLP(summary.averageTicket) : '—')}</dd></div>
            <div><dt>Unidades en tickets</dt><dd>{value(fmtCount(summary.unitsSold))}</dd></div>
          </dl>
          <div className={styles.dayFoot}><Check size={15} /><span>Solo esta sucursal. Excluye anulaciones y preventas.</span></div>
        </section>
        <aside className={styles.tasks} aria-label="Tareas de sucursal">
          <h2>Continuar con la operación</h2>
          {[
            { path: 'caja-cerrar', title: 'Gestionar cajas', description: 'Revisar aperturas, cerrar o reabrir', icon: LockKeyhole },
            { path: 'recepciones', title: 'Recibir mercadería', description: 'Registrar un ingreso al inventario', icon: PackageCheck },
            { path: 'cortes', title: 'Consultar cierres', description: 'Revisar cortes y comprobantes', icon: FileText },
          ].map(task => <Link href={`${basePath}/${task.path}`} key={task.path} className={styles.task}>
            <task.icon size={20} strokeWidth={1.6} /><div><strong>{task.title}</strong><span>{task.description}</span></div><ArrowUpRight size={16} />
          </Link>)}
          <div className={styles.statusStrip}>
            <Link href={`${basePath}/ventas`}><span>{value(fmtCount(summary.pending.length))}</span> preventas del día</Link>
            <Link href={`${basePath}/ventas`}><span>{value(fmtCount(summary.annulled.length))}</span> tickets del día anulados</Link>
          </div>
        </aside>
      </div>
      <section className={styles.manualClose} aria-labelledby="manual-close-title" aria-busy={manualCloseLoading}>
        <div className={styles.manualCloseHeader}>
          <div><h2 id="manual-close-title">Cierre manual de hoy</h2><p>Resumen de caja registrado aparte de los tickets del POS.</p></div>
          <span className={styles.manualCloseBadge}><FileText size={15} /> No genera boletas</span>
        </div>
        {manualCloseLoading ? <p className={styles.manualCloseMessage} role="status">Buscando el cierre del día…</p>
          : manualCloseError ? <div className={styles.manualCloseMessage} role="alert">No pudimos consultar el cierre manual. <button onClick={retrySales}>Reintentar</button></div>
            : !manualClose ? <p className={styles.manualCloseMessage}>Todavía no hay un cierre manual guardado para esta sucursal y fecha.</p>
              : <>
                <div className={styles.manualCloseTotal}><span>Total reportado en el cierre</span><strong>{fmtCLP(manualClose.totalBruto)}</strong></div>
                <dl className={styles.manualCloseMetrics}>
                  <div><dt>Efectivo en caja</dt><dd>{fmtCLP(manualClose.efectivoReal)}</dd><small>Sistema: {fmtCLP(manualClose.efectivoSistema)}</small></div>
                  <div><dt>Transferencias</dt><dd>{fmtCLP(manualClose.transferencias)}</dd></div>
                  <div><dt>Gastos registrados</dt><dd>{fmtCLP(manualClose.gastosTotales)}</dd></div>
                  <div><dt>Devoluciones</dt><dd>{fmtCLP(manualClose.devolucionesTotal)}</dd></div>
                </dl>
                {manualClose.cashiers.length > 0 && <div className={styles.manualCloseCashiers}>
                  <h3>Cajeras incluidas</h3>
                  <ul>{manualClose.cashiers.map(cashier => <li key={cashier.nombre}>
                    <span><strong>{cashier.nombre}</strong><small>{fmtCLP(cashier.efectivo)} efectivo · {fmtCLP(cashier.transferencia)} transferencia</small></span>
                    <b>{fmtCLP(cashier.total)}</b>
                  </li>)}</ul>
                </div>}
              </>}
      </section>
      <div className={styles.details}>
        <section className={styles.activity} aria-labelledby="activity-title">
          <div className={styles.sectionTop}><div><h2 id="activity-title">Actividad reciente</h2><p>Tickets de hoy, del más reciente al más antiguo</p></div><Link href={`${basePath}/ventas`}>Ver historial <ArrowUpRight size={14} /></Link></div>
          {salesLoading ? <div className={design.empty} role="status">Cargando actividad de la sucursal…</div> : salesError ? <div className={design.empty}>Actividad no disponible.</div> : summary.recentSales.length === 0 ? <div className={design.empty}><Receipt size={28} /><strong>La jornada está por comenzar</strong><p>Las ventas de esta sucursal aparecerán aquí cuando se registren.</p></div> : <div className={styles.activityList}>
            <div className={styles.tableHeading}><span>Comprobante / operador</span><span>Estado</span><span>Importe</span></div>
            {summary.recentSales.map(sale => <div className={styles.activityRow} key={sale.id}>
              <div className={styles.ticketInfo}><span className={styles.ticketIcon}><Receipt size={17} /></span><div><strong>{sale.estado === 'pre_venta' ? 'Preventa' : sale.tipoComprobante === 'boleta' ? 'Boleta' : 'Comprobante'} {sale.boletaNumero ? `N.º ${sale.boletaNumero}` : `#${sale.id.slice(-6).toUpperCase()}`}</strong><p>{sale.cajeroNombre}<span>{sale.fechaTs ? new Date(sale.fechaTs).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' }) : 'Sin hora'}</span></p></div></div>
              <span className={styles.saleStatus} data-state={sale.estado}>{sale.estado === 'completada' ? 'Completada' : sale.estado === 'anulada' ? 'Anulada' : sale.estado === 'pre_venta' ? 'Por cobrar' : sale.estado}</span>
              <strong className={styles.saleAmount}>{fmtCLP(sale.total)}</strong>
            </div>)}
          </div>}
          <Link href={`${basePath}/devoluciones`} className={styles.returnNote}><RotateCcw size={16} /><span>Las devoluciones se consultan por separado; conservan el ticket original.</span><ArrowUpRight size={16} /></Link>
        </section>
        <section className={styles.payments} aria-labelledby="payment-title">
          <div className={styles.sectionTop}><div><h2 id="payment-title">Medios de pago</h2><p>De las ventas completadas de hoy</p></div><CreditCard size={20} /></div>
          <div className={styles.paymentBar} aria-hidden="true">{!salesLoading && !salesError && payments.map(([method, amount]) => <span key={method} data-method={method} style={{ width: `${paymentTotal ? amount / paymentTotal * 100 : 0}%` }} />)}</div>
          <dl className={styles.paymentRows}>{payments.filter(([key, amount]) => key !== 'otros' || amount > 0).map(([method, amount]) => <div key={method}><dt><i data-method={method} />{paymentLabels[method]}</dt><dd>{value(fmtCLP(amount))}</dd></div>)}</dl>
          <p className={styles.sourceNote}>Importes registrados, descontando el vuelto cuando excede el total. No representan el saldo de caja ni descuentan devoluciones.</p>
          {!salesLoading && !salesError && summary.paymentMismatchCount > 0 && <Link className={styles.paymentWarning} href={`${basePath}/ventas`}><AlertCircle size={16} /> {summary.paymentMismatchCount} tickets con pagos que no coinciden con su total. Revisar historial.</Link>}
        </section>
      </div>
      <div className={styles.lower}>
        <section className={styles.products} aria-labelledby="products-title">
          <div className={styles.sectionTop}><div><h2 id="products-title">Lo que se está vendiendo</h2><p>Por unidades en tickets completados, antes de devoluciones</p></div><Package size={20} /></div>
          {salesLoading || salesError ? <p className={design.empty}>{salesLoading ? 'Cargando productos vendidos…' : 'Productos vendidos no disponibles.'}</p> : summary.bestSellers.length === 0 ? <p className={design.empty}>Todavía no hay productos vendidos hoy.</p> : <ol className={styles.ranking}>{summary.bestSellers.map((product, index) => <li key={`${product.nombre}-${index}`}><span>{index + 1}</span><div><p>{product.nombre}</p><div className={styles.rankTrack}><i style={{ width: `${summary.bestSellers[0].cantidad > 0 ? product.cantidad / summary.bestSellers[0].cantidad * 100 : 0}%` }} /></div></div><strong>{fmtCount(product.cantidad)} <small>u.</small></strong></li>)}</ol>}
        </section>
        <section className={styles.catalog} aria-labelledby="catalog-title">
          <Warehouse size={25} strokeWidth={1.5} /><h2 id="catalog-title">Un catálogo compartido</h2><p>El stock es común a POS, tienda y ERP. Este resumen corresponde al catálogo general, no a existencias exclusivas de {branch}.</p>
          {!catalogRequested ? <button className={design.secondary} onClick={requestCatalog}><Package size={16} /> Consultar resumen del catálogo</button> : catalogError ? <div role="alert"><p>No se pudo cargar el catálogo.</p><button className={design.secondary} onClick={retrySales}><RefreshCw size={14} /> Reintentar</button></div> : <dl className={styles.catalogMetrics} aria-busy={catalogLoading}>
            <div><dt>SKU registrados</dt><dd>{catalogLoading ? '…' : fmtCount(catalogStats.totalCount)}</dd></div>
            <div><dt>Con stock positivo</dt><dd>{catalogLoading ? '…' : fmtCount(catalogStats.inStock)}</dd></div>
            <div><dt>Sin stock / negativo</dt><dd>{catalogLoading ? '…' : fmtCount(catalogStats.outOfStock)}</dd></div>
          </dl>}
          <Link href={`${basePath}/stock`}>Abrir inventario <ArrowUpRight size={15} /></Link>
        </section>
      </div>
      <footer className={styles.footnote}><Clock3 size={14} /> Jornada según fecha de venta registrada en Santiago de Chile. No incluye ventas de días anteriores anuladas hoy.</footer>
    </div>
  );
}
