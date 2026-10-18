// 신입 교육 카드 점검: 일차 선택 / 카드 넘기기 / 교육생 드롭다운·새 교육생 등록·수료로 빠진 이름·목록 캐시 / 진도 4단계 저장·이름별 분리 / 교육 기록 전송·대기·재전송·409 버림 / 위치 기억 / 초기화 / 모바일 폭. (node 도구/신입교육_점검.js, HARAGO_PLAYWRIGHT 필요)
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
  // 교육생 명단·교육 기록 서버 모의. 명단: active(목록에 보임)·completed(수료). 기록: 미등록·수료면 409, 아니면 trainingUp에 따라 503/201.
  const posts=[],registers=[],active=['신입 B'],completed=['수료자'];let trainingUp=false,rosterUp=true;
  await page.route(H.BASE+'/api/training/trainees',r=>{const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:H.CORS});
   const send=(status,body)=>r.fulfill({status,contentType:'application/json',headers:H.CORS,body:JSON.stringify(body)});
   if(req.method()==='GET')return rosterUp?send(200,{trainees:active.slice()}):send(503,{error:'down'});
   const name=JSON.parse(req.postData()).name.replace(/\s+/g,' ').trim();registers.push(name);
   if(completed.includes(name))return send(409,{registered:false,error:'이미 수료한 이름이에요. 다른 이름으로 등록해 주세요.'});
   if(active.includes(name))return send(200,{registered:true,existing:true,name});
   active.push(name);send(201,{registered:true,existing:false,name});});
  await page.route(H.BASE+'/api/training',r=>{const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:H.CORS});const body=JSON.parse(req.postData());posts.push(body);
   if(!active.includes(body.trainee))return r.fulfill({status:409,contentType:'application/json',headers:H.CORS,body:JSON.stringify({saved:false,error:'등록되지 않았거나 수료한 교육생이에요.'})});
   r.fulfill({status:trainingUp?201:503,contentType:'application/json',headers:H.CORS,body:JSON.stringify(trainingUp?{saved:true}:{saved:false})});});
  await page.goto('file://'+path.join(root,'근무노트.html'));
  await page.locator('[data-tab="training"]').click();
  const card=page.locator('.training-card'),sync=page.locator('#trainingSync');
  const title=()=>card.locator('h3').textContent();
  assert.equal(await page.locator('.training-chip').count(),days.length);
  assert.equal(await title(),days[0].tasks[0].title);
  assert(await card.getByRole('button',{name:'← 이전'}).isDisabled());
  assert.equal(await page.locator('#trainingProgress').textContent(),'혼자 수행 확인 0 / '+total+'개 항목');
  await page.screenshot({path:path.join(shotDir,'카드_1일차_1.png'),fullPage:true});
  // 목록은 서버에서 받아 드롭다운에 표시(기본 '교육생 선택')
  const options=()=>page.locator('#trainingName option').allTextContents();
  await page.waitForFunction(()=>document.querySelectorAll('#trainingName option').length===2);
  assert.deepEqual(await options(),['교육생 선택','신입 B']);
  assert.equal(await page.inputValue('#trainingName'),'');
  // 선택 없이 진도를 누르면 기록하지 않고 드롭다운으로 안내
  await card.getByRole('button',{name:'설명 들음'}).click();
  assert.match(await sync.textContent(),/교육생을 먼저 골라/);
  assert.equal(await card.getByRole('button',{name:'아직 배우기 전'}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'trainingName');
  // 새 교육생 등록: 펼치기·검증·수료 이름 409·등록 후 선택
  assert(await page.locator('#trainingNewRow').isHidden());
  await page.click('#trainingNew');
  assert.equal(await page.getAttribute('#trainingNew','aria-expanded'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'trainingNewName');
  await page.fill('#trainingNewName','  ');await page.click('#trainingNewSave');assert.match(await sync.textContent(),/1~20자/);assert.equal(registers.length,0);
  await page.fill('#trainingNewName','수료자');await page.click('#trainingNewSave');
  await page.waitForFunction(()=>/수료한 이름/.test(document.getElementById('trainingSync').textContent));
  assert.equal(await page.inputValue('#trainingName'),'');
  await page.fill('#trainingNewName',' 신입 A ');await page.press('#trainingNewName','Enter');
  await page.waitForFunction(()=>/신입 A 님을 등록/.test(document.getElementById('trainingSync').textContent));
  assert.deepEqual(registers,['수료자','신입 A']);
  assert.deepEqual(await options(),['교육생 선택','신입 B','신입 A']);
  assert.equal(await page.inputValue('#trainingName'),'신입 A');
  assert(await page.locator('#trainingNewRow').isHidden());assert.equal(await page.getAttribute('#trainingNew','aria-expanded'),'false');
  // 이미 있는 이름을 다시 등록하면 그 이름을 고름
  await page.click('#trainingNew');await page.fill('#trainingNewName','신입 B');await page.click('#trainingNewSave');
  await page.waitForFunction(()=>/이미 등록돼 있어요/.test(document.getElementById('trainingSync').textContent));
  assert.equal(await page.inputValue('#trainingName'),'신입 B');
  await page.selectOption('#trainingName','신입 A');assert.match(await sync.textContent(),/신입 A 님의 진도/);
  await page.screenshot({path:path.join(shotDir,'교육생_선택_375.png'),fullPage:false});
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
  await page.waitForFunction(()=>document.getElementById('trainingSync').textContent==='기록했어요.');
  assert.deepEqual(posts.slice(1).map(p=>p.level),[1,2,3]);
  assert.equal(posts[1].id,posts[0].id,'대기 기록은 같은 기록ID로 다시 보냄');
  assert.equal(await page.evaluate(()=>localStorage.getItem('harago-training-v2-queue')),'[]');
  // 다른 교육생을 고르면 진도가 따로 보임
  await page.selectOption('#trainingName','신입 B');
  assert.equal(await page.locator('#trainingProgress').textContent(),'혼자 수행 확인 0 / '+total+'개 항목');
  await page.selectOption('#trainingName','신입 A');
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
  // 수료된 교육생(서버 기준)으로 기록하면 409: 대기하지 않고 버림
  await page.locator('[data-tab="training"]').click();
  active.splice(active.indexOf('신입 B'),1);completed.push('신입 B');
  await page.selectOption('#trainingName','신입 B');
  const before409=posts.length;
  await card.getByRole('button',{name:'설명 들음'}).click();
  await page.waitForFunction(()=>/수료한 교육생이라/.test(document.getElementById('trainingSync').textContent));
  assert.equal(posts.length,before409+1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('harago-training-v2-queue')),'[]');
  // 다시 열면 목록에서 빠지고, 선택해 둔 이름은 풀림
  await page.reload();await page.locator('[data-tab="training"]').click();
  await page.waitForFunction(()=>/수료했거나 목록에 없는 이름/.test(document.getElementById('trainingSync').textContent));
  assert.deepEqual(await options(),['교육생 선택','신입 A']);
  assert.equal(await page.inputValue('#trainingName'),'');
  assert.equal(await page.evaluate(()=>localStorage.getItem('harago-training-v2-name')),null);
  // 목록 서버 연결 실패: 기기에 저장된 목록으로 표시
  await page.selectOption('#trainingName','신입 A');rosterUp=false;
  await page.reload();await page.locator('[data-tab="training"]').click();
  await page.waitForFunction(()=>/저장된 목록/.test(document.getElementById('trainingSync').textContent));
  assert.deepEqual(await options(),['교육생 선택','신입 A']);
  assert.equal(await page.inputValue('#trainingName'),'신입 A');
  rosterUp=true;
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('신입 교육 카드 점검 통과 ('+days.length+'일 '+total+'항목, 캡처 '+shotDir+')');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
