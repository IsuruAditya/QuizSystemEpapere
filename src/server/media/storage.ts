import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";

/**
 * Media storage boundary (one real variation point: local disk for dev/test, Vercel Blob private
 * store in preview/production). Contract: put(key, bytes, type) persists durably; get(key) returns
 * bytes or null. Objects are never publicly listable; delivery is through /api/v1/media/{id}.
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

let store: MediaStore | undefined;
export function mediaStore(): MediaStore {
  if (!store) {
    const e = env();
    store = e.MEDIA_STORE === "vercel-blob" ? new VercelBlobStore() : new LocalStore(path.resolve(e.MEDIA_LOCAL_DIR, e.APP_ENV));
  }
  return store;
}
