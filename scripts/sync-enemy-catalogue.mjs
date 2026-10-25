import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spine } from '../src/lib/vendor/spine-3.8/spine-webgl.js';

// Run against a downloaded, immutable manifest and its corresponding asset checkout.
const [manifestFile, revision, assetRoot, dataRoot] = process.argv.slice(2);
if (!manifestFile || !/^[a-f0-9]{40}$/.test(revision ?? '') || !assetRoot || !dataRoot)
  throw Error('Usage: node scripts/sync-enemy-catalogue.mjs <manifest.json> <SD commit> <asset checkout> <website data directory>');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const raw = fs.readFileSync(manifestFile), manifest = JSON.parse(raw);
const names = new Map(), nameSources = [];
for (const file of fs.readdirSync(path.join(dataRoot, 'enemies')).filter(f => f.endsWith('.json')).sort()) {
  const bytes = fs.readFileSync(path.join(dataRoot, 'enemies', file));
  nameSources.push({ file, sha256: hash(bytes) });
  for (const enemy of JSON.parse(bytes).enemies ?? []) if (typeof enemy.id === 'string' && typeof enemy.name === 'string') names.set(enemy.id, enemy.name);
}
const url = file => `https://raw.githubusercontent.com/arkpedia/arkpedia-sd-assets/${revision}/${file}`;
const read = file => {
  if (!/^models\/enemy\/[a-zA-Z0-9_./#-]+$/.test(file.path) || file.path.split('/').includes('..')) throw Error('Unsafe enemy asset path');
  const bytes = fs.readFileSync(path.join(assetRoot, file.path));
  if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw Error(`Asset hash differs: ${file.path}`);
  return bytes;
};
const entries = [], checks = [];
for (const row of Object.values(manifest.models).filter(row => row.kind === 'enemy')) {
  if (row.spineVersion !== '3.8.99' || !/^enemy_[a-z0-9_]+$/.test(row.id)) throw Error('Unsupported enemy model');
  // This pinned Ark-Models export enforces PMA for every texture (README, March 2025 change).
  // Do not silently guess the alpha convention for other imports or later revisions.
  const alpha = typeof row.premultipliedAlpha === 'boolean' ? row.premultipliedAlpha
    : row.source.repository === 'isHarryh/Ark-Models' && row.source.commit === 'e65fb9147846b64bcf2df956b8cd8da77a51b9b8' ? true : null;
  if (alpha === null) throw Error(`Unknown alpha convention: ${row.id}`);
  const skeleton = read(row.skeleton), atlasBytes = read(row.atlas), pages = new Map();
  for (const file of row.textures) pages.set(path.posix.basename(file.path), read(file));
  const atlas = new spine.TextureAtlas(atlasBytes.toString('utf8').replace(/^[\t ]*pma:[\t ]*(?:true|false)[\t ]*(?:\r?\n|$)/gm, ''), name => {
    const png = pages.get(name); if (!png || png.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw Error(`Missing PNG page ${name}`);
    return { setFilters() {}, setWraps() {}, getImage: () => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }), dispose() {} };
  });
  const loader = new spine.AtlasAttachmentLoader(atlas);
  const data = skeleton.toString('utf8', 0, 64).trimStart().startsWith('{')
    ? new spine.SkeletonJson(loader).readSkeletonData(JSON.parse(skeleton))
    : new spine.SkeletonBinary(loader).readSkeletonData(Uint8Array.from(skeleton));
  if (!data.animations.some(a => /^(?:[a-z]_)?idle(?:[_\d].*)?$/i.test(a.name))) throw Error(`No idle animation: ${row.id}`);
  const actor = new spine.Skeleton(data), state = new spine.AnimationState(new spine.AnimationStateData(data));
  for (const animation of data.animations) {
    state.setAnimation(0, animation.name, false);
    for (let sample = 0; sample < 5; sample++) { state.update(animation.duration / 4); state.apply(actor); actor.updateWorldTransform(); }
  }
  entries.push({ id: row.id, name: names.get(row.id) ?? row.id, kind: 'enemy', model: {
    skeleton: url(row.skeleton.path), atlas: url(row.atlas.path),
    textures: Object.fromEntries(row.textures.map(file => [path.posix.basename(file.path), url(file.path)])), premultipliedAlpha: alpha,
  } });
  checks.push({ id: row.id, source: row.source, files: [row.skeleton, row.atlas, ...row.textures], animations: data.animations.map(a => a.name) });
}
const catalogueFile = path.join(root, 'src/catalogue.json');
const catalogue = JSON.parse(fs.readFileSync(catalogueFile)).filter(row => row.kind !== 'enemy');
entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
if (new Set([...catalogue, ...entries].map(row => row.id)).size !== catalogue.length + entries.length) throw Error('Duplicate catalogue ID');
fs.writeFileSync(catalogueFile, JSON.stringify([...catalogue, ...entries], null, 2) + '\n');
fs.writeFileSync(path.join(root, 'src/enemy-catalogue-source.json'), JSON.stringify({
  repository: 'arkpedia/arkpedia-sd-assets', commit: revision, manifestSha256: hash(raw),
  alphaPolicy: 'Explicit manifest flags; otherwise only the pinned Ark-Models e65fb914 export, which enforces PMA per its README March 2025 change.',
  alphaSource: 'https://github.com/isHarryh/Ark-Models/blob/e65fb9147846b64bcf2df956b8cd8da77a51b9b8/README.md',
  names: { source: 'Arkpedia website data/enemies, exact enemy IDs; unmatched IDs retained', files: nameSources },
  models: checks,
}, null, 2) + '\n');
console.log(`Added ${entries.length} enemy models; all file hashes, atlas pages and animation tracks verified.`);
