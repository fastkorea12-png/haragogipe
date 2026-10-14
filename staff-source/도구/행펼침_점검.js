// 체크리스트 행 펼침 점검: 행에는 체크박스+문구만, 문구를 누르면 아래로 해당 없음·수정 요청 영역이 펼쳐진다. (node 행펼침_점검.js)
const path=require('path'),os=require('os'),assert=require('assert/strict');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const CL_URL='https://haragogipe-staff-ai.haragogipe-staff-ai-worker.workers.dev/api/checklist';
const file='file://'+path.join(__dirname,'..','근무노트.html'),shot=n=>path.join(os.tmpdir(),'근무노트_행펼침_'+n+'.png');
const NEXT='xpath=following-sibling::*[1]';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});let fail=0;
 const step=async(n,f)=>{try{await f();console.log('통과 '+n);}catch(e){fail++;console.log('실패 '+n+' :: '+String(e.message).split('\n')[0]);}};
 for(const [name,vp,touch] of [['모바일 390',{width:390,height:844},true],['모바일 500',{width:500,height:900},true],['데스크톱 1280',{width:1280,height:900},false]]){
  const ctx=await browser.newContext({viewport:vp,hasTouch:touch,timezoneId:'Asia/Seoul'});const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(CL_URL,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"published":false}'}));
  await page.addInitScript(()=>{const k='*{overflow-anchor:none!important}';document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=k;document.head.append(s);});});
  await page.goto(file);await page.locator('[data-tab="checklist"]').first().click();await page.waitForSelector('#checkContent .row-main');
  const items=page.locator('#checkContent .info-item'),main=i=>items.nth(i).locator('.row-main'),panel=i=>items.nth(i).locator(NEXT),cbox=i=>items.nth(i).locator('input'),
   tap=l=>touch?l.tap():l.click(),open=()=>page.locator('#checkContent .row-panel:not([hidden])'),prog=()=>page.locator('.check-lhs span').first().innerText();
  const top=l=>l.evaluate(n=>n.getBoundingClientRect().top);
  await step(name+' 행 구조: 해당 없음·✎ 안 보임, 2열', async()=>{
   assert.equal(await page.locator('#checkContent .info-item .skip-check:visible').count(),0);assert.equal(await page.locator('#checkContent .info-item .edit-btn:visible').count(),0);
   assert.equal(await page.locator('#checkContent .info-item:has-text("✎")').count(),0);
   assert.equal(await page.locator('#checkContent .row-panel:visible').count(),0,'처음엔 모두 접힘');
   const a=await items.nth(0).boundingBox(),b=await items.nth(1).boundingBox();assert(Math.abs(a.y-b.y)<2&&b.x>a.x+50,'2열 배치');assert(a.height>=43.5&&a.height<=50,'행 높이 '+a.height);
   const t=await main(0).getAttribute('aria-controls');assert.equal(await main(0).getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#'+t).count(),1);assert.equal(await main(0).evaluate(n=>n.tagName),'BUTTON');
  });
  await step(name+' 체크박스 탭=토글, 문구 탭=토글 안 함', async()=>{
   const cb=await items.nth(0).locator('.check-cb').boundingBox();assert(cb.width>=44&&cb.height>=44,'체크 터치 영역 '+cb.width+'x'+cb.height);
   const p0=await prog();await tap(items.nth(0).locator('.check-cb'));assert.equal(await cbox(0).isChecked(),true);assert.notEqual(await prog(),p0);
   await tap(main(0));assert.equal(await cbox(0).isChecked(),true,'문구 탭이 체크를 바꾸면 안 됨');assert.equal(await main(0).getAttribute('aria-expanded'),'true');
   await tap(main(0));await tap(items.nth(0).locator('.check-cb'));assert.equal(await cbox(0).isChecked(),false);
   assert.equal(await open().count(),0);
  });
  await step(name+' 문구 탭=펼침, 한 번에 한 줄, 같은 줄=접힘', async()=>{
   await tap(main(2));assert.equal(await open().count(),1);assert.equal(await main(2).getAttribute('aria-expanded'),'true');
   const row=await items.nth(2).boundingBox(),pb=await panel(2).boundingBox();assert(pb.y>=row.y+row.height-1,'펼침은 줄 아래');assert(pb.width>row.width*1.8,'펼침은 전체 폭 '+pb.width);
   const nxt=await items.nth(3).boundingBox();assert(nxt.y>=pb.y+pb.height-1||nxt.x>row.x+row.width/2&&false||nxt.y>=pb.y+pb.height-1,'다음 행은 펼침 아래로 순서 유지');
   await tap(main(5));assert.equal(await open().count(),1);assert.equal(await main(2).getAttribute('aria-expanded'),'false');assert.equal(await main(5).getAttribute('aria-expanded'),'true');
   await tap(main(5));assert.equal(await open().count(),0);
   await tap(main(4));await page.keyboard.press('Escape');assert.equal(await open().count(),0,'Esc 접힘');assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('row-main')),true,'Esc 후 문구 버튼 포커스');
   await tap(main(4));await page.mouse.click(vp.width-3,3);assert.equal(await open().count(),0,'바깥 누르기 접힘');
  });
  await step(name+' 해당 없음 토글·라벨·상태 표시·진행률', async()=>{
   const c0=await prog();await tap(main(3));const sk=panel(3).locator('.skip-check');assert.equal((await sk.innerText()).trim(),'해당 없음');
   const bb=await sk.boundingBox();assert(bb.height>=44,'버튼 높이 '+bb.height);assert(await sk.evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=16),'글자 16px');
   await tap(sk);assert.equal((await sk.innerText()).trim(),'해당 없음 취소');assert.equal(await cbox(3).isDisabled(),true);assert(await items.nth(3).locator('.na-tag').isVisible(),'줄에 해당 없음 표시');
   assert.match(await prog(),/해당 없음 1/);assert.notEqual(await prog(),c0);assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('skip-check')),true,'버튼 포커스 유지');
   const sv=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('harago-check-v2:')));assert(sv.length>=1,'기존 저장 키');
   await page.screenshot({path:shot(name.replace(/ /g,'_')+'_na')});
   await tap(sk);assert.equal((await sk.innerText()).trim(),'해당 없음');assert.equal(await items.nth(3).locator('.na-tag').isVisible(),false);assert.equal(await cbox(3).isDisabled(),false);assert.match(await prog(),/해당 없음 0/);
  });
  await step(name+' 수정 요청 버튼 → 폼, 대상 정확', async()=>{
   const label=(await items.nth(6).locator('.task-label').innerText()).replace('•','').replace('수정 요청 있음','').trim();await tap(main(6));const eb=panel(6).locator('.edit-btn');
   const bb=await eb.boundingBox();assert(bb.height>=44,'수정 요청 버튼 높이');assert(await eb.evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=16),'글자 16px');assert.equal((await eb.innerText()).trim(),'수정 요청');
   await tap(eb);assert(await page.locator('#editDialog').evaluate(d=>d.open));assert.equal((await page.locator('#editCurrent').innerText()).trim(),label);assert.match(await page.locator('#editTarget').innerText(),/체크리스트 · 오픈 순서 · .+ · 7번째|체크리스트 · 오픈 순서 · .+ · \d+번째 항목/);
   await page.keyboard.press('Escape');assert(!(await page.locator('#editDialog').evaluate(d=>d.open)));
  });
  await step(name+' 펼침 중 y 변화 ≤ 2px, 펼친 줄 위치 유지, 하단 탭에 안 가림', async()=>{
   await page.evaluate(()=>{const r=document.querySelectorAll('#checkContent .info-item')[8].getBoundingClientRect();window.scrollBy(0,r.top-150);});await page.waitForTimeout(100);
   const y1=await top(main(8));await tap(main(8));const y2=await top(main(8));assert(Math.abs(y2-y1)<=2,'펼침 y '+(y2-y1));
   const y5=await top(main(10));await tap(main(10));const y6=await top(main(10));assert(Math.abs(y6-y5)<=2,'다른 줄 펼침(이전 줄 접힘) y '+(y6-y5));
   await tap(main(8));const y7=await top(main(8)),y8=await top(main(10));await tap(main(10));assert(Math.abs(await top(main(10))-y8)<=2,'위쪽 줄 접힘 보정 '+(await top(main(10))-y8));
   // 화면 아래쪽 줄은 펼쳐도 하단 탭(약 90px)에 가리지 않게 스크롤된다.
   await page.evaluate(()=>{const r=document.querySelectorAll('#checkContent .info-item')[12].getBoundingClientRect();window.scrollBy(0,r.top-(innerHeight-120));});await page.waitForTimeout(100);
   await tap(main(12));await page.waitForTimeout(150);const pb=await panel(12).boundingBox();assert(pb.y+pb.height<=vp.height-(touch&&vp.width<851?84:0)+1,'펼침이 하단 탭에 가리지 않음 '+(pb.y+pb.height));
  });
  await step(name+' 마감 탭도 동일, JS 오류 0', async()=>{
   await page.locator('[data-check-kind="마감 순서"]').click();await page.waitForSelector('#checkContent .row-main');await tap(main(0));assert.equal(await open().count(),1);assert.equal(await page.locator('#checkContent .info-item .edit-btn:visible').count(),0);
   assert.equal(errors.length,0,errors.join('\n'));
  });
  await ctx.close();
 }
 await browser.close();console.log(fail?'행펼침 점검 실패 '+fail+'건':'행펼침 점검: 모두 통과');process.exit(fail?1:0);
})();
