// 지식/10_안주_가이드.md · 12_칵테일_레시피.md · 13_손님_응대_멘트.md 를 어드민용 JSON(recipes·phrases)으로 바꾼다.
// 직원 화면(템플릿.html)이 화면에서 파싱하는 카드와 같은 항목·같은 순서로 만든다. 항목 id는 종류·소제목·이름의 해시라 같은 입력에서 같고, 저장 뒤에는 id가 그대로 유지된다.
// 사용: require('./콘텐츠_추출.js')() -> {recipes, phrases}
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const KDIR = path.join(__dirname, '..', '지식');
const hash = (...parts) => crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 8);
const read = (f) => fs.readFileSync(path.join(KDIR, f), 'utf8');
const sections = (text) => text.split(/\n(?=## )/).slice(1).map((sec) => {
  const lines = sec.split('\n'), title = lines[0].replace(/^## /, '').trim();
  const body = lines.slice(1).filter((l) => !/^- (상태|키워드):/.test(l));
  return { title, body: body.join('\n').trim() };
});
const MARK = /\s*\[확인\]/g;
const strip = (t) => String(t).replace(MARK, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
const foodKey = (n) => String(n).replace(/[\s&·]/g, '');
const dedupe = (used, id) => { while (used.has(id)) id += 'x'; used.add(id); return id; };

// ---- 안주 (템플릿.html foodCatalog 와 같은 규칙)
const FOOD_TOOLS = ['전자레인지', '오븐', '토치', '밧드', '종이호일', '피자 종이', '머그컵', '종지', '작은 접시', '흰 접시', '앞접시', '아이스크림 그릇', '그릇', '작은 잔', '냅킨', '접시', '샐러드톱'];
const NOT_RECIPE = ['서빙 식기', '안주 목록과 가격', '공통 · 기본 마무리와 전자레인지 시간'];
function appetizers(used) {
  const secs = sections(read('10_안주_가이드.md')), ut = {}, price = {}, out = [];
  const tools = secs.find((e) => e.title === '서빙 식기'), list = secs.find((e) => e.title === '안주 목록과 가격');
  if (tools) tools.body.split('\n').forEach((l) => { const m = l.match(/^-\s*([^:]+):\s*(.+)$/); if (m) m[1].split(',').forEach((n) => { ut[foodKey(n)] = m[2].trim(); }); });
  if (list) {
    const pm = list.body.match(/([가-힣 ]+?)만 메뉴판에 ([\d,]+원)/); if (pm) price[foodKey(pm[1])] = pm[2];
    // 페이히어 가격 줄: '- 가격(페이히어 …): 1. 올리브 8pc 8,000원 · 2. …'
    const pl = list.body.split('\n').find((l) => /^-\s*가격\(페이히어/.test(l));
    if (pl) pl.replace(/^[^:]+:\s*/, '').split(' · ').forEach((x) => { const m = x.trim().match(/^(.+?)\s+([\d,]+원)$/); if (m) price[foodKey(m[1])] = m[2]; });
  }
  const make = (name, text, sec) => {
    const sentences = text.split(/\.\s*/).map((x) => x.trim()).filter(Boolean).map((x) => x + '.');
    const steps = [], finish = [];
    sentences.forEach((t) => { if (/마무리/.test(t) && sentences.length > 1) finish.push(t); else steps.push(t); });
    let prep = [];
    FOOD_TOOLS.forEach((w) => { if (text.indexOf(w) >= 0 && !prep.some((p) => p.indexOf(w) >= 0)) prep = prep.filter((p) => w.indexOf(p) < 0).concat([w]); });
    prep.sort((a, b) => text.indexOf(a) - text.indexOf(b));
    const it = { id: dedupe(used, 'a' + hash('appetizers', sec, name)), name };
    const p = price[foodKey(name)], u = ut[foodKey(name)];
    if (p) it.price = p;
    if (u) it.utensil = u;
    it.ingredients = prep; it.steps = steps;
    if (finish.length) it.garnish = finish.join(' ');
    if (!u) { it.confirm = true; it.confirmNote = '서빙 식기 안내 없음'; }
    return it;
  };
  secs.forEach((e) => {
    if (NOT_RECIPE.includes(e.title)) return;
    const lines = e.body.split('\n').map((x) => x.trim()).filter(Boolean), bullets = lines.filter((l) => /^-\s*[^:]+:/.test(l));
    if (bullets.length) bullets.forEach((l) => { const m = l.match(/^-\s*([^:]+):\s*(.+)$/); out.push(make(m[1].trim(), m[2].trim(), e.title)); });
    else out.push(make(e.title, lines.join(' '), e.title));
  });
  return out;
}

// ---- 칵테일·기타 음료
const bullets = (body) => body.split('\n').map((l) => l.trim()).filter((l) => /^[•-]\s*/.test(l)).map((l) => l.replace(/^[•-]\s*/, ''));
const sentencesOf = (t) => t.split(/\.\s*/).map((x) => x.trim()).filter(Boolean);
const INGREDIENT_LABELS = ['와인', '콜라', '오렌지주스', '크렘 드 카시스', '얼음'];
function cocktailItem(used, kind, sec, status) {
  const name = sec.title.replace(/\s*레시피.*$/, '').trim(), pre = kind === 'others' ? 'x' : 'k';
  const it = { id: dedupe(used, pre + hash(kind, sec.title, name)), name };
  const rows = bullets(sec.body), confirmNotes = [], notes = [];
  if (kind === 'cocktails') it.status = status;
  const ing = [], steps = [];
  const prose = sec.body.split('\n').map((l) => l.trim()).filter((l) => l && !/^[•-]\s*/.test(l));
  if (status === 'candidate') {
    // 초안 후보: 첫 줄(소개) 은 메모, "코스 초안 레시피(..): 재료. 제조" 줄에서 재료·순서를 뽑는다.
    prose.forEach((l) => notes.push(strip(l)));
    rows.forEach((r) => {
      const m = r.match(/^코스 초안 레시피\(([^)]*)\):\s*(.+)$/);
      if (m && !ing.length) {
        const sent = sentencesOf(m[2]);
        sent[0].split(/\s\+\s|,\s/).map((x) => x.trim()).filter(Boolean).forEach((x) => ing.push(strip(x)));
        sent.slice(1).forEach((x) => steps.push(strip(x) + '.'));
        notes.push('구분: ' + m[1]);
        if (/\[확인\]/.test(r)) confirmNotes.push(strip(r));
      } else { notes.push(strip(r)); if (/\[확인\]/.test(r)) confirmNotes.push(strip(r)); }
    });
  } else {
    prose.forEach((l) => { if (/\[확인\]/.test(l)) confirmNotes.push(strip(l)); });
    rows.forEach((r) => {
      const m = r.match(/^([^:]+):\s*([\s\S]*)$/), has = /\[확인\]/.test(r);
      if (!m) { notes.push(strip(r)); if (has) confirmNotes.push(strip(r)); return; }
      const label = m[1].trim(), val = m[2].trim();
      if (label === '잔') it.glass = strip(val.replace(/\s*\(사장님 확인[^)]*\)/, ''));
      else if (label === '가니시') { it.garnish = strip(val); }
      else if (label === '구분') { if (/논알코올/.test(val)) it.nonalcohol = true; notes.push(strip(r)); }
      else if (label === '확인') confirmNotes.push(strip(val));
      else if (label === '재료') val.split(/,\s*/).map((x) => strip(x)).filter(Boolean).forEach((x) => ing.push(x));
      else if (label === '만드는 순서') strip(val).split(/\s\+\s/).map((x) => x.trim()).filter(Boolean).forEach((x) => steps.push(x));
      else if (label === '순서' || label === '만드는 법') sentencesOf(strip(val)).forEach((x) => steps.push(x + '.'));
      else if (INGREDIENT_LABELS.includes(label)) ing.push(label + ': ' + strip(val));
      else notes.push(label + ': ' + strip(val));
      if (has && label !== '확인') confirmNotes.push(strip(r));
    });
    if (kind === 'others' && !it.nonalcohol) { /* 알코올 음료 */ }
  }
  it.ingredients = ing; it.steps = steps;
  if (it.garnish === undefined) delete it.garnish;
  const note = notes.filter(Boolean).join(' · ');
  if (note) it.note = note;
  if (confirmNotes.length || /\[확인\]/.test(sec.body)) { it.confirm = true; const cn = [...new Set(confirmNotes)].join(' / '); if (cn) it.confirmNote = cn; }
  return it;
}
function cocktails(used) {
  const secs = sections(read('12_칵테일_레시피.md')), out = { cocktails: [], others: [] };
  const confirmed = ['칼리모초', '키르', '미모사'], others = ['퍼지네이블', '말리부오렌지', '스크류드라이버', '블랙러시안', '뱅쇼', '샹그리아'];
  const find = (n) => secs.find((s) => s.title.indexOf(n + ' 레시피') === 0);
  confirmed.forEach((n) => out.cocktails.push(cocktailItem(used, 'cocktails', find(n), 'confirmed')));
  const cand = secs.filter((s) => /\(초안 후보/.test(s.title) && /레시피/.test(s.title));
  cand.forEach((s) => out.cocktails.push(cocktailItem(used, 'cocktails', s, 'candidate')));
  others.forEach((n) => out.others.push(cocktailItem(used, 'others', find(n), 'confirmed')));
  return out;
}

// ---- 응대 멘트
function phrases() {
  const text = read('13_손님_응대_멘트.md'), out = { sections: [] }, used = new Set();
  for (const section of text.split(/\n(?=## )/).slice(1)) {
    const parts = section.split(/\n(?=### )/), head = parts[0].split('\n')[0].replace(/^## /, '').trim();
    if (parts.length < 2) continue;
    const sec = { id: dedupe(used, 's' + hash('phrases', head)), title: head.replace(/^\d+\.\s*/, '').trim() };
    const notice = parts[0].split('\n').slice(1).filter((l) => /^>/.test(l)).map((l) => l.replace(/^>\s*/, '')).join(' ');
    if (notice) sec.note = strip(notice).replace(/^주의:\s*/, '');
    sec.items = [];
    for (const part of parts.slice(1)) {
      const lines = part.split('\n'), title = lines.shift().replace(/^### /, '').trim(), num = (title.match(/^(\d+-\d+)\s/) || [])[1];
      const it = { id: dedupe(used, 'p' + hash('phrases', head, title)), situation: title.replace(/^\d+-\d+\s+/, '').trim(), lines: [] };
      const confirmNotes = [];
      lines.filter((l) => /^>/.test(l)).forEach((l) => {
        const t = l.replace(/^>\s*/, '').trim(), quoted = t.match(/^(?:\(([^)]*)\)\s*)?(?:([가-힣]+):\s*)?"([\s\S]*)"$/);
        if (quoted) {
          const pre = (quoted[1] ? '(' + quoted[1] + ') ' : '') + (quoted[2] ? quoted[2] + ': ' : '');
          it.lines.push({ kind: 'customer', text: pre + quoted[3].trim() });
        } else {
          if (/\[확인\]/.test(t)) confirmNotes.push(strip(t));
          it.lines.push({ kind: 'staff', text: strip(t) });
        }
      });
      const notes = lines.filter((l) => l.trim() && l !== '---' && !/^>/.test(l)).join(' ');
      lines.filter((l) => l.trim() && l !== '---' && !/^>/.test(l) && /\[확인\]/.test(l)).forEach((l) => confirmNotes.push(strip(l)));
      if (notes) it.note = strip(notes);
      if (/\[확인\]/.test(part) || num === '5-7') {
        it.confirm = true;
        if (num === '5-7' && !confirmNotes.length) confirmNotes.push('새 응대 문장, 말투 승인 전. 관리자 확인 후 사용');
        const cn = [...new Set(confirmNotes)].join(' / ');
        if (cn) it.confirmNote = cn.slice(0, 300);
      }
      sec.items.push(it);
    }
    out.sections.push(sec);
  }
  return out;
}

module.exports = function extract() {
  const used = new Set();
  const a = appetizers(used), c = cocktails(used);
  return { recipes: { appetizers: a, cocktails: c.cocktails, others: c.others }, phrases: phrases() };
};
