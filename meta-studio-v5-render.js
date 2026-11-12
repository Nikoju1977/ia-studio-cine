/* Studio Niko — real-time film renderer. No simulated output.
   Captures a composited canvas and mixes timeline audio with Web Audio.
   This is a browser preview-quality export, NOT deterministic frame-accurate mastering. */
export const movieDuration = clips => Math.max(0,...['video','audio','overlay'].flatMap(
  kind => (clips[kind]||[]).map(c=>Math.max(0,Number(c.start)||0)+Math.max(0,Number(c.duration)||0))
));
export function movieSupport(){
  if(typeof MediaRecorder==='undefined'||typeof HTMLCanvasElement==='undefined'||
     !HTMLCanvasElement.prototype.captureStream)return null;
  const formats=[
    'video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus',
    'video/webm','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4'
  ];
  return formats.find(x=>MediaRecorder.isTypeSupported(x))||null;
}
function until(el,event,timeout=20000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>done(new Error('Décodage média trop lent ou indisponible.')),timeout);
    const ok=()=>done(null),bad=()=>done(new Error('Média non pris en charge ou inaccessible (format/CORS).'));
    function done(error){
      clearTimeout(timer);el.removeEventListener(event,ok);el.removeEventListener('error',bad);
      error?reject(error):resolve();
    }
    el.addEventListener(event,ok,{once:true});el.addEventListener('error',bad,{once:true});
  });
}
async function loadSource(c,kind){
  if(!c.url)throw new Error('Source absente : '+c.name);
  if(kind==='image'){
    const el=new Image();
    if(/^https?:/i.test(c.url))el.crossOrigin='anonymous';
    const ready=until(el,'load');el.src=c.url;await ready;
    if(!el.naturalWidth)throw new Error('Image invalide : '+c.name);
    return el;
  }
  const el=document.createElement(kind==='audio'?'audio':'video');
  el.preload='auto';el.playsInline=true;
  if(/^https?:/i.test(c.url))el.crossOrigin='anonymous';
  const ready=until(el,kind==='audio'?'loadedmetadata':'loadeddata');
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
  fps=24,signal,onProgress}){
  const mime=movieSupport();
  if(!mime)throw new Error('Ce navigateur ne sait pas enregistrer la timeline (MediaRecorder/captureStream).');
  if(![1280,1920].includes(width)||!Number.isFinite(height)||height!==Math.round(width*9/16))
    throw new Error('Résolution de rendu invalide.');
  const duration=movieDuration(clips);
  if(!clips.video?.length)throw new Error('Ajoutez au moins un plan vidéo ou une image à V1.');
  if(!(duration>0&&duration<=900))throw new Error('Durée de rendu limitée à 15 min par export.');
  if(signal?.aborted)throw new DOMException('Export annulé','AbortError');
  const resultById=new Map((results||[]).map(r=>[r.id,r]));
  const resources=new Map(), audioNodes=[], sourceObjects=[], mediaStreamTracks=[];
  let context=null,stream=null,recorder=null,animation=0,abortHandler=null,failed=null;
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)throw new Error('Web Audio nécessaire pour le mixage et le rendu.');
    const all=[...(clips.video||[]).map(c=>({c,kind:'video'})),...(clips.audio||[]).map(c=>({c,kind:'audio'}))];
    for(const [i,item] of all.entries()){
      if(signal?.aborted)throw new DOMException('Export annulé','AbortError');
      const source=resultById.get(item.c.sourceId);
      const kind=item.kind==='audio'?'audio':(source?.type==='image'?'image':source?.type==='video'?'video':
        /\.(mp4|webm|mov)(\?|$)/i.test(item.c.url)?'video':'image');
      const el=await loadSource(item.c,kind);
      resources.set(item.c.id,{element:el,kind,clip:item.c});
      if(kind!=='image')sourceObjects.push(el);
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
    context=new Ctx();const destination=context.createMediaStreamDestination();
    for(const {kind,element,clip} of resources.values())if(kind!=='image'){
      const gain=context.createGain();
      gain.gain.value=kind==='video'?1:Math.max(0,Math.min(1,Number(volumes[clip.kind]??.5)));
      const input=context.createMediaElementSource(element);
      input.connect(gain);gain.connect(destination);
      audioNodes.push({input,gain});
      element.muted=false; // audio plays only into the recording destination, not the speakers
    }
    await context.resume();
    const canvasStream=canvas.captureStream(fps);
    stream=new MediaStream([...canvasStream.getVideoTracks(),...destination.stream.getAudioTracks()]);
    mediaStreamTracks.push(...canvasStream.getTracks(),...destination.stream.getTracks());
    const bitrate=width===1920?12000000:6000000;
    const chunks=[];
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate});
    const finished=new Promise((resolve,reject)=>{
      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
      recorder.onerror=e=>reject(e.error||new Error('Erreur du moteur d’encodage.'));
      recorder.onstop=()=>resolve();
    });
    function stopWith(error){failed=error;cancelAnimationFrame(animation);
      if(recorder?.state==='recording')recorder.stop();}
    abortHandler=()=>stopWith(new DOMException('Export annulé','AbortError'));
    signal?.addEventListener('abort',abortHandler,{once:true});
    const draw=t=>{
      ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
      const v=active(clips.video||[],t);
      if(v){
        const item=resources.get(v.id);
        if(!item)throw new Error('Plan introuvable : '+v.name);
        if(item.kind==='image')contain(ctx,item.element,width,height);
        else if(item.element.readyState>=2)contain(ctx,item.element,width,height);
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
    const started=performance.now();
    function tick(){
      if(failed||recorder.state!=='recording')return;
      const t=Math.min(duration,(performance.now()-started)/1000);
      try{
        const visible=active(clips.video||[],t);
        for(const {kind,element,clip} of resources.values()){
          if(kind==='image')continue;
          const selected=kind==='video'?visible?.id===clip.id:t>=clip.start&&t<clip.start+clip.duration;
          syncElement(element,clip,t,selected);
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
    const blob=new Blob(chunks,{type:mime});
    if(blob.size<512)throw new Error('Fichier rendu vide.');
    report(onProgress,100,'Terminé');
    return {blob,mime,extension:mime.includes('mp4')?'mp4':'webm',duration};
  }finally{
    cancelAnimationFrame(animation);
    if(abortHandler)signal?.removeEventListener('abort',abortHandler);
    for(const el of sourceObjects){try{el.pause();el.removeAttribute('src');el.load();}catch{}}
    for(const node of audioNodes){try{node.input.disconnect();node.gain.disconnect();}catch{}}
    if(recorder?.state==='recording')try{recorder.stop();}catch{}
    mediaStreamTracks.forEach(t=>{try{t.stop();}catch{}});
    if(context)try{await context.close();}catch{}
  }
}
