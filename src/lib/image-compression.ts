import sharp from 'sharp';

/**
 * Comprime y redimensiona una imagen para optimizar almacenamiento y bandwidth.
 * - Redimensiona a máximo 1200px de ancho (suficiente para e-commerce)
 * - Convierte a WebP (mejor compresión que JPEG/PNG)
 * - Calidad 80 (balance entre tamaño y calidad visual)
 *
 * @param buffer Buffer de la imagen original
 * @returns Buffer de la imagen comprimida en formato WebP
 */
export async function compressImage(buffer: Buffer): Promise<Buffer> {
  const MAX_WIDTH = 1200;
  const MAX_HEIGHT = 1200;
  const QUALITY = 80;

  return await sharp(buffer)
    .resize(MAX_WIDTH, MAX_HEIGHT, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: QUALITY })
    .toBuffer();
}

/**
 * Comprime una imagen manteniendo el formato original (para compatibilidad).
 * Útil cuando se necesita mantener PNG con transparencia.
 *
 * @param buffer Buffer de la imagen original
 * @returns Buffer de la imagen comprimida
 */
export async function compressImageKeepFormat(buffer: Buffer): Promise<{ buffer: Buffer; format: string }> {
  const MAX_WIDTH = 1200;
  const MAX_HEIGHT = 1200;
  const QUALITY = 82;

  const metadata = await sharp(buffer).metadata();
  const format = metadata.format || 'jpeg';

  const resized = sharp(buffer).resize(MAX_WIDTH, MAX_HEIGHT, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  let output: Buffer;
  switch (format) {
    case 'png':
      output = await resized.png({ quality: QUALITY, compressionLevel: 9 }).toBuffer();
      break;
    case 'webp':
      output = await resized.webp({ quality: QUALITY }).toBuffer();
      break;
    case 'avif':
      output = await resized.avif({ quality: QUALITY }).toBuffer();
      break;
    case 'gif':
      // GIF: mantener como PNG (sharp no soporta compresión GIF bien)
      output = await resized.png({ quality: QUALITY }).toBuffer();
      break;
    default:
      output = await resized.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
  }

  return { buffer: output, format };
}
