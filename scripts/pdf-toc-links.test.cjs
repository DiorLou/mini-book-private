const { test } = require('node:test');
const assert = require('node:assert/strict');
const { groupDestinations } = require('./pdf-toc-links.cjs');

test('groups point to their first article, never the following sibling group', () => {
  assert.deepEqual(groupDestinations([
    { level: 1, title: 'stress, melody, rhythm' },
    { level: 2, title: 'Stress', slug: 'stress-melody-rhythm' },
    { level: 2, title: 'Questions', slug: 'questions' },
    { level: 1, title: 'Empty' },
    { level: 1, title: '发音基础' },
    { level: 2, title: 'Position', slug: 'position-before-sound' },
  ]), [
    { titles: ['stress, melody, rhythm'], slug: 'stress-melody-rhythm' },
    { titles: ['发音基础'], slug: 'position-before-sound' },
  ]);
});

test('nested groups and repeated names retain their full ancestor path', () => {
  assert.deepEqual(groupDestinations([
    { level: 1, title: '2025' },
    { level: 2, title: 'September' },
    { level: 3, title: 'Day', slug: '2025-09-01' },
    { level: 1, title: '2026' },
    { level: 2, title: 'September' },
    { level: 3, title: 'Day', slug: '2026-09-01' },
  ]), [
    { titles: ['2025'], slug: '2025-09-01' },
    { titles: ['2025', 'September'], slug: '2025-09-01' },
    { titles: ['2026'], slug: '2026-09-01' },
    { titles: ['2026', 'September'], slug: '2026-09-01' },
  ]);
});
