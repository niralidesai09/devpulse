import { expect, test, type Page } from "@playwright/test";

const PASS = process.env.E2E_ADMIN_PASSCODE;

/** Fail on browser console errors and failed same-origin requests. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    const url = new URL(r.url());
    if (url.origin === new URL(page.url() || "http://x").origin && r.status() >= 500) problems.push(`${r.status()} ${url.pathname}`);
  });
  return problems;
}

test("overview loads with real numbers and labelled sections @responsive", async ({ page }) => {
  const problems = watch(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("What developers are saying");
  await expect(page.getByText(/Reporting week/)).toBeVisible();
  await expect(page.getByText(/^Unique discussions/).first()).toBeVisible();
  await expect(page.getByText(/Last successful collection/)).toBeVisible();
  // No horizontal page scroll at any viewport.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});

test("every main page renders without server errors", async ({ page }) => {
  const problems = watch(page);
  for (const path of ["/pain-points", "/opportunities", "/discussions", "/reports", "/decisions", "/health", "/settings", "/architecture", "/login"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(problems).toEqual([]);
});

test("discussions have working, traceable source links", async ({ page }) => {
  await page.goto("/discussions?status=relevant");
  const first = page.locator("main li a[target=_blank]").first();
  test.skip((await first.count()) === 0, "No relevant discussions stored yet");
  const href = await first.getAttribute("href");
  expect(href).toMatch(/^https:\/\/(news\.ycombinator\.com|github\.com|stackoverflow\.com|dev\.to)\//);
  await expect(first).toHaveAttribute("rel", /noopener/);
  // The original source is reachable.
  const res = await page.request.get(href!, { failOnStatusCode: false, maxRedirects: 5 });
  expect([200, 301, 302, 403, 429]).toContain(res.status()); // 403/429 = source rate-limits bots, link still exists
  // Detail page separates author text from AI interpretation.
  await page.locator("main li").first().getByRole("link", { name: "Details" }).click();
  await expect(page.getByText("What the author wrote")).toBeVisible();
  await expect(page.getByText("Model interpretation")).toBeVisible();
});

test("explorer filters are applied through the URL", async ({ page }) => {
  await page.goto("/discussions");
  await page.locator("select[name=source]").selectOption("hackernews");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/source=hackernews/);
  const badges = page.locator("main li").filter({ hasText: "GitHub Issues" });
  expect(await badges.count()).toBe(0);
});

test("reports list and a previous report are accessible", async ({ page }) => {
  await page.goto("/reports");
  const open = page.getByRole("link", { name: "Open" }).first();
  test.skip((await open.count()) === 0, "No reports yet");
  await open.click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Developer Community Pulse");
  await expect(page.getByText("Data coverage, caveats and confidence")).toBeVisible();
  const md = await page.request.get(page.url().replace("/reports/", "/api/reports/") + "/export?format=md");
  expect(md.status()).toBe(200);
  expect(await md.text()).toContain("# Developer Community Pulse");
});

test("admin actions are refused without a session", async ({ request }) => {
  const run = await request.post("/api/runs", { data: {} });
  expect(run.status()).toBe(401);
  const rep = await request.post("/api/reports", { data: {} });
  expect(rep.status()).toBe(401);
  const cron = await request.get("/api/cron/weekly");
  expect(cron.status()).toBe(401);
});

test("health endpoint exposes configuration booleans only", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).not.toMatch(/AIza|sb_secret|ghp_|github_pat_|re_[A-Za-z0-9]{10}/);
  expect(JSON.parse(body).database.ok).toBe(true);
});

test.describe("admin flows", () => {
  test.skip(!PASS, "Set E2E_ADMIN_PASSCODE to run admin flows");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Passcode").fill(PASS!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Admin", { exact: true })).toBeVisible();
  });

  test("a wrong passcode is rejected", async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/login");
    await p.getByLabel("Passcode").fill("definitely wrong");
    await p.getByRole("button", { name: "Sign in" }).click();
    await expect(p.getByRole("alert").filter({ hasText: "not correct" })).toBeVisible();
    await ctx.close();
  });

  test("topics and keywords can be created, edited and removed", async ({ page }) => {
    const name = `E2E topic ${Date.now()}`;
    await page.goto("/settings");
    await page.getByLabel("Topic name").fill(name);
    await page.getByLabel(/^Keywords/).fill(`e2e keyword ${Date.now()}`);
    await page.getByRole("button", { name: "Create topic" }).click();
    await expect(page.getByText(/Created “E2E topic/)).toBeVisible();
    const card = page.locator("article").filter({ hasText: name });
    await card.getByLabel(`Add keywords to ${name}`).fill("e2e second keyword");
    await card.getByRole("button", { name: "Add" }).click();
    await expect(card.getByText("e2e second keyword")).toBeVisible();
    // duplicate keyword is rejected
    await card.getByLabel(`Add keywords to ${name}`).fill("E2E Second Keyword");
    await card.getByRole("button", { name: "Add" }).click();
    await expect(card.getByText(/already monitored/)).toBeVisible();
    // clean up: archive then delete
    page.on("dialog", (d) => d.accept());
    await card.getByRole("button", { name: "Archive" }).click();
    const archived = page.locator("article").filter({ hasText: name });
    await archived.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("article").filter({ hasText: name })).toHaveCount(0);
  });

  test("a collection can be triggered and reports progress", async ({ page }) => {
    test.skip(!process.env.E2E_TRIGGER_RUN, "Set E2E_TRIGGER_RUN=1 to start a real collection (uses API quota)");
    test.setTimeout(330_000);
    await page.goto("/health");
    await page.getByRole("button", { name: "Run collection now" }).click();
    await expect(page.getByText(/Collecting|Analysing|Writing|Starting/)).toBeVisible();
    await expect(page.getByText(/Run finished|Run failed/)).toBeVisible({ timeout: 320_000 });
  });
});

test("no page scrolls horizontally on a phone @responsive", async ({ page }) => {
  for (const path of ["/", "/pain-points", "/opportunities", "/discussions", "/reports", "/decisions", "/health", "/settings", "/architecture"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
