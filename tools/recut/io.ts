import sharp from 'sharp';
import type { Sharp } from 'sharp';
import type { Frame, RawImage, Segmentation } from './types.js';

export async function loadImage(path: string): Promise<RawImage> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`${path}: expected 4 channels, got ${info.channels}`);
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

export function toSharp(img: RawImage): Sharp {
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), {
    raw: { width: img.width, height: img.height, channels: 4 },
  });
}

export async function savePng(img: RawImage, path: string): Promise<void> {
  await toSharp(img).png({ compressionLevel: 9 }).toFile(path);
}

/** Crop a sub-rectangle. Caller guarantees the box is within the image. */
export function crop(img: RawImage, x: number, y: number, w: number, h: number): RawImage {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = ((y + row) * img.width + x) * 4;
    out.set(img.data.subarray(src, src + w * 4), row * w * 4);
  }
  return { width: w, height: h, data: out };
}

const ROW_COLORS = ['#ff4d4d', '#ffb84d', '#e6ff4d', '#4dff88', '#4dd2ff', '#b84dff', '#ff4dd2'];

function rect(f: Frame, color: string, width: number, dash = ''): string {
  return `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="none" stroke="${color}" stroke-width="${width}" ${dash}/>`;
}

/**
 * Debug preview: the keyed sheet over a neutral checkerboard with row-coloured
 * frame boxes, dotted satellite boxes, pivot crosses and frame ids. This is
 * what `recut` writes next to the recipe for a quick eyeball before opening
 * the review UI.
 */
export async function renderOverlay(keyed: RawImage, seg: Segmentation, path: string): Promise<void> {
  const parts: string[] = [];
  const fontSize = Math.max(10, Math.round(seg.width / 140));
  for (const row of seg.rows) {
    for (const f of row) {
      const color = ROW_COLORS[f.row % ROW_COLORS.length];
      parts.push(rect(f, color, 2));
      for (const s of f.satellites) {
        parts.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="3 3"/>`);
      }
      const px = f.pivot.x.toFixed(1);
      const py = f.pivot.y.toFixed(1);
      const r = fontSize * 0.6;
      parts.push(`<line x1="${px}" y1="${f.pivot.y - r}" x2="${px}" y2="${f.pivot.y + r}" stroke="#fff" stroke-width="2"/>`);
      parts.push(`<line x1="${f.pivot.x - r}" y1="${py}" x2="${f.pivot.x + r}" y2="${py}" stroke="#fff" stroke-width="2"/>`);
      parts.push(`<circle cx="${px}" cy="${py}" r="${r * 0.4}" fill="${color}"/>`);
      parts.push(
        `<text x="${f.x + 2}" y="${f.y + fontSize}" font-family="monospace" font-size="${fontSize}" fill="${color}" stroke="#000" stroke-width="2" paint-order="stroke">${f.id}</text>`,
      );
    }
  }
  for (const d of seg.dropped) {
    const c = d.component;
    const color = d.reason === 'watermark' ? '#ff00ff' : d.reason === 'override' ? '#888' : '#ff0000';
    parts.push(`<rect x="${c.x - 1}" y="${c.y - 1}" width="${c.w + 2}" height="${c.h + 2}" fill="none" stroke="${color}" stroke-width="2"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${seg.width}" height="${seg.height}">${parts.join('')}</svg>`;

  const checker = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${seg.width}" height="${seg.height}">` +
      `<defs><pattern id="c" width="16" height="16" patternUnits="userSpaceOnUse">` +
      `<rect width="16" height="16" fill="#3a3a3a"/><rect width="8" height="8" fill="#555"/><rect x="8" y="8" width="8" height="8" fill="#555"/>` +
      `</pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`,
  );

  await sharp(checker)
    .composite([
      { input: await toSharp(keyed).png().toBuffer() },
      { input: Buffer.from(svg) },
    ])
    .png()
    .toFile(path);
}
