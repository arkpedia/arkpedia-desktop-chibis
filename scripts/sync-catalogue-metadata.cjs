const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const directory=process.argv[2];
if(!directory)throw Error('Usage: node scripts/sync-catalogue-metadata.cjs <arkpedia-data directory>');
const source=fs.readFileSync(path.join(directory,'skins.json'),'utf8'),skins=JSON.parse(source);
const catalogue=require('../src/catalogue.json');
const byId=new Map(skins.map(row=>[row.skinId,row]));
const metadata=Object.fromEntries(catalogue.flatMap(row=>{
  const skin=byId.get(row.id);
  return skin?.series?[[row.id,skin.series]]:[];
}));
fs.writeFileSync(path.join(__dirname,'../src/catalogue-metadata.json'),JSON.stringify(metadata,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'../src/catalogue-metadata-source.json'),JSON.stringify({source:'Arkpedia website data/skins.json',sha256:crypto.createHash('sha256').update(source).digest('hex')},null,2)+'\n');
