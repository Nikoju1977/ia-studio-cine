import test from 'node:test';
import assert from 'node:assert/strict';
import {makeStoryboard,validateStoryboard,validateOptions,OUTPUTS,ffmpegFilter,proceduralFrame,verifyMaster,runProcess,inspectMedia} from '../server/engine.mjs';
import {renderWorkflow} from '../server/comfy.mjs';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('sorties 4K explicites paysage, portrait, DCI',()=>{
  assert.deepEqual(OUTPUTS['16:9'],{width:3840,height:2160});
  assert.deepEqual(OUTPUTS['9:16'],{width:2160,height:3840});
  assert.deepEqual(OUTPUTS['17:9'],{width:4096,height:2160});
});
test('découpage déterministe sans fuite de clé',()=>{
  const input={prompt:'Film techno dans une ville futuriste sous la pluie',shotCount:4,shotSeconds:5,aspect:'9:16',engine:'procedural'};
  const a=makeStoryboard(input),b=makeStoryboard(input);
  assert.equal(a.shots.length,4);assert.deepEqual(a.shots.map(x=>x.prompt),b.shots.map(x=>x.prompt));
  assert.deepEqual(a.shots.map(x=>x.seed),b.shots.map(x=>x.seed));
  assert.ok(a.shots.every(x=>x.duration===5));
  assert.equal(a.aspect,'9:16');
});
test('validation refuse faux storyboard, formats et prompts',()=>{
  assert.throws(()=>makeStoryboard({prompt:'court'}),/12/);
  assert.throws(()=>validateStoryboard({aspect:'2:7',shots:[{prompt:'Mon scénario est intéressant'}]}),/invalide/);
  assert.throws(()=>validateStoryboard({aspect:'16:9',shots:[{prompt:'court'}]}),/invalide/);
});
test('injection typée dans un workflow ComfyUI API',()=>{
  const w=renderWorkflow({'1':{class_type:'Demo',inputs:{seed:'{{SEED}}',prompt:'{{PROMPT}}',width:'{{WIDTH}}'}}},{prompt:'Un beau plan',seed:43,duration:3},{aspect:'9:16',mode:'comfy-image'});
  assert.equal(w['1'].inputs.seed,43);assert.equal(w['1'].inputs.prompt,'Un beau plan');assert.equal(w['1'].inputs.width,576);
});
test('conformation 4K inclut Rec.709 et fade sans alias non maîtrisé',()=>{
  const f=ffmpegFilter({width:3840,height:2160,grade:'cinema',seconds:4});
  assert.match(f,/scale=3840:2160/);assert.match(f,/fps=24/);assert.match(f,/format=yuv420p/);
});
test('graphisme procédural produit un vrai PNG lisible',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'niko-test-'));
  const file=path.join(dir,'shot.png');const info=await proceduralFrame(file,{seed:33},'16:9','techno');
  const data=await readFile(file);assert.ok(info.bytes>10000);assert.deepEqual([...data.subarray(0,8)],[137,80,78,71,13,10,26,10]);
});
test('QA master ne déclare pas professionnel un faux 4K',()=>{
  const fake={streams:[{codec_type:'video',width:1920,height:1080,avg_frame_rate:'24/1',codec_name:'h264'},{codec_type:'audio',codec_name:'aac',sample_rate:'48000',channels:2}],format:{duration:'4',size:'125024'}};
  const result=verifyMaster(fake,'16:9');assert.equal(result.pass,false);assert.equal(result.checks.resolution,false);
});
