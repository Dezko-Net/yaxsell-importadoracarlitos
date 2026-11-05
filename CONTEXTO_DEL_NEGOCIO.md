# Contexto del Negocio — Yaxsel

## Qué es Yaxsel
Yaxsel es un **marketplace multi-vendor curado** construido sobre un motor e-commerce. No es un e-commerce normal de un solo vendedor. Es una plataforma donde múltiples tiendas aliadas venden sus productos dentro de una misma tienda pública.

## El modelo de negocio
- **Importadora Carlitos** es la tienda principal con mucho tráfico y clientes establecidos
- **Tiendas aliadas** (socios) se invitan a vender dentro de la plataforma
- Cada tienda vende productos **diferentes** (sin duplicar) para dar variedad
- Ejemplo: Importadora Carlitos vende productos chinos de hogar, otro socio vende ropa, otro zapatillas, otro herramientas
- Se cobra **10% de comisión** por cada pedido a las tiendas aliadas
- Un socio puede mover $50-60M CLP diarios en ventas

## Modelo de cobro (futuro)
- **Mantenimiento mensual por tienda:** $100K CLP ($100 USD aprox) — filtra tiendas serias
- **Comisión por ventas:** 3-5% (empezar con 10% mientras se consolida)
- El mantenimiento cubre los costos de infraestructura ($22/mes con 10 tiendas)
- La comisión es la ganancia real
- **El porcentaje y frecuencia de cobro se definen en reunión con socios** (pendiente)

### Proyección de ingresos
| Tiendas | Ventas/día | Comisión 5% | Mantenimiento | Total/mes |
|---|---|---|---|---|
| 1 (Importadora Carlitos) | $2M CLP | $100K/día | $100K | ~$4M CLP ($4,000 USD) |
| 3 tiendas | $6M CLP | $300K/día | $300K | ~$9M CLP ($9,000 USD) |
| 10 tiendas | $20M CLP | $1M/día | $1M | ~$30M CLP ($30,000 USD) |
| 20 tiendas | $40M CLP | $2M/día | $2M | ~$60M CLP ($60,000 USD) |

## El jugador grande (objetivo principal)
- Hay un socio potencial que vende **$50M-$100M CLP diarios** (sin web)
- Si se integra a Yaxsel, podría vender **20-30% más** por la web
- Con una sola tienda grande, la ganancia supera a 10 tiendas pequeñas
- **Con $100M CLP/día × 5% = $5M CLP/día = $150M CLP/mes ($150,000 USD/mes)**
- Este es el objetivo principal del proyecto: integrar a este socio

## Por qué Firebase y no Appwrite
- El tráfico será gigante — Appwrite no soportaría el volumen de lecturas
- Firebase tiene mejor escalabilidad y el free tier + créditos de Google cubren el costo
- Con $1,000-1,500 de crédito en Google, hay margen para crecer sin preocuparse por costos
- Los socios pueden aportar ~$1,000 USD mensual para servidores si la tienda genera bien

## Costos reales de infraestructura (calculados)
| Servicio | Costo/mes | Nota |
|---|---|---|
| Firebase Firestore | ~$2 | 4M reads/mes con caché |
| Firebase Storage | ~$1 | 1.25 GB con 20 tiendas |
| Vercel Pro | $20 | Hosting Next.js |
| Dominio | ~$1 | |
| **Total** | **~$24/mes** | 0.14% de las ganancias |

### Cálculo de reads de Firestore
- 10,000 visitas/día × 7 API calls × 10 docs = 700K reads/día
- Con caché (CDN + cliente): solo 20% llega a Firestore = 140K reads/día
- 140K × 30 días = 4.2M reads/mes = **$1.51/mes**

## Por qué Next.js y no React puro
- **Next.js ES React** + features extra (SSR, API routes, optimización de imágenes)
- **SEO crítico para e-commerce:** Google ve los productos renderizados, no una página vacía
- **Velocidad:** Next.js renderiza en el servidor, el usuario ve productos inmediatamente
- **El ERP original era React puro (Vite)** — pero para e-commerce, Next.js es la opción correcta
- **No fue un error elegir Next.js** — fue la decisión correcta

## Plan de escalabilidad de hosting
| Etapa | Hosting | Costo/mes | Cuándo |
|---|---|---|---|
| Ahora | Firebase + Vercel | $20 | Inicio |
| 6-12 meses | Firebase + VPS Hetzner + Cloudflare | $30 | Cuando Vercel cobre de más |
| 2-3 años | Si Firestore cuesta mucho → Supabase | $50 | Solo si reads > $500/mes |
| Nunca (antes de 2-3 años) | AWS | $100+ | Solo para empresas con DevOps |

**No tomar decisiones de arquitectura para un tráfico que no se tiene todavía.**

## Aislamiento de tiendas
- Cada tienda aliada ve **SOLO sus productos y pedidos**
- Los productos son públicos (los clientes ven todo el catálogo unificado)
- Pero los pedidos y gestión son privados por tienda

## Rotación de tiendas
- Se planean **15-20 tiendas máximo** activas simultáneamente
- Si una tienda sale, entra otra (rotación controlada)
- No se quiere saturar de productos duplicados la plataforma
- Modelo curado, no marketplace libre como MercadoLibre

## Diferencia con MercadoLibre
| | MercadoLibre | Yaxsel |
|---|---|---|
| Tiendas | Cualquiera puede subir | 15-20 curadas |
| Productos | Millones, duplicados | No se solapan entre tiendas |
| Imágenes | 15 por producto | 1-5 por producto |
| Calidad | Caótico | Curado, moderado |
| Tráfico | Millones de visitas | Tráfico compartido |
| Costos Firestore | Millones/día | Miles/día |

## Estado actual de los datos
- 266 productos en Firebase — todos de Importadora Carlitos (no hay otros socios aún)
- 6 categorías, 69 subcategorías
- 121 imágenes migradas desde una ruta histórica de Appwrite a Firebase Storage; confirmar qué imágenes corresponden a Importadora Carlitos antes de reutilizarlas.
- 177 imágenes ya estaban en Firebase Storage
- Colecciones creadas vacías: orders, addresses, sequences, favorites
- 34 colecciones Firestore creadas en total

## Optimizaciones aplicadas (junio 2026)
- **`unoptimized` eliminado** de 33 instancias de `<Image>` — Next.js ahora optimiza imágenes
- **Compresión automática al subir** — `sharp` comprime a WebP 1200px máximo antes de subir a Firebase Storage
- **Caché del navegador aumentado** — de 5-10 min a 10-30 min (ClientFetchCache)
- **Caché del CDN aumentado** — de 5 min a 1 hora (next.config.ts headers)
- **Caché del navegador en API routes** — `max-age=300` (antes era 0)
- **121 imágenes existentes comprimidas** — 4.93 MB ahorrados (50-94% por imagen)
- **Compresión en TODOS los endpoints de upload** — productos, chat, comprobantes, fotos de bultos

### Endpoints con compresión activada
- `products/upload-image` — imágenes de productos
- `chat/upload` — imágenes del chat
- `admin/orders/shipping-proof` — foto de envío
- `admin/orders/upload-box-photos` — fotos de bultos
- `catalogo/upload-proof` — comprobante de pago
- `vendor/public-upload-proof` — comprobante vendor
- `public-data/vendor-order/[id]/upload-proof` — comprobante público

### Impacto esperado en Vercel
| Métrica | Antes | Después (estimado) |
|---|---|---|
| Fast Data Transfer | 150 GB | ~15-25 GB |
| Edge Requests | 925K | ~300-400K |
| Function Invocations | 833K | ~200-300K |
| Fluid Active CPU | 4h 50m | ~1-2h |

## Arquitectura de productos (multi-vendor)
- **Una sola colección `products`** con campo `VENDOR_ID` para separar
- `VENDOR_ID` vacío = Importadora Carlitos (tienda principal)
- `VENDOR_ID = "vendor123"` = tienda aliada
- **Catálogo público:** todos los productos juntos (marketplace)
- **Admin del vendor:** solo ve sus productos (filtrado por `session.vendorId`)
- **Checkout:** separado por vendor (pago por tienda)
- **Pedidos:** colección separada `VENDOR_ORDERS_COLLECTION_ID`
- **Filtro por tienda:** `vendorId=__main__` para Importadora Carlitos, `vendorId=X` para aliada

## Los dos productos de Yaxsel

### Producto 1: Yaxsel Marketplace (este proyecto)
- **Multi-vendor curado** — 15-20 tiendas máximo
- **NO incluye ERP ni POS** — se van a quitar del proyecto
- **Solo catálogo web + pedidos + admin**
- **Base de datos:** Firebase Firestore
- **Hosting:** Vercel
- **Modelo:** comisión 5-10% + mantenimiento $100K CLP/mes
- **Objetivo:** integrar al jugador grande ($50-100M CLP/día)
- **Foco:** captar todo el tráfico y centrarlo en la tienda, admin maneja todo

### Producto 2: Yaxsel Personalizado (futuro)
- **Single-vendor** — una tienda por cliente
- **INCLUYE ERP + POS** — una sola base de datos unificada para todo
- **Incluye:** IA (extensión), Catálogo WhatsApp (extensión)
- **NO incluye lógica multi-vendor** — se quita del personalizado
- **Modelo:** venta $2-3M CLP + mensualidad $200K CLP + updates $100K CLP
- **Para clientes que quieren independizarse del marketplace**
- **Personalizado por cliente** — se moldea el código a su forma de vender
- **Base de datos:** Firebase (mismo stack que marketplace)

## Plan de separación de los dos productos

### Fase 1: Migrar TODO a Firebase (actual)
- Migrar el proyecto completo a Firebase (incluyendo ERP y POS)
- Dejar ERP y POS funcionando en Firebase temporalmente
- **NO quitar ERP ni POS todavía** — dejarlos integrados hasta que todo esté migrado

### Fase 2: Copiar el proyecto (una vez migrado todo)
- Copiar la carpeta del proyecto migrado a Firebase
- Una carpeta = Yaxsel Marketplace
- Otra carpeta = Yaxsel Personalizado

### Fase 3: Limpiar cada proyecto
- **Yaxsel Marketplace:** quitar ERP y POS (no sirven para multitienda)
- **Yaxsel Personalizado:** quitar lógica multi-vendor (no sirve para single-vendor)
- **Ambos conservan:** IA, Catálogo WhatsApp (funcionan perfecto en ambos)

## Extensiones vendibles (en ambos productos)
- **IA** — asistente que toma pedidos (API compartida, cobro por extensión)
- **Catálogo WhatsApp** — catálogo para WhatsApp (extensión separada)
- **ERP + POS** — SOLO para Yaxsel Personalizado, NO para marketplace

## Por qué Firebase y no Appwrite (decisión final)

### Appwrite Cloud cambió (ya no conviene)
- **Cobra por reads/writes** desde abril 2025 ($0.06-$0.10 por 100K)
- **Pausa proyectos inactivos** tras 1 semana (desde septiembre 2025)
- **Pro subió de $15 a $25/mes** (desde septiembre 2025)
- **Free tier más pequeño** que Firebase (500K reads vs 1.5M reads/mes)
- **Límite de 2 proyectos** en free tier

### Firebase es mejor para ambos productos
- **Free tier 3x más grande** (1.5M reads/mes vs 500K)
- **No pausa proyectos inactivos**
- **Pay-as-you-go** — cliente pequeño paga $0, no $25/mes
- **Un solo stack** para marketplace y personalizado
- **Ya está 80% migrado**
- **Reads 40% más baratos** que Appwrite Cloud ($0.036 vs $0.06 por 100K)

### Appwrite self-hosted (descartado)
- Requiere alquilar VPS para cada cliente ($10-20/mes)
- Mantenimiento del servidor (updates, backups, seguridad)
- No es viable si no se quiere alquilar VPS para clientes
- El cliente no quiere gestionar servidores

## Moderación (futuro)
- Habrá un sistema de aprobación de productos antes de publicarse
- Alguien revisará que los productos y precios que sube cada tienda sean correctos
- Esto es para más adelante, no es prioridad ahora

## Prioridad actual
**Hacer que Yaxsel funcione en Firebase exactamente igual a como funciona en Appwrite.**
- No agregar features nuevas
- No cambiar la lógica
- Solo migrar y que todo funcione tal cual
- Una vez que funcione igual, recién ahí se mejora y se agregan cosas nuevas

## Persona
- Jean Paul (JAN) — desarrollador y dueño del proyecto
- yanpolreyes666@gmail.com
- Ya construyó un motor e-commerce en Appwrite
- Se pasa a Firebase para expandir y escalar

## Moneda
- **Pesos chilenos (CLP)** — todas las cifras en el contexto son CLP
- NO son pesos colombianos (COP)

## Dominio
- **No comprado aún** — pendiente
- Nombre base del código: **Yaxsel** (con dos L)
- Posible nombre comercial: **MercadoMeiggs** (en discusión)
- Pendiente de definir el dominio final

## Pagos (clientes en la tienda)
- **Solo transferencia bancaria** — no hay pasarela de pago por ahora
- Cada tienda muestra sus datos de transferencia al cliente
- El cliente transfiere y sube el comprobante de pago
- **No se integra Wompi/PayU/Stripe por ahora** — se necesita un experto en seguridad para eso
- En el futuro, si los socios quieren pasarela, se contrata un especialista

## Pagos (comisión a Yaxsel)
- **Transferencia manual** — el vendor transfiere la comisión a JAN
- Frecuencia: **semanal o quincenal** (por definir en reunión con socios)
- Porcentaje: **5-10%** (por definir en reunión con socios)
- No hay sistema automático de cobro de comisión — se maneja fuera del sistema

## Catálogo WhatsApp
- **Se queda en AMBOS productos** (Marketplace y Personalizado)
- Es una feature esencial
- **Posible extensión de pago** — se puede bloquear y cobrar como add-on
- Si el cliente quiere WhatsApp, paga extra por esa extensión
- Igual que la IA (cobro por extensión)

## IA (asistente de pedidos)
- **Se queda en AMBOS productos** (Marketplace y Personalizado)
- JAN comparte su propia API key de IA
- **Cobro por extensión** — el cliente paga extra para usar IA
- No es gratis, es un add-on vendible
- **Proveedor:** Google Gemini
- **Firebase project de IA:** `geminai-449212` (proyecto separado del marketplace)

## Despacho de pedidos
- **Retiro en tienda** — el cliente va a buscar el producto
- **Agencias externas** — Starken, Chilexpress, BlueExpress, etc.
- **Cada tienda selecciona qué agencias usa** — no todas le salen al cliente
- La tienda elige sus agencias disponibles al configurar su cuenta
- El cliente solo ve las agencias que la tienda tiene habilitadas

## ERP Asistora / Gemini
- **El ERP original** se llama "Gemini" y está hecho con **Vite** (B-U-V-I-T-E)
- Está deployado en otra carpeta (no se pudo migrar a Next aún)
- **Importadora Carlitos NO usa el ERP actualmente** como multitienda
- El ERP/POS solo se usará en **Yaxsel Personalizado** (single-vendor)
- **Plan:** migrar Vite a Next.js para el personalizado (futuro)

## Urgencia
- **URGENTE** — 1-2 semanas para tener Yaxsel Marketplace en producción
- Hay reunión con socios pendiente
- El jugador grande ($50-100M CLP/día) está esperando
- La base ya está creada, solo falta terminar la migración

## App móvil (futuro)
- JAN está construyendo una app móvil para Yaxsel
- Se vinculará a la **misma base de datos de Firebase**
- Una vez terminada la migración web, se conecta la app
- JAN sabe crear apps móviles

## Meta de la migración
- **Dejar el proyecto tal cual está en Importadora Carlitos (Appwrite)**
- Todo debe funcionar igual que en Appwrite
- ERP y POS se dejan funcionales temporalmente
- Una vez migrado todo, se separa en dos carpetas (Marketplace y Personalizado)
