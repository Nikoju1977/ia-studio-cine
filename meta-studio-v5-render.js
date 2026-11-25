/* Studio Niko — real-time film renderer. No simulated output.
   Captures a composited canvas and mixes timeline audio with Web Audio.
   This is a browser preview-quality export, NOT deterministic frame-accurate mastering. */
export const movieDuration = clips => Math.max(0,...['video','audio','overlay'].flatMap(
  kind => (clips[kind]||[]).map(c=>Math.max(0,Number(c.start)||0)+Math.max(0,Number(c.duration)||0))
));
export function validateTimeline(clips,trimToVideo=false){
 if(!clips||typeof clips!=="object")throw Error("Timeline invalide.");
 const ids=new Set();let count=0,end=0,videoEnd=0;
 for(const kind of ["video","audio","overlay"]){
  const rows=clips[kind]??[];if(!Array.isArray(rows))throw Error("Piste invalide.");
  if(kind==="video"&&!rows.length)throw Error("Ajoutez un plan à V1.");
  for(const row of rows){
   if(!row||typeof row.id!=="string"||!row.id||ids.has(row.id))throw Error("Identifiant de clip invalide ou dupliqué.");
   ids.add(row.id);count++;
   const {start,duration,offset=0}=row;
   if(![start,duration,offset].every(Number.isFinite)||start<0||duration<=0||offset<0||start+duration>900||offset+duration>Number.MAX_SAFE_INTEGER)throw Error("Temps de clip invalide.");
   if(kind!=="overlay"&&(typeof row.url!=="string"||!row.url.trim()))throw Error("Source absente.");
   end=Math.max(end,start+duration);if(kind==="video")videoEnd=Math.max(videoEnd,start+duration);
  }
 }
 if(count>200)throw Error("Limite de 200 clips par rendu navigateur.");
 return trimToVideo?videoEnd:end;
}
export function movieSupport(){
  if(typeof MediaRecorder==='undefined'||typeof HTMLCanvasElement==='undefined'||
     !HTMLCanvasElement.prototype.captureStream)return null;
  const formats=[
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4',
    'video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'
  ];
  return formats.find(x=>MediaRecorder.isTypeSupported(x))||null;
}
function until(el,event,signal,timeout=20000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>done(new Error('Décodage média trop lent ou indisponible.')),timeout);
    const ok=()=>done(null),bad=()=>done(new Error('Média non pris en charge ou inaccessible (format/CORS).')),abort=()=>done(new DOMException('Export annulé','AbortError'));
    function done(error){
      clearTimeout(timer);el.removeEventListener(event,ok);el.removeEventListener('error',bad);signal?.removeEventListener('abort',abort);
      error?reject(error):resolve();
    }
    el.addEventListener(event,ok,{once:true});el.addEventListener('error',bad,{once:true});signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  });
}
async function loadSource(c,kind,signal,sourceObjects){
  if(!c.url)throw new Error('Source absente : '+c.name);
  if(kind==='image'){
    const el=new Image();
    if(/^https?:/i.test(c.url))el.crossOrigin='anonymous';
    sourceObjects.push(el);const ready=until(el,'load',signal);el.src=c.url;await ready;
    if(!el.naturalWidth)throw new Error('Image invalide : '+c.name);
    return el;
  }
  const el=document.createElement(kind==='audio'?'audio':'video');
  el.preload='auto';el.playsInline=true;
  if(/^https?:/i.test(c.url))el.crossOrigin='anonymous';
  sourceObjects.push(el);const ready=until(el,kind==='audio'?'loadedmetadata':'loadeddata',signal);
  el.src=c.url;el.load();await ready;
  if(kind==='video'&&el.readyState<2)throw new Error('Vidéo non décodable : '+c.name);
  const required=(Number(c.offset)||0)+(Number(c.duration)||0);
  if(Number.isFinite(el.duration)&&required>el.duration+.3)
    throw new Error('Clip plus long que sa source : '+c.name);
  return el;
}
function contain(ctx,source,width,height){
  const sw=source.videoWidth||source.naturalWidth,sh=source.videoHeight||source.naturalHeight;
  if(!(sw>0&&sh>0))return;
  const s=Math.min(width/sw,height/sh),w=sw*s,h=sh*s;
  ctx.drawImage(source,(width-w)/2,(height-h)/2,w,h);
}
function subtitle(ctx,text,w,h){
  const lines=String(text||'').split(/\r?\n/).slice(0,4);
  const size=Math.max(22,Math.round(w*.028));
  ctx.font='700 '+size+'px system-ui, sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.lineWidth=Math.max(3,Math.round(size*.2));ctx.strokeStyle='rgba(0,0,0,.85)';
  ctx.fillStyle='#ffffff';
  lines.forEach((line,i)=>{
    let value=line;
    while(ctx.measureText(value).width>w*.88&&value.length>4)value=value.slice(0,-2);
    const y=h*.83+(i-(lines.length-1)/2)*size*1.18;
    ctx.strokeText(value,w/2,y);ctx.fillText(value,w/2,y);
  });
}
function active(clips,t){return [...clips].reverse().find(c=>t>=c.start&&t<c.start+c.duration);}
function report(callback,percent,stage){if(typeof callback==='function')callback(Math.round(percent),stage);}

export async function makeTimelineMovie({clips,results,volumes={},width=1280,height=720,
  fps=24,signal,onProgress,trimToVideo=false}){
  const mime=movieSupport();
  if(!mime)throw new Error('Ce navigateur ne sait pas enregistrer la timeline (MediaRecorder/captureStream).');
  if(![1280,1920].includes(width)||!Number.isFinite(height)||height!==Math.round(width*9/16))
    throw new Error('Résolution de rendu invalide.');
  const duration=validateTimeline(clips,trimToVideo);if(!Number.isInteger(fps)||fps<1||fps>60)throw new Error('Cadence invalide.');if(document.hidden)throw new Error('Gardez cet onglet visible pendant le rendu.');
  if(!clips.video?.length)throw new Error('Ajoutez au moins un plan vidéo ou une image à V1.');
  if(!(duration>0&&duration<=900))throw new Error('Durée de rendu limitée à 15 min par export.');
  if(signal?.aborted)throw new DOMException('Export annulé','AbortError');
  const resultById=new Map((results||[]).map(r=>[r.id,r]));
  const resources=new Map(), audioNodes=[], sourceObjects=[], mediaStreamTracks=[];
  let context=null,stream=null,recorder=null,animation=0,abortHandler=null,visibilityHandler=null,watchdog=0,failed=null;
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)throw new Error('Web Audio nécessaire pour le mixage et le rendu.');
    const all=[...(clips.video||[]).map(c=>({c,kind:'video'})),...(clips.audio||[]).map(c=>({c,kind:'audio'}))];
    for(const [i,item] of all.entries()){
      if(signal?.aborted)throw new DOMException('Export annulé','AbortError');
      const source=resultById.get(item.c.sourceId);
      const kind=item.kind==='audio'?'audio':(source?.type==='image'?'image':source?.type==='video'?'video':
        /\.(mp4|webm|mov)(\?|$)/i.test(item.c.url)?'video':'image');
      const el=await loadSource(item.c,kind,signal,sourceObjects);
      resources.set(item.c.id,{element:el,kind,clip:item.c});
      report(onProgress,Math.min(12,12*(i+1)/Math.max(1,all.length)),'Chargement des médias');
    }
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('Canvas 2D indisponible.');
    // Fail BEFORE recording if one source violates the browser's origin rules.
    const probe=document.createElement('canvas');probe.width=1;probe.height=1;
    const probeCtx=probe.getContext('2d',{willReadFrequently:true});
    for(const {kind,element} of resources.values())if(kind!=='audio'){
      probeCtx.clearRect(0,0,1,1);
      probeCtx.drawImage(element,0,0,1,1);
      try{probeCtx.getImageData(0,0,1,1);}
      catch{throw new Error('Source distante non exportable (CORS). Importez le fichier localement.');}
    }
    context=new Ctx();const destination=context.createMediaStreamDestination();mediaStreamTracks.push(...destination.stream.getTracks());
    for(const {kind,element,clip} of resources.values())if(kind!=='image'){
      const gain=context.createGain();
      const vol=Number(volumes[clip.kind]??.5);gain.gain.value=kind==='video'?1:Number.isFinite(vol)?Math.max(0,Math.min(1,vol)):.5;
      const input=context.createMediaElementSource(element);
      input.connect(gain);gain.connect(destination);
      audioNodes.push({input,gain,kind,clip});
      element.muted=false; // audio plays only into the recording destination, not the speakers
    }
    await context.resume();if(signal?.aborted)throw new DOMException('Export annulé','AbortError');if(context.state!=='running')throw new Error('Le contexte audio n’a pas démarré.');
    const canvasStream=canvas.captureStream(fps);
    stream=new MediaStream([...canvasStream.getVideoTracks(),...destination.stream.getAudioTracks()]);
    mediaStreamTracks.push(...canvasStream.getTracks());
    const bitrate=width===1920?12000000:6000000;
    const chunks=[];let bytes=0;const budget=192*1024*1024;
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate});
    const finished=new Promise((resolve,reject)=>{
      recorder.ondataavailable=e=>{if(e.data?.size){bytes+=e.data.size;if(bytes>budget){stopWith(new Error('Budget mémoire vidéo de 192 Mio dépassé. Réduisez la durée ou la résolution.'));return;}chunks.push(e.data);}};
      recorder.onerror=e=>reject(e.error||new Error('Erreur du moteur d’encodage.'));
      recorder.onstop=()=>resolve();
    });
    function stopWith(error){if(error&&!failed)failed=error;cancelAnimationFrame(animation);if(recorder?.state&&recorder.state!=='inactive')recorder.stop();}
    abortHandler=()=>stopWith(new DOMException('Export annulé','AbortError'));
    signal?.addEventListener('abort',abortHandler,{once:true});visibilityHandler=()=>{if(document.hidden)stopWith(new Error('Rendu interrompu : onglet masqué.'));};document.addEventListener('visibilitychange',visibilityHandler);if(signal?.aborted)throw new DOMException('Export annulé','AbortError');
    const order=[...(clips.video||[])].sort((a,b)=>a.start-b.start);
    const transitionTime=.24;
    const draw=t=>{
      ctx.globalAlpha=1;ctx.filter='none';
      ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
      const v=active(clips.video||[],t);
      if(v){
        const item=resources.get(v.id);
        if(!item)throw new Error('Plan introuvable : '+v.name);
        const ix=order.findIndex(c=>c.id===v.id);
        const previous=ix>0?order[ix-1]:null;
        const touches=previous&&Math.abs(previous.start+previous.duration-v.start)<.12;
        const progress=(t-v.start)/transitionTime;
        if(touches&&progress<1){
          const old=resources.get(previous.id);
          if(old && (old.kind==='image'||old.element.readyState>=2)){
            contain(ctx,old.element,width,height);
            ctx.globalAlpha=Math.max(0,Math.min(1,progress*progress*(3-2*progress)));
          }
        }
        if(item.kind==='image'||item.element.readyState>=2)
          contain(ctx,item.element,width,height);
        ctx.globalAlpha=1;
      }
      const caption=active(clips.overlay||[],t);
      if(caption?.text)subtitle(ctx,caption.text,width,height);
    };
    function syncElement(el,clip,t,shouldPlay){
      if(!shouldPlay){if(!el.paused)el.pause();return;}
      const target=Math.max(0,(Number(clip.offset)||0)+t-clip.start);
      if(Math.abs((el.currentTime||0)-target)>.32)try{el.currentTime=target;}catch{}
      if(el.paused)el.play().catch(e=>stopWith(new Error('Lecture média refusée : '+e.message)));
    }
    draw(0);recorder.start(1000);
    const started=performance.now();let lastTick=started;watchdog=setInterval(()=>{if(performance.now()-lastTick>2500||context.state!=='running')stopWith(new Error('Rendu interrompu : horloge ou audio suspendu.'));},500);
    function tick(){
      if(failed||recorder.state!=='recording')return;
      const now=performance.now();if(now-lastTick>2500){stopWith(new Error('Rendu interrompu : images manquantes après suspension.'));return;}lastTick=now;const t=Math.min(duration,(now-started)/1000);
      try{
        const visible=active(clips.video||[],t);
        for(const {kind,element,clip} of resources.values()){
          if(kind==='image')continue;
          const selected=kind==='video'?visible?.id===clip.id:t>=clip.start&&t<clip.start+clip.duration;
          syncElement(element,clip,t,selected);
        }
        for(const node of audioNodes){
          if(node.kind!=='video')continue;
          const started=t-node.clip.start,remaining=node.clip.start+node.clip.duration-t;
          const fade=Math.max(0,Math.min(1,started/.14,remaining/.14));
          node.gain.gain.setTargetAtTime(fade,context.currentTime,.015);
        }
        draw(t);
        report(onProgress,12+88*t/duration,'Encodage temps réel');
        if(t>=duration){stopWith(null);return;}
        animation=requestAnimationFrame(tick);
      }catch(e){stopWith(e);}
    }
    animation=requestAnimationFrame(tick);
    await finished;
    if(failed)throw failed;
    if(!chunks.length)throw new Error('Le navigateur n’a produit aucune donnée vidéo.');
    const actualMime=recorder.mimeType||mime;const blob=new Blob(chunks,{type:actualMime});
    if(blob.size<512)throw new Error('Fichier rendu vide.');
    report(onProgress,100,'Terminé');
    return {blob,mime:actualMime,extension:actualMime.includes('mp4')?'mp4':'webm',duration};
  }finally{
    cancelAnimationFrame(animation);clearInterval(watchdog);if(visibilityHandler)document.removeEventListener('visibilitychange',visibilityHandler);
    if(abortHandler)signal?.removeEventListener('abort',abortHandler);
    for(const el of sourceObjects){try{el.pause?.();el.removeAttribute('src');el.load?.();}catch{}}
    for(const node of audioNodes){try{node.input.disconnect();node.gain.disconnect();}catch{}}
    if(recorder?.state==='recording')try{recorder.stop();}catch{}
    mediaStreamTracks.forEach(t=>{try{t.stop();}catch{}});
    if(context)try{await context.close();}catch{}
  }
}
