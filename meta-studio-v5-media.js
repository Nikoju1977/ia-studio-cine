/* META-STUDIO PRO V5 — timeline, looks, local tools, audio & interchange */
import { $, uid, state, addResult, log, notify, status, generate } from './meta-studio-v5-core.js';
const FPS=24;
const $all=(q)=>Array.from(document.querySelectorAll(q));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const tc=seconds=>{
  let f=Math.max(0,Math.round(seconds*FPS));
  const hh=Math.floor(f/(3600*FPS));f%=3600*FPS;
  const mm=Math.floor(f/(60*FPS));f%=60*FPS;
  const ss=Math.floor(f/FPS);f%=FPS;
  return [hh,mm,ss,f].map(n=>String(n).padStart(2,'0')).join(':');
};
const filename=s=>String(s||'media').replace(/[^a-z0-9._-]+/gi,'_').slice(0,55);
const escXML=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const TIME=()=>performance.now();
const project={clips:{video:[],audio:[],overlay:[]},playhead:0,selected:null,playing:false,duration:60};
let lastFrame=0,raf=0,visualId=null,mediaAudio=new Map();
let processedCanvas=null;
const validTypes=['video','audio','overlay'];
function allClips(){return validTypes.flatMap(k=>project.clips[k]);}
function refreshDuration(){
  const end=allClips().reduce((v,c)=>Math.max(v,c.start+c.duration),0);
  project.duration=Math.max(60,Math.ceil(end/10)*10);
  $('project-duration').textContent=tc(end);
}
function pxToSeconds(clientX,el){
  const r=el.getBoundingClientRect();
  return clamp((clientX-r.left)/r.width*project.duration,0,project.duration);
}
function seek(sec){
  project.playhead=clamp(sec,0,project.duration);
  syncPreview(true);updateHeads();
}
function updateHeads(){
  const p=100*project.playhead/project.duration+'%';
  $all('.playhead').forEach(n=>n.style.left=p);
  $('tl-timecode').textContent=tc(project.playhead);
  $('timeline-scrub').max=String(project.duration);
  $('timeline-scrub').value=String(project.playhead);
  $('tl-play').textContent=project.playing?'⏸ Pause':'▶ Lecture';
}
function renderTimeline(){
  refreshDuration();
  const ruler=$('tl-ruler');ruler.replaceChildren();
  for(let t=0;t<=project.duration;t+=5){
    const line=document.createElement('span');
    line.textContent=t+'s';line.style.left=(100*t/project.duration)+'%';
    ruler.append(line);
  }
  const h=document.createElement('div');h.className='playhead';ruler.append(h);
  validTypes.forEach(track=>{
    const lane=$('tl-track-'+track);lane.replaceChildren();
    const title=document.createElement('span');title.className='lane-name';
    title.textContent=track.toUpperCase();lane.append(title);
    const ph=document.createElement('div');ph.className='playhead';lane.append(ph);
    project.clips[track].forEach(clip=>{
      const button=document.createElement('button');
      button.className='clip '+track+(project.selected===clip.id?' selected':'');
      button.textContent=clip.name;button.title=clip.name+' · '+tc(clip.start)+' / '+tc(clip.duration);
      button.style.left=clip.start/project.duration*100+'%';
      button.style.width=clip.duration/project.duration*100+'%';
      button.addEventListener('click',e=>{
        e.stopPropagation();project.selected=clip.id;renderTimeline();
        $('selection-info').textContent=clip.name+' · début '+tc(clip.start)+' · durée '+tc(clip.duration);
      });
      let startX=0,original=0,moved=false;
      button.addEventListener('pointerdown',e=>{
        if(e.button!==0)return;startX=e.clientX;original=clip.start;moved=false;
        button.setPointerCapture(e.pointerId);
      });
      button.addEventListener('pointermove',e=>{
        if(!button.hasPointerCapture(e.pointerId))return;
        const w=lane.getBoundingClientRect().width;
        const delta=(e.clientX-startX)/w*project.duration;
        if(Math.abs(delta)>.03)moved=true;
        if(moved){
          clip.start=clamp(Math.round((original+delta)*FPS)/FPS,0,Math.max(0,project.duration-clip.duration));
          button.style.left=clip.start/project.duration*100+'%';
        }
      });
      button.addEventListener('pointerup',e=>{
        if(button.hasPointerCapture(e.pointerId))button.releasePointerCapture(e.pointerId);
        if(moved){renderTimeline();syncPreview(true);}
      });
      lane.append(button);
    });
    lane.onclick=e=>{if(e.target===lane)seek(pxToSeconds(e.clientX,lane));};
  });
  updateHeads();
}
function addClip(track,clip){
  if(!validTypes.includes(track))throw new Error('Piste invalide');
  const element={id:uid(),name:clip.name||track,sourceId:clip.sourceId||null,url:clip.url||'',start:clip.start??0,duration:clip.duration||5,offset:clip.offset||0,text:clip.text||'',kind:clip.kind||'ambience'};
  project.clips[track].push(element);project.selected=element.id;renderTimeline();
  log('Clip ajouté : '+element.name,'success');return element;
}
function appendMedia(item){
  const clips=project.clips.video;
  const end=clips.reduce((m,c)=>Math.max(m,c.start+c.duration),0);
  addClip('video',{name:item.prompt.slice(0,35),sourceId:item.id,url:item.url,start:end,duration:item.duration||5});
}
function cut(){
  const t=project.playhead;let n=0;
  validTypes.forEach(k=>{
    for(const clip of [...project.clips[k]]){
      if(t<=clip.start+.001 || t>=clip.start+clip.duration-.001)continue;
      const before=t-clip.start;
      project.clips[k].push({...clip,id:uid(),start:t,duration:clip.duration-before,offset:clip.offset+before});
      clip.duration=before;n++;
    }
  });
  renderTimeline();notify(n?n+' clip(s) coupé(s).':'Aucun clip à couper.',n?'success':'');
}
function removeClip(){
  if(!project.selected)return notify('Sélectionne un clip sur la timeline.','error');
  for(const k of validTypes)project.clips[k]=project.clips[k].filter(c=>c.id!==project.selected);
  project.selected=null;renderTimeline();syncPreview(true);notify('Clip supprimé.','success');
}
function sourceVideoTime(c){return Math.max(0,c.offset+project.playhead-c.start);}
function activeClip(kind){
  return [...project.clips[kind]].reverse().find(c=>project.playhead>=c.start && project.playhead<c.start+c.duration);
}
function stopAudioClips(){
  mediaAudio.forEach(a=>{a.pause();});
}
function syncAudio(){
  const volumes={dialogue:Number($('vol-dialogue').value)/100,music:Number($('vol-music').value)/100,ambience:Number($('vol-ambience').value)/100};
  project.clips.audio.forEach(clip=>{
    if(!clip.url)return;
    const active=project.playhead>=clip.start && project.playhead<clip.start+clip.duration;
    let audio=mediaAudio.get(clip.id);
    if(!audio && active){
      audio=new Audio();audio.preload='auto';audio.src=clip.url;mediaAudio.set(clip.id,audio);
    }
    if(!audio)return;
    if(!active||!project.playing){if(!audio.paused)audio.pause();return;}
    audio.volume=clamp(volumes[clip.kind]??.4,0,1);
    const target=Math.max(0,sourceVideoTime(clip));
    if(Math.abs((audio.currentTime||0)-target)>.3 && Number.isFinite(target))try{audio.currentTime=target;}catch{}
    if(audio.paused)audio.play().catch(()=>{});
  });
}
function syncPreview(force=false){
  const c=activeClip('video');
  const video=$('tl-video'),photo=$('tl-image'),empty=$('tl-placeholder');
  const overlay=activeClip('overlay');
  const subtitle=$('tl-overlay');
  subtitle.textContent=overlay?.text||'';
  subtitle.classList.toggle('hidden',!overlay);
  if(!c||!c.url){
    video.pause();video.classList.add('hidden');photo.classList.add('hidden');
    empty.classList.remove('hidden');visualId=null;syncAudio();return;
  }
  const result=state.results.find(r=>r.id===c.sourceId);
  const isVideo=result?.type==='video'||/\.(mp4|mov|webm)(\?|$)/i.test(c.url);
  if(isVideo){
    photo.classList.add('hidden');video.classList.remove('hidden');empty.classList.add('hidden');
    if(visualId!==c.id||force){
      if(video.src!==c.url)video.src=c.url;
      visualId=c.id;
    }
    const target=sourceVideoTime(c);
    if(video.readyState>=1 && Math.abs((video.currentTime||0)-target)>.28)try{video.currentTime=target;}catch{}
    if(project.playing){if(video.paused)video.play().catch(()=>{});}
    else video.pause();
  }else{
    video.pause();video.classList.add('hidden');photo.classList.remove('hidden');empty.classList.add('hidden');
    if(visualId!==c.id||force){photo.src=c.url;visualId=c.id;}
  }
  syncAudio();
}
function frame(now){
  if(!project.playing)return;
  const diff=(now-lastFrame)/1000;
  lastFrame=now;
  if(diff>0 && diff<1)project.playhead+=diff;
  if(project.playhead>=project.duration){project.playhead=project.duration;pause();}
  updateHeads();syncPreview();
  if(project.playing)raf=requestAnimationFrame(frame);
}
function play(){
  if(project.playing){pause();return;}
  if(project.playhead>=project.duration)project.playhead=0;
  project.playing=true;lastFrame=TIME();syncPreview(true);
  raf=requestAnimationFrame(frame);updateHeads();
}
function pause(){
  project.playing=false;cancelAnimationFrame(raf);
  $('tl-video').pause();stopAudioClips();updateHeads();
}
const LOOKS={
  clean:{name:'Neutre',detail:'Sans look',css:'none'},
  warm:{name:'Golden hour',detail:'Chaud',css:'sepia(.16) saturate(1.2) contrast(1.05)'},
  cool:{name:'Blue steel',detail:'Froid',css:'hue-rotate(8deg) saturate(.8) contrast(1.13)'},
  pastel:{name:'Pastel',detail:'Doux',css:'saturate(.8) contrast(.88) brightness(1.08)'},
  noir:{name:'Noir',detail:'Monochrome',css:'grayscale(1) contrast(1.27)'},
  film:{name:'Film doux',detail:'Dense',css:'sepia(.08) saturate(.95) contrast(1.13)'}
};
let look='clean';
function renderLooks(){
  const grid=$('looks');grid.replaceChildren();
  for(const [id,item] of Object.entries(LOOKS)){
    const b=document.createElement('button');
    b.type='button';b.setAttribute('aria-pressed',String(id===look));
    b.textContent=item.name;
    const small=document.createElement('small');small.textContent=item.detail;b.append(small);
    b.addEventListener('click',()=>{look=id;renderLooks();});
    grid.append(b);
  }
}
async function bitmap(file){
  if(!file)throw new Error('Charge une image au préalable.');
  if(!file.type.startsWith('image/'))throw new Error('Format non reconnu comme image.');
  if(typeof createImageBitmap==='function')return createImageBitmap(file);
  return new Promise((resolve,reject)=>{
    const src=URL.createObjectURL(file),image=new Image();
    image.onload=()=>{URL.revokeObjectURL(src);resolve(image);};
    image.onerror=()=>{URL.revokeObjectURL(src);reject(new Error('Décodage image impossible.'));};
    image.src=src;
  });
}
function createCanvas(img,mult=1){
  const w=Math.round(img.width*mult),h=Math.round(img.height*mult);
  if(w*h>17000000)throw new Error('Image trop grande pour ce traitement (17 MP max).');
  const c=document.createElement('canvas');c.width=w;c.height=h;
  return c;
}
function showProcessed(c,label){
  processedCanvas=c;
  const container=$('image-result');container.replaceChildren(c);
  $('image-result-empty')?.classList.add('hidden');
  $('processed-info').textContent=label+' · '+c.width+' × '+c.height+' pixels';
  $('image-download').disabled=false;$('image-add').disabled=false;
}
function gradePixels(c){
  const lift=Number($('grade-lift').value)/100;
  const gamma=Math.pow(2,Number($('grade-gamma').value)/100);
  const gain=Math.pow(2,Number($('grade-gain').value)/100);
  const sat=Number($('grade-sat').value)/100;
  const ctx=c.getContext('2d',{willReadFrequently:true});
  const img=ctx.getImageData(0,0,c.width,c.height),d=img.data;
  for(let i=0;i<d.length;i+=4){
    const rgb=[d[i],d[i+1],d[i+2]].map(v=>{
      let x=v/255;
      x=clamp(x+lift*.25,0,1);
      x=Math.pow(x,1/gamma)*gain;
      return clamp(x,0,1);
    });
    const y=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
    for(let j=0;j<3;j++)d[i+j]=Math.round(255*clamp(y+(rgb[j]-y)*sat,0,1));
  }
  ctx.putImageData(img,0,0);
}
async function applyLook(){
  const img=await bitmap($('image-file')?.files[0]||$('neural-file')?.files[0]);
  try{
    const c=createCanvas(img);const ctx=c.getContext('2d');
    ctx.filter=LOOKS[look].css;ctx.drawImage(img,0,0);ctx.filter='none';
    gradePixels(c);showProcessed(c,'Look '+LOOKS[look].name);
    notify('Traitement colorimétrique appliqué. Pas de pipeline ACES.','success');
  }finally{img.close?.();}
}
async function localEffect(effect){
  const img=await bitmap($('image-file')?.files[0]||$('neural-file')?.files[0]);
  try{
    const factor=effect==='upscale'?2:1;
    const c=createCanvas(img,factor);const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,c.width,c.height);
    if(effect!=='upscale'){
      const data=ctx.getImageData(0,0,c.width,c.height),d=data.data;
      const threshold=Number($('mask-threshold').value)/100;
      for(let i=0;i<d.length;i+=4){
        const y=(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;
        if(effect==='depth'){
          const v=Math.round(255*(1-y));d[i]=v;d[i+1]=v;d[i+2]=v;
        }else{
          const v=y>=threshold?255:0;d[i]=v;d[i+1]=v;d[i+2]=v;
        }
      }
      ctx.putImageData(data,0,0);
    }
    const description={upscale:'Redimensionnement bicubique x2',depth:'Carte de luminance (pseudo-profondeur)',mask:'Masque de luminance (non IA)'}[effect];
    showProcessed(c,description);notify(description+' terminé.','success');
  }finally{img.close?.();}
}
function canvasBlob(canvas,type='image/png'){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Encodage image impossible.')),type));
}
async function saveProcessed(add){
  if(!processedCanvas)return;
  const blob=await canvasBlob(processedCanvas);
  const url=URL.createObjectURL(blob);
  if(add){addResult({type:'image',url,prompt:$('processed-info').textContent,origin:'Traitement local',mime:'image/png'});notify('Image ajoutée à la médiathèque.','success');}
  else download(blob,'meta-studio-v5-image.png');
}
async function analyzeAudio(){
  const file=$('audio-file').files[0];
  if(!file)throw new Error('Sélectionne un fichier audio.');
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)throw new Error('Web Audio non disponible.');
  const audioCtx=new Ctx();
  try{
    const buf=await audioCtx.decodeAudioData(await file.arrayBuffer());
    let power=0,samples=0;
    for(let ch=0;ch<buf.numberOfChannels;ch++){
      const arr=buf.getChannelData(ch);
      for(let i=0;i<arr.length;i++){power+=arr[i]*arr[i];samples++;}
    }
    const rms=Math.sqrt(power/Math.max(1,samples));
    const db=rms>0?20*Math.log10(rms):-Infinity;
    const display=Number.isFinite(db)?db.toFixed(1):'-∞';
    $('audio-db').textContent=display+' dBFS RMS';
    $('audio-meter-fill').style.width=clamp((db+60)/60*100,0,100)+'%';
    $('audio-info').textContent=buf.numberOfChannels+' canal(aux) · '+buf.sampleRate+' Hz · '+buf.duration.toFixed(1)+' s. Mesure RMS, pas LUFS / EBU R128.';
    notify('Analyse de niveau terminée.','success');
  }finally{audioCtx.close().catch(()=>{});}
}
function speak(text){
  if(!('speechSynthesis' in window))throw new Error('Synthèse vocale indisponible.');
  if(!text.trim())throw new Error('Saisissez un texte.');
  speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang=$('tts-lang').value;
  utterance.rate=Number($('tts-rate').value);
  speechSynthesis.speak(utterance);
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename(name);document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function downloadText(text,name,type='text/plain'){
  download(new Blob([text],{type:type+';charset=utf-8'}),name);
}
function serializableProject(){
  return {format:'meta-studio-pro',version:5,fps:FPS,createdAt:new Date().toISOString(),results:state.results.map(({id,type,url,prompt,origin,duration,mime,createdAt})=>({id,type,url,prompt,origin,duration,mime,createdAt})),timeline:{clips:project.clips,playhead:project.playhead},warning:'Les URL blob: locales expirent lorsque l’onglet est fermé. Le JSON ne contient pas les médias binaires.'};
}
function orderedVideo(){return [...project.clips.video].sort((a,b)=>a.start-b.start);}
function EDL(){
  const clips=orderedVideo();if(!clips.length)throw new Error('Timeline vidéo vide.');
  let edl='TITLE: META-STUDIO PRO V5\nFCM: NON-DROP FRAME\n\n';
  clips.forEach((c,i)=>{
    const si=tc(c.offset),so=tc(c.offset+c.duration),ri=tc(c.start),ro=tc(c.start+c.duration);
    edl+=String(i+1).padStart(3,'0')+'  AX       V     C        '+si+' '+so+' '+ri+' '+ro+'\n';
    edl+='* FROM CLIP NAME: '+c.name.replace(/\r|\n/g,' ')+'\n';
    if(c.url)edl+='* SOURCE FILE: '+c.url+'\n';
    edl+='\n';
  });return edl;
}
function rational(s){return {OTIO_SCHEMA:'RationalTime.1',value:Math.round(s*FPS),rate:FPS};}
function range(start,duration){return {OTIO_SCHEMA:'TimeRange.1',start_time:rational(start),duration:rational(duration)};}
function otioTrack(kind,clips){
  let cursor=0;const children=[];
  for(const c of [...clips].sort((a,b)=>a.start-b.start)){
    if(c.start>cursor+.001)children.push({OTIO_SCHEMA:'Gap.1',source_range:range(0,c.start-cursor)});
    children.push({OTIO_SCHEMA:'Clip.2',name:c.name,
      source_range:range(c.offset,c.duration),
      media_reference:{OTIO_SCHEMA:'ExternalReference.1',target_url:c.url||''},
      metadata:{meta_studio:{timeline_start:c.start,text:c.text||'',kind:c.kind||''}}
    });
    cursor=Math.max(cursor,c.start+c.duration);
  }
  return {OTIO_SCHEMA:'Track.1',name:kind==='video'?'V1':'A1',kind:kind==='video'?'Video':'Audio',children};
}
function OTIO(){
  return JSON.stringify({OTIO_SCHEMA:'Timeline.1',name:'META-STUDIO PRO V5',global_start_time:rational(0),
    tracks:{OTIO_SCHEMA:'Stack.1',children:[
      otioTrack('video',project.clips.video),otioTrack('audio',project.clips.audio)
    ]}},null,2);
}
function FCPXML(){
  const clips=orderedVideo();if(!clips.length)throw new Error('Timeline vidéo vide.');
  const sources=clips.map((c,i)=>({c,id:'r'+(i+2)}));
  const max=clips.reduce((a,c)=>Math.max(a,c.start+c.duration),0);
  let str='<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10"><resources><format id="r1" name="FFVideoFormat1080p24" frameDuration="1/24s" width="1920" height="1080"/>';
  for(const {c,id} of sources){
    if(c.url?.startsWith('blob:')||c.url?.startsWith('data:'))throw new Error('FCPXML nécessite des URL média persistantes (pas blob:/data:).');
    str+='<asset id="'+id+'" name="'+escXML(c.name)+'" start="0s" duration="'+Math.max(1,Math.round((c.offset+c.duration)*FPS))+'/24s" hasVideo="1" hasAudio="0" format="r1"><media-rep kind="original-media" src="'+escXML(c.url)+'"/></asset>';
  }
  str+='</resources><library><event name="META-STUDIO"><project name="V5"><sequence format="r1" duration="'+Math.round(max*FPS)+'/24s" tcStart="0s" tcFormat="NDF"><spine>';
  let cursor=0;
  for(const {c,id} of sources){
    const st=Math.round(c.start*FPS),du=Math.round(c.duration*FPS),off=Math.round(c.offset*FPS);
    if(c.start>cursor+.001)str+='<gap name="Gap" offset="'+Math.round(cursor*FPS)+'/24s" duration="'+Math.round((c.start-cursor)*FPS)+'/24s"/>';
    str+='<asset-clip name="'+escXML(c.name)+'" ref="'+id+'" offset="'+st+'/24s" start="'+off+'/24s" duration="'+du+'/24s"/>';
    cursor=Math.max(cursor,c.start+c.duration);
  }
  return str+'</spine></sequence></project></event></library></fcpxml>';
}
function extFromMime(mime,url,type){
  const value=String(mime||'').toLowerCase();
  if(value.includes('webm'))return 'webm';
  if(value.includes('quicktime'))return 'mov';
  if(value.includes('mp4'))return 'mp4';
  if(value.includes('jpeg'))return 'jpg';
  if(value.includes('webp'))return 'webp';
  if(value.includes('png'))return 'png';
  const match=String(url||'').split('?')[0].match(/\.(mp4|mov|webm|png|jpg|jpeg|webp)$/i);
  if(match)return match[1].toLowerCase();
  return type==='video'?'mp4':'png';
}
async function sourceBlob(r){
  const res=await fetch(r.url);
  if(!res.ok)throw new Error('Média inaccessible ('+res.status+'). URL Agnes peut avoir expiré.');
  return {blob:await res.blob(),mime:res.headers.get('Content-Type')||r.mime};
}
async function downloadOriginal(r){
  if(!r)throw new Error('Aucun résultat à exporter.');
  const {blob,mime}=await sourceBlob(r);
  const ext=extFromMime(mime,r.url,r.type);
  download(blob,'meta-studio-'+r.id+'.'+ext);
}
async function exportZip(){
  if(!state.results.length)throw new Error('Médiathèque vide.');
  const mod=await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
  const zip=new mod.default();
  zip.file('project.json',JSON.stringify(serializableProject(),null,2));
  const failures=[];
  for(const [i,r] of state.results.entries()){
    try{
      status('ZIP : média '+(i+1)+'/'+state.results.length);
      const {blob,mime}=await sourceBlob(r);
      const ext=extFromMime(mime,r.url,r.type);
      zip.file('media/'+String(i+1).padStart(3,'0')+'_'+filename(r.prompt)+'.'+ext,blob);
    }catch(e){failures.push(r.prompt+' : '+e.message);}
  }
  if(failures.length)zip.file('media-non-disponibles.txt',failures.join('\n'));
  if(failures.length===state.results.length)throw new Error('Aucun média téléchargeable (CORS / URLs expirées).');
  const blob=await zip.generateAsync({type:'blob'});
  download(blob,'meta-studio-v5.zip');
  if(failures.length)log(failures.length+' média(s) manquants dans le ZIP.','error');
}
async function doExport(){
  const mode=$('export-format').value,source=$('export-source').value;
  $('export-button').disabled=true;
  try{
    status('Préparation de l’export…');
    if(mode==='project')downloadText(JSON.stringify(serializableProject(),null,2),'meta-studio-v5.json','application/json');
    else if(mode==='edl')downloadText(EDL(),'meta-studio-v5.edl');
    else if(mode==='otio')downloadText(OTIO(),'meta-studio-v5.otio','application/json');
    else if(mode==='fcpxml')downloadText(FCPXML(),'meta-studio-v5.fcpxml','application/xml');
    else if(mode==='zip'||source==='all')await exportZip();
    else{
      const r=source==='first'?state.results[0]:state.results[state.results.length-1];
      await downloadOriginal(r);
    }
    notify('Export préparé. Vérifiez le téléchargement du navigateur.','success');
  }catch(e){notify('Export : '+e.message,'error');}
  finally{$('export-button').disabled=false;}
}
async function loadProject(file){
  if(!file)return;
  const data=JSON.parse(await file.text());
  if(data.format!=='meta-studio-pro'||data.version!==5)throw new Error('Format de projet incompatible.');
  pause();
  const map=new Map();
  for(const r of data.results||[]){
    if(typeof r.url!=='string'||r.url.startsWith('blob:')){log('Média local à relier : '+r.prompt);continue;}
    try{
      const entry=addResult({type:r.type,url:r.url,prompt:r.prompt,origin:'Projet importé',duration:r.duration,mime:r.mime});
      map.set(r.id,entry.id);
    }catch(e){log('Média écarté : '+e.message,'error');}
  }
  for(const kind of validTypes)project.clips[kind]=[];
  for(const kind of validTypes)for(const c of data.timeline?.clips?.[kind]||[]){
    const newId=map.get(c.sourceId);
    if(kind==='video'&&!newId){log('Clip orphelin : '+c.name);continue;}
    const media=state.results.find(x=>x.id===newId);
    addClip(kind,{...c,sourceId:newId||c.sourceId,url:media?.url||c.url});
  }
  seek(Number(data.timeline?.playhead)||0);
  notify('Projet V5 importé. Vérifiez les liens médias externes.','success');
}
function agentMessage(message,kind='system'){
  const box=$('agent-log'),bubble=document.createElement('div');
  bubble.className='bubble '+kind;bubble.textContent=message;
  box.append(bubble);box.scrollTop=box.scrollHeight;
}
async function agent(command){
  agentMessage(command,'user');
  const cmd=command.trim().toLowerCase();
  try{
    if(cmd==='statut')agentMessage(state.results.length+' média(s) · '+allClips().length+' clip(s) · '+tc(project.playhead));
    else if(cmd==='ajouter à la timeline'||cmd==='ajouter') {
      const last=state.results[state.results.length-1];if(!last)throw new Error('Aucun média.');
      appendMedia(last);agentMessage('Dernier média ajouté.');
    }else if(cmd==='couper'){cut();agentMessage('Commande de coupe exécutée.');}
    else if(cmd==='supprimer'){removeClip();agentMessage('Suppression exécutée.');}
    else if(cmd.startsWith('générer image')||cmd.startsWith('générer vidéo')){
      const video=cmd.startsWith('générer vidéo');
      const p=command.split(':').slice(1).join(':').trim();
      if(!p)throw new Error('Utilise « générer image : ton prompt »');
      $('generation-mode').value=video?'video':'image';
      $('generation-mode').dispatchEvent(new Event('change'));
      $('prompt').value=p;
      agentMessage('Commande envoyée au moteur Agnes (si une clé est disponible).');
      await generate();
    }else if(cmd.startsWith('parler :')){
      const speech=command.slice(command.indexOf(':')+1).trim();speak(speech);agentMessage('Synthèse vocale lancée.');
    }else if(cmd.startsWith('look :')){
      const name=cmd.slice(5).trim();
      if(!LOOKS[name])throw new Error('Look inconnu : '+Object.keys(LOOKS).join(', '));
      look=name;renderLooks();agentMessage('Look '+LOOKS[name].name+' sélectionné.');
    }else{
      agentMessage('Commandes : statut · ajouter · couper · supprimer · générer image : ... · générer vidéo : ... · parler : ... · look : noir/warm/cool/film/pastel/clean');
    }
  }catch(e){agentMessage('Erreur : '+e.message);}
}
function bindAsync(id,cb){
  $(id).addEventListener('click',async()=>{
    $(id).disabled=true;try{await cb();}catch(e){notify(e.message,'error');}
    finally{$(id).disabled=false;}
  });
}
function init(){
  document.addEventListener('studio:add-clip',e=>appendMedia(e.detail));
  document.addEventListener('keydown',e=>{
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
    if(e.code==='Space'){e.preventDefault();play();}
    if(e.key==='Delete'||e.key==='Backspace')removeClip();
  });
  $('tl-ruler').addEventListener('click',e=>seek(pxToSeconds(e.clientX,$('tl-ruler'))));
  $('tl-play').addEventListener('click',play);
  $('tl-stop').addEventListener('click',()=>{pause();seek(0);});
  $('timeline-scrub').addEventListener('input',e=>{pause();seek(Number(e.target.value));});
  $('tl-cut').addEventListener('click',cut);
  $('tl-delete').addEventListener('click',removeClip);
  $('tl-add').addEventListener('click',()=>{
    const r=state.results[state.results.length-1];if(!r)return notify('Aucun média.','error');appendMedia(r);
  });
  $('tl-add-text').addEventListener('click',()=>{
    const content=$('overlay-text').value.trim();if(!content)return notify('Texte vide.','error');
    addClip('overlay',{name:content.slice(0,24),start:project.playhead,duration:5,text:content});
    syncPreview(true);
  });
  $('audio-track-file').addEventListener('change',async e=>{
    const f=e.target.files?.[0];if(!f)return;
    const src=URL.createObjectURL(f);
    const kind=$('audio-kind').value;
    let duration=10;
    const audio=new Audio();audio.preload='metadata';audio.src=src;
    await new Promise(resolve=>{
      audio.onloadedmetadata=()=>{duration=Number.isFinite(audio.duration)?audio.duration:10;resolve();};
      audio.onerror=resolve;setTimeout(resolve,1800);
    });
    addClip('audio',{name:f.name.slice(0,30),url:src,start:project.playhead,duration,kind});
    e.target.value='';
  });
  ['dialogue','music','ambience'].forEach(k=>{
    const slider=$('vol-'+k);
    slider.addEventListener('input',()=>{$('val-'+k).textContent=slider.value+'%';syncAudio();});
  });
  renderLooks();renderTimeline();
  ['lift','gamma','gain','sat'].forEach(k=>{
    const el=$('grade-'+k);
    el.addEventListener('input',()=>{$('grade-val-'+k).textContent=el.value;});
  });
  $('mask-threshold').addEventListener('input',e=>$('mask-val').textContent=e.target.value+'%');
  bindAsync('image-grade',applyLook);
  bindAsync('image-mask',()=>localEffect('mask'));
  bindAsync('image-depth',()=>localEffect('depth'));
  bindAsync('image-upscale',()=>localEffect('upscale'));
  bindAsync('image-download',()=>saveProcessed(false));
  bindAsync('image-add',()=>saveProcessed(true));
  bindAsync('analyze-audio',analyzeAudio);
  $('tts-speak').addEventListener('click',()=>{try{speak($('tts-text').value);}catch(e){notify(e.message,'error');}});
  $('tts-stop').addEventListener('click',()=>('speechSynthesis' in window) && speechSynthesis.cancel());
  $('agent-send').addEventListener('click',()=>{
    const value=$('agent-command').value.trim();if(value){$('agent-command').value='';agent(value);}
  });
  $('agent-command').addEventListener('keydown',e=>{if(e.key==='Enter'){$('agent-send').click();}});
  $('export-button').addEventListener('click',doExport);
  $('import-project').addEventListener('change',async e=>{
    try{await loadProject(e.target.files?.[0]);}catch(err){notify('Import : '+err.message,'error');}e.target.value='';
  });
  $('clear-log').addEventListener('click',()=>{$('journal').replaceChildren();});
  $('copy-log').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText($('journal').innerText);notify('Journal copié.','success');}
    catch{notify('Copie impossible.','error');}
  });
  log('Timeline, looks locaux, audio et exports prêts.','success');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
