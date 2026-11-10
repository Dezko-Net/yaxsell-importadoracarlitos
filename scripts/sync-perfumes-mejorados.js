const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { GoogleAuth } = require('google-auth-library');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'importadora-carlitos';
const BUCKET_NAME = 'importadora-carlitos.firebasestorage.app';

const adcPath = path.join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json');
const adcCreds = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
delete adcCreds.quota_project_id;

const gAuth = new GoogleAuth({
  credentials: adcCreds,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
  storageBucket: BUCKET_NAME,
});

const db = getFirestore();
const MEJORADAS_DIR = path.resolve(__dirname, '../PERFUMES_/fotos mejoradas');

async function getToken() {
  const client = await gAuth.getClient();
  const res = await client.getAccessToken();
  return res.token;
}

async function uploadImageToStorage(localPath) {
  const webpBuffer = await sharp(localPath)
    .rotate()
    .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer();

  const uuid = crypto.randomUUID();
  const downloadToken = crypto.randomUUID();
  const storagePath = `carlitos/productos/${uuid}.webp`;
  const boundary = 'yaxsell_' + crypto.randomBytes(12).toString('hex');

  const metadataJson = JSON.stringify({
    name: storagePath,
    contentType: 'image/webp',
    cacheControl: 'public, max-age=31536000',
    metadata: {
      firebaseStorageDownloadTokens: downloadToken,
    },
  });

  const part1 = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}\r\n` +
      `--${boundary}\r\nContent-Type: image/webp\r\n\r\n`,
    'utf8'
  );
  const part2 = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([part1, webpBuffer, part2]);

  const accessToken = await getToken();
  const res = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET_NAME}/o?uploadType=multipart`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GCS upload ${res.status}: ${errText.slice(0, 300)}`);
  }

  const encodedPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}

async function run() {
  const mejoradasFiles = fs.existsSync(MEJORADAS_DIR) ? fs.readdirSync(MEJORADAS_DIR) : [];
  const mejoradasMap = new Map(mejoradasFiles.map((f) => [f.toLowerCase(), f]));

  const snap = await db.collection('products').get();
  const toUpdate = [];
  let alreadyEnhanced = 0;

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const src = String(data.SOURCE_FILE || '').toLowerCase();
    if (data.PHOTO_ENHANCED) {
      alreadyEnhanced++;
    } else if (src && mejoradasMap.has(src)) {
      toUpdate.push({
        id: doc.id,
        name: data.NAME,
        localPath: path.join(MEJORADAS_DIR, mejoradasMap.get(src)),
      });
    }
  });

  console.log(`Already enhanced in DB: ${alreadyEnhanced} | Newly enhanced found on disk: ${toUpdate.length}`);

  let updated = 0;
  for (const item of toUpdate) {
    const imageUrl = await uploadImageToStorage(item.localPath);
    await db.collection('products').doc(item.id).update({
      IMAGEURL: imageUrl,
      PHOTO_ENHANCED: true,
      updatedAt: Date.now(),
    });
    updated++;
    console.log(`UPDATED [${item.id}] ${item.name} -> PHOTO_ENHANCED: true`);
  }

  console.log(`Sync complete! Total enhanced in DB now: ${alreadyEnhanced + updated} / ${snap.size}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
