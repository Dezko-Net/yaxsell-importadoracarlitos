'use client';
import useSWR from 'swr';
import { useMemo } from 'react';
import { DEFAULT_WEB_CLIENT_CONFIG, normalizeWebClientConfig, type WebClientConfig } from '@/lib/web-client-config';

export function useWebClientConfig() {
  const { data, error, mutate, isLoading } = useSWR<{ config: WebClientConfig }>(
    '/api/web-client-config',
    async url => {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo cargar la configuración web.');
      return response.json();
    },
    { revalidateOnFocus: true, dedupingInterval: 1000 },
  );
  const config = useMemo(() => data?.config ? normalizeWebClientConfig(data.config) : DEFAULT_WEB_CLIENT_CONFIG, [data]);
  return { config, error, isLoading, refresh: mutate };
}
