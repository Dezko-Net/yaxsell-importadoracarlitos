# Configuración Gemini API — Guía para cualquier proyecto

## Resumen

Para usar Gemini en cualquier proyecto (Vercel, local, etc.), necesitas dos cosas:
1. **Un proyecto de Google Cloud con billing habilitado**
2. **Un service account con permisos de Vertex AI**

---

## Proyecto actual: `asistoraerp`

- **Google Cloud Project ID:** `asistoraerp`
- **Billing:** Habilitado ($1.1M en créditos)
- **Service account:** `ais-gemini-key-549790ad1b3344e@386824737987.iam.gserviceaccount.com`
- **Modelos en uso:** `gemini-2.5-flash`, `gemini-3.5-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`

---

## Variables de entorno necesarias

### En `.env.local` (desarrollo local)

```env
GOOGLE_CLOUD_PROJECT_ID=asistoraerp
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"asistoraerp",...}
```

### En Vercel (producción)

Ir a **Settings → Environment Variables** y configurar:

| Key | Value | Targets |
|-----|-------|---------|
| `GOOGLE_CLOUD_PROJECT_ID` | `asistoraerp` | production, preview, development |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | (JSON completo del service account) | production, preview, development |

> **NO** usar `GEMINI_API_KEY` con valores que empiecen con `vcp_` — eso no es una API key válida de Google. Las API keys reales de AI Studio empiezan con `AIza`.

---

## Cómo obtener las credenciales (paso a paso)

### 1. Crear/verificar proyecto en Google Cloud

```bash
# Instalar gcloud CLI si no lo tienes
# https://cloud.google.com/sdk/docs/install

gcloud auth login
gcloud config set project asistoraerp
```

### 2. Habilitar billing

- Ve a https://console.cloud.google.com/billing
- Asegúrate de que el proyecto tenga una cuenta de billing vinculada
- Sin billing, Vertex AI devuelve **403 Permission Denied**

### 3. Habilitar la API de Vertex AI

```bash
gcloud services enable aiplatform.googleapis.com
```

### 4. Crear un service account

```bash
gcloud iam service-accounts create ais-gemini-key \
  --display-name="Gemini API Key" \
  --project=asistoraerp
```

### 5. Dar permisos de Vertex AI al service account

```bash
gcloud projects add-iam-policy-binding asistoraerp \
  --member="service-account:ais-gemini-key-XXXXX@asistoraerp.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

### 6. Crear y descargar la clave JSON

```bash
gcloud iam service-accounts keys create ~/gemini-key.json \
  --iam-account=ais-gemini-key-XXXXX@asistoraerp.iam.gserviceaccount.com \
  --project=asistoraerp
```

### 7. Usar la clave en tu proyecto

El contenido de `~/gemini-key.json` es lo que va en `GOOGLE_APPLICATION_CREDENTIALS_JSON` (como string JSON en una sola línea).

---

## Cómo funciona el código

El archivo `src/lib/google-auth.ts` hace esto:

1. **Si `GEMINI_API_KEY` existe y empieza con `AIza`** → usa AI Studio (free tier, URL `generativelanguage.googleapis.com`)
2. **Si no** → usa Vertex AI con el service account (URL `aiplatform.googleapis.com`)

```typescript
// Lógica simplificada
const isAiStudioKey = GEMINI_API_KEY?.startsWith('AIza');
if (isAiStudioKey) {
  // AI Studio: ?key=AIza...
} else {
  // Vertex AI: Bearer token + project ID
}
```

---

## Modelos disponibles (Vertex AI)

Definidos en `src/lib/gemini-models.ts`:

```typescript
const DEFAULT_TEXT_MODELS = [
  'gemini-2.5-flash',    // Primera opción (más rápido)
  'gemini-3.5-flash',    // Fallback
  'gemini-1.5-flash',    // Fallback
  'gemini-1.5-pro',      // Última opción (más caro)
];
```

Override con env var:
```env
GEMINI_MODELS=gemini-2.5-flash,gemini-3.5-flash
```

---

## Migrar a otro proyecto de Google Cloud

Si quieres usar otro proyecto (ej. `mi-nuevo-proyecto`):

1. Crear el proyecto en Google Cloud
2. Habilitar billing
3. Habilitar `aiplatform.googleapis.com`
4. Crear service account + clave JSON (pasos 4-6 arriba)
5. Actualizar variables de entorno:
   - `GOOGLE_CLOUD_PROJECT_ID=mi-nuevo-proyecto`
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON=<nuevo JSON>`
6. En Vercel: borrar las variables viejas, crear las nuevas, y hacer **redeploy**

---

## Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `403 Permission Denied` | Billing no habilitado o service account sin permisos | Habilitar billing + dar rol `roles/aiplatform.user` |
| `Todos los modelos fallaron` | Credenciales inválidas o malformadas | Verificar que el JSON no tenga `\n` rotos |
| `GEMINI_API_KEY` con `vcp_` | No es una API key de Google (es un token de Vercel) | Borrarla y usar Vertex AI con service account |
| `Document with ID 'kenia_config' could not be found` | Falta config de Kenia en Appwrite | Se auto-crea, no es crítico |

---

## Verificar que funciona

### Test local

```bash
node test-vertex.js
```

Debe responder:
```
Token obtenido OK
Status: 200
Respuesta de Gemini: OK
```

### Test en producción

```powershell
$body = '{"entry":[{"id":"test","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"1301749033014628"},"messages":[{"from":"56992139185","id":"msg_test","text":{"body":"hola"},"timestamp":"1731000000","type":"text"}]}}]}]}'
Invoke-WebRequest -Uri "https://www.donbalatomayorista.cl/api/whatsapp/webhook" -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
# Debe responder: {"status":"ok"}
```

---

## Credenciales de despliegue

No guardes tokens ni credenciales de otros proyectos en este documento. Configura los secretos directamente en el hosting de cada cliente.

---

*La IA permanece desactivada en la configuración base de Carlitos.*
