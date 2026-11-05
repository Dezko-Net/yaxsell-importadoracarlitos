import type { Metadata } from 'next';
import CatalogoClient from '@/app/productos/CatalogoClient';

export const metadata: Metadata = {
  title: 'Mis Favoritos | Catálogo Importadora Carlitos',
  description: 'Revisa tus productos favoritos y agrégalos a tu pedido mayorista.',
};

export default function FavoritosPage() {
  return <CatalogoClient defaultHash="#/favorites" />;
}
