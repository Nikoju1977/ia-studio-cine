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
