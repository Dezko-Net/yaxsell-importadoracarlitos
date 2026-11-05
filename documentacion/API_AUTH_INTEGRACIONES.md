# API, autenticación e integraciones

## API por dominio

En el corte del 22-10-2026 se encontraron 156 archivos `route.ts` bajo `src/app/api/`. Las familias principales son:

| Prefijo | Función |
|---|---|
| `/api/public-data/*` | Lecturas públicas de catálogo, home, productos, vendedores, pedidos y estado. Algunas rutas usan caché compartida; otras son dinámicas. |
| `/api/catalogo/*`, `/api/checkout/*` | Checkout, comprobantes, stock, reservas, cancelaciones y datos de pedido. |
| `/api/admin/*`, `/api/admin-supreme/*` | Operación de tienda, productos, pedidos, usuarios, IA, vendors y configuración. Revisar autorización en cada handler. |
| `/api/pos/*`, `/api/pos-admin/*`, `/api/erp/*` | Caja, inventario, personal, márgenes, gastos y movimientos. |
| `/api/vendor/*`, `/api/admin/vendors/*` | Sesión y operación multi-vendor. |
| `/api/cron/*` | Expiración de pedidos, negociación y análisis de velocidad/riesgo. |
| `/api/whatsapp/*`, `/api/webhooks/*` | Webhook y notificaciones vinculados a WhatsApp/Firebase. |
| `/api/gemini`, `/api/ai-*`, `/api/vision-*`, `/api/generate-image` | Funciones de IA o visión, sujetas a flags o configuración. |
| `/api/firebase-proxy*` | Capa de compatibilidad que mantiene nombres y consultas heredados de Appwrite. |

El mapa de ruta se obtiene con `Get-ChildItem src/app/api -Recurse -Filter route.ts`. Los endpoints cambian con frecuencia; no uses el conteo como contrato.

## Autenticación y límites

- Login de usuario: `src/services/authService.ts`, `src/hooks/useAuth.ts`, Firebase Auth.
- Admin/ERP: existen helpers `src/lib/admin-access.ts`, `src/lib/admin-api-auth.ts` y verificaciones de Firebase ID token en algunas APIs. Los mecanismos varían por ruta.
- Vendor: cookie `vendor_session`, HMAC y hash de contraseña scrypt en `src/lib/vendor-auth.ts`.
- Cron: revisar el handler concreto y `CRON_SECRET`; la programación en `vercel.json` no prueba que la petición tenga protección correcta.
- Webhooks: validar la firma/token en cada handler. La ruta de webhook Firebase existe en `src/app/api/webhooks/firebase-webhooks/orders/route.ts`.

La autenticación del layout o que un botón esté oculto no protege un endpoint. Para modificar una API administrativa, seguir la identidad desde el request hasta la escritura, verificar acceso al documento por tenant y limitar la respuesta.

## Feature flags actuales

Declarados en `src/lib/feature-flags.ts` al momento de la revisión:

| Feature | Valor en código |
|---|---:|
| `AI_ENABLED` | `false` |
| `WHATSAPP_BOT_ENABLED` | `true` |
| `WHATSAPP_CUSTOMER_AI_ENABLED` | `false` |
| `AI_SIDEKICK_ENABLED` | `false` |
| `AI_CATEGORIZE_ENABLED` | `false` |
| `AI_IMAGE_GEN_ENABLED` | `false` |
| `CHATBOT_ENABLED` | `false` |
| `SMART_NOTIFICATIONS_ENABLED` | `false` |
| `AUTO_NEGOTIATION_ENABLED` | `false` |
| `STOCK_CRITICAL_ALERTS_ENABLED` | `false` |

Los flags son constantes compiladas, no un sistema general de planes/licencias. Antes de activarlos, verifica que tanto UI como API estén gateadas y que las credenciales existan solo en servidor.

## Integraciones

- **Firebase:** Firestore, Authentication y Storage mediante SDK cliente y Admin.
- **WhatsApp/Meta:** `/api/whatsapp/webhook`, envío admin y notificaciones; configuración por tokens/IDs de entorno. El bot determinista está habilitado según el flag; la IA a clientes está deshabilitada.
- **Gemini/Vertex AI:** rutas de IA y `src/lib/gemini-models.ts`; la documentación `GEMINI_CONFIG.md` es guía de credenciales, no debe contener valores secretos. No se realizaron llamadas externas.
- **Vercel Cron:** `/api/cron/expire-orders` cada cinco minutos y `/api/cron/risk-velocity` al mediodía UTC según `vercel.json`.
- **Appwrite legado:** quedan proxies con nombre Firebase pero tags/logs `appwrite`, rutas de sincronización, configuración UI y variables `APPWRITE_*`. Una operación de sync puede escribir fuera de Firebase. No ejecutarla sin identificar credenciales, destino y uso actual.

## Caché / invalidación

Usa el endpoint/función del dominio para invalidar tags (`revalidateTag`) cuando cambie contenido. Algunas rutas usan `unstable_cache`, caché local en memoria, persistencia en navegador y headers HTTP al mismo tiempo. Si una actualización “no aparece”, identifica primero cuál capa sirve el dato y su tag/TTL; no purgues datos ni `.next` como primer reflejo en producción.
