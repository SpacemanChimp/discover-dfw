/* Mobile horizontal-overflow assertion for /homes (and the homepage).
 *
 * Asserts document.documentElement.scrollWidth <= window.innerWidth + 1 at
 * phone widths 375 / 390 / 430 across the states that have historically
 * overflowed: initial list view, each filter popover open, after applying a
 * filter, and the mobile map view. Exit code 1 on any violation.
 *
 * Requires Playwright (not a repo dependency — install on demand):
 *   npm i -D playwright && npx playwright install chromium
 * Run against a local build or production:
 *   node scripts/checks/mobile-overflow-check.mjs [baseUrl]
 * Default baseUrl: http://localhost:3000
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
const WIDTHS = [375, 390, 430];

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    console.error(
      "SKIP: playwright is not installed. Run `npm i -D playwright && npx playwright install chromium` first."
    );
    process.exit(2);
  }
}

const overflow = async (page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollW: doc.scrollWidth, innerW: window.innerWidth, ok: doc.scrollWidth <= window.innerWidth + 1 };
  });

const openPopover = async (page, index) => {
  await page.locator('button[aria-haspopup="true"]').nth(index).click();
  await page.waitForTimeout(350);
};

const browser = await chromium.launch();
let failures = 0;
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  const check = async (state) => {
    const r = await overflow(page);
    const line = `${width}px · ${state}: scrollWidth ${r.scrollW} vs innerWidth ${r.innerW} — ${r.ok ? "OK" : "FAIL"}`;
    console.log(line);
    if (!r.ok) failures++;
  };

  await page.goto(`${BASE}/homes`, { waitUntil: "networkidle" });
  await check("list view");

  await openPopover(page, 0);
  await check("price open");
  await openPopover(page, 0); // close

  await openPopover(page, 1);
  await check("beds open");
  await openPopover(page, 1);

  await openPopover(page, 2);
  await check("filters open");
  await openPopover(page, 2);

  // apply a price filter through the real UI
  await openPopover(page, 0);
  await page.getByRole("button", { name: "UNDER $400K" }).click();
  await page.getByRole("button", { name: "APPLY" }).click();
  await page.waitForTimeout(800);
  await check("after applying UNDER $400K");

  // mobile map view
  const mapToggle = page.getByRole("button", { name: /MAP/ }).first();
  if (await mapToggle.isVisible().catch(() => false)) {
    await mapToggle.click();
    await page.waitForTimeout(1200);
    await check("map view");
  }

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await check("homepage");

  await page.close();
}
await browser.close();

if (failures) {
  console.error(`\n${failures} overflow assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll overflow assertions passed.");
