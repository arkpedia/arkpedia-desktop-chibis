const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const MAX_FILE = 64 * 1024 * 1024, MAX_CACHE = 1024 * 1024 * 1024;
const filesOf = row => [row.model.skeleton,row.model.atlas,...Object.values(row.model.textures)];
const mime = file => /\.svg$/i.test(file)?'image/svg+xml':/\.png$/i.test(file)?'image/png':/\.webp$/i.test(file)?'image/webp':/\.jpe?g$/i.test(file)?'image/jpeg':'application/octet-stream';

function createLibrary({directory,catalogue,fetch,extras=[],changed=()=>{}}) {
  const cache=path.join(directory,'cache'), packs=path.join(directory,'packs');
  const entries=new Map(catalogue.map(row=>[row.id,row])), resources=new Map(), pending=new Map();
  let state={entries:[],downloaded:[],bytes:0,busy:false,completed:0,total:0}, mutating=false;
  const publish=patch=>{state={...state,...patch};changed({...state});};
  for(const url of [...new Set([...catalogue.flatMap(filesOf),...extras])]) {
    // Only immutable assets explicitly present in the bundled catalogue are fetched.
    if(!/^https:\/\/raw\.githubusercontent\.com\/arkpedia\/arkpedia-sd-assets\/[a-f0-9]{40}\//.test(url)) throw Error('Catalogue contains an unpinned asset');
    resources.set(url,{file:path.join(cache,digest(url)),type:mime(url),remote:url});
  }
  const refresh=async()=>{
    let bytes=0;
    const existing=new Set();
    const cached=new Set(await fs.readdir(cache).catch(()=>[])),counted=new Set();
    for(const name of cached)if(/^[a-f0-9]{64}$/.test(name)){const file=path.join(cache,name);try{bytes+=(await fs.stat(file)).size;counted.add(file);}catch{}}
    for(const [key,resource] of resources) {if(resource.remote&&!cached.has(path.basename(resource.file)))continue;try{const stat=await fs.stat(resource.file);if(stat.isFile()){existing.add(key);if(!counted.has(resource.file)){bytes+=stat.size;counted.add(resource.file);}}}catch{}}
    // Resources may be shared by many entries; each file is counted once.
    publish({bytes,downloaded:[...entries.values()].filter(row=>[...filesOf(row),...(row.id.startsWith('import:')?[]:extras)].every(url=>existing.has(url))).map(row=>row.id),entries:[...entries.values()].filter(row=>row.id.startsWith('import:'))});
  };
  const init=async()=>{
    await fs.mkdir(cache,{recursive:true}); await fs.mkdir(packs,{recursive:true});
    for(const name of await fs.readdir(packs)) {
      if(!/^[a-f0-9]{64}$/.test(name))continue;
      try{const pack=JSON.parse(await fs.readFile(path.join(packs,name,'manifest.json'),'utf8'));registerPack(name,pack);}catch{}
    }
    await refresh();
  };
  function registerPack(id,pack) {
    if(pack.version!==1||!Array.isArray(pack.entries)||!pack.entries.length||pack.entries.length>1000)throw Error('Invalid stored pack');
    for(const row of pack.entries){
      if(typeof row.name!=='string'||!row.name||row.name.length>200||!row.model||!row.model.textures||typeof row.model.textures!=='object'||Object.keys(row.model.textures).length>32)throw Error('Invalid stored model');
      if(!filesOf(row).every(file=>typeof file==='string'&&/^assets\/[a-zA-Z0-9_.-]+\.(skel|json|atlas|png|webp|jpg|jpeg)$/.test(file)))throw Error('Invalid stored file path');
    }
    for(const [url,file] of Object.entries(pack.resources??{}))if(extras.includes(url)&&/^assets\/[a-zA-Z0-9_.-]+\.(png|svg)$/.test(file))resources.set(url,{file:path.join(packs,id,file),type:mime(file)});
    for(const [i,row] of pack.entries.entries()) {
      const model={skeleton:`local:${id}/${row.model.skeleton}`,atlas:`local:${id}/${row.model.atlas}`,textures:Object.fromEntries(Object.entries(row.model.textures).map(([name,file])=>[name,`local:${id}/${file}`])),premultipliedAlpha:row.model.premultipliedAlpha===true};
      const entry={id:`import:${id}:${i}`,name:row.name,kind:row.kind??'operator',brand:row.brand??'',model};
      entries.set(entry.id,entry);
      for(const url of filesOf(entry)) {const file=url.slice(`local:${id}/`.length);resources.set(url,{file:path.join(packs,id,file),type:mime(file)});}
    }
  }
  const ensure=async url=>{
    const resource=resources.get(url);if(!resource)throw Error('Unknown library asset');
    try{await fs.access(resource.file);return resource;}catch{}
    if(!resource.remote)throw Error('Imported model file is missing');
    if(pending.has(url))return pending.get(url);
    const work=(async()=>{
      const response=await fetch(resource.remote,{signal:AbortSignal.timeout(60000)});
      if(!response.ok||!response.body)throw Error('Asset download failed');
      if(Number(response.headers.get('content-length'))>MAX_FILE)throw Error('Model file exceeds 64 MB');
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_FILE)throw Error('Model file exceeds 64 MB');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
      if(!size)throw Error('Empty model file');
      // Serialize writes and measure actual disk usage to enforce the shared quota.
      await writes(async()=>{
        if(state.bytes+size>MAX_CACHE)throw Error('Library limit is 1 GB. Clear downloaded cache to make room.');
        const temporary=resource.file+'.tmp';await fs.writeFile(temporary,Buffer.concat(chunks));await fs.rename(temporary,resource.file);
        publish({bytes:state.bytes+size});
      });
      return resource;
    })();
    pending.set(url,work);try{return await work;}finally{pending.delete(url);}
  };
  let writeQueue=Promise.resolve();
  const writes=action=>{const next=writeQueue.then(action);writeQueue=next.catch(()=>{});return next;};
  return {
    init,get:()=>({...state}),
    async response(url){try{const resource=await ensure(url);const bytes=await fs.readFile(resource.file);if(!pending.size)await refresh();return new Response(bytes,{headers:{'Content-Type':resource.type}});}catch{return new Response('Asset unavailable',{status:503});}},
    async download(ids){
      if(mutating||!Array.isArray(ids)||ids.length>32)return;
      const selected=ids.map(id=>entries.get(id)).filter(Boolean);if(!selected.length)return;
      mutating=true;const queue=[...new Set([...selected.flatMap(filesOf),...extras])];publish({busy:true,completed:0,total:queue.length,error:undefined});
      try{const results=await Promise.allSettled(Array.from({length:3},async()=>{while(queue.length){const url=queue.shift();if(!url)break;await ensure(url);publish({completed:state.completed+1});}}));const failure=results.find(row=>row.status==='rejected');if(failure)throw failure.reason;}
      catch(error){publish({error:error.message});}
      finally{mutating=false;publish({busy:false});await refresh();}
    },
    async clear(){
      if(mutating||pending.size){publish({error:'Wait for model loading or library operations to finish before clearing the cache.'});return;}
      mutating=true;publish({busy:true,completed:0,total:0,error:undefined});
      try{await fs.rm(cache,{recursive:true,force:true});await fs.mkdir(cache,{recursive:true});await refresh();}
      catch(error){publish({error:error.message});}finally{mutating=false;publish({busy:false});}
    },
    async removePack(entryId){
      if(mutating||!entries.has(entryId)||!/^import:[a-f0-9]{64}:\d+$/.test(entryId))return;
      const id=entryId.split(':')[1];mutating=true;publish({busy:true,completed:0,total:0,error:undefined});
      try{
        await fs.rm(path.join(packs,id),{recursive:true,force:true});
        for(const [key,entry] of entries)if(key.startsWith(`import:${id}:`)){for(const url of filesOf(entry))resources.delete(url);entries.delete(key);}
        // Restore normal remote lookup for furniture supplied by this pack.
        for(const url of extras){const current=resources.get(url);if(current?.file.startsWith(path.join(packs,id)+path.sep))resources.set(url,{file:path.join(cache,digest(url)),type:mime(url),remote:url});}
        await refresh();
      }catch(error){publish({error:error.message});}finally{mutating=false;publish({busy:false});}
    },
    async importPack(folder){
      if(mutating)return;mutating=true;publish({busy:true,completed:0,total:0,error:undefined});
      let destination;
      try{
        const root=await fs.realpath(folder),manifest=path.join(root,'manifest.json');
        if((await fs.stat(manifest)).size>2*1024*1024)throw Error('Manifest is too large');
        const text=await fs.readFile(manifest,'utf8');
        const pack=JSON.parse(text);
        if(pack.version!==1||!Array.isArray(pack.entries)||!pack.entries.length||pack.entries.length>1000)throw Error('Expected a version 1 model-pack manifest (1–1000 entries).');
        const files=new Set();
        if(pack.resources!==undefined&&(!pack.resources||typeof pack.resources!=='object'||Array.isArray(pack.resources)))throw Error('Invalid additional resources');
        for(const [url,file] of Object.entries(pack.resources??{})){
          if(!extras.includes(url)||typeof file!=='string'||!/^assets\/[a-zA-Z0-9_.-]+\.(png|svg)$/.test(file))throw Error('Unknown additional resource');
          files.add(file);
        }
        for(const row of pack.entries){
          if(typeof row.name!=='string'||!row.name||row.name.length>200||!row.model||typeof row.model.premultipliedAlpha!=='boolean')throw Error('Invalid model entry');
          if(!['operator','outfit','enemy','illustration'].includes(row.kind??'operator')||typeof(row.brand??'')!=='string'||(row.brand??'').length>200)throw Error('Invalid model category or brand');
          if(!row.model.textures||typeof row.model.textures!=='object'||Array.isArray(row.model.textures)||Object.keys(row.model.textures).length>32)throw Error('Invalid textures');
          for(const name of Object.keys(row.model.textures))if(!name||name.length>200||name==='__proto__')throw Error('Invalid texture page name');
          for(const file of filesOf(row)){
            if(typeof file!=='string'||!/^assets\/[a-zA-Z0-9_.-]+\.(skel|json|atlas|png|webp|jpg|jpeg)$/.test(file))throw Error('Model files must be inside assets/ with a supported extension.');
            files.add(file);
          }
        }
        const verified=[];let size=0;const hash=crypto.createHash('sha256');hash.update(text);
        for(const file of files){const actual=await fs.realpath(path.join(root,file));if(!actual.startsWith(root+path.sep))throw Error('Model file escapes the pack folder');const stat=await fs.stat(actual);if(!stat.isFile()||!stat.size||stat.size>MAX_FILE)throw Error('Model file must be between 1 byte and 64 MB');size+=stat.size;if(size>MAX_CACHE)throw Error('Model pack exceeds 1 GB');hash.update(await fs.readFile(actual));verified.push([file,actual]);}
        const id=hash.digest('hex'),finalPath=path.join(packs,id);
        try{await fs.access(path.join(finalPath,'manifest.json'));await refresh();return;}catch(error){if(error.code!=='ENOENT')throw error;}
        await refresh();if(state.bytes+size>MAX_CACHE)throw Error('Library limit is 1 GB. Clear downloaded cache to make room.');
        destination=path.join(packs,`.importing-${crypto.randomUUID()}`);
        await fs.mkdir(path.join(destination,'assets'),{recursive:true});
        for(const [file,actual] of verified)await fs.copyFile(actual,path.join(destination,file));
        await fs.writeFile(path.join(destination,'manifest.json'),text);await fs.rename(destination,finalPath);registerPack(id,pack);destination=undefined;await refresh();
      }catch(error){if(destination)await fs.rm(destination,{recursive:true,force:true});publish({error:error.message});}
      finally{mutating=false;publish({busy:false});}
    },
    async exportPack(folder){
      if(mutating)return;mutating=true;publish({busy:true,completed:0,total:0,error:undefined});
      let destination;
      try{
        await refresh();const rows=state.downloaded.map(id=>entries.get(id));if(!rows.length)throw Error('Download a model before exporting.');
        destination=path.join(folder,`Arkpedia-model-pack-${Date.now()}`);await fs.mkdir(path.join(destination,'assets'),{recursive:true});
        const exported=[];
        for(const row of rows){
          const convert=async url=>{const resource=resources.get(url);const extension=path.extname(url).split('?')[0]||'.skel';const file=`assets/${digest(url)}${extension}`;await fs.copyFile(resource.file,path.join(destination,file));return file;};
          const textures={};for(const [name,url] of Object.entries(row.model.textures))textures[name]=await convert(url);
          exported.push({name:row.name,kind:row.kind??(row.id.includes('@')?'outfit':'operator'),brand:row.brand??'',model:{skeleton:await convert(row.model.skeleton),atlas:await convert(row.model.atlas),textures,premultipliedAlpha:row.model.premultipliedAlpha}});
        }
        const extraFiles={};
        for(const url of extras){const resource=resources.get(url);try{const file=`assets/${digest(url)}${path.extname(url)}`;await fs.copyFile(resource.file,path.join(destination,file));extraFiles[url]=file;}catch{}}
        await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify({version:1,entries:exported,resources:extraFiles},null,2));
        publish({error:undefined});destination=undefined;
      }catch(error){if(destination)await fs.rm(destination,{recursive:true,force:true});publish({error:error.message});}
      finally{mutating=false;publish({busy:false});}
    },
  };
}
module.exports={createLibrary,filesOf};
