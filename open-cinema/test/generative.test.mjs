import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeStoryboard,validateStoryboard,dims,ffmpegFilter} from '../server/engine.mjs';
import {renderWorkflow} from '../server/comfy.mjs';
const id='00000000-0000-4000-8000-000000000001';

test('imports : storyboard de médias conserve source et référence IA après validation',()=>{
  const source=makeStoryboard({prompt:'Une scène nocturne traversée de photons bleus et d’ombres',engine:'imported',shotCount:1,shotSeconds:4,aspect:'9:16'});
  source.shots[0].sourceAssetId=id;
  source.shots[0].referenceAssetId=id;
  const result=validateStoryboard(source);
  assert.equal(result.engine,'imported');
  assert.equal(result.shots[0].sourceAssetId,id);
  assert.equal(result.shots[0].referenceAssetId,id);
});
test('import : ignore les identifiants non sûrs et valide les cadres 4K',()=>{
  const board=makeStoryboard({prompt:'Studio de cinéma libre avec des scènes originales',engine:'imported',shotCount:2,shotSeconds:3,aspect:'17:9'});
  board.shots[0].sourceAssetId='../../private.key';
  assert.equal(validateStoryboard(board).shots[0].sourceAssetId,null);
  assert.deepEqual(dims(board.aspect),{width:4096,height:2160});
  assert.match(ffmpegFilter({...dims(board.aspect),grade:'cinema',seconds:3}),/fps=24/);
});
test('image-to-video : référence typée correctement injectée dans ComfyUI',()=>{
  const graph=renderWorkflow({'1':{class_type:'LoadImage',inputs:{image:'{{SOURCE_IMAGE}}'}},'2':{class_type:'CLIPTextEncode',inputs:{text:'{{PROMPT}}'}}},
    {prompt:'La forêt s’anime au vent',seed:17,duration:4},{aspect:'16:9',mode:'comfy-video',inputFile:'image-upload.png'});
  assert.equal(graph['1'].inputs.image,'image-upload.png');
  assert.equal(graph['2'].inputs.text,'La forêt s’anime au vent');
});
test('interface generative suite : boutons et identifiants uniques',async()=>{
  const html=await readFile(new URL('../web/index.html',import.meta.url),'utf8');
  for(const x of ['tab-generative','genFiles','genPrompt','genCompose','genPlan','genProduce','genMediaChoices','genCompiled']){
    assert.match(html,new RegExp('id="'+x+'"'));
  }
  const matches=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(matches.length,new Set(matches).size);
  const app=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
  assert.match(app,/function generativePlan\(/);
  assert.match(app,/sourceAssetId=mobile.mode\?null:await ensureUploaded/);
});
