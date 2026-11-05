/** Correo con acceso al panel /admin y a /inventario */
export const ADMIN_EMAIL = 'dezkonet@gmail.com';

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return [ADMIN_EMAIL, 'yanpolreyes666@gmail.com'].includes(email.trim().toLowerCase());
}
