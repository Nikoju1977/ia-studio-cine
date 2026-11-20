import http from 'node:http';
import {randomUUID, randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,stat,open,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeStoryboard,validateStoryboard,proceduralFrame,buildShot,concatShots,masterAudio,inspectMedia,verifyMaster,runProcess} from './engine.mjs';
import {comfyStatus,generateComfy} from './comfy.mjs';
import {planEffect,vfxCapabilities,executeVfx} from './vfx.mjs';
import {agnesKeyStatus,appendAgnesKeys,clearAgnesKeys,agnesEnabled,assertAgnesAllowed,generateAgnes} from './agnes.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const WEB=path.join(ROOT,'web');
const DATA=path.resolve(process.env.STUDIO_DATA_DIR||path.join(ROOT,'data'));
const ASSETS=path.join(DATA,'assets');
const JOBDIR=path.join(DATA,'jobs');
const WORKFLOWS=path.join(ROOT,'workflows');
const HOST=process.env.STUDIO_HOST||'127.0.0.1';
const PORT=Number(process.env.PORT||8787);
const PASSWORD=process.env.STUDIO_TOKEN||'';
const jobs=new Map();
const vfxJobs=new Map();
const sessions=new Set();
const MAX_UPLOAD=250*1024*1024;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json','.ico':'image/x-icon','.mp4':'video/mp4','.webm':'video/webm','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.wav':'audio/wav','.mp3':'audio/mpeg','.flac':'audio/flac','.m4a':'audio/mp4','.mov':'video/quicktime','.ogg':'audio/ogg'};
const error=(code,message)=>Object.assign(new Error(message),{status:code});
const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
function localRequest(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);}
function checkOrigin(req){if(!['POST','PUT','DELETE'].includes(req.method))return;const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)throw error(403,'Origine refusée');}
function authorized(req){
  if(!PASSWORD&&localRequest(req))return true;
  const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(x=>x.startsWith('studio_session='))?.slice(15)||'';
  return sessions.has(cookie);
}
function constantEqual(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
async function readBody(req,limit=256*1024){
  const buffers=[];let size=0;
  for await(const part of req){size+=part.length;if(size>limit)throw error(413,'Requête trop volumineuse');buffers.push(part);}
  return Buffer.concat(buffers);
}
async function bodyJSON(req){try{return JSON.parse((await readBody(req)).toString('utf8'));}catch(e){if(e.status)throw e;throw error(400,'JSON invalide');}}
async function serveFile(req,res,file,type){
  const s=await stat(file).catch(()=>null);
  if(!s?.isFile())throw error(404,'Fichier introuvable');
  const headers={'Content-Type':type||MIME[path.extname(file).toLowerCase()]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Accept-Ranges':'bytes'};
  const range=req.headers.range;
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match)throw error(416,'Plage invalide');
    const start=match[1]?Number(match[1]):0;const end=match[2]?Number(match[2]):s.size-1;
    if(start>end||end>=s.size||start<0)throw error(416,'Plage invalide');
    res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${s.size}`,'Content-Length':end-start+1});
    createReadStream(file,{start,end}).pipe(res);return;
  }
  res.writeHead(200,{...headers,'Content-Length':s.size});createReadStream(file).pipe(res);
}
function safeWebPath(p){const rel=p==='/'?'index.html':decodeURIComponent(p.slice(1));const candidate=path.resolve(WEB,rel);if(candidate!==WEB&&!candidate.startsWith(WEB+path.sep))throw error(403,'Chemin interdit');return candidate;}
const jobPublic=j=>({id:j.id,status:j.status,step:j.step,progress:j.progress,error:j.error||null,createdAt:j.createdAt,storyboard:j.storyboard,qa:j.qa||null,master:j.master?'/api/jobs/'+j.id+'/master':null,shots:j.shots||[]});
async function runJob(job,signal){
  const folder=path.join(JOBDIR,job.id);await mkdir(folder,{recursive:true});
  const shots=[];
  const board=job.storyboard;
  try{
    job.status='running';job.progress=1;
    for(let i=0;i<board.shots.length;i++){
      const shot=board.shots[i];
      if(signal.aborted)throw new DOMException('Annulé','AbortError');
      job.step=`Plan ${i+1}/${board.shots.length} · préparation`;
      job.progress=Math.round(3+i/board.shots.length*75);
      const base=path.join(folder,`source-${String(i+1).padStart(2,'0')}`);
      let source,kind='image';
      if(board.engine==='imported'){
        if(!shot.sourceAssetId)throw new Error(`Le plan ${i+1} n'a aucun média importé.`);
        source=await findAsset(shot.sourceAssetId);
        const meta=await inspectMedia(source,{signal});
        kind=/\.(png|jpe?g|webp)$/i.test(source)?'image':meta.streams?.some(s=>s.codec_type==='video')?'video':'audio';
        if(kind==='audio')throw new Error('Le média du plan '+(i+1)+' ne contient aucune image vidéo.');
      }else if(board.engine==='procedural'){
        source=base+'.png';await proceduralFrame(source,shot,board.aspect,board.grade);
      }else if(board.engine.startsWith('agnes-')){
        job.step=`Plan ${i+1}/${board.shots.length} · Agnes AI Flash`;
        const generated=await generateAgnes({mode:board.engine,shot,aspect:board.aspect,output:base,signal,onProgress:message=>{job.step=message;}});
        source=generated.file;kind=generated.kind;
      }else{
        job.step=`Plan ${i+1}/${board.shots.length} · GPU ComfyUI`;
        const reference=shot.referenceAssetId?await findAsset(shot.referenceAssetId):null;
        if(reference){const meta=await inspectMedia(reference,{signal});if(!meta.streams?.some(s=>s.codec_type==='video'&&s.width>0))
          throw new Error('La référence IA doit être une image valide.');}
        const generated=await generateComfy({mode:board.engine,shot,aspect:board.aspect,output:base,signal,workflowRoot:WORKFLOWS,sourceFile:reference,onProgress:message=>{job.step=message;}});
        source=generated.file;kind=generated.kind;
      }
      const dest=path.join(folder,`shot-${String(i+1).padStart(2,'0')}.mp4`);
      job.step=`Plan ${i+1}/${board.shots.length} · encodage 4K`;
      const info=await buildShot({source,out:dest,shot,aspect:board.aspect,grade:board.grade,signal,preset:process.env.FFMPEG_PRESET||'medium',kind});
      shots.push(dest);
      job.shots.push({index:i+1,title:shot.title,kind,prompt:shot.prompt,dimensions:info.streams?.find(s=>s.codec_type==='video')?.width+'×'+info.streams?.find(s=>s.codec_type==='video')?.height});
      await writeFile(path.join(folder,'progress.json'),JSON.stringify(jobPublic(job),null,2));
    }
    job.step='Montage et conform 4K';job.progress=83;
    const stitched=path.join(folder,'assembly.mp4');
    await concatShots(shots,stitched,signal);
    const sound=board.soundtrackId?await findAsset(board.soundtrackId):null;
    job.step='Mixage, normalisation et master AAC 48 kHz';job.progress=91;
    const master=path.join(folder,'master.mp4');
    const info=await masterAudio({video:stitched,out:master,soundtrack:sound,signal});
    job.qa=verifyMaster(info,board.aspect);
    if(!job.qa.pass)throw new Error('Contrôle qualité master échoué : '+JSON.stringify(job.qa.checks));
    job.master=master;job.progress=100;job.status='completed';job.step='Master 4K vérifié par FFprobe';
  }catch(err){job.status=signal.aborted?'cancelled':'failed';job.step=job.status==='cancelled'?'Rendu arrêté':'Erreur de production';job.error=String(err.message||err).slice(0,900);}
  finally{await writeFile(path.join(folder,'progress.json'),JSON.stringify(jobPublic(job),null,2)).catch(()=>{});job.controller=null;}
}
const vfxPublic=j=>({id:j.id,status:j.status,step:j.step,progress:j.progress,effect:j.plan.effect,error:j.error||null,
  qa:j.qa||null,master:j.master?'/api/vfx/jobs/'+j.id+'/master':null,plan:j.plan});
async function runVfxJob(job,signal){
  const folder=path.join(JOBDIR,'vfx-'+job.id);await mkdir(folder,{recursive:true});
  try{
    job.status='running';job.progress=3;job.step='Inspection du rush';
    const source=await findAsset(job.assetId);
    const result=await executeVfx({source,effect:job.plan.effect,prompt:job.plan.prompt,aspect:job.plan.aspect,
      grade:job.plan.grade,output:path.join(folder,'niko-vfx'),workflowRoot:WORKFLOWS,signal,
      onProgress:stage=>{job.step=stage;job.progress=Math.min(94,job.progress+5);}});
    job.master=result.file;job.qa=result.qa;job.status='completed';job.progress=100;
    job.step='AI VFX terminé — conformation 4K vérifiée';
  }catch(e){job.status=signal.aborted?'cancelled':'failed';job.error=String(e?.message||e).slice(0,950);
    job.step=signal.aborted?'Annulé':'Échec AI VFX — aucun faux rendu';}
  finally{job.controller=null;await writeFile(path.join(folder,'progress.json'),JSON.stringify(vfxPublic(job),null,2)).catch(()=>{});}
}
async function findAsset(id){if(!/^[0-9a-f-]{36}$/.test(id))throw error(400,'ID fichier invalide'); const list=await readdir(ASSETS);const match=list.find(n=>n.startsWith(id+'.'));if(!match)throw error(404,'Média introuvable');return path.join(ASSETS,match);}
async function upload(req,res){
  const length=Number(req.headers['content-length']);if(!Number.isSafeInteger(length)||length<1||length>MAX_UPLOAD)throw error(413,'Fichier trop volumineux ou taille absente (250 Mo max)');
  const name=String(req.headers['x-filename']||'media.bin');const ext=path.extname(name).toLowerCase();
  if(!['.mp3','.wav','.flac','.ogg','.m4a','.mp4','.webm','.mov','.png','.jpeg','.jpg','.webp'].includes(ext))throw error(415,'Extension non autorisée');
  const buffer=await readBody(req,MAX_UPLOAD);if(buffer.length!==length)throw error(400,'Transfert incomplet');
  const id=randomUUID(),file=path.join(ASSETS,id+ext);await writeFile(file,buffer,{flag:'wx'});
  try{const info=await inspectMedia(file);
    if(!info.streams?.some(s=>['video','audio'].includes(s.codec_type)))throw error(415,'Aucune piste multimédia valide dans le fichier');
    json(res,201,{id,name:name.slice(0,120),bytes:buffer.length,url:'/api/assets/'+id,
      duration:Number(info.format?.duration)||null,streams:info.streams?.filter(s=>['video','audio'].includes(s.codec_type))||[]});
  }catch(e){await (await import('node:fs/promises')).unlink(file).catch(()=>{});throw e;}
}
async function route(req,res){
  checkOrigin(req);const url=new URL(req.url,'http://localhost');const pathName=url.pathname;
  if(pathName==='/api/health'&&req.method==='GET'){
    const ffmpeg=await new Promise(resolve=>{runProcess('ffmpeg',['-version'],{timeoutMs:4000}).then(()=>resolve(true),()=>resolve(false));});
    const comfy=await comfyStatus();
    return json(res,200,{app:'Studio Niko Open Cinema',version:'0.3.0',ffmpeg,comfy:comfy.available,workflows:'export API requis',resolution:'4K',agnes:{enabled:agnesEnabled(),...agnesKeyStatus()},authentication:!!PASSWORD,authorized:authorized(req)});
  }
  if(pathName==='/api/session'&&req.method==='POST'){
    if(!PASSWORD&&!localRequest(req))throw error(403,'Définissez STUDIO_TOKEN pour l’accès depuis un autre appareil');
    const b=await bodyJSON(req);
    if(PASSWORD&&!constantEqual(String(b.token||''),PASSWORD))throw error(401,'Code de connexion incorrect');
    const sid=randomBytes(32).toString('hex');sessions.add(sid);
    res.setHeader('Set-Cookie','studio_session='+sid+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'+(req.socket.encrypted?'; Secure':''));
    return json(res,200,{ok:true});
  }
  if(pathName.startsWith('/api/')&&!authorized(req))throw error(401,'Connexion requise : configurez le code du serveur');
  if(pathName==='/api/agnes/keys'&&req.method==='GET')return json(res,200,agnesKeyStatus());
  if(pathName==='/api/agnes/keys'&&req.method==='DELETE')return json(res,200,clearAgnesKeys());
  if(pathName==='/api/agnes/keys'&&req.method==='POST'){
    // Passwords or API keys must not travel over unencrypted mobile/LAN connections.
    if(!localRequest(req)&&!req.socket.encrypted)throw error(403,'Ajoutez les clés sur le PC ou utilisez un accès HTTPS chiffré.');
    const b=await bodyJSON(req);
    return json(res,200,appendAgnesKeys(b.keys));
  }
  if(pathName==='/api/vfx/effects'&&req.method==='GET'){
    const effects=await vfxCapabilities(WORKFLOWS);
    const comfy=await comfyStatus();return json(res,200,{effects,gpu:comfy.available,detail:comfy.detail||null});
  }
  if(pathName==='/api/vfx/plan'&&req.method==='POST')return json(res,200,planEffect(await bodyJSON(req)));
  if(pathName==='/api/vfx/jobs'&&req.method==='POST'){
    if([...jobs.values(),...vfxJobs.values()].some(j=>['running','queued'].includes(j.status)))
      throw error(409,'Un rendu est déjà en cours : GPU réservé.');
    const body=await bodyJSON(req);
    const plan=planEffect(body);
    const capabilities=await vfxCapabilities(WORKFLOWS);
    if(!capabilities[plan.effect].installed)throw error(409,'Workflow '+plan.effect+' absent. Importez un véritable workflow IA dans workflows/vfx/.');
    if(!(await comfyStatus()).available)throw error(409,'GPU ComfyUI non connecté. Aucune simulation ne sera réalisée.');
    const assetId=String(body.assetId||'');
    const source=await findAsset(assetId);
    const info=await inspectMedia(source);
    if(!info.streams?.some(v=>v.codec_type==='video'))throw error(415,'Un rush vidéo est obligatoire.');
    const id=randomUUID(),controller=new AbortController();
    const job={id,assetId,plan,status:'queued',step:'En attente',progress:0,controller,error:null,qa:null,master:null};
    vfxJobs.set(id,job);void runVfxJob(job,controller.signal);
    return json(res,202,vfxPublic(job));
  }
  const vfxId=/^\/api\/vfx\/jobs\/([a-f0-9-]{36})(?:\/(master|cancel))?$/.exec(pathName);
  if(vfxId){
    const j=vfxJobs.get(vfxId[1]);if(!j)throw error(404,'Job VFX inconnu ou serveur redémarré');
    if(!vfxId[2]&&req.method==='GET')return json(res,200,vfxPublic(j));
    if(vfxId[2]==='cancel'&&req.method==='POST'){j.controller?.abort();return json(res,200,{ok:true,status:j.status});}
    if(vfxId[2]==='master'&&req.method==='GET'){
      if(!j.master||j.status!=='completed')throw error(409,'Master VFX indisponible');
      return serveFile(req,res,j.master,'video/mp4');
    }
  }
  if(pathName==='/api/plan'&&req.method==='POST'){return json(res,200,makeStoryboard(await bodyJSON(req)));}
  if(pathName==='/api/upload'&&req.method==='POST')return upload(req,res);
  const asset=/^\/api\/assets\/([a-f0-9-]{36})$/.exec(pathName);
  if(asset&&req.method==='GET')return serveFile(req,res,await findAsset(asset[1]));
  if(pathName==='/api/jobs'&&req.method==='POST'){
    if([...jobs.values(),...vfxJobs.values()].some(j=>j.status==='running'||j.status==='queued'))throw error(409,'Un rendu est déjà en cours. Un seul job simultané pour préserver le GPU.');
    const b=await bodyJSON(req);
    const board=validateStoryboard(b.storyboard||b);
    if(board.engine.startsWith('comfy-')&&!process.env.COMFY_URL)throw error(409,'COMFY_URL non configuré : génération IA locale impossible.');
    if(board.engine.startsWith('agnes-')){
      if(!b.agnesFreeConsent)throw error(403,'Confirmez d’abord avoir vérifié le tarif Flash gratuit sur Agnes. Aucun passage automatique à un modèle payant.');
      for(const shot of board.shots)assertAgnesAllowed(board.engine,board.aspect,shot.duration,b.agnesFreeConsent);
    }
    if(board.soundtrackId){const audio=await inspectMedia(await findAsset(board.soundtrackId));
      if(!audio.streams?.some(s=>s.codec_type==='audio'))throw error(415,'Bande-son importée sans piste audio.');}
    for(const shot of board.shots){
      if(board.engine==='imported'){
        if(!shot.sourceAssetId)throw error(400,'Chaque plan importé doit avoir un média source.');
        const source=await findAsset(shot.sourceAssetId);const info=await inspectMedia(source);
        if(!info.streams?.some(s=>s.codec_type==='video'))throw error(415,'Média importé non visuel : '+shot.title);
      }
      if(board.engine.startsWith('comfy-')&&shot.referenceAssetId){
        const source=await findAsset(shot.referenceAssetId);const info=await inspectMedia(source);
        if(!info.streams?.some(s=>s.codec_type==='video'))throw error(415,'Référence IA image invalide.');
      }
    }
    const id=randomUUID();const controller=new AbortController();
    const job={id,status:'queued',step:'Préparation',progress:0,error:null,createdAt:new Date().toISOString(),storyboard:board,shots:[],controller};
    jobs.set(id,job);void runJob(job,controller.signal);
    return json(res,202,jobPublic(job));
  }
  const byId=/^\/api\/jobs\/([a-f0-9-]{36})(?:\/(master|cancel))?$/.exec(pathName);
  if(byId){const job=jobs.get(byId[1]);if(!job)throw error(404,'Job inconnu (les jobs en cours ne survivent pas au redémarrage)');
    if(!byId[2]&&req.method==='GET')return json(res,200,jobPublic(job));
    if(byId[2]==='cancel'&&req.method==='POST'){if(job.controller)job.controller.abort();return json(res,200,{ok:true,status:job.status});}
    if(byId[2]==='master'&&req.method==='GET'){if(job.status!=='completed'||!job.master)throw error(409,'Master non terminé');return serveFile(req,res,job.master,'video/mp4');}
  }
  if(pathName.startsWith('/api/'))throw error(404,'API inconnue');
  if(req.method!=='GET'&&req.method!=='HEAD')throw error(405,'Méthode interdite');
  const file=safeWebPath(pathName);
  if(!Object.hasOwn(MIME,path.extname(file).toLowerCase()))throw error(403,'Type de fichier non servi');
  return serveFile(req,res,file);
}
await Promise.all([mkdir(ASSETS,{recursive:true}),mkdir(JOBDIR,{recursive:true})]);
if(HOST!=='127.0.0.1'&&HOST!=='localhost'&&!PASSWORD)throw Error('STUDIO_TOKEN est obligatoire pour exposer le serveur sur le réseau (STUDIO_HOST=0.0.0.0).');
const server=http.createServer((req,res)=>{route(req,res).catch(err=>json(res,err.status||500,{error:err.status?err.message:'Erreur serveur : '+err.message}));});
server.listen(PORT,HOST,()=>console.log(`STUDIO NIKO · http://${HOST}:${PORT} · 4K master · ${PASSWORD?'authentification activée':'local uniquement'}`));
