// Strict, stateless Agnes proxy for mobile devices. BYOK: API keys never persist here.
const BASE='https://apihub.agnes-ai.com';
const MODELS={video:'agnes-video-2.5-flash',image:'agnes-image-2.5-flash'};
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'POST uniquement.'});
  const origin=req.headers.origin;
  if(origin){let host='';try{host=new URL(origin).host;}catch{}if(host!==req.headers.host)return res.status(403).json({error:'Origine non autorisée.'});}
  const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  if(JSON.stringify(b).length>10000)return res.status(413).json({error:'Requête trop volumineuse.'});
  const key=String(b.key||'');
  if(key.length<12||key.length>600)return res.status(400).json({error:'Ajoutez votre clé Agnes AI.'});
  const action=String(b.action||'');
  let method='POST',path='',payload;
  if(action==='video'){
    const prompt=String(b.prompt||'').trim();if(prompt.length<8||prompt.length>2000)return res.status(400).json({error:'Prompt vidéo invalide.'});
    const aspect=['16:9','9:16','1:1'].includes(b.aspect)?b.aspect:'9:16';
    const seconds=[4,5,8,12].includes(Number(b.seconds))?Number(b.seconds):5;
    path='/v1/videos';payload={model:MODELS.video,prompt,mode:'text',seconds:String(seconds),size:'720P',aspect_ratio:aspect,n:1};
  }else if(action==='image'){
    const prompt=String(b.prompt||'').trim();if(prompt.length<8||prompt.length>2000)return res.status(400).json({error:'Prompt image invalide.'});
    const aspect=['16:9','9:16','1:1'].includes(b.aspect)?b.aspect:'9:16';
    path='/v1/images/generations';payload={model:MODELS.image,prompt,n:1,size:'1K',ratio:aspect};
  }else if(action==='poll'){
    const id=String(b.videoId||'');if(!/^[\w-]{4,180}$/.test(id))return res.status(400).json({error:'Identifiant de tâche invalide.'});
    method='GET';path='/agnesapi?'+new URLSearchParams({video_id:id,model_name:MODELS.video});
  }else{return res.status(400).json({error:'Action inconnue.'});}
  try{
    const upstream=await fetch(BASE+path,{method,headers:{Authorization:'Bearer '+key,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(24000)});
    const raw=await upstream.text();
    if(raw.length>3800000)return res.status(502).json({error:'Réponse image trop volumineuse pour la passerelle. Utilisez un résultat par URL.'});
    let data;try{data=JSON.parse(raw);}catch{return res.status(502).json({error:'Réponse Agnes non conforme.'});}
    if(!upstream.ok){
      const detail=String(data?.error?.message||data?.message||data?.error||'Erreur fournisseur').slice(0,220);
      const queue=/(queue[\s_-]*(?:is[\s_-]*)?full|file.*satur|saturat)/i.test(detail);
      const requestId=String(data?.request_id||data?.requestId||data?.error?.request_id||
        detail.match(/request[\s_-]*id[\s:=-]*([a-zA-Z0-9_-]+)/i)?.[1]||'').slice(0,90);
      return res.status(upstream.status).json({
        error:queue?'Agnes vidéo saturé : aucune tâche acceptée. Continue ton storyboard ou ton montage, puis réessaie manuellement quand le service est disponible.':`Agnes HTTP ${upstream.status} : ${detail}`,
        code:queue?'AGNES_VIDEO_QUEUE_FULL':'AGNES_PROVIDER_ERROR',
        requestId:requestId||null,retryAfter:upstream.headers.get('Retry-After')||null
      });
    }
    return res.status(200).json(data);
  }catch(e){return res.status(502).json({error:'Service Agnes indisponible ou délai dépassé. Vérifiez votre historique avant toute nouvelle génération.'});}
}
