import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

/**
 * §19.25: admin signs in → creates exam → imports CSV → fixes an error → previews → publishes →
 * student signs in → starts → saves → refreshes → submits → views permitted result → sees rank on THIS exam.
 *
 * Fixture tests/fixtures/csv/e2e-one-error.csv: Q1 key C (1 mark), Q2 key "E" (invalid → fixed to B, 1 mark),
 * Q3 key C (2 marks). The student answers C, B, A → independently expected score 2 / 4.
 */
const TITLE = `E2E Ranked ${Date.now()}`;

async function signIn(page: Page, id: string, password: string) {
  await page.context().addCookies([{ name: "ep_lang", value: "en", url: "http://localhost:3100" }]);
  await page.goto("/login");
  await page.getByLabel("Student ID or username").fill(id);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("admin publishes a CSV exam; student takes it with save, refresh, submit, result and per-exam rank", async ({ page, browser }) => {
  // ── Admin ──
  await signIn(page, "e2e.admin", "Admin-Pass-1");
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: "New exam" }).first().click();
  await page.getByLabel("Title").fill(TITLE);
  await page.getByLabel("Grade", { exact: true }).selectOption({ label: "Grade 9" });
  const tomorrow = new Date(Date.now() + 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 16);
  await page.getByLabel("Closes at (required)").fill(tomorrow);
  await page.getByRole("button", { name: "Create exam" }).click();
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();

  await page.getByRole("link", { name: "Import questions from CSV" }).click();
  await page.getByLabel("CSV file").setInputFiles(path.join(__dirname, "..", "fixtures", "csv", "e2e-one-error.csv"));
  await page.getByRole("button", { name: "Upload and validate" }).click();
  await expect(page.getByText(/3 rows · 2 valid · 1 error/)).toBeVisible();
  await expect(page.getByText(/correct_option must be A, B, C or D/)).toBeVisible();
  const addBtn = page.getByRole("button", { name: /Add \d+ questions to the draft/ });
  await expect(addBtn).toBeDisabled();

  // Fix the invalid answer key in the preview, revalidate, then commit.
  await page.locator("#r3-correct_option").fill("B");
  await page.getByRole("button", { name: "Revalidate changes" }).click();
  await expect(page.getByText(/3 rows · 3 valid · 0 error/)).toBeVisible();
  await page.getByRole("button", { name: "Add 3 questions to the draft" }).click();
  await expect(page.getByText("3 questions added to the draft exam.", { exact: false })).toBeVisible();

  await page.getByRole("link", { name: "Preview exam" }).click();
  await expect(page.getByText("3 questions · 4 marks")).toBeVisible();
  await expect(page.getByText("ශ්‍රී ලංකාවේ අගනුවර කුමක්ද?")).toBeVisible(); // Sinhala renders
  await page.getByRole("link", { name: "Back to exam" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish exam" }).click();
  await expect(page.getByText("PUBLISHED").first()).toBeVisible();
  const link = (await page.locator("p.font-mono").first().textContent())!.trim();
  const slug = link.split("/exams/")[1]!;

  // ── Student (separate browser context = separate device) ──
  const ctx = await browser.newContext();
  const s = await ctx.newPage();
  await s.context().addCookies([{ name: "ep_lang", value: "en", url: "http://localhost:3100" }]);
  await s.goto(`/exams/${slug}`);
  await expect(s).toHaveURL(/\/login\?returnTo=/); // return URL preserved through login
  await s.getByLabel("Student ID or username").fill("EP90001");
  await s.getByLabel("Password").fill("Student-Pass-1");
  await s.getByRole("button", { name: "Sign in" }).click();
  await expect(s.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(s.getByText("You have one official attempt.", { exact: false })).toBeVisible();
  await s.getByRole("button", { name: "Start exam" }).click();
  await expect(s).toHaveURL(/\/attempts\//);

  await s.getByRole("radio", { name: /C\. 13/ }).check();
  await expect(s.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await s.getByRole("button", { name: /Next/ }).click();
  await s.getByRole("radio", { name: /B\. ශ්‍රී ජයවර්ධනපුර කෝට්ටේ/ }).check();
  await expect(s.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });

  // Refresh: same attempt, saved selections restored.
  await s.reload();
  await expect(s.getByRole("radio", { name: /C\. 13/ })).toBeChecked();
  await s.getByRole("button", { name: /Go to question 3/ }).click();
  await s.getByRole("radio", { name: /^A\./ }).check(); // wrong on purpose, then submit immediately
  await s.getByRole("button", { name: "Review and submit" }).first().click();
  await expect(s.getByText("You have answered every question.")).toBeVisible();
  await s.getByRole("button", { name: "Submit now" }).click();

  await expect(s).toHaveURL(/\/result$/);
  await expect(s.getByText("2 / 4")).toBeVisible();
  await expect(s.getByText(/Correct answers and explanations will be shown from/)).toBeVisible();
  await s.getByRole("link", { name: "Leaderboard" }).click();
  await expect(s.getByText(TITLE)).toBeVisible();
  await expect(s.getByText(/Your rank: 1 of 1/)).toBeVisible();
  await expect(s.getByText(/Provisional ranking/)).toBeVisible();
  await ctx.close();
});
