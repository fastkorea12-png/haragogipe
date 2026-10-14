// 체크리스트 편집 화면 시나리오 점검: 원본 동등성 -> 편집 -> 변경 배지 -> 내보내기 -> 새로고침 유지 -> 미리 적용 -> 되돌리기 -> 저장소 불가 -> 레이아웃
const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),assert=require('assert/strict');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const CL_URL='https://haragogipe-staff-ai.haragogipe-staff-ai-worker.workers.dev/api/checklist';// 근무노트가 읽는 공개 발행본 주소(이 점검에서는 미발행으로 모의)
const H=require('./_점검공통.js');
const root=path.join(__dirname,'..'),htmlPath=path.join(root,'근무노트.html'),html=fs.readFileSync(htmlPath,'utf8'),file='file://'+htmlPath,shot=n=>path.join(os.tmpdir(),'근무노트_편집_'+n+'.png');
// 1 원본 동등성: 편집 모델을 아무것도 안 고치고 변환하면 기존 체크리스트 로직과 같은 결과
const ctx={};vm.createContext(ctx);vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1],ctx);
for(const kind of ['오픈 순서','마감 순서']){
 const body=ctx.KB.find(e=>e.file==='09_운영_매뉴얼'&&e.title===kind).body;
 for(let day=0;day<7;day++){
  const date=new Date('2026-10-'+String(11+day).padStart(2,'0')+'T12:00:00+09:00');
  const a=ctx.checklistItems(body,date).map(t=>t.section?['S',t.text]:['T',t.group,t.text,!!t.task,!!t.defaultNA]);
  const model=ctx.origModel(kind),b=ctx.modelTasks(model,date).map(t=>t.section?['S',t.text]:['T',t.group,t.text,!!t.task,!!t.defaultNA]);
  assert.deepEqual(b,a,kind+' 요일'+day+' 원본 동등');
  ctx.modelTasks(model,date).filter(t=>t.task).forEach(t=>assert.equal(t.key,ctx.norm(t.group+t.text),'체크 키 보존'));
  assert.equal(ctx.diffModel(kind,model).count,0);
 }
}
const baseExport=ctx.checklistExport({'오픈 순서':ctx.origModel('오픈 순서'),'마감 순서':ctx.origModel('마감 순서')},{},'2026-10-14','x');
assert(baseExport.includes('- 변경 건수: 0건')&&baseExport.includes('- 바닥 청소기 청소'));
// 원문 형식 동일성: 변경 없는 전체 목록이 지식 원문 본문과 같음
for(const kind of ['오픈 순서','마감 순서']){const e=ctx.KB.find(x=>x.file==='09_운영_매뉴얼'&&x.title===kind);const md=ctx.modelMarkdown(kind,ctx.origModel(kind)).split('\n').filter(l=>!/^- (상태|키워드):/.test(l)&&!/^## /.test(l));assert.deepEqual(md,e.body.split('\n').map(l=>l.trim()).filter(Boolean),kind+' 내보내기 형식 = 지식 원문');}
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:500,height:900},timezoneId:'Asia/Seoul',acceptDownloads:true});
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!H.ALLOWED.includes(r.url()))external.push(r.url());});await H.stub(page);
  await page.addInitScript(()=>{if(!window.__copyInit){window.__copyInit=1;Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{window.copiedText=t;}}});}});
  await page.goto(file);
  const layout=async id=>{const l=await page.evaluate(()=>{window.scrollTo(0,document.documentElement.scrollHeight);const s=document.querySelector('.screen:not([hidden])');return {sw:document.documentElement.scrollWidth,w:innerWidth,b:s.getBoundingClientRect().bottom,n:document.querySelector('.sidebar').getBoundingClientRect().top};});assert(l.sw<=l.w,id+' 가로 넘침');if(l.w<=850)assert(l.b<=l.n+1,id+' 하단 탭 가림');await page.evaluate(()=>window.scrollTo(0,0));};
  await page.locator('[data-tab="checklist"]').click();
  // 원본 체크: 첫 항목 체크
  const firstOrig=(await page.locator('#checkContent .task-label').first().innerText()).trim();
  await page.locator('#checkContent input[type=checkbox]').first().check();
  assert(await page.locator('#editEnter').isVisible());
  await page.locator('#editEnter').click();
  assert(await page.locator('#editRoot').isVisible());assert(!(await page.locator('#checkContent').isVisible()));
  assert((await page.locator('.eband').innerText()).includes('편집 모드 — 이 기기에서만 반영, 팀장 전달 후 확정'));
  assert(!(await page.locator('#editEnter').isVisible()));
  assert((await page.locator('#editSummary').innerText()).includes('변경 0건'));
  assert((await page.locator('#editRoot').innerText()).includes('예: 바닥 청소기 청소'));
  assert((await page.locator('#editApply').innerText()).includes('끔'),'기본 적용 안 함');
  // 글자·터치 크기
  for(const sel of ['.etext','.esec-title']){assert(await page.locator(sel).first().evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=16),sel+' 16px');}
  for(const sel of ['.e-up','.e-down','.e-del','.e-more']){assert(await page.locator(sel).first().evaluate(n=>n.getBoundingClientRect().height>=44),sel+' 44px');}
  const rows=page.locator('.esec').nth(1).locator('.erow');const n0=await rows.count();assert(n0>=5);
  assert.equal(await page.locator('.erow').first().evaluate(n=>n.getBoundingClientRect().width>400),true,'전체 폭 1열');
  await layout('edit-open');await page.screenshot({path:shot('a_open_500')});
  // 수정
  const area=rows.nth(0).locator('textarea');const t0=await area.inputValue();assert.equal(t0,firstOrig);
  await area.fill(t0+' 시험');
  assert((await page.locator('#editSummary').innerText()).includes('변경 1건'));assert((await rows.nth(0).locator('.ebadge').allInnerTexts()).includes('수정'));
  // 이동
  const t2=await rows.nth(2).locator('textarea').inputValue();
  await rows.nth(2).locator('.e-up').click();
  assert.equal(await page.locator('.esec').nth(1).locator('.erow').nth(1).locator('textarea').inputValue(),t2,'위로 이동');
  assert((await page.locator('#editSummary').innerText()).includes('변경 2건'));
  assert((await page.locator('.ebadge', {hasText:'이동'}).count())>=1);
  // 삭제(취소선, 되돌리기)
  const r4=page.locator('.esec').nth(1).locator('.erow').nth(4),t4=await r4.locator('textarea').inputValue();
  await r4.locator('.e-del').click();
  assert(await page.locator('.esec').nth(1).locator('.erow').nth(4).evaluate(n=>n.classList.contains('del')&&getComputedStyle(n.querySelector('textarea')).textDecorationLine.includes('line-through')));
  assert((await page.locator('.esec').nth(1).locator('.erow').nth(4).locator('.e-del').innerText())==='되돌리기');
  assert((await page.locator('#editSummary').innerText()).includes('변경 3건'));
  // 추가
  await page.locator('.esec').nth(1).getByRole('button',{name:/항목 추가/}).click();
  const nrow=page.locator('.esec').nth(1).locator('.erow').last();await nrow.locator('textarea').fill('시험 신규 항목');
  assert((await nrow.locator('.ebadge').allInnerTexts()).includes('추가'));assert((await page.locator('#editSummary').innerText()).includes('변경 4건'));
  // 속성: 월 + 격주
  await nrow.locator('.e-more').click();
  await nrow.locator('.edays button',{hasText:'월'}).click();await nrow.locator('.echip',{hasText:'격주'}).click();
  assert((await nrow.locator('.e-more').innerText()).includes('월')&&(await nrow.locator('.e-more').innerText()).includes('격주'));
  assert((await nrow.locator('.ebadge').allInnerTexts()).includes('추가'));
  await nrow.locator('.ememo').fill('시험 메모 이유');
  // [확인] 표시 토글
  await nrow.locator('.echip',{hasText:'[확인] 표시'}).click();assert((await nrow.locator('textarea').inputValue()).endsWith('[확인]'));
  await nrow.locator('.echip',{hasText:'[확인] 표시'}).click();assert.equal(await nrow.locator('textarea').inputValue(),'시험 신규 항목');
  // 중복 경고
  const tdup=await page.locator('.esec').nth(1).locator('.erow').nth(3).locator('textarea').inputValue();await nrow.locator('textarea').fill(tdup);assert((await nrow.innerText()).includes('중복 문구'));
  // 개인정보 경고
  await nrow.locator('textarea').fill('시험 '+['010','1234','5678'].join('-'));assert((await nrow.innerText()).includes('개인정보'));
  await nrow.locator('textarea').fill('시험 신규 항목');assert(!(await nrow.innerText()).includes('개인정보')&&!(await nrow.innerText()).includes('중복 문구'));
  // 빈 문구
  const r1=page.locator('.esec').nth(1).locator('.erow').nth(1),t1=await r1.locator('textarea').inputValue();
  await r1.locator('textarea').fill('');assert((await r1.innerText()).includes('빈 문구 저장 불가'));await r1.locator('textarea').blur();
  assert.equal(await r1.locator('textarea').inputValue(),t1,'빈 문구 복구');
  // 새 소제목 추가·이름 수정·삭제
  await page.locator('#editAddSection').click();const lastSec=page.locator('.esec').last();await lastSec.locator('.esec-title').fill('시험 소제목');
  assert((await lastSec.locator('.ebadge').allInnerTexts()).includes('추가'));
  const before=await page.locator('#editSummary').innerText();
  await page.locator('.esec').nth(1).locator('.esec-title').fill('홀 준비 시험명');assert((await page.locator('.esec').nth(1).locator('.ebadge').first().innerText())==='수정');
  await page.locator('.esec').nth(1).locator('.esec-title').fill(await page.locator('.esec').nth(1).locator('.esec-title').inputValue().then(()=> '오픈 전 · 홀 준비'));
  // 마감 탭으로 전환해 소제목 삭제 시험
  await page.locator('[data-check-kind="마감 순서"]').click();assert(await page.locator('#editRoot').isVisible());
  assert((await page.locator('.esec-title').first().inputValue()).includes('9시 30분'));
  await page.locator('.esec').nth(1).locator('.s-del').click();assert((await page.locator('.esec').nth(1).locator('.ebadge').allInnerTexts()).includes('삭제'));
  assert((await page.locator('#editSummary').innerText()).includes('마감 1'));
  await page.locator('[data-check-kind="오픈 순서"]').click();
  assert((await page.locator('#editSummary').innerText()).includes('변경 6건'));// 수정·이동·삭제·추가·새소제목 + 마감 소제목 삭제
  await page.evaluate(()=>{const r=document.querySelector('.erow.changed');window.scrollTo(0,r.getBoundingClientRect().top+scrollY-110);});await page.screenshot({path:shot('b_badges_500')});await page.locator('.erow.changed .e-more').nth(1).click();await page.locator('.ebadge',{hasText:'추가'}).first().scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollBy(0,-250));await page.screenshot({path:shot('b2_detail_500')});
  // 내보내기
  await page.locator('#editView').click();
  const pre=await page.locator('#editExportText').innerText();
  for(const k of ['# 체크리스트 수정안','- 생성일: '+new Date().toISOString().slice(0,4),'- 앱 자료 버전: ','- 변경 건수: 6건 (오픈 5건 · 마감 1건)','- 대상 파일: 지식/09_운영_매뉴얼.md','## (a) 변경 목록','- 섹션: 오픈 순서','- 소제목: 오픈 전 · 홀 준비','- 변경 종류: 수정','- 이전 문구: '+t0,'- 새 문구: '+t0+' 시험','- 변경 종류: 삭제','- 새 문구: (삭제)','- 변경 종류: 추가','- 새 문구: 시험 신규 항목','- 이유 메모: 시험 메모 이유','- 속성: 요일 월 / 격주','## (b) 새 체크리스트 전체','```markdown','## 오픈 순서','### 오픈 전 · 홀 준비','- '+t0+' 시험','- 시험 신규 항목 (요일: 월) (격주)','### 시험 소제목','## 마감 순서','- 상태: 확정','### 주간 업무 · 수요일'])assert(pre.includes(k),'내보내기 누락: '+k);
  assert(!pre.includes('- '+t4+'\n'),'삭제 항목은 새 전체 목록에서 빠짐');
  assert(!pre.includes('### 9시 30분 · 격주 [확인]'),'삭제 소제목 제외');
  await layout('export');await page.screenshot({path:shot('c_export_500')});await page.locator('#editExportText').scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollBy(0,500));await page.screenshot({path:shot('c2_export_500')});
  await page.locator('#editCopy').click();assert.equal(await page.evaluate(()=>window.copiedText),pre.replace(/\n$/,'')===pre?pre:pre);
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#editDownload').click()]);assert(/^근무노트_체크리스트수정안_\d{4}-\d{2}-\d{2}\.md$/.test(dl.suggestedFilename()));
  assert.equal(fs.readFileSync(await dl.path(),'utf8'),await page.evaluate(()=>window.copiedText),'파일 = 복사 내용');
  // 새로고침 후 초안·편집 모드 유지
  await page.reload();
  assert(await page.locator('#editRoot').isVisible(),'새로고침 후 편집 모드');assert((await page.locator('#editSummary').innerText()).includes('변경 6건'));
  assert.equal(await page.locator('.esec').nth(1).locator('.erow').nth(0).locator('textarea').inputValue(),t0+' 시험');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('harago-checklist-draft-v1')));assert.equal(stored.v,1);assert(stored.kinds['오픈 순서']&&stored.kinds['마감 순서']);
  assert(!Object.keys(stored.kinds).some(k=>k.includes('check')),'체크 키와 분리');
  // 미리 적용: 켜기 -> 종료 -> 체크 모드에 반영
  assert((await page.locator('#editApply').innerText()).includes('끔'));
  await page.locator('#editApply').click();assert((await page.locator('#editApply').innerText()).includes('켬'));
  await page.locator('#editExit').click();
  assert(await page.locator('#checkContent').isVisible());assert(await page.locator('#applyStrip').isVisible());
  const labels=await page.locator('#checkContent .task-label').allInnerTexts();
  assert(labels.includes(t0+' 시험'),'수정 문구 반영');assert(labels.includes('시험 신규 항목')||new Date().getDay()!==1,'신규 항목(월요일 한정)');assert(!labels.includes(t4),'삭제 반영');
  assert.equal(await page.locator('#checkContent .edit-btn').count(),0,'미리 적용 중 수정 요청 버튼 없음');
  // 오늘 체크한 첫 항목(문구 변경됨)은 체크 상태 유지
  assert(await page.locator('#checkContent .check-row',{hasText:t0+' 시험'}).locator('input').isChecked(),'문구 수정 후에도 같은 날 체크 유지');
  await page.screenshot({path:shot('d_preview_500')});
  await page.locator('[data-tab="home"]').click();assert((await page.locator('#todayProgress').innerText()).includes('1/'));
  // 적용 끔 -> 원본 표시, 체크 유지
  await page.locator('[data-tab="checklist"]').click();await page.locator('#applyOff').click();
  assert(!(await page.locator('#applyStrip').isVisible()));assert((await page.locator('#checkContent .task-label').first().innerText()).trim()===firstOrig);
  assert(await page.locator('#checkContent input[type=checkbox]').first().isChecked(),'원본 복귀 후에도 체크 유지');
  assert(await page.locator('#checkContent .edit-btn').count()>0);
  // 되돌리기
  await page.locator('#editEnter').click();await page.locator('#editReset').click();assert((await page.locator('#editSummary').innerText()).includes('변경 6건'),'첫 클릭은 확인만');
  await page.locator('#editReset').click();assert((await page.locator('#editSummary').innerText()).includes('변경 0건'));
  assert.equal(await page.locator('.esec').nth(1).locator('.erow').nth(0).locator('textarea').inputValue(),t0);
  const st2=await page.evaluate(()=>JSON.parse(localStorage.getItem('harago-checklist-draft-v1')));assert.deepEqual(Object.keys(st2.kinds),[]);
  // 입력 중 하단 탭 가림 없음
  await page.locator('.etext').first().focus();assert(!(await page.locator('.sidebar').isVisible()),'입력 중 하단 탭 숨김');
  await page.locator('.etext').first().blur();await page.waitForTimeout(150);assert(await page.locator('.sidebar').isVisible());
  await page.locator('#editExit').click();
  // 저장소 불가
  const ctx2=await browser.newContext({viewport:{width:500,height:900},timezoneId:'Asia/Seoul'});const p2=await ctx2.newPage();
  await p2.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('denied');}});});
  await p2.goto(file);await p2.locator('[data-tab="checklist"]').click();await p2.locator('#editEnter').click();
  assert((await p2.locator('#editRootWarn').innerText()).includes('저장소를 쓸 수 없음'));
  await p2.locator('.etext').first().fill('메모리 시험');assert((await p2.locator('#editSummary').innerText()).includes('변경 1건'));
  // 1280
  await page.setViewportSize({width:1280,height:900});await page.locator('#editEnter').click();
  await page.locator('.esec').nth(1).locator('.erow').nth(1).locator('.e-more').click();
  await page.screenshot({path:shot('e_edit_1280')});
  assert.equal(errors.length,0,errors.join('\n'));assert.equal(external.length,0,'외부 요청');
  console.log(JSON.stringify({ok:true,screenshots:['a_open_500','b_badges_500','b2_detail_500','c_export_500','c2_export_500','d_preview_500','e_edit_1280'].map(shot)},null,1));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
