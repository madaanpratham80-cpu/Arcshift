import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeActivity } from '../dist/activity.js';

test('activity fills the last 365 calendar days across a leap day', () => {
  const result = summarizeActivity('2024-03-01', new Map([
    ['2023-03-02', 15], ['2023-03-03', 1], ['2024-02-28', 1],
    ['2024-02-29', 4], ['2024-03-02', 21],
  ]));
  assert.equal(result.days.length, 365);
  assert.equal(result.days[0].date, '2023-03-03');
  assert.equal(result.activeDays, 3);
  assert.equal(result.longestStreak, 2);
  assert.equal(result.currentStreak, 2);
  assert.deepEqual(result.days.at(-1), { date: '2024-03-01', count: 0 });
});

test('today extends a streak and days without consecutive activity reset it', () => {
  const counts = new Map([['2024-02-27', 1], ['2024-02-28', 1], ['2024-02-29', 3]]);
  assert.equal(summarizeActivity('2024-02-29', counts).currentStreak, 3);
  assert.equal(summarizeActivity('2024-03-02', counts).currentStreak, 0);
  assert.equal(summarizeActivity('2024-03-02', counts).longestStreak, 3);
});
