// 와인 재고 '필요 목록' 점검: 직원 재고 조사 화면(보기 토글)과 어드민 재고 조사 탭(필요 목록). (node 도구/필요목록_점검.js, HARAGO_PLAYWRIGHT 필요)
// 실제 Worker 코드에 메모리 D1을 붙이고 서버 응답만 모의한다. 비밀번호는 가짜 값, 외부 요청 없음. 캡처는 HARAGO_SHOTS(기본 /private/tmp/harago-1014-shots).
// 확인: 필요·없음만 모음 / 충분·미조사 제외 / 미조사 따로 / 종류 순서 / 오래됨 배지 / 복사 텍스트는 이름·상태·수량·조사일만(금지 열 단어 없음) / 빈 목록 안내 / 모바일 폭.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const root=path.join(__dirname,'..'),min3=require('./재고기준_시험본.js'),STAFF_URL=min3('재고조사.html'),ADMIN_URL=min3('어드민.html'),staffHtml=fs.readFileSync(path.join(root,'재고조사.html'),'utf8'),adminHtml=fs.readFileSync(path.join(root,'어드민.html'),'utf8');
const worker=require('../서버/index.js').default,extract=require('./재고조사_추출.js');
const ORIGIN='https://fastkorea12-png.github.io',PW='need-list-password-not-real',SECRET='need-list-secret-not-real-0123456789';
const API=staffHtml.match(/var API_BASE="([^"]+)"/)[1];
const shotDir=process.env.HARAGO_SHOTS||'/private/tmp/harago-1014-shots';fs.mkdirSync(shotDir,{recursive:true});
// 복사·화면에 나오면 안 되는 열 이름(막는 용도의 문자열)
const BANNED=/주류회사|수입사|매입|도매|희망|발주|국가|품종|가격|원산지|급여|계좌|시급/;
const wl=extract(),RED=wl.groups[0].items,WHITE=wl.groups[1].items;
const db=new DatabaseSync(':memory:');for(const f of ['checklist-schema.sql','shifts-schema.sql','content-schema.sql','inventory-schema.sql','inventory-schema-2.sql'])db.exec(fs.readFileSync(path.join(root,'서버',f),'utf8'));
const d1={prepare(sql){const st=db.prepare(sql);let a=[];const o={bind(...x){a=x.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return o;},async run(){return{meta:{changes:Number(st.run(...a).changes)}};},async first(){return st.get(...a)||null;},async all(){return{results:st.all(...a)};}};return o;}};
const env={AI_LIMITER:{async limit(){return{success:true};}},SHIFTS_DB:d1,ADMIN_PASSWORD:PW,ADMIN_TOKEN_SECRET:SECRET,INVENTORY_FORM_FALLBACK:'off'};
const waits=[],wctx={waitUntil(p){waits.push(p);}};
const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS'};
let ipN=0;
async function call(method,p,body){const r=await worker.fetch(new Request('https://worker.test'+p,{method,headers:{Origin:ORIGIN,'content-type':'application/json','CF-Connecting-IP':'9.9.'+Math.floor(++ipN/200)+'.'+(ipN%200)},body:body===undefined?undefined:JSON.stringify(body)}),env,wctx);await Promise.all(waits.splice(0));return {status:r.status,json:await r.json()};}
global.fetch=async u=>{throw new Error('외부 요청 금지: '+u);};
async function mock(page){
 await page.route(u=>u.href.startsWith(API),async route=>{
  const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:CORS});
  const headers={Origin:ORIGIN,'CF-Connecting-IP':'4.4.4.4','content-type':'application/json'};if(req.headers().authorization)headers.authorization=req.headers().authorization;
  const r=await worker.fetch(new Request(req.url(),{method:req.method(),headers,body:req.postData()||undefined}),env,wctx);await Promise.all(waits.splice(0));
  route.fulfill({status:r.status,headers:{...CORS,'content-type':'application/json'},body:await r.text()});
 });
}
const kd=ms=>new Date(ms+9*3600000).toISOString().slice(0,10),TODAY=kd(Date.now()),AGO=n=>kd(Date.now()-n*86400000),md=d=>(+d.slice(5,7))+'/'+(+d.slice(8,10));
const uuid=()=>require('crypto').randomUUID();
const survey=async(gid,gname,items,loc,vals,date)=>{await new Promise(r=>setTimeout(r,8));const r=await call('POST','/api/inventory/survey',{surveyId:uuid(),groupId:gid,groupName:gname,loc,surveyDate:date,entries:vals.map((q,i)=>({itemId:items[i].id,qty:q,name:items[i].name,no:i+1}))});assert.equal(r.status,201,JSON.stringify(r.json));};
const initClip=()=>{window.__clip=[];Object.defineProperty(window,'isSecureContext',{value:true});Object.defineProperty(navigator,'clipboard',{value:{writeText:t=>{window.__clip.push(t);return Promise.resolve();}},configurable:true});};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const log=[],ok=m=>log.push(m),shots=[];
 const open=async(w,h)=>{const c=await browser.newContext({viewport:{width:w,height:h},timezoneId:'Asia/Seoul'}),page=await c.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=r.url();if(/^https?:/.test(u)&&!u.startsWith(API))external.push(u);});
  await page.addInitScript(initClip);await mock(page);return {c,page,errors,external};};
 const noOverflow=async(page,n)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'가로 넘침 '+n);
 try{
  // ---- 0. 서버에 아무 기록 없음 → 빈 목록(전부 미조사)
  { const {c,page,errors}=await open(390,844);await page.goto(STAFF_URL);await page.waitForSelector('#chips button');await page.waitForTimeout(300);
    await page.click('#views [data-view=need]');await page.waitForTimeout(100);
    assert.match(await page.textContent('#needEmpty'),/지금 필요한 와인이 없어요/);assert.equal(await page.locator('#needCopy').count(),0,'빈 목록은 복사 버튼 없음');
    assert.match(await page.textContent('#needUn summary'),/미조사 72종/);ok('빈 목록 안내·전부 미조사');assert.equal(errors.length,0,errors.join());await c.close(); }
  // ---- 시드: 레드 냉장고 [0,1,2,3,4] (첫 와인은 7일 전), 창고 [_,3], 레드 6번째 창고만 2(냉장고 기록 없음), 화이트 냉장고 [1,5]
  await survey('red','레드',RED,'fridge',[0],AGO(7));
  await survey('red','레드',RED.slice(1),'fridge',[1,2,3,4],TODAY);
  await survey('red','레드',RED.slice(0,1),'storage',[7],TODAY);
  await survey('red','레드',RED.slice(1,2),'storage',[3],TODAY);
  await survey('red','레드',RED.slice(5,6),'storage',[2],TODAY);
  await survey('white','화이트',WHITE,'fridge',[1,5],AGO(1));
  const expectLines=['필요 와인 (조사일 '+md(TODAY)+')','[레드]',
   '- '+RED[0].name+' (없음, 냉장고 0·창고 7, 조사 '+md(AGO(7))+')',
   '- '+RED[1].name+' (필요, 냉장고 1·창고 3)',
   '- '+RED[2].name+' (필요, 냉장고 2·창고 -)',
   '['+wl.groups[1].name+']','- '+WHITE[0].name+' (필요, 냉장고 1·창고 -, 조사 '+md(AGO(1))+')'];
  const expected=expectLines.join('\n');
  const checkCopy=t=>{assert.equal(t,expected);assert.doesNotMatch(t,BANNED,'금지 열 단어');assert(!t.includes(RED[3].name)&&!t.includes(RED[4].name)&&!t.includes(RED[5].name),'충분·미조사 제외');};

  // ---- 1. 직원 화면
  for(const [w,h,tag] of [[390,844,'390'],[500,900,'500']]){
    const {c,page,errors,external}=await open(w,h);await page.goto(STAFF_URL);await page.waitForSelector('#chips button');await page.waitForTimeout(400);
    assert.deepEqual(await page.$$eval('#views button',b=>b.map(x=>x.textContent)),['수량 입력','필요 목록','발주 멘트']);
    assert.equal(await page.isVisible('#survey'),true);assert.equal(await page.isHidden('#need'),true);
    await page.click('#views [data-view=need]');await page.waitForTimeout(100);
    assert.equal(await page.isHidden('#survey'),true);assert.equal(await page.isHidden('#bar'),true,'제출 바 숨김');assert.equal(await page.getAttribute('#views [data-view=need]','aria-pressed'),'true');
    assert.match(await page.textContent('#needCount'),/필요·없음 4종/);
    assert.deepEqual(await page.$$eval('#need [data-ngroup]',e=>e.map(x=>x.textContent)),['레드 3종',wl.groups[1].name+' 1종'],'종류 묶음 순서');
    const rows=await page.$$eval('#need [data-need]',e=>e.map(x=>({id:x.dataset.need,t:x.innerText.replace(/\s+/g,' ').trim()})));
    assert.deepEqual(rows.map(r=>r.id),[RED[0].id,RED[1].id,RED[2].id,WHITE[0].id]);
    assert.match(rows[0].t,new RegExp(RED[0].name+' ✕ 없음 냉장고 0 · 창고 7 조사 '+md(AGO(7))+' 오래됨'));assert.match(rows[1].t,/▲ 필요 냉장고 1 · 창고 3 조사/);assert.doesNotMatch(rows[1].t,/오래됨/);assert.match(rows[2].t,/창고 -/);
    assert.match(await page.textContent('#needUn summary'),/미조사 65종/);
    assert.equal(await page.locator('#needUn').evaluate(e=>e.open),false);
    const need=await page.textContent('#need');assert.doesNotMatch(need,BANNED);
    await page.click('#needCopy');await page.waitForTimeout(80);
    const clip=await page.evaluate(()=>window.__clip);assert.equal(clip.length,1);checkCopy(clip[0]);assert.match(await page.textContent('#needCopyMsg'),/복사됨/);
    // 미조사 목록 열기: 레드 6번째(창고만 기록)도 미조사
    await page.click('#needUn summary');assert((await page.textContent('#needUn')).includes(RED[5].name));
    await noOverflow(page,'직원 '+tag);await page.evaluate(()=>window.scrollTo(0,0));
    const f=path.join(shotDir,'need_staff_'+tag+'.png');await page.screenshot({path:f,fullPage:true});shots.push(f);
    // 검색하면 목록은 숨고 지우면 돌아옴, 수량 입력으로 돌아가면 입력 화면
    await page.fill('#q','후안길');assert.equal(await page.isHidden('#need'),true);await page.fill('#q','');assert.equal(await page.isVisible('#need'),true);
    await page.click('#views [data-view=input]');assert.equal(await page.isVisible('#survey'),true);assert.equal(await page.isHidden('#need'),true);
    // 가로 폭 확인: 행이 화면 밖으로 안 나감
    assert.equal(errors.length,0,errors.join());assert.equal(external.length,0,external.join());await c.close();
  }
  ok('직원 화면: 필요·없음만(충분·미조사 제외), 묶음 순서, 오래됨 배지, 복사 텍스트 정확·금지 열 없음, 검색·토글 전환, 390/500 폭');
  // ---- 2. 서버 연결 실패 시 안내
  { const {c,page}=await open(390,844);await page.route(u=>u.href.startsWith(API),r=>r.abort(),{times:1});await page.goto(STAFF_URL);await page.waitForTimeout(500);await page.click('#views [data-view=need]');
    assert.match(await page.textContent('#needState'),/필요 목록 표시 불가/);assert.equal(await page.locator('#needCopy').count(),0);ok('수량 불러오기 실패: 표시 불가 안내(가짜 미조사 목록 안 만듦)');await c.close(); }
  // ---- 3. 어드민
  for(const [w,h,tag] of [[390,844,'390'],[1280,900,'desktop']]){
    const {c,page,errors,external}=await open(w,h);await page.goto(ADMIN_URL);await page.waitForSelector('#loginGo');
    await page.fill('#pw',PW);await page.fill('#nick','점장');await page.click('#loginGo');await page.waitForSelector('#saveBtn');
    await page.click('#navInv');await page.waitForSelector('#invChips');
    assert.deepEqual(await page.$$eval('.tabs.sub button',b=>b.map(x=>x.innerText.replace(/\s+/g,' ').trim())),['현황','필요 목록','조사 이력','와인 목록 편집','주방']);
    await page.click('#invTabNeed');await page.waitForSelector('#needCount');
    assert.match(await page.textContent('#needCount'),/필요·없음 4종/);
    const rows=await page.$$eval('[data-need]',e=>e.map(x=>({id:x.dataset.need,t:x.innerText.replace(/\s+/g,' ').trim()})));
    assert.deepEqual(rows.map(r=>r.id),[RED[0].id,RED[1].id,RED[2].id,WHITE[0].id]);
    assert.match(rows[0].t,/✕ 없음 냉장고 0 · 창고 7 조사 \d+\/\d+ 오래됨/);assert.match(rows[1].t,/▲ 필요 냉장고 1 · 창고 3/);
    assert.deepEqual(await page.$$eval('[data-ngroup]',e=>e.map(x=>x.textContent)),['레드 3종',wl.groups[1].name+' 1종']);
    assert.match(await page.textContent('#needUn summary'),/미조사 65종/);
    // 어드민에는 10/19부터 '발주 멘트' 보기 버튼(관리자 전용)이 있으므로 필요 목록 본문(#needList)만 검사한다. 직원 화면은 위에서 화면 전체를 검사.
    assert.deepEqual(await page.$$eval('#needViews button',b=>b.map(x=>x.textContent)),['필요 목록','발주 멘트']);assert.equal(await page.getAttribute('#needViews [data-nview=list]','aria-pressed'),'true');
    const txt=await page.evaluate(()=>document.getElementById('needList').innerText);assert.doesNotMatch(txt,/주류회사|매입|도매|희망|발주|국가|품종|가격|수입사/);
    await page.click('#needCopy');await page.waitForTimeout(80);const clip=await page.evaluate(()=>window.__clip);assert.equal(clip.length,1);checkCopy(clip[0]);
    await noOverflow(page,'어드민 '+tag);
    const tabsFit=await page.evaluate(()=>{const t=document.querySelector('.tabs.sub');return t.scrollWidth<=t.clientWidth+1||getComputedStyle(t).overflowX==='auto'||getComputedStyle(t).flexWrap==='wrap';});assert(tabsFit,'하위 탭 폭 처리');
    await page.evaluate(()=>window.scrollTo(0,0));const f=path.join(shotDir,'need_admin_'+tag+'.png');await page.screenshot({path:f,fullPage:true});shots.push(f);
    assert.equal(errors.length,0,errors.join());assert.equal(external.length,0,external.join());await c.close();
  }
  ok('어드민: 필요 목록 탭, 필요·없음만, 묶음·배지, 복사 텍스트 정확·금지 열 없음, 390/데스크톱');
  // ---- 4. 필요한 와인이 없어지면(전부 충분) 안내
  await survey('red','레드',RED,'fridge',RED.map(()=>5),TODAY);await survey('white','화이트',WHITE,'fridge',WHITE.map(()=>5),TODAY);
  { const {c,page}=await open(390,844);await page.goto(STAFF_URL);await page.waitForSelector('#chips button');await page.waitForTimeout(400);await page.click('#views [data-view=need]');
    assert.match(await page.textContent('#needEmpty'),/지금 필요한 와인이 없어요/);assert.equal(await page.locator('#needCopy').count(),0);
    const f=path.join(shotDir,'need_staff_empty.png');await page.screenshot({path:f});shots.push(f);ok('목록이 비면 안내만, 복사 버튼 없음');await c.close(); }
  // 정적 확인: 두 화면 소스에 금지 열 값을 읽는 코드가 없다(복사 함수는 name·상태·수량·날짜만 사용)
  for(const [n,src] of [['직원',staffHtml],['어드민',adminHtml]]){const m=src.match(/function (needText|invNeedText)[\s\S]*?\n}\n/);assert(m,n+' 복사 함수');assert.doesNotMatch(m[0],BANNED,n+' 복사 함수에 금지 열');}
  ok('복사 함수 소스에 금지 열 없음');
  console.log(JSON.stringify({ok:true,log,shots},null,1));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
