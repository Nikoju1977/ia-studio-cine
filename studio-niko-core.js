/* Studio Niko Core v0.1.0 — no dependencies, no telemetry.
   Portable browser utilities. Never reads application data by itself. */
(function(root){
  'use strict';
  if(root.StudioNikoCore) return;
  var VERSION='0.1.0';
  var PREFIX='sncore:';
  var DEFAULT_MAX_BYTES=1024*1024;

  function storage(namespace){
    if(typeof namespace!=='string'||!/^[a-z0-9_.-]{1,64}$/i.test(namespace)){
      throw new TypeError('Identifiant de stockage invalide');
    }
    function key(name){
      if(typeof name!=='string'||!/^[a-z0-9_.-]{1,80}$/i.test(name)){
        throw new TypeError('Nom de clé invalide');
      }
      return PREFIX+namespace+':'+name;
    }
    return Object.freeze({
      read:function(name,fallback){
        try {
          var raw=root.localStorage.getItem(key(name));
          return raw===null?fallback:JSON.parse(raw);
        } catch(_){return fallback;}
      },
      write:function(name,value){
        try {root.localStorage.setItem(key(name),JSON.stringify(value));return true;}
        catch(_){return false;}
      },
      remove:function(name){
        try{root.localStorage.removeItem(key(name));return true;}
        catch(_){return false;}
      }
    });
  }

  function safeFilename(name){
    return String(name||'sauvegarde.json').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,90)||'sauvegarde.json';
  }
  function exportJSON(value,filename){
    var text=JSON.stringify(value,null,2);
    if(typeof text!=='string')throw new Error('Valeur JSON non sérialisable');
    var blob=new Blob([text],{type:'application/json;charset=utf-8'});
    var url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=safeFilename(filename);
    a.hidden=true;document.body.appendChild(a);a.click();a.remove();
    root.setTimeout(function(){URL.revokeObjectURL(url);},60000);
    return blob.size;
  }
  async function importJSON(file,options){
    options=options||{};
    var max=Number.isSafeInteger(options.maxBytes)?options.maxBytes:DEFAULT_MAX_BYTES;
    if(!file||typeof file.text!=='function'||typeof file.size!=='number')throw new TypeError('Fichier manquant');
    if(file.size>max||file.size<0)throw new Error('Fichier trop volumineux');
    var data=JSON.parse(await file.text());
    if(options.validate&&options.validate(data)!==true)throw new Error('Format du projet invalide');
    return data;
  }

  // No search params, fragments, token, user-agent, logs or local data.
  function diagnostic(){
    var target=root.location?root.location.origin:'non disponible';
    return [
      'STUDIO NIKO — DIAGNOSTIC VOLONTAIRE',
      'Date UTC: '+new Date().toISOString(),
      'Application: '+String(document.title||'Sans titre').slice(0,120),
      'Domaine de l’application: '+target,
      'Studio Niko Core: '+VERSION,
      'Contexte HTTPS: '+(root.isSecureContext?'oui':'non'),
      'Service Worker supporté: '+('serviceWorker' in navigator?'oui':'non'),
      'Connexion navigateur (indicative): '+(navigator.onLine?'en ligne':'hors ligne'),
      'Aucune donnée de projet, donnée médicale, clé, identifiant ou historique inclus.'
    ].join('\n');
  }

  async function copyDiagnostic(){
    var content=diagnostic();
    if(navigator.clipboard&&root.isSecureContext){
      try{await navigator.clipboard.writeText(content);return true;}catch(_){}
    }
    var input=document.createElement('textarea');
    input.value=content;input.readOnly=true;
    input.setAttribute('aria-label','Diagnostic technique à copier');
    input.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(input);input.select();
    var copied=false;
    try{copied=document.execCommand('copy');}catch(_){}
    input.remove();
    return copied;
  }

  function installDiagnosticControl(){
    var holder=document.querySelector('#studio-niko-embedded-guide .sn-guide-actions');
    var autoCoder=false;
    if(!holder){
      holder=document.querySelector('#settings-dialog .modal-actions');
      autoCoder=!!holder;
    }
    if(!holder||holder.querySelector('[data-sn-core-diagnostic]'))return false;
    var button=document.createElement('button');
    button.type='button';
    button.setAttribute('data-sn-core-diagnostic','');
    button.setAttribute('aria-label','Copier un diagnostic technique sans donnée personnelle');
    button.title='Copier un diagnostic sans donnée personnelle';
    button.textContent=autoCoder?'Copier diagnostic':'Diag.';
    if(autoCoder) button.className='btn subtle';
    // The first position in the settings panel avoids disturbing the save action.
    holder.insertBefore(button,holder.firstChild);
    var status=document.createElement('span');
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    status.style.cssText='position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)';
    holder.appendChild(status);
    button.addEventListener('click',async function(){
      button.disabled=true;
      var original=autoCoder?'Copier diagnostic':'Diag.';
      try{
        var copied=await copyDiagnostic();
        status.textContent=copied?'Diagnostic copié.':'Copie impossible sur ce navigateur.';
        button.textContent=copied?'Copié ✓':original;
      }catch(_){status.textContent='Copie indisponible.';button.textContent=original;}
      finally{
        button.disabled=false;
        root.setTimeout(function(){button.textContent=original;status.textContent='';},2600);
      }
    });
    return true;
  }

  var api=Object.freeze({
    version:VERSION,storage:storage,exportJSON:exportJSON,
    importJSON:importJSON,diagnostic:diagnostic,
    copyDiagnostic:copyDiagnostic,installDiagnosticControl:installDiagnosticControl
  });
  Object.defineProperty(root,'StudioNikoCore',{value:api,configurable:false,writable:false});
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',installDiagnosticControl,{once:true});
  }else{
    installDiagnosticControl();
  }
})(window);
