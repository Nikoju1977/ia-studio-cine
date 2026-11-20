import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import health from '../web/api/health.js';
import agnes from '../web/api/agnes.js';
function res(){return {code:0,headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(x){this.body=x;return this;}}}
test('mobile health annonce honnêtement absence de GPU et serveur de master',()=>{
  const r=res();health({method:'GET'},r);
  assert.equal(r.code,200);assert.equal(r.body.mobile,true);assert.equal(r.body.ffmpeg,false);assert.equal(r.body.comfy,false);
});
test('passerelle refuse génération sans clé, modèle inconnu et mauvaise origine',async()=>{
  let r=res();await agnes({method:'POST',headers:{host:'studio.vercel.app'},body:{action:'video',prompt:'film sur la mer',key:'short'}},r);assert.equal(r.code,400);
  r=res();await agnes({method:'POST',headers:{host:'studio.vercel.app',origin:'https://bad.example'},body:{action:'video',prompt:'film sur la mer',key:'valid-test-long-key'}},r);assert.equal(r.code,403);
  r=res();await agnes({method:'POST',headers:{host:'studio.vercel.app'},body:{action:'x',key:'valid-test-long-key'}},r);assert.equal(r.code,400);
});
test('mobile: clés RAM, contrôle de coût, UI et API présents',async()=>{
  const [js,html]=await Promise.all(['../web/app.js','../web/index.html'].map(async x=>readFile(new URL(x,import.meta.url),'utf8')));
  for(const id of ['agnesKeys','agnesConsent','agnesKeyCount','agnesSeconds','addAgnesKeys','clearAgnesKeys'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(js,/mobileStoryboard/);assert.match(js,/mobileRealize/);assert.match(js,/action:'video'/);
  assert.doesNotMatch(js,/\b(?:localStorage|sessionStorage)\s*[.\[]/);
});

test('Agnes détecte video queue is full sans rejouer le POST de génération',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_url,opts)=>{calls++;assert.equal(opts.method,'POST');
    return new Response(JSON.stringify({error:{message:'video queue is full, please retry later (request id: 20261120XYZ)'}}),
      {status:503,headers:{'Content-Type':'application/json'}});
  };
  try{const r=res();await agnes({method:'POST',headers:{host:'studio.vercel.app'},body:{
    action:'video',prompt:'cinematic landscape at dusk',key:'valid-test-long-key',seconds:5
  }},r);assert.equal(calls,1);assert.equal(r.code,503);assert.equal(r.body.code,'AGNES_VIDEO_QUEUE_FULL');
    assert.equal(r.body.requestId,'20261120XYZ');assert.doesNotMatch(JSON.stringify(r.body),/valid-test-long-key/);
  }finally{globalThis.fetch=original;}
});
test('Mobile UI propose storyboard et montage lorsque Agnes est saturé',async()=>{
  const [js,html]=await Promise.all(['../web/app.js','../web/index.html'].map(x=>readFile(new URL(x,import.meta.url),'utf8')));
  for(const id of ['agnesRecovery','agnesPrepareStoryboard','agnesContinueEditing','agnesTryImage'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(js,/function showAgnesRecovery/);assert.match(js,/function prepareStoryboardAfterAgnesError/);
});
