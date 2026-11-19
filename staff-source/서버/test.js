const assert=require('node:assert/strict');const worker=require('./index.js').default;
const records=[];const env={GEMINI_API_KEY:'test-key',SHEETS_LOG_URL:'https://script.google.com/macros/s/test/exec',SHEETS_LOG_TOKEN:'server-test-token',AI_LIMITER:{async limit(){return{success:true};}}};
async function call(path,body,origin='https://fastkorea12-png.github.io',method='POST'){
 const request=new Request('https://worker.test'+path,{method,headers:{Origin:origin,'content-type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined});return worker.fetch(request,env);
}
const firstRun=(async()=>{
 let r=await call('/api/chat',{question:'오픈 순서 알려줘',context:'오픈 준비 확인'},'https://attacker.example');assert.equal(r.status,403);
 const before=global.fetch;let upstreamRequest,transientFailures=0,attempts=0,nextText=null;
 global.fetch=async(url,options)=>{
  if(String(url).startsWith('https://script.google.com/')){const payload=JSON.parse(options.body);records.push(payload);return new Response(JSON.stringify({ok:true,saved:true}),{status:200,headers:{'content-type':'application/json'}});}
  upstreamRequest={url,options};attempts++;
  if(transientFailures>0){transientFailures--;return new Response(JSON.stringify({error:{status:'UNAVAILABLE'}}),{status:503});}
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:nextText||'• 오픈 순서입니다.'}]},...(nextText?{groundingMetadata:{groundingChunks:[{web:{uri:'https://example.com/w',title:'출처'}}]}}:{})}]}),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  r=await call('/api/questions',{question:'전화 010-1234-5678',consent:true});let d=await r.json();assert.equal(d.saved,false);assert.equal(records.length,0);
  r=await call('/api/questions',{question:'홍길동님 근무 순서 알려줘',consent:true});d=await r.json();assert.equal(d.saved,false);assert.equal(records.length,0);
  r=await call('/api/questions',{question:'오픈 준비 순서',consent:false});assert.equal(r.status,400);assert.equal(records.length,0);
  r=await call('/api/questions',{question:'오픈 준비 순서',consent:true,category:'오픈'});d=await r.json();assert.equal(r.status,201);assert.equal(d.retentionDays,90);assert.equal(records.length,1);assert.equal(records[0].action,'append');assert.equal(records[0].token,'server-test-token');assert.equal(records[0].question,'오픈 준비 순서');
  r=await call('/api/chat',{question:'재고가 있나요?',context:'금지 수량 12345',messages:[]});d=await r.json();assert.match(d.text,/재고 관련 내용/);assert.equal(upstreamRequest,undefined);
  r=await call('/api/chat',{question:'홍길동님 근무 순서 알려줘',context:'오픈 확인',messages:[]});d=await r.json();assert.match(d.text,/개인정보/);assert.equal(upstreamRequest,undefined);
  r=await call('/api/chat',{question:'오픈 준비 순서',context:'오픈 확인 항목',messages:[{role:'user',text:'오늘 오픈 준비는?'},{role:'model',text:'오픈 체크리스트를 확인해요.'},{role:'user',text:'오픈 준비 순서'}]});d=await r.json();assert.equal(r.status,200);assert.match(upstreamRequest.url,/gemini-3\.1-flash-lite:generateContent/);assert.equal(upstreamRequest.options.headers['x-goog-api-key'],'test-key');assert.equal(JSON.parse(upstreamRequest.options.body).contents.length,3);assert.match(JSON.parse(upstreamRequest.options.body).systemInstruction.parts[0].text,/급여·계좌·매입가/);assert.equal(d.text,'• 오픈 순서입니다.');
  // 웹 검색 경로 시스템 프롬프트: 짧은 개조식 지시(최대 5줄·줄당 1문장·'- ' 불릿·표·제목 금지·출처 밖 단정 금지)가 들어갔는지 확인
  r=await call('/api/chat',{question:'샤또 마고 품종이 뭐예요',publicWineName:'샤또 마고',messages:[]});assert.equal(r.status,200);{const sys=JSON.parse(upstreamRequest.options.body).systemInstruction.parts[0].text;assert(JSON.parse(upstreamRequest.options.body).tools,'검색 경로');for(const k of ['짧은 개조식으로 최대 5줄','줄당 1문장','"- "를 사용','표·제목(#)은 쓰지 않는다','출처에 없는 내용은 단정하지 않고'])assert(sys.includes(k),'검색 프롬프트 누락: '+k);assert(!sys.includes('짧은 제목과 줄을 나눈 • 항목'),'옛 형식 지시 제거');}
  // 웹 검색 답변 후처리: 최대 5줄·줄당 길이 제한·출처 줄 유지·마크다운 제거
  nextText='**샤또 마고 개요**\n• 1줄 보르도 메독 1등급 와이너리입니다.\n* 2줄 주품종은 카베르네 소비뇽입니다.\n3. 3줄 블렌딩 비율은 빈티지마다 다릅니다.\n- 4줄 '+'가'.repeat(200)+'\n- 5줄 확인된 내용입니다.\n- 6줄 잘려야 합니다.\n- 7줄 잘려야 합니다.\n출처: 제조사 공식 자료';
  r=await call('/api/chat',{question:'샤또 마고 품종이 뭐예요',publicWineName:'샤또 마고',messages:[]});d=await r.json();
  {const ls=d.text.split('\n');assert.equal(ls.length,6,'본문 5줄+출처 1줄');assert(ls.slice(0,5).every(l=>l.startsWith('- ')&&l.length<=93),'불릿·줄 길이');assert(!d.text.includes('**')&&!d.text.includes('6줄'));assert.equal(ls[5],'출처: 제조사 공식 자료');assert(d.sources.length===1,'출처 목록 유지');}
  nextText='- 한 줄 답입니다.';r=await call('/api/chat',{question:'샤또 마고 품종이 뭐예요',publicWineName:'샤또 마고',messages:[]});d=await r.json();assert.equal(d.text,'- 한 줄 답입니다.');
  nextText=null;
  // 일반 지식 질문(식별 메모가 고정 문구)은 맛 표현·키워드가 없어도 검색 경로, 범주 밖 거절 지시 포함, 운영어는 검색 제외
  for(const q of ['쇼비뇽 블랑 특징','리슬링 산미 어때','카베르네 소비뇽 차이']){upstreamRequest=undefined;r=await call('/api/chat',{question:q,publicWineName:'공개 와인·주류 일반 지식 질문',messages:[]});assert.equal(r.status,200);const b=JSON.parse(upstreamRequest.options.body);assert(b.tools,'일반 질문 검색 경로: '+q);assert(b.systemInstruction.parts[0].text.split('와인·음료·음식 질문만 답할 수 있어요.').length>=3,'범주 밖 거절 지시(SYSTEM·SEARCH_SYSTEM)');}
  upstreamRequest=undefined;r=await call('/api/chat',{question:'와인 가격 얼마야',publicWineName:'공개 와인·주류 일반 지식 질문',context:'x',messages:[]});assert(!JSON.parse(upstreamRequest.options.body).tools,'운영어는 검색 제외');
  transientFailures=1;const beforeRetry=attempts;r=await call('/api/chat',{question:'오픈 순서',context:'오픈 확인'});assert.equal(r.status,200);assert.equal(attempts-beforeRetry,2);
  transientFailures=3;const beforeFailure=attempts;r=await call('/api/chat',{question:'오픈 순서',context:'오픈 확인'});assert.equal(r.status,503);assert.equal(attempts-beforeFailure,2);
  await worker.scheduled({},env);assert.equal(records.at(-1).action,'cleanup');
 }finally{global.fetch=before;}
 console.log('Gemini 프록시·출처 검사·비밀 키 헤더·시트 질문 동의/개인정보 차단·90일 정리 호출 통과');
})().catch(e=>{console.error(e);process.exitCode=1;});
// ---- 체크리스트 어드민 시험 (D1은 node:sqlite로 대체) ----
firstRun.then(async()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{DatabaseSync}=require('node:sqlite');
 const ORIGIN='https://fastkorea12-png.github.io',PW='test-admin-password-not-real',SECRET='test-token-secret-not-real-0123456789';
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(__dirname,'checklist-schema.sql'),'utf8'));db.exec(fs.readFileSync(path.join(__dirname,'shifts-schema.sql'),'utf8'));db.exec(fs.readFileSync(path.join(__dirname,'content-schema.sql'),'utf8'));
 db.exec(fs.readFileSync(path.join(__dirname,'pay-schema.sql'),'utf8'));
 const d1={prepare(sql){const st=db.prepare(sql);let args=[];const o={bind(...a){args=a.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return o;},async run(){const r=st.run(...args);return{meta:{changes:Number(r.changes)}};},async first(){return st.get(...args)||null;},async all(){return{results:st.all(...args)};}};return o;}};
 const html=fs.readFileSync(path.join(__dirname,'..','근무노트.html'),'utf8'),ctx={};vm.createContext(ctx);vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1],ctx);
 const base=()=>JSON.parse(JSON.stringify(require('../도구/체크리스트_추출.js')(JSON.parse(JSON.stringify(ctx.KB)))));
 const OWNER_PW='test-owner-password-not-real';
 const aenv={...env,SHIFTS_DB:d1,ADMIN_PASSWORD:PW,OWNER_PASSWORD:OWNER_PW,ADMIN_TOKEN_SECRET:SECRET};
 let ipN=0;
 async function api(method,p,body,{token,e=aenv,origin=ORIGIN,ip='1.1.1.1'}={}){
  const headers={'content-type':'application/json','CF-Connecting-IP':ip};if(origin)headers.Origin=origin;if(token)headers.authorization='Bearer '+token;
  const r=await worker.fetch(new Request('https://worker.test'+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),e);
  return {r,d:await r.json()};
 }
 const login=async(pw=PW,ip)=>api('POST','/api/admin/login',{password:pw},{ip});

 // Attendance is the sole no-Origin write route; no real sheet or staff data is used.
 const syncEnv={...aenv,PAY_SYNC_TOKEN:'attendance-test-secret'};
 const sync=(rows,token='attendance-test-secret',e=syncEnv)=>api('POST','/api/pay/attendance',{token,rows},{origin:null,e});
 assert.equal((await sync([],undefined,aenv)).r.status,503);
 assert.equal((await sync([],null)).r.status,401);assert.equal((await sync([],'wrong')).r.status,401);
 const attRead=path=>JSON.parse(db.prepare('SELECT data FROM pay_docs WHERE path=?').get(path).data);
 db.prepare('INSERT INTO pay_docs(path,data,version,updated_at) VALUES (?,?,1,0)').run('app/settings',JSON.stringify({staff:[{id:'a',name:'직원A',role:'staff',archived:true},{id:'b',name:'직원B',role:'staff'},{id:'o',name:'사장A',role:'owner'}]}));
 const attDate=new Date(Date.now()+9*3600000);attDate.setUTCDate(attDate.getUTCDate()-attDate.getUTCDay());const attStart=attDate.toISOString().slice(0,10);
 const attDay=n=>new Date(Date.parse(attStart)+n*86400000).toISOString().slice(0,10);
 const attWeek={start:attStart,days:Array.from({length:7},()=>({shifts:[],note:''}))};
 attWeek.days[0].shifts=[{who:'a',t:'6.5-1',chk:'',at:'stale'},{who:'a',t:'7-1',chk:''},{who:'b',t:'6-1',chk:''}];
 db.prepare('INSERT INTO pay_docs(path,data,version,updated_at) VALUES (?,?,1,0)').run('weeks/'+attStart,JSON.stringify(attWeek));
 const attRows=[{date:attDay(0),hours:{'직원A':6.5,'직원B':5.33,'직원C':4}},{date:attDay(5),hours:{'직원A':6,'사장A':6}},{date:attDay(6),hours:{'직원B':7}}];
 let att=await sync(attRows);assert.equal(att.r.status,200);assert.equal(att.r.headers.get('access-control-allow-origin'),null);assert.deepEqual(att.d,{ok:true,applied:5,unchanged:0,unknown:['직원C']});
 const aw=attRead('weeks/'+attStart),range=require('./pay.js').attendanceRange;
 assert.equal(aw.days[0].shifts[0].chk,'done');assert.equal(aw.days[0].shifts[0].at,undefined);assert.equal(aw.days[0].shifts[1].chk,'');
 const changed=range(aw.days[0].shifts[2].at);assert.equal(aw.days[0].shifts[2].chk,'changed');assert(Math.abs(changed.e-changed.s-5.33)<1e-8);assert.equal(changed.e%24,1);
 assert.equal(range(aw.days[5].shifts[0].t).e%24,2);assert.equal(range(aw.days[5].shifts[1].t).e%24,1);assert.equal(range(aw.days[6].shifts[0].t).e%24,2);
 const av=db.prepare('SELECT version FROM pay_docs WHERE path=?').get('weeks/'+attStart).version;
 att=await sync(attRows);assert.equal(att.d.applied,0);assert.equal(att.d.unchanged,5);assert.equal(db.prepare('SELECT version FROM pay_docs WHERE path=?').get('weeks/'+attStart).version,av);
 assert.equal(attRead('app/sync').rows,3);
 for(const hours of [0,17,1.001,'6',null])assert.equal((await sync([{date:attDay(0),hours:{'직원A':hours}}])).r.status,400);
 assert.equal((await sync([{date:'2026-02-30',hours:{}}])).r.status,400);assert.equal((await sync(Array.from({length:121},()=>attRows[0]))).r.status,400);
 // Version collision: preserve another device's edit and retry once.
 let injected=false;
 const collisionDB={prepare(sql){const st=d1.prepare(sql);return{bind(...args){st.bind(...args);return this;},first:()=>st.first(),all:()=>st.all(),async run(){if(!injected&&sql.startsWith('UPDATE pay_docs SET data=')){injected=true;const current=attRead('weeks/'+attStart);current.days[0].note='concurrent-note';db.prepare('UPDATE pay_docs SET data=?,version=version+1 WHERE path=?').run(JSON.stringify(current),'weeks/'+attStart);}return st.run();}};}};
 att=await sync([{date:attDay(0),hours:{'직원A':5}}],'attendance-test-secret',{...syncEnv,SHIFTS_DB:collisionDB});assert.equal(att.r.status,200);assert(injected);assert.equal(attRead('weeks/'+attStart).days[0].note,'concurrent-note');assert.equal(attRead('weeks/'+attStart).days[0].shifts[0].chk,'changed');
 const nextDate=new Date(Date.parse(attStart)+7*86400000).toISOString().slice(0,10);
 att=await sync([{date:nextDate,hours:{'직원A':16}}]);assert.equal(att.r.status,200);const created=attRead('weeks/'+nextDate);assert.equal(created.days.length,7);const cr=range(created.days[0].shifts[0].t);assert.equal(cr.e-cr.s,16);assert.equal(cr.e%24,1);
 for(const offset of [-401,401])assert.equal((await sync([{date:new Date(Date.parse(new Date(Date.now()+9*3600000).toISOString().slice(0,10))+offset*86400000).toISOString().slice(0,10),hours:{}}])).r.status,400);
 // 성 빠진 이름: 그만둔 같은 이름보다 현재 명단의 전체 이름(끝이 같은 한 명)에 합친다. 끝이 같은 사람이 둘이면 합치지 않는다.
 db.prepare('UPDATE pay_docs SET data=? WHERE path=?').run(JSON.stringify({staff:[{id:'e',name:'박직원E',role:'owner'},{id:'f',name:'직원E',role:'staff',archived:true},{id:'g',name:'이직원G',role:'staff'},{id:'h',name:'최직원G',role:'staff'}]}),'app/settings');
 att=await sync([{date:attDay(1),hours:{'직원E':3,'직원G':4,'박직원E(사장)':2}}]);assert.equal(att.r.status,200);assert.deepEqual(att.d.unknown,['직원G']);assert.deepEqual(attRead('weeks/'+attStart).days[1].shifts.map(x=>x.who),['e']);
 db.prepare('DELETE FROM pay_docs').run();
 console.log('Attendance 인증·시간·금토·명단·멱등성 검증 통과');
 // 공개 GET: 미발행, CORS
 let x=await api('GET','/api/checklist');assert.equal(x.r.status,200);assert.deepEqual(x.d,{published:false});
 assert.equal(x.r.headers.get('access-control-allow-origin'),ORIGIN);assert.match(x.r.headers.get('cache-control'),/max-age=(\d+)/);assert(Number(x.r.headers.get('cache-control').match(/max-age=(\d+)/)[1])<=60);
 x=await api('GET','/api/checklist',undefined,{origin:'https://attacker.example'});assert.equal(x.r.status,403);
 let pre=await worker.fetch(new Request('https://worker.test/api/admin/checklist',{method:'OPTIONS',headers:{Origin:ORIGIN}}),aenv);assert.equal(pre.status,204);assert.match(pre.headers.get('access-control-allow-methods'),/PUT/);assert.match(pre.headers.get('access-control-allow-headers'),/authorization/);
 // 설정 없음 503
 x=await api('POST','/api/admin/login',{password:'x'},{e:{...env,SHIFTS_DB:d1}});assert.equal(x.r.status,503);assert.match(x.d.error,/관리자 설정 없음/);
 x=await api('GET','/api/admin/checklist',undefined,{e:{...env,SHIFTS_DB:d1}});assert.equal(x.r.status,503);
 // 로그인 실패·성공
 x=await login('wrong');assert.equal(x.r.status,401);assert.equal(x.r.headers.get('cache-control'),'no-store');assert(x.d.error&&!JSON.stringify(x.d).includes(PW));
 x=await login(PW);assert.equal(x.r.status,200);const token=x.d.token;assert(token&&!token.includes(PW));
 assert(Math.abs(Date.parse(x.d.expiresAt)-Date.now()-4*3600*1000)<5000);
 // 시도 제한: 다른 IP에서 5회 실패 후 429(맞는 비밀번호도 차단), 다른 IP는 영향 없음
 for(let i=0;i<5;i++){x=await login('bad'+i,'9.9.9.9');assert.equal(x.r.status,401);}
 x=await login(PW,'9.9.9.9');assert.equal(x.r.status,429);assert.match(x.d.error,/분 뒤/);
 x=await login(PW,'8.8.8.8');assert.equal(x.r.status,200);
 const realNow=Date.now;Date.now=()=>realNow()+11*60000;try{x=await login(PW,'9.9.9.9');assert.equal(x.r.status,200);}finally{Date.now=realNow;}
 // 토큰 없음·위조·만료
 x=await api('GET','/api/admin/checklist');assert.equal(x.r.status,401);
 x=await api('GET','/api/admin/checklist',undefined,{token:token.slice(0,-3)+'abc'});assert.equal(x.r.status,401);
 const forged=Buffer.from(JSON.stringify({iat:Date.now(),exp:Date.now()+1e9})).toString('base64url')+'.'+token.split('.')[1];
 x=await api('GET','/api/admin/checklist',undefined,{token:forged});assert.equal(x.r.status,401);
 Date.now=()=>realNow()+4*3600*1000+1000;try{x=await api('GET','/api/admin/checklist',undefined,{token});assert.equal(x.r.status,401);}finally{Date.now=realNow;}
 x=await api('PUT','/api/admin/checklist',{checklist:base(),baseVersion:0});assert.equal(x.r.status,401);
 // Pay authentication, round trip, limits, conflicts and CORS.
 for(const t of [undefined,forged,token.slice(0,-3)+'abc']){x=await api('GET','/api/pay/state',undefined,{token:t});assert.equal(x.r.status,401);}
 Date.now=()=>realNow()+4*3600*1000+1000;try{assert.equal((await api('GET','/api/pay/state',undefined,{token})).r.status,401);}finally{Date.now=realNow;}
 // 급여는 사장 비밀번호 토큰만(11/18): 매니저 토큰은 읽기·쓰기 403, 사장 토큰으로 진행
 assert.equal((await api('GET','/api/pay/state',undefined,{token})).r.status,403);
 assert.equal((await api('PUT','/api/pay/doc',{path:'app/settings',data:{},ifVersion:0},{token})).r.status,403);
 {const o=await login(OWNER_PW,'7.7.7.7');assert.equal(o.r.status,200);assert.equal(o.d.role,'owner');var ownerTok=o.d.token;}
 {const m=await login(PW,'7.7.7.7');assert.equal(m.d.role,'manager');}
 const pay=(body)=>api('PUT','/api/pay/doc',body,{token:ownerTok});
 for(const path of ['bad','weeks/../x','weeks/2026-1-01'])assert.equal((await pay({path,data:{}})).r.status,400);
 assert.equal((await pay({path:'app/settings',data:{text:'가'.repeat(30000)}})).r.status,413);
 x=await pay({path:'app/settings',data:{급여:'시급'},ifVersion:0});assert.equal(x.r.status,200);assert.equal(x.d.version,1);
 x=await api('GET','/api/pay/state',undefined,{token:ownerTok});assert.deepEqual(x.d.docs[0].data,{급여:'시급'});assert.equal(x.r.headers.get('access-control-allow-origin'),ORIGIN);
 x=await pay({path:'app/settings',data:{},ifVersion:0});assert.equal(x.r.status,409);assert.equal(x.d.current.version,1);
 assert.equal((await pay({path:'weeks/2026-10-11',data:{},ifVersion:2})).r.status,409);
 assert.equal((await pay({path:'app/settings',data:{},ifVersion:1})).d.version,2);
 for(const path of ['/api/pay/state','/api/pay/doc']){const r=await worker.fetch(new Request('https://worker.test'+path,{method:'OPTIONS',headers:{Origin:ORIGIN}}),aenv);assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),ORIGIN);assert.match(r.headers.get('access-control-allow-headers'),/authorization/);}
 console.log('급여 API 인증·왕복·용량·버전 충돌·CORS 통과');
 // 최초 조회·저장
 x=await api('GET','/api/admin/checklist',undefined,{token});assert.equal(x.r.status,200);assert.equal(x.d.published,false);assert.equal(x.r.headers.get('cache-control'),'no-store');
 let cl=base();
 x=await api('PUT','/api/admin/checklist',{checklist:cl,nickname:'점장',note:'최초',baseVersion:0},{token});assert.equal(x.r.status,200,JSON.stringify(x.d));assert.equal(x.d.version,1);assert.equal(x.d.summary,'최초 발행');
 x=await api('GET','/api/checklist');assert.equal(x.d.published,true);assert.equal(x.d.version,1);assert(x.d.publishedAt);assert.equal(x.d.checklist.open.sections.length,3);assert.equal(x.d.checklist.close.sections[0].items[0].biweekly,true);
 // 검증 거부
 const put=(c,extra={},bv=1)=>api('PUT','/api/admin/checklist',{checklist:c,baseVersion:bv,...extra},{token});
 const mut=(f)=>{const c=base();f(c);return c;};
 const rejects=[
  ['금칙어 도매가',c=>{c.open.sections[0].items[0].text='도매가 확인';}],
  ['금칙어 급여',c=>{c.close.sections[1].items[0].text='급여 정산';}],
  ['금칙어 시급',c=>{c.open.sections[0].items[1].text='시급 확인';}],
  ['금칙어 계좌',c=>{c.open.sections[0].items[1].text='계좌 확인';}],
  ['금칙어 희망가',c=>{c.open.sections[0].items[1].text='희망가 확인';}],
  ['계좌번호 숫자열',c=>{c.open.sections[0].items[0].text='입금 110-123-456789';}],
  ['긴 숫자열',c=>{c.open.sections[0].items[0].text='번호 1234567890123';}],
  ['전화번호',c=>{c.open.sections[0].items[0].text='연락 010-1234-5678';}],
  ['빈 문구',c=>{c.open.sections[0].items[0].text='   ';}],
  ['길이 초과',c=>{c.open.sections[0].items[0].text='가'.repeat(121);}],
  ['요일 범위',c=>{c.open.sections[0].items[0].days=[7];}],
  ['알 수 없는 키',c=>{c.open.sections[0].items[0].x=1;}],
  ['id 중복',c=>{c.open.sections[0].items[1].id=c.open.sections[0].items[0].id;}],
  ['오픈 없음',c=>{delete c.open;}],
  ['소제목 배열 아님',c=>{c.close.sections='x';}],
  ['항목 81개',c=>{for(let i=0;i<60;i++)c.open.sections[0].items.push({id:'z'+i,text:'추가 '+i});}],
 ];
 for(const [name,f] of rejects){x=await put(mut(f));assert.equal(x.r.status,400,name+' '+JSON.stringify(x.d));assert(x.d.error&&Array.isArray(x.d.details)&&x.d.details[0].path,name);}
 x=await put(mut(c=>{c.open.sections[0].items[0].text='도매가';}));assert.equal(x.d.details[0].id,cl.open.sections[0].items[0].id);
 x=await put(cl,{nickname:'홍길동 010-1234-5678'});assert.equal(x.r.status,400);
 const bigNote=mut(c=>{for(let i=0;i<12;i++)c.open.sections[0].items.push({id:'b'+i,text:'가'.repeat(120)});});
 const huge=await api('PUT','/api/admin/checklist',{checklist:bigNote,baseVersion:1,pad:'x'.repeat(100000)},{token});assert.equal(huge.r.status,413);
 // 정상 수정·충돌·요약
 const c2=base();c2.open.sections[0].items[0].text='바닥 청소기 청소 (수정)';c2.open.sections[0].items.splice(1,1);c2.open.sections[0].items.push({id:'nnew1',text:'새 항목'});
 x=await put(c2,{nickname:'점장'},1);assert.equal(x.r.status,200,JSON.stringify(x.d));assert.equal(x.d.version,2);assert.match(x.d.summary,/수정 1 · 추가 1 · 삭제 1/);
 x=await put(c2,{},1);assert.equal(x.r.status,409);assert.equal(x.d.latest.version,2);assert(x.d.latest.checklist);
 const c3=JSON.parse(JSON.stringify(c2));const mv=c3.open.sections[0].items.splice(3,1)[0];c3.open.sections[0].items.unshift(mv);
 x=await put(c3,{},2);assert.equal(x.r.status,200);assert.match(x.d.summary,/이동 1/);
 // 복원: 새 버전으로, 기존 지우지 않음
 x=await api('POST','/api/admin/checklist/restore',{version:1,baseVersion:3},{token});assert.equal(x.r.status,200,JSON.stringify(x.d));assert.equal(x.d.version,4);assert.equal(x.d.restoredFrom,1);
 x=await api('GET','/api/checklist');assert.equal(x.d.version,4);assert.equal(x.d.checklist.open.sections[0].items[0].text,cl.open.sections[0].items[0].text);
 x=await api('POST','/api/admin/checklist/restore',{version:99,baseVersion:4},{token});assert.equal(x.r.status,404);
 x=await api('POST','/api/admin/checklist/restore',{version:1,baseVersion:2},{token});assert.equal(x.r.status,409);
 x=await api('GET','/api/admin/checklist',undefined,{token});assert.deepEqual(x.d.versions.map(v=>v.version),[4,3,2,1]);assert.equal(x.d.versions[0].itemCount,cl.open.sections.concat(cl.close.sections).reduce((n,s)=>n+s.items.length,0));assert(x.d.versions[3].summary&&x.d.versions[2].nickname==='점장');
 // 20개만 유지
 for(let i=0;i<22;i++){const c=base();c.open.sections[0].items[0].text='반복 '+i;x=await put(c,{},4+i);assert.equal(x.r.status,200);}
 x=await api('GET','/api/admin/checklist',undefined,{token});assert.equal(x.d.versions.length,20);assert.equal(x.d.versions[0].version,26);assert.equal(x.d.versions.at(-1).version,7);
 // 로그에 비밀 흔적 없음: 응답·저장 데이터에 비밀번호 없음
 assert(!JSON.stringify(db.prepare('SELECT * FROM checklist_versions').all()).includes(PW));assert(!JSON.stringify(db.prepare('SELECT * FROM admin_login_attempts').all()).includes('1.1.1.1'));

 // 제출 현황: 제출 성공 시 결과 기록 -> 어드민 읽기 전용 조회
 {
  const CAT=require('./shifts-catalog.js').default,kind='마감 순서',tasks=CAT.kinds[kind];
  x=await api('GET','/api/admin/submissions',undefined,{token});assert.equal(x.r.status,200);assert.deepEqual(x.d.submissions,[]);
  assert.equal((await api('GET','/api/admin/submissions')).r.status,401);
  const before2=global.fetch;global.fetch=async(url,o)=>{if(o&&o.method==='POST')return new Response('Your response has been recorded',{status:200});return new Response('<html>formResponse?hl=en <input name="fbzx" value="abc"></html>',{status:200});};
  const today=new Date(Date.now()+9*3600*1000).toISOString().slice(0,10);
  const statuses=tasks.map((_,i)=>i===0?'missing':i===1?'na':'done');
  const sid='11111111-2222-3333-4444-555555555555';
  try{
   x=await api('POST','/api/shifts',{submissionId:sid,kind,workDay:today,version:CAT.version,statuses});assert.equal(x.r.status,201,JSON.stringify(x.d));
   x=await api('POST','/api/shifts',{submissionId:sid,kind,workDay:today,version:CAT.version,statuses});assert.equal(x.d.alreadySaved,true);
  }finally{global.fetch=before2;}
  x=await api('GET','/api/admin/submissions',undefined,{token});assert.equal(x.r.status,200);assert.equal(x.r.headers.get('cache-control'),'no-store');
  assert.equal(x.d.submissions.length,1);const sub=x.d.submissions[0];
  assert.equal(sub.workDay,today);assert.equal(sub.kind,kind);assert.deepEqual(sub.counts,{done:tasks.length-2,na:1,missing:1});assert.deepEqual(sub.missing,[tasks[0].text]);assert.equal(sub.items.length,tasks.length);assert.equal(sub.items[1].status,'na');
  assert(!JSON.stringify(x.d).includes(sid),'제출 번호 미노출');
  x=await api('GET','/api/admin/submissions?kind=open',undefined,{token});assert.equal(x.d.submissions.length,0);
  x=await api('GET','/api/admin/submissions?from=2020-01-01&to=2020-01-05',undefined,{token});assert.equal(x.d.submissions.length,0);
  x=await api('GET','/api/admin/submissions?from=bad',undefined,{token});assert.equal(x.r.status,400);
  db.exec('DROP TABLE shift_results');x=await api('GET','/api/admin/submissions',undefined,{token});assert.equal(x.r.status,503);assert(x.d.error);
  db.exec(fs.readFileSync(path.join(__dirname,'checklist-schema.sql'),'utf8'));
 }
 // 발행본 기준 제출(/api/shifts): 항목 id·발행 버전 검증, 구버전 저장본 검증, 내장 카탈로그 하위 호환
 {
  const kind='오픈 순서',today=new Date(Date.now()+9*3600*1000).toISOString().slice(0,10),weekday=new Date(today+'T12:00:00Z').getUTCDay();
  const before2=global.fetch;global.fetch=async(url,o)=>{if(o&&o.method==='POST')return new Response('Your response has been recorded',{status:200});return new Response('<html>formResponse?hl=en <input name="fbzx" value="abc"></html>',{status:200});};
  const pub=(await api('GET','/api/checklist')).d,cur=pub.checklist.open,all=cur.sections.flatMap(s=>s.items.map(it=>({sec:s.title,...it})));
  const shown=all.filter(it=>!it.days||!it.days.length||it.days.includes(weekday)),hidden=all.filter(it=>!shown.includes(it));
  assert(hidden.length>0&&shown.length>0,'요일 한정 항목이 있어야 함');
  const mk=(list,f)=>list.map((it,i)=>({id:it.id,status:f?f(i):'done'}));
  const sid=(n)=>'22222222-0000-0000-0000-'+String(n).padStart(12,'0');
  const post=(n,extra={})=>api('POST','/api/shifts',{submissionId:sid(n),kind,workDay:today,checklistVersion:pub.version,items:mk(shown,i=>i===0?'missing':i===1?'na':'done'),...extra});
  try{
   let r=await post(1);assert.equal(r.r.status,201,JSON.stringify(r.d));
   r=await post(1);assert.equal(r.r.status,200);assert.equal(r.d.alreadySaved,true);
   r=await post(1,{items:mk(shown,()=>'done')});assert.equal(r.r.status,409);
   r=await api('GET','/api/admin/submissions?kind=open',undefined,{token});assert.equal(r.d.submissions.length,1);
   let s=r.d.submissions[0];assert.equal(s.items.length,shown.length);assert.equal(s.version,'v'+pub.version);
   assert.deepEqual(s.items.map(x=>x.text),shown.map(x=>x.text));assert.deepEqual(s.items.map(x=>x.group),shown.map(x=>x.sec));
   assert.deepEqual(s.counts,{done:shown.length-2,na:1,missing:1});assert.deepEqual(s.missing,[shown[0].text]);
   assert(s.items.every(x=>Object.keys(x).sort().join()==='group,status,text'),'항목은 문구·소제목·상태만');
   assert(!JSON.stringify(r.d).includes(sid(1)));
   // 요일에 해당 없는 항목을 같이 보내도 허용(저장 안 함)
   r=await post(2,{items:[...mk(shown),...mk(hidden,()=>'done')]});assert.equal(r.r.status,201,JSON.stringify(r.d));
   // 알 수 없는 id·중복 id·누락·상태 오류·종류 오류·버전 형식
   r=await post(3,{items:[...mk(shown),{id:'zzzzzzzz',status:'done'}]});assert.equal(r.r.status,400);
   r=await post(4,{items:[...mk(shown),mk(shown)[0]]});assert.equal(r.r.status,400);
   r=await post(5,{items:mk(shown).slice(1)});assert.equal(r.r.status,400);
   r=await post(6,{items:mk(shown,()=>'finished')});assert.equal(r.r.status,400);
   r=await post(7,{items:'x'});assert.equal(r.r.status,400);
   r=await post(8,{kind:'점심 순서'});assert.equal(r.r.status,400);
   r=await post(9,{checklistVersion:'2'});assert.equal(r.r.status,400);
   r=await post(10,{checklistVersion:pub.version+50});assert.equal(r.r.status,409);
   r=await post(11,{items:mk(all,()=>'done')});assert.equal(r.r.status,201,'모든 항목(요일 외 포함)을 보내도 통과');
   // 마감은 마감 항목으로만 통과
   r=await post(12,{kind:'마감 순서'});assert.equal(r.r.status,400);
   // 제출 중 발행본이 바뀜: 이전 버전 번호로 제출하면 그 버전의 저장본으로 검증·문구 저장
   const nextCl=JSON.parse(JSON.stringify(pub.checklist));nextCl.open.sections[0].items[0].text='새 문구 항목';
   r=await api('PUT','/api/admin/checklist',{checklist:nextCl,baseVersion:pub.version},{token});assert.equal(r.r.status,200,JSON.stringify(r.d));const v2=r.d.version;
   r=await post(13);assert.equal(r.r.status,201,'구버전 번호 제출은 거절하지 않음 '+JSON.stringify(r.d));
   r=await api('GET','/api/admin/submissions?kind=open',undefined,{token});s=r.d.submissions.find(x=>x.version==='v'+pub.version&&x.items[0].text===shown[0].text);assert(s,'구버전 문구로 기록');
   r=await post(14,{checklistVersion:v2,items:mk(shown)});assert.equal(r.r.status,201);
   r=await api('GET','/api/admin/submissions?kind=open',undefined,{token});assert(r.d.submissions.some(x=>x.version==='v'+v2&&x.items.some(i=>i.text==='새 문구 항목')),'새 버전 문구로 기록');
   // checklistVersion이 없으면 내장 카탈로그 검증 그대로(발행본이 있어도)
   const CAT=require('./shifts-catalog.js').default,tasks=CAT.kinds[kind];
   r=await api('POST','/api/shifts',{submissionId:sid(15),kind,workDay:today,version:CAT.version,statuses:tasks.map(()=>'done')});assert.equal(r.r.status,201,JSON.stringify(r.d));
   r=await api('POST','/api/shifts',{submissionId:sid(16),kind,workDay:today,version:'0000000000',statuses:tasks.map(()=>'done')});assert.equal(r.r.status,409);
   r=await api('POST','/api/shifts',{submissionId:sid(17),kind,workDay:today,version:CAT.version,statuses:tasks.map(()=>'done').slice(1)});assert.equal(r.r.status,400);
   // 미발행(테이블 비어 있음)이면 checklistVersion이 있어도 내장 카탈로그로 처리
   db.exec('DELETE FROM checklist_versions');
   r=await api('POST','/api/shifts',{submissionId:sid(18),kind,workDay:today,version:CAT.version,statuses:tasks.map(()=>'done'),checklistVersion:1,items:[]});assert.equal(r.r.status,201,JSON.stringify(r.d));
   r=await api('POST','/api/shifts',{submissionId:sid(19),kind,workDay:today,checklistVersion:1,items:[]});assert.equal(r.r.status,400,'미발행이면 기존 방식: statuses 없으면 거절');
  }finally{global.fetch=before2;}
 }
 // 구글 양식 확인 판정: 기본 문구·사용자 지정 확인 페이지 성공, 양식 본문 재응답·오류는 unknown/202
 {
  const kind='마감 순서',CAT=require('./shifts-catalog.js').default,tasks=CAT.kinds[kind],today=new Date(Date.now()+9*3600*1000).toISOString().slice(0,10);
  const sidOf=n=>'aaaaaaaa-bbbb-cccc-dddd-'+String(n).padStart(12,'0');
  const body=n=>({submissionId:sidOf(n),kind,workDay:today,version:CAT.version,statuses:tasks.map((_,i)=>i===0?'missing':'done')});
  const formBody='<html>formResponse?hl=en <input name="fbzx" value="abc"><input name="entry.392373588"></html>';
  const custom='<!DOCTYPE html><html><head><title>하라고지페 오픈·마감 제출</title></head><body><script>var FB_PUBLIC_LOAD_DATA_ = [null,[],"/forms","하라고지페 오픈·마감 제출"];</script>오픈·마감 체크리스트를 제출했어요. 챗봇 탭으로 돌아가 근무를 이어가세요. Submit another response</body></html>';
  const run=async(n,postResp)=>{const b=global.fetch;let posts=0;global.fetch=async(url,o)=>{if(o&&o.method==='POST'){posts++;return postResp();}return new Response('<html>formResponse?hl=en <input name="fbzx" value="abc"></html>',{status:200});};
   try{const r=await api('POST','/api/shifts',body(n));r.posts=()=>posts;return r;}finally{global.fetch=b;}};
  const count=async()=>(await api('GET','/api/admin/submissions?from='+today+'&to='+today,undefined,{token})).d.submissions.length;
  const c0=await count();
  let r=await run(101,()=>new Response('Your response has been recorded',{status:200}));assert.equal(r.r.status,201);
  r=await run(102,()=>new Response(custom,{status:200}));assert.equal(r.r.status,201,JSON.stringify(r.d));assert.equal(await count(),c0+2);
  r=await run(102,()=>{throw new Error('재전송 금지');});assert.equal(r.r.status,200);assert.equal(r.d.alreadySaved,true);
  r=await run(103,()=>new Response(formBody,{status:200}));assert.equal(r.r.status,202);assert.equal(r.d.uncertain,true);assert.equal(await count(),c0+2);
  r=await run(103,()=>{throw new Error('재전송 금지');});assert.equal(r.r.status,202,'unknown 영수증은 자동 승격·재시도하지 않음');
  r=await run(104,()=>new Response(custom,{status:502}));assert.equal(r.r.status,202);
  r=await run(105,()=>new Response('<html>오류</html>',{status:200}));assert.equal(r.r.status,202);
  r=await run(106,()=>new Response(custom+formBody,{status:200}));assert.equal(r.r.status,202,'표지가 있어도 입력 필드가 있으면 실패');
  assert.equal(await count(),c0+2);
 }
 // ===== 콘텐츠(레시피·응대 멘트)·사진·제안 =====
 {
  const extracted=()=>JSON.parse(JSON.stringify(require('../도구/콘텐츠_추출.js')()));
  const raw=async(method,p,bytes,{token,type='image/jpeg',ip='1.1.1.1',origin=ORIGIN}={})=>{
   const headers={'CF-Connecting-IP':ip};if(origin)headers.Origin=origin;if(token)headers.authorization='Bearer '+token;if(type)headers['content-type']=type;
   const r=await worker.fetch(new Request('https://worker.test'+p,{method,headers,body:bytes}),aenv);return r;
  };
  const jpeg=(w,h,size=2000)=>{const head=Buffer.from([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,0xff,0xc0,0,17,8,h>>8,h&255,w>>8,w&255,3,1,0x22,0,2,0x11,1,3,0x11,1]);return Buffer.concat([head,Buffer.alloc(Math.max(0,size-head.length-2),7),Buffer.from([0xff,0xd9])]);};
  const png=(w,h,size=1500)=>{const u32=n=>Buffer.from([n>>>24,(n>>16)&255,(n>>8)&255,n&255]);return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),u32(13),Buffer.from('IHDR'),u32(w),u32(h),Buffer.from([8,6,0,0,0]),u32(0),Buffer.alloc(Math.max(0,size-33),9)]);};
  const webp=(w,h,size=1500)=>{const le=n=>Buffer.from([(n-1)&255,((n-1)>>8)&255,((n-1)>>16)&255]);return Buffer.concat([Buffer.from('RIFF'),Buffer.from([0,0,0,0]),Buffer.from('WEBPVP8X'),Buffer.from([10,0,0,0,0,0,0,0]),le(w),le(h),Buffer.alloc(Math.max(0,size-30),5)]);};
  const adm=(m,p,b)=>api(m,p,b,{token});
  // 공개·인증
  x=await api('GET','/api/content/recipes');assert.equal(x.r.status,200);assert.deepEqual(x.d,{published:false});assert.equal(x.r.headers.get('cache-control'),'public, max-age=30');
  x=await api('GET','/api/content/phrases');assert.deepEqual(x.d,{published:false});
  x=await api('GET','/api/content/checklist');assert.equal(x.r.status,404);
  x=await api('GET','/api/content/recipes',undefined,{origin:'https://attacker.example'});assert.equal(x.r.status,403);
  for(const [m,p,b] of [['GET','/api/admin/content/recipes'],['PUT','/api/admin/content/recipes',{data:{},baseVersion:0}],['POST','/api/admin/content/recipes/restore',{version:1}],['GET','/api/admin/proposals'],['POST','/api/admin/proposals/0123456789abcdef/decide',{status:'rejected'}]]){x=await api(m,p,b);assert.equal(x.r.status,401,m+' '+p);}
  x=await raw('POST','/api/admin/photo',jpeg(100,100));assert.equal(x.status,401);
  x=await raw('DELETE','/api/admin/photo/'+'a'.repeat(24),undefined,{type:undefined});assert.equal(x.status,401);
  x=await api('GET','/api/admin/content/recipes',undefined,{token,e:{...env,SHIFTS_DB:d1}});assert.equal(x.r.status,503);
  x=await adm('GET','/api/admin/content/recipes');assert.equal(x.r.status,200);assert.equal(x.d.published,false);assert.deepEqual(x.d.versions,[]);
  x=await adm('GET','/api/admin/content/other');assert.equal(x.r.status,404);
  // 추출 모듈 결과가 스키마 검증을 통과해야 한다
  const ex=extracted();
  assert.equal(ex.recipes.appetizers.length,19);assert.equal(ex.recipes.others.length,6);
  x=await adm('PUT','/api/admin/content/recipes',{data:ex.recipes,nickname:'점장',note:'최초',baseVersion:0});assert.equal(x.r.status,200,JSON.stringify(x.d));assert.equal(x.d.version,1);assert.equal(x.d.summary,'최초 발행');
  x=await adm('PUT','/api/admin/content/phrases',{data:ex.phrases,baseVersion:0});assert.equal(x.r.status,200,JSON.stringify(x.d));assert.equal(x.d.version,1);
  x=await api('GET','/api/content/recipes');assert.equal(x.d.published,true);assert.equal(x.d.version,1);assert.equal(x.d.data.appetizers.length,19);assert.equal(x.d.kind,'recipes');
  x=await api('GET','/api/content/phrases');assert.equal(x.d.data.sections.length,7);
  // 체크리스트 버전과 독립
  // 409·수정·요약
  const rput=(d,extra={},bv=1)=>adm('PUT','/api/admin/content/recipes',{data:d,baseVersion:bv,...extra});
  const rm=(f)=>{const d=extracted().recipes;f(d);return d;};
  const r2=rm(d=>{d.appetizers[0].steps[0]='수정한 단계.';d.appetizers.splice(1,1);d.cocktails.push({id:'knew1',name:'새 칵테일',status:'candidate',ingredients:['재료'],steps:['순서']});const t=d.others[0];d.others[0]=d.others[1];d.others[1]=t;});
  x=await rput(r2,{nickname:'점장'},1);assert.equal(x.r.status,200,JSON.stringify(x.d));assert.equal(x.d.version,2);assert.match(x.d.summary,/수정 1 · 추가 1 · 삭제 1 · 이동 1/);
  x=await rput(r2,{},1);assert.equal(x.r.status,409);assert.equal(x.d.latest.version,2);assert(x.d.latest.data.cocktails.length===12);
  x=await adm('POST','/api/admin/content/recipes/restore',{version:1,baseVersion:2});assert.equal(x.r.status,200,JSON.stringify(x.d));assert.equal(x.d.version,3);assert.equal(x.d.restoredFrom,1);
  x=await api('GET','/api/content/recipes');assert.equal(x.d.data.appetizers.length,19);assert.equal(x.d.data.cocktails.length,11);
  x=await adm('POST','/api/admin/content/recipes/restore',{version:1,baseVersion:2});assert.equal(x.r.status,409);
  x=await adm('POST','/api/admin/content/recipes/restore',{version:77,baseVersion:3});assert.equal(x.r.status,404);
  x=await adm('GET','/api/admin/content/recipes');assert.deepEqual(x.d.versions.map(v=>v.version),[3,2,1]);assert.equal(x.d.versions[1].nickname,'점장');assert.equal(x.d.versions[2].itemCount,36);assert.equal(x.d.current.version,3);
  // 검증 거부
  const rr=[
   ['금칙어 도매가',d=>{d.appetizers[0].steps[0]='도매가 확인';}],['금칙어 급여',d=>{d.cocktails[0].note='급여 정산';}],['금칙어 시급',d=>{d.others[0].garnish='시급';}],['금칙어 희망가',d=>{d.appetizers[0].name='희망가';}],['금칙어 계좌',d=>{d.appetizers[0].ingredients[0]='계좌 확인';}],
   ['전화번호',d=>{d.appetizers[0].note='연락 010-1234-5678';}],['계좌번호 숫자열',d=>{d.appetizers[0].note='입금 110-123-456789';}],['긴 숫자열',d=>{d.appetizers[0].note='번호 1234567890123';}],['이메일',d=>{d.appetizers[0].note='a@example.com';}],
   ['빈 이름',d=>{d.appetizers[0].name=' ';}],['빈 단계',d=>{d.appetizers[0].steps.push('');}],['단계 길이',d=>{d.appetizers[0].steps[0]='가'.repeat(301);}],['이름 길이',d=>{d.appetizers[0].name='가'.repeat(61);}],['줄바꿈',d=>{d.appetizers[0].steps[0]='가\n나';}],
   ['알 수 없는 키',d=>{d.appetizers[0].x=1;}],['안주에 glass',d=>{d.appetizers[0].glass='잔';}],['안주에 status',d=>{d.appetizers[0].status='confirmed';}],['status 값',d=>{d.cocktails[0].status='x';}],['칵테일 status 없음',d=>{delete d.cocktails[0].status;}],
   ['id 중복',d=>{d.cocktails[0].id=d.appetizers[0].id;}],['id 형식',d=>{d.cocktails[0].id='a b';}],['구역 없음',d=>{delete d.others;}],['추가 구역',d=>{d.extra=[];}],['목록 아님',d=>{d.appetizers='x';}],['재료 줄 31개',d=>{d.appetizers[0].ingredients=Array(31).fill('재료');}],['confirm 형식',d=>{d.appetizers[0].confirm='y';}],
   ['항목 121개',d=>{for(let i=0;i<60;i++)d.appetizers.push({id:'z'+i,name:'n'+i,ingredients:[],steps:[]});for(let i=0;i<60;i++)d.others.push({id:'y'+i,name:'n'+i,ingredients:[],steps:[]});}],
   ['없는 사진',d=>{d.appetizers[0].photoId='0'.repeat(24);}],['사진 번호 형식',d=>{d.appetizers[0].photoId='../x';}],
  ];
  for(const [name,f] of rr){x=await rput(rm(f),{},3);assert.equal(x.r.status,400,name+' '+JSON.stringify(x.d));assert(x.d.error&&Array.isArray(x.d.details)&&x.d.details[0].path,name);}
  x=await rput(rm(d=>{d.appetizers[0].steps[0]='도매가';}),{},3);assert.equal(x.d.details[0].id,ex.recipes.appetizers[0].id);
  x=await rput(rm(d=>{d.appetizers[0].note='2026-10-13 확인';}),{},3);assert.equal(x.r.status,200,'날짜 표기는 허용 '+JSON.stringify(x.d));
  let bv=4;
  x=await rput(ex.recipes,{nickname:'홍길동 010-1234-5678'},bv);assert.equal(x.r.status,400);
  x=await rput(ex.recipes,{note:'계좌'},bv);assert.equal(x.r.status,400);
  x=await rput(ex.recipes,{proposalIds:['zz']},bv);assert.equal(x.r.status,400);
  x=await adm('PUT','/api/admin/content/recipes',{data:ex.recipes});assert.equal(x.r.status,400);
  const bigR=rm(d=>{d.appetizers=[];for(let i=0;i<48;i++)d.appetizers.push({id:'big'+i,name:'큰 항목 '+i,ingredients:[],steps:Array(30).fill('a'.repeat(295))});});
  x=await rput(bigR,{},bv);assert.equal(x.r.status,400,JSON.stringify(x.d).slice(0,200));assert.match(x.d.error,/총 크기 400KB/);
  x=await adm('PUT','/api/admin/content/recipes',{data:bigR,baseVersion:bv,pad:'x'.repeat(100000)});assert.equal(x.r.status,413);
  // 응대 멘트 검증
  const pm=(f)=>{const d=extracted().phrases;f(d);return d;};
  const pput=(d,extra={},b0=1)=>adm('PUT','/api/admin/content/phrases',{data:d,baseVersion:b0,...extra});
  const pr=[
   ['줄 종류',d=>{d.sections[0].items[0].lines[0].kind='x';}],['줄 없음',d=>{d.sections[0].items[0].lines=[];}],['줄 13개',d=>{d.sections[0].items[0].lines=Array(13).fill({kind:'staff',text:'안내'});}],['빈 문구',d=>{d.sections[0].items[0].lines[0].text='';}],
   ['금칙어',d=>{d.sections[0].items[0].lines[0].text='시급 안내';}],['상황 길이',d=>{d.sections[0].items[0].situation='가'.repeat(101);}],['id 중복',d=>{d.sections[1].items[0].id=d.sections[0].items[0].id;}],['알 수 없는 키',d=>{d.sections[0].items[0].lines[0].x=1;}],['소제목 없음',d=>{d.sections=[];}],['섹션 id 중복',d=>{d.sections[1].id=d.sections[0].id;}],
  ];
  for(const [name,f] of pr){x=await pput(pm(f));assert.equal(x.r.status,400,name+' '+JSON.stringify(x.d));assert(x.d.details[0].path,name);}
  x=await pput(pm(d=>{const it=d.sections[0].items[0];it.lines[0].text='첫 줄 수정';it.lines.push({kind:'staff',text:'직원 안내 추가'});d.sections[0].items.splice(1,1);}),{},1);assert.equal(x.r.status,200,JSON.stringify(x.d));assert.equal(x.d.version,2);assert.match(x.d.summary,/수정 1 · 추가 0 · 삭제 1/);
  x=await adm('POST','/api/admin/content/phrases/restore',{version:1,baseVersion:2});assert.equal(x.r.status,200);assert.equal(x.d.version,3);
  for(let i=0;i<22;i++){const d=pm(dd=>{dd.sections[0].items[0].note='반복 '+i;});x=await pput(d,{},3+i);assert.equal(x.r.status,200);}
  x=await adm('GET','/api/admin/content/phrases');assert.equal(x.d.versions.length,20);assert.equal(x.d.versions[0].version,25);assert.equal(x.d.versions.at(-1).version,6);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM content_versions WHERE kind='phrases'").get().n,20);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM content_versions WHERE kind='recipes'").get().n,4);
  // 사진: 정상
  x=await raw('POST','/api/admin/photo',jpeg(800,600,50000),{token});let d=await x.json();assert.equal(x.status,201,JSON.stringify(d));assert.match(d.photoId,/^[a-f0-9]{24}$/);assert.equal(d.width,800);const p1=d.photoId;
  x=await raw('POST','/api/admin/photo',png(640,480),{token,type:'image/png'});d=await x.json();assert.equal(x.status,201,JSON.stringify(d));const p2=d.photoId;
  x=await raw('POST','/api/admin/photo',webp(800,800),{token,type:'image/webp'});d=await x.json();assert.equal(x.status,201,JSON.stringify(d));const p3=d.photoId;
  assert.notEqual(p1,p2);
  // 공개 조회: Origin 없음(이미지 태그)·허용 출처 모두 가능, 다른 출처 거부
  let pr1=await raw('GET','/api/photo/'+p1,undefined,{origin:null,type:undefined});assert.equal(pr1.status,200);assert.equal(pr1.headers.get('content-type'),'image/jpeg');assert.equal(pr1.headers.get('cache-control'),'public, max-age=86400');assert.equal(pr1.headers.get('x-content-type-options'),'nosniff');
  assert.deepEqual(Buffer.from(await pr1.arrayBuffer()),jpeg(800,600,50000));
  pr1=await raw('GET','/api/photo/'+p2,undefined,{type:undefined});assert.equal(pr1.status,200);assert.equal(pr1.headers.get('content-type'),'image/png');
  pr1=await raw('GET','/api/photo/'+p3,undefined,{origin:null,type:undefined});assert.equal(pr1.headers.get('content-type'),'image/webp');
  pr1=await raw('GET','/api/photo/'+p1,undefined,{origin:'https://attacker.example',type:undefined});assert.equal(pr1.status,403);
  pr1=await raw('GET','/api/photo/'+'f'.repeat(24),undefined,{origin:null,type:undefined});assert.equal(pr1.status,404);
  pr1=await raw('GET','/api/photo/not-an-id',undefined,{origin:null,type:undefined});assert.equal(pr1.status,404);
  pr1=await raw('POST','/api/photo/'+p1,undefined,{origin:null,type:undefined});assert.equal(pr1.status,403);
  // 사진: 거부
  const rej=async(label,bytes,type,status)=>{const r=await raw('POST','/api/admin/photo',bytes,{token,type});assert.equal(r.status,status,label+' '+JSON.stringify(await r.json()));};
  await rej('확장자만 위조(텍스트)',Buffer.from('이건 사진이 아님 '.repeat(50)),'image/jpeg',400);
  await rej('형식 불일치(PNG를 JPEG로)',png(100,100),'image/jpeg',400);
  await rej('형식 불일치(JPEG를 WebP로)',jpeg(100,100),'image/webp',400);
  await rej('GIF',Buffer.concat([Buffer.from('GIF89a'),Buffer.alloc(100)]),'image/gif',400);
  await rej('SVG',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),'image/svg+xml',400);
  await rej('HTML을 이미지로',Buffer.from('<html><script>alert(1)</script></html>'),'image/png',400);
  await rej('300KB 초과',jpeg(800,600,300*1024+1),'image/jpeg',413);
  await rej('빈 본문',Buffer.alloc(0),'image/jpeg',400);
  await rej('가로 1601px',jpeg(1601,900),'image/jpeg',400);
  await rej('PNG 가로 2000px',png(2000,100),'image/png',400);
  await rej('크기 0',jpeg(0,0),'image/jpeg',400);
  await rej('이미지가 아닌 content-type',jpeg(100,100),'application/octet-stream',400);
  await rej('가로 1600px는 허용 직전',jpeg(1600,1000),'image/jpeg',201);
  x=await raw('POST','/api/admin/photo',jpeg(800,600,300*1024),{token});assert.equal(x.status,201,'정확히 300KB는 허용');const p300=(await x.json()).photoId;
  // 총량 상한
  const n0=db.prepare('SELECT COUNT(*) AS n FROM photos').get().n;
  for(let i=n0;i<40;i++)db.prepare('INSERT INTO photos(id,mime,data,size,created_at) VALUES (?,?,?,?,?)').run('c'.repeat(23)+String.fromCharCode(97+(i%26))+i,'image/jpeg',new Uint8Array(4),4,Date.now());
  x=await raw('POST','/api/admin/photo',jpeg(100,100),{token});d=await x.json();assert.equal(x.status,409,JSON.stringify(d));assert.match(d.error,/한도/);
  db.exec("DELETE FROM photos WHERE id LIKE 'cccccccc%'");
  db.prepare('INSERT INTO photos(id,mime,data,size,created_at) VALUES (?,?,?,?,?)').run('d'.repeat(24),'image/jpeg',new Uint8Array(4),10*1024*1024-1000,Date.now());
  x=await raw('POST','/api/admin/photo',jpeg(100,100,5000),{token});assert.equal(x.status,409);
  db.exec("DELETE FROM photos WHERE id='"+'d'.repeat(24)+"'");
  x=await raw('POST','/api/admin/photo',jpeg(100,100,5000),{token});assert.equal(x.status,201);const p4=(await x.json()).photoId;
  // 레시피가 사진 참조: 발행 -> 삭제 거부 -> 참조 해제 후 삭제
  const withPhoto=(id)=>rm(dd=>{dd.appetizers[0].photoId=id;dd.cocktails[0].photoId=id;});
  x=await rput(withPhoto(p1),{},bv);assert.equal(x.r.status,200,JSON.stringify(x.d));const vPhoto=x.d.version;assert.match(x.d.summary,/사진 2/);
  x=await api('GET','/api/content/recipes');assert.equal(x.d.data.appetizers[0].photoId,p1);
  x=await raw('DELETE','/api/admin/photo/'+p1,undefined,{token,type:undefined});d=await x.json();assert.equal(x.status,409,JSON.stringify(d));
  assert.equal((await raw('GET','/api/photo/'+p1,undefined,{origin:null,type:undefined})).status,200);
  x=await raw('DELETE','/api/admin/photo/'+p2,undefined,{token,type:undefined});assert.equal(x.status,200);
  assert.equal((await raw('GET','/api/photo/'+p2,undefined,{origin:null,type:undefined})).status,404);
  x=await raw('DELETE','/api/admin/photo/'+p2,undefined,{token,type:undefined});assert.equal(x.status,404);
  x=await raw('DELETE','/api/admin/photo/zz',undefined,{token,type:undefined});assert.equal(x.status,400);
  x=await rput(rm(()=>{}),{},vPhoto);assert.equal(x.r.status,200);const vNone=x.d.version;
  x=await raw('DELETE','/api/admin/photo/'+p1,undefined,{token,type:undefined});assert.equal(x.status,200);
  // 삭제된 사진을 참조하던 옛 버전 복원: 사진 번호만 빼고 복원
  x=await adm('POST','/api/admin/content/recipes/restore',{version:vPhoto,baseVersion:vNone});assert.equal(x.r.status,200,JSON.stringify(x.d));assert.equal(x.d.photosDropped,2);
  x=await api('GET','/api/content/recipes');assert.equal(x.d.data.appetizers[0].photoId,undefined);
  // 제안
  const prop=(b,ip='5.5.5.5',origin=ORIGIN)=>api('POST','/api/proposals',b,{ip,origin});
  x=await prop({kind:'recipes',targetId:ex.recipes.appetizers[0].id,targetLabel:'레시피 · 치즈 플레이트 · 만드는 순서',type:'edit',current:'현재 문구',proposed:'제안 문구',reason:'순서가 다름',nickname:'하늘'});
  assert.equal(x.r.status,201,JSON.stringify(x.d));assert.equal(x.d.ok,true);assert.match(x.d.id,/^[a-f0-9]{16}$/);assert.equal(x.r.headers.get('access-control-allow-origin'),ORIGIN);const prop1=x.d.id;
  x=await prop({kind:'phrases',targetId:'p1',type:'delete',targetLabel:'멘트 삭제'},'5.5.5.6');assert.equal(x.r.status,201);const prop2=x.d.id;
  x=await prop({kind:'checklist',targetId:'o1234abcd',type:'move',proposed:'위로 이동',targetLabel:'체크리스트'},'5.5.5.7');assert.equal(x.r.status,201);const prop3=x.d.id;
  x=await prop({kind:'checklist',type:'add',proposed:'새 항목 제안',targetLabel:'오픈 · 소제목'},'5.5.5.8');assert.equal(x.r.status,201,JSON.stringify(x.d));
  const badP=[['kind',{kind:'x',targetId:'a',type:'edit',proposed:'a'}],['type',{kind:'recipes',targetId:'a',type:'rename',proposed:'a'}],['제안 문구 없음',{kind:'recipes',targetId:'a',type:'edit'}],['대상 번호 없음',{kind:'recipes',type:'edit',proposed:'a'}],['대상 번호 형식',{kind:'recipes',targetId:'a b<',type:'edit',proposed:'a'}],
   ['길이 501',{kind:'recipes',targetId:'a',type:'edit',proposed:'가'.repeat(501)}],['이유 501',{kind:'recipes',targetId:'a',type:'edit',proposed:'a',reason:'가'.repeat(501)}],['라벨 201',{kind:'recipes',targetId:'a',type:'edit',proposed:'a',targetLabel:'가'.repeat(201)}],['별명 21',{kind:'recipes',targetId:'a',type:'edit',proposed:'a',nickname:'가'.repeat(21)}],
   ['금칙어',{kind:'recipes',targetId:'a',type:'edit',proposed:'도매가 얼마'}],['전화',{kind:'recipes',targetId:'a',type:'edit',proposed:'a',reason:'010-1234-5678'}],['이메일',{kind:'recipes',targetId:'a',type:'edit',proposed:'a',nickname:'a@b.com'}],['숫자열',{kind:'recipes',targetId:'a',type:'edit',proposed:'123456789012'}],
   ['문자 아닌 값',{kind:'recipes',targetId:'a',type:'edit',proposed:5}]];
  let bi=0;for(const [name,b] of badP){x=await prop(b,'5.6.1.'+(bi++));assert.equal(x.r.status,400,name+' '+JSON.stringify(x.d));assert(x.d.error&&x.d.details[0].path,name);}
  x=await prop({kind:'recipes',targetId:'a',type:'edit',proposed:'도매가'},'5.5.6.2');assert.match(x.d.error,/금칙어/);
  x=await api('POST','/api/proposals',{kind:'recipes',targetId:'a',type:'edit',proposed:'a'},{ip:'5.5.6.3',origin:'https://attacker.example'});assert.equal(x.r.status,403);
  x=await api('POST','/api/proposals',{kind:'recipes',targetId:'a',type:'edit',proposed:'a'},{ip:'5.5.6.3',origin:null});assert.equal(x.r.status,403);
  x=await api('GET','/api/proposals');assert.equal(x.r.status,404);
  x=await api('POST','/api/proposals',{kind:'recipes',targetId:'a',type:'edit',proposed:'a'},{ip:'5.5.6.3',e:{...env}});assert.equal(x.r.status,503);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM proposals').get().n,4,'거부된 제안은 저장 안 됨');
  // 저장 내용에 IP·원본 헤더 없음
  assert(!JSON.stringify(db.prepare('SELECT * FROM proposals').all()).match(/5\.5\.5\./));assert(!JSON.stringify(db.prepare('SELECT * FROM proposal_attempts').all()).match(/5\.5\.\d\.\d/));
  assert.deepEqual(db.prepare("PRAGMA table_info(proposals)").all().map(c=>c.name).filter(n=>/ip|header|agent/i.test(n)),[]);
  // 횟수 제한: 10분 10건(bad 시도 포함), 같은 IP 429·다른 IP 영향 없음
  for(let i=0;i<10;i++){x=await prop({kind:'recipes',targetId:'a',type:'edit',proposed:'문구 '+i},'6.6.6.6');assert.equal(x.r.status,201,'#'+i);}
  x=await prop({kind:'recipes',targetId:'a',type:'edit',proposed:'열한 번째'},'6.6.6.6');assert.equal(x.r.status,429);assert.match(x.d.error,/분 뒤/);assert(x.r.headers.get('retry-after'));
  x=await prop({kind:'recipes',targetId:'a',type:'edit',proposed:'다른 사람'},'6.6.6.7');assert.equal(x.r.status,201);
  {const rn=Date.now;try{
   // 하루 40건: 11분씩 건너뛰며 10건씩 4회 -> 41번째는 창이 비어도 하루 한도로 429
   for(let k=1;k<=3;k++){Date.now=()=>rn()+k*11*60000;for(let i=0;i<10;i++){x=await prop({kind:'recipes',targetId:'a',type:'edit',proposed:'일일 '+k+'-'+i},'6.6.6.6');assert.equal(x.r.status,201,'k'+k+' #'+i);}}
   Date.now=()=>rn()+4*11*60000;x=await prop({kind:'recipes',targetId:'a',type:'edit',proposed:'하루 초과'},'6.6.6.6');assert.equal(x.r.status,429,'하루 40건 초과');
   Date.now=()=>rn()+25*3600*1000;x=await prop({kind:'recipes',targetId:'a',type:'edit',proposed:'하루 뒤'},'6.6.6.6');assert.equal(x.r.status,201);
  }finally{Date.now=rn;}}
  // 대기 500건 상한
  {const before=db.prepare("SELECT COUNT(*) AS n FROM proposals WHERE status='pending'").get().n;
   for(let i=before;i<500;i++)db.prepare("INSERT INTO proposals(id,kind,target_id,type,status,created_at) VALUES (?,?,?,?,?,?)").run('e'+String(i).padStart(15,'0'),'recipes','a','edit','pending',Date.now());
   x=await prop({kind:'recipes',targetId:'a',type:'edit',proposed:'가득 참'},'7.7.7.7');assert.equal(x.r.status,503);
   db.exec("DELETE FROM proposals WHERE id LIKE 'e0%'");}
  // 관리자 목록·결정
  x=await adm('GET','/api/admin/proposals');assert.equal(x.r.status,200);assert.equal(x.r.headers.get('cache-control'),'no-store');
  assert(x.d.proposals.length>=4&&x.d.proposals.every(p=>p.status==='pending'));assert.equal(x.d.pendingCount,x.d.counts.pending);
  assert(x.d.proposals.every((p,i,a)=>i===0||a[i-1].createdAt>=p.createdAt));
  const first=x.d.proposals.find(p=>p.id===prop1);assert.deepEqual(Object.keys(first).sort(),['appliedVersion','createdAt','current','decidedAt','decidedBy','decisionReason','id','kind','nickname','proposed','reason','status','targetId','targetLabel','type']);
  assert.equal(first.proposed,'제안 문구');assert.equal(first.nickname,'하늘');assert.equal(first.kind,'recipes');
  x=await adm('GET','/api/admin/proposals?status=bad');assert.equal(x.r.status,400);
  x=await adm('POST','/api/admin/proposals/'+prop2+'/decide',{status:'rejected',reason:'지금은 유지',decidedBy:'점장'});assert.equal(x.r.status,200);assert.equal(x.d.proposal.status,'rejected');assert.equal(x.d.proposal.decisionReason,'지금은 유지');assert.equal(x.d.proposal.decidedBy,'점장');
  x=await adm('GET','/api/admin/proposals?status=rejected');assert.deepEqual(x.d.proposals.map(p=>p.id),[prop2]);
  x=await adm('GET','/api/admin/proposals?status=all');assert(x.d.proposals.length>=4);
  x=await adm('POST','/api/admin/proposals/'+prop2+'/decide',{status:'pending'});assert.equal(x.d.proposal.status,'pending');assert.equal(x.d.proposal.decisionReason,'');assert.equal(x.d.proposal.decidedAt,null);
  x=await adm('POST','/api/admin/proposals/'+prop3+'/decide',{status:'applied',appliedVersion:30,decidedBy:'점장'});assert.equal(x.d.proposal.status,'applied');assert.equal(x.d.proposal.appliedVersion,30);
  x=await adm('POST','/api/admin/proposals/'+prop3+'/decide',{status:'maybe'});assert.equal(x.r.status,400);
  x=await adm('POST','/api/admin/proposals/'+prop3+'/decide',{status:'rejected',reason:'급여 때문'});assert.equal(x.r.status,400);
  x=await adm('POST','/api/admin/proposals/0123456789abcdef/decide',{status:'rejected'});assert.equal(x.r.status,404);
  x=await adm('POST','/api/admin/proposals/zz/decide',{status:'rejected'});assert.equal(x.r.status,400);
  // 발행 시 proposalIds -> applied (같은 종류만)
  x=await adm('GET','/api/admin/content/recipes');const cb=x.d.current.version;
  x=await rput(rm(dd=>{dd.appetizers[0].steps[0]='제안 반영 문구.';}),{nickname:'점장',proposalIds:[prop1,prop2]},cb);assert.equal(x.r.status,200,JSON.stringify(x.d));assert.equal(x.d.proposalsApplied,1,'recipes 종류 제안만 반영 표시');const appliedV=x.d.version;
  x=await adm('GET','/api/admin/proposals?status=applied');const ap=x.d.proposals.find(p=>p.id===prop1);assert.equal(ap.appliedVersion,appliedV);assert.equal(ap.decidedBy,'점장');
  x=await adm('GET','/api/admin/proposals?status=pending');assert(x.d.proposals.some(p=>p.id===prop2),'멘트 제안은 레시피 발행으로 바뀌지 않음');
  // CORS
  for(const p of ['/api/proposals','/api/admin/photo','/api/admin/photo/'+'a'.repeat(24),'/api/admin/content/recipes','/api/admin/proposals/'+prop1+'/decide','/api/content/recipes','/api/photo/'+p3]){
   const o=await worker.fetch(new Request('https://worker.test'+p,{method:'OPTIONS',headers:{Origin:ORIGIN,'access-control-request-method':'POST'}}),aenv);assert.equal(o.status,204,p);assert.equal(o.headers.get('access-control-allow-origin'),ORIGIN);assert.match(o.headers.get('access-control-allow-methods'),/DELETE/);assert.match(o.headers.get('access-control-allow-headers'),/content-type, authorization/);
   const bad=await worker.fetch(new Request('https://worker.test'+p,{method:'OPTIONS',headers:{Origin:'https://attacker.example','access-control-request-method':'POST'}}),aenv);assert.equal(bad.status,403,p);assert.equal(bad.headers.get('access-control-allow-origin'),ORIGIN,'허용 출처 외에는 와일드카드 아님');
  }
  x=await adm('GET','/api/admin/content/recipes');assert.equal(x.r.headers.get('access-control-allow-origin'),ORIGIN);assert.notEqual(x.r.headers.get('access-control-allow-origin'),'*');
  // cron 정리
  {
   const old=Date.now()-8*86400000;
   for(const [id,when] of [['1'.repeat(24),old],['2'.repeat(24),old],['3'.repeat(24),Date.now()-6*86400000]])db.prepare('INSERT INTO photos(id,mime,data,size,created_at) VALUES (?,?,?,?,?)').run(id,'image/jpeg',new Uint8Array(4),4,when);
   x=await adm('GET','/api/admin/content/recipes');const cv=x.d.current.version,cur=x.d.current.data;cur.appetizers[0].photoId='1'.repeat(24);
   x=await rput(cur,{},cv);assert.equal(x.r.status,200,JSON.stringify(x.d));
   const dayOld=Date.now()-31*86400000;
   db.prepare("INSERT INTO proposals(id,kind,target_id,type,status,created_at,decided_at) VALUES ('a000000000000001','recipes','a','edit','rejected',?,?)").run(dayOld,dayOld);
   db.prepare("INSERT INTO proposals(id,kind,target_id,type,status,created_at,decided_at) VALUES ('a000000000000002','recipes','a','edit','applied',?,?)").run(dayOld,Date.now()-86400000);
   db.prepare("INSERT INTO proposals(id,kind,target_id,type,status,created_at) VALUES ('a000000000000003','recipes','a','edit','pending',?)").run(dayOld);
   db.prepare('INSERT INTO proposal_attempts(key,at) VALUES (?,?)').run('old',Date.now()-2*86400000);
   db.prepare('INSERT INTO shift_receipts(id,payload_hash,state,created_at) VALUES (?,?,?,?)').run('old-receipt','h','confirmed',Date.now()-200*86400000);
   const e2={...aenv,SHEETS_LOG_URL:undefined,SHEETS_LOG_TOKEN:undefined};
   // 사진 테이블이 깨져도 다른 정리는 계속된다
   db.exec('ALTER TABLE photos RENAME TO photos_x');await worker.scheduled({},e2);db.exec('ALTER TABLE photos_x RENAME TO photos');
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM proposals WHERE id='a000000000000001'").get().n,0,'30일 지난 반려 제안 정리');
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM shift_receipts WHERE id='old-receipt'").get().n,0,'기존 정리는 그대로 동작');
   await worker.scheduled({},e2);
   const has=id=>db.prepare('SELECT COUNT(*) AS n FROM photos WHERE id=?').get(id).n;
   assert.equal(has('2'.repeat(24)),0,'7일 지난 미참조 사진 정리');assert.equal(has('1'.repeat(24)),1,'참조 중인 사진 유지');assert.equal(has('3'.repeat(24)),1,'7일 안 된 사진 유지');
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM proposals WHERE id='a000000000000002'").get().n,1,'30일 안 된 완료 제안 유지');assert.equal(db.prepare("SELECT COUNT(*) AS n FROM proposals WHERE id='a000000000000003'").get().n,1,'대기 제안은 유지');
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM proposal_attempts WHERE key='old'").get().n,0);
  }
  // 응답·저장에 비밀번호 없음
  assert(!JSON.stringify(db.prepare('SELECT * FROM content_versions').all()).includes(PW));
 }
 // 기존 엔드포인트 유지
 const before=global.fetch;global.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'• 확인'}]}}]}),{status:200});
 try{x=await api('POST','/api/chat',{question:'오픈 순서',context:'오픈 확인'});assert.equal(x.r.status,200);assert.equal(x.d.text,'• 확인');
  x=await api('GET','/api/chat');assert.equal(x.r.status,404);}finally{global.fetch=before;}
 console.log('체크리스트·콘텐츠·사진·제안 어드민: 로그인·시도 제한·토큰 만료/위조·저장 검증·409·복원·20개 유지·CORS·기존 /api/chat 유지 통과');
}).then(()=>require('./inventory_test.js')).then(()=>require('./training_test.js')).then(()=>require('./kitchen_test.js')).then(()=>require('./reports_test.js')).catch(e=>{console.error(e);process.exitCode=1;});
