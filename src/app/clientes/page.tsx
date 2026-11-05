import { redirect } from 'next/navigation';

/** Alias público → panel de clientes registrados en Appwrite. */
export default function ClientesPage() {
  redirect('/admin/users');
}
