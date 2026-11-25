'use strict';
/* Actual Chromium canvas/Web Audio/MediaRecorder rendering. Independent test harness adapted from Studio Niko NikoAssist and OpenVita. */
// SPDX-License-Identifier: GPL-3.0-or-later
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const port=19490,base='http://127.0.0.1:'+port;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(fn,label,timeout=20000){
 const start=Date.now();let error;
 while(Date.now()-start<timeout){
  try{const result=await fn();if(result)return result;}catch(e){error=e;}
  await sleep(120);
 }
 throw new Error('Timeout '+label+(error?': '+error.message:''));
}
function chromeBinary(){
 if(process.env.CHROME_BIN)return process.env.CHROME_BIN;
 for(const candidate of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
  try{return execFileSync('which',[candidate],{encoding:'utf8'}).trim();}catch{}
 }
 throw Error('Chromium non disponible sur ce runner.');
}
async function main(){
 let server,chrome,ws,fixture;const pending=new Map(),browserErrors=[],httpPosts=[];
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'cinema-browser-'));
 let seq=0,diagnostics='';
 try{
  fixture=await fs.mkdtemp(path.join(root,'qa-render-'));
  await fs.writeFile(path.join(fixture,'index.html'),'<!doctype html><meta charset="utf-8"><title>Renderer integration test</title>');
  execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=2','-c:v','libvpx','-pix_fmt','yuv420p',path.join(fixture,'blue.webm')]);
  execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=3','-c:a','pcm_s16le',path.join(fixture,'tone.wav')]);
  server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory','.'],{
   cwd:root,stdio:['ignore','ignore','pipe']
  });
  server.stderr.on('data',chunk=>diagnostics+=String(chunk).slice(-1000));
  await poll(async()=>{const r=await fetch(base+'/');return r.status===200},'local web server');
  chrome=spawn(chromeBinary(),['--headless=new','--autoplay-policy=no-user-gesture-required','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--no-first-run','--no-default-browser-check','--disable-background-networking',
   '--remote-debugging-port=0','--remote-allow-origins=*',
   '--user-data-dir='+path.join(tmp,'chrome'),'about:blank'],{stdio:['ignore','ignore','pipe']});
  chrome.stderr.on('data',chunk=>diagnostics+=String(chunk).slice(-1000));
  const debuggerPort=await poll(async()=>{
   const raw=await fs.readFile(path.join(tmp,'chrome','DevToolsActivePort'),'utf8');
   return Number(raw.split('\n')[0]);
  },'Chrome DevTools');
  const tabs=await(await fetch('http://127.0.0.1:'+debuggerPort+'/json/list')).json();
  const tab=tabs.find(x=>x.type==='page');
  assert.ok(tab?.webSocketDebuggerUrl,'Chrome debugger page missing');
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});
  });
  ws.addEventListener('message',event=>{
   const msg=JSON.parse(event.data);
   if(msg.method==='Runtime.exceptionThrown')browserErrors.push(msg.params?.exceptionDetails?.exception?.description||'Browser exception');
   if(msg.method==='Network.requestWillBeSent'&&msg.params?.request?.method==='POST')httpPosts.push(msg.params.request.url);
   if(!msg.id||!pending.has(msg.id))return;
   const p=pending.get(msg.id);pending.delete(msg.id);
   msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);
  });
  function call(method,params={}){
   const id=++seq;
   return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('DevTools timeout '+method));},40000);
    pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
    ws.send(JSON.stringify({id,method,params}));
   });
  }
  async function evaluate(expression){
   const out=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
   if(out.exceptionDetails)throw Error('Browser JS: '+(out.exceptionDetails.exception?.description||out.exceptionDetails.text));
   return out.result?.value;
  }
  const wait=(expression,label)=>poll(()=>evaluate(expression),label,15000);
  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
  await call('Page.navigate',{url:base+'/'+path.basename(fixture)+'/index.html'});
  await wait('document.readyState==="complete"','fixture page loaded');
  const result=await evaluate('('+async function(){
    const {makeTimelineMovie,movieSupport}=await import('/meta-studio-v5-render.js');
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
    const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,320,180);
    const image=URL.createObjectURL(await new Promise(resolve=>canvas.toBlob(resolve,'image/png')));
    const clips={video:[{id:'red',sourceId:'red',url:image,start:0,duration:1.2,offset:0},{id:'blue',sourceId:'blue',url:new URL('blue.webm',location.href).href,start:1.2,duration:1.2,offset:0}],audio:[{id:'tone',url:new URL('tone.wav',location.href).href,start:0,duration:2.4,offset:0,kind:'music'}],overlay:[{id:'caption',start:.2,duration:.6,text:'QA CAPTION'}]};
    const options={clips,results:[{id:'red',type:'image'},{id:'blue',type:'video'}],volumes:{music:.8},width:1280,height:720,fps:24};
    const progress=[];
    try{
      const controller=new AbortController();
      let aborted=false;
      try{await makeTimelineMovie({...options,signal:controller.signal,onProgress:(p)=>{if(p>20)controller.abort()}})}catch(e){aborted=e.name==='AbortError'}
      if(!aborted)throw Error('Expected render cancellation');
      const pre=new AbortController();pre.abort();
      let preAbort=false;try{await makeTimelineMovie({...options,signal:pre.signal})}catch(e){preAbort=e.name==='AbortError'}
      if(!preAbort)throw Error('Expected pre-start cancellation');
      const render=await makeTimelineMovie({...options,onProgress:p=>progress.push(p)});
      const bytes=new Uint8Array(await render.blob.arrayBuffer());
      let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      return {encoded:btoa(binary),mime:render.mime,extension:render.extension,duration:render.duration,progress,aborted,preAbort,support:movieSupport()};
    }finally{URL.revokeObjectURL(image);}
  }+')()');
  assert.ok(result.aborted&&result.preAbort);assert.equal(result.progress.at(-1),100);
  assert.ok(['mp4','webm'].includes(result.extension));assert.equal(result.duration,2.4);
  const bytes=Buffer.from(result.encoded,'base64');assert.ok(bytes.length>10000);
  const output=path.join(tmp,'render.'+result.extension);await fs.writeFile(output,bytes);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
  const video=probe.streams.find(s=>s.codec_type==='video'),audio=probe.streams.find(s=>s.codec_type==='audio');
  assert.ok(video&&audio,'Both real video and audio streams required');
  if(result.extension==='mp4'){assert.equal(video.codec_name,'h264','MP4 video must be H.264');assert.equal(audio.codec_name,'aac','MP4 audio must be AAC');}
  else {assert.ok(['vp8','vp9'].includes(video.codec_name));assert.equal(audio.codec_name,'opus');}
  assert.equal(video.width,1280);assert.equal(video.height,720);
  // Decode actual output, not just container headers.
  execFileSync('ffmpeg',['-v','error','-xerror','-i',output,'-f','null','-']);
  function frame(t){return execFileSync('ffmpeg',['-v','error','-ss',String(t),'-i',output,'-frames:v','1','-vf','scale=320:180','-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1024*1024});}
  function pixel(f,x,y){const i=(y*320+x)*3;return [...f.subarray(i,i+3)];}
  const first=frame(.4),last=frame(1.9);assert.equal(first.length,320*180*3);assert.equal(last.length,first.length);
  const red=pixel(first,160,50),blue=pixel(last,160,50);
  assert.ok(red[0]>180&&red[1]<80&&red[2]<80,'Red image visible in actual encoded video');
  assert.ok(blue[2]>140&&blue[0]<80&&blue[1]<80,'Blue video visible in actual encoded video');
  let white=0;for(let y=135;y<165;y++)for(let x=80;x<240;x++){const p=pixel(first,x,y);if(p.every(v=>v>190))white++;}
  assert.ok(white>10,'Subtitle rendered into encoded image');
  const pcm=execFileSync('ffmpeg',['-v','error','-i',output,'-map','0:a:0','-ac','1','-ar','48000','-f','s16le','-'],{maxBuffer:1024*1024});
  assert.ok(pcm.length>48000*2*1.8,'Audio duration must exceed 1.8 seconds');
  let sum=0,peak=0;for(let i=0;i+1<pcm.length;i+=2){const v=pcm.readInt16LE(i);sum+=v*v;peak=Math.max(peak,Math.abs(v));}
  const rms=Math.sqrt(sum/(pcm.length/2));assert.ok(rms>100&&peak<32767,'Actual non-silent, unclipped test tone');
  assert.deepEqual(browserErrors,[]);assert.deepEqual(httpPosts,[]);
  console.log('CINEMA CHROMIUM PASS: '+result.extension+' '+video.codec_name+' '+video.width+'x'+video.height+' '+audio.codec_name+' '+bytes.length+' bytes; decoded red/blue frames, subtitle pixels='+white+', PCM RMS='+rms.toFixed(1)+'; cancellation and restart, no POST.');
 }catch(error){
  throw Error(error.message+(diagnostics?'\nBrowser diagnostics: '+diagnostics.slice(-1000):''));
 }finally{
  try{ws?.close();}catch{}
  try{chrome?.kill('SIGKILL');}catch{}
  try{server?.kill('SIGTERM');}catch{}
  await sleep(300);
  await fs.rm(tmp,{recursive:true,force:true,maxRetries:6,retryDelay:200}).catch(()=>{});
  if(fixture)await fs.rm(fixture,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
