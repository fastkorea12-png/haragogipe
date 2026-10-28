// 발행 콘텐츠(레시피·응대 멘트·사진) 읽기, 수정 제안 전송, 웹 검색 답변 다듬기 점검.
// 서버는 로컬 http 스텁으로 모의한다(근무노트.html의 서버 주소만 스텁 주소로 바꾼 임시 사본을 연다). 실제 서버·AI·운영 DB로는 요청을 보내지 않는다.
// 실행: HARAGO_PLAYWRIGHT=<playwright 경로> node 도구/발행콘텐츠_점검.js   (캡처: HARAGO_SHOTS, 기본 /private/tmp/harago-1014-shots)
const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),http=require('http'),zlib=require('zlib'),assert=require('assert/strict');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'근무노트.html'),'utf8');
const shotDir=process.env.HARAGO_SHOTS||'/private/tmp/harago-1014-shots';fs.mkdirSync(shotDir,{recursive:true});
const shot=n=>path.join(shotDir,'발행콘텐츠_'+n+'.png');
const extract=require('./콘텐츠_추출.js');
const rows=[];const rec=(area,name,ok,detail)=>{rows.push({area,name,ok,detail});if(!ok)console.error('실패',area,name,detail);};
const check=async(area,name,fn)=>{try{await fn();rec(area,name,true,'');}catch(e){rec(area,name,false,String(e.message).replace(/\s+/g,' ').slice(0,300));}};
const clone=x=>JSON.parse(JSON.stringify(x));

// ---- 시험용 PNG (800x600 단색)
function crc32(buf){let c,crc=0xffffffff;for(let n=0;n<buf.length;n++){c=(crc^buf[n])&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]),crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function png(w,h){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;for(let x=0;x<w;x++){const o=y*(w*3+1)+1+x*3;raw[o]=200-(y>>3);raw[o+1]=120+(x>>4);raw[o+2]=90;}}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const PNG=png(800,600);

// ---- 스텁 서버
const PID1='a1'.repeat(12),PID2='b2'.repeat(12),PIDBAD='c3'.repeat(12),PIDSLOW='d4'.repeat(12);
const S={content:{recipes:{mode:'ok',body:null,delay:0},phrases:{mode:'ok',body:null,delay:0}},prop:{queue:[],fallback:{status:201,body:{ok:true,id:'0123456789abcdef'}},delay:0},chat:{body:null},hits:[],props:[],chats:[],other:[]};
const server=http.createServer((req,res)=>{
 const cors={'access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'GET, POST, OPTIONS'};
 const url=new URL(req.url,'http://x'),p=url.pathname,j=(code,obj)=>{res.writeHead(code,{...cors,'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));};
 if(req.method==='OPTIONS'){res.writeHead(204,cors);res.end();return;}
 S.hits.push({method:req.method,path:p,at:Date.now(),headers:req.headers});
 let m;
 if(p==='/api/checklist'){j(200,{published:false});return;}
 if((m=p.match(/^\/api\/content\/(recipes|phrases)$/))){
  const c=S.content[m[1]];
  setTimeout(()=>{
   if(c.mode==='error'){j(500,{error:'x'});return;}
   if(c.mode==='unpublished'){j(200,{published:false});return;}
   if(c.mode==='garbage'){j(200,{published:true,kind:m[1],version:99,data:{appetizers:'x'}});return;}
   if(c.mode==='drop'){req.socket.destroy();return;}
   j(200,c.body);
  },c.delay);return;
 }
 if((m=p.match(/^\/api\/photo\/([a-f0-9]{24})$/))){
  const id=m[1];
  if(id===PIDBAD){res.writeHead(404,{...cors,'content-type':'text/plain'});res.end('not found');return;}
  setTimeout(()=>{res.writeHead(200,{...cors,'content-type':'image/png','cross-origin-resource-policy':'cross-origin','cache-control':'no-store'});res.end(PNG);},id===PIDSLOW?900:0);return;
 }
 if(p==='/api/proposals'&&req.method==='POST'){
  let b='';req.on('data',d=>b+=d);req.on('end',()=>{
   const body=JSON.parse(b||'{}');S.props.push(body);
   const next=S.prop.queue.length?S.prop.queue.shift():S.prop.fallback;
   setTimeout(()=>{if(next.drop){req.socket.destroy();return;}j(next.status,next.body);},S.prop.delay);
  });return;
 }
 if(p==='/api/chat'&&req.method==='POST'){let b='';req.on('data',d=>b+=d);req.on('end',()=>{S.chats.push(JSON.parse(b||'{}'));j(200,S.chat.body);});return;}
 S.other.push(req.method+' '+p);j(404,{error:'허용 목록 밖'});
});

// ---- 시험 자료
const B=extract();
// 내장 사진이 있는 안주는 발행 사진 실패 시 내장 사진으로 바뀌므로, 실패·지연 사진 시험은 내장 사진 없는 안주로 한다.
const hasBuiltin=a=>['png','jpg'].some(x=>fs.existsSync(path.join(root,'지식','사진',a.name.replace(/^\d+\.\s*/,'')+'.'+x)));
const BAD=B.recipes.appetizers.findIndex((a,i)=>i>0&&!hasBuiltin(a)),SLOW=BAD===1?2:1;// 지연 사진은 서버 사진을 먼저 쓰므로 내장 사진이 있어도 된다
const REC_NAME='치즈 플레이트 (발행판)',STEP_NEW='발행 새 단계 문구: 접시에 치즈를 둥글게 배치.',STEP_NEW2='발행 두 번째 단계.';
function mkRecipes(version,mut){
 const d=clone(B.recipes);
 d.appetizers[0].name=REC_NAME;d.appetizers[0].ingredients=['발행 준비물 A','발행 준비물 B'];d.appetizers[0].steps=[STEP_NEW,STEP_NEW2];d.appetizers[0].photoId=PID1;d.appetizers[0].price='12,000원';
 d.appetizers[1].confirm=true;d.appetizers[1].confirmNote='발행 확인 문구 시험';d.appetizers[BAD].photoId=PIDBAD;
 d.appetizers[SLOW].photoId=PIDSLOW;
 d.cocktails[0].photoId=PID1;d.cocktails[0].glass='발행 샹그리아 잔';d.cocktails[0].steps=['발행 칵테일 순서 1.','발행 칵테일 순서 2.'];
 if(mut)mut(d);
 return {published:true,kind:'recipes',version,publishedAt:'2026-10-14T05:51:58.958Z',data:d};
}
const PH_NEW='발행 멘트: 어서 오세요, 편하게 앉으세요.';
function mkPhrases(version,mut){
 const d=clone(B.phrases);
 d.sections[0].title='입장 · 자리 안내 (발행판)';
 d.sections[0].items[0].situation='발행 상황: 손님이 들어오실 때';d.sections[0].items[0].lines=[{kind:'customer',text:PH_NEW},{kind:'staff',text:'발행 직원 안내: 눈 맞춤 먼저'}];
 d.sections[0].items[0].confirm=true;d.sections[0].items[0].confirmNote='발행 멘트 확인 사항';
 if(mut)mut(d);
 return {published:true,kind:'phrases',version,publishedAt:'2026-10-14T05:51:58.958Z',data:d};
}
const setOk=(rv,pv)=>{S.content.recipes={mode:'ok',body:rv,delay:0};S.content.phrases={mode:'ok',body:pv,delay:0};};
const resetStub=()=>{S.hits.length=0;S.props.length=0;S.chats.length=0;S.other.length=0;S.prop.queue=[];S.prop.fallback={status:201,body:{ok:true,id:'0123456789abcdef'}};S.prop.delay=0;};

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const tmpOn=path.join(os.tmpdir(),'근무노트_발행콘텐츠_임시.html'),tmpOff=path.join(os.tmpdir(),'근무노트_발행콘텐츠_서버없음_임시.html');
 fs.writeFileSync(tmpOn,html.replace(/var CL_BASE = "[^"]*";/,'var CL_BASE = "'+origin+'";'));
 fs.writeFileSync(tmpOff,html.replace(/var CL_BASE = "[^"]*";/,'var CL_BASE = "";'));
 const ALLOW=['/api/checklist','/api/content/recipes','/api/content/phrases','/api/proposals','/api/chat'];
 const browser=await chromium.launch(process.env.HARAGO_PLAYWRIGHT?{channel:'chrome',headless:true}:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const errors=[],external=[];
 const profiles={mobile:{viewport:{width:500,height:900},isMobile:true,hasTouch:true,deviceScaleFactor:2},desktop:{viewport:{width:1280,height:900}}};
 async function open(profile,{off,poll,storage,ctxOpts}={}){
  const context=await browser.newContext({...profiles[profile],timezoneId:'Asia/Seoul',acceptDownloads:true,...(ctxOpts||{})});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(profile+': '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR|ERR_/.test(m.text()))errors.push(profile+' console: '+m.text());});
  page.on('request',r=>{if(!/^https?:/.test(r.url()))return;const u=new URL(r.url());if(u.origin!==origin||!(ALLOW.includes(u.pathname)||/^\/api\/photo\/[a-f0-9]{24}$/.test(u.pathname)))external.push(r.url());});
  await page.addInitScript(({poll,storage})=>{if(poll)window.HARAGO_POLL_MS=poll;if(storage&&!sessionStorage.getItem('__seeded')){sessionStorage.setItem('__seeded','1');Object.keys(storage).forEach(k=>localStorage.setItem(k,storage[k]));}},{poll,storage});
  await page.goto('file://'+(off?tmpOff:tmpOn));
  return {context,page};
 }
 const tab=async(page,id)=>{await page.locator('[data-tab="'+id+'"]').first().click();};
 const foodNames=page=>page.locator('#foodCards .food-card .food-name').allInnerTexts();
 const cocktailNames=page=>page.locator('#recipeCards .recipe-card h3').allInnerTexts();
 const phraseTitles=page=>page.locator('#phraseCards .phrase-card > summary').evaluateAll(s=>s.map(x=>x.firstChild.textContent.trim()));
 const builtinFoodNames=B.recipes.appetizers.map(x=>x.name);
 const waitFood=(page,name,ms=9000)=>page.waitForFunction(n=>[...document.querySelectorAll('#foodCards .food-name')].some(e=>e.textContent===n),name,{timeout:ms});
 const layoutOk=async(page,id)=>{const l=await page.evaluate(()=>{window.scrollTo(0,document.documentElement.scrollHeight);const s=document.querySelector('.screen:not([hidden])'),n=document.querySelector('.sidebar').getBoundingClientRect();return {sw:document.documentElement.scrollWidth,w:innerWidth,b:s.getBoundingClientRect().bottom,nt:n.top,vis:getComputedStyle(document.querySelector('.sidebar')).position};});assert(l.sw<=l.w,id+' 가로 넘침');if(l.w<=850)assert(l.b<=l.nt+1,id+' 하단 탭 가림');await page.evaluate(()=>window.scrollTo(0,0));};
 const goReq=async page=>{await page.locator('#reqGo').click();await page.waitForSelector('#screen-requests:not([hidden])');};
 const fc=(page,n)=>page.locator('.food-card[data-food="'+n+'"]');
 const openCard=async(page,n)=>{const h=fc(page,n).locator('.food-head');if((await h.getAttribute('aria-expanded'))!=='true')await h.click();};
 const openStep=async(page,card,i=0)=>{await openCard(page,card);await fc(page,card).locator('.food-steps li .edit-btn').nth(i).click();};
 const saveWith=async(page,text,{memo,nick}={})=>{await page.locator('#editText').fill(text);if(memo!==undefined)await page.locator('#editMemo').fill(memo);if(nick!==undefined)await page.locator('#editNick').fill(nick);await page.locator('#editSave').click();};
 const stateOf=page=>page.locator('.req-item').first().locator('.req-state').innerText();

 for(const profile of ['mobile','desktop']){
  const A=profile;
  // ① 발행 레시피·멘트·사진이 화면에 반영
  {
   resetStub();setOk(mkRecipes(7),mkPhrases(7));
   const {context,page}=await open(profile);
   await tab(page,'recipes');await waitFood(page,REC_NAME);
   const names=await foodNames(page);
   await check(A,'① 안주 이름·순서가 발행본(첫 항목 이름 바뀜)',()=>assert.deepEqual(names,[REC_NAME,...builtinFoodNames.slice(1)]));
   await check(A,'① 칩 순서(안주·칵테일)와 기본 안주 구역',async()=>{assert.deepEqual(await page.locator('[data-recipe-kind]').allInnerTexts(),['안주','칵테일']);assert.equal(await page.locator('[data-recipe-kind="안주"]').getAttribute('aria-pressed'),'true');});
   await fc(page,REC_NAME).locator('.food-head').click();
   const card=fc(page,REC_NAME);
   await check(A,'① 재료(준비물)·순서·가격·출처 반영',async()=>{const t=await card.innerText();assert(t.includes('발행 준비물 A, 발행 준비물 B'));assert(t.includes(STEP_NEW)&&t.includes(STEP_NEW2));assert(await card.locator('.food-price').innerText()==='12,000원');assert(t.includes('서버 발행 v7'));assert.equal(await card.locator('.food-steps li').count(),2);});
   await check(A,'① 사진: img 태그·발행 photoId 주소·lazy·alt=이름',async()=>{const img=card.locator('img.food-photo');assert.equal(await img.count(),1);assert.equal(await img.getAttribute('src'),origin+'/api/photo/'+PID1);assert.equal(await img.getAttribute('loading'),'lazy');assert.equal(await img.getAttribute('alt'),REC_NAME);await page.waitForFunction(n=>{const i=[...document.querySelectorAll('.food-card')].find(c=>c.dataset.food===n).querySelector('img.food-photo');return i&&i.complete&&i.naturalWidth===800;},REC_NAME);});
   // 다음 카드의 [확인] 배너
   const nm=B.recipes.appetizers[1].name;
   await fc(page,nm).locator('.food-head').click();
   await check(A,'① [확인] 배너(확인 문구) 표시',async()=>{const t=await fc(page,nm).locator('.food-field.confirm').allInnerTexts();assert(t.some(x=>x.includes('[확인] 발행 확인 문구 시험')),t.join('|'));});
   if(A==='mobile'){await fc(page,REC_NAME).locator('.food-head').click();await fc(page,REC_NAME).scrollIntoViewIfNeeded();await page.screenshot({path:shot('01_레시피_사진카드_500')});}
   await fc(page,REC_NAME).locator('.food-head').click();
   // 칵테일
   await page.locator('[data-recipe-kind="칵테일"]').click();
   const cn=await cocktailNames(page),confirmed=B.recipes.cocktails.filter(x=>x.status==='confirmed').map(x=>x.name).concat(B.recipes.others.map(x=>x.name));
   await check(A,'⑤ 칵테일: 확정 3 + 매장 칵테일·음료만 표시, 후보 미표시',async()=>{assert.deepEqual(cn,confirmed);B.recipes.cocktails.filter(x=>x.status==='candidate').forEach(c=>assert(!cn.includes(c.name),'후보 표시됨: '+c.name));assert.equal(B.recipes.cocktails.filter(x=>x.status==='candidate').length,7);});
   await check(A,'① 칵테일 발행 문구·사진·확인 배너',async()=>{const c=page.locator('.recipe-card').first(),t=await c.innerText();assert(t.includes('발행 샹그리아 잔')&&t.includes('발행 칵테일 순서 1.')&&t.includes('서버 발행 v7'));assert.equal(await c.locator('.photo-box img.recipe-photo').count(),1);assert.equal(await page.locator('.recipe-etc').count(),B.recipes.others.length);assert.equal(await page.locator('#recipeEtc').innerText(),'매장 칵테일·음료 (벽 레시피)');});
   if(A==='mobile'){await page.locator('.recipe-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:shot('02_칵테일_사진카드_500')});}
   await check(A,'⑨ 레시피 탭 레이아웃',()=>layoutOk(page,'recipes'));
   // 응대 멘트
   await tab(page,'phrases');await page.waitForFunction(()=>document.querySelector('#phraseCards .phrase-group')&&document.querySelector('#phraseCards .phrase-group').textContent.includes('발행판'));
   const titles=await phraseTitles(page);
   await check(A,'① 멘트 소제목·상황 발행본 반영, 항목 수 유지',async()=>{assert.equal((await page.locator('#phraseCards .phrase-group').first().innerText()),'입장 · 자리 안내 (발행판)');assert.equal(titles[0],'발행 상황: 손님이 들어오실 때');assert.equal(titles.length,53);});
   await check(A,'② 04·05 원문 3장은 내장 그대로 마지막에 유지',async()=>{const groups=await page.locator('#phraseCards .phrase-group').allInnerTexts();assert.equal(groups.at(-1),'전환·리뷰 원문');assert.deepEqual(titles.slice(-3),['안내 멘트 (손님에게)','손님에게 말할 문장 (이벤트)','리뷰 표기 원칙']);});
   const pc=page.locator('.phrase-card').first();await pc.locator('summary').click();
   await check(A,'① 손님 발화(복사 버튼)·직원 안내·[확인] 배너',async()=>{const t=await pc.innerText();assert(t.includes(PH_NEW));assert(t.includes('직원 안내')&&t.includes('발행 직원 안내: 눈 맞춤 먼저'));assert(t.includes('[확인] 발행 멘트 확인 사항'));assert.equal(await pc.locator('.phrase-speech').count(),1);assert.equal(await pc.locator('.copy-pitch').count(),1);assert.equal(await pc.locator('.phrase-staff').count(),1);});
   if(A==='mobile'){await pc.scrollIntoViewIfNeeded();await page.screenshot({path:shot('03_응대멘트_500')});}
   await pc.locator('summary').click();
   await check(A,'⑨ 멘트 탭 레이아웃',()=>layoutOk(page,'phrases'));
   await context.close();
  }

  // ② 미발행·서버 실패·형식 오류·타임아웃이면 내장본
  for(const [label,setup] of [['미발행',()=>{S.content.recipes={mode:'unpublished'};S.content.phrases={mode:'unpublished'};}],['서버 500',()=>{S.content.recipes={mode:'error'};S.content.phrases={mode:'error'};}],['연결 끊김',()=>{S.content.recipes={mode:'drop'};S.content.phrases={mode:'drop'};}],['형식 오류',()=>{S.content.recipes={mode:'garbage'};S.content.phrases={mode:'garbage'};}]]){
   resetStub();setup();
   const {context,page}=await open(profile);await tab(page,'recipes');await page.waitForTimeout(600);
   await check(A,'② '+label+': 내장 레시피 그대로',async()=>{assert.deepEqual(await foodNames(page),builtinFoodNames);assert((await page.locator('#recipeCards').innerText()).length>0);await page.locator('.food-card').first().locator('.food-head').click();assert((await page.locator('.food-card').first().innerText()).includes('내장본'));});
   await tab(page,'phrases');
   await check(A,'② '+label+': 내장 멘트 53장',async()=>{assert.equal((await phraseTitles(page)).length,53);});
   await check(A,'② '+label+': 캐시 저장 안 함',async()=>{assert.equal(await page.evaluate(()=>[localStorage.getItem('harago-published-recipes-v1'),localStorage.getItem('harago-published-phrases-v1')].join()),',');});
   await context.close();
  }
  {
   resetStub();S.content.recipes={mode:'ok',body:mkRecipes(7),delay:6500};S.content.phrases={mode:'ok',body:mkPhrases(7),delay:6500};
   const {context,page}=await open(profile);await tab(page,'recipes');const t0=Date.now();
   await page.waitForTimeout(4700);
   await check(A,'② 타임아웃(4초): 응답 늦으면 내장본 유지·요청 중단',async()=>{assert.deepEqual(await foodNames(page),builtinFoodNames);assert(Date.now()-t0>=4500);});
   await context.close();
  }
  {
   // 캐시: 서버가 실패해도 이전에 받은 발행본(캐시)으로 첫 화면
   resetStub();S.content.recipes={mode:'error'};S.content.phrases={mode:'error'};
   const cached=mkRecipes(5,d=>{d.appetizers[0].name='캐시 안주';}),cachedP=mkPhrases(5);
   const {context,page}=await open(profile,{storage:{'harago-published-recipes-v1':JSON.stringify({version:5,publishedAt:cached.publishedAt,data:cached.data}),'harago-published-phrases-v1':JSON.stringify({version:5,publishedAt:cachedP.publishedAt,data:cachedP.data})}});
   await tab(page,'recipes');
   await check(A,'② 서버 실패 + 캐시 있음: 캐시 발행본 표시(v5)',async()=>{assert.equal((await foodNames(page))[0],'캐시 안주');await page.locator('.food-card').first().locator('.food-head').click();assert((await page.locator('.food-card').first().innerText()).includes('서버 발행 v5'));});
   await context.close();
  }
  {
   // 첫 렌더는 캐시/내장본으로 즉시, 도착 후 조용히 교체
   resetStub();S.content.recipes={mode:'ok',body:mkRecipes(7),delay:1200};S.content.phrases={mode:'ok',body:mkPhrases(7),delay:0};
   const {context,page}=await open(profile);await tab(page,'recipes');
   await check(A,'① 첫 화면은 내장본으로 즉시, 응답 도착 후 발행본으로 교체',async()=>{assert.deepEqual(await foodNames(page),builtinFoodNames);await waitFood(page,REC_NAME);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('harago-published-recipes-v1')).version),7);});
   await context.close();
  }

  // ③ 45초 재조회(점검에서는 1초로 단축)로 버전 교체, 펼침·폼 중에는 보류
  {
   resetStub();setOk(mkRecipes(7),mkPhrases(7));
   const {context,page}=await open(profile,{poll:1000});
   await tab(page,'recipes');await waitFood(page,REC_NAME);
   await check(A,'③ 재조회: 버전이 바뀌면 조용히 교체',async()=>{setOk(mkRecipes(8,d=>{d.appetizers[0].name='재조회 안주 v8';}),mkPhrases(8));await waitFood(page,'재조회 안주 v8',6000);});
   await check(A,'③ 안주 카드 펼침 중에는 교체 보류, 접으면 반영',async()=>{
    await fc(page,'재조회 안주 v8').locator('.food-head').click();
    setOk(mkRecipes(9,d=>{d.appetizers[0].name='재조회 안주 v9';}),mkPhrases(9));await page.waitForTimeout(3300);
    assert.equal((await foodNames(page))[0],'재조회 안주 v8','펼친 동안 교체됨');assert(await fc(page,'재조회 안주 v8').locator('.food-body').isVisible());
    await fc(page,'재조회 안주 v8').locator('.food-head').click();await waitFood(page,'재조회 안주 v9',4000);
   });
   await check(A,'③ 수정 제안 폼이 열려 있는 동안 교체 보류, 닫으면 반영',async()=>{
    await fc(page,'재조회 안주 v9').locator('.food-head').click();await fc(page,'재조회 안주 v9').locator('.food-steps li .edit-btn').first().click();
    assert(await page.locator('#editDialog').evaluate(d=>d.open));
    setOk(mkRecipes(10,d=>{d.appetizers[0].name='재조회 안주 v10';}),mkPhrases(10));await page.waitForTimeout(3300);
    assert.equal((await foodNames(page))[0],'재조회 안주 v9','폼 중 교체됨');
    await page.locator('#editCancel').click();await page.locator('.food-card').first().locator('.food-head').evaluate(h=>{if(h.getAttribute('aria-expanded')==='true')h.click();});await waitFood(page,'재조회 안주 v10',5000);
   });
   await check(A,'③ 응대 멘트: 펼침 중 보류, 접으면 반영',async()=>{
    await tab(page,'phrases');await page.waitForFunction(()=>document.querySelector('#phraseCards .phrase-card'));
    const first=page.locator('.phrase-card').first();await first.locator('summary').click();
    setOk(mkRecipes(10),mkPhrases(11,d=>{d.sections[0].items[0].situation='멘트 교체 v11';}));await page.waitForTimeout(3300);
    assert.notEqual((await phraseTitles(page))[0],'멘트 교체 v11','펼친 동안 교체됨');
    await page.locator('.phrase-card').first().locator('summary').click();
    await page.waitForFunction(()=>document.querySelector('#phraseCards .phrase-card summary').textContent.includes('멘트 교체 v11'),null,{timeout:5000});
   });
   await check(A,'③-2 응대 멘트 검색이 발행본 기준(v11 상황명·문구, 출처 서버 발행)',async()=>{
    await tab(page,'home');
    await page.locator('#q').fill('멘트 교체 v11 응대 멘트 알려줘');await page.locator('#q').press('Enter');
    await page.waitForFunction(()=>document.getElementById('log').textContent.includes('서버 발행 v11'),null,{timeout:4000});
    const t=await page.locator('#log').innerText();assert(t.includes(PH_NEW),t.slice(0,300));assert(t.includes('발행 멘트 확인 사항'));
    await page.locator('#q').fill('');
   });
   await check(A,'③-2 응대 멘트 검색: 다른 상황은 내장 문구와 일치, 멘트 의도 없는 질문은 가로채지 않음',async()=>{
    const it=B.phrases.sections[2].items[0];
    await page.locator('#q').fill(it.situation+' 응대 멘트');await page.locator('#q').press('Enter');
    await page.waitForFunction(()=>document.getElementById('log').textContent.includes('응대 멘트'),null,{timeout:4000});
    const t=await page.locator('#log').innerText();assert(it.lines.some(l=>t.includes(l.text.slice(0,12))),t.slice(0,300));
    await page.locator('#q').fill('교체 v11 상황 손님');await page.locator('#q').press('Enter');await page.waitForTimeout(300);
    assert(!(await page.locator('#log').innerText()).includes('서버 발행 v11'));
    await page.locator('#q').fill('');
   });
   await check(A,'③ 해당 탭이 아닐 때는 콘텐츠를 재조회하지 않음',async()=>{await tab(page,'home');await page.waitForTimeout(400);const n=S.hits.filter(h=>h.path.startsWith('/api/content/')).length;await page.waitForTimeout(2600);assert.equal(S.hits.filter(h=>h.path.startsWith('/api/content/')).length,n);});
   await check(A,'③ 탭 복귀(visibilitychange) 시 재조회',async()=>{await tab(page,'recipes');setOk(mkRecipes(12,d=>{d.appetizers[0].name='복귀 안주 v12';}),mkPhrases(12));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await waitFood(page,'복귀 안주 v12',4000);});
   await check(A,'③ 재조회 요청은 GET·no-store',()=>{const h=S.hits.filter(x=>x.path==='/api/content/recipes').at(-1);assert.equal(h.method,'GET');assert.match(h.headers['cache-control']||'',/no-cache|no-store/);});
   await context.close();
  }

  // ④ 사진 로딩 실패 시 칸 숨김, 레이아웃 시프트 없음
  {
   resetStub();setOk(mkRecipes(7),mkPhrases(7));
   const {context,page}=await open(profile);await tab(page,'recipes');await waitFood(page,REC_NAME);
   const nm=B.recipes.appetizers[BAD].name,slow=B.recipes.appetizers[SLOW].name;
   await check(A,'④ 사진 로딩 실패(404): 사진 칸이 사라지고 글은 그대로',async()=>{await fc(page,nm).locator('.food-head').click();await page.waitForFunction(n=>{const c=[...document.querySelectorAll('.food-card')].find(x=>x.dataset.food===n);return c&&!c.querySelector('.photo-box');},nm,{timeout:5000});const t=await fc(page,nm).innerText();assert(t.includes('만드는 순서'));});
   await check(A,'④ 사진 로딩 중에도 칸 높이 예약(시프트 없음): 늦게 뜨는 사진 전후 높이·다음 요소 위치 동일',async()=>{
    await fc(page,nm).locator('.food-head').click();
    await fc(page,slow).locator('.food-head').click();
    const before=await page.evaluate(n=>{const c=[...document.querySelectorAll('.food-card')].find(x=>x.dataset.food===n),b=c.querySelector('.photo-box'),i=b.querySelector('img'),next=b.nextElementSibling;return {h:b.getBoundingClientRect().height,w:b.getBoundingClientRect().width,t:next.getBoundingClientRect().top+scrollY,loaded:i.complete&&i.naturalWidth>0};},slow);
    assert.equal(before.loaded,false,'아직 로딩 중이어야 함');assert(before.h>50,'로딩 전 높이 예약');
    await page.waitForFunction(n=>{const c=[...document.querySelectorAll('.food-card')].find(x=>x.dataset.food===n),i=c.querySelector('.photo-box img');return i&&i.complete&&i.naturalWidth>0;},slow,{timeout:5000});
    const after=await page.evaluate(n=>{const c=[...document.querySelectorAll('.food-card')].find(x=>x.dataset.food===n),b=c.querySelector('.photo-box'),next=b.nextElementSibling;return {h:b.getBoundingClientRect().height,t:next.getBoundingClientRect().top+scrollY};},slow);
    assert(Math.abs(after.h-before.h)<1,'사진 칸 높이 변함 '+before.h+'→'+after.h);assert(Math.abs(after.t-before.t)<1,'아래 요소 위치 변함');
    assert(Math.abs(before.h-Math.min(280,before.w*9/16))<2,'16:9(최대 280px) 비율 예약 '+before.h+' / '+before.w);
   });
   await context.close();
  }
 }

 // ⑥ 수정 제안 전송: 성공·거절(400)·횟수 초과(429)·연결 실패·오프라인 후 다시 보내기·중복 방지
 for(const profile of ['mobile','desktop']){
  const A=profile;
  resetStub();setOk(mkRecipes(7),mkPhrases(7));
  const {context,page}=await open(profile);
  await tab(page,'recipes');await waitFood(page,REC_NAME);
  // 성공(201): 본문 필드 확인
  await openStep(page,REC_NAME,0);
  await check(A,'⑥ 폼: 대상·현재 문구가 발행본 기준, 안내 문구',async()=>{assert.equal((await page.locator('#editCurrent').innerText()).trim(),STEP_NEW);assert(/^레시피 · 치즈 플레이트 \(발행판\) · 만드는 순서 1단계/.test(await page.locator('#editTarget').innerText()));const t=await page.locator('#editDialog').innerText();assert(t.includes('직원은 제안만 가능. 매니저 확인 후 반영.')&&t.includes('실명·연락처 입력 금지'));assert.equal(await page.locator('#editTitle').innerText(),'수정 제안');});
  if(A==='mobile'){await page.screenshot({path:shot('04_수정제안폼_500')});}
  // 개인정보 형태 막기
  await check(A,'⑥ 전화번호 형태 숫자열은 저장 전에 막음(전송 없음)',async()=>{await saveWith(page,'발행 새 단계 010-1234-5678 전화');assert((await page.locator('#editError').innerText()).includes('긴 숫자열'));assert(await page.locator('#editDialog').evaluate(d=>d.open));assert.equal(S.props.length,0);});
  await page.locator('#editText').fill('');
  await saveWith(page,'제안: 접시에 치즈를 반달 모양으로 배치.',{memo:'보기 좋게',nick:'구름'});
  await page.waitForFunction(()=>document.querySelectorAll('#reqCount').length&&document.getElementById('reqCount').textContent==='1');
  await check(A,'⑥ 성공(201): 본문 kind·targetId·type·current 정확',async()=>{
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('harago-edit-requests-v1')||'[]')[0]?.st==='sent');
   assert.equal(S.props.length,1);const b=S.props[0],it=mkRecipes(7).data.appetizers[0];
   assert.deepEqual(Object.keys(b).sort(),['current','kind','nickname','proposed','reason','targetId','targetLabel','type']);
   assert.equal(b.kind,'recipes');assert.equal(b.targetId,it.id);assert.equal(b.type,'edit');assert.equal(b.current,STEP_NEW);assert.equal(b.proposed,'제안: 접시에 치즈를 반달 모양으로 배치.');assert.equal(b.reason,'보기 좋게');assert.equal(b.nickname,'구름');
   assert(b.targetLabel.includes(REC_NAME)&&b.targetLabel.includes('순서 1단계'));
  });
  await check(A,'⑥ 성공 표시: 토스트·목록 보냄 배지·다시 보내기/편집 없음·헤더 수정 제안 1',async()=>{assert(await page.locator('#sendToast').isVisible());assert((await page.locator('#sendToast').innerText()).includes('제안 보냄'));assert.equal((await page.locator('#reqGo').innerText()).replace(/\s/g,''),'수정제안1');await goReq(page);assert.equal(await stateOf(page),'보냄');assert.equal(await page.locator('.req-item').first().getByRole('button',{name:'다시 보내기'}).count(),0);assert.equal(await page.locator('.req-item').first().getByRole('button',{name:'편집'}).count(),0);assert.equal(await page.locator('#reqResend').isHidden(),true);assert.equal(await page.locator('h2:visible').first().innerText(),'내 수정 제안');});
  // 같은 내용 5초 내 재저장 무시
  await check(A,'⑥ 같은 내용 5초 안에 다시 저장하면 무시(중복 전송 없음)',async()=>{await tab(page,'recipes');await openStep(page,REC_NAME,0);await saveWith(page,'제안: 접시에 치즈를 반달 모양으로 배치.',{memo:'보기 좋게',nick:'구름'});assert((await page.locator('#editError').innerText()).includes('같은 내용을 방금 저장함'));assert.equal(S.props.length,1);await page.locator('#editCancel').click();});
  // 응대 멘트(손님 말) 제안
  await tab(page,'phrases');await page.locator('.phrase-card').first().locator('summary').click();await page.locator('.phrase-card').first().locator('.card-tools .edit-btn').click();
  await saveWith(page,'발행 멘트 수정: 어서 오세요!');
  await page.waitForTimeout(400);
  await check(A,'⑥ 응대 멘트 제안 본문',async()=>{assert.equal(S.props.length,2);const b=S.props[1],it=mkPhrases(7).data.sections[0].items[0];assert.equal(b.kind,'phrases');assert.equal(b.targetId,it.id);assert.equal(b.type,'edit');assert.equal(b.current,PH_NEW);assert(b.targetLabel.includes('손님 말 1번째 줄'));});
  // 체크리스트 제안
  await tab(page,'checklist');await page.waitForSelector('#checkContent .task-label');
  const row=page.locator('#checkContent .info-item').first(),rowText=(await row.locator('.task-label').innerText()).replace('•','').trim();
  await row.locator('.row-main').click();await row.locator('xpath=following-sibling::*[1]').locator('.edit-btn').click();
  await saveWith(page,rowText+' (제안)');await page.waitForTimeout(400);
  await check(A,'⑥ 체크리스트 제안: kind checklist·targetId·current 정확',()=>{assert.equal(S.props.length,3);const b=S.props[2];assert.equal(b.kind,'checklist');assert.equal(b.current,rowText);assert.equal(b.type,'edit');assert(/^[A-Za-z0-9_.:-]{1,64}$/.test(b.targetId)&&b.targetId.length>0,'대상 번호 '+b.targetId);const bl=extractCl();assert(bl.some(it=>it.id===b.targetId&&it.text===rowText),'대상 번호가 어드민 시작 항목 id와 일치');});
  // 400 거절
  S.prop.queue.push({status:400,body:{error:'제안 불가: 제안 문구: 금칙어 포함(도매가·희망가·급여·시급·계좌 등)',details:[{path:'proposed',reason:'제안 문구: 금칙어 포함(도매가·희망가·급여·시급·계좌 등)'}]}});
  await tab(page,'recipes');await openStep(page,REC_NAME,1);await saveWith(page,'급여 이야기 포함 단계');await page.waitForTimeout(400);
  await goReq(page);
  await check(A,'⑥ 400: 거절됨 + 서버 문구 그대로, 편집 가능·다시 보내기 없음',async()=>{const s=await stateOf(page);assert(s.startsWith('거절됨: 제안 불가: 제안 문구: 금칙어 포함'),s);assert.equal(await page.locator('.req-item').first().getByRole('button',{name:'편집'}).count(),1);assert.equal(await page.locator('.req-item').first().getByRole('button',{name:/다시 보내기/}).count(),0);});
  if(A==='mobile')await page.screenshot({path:shot('05_거절됨_500')});
  await page.locator('.req-item').first().getByRole('button',{name:'편집'}).click();await saveWith(page,'고친 두 번째 단계 문구');await page.waitForTimeout(500);
  await check(A,'⑥ 거절 후 고쳐 저장하면 다시 전송 → 보냄(같은 제안 id로 중복 안 쌓임)',async()=>{assert.equal(S.props.length,5);assert.equal(S.props[4].proposed,'고친 두 번째 단계 문구');await goReq(page);assert.equal(await stateOf(page),'보냄');assert.equal(await page.locator('.req-item').count(),4);});
  // 429 횟수 초과
  S.prop.queue.push({status:429,body:{error:'제안 횟수 초과. 3분 뒤 다시 시도',retryAfterMinutes:3}});
  await tab(page,'recipes');await openStep(page,REC_NAME,0);await saveWith(page,'429 시험 문구');await page.waitForTimeout(400);await goReq(page);
  await check(A,'⑥ 429: 횟수 초과 표시, 잠시 후 다시 보내기 버튼',async()=>{const s=await stateOf(page);assert(s.startsWith('횟수 초과')&&s.includes('3분 뒤'),s);assert.equal(await page.locator('.req-item').first().getByRole('button',{name:'잠시 후 다시 보내기'}).count(),1);assert.equal(S.props.length,6);});
  await page.locator('.req-item').first().getByRole('button',{name:'잠시 후 다시 보내기'}).click();await page.waitForTimeout(500);
  await check(A,'⑥ 429 후 다시 보내기 → 보냄, 같은 본문 재전송',async()=>{assert.equal(S.props.length,7);assert.deepEqual(S.props[6],S.props[5]);assert.equal(await stateOf(page),'보냄');});
  // 연결 실패
  const okFallback=S.prop.fallback;S.prop.fallback={drop:true}; // 브라우저가 끊긴 연결로 한 번 더 시도해도 계속 끊김
  await tab(page,'recipes');await openStep(page,REC_NAME,0);await saveWith(page,'연결 실패 시험 문구');await page.waitForTimeout(600);await goReq(page);
  await check(A,'⑥ 연결 실패: 전송 대기/실패, 로컬에 남고 다시 보내기',async()=>{const s=await stateOf(page);assert(s.startsWith('전송 대기/실패'),s);assert.equal(await page.locator('.req-item').first().getByRole('button',{name:'다시 보내기'}).count(),1);assert.equal(await page.locator('#reqResend').isVisible(),true);});
  if(A==='mobile'){await page.screenshot({path:shot('06_전송실패_재전송_500')});}
  S.prop.fallback=okFallback;
  // 더블 클릭해도 한 번만
  S.prop.delay=700;
  await check(A,'⑥ 다시 보내기 연타해도 한 번만 전송(전송 중 버튼 잠금)',async()=>{const b=page.locator('.req-item').first().getByRole('button',{name:'다시 보내기'});const n=S.props.length;await b.dblclick({delay:20}).catch(()=>{});await page.waitForTimeout(1200);assert.equal(S.props.length,n+1);assert.equal(await stateOf(page),'보냄');});
  S.prop.delay=0;
  // 5xx
  S.prop.queue.push({status:503,body:{error:'제안 저장소 오류'}});
  await tab(page,'recipes');await openStep(page,REC_NAME,1);await saveWith(page,'5xx 시험 문구');await page.waitForTimeout(500);await goReq(page);
  await check(A,'⑥ 5xx: 전송 대기/실패',async()=>{assert((await stateOf(page)).startsWith('전송 대기/실패'));});
  await page.locator('.req-item').first().getByRole('button',{name:'다시 보내기'}).click();await page.waitForTimeout(500);
  await check(A,'⑥ 5xx 후 다시 보내기 → 보냄',async()=>{assert.equal(await stateOf(page),'보냄');});
  // 오프라인
  await context.setOffline(true);
  await tab(page,'recipes');await openStep(page,REC_NAME,0);await saveWith(page,'오프라인 시험 문구');await page.waitForTimeout(600);await goReq(page);
  const nOff=S.props.length;
  await check(A,'⑥ 오프라인 저장: 로컬에 남고 전송 대기/실패',async()=>{assert((await stateOf(page)).startsWith('전송 대기/실패'));assert.equal(S.props.length,nOff);});
  await context.setOffline(false);
  await page.locator('#reqResend').click();await page.waitForTimeout(700);
  await check(A,'⑥ 온라인 복귀 후 다시 보내기 → 보냄',async()=>{assert.equal(S.props.length,nOff+1);assert.equal(await stateOf(page),'보냄');assert.equal(await page.locator('#reqResend').isHidden(),true);});
  // 새로고침 후에도 보낸 제안은 다시 보내지 않음
  const nBeforeReload=S.props.length;
  await page.reload();await page.waitForTimeout(500);await goReq(page);
  await check(A,'⑥ 새로고침 후 보낸 제안은 보냄 유지, 재전송 없음',async()=>{assert.equal(S.props.length,nBeforeReload);assert.equal(await page.locator('.req-item[data-state="sent"]').count(),await page.locator('.req-item').count());});
  // 복사 형식에 전송 상태
  await check(A,'⑥ 전체 복사 내용에 서버 전송 상태·대상 번호',async()=>{const txt=await page.evaluate(()=>exportText(requests));assert(txt.startsWith('# 근무노트 수정 제안'));assert(txt.includes('- 서버 전송: 보냄'));assert(/- 대상 번호: recipes \/ /.test(txt));assert(/- 서버 제안 번호: 0123456789abcdef/.test(txt));});
  if(A==='mobile'){await page.locator('.req-item').first().scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:shot('07_내수정제안_목록_500')});}
  await check(A,'⑨ 내 수정 제안 레이아웃',()=>layoutOk(page,'requests'));
  await context.close();
 }

 // ⑦ 서버 미연결 빌드: 로컬 저장만
 {
  resetStub();
  const {context,page}=await open('mobile',{off:true});
  const before=S.hits.length;
  await tab(page,'recipes');await openStep(page,B.recipes.appetizers[0].name,0);
  await check('서버없음','⑦ 폼 안내: 서버 연결 없음, 복사해서 전달',async()=>{const t=await page.locator('#editDialog').innerText();assert(t.includes('서버 연결 없음. 복사해서 전달.')&&t.includes('직원은 제안만 가능'));});
  await saveWith(page,'서버 없음 시험 문구');await page.waitForTimeout(400);await goReq(page);
  await check('서버없음','⑦ 로컬에만 저장·요청 0건·전송 버튼 없음',async()=>{assert.equal(S.hits.length,before);assert((await stateOf(page)).includes('이 기기에만 저장'));assert.equal(await page.locator('.req-item').first().getByRole('button',{name:/보내기/}).count(),0);assert((await page.locator('#reqIntro').innerText()).includes('서버 연결 없음. 복사해서 전달.'));assert.equal(await page.locator('#reqResend').isHidden(),true);});
  await check('서버없음','⑦ 복사·내려받기 기능 유지',async()=>{assert(await page.locator('#reqCopy').isVisible());assert(await page.locator('#reqDownload').isVisible());});
  await context.close();
 }

 // ⑧ 웹 검색 답변 마크다운 렌더(주입 시도 이스케이프)·더 보기
 for(const profile of ['mobile','desktop']){
  const A=profile;resetStub();setOk(mkRecipes(7),mkPhrases(7));
  const {context,page}=await open(profile);
  const long='**핵심 요약**\n* 리슬링은 산도가 높은 청포도 품종\n  * 들여쓴 하위 항목\n- 두 번째 항목 **굵게** 글자\n<img src=x onerror="window.__xss=1"> 이 태그는 글자로 보여야 함\n<script>window.__xss=2</script>\n[링크 글자](https://evil.example/x) 링크는 글자만\n- 여섯째 줄\n- 일곱째 줄';
  S.chat.body={text:long,searched:true,sources:[{url:'https://example.org/a',title:'출처 A'}],model:'m'};
  await page.locator('#q').fill('리슬링 포도 숙성 잠재력 설명해줘');await page.locator('#q').press('Enter');await page.waitForSelector('.web-badge');
  await check(A,'⑧ 마크다운: 목록→불릿, 굵게, 줄바꿈 유지, 별표 글자 없음',async()=>{const b=page.locator('.web-body');assert(await b.locator('ul li').count()>=5);assert(await b.locator('strong').count()>=2);assert(await b.locator('li.sub').count()===1);const t=await b.innerText();assert(!t.includes('*'),'별표가 보임: '+t);assert(t.includes('핵심 요약')&&t.includes('들여쓴 하위 항목'));});
  await check(A,'⑧ HTML 주입 시도가 글자로 이스케이프됨(img·script 요소 없음, 실행 안 됨)',async()=>{const t=await page.locator('.web-body').innerText();assert(t.includes('<img src=x onerror="window.__xss=1">')&&t.includes('<script>window.__xss=2</script>'));assert.equal(await page.locator('#log img').count(),0);assert.equal(await page.locator('#log script').count(),0);assert.equal(await page.evaluate(()=>window.__xss),undefined);});
  await check(A,'⑧ 본문 링크는 주소를 버리고 글자만, 링크는 출처 목록에서만',async()=>{assert.equal(await page.locator('.web-body a').count(),0);assert.equal(await page.locator('#log a').count(),1);assert.equal(await page.locator('#log a').getAttribute('href'),'https://example.org/a');assert(!(await page.locator('.web-body').innerText()).includes('evil.example'));});
  await check(A,'⑧ 길면 접고 더 보기로 펼침, 배지·출처 유지',async()=>{assert(await page.locator('.web-body.clamped').count()===1);const btn=page.locator('.web-more');assert.equal(await btn.innerText(),'더 보기');const h1=await page.locator('.web-body').evaluate(n=>n.getBoundingClientRect().height);if(A==='mobile')await page.screenshot({path:shot('08_웹검색_접힘_500')});await btn.click();assert.equal(await btn.innerText(),'접기');assert.equal(await page.locator('.web-body.clamped').count(),0);const h2=await page.locator('.web-body').evaluate(n=>n.getBoundingClientRect().height);assert(h2>h1+20,'펼쳐도 높이 그대로');if(A==='mobile')await page.screenshot({path:shot('09_웹검색_펼침_500')});assert((await page.locator('.web-badge').innerText()).includes('웹 검색 참고'));assert.equal(await page.locator('.web-source-list a').count(),1);await btn.click();assert.equal(await page.locator('.web-body.clamped').count(),1);});
  // 짧은 답(서버 새 프롬프트 형식)은 접지 않음
  S.chat.body={text:'- 리슬링은 청포도 품종\n- 산도가 높고 향이 풍부\n- 드라이부터 스위트까지 다양',searched:true,sources:[{url:'https://example.org/a',title:'출처 A'}],model:'m'};
  await page.waitForTimeout(5200);
  await page.locator('#q').fill('네비올로 품종 특징이 뭐야');await page.locator('#q').press('Enter');await page.waitForSelector('.web-badge');
  await check(A,'⑧ 짧은 개조식 답은 접지 않고 불릿 3개',async()=>{assert.equal(await page.locator('.web-body.clamped').count(),0);assert.equal(await page.locator('.web-more').count(),0);assert.equal(await page.locator('.web-body li').count(),3);});
  await check(A,'⑨ 웹 답변 레이아웃',()=>layoutOk(page,'search'));
  await context.close();
 }

 // ⑨ 외부 요청·오류
 await check('전체','⑨ 서버 호출은 허용 경로(/api/content/*·/api/photo/*·/api/proposals·/api/checklist·/api/chat)만, 그 밖 요청 0',()=>{assert.deepEqual([...new Set(external)],[]);assert.deepEqual(S.other,[]);});
 await check('전체','⑨ JS 오류 0(모바일·데스크톱)',()=>assert.deepEqual(errors,[]));
 await browser.close();server.close();
 const fail=rows.filter(r=>!r.ok);
 const byArea={};rows.forEach(r=>{byArea[r.area]=byArea[r.area]||{ok:0,fail:0};byArea[r.area][r.ok?'ok':'fail']++;});
 console.log(JSON.stringify({total:rows.length,failed:fail.length,byArea,shots:fs.readdirSync(shotDir).filter(f=>f.startsWith('발행콘텐츠_')).map(f=>path.join(shotDir,f))},null,1));
 if(fail.length){fail.forEach(r=>console.error('실패: ['+r.area+'] '+r.name+' :: '+r.detail));console.error('발행 콘텐츠 점검: 실패 '+fail.length+'건');process.exit(1);}
 console.log('발행 콘텐츠 점검: 통과 ('+rows.length+'건)');
})().catch(e=>{console.error(e);process.exit(1);});

function extractCl(){const cl=require('./체크리스트_추출.js'),v=JSON.parse(fs.readFileSync(path.join(__dirname,'..','근무노트.html'),'utf8').match(/var BUILTIN_CL = (\{.*\});\nvar BUILTIN_CT/)[1]);return ['open','close'].flatMap(k=>v[k].sections.flatMap(s=>s.items));}
