/* Studio Niko / AI VFX director. AI effects require real local ComfyUI workflows.
 * Never produces a fabricated edit when the model is missing or fails.
 */
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {generateComfy,comfyStatus} from './comfy.mjs';
import {buildShot,inspectMedia,verifyMaster,runProcess} from './engine.mjs';

export const EFFECTS=Object.freeze({
  remove: {name:'Effacer un objet et ses interactions',model:'VOID + SAM 3',kind:'video',description:'Suppression cohérente temporellement et reconstruction du décor'},
  replace:{name:'Transformer / remplacer un sujet',model:'Wan VACE ou LTX Edit',kind:'video',description:'Édition vidéo conditionnée par la source et le prompt'},
  particles:{name:'Transformation en particules',model:'Modèle VFX vidéo conditionné',kind:'video',description:'Transformation suivie d’un sujet en particules'},
  relight:{name:'Rééclairer une scène',model:'Relighting vidéo IA',kind:'video',description:'Rééclairage cohérent sur toute la séquence'},
  cutout:{name:'Détourer un sujet en mouvement',model:'SAM 3 / SAM 2 + alpha',kind:'video',description:'Masque ou séquence RGBA fournis par un workflow compatible'},
  depth:{name:'Profondeur et compositing',model:'Depth Anything 3',kind:'video',description:'Génération et composition à partir de cartes de profondeur'},
  upscale:{name:'Restaurer la vidéo',model:'SeedVR2',kind:'video',description:'Restauration temporelle avant conformation 4K'},
  stylize:{name:'Transformation de style cinéma',model:'Wan VACE / LTX Edit',kind:'video',description:'Style cohérent entre les images'}
});
const keywordRules=[
  ['remove',/supprim|effac|retir|remove|erase|clean.?plate/i],
  ['particles',/particul|désintégr|éclat|atomis|particle/i],
  ['replace',/remplac|transform|métamorph|swap|recast/i],
  ['relight',/lumi[eè]re|r[eé][eé]clair|relight|illumina/i],
  ['cutout',/d[eé]tour|masqu|roto|isole|alpha/i],
  ['depth',/profondeur|depth|parallax|3d/i],
  ['upscale',/agrand|nettet|restaur|upscal|am[eé]lior.*qualit/i],
  ['stylize',/style|look|cin[eé]matographique|couleur/i]
];
export function planEffect({effect='auto',prompt='',aspect='16:9',grade='cinema'}={}){
  const description=String(prompt).trim();
  if(description.length<8||description.length>1600)throw Error('Décris l’effet en 8 à 1600 caractères.');
  const mode=effect==='auto'?(keywordRules.find(([,pattern])=>pattern.test(description))?.[0]||'stylize'):effect;
  if(!Object.hasOwn(EFFECTS,mode))throw Error('Effet AI VFX inconnu.');
  if(!['16:9','9:16','17:9','1:1'].includes(aspect))throw Error('Format d’image inconnu.');
  if(!['cinema','techno','nature','noir'].includes(grade))throw Error('Étalonnage non reconnu.');
  return {effect:mode,name:EFFECTS[mode].name,model:EFFECTS[mode].model,prompt:description,aspect,grade,
    stages:['Inspection du rush','Transfert au moteur IA local','Analyse et génération temporelle','Conformation 4K Rec.709','Contrôle technique FFprobe'],
    note:'Sélection d’outil par règles locales, pas compréhension par un LLM. L’effet est réalisé par un véritable workflow IA ComfyUI installé.'};
}
export async function vfxCapabilities(workflowRoot){
  const result={};
  for(const [id,meta] of Object.entries(EFFECTS)){
    const file=path.join(workflowRoot,'vfx',id+'.json');
    try{
      const raw=JSON.parse(await readFile(file,'utf8'));
      result[id]={...meta,installed:!!raw&&Object.values(raw).some(x=>x&&typeof x==='object'&&x.class_type),reason:null};
    }catch {result[id]={...meta,installed:false,reason:'Importer un workflow ComfyUI au format API'};}
  }
  return result;
}
export async function executeVfx({source,effect,prompt,aspect,grade,output,workflowRoot,signal,onProgress}){
  if(!Object.hasOwn(EFFECTS,effect))throw Error('Effet VFX non reconnu.');
  const sourceInfo=await inspectMedia(source,{signal});
  if(!sourceInfo.streams?.some(x=>x.codec_type==='video'))throw Error('La source doit contenir une vidéo.');
  const seconds=Number(sourceInfo.format?.duration);
  if(!(seconds>0&&seconds<=15))throw Error('Pour le moteur AI VFX 0.2 : rush de 15 secondes maximum. Découpe les plans longs.');
  const computed=await vfxCapabilities(workflowRoot);
  if(!computed[effect].installed)throw Error('Modèle AI VFX non installé : ajoute workflows/vfx/'+effect+'.json et ses poids ComfyUI.');
  const ready=await comfyStatus();
  if(!ready.available)throw Error('Le GPU ComfyUI n’est pas disponible : '+(ready.detail||'configure COMFY_URL'));
  const shot={id:'vfx-'+Date.now(),seed:Math.floor(Math.random()*4294967295),duration:seconds,
    prompt};
  onProgress?.('Envoi du rush au GPU ComfyUI (aucune API payante)');
  const edited=await generateComfy({mode:'vfx-'+effect,shot,aspect,output:output+'-ai',workflowRoot,signal,sourceFile:source,onProgress});
  if(edited.kind!=='video')throw Error('Le workflow VFX a renvoyé une image au lieu d’une séquence vidéo. Aucune fausse vidéo générée.');
  const produced=await inspectMedia(edited.file,{signal});
  const generatedSeconds=Number(produced.format?.duration)||0;
  if(generatedSeconds < Math.min(1,seconds*.5))throw Error('Vidéo VFX trop courte : échec du contrôle durée.');
  onProgress?.('Conformation 4K / 24 i/s / Rec.709');
  const temporary=output+'-visual.mp4';
  await buildShot({source:edited.file,out:temporary,shot:{duration:Math.min(seconds,generatedSeconds)},aspect,grade,signal,preset:process.env.FFMPEG_PRESET||'medium',kind:'video'});
  // Preserve source audio if present. It is not silently replaced by a fabricated music track.
  const hasAudio=sourceInfo.streams.some(x=>x.codec_type==='audio');
  if(hasAudio){
    await runProcess('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',temporary,'-i',source,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-ac','2','-shortest','-movflags','+faststart',output+'.mp4'],{signal,timeoutMs:120000});
  } else {
    await runProcess('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',temporary,'-map','0:v:0','-map','0:a:0','-c','copy','-movflags','+faststart',output+'.mp4'],{signal,timeoutMs:120000});
  }
  const finalInfo=await inspectMedia(output+'.mp4',{signal});
  const qa=verifyMaster(finalInfo,aspect);
  if(!qa.pass)throw Error('Contrôle qualité VFX échoué : '+JSON.stringify(qa.checks));
  return {file:output+'.mp4',qa,workflow:effect,model:EFFECTS[effect].model,sourceDuration:seconds,outputDuration:qa.seconds,
    note:'Contrôle technique réussi ; la cohérence temporelle et la qualité artistique nécessitent encore un visionnage.'};
}
