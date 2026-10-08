const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..'),ctx={};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'챗봇_시안.html'),'utf8').match(/<script>([\s\S]*)<\/script>/)[1],ctx);
const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'와인_설명_원본_1008.json'))).values.slice(1);
const checks=[];const check=(name,pass)=>checks.push({name,pass:!!pass});
check('67종 모두 새 설명을 조회',rows.every(row=>ctx.answer(row[1]+' 설명해줘').src.startsWith('12_')));
check('추천 37종의 뉘앙스·설명문이 지정 탭 원문과 일치',ctx.WINE_DATA.every(w=>{const row=rows.find(r=>r[1]===(w.sourceName||w.name));return row&&w.nuance===row[12]&&w.serviceDescription===row[13];}));
const ice=ctx.answer('아이스크림과 어울리는 와인 추천');check('아이스크림 직접 질문에 디저트 페어링 조건 반영',ice.wines?.length>0&&ice.wines.every(w=>ctx.matchesFood(w,'아이스크림')));
for(const [q,key] of [['산도 낮은 화이트 추천','acidity'],['타닌 낮은 레드 추천','tannin']]){
  const a=ctx.answer(q);check(q+'에서 높은 점수 추천 금지',a.wines?a.wines.every(w=>w[key]<=2):a.text===ctx.FALLBACK);
}
check('와인 추천 응대 질문은 운영 안내',ctx.answer('와인 추천을 원하는 손님 응대').src.endsWith('와인 추천을 원하는 손님'));
const serving=ctx.answer('와인 서빙 순서').text;check('와인 서빙의 한 줄 4단계를 분리',serving.includes('\n2)')&&serving.includes('\n4)'));
check('확인 대상 설명 조회가 추천 포함으로 이어지지 않음',!ctx.WINE_DATA.some(w=>['군터록 리즐링','미스터 피에르 피노누아','미션 레이트 하비스트'].includes(w.name)));
fs.writeFileSync(path.join(__dirname,'전반_점검_결과_1008.json'),JSON.stringify(checks,null,2)+'\n');
console.log(checks.filter(x=>x.pass).length+'/'+checks.length+' 통과');if(checks.some(x=>!x.pass))process.exitCode=1;
