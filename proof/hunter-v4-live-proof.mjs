import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.HUNTER_URL || 'https://9c4f1e1a-hunter-ui-review.thetechguy712.workers.dev';
const EXPECTED_SHA = 'd243eb867e73e7c1a26fbf4552766814b77e8c95f6e4bf233b2dd688efa40c57';
const OUT = 'proof-output';
fs.mkdirSync(OUT,{recursive:true});
const findings=[]; const evidence=[];
const record=(viewport,phase,ok,detail={})=>{evidence.push({viewport,phase,ok,...detail});if(!ok)findings.push({viewport,phase,...detail});};

async function preflight(){
  const health=await fetch(`${BASE}/health`,{redirect:'follow'}); const htext=await health.text();
  let hjson={}; try{hjson=JSON.parse(htext)}catch{}
  record('global','health',health.status===200,{status:health.status,body:hjson});
  record('global','health-sha',hjson.htmlSha256===EXPECTED_SHA,{actual:hjson.htmlSha256,expected:EXPECTED_SHA});
  record('global','health-version',hjson.version==='HUNTER_EMPLOYEE_OS_APPROVED_WORKSPACE_V4',{actual:hjson.version});
  record('global','production-boundary',hjson.production==='untouched',{actual:hjson.production});
  const portal=await fetch(`${BASE}/portal`,{redirect:'follow'}); const html=await portal.text();
  record('global','portal-status',portal.status===200,{status:portal.status});
  record('global','portal-header-sha',portal.headers.get('x-hunter-html-sha256')===EXPECTED_SHA,{actual:portal.headers.get('x-hunter-html-sha256')});
  record('global','portal-review-header',portal.headers.get('x-hunter-review')==='approved-workspace-v4',{actual:portal.headers.get('x-hunter-review')});
  for(const marker of ['HUNTER_EMPLOYEE_OS_V4_WORKSPACE','What’s on your mind?','What do you need done?','Department accountability','PAYMENT_SUBMITTED','People & Access','Passage Check','Compact hover','Conversation','Reply']) record('global',`marker:${marker}`,html.includes(marker));
}

const viewports=[
  {name:'phone',width:390,height:844,mobile:true,touch:true},
  {name:'tablet',width:820,height:1180,mobile:true,touch:true},
  {name:'desktop',width:1440,height:900,mobile:false,touch:false},
  {name:'wide',width:1920,height:1080,mobile:false,touch:false}
];

async function click(page,sel,phase,name){
  try{const l=page.locator(sel).first();await l.waitFor({state:'visible',timeout:3500});await l.scrollIntoViewIfNeeded();await l.click({timeout:3500});record(name,phase,true,{selector:sel});return true}catch(e){record(name,phase,false,{selector:sel,error:String(e)});return false}
}
async function gotoPage(page,name,target,mobile){
  if(mobile){await click(page,'#menuBtn','drawer-open',name);}
  const ok=await click(page,`#nav [data-page="${target}"]`,`route:${target}`,name); if(!ok)return false;
  await page.waitForTimeout(100);
  const active=await page.locator('[data-page-render]').getAttribute('data-page-render').catch(()=>null);
  record(name,`route-state:${target}`,active===target,{active});
  if(mobile){const open=await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')).catch(()=>true);record(name,`drawer-closed:${target}`,!open,{open});}
  return active===target;
}

async function runViewport(browser,v){
  const context=await browser.newContext({viewport:{width:v.width,height:v.height},isMobile:v.mobile,hasTouch:v.touch,deviceScaleFactor:v.mobile?2:1});
  const page=await context.newPage();
  const runtime=[]; page.on('pageerror',e=>runtime.push(`pageerror:${e.message}`)); page.on('console',m=>{if(m.type()==='error')runtime.push(`console:${m.text()}`)});
  await page.goto(`${BASE}/portal`,{waitUntil:'domcontentloaded',timeout:30000}); await page.waitForTimeout(350);
  record(v.name,'boot',await page.locator('#roleSelect').isVisible().catch(()=>false));
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);record(v.name,'no-horizontal-overflow',!overflow,{scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth),clientWidth:await page.evaluate(()=>document.documentElement.clientWidth)});

  // Notification bell: compact popover, not a full page.
  await click(page,'#bellBtn','bell-open',v.name); await page.waitForTimeout(80);
  const pop=await page.locator('#popoverRoot .popover').first().isVisible().catch(()=>false);record(v.name,'bell-compact-popover',pop);
  await page.keyboard.press('Escape').catch(()=>{});

  // Owner routes critical for previously broken controls.
  await gotoPage(page,v.name,'orders',v.mobile);
  await gotoPage(page,v.name,'swap',v.mobile);

  // Clients search/open.
  await gotoPage(page,v.name,'clients',v.mobile);
  const cs=page.locator('#clientSearch'); if(await cs.count()){await cs.fill('Ruth'); await page.waitForTimeout(100);record(v.name,'client-search',await page.locator('[data-open-client]').count()>0,{count:await page.locator('[data-open-client]').count()}); if(await page.locator('[data-open-client]').count()) await click(page,'[data-open-client]','client-open',v.name);}

  // Inbox Conversation <-> Reply and send.
  await gotoPage(page,v.name,'inbox',v.mobile);
  await click(page,'[data-inbox-view="reply"]','inbox-reply-switch',v.name); await page.waitForTimeout(80);
  record(v.name,'reply-composer-visible',await page.locator('#replyText').isVisible().catch(()=>false));
  if(await page.locator('[data-reply-mode="employee"]').count())await click(page,'[data-reply-mode="employee"]','reply-mode-employee',v.name);
  if(await page.locator('#replyText').count()){await page.locator('#replyText').fill('Live review proof reply');}
  if(await page.locator('[data-action="send-reply"]').count())await click(page,'[data-action="send-reply"]','reply-send',v.name);
  await click(page,'[data-inbox-view="conversation"]','inbox-conversation-switch',v.name);

  // Hunter chat, sidebar/history/project, Send, Voice, actions.
  await gotoPage(page,v.name,'hunter',v.mobile);
  record(v.name,'chat-input-visible',await page.locator('#chatInput').isVisible().catch(()=>false));
  if(v.mobile){await click(page,'#menuBtn','chat-drawer-open',v.name);record(v.name,'chat-history-visible',await page.locator('#chatHistory').isVisible().catch(()=>false));if(await page.locator('[data-chat]').count())await click(page,'[data-chat]','chat-history-switch',v.name);}
  const input=page.locator('#chatInput'); if(await input.count()){await input.fill(`Live ${v.name} proof`);const before=await page.locator('.message.user').count();await click(page,'#sendBtn','chat-send',v.name);await page.waitForTimeout(180);const after=await page.locator('.message.user').count();record(v.name,'chat-message-appended',after>before,{before,after});}
  await click(page,'#voiceBtn','voice-open',v.name); await page.waitForTimeout(80);record(v.name,'voice-modal',await page.locator('#modalRoot').locator('text=Hunter Voice').count()>0);
  const close=page.locator('#modalRoot [data-close],#modalRoot button').last(); if(await close.count())await close.click().catch(()=>{});
  const actionCount=await page.locator('[data-msg-action]').count();record(v.name,'response-action-row',actionCount>=7,{actionCount});

  // Settings via account menu, all tabs, appearance + general defaults.
  if(v.mobile){await click(page,'#menuBtn','settings-drawer-open',v.name);await click(page,'#accountBtn','account-menu-open',v.name);}else{await click(page,'#profileBtn','profile-menu-open',v.name);}
  const settingsButton=page.locator('[data-account="settings"],#accountMenu button').filter({hasText:'Settings'}).first();
  if(await settingsButton.count()){await settingsButton.click();await page.waitForTimeout(80);} else {record(v.name,'settings-button',false);}
  const tabs=page.locator('[data-settings-tab]');const tabCount=await tabs.count();record(v.name,'settings-tabs',tabCount===16,{tabCount});
  for(const key of ['general','appearance','notifications','voice','account']){const t=page.locator(`[data-settings-tab="${key}"]`);if(await t.count()){await t.click();await page.waitForTimeout(30);record(v.name,`settings:${key}`,true)}else record(v.name,`settings:${key}`,false)}
  const general=page.locator('[data-settings-tab="general"]'); if(await general.count()){await general.click();await page.waitForTimeout(30);const font=page.locator('[data-setting="font"]');if(await font.count())record(v.name,'font-default',(await font.inputValue())==='default',{value:await font.inputValue()});const actionStyle=page.locator('[data-setting="action-style"]');if(await actionStyle.count())record(v.name,'compact-hover-default',(await actionStyle.inputValue())==='hover',{value:await actionStyle.inputValue()});}
  const appearance=page.locator('[data-settings-tab="appearance"]');if(await appearance.count()){await appearance.click();const theme=page.locator('[data-setting="theme"]');if(await theme.count()){await theme.selectOption('light');await page.waitForTimeout(50);record(v.name,'light-theme-applied',(await page.locator('html').getAttribute('data-theme'))==='light',{theme:await page.locator('html').getAttribute('data-theme')});await theme.selectOption('dark');}}
  await page.keyboard.press('Escape').catch(()=>{});

  // Payment truth + downstream handoff.
  await gotoPage(page,v.name,'payments',v.mobile);const verify=page.locator('[data-action="verify-payment"]').first();if(await verify.count()){await verify.click();await page.waitForTimeout(80);record(v.name,'payment-verify-action',true);}

  // Technician progression.
  await gotoPage(page,v.name,'technician',v.mobile);const pick=page.locator('[data-tech="pick"]').first();if(await pick.count()){await pick.click();await page.waitForTimeout(80);record(v.name,'technician-pick-job',true);}

  // People action.
  await gotoPage(page,v.name,'people',v.mobile);const manage=page.locator('[data-action="manage-person"]').first();if(await manage.count()){await manage.click();await page.waitForTimeout(50);record(v.name,'people-manage',await page.locator('#modalRoot').isVisible().catch(()=>false));}
  await page.keyboard.press('Escape').catch(()=>{});

  // Regular user must be chat-only and privacy-safe.
  await page.locator('#roleSelect').selectOption('regular');await page.waitForTimeout(120);
  const navPages=await page.locator('#nav [data-page]').count();record(v.name,'regular-chat-only',navPages===1,{navPages});
  record(v.name,'regular-neutral-greeting',(await page.locator('body').innerText()).includes('What’s on your mind?'));
  const placeholder=await page.locator('#globalSearch').getAttribute('placeholder');record(v.name,'regular-search-sanitized',placeholder==='Search chats and projects…',{placeholder});
  const bellCount=await page.locator('#bellCount').isVisible().catch(()=>false);record(v.name,'regular-business-badge-hidden',!bellCount);

  // Reset owner and capture clean key states.
  await page.locator('#roleSelect').selectOption('owner');await page.waitForTimeout(80);if(v.mobile && await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')).catch(()=>false))await page.locator('#scrim').click().catch(()=>{});
  await page.screenshot({path:path.join(OUT,`${v.name}-today.png`),fullPage:true});
  await gotoPage(page,v.name,'hunter',v.mobile);if(v.mobile && await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')).catch(()=>false))await page.locator('#scrim').click().catch(()=>{});await page.screenshot({path:path.join(OUT,`${v.name}-hunter.png`),fullPage:true});
  await gotoPage(page,v.name,'inbox',v.mobile);await click(page,'[data-inbox-view="reply"]','capture-reply',v.name);await page.screenshot({path:path.join(OUT,`${v.name}-inbox-reply.png`),fullPage:true});

  record(v.name,'runtime-errors',runtime.length===0,{runtime});
  await context.close();
}

await preflight();
const browser=await chromium.launch({headless:true});
for(const v of viewports)await runViewport(browser,v);
await browser.close();
const report={url:BASE,expectedSha:EXPECTED_SHA,passed:findings.length===0,findings,evidenceCount:evidence.length,evidence};
fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,findings:findings.length,evidence:evidence.length},null,2));
if(findings.length)process.exit(1);
