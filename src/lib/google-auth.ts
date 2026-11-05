// @ts-nocheck
const GEMINI_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
// Vertex AI puede usar credenciales distintas a Firebase (VERTEX_CREDENTIALS_JSON / VERTEX_PROJECT_ID)
// Si no se definen, cae back a las de Firebase (GOOGLE_APPLICATION_CREDENTIALS_JSON / GOOGLE_CLOUD_PROJECT_ID)
const GCP_PROJECT_ID = process.env.VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCP_PROJECT_ID || '';
const GCP_REGION = process.env.GOOGLE_CLOUD_REGION || 'global';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const VERTEX_CREDENTIALS_JSON = process.env.VERTEX_CREDENTIALS_JSON || '';

/** @type {any} */
let _auth = null;
/** @type {{ token: string, expiry: number } | null} */
let _cachedToken = null;
const TOKEN_REFRESH_BUFFER_MS = 60_000;

async function getAuth() {
  if (!_auth) {
    const { GoogleAuth } = await import(/* webpackIgnore: true */ 'google-auth-library');
    // Priorizar credenciales dedicadas de Vertex AI si existen
    const credentialsJson = VERTEX_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (credentialsJson) {
      try {
        let raw = credentialsJson.trim();
        if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"') && !raw.startsWith('{"'))) {
          raw = raw.slice(1, -1).trim();
        }
        let credentials;
        try {
          credentials = JSON.parse(raw);
        } catch {
          const cleaned = raw.replace(/\\n/g, '\n').replace(/\n/g, '\\n');
          try {
            credentials = JSON.parse(cleaned);
          } catch {
            credentials = JSON.parse(raw.replace(/\\n/g, '\\n'));
          }
        }
        if (credentials.private_key && typeof credentials.private_key === 'string') {
          credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }
        _auth = new GoogleAuth({ scopes: [GEMINI_SCOPE], credentials });
      } catch (parseErr: any) {
        console.error('[google-auth] Error parsing GOOGLE_APPLICATION_CREDENTIALS_JSON:', parseErr);
        throw new Error(`GOOGLE_APPLICATION_CREDENTIALS_JSON no es un JSON válido: ${parseErr.message || 'Error de sintaxis'}`);
      }
    } else {
      // Sin credenciales — intentar ADC (solo funciona local con gcloud auth)
      _auth = new GoogleAuth({ scopes: [GEMINI_SCOPE] });
    }
  }
  return _auth;
}

export async function getGeminiAccessToken(forceOAuth = false) {
  const isAiStudioKey = Boolean(GEMINI_API_KEY && GEMINI_API_KEY.startsWith('AIza'));
  if (isAiStudioKey && !forceOAuth) return ''; // Bypassed by AI Studio API key
  
  if (_cachedToken && Date.now() < _cachedToken.expiry - TOKEN_REFRESH_BUFFER_MS) {
    return _cachedToken.token;
  }

  const auth = await getAuth();
  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();

  const token = tokenRes.token || '';
  if (!token) {
    throw new Error('No se pudo obtener el access token de Google Cloud ADC');
  }

  const expiry = Date.now() + 55 * 60 * 1000;

  _cachedToken = { token, expiry };
  return token;
}

export async function getGeminiAuthHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  const isAiStudioKey = Boolean(GEMINI_API_KEY && GEMINI_API_KEY.startsWith('AIza'));
  if (isAiStudioKey) {
    return headers; // API key is passed in URL for AI Studio
  }
  
  const token = await getGeminiAccessToken();
  headers['Authorization'] = `Bearer ${token}`;
  
  if (GCP_PROJECT_ID) {
    headers['x-goog-user-project'] = GCP_PROJECT_ID;
  }
  return headers;
}

export function buildGeminiUrl(model: string, method = 'generateContent') {
  const isAiStudioKey = Boolean(GEMINI_API_KEY && GEMINI_API_KEY.startsWith('AIza'));
  if (isAiStudioKey) {
    const cleanModel = model.replace('models/', '');
    return `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:${method}?key=${GEMINI_API_KEY}`;
  }
  
  // Otherwise use Vertex AI
  if (GCP_PROJECT_ID) {
    const base = GCP_REGION === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${GCP_REGION}-aiplatform.googleapis.com`;
    const cleanModel = model.replace('models/', '');
    return `${base}/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/publishers/google/models/${cleanModel}:${method}`;
  }
  
  throw new Error("Missing valid GEMINI_API_KEY or GCP_PROJECT_ID credentials.");
}
