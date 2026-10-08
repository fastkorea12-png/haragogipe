const assert=require('node:assert/strict');const worker=require('./index.js').default;
const records=[];const env={GEMINI_API_KEY:'test-key',SHEETS_LOG_URL:'https://script.google.com/macros/s/test/exec',SHEETS_LOG_TOKEN:'server-test-token',AI_LIMITER:{async limit(){return{success:true};}}};
async function call(path,body,origin='https://fastkorea12-png.github.io',method='POST'){
 const request=new Request('https://worker.test'+path,{method,headers:{Origin:origin,'content-type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined});return worker.fetch(request,env);
}
(async()=>{
 let r=await call('/api/chat',{question:'오픈 순서 알려줘',context:'오픈 준비 확인'},'https://attacker.example');assert.equal(r.status,403);
 const before=global.fetch;let upstreamRequest,transientFailures=0,attempts=0;
 global.fetch=async(url,options)=>{
  if(String(url).startsWith('https://script.google.com/')){const payload=JSON.parse(options.body);records.push(payload);return new Response(JSON.stringify({ok:true,saved:true}),{status:200,headers:{'content-type':'application/json'}});}
  upstreamRequest={url,options};attempts++;
  if(transientFailures>0){transientFailures--;return new Response(JSON.stringify({error:{status:'UNAVAILABLE'}}),{status:503});}
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'• 오픈 순서입니다.'}]}}]}),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  r=await call('/api/questions',{question:'전화 010-1234-5678',consent:true});let d=await r.json();assert.equal(d.saved,false);assert.equal(records.length,0);
  r=await call('/api/questions',{question:'홍길동님 근무 순서 알려줘',consent:true});d=await r.json();assert.equal(d.saved,false);assert.equal(records.length,0);
  r=await call('/api/questions',{question:'오픈 준비 순서',consent:false});assert.equal(r.status,400);assert.equal(records.length,0);
  r=await call('/api/questions',{question:'오픈 준비 순서',consent:true,category:'오픈'});d=await r.json();assert.equal(r.status,201);assert.equal(d.retentionDays,90);assert.equal(records.length,1);assert.equal(records[0].action,'append');assert.equal(records[0].token,'server-test-token');assert.equal(records[0].question,'오픈 준비 순서');
  r=await call('/api/chat',{question:'재고가 있나요?',context:'금지 수량 12345',messages:[]});d=await r.json();assert.match(d.text,/재고 관련 내용/);assert.equal(upstreamRequest,undefined);
  r=await call('/api/chat',{question:'홍길동님 근무 순서 알려줘',context:'오픈 확인',messages:[]});d=await r.json();assert.match(d.text,/개인정보/);assert.equal(upstreamRequest,undefined);
  r=await call('/api/chat',{question:'오픈 준비 순서',context:'오픈 확인 항목',messages:[{role:'user',text:'오늘 오픈 준비는?'},{role:'model',text:'오픈 체크리스트를 확인해요.'},{role:'user',text:'오픈 준비 순서'}]});d=await r.json();assert.equal(r.status,200);assert.match(upstreamRequest.url,/gemini-3\.1-flash-lite:generateContent/);assert.equal(upstreamRequest.options.headers['x-goog-api-key'],'test-key');assert.equal(JSON.parse(upstreamRequest.options.body).contents.length,3);assert.match(JSON.parse(upstreamRequest.options.body).systemInstruction.parts[0].text,/급여·계좌·매입가/);assert.equal(d.text,'• 오픈 순서입니다.');
  transientFailures=1;const beforeRetry=attempts;r=await call('/api/chat',{question:'오픈 순서',context:'오픈 확인'});assert.equal(r.status,200);assert.equal(attempts-beforeRetry,2);
  transientFailures=3;const beforeFailure=attempts;r=await call('/api/chat',{question:'오픈 순서',context:'오픈 확인'});assert.equal(r.status,503);assert.equal(attempts-beforeFailure,2);
  await worker.scheduled({},env);assert.equal(records.at(-1).action,'cleanup');
 }finally{global.fetch=before;}
 console.log('Gemini 프록시·출처 검사·비밀 키 헤더·시트 질문 동의/개인정보 차단·90일 정리 호출 통과');
})().catch(e=>{console.error(e);process.exitCode=1;});
