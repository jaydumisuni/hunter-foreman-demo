import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.HUNTER_URL || 'https://0c3199d8-hunter-ui-review.thetechguy712.workers.dev';
const EXPECTED_COMMIT = 'f2eefdb4909daa2ac962130e4b1a97b1b8dbea83';
const EXPECTED_V4_SHA = 'd243eb867e73e7c1a26fbf4552766814b77e8c95f6e4bf233b2dd688efa40c57';
const NAME = process.env.VIEWPORT || 'phone';
const defs = {
  phone: [390, 844, true],
  tablet: [820, 1180, true],
  desktop: [1440, 900, false],
  wide: [1920, 1080, false],
};
if (!defs[NAME]) throw new Error(`Unknown VIEWPORT ${NAME}`);
const [W, H, MOBILE] = defs[NAME];
const OUT = 'proof-output';
fs.mkdirSync(OUT, { recursive: true });
const evidence = [];
const findings = [];

function save() {
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
    url: BASE,
    expectedCommit: EXPECTED_COMMIT,
    viewport: NAME,
    passed: findings.length === 0,
    findings,
    evidenceCount: evidence.length,
    evidence,
  }, null, 2));
}
function rec(phase, ok, detail = {}) {
  evidence.push({ phase, ok, ...detail });
  if (!ok) findings.push({ phase, ...detail });
  save();
}
async function visible(page, selector) {
  return page.locator(selector).first().isVisible().catch(() => false);
}
async function drawerOpen(page) {
  return page.locator('#sidebar').evaluate(el => el.classList.contains('open')).catch(() => false);
}
async function tap(page, selector, phase) {
  try {
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible', timeout: 5000 });
    await target.scrollIntoViewIfNeeded();
    await target.click({ timeout: 5000 });
    rec(phase, true, { selector });
    return true;
  } catch (error) {
    rec(phase, false, { selector, error: String(error) });
    return false;
  }
}
async function activeRoute(page) {
  return page.locator('[data-page-render]').getAttribute('data-page-render').catch(() => null);
}
async function openRoute(page, target) {
  if (MOBILE && !await drawerOpen(page)) await tap(page, '#menuBtn', `drawer:${target}`);
  const selector = `#nav [data-page="${target}"]`;
  if (!await tap(page, selector, `route:${target}`)) return false;
  await page.waitForTimeout(220);
  const active = await activeRoute(page);
  rec(`route-state:${target}`, active === target, { active });
  if (MOBILE) rec(`drawer-closed:${target}`, !await drawerOpen(page));
  return active === target;
}
async function fresh(browser) {
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    isMobile: MOBILE,
    hasTouch: MOBILE,
    deviceScaleFactor: MOBILE ? 2 : 1,
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  const failedRequests = [];
  const writeRequests = [];
  page.on('pageerror', error => runtimeErrors.push(`page:${error.message}`));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(`console:${message.text()}`); });
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`));
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writeRequests.push(`${request.method()} ${request.url()}`); });
  await page.goto(`${BASE}/portal`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => globalThis.__HUNTER_V5_OWNER_CORRECTIONS__?.version === 'HUNTER_EMPLOYEE_OS_APPROVED_WORKSPACE_V5_OWNER_CORRECTIONS', null, { timeout: 7000 });
  await page.waitForTimeout(350);
  return { context, page, runtimeErrors, failedRequests, writeRequests };
}
async function closeModal(page) {
  for (const selector of ['#modalRoot [data-close]', '#modalWrap [data-close]', '[data-close]']) {
    const button = page.locator(selector).first();
    if (await button.count() && await button.isVisible().catch(() => false)) { await button.click().catch(() => {}); return; }
  }
}
async function preflight() {
  const health = await fetch(`${BASE}/health`);
  let json = {};
  try { json = await health.json(); } catch {}
  rec('health-200', health.status === 200, { status: health.status, body: json });
  rec('health-version-v5', json.version === 'HUNTER_EMPLOYEE_OS_APPROVED_WORKSPACE_V5', { actual: json.version });
  rec('health-v4-frozen-sha', json.v4HtmlSha256 === EXPECTED_V4_SHA, { actual: json.v4HtmlSha256 });
  rec('health-v5-sha-present', typeof json.htmlSha256 === 'string' && json.htmlSha256.length === 64, { actual: json.htmlSha256 });
  rec('production-boundary', json.production === 'untouched', { actual: json.production });

  const response = await fetch(`${BASE}/portal`);
  const html = await response.text();
  rec('portal-200', response.status === 200, { status: response.status });
  rec('review-header-v5', response.headers.get('x-hunter-review') === 'approved-workspace-v5', { actual: response.headers.get('x-hunter-review') });
  rec('portal-v4-frozen-sha', response.headers.get('x-hunter-v4-html-sha256') === EXPECTED_V4_SHA, { actual: response.headers.get('x-hunter-v4-html-sha256') });
  rec('portal-v5-sha-matches-health', response.headers.get('x-hunter-html-sha256') === json.htmlSha256, { header: response.headers.get('x-hunter-html-sha256'), health: json.htmlSha256 });
  for (const marker of [
    'HUNTER_EMPLOYEE_OS_V4_WORKSPACE',
    'HUNTER_EMPLOYEE_OS_V5_OWNER_CORRECTIONS',
    'Maya + Hunter', 'Employee reply', 'Propose alternative', 'Confirm & send',
    'D1 jobs', 'Selected job', 'Update D1', 'Link phone', 'Carrier tracking',
    'WhatsApp/screenshots/claims do not mark PAID', 'Hunter Browser', 'no connected browser session',
  ]) rec(`marker:${marker}`, html.includes(marker));
}

async function laneInitialAndRole(browser) {
  const item = await fresh(browser); const { context, page, runtimeErrors, failedRequests, writeRequests } = item;
  const initial = await activeRoute(page);
  rec('initial-department-lands-hunter', initial === 'hunter', { active: initial });
  const role = page.locator('#roleSelect');
  if (await role.count()) {
    const options = await role.locator('option').evaluateAll(options => options.map(o => o.value).filter(Boolean));
    const target = options.find(v => v !== 'owner') || options[0];
    if (target) {
      if (MOBILE && !await drawerOpen(page)) await tap(page, '#menuBtn', 'role-drawer-open');
      await role.selectOption(target);
      await page.waitForTimeout(250);
      rec('role-change-lands-hunter', await activeRoute(page) === 'hunter', { role: target, active: await activeRoute(page) });
      if (MOBILE && await drawerOpen(page)) await page.locator('#scrim').click().catch(() => {});
    }
  } else rec('role-change-lands-hunter', false, { error: '#roleSelect missing' });
  rec('initial-runtime', runtimeErrors.length === 0, { runtimeErrors });
  rec('initial-network', failedRequests.length === 0, { failedRequests });
  rec('initial-no-writes', writeRequests.length === 0, { writeRequests });
  await page.screenshot({ path: path.join(OUT, `${NAME}-hunter-landing.png`), fullPage: true });
  await context.close();
}

async function laneBrowser(browser) {
  const { context, page, runtimeErrors, failedRequests, writeRequests } = await fresh(browser);
  rec('browser-icon-visible', await visible(page, '#v5BrowserBtn'));
  await tap(page, '#v5BrowserBtn', 'browser-open');
  rec('browser-modal-visible', await visible(page, '#v5BrowserModal'));
  const text = await page.locator('#v5BrowserModal').innerText().catch(() => '');
  rec('browser-truthful-no-session', text.includes('no connected browser session') || text.includes('not connected'), { text });
  await page.screenshot({ path: path.join(OUT, `${NAME}-browser.png`), fullPage: true });
  await page.locator('#v5BrowserModal [data-v5-close]').click().catch(() => {});
  rec('browser-runtime', runtimeErrors.length === 0, { runtimeErrors });
  rec('browser-network', failedRequests.length === 0, { failedRequests });
  rec('browser-no-writes', writeRequests.length === 0, { writeRequests });
  await context.close();
}

async function laneInbox(browser) {
  const { context, page, runtimeErrors, failedRequests, writeRequests } = await fresh(browser);
  await openRoute(page, 'inbox');
  rec('whatsapp-surface-visible', await visible(page, '[data-v5-surface="inbox"]'));
  const conversationText = await page.locator('[data-v5-surface="inbox"]').innerText().catch(() => '');
  for (const required of ['WhatsApp', 'Conversation', 'Respond', 'Maya + Hunter']) rec(`inbox:${required}`, conversationText.includes(required), { text: conversationText });
  await page.screenshot({ path: path.join(OUT, `${NAME}-whatsapp-conversation.png`), fullPage: true });
  await tap(page, '[data-v5-inbox-view="respond"]', 'inbox-respond-switch');
  await page.waitForTimeout(80);
  rec('respond-compact-context', await visible(page, '.v5-wa-context'));
  rec('respond-no-stacked-conversation', await page.locator('.v5-wa-conversation').count() === 0, { count: await page.locator('.v5-wa-conversation').count() });
  for (const mode of ['assisted', 'employee', 'alternative']) rec(`respond-mode:${mode}`, await page.locator(`[data-v5-mode="${mode}"]`).count() === 1);
  await tap(page, '[data-v5-mode="employee"]', 'respond-employee-mode');
  rec('respond-employee-active', (await page.locator('[data-v5-mode="employee"]').getAttribute('class').catch(() => '')).includes('active'));
  await tap(page, '[data-v5-takeover]', 'respond-takeover');
  rec('respond-return-assisted', (await page.locator('[data-v5-takeover]').innerText().catch(() => '')).includes('Return assisted'));
  await tap(page, '[data-v5-takeover]', 'respond-return-assisted-click');
  rec('respond-takeover-restored', (await page.locator('[data-v5-takeover]').innerText().catch(() => '')).includes('Take over'));
  await tap(page, '[data-v5-confirm]', 'respond-confirm-send');
  rec('respond-confirm-truthful-review-only', (await page.locator('.v5-toast').innerText().catch(() => '')).includes('Review only'));
  await page.screenshot({ path: path.join(OUT, `${NAME}-whatsapp-respond.png`), fullPage: true });
  rec('inbox-runtime', runtimeErrors.length === 0, { runtimeErrors });
  rec('inbox-network', failedRequests.length === 0, { failedRequests });
  rec('inbox-no-writes', writeRequests.length === 0, { writeRequests });
  await context.close();
}

async function laneTracking(browser) {
  const { context, page, runtimeErrors, failedRequests, writeRequests } = await fresh(browser);
  await openRoute(page, 'tracking');
  rec('tracking-surface-visible', await visible(page, '[data-v5-surface="tracking"]'));
  const text = await page.locator('[data-v5-surface="tracking"]').innerText().catch(() => '');
  for (const required of ['Tracking Operations', 'D1 jobs', 'Selected job', 'Stage', 'Location', 'Shipping cost', 'Update note', 'Update D1', 'Link phone', 'Carrier tracking', 'Job truth', 'PAYMENT_SUBMITTED', 'WhatsApp/screenshots/claims do not mark PAID', 'Pay Gateway']) rec(`tracking:${required}`, text.includes(required), { text });
  await tap(page, '[data-v5-track-action="Update D1"]', 'tracking-update-d1');
  rec('tracking-update-truthful-review-only', (await page.locator('.v5-toast').innerText().catch(() => '')).includes('Review only'));
  await page.screenshot({ path: path.join(OUT, `${NAME}-tracking.png`), fullPage: true });
  rec('tracking-runtime', runtimeErrors.length === 0, { runtimeErrors });
  rec('tracking-network', failedRequests.length === 0, { failedRequests });
  rec('tracking-no-writes', writeRequests.length === 0, { writeRequests });
  await context.close();
}

async function laneRegression(browser) {
  const { context, page, runtimeErrors, failedRequests, writeRequests } = await fresh(browser);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  rec('no-horizontal-overflow', scrollWidth === clientWidth, { scrollWidth, clientWidth });
  await tap(page, '#bellBtn', 'bell-open');
  rec('bell-compact-popover', await visible(page, '#notificationPopover'));
  await page.locator('#bellBtn').click().catch(() => {});
  if (MOBILE) {
    await tap(page, '#menuBtn', 'drawer-open');
    rec('drawer-open-state', await drawerOpen(page));
    await openRoute(page, 'inbox');
    rec('drawer-closes-on-destination', !await drawerOpen(page));
  }
  await openRoute(page, 'hunter');
  rec('chat-input-visible', await visible(page, '#chatInput'));
  await tap(page, '#voiceBtn', 'voice-open');
  await page.waitForTimeout(60);
  rec('hunter-voice-modal', (await page.locator('#modalRoot').innerText().catch(() => '')).includes('Hunter Voice'));
  await closeModal(page);
  if (MOBILE) {
    if (!await drawerOpen(page)) await tap(page, '#menuBtn', 'settings-drawer');
    await tap(page, '#accountBtn', 'settings-account');
  } else await tap(page, '#profileBtn', 'settings-account');
  await tap(page, '[data-account="settings"]', 'settings-open');
  rec('settings-visible', await page.locator('[data-settings-tab]').count() >= 10, { count: await page.locator('[data-settings-tab]').count() });
  await closeModal(page);
  rec('regression-runtime', runtimeErrors.length === 0, { runtimeErrors });
  rec('regression-network', failedRequests.length === 0, { failedRequests });
  rec('regression-no-writes', writeRequests.length === 0, { writeRequests });
  await context.close();
}

let browser;
try {
  await preflight();
  browser = await chromium.launch({ headless: true });
  for (const lane of [laneInitialAndRole, laneBrowser, laneInbox, laneTracking, laneRegression]) await lane(browser);
} catch (error) {
  rec('uncaught', false, { error: String(error) });
} finally {
  if (browser) await browser.close().catch(() => {});
  save();
}
console.log(JSON.stringify({ viewport: NAME, passed: findings.length === 0, findings: findings.length, evidence: evidence.length }, null, 2));
if (findings.length) process.exit(1);
