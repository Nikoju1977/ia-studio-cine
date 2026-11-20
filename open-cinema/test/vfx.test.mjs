import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {planEffect,vfxCapabilities,EFFECTS} from '../server/vfx.mjs';
import {generateComfy,renderWorkflow} from '../server/comfy.mjs';

test('routeur VFX : effet vidéo choisi selon la consigne, pas prétendu LLM',()=>{
  assert.equal(planEffect({prompt:'Je veux que le personnage se transforme en particules lumineuses'}).effect,'particles');
  assert.equal(planEffect({prompt:'Efface la voiture et ses ombres de la vidéo'}).effect,'remove');
  assert.equal(planEffect({effect:'depth',prompt:'Ajoute une pluie lumineuse dans le décor'}).effect,'depth');
  assert.equal(Object.keys(EFFECTS).length,8);
  assert.throws(()=>planEffect({prompt:'Court'}),/8 à 1600/);
  assert.throws(()=>planEffect({prompt:'Plan assez long',effect:'inconnu'}),/inconnu/);
});
test('pas de fausse IA quand les workflows sont absents',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'niko-vfx-'));
  const status=await vfxCapabilities(temp);
  assert.equal(Object.values(status).filter(x=>x.installed).length,0);
});
test('workflow VFX contient filename source et prompt',()=>{
  const graph={'1':{class_type:'LoadVideo',inputs:{file:'{{INPUT_FILE}}'}},'2':{class_type:'AILook',inputs:{text:'{{PROMPT}}',seed:'{{SEED}}'}}};
  const rendered=renderWorkflow(graph,{prompt:'Une superbe explosion',duration:5,seed:17},{aspect:'9:16',mode:'vfx-replace',inputFile:'foo.mp4'});
  assert.equal(rendered['1'].inputs.file,'foo.mp4');
  assert.equal(rendered['2'].inputs.seed,17);
});
test('flux ComfyUI réel : upload multipart + prompt + history + téléchargement',async t=>{
  const tmp=await mkdtemp(path.join(os.tmpdir(),'niko-vfx-integration-'));
  const wfdir=path.join(tmp,'vfx');await mkdir(wfdir);
  await writeFile(path.join(wfdir,'replace.json'),JSON.stringify({
    '1':{class_type:'LoadVideo',inputs:{file:'{{INPUT_FILE}}'}},
    '2':{class_type:'AITest',inputs:{instruction:'{{PROMPT}}',seed:'{{SEED}}'}}
  }));
  const infile=path.join(tmp,'source.mp4');await writeFile(infile,Buffer.alloc(2048,12));
  let upload=false,submit=false,history=false;
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/upload/image'){
      assert.match(String(req.headers['content-type']),/multipart\/form-data; boundary=/);
      const chunks=[];for await(const c of req)chunks.push(c);
      assert.match(Buffer.concat(chunks).toString('latin1'),/niko-vfx-/);
      upload=true;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name:'upload-test.mp4'}));
    }else if(req.url==='/prompt'){
      const chunks=[];for await(const c of req)chunks.push(c);
      const body=JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(body.prompt['1'].inputs.file,'upload-test.mp4');
      assert.equal(body.prompt['2'].inputs.instruction,'Transforme le sujet en lumière.');
      submit=true;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({prompt_id:'test-123'}));
    }else if(req.url==='/history/test-123'){
      history=true;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({'test-123':{outputs:{'3':{videos:[{filename:'niko-vfx-test.mp4',type:'output'}]}}}}));
    }else if(req.url.startsWith('/view?')){
      res.writeHead(200,{'Content-Type':'video/mp4'});res.end(Buffer.alloc(3072,3));
    }else{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>server.close());
  const previous=process.env.COMFY_URL;
  process.env.COMFY_URL=`http://127.0.0.1:${server.address().port}`;
  t.after(()=>{if(previous===undefined)delete process.env.COMFY_URL;else process.env.COMFY_URL=previous;});
  const out=await generateComfy({mode:'vfx-replace',shot:{id:'test',seed:5,prompt:'Transforme le sujet en lumière.',duration:2},aspect:'16:9',output:path.join(tmp,'out'),workflowRoot:tmp,sourceFile:infile});
  assert.equal(out.kind,'video');assert.equal((await readFile(out.file)).byteLength,3072);
  assert.ok(upload&&submit&&history);
});
