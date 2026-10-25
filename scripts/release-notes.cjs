const fs=require('node:fs');
const path=require('node:path');
function releaseNotes(tag) {
  if(!/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(tag))throw Error('Expected a version tag');
  const root='https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/';
  const downloads=[['macOS · Apple Silicon','mac-arm64.dmg'],['macOS · Intel','mac-x64.dmg'],['Windows · 64-bit','win-x64.exe'],['Windows · ARM64','win-arm64.exe'],['Linux · x64','linux-x86_64.AppImage'],['Linux · ARM64','linux-arm64.AppImage']];
  const notes=path.join(__dirname,'../docs/releases',`RELEASE-${tag.slice(1)}.md`);
  return 'Unofficial, noncommercial Arknights fan project. Not affiliated with or endorsed by Hypergryph or Yostar. Game assets belong to their respective rights holders.\n\n'+
    '**Direct downloads:**\n'+downloads.map(([name,file])=>`[${name}](${root}Arkpedia-Chibis-Dev-${file})`).join(' ·\n')+`\n\n[SHA-256 checksums](${root}SHA256SUMS.txt). For a standard Windows PC, choose **64-bit**.\n\n`+
    (fs.existsSync(notes)?fs.readFileSync(notes,'utf8')+'\n':'');
}
if(require.main===module)fs.writeFileSync(process.argv[3],releaseNotes(process.argv[2]));
module.exports={releaseNotes};
