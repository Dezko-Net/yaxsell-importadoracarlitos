# 🏰 Páginas Clonadas — The King Castle (Plantilla 3)

A continuación se muestra el listado de las páginas capturadas de **The King Castle** con el motor `shopify-folla.js` y mapeadas de forma interactiva en el servidor local de Next.js (`localhost:3000`).

---

## 🔗 Tabla de Enrutamiento y Previsualización Local

| Nombre de la Sección | URL Original (Shopify) | Enlace de Previsualización Local (Next.js) | Ruta Física del Contenido (`public/`) |
| :--- | :--- | :--- | :--- |
| **Portada / Home** | [Ver original](https://theking-castle.myshopify.com/) | [http://localhost:3000/preview/plantilla/3](http://localhost:3000/preview/plantilla/3) | `/public/shopify/plantilla3/body-clean.html` |
| **Raíz de Colecciones** | [Ver original](https://theking-castle.myshopify.com/collections) | [http://localhost:3000/preview/plantilla/3/collections](http://localhost:3000/preview/plantilla/3/collections) | `/public/shopify/plantilla3/collections/body-clean.html` |
| **Catálogo / Colección "All"** | [Ver original](https://theking-castle.myshopify.com/collections/all) | [http://localhost:3000/preview/plantilla/3/collections/all](http://localhost:3000/preview/plantilla/3/collections/all) | `/public/shopify/plantilla3/collections/all/body-clean.html` |
| **Ficha de Producto** | [Ver original](https://theking-castle.myshopify.com/products/3pc-gym-suit) | [http://localhost:3000/preview/plantilla/3/products/3pc-gym-suit](http://localhost:3000/preview/plantilla/3/products/3pc-gym-suit) | `/public/shopify/plantilla3/products/3pc-gym-suit/body-clean.html` |
| **Carrito de Compras** | [Ver original](https://theking-castle.myshopify.com/cart) | [http://localhost:3000/preview/plantilla/3/cart](http://localhost:3000/preview/plantilla/3/cart) | `/public/shopify/plantilla3/cart/body-clean.html` |
| **Soporte / Quiénes Somos** | [Ver original](https://theking-castle.myshopify.com/pages/about) | [http://localhost:3000/preview/plantilla/3/pages/about](http://localhost:3000/preview/plantilla/3/pages/about) | `/public/shopify/plantilla3/pages/about/body-clean.html` |
| **Inicio de Sesión / Login** | [Ver original](https://theking-castle.myshopify.com/account/login) | [http://localhost:3000/preview/plantilla/3/account/login](http://localhost:3000/preview/plantilla/3/account/login) | `/public/shopify/plantilla3/account/login/body-clean.html` |
| **Creación de Cuenta / Registro** | [Ver original](https://theking-castle.myshopify.com/account/register) | [http://localhost:3000/preview/plantilla/3/account/register](http://localhost:3000/preview/plantilla/3/account/register) | `/public/shopify/plantilla3/account/register/body-clean.html` |

---

## ⚙️ Características de la Clonación Premium Realizada

1. **Navegación SPA Dinámica**:
   - Al pulsar cualquier enlace dentro del preview local, Next.js intercepta la navegación en caliente y renderiza de forma instantánea la nueva página sin recargar la ventana del navegador.
2. **Inyección de Assets Dinámica**:
   - Cada subruta lee en paralelo su propio archivo `manifest.json` para inyectar estrictamente las hojas de estilo y scripts de animación que requiere esa sección específica, evitando colisiones de JS.
3. **Caché y Cache-Busting**:
   - Todos los estilos y scripts inyectados se cargan con `?v=TIMESTAMP` para evitar caché en el navegador del cliente al realizar ajustes.
4. **Resistencia de Entorno (Stubs Shopify)**:
   - Se inyecta un objeto `window.Shopify` mockeado globalmente y se interceptan llamadas de fetch problemáticas de Shopify analytics para evitar errores en consola y garantizar un scroll suave y animaciones funcionales de GSAP y Swiper.
