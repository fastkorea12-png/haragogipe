// 신입 교육 카드 점검: 일차 선택 / 카드 넘기기 / 이름 입력 / 진도 4단계 저장·이름별 분리 / 교육 기록 전송·대기·재전송 / 위치 기억 / 초기화 / 모바일 폭. (node 도구/신입교육_점검.js, HARAGO_PLAYWRIGHT 필요)
// 서버 응답은 미발행으로 모의하고 외부 요청은 하지 않는다. 캡처는 HARAGO_SHOTS(기본 /private/tmp/harago-training-shots).
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const H=require('./_점검공통.js');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'근무노트.html'),'utf8');
const shotDir=process.env.HARAGO_SHOTS||'/private/tmp/harago-training-shots';fs.mkdirSync(shotDir,{recursive:true});
const md=fs.readFileSync(path.join(root,'신입교육_커리큘럼.md'),'utf8');
const a=html.indexOf('var trainingDays=')+17,days=JSON.parse(html.slice(a,html.indexOf('],trainingState={}',a)+1));
days.forEach(d=>d.tasks.forEach(t=>{assert(md.includes('### '+t.title),'문서에 없는 업무: '+t.title);assert(md.includes(t.body),'문서와 다른 설명: '+t.title);assert(md.includes('수행 목표: '+t.check),'문서와 다른 수행 목표: '+t.title);}));
const total=days.reduce((n,d)=>n+d.tasks.length,0);
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:375,height:800},timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!H.ALLOWED.includes(r.url()))external.push(r.url());});await H.stub(page);
  page.on('dialog',d=>d.accept());
  // 교육 기록 서버 모의: 처음엔 503(연결 실패), 이후 201. 받은 본문은 posts에 쌓는다.
  const posts=[];let trainingUp=false;
  await page.route(H.BASE+'/api/training',r=>{const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:H.CORS});posts.push(JSON.parse(req.postData()));r.fulfill({status:trainingUp?201:503,contentType:'application/json',headers:H.CORS,body:JSON.stringify(trainingUp?{saved:true}:{saved:false})});});
  await page.goto('file://'+path.join(root,'근무노트.html'));
  await page.locator('[data-tab="training"]').click();
  const card=page.locator('.training-card'),sync=page.locator('#trainingSync');
  const title=()=>card.locator('h3').textContent();
  assert.equal(await page.locator('.training-chip').count(),days.length);
  assert.equal(await title(),days[0].tasks[0].title);
  assert(await card.getByRole('button',{name:'← 이전'}).isDisabled());
  assert.equal(await page.locator('#trainingProgress').textContent(),'혼자 수행 확인 0 / '+total+'개 항목');
  await page.screenshot({path:path.join(shotDir,'카드_1일차_1.png'),fullPage:true});
  // 이름 없이 진도를 누르면 기록하지 않고 이름 입력으로 안내
  await card.getByRole('button',{name:'설명 들음'}).click();
  assert.match(await sync.textContent(),/이름을 먼저/);
  assert.equal(await card.getByRole('button',{name:'아직 배우기 전'}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'trainingName');
  await page.fill('#trainingName','  ');await page.click('#trainingNameSave');assert.match(await sync.textContent(),/1~20자/);
  await page.fill('#trainingName',' 신입 A ');await page.press('#trainingName','Enter');
  assert.equal(await page.inputValue('#trainingName'),'신입 A');assert.match(await sync.textContent(),/신입 A 님의 진도/);
  // 연결 실패: 화면 진도는 저장되고 기록은 대기
  await card.getByRole('button',{name:'설명 들음'}).click();
  await page.waitForFunction(()=>/기록 대기 1건/.test(document.getElementById('trainingSync').textContent));
  assert.equal(posts.length,1);
  assert.deepEqual({...posts[0],id:undefined},{id:undefined,trainee:'신입 A',dayId:'day1',dayLabel:days[0].day,taskIndex:0,task:days[0].tasks[0].title,level:1});
  assert.match(posts[0].id,/^[a-f0-9-]{36}$/);
  // 같은 단계를 다시 누르면 기록하지 않음
  await card.getByRole('button',{name:'설명 들음'}).click();assert.equal(posts.length,1);
  trainingUp=true;
  // 진도 선택 → 저장, 한 단계만 눌림
  await card.getByRole('button',{name:'함께 해봄'}).click();
  assert.equal(await card.locator('.training-levels [aria-pressed="true"]').count(),1);
  assert.equal(await card.getByRole('button',{name:'함께 해봄'}).getAttribute('aria-pressed'),'true');
  await card.getByRole('button',{name:'혼자 수행 확인'}).click();
  assert.equal(await page.locator('#trainingProgress').textContent(),'혼자 수행 확인 1 / '+total+'개 항목');
  // 연결되면 대기 기록부터 순서대로 보냄(대기 1 + 함께 해봄 + 혼자 수행 확인)
  await page.waitForFunction(()=>document.getElementById('trainingSync').textContent==='시트에 기록했어요.');
  assert.deepEqual(posts.slice(1).map(p=>p.level),[1,2,3]);
  assert.equal(posts[1].id,posts[0].id,'대기 기록은 같은 기록ID로 다시 보냄');
  assert.equal(await page.evaluate(()=>localStorage.getItem('harago-training-v2-queue')),'[]');
  // 다른 이름으로 바꾸면 진도가 따로 보임
  await page.fill('#trainingName','신입 B');await page.click('#trainingNameSave');
  assert.equal(await page.locator('#trainingProgress').textContent(),'혼자 수행 확인 0 / '+total+'개 항목');
  await page.fill('#trainingName','신입 A');await page.click('#trainingNameSave');
  assert.equal(await page.locator('#trainingProgress').textContent(),'혼자 수행 확인 1 / '+total+'개 항목');
  // 끝까지 넘기기 → 마무리
  for(let i=1;i<days[0].tasks.length;i++){await card.getByRole('button',{name:/다음 →|마무리 →/}).click();assert.equal(await title(),days[0].tasks[i].title);}
  await card.getByRole('button',{name:'마무리 →'}).click();
  assert.equal(await title(),days[0].day+' 마무리');
  assert.equal(await card.locator('.training-summary li').count(),days[0].tasks.length);
  assert((await card.locator('.training-summary').textContent()).includes('혼자 수행 확인'));
  await page.screenshot({path:path.join(shotDir,'카드_1일차_마무리.png'),fullPage:true});
  await card.getByRole('button',{name:days[1].day+' 시작 →'}).click();
  assert.equal(await title(),days[1].tasks[0].title);
  assert.equal(await page.locator('.training-chip.on').textContent(),days[1].day);
  await card.getByRole('button',{name:'← 이전'}).isDisabled();
  // 새로고침 후 진도·위치 유지
  await page.reload();await page.locator('[data-tab="training"]').click();
  assert.equal(await title(),days[1].tasks[0].title);
  await page.locator('.training-chip').first().click();
  assert.equal(await card.getByRole('button',{name:'혼자 수행 확인'}).getAttribute('aria-pressed'),'true');
  // 모든 업무를 함께 해봄 이상이면 일차 칩에 완료 표시
  for(let i=0;i<days[0].tasks.length;i++){if(i)await card.getByRole('button',{name:/다음 →|마무리 →/}).click();if(i)await card.getByRole('button',{name:'함께 해봄'}).click();}
  assert.equal(await page.locator('.training-chip').first().textContent(),days[0].day+' ✓');
  await card.getByRole('button',{name:'마무리 →'}).click();
  assert.equal(await title(),days[0].day+' 마침');
  // 마지막 일차는 다음 일차 버튼 없음
  await page.locator('.training-chip').last().click();
  for(let i=0;i<days.at(-1).tasks.length;i++)await card.getByRole('button',{name:/다음 →|마무리 →/}).click();
  assert.equal(await card.locator('.training-nav .primary').count(),0);
  // 가로 넘침 없음
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'가로 넘침');
  // 초기화
  await page.getByRole('button',{name:'교육 진도 초기화'}).click();
  assert.equal(await page.locator('#trainingProgress').textContent(),'혼자 수행 확인 0 / '+total+'개 항목');
  assert.equal(await page.locator('.training-chip').first().textContent(),days[0].day);
  // 바로가기
  await page.locator('.training-chip').first().click();
  await card.locator('.training-links button').first().click();
  assert.equal(await page.locator('.screen:visible').getAttribute('id'),'screen-'+days[0].links[0][0]);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('신입 교육 카드 점검 통과 ('+days.length+'일 '+total+'항목, 캡처 '+shotDir+')');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
