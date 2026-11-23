/**
 * UI review helper (local only): captures key screens at phone and desktop sizes, light and dark.
 *   npx tsx scripts/ui-snapshots.ts <baseUrl> <outDir>
 * Requires the dev database with demo data and `npm run dev:credentials`.
 */
import { chromium, devices, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3200";
const OUT = process.argv[3] ?? "test-results/ui";
const VIEWPORTS = { phone: devices["Pixel 5"], desktop: { viewport: { width: 1366, height: 860 } } } as const;

async function login(page: Page, id: string, pw: string) {
  await page.goto(`${BASE}/login`);
  await page.locator("#username").fill(id);
  await page.locator("#password").fill(pw);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/(student|admin)/);
}

async function shoot(page: Page, name: string, full = true) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
}

async function run(browser: Browser, vp: keyof typeof VIEWPORTS, theme: "light" | "dark") {
  const tag = `${vp}-${theme}`;
  const ctx = await browser.newContext({ ...VIEWPORTS[vp] });
  await ctx.addCookies([{ name: "ep_theme", value: theme, url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await shoot(page, `${tag}-01-login`);
  await login(page, "EP90003", "Student-Local-1");
  await shoot(page, `${tag}-02-dashboard`);
  await page.getByRole("link", { name: /DEMO Grade 9 Science/ }).click();
  await page.waitForURL(/\/exams\//);
  await shoot(page, `${tag}-03-landing`);
  await page.locator("main button").first().click();
  await page.waitForURL(/\/attempts\//);
  await page.getByRole("radio").first().waitFor({ state: "attached" });
  await shoot(page, `${tag}-04-attempt`, false);
  await shoot(page, `${tag}-04b-attempt-full`);
  await ctx.close();

  const actx = await browser.newContext({ ...VIEWPORTS[vp] });
  await actx.addCookies([{ name: "ep_theme", value: theme, url: BASE }]);
  const a = await actx.newPage();
  await login(a, "admin.local", "Admin-Local-1");
  await shoot(a, `${tag}-10-admin-overview`);
  await a.goto(`${BASE}/admin/exams`);
  await shoot(a, `${tag}-11-admin-exams`);
  await a.goto(`${BASE}/admin/students`);
  await shoot(a, `${tag}-12-admin-students`);
  await actx.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const vp of ["phone", "desktop"] as const) for (const theme of ["light", "dark"] as const) await run(browser, vp, theme);
  await browser.close();
  console.log(`screenshots written to ${OUT}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
