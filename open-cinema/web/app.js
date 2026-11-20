/* STUDIO NIKO / OPEN CINEMA AI — tactile creator and automated FFmpeg/ComfyUI director.
 * No API secrets or tokens are stored in browser persistence. All server jobs use same-site cookies.
 * Procedural mode is explicitly non-AI. 4K certification is returned by server FFprobe, not invented here.
 */
const $ = id => document.getElementById(id);
const state={media:[],scenes:[],selected:null,playing:false,playhead:0,ticker:0,last:0,
  soundtrack:null,board:null,jobId:null,master:null,server:'',outputType:'video/webm',auth:false,grade:{brightness:0,contrast:100,saturation:100,temperature:0}};
// Mobile-only mode: all control, editing and browser exports run on the phone.
// Photorealistic Agnes generation still uses a remote GPU; keys live only in RAM.
const mobile={mode:false,keys:[],next:0,job:null,polling:false,busy:false};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const id=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random().toString(16).slice(2);
const fileName=s=>String(s||'film').normalize('NFKD').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,65);
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),4500);}
function tab(name){
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  document.querySelectorAll('.tab-content').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));
}
function setStatus(node,message,bad=false){const el=$(node);el.textContent=message;el.style.color=bad?'#ff9b9b':'';}
function seconds(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(2).padStart(5,'0')}`;}
function duration(){return state.scenes.reduce((acc,c)=>acc+clipDuration(c),0);}
function clipDuration(c){return c.type==='image'?Number(c.duration)||4:Math.max(.1,c.trimEnd-c.trimStart);}
async function api(route,{method='GET',body,signal,raw=false,headers={}}={}){
  const base=state.server||location.origin;
  const response=await fetch(base+route,{method,credentials:'include',signal,headers:{...(body&&!raw?{'Content-Type':'application/json'}:{}),...headers},body:raw?body:body?JSON.stringify(body):undefined});
  if(!response.ok){let msg='HTTP '+response.status;try{msg=(await response.json()).error||msg;}catch{}throw Error(msg);}
  return response.status===204?null:response.json();
}
async function connect(){
  try{
    const h=await api('/api/health');
    mobile.mode=h.mobile===true;
    state.auth=!!h.authorized;
    $('connection').innerHTML='<i></i> '+(mobile.mode?'MODE TÉLÉPHONE':h.authorized?'CONNECTÉ':'AUTHENTIFICATION');
    $('connection').classList.toggle('online',mobile.mode||!!h.authorized);
    $('monitorInfo').textContent=mobile.mode?'MONTAGE MOBILE · EXPORT SELON APPAREIL':'4K MASTER · 24 FPS · '+(h.ffmpeg?'FFMPEG PRÊT':'FFMPEG ABSENT');
    if(mobile.mode){
      setStatus('backendStatus','Mode téléphone opérationnel : montage et export dans ce navigateur. Agnes utilise des GPU distants, pas un ordinateur personnel.');
      setStatus('directorStatus','Mode téléphone prêt. Pour créer des plans IA, choisis Agnes et ajoute ta clé dans l’onglet Agnes AI.');
      setStatus('aiStatus','Ajoute une clé Agnes pour générer des images ou des vidéos depuis ton téléphone. Gratuité selon les quotas Agnes.');
    }else setStatus('backendStatus',h.authorized?`Serveur connecté · FFmpeg ${h.ffmpeg?'OK':'absent'} · ComfyUI ${h.comfy?'disponible':'non connecté'}`:'Serveur détecté : code nécessaire.');
    return h;
  }catch(e){
    mobile.mode=true;state.auth=false;
    $('connection').innerHTML='<i></i> MONTAGE LOCAL';$('connection').classList.add('online');
    $('monitorInfo').textContent='MONTAGE LOCAL · SERVEUR ABSENT';
    setStatus('backendStatus','Mode hors ligne : importe, monte et exporte dans le navigateur. La génération Agnes exige une connexion Internet.',true);
    return {mobile:true,authorized:false,ffmpeg:false,comfy:false};
  }
}
async function authorize(token){
  await api('/api/session',{method:'POST',body:{token}});
  await connect();
}
// Never save Agnes keys in localStorage, project JSON, URLs or the repository.
function addAgnesKeys(){
  const el=$('agnesKeys');const incoming=el.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  let added=0;for(const key of incoming){if(key.length<12||key.length>600)continue;if(!mobile.keys.includes(key)){mobile.keys.push(key);added++;}}
  el.value='';$('agnesKeyCount').textContent=mobile.keys.length+' clé(s) en mémoire pour cet onglet.';
  toast(added+' clé(s) ajoutée(s) sans stockage permanent.');
}
async function agnesRequest(body,keyIndex){
  const key=mobile.keys[keyIndex];if(!key)throw Error('Ajoute une clé Agnes AI.');
  return api('/api/agnes',{method:'POST',body:{...body,key}});
}
function addGeneratedMedia(type,url,prompt){
  if(!(/^https:\/\//i.test(url)||/^data:image\/(png|jpeg|webp);base64,/i.test(url)))throw Error('Adresse de média retournée non sécurisée.');
  const item={id:id(),name:'Agnes '+type+' · '+prompt.slice(0,34),type,url,duration:type==='video'?5:4,file:null};
  state.media.push(item);renderLibrary();refreshVfxSources();renderGenerativeChoices();
  return item;
}
async function pollAgnesVideo(videoId,keyIndex,{silent=false}={}){
  const data=await agnesRequest({action:'poll',videoId},keyIndex);
  const status=String(data.status||'en attente').toLowerCase();
  const percent=Number(data.progress);const progress=Number.isFinite(percent)?' '+Math.max(0,Math.min(100,percent))+' %':'';
  if(!silent)setStatus('aiStatus','Agnes : '+status+progress);
  if(['completed','succeeded','success','done'].includes(status)){
    const url=data.metadata?.url||data.output?.url||data.url||data.data?.url;
    if(typeof url!=='string')throw Error('Agnes signale une fin de tâche sans URL vidéo.');
    return {done:true,url};
  }
  if(['failed','error','cancelled','canceled'].includes(status))throw Error('Échec Agnes : '+String(data.error?.message||data.error||status).slice(0,180));
  return {done:false,status};
}
function presentGenerated(item){
  const box=$('aiResult');box.replaceChildren();
  const media=document.createElement(item.type==='video'?'video':'img');
  media.src=item.url;media.style.maxWidth='100%';media.style.borderRadius='12px';
  if(item.type==='video'){media.controls=true;media.playsInline=true;media.preload='metadata';}
  const actions=document.createElement('div');actions.className='action-row';
  const add=document.createElement('button');add.className='outline-btn';add.textContent='＋ Ajouter au montage';add.onclick=()=>{addScene(item);tab('media');};
  const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ouvrir / enregistrer le média';link.className='outline-btn';
  actions.append(add,link);box.append(media,actions);
  setStatus('aiStatus','Média reçu. Télécharge-le sur ton téléphone pour le conserver et le réimporter si le CDN bloque l’export.');
}
async function generateAgnesMobile(){
  if(mobile.busy||mobile.job)throw Error('Une génération vidéo est déjà en cours. Vérifie le résultat avant une nouvelle demande.');
  if(!mobile.mode)throw Error('Le bouton Agnes mobile nécessite le mode Vercel.');
  if(!$('agnesConsent').checked)throw Error('Vérifie ton quota gratuit Agnes et coche la confirmation avant de générer.');
  const prompt=$('prompt').value.trim();if(prompt.length<8)throw Error('Précise ton prompt (8 caractères minimum).');
  if(!mobile.keys.length)throw Error('Ajoute ta clé API Agnes avant de générer.');
  const kind=$('aiType').value,keyIndex=mobile.next++%mobile.keys.length;
  mobile.busy=true;$('generate').disabled=true;
  try{
    setStatus('aiStatus','Envoi de la génération '+kind+' à Agnes…');
    const aspect=$('aspect').value, seconds=Number($('agnesSeconds').value)||5;
    const data=await agnesRequest({action:kind,prompt,aspect,seconds},keyIndex);
    if(kind==='image'){
      const first=data.data?.[0];const url=first?.url||(first?.b64_json?'data:image/png;base64,'+first.b64_json:null);
      if(!url)throw Error('Agnes n’a retourné aucune image.');
      const item=addGeneratedMedia('image',url,prompt);presentGenerated(item);
    }else{
      const videoId=String(data.video_id||data.id||data.task_id||'');if(!videoId)throw Error('Agnes n’a pas fourni d’identifiant vidéo.');
      mobile.job={videoId,keyIndex,prompt,seconds};$('checkJob').hidden=false;
      setStatus('aiStatus','Tâche vidéo acceptée. Vérification périodique du résultat…');
      await pollActiveAgnes();
    }
  }finally{mobile.busy=false;$('generate').disabled=false;}
}
async function pollActiveAgnes(){
  if(!mobile.job||mobile.polling)return;
  mobile.polling=true;
  try{
    const j=mobile.job;const result=await pollAgnesVideo(j.videoId,j.keyIndex);
    if(result.done){mobile.job=null;$('checkJob').hidden=true;const item=addGeneratedMedia('video',result.url,j.prompt);item.duration=j.seconds;presentGenerated(item);}
    else if(mobile.job)setTimeout(()=>pollActiveAgnes().catch(e=>setStatus('aiStatus',e.message,true)),9000);
  }catch(e){setStatus('aiStatus',e.message,true);throw e;}
  finally{mobile.polling=false;}
}
function mobileStoryboard({prompt,engine,aspect,grade,count,seconds,assets=[]}){
  const names=['Plan d’ouverture','Plan d’ensemble','Plan rapproché','Travelling','Plan de détail','Plan final'];
  return {id:id(),title:prompt.slice(0,50),aspect,grade,engine,shots:Array.from({length:count},(_,i)=>({
    id:id(),index:i+1,title:names[i%names.length],duration:seconds,camera:['travelling avant','plan fixe','caméra orbitale'][i%3],
    prompt:prompt+' ; '+names[i%names.length]+', séquence '+(i+1)+'/'+count+', caméra cinématographique, continuité visuelle, pas de filigrane.',
    sourceMediaId:engine==='imported'?assets[i]?.id:null
  }))};
}
async function mobileRealize(){
  const board=state.board;
  if(board.engine==='imported'){
    const ids=board.shots.map(s=>s.sourceMediaId).filter(Boolean);
    if(!ids.length)throw Error('Importe des rushes et sélectionne-les pour ce montage.');
    state.scenes=[];for(const mediaId of ids){const media=state.media.find(m=>m.id===mediaId);if(media)addScene(media);}
    tab('export');setStatus('directorStatus','Montage préparé sur le téléphone. Encodage du fichier en cours…');
    await exportPreview();
    return;
  }
  if(board.engine==='agnes-video-flash'){
    if(!$('agnesConsent').checked)throw Error('Vérifie et confirme ton quota Agnes avant l’Autopilot.');
    if(!mobile.keys.length)throw Error('Ajoute au moins une clé Agnes.');
    state.scenes=[];
    for(const [i,shot] of board.shots.entries()){
      setStatus('directorStatus','Agnes : plan '+(i+1)+'/'+board.shots.length+' · envoi…');
      const keyIndex=mobile.next++%mobile.keys.length;
      const data=await agnesRequest({action:'video',prompt:shot.prompt,aspect:board.aspect==='17:9'?'16:9':board.aspect,seconds:[4,5,8,12].includes(shot.duration)?shot.duration:5},keyIndex);
      const videoId=String(data.video_id||data.id||data.task_id||'');if(!videoId)throw Error('Création ambiguë : consulte l’historique Agnes avant de relancer.');
      let result;for(let n=0;n<75;n++){
        await new Promise(r=>setTimeout(r,9000));result=await pollAgnesVideo(videoId,keyIndex,{silent:true});
        if(result.done)break;setStatus('directorStatus','Plan '+(i+1)+'/'+board.shots.length+' · '+result.status);
      }
      if(!result?.done)throw Error('Délai Agnes dépassé ; vérifie la tâche avant toute relance.');
      const item=addGeneratedMedia('video',result.url,shot.prompt);item.duration=shot.duration;addScene(item);
    }
    tab('export');setStatus('directorStatus','Plans reçus. Export automatique navigateur en cours…');
    await exportPreview();
    return;
  }
  throw Error('Ce moteur exige un GPU externe. Sur téléphone seul, utilise Agnes ou monte des rushes importés.');
}
function updatePreviewStyle(){
  const aspect=$('aspect').value;
  const [w,h]=aspect==='9:16'?[540,960]:aspect==='1:1'?[720,720]:[960,540];
  const canvas=$('preview');canvas.width=w;canvas.height=h;
  canvas.style.aspectRatio=`${w}/${h}`;
  drawPreview();
}
function stageSource(src){
  if(!src.element){
    src.element=document.createElement(src.type==='image'?'img':'video');
    src.element.src=src.url;
    if(src.type==='video'){src.element.preload='auto';src.element.playsInline=true;src.element.muted=false;src.element.loop=false;}
  }
  return src.element;
}
function frameAt(time){
  let cursor=0;
  for(const scene of state.scenes){const len=clipDuration(scene);if(time>=cursor&&time<cursor+len+.001)return {scene,local:clamp(time-cursor,0,len),start:cursor};cursor+=len;}
  return null;
}
function drawPreview(){
  const canvas=$('preview'),ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;
  const w=canvas.width,h=canvas.height;
  ctx.fillStyle='#050710';ctx.fillRect(0,0,w,h);
  const found=frameAt(state.playhead);
  $('emptyStage').style.display=found?'none':'';
  if(found){
    const item=state.media.find(m=>m.id===found.scene.mediaId);
    if(item){const el=stageSource(item);
      if(el.tagName==='VIDEO'){
        const target=found.scene.trimStart+found.local;
        if(el.readyState>=1&&Math.abs((el.currentTime||0)-target)>.25)try{el.currentTime=target;}catch{}
        if(state.playing&&el.paused)el.play().catch(()=>{});
      }
      const iw=el.videoWidth||el.naturalWidth,ih=el.videoHeight||el.naturalHeight;
      if(iw>0&&ih>0){const scale=Math.max(w/iw,h/ih),dw=iw*scale,dh=ih*scale;
        const g=state.grade;ctx.filter=`brightness(${100+g.brightness}%) contrast(${g.contrast}%) saturate(${g.saturation}%)`;
        try{ctx.drawImage(el,(w-dw)/2,(h-dh)/2,dw,dh);}catch{}
        ctx.filter='none';
        if(g.temperature){ctx.fillStyle=g.temperature>0?`rgba(240,132,62,${g.temperature/500})`:`rgba(55,108,232,${-g.temperature/500})`;ctx.fillRect(0,0,w,h);}
      }
    }}
  $('playTime').textContent=seconds(state.playhead);$('totalTime').textContent='/ '+seconds(duration());
  $('seek').max=Math.max(.1,duration());$('seek').value=state.playhead;
}
function updateStage(){
  document.querySelectorAll('#timeline .timeline-clip').forEach(el=>el.classList.toggle('selected',el.dataset.scene===state.selected));
  $('sceneCount').textContent=state.scenes.length+' PLAN'+(state.scenes.length>1?'S':'');
  const parent=$('timeline');parent.replaceChildren();
  if(!state.scenes.length){parent.innerHTML='<div class="timeline-empty">Ajoute tes premiers plans.</div>';}else{
    state.scenes.forEach((scene,i)=>{
      const item=state.media.find(m=>m.id===scene.mediaId);const button=document.createElement('button');
      button.className='timeline-clip '+(state.selected===scene.id?'selected':'');button.dataset.scene=scene.id;
      button.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span><strong></strong><small>${seconds(clipDuration(scene))}</small>`;
      button.querySelector('strong').textContent=item?.name||'Média manquant';
      button.addEventListener('click',()=>selectScene(scene.id));
      parent.append(button);
    });
  }
  $('sceneInspector').hidden=!state.selected;drawPreview();
}
function selectScene(sceneId){
  state.selected=sceneId;
  const scene=state.scenes.find(s=>s.id===sceneId);
  if(scene){$('sceneLabel').textContent=state.media.find(m=>m.id===scene.mediaId)?.name||'Plan';
    $('trimStart').value=scene.trimStart;$('trimEnd').value=scene.trimEnd;$('imageDuration').value=scene.duration;
    $('imageDuration').disabled=scene.type!=='image';$('trimStart').disabled=scene.type==='image';$('trimEnd').disabled=scene.type==='image';
    $('fadeDuration').value=scene.fade;}
  updateStage();
}
function addScene(item){
  const scene={id:id(),mediaId:item.id,type:item.type,trimStart:0,trimEnd:item.duration||5,duration:4,fade:.25};
  state.scenes.push(scene);state.selected=scene.id;updateStage();toast('Plan ajouté à la timeline.');
}
function renderLibrary(){
  const box=$('mediaLibrary');box.replaceChildren();
  if(!state.media.length){box.innerHTML='<div class="empty-library">Aucun média importé.<br>Les fichiers restent sur ton appareil.</div>';return;}
  for(const item of state.media){
    const card=document.createElement('article');card.className='media-card';
    const media=item.type==='image'?document.createElement('img'):item.type==='video'?document.createElement('video'):document.createElement('div');
    if(item.type!=='audio'){media.src=item.url;media.className='media-thumbnail';media.setAttribute('loading','lazy');}else media.textContent='♫ AUDIO';
    const title=document.createElement('strong');title.textContent=item.name;
    const button=document.createElement('button');button.className='subtle-btn';button.textContent=item.type==='audio'?'Choisir en musique':'+ Timeline';
    button.onclick=()=>item.type==='audio'?setSoundtrack(item):addScene(item);
    card.append(media,title,button);box.append(card);
  }
}
function importFile(file){
  const ext=file.name.toLowerCase().split('.').pop();
  const type=file.type.startsWith('image/')||['png','jpeg','jpg','webp'].includes(ext)?'image':file.type.startsWith('video/')||['mp4','webm','mov'].includes(ext)?'video':file.type.startsWith('audio/')||['mp3','wav','flac','ogg','m4a'].includes(ext)?'audio':null;
  if(!type){toast('Média non pris en charge : '+file.name);return;}
  if(file.size>250*1024*1024){toast('Fichier trop volumineux pour ce serveur (250 Mo max) : '+file.name);return;}
  const item={id:id(),name:file.name,type,url:URL.createObjectURL(file),file,duration:type==='image'?4:5};
  const el=stageSource(item);
  if(type!=='image')el.onloadedmetadata=()=>{if(Number.isFinite(el.duration))item.duration=el.duration;};
  state.media.push(item);renderLibrary();refreshVfxSources();renderGenerativeChoices();return item;
}
function setSoundtrack(item){state.soundtrack=item;setStatus('soundtrackName',item.name);toast('Bande-son sélectionnée : '+item.name);}
function download(blob,filename){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),45000);}
async function exportPreview(){
  const canvas=$('preview');if(!state.scenes.length)throw Error('Aucun plan à exporter.');
  const oldWidth=canvas.width,oldHeight=canvas.height;
  const quality=Number($('quality').value)||720;
  const aspect=$('aspect').value;
  canvas.width=aspect==='9:16'?quality:aspect==='1:1'?quality:Math.round(quality*16/9);
  canvas.height=aspect==='9:16'?Math.round(quality*16/9):quality;
  drawPreview();
  try {
  if(!canvas.captureStream||!window.MediaRecorder)throw Error('Capture vidéo indisponible sur ce navigateur.');
  const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm'].find(MediaRecorder.isTypeSupported);
  if(!mime)throw Error('Aucun codec export compatible.');
  setStatus('exportStatus','Enregistrement de l’aperçu en temps réel…');
  const stream=canvas.captureStream(24);let ac,dest,source=null;
  const music=state.soundtrack?new Audio(state.soundtrack.url):null;
  if(music){ac=new (window.AudioContext||window.webkitAudioContext)();dest=ac.createMediaStreamDestination();source=ac.createMediaElementSource(music);
    const gain=ac.createGain();gain.gain.value=Number($('soundtrackVolume').value)/100;source.connect(gain);gain.connect(dest);
    dest.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
    music.loop=true;await ac.resume();await music.play().catch(()=>{});
  }
  const chunks=[];const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:7_000_000});
  rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
  const done=new Promise((resolve,reject)=>{rec.onerror=e=>reject(e.error||Error('Échec encodage'));rec.onstop=resolve;});
  seek(0);rec.start(400);if(!state.playing)togglePlay();
  await new Promise(resolve=>{const finish=()=>{if(!state.playing||state.playhead>=duration()){resolve();return;}requestAnimationFrame(finish);};requestAnimationFrame(finish);});
  rec.stop();await done;state.playing=false;stopElements();music?.pause();await ac?.close();stream.getTracks().forEach(t=>t.stop());
  const blob=new Blob(chunks,{type:mime});if(blob.size<1024)throw Error('Fichier de sortie vide.');
  download(blob,'studio-niko-apercu.'+(mime.includes('mp4')?'mp4':'webm'));
  setStatus('exportStatus','Fichier navigateur créé ('+Math.round(blob.size/1024/1024*10)/10+' Mo). Résolution demandée : '+canvas.width+'×'+canvas.height+'. Pas de certification FFprobe ni garantie 4K native.');
  } finally { canvas.width=oldWidth;canvas.height=oldHeight;drawPreview(); }
}
function seek(t){state.playhead=clamp(t,0,duration());drawPreview();}
function togglePlay(){
  state.playing=!state.playing;
  if(state.playing){if(state.playhead>=duration())state.playhead=0;state.last=performance.now();requestAnimationFrame(tick);}
  else stopElements();
  $('play').textContent=state.playing?'❚❚':'▶';
}
function stopElements(){for(const m of state.media)if(m.type==='video')m.element?.pause();}
function tick(now){if(!state.playing)return;state.playhead=clamp(state.playhead+Math.min(.12,(now-state.last)/1000),0,duration());state.last=now;drawPreview();if(state.playhead>=duration()){state.playing=false;stopElements();$('play').textContent='▶';return;}requestAnimationFrame(tick);}
function storyboardCard(shot,index){
  const card=document.createElement('article');card.className='shot-card';
  const head=document.createElement('header');const title=document.createElement('h3');title.textContent=`PLAN ${index+1} · ${shot.title}`;
  const actions=document.createElement('div');actions.className='shot-actions';
  for(const [symbol,delta] of [['↑',-1],['↓',1]]){const b=document.createElement('button');b.textContent=symbol;b.type='button';b.title=delta<0?'Monter':'Descendre';b.disabled=index+delta<0||index+delta>=state.board.shots.length;
    b.onclick=()=>{const arr=state.board.shots;[arr[index],arr[index+delta]]=[arr[index+delta],arr[index]];renderStoryboard();};actions.append(b);}
  head.append(title,actions);
  const prompt=document.createElement('textarea');prompt.value=shot.prompt;prompt.maxLength=1600;prompt.setAttribute('aria-label','Prompt du plan '+(index+1));prompt.oninput=()=>shot.prompt=prompt.value;
  const row=document.createElement('div');row.className='shot-meta';
  const dur=document.createElement('label');dur.textContent='Durée (s)';const field=document.createElement('input');field.type='number';field.min='1';field.max='15';field.step='0.5';field.value=shot.duration;field.onchange=()=>shot.duration=clamp(Number(field.value)||4,1,15);dur.append(field);
  const cam=document.createElement('span');cam.textContent='Caméra · '+shot.camera;
  row.append(dur,cam);card.append(head,prompt,row);return card;
}
function renderStoryboard(){const box=$('storyboard');box.replaceChildren();for(let i=0;i<state.board.shots.length;i++)box.append(storyboardCard(state.board.shots[i],i));$('runFilm').disabled=false;}
async function planFilm(){
  const prompt=$('filmPrompt').value.trim();const engine=$('directorEngine').value;
  if(prompt.length<12)throw Error('Décris ton film en au moins 12 caractères.');
  const payload={prompt,engine,aspect:$('directorAspect').value,grade:$('directorGrade').value,shotCount:Number($('shotCount').value),shotSeconds:Number($('shotSeconds').value)};
  state.board=mobile.mode?mobileStoryboard({prompt,engine,aspect:payload.aspect,grade:payload.grade,count:payload.shotCount,seconds:payload.shotSeconds,assets:state.media.filter(m=>m.type!=='audio')}):await api('/api/plan',{method:'POST',body:payload});renderStoryboard();
  setStatus('directorStatus','Découpage prêt. Modifie les plans si nécessaire, puis lance la réalisation.');
}
let jobPoll=null;
async function pollJob(){
  if(!state.jobId)return;
  const job=await api('/api/jobs/'+state.jobId);
  $('directorProgress').value=job.progress;$('directorPercent').textContent=job.progress+' %';
  setStatus('directorStatus',job.step+(job.error?' : '+job.error:''),job.status==='failed');
  if(['completed','failed','cancelled'].includes(job.status)){
    clearInterval(jobPoll);jobPoll=null;$('cancelFilm').disabled=true;$('runFilm').disabled=false;
    if(job.status==='completed'&&job.qa?.pass){state.master=job.master;$('openFinal').disabled=false;
      toast('Master 4K encodé et vérifié.');setStatus('exportStatus',`Master vérifié · ${job.qa.dimensions.width}×${job.qa.dimensions.height} · ${Math.round(job.qa.seconds)} s`);
      tab('export');$('masterPreview').hidden=false;$('masterPreview').src=state.server+job.master;
      const link=$('downloadLink');link.hidden=false;link.href=state.server+job.master;link.download='STUDIO_NIKO_MASTER_4K.mp4';link.textContent='Télécharger le master 4K';
    }
  }
}
async function runFilm(){
  if(!state.board)throw Error('Crée d’abord le découpage.');
  if(mobile.mode)return mobileRealize();
  if(state.board.engine.startsWith('comfy-')&&!(await api('/api/health')).comfy)throw Error('ComfyUI n’est pas connecté. Configure ton GPU/ComfyUI ou choisis le mode motion graphics.');
  state.board.soundtrackId=state.board.soundtrackId||state.soundtrack?.assetId||null;
  if(state.soundtrack&&!state.board.soundtrackId){
    if(!state.soundtrack.file)throw Error('Fichier audio local introuvable.');
    setStatus('directorStatus','Téléversement de la bande-son vers ton propre PC…');
    const f=state.soundtrack.file;
    const uploaded=await api('/api/upload',{method:'POST',body:f,raw:true,headers:{'Content-Type':'application/octet-stream','X-Filename':f.name}});
    state.soundtrack.assetId=uploaded.id;state.board.soundtrackId=uploaded.id;
  }
  $('runFilm').disabled=true;$('cancelFilm').disabled=false;$('openFinal').disabled=true;state.master=null;
  const result=await api('/api/jobs',{method:'POST',body:{storyboard:state.board}});
  state.jobId=result.id;setStatus('directorStatus','Job accepté : '+result.id.slice(0,8));
  if(jobPoll)clearInterval(jobPoll);jobPoll=setInterval(()=>pollJob().catch(e=>setStatus('directorStatus',e.message,true)),2500);await pollJob();
}
function captureJSON(){return {format:'studio-niko-open-cinema',version:1,title:$('projectName').textContent,aspect:$('aspect').value,grade:state.grade,
  scenes:state.scenes.map(s=>({...s,filename:state.media.find(m=>m.id===s.mediaId)?.name})),board:state.board,
  warning:'Projet descriptif : les vidéos/images/sons ne sont pas intégrés au JSON. Réimporter les rushes avant de reprendre un montage manuel.'};}

let vfxPlan=null,vfxJob=null,vfxTimer=null,vfxMaster=null;
function refreshVfxSources(){
  const select=$('vfxSource');if(!select)return;
  const prev=select.value;select.replaceChildren(new Option('Choisir un rush vidéo',''));
  for(const item of state.media.filter(m=>m.type==='video'&&m.file))select.add(new Option(item.name,item.id));
  if([...select.options].some(o=>o.value===prev))select.value=prev;
}
async function refreshVfxCapabilities(){
  if(mobile.mode){$('vfxReadiness').textContent='Sur téléphone : la génération Agnes fonctionne dans son onglet. Le VFX neuronaux avec suivi image par image nécessite encore un service spécialisé non connecté.';return;}
  const data=await api('/api/vfx/effects');
  const available=Object.entries(data.effects).filter(([,value])=>value.installed).map(([,value])=>value.name);
  $('vfxReadiness').textContent='GPU ComfyUI : '+(data.gpu?'connecté':'indisponible')+' · Workflows AI VFX : '+available.length+'/8 installés.'+
    (available.length?' Disponibles : '+available.join(' · '):' Exporte tes graphes de modèles dans workflows/vfx/*.json sur le PC.');
}
async function vfxAnalyze(){
  if(mobile.mode)throw Error('Le moteur VFX vidéo-à-vidéo n’est pas connecté dans le mode téléphone. Agnes peut créer un nouveau plan, mais pas transformer fidèlement un rush entier.');
  const prompt=$('vfxPrompt').value.trim();
  vfxPlan=await api('/api/vfx/plan',{method:'POST',body:{effect:$('vfxEffect').value,prompt,
    aspect:$('directorAspect').value,grade:$('directorGrade').value}});
  $('vfxPlanDetails').textContent=vfxPlan.name+' · '+vfxPlan.model+' · '+vfxPlan.stages.join(' → ');
  $('vfxExecute').disabled=false;setStatus('vfxStatus','Effet planifié ; génération IA réelle uniquement si le modèle est installé.');
}
async function vfxCreate(){
  if(!vfxPlan)throw Error('Analyse d’abord le plan.');
  const item=state.media.find(m=>m.id===$('vfxSource').value&&m.file&&m.type==='video');
  if(!item)throw Error('Sélectionne une vidéo importée depuis ton téléphone ou PC.');
  $('vfxExecute').disabled=true;setStatus('vfxStatus','Transfert du rush vers ton PC…');
  if(!item.assetId){
    const data=await api('/api/upload',{method:'POST',body:item.file,raw:true,
      headers:{'Content-Type':'application/octet-stream','X-Filename':item.file.name}});
    item.assetId=data.id;
  }
  const created=await api('/api/vfx/jobs',{method:'POST',body:{...vfxPlan,assetId:item.assetId}});
  vfxJob=created.id;vfxMaster=null;
  $('vfxCancel').disabled=false;$('vfxPreview').hidden=true;$('vfxAddToTimeline').disabled=true;
  if(vfxTimer)clearInterval(vfxTimer);
  vfxTimer=setInterval(()=>vfxPoll().catch(e=>setStatus('vfxStatus',e.message,true)),2500);
  await vfxPoll();
}
async function vfxPoll(){
  if(!vfxJob)return;
  const data=await api('/api/vfx/jobs/'+vfxJob);
  $('vfxProgress').value=data.progress;
  setStatus('vfxStatus',data.step+' · '+data.progress+' %'+(data.error?' · '+data.error:''),data.status==='failed');
  if(['completed','failed','cancelled'].includes(data.status)){
    clearInterval(vfxTimer);vfxTimer=null;$('vfxCancel').disabled=true;$('vfxExecute').disabled=false;
    if(data.status==='completed'&&data.qa?.pass){
      vfxMaster={url:(state.server||location.origin)+data.master,duration:data.qa.seconds};
      $('vfxPreview').hidden=false;$('vfxResult').src=vfxMaster.url;
      $('vfxDownload').href=vfxMaster.url;
      $('vfxAddToTimeline').disabled=false;
      toast('VFX 4K encodé : contrôle technique réussi.');
    }
  }
}
function vfxAddTimeline(){
  if(!vfxMaster)return;
  const item={id:id(),name:'AI VFX 4K · '+vfxPlan.name,type:'video',url:vfxMaster.url,duration:vfxMaster.duration};
  state.media.push(item);renderLibrary();addScene(item);tab('media');
  toast('Plan AI VFX ajouté au montage.');
}


// GENERATIVE SUITE — prompt technique local explicite, fichiers réels et master backend.
let genChosen=new Set();
const GEN_STYLES={
  realiste:'rendu photoréaliste, détails réalistes, ton de peau naturel, mouvements cohérents',
  nocturne:'ambiance techno nocturne, néons maîtrisés, contraste profond, atmosphère cinématographique',
  onirique:'univers onirique, particules volumétriques, trajectoires cohérentes, halo subtil',
  documentaire:'lumière organique, mouvements naturels, textures authentiques'
};
function renderGenerativeChoices(){
  const wrap=$('genMediaChoices');if(!wrap)return;
  wrap.replaceChildren();
  const eligible=state.media.filter(m=>m.file&&['video','image','audio'].includes(m.type));
  const known=new Set(eligible.map(m=>m.id));genChosen=new Set([...genChosen].filter(id=>known.has(id)));
  if(!eligible.length){const p=document.createElement('p');p.className='hint';p.textContent='Importe des rushes ou des images de référence.';wrap.append(p);return;}
  for(const m of eligible){
    const row=document.createElement('label');row.className='gen-media-choice';
    const tick=document.createElement('input');tick.type='checkbox';tick.checked=genChosen.has(m.id);
    tick.onchange=()=>{tick.checked?genChosen.add(m.id):genChosen.delete(m.id);};
    const name=document.createElement('span');name.textContent=m.name;const kind=document.createElement('small');kind.textContent=m.type.toUpperCase();
    row.append(tick,name,kind);wrap.append(row);
  }
}
function chosenMedia(){return state.media.filter(m=>genChosen.has(m.id)&&m.file);}
function compileGenerativePrompt(){
  const raw=$('genPrompt').value.trim();if(raw.length<12)throw Error('Décris un film en au moins 12 caractères.');
  const style=GEN_STYLES[$('genStyle').value];const camera=$('genCamera').value,lens=$('genLens').value,light=$('genLight').value;
  const result=`${raw}. Direction artistique : ${style}. Mise en scène : ${camera}, ${lens}, ${light}. Montage cinématographique à 24 i/s, continuité des personnages, des costumes et de la lumière entre les plans, composition sans texte ni filigrane.`;
  $('genCompiled').value=result.slice(0,1500);
  return $('genCompiled').value;
}
async function ensureUploaded(item){
  if(item.assetId)return item.assetId;
  if(!item.file)throw Error('Le média original est absent : '+item.name);
  const response=await api('/api/upload',{method:'POST',body:item.file,raw:true,headers:{'Content-Type':'application/octet-stream','X-Filename':item.file.name}});
  item.assetId=response.id;return response.id;
}
async function generativePlan(){
  const base=$('genCompiled').value.trim()||compileGenerativePrompt();
  if(base.length<12)throw Error('Le prompt de réalisation est trop court.');
  const engine=$('genMode').value;
  const assets=chosenMedia();const visual=assets.filter(m=>m.type==='image'||m.type==='video');
  if(engine==='imported'&&!visual.length)throw Error('Sélectionne au moins une image ou vidéo à assembler.');
  if(engine.startsWith('comfy-')&&assets.filter(m=>m.type==='image').length>1)
    throw Error('Pour une génération IA guidée, sélectionne une seule image de référence (ou aucune).');
  if(engine.startsWith('comfy-')&&assets.some(m=>m.type==='video'))throw Error('La génération IA guidée accepte une image, pas un rush vidéo ; utilise AI VFX pour modifier un film.');
  const count=engine==='imported'?visual.length:Number($('genCount').value);
  if(count>12)throw Error('12 plans maximum par production automatique.');
  const firstAudio=assets.find(m=>m.type==='audio');
  $('filmPrompt').value=base;$('directorEngine').value=engine;if(![...$('shotCount').options].some(o=>Number(o.value)===count))$('shotCount').add(new Option(String(count),String(count)));$('shotCount').value=String(count);
  $('shotSeconds').value=$('genSeconds').value;$('directorAspect').value=$('genAspect').value;
  $('aspect').value=['9:16','1:1'].includes($('genAspect').value)?$('genAspect').value:'16:9';updatePreviewStyle();
  $('directorGrade').value=$('genStyle').value==='nocturne'?'techno':$('genStyle').value==='documentaire'?'nature':'cinema';
  const board=mobile.mode?mobileStoryboard({prompt:base,engine,aspect:$('genAspect').value,grade:$('directorGrade').value,count,seconds:Number($('genSeconds').value),assets:visual}):await api('/api/plan',{method:'POST',body:{prompt:base,engine,aspect:$('genAspect').value,grade:$('directorGrade').value,shotCount:count,shotSeconds:Number($('genSeconds').value)}});
  if(engine==='imported'){
    for(let i=0;i<board.shots.length;i++){
      const m=visual[i];
      board.shots[i].sourceAssetId=mobile.mode?null:await ensureUploaded(m);
      if(mobile.mode)board.shots[i].sourceMediaId=m.id;
      board.shots[i].title=(m.name||'Rush').slice(0,50);
      board.shots[i].duration=Math.min(15,Math.max(1,Number(m.duration)||Number($('genSeconds').value)));
    }
  }
  if(engine.startsWith('comfy-')){
    const ref=assets.find(m=>m.type==='image');
    if(ref&&!mobile.mode){const assetId=await ensureUploaded(ref);board.shots.forEach(s=>s.referenceAssetId=assetId);}
  }
  if(firstAudio){if(!mobile.mode)board.soundtrackId=await ensureUploaded(firstAudio);state.soundtrack=firstAudio;}
  state.board=board;renderStoryboard();
  setStatus('genStatus',`Storyboard créé · ${board.shots.length} plan(s) · ${engine==='imported'?'montage des rushes réels':'modèle '+engine}. Tu peux modifier chaque plan dans Auto-réalisation.`);
  return board;
}
async function generativeProduce(){
  await generativePlan();tab('director');await runFilm();
}
function bind(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab(b.dataset.tab);if(b.dataset.tab==='vfx')refreshVfxCapabilities().catch(e=>setStatus('vfxReadiness',e.message,true));});
  $('vfxPlan').onclick=()=>vfxAnalyze().catch(e=>setStatus('vfxStatus',e.message,true));
  $('vfxExecute').onclick=()=>vfxCreate().catch(e=>{$('vfxExecute').disabled=false;setStatus('vfxStatus',e.message,true);});
  $('vfxCancel').onclick=()=>{if(vfxJob)api('/api/vfx/jobs/'+vfxJob+'/cancel',{method:'POST'}).catch(e=>setStatus('vfxStatus',e.message,true));};
  $('vfxAddToTimeline').onclick=vfxAddTimeline;
  $('vfxPrompt').oninput=()=>{vfxPlan=null;$('vfxExecute').disabled=true;};
  $('vfxEffect').onchange=()=>{vfxPlan=null;$('vfxExecute').disabled=true;};
  document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('prompt').value=b.dataset.prompt;});
  $('settingsButton').onclick=()=>{if(mobile.mode){tab('ai');$('agnesKeys').focus();toast('Ajoute tes clés Agnes dans cet onglet. Aucun PC nécessaire.');}else $('settingsDialog').showModal();};
  $('saveSettings').onclick=e=>{e.preventDefault();const input=$('backendUrl').value.trim();
    if(input&&new URL(input).origin!==location.origin){toast('Pour protéger la session, ouvre directement cette adresse serveur dans le navigateur (même origine).');return;}
    const token=$('serverToken').value;$('serverToken').value='';
    authorize(token).then(()=>{$('settingsDialog').close();toast('Serveur connecté.');}).catch(e=>setStatus('backendStatus',e.message,true));
  };
  $('testBackend').onclick=()=>connect().catch(()=>{});
  $('importMedia').onchange=e=>{for(const f of e.target.files)importFile(f);e.target.value='';};
  $('genFiles').onchange=e=>{for(const f of e.target.files){const m=importFile(f);if(m)genChosen.add(m.id);}renderGenerativeChoices();e.target.value='';};
  $('genCompose').onclick=()=>{try{compileGenerativePrompt();setStatus('genStatus','Prompt technique compilé ; tu peux le modifier puis créer le storyboard.');}catch(e){setStatus('genStatus',e.message,true);}};
  $('genPlan').onclick=()=>generativePlan().catch(e=>setStatus('genStatus',e.message,true));
  $('genProduce').onclick=()=>generativeProduce().catch(e=>{setStatus('genStatus',e.message,true);setStatus('directorStatus',e.message,true);$('runFilm').disabled=false;$('cancelFilm').disabled=true;});
  $('genCopy').onclick=()=>navigator.clipboard.writeText($('genCompiled').value).then(()=>toast('Prompt copié')).catch(()=>toast('Copie impossible.'));

  $('addImages').onclick=()=>$('importMedia').click();
  $('soundtrackInput').onchange=e=>{const f=e.target.files?.[0];if(f){const item=importFile(f);if(item)setSoundtrack(item);}e.target.value='';};
  $('aspect').onchange=updatePreviewStyle;
  for(const [idKey,prop,make] of [['brightness','brightness',v=>v],['contrast','contrast',v=>v+'%'],['saturation','saturation',v=>v+'%'],['temperature','temperature',v=>v]]){
    $(idKey).oninput=e=>{state.grade[prop]=Number(e.target.value);$(idKey==='brightness'?'brightVal':idKey==='contrast'?'contrastVal':idKey==='saturation'?'saturationVal':'temperatureVal').textContent=make(e.target.value);drawPreview();};
  }
  $('resetGrade').onclick=()=>{for(const [key,val] of Object.entries({brightness:0,contrast:100,saturation:100,temperature:0})){$(key).value=val;$(key).dispatchEvent(new Event('input'));}};
  $('play').onclick=togglePlay;$('stop').onclick=()=>{state.playing=false;stopElements();seek(0);$('play').textContent='▶';};$('toStart').onclick=()=>seek(0);
  $('seek').oninput=e=>{state.playing=false;stopElements();seek(Number(e.target.value));$('play').textContent='▶';};
  $('renameProject').onclick=()=>{const s=prompt('Nom du projet :',$('projectName').textContent);if(s?.trim())$('projectName').textContent=s.trim().slice(0,80);};
  $('removeScene').onclick=()=>{state.scenes=state.scenes.filter(s=>s.id!==state.selected);state.selected=null;updateStage();};
  for(const [elem,prop] of [['trimStart','trimStart'],['trimEnd','trimEnd'],['imageDuration','duration'],['fadeDuration','fade']]){
    $(elem).onchange=e=>{const scene=state.scenes.find(s=>s.id===state.selected);if(!scene)return;const val=Number(e.target.value);
      if(!Number.isFinite(val)||val<0)return;scene[prop]=val;
      if(scene.type==='video'){scene.trimStart=clamp(scene.trimStart,0,scene.trimEnd-.1);scene.trimEnd=Math.max(scene.trimStart+.1,scene.trimEnd);}
      if(scene.type==='image')scene.duration=clamp(scene.duration,.5,300);updateStage();};
  }
  $('saveProject').onclick=()=>download(new Blob([JSON.stringify(captureJSON(),null,2)],{type:'application/json'}),fileName($('projectName').textContent)+'.json');
  $('loadProject').onclick=()=>$('projectFile').click();
  $('projectFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const obj=JSON.parse(await f.text());if(obj.format!=='studio-niko-open-cinema')throw Error('Format non pris en charge');
      state.board=obj.board||null;if(state.board)renderStoryboard();$('projectName').textContent=obj.title||'Projet';toast('Découpage restauré. Réimporte les rushes locaux pour retrouver les fichiers.');
    }catch(err){toast(err.message);}e.target.value='';};
  $('planFilm').onclick=()=>planFilm().catch(e=>setStatus('directorStatus',e.message,true));
  $('runFilm').onclick=()=>runFilm().catch(e=>{$('runFilm').disabled=false;$('cancelFilm').disabled=true;setStatus('directorStatus',e.message,true);});
  $('cancelFilm').onclick=()=>{if(!state.jobId)return;api('/api/jobs/'+state.jobId+'/cancel',{method:'POST'}).catch(e=>toast(e.message));};
  $('openFinal').onclick=()=>{tab('export');$('masterPreview').scrollIntoView({behavior:'smooth',block:'center'});};
  $('exportServer').onclick=()=>{if(state.master){tab('export');$('masterPreview').hidden=false;$('masterPreview').src=state.server+state.master;}
    else toast('Lance d’abord un master dans Auto-réalisation.');};
  $('exportLocal').onclick=()=>exportPreview().catch(e=>setStatus('exportStatus',e.message,true));
  $('generate').onclick=()=>generateAgnesMobile().catch(e=>setStatus('aiStatus',e.message,true));
  $('checkJob').onclick=()=>pollActiveAgnes().catch(e=>setStatus('aiStatus',e.message,true));
  $('addAgnesKeys').onclick=addAgnesKeys;
  $('clearAgnesKeys').onclick=()=>{mobile.keys.length=0;mobile.job=null;$('agnesKeyCount').textContent='Aucune clé en mémoire.';toast('Clés effacées de cet onglet.');};
}
async function initialize(){bind();updatePreviewStyle();renderLibrary();refreshVfxSources();updateStage();
  if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  const result=await connect();if(!result.authorized&&!mobile.mode)$('settingsDialog').showModal();
}
initialize();
