import { redirect } from 'next/navigation';

// 🔍 SEO: /producto/[id] era la MISMA página que /productos/[id] con otra URL
// (contenido duplicado para Google, que además solo veía un replaceState en
// cliente). Redirect real de servidor → consolida señales en la URL canónica.
export default async function ProductoPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  redirect(`/productos/${id}`);
}
