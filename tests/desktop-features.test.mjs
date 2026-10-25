import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {frameDue,fall} from '../src/lib/operators/desktopMotion.ts';
import {matchesEntry,readCatalogueFilters} from '../src/lib/operators/library.ts';
const require=createRequire(import.meta.url);
const {visibleSurfaces}=require('../electron/surfaces.cjs');
const {createSettings}=require('../electron/settings.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('frame rate gating preserves the selected budget on a 120 Hz display',()=>{
  for(const fps of [15,30,60]){let previous=0,count=0;for(let i=1;i<=120;i++){const now=i*1000/120;if(frameDue(now,previous,fps)){count++;previous=now;}}assert.equal(count,fps);}
});
test('gravity lands on the first crossed surface, does not snap up from underneath, and falls off edges',()=>{
  const edges=[{x:0,y:200,width:200,height:1}];
  assert.deepEqual(fall(90,100,.1,40,80,100,600,edges),{y:100,velocity:0,grounded:true});
  assert.equal(fall(210,0,.1,40,80,100,600,edges).grounded,false);
  assert.equal(fall(100,0,.1,300,80,100,600,edges).grounded,false);
  assert.equal(fall(499,200,.1,300,80,100,600,edges).y,500);
});
test('only visible stretches of window edges become surfaces',()=>{
  assert.deepEqual(visibleSurfaces([{x:50,y:0,width:100,height:100},{x:0,y:50,width:200,height:100}]),[{x:50,y:0,width:100,height:1},{x:0,y:50,width:50,height:1},{x:150,y:50,width:50,height:1}]);
  assert.deepEqual(visibleSurfaces([{x:NaN,y:0,width:200,height:20}]),[]);
});
test('outfit-brand search supports multiple words and combines category filters',()=>{
  const entry={id:'amiya@outfit',name:'Amiya · Newsgirl',brand:'Test Collection',kind:'outfit'};
  assert.equal(matchesEntry(entry,'amiya test','outfit','Test Collection'),true);
  assert.equal(matchesEntry(entry,'amiya test','operator',''),false);
  assert.equal(matchesEntry(entry,'missing','all',''),false);
});
test('new preferences persist and reject malformed or out-of-range frame limits',t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'features-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const file=path.join(folder,'settings.json'),settings=createSettings(file);
  assert.equal(settings.get().launchAtLogin,false);assert.equal(settings.get().fpsLimit,60);
  assert.equal(settings.set('fpsLimit',30),true);assert.equal(settings.set('fpsLimit',0),false);assert.equal(settings.set('fpsLimit','15'),false);
  assert.equal(createSettings(file).get().fpsLimit,30);
});
test('catalogue filters recover safely from corrupt or unavailable storage',()=>{
  assert.deepEqual(readCatalogueFilters({getItem:()=>'{broken'}),{kind:'all',brand:'',downloadedOnly:false});
  assert.deepEqual(readCatalogueFilters({getItem:()=>JSON.stringify({kind:'outfit',brand:'Test Collection',downloadedOnly:true})}),{kind:'outfit',brand:'Test Collection',downloadedOnly:true});
  assert.equal(readCatalogueFilters({getItem(){throw Error('storage blocked');}}).kind,'all');
});
