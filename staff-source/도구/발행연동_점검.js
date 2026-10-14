// 발행 연동 점검: 직원 화면(근무노트)이 서버의 발행본(GET /api/checklist)을 읽어 쓰는지 확인한다.
// 서버는 로컬 http 스텁으로 모의한다(근무노트.html의 서버 주소만 스텁 주소로 바꾼 임시 사본을 연다).
// 실행: HARAGO_PLAYWRIGHT=<playwright 경로> node 도구/발행연동_점검.js
const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const root=path.join(__dirname,'..'),htmlPath=path.join(root,'근무노트.html'),html=fs.readFileSync(htmlPath,'utf8');
const shot=n=>path.join(os.tmpdir(),'근무노트_발행연동_'+n+'.png');
const PROD_HOST='haragogipe-staff-ai.haragogipe-staff-ai-worker.workers.dev';
const ctx={};vm.createContext(ctx);vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1],ctx);
const builtin=()=>JSON.parse(JSON.stringify(require('./체크리스트_추출.js')(JSON.parse(JSON.stringify(ctx.KB)))));
const kstDay=()=>new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Seoul'})).getDay();
const wd=kstDay();
const rows=[];const rec=(area,name,ok,detail)=>{rows.push({area,name,ok,detail});if(!ok)console.error('실패',area,name,detail);};
const checkSync=(area,name,fn)=>{try{fn();rec(area,name,true,'');}catch(e){rec(area,name,false,String(e.message).replace(/\s+/g,' ').slice(0,260));}};
const check=async(area,name,fn)=>{try{await fn();rec(area,name,true,'');}catch(e){rec(area,name,false,String(e.message).replace(/\s+/g,' ').slice(0,260));}};

// ---- 0. 정적 확인: 서버 주소·내장본 동등성 ----
assert.match(html,new RegExp('var CL_BASE = "https://'+PROD_HOST.replace(/\./g,'\\.')+'";'),'빌드에 심은 서버 주소');
assert.equal((html.match(/\bfetch\(/g)||[]).length,3);
checkSync('정적','발행본을 안 바꾸고 그대로 쓰면 화면 항목이 내장본과 같음(요일 7일)',()=>{
 for(const kind of ['오픈 순서','마감 순서'])for(let day=0;day<7;day++){
  const date=new Date('2026-10-'+String(11+day).padStart(2,'0')+'T12:00:00+09:00'),body=ctx.KB.find(e=>e.file==='09_운영_매뉴얼'&&e.title===kind).body;
  const a=ctx.checklistItems(body,date).filter(t=>!t.section).map(t=>[t.task,t.text,!!t.defaultNA]);
  vm.runInContext('PUB={version:1,publishedAt:"",checklist:'+JSON.stringify(builtin())+'}',ctx);
  const b=ctx.modelTasks(ctx.origModel(kind),date).filter(t=>!t.section).map(t=>[t.task,t.text,!!t.defaultNA]);
  vm.runInContext('PUB=null',ctx);
  // 내장본 쪽은 안내문(task:false)도 포함. 체크 항목만 비교.
  assert.deepEqual(b.filter(x=>x[0]),a.filter(x=>x[0]),kind+' 요일'+day);
 }
});

// ---- 스텁 서버 ----
const stub={mode:'ok',body:null,delay:0,hits:[],closedAt:[]};
const server=http.createServer((req,res)=>{
 const cors={'access-control-allow-origin':'*','content-type':'application/json; charset=utf-8'};
 if(!req.url.startsWith('/api/checklist')){res.writeHead(404,cors);res.end('{}');return;}
 const hit={method:req.method,headers:req.headers,at:Date.now()};stub.hits.push(hit);
 req.on('close',()=>{if(!res.writableEnded)stub.closedAt.push(Date.now()-hit.at);});
 setTimeout(()=>{
  if(stub.mode==='error'){res.writeHead(500,cors);res.end('{"error":"x"}');return;}
  if(stub.mode==='garbage'){res.writeHead(200,cors);res.end('{"published":true,"version":9,"checklist":{"open":1}}');return;}
  if(stub.mode==='unpublished'){res.writeHead(200,cors);res.end('{"published":false}');return;}
  res.writeHead(200,cors);res.end(JSON.stringify(stub.body));
 },stub.delay);
});

// ---- 발행본 시험 자료 ----
const FIX={intro:'검증 소개 문구',note:'검증 안내 문구'};
function mkPub(version,mut){
 const cl=builtin();
 const open=cl.open;
 open.intro=FIX.intro;
 open.sections[0].title='오픈 전';                                  // 소제목 바뀜
 open.sections[0].items.forEach(i=>{if(i.text==='입구 청소')i.text='입구 잔디밭 청소';});  // 문구 바뀜
 const del=open.sections[1].items.splice(0,3).map(i=>i.text);       // 항목 3개 삭제
 const other=(wd+1)%7;
 open.sections.push({title:'검증 구역',note:FIX.note,items:[
  {id:'tA',text:'검증 오늘 항목',days:[wd]},
  {id:'tB',text:'검증 다른 요일 항목',days:[other]},
  {id:'tC',text:'검증 격주 항목',biweekly:true},
  {id:'tD',text:'검증 확인 항목',confirm:true},
  {id:'tX',text:'검증 엑스 항목'},{id:'tY',text:'검증 와이 항목'},{id:'tZ',text:'검증 제트 항목'}]});
 if(mut)mut(cl);
 return {published:true,version,publishedAt:'2026-10-14T05:51:58.958Z',checklist:cl,_deleted:del};
}
const send=b=>{stub.mode='ok';stub.body=b;};
const stripMeta=b=>{const c=JSON.parse(JSON.stringify(b));delete c._deleted;return c;};

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const tmpHtml=path.join(os.tmpdir(),'근무노트_발행연동_임시.html');
 fs.writeFileSync(tmpHtml,html.replace(/var CL_BASE = "[^"]*";/,'var CL_BASE = "'+origin+'";'));
 const file='file://'+tmpHtml;
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const allErrors=[],allExternal=[];
 const profiles={mobile:{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2},desktop:{viewport:{width:1280,height:900}}};
 async function open(profile,{poll,pre,fixed,storage}={}){
  const context=await browser.newContext({...profiles[profile],timezoneId:'Asia/Seoul',acceptDownloads:true});
  if(fixed)await context.clock.setFixedTime(new Date(fixed));
  const page=await context.newPage();
  page.on('pageerror',e=>allErrors.push(profile+': '+e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin+'/api/checklist'))allExternal.push(r.url());});
  page.on('requestfailed',r=>{if(!/\/api\/checklist/.test(r.url()))allExternal.push('failed '+r.url());});
  await page.addInitScript(({poll,storage})=>{if(poll)window.HARAGO_POLL_MS=poll;if(storage&&!sessionStorage.getItem('__seeded')){sessionStorage.setItem('__seeded','1');Object.keys(storage).forEach(k=>localStorage.setItem(k,storage[k]));}},{poll,storage});
  if(pre)await pre(page);
  await page.goto(file);
  return {context,page};
 }
 const goChecklist=async page=>{await page.locator('[data-tab="checklist"]').first().click();await page.waitForSelector('#checkContent .task-label');};
 const labels=async page=>page.$$eval('#checkContent .task-label',els=>els.map(e=>e.childNodes[0].textContent.trim()));
 const headings=async page=>page.$$eval('#checkContent .task-group',els=>els.map(e=>e.textContent.trim()));
 const bodyText=async page=>page.locator('#checkContent').innerText();
 const waitMark=async(page,v,ms=8000)=>page.waitForFunction(v=>{const m=document.getElementById('pubMark');return m&&m.textContent.indexOf('발행 v'+v)===0;},v,{timeout:ms});
 const rowOf=(page,text)=>page.locator('#checkContent .info-item',{hasText:text});
 const counts=async page=>{const t=await page.locator('.check-lhs span').first().innerText();const m=t.match(/(\d+)\/(\d+) 완료 · 해당 없음 (\d+)/);return {done:+m[1],total:+m[2],na:+m[3]};};
 const visibleExpected=(cl,w)=>{const v=[];cl.open.sections.forEach(s=>s.items.forEach(i=>{if(!i.days||!i.days.length||i.days.includes(w))v.push(i);}));return v;};

 for(const profile of ['mobile','desktop']){
  const A=profile;
  // ① 발행본 표시
  {
   const v2=mkPub(2);send(v2);
   const {context,page}=await open(profile);await goChecklist(page);
   await waitMark(page,2);
   const labs=await labels(page),heads=await headings(page),text=await bodyText(page);
   await check(A,'① 발행본 소제목 표시(오픈 전)·옛 소제목 없음',()=>{assert(heads.includes('오픈 전'));assert(!heads.includes('오픈 전 · 홀 준비'));assert(heads.includes('검증 구역'));});
   await check(A,'① 문구 변경 반영(입구 잔디밭 청소), 옛 문구 없음',()=>{assert(labs.includes('입구 잔디밭 청소'));assert(!labs.includes('입구 청소'));});
   await check(A,'① 삭제된 3개 항목 없음',()=>{assert.equal(v2._deleted.length,3);v2._deleted.forEach(t=>assert(!labs.includes(t),t));});
   await check(A,'① 소제목 안내·소개 문구 표시',()=>{assert(text.includes(FIX.note));assert(text.includes(FIX.intro));});
   const c=await counts(page);
   const exp=visibleExpected({open:v2.checklist.open},wd),na=exp.filter(i=>i.biweekly).length;
   await check(A,'① 진행률: 분모=오늘 해당 항목-해당 없음, 해당 없음=격주',()=>{assert.equal(c.total,exp.length-na);assert.equal(c.na,na);assert.equal(c.done,0);});
   const mark=await page.locator('#pubMark').innerText();
   await check(A,'① 표기 형식',()=>assert.match(mark,/^발행 v2 · \d{2}:\d{2}$/));
   const same=await page.evaluate(()=>{const m=document.getElementById('pubMark').getBoundingClientRect(),c=document.querySelector('.check-lhs span').getBoundingClientRect();return m.top-c.bottom<24&&m.bottom>c.top;});
   await check(A,'① 표기가 진행률 줄 바로 옆(같은 줄 또는 바로 아래)',()=>assert(same));
   await check(A,'① 가로 넘침 없음',async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);});
   await page.screenshot({path:shot(A+'_오픈'),fullPage:false});
   await page.locator('[data-check-kind="마감 순서"]').click();await page.waitForTimeout(150);
   await page.screenshot({path:shot(A+'_마감'),fullPage:false});
   await page.locator('[data-check-kind="오픈 순서"]').click();
   // ⑥ 제출 payload
   await rowOf(page,'검증 오늘 항목').locator('input').check();
   const pl=await page.evaluate(()=>window.buildShiftPayload('오픈 순서'));
   await check(A,'⑥ payload: 발행 버전·항목 id·상태',()=>{
    assert.equal(pl.checklistVersion,2);assert.equal(pl.kind,'오픈 순서');assert.match(pl.workDay,/^20\d\d-\d\d-\d\d$/);
    assert.deepEqual(pl.items.map(i=>i.id),exp.map(i=>i.id));
    assert.equal(pl.items.find(i=>i.id==='tA').status,'done');assert.equal(pl.items.find(i=>i.id==='tC').status,'na');assert.equal(pl.items.find(i=>i.id==='tD').status,'missing');
    assert(!pl.items.some(i=>i.id==='tB'),'다른 요일 항목 제외');
   });
   const pl2=await page.evaluate(()=>window.buildShiftPayload('마감 순서'));
   await check(A,'⑥ 마감 payload',()=>{assert.equal(pl2.checklistVersion,2);assert(pl2.items.length>0);});
   await check(A,'⑦ 발행본 요청은 GET·no-store',()=>{const h=stub.hits.at(-1);assert.equal(h.method,'GET');assert.match(h.headers['cache-control']||'',/no-cache|no-store/);});
   await context.close();
  }
  // ② 미발행/오류/잘못된 응답/타임아웃 → 내장본
  for(const [mode,label] of [['unpublished','미발행'],['error','서버 오류 500'],['garbage','형식 오류 응답']]){
   stub.mode=mode;
   const {context,page}=await open(profile);await goChecklist(page);await page.waitForTimeout(700);
   const labs=await labels(page);
   await check(A,'② '+label+' → 내장본(입구 청소, 표기 없음)',()=>{assert(labs.includes('입구 청소'));});
   assert.equal(await page.locator('#pubMark').count(),0);
   await context.close();
  }
  {
   stub.mode='ok';stub.body=mkPub(2);stub.delay=9000;stub.closedAt=[];
   const t0=Date.now();const {context,page}=await open(profile);await goChecklist(page);
   const labs0=await labels(page);
   await check(A,'② 응답이 늦어도 첫 화면은 내장본으로 바로',()=>{assert(labs0.includes('입구 청소'));assert(Date.now()-t0<3000);});
   await page.waitForTimeout(5200);
   await check(A,'② 타임아웃 4초에 요청 중단·내장본 유지',()=>{assert(stub.closedAt.length>=1,'중단 안 됨');assert(stub.closedAt[0]>=3500&&stub.closedAt[0]<=5000,'중단 시점 '+stub.closedAt[0]);});
   assert.equal(await page.locator('#pubMark').count(),0);
   await context.close();stub.delay=0;
  }
  // 캐시: 발행본 받아 둔 뒤 서버 실패 → 캐시본, 서버 지연 중에도 첫 렌더는 캐시
  {
   send(mkPub(2));
   const {context,page}=await open(profile);await goChecklist(page);await waitMark(page,2);
   const cached=await page.evaluate(()=>JSON.parse(localStorage.getItem('harago-published-checklist-v1')||'null'));
   await check(A,'② 발행본을 별도 키에 버전과 함께 캐시',()=>{assert.equal(cached.version,2);assert(cached.checklist.open.sections.length>=4);});
   stub.mode='error';await page.reload();await goChecklist(page);
   const labs=await labels(page);
   await check(A,'② 캐시 사용 결과',()=>{assert(labs.includes('입구 잔디밭 청소'));});
   stub.mode='ok';stub.delay=2500;await page.reload();
   const t0=Date.now();await goChecklist(page);const labs2=await labels(page);
   await check(A,'② 서버가 느려도 첫 렌더는 캐시로 즉시',()=>{assert(labs2.includes('입구 잔디밭 청소'));assert(Date.now()-t0<2000);});
   await context.close();stub.delay=0;
  }
  // ③ 버전 교체·체크 보존, visibilitychange, 같은 id 체크 유지, 새 id 미체크, 사라진 id 무시
  {
   send(mkPub(2));
   const {context,page}=await open(profile,{poll:1200});await goChecklist(page);await waitMark(page,2);
   await rowOf(page,'검증 엑스 항목').locator('input').check();
   await rowOf(page,'검증 와이 항목').locator('input').check();
   await rowOf(page,'바닥 청소기 청소').locator('input').check();
   const before=await counts(page);
   const v3=mkPub(3,cl=>{const s=cl.open.sections.at(-1);s.items=s.items.filter(i=>i.id!=='tY');s.items.find(i=>i.id==='tX').text='검증 엑스 항목(수정)';s.items.push({id:'tN',text:'검증 새 항목'});});
   send(v3);stub.hits=[];
   await waitMark(page,3,6000);
   const labs=await labels(page);
   await check(A,'③ 발행 버전이 바뀌면 자동 교체(폴링)',()=>{assert(labs.includes('검증 새 항목'));assert(!labs.includes('검증 와이 항목'));assert(stub.hits.length>=1);});
   const chk=async t=>rowOf(page,t).locator('input').isChecked();
   await check(A,'③ 같은 id 체크 보존(문구가 바뀌어도)',async()=>{assert.equal(await chk('검증 엑스 항목(수정)'),true);assert.equal(await chk('바닥 청소기 청소'),true);});
   await check(A,'③ 새 id는 미체크',async()=>{assert.equal(await chk('검증 새 항목'),false);});
   const after=await counts(page);
   await check(A,'③ 진행률: 체크 2개 유지, 분모는 새 발행본 기준',()=>{assert.equal(after.done,2);assert.equal(after.total,before.total);}); // 와이 삭제(-1)+새 항목(+1)=같음
   // 새로고침 뒤에도 id 기준 체크 유지(와이가 되살아나도 체크된 채)
   send(mkPub(4));
   await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   await waitMark(page,4,4000);
   await check(A,'③ 탭이 다시 보일 때(visibilitychange) 즉시 재조회',async()=>{assert.equal(await chk('검증 와이 항목'),true);});
   await context.close();
  }
  // 예전(내장 항목 기반) 체크 기록이 발행 반영 후에도 유지
  {
   const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
   const body=ctx.KB.find(e=>e.file==='09_운영_매뉴얼'&&e.title==='오픈 순서').body;
   const tasks=ctx.checklistItems(body,new Date()).filter(t=>t.task);
   const key=t=>ctx.norm(t.group+t.text);
   const t1=tasks.find(t=>t.text==='입구 청소'),t2=tasks.find(t=>t.text==='바닥 청소기 청소'),t3=tasks.find(t=>t.text==='전구 확인');
   assert(t1&&t2&&t3);
   const st={};st[key(t1)]=true;st[key(t2)]=true;st[key(t3)]='na';
   send(mkPub(2));
   const {context,page}=await open(profile,{storage:{['harago-check-v2:'+today+':오픈 순서']:JSON.stringify(st)}});
   await goChecklist(page);await waitMark(page,2);
   const chk=async t=>rowOf(page,t).locator('input').isChecked();
   await check(A,'③ 발행 전에 한 체크가 발행 반영 후에도 유지(문구가 바뀐 항목 포함)',async()=>{assert.equal(await chk('입구 잔디밭 청소'),true);assert.equal(await chk('바닥 청소기 청소'),true);});
   await check(A,'③ 해당 없음 기록도 유지',async()=>{assert.equal(await rowOf(page,'전구 확인').locator('input').isDisabled(),true);});
   await context.close();
  }
  // ④ 편집 모드 중 교체 보류, 종료 후 반영, 초안 맞춤
  {
   send(mkPub(2));
   const {context,page}=await open(profile,{poll:1200});await goChecklist(page);await waitMark(page,2);
   await page.locator('#editEnter').click();await page.waitForSelector('#editRoot:not([hidden]) textarea.etext');
   const ta=id=>page.locator('textarea.etext[data-eid="'+id+'"]');
   await ta('tX').fill('검증 엑스 내 수정');await ta('tZ').fill('검증 제트 내 수정');
   const v3=mkPub(3,cl=>{const s=cl.open.sections.at(-1);s.items.find(i=>i.id==='tY').text='검증 와이 원본 수정';s.items.find(i=>i.id==='tZ').text='검증 제트 원본 수정';});
   send(v3);stub.hits=[];
   await page.waitForTimeout(3500);
   await check(A,'④ 편집 모드 중에는 교체 보류(재조회는 해도 화면 그대로)',async()=>{assert.equal(await ta('tY').inputValue(),'검증 와이 항목');assert.equal(await ta('tX').inputValue(),'검증 엑스 내 수정');});
   await check(A,'④ 편집 중 입력이 유지됨',()=>assert(stub.hits.length>=1));
   await page.locator('#editExit').click();
   await waitMark(page,3,4000);
   await page.locator('#editEnter').click();await page.waitForSelector('textarea.etext');
   await check(A,'④ 초안: 안 건드린 항목은 새 원본을 따름',async()=>{assert.equal(await ta('tY').inputValue(),'검증 와이 원본 수정');});
   await check(A,'④ 초안: 내가 고친(원본은 그대로인) 항목은 유지',async()=>{assert.equal(await ta('tX').inputValue(),'검증 엑스 내 수정');});
   await check(A,'④ 초안: 충돌 항목은 초안 유지 + 원본이 바뀜 표시',async()=>{assert.equal(await ta('tZ').inputValue(),'검증 제트 내 수정');assert.match(await page.locator('.erow[data-eid="tZ"] .ebadges').innerText(),/원본이 바뀜/);assert.doesNotMatch(await page.locator('.erow[data-eid="tY"] .ebadges').innerText(),/원본이 바뀜/);assert.match(await page.locator('#editRootWarn').innerText(),/발행 v3/);});
   // 내보내기 (b)가 발행본 기준
   await page.locator('#editView').click();
   const exp=await page.locator('#editExportText').innerText();
   await check(A,'④ 내보내기 (b) 새 체크리스트 전체가 발행본 기준',()=>{assert(exp.includes('원본 체크리스트: 발행 v3'));assert(exp.includes('입구 잔디밭 청소'));assert(exp.includes('검증 제트 내 수정'));assert(!exp.includes('- 입구 청소\n'));assert(!exp.includes('환풍기 켜기'));});
   await page.locator('#editView').click();
   await page.screenshot({path:shot(A+'_편집'),fullPage:false});
   await context.close();
  }
  // ④c 내장본 기준으로 만든 초안이 발행본으로 바뀐 뒤에도 이어짐
  {
   stub.mode='unpublished';
   const {context,page}=await open(profile);await goChecklist(page);
   await page.locator('#editEnter').click();await page.waitForSelector('#editRoot:not([hidden]) textarea.etext');
   const eid=await page.$$eval('textarea.etext',(els,v)=>els.find(e=>e.value===v).dataset.eid,'바닥 청소기 청소');await page.locator('textarea.etext[data-eid="'+eid+'"]').fill('바닥 청소기 청소 내수정');
   await page.locator('#editExit').click();
   send(mkPub(2));await page.reload();await goChecklist(page);await waitMark(page,2);
   await page.locator('#editEnter').click();await page.waitForSelector('textarea.etext');
   await check(A,'④ 내장본 기준 초안이 발행본 전환 뒤에도 유지(내 수정 1건만)',async()=>{
    assert.match(await page.locator('#editSummary').innerText(),/변경 1건/);
    const vals=await page.$$eval('textarea.etext',els=>els.map(e=>e.value));
    assert.equal(vals.filter(v=>v==='바닥 청소기 청소 내수정').length,1);
    assert.equal(vals.filter(v=>v==='입구 잔디밭 청소').length,1,'안 건드린 항목은 새 원본');
   });
   await context.close();
  }
  // ④b 수정 요청 폼: 현재 문구·대상 번호가 발행본 기준, 폼이 열려 있는 동안 교체 보류
  {
   send(mkPub(2));
   const {context,page}=await open(profile,{poll:1200});await goChecklist(page);await waitMark(page,2);
   await rowOf(page,'입구 잔디밭 청소').locator('.row-main').click();await rowOf(page,'입구 잔디밭 청소').locator('xpath=following-sibling::*[1]').locator('.edit-btn').click();
   await page.waitForSelector('#editDialog[open]');
   await check(A,'④ 수정 요청 폼: 현재 문구가 발행본 문구',async()=>{assert.equal((await page.locator('#editCurrent').innerText()).trim(),'입구 잔디밭 청소');assert.match(await page.locator('#editTarget').innerText(),/오픈 순서 · 오픈 전 · \d+번째 항목/);});
   send(mkPub(3));await page.waitForTimeout(2500);
   assert.equal(await page.evaluate(()=>document.getElementById('pubMark').textContent.indexOf('v2')>0),true);
   await page.locator('#editClose').click();await waitMark(page,3,4000);
   await context.close();
  }
  // ⑤ 요일·격주·해당 없음 판정
  {
   send(mkPub(2));
   const {context,page}=await open(profile);await goChecklist(page);await waitMark(page,2);
   const labs=await labels(page);
   assert(labs.includes('검증 오늘 항목'));assert(!labs.includes('검증 다른 요일 항목'));
   const c0=await counts(page);
   await check(A,'⑤ 격주 항목은 기본 해당 없음',async()=>{assert.equal(await rowOf(page,'검증 격주 항목').locator('input').isDisabled(),true);});
   await rowOf(page,'검증 격주 항목').locator('.row-main').click();await rowOf(page,'검증 격주 항목').locator('xpath=following-sibling::*[1]').locator('.skip-check').click();
   const c1=await counts(page);
   await check(A,'⑤ 해당 없음 취소 시 분모+1',()=>assert.equal(c1.total,c0.total+1));
   await rowOf(page,'검증 격주 항목').locator('input').check();
   assert.equal((await counts(page)).done,1);
   await check(A,'⑤ 확인 항목에 [확인] 표시',async()=>{assert.equal(await rowOf(page,'검증 확인 항목').locator('.confirm-mark').count(),1);});
   await context.close();
  }
 }
 // ⑤b 일요일(0)·월요일(1) 기준(시계 고정)
 for(const [iso,day] of [['2026-10-18T03:00:00Z',0],['2026-10-19T03:00:00Z',1],['2026-10-24T03:00:00Z',6]]){
  send(mkPub(2,cl=>{const s=cl.open.sections.at(-1);s.items.push({id:'tS0',text:'검증 일요일 항목',days:[0]},{id:'tS1',text:'검증 월요일 항목',days:[1]},{id:'tS6',text:'검증 토요일 항목',days:[6]},{id:'tW',text:'검증 월수금 항목',days:[1,3,5]});}));
  const {context,page}=await open('mobile',{fixed:iso});await goChecklist(page);await waitMark(page,2);
  const labs=await labels(page);
  await check('요일','요일 '+day+': 일=0 기준 표시',()=>{assert.equal(labs.includes('검증 일요일 항목'),day===0);assert.equal(labs.includes('검증 월요일 항목'),day===1);assert.equal(labs.includes('검증 토요일 항목'),day===6);assert.equal(labs.includes('검증 월수금 항목'),day===1);});
  const pl=await page.evaluate(()=>window.buildShiftPayload('오픈 순서'));
  await check('요일','요일 '+day+': payload에 해당 요일 항목만',()=>{assert.equal(pl.items.some(i=>i.id==='tS0'),day===0);assert.equal(pl.items.some(i=>i.id==='tS1'),day===1);assert.equal(pl.items.some(i=>i.id==='tS6'),day===6);});
  await context.close();
 }
 // 미발행 payload(내장 방식 유지)
 {
  stub.mode='unpublished';const {context,page}=await open('mobile');await goChecklist(page);await page.waitForTimeout(500);
  await check('⑥','미발행이면 payload 없음(내장 방식 그대로)',async()=>{assert.equal(await page.evaluate(()=>window.buildShiftPayload('오픈 순서')),null);});
  await context.close();
 }
 await browser.close();server.close();
 await check('⑦','외부 요청은 서버 발행본 읽기뿐',()=>assert.deepEqual(allExternal,[]));
 await check('⑧','JS 오류 0',()=>assert.deepEqual(allErrors,[]));
 const bad=rows.filter(r=>!r.ok);
 console.log('| 영역 | 점검 | 결과 |\n|---|---|---|');
 rows.filter(r=>!/^(?:)$/.test(r.name)).forEach(r=>console.log('| '+r.area+' | '+r.name+' | '+(r.ok?'ok':'실패 '+r.detail)+' |'));
 console.log('\n발행 연동 점검: '+(bad.length?'실패 '+bad.length+'건':'통과')+' ('+rows.length+'건)');
 console.log('캡처: '+['mobile','desktop'].flatMap(a=>['오픈','마감','편집'].map(n=>shot(a+'_'+n))).join('\n'));
 process.exitCode=bad.length?1:0;
})().catch(e=>{console.error(e);try{server.close();}catch{}process.exit(1);});
