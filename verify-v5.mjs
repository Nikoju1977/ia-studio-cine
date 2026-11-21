// META-STUDIO PRO V6 — static integrity tests (Node 22)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const html=fs.readFileSync('index.html','utf8');
const core=fs.readFileSync('meta-studio-v5-core.js','utf8');
const free=fs.readFileSync('meta-studio-free-video.js','utf8');
const pro=fs.readFileSync('meta-studio-pro-video.js','utf8');
const auto=fs.readFileSync('meta-studio-auto-film.js','utf8');
for(const file of ['meta-studio-free-video.js','meta-studio-pro-video.js','meta-studio-auto-film.js','meta-studio-v5-core.js','meta-studio-v5-media.js','meta-studio-v5-render.js'])execFileSync(process.execPath,['--check',file]);
const media=fs.readFileSync('meta-studio-v5-media.js','utf8');
const renderer=fs.readFileSync('meta-studio-v5-render.js','utf8');
const css=fs.readFileSync('meta-studio-v5.css','utf8');
assert.match(html,/<title>META-STUDIO PRO V6/);
assert.match(html,/value="ltx23" selected/);
assert.match(core,/import \{generateFreeVideo\} from "\.\/meta-studio-free-video\.js\?v=6"/);
assert.match(core,/import \{generateProVideo\} from "\.\/meta-studio-pro-video\.js\?v=6"/);
assert.match(free,/lightricks-ltx-video-distilled\.hf\.space/);
assert.match(free,/const endpoint=image/);
assert.match(pro,/lightricks-ltx-2-3\.hf\.space/);
assert.match(pro,/pickEndpoint/);
assert.match(pro,/streamJob/);
assert.match(auto,/export function storyboard/);
assert.match(auto,/studio:request-auto-export/);
assert.match(auto,/extractLastFrame/);
assert.match(free,/text-to-video/);
assert.match(free,/image-to-video/);
assert.doesNotMatch(free,/sk_[A-Za-z0-9]{20,}/);
assert.doesNotMatch(free,/localStorage|sessionStorage/);
assert.doesNotMatch(pro,/localStorage|sessionStorage/);
assert.match(html,/meta-studio-v5-media\.js/);
assert.match(media,/meta-studio-v5-core\.js/);
assert.match(media,/meta-studio-v5-render\.js/);
assert.match(renderer,/export async function makeTimelineMovie/);
for(const id of ["render-progress","render-stop","render-state","render-resolution"])assert.match(html,new RegExp(`id="${id}"`));
assert.match(html,/meta-studio-v5\.css/);
assert.ok(css.length>3000,'Styles missing');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length,new Set(ids).size,'Duplicate HTML ids');
for(const script of [core,media,auto]){
  for(const [,id] of script.matchAll(/\$\('([^']+)'\)/g)){
    assert.ok(ids.includes(id),'Missing element ID: '+id);
  }
}
for(const tab of ['studio','timeline','looks','neural','audio','agent','export']){
  assert.ok(ids.includes('view-'+tab),'Missing tab view '+tab);
}
assert.doesNotMatch(core,/localStorage|sessionStorage/,'API keys must stay in memory');
assert.match(core,/Retry-After/);
assert.match(core,/agnes-video-2\.5-flash/);
assert.doesNotMatch(core,/agnes-video-v2\.0/);
assert.match(core,/first_frame/);
assert.match(core,/method==='GET'\?4:1/);
for(const id of ['video-model','video-source','video-backend','agnes-video-model-field','free-video-notice','video-paid-confirm','video-paid-label','provider-advice'])
  assert.ok(ids.includes(id),'Missing Agnes 2.5 control '+id);
assert.match(media,/Les URL blob: locales expirent/);
for(const id of ['auto-create','auto-brief','auto-style','auto-shots','auto-engine','auto-quality','auto-shot-seconds','auto-export','auto-chain','auto-cancel','auto-resume','auto-storyboard','auto-state','auto-progress','auto-count'])assert.ok(ids.includes(id),'Missing autonomous director control '+id);
assert.match(media,/studio:request-auto-export/);
assert.match(renderer,/transitionTime=\.24/);
console.log('META-STUDIO V6: syntax, HTML IDs, live LTX 22B provider, storyboard, timeline, privacy checks OK');
