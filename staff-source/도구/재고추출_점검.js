// 와인 목록 추출 점검: 자료/와인재고.csv → JSON 72종(칸별 26/15/13/5/6/7, 화이트·로제는 페이히어 목록 15종 한 칸), 가격·주류회사·수량 없음, 이름에 제어문자 없음, 산출물에 CSV 원문이 없음. (node 도구/재고추출_점검.js)
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const extract=require('./재고조사_추출.js');
const root=path.join(__dirname,'..');
const r=extract();
assert.deepEqual(r.groups.map(g=>g.name),['레드','화이트 & 로제','스파클링','포트','내추럴','하프']);
assert.deepEqual(r.groups.map(g=>g.id),['red','white','sparkling','port','natural','half']);
assert.deepEqual(r.groups.map(g=>g.items.length),[26,15,13,5,6,7]);
const all=r.groups.flatMap(g=>g.items);assert.equal(all.length,72);
const ids=new Set(all.map(i=>i.id));assert.equal(ids.size,72,'id 중복 없음');
// 화이트·로제: 페이히어 번호·이름 그대로, 판매 중단 2종 없음, 기존 와인 id 유지
const ph=JSON.parse(fs.readFileSync(path.join(__dirname,'페이히어_화이트로제_1023.json'),'utf8'));
assert.deepEqual(r.groups[1].items.map(i=>[i.order,i.name]),ph.items.map(p=>[p.number,p.name]));
assert(!r.groups[1].items.some(i=>/킬리힐|상쎄르/.test(i.name)));
assert.equal(r.groups[1].items.find(i=>i.order===13).id,'wc0ec4602','카룬도 샤도네이 id 유지');
for(const g of r.groups)g.items.forEach((it,i)=>{
  assert.match(it.id,/^[A-Za-z0-9_-]{1,24}$/);assert.equal(it.order,i+1);
  assert(it.name&&it.name===it.name.trim(),'이름 앞뒤 공백 없음 '+it.name);
  assert(!/[\u0000-\u001f\u007f<>]/.test(it.name),'제어문자·꺾쇠 없음 '+it.name);
  assert.deepEqual(Object.keys(it).filter(k=>!['id','name','order','confirm','min'].includes(k)),[],'허용 키만');
});
// 번호가 비었거나 숫자뿐인 줄이 제자리 칸에 들어감
assert(r.groups[0].items.some(i=>i.name==='민친버리 피노누아'));assert(r.groups[0].items.some(i=>i.name==='도멘 말백'));assert(r.groups[4].items.some(i=>i.name==='롤 메소드 앙세스트랄'));
assert.equal(r.groups[0].items[8].name,'민친버리 피노누아');
// 확인 필요 표기 보존
const sh=r.groups[5].items.find(i=>/쇼토트/.test(i.name));assert(sh&&sh.confirm===true&&sh.name.includes('확인 필요'));
assert.equal(r.groups[1].items[2].name,'군터록 리즐링','이름 끝 공백 제거');
// 같은 입력 → 같은 id(해시)
assert.deepEqual(extract().groups.map(g=>g.items.map(i=>i.id)),r.groups.map(g=>g.items.map(i=>i.id)));
// 가격·주류회사·수량 없음
const js=JSON.stringify(r);assert(!/가격|주류회사|도매가|희망가|\bqty\b|냉장고|진열장|창고|주문/.test(js),'JSON에 가격·주류회사·수량 필드 없음');
// 빌드 산출물: 원문 CSV 행이 들어가지 않는다(수량·주문 열), 이름·칸·순서만
const csv=path.join(root,'자료','와인재고.csv');
if(fs.existsSync(csv)){
  const rows=fs.readFileSync(csv,'utf8').split('\n').slice(1).filter(l=>l.replace(/,/g,'').trim());
  for(const f of ['재고조사.html','어드민.html','근무노트.html']){
    const p=path.join(root,f);if(!fs.existsSync(p))continue;const t=fs.readFileSync(p,'utf8');
    for(const l of rows)assert(!t.includes(l.trim()),f+'에 CSV 원문 행이 있음: '+l.slice(0,20));
    assert(!t.includes('Red Wine 1.'),f+'에 원본 번호 표기가 있음');
  }
}
// 스냅샷(도구/재고조사_와인목록.json): 공개 저장소용. 칸·번호·이름·확인 필요만, 가격·주류회사·수량·발주 문구 없음. CSV가 있으면 CSV 추출과 같아야 한다.
const snapPath=extract.SNAPSHOT;assert(fs.existsSync(snapPath),'스냅샷 JSON 있음');
const snapRaw=fs.readFileSync(snapPath,'utf8'),snap=JSON.parse(snapRaw);
assert.deepEqual(Object.keys(snap),['groups']);
assert.deepEqual(snap.groups.map(g=>g.items.length),[26,8,4,13,5,6,7]);
for(const g of snap.groups){assert.deepEqual(Object.keys(g),['id','name','items']);for(const it of g.items)assert.deepEqual(Object.keys(it).filter(k=>!['id','name','order','confirm'].includes(k)),[],'스냅샷 허용 키만');}
assert(!/가격|주류회사|도매가|희망가|주문|냉장고|진열장|창고|발주|\bqty\b|\d+\s*병|Red Wine \d/.test(snapRaw),'스냅샷에 가격·주류회사·수량·발주 문구 없음');
{ // 스냅샷 모드: CSV 경로를 없는 곳으로 돌려도(공개 저장소 CI) 같은 결과
  const {spawnSync}=require('child_process');
  const out=spawnSync(process.execPath,['-e',"console.log(JSON.stringify(require('./재고조사_추출.js')()))"],{cwd:__dirname,encoding:'utf8',env:{...process.env,HARAGO_INVENTORY_CSV:path.join(__dirname,'__없는경로__.csv')}});
  assert.equal(out.status,0,out.stderr);assert.deepEqual(JSON.parse(out.stdout),JSON.parse(JSON.stringify(r)),'CSV 없음 → 스냅샷(+페이히어)으로 같은 결과');
}
console.log('와인 목록 추출 점검 통과: 72종(26/15/13/5/6/7), id 유일·고정, 제어문자 없음, 확인 필요 보존, CSV 원문·가격·주류회사 없음');
