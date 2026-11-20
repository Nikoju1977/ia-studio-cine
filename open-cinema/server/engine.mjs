import {spawn} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {writeFile, readFile, mkdir, stat} from 'node:fs/promises';
import path from 'node:path';

export const OUTPUTS = Object.freeze({ '16:9':{width:3840,height:2160}, '9:16':{width:2160,height:3840}, '1:1':{width:3840,height:3840}, '17:9':{width:4096,height:2160}});
export const CAMERA = ['travelling avant lent','travelling latéral','contre-plongée lente','plan aérien','macro, faible profondeur de champ','caméra orbitale','plan large contemplatif','plan rapproché'];
export const SHOT_TYPES = ['Ouverture','Installation','Détail','Révélation','Progression','Contraste','Apogée','Final'];
const palettes = {
  noir: ['#08111c','#11293b','#0bb9b9','#e7b870'],
  techno:['#070a19','#231341','#7a3bff','#07e7d8'],
  nature:['#081d1b','#214c45','#78ae7a','#e3c893'],
  cinema:['#111822','#23465c','#c79569','#e8ddc3']
};
const clean = v=>String(v??'').normalize('NFKC').replace(/[\x00-\x1f\x7f]/g,' ').trim();
const between=(v,a,b)=>Math.max(a,Math.min(b,v));
export function slug(s){return clean(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,56)||'film';}
export function titleFor(prompt){return clean(prompt).slice(0,72)||'Film sans titre';}
export function validateOptions(o){
  if(!o || typeof o !== 'object') throw new Error('Paramètres du film absents.');
  const prompt=clean(o.prompt);
  if(prompt.length<12 || prompt.length>1500) throw new Error('Le prompt doit contenir entre 12 et 1500 caractères.');
  const aspect=OUTPUTS[o.aspect] ? o.aspect : '16:9';
  const count=between(Math.trunc(Number(o.shotCount)||4),1,12);
  const seconds=between(Math.trunc(Number(o.shotSeconds)||4),2,12);
  const engine=['procedural','imported','comfy-image','comfy-video','agnes-video-flash','agnes-image-flash'].includes(o.engine)?o.engine:'procedural';
  const grade=['cinema','techno','nature','noir'].includes(o.grade)?o.grade:'cinema';
  const soundtrackId=typeof o.soundtrackId==='string' && /^[0-9a-f-]{36}$/.test(o.soundtrackId) ? o.soundtrackId : null;
  return {prompt,aspect,count,seconds,engine,grade,soundtrackId};
}
export function makeStoryboard(input){
  const o=validateOptions(input);
  const seed=Number.parseInt(createHash('sha256').update(o.prompt).digest('hex').slice(0,8),16);
  const title=titleFor(o.prompt);
  const shots=Array.from({length:o.count},(_,i)=>{
    const name=SHOT_TYPES[Math.min(SHOT_TYPES.length-1,Math.floor(i/o.count*SHOT_TYPES.length))];
    const camera=CAMERA[(seed+i*3)%CAMERA.length];
    const energy=Math.round(25+65*Math.sin((i+1)/(o.count+1)*Math.PI));
    return {id:randomUUID(),index:i+1,title:name,duration:o.seconds,
      camera,energy,seed:(seed+i*7919)>>>0,
      prompt:`${o.prompt}. Plan ${i+1}/${o.count}: ${name.toLowerCase()}; ${camera}; composition cinéma, lumière motivée, profondeur de champ, détails cohérents, cohérence du personnage et du décor, aucune écriture ni filigrane.`};
  });
  return {version:1,id:randomUUID(),title,aspect:o.aspect,grade:o.grade,engine:o.engine,soundtrackId:o.soundtrackId,shots};
}
export function validateStoryboard(body){
  if(!body||!OUTPUTS[body.aspect]||!Array.isArray(body.shots)||body.shots.length<1||body.shots.length>12) throw new Error('Storyboard invalide (1 à 12 plans, cadre valide).');
  const engine=['procedural','imported','comfy-image','comfy-video','agnes-video-flash','agnes-image-flash'].includes(body.engine)?body.engine:'procedural';
  const grade=['cinema','techno','nature','noir'].includes(body.grade)?body.grade:'cinema';
  const soundtrackId=typeof body.soundtrackId==='string'&&/^[0-9a-f-]{36}$/.test(body.soundtrackId)?body.soundtrackId:null;
  return {version:1,title:titleFor(body.title||'Film'),aspect:body.aspect,grade,engine,soundtrackId,shots:body.shots.map((c,i)=>{
    if(typeof c.prompt!=='string'||c.prompt.trim().length<8||c.prompt.length>1600) throw new Error('Prompt invalide pour le plan '+(i+1));
    return {id:randomUUID(),index:i+1,title:clean(c.title).slice(0,50)||`Plan ${i+1}`,camera:clean(c.camera).slice(0,120),prompt:clean(c.prompt),duration:between(Math.round(Number(c.duration)*10)/10||4,1,15),seed:Number.isFinite(c.seed)?c.seed>>>0:i+1,
      sourceAssetId:typeof c.sourceAssetId==='string'&&/^[0-9a-f-]{36}$/.test(c.sourceAssetId)?c.sourceAssetId:null,
      referenceAssetId:typeof c.referenceAssetId==='string'&&/^[0-9a-f-]{36}$/.test(c.referenceAssetId)?c.referenceAssetId:null};
  })};
}
export function dims(aspect){return OUTPUTS[aspect]||OUTPUTS['16:9'];}
export function ffmpegFilter({width,height,kind,grade,seconds}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<160||height<160||width>4096||height>4096) throw new Error('Dimensions invalides');
  const palette={cinema:{gamma:1.00,contrast:1.08,saturation:0.92},techno:{gamma:0.96,contrast:1.12,saturation:1.16},noir:{gamma:0.98,contrast:1.18,saturation:0},nature:{gamma:1.01,contrast:1.06,saturation:1.07}}[grade]||{gamma:1,contrast:1,saturation:1};
  const base=`scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},setsar=1,eq=contrast=${palette.contrast}:gamma=${palette.gamma}:saturation=${palette.saturation}`;
  const fade=Math.min(0.22,seconds/8);
  return `${base},fade=t=in:st=0:d=${fade.toFixed(3)},fade=t=out:st=${Math.max(0,seconds-fade).toFixed(3)}:d=${fade.toFixed(3)},fps=24,format=yuv420p`;
}
export function runProcess(cmd,args,{signal,onLine,timeoutMs=600000}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new DOMException('Annulé','AbortError'));
    const child=spawn(cmd,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});
    let stderr='',ended=false;
    const kill=()=>{try{child.kill('SIGTERM');}catch{}};
    signal?.addEventListener('abort',kill,{once:true});
    const timeout=setTimeout(()=>kill(),timeoutMs);
    child.stdout.on('data',chunk=>onLine?.(String(chunk).slice(0,1000)));
    child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-9000);onLine?.(String(chunk).slice(0,1000));});
    child.on('error',err=>finish(err));
    child.on('close',code=>finish(signal?.aborted?new DOMException('Annulé','AbortError'):code===0?null:new Error(`${cmd} a échoué (code ${code}) : ${stderr.slice(-650)}`)));
    function finish(err){if(ended)return;ended=true;clearTimeout(timeout);signal?.removeEventListener('abort',kill);err?reject(err):resolve(stderr);}
  });
}
export async function inspectMedia(file,{signal}={}){
  let out='';
  await runProcess('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels','-of','json',file],{signal,onLine:txt=>{out+=txt;},timeoutMs:25000});
  try{return JSON.parse(out);}catch{throw new Error('Impossible de lire les métadonnées FFprobe.');}
}
// Dependency-free PNG encoder. The procedural option generates original motion-graphics frames;
// it is deliberately NOT misrepresented as AI-generated photorealistic footage.
const crcTable=(()=>{const t=[];for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t.push(c>>>0);}return t;})();
function crc32(buffer){let c=0xffffffff;for(const b of buffer)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(name,data){const n=Buffer.from(name);const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([n,data])));return Buffer.concat([len,n,data,crc]);}
const hex = s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
export async function proceduralFrame(file,shot,aspect,grade){
  const portrait=aspect==='9:16',square=aspect==='1:1';
  const w=portrait?540:square?720:960,h=portrait?960:square?720:540;
  const pal=palettes[grade]||palettes.cinema;
  const [a,b,c,d]=pal.map(hex);
  const seed=(shot.seed>>>0)||1;
  const raw=Buffer.alloc(h*(w*3+1));
  const centerX=.48+.12*Math.sin(seed*0.00001),centerY=.42+.08*Math.cos(seed*0.00002);
  for(let y=0;y<h;y++){
    const r=y*(w*3+1);raw[r]=0;
    for(let x=0;x<w;x++){
      const nx=x/w,ny=y/h;
      const dist=Math.sqrt(((nx-centerX)*1.04)**2+((ny-centerY)*.95)**2);
      const ray=Math.max(0,1-dist*2.3);
      const swirl=Math.sin(nx*19+ny*6+seed*.0002)+Math.sin(nx*6-ny*11+seed*.0004);
      const ring=Math.exp(-Math.abs(dist-(.19+.035*Math.sin((nx+ny)*13)))*18);
      const dust=Math.sin(x*12.9898+y*78.233+seed)*43758.5453%1;
      const mix=between((ny*.45+ray*.18+swirl*.035),0,1);
      const halo=between(ray*.33+ring*.20,0,.65);
      const pixel=r+1+x*3;
      for(let ch=0;ch<3;ch++)raw[pixel+ch]=between(Math.round(a[ch]*(1-mix)+b[ch]*mix+c[ch]*halo+d[ch]*Math.max(0,ray-.7)*.5+(dust-.5)*5),0,255);
    }
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);
  await writeFile(file,png);return {w,h,bytes:png.length};
}
export async function buildShot({source,out,shot,aspect,grade,signal,preset='medium',kind='image'}){
  const {width,height}=dims(aspect);
  const secs=shot.duration;
  const args=['-hide_banner','-loglevel','error','-y'];
  const inputKind=kind==='video';
  if(inputKind)args.push('-stream_loop','-1','-i',source);
  else args.push('-loop','1','-framerate','24','-i',source);
  let hasSound=false;
  if(inputKind){const probe=await inspectMedia(source,{signal});hasSound=probe.streams?.some(s=>s.codec_type==='audio')||false;}
  if(!hasSound)args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
  args.push('-t',String(secs),'-map','0:v:0','-map',hasSound?'0:a:0':'1:a:0',
    '-vf',ffmpegFilter({width,height,kind,grade,seconds:secs}),
    '-c:v','libx264','-preset',preset,'-crf','18','-g','48','-pix_fmt','yuv420p',
    '-r','24','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
    '-c:a','aac','-b:a','192k','-ac','2','-ar','48000','-shortest','-movflags','+faststart',out);
  await runProcess('ffmpeg',args,{signal,timeoutMs:1200000});
  return await inspectMedia(out,{signal});
}
export async function concatShots(shotFiles,out,signal){
  if(!shotFiles.length)throw new Error('Aucun plan à assembler.');
  // FFmpeg concat's file syntax is generated internally with hashed paths, never user-supplied paths.
  const list=path.join(path.dirname(out),'shot-list-'+randomUUID()+'.txt');
  await writeFile(list,shotFiles.map(s=>`file '${s.replaceAll("'", "'\\''")}'`).join('\n')+'\n');
  await runProcess('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',out],{signal,timeoutMs:120000});
}
export async function masterAudio({video,out,soundtrack=null,signal}){
  const probe=await inspectMedia(video,{signal});
  const secs=Number(probe.format?.duration)||4;
  const args=['-hide_banner','-loglevel','error','-y','-i',video];
  if(soundtrack)args.push('-stream_loop','-1','-i',soundtrack);
  else {
    // Original, low-level, synthesized pulse + textured tone. Not an AI-composed musical score.
    const expr='0.14*sin(2*PI*55*t)*exp(-23*mod(t\\,0.5))+0.07*sin(2*PI*220*t)*exp(-30*mod(t\\,0.25))+0.025*sin(2*PI*330*t)*exp(-8*mod(t\\,2))';
    args.push('-f','lavfi','-i',`aevalsrc=${expr}:s=48000:c=stereo`);
  }
  const mixDuration=secs.toFixed(3);
  const outro=Math.max(0,secs-1.1).toFixed(3);
  args.push('-filter_complex',`[0:v]fps=24,setpts=N/(24*TB),format=yuv420p[vout];[0:a]volume=0.88[a];[1:a]atrim=duration=${mixDuration},asetpts=PTS-STARTPTS,volume=${soundtrack?'0.46':'0.48'},afade=t=in:st=0:d=0.7,afade=t=out:st=${outro}:d=1.0[b];[a][b]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`,
  '-map','[vout]','-map','[aout]','-c:v','libx264','-preset',process.env.FFMPEG_PRESET||'medium','-crf','18','-r','24','-fps_mode','cfr','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-c:a','aac','-b:a','256k','-ar','48000','-ac','2','-t',mixDuration,'-movflags','+faststart',out);
  await runProcess('ffmpeg',args,{signal,timeoutMs:120000});
  return await inspectMedia(out,{signal});
}
export function verifyMaster(info,aspect){
  const target=dims(aspect);
  const v=info.streams?.find(s=>s.codec_type==='video');
  const a=info.streams?.find(s=>s.codec_type==='audio');
  const checks={resolution:!!v&&v.width===target.width&&v.height===target.height,
    frameRate:!!v&&(['24/1','24/1.0','24'].includes(String(v.avg_frame_rate))),
    codec:!!v&&v.codec_name==='h264',
    audio:!!a&&a.codec_name==='aac'&&Number(a.sample_rate)===48000&&Number(a.channels)===2,
    duration:Number(info.format?.duration)>0};
  return {checks,pass:Object.values(checks).every(Boolean),dimensions:target,seconds:Number(info.format?.duration),bytes:Number(info.format?.size)};
}
