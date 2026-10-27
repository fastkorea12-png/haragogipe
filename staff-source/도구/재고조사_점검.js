// 재고조사.html 점검: 실제 Worker 코드(서버/index.js)에 메모리 D1을 붙이고 서버 응답만 모의한다. (node 도구/재고조사_점검.js)
// 비밀번호는 가짜 값. 외부 요청은 서버 주소뿐이어야 한다. 캡처는 HARAGO_SHOTS(기본 /private/tmp/harago-1014-shots)에 저장한다.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const root=path.join(__dirname,'..'),pageUrl=require('./재고기준_시험본.js')('재고조사.html'),html=fs.readFileSync(path.join(root,'재고조사.html'),'utf8');
const worker=require('../서버/index.js').default;
const extract=require('./재고조사_추출.js');
const ORIGIN='https://fastkorea12-png.github.io',PW='inv-page-password-not-real',SECRET='inv-page-secret-not-real-0123456789';
const API=html.match(/var API_BASE="([^"]+)"/)[1];
const shotDir=process.env.HARAGO_SHOTS||'/private/tmp/harago-1014-shots';fs.mkdirSync(shotDir,{recursive:true});
// 정적 확인
assert(!/<script[^>]+src=|<link[^>]+href="https?:|@import|fonts\.googleapis/.test(html),'외부 자원 금지');
assert(!html.includes(PW));
const wl=extract();
const RED=wl.groups[0].items,WHITE=wl.groups[1].items;
assert.equal(RED.length,26);
const db=new DatabaseSync(':memory:');for(const f of ['checklist-schema.sql','shifts-schema.sql','content-schema.sql','inventory-schema.sql','inventory-schema-2.sql'])db.exec(fs.readFileSync(path.join(root,'서버',f),'utf8'));
const d1={prepare(sql){const st=db.prepare(sql);let a=[];const o={bind(...x){a=x.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return o;},async run(){return{meta:{changes:Number(st.run(...a).changes)}};},async first(){return st.get(...a)||null;},async all(){return{results:st.all(...a)};}};return o;}};
const env={AI_LIMITER:{async limit(){return{success:true};}},SHIFTS_DB:d1,ADMIN_PASSWORD:PW,ADMIN_TOKEN_SECRET:SECRET};
const waits=[],ctx={waitUntil(p){waits.push(p);}};
const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'GET, POST, OPTIONS'};
let ipN=0;
async function call(method,p,body,token){
 const headers={Origin:ORIGIN,'content-type':'application/json','CF-Connecting-IP':'6.6.6.'+(++ipN%200)};if(token)headers.authorization='Bearer '+token;
 const r=await worker.fetch(new Request('https://worker.test'+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env,ctx);return {status:r.status,json:await r.json()};
}
// 시트·양식 연결은 이 점검 안에서 서버가 부르는 fetch를 막는다(실제 요청 없음)
const realFetch=global.fetch;global.fetch=async(u)=>{if(String(u).startsWith('https://docs.google.com/'))return new Response('unavailable',{status:503});throw new Error('외부 요청 금지: '+u);};
const flags={abortGet:false,abortPost:false,force:null,posts:[],gets:0,ip:'4.4.4.4'};
async function mock(page){
 await page.route(u=>u.href.startsWith(API),async route=>{
  const req=route.request(),u=new URL(req.url());
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:CORS});
  if(req.method()==='GET'){flags.gets++;if(flags.abortGet)return route.abort();}
  if(req.method()==='POST'){flags.posts.push(JSON.parse(req.postData()));if(flags.abortPost)return route.abort();if(flags.force){const f=flags.force;return route.fulfill({status:f.status,headers:{...CORS,'content-type':'application/json'},body:JSON.stringify(f.body)});}}
  const headers={Origin:ORIGIN,'CF-Connecting-IP':flags.ip,'content-type':'application/json'};
  const r=await worker.fetch(new Request(req.url(),{method:req.method(),headers,body:req.postData()||undefined}),env,ctx);
  await Promise.all(waits.splice(0));
  route.fulfill({status:r.status,headers:{...CORS,'content-type':'application/json'},body:await r.text()});
 });
}
(async()=>{
 const browser=await chromium.launch(process.env.HARAGO_PLAYWRIGHT?{channel:'chrome',headless:true}:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const log=[],shots=[];const ok=m=>log.push(m);
 try{
  // 시작 수량(서버 저장): 레드 앞 3종 냉장고 4,2,0 / 창고 1(모두 오늘 일자)
  const uuid=()=>require('crypto').randomUUID();
  const kd=ms=>new Date(ms+9*3600000).toISOString().slice(0,10),TODAY=kd(Date.now()),AGO=n=>kd(Date.now()-n*86400000),md=d=>(+d.slice(5,7))+'/'+(+d.slice(8,10));
  let r=await call('POST','/api/inventory/survey',{surveyId:uuid(),groupId:'red',groupName:'레드',loc:'fridge',surveyDate:TODAY,entries:[{itemId:RED[0].id,qty:4,name:RED[0].name,no:1,memo:'냉장고 2번째 칸'},{itemId:RED[1].id,qty:2,name:RED[1].name,no:2},{itemId:RED[2].id,qty:0,name:RED[2].name,no:3}]});assert.equal(r.status,201);
  r=await call('POST','/api/inventory/survey',{surveyId:uuid(),groupId:'red',groupName:'레드',loc:'storage',surveyDate:TODAY,entries:[{itemId:RED[0].id,qty:1,name:RED[0].name,no:1}]});assert.equal(r.status,201);
  const surveysBefore=db.prepare('SELECT COUNT(*) AS n FROM inventory_surveys').get().n;

  const newPage=async(w,hgt,tag)=>{
   const c=await browser.newContext({viewport:{width:w,height:hgt},timezoneId:'Asia/Seoul'});
   const page=await c.newPage(),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR/.test(m.text()))errors.push(m.text());});
   page.on('request',q=>{const u=q.url();if(/^https?:/.test(u)&&!u.startsWith(API))external.push(u);});
   await mock(page);return {c,page,errors,external};
  };
  const {c:ctx1,page,errors,external}=await newPage(500,900);
  const shot=async name=>{const f=path.join(shotDir,'inv_'+name+'.png');await page.screenshot({path:f,fullPage:false});shots.push(f);};
  const yOf=sel=>page.evaluate(s=>{const e=document.querySelector(s);return e?Math.round(e.getBoundingClientRect().top*10)/10:null;},sel);
  const stable=async(name,sel,action,limit=2)=>{const a=await yOf(sel);await action();await page.waitForTimeout(80);const b=await yOf(sel);assert(a!=null&&b!=null&&Math.abs(b-a)<=limit,'흔들림 '+name+' '+a+' → '+b);ok('안정 '+name+' dy='+(b-a));};
  const noOverflow=async name=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'가로 넘침 '+name);
  const texts=sel=>page.$$eval(sel,els=>els.map(e=>e.textContent.replace(/\s+/g,' ').trim()));
  const rowVals=()=>page.$$eval('#rows .row',rs=>rs.map(r=>r.querySelector('[data-qty]').value));
  const gotoFresh=async()=>{await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});await page.goto(pageUrl);await page.waitForSelector('#chips button');await page.waitForFunction(()=>true);await page.waitForTimeout(250);};

  await page.goto(pageUrl);await page.evaluate(()=>localStorage.clear());await page.goto(pageUrl);await page.waitForSelector('#chips button');await page.waitForTimeout(300);
  // 칸 칩 7개, 이름·순서
  assert.deepEqual(await texts('#chips button'),['레드','화이트 & 로제','스파클링','포트','내추럴','하프']);
  assert.deepEqual(await texts('#locs button'),['냉장고','창고']);assert.equal(await page.getAttribute('#locs [data-loc=fridge]','aria-pressed'),'true');
  assert.equal(await page.isHidden('#panel'),true);assert.equal(await page.isHidden('#bar'),true);
  assert.equal(await page.getAttribute('#chips','class'),'chips');
  assert.equal(await page.evaluate(()=>{const c=document.getElementById('chips');return getComputedStyle(c).flexWrap==='nowrap'&&getComputedStyle(c).overflowX==='auto';}),true);
  ok('칸 칩 7개·nowrap 가로 스크롤');
  // 조사 일자: 기본 오늘(KST), 범위 오늘~7일 전
  assert.equal(await page.inputValue('#surveyDate'),TODAY);assert.equal(await page.getAttribute('#surveyDate','max'),TODAY);assert.equal(await page.getAttribute('#surveyDate','min'),AGO(7));assert.equal(await page.getAttribute('#surveyDate','type'),'date');
  assert.equal(await page.locator('#locs button').count(),2);assert.equal(await page.locator('#locs [data-loc=display]').count(),0);
  await page.fill('#surveyDate',AGO(2));assert.equal(await page.inputValue('#surveyDate'),AGO(2));assert.match(await page.textContent('#dateNote'),/오늘이 아님/);
  await page.fill('#surveyDate',kd(Date.now()+86400000));assert.equal(await page.inputValue('#surveyDate'),TODAY,'미래 날짜는 오늘로 되돌림');assert.match(await page.textContent('#dateNote'),/7일 전까지\. 오늘로 맞춤/);
  await page.fill('#surveyDate',AGO(8));assert.equal(await page.inputValue('#surveyDate'),TODAY,'8일 전은 되돌림');
  await page.fill('#surveyDate',AGO(7));assert.equal(await page.inputValue('#surveyDate'),AGO(7),'7일 전은 허용');
  await page.fill('#surveyDate',TODAY);
  ok('조사 일자 기본 오늘·미래/8일 전 되돌림·7일 전 허용');
  // 숫자열 매핑
  await page.click('#chips [data-gid=red]');
  assert.equal(await page.getAttribute('#digits','inputmode'),'numeric');assert.equal(await page.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('digits')).fontSize)),16);
  assert.match(await page.getAttribute('#digits','placeholder'),/3345633432.*3,3,4,12/);
  await page.fill('#digits','');
  await stable('숫자열 입력창',  '#digits',async()=>{await page.type('#digits','3345633432',{delay:20});});
  let vals=await rowVals();assert.deepEqual(vals.slice(0,10),['3','3','4','5','6','3','3','4','3','2']);assert.equal(vals.length,26);assert(vals.slice(10).every(v=>v===''));
  const names=await texts('#rows .rname');RED.forEach((it,i)=>assert(names[i].includes(it.name),'이름 순서 '+i));
  assert.equal(names[0].startsWith('1.'),true);
  const subs=await texts('#rows [data-sub]');assert.match(subs[0],new RegExp('이전 4 \\('+md(TODAY)+'\\) → 3'));assert.doesNotMatch(subs[0],/오래됨/);assert.match(subs[10],/이전 - → 미입력, 기존 유지/);assert.match(subs[1],/이전 2 \(\d+\/\d+\) → 3/);
  assert.match(await page.textContent('#msg'),/10\/26종 입력됨\. 나머지 16종은 미입력, 기존 유지/);
  assert.match(await page.textContent('#sum'),new RegExp('레드 · 냉장고 · 조사 '+md(TODAY)+' · 입력 10/26종 · 변경 10종')); // 이전 수량 4,2,0과 모두 다르고 나머지 7종은 신규
  ok('숫자열 3345633432 → 레드 앞 10종 매핑 정확');
  await page.evaluate(()=>window.scrollTo(0,0));await shot('digits_preview');
  await noOverflow('숫자열');
  // 상태 배지(냉장고): 입력 3 충분·4 충분·5·6·2 필요
  const badges=await texts('#rows .badge');assert.match(badges[0],/충분/);assert.match(badges[9],/필요/);assert.match(badges[10],/미조사/);
  // 쉼표 입력
  await page.fill('#digits','3,3,4,12');vals=await rowVals();assert.deepEqual(vals.slice(0,5),['3','3','4','12','']);
  assert.match(await page.textContent('#msg'),/4\/26종 입력됨/);
  await page.fill('#digits','３，３，４');vals=await rowVals();assert.deepEqual(vals.slice(0,4),['3','3','4','']);ok('쉼표·전각 입력');
  await page.fill('#digits','3,3,');vals=await rowVals();assert.deepEqual(vals.slice(0,3),['3','3',''],'끝 쉼표 허용');assert.equal(await page.isDisabled('#submitBtn'),false);
  // 오류: 초과·숫자 아님·99 초과·빈 칸
  await page.fill('#digits','3'.repeat(27));assert.match(await page.textContent('#msg'),/27개 입력됨\. 이 칸은 26종\. 1개 초과/);assert.equal(await page.isDisabled('#submitBtn'),true);assert.equal((await rowVals()).filter(Boolean).length,26);
  await page.fill('#digits','12a4');assert.match(await page.textContent('#msg'),/3번째 "a"는 숫자 아님/);assert.equal(await page.isDisabled('#submitBtn'),true);
  await page.fill('#digits','3,100');assert.match(await page.textContent('#msg'),/2번째 100는 99 초과/);assert.equal(await page.isDisabled('#submitBtn'),true);
  await page.fill('#digits','3,,4');assert.match(await page.textContent('#msg'),/2번째 칸이 비어 있음/);assert.equal(await page.isDisabled('#submitBtn'),true);
  await page.fill('#digits','3,x');assert.match(await page.textContent('#msg'),/숫자 아님/);
  await page.fill('#digits','');assert.equal(await page.isDisabled('#submitBtn'),true);assert.match(await page.textContent('#msg'),/숫자열을 입력하거나/);
  ok('개수 불일치·초과·숫자 아님·99 초과·빈 칸 경고, 제출 잠금');
  await page.fill('#digits','3345633432');
  // 미리보기에서 직접 수정
  await stable('행 입력',  '#digits',async()=>{});
  await page.click('#rows [data-id="'+RED[0].id+'"] [data-plus]');
  assert.equal(await page.inputValue('#rows [data-id="'+RED[0].id+'"] [data-qty]'),'4');assert.match(await page.textContent('#rows [data-id="'+RED[0].id+'"]'),/직접 수정/);
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-plus')),RED[0].id,'포커스 유지');
  const rowSel='#rows [data-id="'+RED[1].id+'"]';
  await page.fill(rowSel+' [data-qty]','');await page.type(rowSel+' [data-qty]','7');
  assert.equal(await page.inputValue(rowSel+' [data-qty]'),'7');assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-qty')),true,'입력 중 포커스 유지');
  await stable('행 직접 입력 중 다른 행 위치','#rows [data-id="'+RED[5].id+'"]',async()=>{await page.type(rowSel+' [data-qty]','',{delay:10});await page.fill(rowSel+' [data-qty]','8');});
  await page.click('#rows [data-id="'+RED[1].id+'"] [data-minus]');assert.equal(await page.inputValue(rowSel+' [data-qty]'),'7');
  // 미입력 행에 직접 입력
  const r12='#rows [data-id="'+RED[11].id+'"]';await page.fill(r12+' [data-qty]','5');assert.match(await page.textContent(r12),/→ 5/);
  assert.equal(await page.isVisible('#resetManual'),true);
  assert.match(await page.textContent('#sum'),/입력 11\/26종/);
  await page.click('#resetManual');vals=await rowVals();assert.equal(vals[0],'3');assert.equal(vals[1],'3');assert.equal(vals[11],'');assert.equal(await page.isHidden('#resetManual'),true);
  ok('미리보기 수정(±·직접 입력·초기화), 포커스 유지');
  // 위치 전환: 창고 이전 수량
  await page.click('#locs [data-loc=storage]');assert.match((await texts('#rows [data-sub]'))[0],/이전 1 \(\d+\/\d+\) → 3/);assert.equal(await page.locator('#rows .badge').count(),0,'창고는 상태 배지 없음');
  await page.click('#locs [data-loc=fridge]');assert.equal((await texts('#rows .badge')).length,26);

  // 검색
  const q=async t=>{await page.fill('#q',t);await page.waitForTimeout(60);};
  await q('후안길');let res=await texts('#results .res');assert.equal(res.length,2);assert(res.every(t=>/후안길/.test(t)&&/레드/.test(t)));
  await q('후안길 옐로');res=await texts('#results .res');assert.equal(res.length,1);assert.match(res[0],/레드 · 3번 · 후안길 옐로 라벨/);assert.match(res[0],new RegExp('냉장고 0병 \\('+md(TODAY)+'\\)'));assert.match(res[0],/없음/);
  await q('올드핸즈');assert.equal((await texts('#results .res')).length,1,'띄어쓰기 없이');
  await q('올드 호벤');assert.equal((await texts('#results .res')).length,1,'부분 일치(순서 무관 토큰)');
  await q('포트');res=await texts('#results .res');assert(res.length>=5);assert(res.some(t=>/콥케 파인 타우니 포트/.test(t)));assert(res.some(t=>/마젤란 핑크 포트/.test(t)));
  await q('PORT');assert.match(await page.textContent('#noRes'),/일치하는 와인 없음/);
  await q('없는와인zzz');assert.match(await page.textContent('#noRes'),/일치하는 와인 없음/);
  assert.equal(await page.isHidden('#survey'),true);assert.equal(await page.isHidden('#bar'),true);
  await stable('검색 입력창','#q',async()=>{await page.fill('#q','');await page.type('#q','롱반',{delay:20});});
  res=await texts('#results .res');assert.equal(res.length,2);
  await q('올드 핸즈');await page.click('#results [data-res]');
  assert.match(await page.textContent('#dName'),/올드 핸즈 호벤/);
  const trs=await texts('#detail tbody tr');assert.equal(trs.length,2,'위치 2곳');assert.match(trs[0],new RegExp('냉장고4병.*충분.*냉장고 2번째 칸.*조사 '+md(TODAY)));assert.match(trs[1],new RegExp('창고1병.*조사 '+md(TODAY)));assert(!(await page.textContent('#detail')).includes('진열장'));
  assert.equal((await page.textContent('#dLast')).trim(),'마지막 조사 '+md(TODAY));
  ok('검색(부분 일치·띄어쓰기·0건 안내)과 상세(3곳 수량·상태·메모·시각)');
  assert.equal(await page.inputValue('#dDate'),TODAY);
  await page.fill('#dQty','1');await page.evaluate(()=>window.scrollTo(0,0));await shot('search_detail');
  await noOverflow('검색 상세');
  // 상세에서 수정 제출(필요 경계 1)
  await page.click('#dGo');assert.match(await page.textContent('#dlgSum'),new RegExp('칸: 레드.*위치: 냉장고.*조사 일자: '+TODAY+' \\(오늘\\).*입력 1종.*변경 1종'));assert.match(await page.textContent('#dlgLines'),/올드 핸즈 호벤: 4 → 1/);
  await page.click('#dlgGo');await page.waitForSelector('#dlgMsg');assert.match(await page.textContent('#dlgTitle'),/제출 완료/);
  assert.equal(db.prepare('SELECT qty FROM inventory_counts WHERE item_id=? AND loc=?').get(RED[0].id,'fridge').qty,1);
  await page.click('#dlgClose');assert.match((await texts('#detail tbody tr'))[0],/냉장고1병.*필요/);
  await page.fill('#dQty','abc');await page.click('#dGo');assert.match(await page.textContent('#dErr'),/0~99 숫자/);
  await page.click('#dBack');assert.equal(await page.isVisible('#results'),true);
  // 상태 경계 0/1/2/3/4 (서버 반영 후 검색 결과 배지)
  await page.fill('#q','');await page.waitForTimeout(50);
  ok('상세에서 수량 수정 제출·요약·완료');

  // 상태 배지 경계: 직접 입력으로
  await page.click('#chips [data-gid=red]');await page.fill('#digits','');
  const st=async(n,sel)=>{await page.fill(sel+' [data-qty]',String(n));return (await texts(sel+' .badge'))[0];};
  const R3='#rows [data-id="'+RED[12].id+'"]';
  assert.match(await st(0,R3),/✕ 없음/);assert.match(await st(1,R3),/▲ 필요/);assert.match(await st(2,R3),/▲ 필요/);assert.match(await st(3,R3),/● 충분/);assert.match(await st(9,R3),/● 충분/);
  assert.equal(await page.evaluate(s=>{const b=document.querySelector(s+' .badge');return b.textContent.length>2;},R3),true,'색+글자');
  ok('상태 배지 경계 0 없음/1·2 필요/3 이상 충분');
  await page.click('#resetManual');

  // 제출 요약·성공
  await page.fill('#digits','');await page.type('#digits','3345633432');
  await page.click('#submitBtn');await page.waitForSelector('#dlgSum');
  const sum=await page.textContent('#dlgSum');assert.match(sum,/칸: 레드/);assert.match(sum,/위치: 냉장고/);assert.match(sum,new RegExp('조사 일자: '+TODAY+' \\(오늘\\)'));assert.match(sum,/입력 10종/);assert.match(sum,/변경 \d+종/);
  await page.evaluate(()=>window.scrollTo(0,0));await shot('submit_summary');
  const before=flags.posts.length;await page.click('#dlgGo');await page.waitForSelector('#dlgMsg');assert.match(await page.textContent('#dlgTitle'),/제출 완료/);
  assert.equal(flags.posts.length,before+1);const body=flags.posts.at(-1);assert.match(body.surveyId,/^[a-f0-9-]{36}$/);assert.equal(body.groupId,'red');assert.equal(body.loc,'fridge');assert.equal(body.surveyDate,TODAY);assert.match(await page.textContent('#dlgMsg'),new RegExp('조사 일자 '+TODAY));assert.deepEqual(body.entries.map(e=>e.qty),[3,3,4,5,6,3,3,4,3,2]);assert.equal(body.entries[0].itemId,RED[0].id);
  assert.equal(await page.inputValue('#digits'),'');assert.equal(await page.evaluate(()=>localStorage.getItem('harago-inv-draft')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('harago-inv-pending')),null);
  assert.equal(db.prepare('SELECT qty FROM inventory_counts WHERE item_id=? AND loc=?').get(RED[9].id,'fridge').qty,2);
  await page.click('#dlgClose');
  assert.match((await texts('#rows [data-sub]'))[0],/이전 3 \(\d+\/\d+\) → 미입력/,'제출 후 이전 수량 갱신');
  ok('제출 성공: 이중 확인·요약·D1 반영·초안/보류 삭제');

  // 이른 조사 일자 제출은 늦은 일자 수량을 덮어쓰지 않음(서버·화면 모두)
  await page.fill('#surveyDate',AGO(3));await page.fill('#digits','9');
  assert.match(await page.textContent('#sum'),new RegExp('조사 '+md(AGO(3))));
  await page.click('#submitBtn');await page.waitForSelector('#dlgSum');assert.match(await page.textContent('#dlgDate'),new RegExp('조사 일자: '+AGO(3)+' \\(오늘 아님\\)'));
  await page.evaluate(()=>window.scrollTo(0,0));await shot('submit_summary_past');
  await page.click('#dlgGo');await page.waitForSelector('#dlgMsg');assert.equal(flags.posts.at(-1).surveyDate,AGO(3));
  assert.equal(db.prepare('SELECT qty FROM inventory_counts WHERE item_id=? AND loc=?').get(RED[0].id,'fridge').qty,3,'서버 수량 유지');
  assert.equal(db.prepare('SELECT survey_date AS d FROM inventory_counts WHERE item_id=? AND loc=?').get(RED[0].id,'fridge').d,TODAY);
  await page.click('#dlgClose');assert.match((await texts('#rows [data-sub]'))[0],new RegExp('이전 3 \\('+md(TODAY)+'\\)'),'화면도 늦은 일자 수량 유지');
  await page.fill('#surveyDate',TODAY);
  ok('이른 일자 제출은 최신 수량 유지·이력만 저장, 제출 요약에 조사 일자');

  // 초안 보존
  await page.fill('#digits','112233');await page.click('#chips [data-gid=red]');await page.waitForTimeout(300);
  await page.reload();await page.waitForSelector('#chips button');await page.waitForTimeout(300);
  assert.equal(await page.inputValue('#digits'),'112233');assert.equal(await page.getAttribute('#chips [data-gid=red]','aria-pressed'),'true');assert.equal((await rowVals()).slice(0,6).join(''),'112233');
  ok('초안 보존(새로고침 후 복원)');
  await page.fill('#digits','');await page.waitForTimeout(300);

  // 실패: 429
  await page.fill('#digits','3');flags.force={status:429,body:{saved:false,error:'제출 횟수 초과. 5분 뒤 다시 시도'}};
  await page.click('#submitBtn');await page.click('#dlgGo');await page.waitForSelector('#dlgMsg');assert.match(await page.textContent('#dlgMsg'),/제출 횟수 초과\. 5분 뒤/);assert.equal(await page.evaluate(()=>localStorage.getItem('harago-inv-pending')),null);
  await page.click('#dlgClose');assert.equal(await page.inputValue('#digits'),'3','입력 보존');
  // 400
  flags.force={status:400,body:{saved:false,error:'제출 불가: 수량은 0~99 정수',details:[{reason:'수량 오류'}]}};
  await page.click('#submitBtn');await page.click('#dlgGo');await page.waitForSelector('#dlgMsg');assert.match(await page.textContent('#dlgMsg'),/제출 불가: 수량은 0~99/);await page.click('#dlgClose');
  // 409
  flags.force={status:409,body:{saved:false,error:'와인 목록이 바뀌었음. 새로고침 후 다시 입력'}};
  await page.click('#submitBtn');await page.click('#dlgGo');await page.waitForSelector('#dlgMsg');assert.match(await page.textContent('#dlgMsg'),/와인 목록이 바뀌었음/);assert.equal(await page.isVisible('#dlgReload'),true);await page.click('#dlgClose');
  ok('실패 처리: 429·400·409 사유 표시, 입력 보존');
  // 상태 불확실: 네트워크 끊김 → 보류 저장 → 새로고침 후 같은 id로 재제출 → 중복 저장 없음
  flags.force=null;flags.abortPost=true;
  const surveysMid=db.prepare('SELECT COUNT(*) AS n FROM inventory_surveys').get().n;
  await page.click('#submitBtn');await page.click('#dlgGo');await page.waitForSelector('#dlgRetry');assert.match(await page.textContent('#dlgMsg'),/저장됐는지 확인하지 못함/);
  const pend=await page.evaluate(()=>JSON.parse(localStorage.getItem('harago-inv-pending')));assert(pend&&pend.id);
  await page.click('#dlgClose');assert.equal(await page.isVisible('#pendingMsg'),true);
  // 서버에는 실제로 저장됐다고 가정: 같은 id로 직접 저장해 둔다(응답만 유실된 상황)
  r=await call('POST','/api/inventory/survey',pend.body);assert.equal(r.status,201);
  flags.abortPost=false;await page.reload();await page.waitForSelector('#chips button');await page.waitForTimeout(300);
  assert.equal(await page.isVisible('#pendingMsg'),true);
  const nPost=flags.posts.length;await page.click('#pendingRetry');await page.waitForSelector('#dlgMsg');assert.match(await page.textContent('#dlgTitle'),/제출 완료/);assert.match(await page.textContent('#dlgMsg'),/이미 저장돼 있었음/);
  assert.equal(flags.posts.at(-1).surveyId,pend.id);assert.equal(flags.posts.length,nPost+1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_surveys').get().n,surveysMid+1,'같은 조사 번호는 한 번만 저장');
  assert.equal(await page.evaluate(()=>localStorage.getItem('harago-inv-pending')),null);await page.click('#dlgClose');
  // 같은 내용을 다시 제출해도(새로고침 뒤 보류가 남은 경우) 같은 surveyId를 쓴다
  await page.fill('#digits','4');flags.abortPost=true;await page.click('#submitBtn');await page.click('#dlgGo');await page.waitForSelector('#dlgRetry');await page.click('#dlgClose');
  const id1=(await page.evaluate(()=>JSON.parse(localStorage.getItem('harago-inv-pending')))).id;
  await page.click('#submitBtn');await page.click('#dlgGo');await page.waitForSelector('#dlgRetry');await page.click('#dlgClose');
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('harago-inv-pending')))).id,id1,'같은 내용은 같은 surveyId');
  await page.click('#pendingDrop');assert.equal(await page.isHidden('#pendingMsg'),true);flags.abortPost=false;
  ok('상태 불확실·새로고침 후 같은 surveyId 재제출·중복 저장 없음');
  await page.fill('#digits','');

  // 오프라인 제출 차단과 초안 보존
  await page.fill('#digits','55');await ctx1.setOffline(true);await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  assert.equal(await page.isVisible('#net'),true);await page.click('#submitBtn');assert.match(await page.textContent('#dlgTitle'),/오프라인/);await page.click('#dlgClose');
  await ctx1.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));assert.equal(await page.isHidden('#net'),true);assert.equal(await page.inputValue('#digits'),'55');
  await page.fill('#digits','');await page.waitForTimeout(300);
  ok('오프라인 안내·입력 보존');

  // 반응형·글자·터치
  for(const [w,hgt] of [[500,900],[390,844],[1280,800]]){
   const {c,page:p2,errors:e2,external:x2}=await newPage(w,hgt);
   await p2.goto(pageUrl);await p2.evaluate(()=>localStorage.clear());await p2.goto(pageUrl);await p2.waitForSelector('#chips button');await p2.waitForTimeout(400);
   await p2.click('#chips [data-gid=red]');await p2.fill('#digits','3345633432');
   assert.equal(await p2.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'가로 넘침 '+w);
   const small=await p2.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.offsetParent&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<16&&!e.closest('script,style,dialog:not([open])')).map(e=>e.tagName+':'+e.textContent.slice(0,16)));
   assert.deepEqual(small,[],'16px 미만 글자 '+w);
   const tiny=await p2.evaluate(()=>[...document.querySelectorAll('button,input,a')].filter(e=>e.offsetParent&&!e.closest('dialog:not([open])')).map(e=>{const r=e.getBoundingClientRect();return {t:(e.tagName+':'+(e.textContent||e.getAttribute('aria-label')||'')).slice(0,24),w:Math.round(r.width),h:Math.round(r.height)};}).filter(x=>x.h<44||x.w<44));
   assert.deepEqual(tiny,[],'터치 44px 미만 '+w);
   // 고정 하단 바가 마지막 행·입력창을 가리지 않는다
   await p2.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await p2.waitForTimeout(60);
   const cover=await p2.evaluate(()=>{const bar=document.getElementById('bar').getBoundingClientRect(),rows=document.querySelectorAll('#rows .row'),last=rows[rows.length-1].getBoundingClientRect();return last.bottom<=bar.top+1;});assert.equal(cover,true,'하단 바가 마지막 행을 가림 '+w);
   // 하단 행 입력창에 포커스해도 바에 가려지지 않는다
   await p2.click('#rows .row:nth-child(24) [data-qty]');await p2.waitForTimeout(80);
   const vis=await p2.evaluate(()=>{const bar=document.getElementById('bar').getBoundingClientRect(),a=document.activeElement.getBoundingClientRect();return a.bottom<=bar.top+1&&a.top>=0;});assert.equal(vis,true,'입력창이 바에 가림 '+w);
   if(w===500){await p2.evaluate(()=>window.scrollTo(0,0));const f=path.join(shotDir,'inv_digits_500.png');await p2.screenshot({path:f});shots.push(f);}
   if(w===390){await p2.evaluate(()=>window.scrollTo(0,0));const f=path.join(shotDir,'inv_digits_390.png');await p2.screenshot({path:f});shots.push(f);}
   assert.deepEqual(e2,[],'JS 오류 '+w);assert.deepEqual(x2,[],'외부 요청 '+w);await c.close();
   ok('반응형 '+w+'px: 가로 넘침 없음·글자 16px 이상·터치 44px·하단 바 가림 없음');
  }
  // 서버 발행 와인 목록(이름·min) 사용
  r=await call('POST','/api/admin/login',{password:PW});const token=r.json.token;
  const pub={groups:[{id:'red',name:'레드',items:[{id:RED[0].id,name:'올드 핸즈 호벤(서버)',min:5},{id:RED[1].id,name:'라 푸리시마 모나스트렐'}]},{id:'white',name:'화이트',items:WHITE.map(w=>({id:w.id,name:w.name}))}]};
  r=await call('PUT','/api/admin/content/wines',{data:pub,baseVersion:0,nickname:'점검'},token);assert.equal(r.status,200,JSON.stringify(r.json));
  await page.reload();await page.waitForSelector('#chips button');await page.waitForTimeout(400);
  assert.deepEqual(await texts('#chips button'),['레드','화이트']);
  await page.click('#chips [data-gid=red]');assert.equal((await rowVals()).length,2);assert.match((await texts('#rows .rname'))[0],/올드 핸즈 호벤\(서버\)/);
  await page.fill('#digits','4');assert.match((await texts('#rows .badge'))[0],/▲ 필요/,'min 5이면 4는 필요');await page.fill('#digits','5');assert.match((await texts('#rows .badge'))[0],/● 충분/);
  await page.fill('#digits','');
  ok('발행된 와인 목록과 min 사용');

  // 최신 수량 로딩 실패
  flags.abortGet=true;await page.reload();await page.waitForSelector('#chips button');await page.waitForTimeout(500);
  assert.equal(await page.isVisible('#stock'),true);assert.match(await page.textContent('#stock'),/최신 수량 없음\. 이전 수량 표시 안 됨/);
  await page.click('#chips [data-gid=red]');await page.fill('#digits','2');assert.match((await texts('#rows [data-sub]'))[0],/이전 - → 2/);assert.equal(await page.isDisabled('#submitBtn'),false);
  await page.click('#submitBtn');await page.click('#dlgGo');await page.waitForSelector('#dlgMsg');assert.match(await page.textContent('#dlgTitle'),/제출 완료/);await page.click('#dlgClose');
  flags.abortGet=false;
  ok('최신 수량 로딩 실패 시 안내, 입력·제출 가능');
  await shot('stock_fail');
  assert.deepEqual(errors,[],'JS 오류');assert.deepEqual(external,[],'외부 요청');
  await ctx1.close();

  // ---- 시계 고정(2026-10-14 10:00 KST): 초안 날짜 갱신·범위·오래됨 배지·자정 넘김
  {
   const FIX='2026-10-14T10:00:00+09:00',posted=[];
   const c3=await browser.newContext({viewport:{width:500,height:900},timezoneId:'Asia/Seoul'});
   const p3=await c3.newPage(),err3=[];p3.on('pageerror',e=>err3.push(e.message));
   await p3.clock.setFixedTime(new Date(FIX));
   const items={};items[RED[0].id]={fridge:{qty:4,at:'2026-10-05T03:00:00.000Z',surveyDate:'2026-10-05'}};items[RED[1].id]={fridge:{qty:2,at:'2026-10-10T03:00:00.000Z',surveyDate:'2026-10-10'},storage:{qty:5,at:'2026-10-13T03:00:00.000Z',surveyDate:'2026-10-13'}};items[RED[2].id]={fridge:{qty:6,at:'2026-10-07T03:00:00.000Z',surveyDate:'2026-10-07'}};
   await p3.route(u=>u.href.startsWith(API),async route=>{const req=route.request();
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:CORS});
    if(req.method()==='GET')return route.fulfill({status:200,headers:{...CORS,'content-type':'application/json'},body:JSON.stringify({items,wines:null,winesVersion:0})});
    posted.push(JSON.parse(req.postData()));return route.fulfill({status:201,headers:{...CORS,'content-type':'application/json'},body:JSON.stringify({saved:true,surveyId:posted.at(-1).surveyId})});});
   const T=sel=>p3.$$eval(sel,els=>els.map(e=>e.innerText.replace(/\s+/g,' ').trim()));
   const setLs=async(k,v)=>{await p3.evaluate(([k,v])=>{S.digits='';S.manual={};clearTimeout(draftTimer);localStorage.setItem(k,v);},[k,JSON.stringify(v)]);};
   // 어제 저장된 초안: 날짜를 오늘로 맞추고 안내
   await p3.goto(pageUrl);await p3.evaluate(()=>localStorage.clear());
   await setLs('harago-inv-draft',{gid:'red',loc:'fridge',date:'2026-10-13',day:'2026-10-13',digits:'33',manual:{}});
   await p3.reload();await p3.waitForSelector('#chips button');await p3.waitForTimeout(300);
   assert.equal(await p3.inputValue('#surveyDate'),'2026-10-14');assert.match(await p3.textContent('#dateNote'),/날짜를 오늘로 맞춤/);assert.equal(await p3.inputValue('#digits'),'33','수량 초안은 유지');
   assert.equal(await p3.getAttribute('#surveyDate','min'),'2026-10-07');assert.equal(await p3.getAttribute('#surveyDate','max'),'2026-10-14');
   // 날짜를 옛날로 저장한 오래된 초안도 오늘로
   await setLs('harago-inv-draft',{gid:'red',loc:'fridge',date:'2026-09-01',day:'2026-10-14',digits:'33',manual:{}});
   await p3.reload();await p3.waitForSelector('#chips button');await p3.waitForTimeout(300);assert.equal(await p3.inputValue('#surveyDate'),'2026-10-14','범위 밖 초안 날짜는 오늘로');
   // 오늘 저장한 초안의 의도적 과거 날짜는 유지
   await setLs('harago-inv-draft',{gid:'red',loc:'fridge',date:'2026-10-12',day:'2026-10-14',digits:'33',manual:{}});
   await p3.reload();await p3.waitForSelector('#chips button');await p3.waitForTimeout(300);assert.equal(await p3.inputValue('#surveyDate'),'2026-10-12');assert.equal((await p3.textContent('#dateNote')).trim(),'');
   assert.match(await p3.textContent('#sum'),/레드 · 냉장고 · 조사 10\/12 · 입력 2\/26종/);
   // 이전 수량 옆 마지막 조사 일자·오래됨(7일 이상)
   const sb=await T('#rows [data-sub]');
   assert.match(sb[0],/이전 4 \(10\/5\) → 3 오래됨 ● 충분/);assert.match(sb[1],/이전 2 \(10\/10\) → 3 ● 충분/);assert.doesNotMatch(sb[1],/오래됨/);assert.match(sb[2],/이전 6 \(10\/7\) → 오래됨|이전 6 \(10\/7\) → 미입력, 기존 유지 오래됨/);
   await p3.evaluate(()=>window.scrollTo(0,0));await p3.screenshot({path:path.join(shotDir,'inv_date_locs_500.png')});shots.push(path.join(shotDir,'inv_date_locs_500.png'));
   assert.equal(await p3.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
   // 범위 경계
   await p3.fill('#surveyDate','2026-10-07');assert.equal(await p3.inputValue('#surveyDate'),'2026-10-07');
   await p3.fill('#surveyDate','2026-10-06');assert.equal(await p3.inputValue('#surveyDate'),'2026-10-14');
   await p3.fill('#surveyDate','2026-10-15');assert.equal(await p3.inputValue('#surveyDate'),'2026-10-14');
   await p3.fill('#surveyDate','2026-10-12');
   // 제출: 조사 일자가 본문·요약·성공 안내에 들어감
   await p3.click('#submitBtn');await p3.waitForSelector('#dlgSum');assert.match(await p3.textContent('#dlgDate'),/조사 일자: 2026-10-12 \(오늘 아님\)/);
   await p3.evaluate(()=>window.scrollTo(0,0));await p3.screenshot({path:path.join(shotDir,'inv_submit_summary_500.png')});shots.push(path.join(shotDir,'inv_submit_summary_500.png'));
   await p3.click('#dlgGo');await p3.waitForSelector('#dlgMsg');assert.equal(posted.at(-1).surveyDate,'2026-10-12');assert.match(await p3.textContent('#dlgMsg'),/조사 일자 2026-10-12/);await p3.click('#dlgClose');
   // 검색 상세: 마지막 조사 일자·오래됨
   await p3.fill('#q','후안길 옐로');const rs0=await T('#results .res');assert.match(rs0[0],/냉장고 6병 \(10\/7\) .*오래됨/);await p3.click('#results [data-res]');
   const tr=await T('#detail tbody tr');assert.match(tr[0],/냉장고 6병.*조사 10\/7 오래됨/);assert.match(tr[1],/창고 - - 조사 기록 없음/);assert.equal((await p3.textContent('#dLast')).trim(),'마지막 조사 10/7');
   assert.equal(await p3.inputValue('#dDate'),'2026-10-12');
   await p3.evaluate(()=>window.scrollTo(0,0));await p3.screenshot({path:path.join(shotDir,'inv_search_detail_date_500.png')});shots.push(path.join(shotDir,'inv_search_detail_date_500.png'));
   await p3.click('#dBack');
   await p3.fill('#q','');
   // 자정 넘김: 오늘 기본값이면 새 날짜로 맞춘다
   await p3.fill('#surveyDate','2026-10-14');
   await p3.clock.setFixedTime(new Date('2026-10-15T00:05:00+09:00'));await p3.evaluate(()=>window.dispatchEvent(new Event('focus')));await p3.waitForTimeout(100);
   assert.equal(await p3.inputValue('#surveyDate'),'2026-10-15');assert.match(await p3.textContent('#dateNote'),/날짜를 오늘로 맞춤/);assert.equal(await p3.getAttribute('#surveyDate','max'),'2026-10-15');
   assert.deepEqual(err3,[]);await c3.close();
   ok('시계 고정: 초안 날짜 오늘로 갱신·범위 7일·오래됨 배지·마지막 조사 일자·자정 넘김');
  }
  // 정적: 자료 원문 미포함
  assert(!/가격|주류회사|도매가|희망가|급여|계좌|시급/.test(html.replace(/<script>[\s\S]*<\/script>/,'')),'화면 문구에 민감어 없음');
  const embedded=JSON.parse(html.match(/var EMBEDDED=(\{[\s\S]*?\});\nvar DRAFT_KEY/)[1]);
  assert.equal(embedded.groups.reduce((n,g)=>n+g.items.length,0),72);
  assert.deepEqual(Object.keys(embedded.groups[0].items[0]).sort(),['id','name','order']);
  console.log(log.join('\n'));console.log('캡처:\n'+shots.join('\n'));console.log('재고조사 화면 점검 통과');
 }finally{await browser.close();global.fetch=realFetch;}
})().catch(e=>{console.error(e);process.exit(1);});
