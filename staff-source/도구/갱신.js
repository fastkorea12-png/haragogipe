// 원본 자료를 반영하고 검증을 통과한 HTML을 만든다. 외부 전송은 이 명령에서 하지 않는다.
const {spawnSync}=require('child_process'),path=require('path');
for(const file of ['설명_반영.js','빌드.js','시험.js','전반_점검.js']){
  const result=spawnSync(process.execPath,[path.join(__dirname,file)],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
