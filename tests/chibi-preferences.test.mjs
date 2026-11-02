import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectedPose,manualActivity,holdsPosition} from '../src/lib/operators/chibiPreferences.ts';
import {chibiClip} from '../src/lib/operators/chibiFraming.ts';
import {createRequire} from 'node:module';
const {savedChibis}=createRequire(import.meta.url)('../electron/chibi-state.cjs');
test('manual poses stay fixed, use the model catalogue and can hold a final frame',()=>{
  assert.equal(selectedPose('Sit',['Relax','Sit']),'Sit');
  assert.equal(selectedPose('Sit',['Relax']),'');
  assert.equal(manualActivity('Sit_1'),'sit');assert.equal(manualActivity('Sleep'),'sleep');assert.equal(manualActivity('Special'),null);
  assert.equal(holdsPosition('Sit',false),true);assert.equal(holdsPosition('',true),true);assert.equal(holdsPosition('',false),false);
  assert.deepEqual(chibiClip(['Relax','Sit'],'Relax',undefined,false,'','Sit',false),{clip:'Sit',loop:false});
});
test('old saves remain valid and separate copies keep their own options',()=>{
  const rows=['amiya',{id:'amiya',preferences:{pose:'Sit',loop:false,furniture:false,props:false,fixed:true,flipped:true,size:180,offset:12,position:{x:230,y:150}}},{id:'amiya',preferences:{pose:'Sleep'}}];
  assert.deepEqual(savedChibis(rows,32),rows);
  assert.equal(savedChibis(rows,2).length,2);
});
test('damaged save fields never become renderer controls',()=>{
  const rows=savedChibis([null,{},'x'.repeat(201),{id:'amiya',preferences:{pose:123,size:999,offset:-999,props:'false',position:{x:NaN,y:5},injected:'x'}}],32);
  assert.deepEqual(rows,[{id:'amiya',preferences:{size:300,offset:-100}}]);
});
