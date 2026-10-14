// 웹 검색 답변 점검(10/14 복원): 내장 검색이 '모름'일 때만 서버 POST /api/chat(스텁)으로 넘기는지 확인한다.
// 실제 Gemini는 호출하지 않는다. 서버는 로컬 http 스텁이고, 근무노트.html의 서버 주소만 바꾼 임시 사본을 연다.
// 실행: HARAGO_PLAYWRIGHT=<playwright 경로> node 도구/웹검색_점검.js
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'근무노트.html'),'utf8');
const shot=n=>path.join(os.tmpdir(),'근무노트_웹검색_'+n+'.png');
const rows=[];const rec=(area,name,ok,detail)=>{rows.push({area,name,ok,detail});if(!ok)console.error('실패',area,name,detail);};
const check=async(area,name,fn)=>{try{await fn();rec(area,name,true,'');}catch(e){rec(area,name,false,String(e.message).replace(/\s+/g,' ').slice(0,300));}};
const FALL='아직 정해진 게 없어요. 사장님께 확인해 주세요.';
const Q1='리슬링 품종 특징 알려줘',Q2='샴페인 산지 어디야',Q3='스카치 위스키와 버번 차이',Q4='게뷔르츠트라미너 어울리는 치즈',Q5='리슬링 숙성 가능 기간 알려줘';
const stub={mode:'ok',delay:0,delays:{},hits:[]};
const SRC=[{url:'https://example.com/riesling',title:'리슬링 품종 안내'},{url:'https://example.org/wine',title:'와인 사전'},{url:'http://insecure.example.com/x',title:'http 출처'},{url:'javascript:alert(1)',title:'스크립트'},{url:'https://example.com/riesling',title:'중복'}];
const server=http.createServer((req,res)=>{
 const cors={'access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'GET, POST, OPTIONS','content-type':'application/json; charset=utf-8'};
 if(req.method==='OPTIONS'){res.writeHead(204,cors);res.end();return;}
 if(req.url.startsWith('/api/checklist')){res.writeHead(200,cors);res.end('{"published":false}');return;}
 if(req.url!=='/api/chat'||req.method!=='POST'){res.writeHead(404,cors);res.end('{}');return;}
 let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
  let body={};try{body=JSON.parse(raw);}catch{}stub.hits.push(body);
  const d=stub.delays[body.question]!==undefined?stub.delays[body.question]:stub.delay;
  setTimeout(()=>{
   if(stub.mode==='429'){res.writeHead(429,cors);res.end('{"error":"요청이 잠시 많습니다."}');return;}
   if(stub.mode==='500'){res.writeHead(500,cors);res.end('{"error":"x"}');return;}
   if(stub.mode==='garbage'){res.writeHead(200,cors);res.end('not json');return;}
   if(stub.mode==='unsearched'){res.writeHead(200,cors);res.end(JSON.stringify({text:'자료에서 확인되지 않아 관리자 확인이 필요합니다.',model:'m',searched:false,sources:[],searchSuggestions:''}));return;}
   res.writeHead(200,cors);res.end(JSON.stringify({text:'리슬링 안내\n• 답변 대상: '+body.question+'\n• 독일 원산 청포도 품종, 산미가 높음\n**굵게** 표시 확인',model:'gemini-2.5-flash',searched:true,sources:SRC,searchSuggestions:'<div style="font:12px sans-serif">검색 제안 스텁</div>'}));
  },d);
 });
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const tmpOn=path.join(os.tmpdir(),'근무노트_웹검색_임시.html'),tmpOff=path.join(os.tmpdir(),'근무노트_웹검색_끔.html');
 fs.writeFileSync(tmpOn,html.replace(/var CL_BASE = "[^"]*";/,'var CL_BASE = "'+origin+'";'));
 fs.writeFileSync(tmpOff,html.replace(/var CL_BASE = "[^"]*";/,'var CL_BASE = "";'));
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const errors=[],external=[],shots=[];
 const profiles={mobile:{viewport:{width:500,height:900},isMobile:true,hasTouch:true,deviceScaleFactor:2},desktop:{viewport:{width:1280,height:900}}};
 async function open(profile,{off,timeout}={}){
  const context=await browser.newContext({...profiles[profile],timezoneId:'Asia/Seoul'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(profile+': '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR/.test(m.text()))errors.push(profile+' console: '+m.text());});
  page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin+'/api/'))external.push(r.url());});
  await page.addInitScript(t=>{if(t)window.HARAGO_WEB_TIMEOUT_MS=t;},timeout);
  await page.goto('file://'+(off?tmpOff:tmpOn));
  return {context,page};
 }
 const ask=async(page,q)=>{await page.locator('#q').fill(q);await page.locator('#q').press('Enter');};
 const logText=page=>page.locator('#log').innerText();
 const reset=(mode='ok',delay=0)=>{stub.mode=mode;stub.delay=delay;stub.delays={};stub.hits.length=0;};
 for(const profile of ['mobile','desktop']){
  const A=profile,{context,page}=await open(profile);
  // 1) 내장 답이 있는 질문·매장 운영 사실은 서버 호출 없음
  reset();
  for(const [q,must] of [['칼리모초 만드는 법','120ml'],['오픈 순서 알려줘','오픈'],['와이파이 비번',FALL],['마지막 주문 시간',FALL],['소비뇽블랑이 뭐야','와인']]){
   await check(A,'서버 호출 없음: '+q,async()=>{await ask(page,q);await page.waitForTimeout(250);assert.equal(stub.hits.length,0);assert((await logText(page)).includes(must));assert.equal(await page.locator('.web-badge').count(),0);});
  }
  await check(A,'매장과 무관한 일반 질문(날씨)도 보내지 않음',async()=>{await ask(page,'오늘 날씨 어때');await page.waitForTimeout(250);assert.equal(stub.hits.length,0);assert((await logText(page)).includes(FALL));});
  await check(A,'매장 운영어가 섞인 와인 질문(가격)은 보내지 않음',async()=>{await ask(page,'리슬링 와인 가격 얼마야');await page.waitForTimeout(250);assert.equal(stub.hits.length,0);});
  // 2) 모름 질문 → 서버 호출, 로딩, 답·배지·출처
  reset('ok',900);
  await check(A,'모름 질문: 로딩 → 웹 검색 답변·배지·출처',async()=>{
   await ask(page,Q1);
   await page.waitForSelector('.pending');assert((await page.locator('.pending').innerText()).includes('웹 검색 중'));
   assert.equal(await page.locator('#f button').getAttribute('aria-busy'),'true');assert.equal(await page.locator('#f button').innerText(),'검색 중');
   if(A==='mobile'){const f=shot('로딩_500');await page.screenshot({path:f});shots.push(f);}
   await page.waitForSelector('.web-badge');
   assert.equal(stub.hits.length,1);
   const h=stub.hits[0];assert.equal(h.question,Q1);assert.equal(h.context,'');assert(typeof h.publicWineName==='string'&&h.publicWineName.length>0);assert(Array.isArray(h.messages));
   assert.equal((await page.locator('.web-badge').innerText()),'웹 검색 참고 · 매장 확정 정보 아님');
   const t=await logText(page);assert(t.includes('독일 원산 청포도'));assert(t.includes('굵게 표시 확인')&&!t.includes('**'));
   assert(!t.includes(FALL),'모름 고정 답이 같이 나오면 안 됨');
   assert.equal(await page.locator('#f button').innerText(),'검색');
   assert(await page.locator('.search-suggestions iframe').count()===1);
   const links=await page.$$eval('.web-source-list a',as=>as.map(a=>({href:a.href,rel:a.rel,target:a.target,text:a.textContent})));
   assert.deepEqual(links.map(l=>l.href),['https://example.com/riesling','https://example.org/wine'],'https만·중복 제거');
   links.forEach(l=>{assert.equal(l.target,'_blank');assert(/noopener/.test(l.rel)&&/noreferrer/.test(l.rel));});
   if(A==='mobile'){const f=shot('답변출처_500');await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:f,fullPage:true});shots.push(f);}
   const ov=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);assert(ov,'가로 넘침');
  });
  await check(A,'대화 지우기 버튼 제공(서버 연결 있을 때)',async()=>{assert.equal(await page.locator('#log button',{hasText:'대화 지우기'}).count(),1);});
  await check(A,'직전과 같은 문장 5초 이내 재전송은 서버 호출 없음',async()=>{const n=stub.hits.length;await ask(page,Q1);await page.waitForTimeout(300);assert.equal(stub.hits.length,n);assert((await logText(page)).includes(FALL));});
  await check(A,'대화 지우기: 화면·문맥 지움',async()=>{await page.locator('#log button',{hasText:'대화 지우기'}).click();assert(await page.locator('#log').isHidden());});
  await context.close();
  // 3) 실패 유형: 내장 모름 답으로 되돌림
  for(const [label,mode,delay,timeout] of [['서버 500','500',0],['429 제한','429',0],['JSON 아닌 응답','garbage',0],['검색 근거 없음','unsearched',0],['타임아웃','ok',3000,700]]){
   const c=await open(profile,{timeout});reset(mode,delay);
   await check(A,'실패 → 내장 모름 답: '+label,async()=>{
    await c.page.locator('#q').fill(Q2);await c.page.locator('#q').press('Enter');
    await c.page.waitForFunction(()=>!document.querySelector('.pending')&&document.querySelector('#log').innerText.indexOf('아직 정해진 게 없어요')>=0,null,{timeout:6000});
    const t=await logText(c.page);assert(t.includes(FALL));assert.equal(await c.page.locator('.web-badge').count(),0);
    const note=t.split('\n').filter(l=>/웹 검색/.test(l));assert(note.length>=1&&note.every(l=>l.length<40),'개조식 한 줄: '+note.join('|'));
    assert.equal(await c.page.locator('#f button').innerText(),'검색');
    if(A==='mobile'&&label==='서버 500'){const f=shot('서버실패_500');await c.page.screenshot({path:f,fullPage:true});shots.push(f);}
   });
   await c.context.close();
  }
  { // 오프라인
   const c=await open(profile);reset();
   await check(A,'오프라인 → 내장 모름 답',async()=>{await c.context.setOffline(true);await ask(c.page,Q3);await c.page.waitForFunction(()=>!document.querySelector('.pending')&&document.querySelector('#log').innerText.indexOf('아직 정해진 게 없어요')>=0,null,{timeout:6000});assert.equal(await c.page.locator('.web-badge').count(),0);});
   await c.context.close();
  }
  { // 서버 주소 없음
   const c=await open(profile,{off:true});reset();
   await check(A,'서버 주소 없음 → 호출·대화 지우기 없음, 내장 모름 답',async()=>{await ask(c.page,Q1);await c.page.waitForTimeout(250);assert.equal(stub.hits.length,0);assert((await logText(c.page)).includes(FALL));assert.equal(await c.page.locator('#log button',{hasText:'대화 지우기'}).count(),0);assert.equal(await c.page.locator('.pending').count(),0);});
   await c.context.close();
  }
  { // 방어: 분당 4회, 길이, 숫자열
   const c=await open(profile);reset();
   await check(A,'1분 4회 초과 시 잠시 후 안내, 서버 호출 4회까지',async()=>{
    for(const q of [Q1,Q2,Q3,Q4]){await ask(c.page,q);await c.page.waitForSelector('.web-badge');}
    assert.equal(stub.hits.length,4);await ask(c.page,Q5);await c.page.waitForTimeout(300);
    assert.equal(stub.hits.length,4);const t=await logText(c.page);assert(t.includes(FALL)&&/1분에 4회/.test(t),t);
   });
   await c.context.close();
  }
  { const c=await open(profile);reset();
   await check(A,'200자 상한: 입력 maxlength, 초과 질문은 미전송',async()=>{
    assert.equal(await c.page.locator('#q').getAttribute('maxlength'),'200');
    await c.page.locator('#q').fill('리슬링 품종 '.repeat(40));assert.equal(await c.page.locator('#q').evaluate(n=>n.value.length),200);
    await c.page.locator('#q').evaluate(n=>n.removeAttribute('maxlength'));
    await ask(c.page,'리슬링 품종 '.repeat(40)+'알려줘');await c.page.waitForTimeout(300);assert.equal(stub.hits.length,0);assert(/200자/.test(await logText(c.page)));
   });
   await check(A,'전화번호·계좌 형태 숫자열 질문은 미전송',async()=>{
    for(const q of ['리슬링 품종 010-1234-5678 알려줘','리슬링 품종 123456789012 알려줘','리슬링 품종 987654321098 알려줘']){await ask(c.page,q);await c.page.waitForTimeout(250);}
    assert.equal(stub.hits.length,0);assert(/숫자열/.test(await logText(c.page)),await logText(c.page));
   });
   await c.context.close(); }
  { // 응답 전 새 질문: 이전 응답 무시
   const c=await open(profile);reset();stub.delays[Q1]=1500;stub.delays[Q2]=200;
   await check(A,'응답 전 새 질문 → 이전 응답 무시',async()=>{
    await ask(c.page,Q1);await c.page.waitForSelector('.pending');
    await ask(c.page,Q1);await c.page.waitForTimeout(100);assert.equal(stub.hits.length,1,'로딩 중 같은 질문 중복 전송 방지');
    await ask(c.page,Q2);await c.page.waitForSelector('.web-badge');
    await c.page.waitForTimeout(1800);
    const t=await logText(c.page);assert(t.includes('답변 대상: '+Q2),t);assert(!t.includes('답변 대상: '+Q1));assert.equal(await c.page.locator('.web-badge').count(),1);assert.equal(await c.page.locator('.pending').count(),0);
    assert.equal(await c.page.locator('#f button').innerText(),'검색');
   });
   await c.context.close(); }
 }
 // (10/14 확장) 오타·변형·짧은 단어는 웹 검색, 운영어·주제 밖은 호출 없음, 수동 버튼
 for(const profile of ['mobile','desktop']){
  const A=profile+'·확장';
  { const c=await open(profile);reset();
   await check(A,'오타·변형·짧은 단어 4종은 웹 검색 호출',async()=>{
    for(const q of ['쇼비뇽 블랑 특징','소비농 블랑이 뭐야','카베르네 소비뇽 차이','리슬링']){
     const n=stub.hits.length;await ask(c.page,q);await c.page.waitForSelector('.web-badge');
     assert.equal(stub.hits.length,n+1,q);assert.equal(stub.hits[n].question,q);assert.equal(await c.page.locator('.web-find').count(),0,'답변 카드에는 수동 버튼 없음');
     if(A==='mobile·확장'&&q==='쇼비뇽 블랑 특징'){const f=shot('오타질문_웹답_500');await c.page.evaluate(()=>window.scrollTo(0,0));await c.page.screenshot({path:f,fullPage:true});shots.push(f);}
    }
   });
   await c.context.close(); }
  { const c=await open(profile);reset();
   await check(A,'운영어는 호출·수동 버튼 없음',async()=>{
    for(const q of ['와이파이 비번','마지막 주문 몇 시','쇼비뇽 블랑 가격 얼마','직원 시급 알려줘']){await ask(c.page,q);await c.page.waitForTimeout(250);assert.equal(c.page.locator('.web-find').count&&await c.page.locator('.web-find').count(),0,q);}
    assert.equal(stub.hits.length,0);
   });
   await check(A,'주제 밖(날씨·파이썬 코드)은 호출·버튼 없음, 개조식 안내 한 줄',async()=>{
    for(const q of ['오늘 날씨','파이썬 코드','연예인 뉴스 알려줘']){await ask(c.page,q);await c.page.waitForTimeout(250);const t=await logText(c.page);assert(t.includes(FALL)&&t.includes('매장 업무·와인·음료 질문만 웹 검색.'),q+t);assert.equal(await c.page.locator('.web-find').count(),0,q);}
    assert.equal(stub.hits.length,0);
    if(A==='mobile·확장'){const f=shot('범주밖_500');await c.page.screenshot({path:f,fullPage:true});shots.push(f);}
   });
   await c.context.close(); }
  { const c=await open(profile);reset();
   await check(A,'애매한 질문: 자동 전송 없이 모름 카드+수동 버튼, 클릭 시 같은 자리에 웹 답변',async()=>{
    const q='마스카포네 대신 쓸 만한 거 있어?';
    await ask(c.page,q);await c.page.waitForTimeout(250);assert.equal(stub.hits.length,0);assert((await logText(c.page)).includes(FALL));
    assert.equal(await c.page.locator('.web-find').count(),1);assert.equal(await c.page.locator('.web-find').innerText(),'웹 검색으로 찾기');
    if(A==='mobile·확장'){const f=shot('수동버튼_500');await c.page.screenshot({path:f,fullPage:true});shots.push(f);}
    await c.page.locator('.web-find').click();await c.page.waitForSelector('.web-badge');
    assert.equal(stub.hits.length,1);assert.equal(stub.hits[0].question,q);assert.equal(await c.page.locator('.web-find').count(),0);assert(!(await logText(c.page)).includes(FALL));
    assert.equal(await c.page.locator('.web-source-list a').count(),2);
   });
   await c.context.close(); }
  { const c=await open(profile);reset('500');
   await check(A,'수동 버튼 클릭 후 서버 실패: 내장 답+버튼 복원(재시도), 429·오프라인도 내장 답',async()=>{
    const q='마스카포네 대신 쓸 만한 거 있어?';await ask(c.page,q);await c.page.locator('.web-find').click();
    await c.page.waitForFunction(()=>!document.querySelector('.pending')&&document.querySelector('#log').innerText.indexOf('아직 정해진 게 없어요')>=0);
    assert.equal(await c.page.locator('.web-find').count(),1);assert.equal(await c.page.locator('.web-badge').count(),0);
    stub.mode='429';await c.page.waitForTimeout(5100);await c.page.locator('.web-find').click();
    await c.page.waitForFunction(()=>!document.querySelector('.pending')&&/많음/.test(document.querySelector('#log').innerText));
    await c.context.setOffline(true);await c.page.waitForTimeout(5100);await c.page.locator('.web-find').click();
    await c.page.waitForFunction(()=>!document.querySelector('.pending')&&/연결 안 됨/.test(document.querySelector('#log').innerText));
    assert((await logText(c.page)).includes(FALL));
   });
   await c.context.close(); }
  { const c=await open(profile);reset();
   await check(A,'수동 버튼도 방어 적용: 숫자열·200자·분당 4회',async()=>{
    await ask(c.page,'마스카포네 대신 쓸 만한 거 123456789012 있어?');await c.page.waitForTimeout(250);
    assert.equal(await c.page.locator('.web-find').count(),1);await c.page.locator('.web-find').click();await c.page.waitForTimeout(250);assert.equal(stub.hits.length,0);assert(/숫자열/.test(await logText(c.page)));
    assert.equal(await c.page.locator('.web-find').count(),1);
    for(const q of ['쇼비뇽 블랑 특징','소비농 블랑이 뭐야','카베르네 소비뇽 차이','리슬링']){await ask(c.page,q);await c.page.waitForSelector('.web-badge');}
    assert.equal(stub.hits.length,4);
    await ask(c.page,'마스카포네 대신 쓸 만한 거 있어?');await c.page.locator('.web-find').click();await c.page.waitForTimeout(250);assert.equal(stub.hits.length,4);assert(/1분에 4회/.test(await logText(c.page)));
   });
   await c.context.close(); }
  { const c=await open(profile,{off:true});reset();
   await check(A,'서버 주소 없음: 수동 버튼 없음',async()=>{await ask(c.page,'마스카포네 대신 쓸 만한 거 있어?');await c.page.waitForTimeout(250);assert.equal(await c.page.locator('.web-find').count(),0);});
   await c.context.close(); }
 }
 await check('전체','서버 호출은 허용 목록(/api/chat·/api/checklist 스텁)만, 그 밖 외부 요청 0',()=>assert.deepEqual([...new Set(external)],[]));
 await check('전체','콘솔·페이지 JS 오류 0',()=>assert.deepEqual(errors,[]));
 // 허용 목록 밖 요청은 계속 실패해야 함: 서버 주소 없음 빌드에서 외부로 나가는 요청 없음은 위에서 확인
 await browser.close();server.close();
 const failed=rows.filter(r=>!r.ok);
 console.log(JSON.stringify({total:rows.length,passed:rows.length-failed.length,failed:failed.length,screenshots:shots},null,2));
 if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
