// 편집 화면 안정성 점검: 폰(390x844, 터치, dpr3)에서 편집 동작 전후의 스크롤·행 위치·포커스를 수치로 재고 임계값으로 pass/fail 한다.
// 사용: node 편집_안정성_점검.js            (임계값 검사, 실패 시 종료코드 1)
//       node 편집_안정성_점검.js --표       (측정 표만 출력, 실패해도 종료코드 0)
//       기본은 iOS Safari 처럼 스크롤 앵커링 없음(overflow-anchor:none)으로 잰다. --크롬앵커 는 크롬 기본 동작.
//       node 편집_안정성_점검.js --주소 https://.../staff/?v=x   (직원 웹 주소만 점검, 어드민 제외)
const fs=require('fs'),path=require('path');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const root=path.join(__dirname,'..');
const argv=process.argv.slice(2),CHROME_ANCHOR=argv.includes('--크롬앵커'),TABLE_ONLY=argv.includes('--표'),urlArg=argv.includes('--주소')?argv[argv.indexOf('--주소')+1]:null;
const LIMIT_Y=2;        // 의도 없는 y 변화 허용치(px)
const LIMIT_SHIFT=0.02; // 동작 1회당 layout-shift 점수 허용치
const VW=390,VH=844,KB=336; // 가상 키보드 높이(뷰포트 축소로 근사)
const results=[];
function rec(page,name,r,limit){results.push({page,name,...r,limit});}

const SNAP=`(function(sel){
  const t=sel?document.querySelector(sel):null,r=t?t.getBoundingClientRect():null,a=document.activeElement;
  return {sy:Math.round(window.scrollY*10)/10,y:r?Math.round(r.top*10)/10:null,h:document.documentElement.scrollHeight,
    ae:a&&a!==document.body?(a.__m?'same':'other'):'none'};
})`;
async function snap(page,sel){return page.evaluate(`${SNAP}(${JSON.stringify(sel||null)})`);}
async function mark(page,sel){await page.evaluate(s=>{const e=document.querySelector(s);if(e)e.__m=1;},sel);}
async function kbOn(page){await page.setViewportSize({width:VW,height:VH-KB});}
async function kbOff(page){await page.setViewportSize({width:VW,height:VH});}
async function shifts(page){return page.evaluate(()=>window.__ls||0);}
async function install(page){
  if(!CHROME_ANCHOR)await page.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>{const st=document.createElement('style');st.textContent='*{overflow-anchor:none!important}';document.head.append(st);});});
  await page.addInitScript(()=>{window.__ls=0;try{new PerformanceObserver(l=>{l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__ls+=e.value;});}).observe({type:'layout-shift',buffered:true});}catch(e){}});
}
// 한 동작 측정: target 의 y 변화, 스크롤 변화, 문서 높이 변화
async function act(page,P,name,target,fn,opt={}){
  const before=await snap(page,target),ls0=await shifts(page);
  await fn();
  await page.waitForTimeout(opt.wait||120);
  const after=await snap(page,target),ls1=await shifts(page);
  const dy=before.y==null||after.y==null?null:Math.round((after.y-before.y)*10)/10;
  rec(P,name,{dy,dsy:Math.round((after.sy-before.sy)*10)/10,dh:after.h-before.h,focus:after.ae,ls:Math.round((ls1-ls0)*1000)/1000,wantVisible:opt.wantVisible,wantBtnFocus:opt.wantBtnFocus},opt.limit);
  return {before,after};
}
async function typing(page,P,name,sel,text){
  const b0=await snap(page,sel);let mdy=0,msy=0,mdh=0,lost=0;
  for(const ch of text){await page.keyboard.type(ch);await page.waitForTimeout(8);const s=await snap(page,sel);mdy=Math.max(mdy,Math.abs(s.y-b0.y));msy=Math.max(msy,Math.abs(s.sy-b0.sy));mdh=Math.max(mdh,Math.abs(s.h-b0.h));if(s.ae!=='same')lost++;}
  rec(P,name,{dy:Math.round(mdy*10)/10,dsy:Math.round(msy*10)/10,dh:mdh,focus:lost?'유실 '+lost+'회':'same',ls:0,wantFocus:true,typing:true},LIMIT_Y);
}
const LONG='가나다라마바사아자차카타파하 1234567890 abcdefghijklmnop 시험 문구가 길어져 두 줄이 되는 경우';
const activeBox=async(page,tag)=>page.evaluate(t=>{const a=document.activeElement;if(!a||a.tagName!==t)return {ok:false,why:'포커스 없음'};const r=a.getBoundingClientRect();return {ok:r.top>=0&&r.bottom<=innerHeight,top:Math.round(r.top),bottom:Math.round(r.bottom),vh:innerHeight};},tag);
const keepFocus=async page=>page.evaluate(()=>{const a=document.activeElement;return a&&a!==document.body&&a.tagName==='BUTTON'?'버튼 유지':'버튼 아님';});

// ---------------- 직원 근무노트 ----------------
async function staff(browser,url,P){
  const ctx=await browser.newContext({viewport:{width:VW,height:VH},deviceScaleFactor:3,isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage();await install(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});await page.reload();
  await page.locator('[data-tab="checklist"]').tap();
  await page.locator('#editEnter').tap();await page.waitForSelector('.erow');
  const eid=async idx=>page.evaluate(i=>document.querySelectorAll('.erow[data-eid]')[i].dataset.eid,idx);
  const E=id=>`.erow[data-eid="${id}"]`;
  const center=async id=>{await page.evaluate(i=>{const r=document.querySelector(`.erow[data-eid="${i}"]`).getBoundingClientRect();window.scrollBy(0,r.top-300);},id);await page.waitForTimeout(100);};
  const idA=await eid(8);await center(idA);
  const T=E(idA)+' textarea';
  await act(page,P,'입력창 탭(포커스)+키보드 올라옴',T,async()=>{await page.locator(T).tap();await mark(page,T);await kbOn(page);},{limit:LIMIT_Y});
  await typing(page,P,`글자 입력 ${LONG.length}자(한 글자씩)`,T,LONG);
  await kbOff(page);await page.evaluate(()=>document.activeElement.blur());
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(100);
  const lastId=await page.evaluate(()=>{const r=[...document.querySelectorAll('.erow[data-eid]')];return r[r.length-1].dataset.eid;});
  const TL=E(lastId)+' textarea';
  await page.locator(TL).tap();await mark(page,TL);await kbOn(page);await page.waitForTimeout(100);
  await typing(page,P,'맨 아래 항목에서 글자 입력',TL,'마지막 항목 입력 시험 문구 길게 길게 길게 길게 길게 길게 길게');
  await kbOff(page);await page.evaluate(()=>document.activeElement.blur());
  await center(idA);
  await act(page,P,'▲ 이동(행 위치)',E(idA),async()=>{await page.locator(E(idA)+' .e-up').tap();},{limit:LIMIT_Y});
  await act(page,P,'▼ 이동(행 위치)',E(idA),async()=>{await page.locator(E(idA)+' .e-down').tap();},{limit:LIMIT_Y});
  await act(page,P,'▼ 이동 연타 2회째',E(idA),async()=>{await page.locator(E(idA)+' .e-down').tap();},{limit:LIMIT_Y});
  results[results.length-1].btn=await keepFocus(page);
  await act(page,P,'삭제',E(idA),async()=>{await page.locator(E(idA)+' .e-del').tap();},{limit:LIMIT_Y});
  await act(page,P,'되돌리기',E(idA),async()=>{await page.locator(E(idA)+' .e-del').tap();},{limit:LIMIT_Y});
  await act(page,P,'속성 패널 열기',T,async()=>{await page.locator(E(idA)+' .e-more').tap();},{limit:LIMIT_Y});
  await act(page,P,'요일 칩 토글(배지 생김)',T,async()=>{await page.locator(E(idA)+' .edays button').first().tap();},{limit:LIMIT_Y});
  await act(page,P,'속성 패널 닫기',T,async()=>{await page.locator(E(idA)+' .e-more').tap();},{limit:LIMIT_Y});
  // 빈 문구로 두고 포커스를 옮기면 위쪽 안내 줄이 생김(iOS 는 위쪽 높이 변화를 보정 안 함)
  await page.locator(T).tap();await mark(page,T);await kbOn(page);
  await act(page,P,'문구 비우고 포커스 이탈(위쪽 안내 줄 생김)',E(idA),async()=>{await page.locator(T).fill('');await page.evaluate(()=>document.activeElement.blur());await kbOff(page);},{limit:LIMIT_Y,wait:200});
  await center(idA);
  const sec=await page.evaluate(id=>document.querySelector(`.erow[data-eid="${id}"]`).closest('.esec').dataset.sid,idA);
  await act(page,P,'항목 추가(새 입력창 보임·포커스)',null,async()=>{await page.locator(`.esec[data-sid="${sec}"] .eadd`).tap();await page.waitForTimeout(50);await kbOn(page);},{wantVisible:true,limit:null,wait:300});
  results[results.length-1].addCheck=await activeBox(page,'TEXTAREA');
  await kbOff(page);await page.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight-1200));await page.waitForTimeout(100);
  await act(page,P,'소제목 추가(새 입력창 보임·포커스)',null,async()=>{await page.locator('#editAddSection').tap();await page.waitForTimeout(50);await kbOn(page);},{wantVisible:true,limit:null,wait:300});
  results[results.length-1].addCheck=await activeBox(page,'INPUT');
  await kbOff(page);await page.evaluate(()=>document.activeElement&&document.activeElement.blur());
  const sumBefore=await page.textContent('#editSummary');
  await page.reload();await page.waitForSelector('.erow');await page.waitForTimeout(200);
  const sumAfter=await page.textContent('#editSummary');
  rec(P,'새로고침 후 복원(편집 모드·변경 건수 유지)',{dy:null,dsy:null,dh:0,focus:'-',ls:0,restore:sumBefore===sumAfter&&await page.locator('#editRoot').isVisible()},null);
  const h0=(await snap(page)).h;await page.locator('.etext').first().tap();await kbOn(page);await page.waitForTimeout(100);const h1=(await snap(page)).h;
  rec(P,'포커스 시 문서 높이 변화(하단 탭 숨김 포함)',{dy:null,dsy:null,dh:h1-h0,focus:'-',ls:0,docH:true},null);
  const ta=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>getComputedStyle(b).touchAction!=='manipulation').length);
  rec(P,'더블탭 확대 방지 아닌 버튼 개수(touch-action)',{dy:null,dsy:null,dh:0,focus:'-',ls:0,small:ta},null);
  const small=await page.evaluate(()=>[...document.querySelectorAll('.etext,.esec-title,.ememo')].filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).length);
  rec(P,'입력창 글자 16px 미만 개수',{dy:null,dsy:null,dh:0,focus:'-',ls:0,small},null);
  rec(P,'페이지 오류',{dy:null,dsy:null,dh:0,focus:'-',ls:0,errs:errors.length},null);
  await ctx.close();
}

// ---------------- 어드민(로컬 파일, 서버는 점검용 메모리 모의) ----------------
async function admin(browser,P){
  const {DatabaseSync}=require('node:sqlite');
  const worker=require('../서버/index.js').default;
  const html=fs.readFileSync(path.join(root,'어드민.html'),'utf8'),API=html.match(/var ADMIN_API_BASE="([^"]+)"/)[1];
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(root,'서버','checklist-schema.sql'),'utf8'));db.exec(fs.readFileSync(path.join(root,'서버','shifts-schema.sql'),'utf8'));
  const d1={prepare(sql){const st=db.prepare(sql);let a=[];const o={bind(...x){a=x;return o;},async run(){return{meta:{changes:Number(st.run(...a).changes)}};},async first(){return st.get(...a)||null;},async all(){return{results:st.all(...a)};}};return o;}};
  const env={AI_LIMITER:{async limit(){return{success:true};}},SHIFTS_DB:d1,ADMIN_PASSWORD:'screen-test-password-not-real',ADMIN_TOKEN_SECRET:'screen-test-secret-not-real-0123456789'};
  const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET, POST, PUT, OPTIONS'};
  const ctx=await browser.newContext({viewport:{width:VW,height:VH},deviceScaleFactor:3,isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage();await install(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(u=>u.href.startsWith(API),async route=>{
    const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:CORS});
    const headers={Origin:'https://fastkorea12-png.github.io','content-type':'application/json','CF-Connecting-IP':'4.4.4.4'};const a=req.headers().authorization;if(a)headers.authorization=a;
    const r=await worker.fetch(new Request(req.url(),{method:req.method(),headers,body:req.postData()||undefined}),env);
    route.fulfill({status:r.status,headers:{...CORS,'content-type':'application/json'},body:await r.text()});
  });
  await page.goto('file://'+path.join(root,'어드민.html'));await page.waitForSelector('#loginGo');
  await page.fill('#pw','screen-test-password-not-real');await page.locator('#loginGo').tap();await page.waitForSelector('#saveBtn');
  const eid=async idx=>page.evaluate(i=>document.querySelectorAll('[data-row]')[i].getAttribute('data-row'),idx);
  const E=id=>`[data-row="${id}"]`;
  const center=async id=>{await page.evaluate(i=>{const r=document.querySelector(`[data-row="${i}"]`).getBoundingClientRect();window.scrollBy(0,r.top-300);},id);await page.waitForTimeout(100);};
  const idA=await eid(8);await center(idA);
  const T=E(idA)+' textarea';
  await act(page,P,'입력창 탭(포커스)+키보드 올라옴',T,async()=>{await page.locator(T).tap();await mark(page,T);await kbOn(page);},{limit:LIMIT_Y});
  await typing(page,P,`글자 입력 ${LONG.length}자(한 글자씩)`,T,LONG);
  await kbOff(page);await page.evaluate(()=>document.activeElement.blur());
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(100);
  const lastId=await page.evaluate(()=>{const r=[...document.querySelectorAll('[data-row]')];return r[r.length-1].getAttribute('data-row');});
  const TL=E(lastId)+' textarea';
  await page.locator(TL).tap();await mark(page,TL);await kbOn(page);await page.waitForTimeout(100);
  await typing(page,P,'맨 아래 항목에서 글자 입력',TL,'마지막 항목 입력 시험 문구 길게 길게 길게 길게 길게');
  await kbOff(page);await page.evaluate(()=>document.activeElement.blur());
  await center(idA);
  await act(page,P,'▲ 이동(행 위치)',E(idA),async()=>{await page.locator(E(idA)+' button[aria-label="항목 위로"]').tap();},{limit:LIMIT_Y});
  await act(page,P,'▼ 이동(행 위치)',E(idA),async()=>{await page.locator(E(idA)+' button[aria-label="항목 아래로"]').tap();},{limit:LIMIT_Y});
  await act(page,P,'▼ 이동 연타 2회째',E(idA),async()=>{await page.locator(E(idA)+' button[aria-label="항목 아래로"]').tap();},{limit:LIMIT_Y});
  results[results.length-1].btn=await keepFocus(page);
  await act(page,P,'삭제',E(idA),async()=>{await page.locator(E(idA)+' button.danger').tap();},{limit:LIMIT_Y});
  await act(page,P,'되돌리기',E(idA),async()=>{await page.locator(E(idA)+' .rbar button').last().tap();},{limit:LIMIT_Y});
  await act(page,P,'속성 패널 열기',T,async()=>{await page.locator(E(idA)+' button[aria-expanded]').tap();},{limit:LIMIT_Y});
  await act(page,P,'요일 칩 토글(배지 생김)',T,async()=>{await page.locator(E(idA)+' .chips button').first().tap();},{limit:LIMIT_Y});
  await act(page,P,'속성 패널 닫기',T,async()=>{await page.locator(E(idA)+' button[aria-expanded]').tap();},{limit:LIMIT_Y});
  const sec=await page.evaluate(id=>document.querySelector(`[data-row="${id}"]`).closest('[data-section]').getAttribute('data-section'),idA);
  await act(page,P,'항목 추가(새 입력창 보임·포커스)',null,async()=>{await page.locator(`[data-add="${sec}"]`).tap();await page.waitForTimeout(50);await kbOn(page);},{wantVisible:true,limit:null,wait:300});
  results[results.length-1].addCheck=await activeBox(page,'TEXTAREA');
  await kbOff(page);await page.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(100);
  await act(page,P,'소제목 추가(새 소제목 보임)',null,async()=>{await page.locator('#addSection').tap();await page.waitForTimeout(50);},{wantVisible:true,limit:null,wait:300});
  results[results.length-1].addCheck=await page.evaluate(()=>{const t=[...document.querySelectorAll('[data-section] input[type=text]')].filter(i=>i.value==='새 소제목').pop();if(!t)return {ok:false,why:'없음'};const r=t.getBoundingClientRect();return {ok:r.top>=0&&r.bottom<=innerHeight,top:Math.round(r.top),bottom:Math.round(r.bottom),vh:innerHeight};});
  const ta=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>getComputedStyle(b).touchAction!=='manipulation').length);
  rec(P,'더블탭 확대 방지 아닌 버튼 개수(touch-action)',{dy:null,dsy:null,dh:0,focus:'-',ls:0,small:ta},null);
  const small=await page.evaluate(()=>[...document.querySelectorAll('textarea,input')].filter(e=>e.offsetParent&&parseFloat(getComputedStyle(e).fontSize)<16).length);
  rec(P,'입력창 글자 16px 미만 개수',{dy:null,dsy:null,dh:0,focus:'-',ls:0,small},null);
  rec(P,'페이지 오류',{dy:null,dsy:null,dh:0,focus:'-',ls:0,errs:errors.length},null);
  await ctx.close();
}

function judge(r){
  const f=[];
  if(r.limit!=null&&r.dy!=null&&Math.abs(r.dy)>r.limit)f.push(`행 y ${r.dy}px`);
  if(r.typing&&Math.abs(r.dsy)>r.limit)f.push(`스크롤 ${r.dsy}px`);
  if(r.wantFocus&&r.focus!=='same')f.push('포커스 '+r.focus);
  if(r.wantVisible&&!(r.addCheck&&r.addCheck.ok))f.push('새 입력창이 화면 밖이거나 포커스 없음 '+JSON.stringify(r.addCheck||{}));
  if(r.btn&&r.btn!=='버튼 유지')f.push('이동 후 버튼 포커스 유실');
  if(r.restore===false)f.push('복원 실패');
  if(r.small)f.push('기준 미달 '+r.small+'개');
  if(r.errs)f.push('페이지 오류');
  if(r.docH&&Math.abs(r.dh)>2)f.push('문서 높이 '+r.dh);
  if(r.ls>LIMIT_SHIFT)f.push('layout-shift '+r.ls);
  return f;
}
(async()=>{
  const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try{
    if(urlArg)await staff(browser,urlArg,'직원(주소)');
    else{await staff(browser,'file://'+path.join(root,'근무노트.html'),'직원');await admin(browser,'어드민');}
  }finally{await browser.close();}
  let bad=0;
  console.log('| 화면 | 동작 | 대상 y 변화(px) | 스크롤 변화(px) | 문서높이 변화(px) | 포커스 | layout-shift | 판정 |\n|---|---|---|---|---|---|---|---|');
  for(const r of results){
    const f=judge(r);if(f.length)bad++;
    const extra=r.addCheck&&r.addCheck.top!=null?` (새 입력창 ${r.addCheck.top}~${r.addCheck.bottom}/${r.addCheck.vh})`:'';
    console.log(`| ${r.page} | ${r.name}${extra} | ${r.dy==null?'-':r.dy} | ${r.dsy==null?'-':r.dsy} | ${r.dh} | ${r.btn||r.focus} | ${r.ls} | ${f.length?'FAIL '+f.join('; '):'ok'} |`);
  }
  console.log(bad?`\n편집 안정성 점검: ${bad}건 실패`:'\n편집 안정성 점검: 통과');
  if(bad&&!TABLE_ONLY)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1);});
