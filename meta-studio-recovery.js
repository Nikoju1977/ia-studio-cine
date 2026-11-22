/* Studio Niko - timeline recovery v1.
   Local, opt-out by clearing snapshots. Never stores binary files or API keys. */
'use strict';
export function installTimelineRecovery({capture,restore,hasContent,notice}){
  const panel=document.getElementById('cinema-recovery');
  if(!panel)return {schedule(){}, checkpoint(){}};
  const $=id=>document.getElementById(id);
  const CURRENT='studio-niko:cinema:recovery:v1';
  const PREVIOUS='studio-niko:cinema:recovery:previous:v1';
  const MAX_BYTES=1400000;
  let timer=null, lastFingerprint='', restoring=false, storageOk=true;
  const status=$('cinema-recovery-status');
  function message(text,warning=false){
    status.textContent=text;status.dataset.warning=warning?'true':'false';
  }
  function read(key){
    try{
      const raw=localStorage.getItem(key);
      if(!raw)return null;
      const box=JSON.parse(raw);
      if(box?.schema!==1||typeof box.at!=='string'||!box.project||
         box.project.format!=='meta-studio-pro'||box.project.version!==5||
         !box.project.timeline||!Array.isArray(box.project.results)||
         !['video','audio','overlay'].every(k=>Array.isArray(box.project.timeline.clips?.[k])))
        return null;
      return box;
    }catch(_){return null;}
  }
  function dateLabel(box){
    try{return new Date(box.at).toLocaleString('fr-FR');}
    catch(_){return 'date inconnue';}
  }
  function update(){
    const recent=read(CURRENT),older=read(PREVIOUS);
    $('cinema-recovery-latest').disabled=!recent;
    $('cinema-recovery-previous').disabled=!older;
    $('cinema-recovery-export').disabled=!recent;
    $('cinema-recovery-clear').disabled=!recent&&!older;
    if(recent){
      message('Dernière copie locale : '+dateLabel(recent)+
        ' · '+recent.project.results.length+' référence(s) média · sans fichiers binaires.');
    }else if(older){
      message('Seule une copie précédente est disponible ('+dateLabel(older)+').');
    }else{
      message(storageOk?'Aucune copie de secours disponible sur cet appareil.':
        'Stockage local indisponible : utilise l’export JSON ou ZIP.',!storageOk);
    }
  }
  function fingerprint(project){
    return JSON.stringify({results:project.results,clips:project.timeline.clips});
  }
  function checkpoint(){
    if(restoring||!hasContent())return false;
    try{
      const project=capture();
      const signature=fingerprint(project);
      if(signature===lastFingerprint)return true;
      const box={schema:1,at:new Date().toISOString(),project};
      const payload=JSON.stringify(box);
      if(payload.length>MAX_BYTES)throw Error('Projet trop volumineux pour la sauvegarde locale (1,4 Mo).');
      const old=read(CURRENT);
      if(old&&old.fingerprint!==signature){
        // Do not destroy the last good copy if the secondary write fails.
        try{localStorage.setItem(PREVIOUS,JSON.stringify(old));}catch(_){}
      }
      localStorage.setItem(CURRENT,JSON.stringify({...box,fingerprint:signature}));
      lastFingerprint=signature;storageOk=true;update();
      return true;
    }catch(error){
      storageOk=false;
      message('Sauvegarde locale impossible : '+(error.message||'stockage indisponible')+
        '. Exporte le projet JSON/ZIP.',true);
      return false;
    }
  }
  function schedule(){
    if(restoring)return;
    clearTimeout(timer);
    timer=setTimeout(checkpoint,2400);
  }
  async function recover(which){
    const box=read(which);
    if(!box)return message('Cette copie de secours est absente ou illisible.',true);
    if(restoring)return;
    restoring=true;clearTimeout(timer);
    let applied=false;
    try{
      // Restore through the regular validated import workflow; never bypass confirmation.
      const json=JSON.stringify(box.project);
      const file=new File([json],'recuperation-studio-niko.json',{type:'application/json'});
      const ok=await restore(file);
      if(ok===false){
        message('Restauration annulée : projet en cours conservé.');
      }else{
        lastFingerprint='';applied=true;
        notice('Copie de secours chargée. Les URL locales expirées restent à relier. Exporte ensuite un ZIP si les médias sont disponibles.','success');
        message('Copie appliquée : relie les sources manquantes puis sauvegarde le projet.');
      }
    }catch(error){
      message('Restauration impossible : '+(error.message||'échec de lecture')+
        '. La copie locale est conservée.',true);
    }finally{
      restoring=false;
      if(applied)schedule();
    }
  }
  function exportBackup(){
    const box=read(CURRENT);
    if(!box)return message('Aucune copie récente à exporter.',true);
    const blob=new Blob([JSON.stringify(box.project,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download='meta-studio-recovery-'+box.at.slice(0,10)+'.json';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    message('Export de secours préparé. Vérifie le téléchargement JSON : il ne contient pas les fichiers média.');
  }
  function clearBackups(){
    if(!window.confirm('Supprimer les deux sauvegardes locales de secours de cet appareil ?'))return;
    try{
      localStorage.removeItem(CURRENT);
      localStorage.removeItem(PREVIOUS);
      lastFingerprint='';
      update();
    }catch(_){message('Suppression impossible sur ce navigateur.',true);}
  }
  $('cinema-recovery-latest').addEventListener('click',()=>recover(CURRENT));
  $('cinema-recovery-previous').addEventListener('click',()=>recover(PREVIOUS));
  $('cinema-recovery-export').addEventListener('click',exportBackup);
  $('cinema-recovery-clear').addEventListener('click',clearBackups);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){clearTimeout(timer);checkpoint();}
  });
  window.addEventListener('pagehide',()=>{clearTimeout(timer);checkpoint();});
  // Catch edits made by modules outside the timeline, without serializing audio on every frame.
  const interval=setInterval(()=>{
    if(!document.hidden&&!restoring)checkpoint();
  },30000);
  window.addEventListener('pagehide',()=>clearInterval(interval),{once:true});
  update();
  return {schedule,checkpoint};
}
