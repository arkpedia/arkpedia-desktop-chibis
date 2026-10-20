import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chibiScale, chibiPlacement, chibiClip, finiteBounds } from '../src/lib/operators/chibiFraming.ts';

const idle = { x: -60, y: 0, width: 120, height: 200 };
const box = { left: 300, top: 400, width: 150, height: 150 * 1.125 };

test('scale comes from the idle pose and the box only', () => {
  // The old per-canvas renderer widened its camera to each clip's envelope, so a tap reaction
  // with larger bounds shrank the chibi. The scale has no animation input at all now.
  assert.equal(chibiScale.length, 3);
  const scale = chibiScale(idle, box.width, box.height);
  assert.ok(Math.abs(scale - box.height / (200 * 1.4)) < 1e-9);
  for (const moving of [false, true]) for (const reaction of ['', 'Interact', 'Special']) {
    chibiClip(['Relax', 'Move', 'Interact', 'Special'], 'Relax', 'Move', moving, reaction);
    assert.equal(chibiPlacement(idle, box, 900, false).scaleY, scale);
  }
});

test('a larger box scales up proportionally; a wide pose fits the width', () => {
  assert.ok(Math.abs(chibiScale(idle, 300, 337.5) / chibiScale(idle, 150, 168.75) - 2) < 1e-9);
  const wide = { x: -400, y: 0, width: 800, height: 100 };
  assert.ok(Math.abs(chibiScale(wide, 150, 168.75) * 800 * 1.4 - 150) < 1e-9);
});

test('the idle centre sits on the box centre, flipped or not', () => {
  for (const flipped of [false, true]) {
    const place = chibiPlacement(idle, box, 900, flipped);
    const worldX = place.x + (idle.x + idle.width / 2) * place.scaleX;
    const worldY = place.y + (idle.y + idle.height / 2) * place.scaleY;
    assert.ok(Math.abs(worldX - (box.left + box.width / 2)) < 1e-9);
    assert.ok(Math.abs(900 - worldY - (box.top + box.height / 2)) < 1e-9);
    assert.equal(Math.sign(place.scaleX), flipped ? -1 : 1);
  }
});

test('clip choice: walk while moving, a reaction once, else looping idle', () => {
  const names = ['Relax', 'Move', 'Interact'];
  assert.deepEqual(chibiClip(names, 'Relax', 'Move', true, ''), { clip: 'Move', loop: true });
  assert.deepEqual(chibiClip(names, 'Relax', 'Move', false, 'Interact'), { clip: 'Interact', loop: false });
  assert.deepEqual(chibiClip(names, 'Relax', 'Move', false, 'Missing'), { clip: 'Relax', loop: true });
  assert.deepEqual(chibiClip(names, 'Relax', undefined, true, ''), { clip: 'Relax', loop: true });
});

test('unmeasurable poses fall back to a sane box', () => {
  assert.equal(finiteBounds({ x: Infinity, y: 0, width: 1, height: 1 }).height, 300);
  assert.ok(Number.isFinite(chibiScale({ x: 0, y: 0, width: NaN, height: NaN }, 150, 168)));
});
