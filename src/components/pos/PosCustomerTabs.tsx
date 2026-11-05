'use client';
import { Edit3, Plus, ShoppingCart, X, Send } from 'lucide-react';
import styles from './pos-toolbar.module.css';

type CustomerTab = { id: string; name: string; originVendorName?: string; itemCount: number; total: string };

export default function PosCustomerTabs({ tabs, activeId, maxTabs, onSelect, onRename, onClose, onNew }: {
  tabs: CustomerTab[]; activeId: string; maxTabs: number;
  onSelect: (id: string) => void; onRename: () => void; onClose: (id: string) => void; onNew: () => void;
}) {
  return <nav data-pos="customer-bar" className={styles.customerBar} aria-label="Atenciones en curso">
    <div className={styles.customerList}>
      {tabs.map(tab => <div key={tab.id} data-pos="customer-tab" className={styles.customer} data-active={tab.id === activeId}>
        <button type="button" onClick={() => onSelect(tab.id)} onDoubleClick={() => { if (tab.id === activeId) onRename(); }} aria-pressed={tab.id === activeId} title={tab.originVendorName ? `Enviado por ${tab.originVendorName}` : tab.name}>
          {tab.originVendorName ? <Send size={15} /> : <ShoppingCart size={15} />}<span>{tab.name}</span>{tab.itemCount > 0 && <small>{tab.itemCount} u. · {tab.total}</small>}
        </button>
        {tab.id === activeId && <button type="button" className={styles.tabAction} onClick={onRename} aria-label={`Cambiar nombre de ${tab.name}`}><Edit3 size={13} /></button>}
        {tabs.length > 1 && <button type="button" className={styles.tabAction} onClick={() => onClose(tab.id)} aria-label={`Cerrar atención de ${tab.name}`}><X size={14} /></button>}
      </div>)}
      <button type="button" data-pos="new-customer" className={styles.newCustomer} onClick={onNew} disabled={tabs.length >= maxTabs}><Plus size={16} /> Nueva atención</button>
    </div>
    <span className={styles.customerCount}>{tabs.length}/{maxTabs} abiertas</span>
  </nav>;
}
