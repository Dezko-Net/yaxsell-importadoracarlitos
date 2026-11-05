# YAXSEL WEB-STORE: ARQUITECTURA CORE Y ALTO RENDIMIENTO (2026)

Este documento es la **ÚNICA** fuente de la verdad para el desarrollo, refactorización e interacción con la base de código de Yaxsel Web-Store. Reemplaza todos los documentos anteriores.

## REGLA DE ORO DEL RENDIMIENTO (ESCALA 1M REQUESTS)
Toda decisión de código debe diseñarse asumiendo **1 millón de peticiones diarias**. La infraestructura principal es Appwrite Cloud, la cual tiene estrictos límites de *Rate Limit* (Errores 429). Queda estrictamente prohibido implementar componentes que hagan *polling* constante, ciclos de peticiones sin *debounce*, o llamadas N+1.

---

## 1. Stack Tecnológico Principal

- **Framework**: Next.js 15 (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS + Vanilla CSS modular
- **Backend & BaaS**: Appwrite Cloud (Database, Storage, Auth)
- **Animaciones UI**: GSAP (GreenSock), Framer Motion, Lenis (Smooth Scroll)
- **Manejo de Estado Remoto/Caché**: SWR + Next.js Data Cache (`unstable_cache`)

---

## 2. Gestión de Appwrite y Peticiones (El "Request Leak" Solucionado)

El problema de agotamiento de cuota de Appwrite fue mitigado a través de dos capas de defensa arquitectónica que **nunca deben removerse o alterarse**:

### A. Deduplicación en el Cliente (`src/lib/appwrite.ts`)
El SDK cliente de Appwrite está parcheado (Monkey-patching). Si 5 componentes distintos montan un `useEffect` para listar los mismos `products` simultáneamente, el sistema captura estas peticiones paralelas, dispara una sola petición HTTP al proxy, y resuelve las 5 promesas con la misma respuesta en memoria (`pendingListRequests` y `pendingGetRequests`).
*   **Regla**: Usa SWR (`useSWR`) para componentes nuevos que necesiten datos, o consume los métodos regulares del SDK cliente asumiendo que el parche manejará la deduplicación concurrente.

### B. Caché en el Servidor (`src/app/api/appwrite-proxy/route.ts`)
Las peticiones de lectura a colecciones públicas son capturadas por el endpoint proxy. Este endpoint utiliza `unstable_cache` de Next.js.
*   **Regla**: Si modificas productos en el admin panel, debes invocar la revalidación de tags (`revalidateTag('appwrite-proxy')`) para limpiar el caché de Next.js, de lo contrario, los usuarios seguirán viendo datos por 60 segundos.

---

## 3. Lógica de Productos y Bodega

El sistema separa el inventario real de lo que se expone al público.

- **`inventory_products`**: La base de datos cruda conectada a Bodegapp (Bodega real).
- **`products`**: El catálogo purgado, visible y limpio de la tienda.
- **Tienda Inmediata (`/productos`)**: Muestra productos donde `ISACTIVE == true` y `STOCK > 0`.
- **Catálogo a Pedido (`/catalogo`)**: Muestra productos donde `ISACTIVE == true` y `STOCK <= 0`. Aquí no se puede "Comprar", solo "Consultar disponibilidad" (generando un `stock_alerts`).

**ATRIBUTOS HEREDADOS (MAYÚSCULAS)**
Al hacer queries a Appwrite, usa los atributos legacy exactamente como están definidos. Ejemplos: `CATEGORYID`, `PRICE`, `STOCK`, `ISACTIVE`. (Revisa siempre la base de datos antes de adivinar el nombre).

---

## 4. Animaciones y Componentes Complejos (Sin Bloquear el Main Thread)

Para evitar que dispositivos móviles se bloqueen, se imponen las siguientes directrices:

1. **Evitar CSS Pesado en Main Thread**: Utiliza GSAP (`gsap.to`) para coreografías y `Framer Motion` (`<motion.div>`) para interacciones de UI básicas.
2. **Scroll Suave**: Toda la aplicación usa **Lenis**. No implementes escuchadores manuales de `window.addEventListener('scroll')` que asfixien el rendimiento. Usa `useScroll` o `ScrollTrigger` vinculado a Lenis.
3. **Componentes 3D/Partículas**: Cualquier uso de `react-three-fiber` o `tsParticles` DEBE cargarse usando `next/dynamic` (Lazy loading).

---

## 5. Panel de Administración y AI Sidekick

El admin panel (Ruta: `/admin/(panel)`) utiliza CSR (Client-Side Rendering) intensivo.
*   Al construir nuevos dashboards para el administrador, **debes paginar siempre**. No utilices `Query.limit(5000)`. Usa cursores (`Query.cursorAfter`).
*   El asistente **Yexy (AI Sidekick)** se comunica a través de `/api/ai-sidekick` para sugerencias y acciones autónomas (`[ACTION:UPDATE_PRODUCT]...`). Cualquier nueva acción que le enseñes a la IA debe respetar las limitaciones de la base de datos.

---

## 6. SWR: El Nuevo Estándar para Hooks de Datos

A partir de la última refactorización, **SWR** está disponible en el proyecto (`npm install swr` realizado). 
Al crear nuevos componentes de UI que dependan de datos de Appwrite, el flujo ideal es:

```tsx
import useSWR from 'swr';
import { getServices, PRODUCTS_COLLECTION } from '@/lib/appwrite';

const fetchProducts = async () => {
  const { databases } = getServices();
  return databases.listDocuments(databaseId, PRODUCTS_COLLECTION, []);
};

export function ProductList() {
  const { data, error } = useSWR('home_products', fetchProducts);
  // data será entregado velozmente por el caché interno (SWR -> Deduplicator -> Proxy -> Next Cache)
}
```

**Mantenibilidad**
Si debes tocar la configuración del tema, los componentes dinámicos de `TemplateContext` manejan el look and feel. Las plantillas inyectan los colores y variables CSS globales automáticamente. No sobrescribas estilos a la fuerza con estilos inline `style={{...}}` si no es para propiedades animadas.
