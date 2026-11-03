import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ageOn, educationOn } from '../src/data/profile.ts';

// [instant (UTC), expected age, expected education label fragment]
const cases: [string, number, string][] = [
  ['2026-10-31T12:00:00Z', 17, '1st year'],
  ['2027-04-02T18:29:00Z', 17, '1st year'], // 23:59 IST, 2 April
  ['2027-04-02T18:30:00Z', 18, '1st year'], // 00:00 IST, 3 April — birthday
  ['2027-05-31T18:29:00Z', 18, '1st year'], // 23:59 IST, 31 May
  ['2027-05-31T18:30:00Z', 18, '2nd year'], // 00:00 IST, 1 June — new academic year
  ['2028-03-15T00:00:00Z', 18, '2nd year'],
  ['2028-06-01T06:00:00Z', 19, '3rd year'],
  ['2029-05-31T06:00:00Z', 20, '3rd year'],
  ['2029-06-01T06:00:00Z', 20, 'graduate'],
  ['2031-01-01T06:00:00Z', 21, 'graduate'],
];

for (const [iso, age, edu] of cases) {
  test(`profile on ${iso}`, () => {
    const date = new Date(iso);
    assert.equal(ageOn(date), age);
    assert.match(educationOn(date).label, new RegExp(edu));
  });
}

test('academic year label follows the June switch', () => {
  const e = educationOn(new Date('2027-07-01T00:00:00Z'));
  assert.equal(e.status, 'studying');
  if (e.status === 'studying') assert.equal(e.academicYear, '2027–28');
});
