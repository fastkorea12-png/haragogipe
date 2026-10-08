// 허용된 두 탭의 스냅샷만 사용한다. 연결은 한글명 일치 또는 유일한 영문명 일치에 한정한다.
const fs=require('fs'),path=require('path');const root=path.join(__dirname,'..');
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'와인_설명_원본_1008.json'),'utf8'));
const menu=JSON.parse(fs.readFileSync(path.join(__dirname,'메뉴판_허용자료_1008.json'),'utf8'));
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
  wines.push({name:v[2],sourceName:r[1],english:v[4],sweetness:Number(r[3]),body:Number(r[4]),acidity:Number(r[5]),tannin:Number(r[6]),aromas:r[7],pairing:r[8],country:r[9],variety:v[6],category:r[11],wineKind:kind,volumeLabel:half?'하프':/750ml/i.test(r[1])?'750ml':'',alcohol:v[3],region:v[5],price:v[7],description:clean(m.description),nuance:r[12],serviceDescription:r[13],descriptionUpdatedAt:source.readAt});
  links.push({menuName:v[2],sourceName:r[1],english:v[4],method});
}
fs.writeFileSync(path.join(__dirname,'와인_추천_데이터.json'),JSON.stringify(wines,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'와인_이름_연결표.json'),JSON.stringify(links,null,2)+'\n');
fs.writeFileSync(path.join(root,'지식','와인추천_확인필요.md'),'# 와인 추천 확인 필요\n\n맛 점수를 임의로 채우지 않는다. 한글명 또는 유일한 영문명이 일치하는 제품만 연결한다.\n\n| 번호 | 메뉴판 한글명 | 제외 사유 |\n|---:|---|---|\n'+excluded.map((x,i)=>'| '+(i+1)+' | '+x.join(' | ')+' |').join('\n')+'\n');
const sections=rows.map(r=>{
 const link=links.find(l=>l.sourceName===r[1]);const label=/레드/.test(r[11])?'레드':r[11];const scored=[3,4,5,6].every(i=>r[i]&&Number(r[i])>=1&&Number(r[i])<=5);
 let menuMatches=menu.rows.filter(m=>/wine/i.test(m.values[0]||'')&&clean(m.values[2])===r[1]);
 if(!menuMatches.length)menuMatches=menu.rows.filter(m=>/wine/i.test(m.values[0]||'')&&english(m.values[4])&&english(m.values[4])===english(r[2]));
 const mv=menuMatches.length===1?menuMatches[0].values.map(clean):null;
 const lines=[r[2]?'영문명: '+r[2]:'',r[9]?'국가: '+r[9]:'',r[10]?'품종 (와인 참고자료): '+r[10]:'',mv&&mv[6]?'품종 (메뉴판): '+mv[6]:'',mv&&mv[3]?'도수 (메뉴판): '+mv[3]:'',mv&&mv[5]?'지역 (메뉴판): '+mv[5]:'',mv&&mv[7]?'가격 원문 (메뉴판): '+mv[7]+' · 현재 가격 확인 필요':'',r[12]?'뉘앙스: '+r[12]:'',r[13]?'설명: '+r[13]:'',scored?'맛 점수: 당도 '+r[3]+'/5 · 산도 '+r[5]+'/5 · 타닌 '+r[6]+'/5 · 바디 '+r[4]+'/5':'맛 점수: 자료 미완성. 취향 추천에서는 제외 [확인].',r[7]?'아로마: '+r[7]:'',r[8]?'안주: '+r[8]:''];
 if(/미션 레이트 하비스트/.test(r[1]))lines.push('주의: 당도 1/5와 설명문의 달콤한 스타일이 충돌해 단맛 강도는 [확인].');
 return '## '+(link?.menuName||r[1])+' ('+label+')\n- 상태: 확정\n- 키워드: '+Array.from(new Set([r[1],r[2],link?.menuName].filter(Boolean))).join(', ')+'\n'+lines.filter(Boolean).map(x=>'- '+x).join('\n');
});
fs.writeFileSync(path.join(root,'지식','12_와인_추가_설명.md'),'# 와인 추가 설명 (2026-10-08)\n\n> 출처: 와인추천 참고자료 최신화, gid=2027125317, A1:N120.뉘앙스·설명문 67종.가격은 메뉴판 List의 현행 확인 대상이다.점수 없는 제품은 추천에 넣지 않는다.\n\n'+sections.join('\n\n')+'\n');
fs.writeFileSync(path.join(root,'지식','11_와인_추천_데이터.md'),'# 와인 추천 데이터\n\n추천 가능 '+wines.length+'종 / 확인 필요 '+excluded.length+'종.맛 점수는 1~5의 완성된 원문만 쓴다.이름은 한글명 또는 유일한 영문명이 일치할 때 연결하며 도구/와인_이름_연결표.json에 근거를 남긴다.한글명 표기 차이 '+links.filter(l=>l.menuName!==l.sourceName).length+'종을 영문명으로 연결했다.\n\n- 뉘앙스·설명문: 지정 맛 점수 탭 67종, 2026-10-08 읽음.\n- 가격·품종·도수: 메뉴판 List 허용 열, 2026-10-08 읽음.가격 원문의 통화·단위는 임의 변환하지 않고 현재 가격 확인 필요로 표시.\n- 용량: 메뉴판의 Half 구분은 하프로 표시.ml가 명시되지 않으면 임의로 숫자를 붙이지 않음.\n- 미션 레이트 하비스트는 당도·설명 충돌 확인 전 추천에서 제외.\n- 재고는 직접 확인.\n');
console.log('추천 '+wines.length+'종 / 제외 '+excluded.length+'종 / 설명 '+rows.length+'종');
