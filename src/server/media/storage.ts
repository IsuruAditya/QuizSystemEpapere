import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";

/**
 * Media storage boundary, selected by MEDIA_STORE: local disk (dev/test with a local database),
 * Cloudinary or Vercel Blob (cloud). Contract: put(key, bytes, type) persists durably; get(key)
 * returns bytes, or null when the object does not exist (transient failures throw). Objects are
 * never publicly readable; delivery is always through /api/v1/media/{id}, which authorises first.
 */
export interface MediaStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

class LocalStore implements MediaStore {
  constructor(private root: string) {}
  private file(key: string) {
    if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) throw new Error("invalid storage key");
    return path.join(this.root, key);
  }
  async put(key: string, bytes: Uint8Array) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, bytes);
  }
  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.file(key)));
    } catch {
      return null;
    }
  }
}

class VercelBlobStore implements MediaStore {
  async put(key: string, bytes: Uint8Array, contentType: string) {
    const { put } = await import("@vercel/blob");
    await put(key, Buffer.from(bytes), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
  }
  async get(key: string) {
    const { get } = await import("@vercel/blob");
    const r = await get(key, { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return new Uint8Array(await new Response(r.stream).arrayBuffer());
  }
}

/**
 * Cloudinary, `authenticated` delivery type (ADR-009): every read needs a signed URL. Signed URLs do
 * not expire, so they are generated and fetched only on the server and never sent to a browser.
 */
class CloudinaryStore implements MediaStore {
  constructor(private creds: { cloudName: string; apiKey: string; apiSecret: string }) {}
  private async sdk() {
    const { v2 } = await import("cloudinary");
    v2.config({ cloud_name: this.creds.cloudName, api_key: this.creds.apiKey, api_secret: this.creds.apiSecret, secure: true });
    return v2;
  }
  async put(key: string, bytes: Uint8Array) {
    const { publicId } = cloudinaryRef(key);
    const c = await this.sdk();
    await new Promise<void>((resolve, reject) => {
      const s = c.uploader.upload_stream(
        { resource_type: "image", type: "authenticated", public_id: publicId, overwrite: false, unique_filename: false, use_filename: false, timeout: 30_000 },
        (err) => (err ? reject(new Error(`cloudinary upload failed: ${err.message}`)) : resolve()),
      );
      s.end(Buffer.from(bytes));
    });
  }
  async get(key: string) {
    const { publicId, format } = cloudinaryRef(key);
    const c = await this.sdk();
    const url = c.url(publicId, { resource_type: "image", type: "authenticated", sign_url: true, secure: true, format });
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`cloudinary read failed: HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
}

/** Storage key `media/<kind>/<uuid>.<ext>` → Cloudinary public ID (without extension) and format. */
export function cloudinaryRef(key: string): { publicId: string; format: string } {
  const [, publicId, format] = /^(media\/[a-z_]+\/[0-9a-f-]{36})\.(png|jpg|webp)$/.exec(key) ?? [];
  if (!publicId || !format) throw new Error("invalid storage key");
  return { publicId, format };
}

let store: MediaStore | undefined;
export function mediaStore(): MediaStore {
  if (!store) {
    const e = env();
    if (e.MEDIA_STORE === "cloudinary") {
      const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = e;
      if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary credentials missing (env.ts validates them)");
      store = new CloudinaryStore({ cloudName, apiKey, apiSecret });
    } else if (e.MEDIA_STORE === "vercel-blob") store = new VercelBlobStore();
    else store = new LocalStore(path.resolve(e.MEDIA_LOCAL_DIR, e.APP_ENV));
  }
  return store;
}
