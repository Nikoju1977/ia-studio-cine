// META-STUDIO PRO V5 — static integrity tests (Node 22)
import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const core=fs.readFileSync('meta-studio-v5-core.js','utf8');
const media=fs.readFileSync('meta-studio-v5-media.js','utf8');
const css=fs.readFileSync('meta-studio-v5.css','utf8');
assert.match(html,/<title>META-STUDIO PRO V5/);
assert.match(html,/meta-studio-v5-media\.js/);
assert.match(media,/meta-studio-v5-core\.js/);
assert.match(html,/meta-studio-v5\.css/);
assert.ok(css.length>3000,'Styles missing');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length,new Set(ids).size,'Duplicate HTML ids');
for(const script of [core,media]){
  for(const [,id] of script.matchAll(/\$\('([^']+)'\)/g)){
    assert.ok(ids.includes(id),'Missing element ID: '+id);
  }
}
for(const tab of ['studio','timeline','looks','neural','audio','agent','export']){
  assert.ok(ids.includes('view-'+tab),'Missing tab view '+tab);
}
assert.doesNotMatch(core,/localStorage|sessionStorage/,'API keys must stay in memory');
assert.match(core,/Retry-After/);
assert.match(media,/Les URL blob: locales expirent/);
console.log('META-STUDIO V5: HTML IDs, dependencies, privacy checks OK');
