/* META-STUDIO PRO V5 — core, no secrets on disk */
export const $ = id => document.getElementById(id);
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
export const state = { results: [], busy: false, controller: null, onResult: null };
export const CONFIG = {
  endpoint: 'https://apihub.agnes-ai.com',
  text: 'agnes-2.5-flash',
  image: 'agnes-image-2.5-flash',
  video: 'agnes-video-2.5-flash',
  videoPro: 'agnes-video-2.5',
  fps: 24
};
const keys = [];
let keyIndex = 0;
const cap = n => Math.max(0, Math.min(100, n));
export function log(message, level='info') {
  const target = $('journal');
  const t = new Date().toLocaleTimeString('fr-FR');
  const e = document.createElement('div');
  e.textContent = '[' + t + '] ' + (level === 'error' ? 'ERREUR · ' : '') + String(message);
  if (level === 'error') e.style.color = '#ff8e83';
  if (level === 'success') e.style.color = '#81dbaa';
  target.appendChild(e);
  while (target.children.length > 150) target.removeChild(target.firstChild);
  target.scrollTop = target.scrollHeight;
}
export function status(message, type='') {
  const el = $('global-status');
  el.textContent = message || 'Prêt';
  el.className = 'status-line ' + type;
}
export function notify(message, type='') { status(message, type); log(message, type); }
function sleep(ms, signal) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted) return reject(new DOMException('Annulé','AbortError'));
    const timer = setTimeout(()=>{cleanup();resolve();},ms);
    const cancel=()=>{clearTimeout(timer);cleanup();reject(new DOMException('Annulé','AbortError'));};
    const cleanup=()=>signal?.removeEventListener('abort',cancel);
    signal?.addEventListener('abort',cancel,{once:true});
  });
}
function safeUrl(raw,kind='media') {
  if(typeof raw!=='string' || !raw) throw new Error('Adresse de média absente.');
  if(kind==='image' && /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(raw)) return raw;
  const url = new URL(raw,location.href);
  if(['https:','blob:'].includes(url.protocol) || (url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))) return url.href;
  throw new Error('URL média non autorisée.');
}
export function addResult({type,url,prompt,origin='Agnes',duration=5,mime=''}) {
  url=safeUrl(url,type);
  const item={id:uid(),type,url,prompt:String(prompt||'Sans titre'),origin,duration,mime,createdAt:new Date().toISOString()};
  state.results.push(item);
  const empty=$('results-empty'); empty.classList.add('hidden');
  const card=document.createElement('article');card.className='result';
  const media=document.createElement(type==='video'?'video':'img');
  media.className='thumb';media.src=url;
  if(type==='video'){media.controls=true;media.preload='metadata';media.playsInline=true;media.addEventListener('loadedmetadata',()=>{
    if(Number.isFinite(media.duration)&&media.duration>0)item.duration=media.duration;
  });}else{media.alt=item.prompt;}
  const meta=document.createElement('div');meta.className='meta';
  const title=document.createElement('strong');title.textContent=(type==='video'?'VIDÉO':'IMAGE')+' · '+origin;
  const description=document.createElement('p');description.textContent=item.prompt;
  const actions=document.createElement('div');actions.className='actions';
  const add=document.createElement('button');add.className='btn small green';add.textContent='+ Timeline';
  add.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('studio:add-clip',{detail:item})));
  const open=document.createElement('a');open.className='btn small';open.textContent='Ouvrir';open.href=url;open.target='_blank';open.rel='noopener noreferrer';
  actions.append(add,open);meta.append(title,description,actions);card.append(media,meta);
  $('results-grid').prepend(card);$('results-count').textContent=state.results.length;
  document.dispatchEvent(new CustomEvent('studio:result',{detail:item}));
  return item;
}
function showKeys(){
  $('key-count').textContent=keys.length+' clé(s) en mémoire';
  $('key-pills').replaceChildren();
  keys.forEach((k,i)=>{
    const n=document.createElement('span');n.className='key-chip '+(k.dead?'':k.coolUntil>Date.now()?'cool':'ready');
    n.textContent='#'+(i+1)+' …'+k.value.slice(-4)+(k.dead?' · invalide':k.coolUntil>Date.now()?' · pause':' · prête');
    $('key-pills').append(n);
  });
}
function readRetryAfter(header) {
  if(!header)return 30;
  const n=Number(header);if(Number.isFinite(n))return Math.max(1,Math.min(300,n));
  const sec=(Date.parse(header)-Date.now())/1000;
  return Number.isFinite(sec)?Math.max(1,Math.min(300,sec)):30;
}
async function getKey(signal) {
  if(!keys.length)throw new Error('Ajoutez une clé API dans Connexion.');
  while(true){
    if(signal?.aborted)throw new DOMException('Annulé','AbortError');
    const now=Date.now();
    for(let step=0;step<keys.length;step++){
      const index=(keyIndex+step)%keys.length;
      const k=keys[index];
      if(!k.dead&&k.coolUntil<=now){keyIndex=(index+1)%keys.length;return k;}
    }
    const available=keys.filter(k=>!k.dead);
    if(!available.length)throw new Error('Toutes les clés ont été refusées. Vérifiez-les.');
    const ms=Math.min(...available.map(k=>k.coolUntil-now));
    status('Limite API : attente demandée par le serveur ('+Math.ceil(ms/1000)+' s)');
    await sleep(Math.max(150,ms),signal);
  }
}

function providerError(response,data,isVideo){
  const raw=data?.error;
  const detail=String(typeof raw==='string'?raw:raw?.message||data?.message||'').slice(0,260);
  const code=String(raw?.code||data?.code||'').slice(0,65);
  const requestId=String(data?.request_id||data?.requestId||raw?.request_id||
    detail.match(/request[\s_-]*id\s*:?\s*([a-zA-Z0-9_-]+)/i)?.[1]||'').slice(0,90);
  const unavailable=/temporarily unavailable|model_not_found|model unavailable|discontinued/i.test(detail+' '+code);
  const full=/queue.full|queue_full|queue is full/i.test(detail+' '+code);
  let message;
  if(isVideo&&full)message='File vidéo Agnes saturée. Aucune tâche acceptée ; réessayez plus tard sans multiplier les demandes.';
  else if(isVideo&&unavailable)message='Modèle vidéo Agnes indisponible. La requête n’a pas produit de vidéo ; vérifiez le modèle ou réessayez plus tard.';
  else if(response.status===429)message='Limite de requêtes Agnes atteinte (HTTP 429). Attendez avant une nouvelle génération.';
  else if(isVideo&&[500,502,503,504,520].includes(response.status))
    message='Le serveur vidéo Agnes est momentanément indisponible (HTTP '+response.status+'). Votre image reste dans la médiathèque. Réessayez plus tard.';
  else if(response.status===401||response.status===403)message='Agnes refuse la clé ou l’accès au modèle (HTTP '+response.status+').';
  else message='Agnes HTTP '+response.status+(detail?' : '+detail:'');
  const e=new Error(message+(requestId?' · Référence support : '+requestId:''));
  e.httpStatus=response.status;e.providerCode=code;e.requestId=requestId;
  return e;
}
async function imageReference(url,signal){
  if(/^https:/i.test(url))return url; // Public HTTPS image: provider fetches this URL
  if(!/^blob:/i.test(url)&&!/^data:image\//i.test(url))
    throw new Error('Image source non prise en charge ; importez une image locale.');
  if(/^data:image\//i.test(url))return url;
  const res=await fetch(url,{signal});
  if(!res.ok)throw new Error('Image source locale inaccessible.');
  const blob=await res.blob();
  if(!blob.type.startsWith('image/'))throw new Error('Le fichier sélectionné n’est pas une image.');
  if(blob.size>4500000)throw new Error('Image locale trop volumineuse (max. 4,5 Mo) ; réduisez-la avant génération.');
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    const abort=()=>reader.abort();
    signal?.addEventListener('abort',abort,{once:true});
    reader.onload=()=>{signal?.removeEventListener('abort',abort);resolve(reader.result);};
    reader.onerror=()=>{signal?.removeEventListener('abort',abort);reject(new Error('Lecture image impossible.'));};
    reader.onabort=()=>{signal?.removeEventListener('abort',abort);reject(new DOMException('Annulé','AbortError'));};
    reader.readAsDataURL(blob);
  });
}
function updateVideoSources(){
  const select=$('video-source');
  if(!select)return;
  const previous=select.value;
  select.replaceChildren(new Option('Texte uniquement (sans image de départ)',''));
  for(const r of state.results.filter(r=>r.type==='image')){
    select.add(new Option('Animer : '+String(r.prompt).slice(0,46),r.id));
  }
  if([...select.options].some(o=>o.value===previous))select.value=previous;
}

async function request(path,{method='GET',body,signal,maxAttempts}={}){
  // POST video creation is not idempotent. Do not auto-retry paid generation requests.
  const isVideo=path==='/v1/videos';
  const attempts=maxAttempts??(method==='GET'?4:1);
  for(let attempt=0;attempt<attempts;attempt++){
    const key=await getKey(signal);
    let response;
    try{
      response=await fetch(CONFIG.endpoint+path,{
        method,signal,headers:{Authorization:'Bearer '+key.value, ...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{})
      });
    }catch(err){
      if(err.name==='AbortError')throw err;
      if(attempt===attempts-1)throw new Error('Réseau indisponible, CORS bloqué ou réponse perdue. Vérifiez les tâches dans Agnes avant une nouvelle génération. '+err.message);
      await sleep(800*(attempt+1),signal);continue;
    }
    if(response.status===429){
      const delay=readRetryAfter(response.headers.get('Retry-After'));
      key.coolUntil=Date.now()+delay*1000;
      showKeys();log('Limite 429 : pause '+delay+' s.');
      if(method!=='GET'||attempt===attempts-1)
        throw new Error('Limite Agnes HTTP 429 : réessayez dans environ '+delay+' s.');
      continue;
    }
    if([401,403].includes(response.status)){
      key.dead=true;showKeys();
      if(keys.some(k=>!k.dead))continue;
      throw new Error('Authentification refusée par Agnes ('+response.status+').');
    }
    if([500,502,503,504,520].includes(response.status) && method==='GET' && attempt<attempts-1){
      status('Agnes indisponible : reprise de la consultation '+(attempt+2)+'/'+attempts+'…');
      await sleep(Math.min(12000,1200*Math.pow(2,attempt)),signal);continue;
    }
    if(!response.ok){
      const data=await response.json().catch(()=>null);
      throw providerError(response,data,isVideo);
    }
    const data=await response.json().catch(()=>{throw new Error('Réponse API invalide (JSON).');});
    return data;
  }
  throw new Error('Échec après tentatives de consultation. Aucune relance de génération automatique.');
}
function videoId(data){
  const id=data.video_id||data.id||data.task_id;
  if(!id)throw new Error('Agnes ne fournit pas de video_id.');
  return id;
}
async function pollVideo(id,model,signal){
  for(let attempt=0;attempt<90;attempt++){
    await sleep(Math.min(8000+attempt*900,20000),signal);
    const params=new URLSearchParams({video_id:id,model_name:model});
    const data=await request('/agnesapi?'+params.toString(),{signal});
    const state=String(data.status||'unknown').toLowerCase();
    const percent=Number(data.progress);
    status('Vidéo : '+(Number.isFinite(percent)?cap(percent)+'% · ':'')+state+'…');
    if(['completed','succeeded','done'].includes(state)){
      const url=data.metadata?.url||data.output?.url||data.url||data.data?.url;
      return safeUrl(url,'video');
    }
    if(['failed','cancelled','canceled','error'].includes(state))
      throw new Error('La génération a échoué : '+String(data.error?.message||data.error||state).slice(0,180));
  }
  throw new Error('Délai de génération dépassé. Consultez l’historique dans Agnes.');
}
export async function generate(){
  if(state.busy)return;
  const mode=$('generation-mode').value;
  const prompt=$('prompt').value.trim();
  if(!prompt)return notify('Saisissez un prompt.','error');
  if(!keys.length)return notify('Ajoutez au moins une clé Agnes.','error');
  const controller=new AbortController();state.controller=controller;state.busy=true;
  $('generate-btn').disabled=true;$('stop-btn').disabled=false;
  const ratio=$('aspect').value;
  const dims={'16:9':[1024,576],'9:16':[576,1024],'1:1':[1024,1024]}[ratio]||[1024,576];
  const seconds=Number($('frames').value)||5;
  const advice=$('provider-advice');
  advice?.classList.add('hidden');
  try{
    if(mode==='image'){
      status('Image Agnes : génération en cours…');
      const res=await request('/v1/images/generations',{method:'POST',signal:controller.signal,body:{
        model:CONFIG.image,prompt:prompt.slice(0,2000),n:1,size:'1K',ratio}});
      const first=res.data?.[0];
      if(!first)throw new Error('Aucune image dans la réponse.');
      addResult({type:'image',url:first.url||(first.b64_json?'data:image/png;base64,'+first.b64_json:''),prompt});
      notify('Image ajoutée à la médiathèque.','success');
    }else if(mode==='video'){
      const model=$('video-model').value;
      if(![CONFIG.video,CONFIG.videoPro].includes(model))throw new Error('Modèle vidéo non autorisé.');
      if(model===CONFIG.videoPro&&!$('video-paid-confirm').checked)
        throw new Error('Confirmez explicitement la facturation potentielle avant d’utiliser Agnes Video 2.5.');
      const body={model,prompt:prompt.slice(0,2000),mode:'text',seconds:String(seconds),
        size:'720P',aspect_ratio:ratio,n:1};
      const sourceId=$('video-source').value;
      if(sourceId){
        const source=state.results.find(r=>r.id===sourceId&&r.type==='image');
        if(!source)throw new Error('Image de départ absente de la médiathèque.');
        status('Préparation de l’image de départ…');
        body.mode='keyframe';body.first_frame=await imageReference(source.url,controller.signal);
      }
      status('Vidéo Agnes 2.5 : envoi d’une tâche'+(sourceId?' à partir d’une image':'')+'…');
      const res=await request('/v1/videos',{method:'POST',signal:controller.signal,body});
      const id=videoId(res);log('Tâche vidéo acceptée · modèle '+model+' · id '+String(id).slice(0,40));
      const url=await pollVideo(id,model,controller.signal);
      addResult({type:'video',url,prompt,duration:seconds,mime:'video/mp4'});
      notify('Vidéo disponible dans la médiathèque.','success');
    }else{
      status('Agnes : réponse texte…');
      const res=await request('/v1/chat/completions',{method:'POST',signal:controller.signal,body:{
        model:CONFIG.text,messages:[{role:'system',content:'Tu es un collaborateur de production cinéma. Réponds avec précision en français.'},{role:'user',content:prompt}],temperature:.65,max_tokens:1600
      }});
      const answer=String(res.choices?.[0]?.message?.content||'Réponse vide.');
      $('chat-answer').textContent=answer;$('chat-answer-box').classList.remove('hidden');
      notify('Réponse texte reçue.','success');
    }
  }catch(err){
    if(err.name==='AbortError')notify('Opération interrompue localement. Une tâche déjà acceptée peut continuer côté Agnes.','error');
    else{
      notify(err.message,'error');
      if(mode==='video'&&advice){
        advice.classList.remove('hidden');
        advice.textContent='Vidéo non disponible. Le prompt et les images importées sont conservés. Vérifiez la file Agnes, puis relancez manuellement seulement si aucune tâche n’a été acceptée.';
      }
    }
  }finally{
    state.busy=false;state.controller=null;$('generate-btn').disabled=false;$('stop-btn').disabled=true;
  }
}
function prepare(){
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    const name=button.dataset.view;
    document.querySelectorAll('[data-view]').forEach(n=>n.setAttribute('aria-selected',String(n===button)));
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+name));
    location.hash=name;
    if(window.matchMedia('(max-width:1000px)').matches)
      button.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});
  }));
  const initial=location.hash.replace('#','');
  if(initial && document.querySelector('[data-view="'+initial+'"]'))document.querySelector('[data-view="'+initial+'"]').click();
  $('save-keys').addEventListener('click',()=>{
    const incoming=$('api-keys').value.split(/\r?\n/).map(k=>k.trim()).filter(Boolean);
    let added=0;
    for(const key of incoming){
      if(key.length<12){log('Une clé trop courte a été ignorée.','error');continue;}
      if(!keys.some(k=>k.value===key)){keys.push({value:key,coolUntil:0,dead:false});added++;}
    }
    $('api-keys').value='';showKeys();
    notify(added+' clé(s) ajoutée(s) uniquement à la mémoire de cet onglet.','success');
  });
  $('clear-keys').addEventListener('click',()=>{keys.length=0;showKeys();notify('Clés supprimées de la mémoire de la page.','success');});
  $('generate-btn').addEventListener('click',generate);
  $('stop-btn').addEventListener('click',()=>state.controller?.abort());
  $('generation-mode').addEventListener('change',()=>{
    const mode=$('generation-mode').value;
    $('video-controls').classList.toggle('hidden',mode!=='video');
    $('chat-answer-box').classList.add('hidden');
  });
  document.addEventListener('studio:result',updateVideoSources);
  updateVideoSources();
  $('video-model').addEventListener('change',()=>{
    $('video-paid-label').classList.toggle('hidden',$('video-model').value!==CONFIG.videoPro);
    $('video-paid-confirm').checked=false;
  });
  $('import-media').addEventListener('change',async e=>{
    for(const file of e.target.files){
      if(file.type.startsWith('image/')){
        addResult({type:'image',url:URL.createObjectURL(file),prompt:file.name,origin:'Fichier local',mime:file.type});
      }else if(file.type.startsWith('video/')){
        addResult({type:'video',url:URL.createObjectURL(file),prompt:file.name,origin:'Fichier local',duration:5,mime:file.type});
      }
    }
    e.target.value='';
  });
  const feature=[
    ['WebGPU',!!navigator.gpu],
    ['WebCodecs',typeof VideoEncoder!=='undefined'],
    ['MediaRecorder',typeof MediaRecorder!=='undefined'],
    ['Audio API',typeof AudioContext!=='undefined']
  ];
  const caps=$('caps');caps.replaceChildren();
  feature.forEach(([name,ok])=>{
    const b=document.createElement('span');b.className='pill'+(ok?' ready':'');
    const dot=document.createElement('i');dot.className='light';b.append(dot,document.createTextNode(name));
    caps.append(b);
  });
  showKeys();status('Prêt — importez des rushes ou configurez Agnes.','ok');log('META-STUDIO PRO V5.2 initialisé. Aucune clé conservée sur disque.','success');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prepare);
else prepare();
