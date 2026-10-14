// 레시피 탭 칵테일/안주 구역 점검 (node 도구/레시피안주_점검.js)
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const CL_URL='https://haragogipe-staff-ai.haragogipe-staff-ai-worker.workers.dev/api/checklist';
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'근무노트.html'),'utf8');
const shotDir=process.env.HARAGO_SHOTS||'/private/tmp/harago-1014-shots';fs.mkdirSync(shotDir,{recursive:true});
const doc=fs.readFileSync(path.join(root,'지식','10_안주_가이드.md'),'utf8');
const listNames=doc.match(/만드는 법이 있는 안주:\s*(.+)/)[1].split(',').map(s=>s.trim());
const key=s=>s.replace(/[\s&·]/g,'');
(async()=>{
 const browser=await chromium.launch(process.env.HARAGO_PLAYWRIGHT?{channel:'chrome',headless:true}:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const results=[];
 try{
  for(const [label,vp] of [['모바일',{width:500,height:900}],['데스크톱',{width:1280,height:900}]]){
   const context=await browser.newContext({viewport:vp,timezoneId:'Asia/Seoul'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/ERR_|Failed to load/.test(m.text()))errors.push(m.text());});
   await page.route(CL_URL,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"published":false}'}));
   await page.goto('file://'+path.join(root,'근무노트.html'));
   await page.locator('[data-tab="recipes"]').click();
   // 칵테일 기본
   assert.equal(await page.locator('[data-recipe-kind="칵테일"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#recipeCards .recipe-card').count(),3);assert(await page.locator('#foodCards').isHidden());
   if(label==='모바일')await page.screenshot({path:shotDir+'/칵테일.png'});
   // 안주 전환
   await page.locator('[data-recipe-kind="안주"]').click();
   assert(await page.locator('#recipeCards').isHidden());assert(await page.locator('#foodCards').isVisible());
   const cards=page.locator('.food-card');const n=await cards.count();
   const names=await page.locator('.food-card .food-name').allInnerTexts();
   assert.equal(n,listNames.length,'카드 수 '+n+' vs 목록 '+listNames.length);
   assert.deepEqual(names.map(key).sort(),listNames.map(key).sort(),'카드 이름과 문서 목록 불일치');
   if(label==='모바일')await page.screenshot({path:shotDir+'/안주목록.png'});
   // 모든 카드: 열어서 준비물·순서·수정 요청 확인
   for(let i=0;i<n;i++){
    await cards.nth(i).locator('.food-head').click();
    const open=await page.locator('.food-body:not([hidden])').count();assert.equal(open,1,'펼침은 한 번에 하나');
    const c=cards.nth(i);assert(await c.locator('.food-prep').innerText().then(t=>t.replace('준비물 (도구·그릇)','').trim().length>0),names[i]+' 준비물');
    assert(await c.locator('.food-steps li').count()>=1,names[i]+' 순서');
    const text=await c.innerText();assert(!/도매|원가|희망가|매입/.test(text),names[i]+' 금지어');
    const before=await c.locator('.food-steps li span').first().innerText();
    await c.locator('.food-steps li .edit-btn').first().click();
    assert.match(await page.locator('#editTarget').innerText(),new RegExp('^레시피 · '+names[i].replace(/[&]/g,'.')));
    await page.locator('#editTarget').scrollIntoViewIfNeeded().catch(()=>{});
    const closer=page.locator('#editCancel,[data-edit-close],#formClose,#editClose').first();
    if(await closer.count())await closer.click();else await page.keyboard.press('Escape');
    if(i===0&&label==='모바일'){await page.screenshot({path:shotDir+'/수정폼.png'});}
    // 레이아웃
    const ov=await page.evaluate(()=>{const b=document.querySelector('.food-body:not([hidden])');const w=document.documentElement.clientWidth;const bad=[];b.querySelectorAll('*').forEach(x=>{const r=x.getBoundingClientRect();if(r.width&&(r.right>w+1||r.left<-1))bad.push(x.className)});return {scroll:document.documentElement.scrollWidth>w+1,bad,head:b.parentElement.getBoundingClientRect().width,body:b.getBoundingClientRect().width};});
    assert(!ov.scroll,names[i]+' 가로 넘침');assert.equal(ov.bad.length,0,names[i]+' 넘친 요소 '+ov.bad);assert(Math.abs(ov.head-ov.body)<3,'전체 폭');
    // 단계/수정 버튼 겹침: li 안 span과 edit-btn
    const overlap=await page.evaluate(()=>{const o=[];document.querySelectorAll('.food-body:not([hidden]) .food-steps li').forEach(li=>{const a=li.querySelector('span').getBoundingClientRect(),b=li.querySelector('.edit-btn').getBoundingClientRect();if(a.right>b.left+0.5&&a.bottom>b.top&&a.top<b.bottom)o.push(li.innerText)});return o});
    assert.equal(overlap.length,0,names[i]+' 글자·버튼 겹침');
    if(label==='모바일'&&names[i]==='짜파게티')await page.screenshot({path:shotDir+'/펼친카드.png'});
   }
   // 수정 요청 복사 대상 파일
   await page.locator('.food-card').first().locator('.food-head').click();
   await page.locator('.food-card').first().locator('.food-steps li .edit-btn').first().click();
   const tgt=await page.locator('#editTarget').innerText();assert(/레시피 · 치즈 플레이트/.test(tgt));
   // 토글(같은 카드 다시 누르면 접힘)
   const closer2=page.locator('#editCancel,[data-edit-close],#formClose,#editClose').first();if(await closer2.count())await closer2.click();
   await page.locator('.food-card').first().locator('.food-head').click();
   assert.equal(await page.locator('.food-body:not([hidden])').count(),0);
   // 필터
   await page.fill('#foodFilter','파스타');assert.equal(await page.locator('.food-card').count(),2);
   await page.fill('#foodFilter','없는안주');assert.equal(await page.locator('.food-card').count(),0);
   await page.fill('#foodFilter','');assert.equal(await page.locator('.food-card').count(),n);
   // 칵테일 복귀
   await page.locator('[data-recipe-kind="칵테일"]').click();assert.equal(await page.locator('#recipeCards .recipe-card').count(),3);assert(await page.locator('#foodCards').isHidden());
   assert.equal(errors.length,0,'JS 오류 '+errors.join('|'));
   if(label==='데스크톱')await page.screenshot({path:shotDir+'/데스크톱_칵테일.png'});
   results.push(label+' 통과 (카드 '+n+')');await context.close();
  }
 }finally{await browser.close();}
 // 요청 복사문 대상 파일은 템플릿 규칙(지식/<file>.md)
 assert(html.includes("'지식/'+r.file+'.md'"));
 console.log(results.join('\n'));
})().catch(e=>{console.error('실패:',e.message);process.exit(1);});
