// 수정 요청 폼 시나리오 점검: 항목에서 열기 -> 입력 -> 저장 -> 목록 -> 복사 형식 -> 삭제, 저장소 불가 대체 동작, 레이아웃
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const CL_URL='https://haragogipe-staff-ai.haragogipe-staff-ai-worker.workers.dev/api/checklist';// 근무노트가 읽는 공개 발행본 주소(이 점검에서는 미발행으로 모의)
const root=path.join(__dirname,'..'),file='file://'+path.join(root,'근무노트.html'),shot=n=>path.join(os.tmpdir(),'근무노트_수정폼_'+n+'.png');
const layout=async(page,id)=>{const l=await page.evaluate(()=>{window.scrollTo(0,document.documentElement.scrollHeight);const s=document.querySelector('.screen:not([hidden])');return {sw:document.documentElement.scrollWidth,w:innerWidth,b:s.getBoundingClientRect().bottom,n:document.querySelector('.sidebar').getBoundingClientRect().top};});assert(l.sw<=l.w,id+' 가로 넘침');if(l.w<=850)assert(l.b<=l.n+1,id+' 하단 탭 가림');await page.evaluate(()=>window.scrollTo(0,0));};
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:500,height:900},timezoneId:'Asia/Seoul',acceptDownloads:true});
  const page=await ctx.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==CL_URL)external.push(r.url());});await page.route(CL_URL,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"published":false}'}));
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{window.copiedText=t;}}});});
  await page.goto(file);
  // 1 체크리스트 행에서 열기
  await page.locator('[data-tab="checklist"]').click();
  const row=page.locator('#checkContent .info-item').first();
  const box=await row.locator('.edit-btn').boundingBox();assert(box.height>=44,'수정 버튼 높이');
  const rowText=(await row.locator('.task-label').innerText()).trim();
  assert.equal(await page.locator('#checkContent .check-row').first().evaluate(n=>n.getBoundingClientRect().width>80),true);
  await layout(page,'checklist');await page.screenshot({path:shot('a_checklist_500')});
  await row.locator('.edit-btn').click();
  assert(await page.locator('#editDialog').evaluate(d=>d.open));
  assert.equal((await page.locator('#editCurrent').innerText()).trim(),rowText);
  assert((await page.locator('#editTarget').innerText()).includes('체크리스트 · 오픈 순서'));
  assert.equal(await page.locator('#editText').inputValue(),rowText,'현재 문구 미리 채움');
  for(const sel of ['#editText','#editMemo','#editNick']){assert(await page.locator(sel).evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=16),sel+' 글자 16px');}
  const kinds=await page.locator('#editKinds button').allInnerTexts();assert.deepEqual(kinds,['문구 수정','항목 추가','삭제 요청','순서·시간 변경']);
  assert((await page.locator('#editDialog').innerText()).includes('실명·연락처 입력 금지'));
  // 검증: 동일 문구 거부
  await page.locator('#editSave').click();assert((await page.locator('#editError').innerText()).includes('현재 문구와 같음'));
  await page.locator('#editText').fill(rowText+' (시험 수정)');await page.locator('#editMemo').fill('시험 메모');await page.locator('#editNick').fill('시험별명');
  await page.screenshot({path:shot('b_form_500')});
  await page.locator('#editSave').click();assert(!(await page.locator('#editDialog').evaluate(d=>d.open)));
  assert.equal(await page.locator('#checkContent .edit-mark:visible').count(),1,'수정 요청 있음 표시');
  assert.equal(await page.locator('#reqCount').innerText(),'1');
  // 체크 기능은 그대로
  await row.locator('input').check();assert(await row.locator('input').isChecked());await row.locator('input').uncheck();
  // 2 레시피, 3 응대 멘트
  await page.locator('[data-tab="recipes"]').click();
  await page.locator('.recipe-field .edit-btn').first().click();assert((await page.locator('#editTarget').innerText()).startsWith('레시피 · 칼리모초'));
  await page.locator('#editKinds button',{hasText:'삭제 요청'}).click();assert(!(await page.locator('#editText').isVisible()));
  await page.locator('#editMemo').fill('삭제 시험');await page.locator('#editSave').click();
  await page.locator('[data-tab="phrases"]').click();
  const card=page.locator('.phrase-card').first();await card.locator('summary').click();
  await card.locator('.edit-btn').click();await page.keyboard.press('Escape');assert(!(await page.locator('#editDialog').evaluate(d=>d.open)),'Esc 닫기');
  await card.locator('.edit-btn').click();await page.mouse.click(5,5);assert(!(await page.locator('#editDialog').evaluate(d=>d.open)),'바깥 클릭 닫기');
  await card.locator('.edit-btn').click();await page.locator('#editKinds button',{hasText:'항목 추가'}).click();assert.equal(await page.locator('#editText').inputValue(),'');
  await page.locator('#editText').fill('새 멘트 시험');await page.locator('#editSave').click();
  assert(await card.evaluate(n=>n.open),'저장 후 카드 열린 상태 유지');
  // 4 모아보기
  await page.locator('#reqGo').click();assert.equal(await page.locator('.screen:visible').getAttribute('id'),'screen-requests');
  assert.equal(await page.locator('.req-item').count(),3);
  await layout(page,'requests');await page.screenshot({path:shot('c_requests_500')});
  await page.locator('#reqCopy').click();const copied=await page.evaluate(()=>window.copiedText);
  assert(copied.startsWith('# 근무노트 수정 요청'));assert(/- 생성일: \d{4}-\d{2}-\d{2}/.test(copied));assert(/- 앱 자료 버전: \w{10}/.test(copied));assert(copied.includes('- 요청 건수: 3건'));
  for(const k of ['- 대상 파일: 지식/09_운영_매뉴얼.md','- 섹션: 오픈 순서 > ','번째 항목','- 현재 문구: '+rowText,'- 요청 종류: 문구 수정','- 수정 문구: '+rowText+' (시험 수정)','- 메모: 시험 메모','- 작성 시각: ','- 작성자 표시: 시험별명','대상 파일: 지식/12_칵테일_레시피.md','(삭제 요청)','지식/13_손님_응대_멘트.md','- 요청 종류: 항목 추가'])assert(copied.includes(k),'복사 형식 누락: '+k);
  assert((await page.locator('#reqMsg').innerText()).includes('복사 완료'));
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#reqDownload').click()]);assert(/^근무노트_수정요청_\d{4}-\d{2}-\d{2}\.md$/.test(dl.suggestedFilename()));
  assert.equal(fs.readFileSync(await dl.path(),'utf8'),copied,'파일 내용 = 복사 내용');
  // 새로고침 후 유지, 체크 키와 분리
  await page.reload();assert.equal(await page.locator('#reqCount').innerText(),'3');
  assert((await page.evaluate(()=>Object.keys(localStorage))).filter(k=>k.startsWith('harago-check-v2')).every(k=>!k.includes('edit')));
  // 편집, 삭제
  await page.locator('#reqGo').click();await page.locator('.req-item').first().getByRole('button',{name:'편집'}).click();
  await page.locator('#editMemo').fill('편집됨');await page.locator('#editSave').click();assert((await page.locator('.req-item').first().innerText()).includes('편집됨'));
  const del=page.locator('.req-item').first().getByRole('button',{name:'삭제'});await del.click();assert.equal(await page.locator('.req-item').count(),3,'첫 클릭은 확인만');
  await page.locator('.req-item').first().locator('.req-actions button').nth(1).click();assert.equal(await page.locator('.req-item').count(),2);
  assert.equal(await page.locator('#reqCount').innerText(),'2');
  await page.locator('#reqClear').click();await page.locator('#reqClear').click();assert.equal(await page.locator('.req-empty').count(),1);
  // 홈 카드
  await page.locator('[data-tab="home"]').click();assert(await page.locator('#homeCards .home-card',{hasText:'수정 요청 모아보기'}).isVisible());await layout(page,'home');
  // 5 저장소 불가
  const ctx2=await browser.newContext({viewport:{width:500,height:900},timezoneId:'Asia/Seoul'});const p2=await ctx2.newPage();
  await p2.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('denied');}});});
  await p2.goto(file);await p2.locator('[data-tab="recipes"]').click();await p2.locator('.recipe-field .edit-btn').first().click();
  await p2.locator('#editText').fill('메모리 시험');await p2.locator('#editSave').click();await p2.locator('#reqGo').click();
  assert.equal(await p2.locator('.req-item').count(),1);assert(await p2.locator('#reqStorage').isVisible(),'저장 불가 안내');
  // 6 데스크톱
  await page.setViewportSize({width:1280,height:900});await page.locator('[data-tab="checklist"]').click();await page.locator('#checkContent .edit-btn').first().click();
  await page.screenshot({path:shot('d_form_1280')});await page.keyboard.press('Escape');
  assert.equal(errors.length,0,errors.join('\n'));assert.equal(external.length,0,'외부 요청');
  console.log(JSON.stringify({ok:true,screenshots:['a_checklist_500','b_form_500','c_requests_500','d_form_1280'].map(shot)},null,1));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
