const { PersistentStore } = require('./persistentStore');

// Store interface:
// - getReportCount(userId)
// - addReport(offenderId, reporterId, reason?)
// - banUser(userId, reason, durationMs, source?)
// - unbanUser(userId, source?)
// - getBan(userId)
// - listBans()
// - addRating(userId, rating, comment, fromUserId)
// - listRatings()
// - createAppeal(appeal)
// - getAppeal(appealId)
// - updateAppeal(appealId, changes)
// - listAppeals()

function createStore() {
  // Full DB alignment requires an external DB service. We support it when configured,
  // but keep JSON as a safe local/dev default.
  if (process.env.DATABASE_URL) {
    try {
      // Lazy require so local dev doesn't need pg installed.
      const { PostgresStore } = require('./stores/postgresStore');
      return wrapStore(new PostgresStore(process.env.DATABASE_URL));
    } catch (err) {
      console.warn(`Postgres store unavailable, falling back to JSON store: ${err.message}`);
    }
  }

  return wrapStore(new PersistentStore());
}

function wrapStore(store) {
  const methods = [
    'getReportCount',
    'addReport',
    'banUser',
    'unbanUser',
    'getBan',
    'listBans',
    'addRating',
    'listRatings',
    'createAppeal',
    'getAppeal',
    'updateAppeal',
    'listAppeals'
  ];

  const wrapped = {};
  for (const method of methods) {
    if (typeof store[method] !== 'function') {
      throw new Error(`Store is missing method: ${method}`);
    }
    wrapped[method] = async (...args) => store[method](...args);
  }
  return wrapped;
}

module.exports = { createStore };
