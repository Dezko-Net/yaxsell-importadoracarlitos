/** Compress ordinary product photos before direct Firebase uploads. */
export async function compressProductImageClient(file: File): Promise<File> {
  // Keep animated images and unsupported formats intact.
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('No se pudo leer la imagen'));
      image.src = url;
    });
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo comprimir la imagen');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.8));
    if (!blob || blob.type !== 'image/webp') throw new Error('El navegador no pudo comprimir la imagen');
    if (scale === 1 && blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'producto'}.webp`, { type: 'image/webp', lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(url);
  }
}
