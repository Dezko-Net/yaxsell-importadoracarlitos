# 🤖 Kenia IA - Documentación de Lógica y Arquitectura Hardcore

Este documento recopila de manera detallada toda la lógica, flujos de trabajo y configuraciones avanzadas implementadas para Kenia, la IA asistente de WhatsApp de Kevin&Coco.

---

## 1. 🧠 Personalidad y Prompt Core (`kenia-runtime.ts`)
Kenia está diseñada para sonar como la "mejor amiga virtual". No es un robot corporativo aburrido.

- **Tono**: Atrevido, fresco, divertido y con mucha picardía.
- **Vocabulario**: Utiliza palabras femeninas y de cariño recurrentemente (`amor`, `bella`, `cariño`, `hermosa`, `reina`).
- **Formato**: Respuestas cortas, directas y llenas de emojis (`💅💋✨`). NUNCA testamentos largos.
- **Reglas Estrictas**:
  - No inventa URLs, ni precios, ni stock. Solo se basa en el contexto inyectado.
  - El mensaje de bienvenida es simple, con un dato curioso (opcional y sin sobrecarga), usando diminutivos del nombre, e instruye claramente al usuario: *"Si necesitas más información dale al botón de abajo, sino pregúntame lo que quieras."*

---

## 2. 👁️ Visión por Computadora (Manejo de Imágenes)
Kenia es capaz de "ver" y analizar imágenes enviadas por WhatsApp mediante Gemini Vision. Esto está manejado desde el webhook (`route.ts`).

- **Flujo de Descarga**: El webhook detecta `msgType === 'image'`, extrae el ID de WhatsApp Graph API, obtiene la URL y descarga el Buffer usando el `WA_TOKEN`.
- **Inyección a Gemini**: La imagen se convierte a Base64 y se añade al array `inlineDataParts` de los mensajes del cliente con el formato requerido por Gemini (`image/jpeg`).
- **🛡️ Sistema Anti-Abuso de Costos (Límite Diario)**:
  - Se modificó `KeniaUsage` para rastrear las fotos enviadas por día (`imagesSentToday`, `lastImageSentAt`).
  - **Límite**: **5 fotos máximo al día** por cliente.
  - **Acción al exceder**: Si manda una 6ta foto, el bot se pausa (`blocked: true`), le envía un mensaje amable a la clienta indicando que será atendida por un asesor humano y envía una alerta por WhatsApp directamente a los administradores del sistema.

---

## 3. 📉 Optimización Extrema del Contexto (Ahorro de Tokens)
Para evitar saturar la ventana de contexto de Gemini y ahorrar costos sin perder calidad de venta:

- **Se eliminó el listado aleatorio**: Ya no se inyectan 50 productos al azar.
- **Inyección de Categorías**: Por defecto, se extraen las categorías desde `CATEGORIES_COLLECTION_ID` y se le informan a Kenia. Ella responderá dirigiendo a la web: `https://kevincocochile.cl/productos?categoria=[CATEGORIA]`.
- **Inyección Activa de Productos**: Si la clienta usa palabras clave descriptivas, el webhook intercepta esas palabras ANTES de enviarlas a Gemini, hace una pequeña búsqueda en Appwrite (por `NAME` o `TAGS`) y carga *solo* esos productos específicos al prompt para que Kenia le diga sus precios.

---

## 4. 📦 Lógica Ricolina de Seguimiento de Pedidos ("Mi Cuenta")
La información del pedido se inyecta dinámicamente con alta precisión, dotando a Kenia de la capacidad de responder a casi cualquier consulta sobre despachos de manera resolutiva y autónoma.

En `customerOrdersText` se inyecta:
- ID del Pedido y Estado
- Agencia (`SHIPPINGAGENCY`)
- Número de Rastreo (`TRACKINGNUMBER`)
- URL del Voucher/Foto de Envío (`SHIPPINGPROOFURL`)

### Decisiones de Kenia respecto al Rastreo:
1. **Múltiples Pedidos**: Si hay varios pedidos activos, le preguntará de forma coqueta cuál quiere revisar.
2. **Si la agencia es BLUEXPRESS**:
   - Genera automáticamente el link oficial: `https://www.blue.cl/enviar/seguimiento?n_seguimiento=[TRACKINGNUMBER]` y se lo entrega.
3. **Si es OTRA agencia (Starken, Varmontt, etc.)**:
   - Envia directamente la foto del comprobante: *"Aquí tienes la fotito de tu comprobante bella: [SHIPPINGPROOFURL]"*.
4. **🚨 ALERTA CRÍTICA (Falta de información)**:
   - Si el sistema indica un estado avanzado (Ej. Enviado, Etiqueta lista) pero el sistema detecta que falta el `TRACKINGNUMBER` o el `SHIPPINGPROOFURL`.
   - Kenia simulará investigar: *"mmm qué extraño bella, no logro encontrarlo, déjame preguntar a la persona del transporte..."*
   - Acto seguido, disparará silenciosamente un comando al webhook para enviarle un WhatsApp directo al Admin informando el error de despacho.

---

## 5. ⚡ Sistema de Acciones y Webhooks Ocultos (`[ACTION:...]`)
Kenia utiliza una serie de "comandos secretos" formateados que el Webhook intercepta, ejecuta y recorta antes de enviarle la respuesta final a la clienta.

1. **`[ACTION:SEARCH_SKU]CÓDIGO[/ACTION]`**:
   - **Motivo**: Kenia ve un código (como `L205`, `K201` ya sea en texto o leyendo la foto de una caja).
   - **Ejecución**: El webhook busca directamente en la base de datos `PRODUCTS_COLLECTION_ID` por SKU o NAME. Si lo encuentra, anexa mágicamente a la respuesta de Kenia: *"¡Aquí tienes el producto que buscas amor! ✨ [NOMBRE] 🔗 [LINK]"*.
2. **`[ACTION:ASK_ADMIN]resumen de la duda[/ACTION]`**:
   - **Motivo**: A la clienta se le ocurrió preguntar algo que no está en el contexto o falta información crítica (como el punto 4).
   - **Ejecución**: Se manda un WhatsApp al Administrador Principal diciendo: `🚨 KENIA NECESITA AYUDA. ¡Amor! El cliente [Nombre] me preguntó esto y no sé qué decirle: "[Resumen]"`.
3. **`[ACTION:UPDATE_ORDER]` / `[ACTION:MARK_MISSING]` / `[ACTION:NOTIFY_NEGOTIATION]`**:
   - Comandos internos reservados EXCLUSIVAMENTE para cuando el usuario Admin interactúa con el Bot en su panel o desde WhatsApp para gestionar órdenes directamente con la base de datos (Appwrite).

---
*Hecho por Antigravity (IA) para Kevin&Coco - 2026*

## 6. 🧠 Refinamiento de Comportamiento y Anti-Alucinaciones
Para mantener la profesionalidad sin perder la frescura:
- **Estados de Pedido Nativos**: Kenia NUNCA recibe los estados de Appwrite en inglés crudo (`pending`, `paid`). El sistema los traduce a español (`Pendiente de pago`, `Pagado`) ANTES de inyectarlos al contexto, asegurando respuestas 100% orgánicas.
- **Cierre Tajante de Conversación**: Se le ordenó bajo reglas estrictas que **JAMÁS** deje la conversación abierta con preguntas tipo *"¿Te ayudo en algo más?"* o *"¿Cuéntame?"*. Kenia responde puntualmente a lo que se le pide y despide amablemente para ahorrar tokens y mantener el flujo ágil.
- **Cero Inventos (Anti-Hallucination)**: Tiene terminantemente prohibido inventar números de pedido, estados de envío o razones por las que un pedido no avanza. Si la información no está explícita en su contexto, debe invocar `[ACTION:ASK_ADMIN]` inmediatamente.

---

## 7. 🔗 Integración Profunda Meta API & Appwrite Webhooks
- **Formateo de Teléfonos Chilenos (La pesadilla del '9')**: 
  - Para responder mensajes regulares, la API de Meta acepta el prefijo `+56 9...`. 
  - **PERO** para enviar plantillas (Templates) que inician conversaciones, Meta arroja `Invalid parameter` si el número lleva el `9`. 
  - Se implementó en `formatWhatsAppPhone` un formateador automático que elimina el `9` exclusivamente al enviar plantillas a móviles chilenos (ej: `569...` pasa a `563...`), cumpliendo con la estricta regulación de telecomunicaciones de Meta.

### 📬 Plantillas de WhatsApp (Meta Templates)

Se usan **2 plantillas oficiales** aprobadas por Meta:

| Plantilla | Cuándo se envía | Variables |
|---|---|---|
| `pedido_recibido` | Al **crear** un pedido nuevo (status `pending`) | `{{1}}` nombre cliente, `{{2}}` código pedido |
| `estado_de_pedido` | Al **cambiar** de estado (paid, shipped, etc.) | `{{1}}` nombre, `{{2}}` código, `{{3}}` estado |

- **`pedido_recibido`**: Mensaje de bienvenida al cliente confirmando que su pedido fue recibido exitosamente. No menciona "pendiente de pago" para evitar confusión.
- **`estado_de_pedido`**: Notifica cambios de estado posteriores (Pagado, En preparación, Enviado, Entregado, Cancelado, etc.)

### 🔔 Webhook de Pedidos (`/api/webhooks/appwrite/orders`)

- **Eventos escuchados**: `.create` y `.update` (ambos configurados en Appwrite)
- **Flujo al crear pedido** (`.create`):
  1. Envía plantilla `pedido_recibido` al cliente por WhatsApp
  2. **NO** notifica al admin (porque está en `pending`)
- **Flujo al actualizar pedido** (`.update`):
  1. Envía plantilla `estado_de_pedido` al cliente con el nuevo estado
  2. Si el estado es `paid` → **SÍ** notifica al admin (campanita + panel)
- **Deduplicación**: `existsByRefKey` previene envíos duplicados del mismo estado para el mismo pedido
- **Historial**: Cada plantilla enviada se registra en el chat de Kenia via `addToHistory()` para que aparezca en el panel `/admin/ia/whatsapp`

