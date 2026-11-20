import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new DOMException('Annulé','AbortError'));
  const t=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},ms);
  const stop=()=>{clearTimeout(t);reject(new DOMException('Annulé','AbortError'));};
  signal?.addEventListener('abort',stop,{once:true});
});
function endpoint(){
  const u=new URL(process.env.COMFY_URL||'http://127.0.0.1:8188');
  if(!['http:','https:'].includes(u.protocol))throw Error('Protocole ComfyUI invalide');
  if(!['localhost','127.0.0.1','::1','[::1]'].includes(u.hostname)&&process.env.COMFY_ALLOW_REMOTE!=='true')
    throw Error('ComfyUI distant interdit par défaut. Configure COMFY_ALLOW_REMOTE=true après sécurisation.');
  return u.origin;
}
function replaceValues(node,vars){
  if(Array.isArray(node))return node.map(n=>replaceValues(n,vars));
  if(node&&typeof node==='object')return Object.fromEntries(Object.entries(node).map(([k,v])=>[k,replaceValues(v,vars)]));
  if(typeof node==='string'){
    if(/^\{\{[A-Z_]+\}\}$/.test(node)){const k=node.slice(2,-2);if(k in vars)return vars[k];}
    return node.replace(/\{\{([A-Z_]+)\}\}/g,(_,k)=>String(vars[k]??''));
  }
  return node;
}
export function renderWorkflow(template,shot,{aspect,mode,inputFile=null}={}){
  const portrait=aspect==='9:16',square=aspect==='1:1';
  const vars={PROMPT:shot.prompt,NEGATIVE:'watermark, text, broken anatomy, incoherent face, flashing frames, compression artifacts',SEED:shot.seed,
    WIDTH:portrait?576:square?768:1024,HEIGHT:portrait?1024:square?768:576,
    FRAMES:Math.round(shot.duration*24)+1,FPS:24,DURATION:shot.duration,INPUT_FILE:inputFile||'',SOURCE_VIDEO:inputFile||'',SOURCE_IMAGE:inputFile||'',CHECKPOINT:process.env.COMFY_CHECKPOINT||'v1-5-pruned-emaonly.safetensors'};
  const workflow=replaceValues(template,vars);
  if(!workflow || typeof workflow !== 'object'||Array.isArray(workflow))throw new Error('Workflow ComfyUI invalide');
  if(!Object.values(workflow).some(x=>x&&typeof x==='object'&&x.class_type))
    throw Error('Le fichier doit être un workflow ComfyUI au format API (Export API).');
  return workflow;
}
async function fetchComfy(resource,options={}){
  const controller=AbortSignal.timeout(120000);
  const signal=options.signal?AbortSignal.any([options.signal,controller]):controller;
  const res=await fetch(endpoint()+resource,{...options,signal,headers:{...(options.body&&!(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...options.headers}});
  if(!res.ok)throw Error('ComfyUI HTTP '+res.status+' : '+String(await res.text()).slice(0,300));
  return res;
}
export async function comfyStatus(){
  if(!process.env.COMFY_URL)return {available:false,detail:'COMFY_URL non configuré'};
  try{const r=await fetchComfy('/system_stats',{signal:AbortSignal.timeout(3500)});return {available:r.ok};}
  catch(e){return {available:false,detail:e.message};}
}
export async function generateComfy({mode,shot,aspect,output,signal,onProgress,workflowRoot,sourceFile=null}){
  const vfx=mode.startsWith('vfx-');
  const effect=mode.slice(4);
  if(vfx&&!/^[a-z-]{2,30}$/.test(effect))throw Error('Nom de workflow VFX invalide.');
  const file=vfx?path.join(workflowRoot,'vfx',effect+'.json'):
    path.join(workflowRoot,mode==='comfy-video'?'video.json':'image.json');
  let raw;
  try{raw=JSON.parse(await readFile(file,'utf8'));}
  catch{throw new Error('Workflow ComfyUI manquant : '+file+'. Exportez un workflow API compatible avec votre modèle.');}
  let inputFile=null;
  if(vfx){
    if(!sourceFile)throw Error('Aucun rush vidéo source fourni.');
    const serialized=JSON.stringify(raw);
    if(!serialized.includes('{{INPUT_FILE}}')&&!serialized.includes('{{SOURCE_VIDEO}}'))
      throw Error('Workflow VFX incompatible : utilisez {{INPUT_FILE}} ou {{SOURCE_VIDEO}} dans le nœud LoadVideo.');
    const ext=path.extname(sourceFile).toLowerCase();
    if(!['.mp4','.mov','.webm'].includes(ext))throw Error('Format source vidéo non pris en charge par ComfyUI.');
    const bytes=await readFile(sourceFile);
    if(bytes.length>250_000_000)throw Error('Rush VFX trop volumineux pour le transfert (250 Mo).');
    const form=new FormData();
    form.append('image',new Blob([bytes],{type:ext==='.webm'?'video/webm':ext==='.mov'?'video/quicktime':'video/mp4'}),'niko-vfx-'+randomUUID()+ext);
    form.append('type','input');form.append('overwrite','false');
    const uploaded=await (await fetchComfy('/upload/image',{method:'POST',body:form,signal})).json();
    inputFile=String(uploaded.subfolder?uploaded.subfolder+'/':'')+String(uploaded.name||'');
    if(!uploaded.name||!inputFile.endsWith(ext))throw Error('ComfyUI n’a pas confirmé le transfert du rush.');
  }
  const prompt=renderWorkflow(raw,shot,{aspect,mode,inputFile});
  const response=await fetchComfy('/prompt',{method:'POST',body:JSON.stringify({prompt,client_id:'studio-niko-'+shot.id}),signal});
  const submitted=await response.json();
  if(!submitted.prompt_id)throw new Error('ComfyUI a refusé le workflow : '+JSON.stringify(submitted.node_errors||submitted.error||{}).slice(0,420));
  const id=submitted.prompt_id;
  onProgress?.('File ComfyUI : '+id.slice(0,8));
  let outputs;
  for(let t=0;t<360;t++){
    if(signal?.aborted)throw new DOMException('Annulé','AbortError');
    await sleep(3000,signal);
    const res=await fetchComfy('/history/'+encodeURIComponent(id),{signal});
    const data=await res.json();
    const item=data[id];
    if(item?.status?.status_str==='error')throw new Error('ComfyUI a échoué : '+JSON.stringify(item.status.messages||[]).slice(-450));
    if(item?.outputs){outputs=item.outputs;break;}
    if(t%5===0)onProgress?.('Génération en cours sur GPU : '+Math.round(t*3/60)+' min');
  }
  if(!outputs)throw Error('Délai ComfyUI dépassé (18 minutes) : vérifiez son historique.');
  const files=Object.values(outputs).flatMap(n=>[...(n.images||[]),...(n.gifs||[]),...(n.videos||[])]);
  const item=(vfx||mode==='comfy-video'?files.find(f=>typeof f.filename==='string'&&/\.(mp4|webm|mov)$/i.test(f.filename)):null)||files.find(f=>typeof f.filename==='string');
  if(!item)throw Error('Workflow terminé sans image/vidéo exportée. Ajoutez SaveImage ou un nœud de sortie vidéo.');
  const type=String(item.type||'output');
  if(!['output','temp'].includes(type))throw Error('Type de sortie non autorisé.');
  const qp=new URLSearchParams({filename:item.filename,subfolder:item.subfolder||'',type});
  const resp=await fetchComfy('/view?'+qp.toString(),{signal});
  const bytes=Buffer.from(await resp.arrayBuffer());
  if(bytes.length<256 || bytes.length>450_000_000)throw Error('Résultat ComfyUI vide ou trop volumineux.');
  const ext=path.extname(item.filename).toLowerCase();
  if(!['.png','.jpg','.jpeg','.webp','.mp4','.webm','.mov'].includes(ext))throw Error('Format ComfyUI non pris en charge : '+ext);
  const outputFile=output+ext;
  await writeFile(outputFile,bytes);
  const kind=['.mp4','.webm','.mov'].includes(ext)?'video':'image';
  if((mode==='comfy-video'||vfx)&&kind!=='video')throw Error('Le workflow vidéo a retourné une image statique, pas une séquence vidéo.');
  return {file:outputFile,kind,bytes:bytes.length,promptId:id};
}
