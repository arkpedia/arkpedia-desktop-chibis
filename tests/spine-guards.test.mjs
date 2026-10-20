import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'vendor' ? [] : sources(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}
const files = sources(path.join(root, 'src')).map(file => ({ file: path.relative(root, file), text: fs.readFileSync(file, 'utf8') }));

// spine-ts 3.8 blends Screen and Multiply slots as premultiplied whatever the flag, so a straight
// page drawn straight paints its transparent pixels (the website's Silent Night candle glow).
test('no renderer makes a Spine texture except through premultipliedTexture', () => {
  const offenders = files.filter(({ file, text }) => file !== path.join('src', 'lib', 'spine', 'premultipliedTexture.ts') && /new\s+spine\.webgl\.GLTexture\s*\(/.test(text));
  assert.deepEqual(offenders.map(({ file }) => file), []);
});

test('every skeleton is drawn premultiplied', () => {
  const offenders = files.flatMap(({ file, text }) => [...text.matchAll(/\.drawSkeleton\(\s*[\w.!]+\s*,\s*([^,)]+)/g)].filter(match => match[1].trim() !== 'true').map(match => `${file}: ${match[0]}`));
  assert.deepEqual(offenders, []);
  assert.ok(files.some(({ text }) => text.includes('.drawSkeleton(')));
});

// Browsers and Electron keep about 16 live WebGL contexts and drop the oldest: one context per
// chibi is why the website loses chibis above 15. Every chibi shares the stage's one context.
test('exactly one WebGL context and one scene renderer exist, both in the shared stage', () => {
  const contexts = files.flatMap(({ file, text }) => [...text.matchAll(/new\s+spine\.webgl\.ManagedWebGLRenderingContext\s*\(|getContext\(\s*['"](?:webgl2?|experimental-webgl)['"]/g)].map(() => file));
  const renderers = files.flatMap(({ file, text }) => [...text.matchAll(/new\s+spine\.webgl\.SceneRenderer\s*\(/g)].map(() => file));
  const stage = path.join('src', 'components', 'operators', 'ChibiStage.ts');
  assert.deepEqual(contexts, [stage]);
  assert.deepEqual(renderers, [stage]);
  const constructor = files.find(({ file }) => file === stage).text.match(/constructor\([\s\S]*?\n  }\n/)[0];
  assert.match(constructor, /ManagedWebGLRenderingContext/, 'created once per stage, not per chibi');
  assert.match(constructor, /premultipliedAlpha: true/);
  const app = files.find(({ file }) => file === path.join('src', 'main.tsx')).text;
  assert.equal((app.match(/new ChibiStage\(/g) || []).length, 1);
});

test('the chibi limit is above the old context ceiling and shared with the main process', async () => {
  const { maxChibis } = JSON.parse(fs.readFileSync(path.join(root, 'electron', 'limits.json'), 'utf8'));
  assert.ok(maxChibis >= 16);
  const app = files.find(({ file }) => file === path.join('src', 'main.tsx')).text;
  assert.match(app, /MAX_CHIBIS = limits\.maxChibis/);
  assert.doesNotMatch(app, /pets\.length\s*>=\s*\d/);
});
