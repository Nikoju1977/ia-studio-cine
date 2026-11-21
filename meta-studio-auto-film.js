/* Studio Niko V6 — browser-resident, one-click filmmaking from idea to export.
 * Real generated footage only; no simulated clips. Free ZeroGPU quotas apply.
 * The pipeline needs an open foreground browser tab, not a background service.
 */
import {$,state,addResult,log,notify,status,generateCinemaShot} from './meta-studio-v5-core.js?v=6';

const BEATS=[
  {title:'OUVERTURE',frame:'An atmospheric wide establishing shot, deep spatial composition, a single clear focal point.',
   action:'Establish the world, the stakes, the visual geography. Motion begins at a measured pace.',
   camera:'slow aerial crane forward with precise parallax'},
  {title:'PRÉSENCE',frame:'A clean medium portrait or striking close detail that reveals the visual identity.',
   action:'Reveal a distinctive element that belongs to this story, without repeating the opening shot.',
   camera:'controlled lateral dolly with shallow-depth foreground'},
  {title:'DÉCLENCHEUR',frame:'An intimate over-the-shoulder or macro insert with a new axis of action.',
   action:'Reveal a consequential change or discovery in the scene, build tension through clear physical movement.',
   camera:'subtle arc around the focal point, smooth stabilized lens'},
  {title:'MOUVEMENT',frame:'Dynamic moving side-profile shot, layered near and far planes, strong silhouette.',
   action:'Show the central action actively advancing; introduce visual energy while preserving the scene geography.',
   camera:'smooth tracking shot with a deliberate camera move'},
  {title:'CLIMAX',frame:'Striking kinetic composition, dramatic but readable spatial blocking.',
   action:'Deliver the most intense visual transformation or moment in the narrative, with physically coherent movement.',
   camera:'low-angle push-in then gentle lift, no erratic camera shake'},
  {title:'RÉSOLUTION',frame:'A beautiful closing composition, visually different from the opening.',
   action:'Show the consequence of the action; give the scene a satisfying ending and cinematic breathing room.',
   camera:'elegant slow pull-back, coherent screen direction'}
];
const STYLES={
  animation:'Premium stylized 3D animated feature film, consistent character design, expressive natural eyes, polished animation, rich lighting, refined materials, art-directed visual continuity. NOT photorealism.',
  live:'High-end naturalistic feature film cinematography, physically plausible live action, cinematic 35mm lensing, real-world motion, controlled light, realistic faces.',
  scifi:'Prestige science-fiction cinema, monumental production design, volumetric light, physically consistent spatial effects, sophisticated compositing, ultra-detailed surfaces.',
  music:'Prestige electronic-music video, dramatic architecture, kinetic choreography, purposeful luminous particles, graphic contrast, elegant rhythmic camera movement.'
};
const DEFAULT_FRAMES=4;
let production=null;
const isAbort=e=>e?.name==='AbortError';
function qualityLabel(q){return q==='ltx23'?'LTX-2.3 22B':'LTX 13B';}
function planIndices(count){return count===3?[0,3,5]:count===4?[0,2,4,5]:[0,1,2,3,4,5];}
export function storyboard({idea,style='animation',shotCount=3,shotSeconds=4}){
  const brief=String(idea||'').trim();
  if(brief.length<12)throw new Error('Décris le film plus précisément (au moins 12 caractères).');
  const count=[3,4,6].includes(Number(shotCount))?Number(shotCount):3;
  const seconds=Math.min(8,Math.max(2,Number(shotSeconds)||DEFAULT_FRAMES));
  const aesthetic=STYLES[style]||STYLES.animation;
  const indices=planIndices(count);
  const identity='Preserve EXACTLY the same world, visual grammar, colors, setting, costume, character silhouette and recognizable face when applicable across the entire film. Single continuous story. No repeated shots, no extra characters, no abrupt teleportation or scene redesign.';
  return indices.map((id,index)=>{
    const beat=BEATS[id];
    return {index,title:beat.title,seconds,prompt:[
      'CINEMA SHOT '+(index+1)+' OF '+count+'.',
      'FILM BRIEF: '+brief.slice(0,610)+'.',
      'GLOBAL ART DIRECTION: '+aesthetic,
      'CONTINUITY BIBLE: '+identity,
      'COMPOSITION: '+beat.frame,
      'ACTING/ACTION: '+beat.action,
      'CAMERA: '+beat.camera+'. Smooth physically plausible movement, coherent eyelines, no cross-eyed faces.',
      'LIGHT AND COLOR: consistent cinematic grade, controlled highlights, dimensional volumetrics and readable details.',
      'FINISH: no titles, subtitles, watermarks or logos, no repeated frames, natural timing.'
    ].join(' ').slice(0,1880),phase:'pending',video:null,quality:null};
  });
}
function stepStatus(message,kind){
  const e=$('auto-state');
  if(e){e.textContent=message;e.dataset.state=kind||'idle';}
  status(message,kind==='error'?'error':kind==='done'?'ok':'');
  log(message,kind==='error'?'error':kind==='done'?'success':'info');
}
function makeBadge(statusName){
  return {'pending':'À générer','running':'GPU en cours','done':'Vidéo reçue','failed':'Échec'}[statusName]||statusName;
}
function updateUI(){
  if(!production)return;
  const {shots}=production;
  const table=$('auto-storyboard');
  if(!table)return;
  table.replaceChildren();
  for(const shot of shots){
    const row=document.createElement('div');
    row.className='auto-scene '+(shot.phase==='done'?'auto-scene-done':'');
    const header=document.createElement('div');header.className='auto-scene-head';
    const title=document.createElement('strong');title.textContent=String(shot.index+1).padStart(2,'0')+' / '+shot.title;
    const badge=document.createElement('span');badge.className='pill';badge.textContent=makeBadge(shot.phase);
    header.append(title,badge);
    const p=document.createElement('p');
    p.textContent=shot.seconds+' s · '+(shot.phase==='done'&&shot.quality?
      shot.quality.width+'×'+shot.quality.height+' · source IA inspectée':
      shot.prompt.slice(0,165)+(shot.prompt.length>165?'…':''));
    row.append(header,p);table.append(row);
  }
  const completed=shots.filter(s=>s.phase==='done').length;
  const bar=$('auto-progress');
  if(bar)bar.value=Math.round(100*completed/shots.length);
  const text=$('auto-count');
  if(text)text.textContent=completed+' / '+shots.length+' plans générés';
}
async function verifyVideo(url,signal) {
  // This checks decoded metadata, not artistic merit or full file integrity.
  return new Promise((resolve,reject)=>{
    const video=document.createElement('video');
    let completed=false;
    const timeout=setTimeout(()=>finish(new Error('Le fichier retourné par le modèle ne peut pas être ouvert par ce navigateur.')),25000);
    const onAbort=()=>finish(new DOMException('Arrêt demandé','AbortError'));
    function finish(error,meta) {
      if(completed)return;completed=true;
      clearTimeout(timeout);signal?.removeEventListener('abort',onAbort);
      video.onloadedmetadata=null;video.onerror=null;video.removeAttribute('src');video.load();
      error?reject(error):resolve(meta);
    }
    signal?.addEventListener('abort',onAbort,{once:true});
    video.preload='metadata';video.playsInline=true;
    video.onloadedmetadata=()=>{
      if(!(video.videoWidth>0&&video.videoHeight>0&&video.duration>.2))
        return finish(new Error('La réponse ne contient pas de vidéo décodable valide.'));
      finish(null,{width:video.videoWidth,height:video.videoHeight,
        duration:video.duration});
    };
    video.onerror=()=>finish(new Error('Le fichier MP4 de LTX est inaccessible, expiré ou non décodable.'));
    video.src=url;video.load();
  });
}
async function extractLastFrame(url, duration, signal){
  // The preceding video must already be copied to a same-origin blob URL.
  return new Promise((resolve,reject)=>{
    const v=document.createElement('video');
    let finished=false;
    const timer=setTimeout(()=>done(new Error('Impossible d’extraire la dernière image.')),14000);
    const abort=()=>done(new DOMException('Annulé','AbortError'));
    const done=(error,result)=>{
      if(finished)return;finished=true;clearTimeout(timer);
      signal?.removeEventListener('abort',abort);
      v.onloadedmetadata=null;v.onseeked=null;v.onerror=null;
      v.removeAttribute('src');v.load();
      error?reject(error):resolve(result);
    };
    signal?.addEventListener('abort',abort,{once:true});
    v.muted=true;v.playsInline=true;v.preload='auto';
    v.onloadedmetadata=()=>{
      try{v.currentTime=Math.max(.04,Math.min((v.duration||duration)-.15,duration-.15));}
      catch(e){done(e);}
    };
    v.onseeked=()=>{
      try{
        const w=Math.min(1024,v.videoWidth||1024);
        const h=Math.max(32,Math.round(w*(v.videoHeight||576)/(v.videoWidth||1024)));
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d',{alpha:false});
        ctx.drawImage(v,0,0,w,h);
        canvas.toBlob(blob=>{
          if(!blob||!blob.size)return done(new Error('Image extraite vide.'));
          done(null,URL.createObjectURL(blob));
        },'image/jpeg',.91);
      }catch(error){done(error);}
    };
    v.onerror=()=>done(new Error('La dernière image n’est pas décodable.'));
    v.src=url;v.load();
  });
}
async function localCopyOrOriginal(url,signal){
  // Blob URL prevents cross-origin canvas tainting on finished film render.
  // If CORS forbids copying, retain genuine URL for preview, but warn on export.
  try{
    const res=await fetch(url,{mode:'cors',credentials:'omit',signal});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const bytes=await res.blob();
    if(bytes.size<2048||bytes.size>150000000)throw new Error('taille du MP4 atypique');
    if(!/^video\//.test(bytes.type)&&bytes.type!=='application/octet-stream')
      throw new Error('type MIME inattendu');
    return {url:URL.createObjectURL(bytes),downloadable:true};
  }catch(e){
    if(isAbort(e))throw e;
    log('Copie locale du clip bloquée (CORS/stockage). Montage automatique non garanti pour '+url.slice(0,75),'error');
    return {url,downloadable:false};
  }
}
async function renderProject(){
  return new Promise((resolve,reject)=>{
    let delivered=false;
    const timer=setTimeout(()=>{
      if(!delivered){delivered=true;reject(new Error('Le moteur d’export n’a pas répondu.'));}},960000);
    document.dispatchEvent(new CustomEvent('studio:request-auto-export',{detail:{
      resolve:()=>{if(delivered)return;delivered=true;clearTimeout(timer);resolve();},
      reject:e=>{if(delivered)return;delivered=true;clearTimeout(timer);reject(e);}
    }}));
  });
}
function cleanControls(busy){
  $('auto-create').disabled=busy;
  $('auto-cancel').disabled=!busy;
  $('auto-resume').disabled=busy||!production||!production.shots.some(s=>s.phase!=='done');
  $('generate-btn').disabled=busy;
  $('stop-btn').disabled=!busy;
}
async function execute() {
  if(!production||state.busy)return;
  const controller=new AbortController();
  const signal=controller.signal;
  state.busy=true;state.controller=controller;
  cleanControls(true);
  const {shots,engine,ratio,quality}=production;
  let previousFrame=production.lastFrame||production.initialSource||null;
  try {
    for(const shot of shots) {
      if(shot.phase==='done')continue;
      if(signal.aborted)throw new DOMException('Interrompu','AbortError');
      shot.phase='running';updateUI();
      stepStatus('Plan '+(shot.index+1)+'/'+shots.length+' · '+shot.title+' · '+qualityLabel(engine));
      const result=await generateCinemaShot({
        prompt:shot.prompt,engine,ratio,seconds:shot.seconds,quality,signal,
        sourceUrl:$('auto-chain').checked?previousFrame:production.initialSource,
        onProgress:msg=>{
          $('auto-state').textContent='Plan '+(shot.index+1)+'/'+shots.length+' · '+msg;
          status(msg);
        }
      });
      const qualityCheck=await verifyVideo(result.url,signal);
      const media=await localCopyOrOriginal(result.url,signal);
      const item=addResult({type:'video',url:media.url,prompt:shot.title+' — '+production.idea,
        origin:result.origin,duration:qualityCheck.duration,mime:'video/mp4'});
      document.dispatchEvent(new CustomEvent('studio:add-clip',{detail:item}));
      shot.phase='done';shot.video=item.id;shot.quality=qualityCheck;
      shot.downloadable=media.downloadable;
      if($('auto-chain').checked && media.downloadable){
        try {
          const next=await extractLastFrame(media.url,qualityCheck.duration,signal);
          if(production.lastFrame?.startsWith('blob:'))URL.revokeObjectURL(production.lastFrame);
          production.lastFrame=next;previousFrame=next;
          log('Continuité : dernière image du plan '+(shot.index+1)+' récupérée.','success');
        }catch(e){
          if(isAbort(e))throw e;
          previousFrame=production.initialSource||null;
          log('Continuité visuelle partielle : '+e.message,'error');
        }
      }
      updateUI();
      log('Plan '+(shot.index+1)+' reçu : '+qualityCheck.width+'×'+qualityCheck.height+
        ' · '+qualityCheck.duration.toFixed(1)+' s', 'success');
    }
    if(shots.some(s=>!s.downloadable))
      throw new Error('Toutes les vidéos IA ont été reçues, mais certaines empêchent le master automatique (CORS). Télécharge les MP4 séparément ou importe-les localement avant l’export.');
    if($('auto-export').checked){
      stepStatus('Tous les plans IA sont reçus · assemblage et encodage du master…');
      await renderProject();
      stepStatus('Master du film créé et téléchargement déclenché. Vérifie le fichier enregistré.','done');
    }else stepStatus('Plans IA générés et montés sur la timeline. Export manuel disponible.','done');
  }catch(e){
    const uncertain=shots.find(s=>s.phase==='running');
    if(uncertain)uncertain.phase='failed';
    updateUI();
    const description=isAbort(e)?
      'Processus interrompu. Les plans déjà reçus sont conservés ; une tâche GPU acceptée peut encore continuer.':
      'Production interrompue : '+e.message;
    stepStatus(description,'error');
  }finally{
    state.busy=false;state.controller=null;cleanControls(false);
  }
}
function prepare(){
  const btn=$('auto-create');if(!btn)return;
  btn.addEventListener('click',async()=>{
    if(state.busy)return;
    try{
      const idea=$('auto-brief').value.trim()||$('prompt').value.trim();
      const engine=$('auto-engine').value;
      if(!['ltx23','huggingface'].includes(engine))throw new Error('Seuls les GPU gratuits sont autorisés en réalisation automatique.');
      const shots=storyboard({idea,style:$('auto-style').value,shotCount:Number($('auto-shots').value),shotSeconds:Number($('auto-shot-seconds').value)});
      if(production?.lastFrame?.startsWith('blob:'))URL.revokeObjectURL(production.lastFrame);
      const selected=$('video-source').value;
      const source=state.results.find(r=>r.id===selected && r.type==='image');
      production={idea,shots,engine,ratio:$('aspect').value,quality:$('auto-quality').value,
        initialSource:source?.url||null,lastFrame:null};
      $('auto-resume').disabled=true;updateUI();
      stepStatus('Storyboard professionnel calculé : '+shots.length+' plans, '+shots.length*shots[0].seconds+' secondes environ. Lancement GPU…');
      await execute();
    }catch(e){notify(e.message,'error');}
  });
  $('auto-cancel').addEventListener('click',()=>state.controller?.abort());
  $('auto-resume').addEventListener('click',async()=>{
    if(!production||state.busy)return;
    if(production.shots.some(s=>s.phase==='failed')){
      const ok=window.confirm('Une génération antérieure a échoué. Relancer les plans manquants peut consommer le quota GPU gratuit. Continuer ?');
      if(!ok)return;
    }
    await execute();
  });
  const hint=()=> {
    const n=Number($('auto-shots').value),seconds=Number($('auto-shot-seconds').value);
    $('auto-estimate').textContent=n+' plans × '+seconds+' s = '+(n*seconds)+
      ' s de vidéo prévue. Le quota GPU gratuit quotidien peut interrompre le film ; aucun paiement automatique.';
  };
  $('auto-shots').addEventListener('change',hint);
  $('auto-shot-seconds').addEventListener('change',hint);
  hint();cleanControls(false);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prepare);
else prepare();
