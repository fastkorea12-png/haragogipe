const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),ctx={};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'챗봇_시안.html'),'utf8').match(/<script>([\s\S]*)<\/script>/)[1],ctx);
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'와인_설명_원본_1008.json'),'utf8')).values;
const row=source.find(r=>r[1]==='라로쉬 샤르도네 리저브');
for(const q of ['라로쉬 산도는?','라로쉬 산미가 높아?','Laroche acidity','Laroche Chardonnay Réserve 산도']){
  const a=ctx.answer(q);assert.equal(a.wineFact,true);assert.equal(a.title,row[1]);assert.equal(a.text,'• 산도: '+ctx.bar(Number(row[source[0].indexOf('산도')])));
}
const selected=ctx.answer('라로쉬 당도와 바디');assert.match(selected.text,/당도: .*1\/5/);assert.match(selected.text,/바디: .*3\/5/);assert.doesNotMatch(selected.text,/산도:/);
assert.equal(ctx.answer('후안길 산도').wineAmbiguous,true);
assert.match(ctx.answer('후안길 옐로 라벨 산도').title,/옐로/);
assert.match(ctx.answer('군터록 산도').text,/점수가 기재되지 않아/);
assert.match(ctx.relevantContext('라로쉬 설명해줘'),/라로쉬 샤르도네 리저브/);
assert.match(ctx.relevantContext('라로쉬 설명해줘'),/산도 4\/5/);
const comparison=ctx.answer('라로쉬와 간치아 아스티 산도 비교');assert.match(comparison.text,/라로쉬[\s\S]*4\/5/);assert.match(comparison.text,/간치아 아스티[\s\S]*2\/5/);
ctx.aiConversation=[{role:'user',text:'라로쉬 산도는?'},{role:'model',text:'라로쉬 샤르도네 리저브\n• 산도: 4/5'}];
assert.equal(ctx.answer('그럼 당도는?').text,'• 당도: '+ctx.bar(Number(row[source[0].indexOf('당도')])));
ctx.aiConversation=[];
let verified=0;
for(const r of source.slice(1)){
  if(!/^[1-5]$/.test(String(r[5])))continue;
  const a=ctx.answer(r[1]+' 산도');
  if(!/맛 점수: 당도/.test(ctx.KB.find(e=>e.file==='12_와인_추가_설명'&&e.kw[0]===r[1])?.body||''))continue;
  assert.equal(a.wineFact,true);
  if(a.wineAmbiguous){assert.ok(a.text.includes(r[1]));continue;}
  assert.equal(a.text,'• 산도: '+ctx.bar(Number(r[5])));verified++;
}
console.log('와인 약칭·산도 원본 대조 '+verified+'종·제품 구분·미기재·후속 질문 확인 통과');
