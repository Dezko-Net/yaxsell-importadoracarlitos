# Debug Session: whatsapp-ia-silence

Status: [OPEN]

## Síntoma
- Kenia no responde cuando el cliente escribe por WhatsApp.

## Alcance
- Flujo entrante del webhook de WhatsApp.
- Generación/respuesta de Kenia.
- Envío saliente hacia Meta WhatsApp.

## Hipótesis iniciales
1. El webhook sí recibe mensajes, pero el flujo sale temprano por validaciones de configuración, bloqueo o límites.
2. El webhook recibe el mensaje y genera respuesta, pero falla el envío saliente a Meta por token, phone number id o error HTTP.
3. El webhook no está entrando al branch esperado porque el payload de WhatsApp cambió o se parsea distinto.
4. Kenia sí responde, pero un guard clause evita contestar ciertos mensajes por tipo, contacto o estado del hilo.
5. La ruta local/servidor activa no es la que está atendiendo el tráfico real y estamos observando el código correcto en el proceso equivocado.

## Plan
1. Inspeccionar el flujo actual del webhook y envío.
2. Instrumentar puntos clave sin modificar lógica de negocio.
3. Reproducir o simular un evento entrante.
4. Confirmar o descartar hipótesis con evidencia.
5. Aplicar fix mínimo solo si la evidencia lo justifica.

## Evidencia recolectada
- `A` webhook entra correctamente con `msgType=text` y `hasMessages=true`.
- `C` Gemini genera respuesta correctamente.
- `D` El webhook llega al punto justo antes de enviar la respuesta a WhatsApp.
- `F` `sendWhatsAppMessage()` aborta porque no hay `WHATSAPP_ACCESS_TOKEN` ni `WHATSAPP_PHONE_NUMBER_ID` en runtime.

## Estado de hipótesis
1. El webhook sí recibe mensajes, pero el flujo sale temprano por validaciones de configuración, bloqueo o límites.
   - Parcialmente descartada. No se corta por bloqueo/límites antes de Gemini.
2. El webhook recibe el mensaje y genera respuesta, pero falla el envío saliente a Meta por token, phone number id o error HTTP.
   - Confirmada. La función de envío aborta por variables faltantes.
3. El webhook no está entrando al branch esperado porque el payload de WhatsApp cambió o se parsea distinto.
   - Descartada. El payload simulado entra y procesa normal.
4. Kenia sí responde, pero un guard clause evita contestar ciertos mensajes por tipo, contacto o estado del hilo.
   - Descartada para el caso probado.
5. La ruta local/servidor activa no es la que está atendiendo el tráfico real y estamos observando el código correcto en el proceso equivocado.
   - Descartada localmente. El webhook local responde y deja trazas.

## Hallazgo clave
- En `.env.local` las claves existen, pero sus valores actuales son `""` para:
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_VERIFY_TOKEN`
  - `ADMIN_WHATSAPP_NUMBER`
