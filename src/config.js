'use strict';

// ---------------------------------------------------------------------------
// LOCO TM CMS - Central configuration
// RAIP env-var family: JWT_SECRET, DATA_API_KEY, DEMO_MODE, CFG_*
// ---------------------------------------------------------------------------

const path = require('path');

function num(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

const config = {
  PORT: num('PORT', 8080),

  // Persistent state file location. On Railway, attach a Volume and set
  // DATA_DIR to its mount path (e.g. /data) so users/SHEDS/locos survive
  // redeploys. Locally it defaults to ./data.
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  // Automatic scheduled backups (item 19): a full master-data + alert-history snapshot is written
  // to disk every BACKUP_INTERVAL_HOURS, kept for BACKUP_KEEP_DAYS, then deleted automatically.
  // This is IN ADDITION TO, not instead of, RDS automated backups / aws_backup.sh.
  BACKUP_DIR: process.env.BACKUP_DIR || '',   // '' = DATA_DIR/backups
  BACKUP_INTERVAL_HOURS: Number(process.env.BACKUP_INTERVAL_HOURS) || 24,
  BACKUP_KEEP_DAYS: Number(process.env.BACKUP_KEEP_DAYS) || 14,
  // Sensor registry reminders (Admin -> Sensor Registry): how often calibration is expected, and
  // how many days before a (parseable) warranty date to start flagging it as "expiring".
  CALIBRATION_INTERVAL_DAYS: Number(process.env.CALIBRATION_INTERVAL_DAYS) || 365,
  WARRANTY_WARN_DAYS: Number(process.env.WARRANTY_WARN_DAYS) || 60,

  // Optional PostgreSQL/TimescaleDB archive. When set, every reading is stored
  // durably and history survives restarts. Unset = in-memory + JSON only.
  DATABASE_URL: process.env.DATABASE_URL || '',
  // Optional: forward field-device traffic (device-config + ingest) to a
  // different backend. Only set this on a deployment acting as a relay for
  // devices still pointed at its old URL — leave unset everywhere else.
  RELAY_TARGET: process.env.RELAY_TARGET || '',
  BACKFILL_HOURS: num('BACKFILL_HOURS', 6),
  // Data retention: purge readings older than N days (0 = keep forever).
  RETENTION_DAYS: num('RETENTION_DAYS', 0),

  JWT_SECRET: process.env.JWT_SECRET || 'himnish-raip-loco-dev-secret-change-me',
  JWT_TTL: process.env.JWT_TTL || '8h',

  // Ingestion key used by the generic /api/ingest route (readings[] batch format).
  DATA_API_KEY: process.env.DATA_API_KEY || 'himnish_loco_key_2026',
  // Dedicated key for the existing RUT200 himnish_push.lua script, which POSTs
  // {apiKey, coachId, motors:[12], ts} to /api/push. Matches the script's
  // hardcoded K value exactly — the lua script itself is NOT modified.
  PUSH_API_KEY: process.env.PUSH_API_KEY || 'himnish_rut200_key_2024',
  // Shared key a field RUT uses to pull its own config (self-update).
  BOOTSTRAP_KEY: process.env.BOOTSTRAP_KEY || 'himnish_bootstrap_2025',
  // API docs (/docs, /openapi.json): hidden entirely unless both are set (see requireDocsAuth in server.js).
  DOCS_USER: process.env.DOCS_USER || '',
  DOCS_PASSWORD: process.env.DOCS_PASSWORD || '',
  // Once every field device has migrated off the shared DATA_API_KEY/BOOTSTRAP_KEY to its own
  // per-device key (see device.api_key in the field-device registry), set this to true so the
  // server refuses the old shared keys instead of just warning about them.
  STRICT_SECURITY: String(process.env.STRICT_SECURITY || 'false').toLowerCase() === 'true',

  // Dedicated key for the LIVE, hardware-connected LOCO-TM-CMS v7 ingest path
  // (POST /api/data/ingest, header x-api-key). This is the proven RUT200 +
  // BNI IO-Link vibration/temperature pipeline already running in production
  // on WAP-7 #30211 — carried over UNCHANGED from LOCO-TM-CMS-FINAL-v7.
  // Matches the v7 server's DATA_API_KEY default exactly so the on-device
  // mosquitto/lua bridge (loco_push_v14.lua) needs zero changes.
  VIB_DATA_API_KEY: process.env.VIB_DATA_API_KEY || process.env.DATA_API_KEY_V7 || 'himnish_data_key_2024',

  DEMO_MODE: String(process.env.DEMO_MODE || 'false').toLowerCase() === 'true',

  // RUT200 pull poller interval (seconds). 0 disables polling.
  POLL_INTERVAL: num('POLL_INTERVAL', 20),

  // Default thresholds (deg C) — matches HIMNISH-v3 manual: Warning 120C, Alarm 160C.
  // Admin overrides at runtime are persisted and win.
  CFG_WARN_TEMP: num('CFG_WARN_TEMP', 120),
  CFG_HIGH_TEMP: num('CFG_HIGH_TEMP', 140),
  CFG_CRIT_TEMP: num('CFG_CRIT_TEMP', 160),
  CFG_OFFLINE_SECONDS: num('CFG_OFFLINE_SECONDS', 300),
  // How long a loco must STAY offline before an alert (email/SMS) is actually sent — separate from
  // and longer than CFG_OFFLINE_SECONDS above (which only controls the dashboard's online/offline
  // status, shown instantly). A brief signal drop or power blip that recovers within this window
  // never generates an alert at all — only a genuinely sustained outage does.
  CFG_OFFLINE_ALERT_SECONDS: num('CFG_OFFLINE_ALERT_SECONDS', 1800),
  CFG_LOW_BATTERY: num('CFG_LOW_BATTERY', 20),
  CFG_RETENTION_DAYS: num('CFG_RETENTION_DAYS', 1825),
  // Default data-log / poll interval (seconds) — admin-editable in Thresholds tab.
  // Applies to the RUT200 IP-pull poller; per-device push interval (Field Devices)
  // is set separately and takes priority for devices that use push mode.
  CFG_LOG_INTERVAL: num('CFG_LOG_INTERVAL', num('POLL_INTERVAL', 20)),
  // Database logging interval (seconds): one stored row per sensor per interval.
  // Devices may push more often (CFG_LOG_INTERVAL) so OFFLINE is detected fast.
  // Starting default only - editable live in Admin -> Thresholds. 0 = store every push.
  CFG_DB_LOG_INTERVAL: num('CFG_DB_LOG_INTERVAL', 600),

  // Email (SMTP) transport for email alerts. If unset, email runs dry-run.
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: num('SMTP_PORT', 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
  SMTP_FROM: process.env.SMTP_FROM || '',

  // SMS provider for SMS alerts: 'log' (dry-run, default), 'fast2sms', 'msg91',
  // or 'generic' (uses SMS_URL with {to} {message} {key} placeholders).
  SMS_PROVIDER: process.env.SMS_PROVIDER || 'log',
  SMS_API_KEY: process.env.SMS_API_KEY || '',
  SMS_SENDER: process.env.SMS_SENDER || 'HMNISH',
  SMS_URL: process.env.SMS_URL || '',
  // --- India DLT (provider "fast2sms_dlt"): Fast2SMS *message IDs* of the approved DLT templates ---
  SMS_DLT_TPL_TEMP: process.env.SMS_DLT_TPL_TEMP || '',       // warning / high / critical / rapid-rise (temperature)
  SMS_DLT_TPL_OFFLINE: process.env.SMS_DLT_TPL_OFFLINE || '', // loco offline
  SMS_DLT_TPL_BATT: process.env.SMS_DLT_TPL_BATT || '',       // low battery (optional)
  SMS_API_BASE: process.env.SMS_API_BASE || 'https://www.fast2sms.com', // override only for testing
  // Do not SMS the same recipient again for the same loco+severity within N minutes (0 = no limit).
  SMS_REPEAT_MIN: num('SMS_REPEAT_MIN', 30),
  // Safety-net only (see notify.js): the alert engine itself no longer re-raises a sustained fault,
  // so this should rarely trigger. Higher than SMS_REPEAT_MIN since email has no per-message cost.
  EMAIL_REPEAT_MIN: num('EMAIL_REPEAT_MIN', 60),
  // How often the "still offline" reminder email repeats while an outage continues (separate from
  // EMAIL_REPEAT_MIN above, which is the general safety net for every other severity).
  OFFLINE_EMAIL_REMINDER_MIN: num('OFFLINE_EMAIL_REMINDER_MIN', 180),

  // Escalation scan interval (seconds).
  ESCALATION_INTERVAL: num('ESCALATION_INTERVAL', 60),

  // Optional MQTT ingestion (activated only when MQTT_URL is set).
  MQTT_URL: process.env.MQTT_URL || '',
  MQTT_TOPIC: process.env.MQTT_TOPIC || 'himnish/loco/+/readings',
  MQTT_USERNAME: process.env.MQTT_USERNAME || '',
  MQTT_PASSWORD: process.env.MQTT_PASSWORD || '',

  // Optional AI Copilot (activated only when LLM_API_KEY + LLM_URL are set).
  // OpenAI-compatible chat-completions endpoint.
  LLM_API_KEY: process.env.LLM_API_KEY || '',
  LLM_URL: process.env.LLM_URL || 'https://api.openai.com/v1/chat/completions',
  LLM_MODEL: process.env.LLM_MODEL || 'gpt-4o-mini',

  // Public base URL for emailed report links (e.g. https://app.up.railway.app).
  // Can also be set per-config in the Notify tab.
  REPORT_BASE_URL: process.env.REPORT_BASE_URL || '',
};

config.ROLES = ['super_admin', 'railway_hq', 'depot_admin', 'maintenance_eng', 'observer'];
config.ROLE_LABELS = {
  super_admin: 'Super Admin', railway_hq: 'Railway HQ', depot_admin: 'Depot Admin',
  maintenance_eng: 'Maintenance Engineer', observer: 'Observer',
};
config.GLOBAL_ROLES = ['super_admin', 'railway_hq'];
config.ADMIN_ROLES = ['super_admin'];

config.defaultThresholds = function () {
  return {
    CFG_WARN_TEMP: config.CFG_WARN_TEMP, CFG_HIGH_TEMP: config.CFG_HIGH_TEMP,
    CFG_CRIT_TEMP: config.CFG_CRIT_TEMP, CFG_OFFLINE_SECONDS: config.CFG_OFFLINE_SECONDS,
    CFG_OFFLINE_ALERT_SECONDS: config.CFG_OFFLINE_ALERT_SECONDS,
    CFG_LOW_BATTERY: config.CFG_LOW_BATTERY,
    CFG_RISE_RATE: num('CFG_RISE_RATE', 3), // deg C per minute -> rapid-rise alert
    CFG_LOG_INTERVAL_SECONDS: num('CFG_LOG_INTERVAL_SECONDS', 60), // history/trend logging throttle

    // ---- Vibration thresholds (carried over from LOCO-TM-CMS v7) ----------
    // Applies only to sensors that report vib{} (the wired IO-Link vibration
    // pipeline). Wireless temperature-only sensors ignore these.
    CFG_VIB_WARN_RMS: num('CFG_VIB_WARN_RMS', 8.0),
    CFG_VIB_CRIT_RMS: num('CFG_VIB_CRIT_RMS', 10.0),
    CFG_VIB_WARN_PEAK: num('CFG_VIB_WARN_PEAK', 12.0),
    CFG_VIB_CRIT_PEAK: num('CFG_VIB_CRIT_PEAK', 16.0),
    // L10 bearing-life model factors (same formula as v7).
    CFG_BEARING_BASE: num('CFG_BEARING_BASE', 50000),
    CFG_BEARING_LOAD_FACTOR: num('CFG_BEARING_LOAD_FACTOR', 1.0),
    CFG_BEARING_SPEED_FACTOR: num('CFG_BEARING_SPEED_FACTOR', 1.0),
    CFG_LOG_INTERVAL: config.CFG_LOG_INTERVAL, // seconds — device push / poll interval
    CFG_DB_LOG_INTERVAL: config.CFG_DB_LOG_INTERVAL, // seconds — DB logging interval (0 = every push)
  };
};

module.exports = config;
