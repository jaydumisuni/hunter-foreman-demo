import { chromium } from 'playwright';
import fs from 'node:fs';

const U = process.env.HUNTER_URL;
if (!U) throw new Error('HUNTER_URL_REQUIRED');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${U}/portal`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => globalThis.__HUNTER_V5_OWNER_CORRECTIONS__, null, { timeout: 7000 });
await page.waitForTimeout(250);
const result = await page.evaluate(() => {
  const style = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      id: el.id,
      className: typeof el.className === 'string' ? el.className : el.className?.baseVal,
      src: el.getAttribute?.('src'),
      width: r.width,
      height: r.height,
      background: s.background,
      backgroundColor: s.backgroundColor,
      border: s.border,
      borderRadius: s.borderRadius,
      padding: s.padding,
      boxShadow: s.boxShadow,
      overflow: s.overflow,
      objectFit: s.objectFit,
    };
  };
  return [...document.querySelectorAll('img')]
    .filter((img) => /hunter-logo|logo/i.test(img.getAttribute('src') || '') || /hunter|logo/i.test(img.className || '') || /hunter|logo/i.test(img.id || ''))
    .map((img) => ({
      image: style(img),
      parent: style(img.parentElement),
      grandparent: style(img.parentElement?.parentElement),
      outerHTML: img.outerHTML,
      parentHTML: img.parentElement?.outerHTML?.slice(0, 1200),
    }));
});
fs.mkdirSync('proof-output-logo', { recursive: true });
fs.writeFileSync('proof-output-logo/logo-dom.json', JSON.stringify(result, null, 2));
await page.screenshot({ path: 'proof-output-logo/logo-desktop.png', fullPage: false });
console.log(JSON.stringify(result, null, 2));
await browser.close();
