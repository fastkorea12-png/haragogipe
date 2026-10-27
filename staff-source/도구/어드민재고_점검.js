// 어드민.html '재고 조사' 탭 점검(현황·조사 이력·시트 상태·재전송·와인 목록 편집·발행·복원): 실제 Worker 코드에 메모리 D1을 붙이고 서버 응답만 모의한다. (node 도구/어드민재고_점검.js)
// 비밀번호는 가짜 값, 외부 요청은 서버 모의뿐(구글 양식·앱스크립트는 fetch 모의). 캡처는 HARAGO_SHOTS(기본 /private/tmp/harago-1014-shots).
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const root=path.join(__dirname,'..'),pageUrl=require('./재고기준_시험본.js')('어드민.html'),html=fs.readFileSync(path.join(root,'어드민.html'),'utf8');
const worker=require('../서버/index.js').default;
const extract=require('./재고조사_추출.js');
const ORIGIN='https://fastkorea12-png.github.io',PW='inv-admin-password-not-real',SECRET='inv-admin-secret-not-real-0123456789';
const SHEET_URL='https://script.google.com/macros/s/inventory-admin-test/exec',SHEET_TOKEN='inv-admin-sheet-token-not-real';
const API=html.match(/var ADMIN_API_BASE="([^"]+)"/)[1];
const shotDir=process.env.HARAGO_SHOTS||'/private/tmp/harago-1014-shots';fs.mkdirSync(shotDir,{recursive:true});
assert(!/<script[^>]+src=|<link[^>]+href="https?:|@import|fonts\.googleapis/.test(html),'외부 자원 금지');
assert(!html.includes(PW)&&!html.includes(SHEET_TOKEN));
assert(!html.includes('/*WINES_JSON*/'),'와인 목록 시작값이 빌드로 채워짐');
const wl=extract(),RED=wl.groups[0].items;
const db=new DatabaseSync(':memory:');for(const f of ['checklist-schema.sql','shifts-schema.sql','content-schema.sql','inventory-schema.sql','inventory-schema-2.sql'])db.exec(fs.readFileSync(path.join(root,'서버',f),'utf8'));
const d1={prepare(sql){const st=db.prepare(sql);let a=[];const o={bind(...x){a=x.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return o;},async run(){return{meta:{changes:Number(st.run(...a).changes)}};},async first(){return st.get(...a)||null;},async all(){return{results:st.all(...a)};}};return o;}};
const env={AI_LIMITER:{async limit(){return{success:true};}},SHIFTS_DB:d1,ADMIN_PASSWORD:PW,ADMIN_TOKEN_SECRET:SECRET};
const waits=[],wctx={waitUntil(p){waits.push(p);}};
const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS'};
let ipN=0;
async function call(method,p,body,token){
 const headers={Origin:ORIGIN,'content-type':'application/json','CF-Connecting-IP':'8.8.'+(Math.floor(++ipN/200))+'.'+(ipN%200)};if(token)headers.authorization='Bearer '+token;
 const r=await worker.fetch(new Request('https://worker.test'+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env,wctx);await Promise.all(waits.splice(0));return {status:r.status,json:await r.json()};
}
const mode={form:'down',script:'down'},seen=[];
const realFetch=global.fetch;
global.fetch=async(u,o)=>{
 u=String(u);
 if(u===SHEET_URL){if(mode.script==='down')return new Response('x',{status:500});return new Response(JSON.stringify({ok:true}),{status:200});}
 if(u.startsWith('https://docs.google.com/forms/')){
  if(mode.form==='down')return new Response('x',{status:503});
  if(u.includes('/viewform'))return new Response('<form action="formResponse?hl=en"><input name="fbzx" value="1"></form>',{status:200});
  return new Response('<html>Your response has been recorded.</html>',{status:200});
 }
 throw new Error('외부 요청 금지: '+u);
};
const flags={abort:false};
async function mock(page){
 await page.route(u=>u.href.startsWith(API),async route=>{
  const req=route.request(),u=new URL(req.url());seen.push(req.method()+' '+u.pathname);
  if(flags.abort&&u.pathname!=='/api/admin/login')return route.abort();
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:CORS});
  const headers={Origin:ORIGIN,'CF-Connecting-IP':'4.4.4.4','content-type':'application/json'};const a=req.headers().authorization;if(a)headers.authorization=a;
  const r=await worker.fetch(new Request(req.url(),{method:req.method(),headers,body:req.postData()||undefined}),env,wctx);await Promise.all(waits.splice(0));
  route.fulfill({status:r.status,headers:{...CORS,'content-type':'application/json'},body:await r.text()});
 });
}
(async()=>{
 const browser=await chromium.launch(process.env.HARAGO_PLAYWRIGHT?{channel:'chrome',headless:true}:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const log=[],shots=[];const ok=m=>log.push(m);
 try{
  const uuid=()=>require('crypto').randomUUID();
  const kd=ms=>new Date(ms+9*3600000).toISOString().slice(0,10),TODAY=kd(Date.now()),AGO1=kd(Date.now()-86400000);
  const survey=async(loc,vals,over={})=>{await new Promise(r=>setTimeout(r,8));const r=await call('POST','/api/inventory/survey',{surveyId:uuid(),groupId:'red',groupName:'레드',loc,surveyDate:over.date||TODAY,entries:vals.map((q,i)=>({itemId:RED[i].id,qty:q,name:RED[i].name,no:i+1,...(i===0&&over.memo?{memo:over.memo}:{})})),nickname:over.nick});assert.equal(r.status,201,JSON.stringify(r.json));return r.json.surveyId;};
  // 시드: 양식 대체 기록이 실패(form_failed) → 나중에 재전송. 냉장고 0,1,2,3,4(어제 일자) / 창고 5
  const sA=await survey('fridge',[0,1,2,3,4],{memo:'냉장고 2번째 칸',nick:'하늘',date:AGO1});
  const sB=await survey('storage',[5,1]);
  mode.form='ok';const sC=await survey('fridge',[0,2,2,3,9]); // 이전 0,1,2,3,4 → 0,2,2,3,9 (form 성공)
  assert.equal(db.prepare('SELECT sheet_state AS s FROM inventory_surveys WHERE id=?').get(sA).s,'form_failed');assert.equal(db.prepare('SELECT sheet_state AS s FROM inventory_surveys WHERE id=?').get(sC).s,'form');
  mode.form='down';

  const c=await browser.newContext({viewport:{width:500,height:900},timezoneId:'Asia/Seoul'});
  const page=await c.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR/.test(m.text()))errors.push(m.text());});
  page.on('request',r=>{const u=r.url();if(/^https?:/.test(u)&&!u.startsWith(API))external.push(u);});
  await mock(page);
  const shot=async name=>{const f=path.join(shotDir,'admin_inv_'+name+'.png');await page.screenshot({path:f,fullPage:false});shots.push(f);};
  const yOf=sel=>page.evaluate(s=>{const e=document.querySelector(s);return e?Math.round(e.getBoundingClientRect().top*10)/10:null;},sel);
  const stable=async(name,sel,action,limit=2)=>{const a=await yOf(sel);await action();await page.waitForTimeout(80);const b=await yOf(sel);assert(a!=null&&b!=null&&Math.abs(b-a)<=limit,'흔들림 '+name+' '+a+' → '+b);ok('안정 '+name+' dy='+(b-a));};
  const noOverflow=async name=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'가로 넘침 '+name);
  const smallText=async name=>{const small=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.offsetParent&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<16&&!e.closest('script,style')).map(e=>e.tagName+':'+e.textContent.trim().slice(0,20)));assert.deepEqual(small,[],'16px 미만 '+name);};
  const check=async name=>{await noOverflow(name);await smallText(name);};
  const texts=sel=>page.$$eval(sel,els=>els.map(e=>e.innerText.replace(/\s+/g,' ').trim()));
  const noticeText=()=>page.textContent('.msg');

  // ---- 로그인과 탭
  await page.goto(pageUrl);await page.waitForSelector('#loginGo');
  await page.fill('#pw',PW);await page.fill('#nick','점장');await page.click('#loginGo');await page.waitForSelector('#saveBtn');
  assert.deepEqual(await texts('.tabs.top button'),['체크리스트','레시피','응대 멘트','제안함','제출 현황','재고 조사','신입 교육'].map((t,i,a)=>t).map(t=>t));
  const tabInfo=await page.evaluate(()=>{const t=document.querySelector('.tabs.top'),r=t.getBoundingClientRect();return {ow:getComputedStyle(t).overflowX,wrap:getComputedStyle(t).flexWrap,sw:t.scrollWidth,cw:t.clientWidth,h:Math.round(r.height),pageOverflow:document.documentElement.scrollWidth>window.innerWidth};});
  assert.equal(tabInfo.wrap,'nowrap');assert.equal(tabInfo.pageOverflow,false);assert(tabInfo.h<=60,'탭이 한 줄: '+tabInfo.h);
  ok('상단 탭 6개 한 줄(스크롤 '+tabInfo.sw+'/'+tabInfo.cw+')');
  await page.click('#navInv');await page.waitForSelector('#invChips');await page.waitForSelector('[data-inv]');
  assert.equal(await page.evaluate(()=>{const b=document.getElementById('navInv').getBoundingClientRect(),t=document.querySelector('.tabs.top').getBoundingClientRect();return b.left>=t.left-1&&b.right<=t.right+1;}),true,'재고 조사 탭이 보이는 영역 안(스크롤됨)'||'');
  await shot('0_tabs');
  // ---- 현황
  assert.deepEqual(await texts('#invChips button'),['레드','화이트 & 로제','스파클링','포트','내추럴','하프']);
  assert.equal((await page.$$('#invRows [data-inv]')).length,26);
  const row=id=>'#invRows [data-inv="'+id+'"]';
  const rt=async id=>(await texts(row(id)))[0];
  assert.match(await rt(RED[0].id),new RegExp('레드 · 1번 · 올드 핸즈 호벤.*냉장고 0병 ✕ 없음 조사 일자 '+TODAY+'.*창고 5병 조사 일자 '+TODAY+'.*마지막 조사 일자 '+TODAY+'.*냉장고: 냉장고 2번째 칸'));
  assert.match(await rt(RED[1].id),/냉장고 2병 ▲ 필요/);assert.match(await rt(RED[2].id),/냉장고 2병 ▲ 필요/);assert.match(await rt(RED[3].id),/냉장고 3병 ● 충분/);assert.match(await rt(RED[4].id),/냉장고 9병 ● 충분/);assert.match(await rt(RED[5].id),/냉장고 - - 미조사 조사 일자 - 창고 - 조사 일자 - 조사 기록 없음/);assert.equal(await page.locator(row(RED[0].id)+' [data-loc]').count(),2,'위치 칸 2개(진열장 없음)');assert(!(await page.textContent('body')).includes('진열장'),'화면에 진열장 없음');
  ok('현황: 위치별 수량·상태(색+글자)·마지막 조사·메모');
  await check('현황');await shot('1_status');
  await page.click('#invLow');assert.equal((await page.$$('#invRows [data-inv]')).length,3,'필요·없음만(0,2,2) — 미조사 제외');assert.equal(await page.getAttribute('#invLow','aria-pressed'),'true');
  await page.click('#invLow');
  await page.fill('#invQ','후안길');assert.equal((await page.$$('#invRows [data-inv]')).length,2);
  await page.fill('#invQ','포트');assert((await page.$$('#invRows [data-inv]')).length>=5);
  await page.fill('#invQ','zzz없음');assert.match(await page.textContent('#invEmpty'),/일치하는 와인 없음/);
  await stable('현황 검색 입력','#invQ',async()=>{await page.fill('#invQ','');await page.type('#invQ','롱반',{delay:20});});
  assert.equal((await page.$$('#invRows [data-inv]')).length,2);
  await page.fill('#invQ','');await page.click('#invChips [data-gid=port]');assert.equal((await page.$$('#invRows [data-inv]')).length,5);await page.click('#invChips [data-gid=red]');
  ok('현황 필터·검색·칸 선택');
  // ---- 이력
  await page.click('#invTabHist');await page.waitForSelector('[data-survey]');
  assert.equal((await page.$$('[data-survey]')).length,3);assert.match(await page.textContent('#invMode'),/앱스크립트 미설정\. 구글 양식으로 대체 기록 중/);
  const hist=await texts('[data-survey]');assert.match(hist[0],/레드 · 냉장고.*입력 5종.*양식 기록 성공\(대체\)/);assert.match(hist[1],/창고.*입력 2종.*양식 기록 실패/);assert.match(hist[2],/냉장고.*입력 5종.*양식 기록 실패/);
  assert(hist[0].startsWith(TODAY+' ')&&hist[2].startsWith(AGO1+' '),'이력 첫 줄은 조사 일자');assert.match(hist[0],/제출 \d+\/\d+ \d\d:\d\d/);
  await check('이력');await shot('2_history');
  await page.click('[data-survey="'+sA+'"]');await page.waitForSelector('#invDetail');
  assert.match(await page.textContent('#invDetail'),/레드 · 냉장고.*입력 5종.*하늘/);assert.match(await page.textContent('#invDetail'),new RegExp(AGO1+' · 레드'));assert.match(await page.textContent('#invDetailTimes'),new RegExp('^조사 일자 '+AGO1+' · 제출 시각 \\d+/\\d+ \\d\\d:\\d\\d$'));
  const ent=await texts('[data-entry]');assert.match(ent[0],/1\. 올드 핸즈 호벤 - → 0병.*메모: 냉장고 2번째 칸/);assert.match(ent[4],/5\. 샤또 오뜨 브랑드 - → 4병/);
  assert.equal(await page.isVisible('#invResend'),true);assert.match(await page.textContent('#invDetail'),/응답 시트에 보고문이 한 번 더/);
  await check('이력 상세');await shot('3_history_detail');
  // 재전송: 양식 아직 불가 → 실패 유지
  await page.click('#invResend');await page.waitForFunction(()=>!document.querySelector('#invResend')||!document.querySelector('#invResend').disabled);
  assert.match(await noticeText(),/재전송 결과: 양식 기록 실패/);assert.equal(await page.getAttribute('#invDetail [data-sheet]','data-sheet'),'form_failed');
  mode.form='ok';await page.click('#invResend');await page.waitForFunction(()=>!document.querySelector('#invResend'));
  assert.match(await noticeText(),/재전송 결과: 양식 기록 성공/);assert.equal(await page.getAttribute('#invDetail [data-sheet]','data-sheet'),'form');assert.equal(await page.isVisible('#invResend'),false);
  assert.equal(db.prepare('SELECT sheet_state AS s FROM inventory_surveys WHERE id=?').get(sA).s,'form');
  // 이전→새 수량(두 번째 냉장고 조사)
  await page.click('#invBack');await page.click('[data-survey="'+sC+'"]');await page.waitForSelector('#invDetail');
  const ent2=await texts('[data-entry]');assert.match(ent2[1],/2\. 라 푸리시마 모나스트렐 1병 → 2병/);assert.match(ent2[0],/0병 → 0병 \(변경 없음\)/);assert.match(ent2[4],/4병 → 9병/);
  ok('이력·상세(이전→새 수량)·시트 상태 배지·양식 대체 재전송');
  await page.click('#invBack');
  // 앱스크립트 설정 모드: 전송 성공/실패 배지와 재전송
  env.INVENTORY_SHEET_URL=SHEET_URL;env.INVENTORY_SHEET_TOKEN=SHEET_TOKEN;mode.script='down';
  const sD=await survey('storage',[7,7]);const sE=await survey('storage',[8]);
  mode.script='ok';const sF=await survey('storage',[9]);
  await page.click('#invTabStatus');await page.click('#invTabHist');await page.waitForSelector('[data-survey]');
  await page.click('#invRefresh').catch(()=>{});
  await page.reload();await page.waitForSelector('#navInv');await page.click('#navInv');await page.waitForSelector('[data-inv]');await page.click('#invTabHist');await page.waitForSelector('[data-survey]');
  assert.match(await page.textContent('#invMode'),/앱스크립트 연결됨\. 새 탭 '재고조사'에 기록/);
  const h2=await texts('[data-survey]');assert.match(h2[0],/창고.*시트 전송 성공/);assert.match(h2[1],/창고.*시트 전송 실패/);assert.match(h2[2],/창고.*시트 전송 실패/);
  await page.click('[data-survey="'+sD+'"]');await page.waitForSelector('#invResend');
  assert.equal(await page.isVisible('text=응답 시트에 보고문이 한 번 더'),false,'앱스크립트 모드에서는 중복 경고 없음');
  await page.click('#invResend');await page.waitForFunction(()=>!document.querySelector('#invResend'));assert.match(await noticeText(),/재전송 결과: 시트 전송 성공/);
  assert.equal(db.prepare('SELECT sheet_state AS s FROM inventory_surveys WHERE id=?').get(sD).s,'sent');
  ok('앱스크립트 모드: 실패 건 재전송 → 성공');
  await page.click('#invBack');
  delete env.INVENTORY_SHEET_URL;delete env.INVENTORY_SHEET_TOKEN;

  // ---- 와인 목록 편집
  await page.click('#invTabWines');await page.waitForSelector('[data-wrow]');
  assert.match(await page.textContent('.msg.warn'),/서버 발행본 없음\. 내장 목록이 시작값/);
  assert.equal((await page.$$('[data-wrow]')).length,26);assert.match(await page.textContent('#wChg'),/변경 0건/);assert.equal(await page.isDisabled('#wSave'),true);
  assert.deepEqual((await texts('#wChips button')).map(t=>t.replace(/\s*\d+$/,'')),['레드','화이트 & 로제','스파클링','포트','내추럴','하프']);
  assert.match((await texts('#wChips button'))[0],/레드 26/);
  await check('와인 편집');await shot('4_wines_edit');
  const W=id=>'[data-wrow="'+id+'"]';
  // 이름 수정(타이핑 중 다른 행 위치·포커스 유지)
  await stable('이름 입력 중 다음 행',W(RED[3].id),async()=>{await page.fill(W(RED[0].id)+' [data-f=name]','올드 핸즈 호벤 (수정)');});
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-f')),'name','포커스 유지');
  assert.match(await page.textContent('#wChg'),/변경 1건/);assert.match(await texts(W(RED[0].id)+' [data-badges]').then(a=>a[0]),/수정/);
  await page.fill(W(RED[1].id)+' [data-f=min]','5');
  await page.click(W(RED[2].id)+' [data-f=del]');assert.match(await texts(W(RED[2].id)+' [data-badges]').then(a=>a[0]),/삭제/);
  await page.click(W(RED[4].id)+' [data-f=up]');assert.match((await texts(W(RED[4].id)+' [data-badges]')).concat(await texts(W(RED[3].id)+' [data-badges]')).join(' '),/이동/,'순서가 바뀐 두 행 중 하나에 이동 배지');
  assert.equal(await page.evaluate(id=>document.activeElement.closest('[data-wrow]').getAttribute('data-wrow')===id&&document.activeElement.getAttribute('data-f'),RED[4].id),'up','이동 뒤 포커스 유지');
  await page.click('#wAdd');await page.waitForTimeout(50);
  const newInput=page.locator('[data-wrow] [data-f=name]').last();await newInput.fill('새 와인 시험');
  await page.selectOption(W(RED[5].id)+' [data-f=group]','white');await page.waitForTimeout(50);
  assert.equal((await page.$$('[data-wrow]')).length,26,'칸 이동한 행은 현재 칸에서 사라짐(26 +추가 1 -이동 1)');
  assert.match(await noticeText(),/화이트 & 로제 칸 맨 끝으로 이동/);
  assert.match(await page.textContent('#wChg'),/변경 6건/);
  // 되돌리기 확인 흐름
  await page.click('#wReset');assert.match(await page.textContent('.bar'),/모두 되돌릴지 확인/);await page.click('#wResetYes');assert.match(await page.textContent('#wChg'),/변경 0건/);assert.equal((await page.$$('[data-wrow]')).length,26);
  // 다시 수정 후 사전 검사(빈 이름)·요약
  await page.fill(W(RED[0].id)+' [data-f=name]','');await page.fill(W(RED[1].id)+' [data-f=min]','5');
  await page.click('#wSave');assert.match(await noticeText(),/입력 확인 필요 1곳/);assert.match(await page.textContent(W(RED[0].id)),/빈 이름 금지/);
  await page.fill(W(RED[0].id)+' [data-f=name]','올드 핸즈 호벤 (수정)');
  await page.click(W(RED[2].id)+' [data-f=del]');await page.click(W(RED[4].id)+' [data-f=up]');await page.click('#wAdd');await page.locator('[data-wrow] [data-f=name]').last().fill('새 와인 시험');
  await page.click('#wSave');await page.waitForSelector('#wSaveGo');
  const sum=await page.textContent('dialog');
  assert.match(sum,/와인 목록 변경 요약 확인/);assert.match(sum,/수정: 올드 핸즈 호벤.*이름: 올드 핸즈 호벤 → 올드 핸즈 호벤 \(수정\)/);assert.match(sum,/부족 기준: 기본 3 → 5/);assert.match(sum,/추가: 새 와인 시험 \(레드 칸\)/);assert.match(sum,/삭제: 후안길 옐로 라벨/);assert.match(sum,/이동: .*순서 변경/);
  await page.evaluate(()=>window.scrollTo(0,0));await shot('5_wines_summary');
  await page.click('#wSaveGo');await page.waitForFunction(()=>/발행 완료/.test((document.querySelector('.msg')||{}).textContent||''));
  assert.match(await noticeText(),/발행 완료 · 와인 목록 버전 1 \(최초 발행\)/);
  const pub=db.prepare("SELECT data FROM content_versions WHERE kind='wines' AND version=1").get();const data=JSON.parse(pub.data);
  assert.equal(data.groups[0].items.find(i=>i.id===RED[1].id).min,5);assert(!data.groups[0].items.some(i=>i.id===RED[2].id));assert(data.groups[0].items.some(i=>i.name==='새 와인 시험'));assert.equal(data.groups.length,6);
  assert(!/가격|주류회사|주문/.test(pub.data),'발행본에 가격·주류회사 없음');
  assert.match(await page.textContent('#wChg'),/변경 0건/);assert.match(await page.textContent('.bar'),/발행본 v1 기준/);
  ok('와인 목록 편집: 이름·min·삭제·이동·추가 → 요약 → 발행(v1)');
  // 현황에 min 반영(기준 5: 냉장고 2병 필요 유지, 3병 → 필요)
  await page.click('#invTabStatus');await page.waitForSelector('[data-inv]');
  assert.match(await rt(RED[1].id),/냉장고 2병 ▲ 필요.*기준 5/);assert.equal(await page.locator(row(RED[2].id)).count(),0,'삭제된 와인은 현황에서 사라짐');
  assert.match(await rt(RED[0].id),/올드 핸즈 호벤 \(수정\)/);
  // 서버 400: 금칙어
  await page.click('#invTabWines');await page.waitForSelector('[data-wrow]');
  await page.fill(W(RED[0].id)+' [data-f=name]','도매가 확인');await page.click('#wSave');await page.click('#wSaveGo');
  await page.waitForFunction(()=>/서버 검증 실패/.test((document.querySelector('.msg')||{}).textContent||''));
  assert.match(await page.textContent(W(RED[0].id)),/금칙어 포함/);assert.match(await noticeText(),/서버 검증 실패/);await shot('6_wines_error400');
  await page.fill(W(RED[0].id)+' [data-f=name]','올드 핸즈 호벤 (2차)');
  assert.equal(await page.locator(W(RED[0].id)+' .rerr').count(),0,'입력하면 오류 표시 사라짐');
  // 409: 다른 매니저가 먼저 저장
  const tok=(await call('POST','/api/admin/login',{password:PW})).json.token;
  const cur=(await call('GET','/api/admin/content/wines',undefined,tok)).json.current;const other=JSON.parse(JSON.stringify(cur.data));other.groups[0].items[0].name='다른 매니저 수정';
  let r=await call('PUT','/api/admin/content/wines',{data:other,baseVersion:cur.version,nickname:'다른'},tok);assert.equal(r.status,200);
  await page.click('#wSave');await page.click('#wSaveGo');await page.waitForSelector('#wTakeLatest');
  assert.match(await page.textContent('dialog'),/저장 충돌\(409\).*다른 매니저가 먼저 저장함: v2/);await shot('7_wines_conflict409');
  await page.click('#wTakeLatest');await page.waitForFunction(()=>/최신본 v2 불러옴/.test((document.querySelector('.msg')||{}).textContent||''));
  assert.equal(await page.inputValue(W(RED[0].id)+' [data-f=name]'),'다른 매니저 수정');
  ok('서버 400 사유 표시·409 충돌 처리');
  // 버전 기록과 복원
  await page.click('#wTabVer');await page.waitForSelector('[data-version]');
  assert.deepEqual(await page.$$eval('[data-version]',e=>e.map(x=>x.getAttribute('data-version'))),['2','1']);
  await page.click('[data-restore="1"]');await page.click('[data-restore-yes="1"]');await page.waitForFunction(()=>/복원 완료/.test((document.querySelector('.msg')||{}).textContent||''));
  assert.match(await noticeText(),/복원 완료 · v1 → 새 버전 v3/);
  assert.deepEqual(await page.$$eval('[data-version]',e=>e.map(x=>x.getAttribute('data-version'))),['3','2','1']);
  await check('버전 기록');await shot('8_wines_versions');
  assert.equal(JSON.parse(db.prepare("SELECT data FROM content_versions WHERE kind='wines' AND version=3").get().data).groups[0].items[0].name,'올드 핸즈 호벤 (수정)');
  ok('버전 기록·복원(새 버전으로)');
  // 하프 칸의 확인 필요 표시(내장 목록에는 있었고 서버에도 유지)
  await page.click('#wTabEdit');await page.click('#wChips [data-gid=half]');await page.waitForSelector('[data-wrow]');
  assert.equal(await page.locator('[data-f=confirm][aria-pressed=true]').count(),1);
  await check('하프 칸');
  // 오류 표시: 서버 연결 안 됨
  flags.abort=true;await page.click('#navCl');await page.click('#navInv');
  await page.click('#invTabStatus');await page.click('#invRefresh');await page.waitForSelector('#invError');assert.match(await page.textContent('#invError'),/서버 연결 불가/);
  flags.abort=false;await page.click('#invRetry');await page.waitForFunction(()=>!document.querySelector('#invError'));
  ok('서버 연결 실패 오류 표시와 다시 불러오기');
  assert.deepEqual(errors,[],'JS 오류');assert.deepEqual(external,[],'외부 요청');
  // 로그아웃 후 재고 상태 초기화
  await page.click('#logout');assert.equal(await page.isVisible('#loginGo'),true);
  // 어드민 산출물에 자료 원문·수량 없음
  assert(!/냉장고\s*:\s*\d|진열장/.test(html));
  console.log(log.join('\n'));console.log('캡처:\n'+shots.join('\n'));console.log('어드민 재고 조사 점검 통과');
 }finally{await browser.close();global.fetch=realFetch;}
})().catch(e=>{console.error(e);process.exit(1);});
