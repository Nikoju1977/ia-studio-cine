import assert from 'node:assert/strict';
import {movieDuration,movieSupport,validateTimeline} from './meta-studio-v5-render.js';
assert.equal(movieDuration({video:[],audio:[],overlay:[]}),0);
assert.equal(movieDuration({video:[{start:2,duration:5}],audio:[{start:3,duration:9}],overlay:[{start:0,duration:4}]}),12);
assert.equal(movieDuration({video:[{start:-3,duration:2}],audio:[],overlay:[]}),2);
assert.equal(movieSupport(),null,'Node has no MediaRecorder or DOM');
console.log('Renderer pure-function checks passed');

const clip={id:'v',start:0,duration:2,offset:0,url:'blob:test'};
assert.equal(validateTimeline({video:[clip]}),2);
assert.equal(validateTimeline({video:[clip],audio:[{...clip,id:'a',duration:4}]}),4);
assert.equal(validateTimeline({video:[clip],audio:[{...clip,id:'a',duration:4}]},true),2);
for(const patch of [{start:-1},{duration:0},{duration:Infinity},{start:'0'},{offset:-1},{url:''},{duration:901}])
 assert.throws(()=>validateTimeline({video:[{...clip,...patch}]}));
for(const invalid of [{video:[]},{video:[clip,clip]},{video:[clip],audio:{}},{video:Array.from({length:201},(_,i)=>({...clip,id:String(i)}))}])
 assert.throws(()=>validateTimeline(invalid));
console.log('14 timeline validation checks passed');
