import assert from 'node:assert/strict';
import {movieDuration,movieSupport} from './meta-studio-v5-render.js';
assert.equal(movieDuration({video:[],audio:[],overlay:[]}),0);
assert.equal(movieDuration({video:[{start:2,duration:5}],audio:[{start:3,duration:9}],overlay:[{start:0,duration:4}]}),12);
assert.equal(movieDuration({video:[{start:-3,duration:2}],audio:[],overlay:[]}),2);
assert.equal(movieSupport(),null,'Node has no MediaRecorder or DOM');
console.log('Renderer pure-function checks passed');
