import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import * as loginRoute from "@/app/api/v1/auth/login/route";
import * as passwordRoute from "@/app/api/v1/auth/password/route";
import * as startRoute from "@/app/api/v1/exams/[slug]/attempts/route";
import * as attemptRoute from "@/app/api/v1/attempts/[id]/route";
import * as resultRoute from "@/app/api/v1/attempts/[id]/result/route";
import * as studentAdminRoute from "@/app/api/v1/admin/students/[id]/route";
import * as studentsRoute from "@/app/api/v1/admin/students/route";
import * as exportRoute from "@/app/api/v1/admin/exams/[id]/results.csv/route";
import * as mediaUploadRoute from "@/app/api/v1/admin/media/route";
import * as mediaRoute from "@/app/api/v1/media/[id]/route";
import * as jobsRoute from "@/app/api/internal/jobs/run/route";
import * as leaderboardRoute from "@/app/api/v1/exams/[slug]/leaderboard/route";
import { Client } from "./http";
import { makeAdmin, makeExam, makeStudent, PASSWORD, seedCatalog, truncateAll, type ExamFx } from "./fixtures";
import type { Actor } from "@/server/auth/actor";

let cat: Awaited<ReturnType<typeof seedCatalog>>;
let admin: Actor;
let exam: ExamFx;
const SPEC = [
  { correct: 1, marks: 1 },
  { correct: 2, marks: 1 },
] as const;

async function signIn(username: string, password = PASSWORD, ip?: string) {
  const c = new Client(ip);
  const r = await c.call(loginRoute.POST, { path: "/api/v1/auth/login", body: { username, password } });
  return { c, r };
}

beforeAll(async () => {
  await truncateAll();
  cat = await seedCatalog();
  admin = await makeAdmin("admin.sec");
  exam = await makeExam(admin, cat, { questions: [...SPEC] });
});

describe("authentication and sessions (§19.22)", () => {
  it("login sets an HttpOnly SameSite session cookie; wrong password gets a generic 401", async () => {
    const st = await makeStudent(cat.g9);
    const bad = await signIn(st.username, "wrong-password");
    expect(bad.r.status).toBe(401);
    expect(bad.r.json?.code).toBe("UNAUTHENTICATED");
    const unknown = await signIn("EP99999999", "whatever");
    expect(unknown.r.json?.title).toBe(bad.r.json?.title); // no account enumeration
    const ok = await signIn(st.username.toUpperCase()); // EP IDs are case-insensitive
    expect(ok.r.status).toBe(200);
    expect(ok.r.json?.next).toBe("/student");
    const raw = ok.r.headers.getSetCookie().join("\n");
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
  });

  it("throttles one account after 10 failures without blocking others on the same network", async () => {
    const victim = await makeStudent(cat.g9);
    const classmate = await makeStudent(cat.g9);
    for (let i = 0; i < 10; i++) expect((await signIn(victim.username, "nope", "203.0.113.7")).r.status).toBe(401);
    const locked = await signIn(victim.username, PASSWORD, "203.0.113.7");
    expect(locked.r.status).toBe(429);
    expect(locked.r.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await signIn(classmate.username, PASSWORD, "203.0.113.7")).r.status).toBe(200);
  });

  it("cross-site mutations are rejected (Origin and Sec-Fetch-Site)", async () => {
    const st = await makeStudent(cat.g9);
    const { c } = await signIn(st.username);
    const evil = await c.call(startRoute.POST, { path: `/api/v1/exams/${exam.slug}/attempts`, params: { slug: exam.slug }, body: {}, headers: { origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
    const noOrigin = new Client();
    noOrigin.cookies = c.cookies;
    const r = await noOrigin.call(loginRoute.POST, { path: "/api/v1/auth/login", body: { username: st.username, password: PASSWORD }, headers: { origin: "" } });
    expect(r.status).toBe(403);
    expect(await db.attempt.count({ where: { userId: st.userId } })).toBe(0);
  });

  it("admin password reset revokes sessions and forces a password change", async () => {
    const st = await makeStudent(cat.g9);
    const { c: studentClient } = await signIn(st.username);
    const { c: adminClient } = await signIn("admin.sec");
    const reset = await adminClient.call(studentAdminRoute.POST, { path: `/api/v1/admin/students/${st.userId}`, params: { id: st.userId }, body: { action: "reset-password", adminPassword: PASSWORD } });
    expect(reset.status).toBe(200);
    const temp = String(reset.json?.temporaryPassword);
    expect(temp).toMatch(/^[A-Za-z2-9]{12}$/);
    // Old session is dead.
    expect((await studentClient.call(startRoute.POST, { path: `/api/v1/exams/${exam.slug}/attempts`, params: { slug: exam.slug }, body: {} })).status).toBe(401);
    // New sign-in works but exam APIs are blocked until the password is changed.
    const { c: fresh, r } = await signIn(st.username, temp);
    expect(r.json?.mustChangePassword).toBe(true);
    expect((await fresh.call(startRoute.POST, { path: `/api/v1/exams/${exam.slug}/attempts`, params: { slug: exam.slug }, body: {} })).json?.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await fresh.call(passwordRoute.POST, { path: "/api/v1/auth/password", body: { currentPassword: temp, newPassword: "New-Secret-123" } })).status).toBe(200);
    expect((await fresh.call(startRoute.POST, { path: `/api/v1/exams/${exam.slug}/attempts`, params: { slug: exam.slug }, body: {} })).status).toBe(200);
    // Audit trail exists and does not contain the password.
    const ev = await db.auditEvent.findFirst({ where: { action: "student.password_reset", targetId: st.userId } });
    expect(ev).not.toBeNull();
    expect(JSON.stringify(ev)).not.toContain(temp);
  });

  it("reset requires the admin's own password", async () => {
    const st = await makeStudent(cat.g9);
    const { c } = await signIn("admin.sec");
    const r = await c.call(studentAdminRoute.POST, { path: `/api/v1/admin/students/${st.userId}`, params: { id: st.userId }, body: { action: "reset-password", adminPassword: "not-it" } });
    expect(r.status).toBe(403);
  });

  it("disabling an account ends its sessions and blocks sign-in", async () => {
    const st = await makeStudent(cat.g9);
    const { c: sc } = await signIn(st.username);
    const { c: ac } = await signIn("admin.sec");
    expect((await ac.call(studentAdminRoute.POST, { path: `/api/v1/admin/students/${st.userId}`, params: { id: st.userId }, body: { action: "disable" } })).status).toBe(200);
    expect((await sc.call(attemptRoute.GET, { path: "/api/v1/attempts/x", params: { id: "00000000-0000-4000-8000-000000000000" } })).status).toBe(401);
    expect((await signIn(st.username)).r.status).toBe(401);
  });

  it("there is no web endpoint that changes roles", async () => {
    const st = await makeStudent(cat.g9);
    const { c } = await signIn("admin.sec");
    const r = await c.call(studentAdminRoute.POST, { path: `/api/v1/admin/students/${st.userId}`, params: { id: st.userId }, body: { action: "make-admin" } });
    expect(r.status).toBe(422);
    expect((await db.user.findUniqueOrThrow({ where: { id: st.userId } })).role).toBe("STUDENT");
  });
});

describe("authorisation boundaries (§19.20, §19.21)", () => {
  it("unauthenticated → 401; student on admin endpoints → 403; exports are admin-only", async () => {
    const anon = new Client();
    expect((await anon.call(startRoute.POST, { path: `/api/v1/exams/${exam.slug}/attempts`, params: { slug: exam.slug }, body: {} })).status).toBe(401);
    const st = await makeStudent(cat.g9);
    const { c } = await signIn(st.username);
    expect((await c.call(studentsRoute.POST, { path: "/api/v1/admin/students", body: {} })).status).toBe(403);
    const exp = await c.call(exportRoute.GET, { path: `/api/v1/admin/exams/${exam.id}/results.csv`, params: { id: exam.id } });
    expect(exp.status).toBe(403);
    expect(exp.text).not.toContain("ep_id");
  });

  it("a student cannot read another student's attempt or result (404, not 403)", async () => {
    const owner = await makeStudent(cat.g9);
    const other = await makeStudent(cat.g9);
    const { c: oc } = await signIn(owner.username);
    const start = await oc.call(startRoute.POST, { path: `/api/v1/exams/${exam.slug}/attempts`, params: { slug: exam.slug }, body: {} });
    const id = String(start.json?.attemptId);
    const { c: xc } = await signIn(other.username);
    expect((await xc.call(attemptRoute.GET, { path: `/api/v1/attempts/${id}`, params: { id } })).status).toBe(404);
    expect((await xc.call(resultRoute.GET, { path: `/api/v1/attempts/${id}/result`, params: { id } })).status).toBe(404);
  });

  it("attempt responses are not cacheable and contain no answer key or explanation", async () => {
    const st = await makeStudent(cat.g9);
    const { c } = await signIn(st.username);
    const start = await c.call(startRoute.POST, { path: `/api/v1/exams/${exam.slug}/attempts`, params: { slug: exam.slug }, body: {} });
    const id = String(start.json?.attemptId);
    const r = await c.call(attemptRoute.GET, { path: `/api/v1/attempts/${id}`, params: { id } });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.text).not.toMatch(/isCorrect|correctOption|Explanation \d/);
  });

  it("malformed ids and slugs fail fast with 404 (never a database error)", async () => {
    const st = await makeStudent(cat.g9);
    const { c } = await signIn(st.username);
    const r = await c.call(attemptRoute.GET, { path: "/api/v1/attempts/not-a-uuid", params: { id: "not-a-uuid'; --" } });
    expect(r.status).toBe(404);
    expect(r.json?.code).toBe("NOT_FOUND");
    expect((await c.call(leaderboardRoute.GET, { path: "/api/v1/exams/BAD SLUG/leaderboard", params: { slug: "BAD SLUG" } })).status).toBe(404);
  });

  it("leaderboard is per exam and only for eligible students", async () => {
    const other = await makeStudent(cat.g10);
    const { c } = await signIn(other.username);
    expect((await c.call(leaderboardRoute.GET, { path: `/api/v1/exams/${exam.slug}/leaderboard`, params: { slug: exam.slug } })).status).toBe(403);
  });

  it("internal job runner requires the cron secret", async () => {
    const anon = new Client();
    expect((await anon.call(jobsRoute.POST, { path: "/api/internal/jobs/run", method: "POST" })).status).toBe(401);
    const ok = await anon.call(jobsRoute.POST, { path: "/api/internal/jobs/run", method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(ok.status).toBe(200);
    expect(ok.json).toHaveProperty("expiredFinalized");
  });
});

describe("uploads and media (§19.22, R3.13, R3.14)", () => {
  const PNG_1x1 = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082", "hex");
  const form = (bytes: Uint8Array, name: string, kind = "QUESTION_IMAGE") => {
    const f = new FormData();
    f.set("kind", kind);
    f.set("altText", "test image");
    f.set("file", new File([new Uint8Array(bytes)], name));
    return f;
  };

  it("rejects SVG/HTML even when named .png; accepts a real PNG", async () => {
    const { c } = await signIn("admin.sec");
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    expect((await c.call(mediaUploadRoute.POST, { path: "/api/v1/admin/media", form: form(svg, "evil.png") })).status).toBe(415);
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect((await c.call(mediaUploadRoute.POST, { path: "/api/v1/admin/media", form: form(html, "x.jpg") })).status).toBe(415);
    const ok = await c.call(mediaUploadRoute.POST, { path: "/api/v1/admin/media", form: form(PNG_1x1, "dot.png") });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ kind: "QUESTION_IMAGE", width: 1, height: 1 });
  });

  it("question images are private: anonymous and attempt-less students get 404; admins get no-store", async () => {
    const { c: ac } = await signIn("admin.sec");
    const up = await ac.call(mediaUploadRoute.POST, { path: "/api/v1/admin/media", form: form(PNG_1x1, "q.png") });
    const id = String(up.json?.id);
    expect((await new Client().call(mediaRoute.GET, { path: `/api/v1/media/${id}`, params: { id } })).status).toBe(404);
    const st = await makeStudent(cat.g9);
    const { c: sc } = await signIn(st.username);
    expect((await sc.call(mediaRoute.GET, { path: `/api/v1/media/${id}`, params: { id } })).status).toBe(404);
    const adminView = await ac.call(mediaRoute.GET, { path: `/api/v1/media/${id}`, params: { id } });
    expect(adminView.status).toBe(200);
    expect(adminView.headers.get("cache-control")).toContain("no-store");
    expect(adminView.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
