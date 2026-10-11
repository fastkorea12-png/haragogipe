// 허용된 두 탭의 스냅샷만 사용한다. 연결은 한글명 일치 또는 유일한 영문명 일치에 한정한다.
const fs=require('fs'),path=require('path');const root=path.join(__dirname,'..');
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'와인_설명_원본_1008.json'),'utf8'));
const menu=JSON.parse(fs.readFileSync(path.join(__dirname,'메뉴판_허용자료_1008.json'),'utf8'));
const estimates=JSON.parse(fs.readFileSync(path.join(__dirname,'웹추정_맛점수_1011.json'),'utf8'));
const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'기존38_맛점수_1011.json'),'utf8'));
const clean=v=>String(v||'').replace(/[\u0000-\u0009\u000b-\u001f]/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').trim();
const english=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const rows=source.values.slice(1).filter(r=>r[1]).map(r=>r.map(clean));
const wines=[],excluded=[],links=[];
for(const m of menu.rows.filter(m=>/wine/i.test(m.values[0]||''))){
  const v=m.values.map(clean);let matches=rows.filter(r=>r[1]===v[2]);let method='한글명 일치';
  if(!matches.length){matches=rows.filter(r=>english(r[2])&&english(r[2])===english(v[4]));method='유일한 영문명 일치';}
  if(matches.length!==1){excluded.push([v[2],matches.length?'같은 영문명의 제품·용량이 여러 개여서 확인 필요':'맛 점수 탭에서 제품 이름 연결 확인 필요']);continue;}
  const r=matches[0];
  if([3,4,5,6].some(i=>!r[i]||!Number.isInteger(Number(r[i]))||Number(r[i])<1||Number(r[i])>5)){excluded.push([v[2],'당도·바디·산도·타닌 점수 누락']);continue;}
  if(/미션 레이트 하비스트/.test(r[1])){excluded.push([v[2],'당도 점수와 설명문 충돌 확인 필요']);continue;}
  const half=/half/i.test(v[0]);
  let kind=/port|포트/i.test(r[1]+' '+r[2])?'port':/로제|ros[eé]/i.test(r[1]+' '+r[2])?'rose':/스파클링/.test(r[11])?'sparkling':/레드|\(레드\)/.test(r[11]+' '+v[2])?'red':/화이트|\(화이트\)/.test(r[11]+' '+v[2])?'white':'unknown';
  wines.push({menuCode:v[0],menuRow:m.row,name:v[2],sourceName:r[1],english:v[4],sweetness:Number(r[3]),body:Number(r[4]),acidity:Number(r[5]),tannin:Number(r[6]),aromas:r[7],pairing:r[8],country:r[9],variety:v[6],category:r[11],wineKind:kind,volumeLabel:half?'하프':/750ml/i.test(r[1])?'750ml':'',alcohol:v[3],region:v[5],price:v[7],description:clean(m.description),nuance:r[12],serviceDescription:r[13],descriptionUpdatedAt:source.readAt});
  links.push({menuName:v[2],sourceName:r[1],english:v[4],method});
}
// 웹 자료는 별도 원장에서 합친다. 원문 38종은 점수 변경을 금지한다.
for(const t of estimates.targets.filter(t=>t.status==='accepted')){
 if(t.confidence==='낮음'||t.score?.length!==4||!t.urls?.length||t.score.some(x=>!Number.isInteger(x)||x<1||x>5))throw new Error('Invalid estimate: '+t.name);
 const matches=menu.rows.filter(m=>clean(m.values[2])===t.name&&clean(m.values[0])===t.menuCode);
 if(matches.length!==1||matches[0].row!==t.row)throw new Error('Estimate menu identity changed: '+t.name);
 if(wines.some(w=>w.name===t.name))throw new Error('Estimate cannot overwrite original: '+t.name);
 const originalName=({'1808 콜헤이타 배이라 인테리어':'1808 유기농 콜헤이타 배이라 인테리어 다오씨','미션 레이트 하비스트 (화이트)':'미션 레이트 하비스트','카룬도 샤도네이 (화이트)':'카룬도 샤도네이'})[t.name]||t.name;
 const m=matches[0],v=m.values.map(clean),r=rows.find(r=>r[1]===originalName);
 const kind=/sparkling/i.test(v[0])?'sparkling':/port/i.test(v[0])?'port':/로제|ros[eé]/i.test(v[2]+' '+v[4])?'rose':/red|natural|레드/i.test(v[0]+' '+v[2])?'red':'white';
 wines.push({menuCode:v[0],menuRow:m.row,name:v[2],sourceName:v[2],english:v[4],sweetness:t.score[0],acidity:t.score[1],tannin:t.score[2],body:t.score[3],aromas:t.aromas,pairing:t.pairing,country:v[5],variety:v[6],category:({red:'레드',white:'화이트',rose:'로제',sparkling:'스파클링',port:'포트'})[kind],wineKind:kind,volumeLabel:/half/i.test(v[0])?'하프':/750ml/i.test(v[2])?'750ml':'',alcohol:v[3],region:v[5],price:v[7],description:clean(m.description),nuance:r?.[12]||'',serviceDescription:r?.[13]||t.pitch,scoreSource:'web-estimate',scoreSources:t.urls,scoredAt:estimates.scoredAt,scoreConfidence:t.confidence,scoreIdentity:t.identity,scoreVintageNote:t.vintage,scoreReasons:t.reasons});
 const i=excluded.findIndex(x=>x[0]===t.name);if(i>=0)excluded.splice(i,1);
 links.push({menuName:v[2],sourceName:originalName,english:v[4],method:'웹 자료 기준 추정 · '+t.identity});
}
for(const b of baseline){const w=wines.find(w=>w.name===b.name);if(!w||w.scoreSource==='web-estimate'||['sweetness','acidity','tannin','body'].some(k=>w[k]!==b[k]))throw new Error('Original score changed: '+b.name);}
wines.sort((a,b)=>a.menuRow-b.menuRow);
fs.writeFileSync(path.join(__dirname,'와인_추천_데이터.json'),JSON.stringify(wines,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'와인_이름_연결표.json'),JSON.stringify(links,null,2)+'\n');
fs.writeFileSync(path.join(root,'지식','와인추천_확인필요.md'),'# 와인 추천 확인 필요\n\n맛 점수를 임의로 채우지 않는다. 한글명 또는 유일한 영문명이 일치하는 제품만 연결한다.\n\n| 번호 | 메뉴판 한글명 | 제외 사유 |\n|---:|---|---|\n'+excluded.map((x,i)=>'| '+(i+1)+' | '+x.join(' | ')+' |').join('\n')+'\n');
const sections=rows.map(r=>{
 const link=links.find(l=>l.sourceName===r[1]);const label=/레드/.test(r[11])?'레드':r[11];const scored=[3,4,5,6].every(i=>r[i]&&Number(r[i])>=1&&Number(r[i])<=5);
 let menuMatches=menu.rows.filter(m=>/wine/i.test(m.values[0]||'')&&clean(m.values[2])===r[1]);
 if(!menuMatches.length)menuMatches=menu.rows.filter(m=>/wine/i.test(m.values[0]||'')&&english(m.values[4])&&english(m.values[4])===english(r[2]));
 const mv=menuMatches.length===1?menuMatches[0].values.map(clean):null;
 const estimate=wines.find(w=>w.scoreSource==='web-estimate'&&w.name===(link?.menuName||r[1]));
 const taste=estimate?'맛 점수: 웹 자료 기준 추정 · 당도 '+estimate.sweetness+'/5 · 산도 '+estimate.acidity+'/5 · 타닌 '+estimate.tannin+'/5 · 바디 '+estimate.body+'/5':scored?'맛 점수: 당도 '+r[3]+'/5 · 산도 '+r[5]+'/5 · 타닌 '+r[6]+'/5 · 바디 '+r[4]+'/5':'맛 점수: 자료 미완성. 취향 추천에서는 제외 [확인].';
 const lines=[r[2]?'영문명: '+r[2]:'',r[9]?'국가: '+r[9]:'',r[10]?'품종 (와인 참고자료): '+r[10]:'',mv&&mv[6]?'품종 (메뉴판): '+mv[6]:'',mv&&mv[3]?'도수 (메뉴판): '+mv[3]:'',mv&&mv[5]?'지역 (메뉴판): '+mv[5]:'',mv&&mv[7]?'가격 원문 (메뉴판): '+mv[7]+' · 현재 가격 확인 필요':'',r[12]?'뉘앙스: '+r[12]:'',r[13]?'설명: '+r[13]:'',taste,r[7]?'아로마: '+r[7]:'',r[8]?'안주: '+r[8]:''];
 if(estimate)lines.push('추정 근거: '+estimate.scoreSources.join(' · '),'빈티지 유의: '+estimate.scoreVintageNote);
 if(/미션 레이트 하비스트/.test(r[1]))lines.push('주의: 기존 원문의 당도 1/5와 달콤한 설명은 충돌한다. 원문은 보존하고 공식 자료의 웹 추정 점수를 별도로 사용한다.');
 return '## '+(link?.menuName||r[1])+' ('+label+')\n- 상태: '+(estimate?'웹 자료 기준 추정':'확정')+'\n- 키워드: '+Array.from(new Set([r[1],r[2],link?.menuName].filter(Boolean))).join(', ')+'\n'+lines.filter(Boolean).map(x=>'- '+x).join('\n');
});
fs.writeFileSync(path.join(root,'지식','12_와인_추가_설명.md'),'# 와인 추가 설명 (2026-10-08)\n\n> 출처: 와인추천 참고자료 최신화, gid=2027125317, A1:N120.뉘앙스·설명문 67종.가격은 메뉴판 List의 현행 확인 대상이다.점수 없는 제품은 추천에 넣지 않는다.\n\n'+sections.join('\n\n')+'\n');
fs.writeFileSync(path.join(root,'지식','11_와인_추천_데이터.md'),'# 와인 추천 데이터\n\n추천 가능 '+wines.length+'종 / 확인 필요 '+excluded.length+'종. 원문 '+wines.filter(w=>w.scoreSource!=='web-estimate').length+'종과 웹 자료 기준 추정 '+wines.filter(w=>w.scoreSource==='web-estimate').length+'종을 구분한다. 기존38종 점수는 유지했다. 최신 메뉴 연결로 원문 점수3종을 추가 연결했다.\n\n- 웹 추정: 도구/웹추정_맛점수_1011.json의 동일 제품·근거·빈티지·확신도를 함께 보관. 낮음은 제외.\n- 웹 추정 맛 점수는 실측값이 아니며 직원용에서만 사용한다. 손님용은 승인된 기존38종만 포함한다.\n- 뉘앙스·설명문: 기존 허용 스냅샷67종. 이번 작업에서 다른 탭을 읽지 않았다.\n- 가격·품종·도수: List A:H와 K, '+menu.readAt+' 읽음. 가격·재고를 웹에서 채우지 않는다.\n- 미션 레이트 하비스트의 충돌 원문은 보존하며 별도 웹 추정 점수만 사용한다.\n- 이름 연결 근거: 도구/와인_이름_연결표.json.\n- 재고는 직접 확인.\n');
const added=wines.filter(w=>w.scoreSource==='web-estimate'&&!links.some(l=>l.menuName===w.name&&rows.some(r=>r[1]===l.sourceName)));
fs.writeFileSync(path.join(root,'지식','13_와인_웹추정_설명.md'),'# 신규 메뉴 와인 웹 추정 (2026-10-11)\n\n'+added.map(w=>'## '+w.name+' ('+w.category+')\n- 상태: 웹 자료 기준 추정\n- 키워드: '+w.name+', '+w.english+'\n- 영문명: '+w.english+'\n- 국가: '+w.country+'\n- 품종 (메뉴판): '+w.variety+'\n- 설명: '+w.description+'\n- 맛 점수: 웹 자료 기준 추정 · 당도 '+w.sweetness+'/5 · 산도 '+w.acidity+'/5 · 타닌 '+w.tannin+'/5 · 바디 '+w.body+'/5\n- 아로마: '+w.aromas+'\n- 안주: '+w.pairing+'\n- 추정 근거: '+w.scoreSources.join(' · ')+'\n- 빈티지 유의: '+w.scoreVintageNote).join('\n\n')+'\n');
console.log('추천 '+wines.length+'종 (원문 '+wines.filter(w=>w.scoreSource!=='web-estimate').length+' + 웹추정 '+wines.filter(w=>w.scoreSource==='web-estimate').length+') / 제외 '+excluded.length+'종 / 설명 '+rows.length+'종');
