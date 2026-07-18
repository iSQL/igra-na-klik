import { useEffect, useRef, useState } from 'react';

/**
 * Canvas-based pixelation: the image is drawn to a tiny offscreen canvas and
 * upscaled without smoothing. `pixelation` 1 = coarsest blocks, 0 = sharp.
 * Duplicated in host & controller (same precedent as BZCard/GeoMap).
 */
export function PixelatedImage({
  src,
  pixelation,
  maxHeightCss = '32vh',
}: {
  src: string;
  pixelation: number;
  maxHeightCss?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    // No crossOrigin: we only ever draw the image (never read pixels back via
    // getImageData/toDataURL), so a tainted canvas is fine — and dropping the
    // CORS requirement lets arbitrary remote images load reliably.
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = src;
    return () => {
      image.onload = null;
    };
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w === 0 || h === 0) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const p = Math.max(0, Math.min(1, pixelation));
    const cols = Math.max(4, Math.round(12 + (1 - p) * (1 - p) * 400));
    if (cols >= w) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, w, h);
      return;
    }
    const rows = Math.max(4, Math.round((cols * h) / w));
    const off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    offCtx.drawImage(img, 0, 0, cols, rows);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(off, 0, 0, cols, rows, 0, 0, w, h);
  }, [img, pixelation]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        maxWidth: '100%',
        maxHeight: maxHeightCss,
        width: 'auto',
        height: 'auto',
        objectFit: 'contain',
        borderRadius: '12px',
        display: 'block',
        margin: '0 auto',
        background: 'var(--bg-secondary)',
      }}
    />
  );
}
