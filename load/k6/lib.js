// Shared k6 helpers. Each VU uses its OWN student account (EPL00001..), never a shared account or row.
import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

export const BASE = __ENV.BASE_URL || "http://localhost:3000";
export const PASSWORD = __ENV.LOAD_PASSWORD;
export const SLUG = __ENV.EXAM_SLUG;
export const ORIGIN_HEADERS = { "Content-Type": "application/json", Origin: BASE };

export const saveAck = new Trend("save_ack_ms", true);
export const submitAck = new Trend("submit_receipt_ms", true);
export const conflicts = new Counter("revision_conflicts");
export const unexpected5xx = new Counter("unexpected_5xx");
export const saveRejected = new Counter("save_rejected");

export function studentId(n) {
  return `EPL${String(n).padStart(5, "0")}`;
}

/** Real password verification (scrypt) and session cookie per VU. */
export function login(n) {
  const jar = http.cookieJar();
  const r = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ username: studentId(n), password: PASSWORD }), { headers: ORIGIN_HEADERS, tags: { name: "login" } });
  if (r.status >= 500) unexpected5xx.add(1);
  check(r, { "login 200": (x) => x.status === 200 });
  return jar;
}

export function start() {
  const r = http.post(`${BASE}/api/v1/exams/${SLUG}/attempts`, JSON.stringify({ takeover: true }), { headers: ORIGIN_HEADERS, tags: { name: "start" } });
  if (r.status >= 500) unexpected5xx.add(1);
  check(r, { "start 200": (x) => x.status === 200 });
  return r.status === 200 ? r.json() : null;
}

export function getAttempt(id) {
  const r = http.get(`${BASE}/api/v1/attempts/${id}`, { tags: { name: "attempt" } });
  if (r.status >= 500) unexpected5xx.add(1);
  return r.status === 200 ? r.json() : null;
}

/** One save batch; returns the new revision (or the canonical one after a conflict). */
export function save(id, token, revision, changes) {
  const body = JSON.stringify({ mutationId: uuid(), baseRevision: revision, controllerToken: token, changes });
  const r = http.put(`${BASE}/api/v1/attempts/${id}/answers`, body, { headers: ORIGIN_HEADERS, tags: { name: "save" } });
  saveAck.add(r.timings.duration);
  if (r.status >= 500) unexpected5xx.add(1);
  if (r.status === 409 && r.json("code") === "REVISION_CONFLICT") {
    conflicts.add(1);
    return r.json("revision");
  }
  check(r, { "save 200": (x) => x.status === 200 });
  if (r.status !== 200) {
    saveRejected.add(1, { code: String(r.status === 0 ? "NETWORK" : r.json("code")) });
    if (__ENV.DEBUG) console.warn(`save ${r.status} ${r.body}`);
  }
  return r.status === 200 ? r.json("revision") : revision;
}

export function submit(id, token, revision, mutationId) {
  const body = JSON.stringify({ mutationId, baseRevision: revision, controllerToken: token, finalChanges: [] });
  const r = http.post(`${BASE}/api/v1/attempts/${id}/submit`, body, { headers: ORIGIN_HEADERS, tags: { name: "submit" }, timeout: "30s" });
  submitAck.add(r.timings.duration);
  if (r.status >= 500) unexpected5xx.add(1);
  check(r, { "submit 200": (x) => x.status === 200 });
  return r;
}

export function uuid() {
  // RFC 4122 v4 from k6's crypto-safe random bytes.
  const b = new Uint8Array(crypto.getRandomValues(new Uint8Array(16)));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Scale a target by load profile: smoke | normal | spike | soak | stress (above target). */
export function scale(target) {
  const f = { smoke: 0.002, normal: 0.5, spike: 1, soak: 1, stress: 1.5 }[__ENV.PROFILE || "smoke"];
  return Math.max(1, Math.round(target * f));
}

export const THRESHOLDS = {
  save_ack_ms: ["p(95)<1000"],
  submit_receipt_ms: ["p(95)<2000"],
  unexpected_5xx: ["count<1"],
  http_req_failed: ["rate<0.001"],
  dropped_iterations: ["count<1"],
};
