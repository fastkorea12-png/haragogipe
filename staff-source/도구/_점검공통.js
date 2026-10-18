// 직원 화면 점검 공통: 서버 모의(미발행)와 허용 외부 경로. 실제 서버로는 어떤 요청도 보내지 않는다.
const BASE='https://haragogipe-staff-ai.haragogipe-staff-ai-worker.workers.dev';
const ALLOWED=[BASE+'/api/checklist',BASE+'/api/content/recipes',BASE+'/api/content/phrases',BASE+'/api/proposals',BASE+'/api/training',BASE+'/api/training/trainees'];
const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'GET, POST, OPTIONS'};
// 체크리스트·레시피·응대 멘트는 미발행으로, 신입 교육 목록은 빈 목록으로, 제안 접수(/api/proposals)는 기본 503으로 답한다(opts.proposal={status,body}로 바꿈). 보낸 제안 본문은 반환값 posts에 쌓인다.
async function stub(page,opts){
  opts=opts||{};const posts=[];
  await page.route(u=>ALLOWED.slice(0,3).includes(u.href.split('?')[0]),r=>r.fulfill({status:200,contentType:'application/json',headers:CORS,body:'{"published":false}'}));
  await page.route(BASE+'/api/proposals',r=>{
    const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:CORS});
    posts.push(JSON.parse(req.postData()||'{}'));const p=opts.proposal||{status:503,body:{error:'점검용 모의 서버'}};
    r.fulfill({status:p.status,contentType:'application/json',headers:CORS,body:JSON.stringify(p.body)});
  });
  // 신입 교육: 교육생 목록은 빈 목록, 등록·기록은 503(점검마다 page.route로 덮어쓸 수 있음, 나중에 건 route가 먼저 적용됨)
  await page.route(BASE+'/api/training/trainees',r=>{const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:CORS});r.fulfill({status:req.method()==='GET'?200:503,contentType:'application/json',headers:CORS,body:req.method()==='GET'?'{"trainees":[]}':'{"registered":false}'});});
  await page.route(BASE+'/api/training',r=>{const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:CORS});r.fulfill({status:503,contentType:'application/json',headers:CORS,body:'{"saved":false}'});});
  return {posts};
}
module.exports={BASE,ALLOWED,CORS,stub};
