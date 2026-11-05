import useSWR from 'swr';
import { Category, Subcategory } from '@/types';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useCategories() {
  const { data, error, isLoading } = useSWR('/api/public-data/catalog', fetcher, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 3600000, // 1 hora
  });

  return {
    categories: (data?.categories || []) as Category[],
    subcategories: (data?.subcategories || []) as Subcategory[],
    offers: data?.offers || [],
    isLoading,
    error,
  };
}
