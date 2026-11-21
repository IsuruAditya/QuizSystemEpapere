/**
 * e-Paperé Exams capacity scenarios (§18). Select with SCENARIO=..., size with PROFILE=smoke|normal|spike|soak|stress.
 *
 *   k6 run -e BASE_URL=https://staging.example -e LOAD_PASSWORD=... -e EXAM_SLUG=... \
 *          -e SCENARIO=save_envelope -e PROFILE=smoke load/k6/scenarios.js
 *
 * SCENARIO values:
 *   logins         5,000 distinct logins over ~60 s (real scrypt verification + session)
 *   start_burst    5,000 attempt starts over ~30 s (includes duplicate start requests)
 *   exam_session   5,000 students over a 60-minute exam: reading time, answer changes, saves, reconnects, submit
 *   save_envelope  ~333 saves/s for 10 min = 5,000 clients saving every 15 s (a test envelope, not the algorithm)
 *   submit_burst   5,000 submissions over ~10 s with duplicate clicks, a retry and result retrieval
 *   expiry         many attempts left open ("closed browsers"); afterwards run the job runner and verify
 *   reads          leaderboard reads + one admin CSV export during student activity
 *
 * Never run against a live student exam without explicit authorisation.
 */
import http from "k6/http";
import { sleep } from "k6";
import exec from "k6/execution";
import { BASE, SLUG, THRESHOLDS, getAttempt, login, save, scale, start, submit, uuid } from "./lib.js";

const S = __ENV.SCENARIO || "save_envelope";
// Explicit STUDENTS / RATE override the profile scaling (used for smoke runs of the harness itself).
const N = __ENV.STUDENTS ? Number(__ENV.STUDENTS) : scale(5000);
const RATE = __ENV.RATE ? Number(__ENV.RATE) : scale(333);

const defs = {
  logins: { executor: "shared-iterations", vus: Math.min(N, 1000), iterations: N, maxDuration: "3m", exec: "logins" },
  start_burst: { executor: "shared-iterations", vus: Math.min(N, 1000), iterations: N, maxDuration: "2m", exec: "startBurst" },
  exam_session: { executor: "per-vu-iterations", vus: N, iterations: 1, maxDuration: "75m", exec: "examSession" },
  save_envelope: { executor: "constant-arrival-rate", rate: RATE, timeUnit: "1s", duration: __ENV.DURATION || "10m", preAllocatedVUs: Math.min(N, 2000), maxVUs: N, exec: "saveEnvelope" },
  submit_burst: { executor: "shared-iterations", vus: Math.min(N, 1000), iterations: N, maxDuration: "2m", exec: "submitBurst" },
  expiry: { executor: "shared-iterations", vus: Math.min(N, 500), iterations: N, maxDuration: "5m", exec: "abandon" },
  reads: { executor: "constant-arrival-rate", rate: scale(50), timeUnit: "1s", duration: "5m", preAllocatedVUs: 100, maxVUs: 500, exec: "reads" },
};

// noCookiesReset: a VU keeps its own session cookie across iterations, like a real browser
// (k6 otherwise clears the jar every iteration, which turned reused sessions into 401s).
export const options = { scenarios: { [S]: defs[S] }, thresholds: THRESHOLDS, setupTimeout: "30m", noCookiesReset: true };

/** Unique student per iteration/VU: never a shared account or attempt row. */
const nth = () => (exec.scenario.iterationInTest % N) + 1;
/** Student for a long-lived VU session; wraps so VU ids above N never use non-existent accounts. */
const vuStudent = () => ((exec.vu.idInTest - 1) % N) + 1;

export function logins() {
  login(nth());
}

export function startBurst() {
  login(nth());
  const a = start();
  if (Math.random() < 0.2) start(); // double-click: must return the same attempt
  return a;
}

export function examSession() {
  const n = exec.vu.idInTest;
  login(n);
  let a = start();
  if (!a) return;
  let { attemptId, controllerToken: token } = a;
  let view = getAttempt(attemptId);
  if (!view) return;
  let rev = view.revision;
  const qs = view.questions;
  const deadline = Date.now() + 58 * 60_000;
  for (let i = 0; i < qs.length && Date.now() < deadline; i++) {
    sleep(60 + Math.random() * 120); // reading time
    const q = qs[i];
    rev = save(attemptId, token, rev, [{ examQuestionId: q.examQuestionId, optionId: q.options[Math.floor(Math.random() * 4)].id }]);
    if (Math.random() < 0.15) rev = save(attemptId, token, rev, [{ examQuestionId: q.examQuestionId, optionId: q.options[0].id }]); // change of mind
    if (Math.random() < 0.03) {
      // reconnect / refresh: resume via start (takeover) and reread state
      a = start();
      if (a && a.controllerToken) token = a.controllerToken;
      view = getAttempt(attemptId);
      if (view) rev = view.revision;
    }
  }
  submit(attemptId, token, rev, uuid());
}

// save_envelope: each iteration = one save by one of N prepared sessions (set up lazily per VU).
const sessions = {};
export function saveEnvelope() {
  const vu = exec.vu.idInTest;
  let s = sessions[vu];
  if (!s) {
    login(vuStudent()); // maxVUs = N, so each VU owns exactly one prepared student and attempt
    const a = start();
    const v = a && getAttempt(a.attemptId);
    if (!v) return;
    s = sessions[vu] = { id: a.attemptId, token: a.controllerToken, rev: v.revision, qs: v.questions };
  }
  const q = s.qs[Math.floor(Math.random() * s.qs.length)];
  s.rev = save(s.id, s.token, s.rev, [{ examQuestionId: q.examQuestionId, optionId: q.options[Math.floor(Math.random() * 4)].id }]);
}

export function submitBurst() {
  login(nth());
  const a = start();
  if (!a) return;
  const v = getAttempt(a.attemptId);
  if (!v || v.status !== "IN_PROGRESS") return;
  const mid = uuid();
  submit(a.attemptId, a.controllerToken, v.revision, mid);
  if (Math.random() < 0.2) submit(a.attemptId, a.controllerToken, v.revision, mid); // duplicate click / retry
  http.get(`${BASE}/api/v1/attempts/${a.attemptId}/result`, { tags: { name: "result" } });
}

export function abandon() {
  login(nth());
  const a = start();
  if (!a) return;
  const v = getAttempt(a.attemptId);
  if (v && v.questions.length) save(a.attemptId, a.controllerToken, v.revision, [{ examQuestionId: v.questions[0].examQuestionId, optionId: v.questions[0].options[0].id }]);
  // Browser "closed": no submit. Verify reconciliation separately (docs/load-test-report.md, expiry procedure).
}

export function reads() {
  const vu = exec.vu.idInTest;
  if (!sessions[`r${vu}`]) {
    login(((vu - 1) % N) + 1); // more reader VUs than prepared students: reuse accounts read-only
    sessions[`r${vu}`] = true;
  }
  http.get(`${BASE}/api/v1/exams/${SLUG}/leaderboard?page=1&pageSize=50`, { tags: { name: "leaderboard" } });
  if (__ENV.ADMIN_COOKIE && exec.scenario.iterationInTest === 100) {
    http.get(`${BASE}/api/v1/admin/exams/${__ENV.EXAM_ID}/results.csv`, { headers: { Cookie: __ENV.ADMIN_COOKIE, Origin: BASE }, tags: { name: "admin_export" }, timeout: "60s" });
  }
}

export function handleSummary(data) {
  const out = `load/results/${S}-${__ENV.PROFILE || "smoke"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  return { [out]: JSON.stringify(data, null, 2), stdout: `\nScenario ${S} (${__ENV.PROFILE || "smoke"}), students=${N}. Summary saved to ${out}\n` };
}
