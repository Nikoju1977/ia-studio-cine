/* Studio Niko V6 — genuine LTX-2.3 22B audio/video on free shared ZeroGPU.
 * API shape checked against Lightricks/LTX-2-3 app.py (8 required inputs).
 * No keys, payment fallbacks, inferred fake video, or paid retry loops.
 */
export const PRO_VIDEO_SPACE = 'https://lightricks-ltx-2-3.hf.space';
export const PRO_VIDEO_PAGE = 'https://huggingface.co/spaces/Lightricks/LTX-2-3';
function createSseReader(max=1500000){
 let buffer="",pendingCR=false;
 return function push(chunk,done=false){
  let s=String(chunk);
  if(pendingCR){s="\r"+s;pendingCR=false;}
  if(!done&&s.endsWith("\r")){s=s.slice(0,-1);pendingCR=true;}
  buffer+=s.replace(/\r\n|\r/g,"\n");
  if(buffer.length>max)throw Error("Flux SSE trop volumineux.");
  const packets=[];let sep;
  while((sep=buffer.indexOf("\n\n"))>=0){packets.push(buffer.slice(0,sep));buffer=buffer.slice(sep+2);}
  if(done&&buffer.trim()){packets.push(buffer);buffer="";}
  return packets;
 };
}
const API = PRO_VIDEO_SPACE + '/gradio_api';
const RATIO = {
  high: {'16:9':[1536,864],'9:16':[864,1536],'1:1':[1024,1024]},
  balanced: {'16:9':[896,512],'9:16':[512,896],'1:1':[768,768]}
};
const NEGATIVE = 'flicker, jitter, deformed anatomy, face changes, extra limbs, text artifacts, low detail, abrupt camera jumps';
function explain(error, step) {
  if (error?.name === 'AbortError') throw error;
  if (error instanceof TypeError) throw new Error(
    'LTX-2.3 : connexion refusée ou CORS bloqué lors de ' + step +
    '. Ouvrez le Space officiel : ' + PRO_VIDEO_PAGE);
  throw error;
}
async function fetchJSON(url,options={},step='requête') {
  let res;
  try { res=await fetch(url,{mode:'cors',credentials:'omit',...options}); }
  catch(error){explain(error,step);}
  if(!res.ok) {
    const message=(await res.text().catch(()=>'' )).replace(/<[^>]*>/g,' ').slice(0,220);
    throw new Error('LTX-2.3 : HTTP '+res.status+' à '+step+(message?' · '+message:'')+
      '. Les quotas GPU gratuits et les files peuvent limiter la génération.');
  }
  return res.json().catch(()=>{throw new Error('LTX-2.3 : réponse JSON invalide lors de '+step);});
}
function pickEndpoint(info) {
  const endpoints=info?.named_endpoints||{};
  for(const [key,schema] of Object.entries(endpoints)){
    const labels=(schema?.parameters||[]).map(p=>String(
      p.parameter_name||p.label||p.name||p.component||'').toLowerCase());
    if(labels.length===8 && labels.includes('prompt') &&
       labels.some(s=>s.includes('duration')) &&
       labels.some(s=>s.includes('image')) &&
       labels.some(s=>s.includes('width'))) {
      const name=String(key).replace(/^\//,'');
      if (/^[a-zA-Z0-9_]+$/.test(name)) return name;
    }
  }
  throw new Error('LTX-2.3 : le Space a changé son API ; génération non lancée. '+
    'Consultez '+PRO_VIDEO_PAGE);
}
async function uploadSource(url, signal) {
  let source;
  try {source=await fetch(url,{signal});}
  catch(error){explain(error,'lecture de l’image');}
  if(!source.ok)throw new Error('Impossible de charger l’image de référence.');
  const file=await source.blob();
  if(!/^image\/(png|jpeg|webp)$/i.test(file.type))
    throw new Error('L’image doit être au format PNG, JPG ou WebP.');
  if(file.size>6500000)
    throw new Error('Image de référence trop volumineuse (maximum 6,5 Mo).');
  const extension=file.type.includes('png')?'png':file.type.includes('webp')?'webp':'jpg';
  const name='studio-reference.'+extension, form=new FormData();
  form.append('files',file,name);
  const list=await fetchJSON(API+'/upload',{method:'POST',body:form,signal},'envoi de l’image');
  const path=Array.isArray(list)?list[0]:list?.files?.[0];
  if(typeof path!=='string'||!path)throw new Error('Le GPU n’a pas reçu l’image de référence.');
  return {path,orig_name:name,meta:{_type:'gradio.FileData'}};
}
function readPacket(data) {
  const lines=data.split('\n');
  let type='',value='';
  for(const line of lines){
    if(line.startsWith('event:'))type=line.slice(6).trim();
    if(line.startsWith('data:'))value+=line.slice(5).trim();
  }
  if(!type)return null;
  try{return {type, data:JSON.parse(value)};}
  catch {return {type,data:value};}
}
function findVideo(output) {
  let value=Array.isArray(output)?output[0]:output;
  if(value?.video)value=value.video;
  if(Array.isArray(value))value=value[0];
  const path=typeof value==='string'?value:value?.url||value?.path||value?.name;
  if(!path||typeof path!=='string')
    throw new Error('Le modèle LTX-2.3 a terminé sans fichier vidéo utilisable.');
  if(path.startsWith('https://'))return path;
  if(path.startsWith('/gradio_api/file='))return PRO_VIDEO_SPACE+path;
  if(path.startsWith('/'))return API+'/file='+encodeURIComponent(path);
  throw new Error('Adresse du MP4 non valide dans la réponse LTX-2.3.');
}
async function streamJob(endpoint,eventId,signal,onProgress) {
  if(!/^[A-Za-z0-9_-]{5,128}$/.test(eventId))
    throw new Error('LTX-2.3 : identifiant de tâche invalide.');
  let res;
  try {res=await fetch(API+'/call/'+endpoint+'/'+eventId,{
    method:'GET',mode:'cors',credentials:'omit',signal,
    headers:{Accept:'text/event-stream'}
  });}catch(error){explain(error,'suivi vidéo');}
  if(!res.ok)throw new Error('Suivi de LTX-2.3 impossible : HTTP '+res.status);
  if(!res.body?.getReader)throw new Error('Streaming Gradio indisponible sur ce navigateur.');
  const reader=res.body.getReader(),decoder=new TextDecoder();
  const packets=createSseReader();
  try {
    while(true) {
      const {value,done}=await reader.read();
      for(const packet of packets(decoder.decode(value||new Uint8Array(),{stream:!done}),done)){
        const e=readPacket(packet);
        if(!e)continue;
        if(e.type==='complete')return findVideo(e.data);
        if(e.type==='error'){
          const message=typeof e.data==='string'?e.data:e.data?.message||JSON.stringify(e.data);
          throw new Error('LTX-2.3 : '+String(message).slice(0,250));
        }
        if(e.type==='generating')onProgress?.('LTX-2.3 : calcul des images et du son sur GPU…');
        if(e.type==='progress')onProgress?.('LTX-2.3 : progression du rendu IA…');
      }
      if(done)break;
    }
  }catch(error){explain(error,'réception du résultat');}
  finally{try{await reader.cancel();}catch{}reader.releaseLock();}
  throw new Error('Le flux de la tâche LTX-2.3 s’est interrompu avant l’envoi du MP4.');
}
export async function generateProVideo({prompt,sourceUrl=null,aspectRatio='16:9',
  seconds=4,quality='high',signal,onProgress}){
  const callerSignal=signal, controller=new AbortController();
  const cancel=()=>controller.abort();callerSignal?.addEventListener('abort',cancel,{once:true});if(callerSignal?.aborted)cancel();
  const timeout=setTimeout(()=>controller.abort(),600000);signal=controller.signal;
  try{
  if(typeof prompt!=='string'||!prompt.trim())throw new Error('Une description de plan est nécessaire.');
  const duration=Math.min(10,Math.max(1,Number(seconds)||4));
  const [width,height]=(RATIO[quality]||RATIO.high)[aspectRatio]||RATIO.high['16:9'];
  onProgress?.('LTX-2.3 : vérification du moteur vidéo 22B gratuit…');
  const info=await fetchJSON(API+'/info',{signal},'lecture du schéma API');
  const endpoint=pickEndpoint(info);
  let image=null;
  if(sourceUrl){
    onProgress?.('LTX-2.3 : transmission de l’image pour la continuité du plan…');
    image=await uploadSource(sourceUrl,signal);
  }
  const data=[image,String(prompt).slice(0,1900),duration,false,42,true,height,width];
  onProgress?.('LTX-2.3 : envoi de la demande vidéo IA + audio (sans paiement)…');
  // A POST may be accepted even if its response is lost. Never auto retry it.
  const job=await fetchJSON(API+'/call/'+endpoint,{
    method:'POST',signal,headers:{'Content-Type':'application/json'},
    body:JSON.stringify({data})
  },'création de la tâche');
  if(typeof job?.event_id!=='string')throw new Error('LTX-2.3 n’a pas retourné de tâche acceptée.');
  onProgress?.('LTX-2.3 : tâche acceptée, GPU partagé en attente…');
  return await streamJob(endpoint,job.event_id,signal,onProgress);
  }catch(e){if(controller.signal.aborted&&!callerSignal?.aborted)throw new Error('Délai de 10 minutes dépassé. La tâche distante peut continuer ; vérifiez le Space avant de relancer.');throw e;}finally{clearTimeout(timeout);callerSignal?.removeEventListener('abort',cancel);}
}
