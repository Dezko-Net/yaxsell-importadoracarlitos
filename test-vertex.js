// Prueba manual de Vertex AI usando credenciales configuradas en el entorno.
// No guardar llaves de cuentas de servicio en el repositorio.
const { GoogleAuth } = require('google-auth-library');

const rawCredentials = process.env.VERTEX_CREDENTIALS_JSON;
const credentials = rawCredentials ? JSON.parse(rawCredentials) : undefined;
const projectId = process.env.VERTEX_PROJECT_ID || credentials?.project_id;

if (!projectId) {
  console.error('Define VERTEX_PROJECT_ID o VERTEX_CREDENTIALS_JSON antes de ejecutar esta prueba.');
  process.exit(1);
}

(async () => {
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      ...(credentials ? { credentials } : {}),
    });
    const client = await auth.getClient();
    const tokenRes = await client.getAccessToken();
    const token = tokenRes.token;

    const url = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/global/publishers/google/models/gemini-2.5-flash:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-goog-user-project': projectId,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Responde solo "OK"' }] }],
      }),
    });

    const body = await res.text();
    console.log('Status:', res.status);
    console.log('Body:', body.substring(0, 500));

    if (res.ok) {
      const data = JSON.parse(body);
      console.log('Respuesta de Gemini:', data?.candidates?.[0]?.content?.parts?.[0]?.text);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Error desconocido');
  }
})();
