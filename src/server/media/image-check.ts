import { imageSize } from "image-size";

/** Raster types accepted in the MVP, identified by magic bytes (never by filename/extension). */
export type ImageType = "image/png" | "image/jpeg" | "image/webp";

export function sniffImage(b: Uint8Array): ImageType | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export const MAX_DIMENSION = 4096;

export type ImageCheck = { ok: true; type: ImageType; width: number; height: number } | { ok: false; message: string };

export function checkImage(bytes: Uint8Array, maxBytes: number): ImageCheck {
  if (bytes.byteLength === 0) return { ok: false, message: "The file is empty." };
  if (bytes.byteLength > maxBytes) return { ok: false, message: `Image is larger than ${Math.round(maxBytes / 1024)} KB.` };
  const type = sniffImage(bytes);
  if (!type) return { ok: false, message: "Only PNG, JPEG or WebP images are accepted (SVG, HTML and other files are rejected)." };
  let dim: { width?: number; height?: number; type?: string };
  try {
    dim = imageSize(bytes);
  } catch {
    return { ok: false, message: "The image could not be read; it may be corrupted." };
  }
  const expected = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[type];
  if (dim.type !== expected || !dim.width || !dim.height) return { ok: false, message: "The image content does not match its format." };
  if (dim.width > MAX_DIMENSION || dim.height > MAX_DIMENSION) return { ok: false, message: `Image must be at most ${MAX_DIMENSION}×${MAX_DIMENSION} pixels.` };
  return { ok: true, type, width: dim.width, height: dim.height };
}
