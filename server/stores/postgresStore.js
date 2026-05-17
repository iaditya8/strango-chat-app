const { Client } = require('pg');

class PostgresStore {
  constructor(databaseUrl) {
    this.client = new Client({ connectionString: databaseUrl });
    this._ready = this.client.connect().then(() => this._migrate());
  }

  async _migrate() {
    await this.client.query(`
      create table if not exists strango_reports (
        user_id text primary key,
        count integer not null default 0,
        events jsonb not null default '[]'::jsonb
      );
    `);

    await this.client.query(`
      create table if not exists strango_bans (
        user_id text primary key,
        reason text not null,
        source text not null,
        created_at bigint not null,
        expires_at bigint not null
      );
    `);

    await this.client.query(`
      create table if not exists strango_ratings (
        user_id text primary key,
        average_rating double precision not null default 0,
        ratings jsonb not null default '[]'::jsonb
      );
    `);

    await this.client.query(`
      create table if not exists strango_appeals (
        id text primary key,
        payload jsonb not null
      );
    `);
  }

  async _q(text, params) {
    await this._ready;
    return this.client.query(text, params);
  }

  async getReportCount(userId) {
    const res = await this._q('select count from strango_reports where user_id = $1', [userId]);
    return res.rows[0]?.count || 0;
  }

  async addReport(offenderId, reporterId, reason = 'user-report') {
    const now = Date.now();
    const res = await this._q('select count, events from strango_reports where user_id = $1', [offenderId]);
    const current = res.rows[0] || { count: 0, events: [] };
    const events = Array.isArray(current.events) ? current.events : [];
    events.push({ reporterId, reason, timestamp: now });
    const clippedEvents = events.slice(-50);
    const nextCount = (current.count || 0) + 1;

    await this._q(
      `insert into strango_reports(user_id, count, events)
       values($1, $2, $3::jsonb)
       on conflict (user_id) do update set count = excluded.count, events = excluded.events`,
      [offenderId, nextCount, JSON.stringify(clippedEvents)]
    );
    return nextCount;
  }

  async banUser(userId, reason, durationMs, source = 'system') {
    const createdAt = Date.now();
    const expiresAt = createdAt + durationMs;
    await this._q(
      `insert into strango_bans(user_id, reason, source, created_at, expires_at)
       values($1, $2, $3, $4, $5)
       on conflict (user_id) do update
       set reason = excluded.reason, source = excluded.source, created_at = excluded.created_at, expires_at = excluded.expires_at`,
      [userId, reason, source, createdAt, expiresAt]
    );
    return { userId, reason, source, createdAt, expiresAt };
  }

  async unbanUser(userId) {
    await this._q('delete from strango_bans where user_id = $1', [userId]);
  }

  async getBan(userId) {
    const res = await this._q('select * from strango_bans where user_id = $1', [userId]);
    const row = res.rows[0];
    if (!row) return null;
    if (row.expires_at <= Date.now()) {
      await this.unbanUser(userId);
      return null;
    }
    return {
      userId: row.user_id,
      reason: row.reason,
      source: row.source,
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at)
    };
  }

  async listBans() {
    const res = await this._q('select * from strango_bans', []);
    const bans = [];
    for (const row of res.rows) {
      const ban = await this.getBan(row.user_id);
      if (ban) bans.push(ban);
    }
    return bans;
  }

  async addRating(userId, rating, comment, fromUserId) {
    const res = await this._q('select average_rating, ratings from strango_ratings where user_id = $1', [userId]);
    const current = res.rows[0] || { average_rating: 0, ratings: [] };
    const ratings = Array.isArray(current.ratings) ? current.ratings : [];
    ratings.push({ rating, comment: comment || '', fromUserId, timestamp: Date.now() });
    const clipped = ratings.slice(-100);
    const avg = clipped.reduce((s, r) => s + (Number(r.rating) || 0), 0) / clipped.length;

    await this._q(
      `insert into strango_ratings(user_id, average_rating, ratings)
       values($1, $2, $3::jsonb)
       on conflict (user_id) do update set average_rating = excluded.average_rating, ratings = excluded.ratings`,
      [userId, avg, JSON.stringify(clipped)]
    );
    return { ratings: clipped, averageRating: avg };
  }

  async listRatings() {
    const res = await this._q('select user_id, average_rating, ratings from strango_ratings', []);
    const out = {};
    for (const row of res.rows) {
      out[row.user_id] = { averageRating: Number(row.average_rating), ratings: row.ratings || [] };
    }
    return out;
  }

  async createAppeal(appeal) {
    const payload = { ...appeal, status: 'pending', timestamp: Date.now() };
    await this._q(
      `insert into strango_appeals(id, payload) values($1, $2::jsonb)
       on conflict (id) do update set payload = excluded.payload`,
      [payload.id, JSON.stringify(payload)]
    );
    return payload;
  }

  async getAppeal(appealId) {
    const res = await this._q('select payload from strango_appeals where id = $1', [appealId]);
    return res.rows[0]?.payload || null;
  }

  async updateAppeal(appealId, changes) {
    const current = await this.getAppeal(appealId);
    if (!current) return null;
    const updated = { ...current, ...changes, reviewedAt: Date.now() };
    await this._q('update strango_appeals set payload = $2::jsonb where id = $1', [
      appealId,
      JSON.stringify(updated)
    ]);
    return updated;
  }

  async listAppeals() {
    const res = await this._q('select payload from strango_appeals', []);
    return res.rows.map(r => r.payload);
  }
}

module.exports = { PostgresStore };
