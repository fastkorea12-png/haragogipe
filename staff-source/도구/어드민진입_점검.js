// 로고 연속 5번 탭 진입 점검(직원 화면 전용, 서버·어드민 의존 없음). 사용: node 어드민진입_점검.js
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium,devices}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const html=fs.readFileSync(path.join(__dirname,'..','근무노트.html'));
const srv=http.createServer((q,r)=>{r.setHeader('content-type','text/html;charset=utf-8');
 if(q.url.startsWith('/staff/admin/'))return r.end('<title>ADMIN</title>admin stub');
 if(q.url.startsWith('/staff/'))return r.end(html);r.statusCode=404;r.end('x');});
let fail=0;const ok=(c,m)=>{console.log((c?'통과 ':'실패 ')+m);if(!c)fail++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await new Promise(r=>srv.listen(0,r));const base='http://127.0.0.1:'+srv.address().port+'/staff/';
 const br=await chromium.launch({channel:'chrome'});
 for(const mode of ['폰 터치','데스크톱 클릭']){
  const ctx=await br.newContext(mode==='폰 터치'?{...devices['iPhone 13'],hasTouch:true}:{viewport:{width:1280,height:800}});
  const page=await ctx.newPage();
  const tap=async n=>{for(let i=0;i<n;i++){mode==='폰 터치'?await page.locator('#brandLogo').tap():await page.locator('#brandLogo').click();await sleep(150);}};
  const fresh=async()=>{await page.goto(base);await page.waitForSelector('#brandLogo');};
  const onAdmin=()=>/\/staff\/admin\/$/.test(page.url());
  await fresh();
  const before=await page.evaluate(()=>document.querySelector('header').outerHTML);
  await tap(1);ok(!onAdmin(),mode+': 1번 탭 이동 없음');
  await tap(3);ok(!onAdmin(),mode+': 4번 탭 이동 없음');
  const after=await page.evaluate(()=>document.querySelector('header').outerHTML);
  ok(before===after,mode+': 탭 중 헤더 DOM 변화(힌트) 없음');
  await sleep(1200);await tap(4);ok(!onAdmin(),mode+': 간격 1초 초과 후 리셋(1+3+4 탭 이동 없음)');
  await fresh();await tap(2);await sleep(1100);await tap(3);ok(!onAdmin(),mode+': 간격 초과 후 3번만 -> 이동 없음');
  await fresh();for(let i=0;i<5;i++){await page.locator('#brandLogo').dispatchEvent('click');await sleep(900);}ok(!onAdmin(),mode+': 2.5초 초과(0.9초 간격 5번) 이동 없음');
  await fresh();await tap(5);await page.waitForURL(/\/staff\/admin\/$/,{timeout:3000}).catch(()=>{});ok(onAdmin(),mode+': 5번 탭 -> .../staff/admin/ 같은 탭 이동');
  await fresh();
  const a=await page.evaluate(()=>{const l=document.getElementById('brandLogo'),cs=getComputedStyle(l);return {alt:l.alt,drag:l.draggable,ta:cs.touchAction,uc:cs.userSelect,tc:cs.webkitTouchCallout,ol:cs.outlineStyle,
   vis:[...document.querySelectorAll('body *')].filter(e=>!e.closest('script,style')).flatMap(e=>[e.getAttribute('alt'),e.getAttribute('title'),e.getAttribute('aria-label'),e.children.length?'':e.textContent]).filter(Boolean).filter(t=>/어드민|admin/i.test(t))};});
  ok(a.alt==='Haragogipe 하라고지페'&&a.drag===false&&a.ta==='manipulation'&&a.uc==='none'&&a.ol==='none',mode+': 로고 속성(alt·드래그·터치·선택·윤곽선)');
  ok(a.vis.length===0,mode+': 화면 문구·alt·title·aria-label에 어드민 없음 '+JSON.stringify(a.vis));
  await ctx.close();
 }
 await br.close();srv.close();console.log(fail?'실패 '+fail:'모두 통과');process.exit(fail?1:0);
})();
