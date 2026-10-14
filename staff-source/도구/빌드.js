// 지식/*.md 를 읽어 템플릿.html 에 내장하고 ../근무노트.html 을 만든다. (node 빌드.js)
const fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os'),{execFileSync}=require('child_process');
const root=path.join(__dirname,'..'), kdir=path.join(root,'지식');
const files=fs.readdirSync(kdir).filter(f=>/^\d\d_.*\.md$/.test(f)).sort();
const kb=[];
for(const f of files){
  const txt=fs.readFileSync(path.join(kdir,f),'utf8');
  txt.split(/\n(?=## )/).slice(1).forEach(sec=>{
    const lines=sec.split('\n'); const title=lines[0].replace(/^## /,'').trim();
    let status='',kw=[],body=[];
    lines.slice(1).forEach(l=>{
      if(l.startsWith('- 상태:'))status=l.slice(5).trim();
      else if(l.startsWith('- 키워드:'))kw=l.slice(6).split(',').map(s=>s.trim()).filter(Boolean);
      else body.push(l);
    });
    kb.push({file:f.replace(/\.md$/,''),title,status,kw,body:body.join('\n').trim()});
  });
}
const tpl=fs.readFileSync(path.join(__dirname,'템플릿.html'),'utf8');
const wines=JSON.parse(fs.readFileSync(path.join(__dirname,'와인_추천_데이터.json'),'utf8'));
const menuSource=JSON.parse(fs.readFileSync(path.join(__dirname,'메뉴판_허용자료_1008.json'),'utf8'));
const foods=menuSource.rows.filter(r=>/^MENU\s+\d+/.test(r.values[0])&&r.values[2]).map(r=>({name:r.values[2],description:r.description||'',sourceRow:r.row}));
const wineMenu=menuSource.rows.filter(r=>/wine/i.test(r.values[0]||'')&&r.values[2]).map(r=>({category:String(r.values[0]).replace(/\s+\d+.*$/,'').trim(),name:r.values[2],english:r.values[4],origin:r.values[5],variety:r.values[6]}));
const safe=s=>JSON.stringify(s).replace(/</g,'\\u003c');
const sourceHash=crypto.createHash('sha256').update(JSON.stringify(kb)+JSON.stringify(wines)+JSON.stringify(foods)+JSON.stringify(wineMenu)+tpl).digest('hex').slice(0,10);

const phrases=[];
const phraseText=fs.readFileSync(path.join(kdir,'13_손님_응대_멘트.md'),'utf8');
for(const section of phraseText.split(/\n(?=## )/).slice(1)){
 const parts=section.split(/\n(?=### )/),group=parts[0].split('\n')[0].replace(/^## /,'');
 const notice=parts[0].split('\n').slice(1).filter(l=>/^>/.test(l)).map(l=>l.replace(/^>\s*/, '')).join('\n');
 for(const part of parts.slice(1)){
  const lines=part.split('\n'),title=lines.shift().replace(/^### /,'').trim();
  const speech=lines.filter(l=>/^>/.test(l)).map(l=>l.replace(/^>\s*/, '')).join('\n');
  const notes=lines.filter(l=>l.trim()&&l!=='---'&&!/^>/.test(l)).join('\n');
  phrases.push({group,title,speech,notes,notice,file:'13_손님_응대_멘트',section:group+' > '+title,confirm:/\[확인\]/.test(speech+' '+notes)||/^5-7\b/.test(title)});
 }
}
for(const [file,title] of [['04_칵테일_전환_가격','안내 멘트 (손님에게)'],['05_이벤트_응대','손님에게 말할 문장 (이벤트)'],['05_이벤트_응대','리뷰 표기 원칙']]){
 const entry=kb.find(e=>e.file===file&&e.title===title);
 if(entry)phrases.push({group:'전환·리뷰 원문',title,speech:entry.body,notes:file,file,section:title,notice:'[확인] 이벤트 시작 여부·기간 확인 후 사용할 것.',confirm:true});
}
const recipePhotos={};
const photoDir=path.join(kdir,'사진');
const photoNames=[...new Set((fs.existsSync(photoDir)?fs.readdirSync(photoDir):[]).filter(f=>/\.(jpg|png)$/i.test(f)).map(f=>f.replace(/\.(jpg|png)$/i,'')))];
for(const name of photoNames){
 const source=['jpg','png'].map(ext=>path.join(kdir,'사진',name+'.'+ext)).find(f=>fs.existsSync(f));
 if(!source)continue;
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'harago-photo-')),out=path.join(tmp,'photo.jpg');
 try{
  execFileSync('sips',['--resampleHeightWidthMax','1000','--setProperty','format','jpeg','--setProperty','formatOptions','75',source,'--out',out],{stdio:'pipe'});
  recipePhotos[name]='data:image/jpeg;base64,'+fs.readFileSync(out).toString('base64');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
const logo=require('./로고_축소.js')(fs.readFileSync(path.join(kdir,'로고.png')));
const adminChecklist=require('./체크리스트_추출.js')(kb);
const adminBase=(()=>{try{return new URL(process.env.HARAGO_AI_ENDPOINT).origin;}catch{return 'https://haragogipe-staff-ai.haragogipe-staff-ai-worker.workers.dev';}})();
const built=tpl.replace('/*LOGO_URL*/',logo.header).replace('/*LOGO_URL2*/',logo.header).replace('/*FAVICON_URL*/',logo.favicon).replace('/*KB_JSON*/[]',safe(kb)).replace('/*WINE_JSON*/[]',safe(wines)).replace('/*FOOD_JSON*/[]',safe(foods)).replace('/*WINE_MENU_JSON*/[]',safe(wineMenu)).replace('/*VERSION_JSON*/{}',safe({sourceHash})).replace('/*PHRASES_JSON*/[]',safe(phrases)).replace('/*PHOTOS_JSON*/{}',safe(recipePhotos)).replace('/*CHECKLIST_API_BASE*/""',()=>safe(adminBase)).replace('/*BUILTIN_CL_JSON*/{}',()=>safe(adminChecklist));
fs.writeFileSync(path.join(root,'근무노트.html'),built);
console.log('항목',kb.length,'개 내장 / 응대 멘트',phrases.length,'개 / 사진',Object.keys(recipePhotos).length,'개 / 로고',logo.headerBytes,'bytes / 파비콘',logo.faviconBytes,'bytes');

// 어드민 페이지(근무노트와 별개 산출물): 현재 내장 체크리스트를 시작값으로 심는다.
const adminTpl=fs.readFileSync(path.join(__dirname,'어드민.html'),'utf8');
fs.writeFileSync(path.join(root,'어드민.html'),adminTpl.replace('/*LOGO_URL*/',logo.header).replace('/*FAVICON_URL*/',logo.favicon).replace('/*ADMIN_API_BASE*/""',safe(adminBase)).replace('/*CHECKLIST_JSON*/{}',()=>safe(adminChecklist)));
console.log('어드민.html 생성 / 서버 주소',adminBase);
