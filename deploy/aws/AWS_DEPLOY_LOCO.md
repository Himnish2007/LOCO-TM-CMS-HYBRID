# LOCO TM CMS — AWS deployment at https://loco.himinsights.in

Every project gets its **own EC2 instance, own Elastic IP, own database + user, own secrets, own PM2 name and own Nginx file**.
Nothing is shared with `emu.himinsights.in`, so the two systems cannot clash.

| | EMU (existing) | LOCO (this) |
|---|---|---|
| Domain | emu.himinsights.in | **loco.himinsights.in** |
| EC2 instance | existing | **NEW instance** (Ubuntu 22.04, ap-south-1) |
| Elastic IP | 35.154.98.154 | **NEW Elastic IP** |
| Database | existing DB | **NEW database `loco_tm` + user `loco_user`** |
| PM2 app / port | emu app | `loco-tm-cms` / `3100` |
| JWT / API keys | EMU's | **new random values** |
| SMS templates | EMU templates | **LOCO templates** (see SMS_SETUP_DLT.md) |

---------------------------------------------------------------------------------------------
## 1. Launch the new EC2 instance (AWS console, region Mumbai ap-south-1)
- EC2 → Launch instance → name `loco-tm-cms` → **Ubuntu Server 22.04 LTS** → `t3.small` (2 GB) → storage 20 GB gp3.
- Key pair: reuse `himinsights-key` (or create `loco-key`).
- New security group `loco-sg`: inbound **22** from your office IP only, **80** and **443** from anywhere.
- Allocate a **new Elastic IP** (EC2 → Elastic IPs → Allocate) and associate it to this instance. Note it: `<LOCO_IP>`.

## 2. DNS (GoDaddy → himinsights.in → DNS)
Add record: Type **A**, Name **loco**, Value **`<LOCO_IP>`**, TTL 600. Check from your PC:
```
nslookup loco.himinsights.in
```

## 3. New database on the existing RDS server (isolated from EMU)
RDS security group must allow 5432 from the **new instance's security group** (`loco-sg`). From the new instance:
```
psql "host=database-1.c9wow4o44b1i.ap-south-1.rds.amazonaws.com user=postgres dbname=postgres sslmode=require"
```
```sql
CREATE USER loco_user WITH PASSWORD 'PUT_A_STRONG_PASSWORD';
CREATE DATABASE loco_tm OWNER loco_user;
REVOKE ALL ON DATABASE loco_tm FROM PUBLIC;
\q
```
(If you prefer total separation, create a second small RDS PostgreSQL instance instead and use its endpoint.)

## 4. Install the server software (on the new instance)
From your Windows PC (key copied to C:\keys):
```
ssh -i C:\keys\himinsights-key.pem ubuntu@<LOCO_IP>
```
On the instance:
```
git clone <YOUR_GITHUB_REPO_URL> loco-tm-cms
bash loco-tm-cms/deploy/aws/setup-ec2.sh
```

## 5. Create the .env
```
cd ~/loco-tm-cms
cp deploy/aws/.env.aws.example .env
nano .env
```
Generate each secret with `openssl rand -hex 32` (JWT_SECRET, DATA_API_KEY, BOOTSTRAP_KEY) — all different from EMU.
Keep `PUSH_API_KEY=himnish_rut200_key_2024` and `VIB_DATA_API_KEY=himnish_data_key_2024` exactly: the scripts on the locos use them.
Fill DATABASE_URL, SMTP_*, SMS_* (see SMS_SETUP_DLT.md for the LOCO templates).

## 6. Start the app
```
cd ~/loco-tm-cms
npm ci --omit=dev
pm2 start deploy/aws/ecosystem.config.js
pm2 save
pm2 startup          # run the command it prints, once
curl http://127.0.0.1:3100/healthz
```
`pm2 logs loco-tm-cms` must show `DB=PostgreSQL` and `LOCO TM CMS on :3100`.

## 7. Nginx + HTTPS
```
sudo cp ~/loco-tm-cms/deploy/aws/nginx-loco.conf /etc/nginx/sites-available/loco.himinsights.in
sudo ln -s /etc/nginx/sites-available/loco.himinsights.in /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d loco.himinsights.in
```
Open https://loco.himinsights.in and sign in as `admin` with ADMIN_INITIAL_PASSWORD (you must change it at first sign-in; turn on 2-step verification under 👤).

## 8. Updating later (every code change)
On your Windows PC:
```
cd C:\apps\loco-tm-cms
git add .
git commit -m "update"
git push origin main
```
On the instance:
```
ssh -i C:\keys\himinsights-key.pem ubuntu@<LOCO_IP> "bash ~/loco-tm-cms/deploy/aws/deploy.sh"
```

## 9. Move the locos (RUT200) — test first, no downtime
Test the new server with the real payload before touching anything:
```
curl -X POST https://loco.himinsights.in/api/push -H "Content-Type: application/json" -d "{\"apiKey\":\"himnish_rut200_key_2024\",\"coachId\":\"WAP7-30211\",\"motors\":[41,42,43,44,45,46,47,48,49,50,51,52]}"
```
Expect `"ok":true,"accepted":12`.

Then switch the loco **without a site visit**: on the *current* Railway service add the variable
`RELAY_TARGET=https://loco.himinsights.in` — the RUT keeps posting to the old URL and the old server forwards
`/api/push` and `/api/data/ingest` to AWS. When convenient, change only the URL host inside `himnish_push.lua`
on the RUT (registers, key and payload stay untouched) and remove the relay.

## 10. Alerts check (SMS + email)
Dashboard → Notify → Send test email / Send test SMS. Offline alerts email after the "Offline alert delay"; SMS uses the DLT templates.
Backups are written daily to `/var/lib/loco-tm/backups` (14 days). RDS automated backups stay on as well.
