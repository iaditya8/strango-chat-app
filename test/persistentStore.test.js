const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { PersistentStore } = require('../server/persistentStore');

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strango-store-'));
  return new PersistentStore(path.join(dir, 'state.json'));
}

test('reports persist and escalate into durable counts', () => {
  const store = tempStore();

  assert.equal(store.getReportCount('bad-user'), 0);
  assert.equal(store.addReport('bad-user', 'reporter-1'), 1);
  assert.equal(store.addReport('bad-user', 'reporter-2'), 2);
  assert.equal(store.getReportCount('bad-user'), 2);
});

test('expired bans are cleared when read', () => {
  const store = tempStore();
  const ban = store.banUser('user-1', 'test ban', 60_000, 'test');

  assert.equal(store.getBan('user-1').userId, ban.userId);

  store.state.bans['user-1'].expiresAt = Date.now() - 1;
  assert.equal(store.getBan('user-1'), null);
});

test('ratings maintain an average', () => {
  const store = tempStore();

  store.addRating('rated-user', 5, '', 'a');
  const ratings = store.addRating('rated-user', 3, '', 'b');

  assert.equal(ratings.ratings.length, 2);
  assert.equal(ratings.averageRating, 4);
});
