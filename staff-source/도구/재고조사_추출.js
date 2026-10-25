// 자료/와인재고.csv 를 재고 조사용 와인 목록 JSON으로 바꾼다. 이름·칸·순서만 쓴다(가격·주류회사·주문·수량 열은 읽지 않는다).
// 반환: {groups:[{id,name,items:[{id,name,order,confirm?}]}]}  (order = 칸 안 순서 1부터. 냉장고에는 이 순서대로 놓여 있다.)
// 항목 id는 칸 id+이름의 해시라 같은 입력에서 같고, 서버에 발행한 뒤에는 이름을 고쳐도 id가 유지된다.
// 사용: require('./재고조사_추출.js')() -> {groups}.
// 자료/ 는 공개 저장소에 없으므로 결과를 도구/재고조사_와인목록.json(칸·번호·이름·확인 필요만)에 스냅샷으로 남긴다.
// CSV가 있으면 CSV에서 다시 만들어 스냅샷과 비교·갱신하고, CSV가 없으면 스냅샷을 읽는다. 둘 다 없으면 빈 목록.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const CSV = path.join(__dirname, '..', '자료', '와인재고.csv');
const SNAPSHOT = path.join(__dirname, '재고조사_와인목록.json');
const snapshotText = (r) => JSON.stringify(r, null, 1) + '\n';
const PAYHERE = path.join(__dirname, '페이히어_화이트로제_1023.json');
const GROUPS = [
  ['red', '레드', /^Red Wine/i],
  ['white', '화이트', /^White Wine/i],
  ['whiterose', '화이트 & 로제', /^White\s*&\s*Rose Wine/i],
  ['sparkling', '스파클링', /^Sparkling Wine/i],
  ['port', '포트', /^Port Wine/i],
  ['natural', '내추럴', /^Natural Wine/i],
  ['half', '하프', /^Harf Wine|^Half Wine/i],
];
const hash = (...p) => crypto.createHash('sha1').update(p.join('|')).digest('hex').slice(0, 8);
// 따옴표·쉼표를 처리하는 작은 CSV 읽기
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
// 이름 앞뒤 공백·제어문자(\b 등)·꺾쇠 제거, 연속 공백 하나로
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s{2,}/g, ' ').trim();
// 화이트·로제는 페이히어 판매 목록(번호 = QR 주문 번호)을 따른다(10/25). 두 칸을 '화이트 & 로제' 한 칸(id white)으로 합치고,
// 이미 있던 와인은 id를 그대로 둬서 지난 조사 기록과 이어지게 한다. 스냅샷에는 CSV에서 뽑은 원래 목록을 남긴다.
function applyPayhere(result) {
  if (!fs.existsSync(PAYHERE)) return result;
  const ph = JSON.parse(fs.readFileSync(PAYHERE, 'utf8')), key = (s) => String(s || '').replace(/\s|ml/gi, '');
  const old = result.groups.filter((g) => g.id === 'white' || g.id === 'whiterose').flatMap((g) => g.items);
  const items = ph.items.map((p) => {
    const o = old.find((it) => key(it.name) === key(p.name) || (p.menuName && key(it.name) === key(p.menuName)));
    return { id: o ? o.id : 'w' + hash('white', p.name), name: p.name, order: p.number };
  });
  const groups = [];
  for (const g of result.groups) {
    if (g.id === 'white') groups.push({ id: 'white', name: '화이트 & 로제', items });
    else if (g.id !== 'whiterose') groups.push(g);
  }
  return { groups };
}
function extract(csvPath) {
  const file = csvPath || process.env.HARAGO_INVENTORY_CSV || CSV;
  if (!fs.existsSync(file)) {
    if (!csvPath && fs.existsSync(SNAPSHOT)) return applyPayhere(JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')));
    return { groups: GROUPS.map(([id, name]) => ({ id, name, items: [] })) };
  }
  const rows = parseCsv(fs.readFileSync(file, 'utf8')).slice(1);
  const groups = GROUPS.map(([id, name]) => ({ id, name, items: [] })), used = new Set();
  let cur = null;
  for (const r of rows) {
    const label = cleanName(r[1]), rawName = cleanName(r[2]);
    if (!rawName) continue; // 빈 줄(칸 사이 구분)
    const hit = GROUPS.findIndex(([, , re]) => re.test(label));
    if (hit >= 0) cur = groups[hit]; // 번호가 있는 줄은 칸을 바꾼다. 번호가 비었거나 숫자뿐이면 직전 칸에 이어 붙인다.
    if (!cur) continue;
    let name = rawName, confirm = false;
    if (/확인\s*필요|임시명/.test(name)) confirm = true;
    let id = 'w' + hash(cur.id, name);
    while (used.has(id)) id += 'x';
    used.add(id);
    const it = { id, name, order: cur.items.length + 1 };
    if (confirm) it.confirm = true;
    cur.items.push(it);
  }
  const result = { groups };
  if (!csvPath && !process.env.HARAGO_INVENTORY_CSV) { // 기본 CSV에서 만든 결과만 스냅샷에 반영
    try { const t = snapshotText(result); if (!fs.existsSync(SNAPSHOT) || fs.readFileSync(SNAPSHOT, 'utf8') !== t) fs.writeFileSync(SNAPSHOT, t); } catch (e) { /* 읽기 전용이면 건너뜀 */ }
  }
  return applyPayhere(result);
}
module.exports = extract;
module.exports.SNAPSHOT = SNAPSHOT;
module.exports.extract = extract;
module.exports.GROUPS = GROUPS;
