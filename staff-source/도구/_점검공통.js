// 직원 화면 점검 공통: 서버 모의(미발행)와 허용 외부 경로. 실제 서버로는 어떤 요청도 보내지 않는다.
const BASE='https://haragogipe-staff-ai.haragogipe-staff-ai-worker.workers.dev';
const ALLOWED=[BASE+'/api/checklist',BASE+'/api/content/recipes',BASE+'/api/content/phrases',BASE+'/api/proposals',BASE+'/api/training'];
const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'GET, POST, OPTIONS'};
// 체크리스트·레시피·응대 멘트는 미발행으로, 제안 접수(/api/proposals)는 기본 503으로 답한다(opts.proposal={status,body}로 바꿈). 보낸 제안 본문은 반환값 posts에 쌓인다.
async function stub(page,opts){
  opts=opts||{};const posts=[];
  await page.route(u=>ALLOWED.slice(0,3).includes(u.href.split('?')[0]),r=>r.fulfill({status:200,contentType:'application/json',headers:CORS,body:'{"published":false}'}));
  await page.route(BASE+'/api/proposals',r=>{
    const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:CORS});
    posts.push(JSON.parse(req.postData()||'{}'));const p=opts.proposal||{status:503,body:{error:'점검용 모의 서버'}};
    r.fulfill({status:p.status,contentType:'application/json',headers:CORS,body:JSON.stringify(p.body)});
  });
  return {posts};
}
module.exports={BASE,ALLOWED,CORS,stub};
