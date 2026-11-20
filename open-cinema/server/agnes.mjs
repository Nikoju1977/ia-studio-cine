/** Agnes AI optional gateway. Keys stay only in this server process; no storage, no key logging.
 * Multiple keys of the SAME TYPE share provider quotas. No rotation to bypass HTTP 429.
 * No paid model, no automatic POST retry. ComfyUI remains the zero-subscription default.
 */
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isIP} from 'node:net';

const ROOT='https://apihub.agnes-ai.com';
const MAX_RESULT=250*1024*1024;
const MAX_KEYS=16;
const keyRecord=(secret,source)=>({secret,source,invalid:false,lastError:null});
const validateKey = v=>typeof v==='string'&&v.trim().length>=12&&v.trim().length<=512&&!/[\r\n\0\s]/.test(v.trim());
const fromEnv=(process.env.AGNES_API_KEYS||'').split(/[;,\r\n]+/).map(x=>x.trim()).filter(Boolean);
const configured=fromEnv.filter(validateKey).slice(0,MAX_KEYS).map(k=>keyRecord(k,'environnement'));
const temporary=[];
let lastIndex=0;
let cooldownUntil=0;

function available(){return [...configured,...temporary];}
function mask(entry){return {source:entry.source,suffix:entry.secret.slice(-4),status:entry.invalid?'refusée':'configurée'};}
export function agnesKeyStatus(){return {count:available().length,keys:available().map(mask),cooldownSeconds:Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000)),warning:'Les clés du même type partagent les limites Agnes. Elles n’augmentent pas le quota.'};}
export function appendAgnesKeys(values){
  if(!Array.isArray(values)||values.length>MAX_KEYS)throw new Error('Liste de clés invalide (16 maximum).');
  if(values.some(v=>!validateKey(v)))throw new Error('Une clé Agnes a un format invalide.');
  let added=0;
  for(const v of values){const key=v.trim();if(available().some(x=>x.secret===key))continue;
    if(available().length>=MAX_KEYS)throw new Error('Maximum de 16 clés en mémoire atteint.');
    temporary.push(keyRecord(key,'mémoire volatile'));added++;
  }
  return {added,...agnesKeyStatus()};
}
export function clearAgnesKeys(){temporary.splice(0,temporary.length);return agnesKeyStatus();}
export function agnesEnabled(){return process.env.AGNES_ENABLE_FLASH==='true';}
export function assertAgnesAllowed(engine,aspect,duration,consent){
  if(!['agnes-video-flash','agnes-image-flash'].includes(engine))throw new Error('Moteur Agnes non reconnu.');
  if(!agnesEnabled())throw new Error('Agnes désactivé sur le serveur : définissez AGNES_ENABLE_FLASH=true seulement après vérification des tarifs.');
  if(!consent)throw new Error('Confirmez avoir vérifié la gratuité actuelle sur votre compte Agnes avant de générer.');
  if(!available().some(k=>!k.invalid))throw new Error('Aucune clé Agnes utilisable. Ajoutez une clé depuis les paramètres du studio.');
  if(!['16:9','9:16','1:1'].includes(aspect))throw new Error('Agnes Flash : formats 16:9, 9:16 et 1:1 uniquement.');
  if(engine==='agnes-video-flash'&&(!Number.isInteger(duration)||duration<4||duration>12))throw new Error('Agnes Video Flash exige des plans de 4 à 12 secondes entières.');
}
function selectedKey(){
  if(Date.now()<cooldownUntil)throw new Error('Agnes impose une attente : '+Math.ceil((cooldownUntil-Date.now())/1000)+' secondes. Les clés partagent le quota.');
  const all=available().filter(k=>!k.invalid);
  if(!all.length)throw Error('Aucune clé Agnes valide disponible.');
  const k=all[lastIndex%all.length];lastIndex++;
  return k;
}
function retryAfter(v){
  const raw=Number(v);if(Number.isFinite(raw)&&raw>=0)return Math.min(3600,Math.ceil(raw));
  const dt=Date.parse(v||'');if(Number.isFinite(dt))return Math.min(3600,Math.max(1,Math.ceil((dt-Date.now())/1000)));
  return 60;
}
async function agnesRequest(route,{method='GET',body,signal,key}={}){
  // No retries on POST. No switch to a different key for 429 (shared limit pool).
  const chosen=key||selectedKey();
  const timeout=AbortSignal.timeout(method==='POST'?90000:30000);
  let response;
  try{response=await fetch(ROOT+route,{method,signal:signal?AbortSignal.any([signal,timeout]):timeout,
    headers:{'Authorization':'Bearer '+chosen.secret,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
  catch(e){if(signal?.aborted)throw e;throw new Error('Réponse Agnes introuvable : vérifiez l’historique Agnes AVANT de relancer la création (une tâche a pu être acceptée).');}
  if(response.status===401||response.status===403){chosen.invalid=true;chosen.lastError=response.status;throw Error('Clé Agnes refusée (HTTP '+response.status+'). Choisissez une clé autorisée, puis relancez manuellement.');}
  if(response.status===429){const sec=retryAfter(response.headers.get('Retry-After'));cooldownUntil=Date.now()+sec*1000;
    throw Error('Agnes HTTP 429 : quota commun atteint. Attendre '+sec+' s ; aucune rotation de clé pour contourner la limite.');}
  if(!response.ok){chosen.lastError=response.status;throw Error('Agnes HTTP '+response.status+' : requête non confirmée ; consultez les tâches chez le fournisseur avant un nouvel essai.');}
  let parsed;try{parsed=await response.json();}catch{throw Error('Agnes : réponse JSON incorrecte. Contrôlez la tâche distante avant de recommencer.');}
  return {data:parsed,key:chosen};
}
const wait=(ms,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(new DOMException('Annulé','AbortError'));
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
  function abort(){clearTimeout(timer);reject(new DOMException('Annulé','AbortError'));}
  signal?.addEventListener('abort',abort,{once:true});});
export function videoCreatePayload({shot,aspect}){
  assertAgnesAllowed('agnes-video-flash',aspect,shot.duration,true);
  return {model:'agnes-video-2.5-flash',mode:'text',prompt:shot.prompt.slice(0,1600),seconds:String(shot.duration),size:'720P',aspect_ratio:aspect,n:1};
}
export function imageCreatePayload({shot,aspect}){
  assertAgnesAllowed('agnes-image-flash',aspect,shot.duration,true);
  return {model:'agnes-image-2.5-flash',prompt:shot.prompt.slice(0,1600),n:1,size:'4K',ratio:aspect};
}
function safeResultUrl(input){
  if(typeof input!=='string'||input.length>4096)throw Error('URL du résultat Agnes manquante.');
  let url;try{url=new URL(input);}catch{throw Error('URL du résultat Agnes invalide.');}
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||isIP(url.hostname)||url.hostname==='localhost'||url.hostname.endsWith('.local'))
    throw Error('Adresse de résultat Agnes non autorisée (HTTPS public requis).');
  return url;
}
async function saveResult(input,output,{signal,mode}={}){
  if(typeof input==='string'&&input.startsWith('data:image/')){
    const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(input);
    if(!match)throw Error('Image Agnes Base64 invalide.');const buf=Buffer.from(match[2],'base64');
    if(buf.length<256||buf.length>MAX_RESULT)throw Error('Fichier Agnes vide ou trop volumineux.');
    const ext=match[1]==='jpeg'?'.jpg':'.'+match[1];const file=output+ext;await writeFile(file,buf);return {file,kind:'image',bytes:buf.length};
  }
  const url=safeResultUrl(input);
  const timeout=AbortSignal.timeout(120000);
  const resp=await fetch(url,{signal:signal?AbortSignal.any([signal,timeout]):timeout,redirect:'error'});
  if(!resp.ok)throw Error('Téléchargement du résultat Agnes impossible (HTTP '+resp.status+').');
  const len=Number(resp.headers.get('Content-Length')||0);if(len>MAX_RESULT)throw Error('Résultat Agnes trop volumineux.');
  const chunks=[];let length=0;
  for await(const chunk of resp.body){length+=chunk.byteLength;if(length>MAX_RESULT)throw Error('Résultat Agnes trop volumineux.');chunks.push(Buffer.from(chunk));}
  if(length<256)throw Error('Résultat Agnes vide.');
  const ext=mode==='video'?'.mp4':'.png';const file=output+ext;await writeFile(file,Buffer.concat(chunks));
  return {file,kind:mode,bytes:length};
}
export async function generateAgnes({mode,shot,aspect,output,signal,onProgress}){
  assertAgnesAllowed(mode,aspect,shot.duration,true);
  const video=mode==='agnes-video-flash';
  onProgress?.('Agnes '+(video?'Video':'Image')+' Flash · création distante');
  const payload=video?videoCreatePayload({shot,aspect}):imageCreatePayload({shot,aspect});
  const result=await agnesRequest(video?'/v1/videos':'/v1/images/generations',{method:'POST',body:payload,signal});
  if(!video){const first=result.data.data?.[0];const src=first?.url||(first?.b64_json?'data:image/png;base64,'+first.b64_json:'');
    return saveResult(src,output,{signal,mode:'image'});}
  const videoId=String(result.data.video_id||result.data.id||result.data.task_id||'');
  if(!videoId||videoId.length>180)throw Error('Agnes n’a pas renvoyé un video_id exploitable. Vérifiez l’historique de la tâche distante.');
  for(let i=0;i<90;i++){
    await wait(8000,signal);
    onProgress?.('Agnes Video Flash · suivi '+(i+1)+'/90');
    const qp=new URLSearchParams({video_id:videoId,model_name:payload.model});
    const data=(await agnesRequest('/agnesapi?'+qp.toString(),{signal,key:result.key})).data;
    const status=String(data.status||'').toLowerCase();
    if(['failed','error','cancelled','canceled'].includes(status))throw Error('Agnes a signalé un échec de génération : '+status);
    if(['completed','succeeded','done'].includes(status)){
      const remote=data.url||data.metadata?.url||data.output?.url||data.data?.url;
      return saveResult(remote,output,{signal,mode:'video'});
    }
  }
  throw Error('Agnes n’a pas terminé dans le délai de suivi. Vérifiez son historique avant de relancer.');
}
