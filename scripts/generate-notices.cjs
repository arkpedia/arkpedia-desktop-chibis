// Copy ownership notices and the installed runtime dependencies' exact licenses
// into Vite's public directory, which is included in packaged dist/ builds.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
for (const name of ['LICENSE', 'NOTICE']) {
  fs.copyFileSync(path.join(root, name), path.join(root, 'public', `${name}.txt`));
}
const sections = [
  'Third-party software notices\n\nThese licenses apply to their respective components, not to Arknights game assets.\nElectron distributions also include notices for Chromium, Node.js and other components; preserve those accompanying files.',
  `Spine Runtimes 3.8 - Esoteric Software LLC\nSource: https://github.com/EsotericSoftware/spine-runtimes/tree/8b4844bd4b193ba9e54487ed397a777993cbad56\n\n${read('src/lib/vendor/spine-3.8/LICENSE')}`,
];
const seen=new Set();
function include(name,from,recursive=true) {
  const manifest=require.resolve(`${name}/package.json`,{paths:[from]});
  if(seen.has(manifest))return;seen.add(manifest);
  const directory=path.dirname(manifest),pkg=JSON.parse(fs.readFileSync(manifest,'utf8'));
  const license=fs.readdirSync(directory).find(file=>/^licen[cs]e(?:\.md|\.txt)?$/i.test(file));
  let text;
  if(license)text=fs.readFileSync(path.join(directory,license),'utf8');
  else if(pkg.name==='lazy-val'&&pkg.version==='1.0.5'&&pkg.license==='MIT'){
    // This published package and its upstream repository omit a LICENSE file.
    // Preserve their explicit SPDX declaration and author; reproduce standard MIT terms.
    const mit=read('node_modules/react/LICENSE');
    text=`Author: ${pkg.author}\nUpstream: https://github.com/develar/lazy-val\nThe package declares MIT in package.json; no separate license/copyright notice is supplied upstream. Standard MIT terms:\n\n${mit.slice(mit.indexOf('Permission is hereby granted'))}`;
  }else throw Error(`Missing license text for ${name}; review notices before shipping.`);
  sections.push(`${pkg.name} ${pkg.version}\n\n${text}`);
  if(recursive)for(const dependency of Object.keys(pkg.dependencies??{}).sort())include(dependency,directory);
}
include('electron',root,false);
const manifest=JSON.parse(read('package.json'));
for(const name of Object.keys(manifest.dependencies).sort())include(name,root);
fs.writeFileSync(path.join(root, 'THIRD-PARTY-NOTICES.txt'), sections.join('\n\n' + '='.repeat(72) + '\n\n').trimEnd() + '\n');
fs.copyFileSync(path.join(root, 'THIRD-PARTY-NOTICES.txt'), path.join(root, 'public/THIRD-PARTY-NOTICES.txt'));
// Keep the standalone notice identical to the license shipped with the vendor code.
fs.copyFileSync(path.join(root, 'src/lib/vendor/spine-3.8/LICENSE'), path.join(root, 'public/SPINE-LICENSE.txt'));
