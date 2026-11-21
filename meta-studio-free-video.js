/* META-STUDIO PRO — Free real AI video via public Hugging Face ZeroGPU.
   No mock output, no paid API, no developer key. The external Space has
   daily GPU quotas and can be busy or unavailable. */
export const FREE_VIDEO_SPACE = 'https://lightricks-ltx-video-distilled.hf.space';
export const FREE_VIDEO_PAGE = 'https://huggingface.co/spaces/Lightricks/ltx-video-distilled';
const API = FREE_VIDEO_SPACE + '/gradio_api';

function failNetwork(err, step) {
  if (err?.name === 'AbortError') throw err;
  if (err instanceof TypeError)
    throw new Error('Connexion au moteur LTX impossible (' + step + '). Le Space peut être arrêté ou son API bloquée par CORS. Ouvrez le Space officiel depuis le lien gratuit affiché dans le studio.');
  throw err;
}
async function jsonOrThrow(url, options, step) {
  let response;
  try {
    response = await fetch(url, { mode:'cors', credentials:'omit', ...options });
  } catch (err) { failNetwork(err,step); }
  if (!response.ok) {
    const detail = (await response.text().catch(()=>'' )).slice(0,260);
    const quota = /quota|exceeded|usage limit|gpu limit|rate limit/i.test(detail);
    throw new Error((quota?'Quota GPU gratuit Hugging Face atteint. ':'Moteur LTX indisponible. ') +
      'HTTP ' + response.status + (detail?' · '+detail.replace(/<[^>]+>/g,' ').slice(0,130):''));
  }
  return response.json().catch(()=>{throw new Error('Réponse invalide du service LTX ('+step+').');});
}
function videoURL(data) {
  let output = Array.isArray(data) ? data[0] : data;
  if (Array.isArray(output)) output=output[0];
  if (output?.video) output=output.video;
  const raw = typeof output==='string' ? output : (output?.url||output?.path||output?.name);
  if (!raw || typeof raw!=='string') throw new Error('LTX a terminé sans livrer de fichier vidéo. Vérifiez le résultat sur le Space.');
  if (/^https:\/\//i.test(raw)) return raw;
  if (/^\/?gradio_api\/file=/i.test(raw)) return new URL(raw.replace(/^\//,''),FREE_VIDEO_SPACE+'/').href;
  if (raw.startsWith('/')) return API+'/file='+encodeURIComponent(raw);
  throw new Error('Adresse de la vidéo LTX non reconnue.');
}
function parseSsePacket(packet) {
  let type='', payload='';
  for (const line of packet.split('\n')) {
    if (line.startsWith('event:')) type=line.slice(6).trim();
    if (line.startsWith('data:')) payload+=line.slice(5).trim();
  }
  if (!type) return null;
  let value=payload;
  try { value=JSON.parse(payload); } catch {}
  return {type,value};
}
async function awaitJob(eventId, signal, onProgress) {
  if (!/^[\w-]{5,128}$/.test(String(eventId)))
    throw new Error('Identifiant de tâche Gradio invalide.');
  let response;
  try {
    response=await fetch(API+'/call/text_to_video/'+eventId,{
      method:'GET',mode:'cors',credentials:'omit',signal,
      headers:{Accept:'text/event-stream'}
    });
  } catch (err) { failNetwork(err,'suivi de tâche'); }
  if (!response.ok) throw new Error('Impossible de suivre la génération LTX (HTTP '+response.status+').');
  if (!response.body?.getReader) throw new Error('Ce navigateur ne prend pas en charge le suivi des tâches LTX.');
  const reader=response.body.getReader();
  const decoder=new TextDecoder();
  let buffer='';
  let complete=false;
  try {
    while (true) {
      const {value,done}=await reader.read();
      if (done) break;
      buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');
      if (buffer.length>2000000) throw new Error('Réponse du service LTX trop volumineuse.');
      let sep;
      while ((sep=buffer.indexOf('\n\n'))>=0) {
        const packet=parseSsePacket(buffer.slice(0,sep));
        buffer=buffer.slice(sep+2);
        if (!packet) continue;
        if (packet.type==='complete') {
          complete=true;
          return videoURL(packet.value);
        }
        if (packet.type==='error') {
          const detail=typeof packet.value==='string'?packet.value:packet.value?.message||JSON.stringify(packet.value);
          throw new Error('Génération LTX refusée ou interrompue : '+String(detail).slice(0,220));
        }
        if (packet.type==='generating') onProgress?.('LTX : génération IA en cours sur GPU partagé…');
        if (packet.type==='heartbeat') continue;
        if (packet.type==='progress') onProgress?.('LTX : calcul des images et mouvements…');
      }
    }
  } catch (err) { failNetwork(err,'réception de la vidéo'); }
  finally { reader.releaseLock(); }
  if (!complete) throw new Error('Connexion au Space interrompue avant réception de la vidéo. Aucune vidéo ne sera inventée.');
}
async function uploadImage(sourceUrl, signal) {
  let response;
  try { response=await fetch(sourceUrl,{signal}); }
  catch (err) { failNetwork(err,'lecture de l’image'); }
  if (!response.ok) throw new Error('Impossible de lire l’image de départ.');
  const blob=await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Sélectionnez une image JPG, PNG ou WebP.');
  if (blob.size>6500000) throw new Error('Image de départ supérieure à 6,5 Mo : réduisez-la.');
  const form=new FormData();
  form.append('files',blob,'studio-niko-image.'+(blob.type.includes('png')?'png':'jpg'));
  const files=await jsonOrThrow(API+'/upload',{method:'POST',signal,body:form},'import de l’image');
  const path=Array.isArray(files)?files[0]:files?.files?.[0];
  if (!path||typeof path!=='string') throw new Error('Le Space n’a pas accepté l’image envoyée.');
  return {path,orig_name:'studio-niko-image.png',meta:{_type:'gradio.FileData'}};
}
export async function generateFreeVideo({prompt,sourceUrl,aspectRatio='16:9',seconds=4,signal,onProgress}) {
  const dims=({
    '16:9':[512,896], '9:16':[896,512], '1:1':[704,704]
  })[aspectRatio]||[512,896];
  const duration=Math.min(8.5,Math.max(0.3,Number(seconds)||4));
  onProgress?.('Connexion au GPU gratuit Hugging Face…');
  let image=null;
  if (sourceUrl) {
    onProgress?.('LTX : transfert de l’image de départ…');
    image=await uploadImage(sourceUrl,signal);
  }
  // Parameter order is taken from the Space's public app.py t2v/i2v Gradio bindings.
  const data=[
    String(prompt).slice(0,2000),
    'worst quality, inconsistent motion, blurry, jittery, distorted',
    image,null,dims[0],dims[1],
    image?'image-to-video':'text-to-video',
    duration,9,42,true,3.0,false
  ];
  const endpoint=image?'image_to_video':'text_to_video';
  onProgress?.('LTX : envoi de la tâche de génération réelle…');
  const job=await jsonOrThrow(API+'/call/'+endpoint,{
    method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({data})
  },'création de tâche');
  if (!job?.event_id) throw new Error('Le service LTX n’a pas accepté la génération (aucun event_id).');
  onProgress?.('LTX : tâche acceptée, file d’attente du GPU gratuit…');
  return await awaitVideoTask(job.event_id,endpoint,signal,onProgress);
}
async function awaitVideoTask(eventId,endpoint,signal,onProgress) {
  if (!/^[\w-]{5,128}$/.test(String(eventId)))
    throw new Error('Identifiant de tâche Gradio invalide.');
  let response;
  try {
    response=await fetch(API+'/call/'+endpoint+'/'+eventId,{
      method:'GET',mode:'cors',credentials:'omit',signal,
      headers:{Accept:'text/event-stream'}
    });
  } catch (err) { failNetwork(err,'suivi de tâche'); }
  if (!response.ok) throw new Error('Suivi LTX indisponible (HTTP '+response.status+').');
  if (!response.body?.getReader) throw new Error('Ce navigateur ne peut pas recevoir les événements du GPU.');
  const reader=response.body.getReader(), decoder=new TextDecoder();
  let buffer='';
  try {
    while (true) {
      const {value,done}=await reader.read();
      buffer+=decoder.decode(value||new Uint8Array(),{stream:!done}).replace(/\r\n/g,'\n');
      if (buffer.length>2000000) throw new Error('Réponse LTX trop volumineuse.');
      let sep;
      while ((sep=buffer.indexOf('\n\n'))>=0) {
        const evt=parseSsePacket(buffer.slice(0,sep));
        buffer=buffer.slice(sep+2);
        if (!evt) continue;
        if (evt.type==='complete') return videoURL(evt.value);
        if (evt.type==='error') {
          const raw=typeof evt.value==='string'?evt.value:evt.value?.message||JSON.stringify(evt.value);
          throw new Error('LTX : '+String(raw).slice(0,230));
        }
        if (evt.type==='generating'||evt.type==='progress')
          onProgress?.('LTX : génération des mouvements sur GPU partagé…');
      }
      if (done) break;
    }
  } catch(err) { failNetwork(err,'résultat vidéo'); }
  finally { reader.releaseLock(); }
  throw new Error('La connexion au Space s’est arrêtée sans vidéo. Consultez directement le Space, puis relancez si nécessaire.');
}
