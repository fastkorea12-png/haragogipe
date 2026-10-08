const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const tabName = '챗봇 개선 질문';
const sheet = {
  rows: [['기록 시각','질문 분류','직원 질문','중복 묶음']],
  getLastRow(){return this.rows.length;},
  appendRow(row){this.rows.push(row);},
  getRange(row,col,count,width){return{getValues:()=>this.rows.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width))};},
  deleteRow(row){this.rows.splice(row-1,1);}
};
let opened = 0;
const output = {text:'',setMimeType(){return this;}};
const context = {
  Date,
  SpreadsheetApp:{openById(id){assert.equal(id,'1da2YXUWc6qpaIr1i0KANGp3ZwdBu1DL2gpSktBPkVWk');return{getSheetByName(name){opened++;assert.equal(name,tabName);return sheet;}};}},
  PropertiesService:{getScriptProperties(){return{getProperty(name){assert.equal(name,'SHEETS_LOG_TOKEN');return'test-token';}};}},
  LockService:{getScriptLock(){return{tryLock(){return true;},releaseLock(){}};}},
  ContentService:{MimeType:{JSON:'JSON'},createTextOutput(text){output.text=text;return output;}}
};
vm.runInNewContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),context);
const post = value => context.doPost({postData:{contents:JSON.stringify(value)}});
const result = r => JSON.parse(r.text);

assert.equal(result(post({token:'wrong',action:'append',consent:true,question:'open'})).ok,false);
assert.equal(opened,0);
assert.equal(result(post({token:'test-token',action:'append',consent:false,question:'open'})).ok,false);
assert.equal(sheet.rows.length,1);
assert.equal(result(post({token:'test-token',action:'append',consent:true,question:'전화 010-1234-5678'})).saved,false);
assert.equal(sheet.rows.length,1);
assert.equal(result(post({token:'test-token',action:'append',consent:true,category:'오픈',question:'=IMPORTXML("url")'})).saved,true);
assert.equal(sheet.rows[1][2],"'=IMPORTXML(\"url\")");
assert.equal(result(post({token:'test-token',action:'append',consent:true,category:'오픈',question:'오픈 준비 순서',normalized:'오픈준비순서'})).saved,true);
assert.equal(sheet.rows.length,3);
assert.equal(sheet.rows[2][2],'오픈 준비 순서');
sheet.rows.push([new Date(Date.now()-91*24*60*60*1000),'오래된 분류','오래된 질문','오래된질문']);
assert.equal(result(post({token:'test-token',action:'cleanup'})).deleted,1);
assert.equal(sheet.rows.length,3);
console.log('Apps Script token·동의·개인정보 필터·로그 탭 한정 접근·90일 삭제 검증 통과');
