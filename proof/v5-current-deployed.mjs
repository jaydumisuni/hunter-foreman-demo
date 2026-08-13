import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const U = process.env.HUNTER_URL;
if (!U) throw new Error('HUNTER_URL_REQUIRED');
const V = process.env.VIEWPORT || 'phone';
const S = { phone:[390,844,true], tablet:[820,1180,true], desktop:[1440,900,false], wide:[1920,1080,false] };
if (!S[V]) throw new Error(`UNKNOWN_VIEWPORT ${V}`);
const [w,h,m]=S[V];
const out='proof-output', checks=[], findings=[];
fs.mkdirSync(out,{recursive:true});
const log=(name,ok,detail={})=>{checks.push({name,ok,...detail});if(!ok)findings.push({name,...detail});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({viewport:V,url:U,passed:!findings.length,findings,checks},null,2));};
const seen=(p,s)=>p.locator(s).first().isVisible().catch(()=>false);
const active=p=>p.locator('[data-page-render]').getAttribute('data-page-render').catch(()=>null);
const drawer=p=>p.locator('#sidebar').evaluate(e=>e.classList.contains('open')).catch(()=>false);
async function click(p,s){const e=p.locator(s).first();await e.waitFor({state:'visible',timeout:5000});await e.scrollIntoViewIfNeeded();await e.click();}
async function back(p){if(m&&!await drawer(p))await click(p,'#menuBtn');for(const s of ['[data-chat-back]','.approved-chat-back','#chatBack','#sidebar button[aria-label*="back" i]'])if(await seen(p,s)){await click(p,s);await p.waitForTimeout(150);return true;}return false;}
async function go(p,k){if(await active(p)==='hunter')log(`back-${k}`,await back(p));if(m&&!await drawer(p))await click(p,'#menuBtn');await click(p,`#nav [data-page="${k}"]`);await p.waitForTimeout(180);log(`route-${k}`,await active(p)===k,{active:await active(p)});if(m)log(`drawer-${k}`,!await drawer(p));}

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:w,height:h},isMobile:m,hasTouch:m,deviceScaleFactor:m?2:1});
const page=await context.newPage(), errors=[], writes=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',x=>{if(x.type()==='error')errors.push(x.text());});
page.on('request',x=>{if(!['GET','HEAD'].includes(x.method()))writes.push(`${x.method()} ${x.url()}`);});

try {
  const response=await fetch(`${U}/health`); log('health-http',response.ok,{status:response.status}); const health=await response.json();
  log('v5-version',health.version==='HUNTER_EMPLOYEE_OS_APPROVED_WORKSPACE_V5',{actual:health.version});
  log('frozen-v4-sha',health.v4HtmlSha256==='d243eb867e73e7c1a26fbf4552766814b77e8c95f6e4bf233b2dd688efa40c57',{actual:health.v4HtmlSha256});
  log('owner-correction-version',health.visualFixVersion==='HUNTER_EMPLOYEE_OS_V5_OWNER_REVIEW_CORRECTIONS_20260813_R2',{actual:health.visualFixVersion});
  log('production-untouched',health.production==='untouched',{actual:health.production});

  await page.goto(`${U}/portal`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>globalThis.__HUNTER_V5_OWNER_CORRECTIONS__,null,{timeout:7000}); await page.waitForTimeout(300);
  log('starts-today',await active(page)==='today',{active:await active(page)});
  log('role-selector-visible',await seen(page,'#roleSelect'));
  if(await seen(page,'#roleSelect')){const opts=await page.locator('#roleSelect option').evaluateAll(a=>a.map(o=>o.value).filter(Boolean));const v=opts.find(x=>x!=='owner')||opts[0];await page.locator('#roleSelect').selectOption(v);await page.waitForTimeout(250);log('role-change-stays-today',await active(page)==='today',{active:await active(page),role:v});}

  const brandLogo=page.locator('.brand .hunter-approved-logo').first();
  log('hunter-logo-visible',await brandLogo.isVisible().catch(()=>false));
  if(await brandLogo.count()){const logoStyle=await brandLogo.evaluate(el=>{const s=getComputedStyle(el);const r=el.getBoundingClientRect();return{clipPath:s.clipPath,borderRadius:s.borderRadius,backgroundColor:s.backgroundColor,boxShadow:s.boxShadow,width:r.width,height:r.height};});log('hunter-logo-square-removed',String(logoStyle.clipPath).includes('circle'),logoStyle);}
  await page.screenshot({path:path.join(out,`${V}-today-logo.png`),fullPage:true});

  log('browser-icon-visible',await seen(page,'#v5BrowserBtn')); await click(page,'#v5BrowserBtn');
  log('browser-truthful-disconnected',/no connected browser session|not connected/i.test(await page.locator('#v5BrowserModal').innerText()));
  const ib=await page.locator('#v5BrowserModal .v5-modal-head>svg').boundingBox();log('browser-header-icon-size',!!ib&&ib.width<=30&&ib.height<=30,{box:ib});await page.locator('#v5BrowserModal [data-v5-close]').click();

  await go(page,'inbox'); log('whatsapp-inbox-surface',await seen(page,'[data-v5-surface="inbox"]')); log('conversation-tab-visible',await seen(page,'[data-v5-inbox-view="conversation"]')); log('respond-tab-visible',await seen(page,'[data-v5-inbox-view="respond"]')); await page.screenshot({path:path.join(out,`${V}-whatsapp.png`),fullPage:true});
  await click(page,'[data-v5-inbox-view="respond"]');log('respond-compact-context',await seen(page,'.v5-wa-context')&&await page.locator('.v5-wa-conversation').count()===0);for(const mode of ['assisted','employee','alternative'])log(`reply-mode-${mode}`,await page.locator(`[data-v5-mode="${mode}"]`).count()===1);await click(page,'[data-v5-takeover]');log('return-assisted-control',/Return assisted/.test(await page.locator('[data-v5-takeover]').innerText()));await click(page,'[data-v5-confirm]');log('send-is-review-only',/Review only/.test(await page.locator('.v5-toast').innerText()));await page.screenshot({path:path.join(out,`${V}-respond.png`),fullPage:true});

  await go(page,'tracking'); log('tracking-surface',await seen(page,'[data-v5-surface="tracking"]')); const trackingText=await page.locator('[data-v5-surface="tracking"]').innerText(), lower=trackingText.toLowerCase();
  for(const required of ['Tracking Operations','D1 jobs','Selected job','Stage','Location','Shipping cost','Update note','Update D1','Link phone','Carrier tracking','Job truth','PAYMENT_SUBMITTED','WhatsApp/screenshots/claims do not mark PAID','Pay Gateway'])log(`tracking-${required}`,lower.includes(required.toLowerCase()));
  const pathValue=await page.locator('[data-v5-surface="tracking"] input[readonly]').last().inputValue();log('tracking-active-authority-field',pathValue==='https://tracking.thetechguyds.com',{actual:pathValue});log('tracking-active-wording',trackingText.includes('Active client tracking'));log('tracking-txn-format',trackingText.includes('TXN-XXXXXX'));const html=await page.content();log('legacy-tracking-path-absent',!html.includes('thetechguyds.com/track/TTG-0007')&&!html.includes('value="/track/TTG-0007"'));await click(page,'[data-v5-track-action="Update D1"]');log('tracking-write-is-review-only',/Review only/.test(await page.locator('.v5-toast').innerText()));await page.screenshot({path:path.join(out,`${V}-tracking.png`),fullPage:true});

  log('no-horizontal-overflow',await page.evaluate(()=>document.documentElement.scrollWidth===document.documentElement.clientWidth));await go(page,'hunter');await click(page,'#bellBtn');log('bell',await seen(page,'#notificationPopover'));await page.locator('#bellBtn').click();await click(page,'#voiceBtn');log('hunter-voice',/Hunter Voice/.test(await page.locator('#modalRoot').innerText().catch(()=>'')));log('runtime-errors',!errors.length,{errors});log('no-review-writes',!writes.length,{writes});await page.screenshot({path:path.join(out,`${V}-final.png`),fullPage:true});
} catch(error){log('uncaught',false,{error:String(error)});} finally{await context.close();await browser.close();}
console.log(JSON.stringify({viewport:V,passed:!findings.length,findings:findings.length,checks:checks.length}));if(findings.length)process.exit(1);
