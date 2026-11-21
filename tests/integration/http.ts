import { NextRequest } from "next/server";

/** Minimal in-process HTTP client for route handlers (real auth, real DB; no network). */
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export const ORIGIN = "http://localhost:3000";

export class Client {
  cookies = new Map<string, string>();
  constructor(private ip = "10.0.0.1") {}

  async call(handler: Handler, opts: { path: string; method?: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string>; form?: FormData }) {
    const method = opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET");
    const headers = new Headers({ "x-real-ip": this.ip, ...(method !== "GET" ? { origin: ORIGIN } : {}), ...(opts.headers ?? {}) });
    if (this.cookies.size) headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    let body: ArrayBuffer | string | undefined;
    if (opts.form) {
      // Encode multipart once so Content-Type (boundary) and Content-Length are exact, as a browser sends them.
      const enc = new Request(`${ORIGIN}/`, { method: "POST", body: opts.form });
      body = await enc.arrayBuffer();
      headers.set("content-type", enc.headers.get("content-type") ?? "multipart/form-data");
      headers.set("content-length", String(body.byteLength));
    } else if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      headers.set("content-type", "application/json");
      headers.set("content-length", String(Buffer.byteLength(body)));
    }
    const req = new NextRequest(`${ORIGIN}${opts.path}`, { method, headers, body });
    return this.capture(await handler(req, { params: Promise.resolve(opts.params ?? {}) }));
  }

  private async capture(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair!.indexOf("=");
      const name = pair!.slice(0, i);
      const value = pair!.slice(i + 1);
      if (!value || /max-age=0/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* not JSON */
    }
    return { status: res.status, headers: res.headers, text, json };
  }
}
