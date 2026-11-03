/**
 * The promise the skeleton makes: however far apart two poses are, the body
 * in between is the same body. If bones shrink or the ends drift, dragons
 * start to collapse mid-move again.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Acting, between, film, makeRig, type Beat, type Pose, type Shot } from '../src/gl/cinema/timeline.ts';

const COILED: Pose = [[0, 4, 6], [0, 5, 4], [1, 5, 2], [3, 4, 1], [4, 2, 1], [3, 0, 1], [1, -1, 1], [0, -3, 0], [1, -5, -1], [3, -6, -1]];
const STRETCHED: Pose = [[0, 1, 16], [0, 1.5, 14], [0, 2, 12], [0, 2.5, 10], [0, 3, 8], [0, 3, 6], [0, 2.5, 4], [0, 2, 2], [0, 1, 0], [0, 0, -2]];
const FLIPPED: Pose = [...COILED].reverse();

const beat = (pose: Pose, at = 0): Beat => ({ at, pose });
const length = (a: Acting) => a.ctrl.slice(1).reduce((sum, q, i) => sum + q.distanceTo(a.ctrl[i]), 0);
const posed = (p: Pose) => p.slice(1).reduce((sum, q, i) => sum + Math.hypot(q[0] - p[i][0], q[1] - p[i][1], q[2] - p[i][2]), 0);

test('a blend starts and ends exactly on its poses', () => {
  const out = new Acting(COILED.length);
  between(beat(COILED), beat(STRETCHED), 0, out);
  assert.deepEqual(out.ctrl[0].toArray(), [...COILED[0]]);
  between(beat(COILED), beat(STRETCHED), 1, out);
  assert.deepEqual(out.ctrl[3].toArray(), [...STRETCHED[3]]);
});

test('the body keeps its length all the way through a move', () => {
  for (const to of [STRETCHED, FLIPPED]) {
    const out = new Acting(COILED.length);
    const lo = Math.min(posed(COILED), posed(to));
    const hi = Math.max(posed(COILED), posed(to));
    for (let t = 0; t <= 1; t += 0.05) {
      between(beat(COILED), beat(to), t, out);
      const l = length(out);
      assert.ok(l >= lo - 1e-3 && l <= hi + 1e-3, `length ${l.toFixed(2)} left ${lo.toFixed(2)}‥${hi.toFixed(2)} at t=${t.toFixed(2)}`);
    }
  }
});

test('no joint jumps between frames', () => {
  const out = new Acting(COILED.length);
  const last = new Acting(COILED.length);
  between(beat(COILED), beat(STRETCHED), 0, last);
  for (let t = 0.01; t < 1; t += 0.01) {
    between(beat(COILED), beat(STRETCHED), t, out);
    for (let i = 0; i < out.ctrl.length; i++) assert.ok(out.ctrl[i].distanceTo(last.ctrl[i]) < 0.9, `joint ${i} jumped at t=${t.toFixed(2)}`);
    between(beat(COILED), beat(STRETCHED), t, last);
  }
});

test('the camera passes through a key without changing speed', () => {
  const shots: Shot[] = [
    { at: 0, pos: [0, 0, 0], look: [0, 0, -1], fov: 40 },
    { at: 0.1, pos: [2, 0, 0], look: [0, 0, -1], fov: 40 },
    { at: 0.8, pos: [9, 0, 0], look: [0, 0, -1], fov: 40 },
    { at: 1, pos: [10, 0, 0], look: [0, 0, -1], fov: 40 },
  ];
  const rig = makeRig();
  const at = (p: number) => {
    film(shots, p, rig);
    return rig.pos.x;
  };
  const e = 1e-4;
  const before = (at(0.1) - at(0.1 - e)) / e;
  const after = (at(0.1 + e) - at(0.1)) / e;
  assert.ok(Math.abs(before - after) < 0.02 * Math.abs(before), `speed changed from ${before.toFixed(2)} to ${after.toFixed(2)}`);
});
