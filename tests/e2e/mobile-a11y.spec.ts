import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * §19.26 / §23.3: automated WCAG 2.x A/AA checks (axe), keyboard operation of answer options,
 * Sinhala default text, both themes, on desktop and a Pixel 5 viewport. Manual screen-reader checks
 * are recorded separately in docs/accessibility-report.md.
 */
async function axe(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.help}`)).toEqual([]);
}

async function studentLogin(page: Page, theme: "light" | "dark") {
  await page.context().addCookies([{ name: "ep_theme", value: theme, url: "http://localhost:3100" }]);
  await page.goto("/login");
  await axe(page, `login-${theme}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "si"); // Sinhala is the default
  // A pre-hydration native submit must never place the password in the URL.
  await expect(page.locator("main form")).toHaveAttribute("method", "post");
  await page.locator("#username").fill("EP90002");
  await page.locator("#password").fill("Student-Pass-1");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/student$/);
}

for (const theme of ["light", "dark"] as const) {
  test(`student journey is accessible and keyboard operable (${theme})`, async ({ page }) => {
    await studentLogin(page, theme);
    await axe(page, `dashboard-${theme}`);
    await page.getByRole("link", { name: /DEMO Grade 9 Science/ }).click();
    await axe(page, `landing-${theme}`);
    await page.locator("main button").first().click(); // start/resume practice
    await expect(page).toHaveURL(/\/attempts\//);
    await expect(page.getByRole("radio").first()).toBeAttached();
    await axe(page, `attempt-${theme}`);

    // Keyboard: focus the option group and change the answer with arrow keys.
    const radios = page.getByRole("radio");
    await radios.first().focus();
    await page.keyboard.press("Space");
    await expect(radios.first()).toBeChecked();
    await page.keyboard.press("ArrowDown");
    await expect(radios.nth(1)).toBeChecked();

    // No horizontal overflow on narrow screens (Sinhala text must wrap, not clip).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("offline state is reported truthfully and answers are kept locally", async ({ page, context }) => {
  await studentLogin(page, "light");
  await page.getByRole("link", { name: /DEMO Grade 9 Science/ }).click();
  await page.locator("main button").first().click();
  await expect(page).toHaveURL(/\/attempts\//);
  await context.setOffline(true);
  // The practice attempt may be resumed from an earlier project run: choose an option that is NOT
  // already selected, so a real change happens while offline.
  const radios = page.getByRole("radio");
  let target = 0;
  for (let i = 0; i < 4; i++) if (!(await radios.nth(i).isChecked())) { target = i; break; }
  await radios.nth(target).check();
  await expect(page.getByRole("status").filter({ hasText: /සම්බන්ධතාවය නැත|සුරැකීම අසාර්ථකයි/ })).toBeVisible({ timeout: 20_000 });
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ep:pending:")).length);
  expect(stored).toBe(1);
  await context.setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "සුරැකිණි" })).toBeVisible({ timeout: 40_000 });
});
