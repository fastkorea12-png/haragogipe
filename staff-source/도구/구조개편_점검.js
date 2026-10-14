const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),assert=require('assert/strict');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const CL_URL='https://haragogipe-staff-ai.haragogipe-staff-ai-worker.workers.dev/api/checklist';// 근무노트가 읽는 공개 발행본 주소(이 점검에서는 미발행으로 모의)
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'근무노트.html'),'utf8');
const ctx={};vm.createContext(ctx);vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1],ctx);
const body=title=>ctx.KB.find(e=>e.file==='09_운영_매뉴얼'&&e.title===title).body;
const totals=[];
for(let day=0;day<7;day++){
 const date=new Date('2026-10-'+String(11+day).padStart(2,'0')+'T12:00:00+09:00');
 const open=ctx.checklistItems(body('오픈 순서'),date).filter(t=>t.task);
 const close=ctx.checklistItems(body('마감 순서'),date).filter(t=>t.task);
 const weekly=open.filter(t=>/주간 업무/.test(t.group));
 assert.equal(weekly.length,day>=1&&day<=4?(day===3?3:2):0);
 assert.equal(close.filter(t=>t.defaultNA).length,2);
 assert(ctx.checklistItems(body('마감 순서'),date).some(t=>t.text.includes('02:00')&&t.text.includes('01:00')&&t.text.includes('[확인]')));
 assert(body('마감 순서').includes('오전·오후 표기 없음 [확인]'));
 totals.push({day,open:open.length,close:close.length});
}
assert.equal((html.match(/\bfetch\(/g)||[]).length,3,'서버 호출은 발행 체크리스트 읽기·근무 제출·웹 검색 3곳뿐');assert((html.match(/fetch\(CL_BASE\+'\/api\/(checklist|shifts|chat)'/g)||[]).length===3,'세 호출 모두 빌드에 심은 서버 주소(CL_BASE) 사용');assert(html.includes('/api/checklist'));
assert(!/fonts\.googleapis\.com|docs\.google\.com\/forms/.test(html));
assert(ctx.PHRASES.some(p=>/^5-7\b/.test(p.title)));
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:500,height:900},timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==CL_URL)external.push(r.url());});await page.route(CL_URL,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"published":false}'}));
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{window.copiedText=t;}}});});
  await page.goto('file://'+path.join(root,'근무노트.html'));
  const shots=[];
  for(const id of ['home','checklist','recipes','wine','phrases']){
   await page.locator('[data-tab="'+id+'"]').click();
   assert.equal(await page.locator('.screen:visible').getAttribute('id'),'screen-'+id);
   assert(await page.locator('#q').isVisible());
   await page.evaluate(async()=>{document.activeElement.blur();window.scrollTo(0,0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));window.scrollTo(0,0);});
   const file=path.join(os.tmpdir(),'근무노트_1013_'+id+'_500.png');await page.screenshot({path:file});shots.push(file);assert.equal(await page.evaluate(()=>scrollY),0,id+' initial scroll');
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
   const layout=await page.evaluate(()=>{const screen=document.querySelector('.screen:not([hidden])');return {right:document.documentElement.scrollWidth,width:innerWidth,bottom:screen.getBoundingClientRect().bottom,navTop:document.querySelector('.sidebar').getBoundingClientRect().top};});
   assert(layout.right<=layout.width,id+' horizontal overflow');assert(layout.bottom<=layout.navTop,id+' bottom navigation overlap');
   await page.locator('#q').fill('칼리모초 만드는 법');await page.locator('#f button').click();
   assert(await page.locator('#log').isVisible());assert((await page.locator('#log').innerText()).includes('120ml'));
   assert.equal(await page.locator('.screen:visible').getAttribute('id'),'screen-'+id);
  }
  await page.locator('[data-tab="recipes"]').click();assert.equal(await page.locator('.recipe-photo').count(),Object.keys(ctx.RECIPE_PHOTOS).length);
  for(const img of await page.locator('.recipe-photo').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(n=>n.decode());assert(await img.evaluate(n=>n.naturalWidth>0&&n.naturalWidth<=1000));}
  await page.locator('[data-tab="checklist"]').click();
  await page.locator('#checkContent input[type=checkbox]').first().check();await page.reload();
  await page.locator('[data-tab="checklist"]').click();assert(await page.locator('#checkContent input[type=checkbox]').first().isChecked());
  await page.locator('[data-check-kind="마감 순서"]').click();assert.equal(await page.locator('#checkContent input:disabled').count(),2);
  await page.locator('#checkContent .row-main').first().click();await page.locator('#checkContent .row-panel:not([hidden]) .skip-check').click();assert.equal(await page.locator('#checkContent input:disabled').count(),1);
  await page.locator('[data-tab="home"]').click();assert((await page.locator('#todayProgress').innerText()).includes('1/'));
  await page.locator('[data-tab="phrases"]').click();const phrase=page.locator('.phrase-card').first();await phrase.locator('summary').click();await phrase.locator('.copy-pitch').click();assert((await page.evaluate(()=>window.copiedText)).includes('반갑습니다'));
  const refusal=page.locator('.phrase-card').filter({has:page.locator('summary', {hasText:'5-7 '})});await refusal.locator('summary').click();assert((await refusal.innerText()).includes('[확인] 새 응대 문장'));
  await page.locator('[data-tab="wine"]').click();await page.locator('#tasteGo').click();assert.equal(await page.locator('#wineResults .wine-card').count(),6);
  await page.setViewportSize({width:1440,height:1000});assert((await page.locator('.sidebar').boundingBox()).width>=180);
  assert.equal(errors.length,0,errors.join('\n'));assert.equal(external.length,0,'unexpected external requests');
  console.log(JSON.stringify({weeklyTotals:totals,tabs:5,search:5,checkPersistence:true,copy:true,wineCards:6,externalRequests:0,screenshots:shots,photoCount:Object.keys(ctx.RECIPE_PHOTOS).length},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
