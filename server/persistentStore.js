const fs = require('fs');
const path = require('path');

const DATA_FILE = process.env.STRANGO_DATA_FILE ||
  path.join(__dirname, 'data', 'strango-state.json');

const DEFAULT_STATE = {
  reports: {},
  bans: {},
  ratings: {},
  appeals: {},
  auditLog: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class PersistentStore {
  constructor(filePath = DATA_FILE) {
    this.filePath = filePath;
    this.state = clone(DEFAULT_STATE);
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.state = {
        ...clone(DEFAULT_STATE),
        ...parsed,
        reports: parsed.reports || {},
        bans: parsed.bans || {},
        ratings: parsed.ratings || {},
        appeals: parsed.appeals || {},
        auditLog: parsed.auditLog || []
      };
    } catch (err) {
      console.warn(`Persistent store could not be loaded: ${err.message}`);
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  audit(action, details = {}) {
    this.state.auditLog.push({
      action,
      details,
      timestamp: Date.now()
    });
    if (this.state.auditLog.length > 1000) {
      this.state.auditLog = this.state.auditLog.slice(-1000);
    }
  }

  getReportCount(userId) {
    return this.state.reports[userId]?.count || 0;
  }

  addReport(offenderId, reporterId, reason = 'user-report') {
    const record = this.state.reports[offenderId] || { count: 0, events: [] };
    record.count += 1;
    record.events.push({ reporterId, reason, timestamp: Date.now() });
    record.events = record.events.slice(-50);
    this.state.reports[offenderId] = record;
    this.audit('report.created', { offenderId, reporterId, reason });
    this.save();
    return record.count;
  }

  banUser(userId, reason, durationMs, source = 'system') {
    const expiresAt = Date.now() + durationMs;
    this.state.bans[userId] = {
      userId,
      reason,
      source,
      createdAt: Date.now(),
      expiresAt
    };
    this.audit('ban.created', { userId, reason, source, expiresAt });
    this.save();
    return this.state.bans[userId];
  }

  unbanUser(userId, source = 'system') {
    delete this.state.bans[userId];
    this.audit('ban.removed', { userId, source });
    this.save();
  }

  getBan(userId) {
    const ban = this.state.bans[userId];
    if (!ban) return null;
    if (ban.expiresAt && ban.expiresAt <= Date.now()) {
      delete this.state.bans[userId];
      this.audit('ban.expired', { userId });
      this.save();
      return null;
    }
    return ban;
  }

  listBans() {
    return Object.values(this.state.bans).filter(ban => this.getBan(ban.userId));
  }

  addRating(userId, rating, comment, fromUserId) {
    const record = this.state.ratings[userId] || { ratings: [], averageRating: 0 };
    record.ratings.push({
      rating,
      comment: comment || '',
      fromUserId,
      timestamp: Date.now()
    });
    record.ratings = record.ratings.slice(-100);
    const total = record.ratings.reduce((sum, item) => sum + item.rating, 0);
    record.averageRating = total / record.ratings.length;
    this.state.ratings[userId] = record;
    this.audit('rating.created', { userId, fromUserId, rating });
    this.save();
    return record;
  }

  listRatings() {
    return this.state.ratings;
  }

  createAppeal(appeal) {
    this.state.appeals[appeal.id] = {
      ...appeal,
      status: 'pending',
      timestamp: Date.now()
    };
    this.audit('appeal.created', { appealId: appeal.id, userId: appeal.userId });
    this.save();
    return this.state.appeals[appeal.id];
  }

  getAppeal(appealId) {
    return this.state.appeals[appealId] || null;
  }

  updateAppeal(appealId, changes) {
    if (!this.state.appeals[appealId]) return null;
    this.state.appeals[appealId] = {
      ...this.state.appeals[appealId],
      ...changes,
      reviewedAt: Date.now()
    };
    this.audit('appeal.updated', { appealId, status: changes.status });
    this.save();
    return this.state.appeals[appealId];
  }

  listAppeals() {
    return Object.values(this.state.appeals);
  }
}

module.exports = {
  PersistentStore,
  DATA_FILE
};
