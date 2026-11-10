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

test('on-demand downloads update offline availability, while cached reads do not rescan the library',async t=>{
  let downloads=0,updates=0;
  const library=createLibrary({directory:await folder(t),catalogue:[row],fetch:async()=>{downloads++;return new Response('asset');},changed:()=>updates++});
  await library.init();
  for(const url of [row.model.skeleton,row.model.atlas,row.model.textures['a.png']])assert.equal((await library.response(url)).status,200);
  assert.deepEqual(library.get().downloaded,['a']);assert.equal(library.get().bytes,15);
  const previousUpdates=updates,stat=t.mock.method(fs,'stat'),readdir=t.mock.method(fs,'readdir');
  assert.equal(await(await library.response(row.model.skeleton)).text(),'asset');
  assert.equal(await(await library.response(row.model.atlas)).text(),'asset');
  assert.equal(downloads,3);assert.equal(updates,previousUpdates);
  assert.equal(stat.mock.callCount(),0);assert.equal(readdir.mock.callCount(),0);
});

test('replacing a cache file removed externally does not double-count its bytes',async t=>{
  const directory=await folder(t),crypto=require('node:crypto');
  const library=createLibrary({directory,catalogue:[row],fetch:async()=>new Response('asset')});await library.init();
  await library.download(['a']);assert.equal(library.get().bytes,15);
  await fs.rm(path.join(directory,'cache',crypto.createHash('sha256').update(row.model.skeleton).digest('hex')));
  assert.equal((await library.response(row.model.skeleton)).status,200);
  assert.equal(library.get().bytes,15);assert.deepEqual(library.get().downloaded,['a']);
});

test('an on-demand download cannot spend the quota already being committed by an import',async t=>{
  const sync=require('node:fs'),crypto=require('node:crypto'),MiB=1024*1024;
  const directory=await folder(t),pack=await folder(t),cache=path.join(directory,'cache');
  await fs.mkdir(cache);await fs.mkdir(path.join(pack,'assets'));
  // Sparse files exercise the real 1 GB limit without writing a gigabyte of test data.
  for(let i=0;i<15;i++){
    const file=path.join(cache,crypto.createHash('sha256').update(String(i)).digest('hex'));
    await fs.writeFile(file,'');await fs.truncate(file,64*MiB);
  }
  for(const [name,size] of [['model.skel',32*MiB],['model.atlas',1],['model.png',1]]){
    const file=path.join(pack,'assets',name);await fs.writeFile(file,'');await fs.truncate(file,size);
  }
  await fs.writeFile(path.join(pack,'manifest.json'),JSON.stringify({version:1,entries:[{name:'Imported model',model:{skeleton:'assets/model.skel',atlas:'assets/model.atlas',textures:{'model.png':'assets/model.png'},premultipliedAlpha:false}}]}));
  let copied,releaseImport,bodyRead;
  const copying=new Promise(resolve=>copied=resolve),holdImport=new Promise(resolve=>releaseImport=resolve),downloadRead=new Promise(resolve=>bodyRead=resolve);
  const library=createLibrary({directory,catalogue:[row],fetch:async()=>({ok:true,headers:new Headers(),body:{getReader(){let sent=false;return {async read(){if(sent)return {done:true};sent=true;return {done:false,value:Buffer.alloc(40*MiB)};},async cancel(){bodyRead();}};}}})});
  await library.init();assert.equal(library.get().bytes,960*MiB);
  // Resolve filesystem work within microtasks, so setImmediate drains a download
  // deterministically while the import's first copy is held; no timed sleep is used.
  for(const name of ['access','stat','readdir','readFile','writeFile','rename'])t.mock.method(fs,name,async(...args)=>sync[`${name}Sync`](...args));
  let first=true;
  t.mock.method(fs,'copyFile',async(...args)=>{if(first){first=false;copied();await holdImport;}sync.copyFileSync(...args);});
  const importing=library.importPack(pack);await copying;
  let settled=false;const downloading=library.response(row.model.skeleton).then(value=>{settled=true;return value;});
  await downloadRead;await new Promise(setImmediate);
  const completedDuringImport=settled;releaseImport();
  const [,response]=await Promise.all([importing,downloading]);
  assert.equal(completedDuringImport,false);
  assert.equal(response.status,503);
  assert.equal(library.get().entries.length,1);
  assert.equal(library.get().bytes,992*MiB+2);
  assert.equal(library.get().busy,false);
  assert.deepEqual((await fs.readdir(path.join(directory,'packs'))).filter(name=>name.startsWith('.importing-')),[]);
});

test('a failed import cleans temporary files and leaves the mutation queue usable',async t=>{
  const directory=await folder(t),exports=await folder(t);
  const source=createLibrary({directory:await folder(t),catalogue:[row],fetch:async()=>new Response('asset')});
  await source.init();await source.download(['a']);await source.exportPack(exports);
  const pack=path.join(exports,(await fs.readdir(exports))[0]);
  const library=createLibrary({directory,catalogue:[row],fetch:async()=>new Response('asset')});await library.init();
  const copy=t.mock.method(fs,'copyFile',async()=>{throw Error('Copy failed');});
  await library.importPack(pack);copy.mock.restore();
  assert.match(library.get().error,/Copy failed/);assert.equal(library.get().busy,false);
  assert.equal(library.get().bytes,0);assert.deepEqual(library.get().entries,[]);
  assert.deepEqual(await fs.readdir(path.join(directory,'packs')),[]);
  assert.equal((await library.response(row.model.skeleton)).status,200);
  await library.importPack(pack);
  assert.equal(library.get().entries.length,1);assert.equal(library.get().bytes,20);
});
