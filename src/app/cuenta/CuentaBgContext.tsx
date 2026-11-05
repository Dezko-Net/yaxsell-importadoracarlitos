'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const CuentaBgContext = createContext<{ bgUrl: string; setBgUrl: (url: string) => void }>({
  bgUrl: '',
  setBgUrl: () => {},
});

export function CuentaBgProvider({ children }: { children: ReactNode }) {
  const [bgUrl, setBgUrl] = useState('');
  return (
    <CuentaBgContext.Provider value={{ bgUrl, setBgUrl }}>
      {children}
    </CuentaBgContext.Provider>
  );
}

export function useCuentaBg(url: string) {
  const { setBgUrl } = useContext(CuentaBgContext);
  useEffect(() => {
    setBgUrl(url);
  }, [url, setBgUrl]);
}

export function useCuentaBgUrl() {
  const { bgUrl } = useContext(CuentaBgContext);
  return bgUrl;
}
