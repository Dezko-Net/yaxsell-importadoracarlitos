import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

let _cachedToken: { token: string; expiry: number } | null = null;

async function getAccessTokenFromSA(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiry - 60000) {
    return _cachedToken.token;
  }

  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!credentialsJson) {
    throw new Error('Falta GOOGLE_APPLICATION_CREDENTIALS_JSON');
  }

  let credentials: any;
  try {
    // Vercel puede meter saltos de línea reales dentro del private_key del JSON
    // Escapar saltos de línea reales (no escapados) a \n para que JSON.parse funcione
    let cleaned = credentialsJson.trim();
    cleaned = cleaned.replace(/(?<!\\)\n/g, '\\n').replace(/(?<!\\)\r/g, '\\r');
    credentials = JSON.parse(cleaned);
  } catch (e: any) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON no es JSON válido: ' + e.message);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: credentials.token_uri,
    exp: expiry,
    iat: now,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signInput = `${encodedHeader}.${encodedPayload}`;

  const privateKeyPem = credentials.private_key.replace(/\\n/g, '\n');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signInput);
  sign.end();
  const signature = sign.sign(privateKeyPem, 'base64url');

  const jwt = `${signInput}.${signature}`;

  const tokenRes = await fetch(credentials.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Token exchange failed: ${tokenRes.status} ${errText}`);
  }

  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  if (!token) {
    throw new Error('No access_token in response');
  }

  _cachedToken = { token, expiry: Date.now() + 55 * 60 * 1000 };
  return token;
}

export async function POST(req: NextRequest) {
  try {
    const { imageUrl } = await req.json();
    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl es requerido' }, { status: 400 });
    }

    // Descargar la imagen y convertirla a base64
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: 'No se pudo descargar la imagen' }, { status: 400 });
    }
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');

    // Obtener token OAuth2 desde el service account JSON
    let token: string;
    try {
      token = await getAccessTokenFromSA();
    } catch (e: any) {
      console.error('Auth error:', e.message);
      return NextResponse.json({
        error: 'No se pudo autenticar con Google Cloud: ' + e.message,
      }, { status: 500 });
    }

    const GCP_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || '';
    const visionUrl = 'https://vision.googleapis.com/v1/images:annotate';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    if (GCP_PROJECT_ID) {
      headers['x-goog-user-project'] = GCP_PROJECT_ID;
    }

    const body = {
      requests: [{
        image: { content: base64 },
        features: [{ type: 'WEB_DETECTION', maxResults: 20 }],
      }],
    };

    const response = await fetch(visionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Vision API error:', errText);
      return NextResponse.json({ error: `Vision API error: ${response.status}`, detail: errText }, { status: 500 });
    }

    const data = await response.json();
    const webDetection = data.responses?.[0]?.webDetection;

    if (!webDetection) {
      return NextResponse.json({ images: [], message: 'No se encontraron imágenes similares' });
    }

    const similarImages: { url: string; score?: number }[] = (webDetection.visuallySimilarImages || [])
      .map((img: any) => ({ url: img.url, score: img.score }))
      .filter((img: any) => img.url);

    const fullMatches: { url: string; score?: number }[] = (webDetection.fullMatchingImages || [])
      .map((img: any) => ({ url: img.url, score: img.score }))
      .filter((img: any) => img.url);

    const allImages = [...similarImages, ...fullMatches];
    const seen = new Set<string>();
    const unique = allImages.filter(img => {
      if (seen.has(img.url)) return false;
      seen.add(img.url);
      return true;
    });

    const bestGuessLabels: string[] = (webDetection.bestGuessLabels || [])
      .map((l: any) => l.label)
      .filter(Boolean);

    return NextResponse.json({
      images: unique.slice(0, 20),
      bestGuess: bestGuessLabels,
    });
  } catch (e: any) {
    console.error('vision-similar error:', e);
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 });
  }
}

// GET proxy para descargar imágenes externas (evita CORS en el cliente)
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url param required' }, { status: 400 });
  }
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `fetch failed: ${res.status}` }, { status: 502 });
    }
    const blob = await res.blob();
    const headers = new Headers();
    headers.set('Content-Type', blob.type || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=3600');
    return new NextResponse(blob, { status: 200, headers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'proxy error' }, { status: 500 });
  }
}
