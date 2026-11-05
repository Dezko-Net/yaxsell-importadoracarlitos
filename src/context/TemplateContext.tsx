'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface SectionTemplates {
  landing: number;
  collections: number;
  catalog: number;
  productDetail: number;
  cart: number;
  checkout: number;
}

interface TemplateContextType {
  template: number;
  isLoading: boolean;
  sections: SectionTemplates;
  getSectionTemplate: (section: keyof SectionTemplates) => number;
}

const DEFAULT_SECTIONS: SectionTemplates = { landing: 25, collections: 3, catalog: 3, productDetail: 3, cart: 3, checkout: 3 };

const TemplateContext = createContext<TemplateContextType>({
  template: 25,
  isLoading: true,
  sections: DEFAULT_SECTIONS,
  getSectionTemplate: () => 25,
});

export function useTemplate() {
  return useContext(TemplateContext);
}

export function TemplateProvider({ children }: { children: ReactNode }) {
  const [template, setTemplate] = useState(25);
  const [sections, setSections] = useState<SectionTemplates>(DEFAULT_SECTIONS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      let dbGlobal = 25;
      let dbSections = { landing: 25, collections: 3, catalog: 3, productDetail: 3, cart: 3, checkout: 3 };

      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const isInternalPosOrErp =
        pathname.startsWith('/pos') ||
        pathname.startsWith('/erp-dashboard') ||
        pathname.startsWith('/inventario') ||
        pathname.startsWith('/admin');

      if (!isInternalPosOrErp) {
        let loadedFromSession = false;
        if (typeof window !== 'undefined') {
          try {
            const cachedRaw = sessionStorage.getItem('yaxsel_template_cfg_v1');
            if (cachedRaw) {
              const parsed = JSON.parse(cachedRaw);
              if (parsed && Date.now() - Number(parsed.ts || 0) < 15 * 60 * 1000) {
                dbGlobal = Number(parsed.template) || 25;
                if (parsed.sections) dbSections = parsed.sections;
                loadedFromSession = true;
              }
            }
          } catch {}
        }

        if (!loadedFromSession) {
          try {
            const res = await fetch(`/api/template`);
            if (res.ok) {
              const data = await res.json();
              dbGlobal = Number(data.template) || 25;
              if (data.sections) {
                dbSections = {
                  landing: Number(data.sections.landing) || 25,
                  collections: Number(data.sections.collections) || dbGlobal,
                  catalog: Number(data.sections.catalog) || dbGlobal,
                  productDetail: Number(data.sections.productDetail) || dbGlobal,
                  cart: Number(data.sections.cart) || dbGlobal,
                  checkout: Number(data.sections.checkout) || dbGlobal,
                };
              } else {
                dbSections = { landing: 25, collections: dbGlobal, catalog: dbGlobal, productDetail: dbGlobal, cart: dbGlobal, checkout: dbGlobal };
              }
              if (typeof window !== 'undefined') {
                try {
                  sessionStorage.setItem('yaxsel_template_cfg_v1', JSON.stringify({
                    template: dbGlobal,
                    sections: dbSections,
                    ts: Date.now(),
                  }));
                } catch {}
              }
            }
          } catch (err) {
            console.error('[TemplateContext] failed to load template from API:', err);
          }
        }
      }

      // 2. Check for _tpl override or pathname match to apply target section override
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const tplOverride = params.get('_tpl');
        const pathnameMatch = window.location.pathname.match(/\/preview\/plantilla\/(\d+)/);

        if (tplOverride) {
          const t = Number(tplOverride) || 1;
          const section = params.get('section') as keyof SectionTemplates | null;
          if (section && dbSections[section] !== undefined) {
            dbSections[section] = t;
          } else {
            // Apply globally if no specific section is provided
            dbSections = { landing: t, collections: t, catalog: t, productDetail: t, cart: t, checkout: t };
          }
          dbGlobal = t;
        } else if (pathnameMatch && pathnameMatch[1]) {
          const t = Number(pathnameMatch[1]);
          const path = window.location.pathname;
          // Check if current route is a preview page for a specific section
          const isCart = path.includes('/carrito');
          const isCheckout = path.includes('/checkout');
          const isProductDetail = path.includes('/producto/') || path.includes('/productos/');
          const isCatalog = path.includes('/collections/all');
          const isCollections = path.includes('/collections');

          if (isCart) {
            dbSections.cart = t;
          } else if (isCheckout) {
            dbSections.checkout = t;
          } else if (isProductDetail) {
            dbSections.productDetail = t;
          } else if (isCatalog) {
            dbSections.catalog = t;
          } else if (isCollections) {
            dbSections.collections = t;
          } else {
            dbSections.landing = t;
          }
          dbGlobal = t;
        }
      }

      setTemplate(dbGlobal);
      setSections(dbSections);
      setIsLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    
    let activeTemplate = template; // default to global
    
    const isProductDetail = path.includes('/producto/') || path.includes('/productos/');
    const isCatalog = path.includes('/collections/all') || path === '/productos' || path === '/catalogo';
    const isCollections = path.includes('/collections');
    const isCart = path === '/carrito';
    const isCheckout = path === '/checkout';

    if (isProductDetail) {
      activeTemplate = sections.productDetail;
    } else if (isCatalog) {
      activeTemplate = sections.catalog;
    } else if (isCollections) {
      activeTemplate = sections.collections;
    } else if (isCart) {
      activeTemplate = sections.cart;
    } else if (isCheckout) {
      activeTemplate = sections.checkout;
    } else if (path === '/' || path === '') {
      activeTemplate = sections.landing;
    }

    const bgMap: Record<number, string> = {
      1: '#f8f9fa',
      2: '#ebebeb',
      3: '#f5f5f5',
      4: '#ffffff',
      5: '#fdfbf7',
      100: '#ffffff',
      101: '#ffffff',
      200: '#ffffff',
    };
    document.body.style.backgroundColor = bgMap[activeTemplate] || '#ffffff';
    document.body.style.color = activeTemplate === 2 ? '#333333' : activeTemplate === 4 ? '#1F1F1F' : activeTemplate === 5 ? '#2a2120' : '#111827';
  }, [template, sections]);

  const getSectionTemplate = (section: keyof SectionTemplates): number => {
    return sections[section] || template;
  };

  return (
    <TemplateContext.Provider value={{ template, isLoading, sections, getSectionTemplate }}>
      <div data-template={template} className="contents">
        {children}
      </div>
    </TemplateContext.Provider>
  );
}
