// 제공된 RGBA PNG만 축소한다. macOS·Linux에서 외부 프로그램 없이 실행한다.
const zlib=require('node:zlib');
function crc(data){let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);t.copy(b,4);data.copy(b,8);b.writeUInt32BE(crc(Buffer.concat([t,data])),data.length+8);return b;}
function encode(width,height,pixels){const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)pixels.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
function decode(png){
 if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('로고는 PNG여야 합니다.');
 let width,height,parts=[];
 for(let p=8;p<png.length;){const n=png.readUInt32BE(p),type=png.subarray(p+4,p+8).toString(),d=png.subarray(p+8,p+8+n);if(type==='IHDR'){width=d.readUInt32BE(0);height=d.readUInt32BE(4);if(d[8]!==8||d[9]!==6||d[12]!==0)throw Error('제공된 비인터레이스 RGBA 로고만 지원합니다.');}if(type==='IDAT')parts.push(d);p+=n+12;}
 const raw=zlib.inflateSync(Buffer.concat(parts)),stride=width*4,pixels=Buffer.alloc(stride*height);
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('잘못된 PNG 필터');for(let x=0;x<stride;x++){
  const a=x>=4?pixels[y*stride+x-4]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=4?pixels[(y-1)*stride+x-4]:0;
  const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c),predict=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):pa<=pb&&pa<=pc?a:pb<=pc?b:c;
  pixels[y*stride+x]=(raw[y*(stride+1)+1+x]+predict)&255;
 }}return {width,height,pixels};
}
function resize(image,width,height){
 const output=Buffer.alloc(width*height*4),sx=image.width/width,sy=image.height/height;
 // 면적 평균·알파 가중: 투명 테두리를 유지하고 작은 필기체의 경계를 부드럽게 축소한다.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sums=[0,0,0],left=x*sx,right=(x+1)*sx,top=y*sy,bottom=(y+1)*sy;let alpha=0;
  for(let yy=Math.floor(top);yy<Math.ceil(bottom);yy++)for(let xx=Math.floor(left);xx<Math.ceil(right);xx++){
   const weight=(Math.min(right,xx+1)-Math.max(left,xx))*(Math.min(bottom,yy+1)-Math.max(top,yy)),index=(yy*image.width+xx)*4,a=image.pixels[index+3]*weight;
   alpha+=a;for(let c=0;c<3;c++)sums[c]+=image.pixels[index+c]*a;
  }
  const p=(y*width+x)*4;for(let c=0;c<3;c++)output[p+c]=alpha?Math.round(sums[c]/alpha):0;output[p+3]=Math.round(alpha/(sx*sy));
 }return output;
}
module.exports=function(png){const source=decode(png),height=80,width=Math.round(source.width*height/source.height),header=encode(width,height,resize(source,width,height));const fw=32,fh=Math.round(source.height*fw/source.width),small=resize(source,fw,fh),canvas=Buffer.alloc(32*32*4),offset=Math.floor((32-fh)/2);for(let y=0;y<fh;y++)small.copy(canvas,((y+offset)*32)*4,y*fw*4,(y+1)*fw*4);const favicon=encode(32,32,canvas);return {header:'data:image/png;base64,'+header.toString('base64'),favicon:'data:image/png;base64,'+favicon.toString('base64'),headerBytes:header.length,faviconBytes:favicon.length};};
