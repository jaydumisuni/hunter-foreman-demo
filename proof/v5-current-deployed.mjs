import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const U = process.env.HUNTER_URL;
if (!U) throw new Error('HUNTER_URL_REQUIRED');

const V = process.env.VIEWPORT || 'phone';
const S = {
  phone: [390, 844, true],
  tablet: [820, 1180, true],
  desktop: [1440, 900, false],
  wide: [1920, 1080, false],
};
if (!S[V]) throw new Error(`UNKNOWN_VIEWPORT ${V}`);

const [w, h, m] = S[V];
const out = 'proof-output';
const checks = [];
const findings = [];
fs.mkdirSync(out, { recursive: true });

const log = (name, ok, detail = {}) => {
  checks.push({ name, ok, ...detail });
  if (!ok) findings.push({ name, ...detail });
  fs.writeFileSync(
    path.join(out, 'report.json'),
    JSON.stringify({ viewport: V, url: U, passed: findings.length === 0, findings, checks }, null, 2),
  );
};

const seen = (page, selector) => page.locator(selector).first().isVisible().catch(() => false);
const active = (page) => page.locator('[data-page-render]').getAttribute('data-page-render').catch(() => null);
const drawer = (page) => page.locator('#sidebar').evaluate((e) => e.classList.contains('open')).catch(() => false);

async function click(page, selector) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 5000 });
  await el.scrollIntoViewIfNeeded();
  await el.click();
}

async function back(page) {
  if (m && !(await drawer(page))) await click(page, '#menuBtn');
  for (const selector of ['[data-chat-back]', '.approved-chat-back', '#chatBack', '#sidebar button[aria-label*="back" i]']) {
    if (await seen(page, selector)) {
      await click(page, selector);
      await page.waitForTimeout(150);
      return true;
    }
  }
  return false;
}

async function go(page, key) {
  if ((await active(page)) === 'hunter') log(`back-${key}`, await back(page));
  if (m && !(await drawer(page))) await click(page, '#menuBtn');
  await click(page, `#nav [data-page="${key}"]`);
  await page.waitForTimeout(180);
  log(`route-${key}`, (await active(page)) === key, { active: await active(page) });
  if (m) log(`drawer-${key}`, !(await drawer(page)));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: w, height: h },
  isMobile: m,
  hasTouch: m,
  deviceScaleFactor: m ? 2 : 1,
});
const page = await context.newPage();
const errors = [];
const writes = [];

page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (entry) => {
  if (entry.type() === 'error') errors.push(entry.text());
});
page.on('request', (request) => {
  if (!['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`);
});

try {
  const healthResponse = await fetch(`${U}/health`);
  log('health-http', healthResponse.ok, { status: healthResponse.status });
  const health = await healthResponse.json();
  log('v5-version', health.version === 'HUNTER_EMPLOYEE_OS_APPROVED_WORKSPACE_V5', { actual: health.version });
  log('frozen-v4-sha', health.v4HtmlSha256 === 'd243eb867e73e7c1a26fbf4552766814b77e8c95f6e4bf233b2dd688efa40c57', { actual: health.v4HtmlSha256 });
  log(
    'tracking-authority-visual-fix',
    health.visualFixVersion === 'HUNTER_EMPLOYEE_OS_V5_TRACKING_AUTHORITY_AND_BROWSER_MODAL_ICON_FIX',
    { actual: health.visualFixVersion },
  );
  log('production-untouched', health.production === 'untouched', { actual: health.production });

  await page.goto(`${U}/portal`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => globalThis.__HUNTER_V5_OWNER_CORRECTIONS__, null, { timeout: 7000 });
  await page.waitForTimeout(250);

  log('starts-talk-to-hunter', (await active(page)) === 'hunter', { active: await active(page) });
  log('back-to-role', await back(page));
  log('role-selector-visible', await seen(page, '#roleSelect'));
  if (await seen(page, '#roleSelect')) {
    const options = await page.locator('#roleSelect option').evaluateAll((items) => items.map((o) => o.value).filter(Boolean));
    const value = options.find((x) => x !== 'owner') || options[0];
    await page.locator('#roleSelect').selectOption(value);
    await page.waitForTimeout(200);
    log('role-change-lands-hunter', (await active(page)) === 'hunter', { active: await active(page), role: value });
  }

  log('browser-icon-visible', await seen(page, '#v5BrowserBtn'));
  await click(page, '#v5BrowserBtn');
  log('browser-truthful-disconnected', /no connected browser session|not connected/i.test(await page.locator('#v5BrowserModal').innerText()));
  const iconBox = await page.locator('#v5BrowserModal .v5-modal-head>svg').boundingBox();
  log('browser-header-icon-size', !!iconBox && iconBox.width <= 30 && iconBox.height <= 30, { box: iconBox });
  await page.screenshot({ path: path.join(out, `${V}-browser.png`), fullPage: true });
  await page.locator('#v5BrowserModal [data-v5-close]').click();

  await go(page, 'inbox');
  log('whatsapp-inbox-surface', await seen(page, '[data-v5-surface="inbox"]'));
  log('conversation-tab-visible', await seen(page, '[data-v5-inbox-view="conversation"]'));
  log('respond-tab-visible', await seen(page, '[data-v5-inbox-view="respond"]'));
  await page.screenshot({ path: path.join(out, `${V}-whatsapp.png`), fullPage: true });
  await click(page, '[data-v5-inbox-view="respond"]');
  log('respond-compact-context', await seen(page, '.v5-wa-context') && (await page.locator('.v5-wa-conversation').count()) === 0);
  for (const mode of ['assisted', 'employee', 'alternative']) {
    log(`reply-mode-${mode}`, (await page.locator(`[data-v5-mode="${mode}"]`).count()) === 1);
  }
  await click(page, '[data-v5-takeover]');
  log('return-assisted-control', /Return assisted/.test(await page.locator('[data-v5-takeover]').innerText()));
  await click(page, '[data-v5-confirm]');
  log('send-is-review-only', /Review only/.test(await page.locator('.v5-toast').innerText()));
  await page.screenshot({ path: path.join(out, `${V}-respond.png`), fullPage: true });

  await go(page, 'tracking');
  log('tracking-surface', await seen(page, '[data-v5-surface="tracking"]'));
  const trackingText = await page.locator('[data-v5-surface="tracking"]').innerText();
  const trackingLower = trackingText.toLowerCase();
  for (const required of [
    'Tracking Operations', 'D1 jobs', 'Selected job', 'Stage', 'Location', 'Shipping cost', 'Update note',
    'Update D1', 'Link phone', 'Carrier tracking', 'Job truth', 'PAYMENT_SUBMITTED',
    'WhatsApp/screenshots/claims do not mark PAID', 'Pay Gateway',
  ]) {
    log(`tracking-${required}`, trackingLower.includes(required.toLowerCase()));
  }
  const pathValue = await page.locator('[data-v5-surface="tracking"] input[readonly]').last().inputValue();
  log('tracking-authority-field', pathValue === 'https://tracking.thetechguyds.com', { actual: pathValue });
  log('tracking-authority-visible', trackingText.includes('https://tracking.thetechguyds.com'));
  const html = await page.content();
  log('legacy-tracking-path-absent', !html.includes('thetechguyds.com/track/TTG-0007') && !html.includes('value="/track/TTG-0007"'));
  await click(page, '[data-v5-track-action="Update D1"]');
  log('tracking-write-is-review-only', /Review only/.test(await page.locator('.v5-toast').innerText()));
  await page.screenshot({ path: path.join(out, `${V}-tracking.png`), fullPage: true });

  log('no-horizontal-overflow', await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));
  await go(page, 'hunter');
  await click(page, '#bellBtn');
  log('bell', await seen(page, '#notificationPopover'));
  await page.locator('#bellBtn').click();
  await click(page, '#voiceBtn');
  log('hunter-voice', /Hunter Voice/.test(await page.locator('#modalRoot').innerText().catch(() => '')));
  log('runtime-errors', errors.length === 0, { errors });
  log('no-review-writes', writes.length === 0, { writes });
  await page.screenshot({ path: path.join(out, `${V}-final.png`), fullPage: true });
} catch (error) {
  log('uncaught', false, { error: String(error) });
} finally {
  await context.close();
  await browser.close();
}

console.log(JSON.stringify({ viewport: V, passed: findings.length === 0, findings: findings.length, checks: checks.length }));
if (findings.length) process.exit(1);
