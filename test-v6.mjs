/* Node 22 offline contract tests. No GPU quota used. */
import assert from 'node:assert/strict';
import {generateProVideo} from './meta-studio-pro-video.js';
import {generateFreeVideo} from './meta-studio-free-video.js';

globalThis.document={readyState:'loading',addEventListener(){}};
const {storyboard}=await import('./meta-studio-auto-film.js');
const cases=[
  {idea:'Une héroïne anime traverse une ville futuriste et libère une source de lumière vivante',
    style:'animation',shotCount:3,shotSeconds:4},
  {idea:'A dramatic mysterious science fiction signal awakens a forgotten city',style:'scifi',
    shotCount:6,shotSeconds:3}
];
for(const sample of cases){
  const plan=storyboard(sample);
  assert.equal(plan.length,sample.shotCount);
  assert.equal(new Set(plan.map(p=>p.title)).size,sample.shotCount);
  assert.ok(plan.every((p,i)=>p.index===i&&p.prompt.includes(sample.idea)));
  assert.equal(plan.reduce((v,s)=>v+s.seconds,0),sample.shotSeconds*sample.shotCount);
}
const info={named_endpoints:{'/generate_video':{parameters:[
  {parameter_name:'input_image'}, {parameter_name:'prompt'}, {parameter_name:'duration'},
  {parameter_name:'enhance_prompt'}, {parameter_name:'seed'},
  {parameter_name:'randomize_seed'}, {parameter_name:'height'}, {parameter_name:'width'}
]}}};
const videoUrl='https://lightricks-ltx-2-3.hf.space/gradio_api/file=/tmp/real.mp4';
function fragmented(parts){
 const encoder=new TextEncoder();
 return new Response(new ReadableStream({start(controller){for(const part of parts)controller.enqueue(encoder.encode(part));controller.close();}}),{headers:{'content-type':'text/event-stream'}});
}
const original=globalThis.fetch;
let posts=0;
try{
  globalThis.fetch=async (url,options={})=>{
    if(url.endsWith('/info'))return Response.json(info);
    if(url.endsWith('/call/generate_video')&&options.method==='POST'){
      posts++;
      const input=JSON.parse(options.body).data;
      assert.equal(input.length,8,'LTX-2.3 requires eight positional parameters');
      assert.equal(input[0],null);
      assert.equal(input[6],864);
      assert.equal(input[7],1536);
      return Response.json({event_id:'job-test-123'});
    }
    if(url.endsWith('/call/generate_video/job-test-123'))
      return fragmented(['event: generating\r','\ndata: null\r\n\r','\nevent: complete\r','\ndata: [{"video":{"url":"'+videoUrl+'"}},42]\r','\n\r','\n']);
    throw new Error('Unexpected URL '+url);
  };
  const got=await generateProVideo({prompt:'Cinematic shot',seconds:4,aspectRatio:'16:9'});
  assert.equal(got,videoUrl);
  assert.equal(posts,1,'Create video POST should never retry');
  let t2vPosts=0;
  globalThis.fetch=async (url,options={})=>{
    if(url.endsWith('/call/text_to_video')&&options.method==='POST'){
      t2vPosts++;
      const arr=JSON.parse(options.body).data;
      assert.equal(arr.length,13);
      assert.equal(arr[6],'text-to-video');
      return Response.json({event_id:'job-test-456'});
    }
    if(url.endsWith('/call/text_to_video/job-test-456'))
      return fragmented(['event: complete\r','\ndata: [{"video":{"url":"https://lightricks-ltx-video-distilled.hf.space/gradio_api/file=/tmp/real.mp4"}},42]']);
    throw new Error('Unexpected LTX 13B URL '+url);
  };
  const backup=await generateFreeVideo({prompt:'A real IA video',seconds:4});
  assert.ok(backup.includes('/tmp/real.mp4'));
  assert.equal(t2vPosts,1,'Fallback creation must not retry');
  globalThis.fetch=async(url,options={})=>{
    if(url.endsWith('/info'))return Response.json(info);
    if(url.endsWith('/call/generate_video')&&options.method==='POST'){
      posts++;
      return new Response('Quota GPU reached',{status:429});
    }
    throw new Error('Unexpected error-test URL '+url);
  };
  await assert.rejects(generateProVideo({prompt:'Cost limit test',seconds:4}),/HTTP 429/);
  assert.equal(posts,2,'Quota errors must never automatically retry');
}finally{globalThis.fetch=original;}
console.log('Studio Niko V6 OFFLINE TESTS OK: storyboard, LTX-2.3, 13B, SSE, free-quota rejection, no automatic POST retries.');
