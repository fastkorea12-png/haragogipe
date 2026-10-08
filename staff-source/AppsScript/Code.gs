const SPREADSHEET_ID = '1da2YXUWc6qpaIr1i0KANGp3ZwdBu1DL2gpSktBPkVWk';
const LOG_TAB = '챗봇 개선 질문';
const RETENTION_DAYS = 90;

function doPost(e) {
  try {
    const body = JSON.parse(e && e.postData && e.postData.contents || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('SHEETS_LOG_TOKEN');
    if (!expected || typeof body.token !== 'string' || body.token !== expected) return json_({ok:false});
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(LOG_TAB);
    if (!sheet) return json_({ok:false});
    if (body.action === 'cleanup') {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(5000)) return json_({ok:false});
      try { return json_({ok:true,deleted:cleanup_(sheet)}); }
      finally { lock.releaseLock(); }
    }
    if (body.action !== 'append') return json_({ok:false});
    if (body.consent !== true) return json_({ok:false});
    const question = clean_(body.question);
    if (!question || question.length > 900 || unsafe_(question) || personal_(question)) return json_({ok:false,saved:false});
    const category = safeCell_(clean_(body.category).slice(0,80));
    const normalized = question.toLowerCase().replace(/[^0-9a-z가-힣]/g,'').slice(0,240);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return json_({ok:false});
    try {
      sheet.appendRow([new Date(),category,safeCell_(question),safeCell_(normalized)]);
      cleanup_(sheet);
      return json_({ok:true,saved:true});
    } finally { lock.releaseLock(); }
  } catch (err) {
    return json_({ok:false});
  }
}

function cleanup_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const dates = sheet.getRange(2,1,last - 1,1).getValues();
  let deleted = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i][0];
    if (date instanceof Date && date.getTime() < cutoff) { sheet.deleteRow(i + 2); deleted++; }
  }
  return deleted;
}

function clean_(value) {
  return String(value || '').replace(/[<>\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
}

function safeCell_(value) {
  return /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
}

function unsafe_(text) {
  return /급여|시급|계좌|통장|매입가|도매가|희망가|재고|발주량|직원.{0,5}(이름|연락처|전화)|전화번호|주민등록번호/i.test(text);
}

function personal_(text) {
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|01[016789][ -]?\d{3,4}[ -]?\d{4}|\b\d{6}[ -]?[1-4]\d{6}\b|\b\d{10,}\b/i.test(text)) return true;
  const generic = new Set(['손님','사장님','직원','팀장님','부팀장님','매니저님','점장님','고객님','선생님']);
  const names = Array.from(text.matchAll(/(?:^|[^가-힣])([가-힣]{2,4})\s?(님|씨)(?=은|는|이|가|께|에게|의|을|를|과|와|도|에게서|에서|[,.?!\s]|$)/g));
  return names.some(match => !generic.has(match[1] + match[2]));
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
