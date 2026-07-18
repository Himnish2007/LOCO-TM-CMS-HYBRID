'use strict';

// ---------------------------------------------------------------------------
// Optional PostgreSQL / TimescaleDB persistence.
//
// Activated only when DATABASE_URL is set. Provides:
//   - permanent time-series storage of every reading (survives restarts)
//   - long-range history queries (30-day / multi-year trends)
//   - a master-data state blob (so users/locos/thresholds survive even
//     without a mounted volume)
//
// Design rules:
//   - The app's real-time path stays IN-MEMORY (correct for a live dashboard).
//     Postgres is a durable archive written alongside, never in the hot path.
//   - Every DB call is wrapped so a database hiccup NEVER crashes the app —
//     it logs and the app keeps running on memory + JSON.
//   - TimescaleDB is used if the extension is available; otherwise a plain
//     indexed table is used. Same code runs on either.
//
// Testable with PGlite (in-process Postgres) by injecting a client; production
// uses node-postgres (pg) Pool via DATABASE_URL.
// ---------------------------------------------------------------------------

function createDb(databaseUrl, injectedClient) {
  let client = injectedClient || null;

  async function connect() {
    if (client) return;
    const { Pool } = require('pg');
    const ssl = process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined;
    client = new Pool({ connectionString: databaseUrl, ssl, max: 5 });
  }

  async function q(text, params) { return client.query(text, params); }

  async function init() {
    await connect();
    await q(`CREATE TABLE IF NOT EXISTS readings (
      id bigserial,
      sensor_id text NOT NULL,
      loco_id text, shed_id text, tm_id text,
      temperature double precision, battery integer, signal integer,
      vib_x double precision, vib_y double precision, vib_z double precision,
      vib_rms double precision, vib_peak double precision, vib_crest double precision, vib_freq double precision,
      io_link_status text,
      ts timestamptz NOT NULL DEFAULT now()
    )`);
    // Additive migration for databases created before the v7 vibration merge.
    await q(`ALTER TABLE readings
      ADD COLUMN IF NOT EXISTS vib_x double precision,
      ADD COLUMN IF NOT EXISTS vib_y double precision,
      ADD COLUMN IF NOT EXISTS vib_z double precision,
      ADD COLUMN IF NOT EXISTS vib_rms double precision,
      ADD COLUMN IF NOT EXISTS vib_peak double precision,
      ADD COLUMN IF NOT EXISTS vib_crest double precision,
      ADD COLUMN IF NOT EXISTS vib_freq double precision,
      ADD COLUMN IF NOT EXISTS io_link_status text`).catch(() => {});
    await q(`CREATE INDEX IF NOT EXISTS idx_readings_sensor_ts ON readings (sensor_id, ts DESC)`);
    await q(`CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings (ts DESC)`);
    await q(`CREATE TABLE IF NOT EXISTS app_state (id integer PRIMARY KEY, data jsonb NOT NULL, updated timestamptz DEFAULT now())`);
    // Optional TimescaleDB hypertable — ignored gracefully if unavailable.
    let hyper = false;
    try {
      await q(`CREATE EXTENSION IF NOT EXISTS timescaledb`);
      await q(`SELECT create_hypertable('readings','ts', if_not_exists => TRUE, migrate_data => TRUE)`);
      hyper = true;
    } catch (e) { /* plain table + index is fine */ }
    console.log(`[db] connected. TimescaleDB hypertable: ${hyper ? 'yes' : 'no (plain table)'}`);
    return { hyper };
  }

  async function insertReading(r) {
    const v = r.vib || {};
    await q(
      `INSERT INTO readings (sensor_id,loco_id,shed_id,tm_id,temperature,battery,signal,
        vib_x,vib_y,vib_z,vib_rms,vib_peak,vib_crest,vib_freq,io_link_status,ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [r.sensor_id, r.loco_id || null, r.shed_id || null, r.tm_id || null,
        r.temperature == null ? null : r.temperature,
        r.battery_health == null ? null : Math.round(r.battery_health),
        r.signal_strength == null ? null : Math.round(r.signal_strength),
        v.x == null ? null : v.x, v.y == null ? null : v.y, v.z == null ? null : v.z,
        v.rms == null ? null : v.rms, v.peak == null ? null : v.peak,
        v.crestFactor == null ? null : v.crestFactor, v.freq == null ? null : v.freq,
        r.io_link_status || null,
        r.last_update || new Date().toISOString()]
    );
  }

  // Last reading per sensor — to repopulate live view after a restart.
  async function latestPerSensor() {
    const res = await q(
      `SELECT DISTINCT ON (sensor_id) sensor_id,loco_id,shed_id,tm_id,temperature,battery,signal,
        vib_x,vib_y,vib_z,vib_rms,vib_peak,vib_crest,vib_freq,io_link_status,ts
       FROM readings ORDER BY sensor_id, ts DESC`);
    return res.rows;
  }

  // Recent samples (for in-memory trend backfill).
  async function recentSeries(sinceIso, cap) {
    const res = await q(
      `SELECT sensor_id, ts, temperature, vib_rms, vib_peak FROM readings WHERE ts >= $1 ORDER BY ts ASC LIMIT $2`,
      [sinceIso, cap || 200000]);
    return res.rows;
  }

  // Long-range history for one sensor (downsampled in JS by the caller).
  async function historyRange(sensorId, fromIso, toIso, cap) {
    const res = await q(
      `SELECT ts, temperature FROM readings
       WHERE sensor_id = $1 AND ts BETWEEN $2 AND $3 ORDER BY ts ASC LIMIT $4`,
      [sensorId, fromIso, toIso, cap || 20000]);
    return res.rows;
  }

  // All readings for one loco in a date range (for historical reports).
  async function historyForLoco(locoId, fromIso, toIso, cap) {
    const res = await q(
      `SELECT sensor_id, tm_id, ts, temperature FROM readings
       WHERE loco_id = $1 AND ts BETWEEN $2 AND $3 ORDER BY ts ASC LIMIT $4`,
      [locoId, fromIso, toIso, cap || 50000]);
    return res.rows;
  }

  // Retention: delete readings older than N days. Returns rows removed.
  async function purgeOld(days) {
    const res = await q(`DELETE FROM readings WHERE ts < now() - ($1 || ' days')::interval`, [String(days)]);
    return res.rowCount || 0;
  }

  async function saveState(snapshot) {
    await q(
      `INSERT INTO app_state (id,data,updated) VALUES (1,$1,now())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated = now()`,
      [JSON.stringify(snapshot)]);
  }
  async function loadState() {
    const res = await q(`SELECT data FROM app_state WHERE id = 1`);
    if (!res.rows.length) return null;
    const d = res.rows[0].data;
    return typeof d === 'string' ? JSON.parse(d) : d;
  }

  return { init, insertReading, latestPerSensor, recentSeries, historyRange, historyForLoco, purgeOld, saveState, loadState,
    _setClient: (c) => { client = c; } };
}

module.exports = { createDb };
