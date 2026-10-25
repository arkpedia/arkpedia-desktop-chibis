const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createLibrary}=require('../electron/library.cjs');
const ROOT='https://raw.githubusercontent.com/arkpedia/arkpedia-sd-assets/'+'a'.repeat(40)+'/';
const row={id:'a',name:'Amiya',model:{skeleton:ROOT+'a.skel',atlas:ROOT+'a.atlas',textures:{'a.png':ROOT+'a.png'},premultipliedAlpha:false}};
async function folder(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'models-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
test('downloads survive restart and are served without network access; unknown URLs cannot be fetched',async t=>{
  const directory=await folder(t);let calls=0;
  const library=createLibrary({directory,catalogue:[row],fetch:async()=>{calls++;return new Response('asset');}});
  await library.init();await library.download(['a']);assert.deepEqual(library.get().downloaded,['a']);assert.equal(calls,3);
  const offline=createLibrary({directory,catalogue:[row],fetch:()=>{throw Error('offline');}});await offline.init();
  assert.equal(await(await offline.response(row.model.skeleton)).text(),'asset');assert.equal((await offline.response('https://example.com')).status,503);
  await offline.clear();assert.deepEqual(offline.get().downloaded,[]);
});
test('exported packs round-trip and imported files survive clearing downloaded cache',async t=>{
  const directory=await folder(t),exports=await folder(t);
  const library=createLibrary({directory,catalogue:[row],fetch:async()=>new Response('asset')});await library.init();await library.download(['a']);await library.exportPack(exports);
  const pack=path.join(exports,(await fs.readdir(exports))[0]);
  const imported=createLibrary({directory:await folder(t),catalogue:[],fetch:()=>{throw Error('offline');}});await imported.init();await imported.importPack(pack);
  assert.equal(imported.get().entries.length,1);const entry=imported.get().entries[0];assert.equal(entry.name,'Amiya');await imported.clear();assert.equal((await imported.response(entry.model.skeleton)).status,200);
  await imported.removePack(entry.id);assert.deepEqual(imported.get().entries,[]);assert.equal((await imported.response(entry.model.skeleton)).status,503);
});
test('imports reject traversal and unsupported manifests without exposing files',async t=>{
  const directory=await folder(t),pack=await folder(t);
  await fs.writeFile(path.join(pack,'manifest.json'),JSON.stringify({version:1,entries:[{...row,model:{...row.model,skeleton:'../secret.skel'}}]}));
  const library=createLibrary({directory,catalogue:[],fetch:()=>{throw Error('unexpected');}});await library.init();await library.importPack(pack);
  assert.match(library.get().error,/inside assets/);assert.equal(library.get().entries.length,0);
});
test('failed downloads remain retryable and never count incomplete models as offline-ready',async t=>{
  let fail=true;const library=createLibrary({directory:await folder(t),catalogue:[row],fetch:async()=>{if(fail)throw Error('offline');return new Response('asset');}});await library.init();await library.download(['a']);assert.equal(library.get().busy,false);assert.deepEqual(library.get().downloaded,[]);
  fail=false;await library.download(['a']);assert.deepEqual(library.get().downloaded,['a']);
});

test('corrupt stored manifests cannot register arbitrary local files',async t=>{
  const directory=await folder(t),pack=path.join(directory,'packs','b'.repeat(64));await fs.mkdir(pack,{recursive:true});
  await fs.writeFile(path.join(pack,'manifest.json'),JSON.stringify({version:1,entries:[{...row,model:{...row.model,skeleton:'../../secret.txt'}}]}));
  const library=createLibrary({directory,catalogue:[],fetch:()=>{throw Error('unexpected');}});await library.init();assert.deepEqual(library.get().entries,[]);
});
