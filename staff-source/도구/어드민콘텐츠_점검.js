// 어드민.html 콘텐츠 편집 점검(레시피·응대 멘트·사진·제안함): 실제 Worker 코드(서버/index.js)에 메모리 D1을 붙여 서버 응답만 모의한다. (node 도구/어드민콘텐츠_점검.js)
// 비밀번호는 가짜 값, 외부 요청은 서버 모의뿐. 캡처는 HARAGO_SHOTS(기본 /private/tmp/harago-1014-shots)에 저장한다.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),{DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.HARAGO_PLAYWRIGHT||'playwright');
const root=path.join(__dirname,'..'),pageUrl='file://'+path.join(root,'어드민.html'),html=fs.readFileSync(path.join(root,'어드민.html'),'utf8');
const worker=require('../서버/index.js').default;
const extract=require('./콘텐츠_추출.js'),checklistOf=require('./체크리스트_추출.js');
const ORIGIN='https://fastkorea12-png.github.io',PW='content-test-password-not-real',SECRET='content-test-secret-not-real-0123456789';
const API=html.match(/var ADMIN_API_BASE="([^"]+)"/)[1];
const shotDir=process.env.HARAGO_SHOTS||'/private/tmp/harago-1014-shots';fs.mkdirSync(shotDir,{recursive:true});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'harago-photo-'));
assert(!/<script[^>]+src=|<link[^>]+href="https?:|@import|fonts\.googleapis/.test(html),'외부 자원 금지');
assert(!html.includes(PW));
const db=new DatabaseSync(':memory:');for(const f of ['checklist-schema.sql','shifts-schema.sql','content-schema.sql'])db.exec(fs.readFileSync(path.join(root,'서버',f),'utf8'));
const d1={prepare(sql){const st=db.prepare(sql);let a=[];const o={bind(...x){a=x.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return o;},async run(){return{meta:{changes:Number(st.run(...a).changes)}};},async first(){return st.get(...a)||null;},async all(){return{results:st.all(...a)};}};return o;}};
const env={AI_LIMITER:{async limit(){return{success:true};}},SHIFTS_DB:d1,ADMIN_PASSWORD:PW,ADMIN_TOKEN_SECRET:SECRET};
const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS'};
let ipN=0;
async function call(method,p,body,token,ip){
 const headers={Origin:ORIGIN,'content-type':'application/json','CF-Connecting-IP':ip||('3.3.3.'+(++ipN))};if(token)headers.authorization='Bearer '+token;
 const r=await worker.fetch(new Request('https://worker.test'+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);return {status:r.status,json:await r.json()};
}
const flags={abort:false,failPhoto:false},photoPosts=[],photoDeletes=[],seen=[];
async function mock(page){
 await page.route(u=>u.href.startsWith(API),async route=>{
  const req=route.request(),u=new URL(req.url());seen.push(req.method()+' '+u.pathname);
  if(flags.abort)return route.abort();
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:CORS});
  const headers={Origin:ORIGIN,'CF-Connecting-IP':'4.4.4.4'};const a=req.headers().authorization;if(a)headers.authorization=a;
  const isPhotoPost=req.method()==='POST'&&u.pathname==='/api/admin/photo';
  if(isPhotoPost){
   const buf=req.postDataBuffer();photoPosts.push({size:buf.length,type:req.headers()['content-type']});
   if(flags.failPhoto)return route.fulfill({status:500,headers:{...CORS,'content-type':'application/json'},body:JSON.stringify({error:'사진 저장 실패(시험용)'})});
   headers['content-type']=req.headers()['content-type'];
   const r=await worker.fetch(new Request(req.url(),{method:'POST',headers,body:buf}),env);return route.fulfill({status:r.status,headers:{...CORS,'content-type':'application/json'},body:await r.text()});
  }
  if(req.method()==='DELETE')photoDeletes.push(u.pathname);
  headers['content-type']='application/json';
  const r=await worker.fetch(new Request(req.url(),{method:req.method(),headers,body:req.postData()||undefined}),env);
  const ct=r.headers.get('content-type')||'';
  if(/^image\//.test(ct))return route.fulfill({status:r.status,headers:{...CORS,'content-type':ct},body:Buffer.from(await r.arrayBuffer())});
  route.fulfill({status:r.status,headers:{...CORS,'content-type':'application/json'},body:await r.text()});
 });
}
const ex=extract(),cl=checklistOf((()=>{const vm=require('vm'),c={};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'근무노트.html'),'utf8').match(/<script>([\s\S]*)<\/script>/)[1],c);return c.KB;})());
(async()=>{
 const browser=await chromium.launch(process.env.HARAGO_PLAYWRIGHT?{channel:'chrome',headless:true}:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const shots=[],log=[];const ok=m=>log.push(m);
 try{
  const ctx=await browser.newContext({viewport:{width:500,height:900},timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
  page.on('request',r=>{const u=r.url();if(/^https?:/.test(u)&&!u.startsWith(API))external.push(u);});
  await mock(page);
  const shot=async name=>{const f=path.join(shotDir,'admin_'+name+'.png');await page.screenshot({path:f,fullPage:false});shots.push(f);};
  const yOf=sel=>page.evaluate(s=>{const e=document.querySelector(s);return e?Math.round(e.getBoundingClientRect().top*10)/10:null;},sel);
  const center=async sel=>{await page.evaluate(s=>{const e=document.querySelector(s);if(!e)return;const r=e.getBoundingClientRect();if(r.top<120||r.bottom>window.innerHeight-120)window.scrollBy(0,r.top-300);},sel);await page.waitForTimeout(60);};
  const stable=async(name,sel,action,limit=2)=>{await center(sel);const a=await yOf(sel);await action();await page.waitForTimeout(80);const b=await yOf(sel);assert(a!=null&&b!=null&&Math.abs(b-a)<=limit,'흔들림 '+name+' '+a+' → '+b);ok('안정 '+name+' dy='+(b-a));};
  const noOverflow=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'가로 넘침 '+name);};
  const smallText=async name=>{const small=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.offsetParent&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<16&&!e.closest('script,style')).map(e=>e.tagName+':'+e.textContent.trim().slice(0,20)));assert.deepEqual(small,[],'16px 미만 '+name);};
  const check=async name=>{await noOverflow(name);await smallText(name);};
  const notice=()=>page.textContent('.msg');
  // ---- 제안 시드(직원 쪽 공개 API 사용)
  const A=ex.recipes.appetizers,PH=ex.phrases.sections[0].items[0],CLI=cl.open.sections[0].items[0];
  const seed=async b=>{const r=await call('POST','/api/proposals',b);assert.equal(r.status,201,JSON.stringify(r.json));return r.json.id;};
  const pA=await seed({kind:'recipes',targetId:A[0].id,targetLabel:'레시피 · 치즈 플레이트 · 만드는 순서 1단계',type:'edit',current:A[0].steps[0],proposed:'제안 단계 문구 시험.',reason:'현장 순서와 다름',nickname:'하늘'});
  const pB=await seed({kind:'recipes',targetId:A[1].id,targetLabel:'레시피 · 버터보드 · 마무리',type:'edit',current:A[1].garnish||A[1].steps[0],proposed:'제안 마무리 문구 시험.',reason:'',nickname:'바다'});
  const pC=await seed({kind:'phrases',targetId:PH.id,targetLabel:'응대 멘트 · '+PH.situation,type:'edit',current:PH.lines[0].text,proposed:'어서 오세요, 편하게 앉으세요.',reason:'더 자연스러움',nickname:'구름'});
  const pD=await seed({kind:'checklist',targetId:CLI.id,targetLabel:'오픈 · '+CLI.text,type:'edit',current:CLI.text,proposed:'제안 반영 시험 문구',reason:'문구 정리',nickname:'별'});
  const pE=await seed({kind:'recipes',targetId:'zzzzzzzz',targetLabel:'레시피 · 사라진 항목',type:'edit',current:'없는 문구',proposed:'아무 문구',nickname:'달'});
  const pF=await seed({kind:'recipes',targetId:A[2].id,targetLabel:'레시피 · '+A[2].name,type:'delete',nickname:'해'});
  const pG=await seed({kind:'recipes',targetId:'',targetLabel:'레시피 · 새 안주',type:'add',proposed:'새 안주 제안 이름',nickname:'숲'});
  // ---- 로그인
  await page.goto(pageUrl);await page.waitForSelector('#loginGo');
  await page.fill('#pw',PW);await page.fill('#nick','점장');await page.click('#loginGo');await page.waitForSelector('#saveBtn');
  await page.waitForFunction(()=>{const b=document.getElementById('propBadge');return b&&!b.hidden&&b.textContent==='7';},null,{timeout:5000});
  assert.deepEqual(await page.locator('.tabs.top button').allInnerTexts().then(a=>a.map(t=>t.replace(/\s*\d+$/,'').trim())),['체크리스트','레시피','응대 멘트','제안함','제출 현황','재고 조사','신입 교육']);
  await check('체크리스트 첫 화면');await shot('0_상단탭_500');
  // ======== 레시피 ========
  await page.click('#navRecipes');await page.waitForSelector('[data-item]');
  assert.equal(await page.locator('[data-item]').count(),ex.recipes.appetizers.length);
  assert.match(await page.textContent('main'),/서버 발행본 없음/);
  const firstName=await page.locator('[data-item]').first().locator('.rname').innerText();assert.equal(firstName,A[0].name);
  assert.match(await page.locator('[data-item]').first().locator('.rsum').innerText(),/준비물 \d+ · 순서 \d+/);
  await check('레시피 목록');await shot('1_레시피목록_500');
  await page.click('[data-rsec="cocktails"]');assert.equal(await page.locator('[data-item]').count(),11);
  assert.equal(await page.locator('[data-item] .tag',{hasText:'후보'}).count(),7);
  await page.click('[data-rsec="others"]');assert.equal(await page.locator('[data-item]').count(),6);assert.equal(await page.locator('[data-item] .tag',{hasText:'논알코올'}).count(),0);
  await check('기타 음료 목록');
  await page.click('[data-rsec="appetizers"]');
  // 항목 상세
  await page.locator('[data-item="'+A[0].id+'"] [data-f="open"]').click();await page.waitForSelector('[data-detail]');
  assert.equal(await page.inputValue('[data-field="name"]'),A[0].name);
  assert.equal(await page.locator('[data-list="steps"] [data-line]').count(),A[0].steps.length);
  await check('레시피 상세');await shot('2_레시피상세_500');
  const S0='[data-list="steps"] [data-line="steps.0"] textarea';
  await stable('레시피 입력창 탭',S0,async()=>{await page.locator(S0).click();});
  const text0=await page.inputValue(S0);
  await stable('레시피 글자 입력',S0,async()=>{await page.locator(S0).fill('');for(const ch of '수정한 첫 단계 문장 입력 시험 문구.')await page.keyboard.type(ch);});
  assert.match(await page.textContent('#cChg'),/변경 1건/);
  await page.locator('body').click({position:{x:2,y:2}});
  // 줄 추가·이동·삭제
  const n0=await page.locator('[data-list="steps"] [data-line]').count();
  await stable('만드는 순서 줄 추가(추가 버튼)','[data-list="steps"] [data-f="addline"]',async()=>{await page.click('[data-list="steps"] [data-f="addline"]');});
  assert.equal(await page.locator('[data-list="steps"] [data-line]').count(),n0+1);
  await page.locator('[data-list="steps"] [data-line="steps.'+n0+'"] textarea').fill('추가한 마지막 단계.');
  assert.equal(await page.evaluate(()=>document.activeElement.tagName),'TEXTAREA');
  // 아래 줄을 위로: 이동한 줄이 같은 화면 위치(y)에 머물고 버튼 포커스 유지
  const L1='[data-list="steps"] [data-line="steps.1"]';
  await page.locator(L1).scrollIntoViewIfNeeded();
  {const t0=await yOf(L1),txt=await page.inputValue(L1+' textarea');await page.click(L1+' [data-f="down"]');await page.waitForTimeout(80);const L2='[data-list="steps"] [data-line="steps.2"]';assert.equal(await page.inputValue(L2+' textarea'),txt);const t1=await yOf(L2);const atEnd=await page.evaluate(()=>window.scrollY>=document.documentElement.scrollHeight-window.innerHeight-1);assert(Math.abs(t1-t0)<=2||atEnd,'줄 이동 y '+t0+' → '+t1);/* 페이지 맨 아래에서는 더 내려갈 수 없어 위치가 밀릴 수 있다 */assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-f')),'down');ok('줄 이동 y '+(t1-t0));
   await page.click(L2+' [data-f="up"]');await page.waitForTimeout(50);assert.equal(await page.inputValue(L1+' textarea'),txt);}
  await stable('줄 삭제(목록 위치)','[data-list="steps"]',async()=>{await page.click('[data-list="steps"] [data-line="steps.'+n0+'"] [data-f="del"]');});
  assert.equal(await page.locator('[data-list="steps"] [data-line]').count(),n0);
  // 재료 줄 삭제·추가
  const i0=await page.locator('[data-list="ingredients"] [data-line]').count();
  await page.click('[data-list="ingredients"] [data-f="addline"]');await page.locator('[data-list="ingredients"] [data-line]').last().locator('textarea').fill('견과류 한 줌');
  assert.equal(await page.locator('[data-list="ingredients"] [data-line]').count(),i0+1);
  // 확인 토글
  await stable('[확인] 토글','#cf',async()=>{await page.click('#cf');});
  await page.waitForSelector('[data-field="confirmNote"]');await page.fill('[data-field="confirmNote"]','가격 확인 필요');
  await page.fill('[data-field="note"]','메모 시험');
  // 변경 배지는 목록에서
  assert.match(await page.textContent('#cChg'),/변경 1건/);
  // ---- 사진: 큰 이미지 -> 800px·약 150KB JPEG
  const mkImage=async(kind)=>page.evaluate(async k=>{
   const w=k==='jpeg'?2400:1200,h=k==='jpeg'?1800:900,c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
   if(k==='jpeg'){const g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,'#d9a066');g.addColorStop(1,'#5a3a22');x.fillStyle=g;x.fillRect(0,0,w,h);for(let i=0;i<900;i++){x.fillStyle='hsl('+(i*37%360)+',55%,'+(30+i%40)+'%)';x.beginPath();x.arc((i*97)%w,(i*61)%h,20+(i%60),0,7);x.fill();}
    const id=x.getImageData(0,0,w,h);for(let i=0;i<id.data.length;i+=4){const n=(Math.random()-.5)*14;id.data[i]+=n;id.data[i+1]+=n;id.data[i+2]+=n;}x.putImageData(id,0,0);}
   else{x.clearRect(0,0,w,h);x.fillStyle='rgba(141,36,28,0.9)';x.beginPath();x.arc(w/2,h/2,300,0,7);x.fill();}
   return c.toDataURL(k==='jpeg'?'image/jpeg':'image/png',0.95).split(',')[1];
  },kind);
  const jf=path.join(tmp,'큰사진.jpg'),pf=path.join(tmp,'투명.png');
  fs.writeFileSync(jf,Buffer.from(await mkImage('jpeg'),'base64'));fs.writeFileSync(pf,Buffer.from(await mkImage('png'),'base64'));
  assert(fs.statSync(jf).size>300*1024,'원본은 300KB 초과여야 함 '+fs.statSync(jf).size);
  assert.equal(await page.getAttribute('#photoInput','accept'),'image/*');assert.equal(await page.getAttribute('#photoCam','capture'),'environment');assert.equal(await page.getAttribute('#photoCam','accept'),'image/*');
  await page.setInputFiles('#photoInput',jf);await page.waitForSelector('img.pimg');
  await page.waitForFunction(()=>{const i=document.querySelector('img.pimg');return i&&i.complete&&i.naturalWidth>0;},null,{timeout:8000});
  assert.equal(photoPosts.length,1);assert.equal(photoPosts[0].type,'image/jpeg');assert(photoPosts[0].size<=160*1024,'JPEG 약 150KB 이하 '+photoPosts[0].size);assert(photoPosts[0].size>1000);
  const dims=await page.evaluate(()=>{const i=document.querySelector('img.pimg');return {w:i.naturalWidth,h:i.naturalHeight};});assert(dims.w<=800&&dims.w>=600,'가로 800 이하 '+dims.w);assert.equal(Math.round(dims.w/dims.h*100),Math.round(2400/1800*100));
  assert.match(await page.textContent('#photoBox'),/발행 전 초안 사진/);
  ok('사진 축소 결과 '+Math.round(photoPosts[0].size/1024)+'KB '+dims.w+'x'+dims.h+' JPEG (원본 '+Math.round(fs.statSync(jf).size/1024)+'KB 2400x1800)');
  const firstPhoto=(await page.evaluate(()=>document.querySelector('img.pimg').getAttribute('src'))).split('/').pop();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM photos').get().n,1);
  await check('사진 올린 뒤 상세');await page.locator('#photoBox').scrollIntoViewIfNeeded();await shot('3_레시피사진_500');
  // 교체: 투명 PNG는 PNG 유지, 이전 초안 사진은 서버에서 지움
  await page.setInputFiles('#photoInput',pf);await page.waitForFunction(n=>{const i=document.querySelector('img.pimg');return i&&i.complete&&i.naturalWidth>0&&!i.src.endsWith(n);},firstPhoto,{timeout:8000});
  assert.equal(photoPosts.length,2);assert.equal(photoPosts[1].type,'image/png');assert(photoPosts[1].size<=300*1024);
  assert.equal((await page.evaluate(()=>document.querySelector('img.pimg').naturalWidth))<=800,true);
  assert.equal(photoDeletes.filter(p=>p.endsWith(firstPhoto)).length,1,'교체 전 초안 사진 삭제 요청');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM photos').get().n,1);
  // 삭제
  await page.click('#photoDel');assert.equal(await page.locator('img.pimg').count(),0);assert.match(await page.textContent('#photoBox'),/사진 없음/);
  // 업로드 실패 표시
  flags.failPhoto=true;await page.setInputFiles('#photoInput',jf);await page.waitForSelector('#photoMsg');assert.match(await page.textContent('#photoMsg'),/올리기 실패.*사진 저장 실패/);assert.equal(await page.locator('img.pimg').count(),0);flags.failPhoto=false;
  await shot('3b_사진실패_500');
  // 이미지 아닌 파일 거부
  fs.writeFileSync(path.join(tmp,'a.txt'),'text');await page.setInputFiles('#photoInput',{name:'a.jpg',mimeType:'text/plain',buffer:Buffer.from('not an image')});await page.waitForSelector('#photoMsg');assert.match(await page.textContent('#photoMsg'),/이미지 파일만|올리기 실패/);
  await page.setInputFiles('#photoInput',pf);await page.waitForSelector('img.pimg');await page.waitForFunction(()=>{const i=document.querySelector('img.pimg');return i&&i.complete&&i.naturalWidth>0;});
  const pubPhoto=(await page.evaluate(()=>document.querySelector('img.pimg').getAttribute('src'))).split('/').pop();
  // ---- 목록으로: 변경 배지, 저장 요약
  await page.click('#cBack');await page.waitForSelector('[data-item]');
  assert.match(await page.locator('[data-item="'+A[0].id+'"] [data-badges],[data-item="'+A[0].id+'"] .badge').first().innerText(),/수정/);
  assert.match(await page.textContent('#cChg'),/변경 1건/);
  assert.equal(await page.locator('[data-item="'+A[0].id+'"] .tag',{hasText:'사진'}).count(),1);
  // 삭제 되돌리기 / 추가 / 이동
  await stable('항목 삭제(행 위치)','[data-item="'+A[3].id+'"]',async()=>{await page.click('[data-item="'+A[3].id+'"] [data-f="del"]');});
  assert.match(await page.textContent('[data-item="'+A[3].id+'"]'),/삭제/);
  await stable('항목 삭제 되돌리기(행 위치)','[data-item="'+A[3].id+'"]',async()=>{await page.click('[data-item="'+A[3].id+'"] [data-f="del"]');});
  await stable('항목 ▼ 이동(행 위치)','[data-item="'+A[4].id+'"]',async()=>{await page.click('[data-item="'+A[4].id+'"] [data-f="down"]');});
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-f')),'down');
  await page.click('[data-item="'+A[4].id+'"] [data-f="up"]');
  assert.match(await page.textContent('#cChg'),/변경 1건/,'이동 되돌리면 변경 없음');
  await page.click('[data-cadd="appetizers"]');await page.waitForSelector('[data-detail]');
  await page.fill('[data-field="name"]','새 안주 시험');await page.click('[data-list="steps"] [data-f="addline"]');await page.locator('[data-list="steps"] textarea').first().fill('접시에 올리기.');
  await page.click('#cBack');
  assert.match(await page.textContent('#cChg'),/변경 2건/);
  // 모두 되돌리기 2단계
  await page.click('#cReset');assert.match(await page.textContent('.bar'),/모두 되돌릴지 확인/);await page.click('text=아니오');assert.match(await page.textContent('#cChg'),/변경 2건/);
  // 저장 요약: 이전 -> 새 비교
  await page.click('#cSave');await page.waitForSelector('#cSaveGo');
  const dtext=await page.textContent('#dlg');
  assert.match(dtext,/변경 요약 확인/);assert.match(dtext,/수정 1건/);assert.match(dtext,/추가 1건/);assert.match(dtext,/순서 1: .*→ 수정한 첫 단계/);assert.match(dtext,/\[확인\]: 끔 → 켬/);assert.match(dtext,/확인 문구: \(없음\) → 가격 확인 필요/);assert.match(dtext,/사진: 없음 → 있음/);assert.match(dtext,/새 안주 시험/);
  await check('발행 요약 창');await shot('4_발행요약_500');
  await page.fill('#cSaveNote','레시피 시험 발행');await page.click('#cSaveGo');await page.waitForSelector('.msg.ok');
  assert.match(await notice(),/발행 완료 · 레시피 버전 1/);assert.match(await page.textContent('#cChg'),/변경 0건/);
  let srv=(await call('GET','/api/content/recipes')).json;assert.equal(srv.version,1);assert.equal(srv.data.appetizers.length,ex.recipes.appetizers.length+1);assert.equal(srv.data.appetizers[0].photoId,pubPhoto);assert.equal(srv.data.appetizers[0].steps[0],'수정한 첫 단계 문장 입력 시험 문구.');assert.equal(srv.data.appetizers[0].confirm,true);assert.equal(srv.data.appetizers[0].confirmNote,'가격 확인 필요');
  assert.equal((await fetch0(srv.data.appetizers[0].photoId)).status,200);
  async function fetch0(id){const r=await worker.fetch(new Request('https://worker.test/api/photo/'+id,{headers:{}}),env);return r;}
  // ---- 제안함 반영: 제안 A·B를 레시피 편집에 미리 채움
  await page.click('#navProps');await page.waitForSelector('[data-prop]');
  assert.equal(await page.locator('[data-prop]').count(),7);
  assert.match(await page.textContent('[data-prop="'+pA+'"]'),/레시피/);assert.match(await page.textContent('[data-prop="'+pA+'"]'),/제안 단계 문구 시험\./);assert.match(await page.textContent('[data-prop="'+pA+'"]'),/하늘/);assert.match(await page.textContent('[data-prop="'+pA+'"]'),/현장 순서와 다름/);
  assert.match(await page.textContent('[data-prop="'+pC+'"]'),/멘트/);assert.match(await page.textContent('[data-prop="'+pD+'"]'),/체크리스트/);
  await check('제안함 목록');await shot('5_제안함목록_500');
  // 현재 문구가 바뀌었으므로(1단계 수정) A는 입력칸을 못 찾음 -> 안내. B로 미리 채움 확인
  await page.click('[data-apply="'+pB+'"]');await page.waitForSelector('[data-detail]');
  assert.equal(await page.locator('#navRecipes').getAttribute('aria-pressed'),'true');
  assert.equal(await page.inputValue('[data-field="name"]'),A[1].name);
  const preVal=await page.locator('textarea.pre').inputValue();assert.equal(preVal,'제안 마무리 문구 시험.'.length?preVal:'' );
  assert(/제안 마무리 문구 시험\./.test(preVal),'제안 문구가 입력칸에 미리 채워짐: '+preVal);
  assert.match(await page.textContent('[data-applying="'+pB+'"]'),/제안 반영 중 · 바다/);assert.match(await page.textContent('#applyInfo'),/제안 1건 반영 중/);
  assert.match(await page.textContent('#cChg'),/변경 1건/);
  await check('제안 반영 상세');await shot('6_제안반영_미리채움_500');await page.evaluate(()=>window.scrollTo(0,0));await shot('6a_제안반영_안내_500');
  // A: 현재 문구와 같은 칸이 없을 때는 안내 + 제안 문구 표시
  await page.click('#navProps');await page.waitForSelector('[data-prop]');await page.click('[data-apply="'+pA+'"]');await page.waitForSelector('[data-detail]');
  assert.match(await page.textContent('[data-applying="'+pA+'"]'),/현재 문구와 같은 입력칸을 찾지 못함/);assert.match(await page.textContent('#applyInfo'),/제안 2건 반영 중/);
  // 사용자가 직접 A 항목 첫 단계를 제안 문구로 입력
  await page.fill('[data-list="steps"] [data-line="steps.0"] textarea','제안 단계 문구 시험.');
  // 삭제 제안 F, 추가 제안 G, 대상 없음 E
  await page.click('#navProps');await page.waitForSelector('[data-prop]');await page.click('[data-apply="'+pF+'"]');await page.waitForSelector('[data-item]');
  assert.match(await page.textContent('[data-item="'+A[2].id+'"]'),/삭제/);
  await page.click('#navProps');await page.waitForSelector('[data-prop]');await page.click('[data-apply="'+pG+'"]');await page.waitForSelector('[data-detail]');
  assert.equal(await page.inputValue('[data-field="name"]'),'새 안주 제안 이름');await page.click('[data-list="steps"] [data-f="addline"]');await page.locator('[data-list="steps"] textarea').first().fill('제안한 안주 만드는 순서.');
  await page.click('#navProps');await page.waitForSelector('[data-prop]');await page.click('[data-apply="'+pE+'"]');await page.waitForSelector('.msg.warn');
  assert.match(await notice(),/대상 항목을 찾지 못함\. 수동 반영/);
  await shot('6b_대상없음_500');
  // 발행 -> 제안 A,B,F,G 자동 applied (E는 반영 중 아님)
  await page.click('#navRecipes');await page.waitForSelector('#cSave');
  const regs=Object.keys(await page.evaluate(()=>C.recipes.apply));
  assert.deepEqual(regs.sort(),[pA,pB,pF,pG].sort());
  await page.evaluate(()=>{C.recipes.open=null;});await page.click('#cSave');await page.waitForSelector('#cSaveGo');
  assert.match(await page.textContent('#dlg'),/제안 4건 반영 완료 처리/);
  await page.click('#cSaveGo');await page.waitForSelector('.msg.ok');assert.match(await notice(),/레시피 버전 2.*제안 4건 반영 완료/);
  srv=(await call('GET','/api/content/recipes')).json;assert.equal(srv.version,2);assert(!srv.data.appetizers.some(a=>a.id===A[2].id),'삭제 제안 반영');assert(srv.data.appetizers.some(a=>a.name==='새 안주 제안 이름'));
  let list=(await call('GET','/api/admin/proposals?status=applied',undefined,(await call('POST','/api/admin/login',{password:PW})).json.token)).json;
  const tok=(await call('POST','/api/admin/login',{password:PW})).json.token;
  list=(await call('GET','/api/admin/proposals?status=all',undefined,tok)).json;
  const st=id=>list.proposals.find(p=>p.id===id);
  for(const id of [pA,pB,pF,pG]){assert.equal(st(id).status,'applied',id);assert.equal(st(id).appliedVersion,2);assert.equal(st(id).decidedBy,'점장');}
  for(const id of [pC,pD,pE])assert.equal(st(id).status,'pending');
  await page.waitForFunction(()=>document.getElementById('propBadge')&&document.getElementById('propBadge').textContent==='3',null,{timeout:5000});
  ok('제안 4건 발행과 함께 applied, 배지 3');
  // ---- 반려 / 되돌리기
  await page.click('#navProps');await page.waitForSelector('[data-prop]');assert.equal(await page.locator('[data-prop]').count(),3);
  await page.click('[data-reject="'+pE+'"]');await page.fill('#rejReason','대상 항목이 없어 반려');await shot('7_반려사유_500');await page.click('[data-reject-go="'+pE+'"]');
  await page.waitForFunction(()=>document.querySelectorAll('[data-prop]').length===2);
  await page.click('[data-pf="rejected"]');await page.waitForSelector('[data-prop="'+pE+'"]');assert.match(await page.textContent('[data-prop="'+pE+'"]'),/반려됨 · 사유: 대상 항목이 없어 반려/);
  await page.click('[data-revert="'+pE+'"]');await page.waitForFunction(()=>!document.querySelector('[data-prop]'));
  await page.click('[data-pf="pending"]');await page.waitForSelector('[data-prop="'+pE+'"]');assert.equal(await page.locator('[data-prop]').count(),3);
  await page.click('[data-pf="applied"]');await page.waitForSelector('[data-prop="'+pA+'"]');assert.match(await page.textContent('[data-prop="'+pA+'"]'),/반영됨 · v2/);
  await page.click('[data-revert="'+pA+'"]');await page.waitForFunction(()=>!document.querySelector('[data-prop="'+'x'+'"]')&&document.querySelectorAll('[data-prop]').length===3);
  await page.click('[data-revert="'+pB+'"]');await page.click('[data-revert="'+pF+'"]');await page.click('[data-revert="'+pG+'"]');await page.waitForFunction(()=>!document.querySelector('[data-prop]'));
  // ======== 응대 멘트 ========
  await page.click('#navPhrases');await page.waitForSelector('[data-item]');
  assert.equal(await page.locator('[data-item]').count(),50);assert.equal(await page.locator('[data-group]').count(),7);
  assert.doesNotMatch(await page.textContent('main'),/null|undefined/);await check('멘트 목록');await shot('8_멘트목록_500');
  await page.locator('[data-item="'+PH.id+'"] [data-f="open"]').click();await page.waitForSelector('[data-detail]');
  assert.equal(await page.locator('[data-line]').count(),PH.lines.length);
  assert.match(await page.textContent('[data-list="lines"]'),/손님 발화: 손님께 직접 하는 말\(구어체\)\. 직원 안내: 직원이 보는 안내\(개조식\)/);
  assert.equal(await page.locator('[data-line="lines.0"] .tag',{hasText:'구어체'}).count(),1);
  const ML='[data-line="lines.0"] textarea';
  await stable('멘트 글자 입력',ML,async()=>{await page.locator(ML).fill('');for(const ch of '어서 오세요, 몇 분이세요?')await page.keyboard.type(ch);});
  await page.locator('body').click({position:{x:2,y:2}});
  await stable('멘트 직원 안내 줄 추가','[data-list="lines"] [data-f="adds"]',async()=>{await page.click('[data-list="lines"] [data-f="adds"]');});
  const li=PH.lines.length;
  await page.locator('[data-line="lines.'+li+'"] textarea').fill('금·토 3번 6번 테이블 3인 이상 안내');
  assert.equal(await page.locator('[data-line="lines.'+li+'"] .tag',{hasText:'개조식'}).count(),1);assert.equal(await page.getAttribute('[data-line="lines.'+li+'"] [data-lkind="staff"]','aria-pressed'),'true');
  await stable('멘트 종류 토글','[data-line="lines.'+li+'"]',async()=>{await page.click('[data-line="lines.'+li+'"] [data-lkind="customer"]');});
  assert.equal(await page.locator('[data-line="lines.'+li+'"] .tag',{hasText:'구어체'}).count(),1);await page.click('[data-line="lines.'+li+'"] [data-lkind="staff"]');
  {const sel='[data-line="lines.'+li+'"]';await center(sel);const t0=await yOf(sel),txt=await page.inputValue(sel+' textarea');await page.click(sel+' [data-f="up"]');await page.waitForTimeout(80);const nsel='[data-line="lines.'+(li-1)+'"]';assert.equal(await page.inputValue(nsel+' textarea'),txt);const t1=await yOf(nsel);assert(Math.abs(t1-t0)<=2,'멘트 줄 이동 y '+t0+' → '+t1);assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-f')),'up');ok('멘트 줄 이동 y '+(t1-t0));}
  await page.click('[data-line="lines.'+(li-1)+'"] [data-f="down"]');
  await check('멘트 편집');await shot('9_멘트편집_500');
  await page.click('#cf');await page.fill('[data-field="confirmNote"]','문구 확인 필요');
  await page.click('#cBack');
  await page.click('[data-item="'+ex.phrases.sections[0].items[1].id+'"] [data-f="down"]');
  await page.click('#cSave');await page.waitForSelector('#cSaveGo');assert.match(await page.textContent('#dlg'),/줄 1: .*→ \[손님 발화\] 어서 오세요, 몇 분이세요\?/);assert.match(await page.textContent('#dlg'),/줄 \d+ 추가: \[직원 안내\]/);assert.match(await page.textContent('#dlg'),/이동 1건/);
  await page.click('#cSaveGo');await page.waitForSelector('.msg.ok');assert.match(await notice(),/응대 멘트 버전 1/);
  srv=(await call('GET','/api/content/phrases')).json;assert.equal(srv.version,1);assert.equal(srv.data.sections[0].items[0].lines[0].text,'어서 오세요, 몇 분이세요?');assert.equal(srv.data.sections[0].items.at(-1).lines.at(-1)?.kind||srv.data.sections[0].items[0].lines.at(-1).kind,'staff');assert.equal(srv.data.sections[0].items[0].confirm,true);
  // 제안 C 반영(멘트): 현재 문구가 바뀌어 못 찾음 -> 수동. 제안 대기로 되돌린 뒤 새 제안으로 확인
  const pC2=await seed({kind:'phrases',targetId:PH.id,targetLabel:'응대 멘트 · '+PH.situation,type:'edit',current:'어서 오세요, 몇 분이세요?',proposed:'어서 오세요! 몇 분이세요?',nickname:'비'});
  await page.click('#navProps');await page.click('[data-pf="pending"]');await page.waitForSelector('[data-apply="'+pC2+'"]');await page.click('[data-apply="'+pC2+'"]');await page.waitForSelector('[data-detail]');
  assert.equal(await page.locator('textarea.pre').inputValue(),'어서 오세요! 몇 분이세요?');
  await page.click('#cBack');await page.click('#cSave');await page.click('#cSaveGo');await page.waitForSelector('.msg.ok');assert.match(await notice(),/응대 멘트 버전 2.*제안 1건 반영 완료/);
  // ======== 체크리스트 제안 반영 ========
  await page.click('#navProps');await page.click('[data-pf="pending"]');await page.waitForSelector('[data-apply="'+pD+'"]');await page.click('[data-apply="'+pD+'"]');await page.waitForSelector('[data-row]');
  assert.equal(await page.locator('#navCl').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-row="'+CLI.id+'"] textarea').inputValue(),'제안 반영 시험 문구');assert.equal(await page.locator('[data-row="'+CLI.id+'"].pre').count(),1);
  assert.match(await page.textContent('#applyInfo'),/제안 1건 반영 중/);await shot('10_체크리스트제안반영_500');
  await page.click('#saveBtn');await page.click('#saveGo');await page.waitForSelector('.msg.ok');assert.match(await notice(),/발행 완료 · 버전 1.*제안 1건 반영 완료/);
  await page.waitForFunction(()=>document.getElementById('propBadge')&&document.getElementById('propBadge').textContent==='6',null,{timeout:5000});
  list=(await call('GET','/api/admin/proposals?status=applied',undefined,tok)).json;assert.equal(list.proposals.find(p=>p.id===pD).appliedVersion,1);
  // ======== 오류 표시: 400(해당 항목에), 409, 복원 ========
  await page.click('#navRecipes');await page.waitForSelector('[data-item]');
  await page.locator('[data-item="'+A[0].id+'"] [data-f="open"]').click();await page.waitForSelector('[data-detail]');
  await page.fill('[data-field="note"]','급여 정산 메모');
  await page.click('#cBack');await page.click('#cSave');await page.click('#cSaveGo');await page.waitForSelector('.msg.err');
  assert.match(await notice(),/서버 검증 실패/);await page.waitForSelector('[data-detail] .rerr');
  assert.match(await page.textContent('[data-detail] .rerr'),/금칙어 포함/);assert.equal(await page.locator('[data-field="note"].bad').count(),1);
  await check('400 오류 상세');await page.locator('[data-detail] .rerr').first().scrollIntoViewIfNeeded();await shot('11_오류400_500');
  await page.fill('[data-field="note"]','메모 정상 문구');
  // 409: 다른 매니저가 먼저 저장
  {const cur=(await call('GET','/api/admin/content/recipes',undefined,tok)).json;const other=JSON.parse(JSON.stringify(cur.current.data));other.appetizers[5].note='다른 매니저 메모';
   const r=await call('PUT','/api/admin/content/recipes',{data:other,baseVersion:cur.current.version,nickname:'부점장'},tok);assert.equal(r.status,200,JSON.stringify(r.json));}
  await page.click('#cBack');await page.click('#cSave');await page.click('#cSaveGo');await page.waitForSelector('#cTakeLatest');
  assert.match(await page.textContent('#dlg'),/저장 충돌/);assert.match(await page.textContent('#dlg'),/부점장/);await shot('12_충돌409_500');
  await page.click('#cKeepMine');assert.match(await notice(),/최신본 v3 기준/);
  await page.click('#cSave');await page.click('#cSaveGo');await page.waitForSelector('.msg.ok');assert.match(await notice(),/레시피 버전 4/);
  // 복원: v1로 -> v5 (사진은 v1 발행본이 쓰는 사진, 이후 삭제됐는지)
  await page.click('#cTabVer');await page.waitForSelector('[data-version="1"]');assert.equal(await page.locator('[data-version]').count(),4);assert.match(await page.textContent('[data-version="4"]'),/현재 버전/);
  await page.click('[data-restore="1"]');assert.match(await page.textContent('[data-version="1"]'),/복원할지 확인/);await page.click('[data-restore-yes="1"]');await page.waitForSelector('.msg.ok');
  assert.match(await notice(),/복원 완료 · v1 → 새 버전 v5/);
  srv=(await call('GET','/api/content/recipes')).json;assert.equal(srv.version,5);assert.equal(srv.data.appetizers.length,ex.recipes.appetizers.length+1);
  await check('버전 기록');
  // ======== 필드 단위 삭제 제안: 한 줄/필드만 비우고 항목은 유지, 필수 필드는 경고, 항목 통삭제는 기존대로 ========
  {
   const cur=(await call('GET','/api/content/recipes')).json.data,X=cur.appetizers.find(a=>a.steps.length>=2),nSteps=X.steps.length,nItems=cur.appetizers.length;
   const pFd=await seed({kind:'recipes',targetId:X.id,targetLabel:'레시피 · '+X.name+' · 만드는 순서 2단계',type:'delete',current:X.steps[1],nickname:'강'});
   await page.click('#navProps');await page.click('[data-pf="pending"]');await page.waitForSelector('[data-apply="'+pFd+'"]');await page.click('[data-apply="'+pFd+'"]');await page.waitForSelector('[data-detail]');
   assert.equal(await page.locator('[data-list="steps"] [data-line]').count(),nSteps-1,'해당 순서 줄만 삭제');
   assert.equal(await page.inputValue('[data-field="name"]'),X.name,'항목 이름 유지');
   assert.match(await notice(),/만 비움\. 항목은 그대로/);
   assert.match(await page.textContent('#cChg'),/변경 1건/);
   await page.click('#cBack');assert.equal(await page.locator('[data-item]').count(),nItems,'항목 수 유지');assert.equal(await page.locator('[data-item="'+X.id+'"].del').count(),0,'항목 삭제 표시 없음');
   // 필수 필드(이름) 삭제 제안: 거절·경고, 항목 유지
   const pReq=await seed({kind:'recipes',targetId:X.id,targetLabel:'레시피 · '+X.name+' · 이름',type:'delete',current:X.name,nickname:'강'});
   await page.click('#navProps');await page.click('[data-pf="pending"]');await page.waitForSelector('[data-apply="'+pReq+'"]');await page.click('[data-apply="'+pReq+'"]');await page.waitForSelector('.msg.warn');
   assert.match(await notice(),/필수 항목이라 비울 수 없음/);
   await page.click('#navRecipes');if(await page.locator('#cBack').count())await page.click('#cBack');await page.waitForSelector('[data-item]');assert.equal(await page.locator('[data-item]').count(),nItems);assert.equal(await page.locator('[data-item="'+X.id+'"].del').count(),0);
   // 찾을 수 없는 필드 지정: 항목은 삭제하지 않음
   const pNf=await seed({kind:'recipes',targetId:X.id,targetLabel:'레시피 · '+X.name+' · 가니시',type:'delete',current:'없는 가니시 문구',nickname:'강'});
   await page.click('#navProps');await page.click('[data-pf="pending"]');await page.waitForSelector('[data-apply="'+pNf+'"]');await page.click('[data-apply="'+pNf+'"]');await page.waitForSelector('.msg.warn');
   assert.match(await notice(),/찾지 못함\. 항목은 삭제하지 않음/);
   await page.click('#navRecipes');if(await page.locator('#cBack').count())await page.click('#cBack');await page.waitForSelector('[data-item]');assert.equal(await page.locator('[data-item="'+X.id+'"].del').count(),0);
   // 항목 통삭제 제안(대상 이름에 필드 없음, 현재 문구 없음)은 기존대로 항목 삭제 표시
   const pWhole=await seed({kind:'recipes',targetId:X.id,targetLabel:'레시피 · '+X.name,type:'delete',nickname:'강'});
   await page.click('#navProps');await page.click('[data-pf="pending"]');await page.waitForSelector('[data-apply="'+pWhole+'"]');await page.click('[data-apply="'+pWhole+'"]');await page.waitForSelector('[data-item]');
   assert.equal(await page.locator('[data-item="'+X.id+'"].del').count(),1,'통삭제 제안은 항목 삭제 표시');
   // 응대 멘트: 마지막 줄 하나뿐이면 비우지 않고 경고, 여러 줄이면 그 줄만 삭제
   const ph=(await call('GET','/api/content/phrases')).json.data,it2=ph.sections.flatMap(x=>x.items).find(i=>i.lines.length>=2);
   const pPh=await seed({kind:'phrases',targetId:it2.id,targetLabel:'응대 멘트 · '+it2.situation+' · 직원 안내 1번째 줄',type:'delete',current:it2.lines[it2.lines.length-1].text,nickname:'강'});
   await page.click('#navProps');await page.click('[data-pf="pending"]');await page.waitForSelector('[data-apply="'+pPh+'"]');await page.click('[data-apply="'+pPh+'"]');await page.waitForSelector('[data-detail]');
   assert.equal(await page.locator('[data-detail] [data-line]').count(),it2.lines.length-1,'멘트 줄 하나만 삭제');assert.match(await notice(),/만 비움/);
   await page.click('#cBack');assert.equal(await page.locator('[data-item="'+it2.id+'"].del').count(),0);
   ok('필드 삭제 제안: 줄만 삭제·필수 필드 경고·못 찾으면 유지·통삭제 기존대로·멘트 줄 삭제');
  }
  // ======== 서버 없음: 화면 유지 ========
  const p2=await ctx.newPage(),e2=[];p2.on('pageerror',e=>e2.push(e.message));await mock(p2);
  await p2.goto(pageUrl);await p2.fill('#pw',PW);await p2.click('#loginGo');await p2.waitForSelector('#saveBtn');
  flags.abort=true;await p2.click('#navRecipes');await p2.waitForSelector('[data-item]');
  assert.match(await p2.textContent('main'),/서버 연결 안 됨|저장소 미설정/);assert.equal(await p2.locator('[data-item]').count(),ex.recipes.appetizers.length,'내장본으로 화면 유지');
  await p2.click('#navProps');await p2.waitForSelector('.msg.warn');assert.equal(await p2.isVisible('#navCl'),true);
  flags.abort=false;assert.deepEqual(e2,[]);
  // ---- 마무리 점검
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  assert(seen.some(s=>s==='PUT /api/admin/content/recipes')&&seen.some(s=>s==='PUT /api/admin/content/phrases')&&seen.some(s=>s==='POST /api/admin/photo')&&seen.some(s=>s==='POST /api/admin/content/recipes/restore')&&seen.some(s=>/^POST \/api\/admin\/proposals\/.+\/decide$/.test(s)));
  const dump=await page.evaluate(()=>JSON.stringify([sessionStorage,localStorage,document.cookie]));assert(!dump.includes(PW));assert.equal(await page.evaluate(()=>localStorage.length),0);
  assert(await page.evaluate(()=>Object.keys(sessionStorage).every(k=>['harago-admin-token','harago-admin-nick'].includes(k))));
  console.log(log.join('\n'));
  console.log('어드민 콘텐츠 점검 통과 / 캡처:\n'+shots.join('\n'));
 }finally{await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
