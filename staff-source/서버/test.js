const assert=require('node:assert/strict');const worker=require('./index.js').default;
const queries=[];
const db={
  prepare(sql){
    const statement={bind(...values){statement.values=values;return statement;},run:async()=>{queries.push({sql,values:statement.values||[]});return {success:true};}};
    return statement;
  }
};
const env={GEMINI_API_KEY:'test-key',QUESTION_LOG:db,AI_LIMITER:{async limit(){return{success:true};}}};
async function call(path,body,origin='https://fastkorea12-png.github.io',method='POST'){
 const request=new Request('https://worker.test'+path,{method,headers:{Origin:origin,'content-type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined});return worker.fetch(request,env);
}
(async()=>{
 let r=await call('/api/chat',{question:'오픈 순서 알려줘',context:'오픈 준비 확인'},'https://attacker.example');assert.equal(r.status,403);
 r=await call('/api/questions',{question:'전화 010-1234-5678',consent:true});let d=await r.json();assert.equal(d.saved,false);assert.equal(queries.length,0);
 r=await call('/api/questions',{question:'오픈 준비 순서',consent:false});assert.equal(r.status,400);assert.equal(queries.length,0);
 r=await call('/api/questions',{question:'오픈 준비 순서',consent:true,category:'오픈'});assert.equal(r.status,201);assert.match(queries[0].sql,/INSERT INTO question_log/);assert.match(queries[1].sql,/90 days/);
 let upstreamRequest;const before=global.fetch;global.fetch=async(url,options)=>{upstreamRequest={url,options};return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'• 오픈 순서입니다.'}]}}]}),{status:200,headers:{'content-type':'application/json'}});};
 try{r=await call('/api/chat',{question:'재고가 있나요?',context:'금지 수량 12345',messages:[]});d=await r.json();assert.equal(d.text.includes('재고 관련 내용'),true);assert.equal(upstreamRequest,undefined);r=await call('/api/chat',{question:'오픈 준비 순서',context:'오픈 확인 항목',messages:[{role:'user',text:'오늘 오픈 준비는?'},{role:'model',text:'오픈 체크리스트를 확인해요.'},{role:'user',text:'오픈 준비 순서'}]});d=await r.json();assert.equal(r.status,200);assert.match(upstreamRequest.url,/gemini-3\.1-flash-lite:generateContent/);assert.equal(upstreamRequest.options.headers['x-goog-api-key'],'test-key');assert.equal(JSON.parse(upstreamRequest.options.body).contents.length,3);assert.match(JSON.parse(upstreamRequest.options.body).systemInstruction.parts[0].text,/급여·계좌·매입가/);assert.equal(d.text,'• 오픈 순서입니다.');}finally{global.fetch=before;}
 console.log('Gemini 프록시·출처 검사·비밀 키 헤더·질문 동의/필터·90일 보존 점검 통과');
})().catch(e=>{console.error(e);process.exitCode=1;});
