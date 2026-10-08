# LOCO TM CMS — HYBRID (v7 live hardware + full feature set)

**This is the hybrid build.** Base architecture is the modular Loco TM CMS
platform (multi-loco, 5-role RBAC, Digital Twin, Heatmap, GIS Map, Analytics,
Predictive, Maintenance, Admin CRUD, Fleet Assistant, Audit, optional
Postgres/TimescaleDB). Into it we've re-wired the **live, hardware-connected
ingest pipeline from LOCO-TM-CMS-FINAL-v7** — the one running on WAP-7 #30211
today — completely unchanged in contract, so the on-device RUT200 script
(`rut200/loco_push_v14_VIBRATION.lua`, local mosquitto + BNI IO-Link vibration
bridge) needs **zero edits**, only its target URL at cutover.

## Two independent hardware ingest paths (both live in this build)

| | Route | Auth | Payload | Script |
|---|---|---|---|---|
| **v7 vibration+temp (LIVE)** | `POST /api/data/ingest` | `x-api-key: VIB_DATA_API_KEY` | `{locoIp, timestamp, tmData:{TM1:{vib:{...},temp,ioLinkStatus}}}` | `rut200/loco_push_v14_VIBRATION.lua` — mosquitto/IO-Link bridge, **unchanged from v7** |
| Temp-only (Modbus TCP) | `POST /api/push` | `apiKey` in body | `{apiKey, coachId, motors:[12]}` | `rut200/himnish_push.lua` — unchanged from the original HIMNISH-Loco-TM-Monitoring build |

Both feed the same `store.ingestReading()` path, so alerts, thresholds,
history, RBAC scoping, reports, and the dashboard work identically regardless
of which pipeline a given loco reports through. New: vibration-aware alarms
(`CFG_VIB_WARN_RMS` / `CFG_VIB_CRIT_RMS`) and an L10 bearing-life prediction
endpoint — `GET /api/v1/bearing/:sensorId/prediction` — both ported from v7's
proven math, unchanged.

## Cutover for the live WAP-7 #30211 hardware (no risk to production)

1. Deploy this hybrid build to a **new**, separate Railway app first (do not
   touch the currently-live `loco-tm-cms-production` app or its RUT200 yet).
2. Set `VIB_DATA_API_KEY=himnish_data_key_2024` in Railway Variables (this is
   already the default, matching the lua script's hardcoded key — no change
   needed unless you want to rotate it).
3. Test with the `curl` example in the "Local test run" section below against
   the new Railway URL before touching the RUT200.
4. Once verified end-to-end (ingest → alerts → dashboard → bearing-life all
   correct), SSH into the RUT200 and edit **only** the `RAILWAY` URL line at
   the top of `/etc/loco_push.lua` to point at the new hybrid deployment.
   Nothing else on the device changes. Roll back by pointing the URL back to
   the old production app if anything looks wrong.

---

# LOCO TM CMS — Traction Motor Condition Monitoring System

Loco version of the EMU Motor Coach TM Monitoring platform — same architecture, same
feature set (Digital Twin, Heatmap, GIS Map, Alerts, Analytics, Predictive, Loco Transfer,
Maintenance, Admin CRUD, Notifications, Reports, Health Index, Fleet Assistant, Audit),
adapted for **locomotives with 6 traction motors each** (12 monitored points: TM1–TM6 × DE/NDE).

This is a **new, separate deployment** — it does NOT touch the live production system at
`himnish2007-loco-temp-monitor-production.up.railway.app`. Test it fully before cutover.

---

## What's different from the EMU system

| | EMU system | This Loco system |
|---|---|---|
| Physical asset | Coach (motor coach) | Loco (WAP-7 / WAG-9 / WAM-4 etc.) |
| Grouping | EMU rake/formation | Loco Shed |
| Sensors per asset | Variable (per coach TM layout) | Fixed 12: TM1-DE, TM1-NDE … TM6-DE, TM6-NDE |
| Data source | Wireless sensors → LTE/MQTT | **Existing RUT200 Modbus TCP push (unchanged)** |
| Default thresholds | Warn 70°C / High 80°C / Crit 90°C | Warn 120°C / High 140°C / Crit 160°C (per your manual) |
| RBAC | 5 roles | Same 5 roles (super_admin, railway_hq, depot_admin, maintenance_eng, observer) |

## RUT200 / hardware — nothing changes

`rut200/himnish_push.lua` in this repo is **byte-for-byte identical** to your current
production script. Registers (1584–1606), coachId format (`WAP7-30211`), Modbus TCP
target (192.168.1.12:502), and the push payload shape are untouched:

```json
{"apiKey":"himnish_rut200_key_2024","coachId":"WAP7-30211","motors":[...12 values...],"ts":"..."}
```

The server exposes **`POST /api/push`** (no `/v1`) — the exact path and payload shape the
script already sends to. `PUSH_API_KEY` defaults to `himnish_rut200_key_2024` to match the
script's hardcoded key, so no script edit is needed to test against this new deployment —
only the URL (`local S=`) needs to point here once you're ready, and that's the only line
in the script you'll ever touch, whenever you choose to cut over.

A new locomotive auto-registers on its first push — no manual "Add Loco" step required
(same self-registration behavior the EMU ingest already has).

---

## Local test run

```bash
npm install
npm run dev          # DEMO_MODE=true — synthetic fleet data, no hardware needed
```
Open http://localhost:8080 — login `admin / himnish@2025` (change immediately in Admin).

<<<<<<< hyb/hybrid-cms/README.md
Simulate a real RUT200 push:
=======
Open `http://localhost:8080`. Sign in as `admin` with the first-run password (see `LOGIN_SECURITY_GUIDE.md`); the app makes you choose a new password at once.
Demo mode generates 2 Sheds of synthetic data and seeds scoped demo users
(`engineer` sees only EMU-02, `viewer` sees only loco MC-101).

## Deploy: GitHub → Railway

1. **Push to GitHub.** From the project folder:
   ```bash
   git init           # if not already a repo
   git add .
   git commit -m "RAIP D3 EMU monitoring"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
   (If merging into an existing RAIP repo, copy files in — don't re-extract a
   zip over the folder — to preserve `.git`.)
2. **Railway → New Project → Deploy from GitHub repo** → pick the repo. Railway
   auto-detects Node, runs `npm install` then `npm start` (Procfile included).
3. **Add a Volume** (Railway → service → Volumes) mounted at e.g. `/data`.
4. **Set environment variables** (Railway → Variables) from `.env.example`:
   - `JWT_SECRET` — long random string
   - `DATA_API_KEY` — your ingestion key
   - `DATA_DIR=/data` — so users/Sheds/locos persist across redeploys
   - `DEMO_MODE=false`
5. Railway gives a public URL. Point the LTE modules / RUT200 push at
   `https://<app>.up.railway.app/api/v1/ingest`, or configure each loco's
   RUT200 IP in Admin for pull mode (see `comm/PUSH_SPEC.md`).

`PORT` is provided by Railway automatically — no need to set it.

## Roles

| Role                 | Sees            | Can edit master data | Loco swap | Acknowledge |
|----------------------|-----------------|----------------------|------------|-------------|
| Super Admin          | all             | yes                  | yes        | yes         |
| Railway HQ           | all             | no (read-only Admin) | no         | yes         |
| Depot Admin          | assigned scope  | no                   | yes        | yes         |
| Maintenance Engineer | assigned scope  | no                   | yes        | yes         |
| Observer             | assigned scope  | no                   | no         | no          |

## API surface

Ingestion (X-API-Key): `POST /api/v1/ingest`, `GET /api/v1/ping`
Auth: `POST /api/v1/login`
Read (scoped): `/overview`, `/sheds`, `/alerts`, `/series/:id`, `/locos`,
`/locos/:id/history`, `/thresholds`, `/export/readings.csv`
Actions: `POST /alerts/:id/ack`, `POST /locos/:id/assign`
Admin: `/assets`, `/users` CRUD, `/users/:u/assets`, `/sheds` CRUD, `/loco` CRUD,
`PUT /thresholds`, `/audit`

## Persistence & PostgreSQL

`src/store.js` is the only data-access surface. It persists master data to
`DATA_DIR/raip_state.json` and keeps live readings/alerts in memory. To move to
PostgreSQL/TimescaleDB, implement a class with the same methods backed by tables
(`users`, `sheds`, `locos`, `loco_assignment`, `loco_swaps`, `user_assets`,
`thresholds`, `readings` hypertable, `alerts`, `audit`) and swap `new Store()`
in `server.js`. No route changes required.

## Roadmap

GIS India map view, PDF/Excel report generation, SMS/Email gateway wiring in
`store._raise`, and the disabled-by-default AI predictive module.

## Configurable SMS + Email alerting (Notify tab)

Super Admin configures everything from the **Notify** tab — no code changes:
- Per-severity routing: toggle Email / SMS, set email + phone recipients.
- Escalation matrix: L1 Maintenance → L2 Supervisor → L3 Incharge → L4 HQ, with
  a configurable "escalate after N minutes" per severity. Unacknowledged alerts
  auto-escalate to the configured tier.
- Editable SMS / email subject / email body templates with placeholders
  ({severity} {message} {shed} {loco} {tm} {temp} {time}).
- Delivery log + analytics (total SMS/email, success rate).
- "Send test" button to verify configuration.

**Channels work in dry-run until credentials are set** (so the system is fully
demonstrable). To send for real, set the environment variables:
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
- SMS: `SMS_PROVIDER` = `fast2sms` | `msg91` | `generic`, plus `SMS_API_KEY`
  (and `SMS_SENDER`; for `generic`, `SMS_URL` with {to}{message}{key}).

## Other new features

- **Assigned-loco dropdown** in Live EMU: each user selects from the motor
  locos assigned to them.
- **Over-threshold locos float to the top** of the Live list (sorted by worst
  severity), with the EMU flagged "NEEDS ATTENTION".
- **Sensor architecture per loco**: wired / wireless / hybrid, editable any time.

## Exact deploy commands (GitHub → Railway)

From this project folder, in a terminal:

>>>>>>> rn/new/README.md
```bash
curl -X POST http://localhost:8080/api/push -H "Content-Type: application/json" \
  -d '{"apiKey":"himnish_rut200_key_2024","coachId":"WAP7-30211","motors":[45,44,50,49,60,58,55,54,70,68,62,61],"ts":"2026-07-17T10:00:00Z"}'
```

<<<<<<< hyb/hybrid-cms/README.md
## Deploy to Railway (new, separate app)
=======
Then on railway.app: **New Project → Deploy from GitHub repo → select the repo**.
Add a **Volume** (mount `/data`) and set Variables: `JWT_SECRET`, `DATA_API_KEY`,
`DATA_DIR=/data`, `DEMO_MODE=false`, and the SMTP_/SMS_ vars when ready. Railway
builds and gives a public HTTPS URL. First login: `admin` with the first-run password, which you must replace at the first sign-in — change
the password immediately (the app forces it at the first sign-in).

## Reports, Health Index & Audit (new)

- **Reports tab** — one-click **Excel (.xlsx)** and **PDF (print)** for: Live
  Readings, Alarm, Sensor Health, Loco Health, EMU Health. All scoped to the
  user's assigned locos. (CSV also available.)
- **Health Index tab** — 0–100 condition score per sensor → loco → EMU →
  fleet, worst assets first.
- **Audit tab** — full trail of config/alert/asset actions (global roles).

## Maintenance, Topology & Wallboard (new)

- **Maintenance tab** — work orders (preventive / corrective / calibration /
  sensor & battery replacement), status workflow open → in progress → closed,
  scoped to assigned locos, persisted.
- **Topology tab** — per-loco network path: Sensor → Data Concentrator →
  LTE Gateway → Cloud, live colour-coded.
- **Wallboard button (⛶)** — fullscreen control-room mode that auto-rotates
  Overview → Active Alerts → Devices every 8s, for 55"/65" NOC displays.
- **Data source** per loco (modbus_tcp / modbus_rtu / mqtt / rest_push …) —
  config field so the protocol is never hardcoded.

## PostgreSQL / TimescaleDB (data permanence) — NEW
>>>>>>> rn/new/README.md

1. Create a **new** GitHub repo (e.g. `himnish-loco-tm-monitor-v2`) and Railway project —
   do not push to the existing `himnish2007-loco-temp-monitor` repo/app until you're ready.
2. Push this folder's contents.
3. Railway → Variables: set `PUSH_API_KEY=himnish_rut200_key_2024`, `DATA_API_KEY`,
   `JWT_SECRET`, `DEMO_MODE=false`, optionally `DATABASE_URL` for Postgres history.
4. Attach a Volume mounted at `/data` and set `DATA_DIR=/data` so locos/users/thresholds
   survive redeploys.
5. Test with `curl` against the new Railway URL (payload above) before touching the RUT200.
6. **Cutover, when ready:** SSH into the RUT200, edit only the `local S=` line in
   `/etc/himnish_push.lua` to the new URL, restart the script. Nothing else changes.

See `DEPLOY.md` and `GO-LIVE-CHECKLIST.md` (carried over from the EMU project) for the
full Railway/Volume/Postgres walkthrough — steps are identical, just point at this repo.

---

## Folder structure

```
server.js            Express entrypoint (mounts /api/v1 dashboard API + /api/push alias)
src/                  api.js, store.js, ingest.js, auth.js, config.js, notify.js,
                      reports.js, poller.js, mqtt.js, copilot.js, demo.js
public/index.html     Full dashboard SPA (all EMU tabs, relabeled for locos)
rut200/               himnish_push.lua, rc.local, setup guide — UNCHANGED from production
```

## v1.4.0 — EMU feature parity
Brought over every feature of the HIMNISH RAIP D3 EMU platform: 2-step verification (TOTP) and recovery codes, password policy with
forced first-login change, account lockout and sign-in security log, session revoke / sign-out everywhere, per-device API keys with
rotation, alert close-out workflow with SLA summary, reliability (MTBF/MTTR), configurable multi-level escalation, India DLT SMS,
offline-alert delay and reminders, automatic backups with safe restore, sensor registry calibration/warranty reminders, PDF reports,
gzip + CSP security headers, protected API docs, optional field-device relay, and AWS deployment files (`deploy/aws/`).
Loco specifics unchanged: 6 TMs x DE/NDE (12 tags), one loco per train, RUT200 script/registers untouched, vibration pipeline intact.
