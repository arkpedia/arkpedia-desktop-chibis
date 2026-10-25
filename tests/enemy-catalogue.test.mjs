import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chibiIdleAnimation} from '../src/lib/operators/chibiRoutine.ts';
const catalogue=JSON.parse(fs.readFileSync(new URL('../src/catalogue.json',import.meta.url)));
const source=JSON.parse(fs.readFileSync(new URL('../src/enemy-catalogue-source.json',import.meta.url)));

test('enemy catalogue has complete immutable model resources and matching source receipts',()=>{
  const enemies=catalogue.filter(row=>row.kind==='enemy');
  assert.equal(enemies.length,189);
  assert.equal(new Set(catalogue.map(row=>row.id)).size,catalogue.length);
  for(const row of enemies){
    const receipt=source.models.find(model=>model.id===row.id);assert.ok(receipt);
    assert.equal(typeof row.model.premultipliedAlpha,'boolean');
    const resources=[row.model.skeleton,row.model.atlas,...Object.values(row.model.textures)];
    assert.equal(resources.length,receipt.files.length);
    for(const file of receipt.files){
      assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.ok(file.bytes>0);
      assert.ok(resources.includes(`https://raw.githubusercontent.com/${source.repository}/${source.commit}/${file.path}`));
    }
    const idle=chibiIdleAnimation(receipt.animations.map(name=>({name,duration:1})));
    assert.ok(idle,`${row.id} has a native idle, rather than an arbitrary attack/death fallback`);
  }
});
test('prefixed and static enemy idle clips are preferred over attack/setup tracks',()=>{
  assert.equal(chibiIdleAnimation([{name:'F_Attack',duration:1},{name:'F_Default',duration:0},{name:'F_Idle',duration:1}]),'F_Idle');
  assert.equal(chibiIdleAnimation([{name:'Attack',duration:1},{name:'Idle',duration:0}]),'Idle');
  assert.equal(chibiIdleAnimation([{name:'B_Idle',duration:1},{name:'Relax',duration:2}]),'Relax');
});
