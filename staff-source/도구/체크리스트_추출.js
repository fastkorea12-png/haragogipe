// 09_운영_매뉴얼의 오픈·마감 순서를 어드민용 JSON으로 바꾼다. 항목 id는 종류·소제목·문구의 해시라 같은 입력에서 같다.
const crypto=require('crypto');
const DAYS={'월요일':[1],'화요일':[2],'수요일':[3],'목요일':[4],'월~목':[1,2,3,4]};
function parseKind(kind,body){
 const out={sections:[]},used=new Set();let sec=null,intro=[];
 const start=(title,note)=>{sec={title,note:[],items:[],_key:title,_confirm:false,_biweekly:false,_days:undefined};out.sections.push(sec);};
 for(const line of String(body).split('\n')){
  const s=line.trim();if(!s)continue;
  if(/^### /.test(s)){
   let t=s.slice(4),days,confirm=/\[확인\]/.test(t),bi=/격주/.test(t);
   const m=t.match(/\s*·\s*(월요일|화요일|수요일|목요일|월~목)\s*$/);if(m){days=DAYS[m[1]];t=t.replace(m[0],'');}
   t=t.replace(/\s*\[확인\]/g,'').replace(/\s*·\s*격주\s*$/,'').trim();
   const merged=out.sections.find(x=>x.title===t&&days);
   if(merged){sec=merged;}else{start(t);}
   sec._days=days;sec._confirm=confirm;sec._biweekly=bi;sec._src=s;continue;
  }
  if(!sec){if(/^-\s/.test(s)){start('기본 준비');}else{intro.push(s);continue;}}
  if(/^-\s/.test(s)){
   const text=s.replace(/^-\s*/,'');
   let h=crypto.createHash('sha1').update(kind+'|'+sec._key+'|'+text).digest('hex').slice(0,8),id=(kind==='open'?'o':'c')+h;
   while(used.has(id))id+='x';used.add(id);
   const it={id,text};if(sec._days)it.days=sec._days;if(sec._biweekly)it.biweekly=true;if(sec._confirm)it.confirm=true;sec.items.push(it);
  }else sec.note.push(s);
 }
 const kindIntro=intro.join(' ');
 if(kindIntro)out.intro=kindIntro;
 out.sections=out.sections.map(x=>{const o={title:x.title};if(x.note.length)o.note=x.note.join(' ');o.items=x.items;return o;});
 return out;
}
module.exports=function(kb){
 const find=t=>kb.find(e=>e.file==='09_운영_매뉴얼'&&e.title===t);
 return {open:parseKind('open',find('오픈 순서').body),close:parseKind('close',find('마감 순서').body)};
};
