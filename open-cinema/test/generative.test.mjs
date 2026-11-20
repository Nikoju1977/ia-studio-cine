import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeStoryboard,validateStoryboard,dims,ffmpegFilter} from '../server/engine.mjs';
import {renderWorkflow} from '../server/comfy.mjs';
const id='00000000-0000-4000-8000-000000000001';

test('imports : storyboard conserve la source et la référence IA après validation',()=>{
 const board=makeStoryboard({prompt:'Une ville de cinéma nocturne sous des photons bleus',engine:'imported',shotCount:1,shotSeconds:4,aspect:'9:16'});
 board.shots[0].sourceAssetId=id;board.shots[0].referenceAssetId=id;
 const validated=validateStoryboard(board);
 assert.equal(validated.engine,'imported');assert.equal(validated.shots[0].sourceAssetId,id);
 assert.equal(validated.shots[0].referenceAssetId,id);
});
test('imports : les identifiants de fichiers sont filtrés',()=>{
 const board=makeStoryboard({prompt:'Studio de cinéma libre avec des scènes originales',engine:'imported',shotCount:2,shotSeconds:3,aspect:'17:9'});
 board.shots[0].sourceAssetId='../../private.key';
 assert.equal(validateStoryboard(board).shots[0].sourceAssetId,null);
 assert.deepEqual(dims('17:9'),{width:4096,height:2160});
 assert.match(ffmpegFilter({...dims('17:9'),grade:'cinema',seconds:3}),/fps=24/);
});
test('ComfyUI : image de référence envoyée au vrai workflow',()=>{
 const graph=renderWorkflow({'1':{class_type:'LoadImage',inputs:{image:'{{SOURCE_IMAGE}}'}},'2':{class_type:'Text',inputs:{text:'{{PROMPT}}'}}},
 {prompt:'La forêt s’anime au vent',seed:17,duration:4},{aspect:'16:9',mode:'comfy-video',inputFile:'image-upload.png'});
 assert.equal(graph['1'].inputs.image,'image-upload.png');
 assert.equal(graph['2'].inputs.text,'La forêt s’anime au vent');
});
test('interface generative : boutons et IDs distincts',async()=>{
 const html=await readFile(new URL('../web/index.html',import.meta.url),'utf8');
 for(const x of ['tab-generative','genFiles','genPrompt','genCompose','genPlan','genProduce','genMediaChoices','genCompiled'])
  assert.match(html,new RegExp('id="'+x+'"'));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size);
 const app=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
 assert.match(app,/function generativePlan\(/);
 assert.match(app,/sourceAssetId=await ensureUploaded/);
});
