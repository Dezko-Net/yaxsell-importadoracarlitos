'use client';

import React, { createContext, useContext, ReactNode } from 'react';

// ── Notificaciones DESHABILITADAS ──
// Las notificaciones ahora se envían por WhatsApp vía IA.
// Este provider es un stub vacío para no romper imports existentes.

interface NotificationContextType {
  unreadCount: number;
  refreshCount: (force?: boolean) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  unreadCount: 0,
  refreshCount: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  return React.createElement(
    NotificationContext.Provider,
    { value: { unreadCount: 0, refreshCount: () => {} } },
    children
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
