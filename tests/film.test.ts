/**
 * The film is timed against the 3D performance by hand. These tests keep the
 * script honest when lines are edited: a subtitle must fit its chapter, play
 * in order, and never overlap the next one.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FILM, STAGES } from '../src/data/content.ts';

test('every dragon has a film', () => {
  assert.equal(FILM.length, STAGES.length);
});

for (const [i, chapter] of FILM.entries()) {
  const who = STAGES[i].dragon;

  test(`${who}: lines play in order and stay inside the film`, () => {
    assert.ok(chapter.lines.length >= 3, 'needs at least three lines');
    let previous = chapter.card[1];
    for (const line of chapter.lines) {
      assert.ok(line.at >= previous, `"${line.text}" starts before the previous line or card ends`);
      assert.ok(line.to > line.at, `"${line.text}" has no length`);
      assert.ok(line.to <= 1, `"${line.text}" runs past the end of the film`);
      previous = line.to;
    }
  });

  test(`${who}: lines are short enough to read in their window`, () => {
    for (const line of chapter.lines) {
      const words = line.text.split(' ').length;
      assert.ok(words <= 20, `"${line.text}" is too long for a subtitle`);
      assert.ok(!line.text.includes('—'), `"${line.text}" should not lean on a dash`);
    }
  });
}
