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
for (const name of ['electron', 'react', 'react-dom', 'scheduler', 'loose-envify', 'js-tokens']) {
  const directory = `node_modules/${name}`;
  const pkg = JSON.parse(read(`${directory}/package.json`));
  sections.push(`${name} ${pkg.version}\n\n${read(`${directory}/LICENSE`)}`);
}
fs.writeFileSync(path.join(root, 'THIRD-PARTY-NOTICES.txt'), sections.join('\n\n' + '='.repeat(72) + '\n\n').trimEnd() + '\n');
fs.copyFileSync(path.join(root, 'THIRD-PARTY-NOTICES.txt'), path.join(root, 'public/THIRD-PARTY-NOTICES.txt'));
// Keep the standalone notice identical to the license shipped with the vendor code.
fs.copyFileSync(path.join(root, 'src/lib/vendor/spine-3.8/LICENSE'), path.join(root, 'public/SPINE-LICENSE.txt'));
