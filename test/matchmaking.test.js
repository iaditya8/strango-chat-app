const test = require('node:test');
const assert = require('node:assert/strict');

const { addToQueue, removeFromQueue, findMatchFor } = require('../server/matchmaking');

test('findMatchFor prefers exact country and gender matches', () => {
  removeFromQueue('a');
  removeFromQueue('b');
  removeFromQueue('c');

  addToQueue('a', 'IN', 'female', -330);
  addToQueue('b', 'US', 'female', 300);

  const match = findMatchFor('c', 'IN', 'female', -330);
  assert.equal(match, 'a');

  removeFromQueue('b');
});

test('removeFromQueue prevents stale users from matching', () => {
  removeFromQueue('stale');
  addToQueue('stale', 'IN', 'any', -330);
  removeFromQueue('stale');

  const match = findMatchFor('new-user', 'IN', 'any', -330);
  assert.notEqual(match, 'stale');
});
