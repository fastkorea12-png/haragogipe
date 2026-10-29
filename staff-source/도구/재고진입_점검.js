// 근무노트 홈의 '재고 조사' 진입 카드 점검: 표시·링크·이동·레이아웃(500/390/데스크톱)·JS 오류·외부 요청. 실제 서버·제출은 쓰지 않는다.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const H=require('./_점검공통.js');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'근무노트.html'),'utf8'),shot=n=>path.join(os.tmpdir(),'근무노트_재고진입_'+n+'.png');
const FAKE='https://staff.test/staff/';
assert(!/어드민/.test(html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<!--[\s\S]*?-->/g,'')),'화면 문구에 어드민 노출 금지');
const homeLayout=async(page,label)=>{const l=await page.evaluate(()=>{window.scrollTo(0,document.documentElement.scrollHeight);const cards=[...document.querySelectorAll('#homeCards .home-card')].map(c=>c.getBoundingClientRect());const s=document.querySelector('.screen:not([hidden])').getBoundingClientRect(),n=document.querySelector('.sidebar').getBoundingClientRect();return {sw:document.documentElement.scrollWidth,w:innerWidth,cards:cards.map(r=>({t:r.top,b:r.bottom,l:r.left,r:r.right})),sb:s.bottom,nt:n.top,sidebarFixed:getComputedStyle(document.querySelector('.sidebar')).position==='fixed'};});
 assert(l.sw<=l.w,label+' 가로 넘침');
 for(let i=0;i<l.cards.length;i++)for(let j=i+1;j<l.cards.length;j++){const a=l.cards[i],b=l.cards[j];assert(a.r<=b.l+1||b.r<=a.l+1||a.b<=b.t+1||b.b<=a.t+1,label+' 카드 겹침 '+i+','+j);}
 if(l.sidebarFixed)assert(l.sb<=l.nt+1,label+' 하단 탭에 가림');};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  // 1 file:// 로 열기(상대 경로가 깨져도 오류 없음, 링크 클릭 외 동작 없음)
  for(const [w,h,name] of [[500,900,'500'],[390,844,'390'],[1440,1000,'desktop']]){
   const ctx=await browser.newContext({viewport:{width:w,height:h},timezoneId:'Asia/Seoul'}),page=await ctx.newPage(),errors=[],external=[],nav=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!H.ALLOWED.includes(r.url()))external.push(r.url());});await H.stub(page);
   await page.goto('file://'+path.join(root,'근무노트.html'));
   assert.equal(await page.locator('#departments button').count(),6,'탭 6개(신입 교육 추가 10/18)');
   const card=page.locator('#homeCards a.home-card',{hasText:'재고 조사'});
   assert(await card.isVisible(),'재고 조사 카드 표시');
   assert.equal(await card.getAttribute('href'),'./inventory/');assert.equal(await card.getAttribute('target'),null,'같은 탭 이동');
   const t=await card.innerText();assert(t.includes('와인 수량 · 주방 재고')&&t.includes('열기 →'));
   assert.equal(await page.locator('#homeCards .home-card').count(),7,'홈 카드 7장(4 탭 + 재고 조사 + 내 수정 제안 + 신입 교육)');
   const full=await page.evaluate(()=>{const g=document.getElementById('homeCards').getBoundingClientRect(),c=document.getElementById('homeInventory').getBoundingClientRect();return Math.abs(c.width-g.width)<2;});assert(full,'전체 폭 1장');
   await homeLayout(page,name);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:shot(name)});
   assert.equal(errors.length,0,errors.join('\n'));assert.equal(external.length,0,'외부 요청 '+external.join());
   await ctx.close();
  }
  // 2 가짜 주소에서 카드 클릭 -> ./inventory/ 로 이동(같은 탭)
  const ctx=await browser.newContext({viewport:{width:500,height:900},timezoneId:'Asia/Seoul'}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await H.stub(page);
  await page.route('https://staff.test/**',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:u.split('?')[0]===FAKE?html:'<!doctype html><title>inventory</title><p id="inv">재고</p>'});});
  await page.goto(FAKE);await page.locator('#homeCards a.home-card',{hasText:'재고 조사'}).click();await page.waitForURL('https://staff.test/staff/inventory/');
  assert.equal(ctx.pages().length,1);assert(await page.locator('#inv').isVisible());
  // 3 로고 5번 탭(진입 방식)과 충돌 없음: 카드는 로고 영역 밖에 있다
  await page.goto(FAKE);assert.equal(await page.locator('#homeInventory').evaluate(n=>!!n.closest('header')),false);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({ok:true,screenshots:['500','390','desktop'].map(shot)},null,1));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
