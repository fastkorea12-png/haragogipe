// 자료/주방재고.csv 를 주방재고 조사용 품목 목록 JSON으로 바꾼다. 열: 품목·위치1·위치2·구입처(가격 열은 없고, 있어도 읽지 않는다).
// 반환: {items:[{id,name,loc,loc2?,shop?}]} (CSV 순서). 항목 id는 이름 해시라 같은 입력에서 같고, 서버에 발행한 뒤에는 이름을 고쳐도 id가 유지된다.
// 자료/ 는 공개 저장소에 없으므로 결과를 도구/주방재고_목록.json 에 스냅샷으로 남긴다. CSV가 없으면 스냅샷을 읽는다.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const CSV = path.join(__dirname, '..', '자료', '주방재고.csv');
const SNAPSHOT = path.join(__dirname, '주방재고_목록.json');
const hash = (s) => crypto.createHash('sha1').update('kitchen|' + s).digest('hex').slice(0, 8);
const clean = (s) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s{2,}/g, ' ').trim();
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
function extract(csvPath) {
  const file = csvPath || CSV;
  if (!fs.existsSync(file)) return !csvPath && fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) : { items: [] };
  const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const head = rows.shift().map(clean), col = (n) => head.indexOf(n);
  const iName = col('품목'), iLoc = col('위치1'), iLoc2 = col('위치2'), iSup = col('구입처');
  const items = [], used = new Set();
  for (const r of rows) {
    const name = clean(r[iName]);
    if (!name) continue;
    let id = 'k' + hash(name);
    while (used.has(id)) id += 'x';
    used.add(id);
    const it = { id, name, loc: clean(r[iLoc]) || '위치 미정' };
    const loc2 = iLoc2 >= 0 ? clean(r[iLoc2]) : '', sup = iSup >= 0 ? clean(r[iSup]) : '';
    if (loc2) it.loc2 = loc2;
    if (sup) it.shop = sup;
    items.push(it);
  }
  const result = { items };
  if (!csvPath) { try { const t = JSON.stringify(result, null, 1) + '\n'; if (!fs.existsSync(SNAPSHOT) || fs.readFileSync(SNAPSHOT, 'utf8') !== t) fs.writeFileSync(SNAPSHOT, t); } catch (e) { /* 읽기 전용이면 건너뜀 */ } }
  return result;
}
module.exports = extract;
module.exports.SNAPSHOT = SNAPSHOT;
