const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),'utf8'));
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'근무노트.html'),'utf8').match(/<script>([\s\S]*)<\/script>/)[1],ctx);
const baseline=read('기존38_맛점수_1011.json'),dossier=read('웹추정_맛점수_1011.json'),menu=read('메뉴판_허용자료_1008.json');
const results=[],check=(name,condition)=>{assert.ok(condition,name);results.push({name,pass:true});};
check('메뉴66종·단종2종 제외',menu.rows.filter(r=>/wine/i.test(r.values[0])).length===66&&!menu.rows.some(r=>/미션 리즐링|킬리빙빙 스윗 하트 샤도네이/.test(r.values[2])));
check('기존38종의 네 점수 유지',baseline.length===38&&baseline.every(b=>{const w=ctx.WINE_DATA.find(w=>w.name===b.name);return w&&w.scoreSource!=='web-estimate'&&['sweetness','acidity','tannin','body'].every(k=>w[k]===b[k]);}));
check('레드·화이트·스파클링 보정5종 네축 ±1',read('웹추정_보정_1011.json').length>=5&&read('웹추정_보정_1011.json').every(c=>c.estimated.every((x,i)=>Math.abs(x-c.original[i])<=1)&&c.urls.length));
const web=ctx.WINE_DATA.filter(w=>w.scoreSource==='web-estimate');
check('원문41종+웹추정11종',ctx.WINE_DATA.length===52&&web.length===11);
check('웹추정 필수 출처·일자·확신도·메뉴 연결',web.every(w=>w.scoreSources.length>=1&&w.scoreSources.length<=3&&w.scoreSources.every(u=>/^https:\/\//.test(u))&&w.scoredAt==='2026-10-11'&&w.scoreConfidence==='중간'&&menu.rows.some(m=>m.row===w.menuRow&&m.values[2].trim()===w.name)));
check('낮음14종은 추천에서 제외',dossier.targets.filter(t=>t.status==='excluded').length===14&&dossier.targets.filter(t=>t.status==='excluded').every(t=>t.score===null&&!ctx.WINE_DATA.some(w=>w.name===t.name)));
check('새메뉴3종은 기존 허용 원문 점수 연결',dossier.targets.filter(t=>t.status==='existing-source').length===3&&dossier.targets.filter(t=>t.status==='existing-source').every(t=>ctx.WINE_DATA.some(w=>w.name===t.name&&w.scoreSource!=='web-estimate')));
for(const q of ['진판델이랑 비슷한 와인','피노누아랑 비슷한 와인','말벡 같은 와인']){
 const a=ctx.answer(q);check(q+'에서 신규 연결 와인 포함',a.wines?.some(w=>dossier.targets.some(t=>t.status!=='excluded'&&t.name===w.name)));
 check(q+'에서 각 웹추정 와인 줄에 표시',a.wines?.filter(w=>w.scoreSource==='web-estimate').every(w=>a.text.split('\n').some(l=>l.includes(w.name)&&l.includes('웹 자료 기준 추정'))));
 results.push({question:q,names:a.wines.map(w=>w.name),text:a.text});
}
check('피노누아 동일 품종 우선',ctx.answer('피노누아랑 비슷한 와인').text.includes('같은 품종 (메뉴판)')&&ctx.answer('피노누아랑 비슷한 와인').wines.some(w=>w.name==='민친버리 피노누아'));
for(const w of web){const a=ctx.answer(w.name+' 맛 점수');check(w.name+' 네 점수 답 각 줄 추정 표시',a.wineFact&&!a.wineAmbiguous&&a.text.split('\n').filter(l=>l.startsWith('• ')).length===4&&a.text.split('\n').filter(l=>l.startsWith('• ')).every(l=>l.includes('웹 자료 기준 추정')));}
const rec=ctx.wineRecommend('타닌 낮은 레드 와인 추천');check('일반 추천 각 웹추정 표시',rec.wines.filter(w=>w.scoreSource==='web-estimate').every(w=>rec.text.split('\n').some(l=>l.includes(w.name)&&l.includes('웹 자료 기준 추정'))));
const guest=fs.readFileSync(path.join(root,'손님용','시안.html'),'utf8');const data=JSON.parse(guest.match(/const WINES\s*=\s*(.*);/)[1]);
check('손님용38종·웹추정 제외',data.length===38&&data.every(w=>baseline.some(b=>b.name===w.name))&&!web.some(w=>data.some(c=>c.name===w.name)));
check('손님용 메뉴번호 정확',data.every(w=>menu.rows.some(m=>m.values[0].trim()===w.originalNumber&&m.values[2].trim()===w.name)));
const template=fs.readFileSync(path.join(__dirname,'템플릿.html'),'utf8');check('직원 카드 추정 배지·출처·빈티지 보기',template.includes("badge.textContent='웹 자료 기준 추정")&&template.includes('추정 근거와 빈티지 보기'));
fs.writeFileSync(path.join(__dirname,'웹추정_점검_결과_1011.json'),JSON.stringify(results,null,2)+'\n');
console.log('웹 추정 '+results.filter(r=>r.pass).length+'개 점검 통과');
