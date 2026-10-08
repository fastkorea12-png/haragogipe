// 지식/*.md 를 읽어 템플릿.html 에 내장하고 ../챗봇_시안.html 을 만든다. (node 빌드.js)
const fs=require('fs'),path=require('path'),crypto=require('crypto');
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
const safe=s=>JSON.stringify(s).replace(/</g,'\\u003c');
const sourceHash=crypto.createHash('sha256').update(JSON.stringify(kb)+JSON.stringify(wines)+tpl).digest('hex').slice(0,10);
const endpoint=process.env.HARAGO_AI_ENDPOINT||'';
if(endpoint&&!/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\/api\/chat$/.test(endpoint))throw new Error('AI endpoint must be an HTTPS Cloudflare Worker URL.');
const logEnabled=process.env.HARAGO_QUESTION_LOG_ENABLED==='true';
const built=tpl.replace('/*KB_JSON*/[]',safe(kb)).replace('/*WINE_JSON*/[]',safe(wines)).replace('/*VERSION_JSON*/{}',safe({sourceHash})).replace('/*AI_ENDPOINT_JSON*/""',safe(endpoint)).replace('/*QUESTION_LOG_ENABLED*/false',safe(logEnabled));
fs.writeFileSync(path.join(root,'챗봇_시안.html'),built);
console.log('항목',kb.length,'개 내장');
