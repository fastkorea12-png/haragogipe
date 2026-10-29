// 주방재고 조사 점검(10/29): 직원 재고 조사 화면의 '주방' 탭. (node 도구/주방재고_점검.js, HARAGO_PLAYWRIGHT 선택)
// 실제 Worker 코드에 메모리 D1을 붙이고 서버 응답만 모의한다. 비밀번호는 가짜 값, 외부 요청 없음. 캡처는 HARAGO_SHOTS(기본 /private/tmp/harago-kitchen-shots).
// 확인: 3단계 입력·다시 누르면 취소 / 위치별 묶음 순서 / 위치2 품목 한 줄 / 초안 보존 / 제출·D1 저장 / 필요 목록·복사 문구 / 구입처별 정렬·미정 맨 뒤 / 와인 탭 영향 없음 / 모바일 폭.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{DatabaseSync}=require('node:sqlite'),{pathToFileURL}=require('url');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const root=path.join(__dirname,'..'),STAFF_URL=pathToFileURL(path.join(root,'재고조사.html')).href,staffHtml=fs.readFileSync(path.join(root,'재고조사.html'),'utf8');
const worker=require('../서버/index.js').default,list=require('./주방재고_추출.js')();
const ORIGIN='https://fastkorea12-png.github.io',PW='kitchen-check-password-not-real',SECRET='kitchen-check-secret-not-real-0123456789';
const API=staffHtml.match(/var API_BASE="([^"]+)"/)[1];
const shotDir=process.env.HARAGO_SHOTS||'/private/tmp/harago-kitchen-shots';fs.mkdirSync(shotDir,{recursive:true});
const BANNED=/매입|도매|희망|가격|급여|계좌|시급/;
const db=new DatabaseSync(':memory:');for(const f of ['checklist-schema.sql','shifts-schema.sql','content-schema.sql','inventory-schema.sql','inventory-schema-2.sql','kitchen-schema.sql'])db.exec(fs.readFileSync(path.join(root,'서버',f),'utf8'));
const d1={prepare(sql){const st=db.prepare(sql);let a=[];const o={bind(...x){a=x;return o;},async run(){return{meta:{changes:Number(st.run(...a).changes)}};},async first(){return st.get(...a)||null;},async all(){return{results:st.all(...a)};}};return o;}};
const env={AI_LIMITER:{async limit(){return{success:true};}},SHIFTS_DB:d1,ADMIN_PASSWORD:PW,ADMIN_TOKEN_SECRET:SECRET,INVENTORY_FORM_FALLBACK:'off'};
const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS'};
async function call(method,p,body,token){const headers={Origin:ORIGIN,'content-type':'application/json','CF-Connecting-IP':'3.3.3.3'};if(token)headers.authorization='Bearer '+token;const r=await worker.fetch(new Request('https://worker.test'+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env,{waitUntil(){}});return {status:r.status,json:await r.json()};}
global.fetch=async u=>{throw new Error('외부 요청 금지: '+u);};
async function mock(page){
 await page.route(u=>u.href.startsWith(API),async route=>{
  const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:CORS});
  const r=await worker.fetch(new Request(req.url(),{method:req.method(),headers:{Origin:ORIGIN,'CF-Connecting-IP':'4.4.4.4','content-type':'application/json'},body:req.postData()||undefined}),env,{waitUntil(){}});
  route.fulfill({status:r.status,headers:{...CORS,'content-type':'application/json'},body:await r.text()});
 });
}
const kd=ms=>new Date(ms+9*3600000).toISOString().slice(0,10),TODAY=kd(Date.now()),md=d=>(+d.slice(5,7))+'/'+(+d.slice(8,10));
const initClip=()=>{window.__clip=[];Object.defineProperty(window,'isSecureContext',{value:true});Object.defineProperty(navigator,'clipboard',{value:{writeText:t=>{window.__clip.push(t);return Promise.resolve();}},configurable:true});};
const byName=n=>list.items.find(i=>i.name===n);
(async()=>{
 assert.equal(list.items.length,90,'CSV 90개');
 assert(!list.items.some(i=>/진저비어|^메론$/.test(i.name)),'삭제한 품목 없음');assert.equal(byName('피클').loc,'냉장고');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const log=[],ok=m=>log.push(m);
 const open=async(w,h,url)=>{const c=await browser.newContext({viewport:{width:w,height:h},timezoneId:'Asia/Seoul'}),page=await c.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=r.url();if(/^https?:/.test(u)&&!u.startsWith(API))external.push(u);});
  await page.addInitScript(initClip);await mock(page);await page.goto(url||STAFF_URL);await page.waitForSelector('#modes button');await page.waitForTimeout(300);return {c,page,errors,external};};
 const noOverflow=async(page,n)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'가로 넘침 '+n);
 const row=(page,n)=>page.locator('#kRows [data-kid="'+byName(n).id+'"]');
 try{
  const {c,page,errors,external}=await open(390,844);
  // 기본은 와인 탭, 주방 바는 숨김
  assert.equal(await page.isVisible('#survey'),true);assert.equal(await page.isHidden('#kitchen'),true);assert.equal(await page.isHidden('#kbar'),true);
  await page.click('#modes [data-mode=kitchen]');await page.waitForTimeout(100);
  assert.equal(await page.isHidden('#wineArea'),true);assert.equal(await page.isHidden('#bar'),true,'와인 제출 바 숨김');
  assert.equal(await page.locator('#kRows [data-kid]').count(),90,'90개 한 줄씩');
  const heads=await page.$$eval('#kRows [data-kgroup]',a=>a.map(x=>x.getAttribute('data-kgroup')));
  assert.deepEqual(heads,['냉장고','냉장고 문','와인 냉장고','냉동실','조리대','싱크대 & 스텐다이','기본안주 아래','창고'],'위치 순서');ok('위치별 묶음 순서·90개');
  // 3단계: 누르기·바꾸기·다시 눌러 취소
  await row(page,'버터').locator('[data-st=low]').click();
  await row(page,'토닉워터').locator('[data-st=out]').click();
  await row(page,'랩').locator('[data-st=ok]').click();
  await row(page,'버터').locator('[data-st=out]').click();await row(page,'버터').locator('[data-st=low]').click();
  await row(page,'랩').locator('[data-st=ok]').click();await row(page,'랩').locator('[data-st=ok]').click();
  await row(page,'피클').locator('[data-st=ok]').click();await row(page,'피클').locator('[data-st=ok]').click();
  assert.equal(await row(page,'피클').locator('[aria-pressed=true]').count(),0,'다시 누르면 취소');
  assert.match(await page.textContent('#kCount'),/입력 3\/90개 · 부족 1 · 없음 1/);
  assert.doesNotMatch(await row(page,'토닉워터').textContent(),/구입처 미정/,'빈 구입처는 입력 줄에 안 씀');
  assert.match(await page.textContent('#kSum'),new RegExp('주방 · 조사 '+md(TODAY)+' · 입력 3/90개'));ok('3단계 입력·취소·개수');
  await page.screenshot({path:path.join(shotDir,'주방_위치별_390.png'),fullPage:false});
  // 새로고침해도 입력 보존(주방 탭 기억)
  await page.waitForTimeout(300);await page.reload();await page.waitForSelector('#kRows [data-kid]');await page.waitForTimeout(300);
  assert.equal(await page.isVisible('#kitchen'),true,'주방 탭 기억');
  assert.equal(await row(page,'버터').locator('[data-st=low]').getAttribute('aria-pressed'),'true','초안 보존');ok('초안·탭 보존');
  // 제출
  await page.click('#kSubmit');await page.waitForSelector('#kDlgGo');
  assert.match(await page.textContent('#kDlgSum'),/입력 3\/90개 · 충분 1 · 부족 1 · 없음 1/);
  assert.match(await page.textContent('#kDlgLines'),/버터: 부족/);
  await page.click('#kDlgGo');await page.waitForSelector('#dlgMsg');assert.match(await page.textContent('#dlgMsg'),/주방 3개 저장/);await page.click('#dlgClose');
  const st=Object.fromEntries(db.prepare('SELECT item_id,state FROM kitchen_states').all().map(r=>[r.item_id,r.state]));
  assert.deepEqual(st,{[byName('버터').id]:'low',[byName('토닉워터').id]:'out',[byName('랩').id]:'ok'});
  assert.equal(await page.locator('#kRows [aria-pressed=true]').count(),0,'제출 후 초기화');
  assert.match(await row(page,'버터').textContent(),/이전 ▲ 부족/);ok('제출·D1 저장·이전 상태 표시');
  // 필요 목록
  await page.click('#kViews [data-kview=need]');await page.waitForTimeout(100);
  assert.equal(await page.isHidden('#kbar'),true);assert.match(await page.textContent('#kNeedCount'),/부족·없음 2개/);
  await page.click('#kCopy');await page.waitForTimeout(100);
  let clip=(await page.evaluate(()=>window.__clip)).at(-1);
  assert.equal(clip,['주방 부족 목록 (조사일 '+md(TODAY)+')','[냉장고]','- 토닉워터 (없음)','- 버터 (부족)'].join('\n'));assert.doesNotMatch(clip,BANNED);
  assert.match(await page.textContent('#kNeedUn summary'),/미조사 87개/);ok('필요 목록·복사(위치별)');
  await c.close();assert.equal(errors.length,0,errors.join());assert.equal(external.length,0,external.join());
  // 구입처를 넣어 발행 → 구입처별 정렬
  const login=await call('POST','/api/admin/login',{password:PW});const token=login.json.token;
  const SUP={'버터':'마트B','토닉워터':'쿠팡','랩':'다이소','버터x':''};
  const data={items:list.items.map(i=>SUP[i.name]?{...i,shop:SUP[i.name]}:i)};
  const put=await call('PUT','/api/admin/content/kitchen',{data,baseVersion:0,nickname:'점검'},token);assert.equal(put.status,200,JSON.stringify(put.json));
  { const {c,page,errors,external}=await open(390,844,STAFF_URL+'#kitchen');
    assert.equal(await page.isVisible('#kitchen'),true,'#kitchen 주소로 바로 주방');
    await page.click('#kSort [data-ksort=shop]');await page.waitForTimeout(100);
    const heads=await page.$$eval('#kRows [data-kgroup]',a=>a.map(x=>x.getAttribute('data-kgroup')));
    assert.deepEqual(heads,['다이소','마트B','쿠팡','구입처 미정'],'구입처 이름순·미정 맨 뒤');
    assert.match(await page.locator('#kRows [data-kid="'+byName('토닉워터').id+'"]').textContent(),/냉장고·창고/,'위치2 함께 표시');
    await page.screenshot({path:path.join(shotDir,'주방_구입처별_390.png'),fullPage:false});
    await page.click('#kViews [data-kview=need]');await page.waitForTimeout(100);
    await page.click('#kCopy');await page.waitForTimeout(100);
    clip=(await page.evaluate(()=>window.__clip)).at(-1);
    assert.equal(clip,['주방 부족 목록 (조사일 '+md(TODAY)+')','[마트B]','- 버터 (부족)','[쿠팡]','- 토닉워터 (없음)'].join('\n'));ok('구입처별 정렬·복사 묶음');
    await noOverflow(page,'주방 필요 목록');
    await page.screenshot({path:path.join(shotDir,'주방_필요목록_390.png'),fullPage:true});
    // 와인 탭으로 돌아가면 그대로
    await page.click('#modes [data-mode=wine]');await page.waitForTimeout(100);
    assert.equal(await page.isVisible('#survey'),true);assert.equal(await page.isHidden('#kbar'),true);assert.equal(await page.isHidden('#kitchen'),true);ok('와인 탭 영향 없음');
    await c.close();assert.equal(errors.length,0,errors.join());assert.equal(external.length,0,external.join()); }
  // 어드민: 주방 현황·구입처별·복사·목록 편집(구입처 붙여넣기)·발행·이력
  { const ADMIN_URL=pathToFileURL(path.join(root,'어드민.html')).href;
    const c=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Seoul'}),page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(initClip);await mock(page);
    // 어드민은 관리자 토큰을 그대로 넘겨야 하므로 Authorization 을 전달하는 모의로 덮는다.
    await page.route(u=>u.href.startsWith(API),async route=>{const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:CORS});
      const headers={Origin:ORIGIN,'CF-Connecting-IP':'6.6.6.6','content-type':'application/json'};if(req.headers().authorization)headers.authorization=req.headers().authorization;
      const r=await worker.fetch(new Request(req.url(),{method:req.method(),headers,body:req.postData()||undefined}),env,{waitUntil(){}});route.fulfill({status:r.status,headers:{...CORS,'content-type':'application/json'},body:await r.text()});});
    await page.goto(ADMIN_URL);await page.waitForSelector('#loginGo');await page.fill('#pw',PW);await page.fill('#nick','점장');await page.click('#loginGo');await page.waitForSelector('#saveBtn');
    await page.click('#navInv');await page.waitForSelector('#invTabKitchen');await page.click('#invTabKitchen');await page.waitForSelector('[data-kit]');
    assert.equal(await page.locator('[data-kit]').count(),90);assert.match(await page.textContent('#kitNeedCount'),/부족·없음 2개 · 미조사 87개/);
    await page.click('#kitSortShop');await page.waitForTimeout(50);
    assert.deepEqual(await page.$$eval('[data-kitgroup]',a=>a.map(x=>x.getAttribute('data-kitgroup'))),['다이소','마트B','쿠팡','구입처 미정']);
    await page.click('#kitCopy');await page.waitForTimeout(50);
    assert.equal((await page.evaluate(()=>window.__clip)).at(-1),['주방 부족 목록 (조사일 '+md(TODAY)+')','[마트B]','- 버터 (부족)','[쿠팡]','- 토닉워터 (없음)'].join('\n'));
    await page.click('#kitLow');await page.waitForTimeout(50);assert.equal(await page.locator('[data-kit]').count(),2);ok('어드민 현황·구입처별·복사·부족만');
    // 목록 편집: 붙여넣기로 구입처 2개, 1줄 실패 → 발행
    await page.click('#kitTabEdit');await page.waitForSelector('[data-kitrow]');
    await page.click('#kitPasteBox summary');await page.fill('#kitPaste','피클\t트레이더스\n바질페스토\t트레이더스\n없는품목\t쿠팡');await page.click('#kitPasteGo');
    assert.match(await page.textContent('#kitPasteMsg'),/구입처 2개 적용 · 실패 1줄/);assert.match(await page.textContent('#kitChg'),/변경 2건/);
    await page.click('[data-kitdel="'+byName('수세미').id+'"]');assert.match(await page.textContent('#kitChg'),/변경 3건/);
    await page.screenshot({path:path.join(shotDir,'어드민_주방편집_390.png'),fullPage:false});
    await page.click('#kitSave');await page.waitForSelector('#kitTabEdit');await page.waitForTimeout(300);
    const pub=JSON.parse(db.prepare("SELECT data FROM content_versions WHERE kind='kitchen' ORDER BY version DESC LIMIT 1").get().data);
    assert.equal(pub.items.length,89,'삭제 반영');assert.equal(pub.items.find(i=>i.name==='피클').shop,'트레이더스');ok('어드민 목록 편집·구입처 붙여넣기·삭제·발행');
    await page.click('#kitTabHist');await page.waitForSelector('[data-kitsurvey]');await page.click('[data-kitsurvey]');await page.waitForSelector('[data-kitentry]');
    assert.equal(await page.locator('[data-kitentry]').count(),3);ok('어드민 조사 이력·상세');
    await noOverflow(page,'어드민 주방');assert.equal(errors.length,0,errors.join());await c.close(); }
  // 좁은 폭
  { const {c,page,errors}=await open(320,640,STAFF_URL+'#kitchen');await noOverflow(page,'320 입력');await c.close();assert.equal(errors.length,0,errors.join());ok('320px 넘침 없음'); }
  console.log('주방재고 점검 통과\n- '+log.join('\n- ')+'\n캡처: '+shotDir);
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();
