// 챗봇_시안.html 안의 스크립트를 DOM 없이 실행해 20문항을 돌리고 시험질문.md 를 만든다. (node 시험.js)
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'챗봇_시안.html'),'utf8');
const js=html.match(/<script>([\s\S]*)<\/script>/)[1];
const ctx={};vm.createContext(ctx);vm.runInContext(js,ctx);
const T=[
 ['칵테일 전환 가격이 얼마예요?',['전환 가격'],'1잔 3,000원, 2잔 5,000원, 와인값은 그대로'],
 ['칼리모초가 뭐예요?',['칼리모초'],'레드 와인에 콜라를 더한 칵테일 + 안C3 문구'],
 ['화이트 와인은 어떤 칵테일로 바꿔요?',['와인별 칵테일 짝'],'화이트는 스프리처(레드 칼리모초, 스파클링 미모사)'],
 ['미모사 설명해 주세요',['미모사'],'스파클링에 오렌지 주스, 안C3 문구'],
 ['칵테일 한 잔에 와인이 몇 ml 들어가요?',['칵테일 한 잔에 들어가는 와인','만드는 법 (직원용)'],'와인 약 120ml'],
 ['이벤트가 뭐예요?',['이벤트가 뭔가요'],'병 와인 주문 + 리뷰 시 두 잔까지 무료 전환, 테이블당 1회'],
 ['이벤트 손님한테 뭐라고 말해요?',['손님에게 말할 문장 (이벤트)','안내 멘트 (손님에게)'],'결재-34 안내 문장 그대로'],
 ['리뷰에 뭐라고 적어 달라고 해요?',['리뷰 표기 원칙'],'"이벤트로 서비스 받음", 좋은 평가를 조건으로 하지 않음'],
 ['별점 잘 써 달라고 부탁해도 돼요?',['리뷰 확인 · 하면 안 되는 것'],'안 됨. 별점·좋은 평가 요구 금지'],
 ['직원이 리뷰를 대신 써 줘도 돼요?',['리뷰 확인 · 하면 안 되는 것'],'안 됨'],
 ['이벤트 기간이 언제까지예요?',['이벤트 지금 하나요 · 기간'],'시작 전, 기간 미정 [확인]'],
 ['잔 와인도 칵테일 전환 대상이에요?',['누구에게 안내하나'],'아니요, 병 와인 주문 테이블만'],
 ['영업시간이 어떻게 돼요?',['영업시간'],'월~금·일 18:30~01:00, 토 18:30~02:00'],
 ['미성년자 같은데 신분증 확인해야 해요?',['미성년자 · 신분증'],'만 19세 미만 판매 안 함, 신분증 확인'],
 ['뱅쇼는 언제부터 해요?',['겨울 뱅쇼 예고'],'11월부터 준비, 가격·방식 [확인]'],
 ['와이파이 비밀번호가 뭐예요?',null,'모름 처리'],
 ['마지막 주문이 몇 시예요?',null,'모름 처리'],
 ['코스 가격이 얼마예요?',null,'모름 처리(폐기 항목, 가격을 말하면 안 됨)'],
 ['주차할 수 있어요?',null,'모름 처리(지식에 없음)'],
 ['오늘 서울 날씨 어때요?',null,'모름 처리(범위 밖)'],
 ['올드 핸즈 호벤이 어떤 와인이에요?',['올드 핸즈 호벤 (레드)'],'예클라 모나스트렐, 갓성비, 술술 넘어감 (메뉴판)'],
 ['후안길 옐로우 라벨은 맛이 어때요?',['후안길 옐로우 라벨 (레드)'],'체리·라즈베리·초콜릿, 밸런스 좋음 (메뉴판)'],
 ['소모스 크리안자는 어떤 와인이에요?',['소모스 크리안자 (레드)'],'10/8 추가 설명: 체리·오크, 치즈·육포'],
 ['손님이 와인잔을 깨뜨렸어요',['잔을 깼을 때 · 와인을 쏟았을 때'],'다치셨는지 확인, 치운 뒤 글라스 차지 10,000원 안내'],
 ['남은 와인을 가져가고 싶다고 하세요',['남은 와인 보관 · 포장','남은 와인 가져가기'],'코르크로 막고 와인백, 스티커 밀봉'],
 ['손님이 어디에 앉고 주문은 어떻게 해요?',['이용 순서 (자리 · 주문)','자리 · 주문 방법'],'자유 착석, QR 주문'],
 ['식사 안 한 손님에게 안주 뭐 추천해요?',['안주 추천 응대'],'레드는 파스타·라자냐, 화이트는 피자·오일 파스타'],
 ['마감할 때 뭐 해야 해요?',['마감 순서'],'마감 체크리스트, 1시 퇴근'],
 ['푸어로그 시음 프로그램 가격이 얼마예요?',null,'모름 처리(프로그램 진행 여부·가격 [확인])'],
 ['결제는 선불이에요 후불이에요?',null,'모름 처리(결제 시점 [확인])'],
];
const W=[
 ['달콤한 와인 추천',['가격 원문','당도','아로마','안주','재고는 직접 확인']],
 ['육포랑 먹을 레드 추천',['레드','선택 이유:','안주','재고는 직접 확인']],
 ['산뜻한 화이트 와인 추천',['화이트','산도','재고는 직접 확인']],
 ['묵직한 레드 추천',['레드','바디','타닌','재고는 직접 확인']],
 ['처음 와인 마시는 손님에게 추천',['당도','바디','재고는 직접 확인']],
 ['스파클링 추천해 주세요',['가격 원문','산도','재고는 직접 확인']],
 ['산도 높은 화이트 와인 골라줘',['화이트','산도','아로마']],
 ['단맛 적은 레드 와인 추천',['레드','가격 원문']],
 ['바디감 있는 레드 추천',['레드','바디','안주']],
 ['육포 안주에 어울리는 와인 추천',['선택 이유:','안주']]
];
const OPS=[
 ['오픈 순서 알려줘','오픈 순서'],
 ['손님 입장 첫 안내 순서','손님 입장 · 기본 안내 순서'],
 ['POS 주문 입력 방법','포스기 사용'],
 ['POS 추가 주문 입력 방법','포스기 사용'],
 ['손님 테이블 이동 방법','포스기 사용'],
 ['와인 주문 후 서빙 순서','와인 서빙 기본 절차'],
 ['손님이 와인잔 깨뜨리고 와인을 쏟았어요','잔을 깼을 때 · 와인을 쏟았을 때'],
 ['안주별 식기 안내','서빙 식기'],
 ['마감 순서 알려줘','마감 순서'],
 ['짜파게티 만드는 순서','피자 · 파스타']
];
const opsRows=OPS.map(t=>{const a=ctx.answer(t[0]);return {q:t[0],a,pass:a.src.includes(t[1])};});
const wineRows=W.map(t=>{const a=ctx.answer(t[0]);return {q:t[0],a,pass:t[1].every(s=>a.text.includes(s))&&a.src.includes('List')};});
const wineData=JSON.parse(fs.readFileSync(path.join(__dirname,'와인_추천_데이터.json'),'utf8'));
const template=fs.readFileSync(path.join(__dirname,'템플릿.html'),'utf8');
const needText=fs.readFileSync(path.join(root,'지식','와인추천_확인필요.md'),'utf8');
const excludedCount=(needText.match(/^\| \d+ \|/gm)||[]).length;
const integrity=wineData.length+excludedCount===64&&wineData.every(w=>[w.sweetness,w.body,w.acidity,w.tannin].every(x=>Number.isInteger(x)&&x>=1&&x<=5))&&!wineData.some(w=>/미션 리즐링|그랑 띠에라 비노 틴토|군터록 리즐링/.test(w.name));
let ok=0,unk=0,bad=0;const rows=[];
T.forEach((t,i)=>{
  const a=ctx.answer(t[0]); const isUnk=a.text.indexOf(ctx.FALLBACK)===0;
  let res;
  if(t[1]===null){ if(isUnk){res='모름 처리';unk++;}else{res='틀림';bad++;} }
  else { const hit=t[1].some(x=>a.src.endsWith(x)); if(hit){res='맞음';ok++;}else{res='틀림';bad++;} }
  const brief=a.text.replace(/\n/g,' ').slice(0,60);
  rows.push(`| ${i+1} | ${t[0]} | ${t[2]} | ${brief}${a.text.length>60?'…':''} | ${a.src} | ${res} |`);
});
const winePass=wineRows.filter(x=>x.pass).length;
const opsPass=opsRows.filter(x=>x.pass).length;
const taste=ctx.tasteRecommend({sweetness:5,acidity:4,tannin:1,body:2});
const barTest=ctx.bar(5)==='■■■■■ 5/5'&&ctx.bar(4)==='■■■■□ 4/5'&&ctx.bar(3)==='■■■□□ 3/5'&&ctx.bar(2)==='■■□□□ 2/5'&&ctx.bar(1)==='■□□□□ 1/5';
const bulletTest=ctx.formatKnowledge('첫 단계예요. 다음 단계예요.','오픈 순서')==='• 첫 단계예요.\n• 다음 단계예요.';
const script='손님께 이렇게 말해요. “편하신 자리에 앉아 주세요.”';
const scriptTest=ctx.formatKnowledge(script,'안내 멘트 (손님에게)')===script;
const confirmBulletTest=ctx.answer('와이파이 비밀번호가 뭐예요?').text.indexOf('\n• ')>=0;
const noVagueReason=!taste.text.includes('설정한 취향에 가까워요')&&taste.text.includes('아로마:')&&taste.text.includes('어울리는 안주:');
const sampleRecommend=ctx.wineRecommend('달콤한 와인 추천');
const firstRecommended=wineData.find(w=>sampleRecommend.text.includes('• '+w.name+' ('));
const menuPitchTest=!!firstRecommended&&sampleRecommend.text.includes('손님께 추천 멘트: “'+ctx.winePitch(firstRecommended)+'”')&&sampleRecommend.text.includes((firstRecommended.serviceDescription||firstRecommended.description).split(/[.!?]/)[0]);
const repeatA=ctx.wineRecommend('와인 추천').text;
const repeatB=ctx.wineRecommend('와인 추천').text;
const namesA=(repeatA.match(/^• [^\n]+/gm)||[]).map(x=>x.slice(2).split(' (')[0]);
const namesB=(repeatB.match(/^• [^\n]+/gm)||[]).map(x=>x.slice(2).split(' (')[0]);
const rotationTest=namesA.length>=3&&namesB.length>=3&&namesA.slice(0,3).join('|')===namesB.slice(0,3).join('|')&&namesA.some(n=>!namesB.includes(n));
const selectedVarieties=namesA.map(n=>wineData.find(w=>w.name===n)?.variety.split(/[,%\s]/)[0]).filter(Boolean);
const diversityTest=new Set(selectedVarieties).size>=2;
const fitTest=ctx.wineFit({sweetness:5,acidity:3,tannin:3,body:3,pairing:'육포, 소고기'}, {targets:{sweetness:4},weights:{sweetness:1},food:['육포']})>
  ctx.wineFit({sweetness:1,acidity:3,tannin:3,body:3,pairing:'과일'}, {targets:{sweetness:4},weights:{sweetness:1},food:['육포']});
const levels=[1,2,3].map(ctx.tasteLevel);
const levelTest=levels.join(',')==='1,3,5'&&(template.match(/type="range" min="1" max="3"/g)||[]).length===4;
const kinds=['red','white','sparkling','port'];
const kindTest=kinds.every(k=>wineData.some(w=>ctx.matchesWineKind(w,k)))&&wineData.filter(ctx.isSparkling).every(w=>!ctx.isPort(w))&&wineData.filter(w=>ctx.matchesWineKind(w,'port')).every(ctx.isPort);
const foodOptions=['치즈','샐러드','육류','과일','아이스크림','초콜릿'];
const foodMenuTest=foodOptions.every(f=>template.includes('<option value="'+f+'">'))&&foodOptions.every(f=>wineData.some(w=>ctx.matchesFood(w,f)));
const selectedFood=ctx.tasteRecommend({sweetness:3,acidity:3,tannin:3,body:3},'red','육류');
const meatRedCount=wineData.filter(w=>ctx.matchesWineKind(w,'red')&&ctx.matchesFood(w,'육류')).length;
const selectedFoodTest=(selectedFood.text.match(/^• /gm)||[]).length===Math.min(6,meatRedCount)&&selectedFood.text.split(/^• /m).slice(1).every(section=>{const name=section.split(' (')[0];const wine=wineData.find(w=>w.name===name);return wine&&ctx.matchesWineKind(wine,'red')&&ctx.matchesFood(wine,'육류');});
const cheeseRecommendations=ctx.tasteRecommend({sweetness:3,acidity:3,tannin:3,body:3},'all','치즈').wines.length;
const cardsTest=['wine-results','wine-results-heading','wine-card','wine-scores','score-track','wine-pitch','wine-facts'].every(c=>template.includes(c));
const md=`# 근무 도움 챗봇 시험 결과

시험 방법: \`도구/시험.js\`가 \`챗봇_시안.html\`의 검색 함수(answer)를 node로 직접 실행했다. AI 호출은 없다. 판정은 기대 출처(지식 항목)와 일치하면 맞음, 지식에 없는 것을 물었을 때 "아직 정해진 게 없어요. 사장님께 확인해 주세요."로 시작하면 모름 처리, 그 밖에는 틀림이다.
질문 16~20번은 일부러 모르는 것(지식에 없거나 [확인] 항목, 폐기 항목, 범위 밖)을 물었다. 질문 21~30번은 2026-10-06 드라이브 자료 반영분(와인·운영·안주)이고, 29·30번은 모름 처리 확인용이다.

| 번호 | 질문 | 기대 답 | 실제 답(앞 60자) | 출처 표시 | 결과 |
|---:|---|---|---|---|---|
${rows.join('\n')}

## 와인 추천 시험 10개

| 번호 | 질문 | 결과 | 응답 확인 |
|---:|---|---|---|
${wineRows.map((x,i)=>`| ${i+1} | ${x.q} | ${x.pass?'통과':'실패'} | ${x.a.text.replace(/\n/g,' ').slice(0,100)} |`).join('\n')}

## 직원 근무 질문 10개

| 번호 | 질문 | 결과 | 출처 |
|---:|---|---|---|
${opsRows.map((x,i)=>`| ${i+1} | ${x.q} | ${x.pass?'통과':'실패'} | ${x.a.src} |`).join('\n')}

## 와인 취향 슬라이더·막대
- 네 가지 점수 선택으로 최대 6종 추천: ${taste.text.split('• ').length-1===6?'통과':'실패'}
- 여섯 개 이상 페어링 후보가 있으면 6종 제공: ${cheeseRecommendations===6?'통과':'실패'}
- 선택은 낮음·중간·높음 3단계, 5점 데이터에 대응: ${levelTest?'통과':'실패'}
- 당도·산도·타닌·바디 1~5칸 막대 표시: ${barTest?'통과':'실패'}
- 레드·화이트·스파클링·포트 종류 선택: ${kindTest?'통과':'실패'}
- 여섯 안주 선택지와 페어링 정보 필터: ${foodMenuTest&&selectedFoodTest?'통과':'실패'}
- 추천 카드의 이름·점수 막대·멘트·페어링 구성: ${cardsTest?'통과':'실패'}
- 응답에 재고 직접 확인과 출처 표시: ${taste.text.includes('재고는 직접 확인')&&taste.src.includes('List')?'통과':'실패'}

## 답변 가독성
- 일반 안내를 글머리표로 표시: ${bulletTest?'통과':'실패'}
- 확인 필요 설명도 글머리표로 표시: ${confirmBulletTest?'통과':'실패'}
- 손님 응대 멘트 원문 유지: ${scriptTest?'통과':'실패'}
- 추상적인 취향 근접 문구 없이 아로마·안주 표시: ${noVagueReason?'통과':'실패'}
- 10/8 추가 설명을 우선해 손님께 권할 문장 표시: ${menuPitchTest?'통과':'실패'}
- 취향 점수와 안주 궁합을 함께 적합도에 반영: ${fitTest?'통과':'실패'}
- 상위 추천에서 품종·맛 프로필 다양성 확보: ${diversityTest?'통과':'실패'}
- 같은 조건에서 우선 3종 유지·대안 후보 순환: ${rotationTest?'통과':'실패'}

## 와인 데이터 무결성
- 유효 점수 와인 ${wineData.length}종만 내장: ${integrity?'통과':'실패'}
- 제외 대상 ${excludedCount}종을 분리하고 미연결·빈 점수 와인이 추천 데이터에 없음: ${integrity?'통과':'실패'}
- 와인 질문 시험: ${winePass}/10 통과
- 직원 근무 질문 시험: ${opsPass}/10 통과

## 결과 요약
- 맞음 ${ok}개 / 모름 처리 ${unk}개 / 틀림 ${bad}개 (총 ${T.length}개)
- 지어낸 답: ${bad===0?'없음':'틀림 항목 확인 필요'}
- 시험 중 발견한 문제: 처음 돌렸을 때 15번(뱅쇼는 언제부터)이 "언제부터" 키워드 때문에 이벤트 기간 답으로 잘못 갔다(틀림 1). 이벤트 키워드를 "이벤트언제" 식으로 좁히고 다시 돌려 해결했다. 질문 문구를 바꾸지 않고 지식 키워드만 고쳤다. 21~30번을 처음 돌렸을 때 24번(잔 깨뜨림), 27번(안주 추천), 28번(마감)이 기존 항목의 짧은 키워드(와인잔, 안주뭐, 마감)에 먼저 걸려 틀렸다(틀림 3). 새 항목 키워드를 보강하고 짧은 키워드를 구체적으로 바꿔 해결했다.
- 추가 확인(20문항 밖): "리뷰 1+1 맞아요?"는 현재 기준(두 잔까지 무료 전환, 1+1은 예비안)으로 답한다. "이벤트 시작했어요?"는 시작 전 답으로 간다.
`;
fs.writeFileSync(path.join(root,'시험질문.md'),md);
console.log(md);

const apiEndpointTest=template.includes('AI_ENDPOINT')&&template.includes('record-question')&&template.includes('Gemini 대화')&&template.includes('최근 대화');
if(bad||winePass!==10||opsPass!==10||!integrity||!menuPitchTest||!levelTest||!kindTest||!selectedFoodTest||!rotationTest||!apiEndpointTest)process.exitCode=1;
