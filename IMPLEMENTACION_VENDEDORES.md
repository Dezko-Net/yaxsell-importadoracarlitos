# Implementación del Marketplace Multi-Vendedor

Documento técnico de la funcionalidad que permite a terceros (vendedores externos)
vender productos en YAXSEL, gestionar su propio inventario y pedidos, y recibir
pagos por transferencia directa, mientras el dueño de la plataforma (Importadora Carlitos) retiene una comisión acordada fuera del sistema.

> Estado: **Fase 1 — MVP operativo**. Verificado end-to-end (login, aislamiento
> de datos, creación de productos, listado filtrado, checkout mixto, limpieza).

---

## 1. Arquitectura general

### Decisión clave: separación por `VENDOR_ID`, no por colecciones por-vendor

En lugar de crear una colección Appwrite por cada vendedor (`juanita_products`,
`juanita_orders`, ...), se reutilizan las colecciones existentes añadiendo un
atributo `VENDOR_ID`:

- `products.VENDOR_ID` → si está vacío/ausente, el producto es **propio** de la
  plataforma. Si tiene un valor, pertenece a ese vendor.
- `orders` → sigue siendo **exclusivo** de la plataforma (productos propios).
- `vendor_orders` → **nueva** colección, solo para sub-pedidos de vendors.
- `vendors` → **nueva** colección, registro maestro de vendedores.

Esto escala a N vendors sin tocar el esquema cada vez.

### Decisión de seguridad: sesión firmada server-side

Las colecciones `products` y `orders` tienen permisos públicos
(`read/create/update/delete("any")`) en Appwrite porque el catálogo público los
necesita. Esto es tolerable mientras solo el dueño opera el admin, pero
**inaceptable para terceros**: cualquier vendor curioso con el `project ID`
(público en el bundle del navegador) podría leer/escribir TODO desde la consola.

Solución adoptada:

- `vendors` y `vendor_orders` **NO** tienen permisos públicos. Solo la API key
  server-side puede tocarlas.
- Los vendors **nunca** reciben una sesión de Appwrite. Se autentican con una
  cookie HMAC firmada por el servidor (`VENDOR_SESSION_SECRET`).
- Todas las operaciones pasan por rutas API server-side que:
  1. Verifican la cookie firmada.
  2. Fuerzan el filtro `Query.equal('VENDOR_ID', session.vendorId)`.
  3. Nunca confían en un `vendorId` enviado desde el cliente.

Ver `src/lib/vendor-auth.ts` para el detalle de la firma, verificación en tiempo
constante (anti timing-attack) y hashing de contraseñas con `scrypt`.

---

## 2. Cambios en el esquema Appwrite

### Colección `vendors` (nueva)

| Atributo | Tipo | Notas |
|---|---|---|
| `NAME` | string | Obligatorio |
| `EMAIL` | string | Único, normalizado a minúsculas |
| `AUTH_USER_ID` | string | Reservado (no usado en Fase 1) |
| `ACTIVE` | boolean | `true` por defecto; login bloqueado si `false` |
| `MIN_PURCHASE_AMOUNT` | integer | Monto mínimo de compra (CLP) |
| `BANK_ACCOUNT_HOLDER` | string | Titular de la cuenta para transferencias |
| `BANK_RUT` | string | RUT del titular |
| `BANK_NAME` | string | Banco |
| `BANK_ACCOUNT_TYPE` | string | Cuenta corriente / vista / ahorro |
| `BANK_ACCOUNT_NUMBER` | string | N° de cuenta |
| `BANK_EMAIL` | string | Email del vendor (para comprobante bancario) |
| `COMMISSION_NOTES` | string | Notas de comisión acordada (texto libre) |
| `PASSWORD_HASH` | string | `scrypt` en formato `salt:hash` (hex) |
| `CREATEDAT` | integer | epoch ms |
| `UPDATEDAT` | integer | epoch ms |

**Permisos**: sin `any`. Solo API key server-side.

### Colección `vendor_orders` (nueva)

| Atributo | Tipo | Notas |
|---|---|---|
| `VENDOR_ID` | string | FK al `$id` del vendor |
| `ORDERCODE` | string | `VOR-00001`, `VOR-00002`, ... |
| `ORDERINDEX` | integer | Secuencia desde `sequences.vendor_order_sequence` |
| `USERID` | string | ID del cliente Appwrite o `'guest'` |
| `ITEMS` | string | JSON serializado de los items |
| `CUSTOMERNAME` | string | |
| `CUSTOMERRUT` | string | |
| `CUSTOMERPHONE` | string | |
| `CUSTOMEREMAIL` | string | |
| `REGION` | string | |
| `COMUNA` | string | |
| `ADDRESS` | string | |
| `ADDITIONALINFO` | string | |
| `PAYMENTMETHOD` | string | Siempre `'Transferencia Bancaria'` (Fase 1) |
| `SHIPPINGAGENCY` | string | |
| `SUBTOTAL` | integer | Suma de items del vendor |
| `TOTAL` | integer | = SUBTOTAL (sin envío en Fase 1) |
| `STATUS` | string | `pending` → `payment_review` → `paid` → `preparing` → `shipped` → `delivered` / `cancelled` |
| `PAYMENTPROOFURL` | string | URL del comprobante subido por el cliente |
| `ADMINNOTES` | string | Notas internas del vendor |
| `PARENTORDERID` | string | `$id` del pedido propio si el carrito era mixto |
| `CREATEDAT` | integer | epoch ms |
| `UPDATEDAT` | integer | epoch ms |

**Permisos**: sin `any`. Solo API key server-side.

### Colección `products` (modificada)

- Atributo nuevo: `VENDOR_ID` (string, opcional).
  - Vacío/ausente → producto de la plataforma.
  - Con valor → producto del vendor indicado.

### Colección `sequences` (existente)

- Se usa el documento `vendor_order_sequence` (entero incremental) para
  generar los `ORDERCODE` de `vendor_orders`.

### Variables de entorno

En `.env.local`:

```
VENDOR_SESSION_SECRET=<cadena aleatoria larga>
```

Usada para firmar/verificar la cookie de sesión de vendor. Si no está definida,
cae a `APPWRITE_API_KEY` como fallback (no recomendado en producción).

---

## 3. Rutas API

### Autenticación de vendedor (`/api/vendor/*`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/vendor/login` | Valida email+password contra `vendors.PASSWORD_HASH`, setea cookie `vendor_session` firmada (httpOnly, 30 días). |
| `POST` | `/api/vendor/logout` | Borra la cookie. |
| `GET` | `/api/vendor/me` | Devuelve `{ vendorId, name, email, minPurchaseAmount }` del vendor autenticado. 401 si no hay sesión. |

### Gestión de productos del vendor

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/vendor/products` | Lista los productos del vendor (filtrado server-side por `VENDOR_ID`). Paginado con cursor, 50 por página. |
| `POST` | `/api/vendor/products` | Crea un producto **forzando** `VENDOR_ID = session.vendorId`. Campos: `name, description, price, stock, category, imageUrl, imageUrl2, imageUrl3`. |
| `PATCH` | `/api/vendor/products/[id]` | Actualiza un producto **solo si** `product.VENDOR_ID === session.vendorId` (verificación `assertOwnership`). |
| `DELETE` | `/api/vendor/products/[id]` | Elimina un producto **solo si** pertenece al vendor. |

### Gestión de pedidos del vendor

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/vendor/orders` | Lista los pedidos del vendor. Filtro opcional `?status=`. Paginado con cursor. |
| `GET` | `/api/vendor/orders/[id]` | Detalle de un pedido **solo si** pertenece al vendor. |
| `PATCH` | `/api/vendor/orders/[id]` | Cambia `status` y/o `adminNotes`. Estados válidos: `pending, payment_review, paid, preparing, shipped, delivered, cancelled`. |

### Administración de vendors (solo admin de la plataforma)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/vendors` | Lista vendors con métricas agregadas: `totalSold` (suma de `TOTAL` de pedidos en estados `paid/preparing/shipped/delivered`), `orderCount`, `productCount`. **No** expone `PASSWORD_HASH`. |
| `POST` | `/api/admin/vendors` | Crea un vendor. Genera contraseña legible (`generateVendorPassword`) y la devuelve **una sola vez** en `credentials.password`. Hashea con `scrypt` antes de guardar. |
| `PATCH` | `/api/admin/vendors/[id]` | Actualiza datos del vendor: `active`, `minPurchaseAmount`, datos bancarios, y `resetPassword: true` para generar nueva contraseña (devuelta en `newPassword`). |
| `DELETE` | `/api/admin/vendors/[id]` | Elimina un vendor. |

### Checkout y pedidos públicos

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/checkout/vendor-order` | Crea un sub-pedido en `vendor_orders`. Llamado por el checkout del cliente (no por el vendor). Genera `ORDERCODE` con secuencia propia. Valida que el vendor exista y esté activo. |
| `GET` | `/api/public-data/vendor-order/[id]` | Endpoint público (sin auth) para que el cliente vea su pedido del vendor + datos bancarios. **No** expone `PASSWORD_HASH` ni otros vendors. |
| `POST` | `/api/public-data/vendor-order/[id]/upload-proof` | El cliente sube su comprobante de transferencia. Si el pedido estaba `pending`, pasa a `payment_review`. Máx 10MB. |

---

## 4. Flujo de checkout con carrito mixto

Implementado en `src/app/checkout/page.tsx`, función `createOrder()`:

1. **Separar items por origen**:
   - `ownItems` = items sin `VENDOR_ID` (productos de la plataforma).
   - `vendorItemsByVendor` = `Map<vendorId, items[]>` agrupando por vendor.

2. **Pedido propio** (si hay `ownItems`):
   - Se crea en `orders` con el flujo existente (código `ORD-XXXXX`,
     estados `processing`/`paid`, modo noche, descuento de stock, etc.).

3. **Sub-pedidos por vendor** (uno por cada vendor del carrito):
   - Para cada entrada del map, se llama a `POST /api/checkout/vendor-order`
     con los items de ese vendor, los datos del cliente, y `parentOrderId`
     apuntando al pedido propio (si existe).
   - Cada sub-pedido queda en `vendor_orders` con su propio `ORDERCODE`
     (`VOR-XXXXX`) y los datos bancarios del vendor correspondiente.
   - **El costo de envío queda en el pedido propio**; los sub-pedidos no
     llevan envío (Fase 1).

4. **Redirección a confirmación**:
   - Se navega a `/pedido-vendor-confirmado?id=<orderId>&vendorOrders=<ids>`
     donde `orderId` es el pedido propio (o el primer sub-pedido si el
     carrito era 100% de vendors) y `vendorOrders` es la lista de IDs de
     sub-pedidos separados por coma.

5. **Página de confirmación** (`/pedido-vendor-confirmado`):
   - Renderiza un bloque por cada ID (`OrderBlock`).
   - Cada bloque muestra: código, items, total, datos bancarios del vendor
     (con botones de copiar), y un uploader de comprobante.
   - Cuando el cliente sube el comprobante, el pedido pasa a
     `payment_review` y el vendor lo verá en su panel.

---

## 5. Panel del vendedor (`/vendor/*`)

Estructura de rutas Next.js:

```
src/app/vendor/
├── layout.tsx          # Auth guard + header + nav
├── page.tsx            # redirect → /vendor/products
├── login/
│   └── page.tsx        # Formulario de login
├── products/
│   └── page.tsx        # CRUD de productos del vendor
└── orders/
    └── page.tsx        # Lista + detalle + cambio de estado
```

### `layout.tsx` — Auth guard

- Si la ruta es `/vendor/login`, renderiza children directo.
- Para cualquier otra ruta, hace `GET /api/vendor/me`:
  - Si OK → setea `vendor` en `VendorContext` y renderiza el shell (header
    con nombre del vendor, nav con Productos/Pedidos, botón Salir).
  - Si 401 → `router.replace('/vendor/login')`.
- El contexto `VendorContext` (en `src/hooks/useVendor.ts`) expone
  `{ vendorId, name, email, minPurchaseAmount }` a las páginas hijas.

### `login/page.tsx`

- Formulario email + password (con toggle de visibilidad).
- `POST /api/vendor/login` → si OK, `router.replace('/vendor/products')`.
- Mismo mensaje de error para email inexistente y password incorrecta (no
  filtra qué emails existen).

### `products/page.tsx`

- Lista los productos del vendor en tarjetas (imagen, nombre, precio, stock).
- Botón "Nuevo producto" → modal con: nombre, descripción, precio, stock,
  categoría, URL de imagen.
- Botones por producto: editar (mismo modal precargado) y eliminar (con
  confirmación).
- Todas las operaciones van a `/api/vendor/products` que filtra por
  `VENDOR_ID` server-side.

### `orders/page.tsx`

- Lista los pedidos del vendor en tarjetas colapsables.
- Filtro por estado (select).
- Al expandir: datos del cliente, dirección, items, link al comprobante de
  pago si existe, y un select para cambiar el estado.
- Estados con etiquetas y colores en español.

---

## 6. Panel de administración de vendors (`/admin/(panel)/vendors`)

`src/app/admin/(panel)/vendors/page.tsx`:

- Tabla de vendors con: nombre, email, # productos, # pedidos, total
  vendido, estado (Activo/Desactivado).
- Botón "Nuevo vendedor" → modal con: nombre, email, monto mínimo de
  compra, y datos bancarios (titular, RUT, banco, tipo, número, email).
- Al crear, muestra un modal con las credenciales generadas (email +
  password) y un botón "Copiar" que arma el texto:
  ```
  Email: ...
  Contraseña: ...
  Ingresa en: https://tudominio/vendor/login
  ```
  **La contraseña se muestra una sola vez**. Si se pierde, hay que
  regenerarla con el botón de llave en la tabla.
- Por vendor en la tabla:
  - Botón llave → regenerar contraseña (con confirmación).
  - Botón power → activar/desactivar.

---

## 7. Archivos clave

| Archivo | Rol |
|---|---|
| `src/lib/vendor-auth.ts` | Firma/verificación de sesión HMAC, hashing de passwords con `scrypt`, generación de passwords legibles. |
| `src/lib/appwrite-admin.ts` | Constantes `VENDORS_COLLECTION_ID`, `VENDOR_ORDERS_COLLECTION_ID`. |
| `src/hooks/useVendor.ts` | Contexto React con la info del vendor autenticado. |
| `src/app/api/vendor/login/route.ts` | Login. |
| `src/app/api/vendor/logout/route.ts` | Logout. |
| `src/app/api/vendor/me/route.ts` | Quién soy. |
| `src/app/api/vendor/products/route.ts` | Listar + crear productos. |
| `src/app/api/vendor/products/[id]/route.ts` | Editar + eliminar productos. |
| `src/app/api/vendor/orders/route.ts` | Listar pedidos. |
| `src/app/api/vendor/orders/[id]/route.ts` | Ver + cambiar estado de pedidos. |
| `src/app/api/admin/vendors/route.ts` | Listar + crear vendors (admin). |
| `src/app/api/admin/vendors/[id]/route.ts` | Editar + eliminar vendors (admin). |
| `src/app/api/checkout/vendor-order/route.ts` | Crear sub-pedidos en checkout. |
| `src/app/api/public-data/vendor-order/[id]/route.ts` | Pedido público del cliente. |
| `src/app/api/public-data/vendor-order/[id]/upload-proof/route.ts` | Subir comprobante. |
| `src/app/checkout/page.tsx` | Lógica de split del carrito mixto. |
| `src/app/pedido-vendor-confirmado/page.tsx` | Página de confirmación con bloques por vendor. |
| `src/app/vendor/layout.tsx` | Auth guard + shell del panel vendor. |
| `src/app/vendor/login/page.tsx` | Login del vendor. |
| `src/app/vendor/products/page.tsx` | CRUD de productos del vendor. |
| `src/app/vendor/orders/page.tsx` | Lista + detalle de pedidos del vendor. |
| `src/app/admin/(panel)/vendors/page.tsx` | Gestión de vendors (admin). |

---

## 8. Cómo crear un vendedor (paso a paso)

### Requisitos previos

- El servidor de desarrollo (o producción) corriendo.
- Sesión de admin iniciada en `/admin`.

### Pasos

1. **Abrir el panel de vendors**:
   - Navega a `https://tudominio/admin/vendors` (o `http://localhost:3901/admin/vendors` en dev).

2. **Click en "Nuevo vendedor"** (botón azul arriba a la derecha).

3. **Completar el formulario**:
   - **Nombre** (obligatorio): p. ej. `Juanita`.
   - **Email de acceso** (obligatorio): p. ej. `juanita@gmail.com`. Debe ser
     único; si ya existe, te avisará.
   - **Monto mínimo de compra** (opcional): en CLP, 0 si no hay mínimo.
   - **Datos bancarios** (recomendado para que el cliente pueda transferirle):
     - Titular de la cuenta
     - RUT
     - Banco
     - Tipo de cuenta (corriente/vista/ahorro)
     - N° de cuenta
     - Email (para comprobante bancario, si el banco lo requiere)

4. **Click en "Guardar"**.

5. **Anotar las credenciales**:
   - Aparece un modal con el email y una **contraseña generada automáticamente**
     (formato `XXXXXX-XXXXXX`, p. ej. `A1B2C3-D4E5F6`).
   - Click en "Copiar" para tener el texto listo para pegar:
     ```
     Email: juanita@gmail.com
     Contraseña: A1B2C3-D4E5F6
     Ingresa en: https://tudominio/vendor/login
     ```
   - **Esta contraseña solo se muestra una vez**. Si no la copias y la pierdes,
     tendrás que regenerarla (botón de llave en la tabla de vendors).

6. **Entregar las credenciales al vendedor** por un canal seguro (WhatsApp,
   SMS, en persona). El vendedor entra a `/vendor/login` y las usa.

7. **El vendedor empieza a usar su panel**:
   - Ve dos pestañas: **Productos** y **Pedidos**.
   - Crea sus productos desde "Nuevo producto".
   - Cuando un cliente compre sus productos, los pedidos aparecerán en su
     pestaña "Pedidos".

### Operaciones posteriores sobre un vendor

Desde la misma tabla de `/admin/vendors`:

- **Activar/Desactivar** (botón power): un vendor desactivado no puede
  iniciar sesión. Sus productos siguen visibles en el catálogo público
  hasta que se eliminen o se oculten por otra vía.
- **Regenerar contraseña** (botón llave): genera una nueva, la anterior
  deja de funcionar. La nueva se muestra una sola vez.
- **Eliminar** (no expuesto en la UI de Fase 1, pero la ruta
  `DELETE /api/admin/vendors/[id]` existe): borra el registro del vendor.
  Sus productos y pedidos quedan huérfanos (con `VENDOR_ID` apuntando a un
  vendor inexistente) — usar con cuidado.

---

## 9. Pendiente (Fase 2)

- **Badge "Vendido por X"** en el catálogo público (cosmético, requiere
  tocar las plantillas de producto).
- **Carrito con tarjetas por vendedor** y pago independiente por tarjeta,
  con bloqueo si el monto no alcanza el mínimo del vendor.
- **Catálogo WhatsApp** con la misma lógica de separación por vendor.
- **Reporte de comisiones** automático (hoy `COMMISSION_NOTES` es texto
  libre; no hay cálculo automático de comisión a retener).
- **Edición de datos bancarios desde el admin** (la ruta PATCH ya lo
  soporta, pero la UI de Fase 1 solo expone activar/desactivar/reset
  password).
- **Stock decrement para productos de vendor** en el checkout (hoy el
  descuento de stock server-side cubre el pedido propio; los productos de
  vendor se descuentan solo si se implementa en `vendor-order` route).
