'use client';

import { useState, useEffect, ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
  count?: number;
  content: ReactNode;
}

export default function ProductTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id || '');

  useEffect(() => {
    function handleActivate(e: Event) {
      const tabId = (e as CustomEvent).detail;
      if (tabs.some(t => t.id === tabId)) setActive(tabId);
    }
    window.addEventListener('activate-tab', handleActivate);
    return () => window.removeEventListener('activate-tab', handleActivate);
  }, [tabs]);

  if (tabs.length === 0) return null;

  return (
    <div id="product-tabs" style={{ background: '#fff', borderRadius: 4, overflow: 'hidden', marginBottom: 16, scrollMarginTop: 80 }}>
      {/* Tab headers */}
      <div style={{ display: 'flex', borderBottom: '1px solid #eee', overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActive(tab.id)}
            style={{
              padding: '14px 24px', fontSize: 14, fontWeight: active === tab.id ? 600 : 400,
              color: active === tab.id ? '#3483fa' : '#666',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: active === tab.id ? '2px solid #3483fa' : '2px solid transparent',
              transition: 'all .15s', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, background: active === tab.id ? '#3483fa' : '#e0e0e0',
                color: active === tab.id ? '#fff' : '#666',
                borderRadius: 10, padding: '1px 6px', minWidth: 18, textAlign: 'center',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: '20px 24px' }}>
        {tabs.find(t => t.id === active)?.content}
      </div>
    </div>
  );
}
