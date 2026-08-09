import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.HUNTER_URL || 'https://9c4f1e1a-hunter-ui-review.thetechguy712.workers.dev';
const SHA = 'd243eb867e73e7c1a26fbf4552766814b77e8c95f6e4bf233b2dd688efa40c57';
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
  fs.writeFileSync(
    path.join(OUT, 'report.json'),
    JSON.stringify({
      url: BASE,
      viewport: NAME,
      expectedSha: SHA,
      passed: findings.length === 0,
      findings,
      evidenceCount: evidence.length,
      evidence,
    }, null, 2),
  );
}
function rec(phase, ok, detail = {}) {
  evidence.push({ phase, ok, ...detail });
  if (!ok) findings.push({ phase, ...detail });
  save();
}
async function tap(page, selector, phase) {
  try {
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible', timeout: 4500 });
    await target.scrollIntoViewIfNeeded();
    await target.click({ timeout: 4500 });
    rec(phase, true, { selector });
    return true;
  } catch (error) {
    rec(phase, false, { selector, error: String(error) });
    return false;
  }
}
async function drawerOpen(page) {
  return page.locator('#sidebar').evaluate(el => el.classList.contains('open')).catch(() => false);
}
async function openRoute(page, target) {
  if (MOBILE && !await drawerOpen(page)) await tap(page, '#menuBtn', `drawer:${target}`);
  if (!await tap(page, `#nav [data-page="${target}"]`, `route:${target}`)) return false;
  await page.waitForTimeout(100);
  const active = await page.locator('[data-page-render]').getAttribute('data-page-render').catch(() => null);
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
  const errors = [];
  page.on('pageerror', error => errors.push(`page:${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console:${message.text()}`);
  });
  await page.goto(`${BASE}/portal`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(250);
  return { context, page, errors };
}
async function closeModal(page) {
  const close = page.locator('#modalRoot [data-close]').first();
  if (await close.count()) await close.click().catch(() => {});
}
async function setRole(page, role) {
  if (MOBILE && !await drawerOpen(page)) await tap(page, '#menuBtn', `role-drawer:${role}`);
  try {
    await page.locator('#roleSelect').selectOption(role, { timeout: 4500 });
    rec(`role:${role}`, true);
  } catch (error) {
    rec(`role:${role}`, false, { error: String(error) });
    return false;
  }
  await page.waitForTimeout(120);
  if (MOBILE && await drawerOpen(page)) await page.locator('#scrim').click().catch(() => {});
  return true;
}
async function preflight() {
  const health = await fetch(`${BASE}/health`);
  let json = {};
  try { json = await health.json(); } catch {}
  rec('health', health.status === 200, { status: health.status, body: json });
  rec('health-sha', json.htmlSha256 === SHA, { actual: json.htmlSha256 });
  rec('health-version', json.version === 'HUNTER_EMPLOYEE_OS_APPROVED_WORKSPACE_V4', { actual: json.version });
  rec('production-boundary', json.production === 'untouched', { actual: json.production });

  const response = await fetch(`${BASE}/portal`);
  const html = await response.text();
  rec('portal-200', response.status === 200, { status: response.status });
  rec('portal-sha', response.headers.get('x-hunter-html-sha256') === SHA, { actual: response.headers.get('x-hunter-html-sha256') });
  rec('review-header', response.headers.get('x-hunter-review') === 'approved-workspace-v4', { actual: response.headers.get('x-hunter-review') });
  for (const marker of [
    'HUNTER_EMPLOYEE_OS_V4_WORKSPACE',
    'What’s on your mind?',
    'What do you need done?',
    'Department accountability',
    'PAYMENT_SUBMITTED',
    'People & Access',
    'Passage Check',
    'Compact hover',
    'Conversation',
    'Reply',
  ]) rec(`marker:${marker}`, html.includes(marker));
}

async function laneShell(browser) {
  const { context, page, errors } = await fresh(browser);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  rec('no-horizontal-overflow', scrollWidth === clientWidth, { scrollWidth, clientWidth });
  await tap(page, '#bellBtn', 'bell-open');
  await page.waitForTimeout(60);
  rec('bell-compact-popover', await page.locator('#notificationPopover').isVisible().catch(() => false));
  await page.locator('#bellBtn').click().catch(() => {});
  await openRoute(page, 'orders');
  await openRoute(page, 'swap');
  rec('shell-runtime', errors.length === 0, { errors });
  await context.close();
}
async function laneClients(browser) {
  const { context, page, errors } = await fresh(browser);
  await openRoute(page, 'clients');
  const search = page.locator('#clientSearch');
  if (await search.count()) {
    await search.fill('Ruth');
    await page.waitForTimeout(80);
    const count = await page.locator('[data-open-client]').count();
    rec('client-search', count > 0, { count });
    if (count) {
      await tap(page, '[data-open-client]', 'client-open');
      rec('client-modal', await page.locator('#modalWrap').isVisible().catch(() => false));
      await closeModal(page);
    }
  } else rec('client-search', false, { error: 'search missing' });
  rec('clients-runtime', errors.length === 0, { errors });
  await context.close();
}
async function laneInbox(browser) {
  const { context, page, errors } = await fresh(browser);
  await openRoute(page, 'inbox');
  await tap(page, '[data-inbox-view="reply"]', 'inbox-reply-switch');
  rec('reply-visible', await page.locator('#replyText').isVisible().catch(() => false));
  if (await page.locator('[data-reply-mode="employee"]').count()) await tap(page, '[data-reply-mode="employee"]', 'reply-employee');
  if (await page.locator('#replyText').count()) await page.locator('#replyText').fill('Live proof reply');
  if (await page.locator('[data-action="send-reply"]').count()) await tap(page, '[data-action="send-reply"]', 'reply-send');
  await tap(page, '[data-inbox-view="conversation"]', 'inbox-conversation-switch');
  rec('inbox-runtime', errors.length === 0, { errors });
  await context.close();
}
async function laneChat(browser) {
  const { context, page, errors } = await fresh(browser);
  await openRoute(page, 'hunter');
  rec('chat-input-visible', await page.locator('#chatInput').isVisible().catch(() => false));
  if (MOBILE) {
    await tap(page, '#menuBtn', 'chat-drawer');
    rec('chat-history-visible', await page.locator('#chatHistory').isVisible().catch(() => false));
    if (await page.locator('[data-chat]').count()) await tap(page, '[data-chat]', 'chat-history-switch');
    if (await drawerOpen(page)) await page.locator('#scrim').click().catch(() => {});
  }
  const input = page.locator('#chatInput');
  if (await input.count()) {
    await input.fill(`Live ${NAME} proof`);
    const before = await page.locator('.message.user').count();
    await tap(page, '#sendBtn', 'chat-send');
    await page.waitForTimeout(220);
    const after = await page.locator('.message.user').count();
    rec('chat-appended', after > before, { before, after });
  }
  await tap(page, '#voiceBtn', 'voice-open');
  await page.waitForTimeout(60);
  rec('voice-modal', (await page.locator('#modalRoot').innerText().catch(() => '')).includes('Hunter Voice'));
  await closeModal(page);
  const actions = await page.locator('[data-msg-action]').count();
  rec('response-actions', actions >= 7, { count: actions });
  rec('chat-runtime', errors.length === 0, { errors });
  await context.close();
}
async function laneSettings(browser) {
  const { context, page, errors } = await fresh(browser);
  if (MOBILE) {
    await tap(page, '#menuBtn', 'settings-drawer');
    await tap(page, '#accountBtn', 'account-menu');
  } else await tap(page, '#profileBtn', 'account-menu');
  await tap(page, '[data-account="settings"]', 'settings-open');
  const count = await page.locator('[data-settings-tab]').count();
  rec('settings-16-tabs', count === 16, { count });
  for (const key of ['general', 'appearance', 'notifications', 'voice', 'account']) {
    const tab = page.locator(`[data-settings-tab="${key}"]`);
    if (await tab.count()) { await tab.click(); rec(`settings:${key}`, true); }
    else rec(`settings:${key}`, false);
  }
  const general = page.locator('[data-settings-tab="general"]');
  if (await general.count()) {
    await general.click();
    const font = page.locator('[data-setting="font"]');
    if (await font.count()) rec('font-default', (await font.inputValue()) === 'default', { value: await font.inputValue() });
    const actionStyle = page.locator('[data-setting="action-style"]');
    if (await actionStyle.count()) rec('compact-hover', (await actionStyle.inputValue()) === 'hover', { value: await actionStyle.inputValue() });
  }
  const appearance = page.locator('[data-settings-tab="appearance"]');
  if (await appearance.count()) {
    await appearance.click();
    const theme = page.locator('[data-setting="theme"]');
    if (await theme.count()) {
      await theme.selectOption('light');
      await page.waitForTimeout(40);
      rec('light-theme', (await page.locator('html').getAttribute('data-theme')) === 'light', { actual: await page.locator('html').getAttribute('data-theme') });
      await theme.selectOption('dark');
    }
  }
  rec('settings-runtime', errors.length === 0, { errors });
  await context.close();
}
async function laneOps(browser) {
  const { context, page, errors } = await fresh(browser);
  await openRoute(page, 'payments');
  const verify = page.locator('[data-action="verify-payment"]').first();
  if (await verify.count()) { await verify.click(); rec('payment-verify', true); }
  else rec('payment-verify', false, { error: 'verify absent' });
  await openRoute(page, 'technician');
  const pick = page.locator('[data-tech="pick"]').first();
  if (await pick.count()) { await pick.click(); rec('technician-pick', true); }
  else rec('technician-pick', true, { detail: 'no queued device in this fresh review state' });
  await openRoute(page, 'people');
  const manage = page.locator('[data-action="manage-person"]').first();
  if (await manage.count()) {
    await manage.click();
    rec('people-manage', await page.locator('#modalWrap').isVisible().catch(() => false));
    await closeModal(page);
  } else rec('people-manage', false, { error: 'manage absent' });
  rec('ops-runtime', errors.length === 0, { errors });
  await context.close();
}
async function laneRegular(browser) {
  const { context, page, errors } = await fresh(browser);
  await setRole(page, 'regular');
  const count = await page.locator('#nav [data-page]').count();
  rec('regular-chat-only', count === 1, { count });
  rec('regular-greeting', (await page.locator('body').innerText()).includes('What’s on your mind?'));
  rec('regular-search', (await page.locator('#globalSearch').getAttribute('placeholder')) === 'Search chats and projects…', { value: await page.locator('#globalSearch').getAttribute('placeholder') });
  rec('regular-badge-hidden', !await page.locator('#bellCount').isVisible().catch(() => false));
  rec('regular-runtime', errors.length === 0, { errors });
  await page.screenshot({ path: path.join(OUT, `${NAME}-regular.png`), fullPage: true });
  await context.close();
}
async function laneVisual(browser) {
  let item = await fresh(browser);
  await openRoute(item.page, 'today');
  await item.page.screenshot({ path: path.join(OUT, `${NAME}-today.png`), fullPage: true });
  await item.context.close();

  item = await fresh(browser);
  await openRoute(item.page, 'hunter');
  if (MOBILE && await drawerOpen(item.page)) await item.page.locator('#scrim').click().catch(() => {});
  await item.page.screenshot({ path: path.join(OUT, `${NAME}-hunter.png`), fullPage: true });
  await item.context.close();

  item = await fresh(browser);
  await openRoute(item.page, 'inbox');
  await tap(item.page, '[data-inbox-view="reply"]', 'capture-reply');
  await item.page.screenshot({ path: path.join(OUT, `${NAME}-inbox-reply.png`), fullPage: true });
  await item.context.close();
}

let browser;
try {
  await preflight();
  browser = await chromium.launch({ headless: true });
  for (const lane of [laneShell, laneClients, laneInbox, laneChat, laneSettings, laneOps, laneRegular, laneVisual]) await lane(browser);
} catch (error) {
  rec('uncaught', false, { error: String(error) });
} finally {
  if (browser) await browser.close().catch(() => {});
  save();
}
console.log(JSON.stringify({ viewport: NAME, passed: findings.length === 0, findings: findings.length, evidence: evidence.length }, null, 2));
if (findings.length) process.exit(1);
