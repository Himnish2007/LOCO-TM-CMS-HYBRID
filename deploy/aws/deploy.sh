#!/usr/bin/env bash
# Update an already-installed server:  bash deploy/aws/deploy.sh
set -euo pipefail
cd /home/ubuntu/loco-tm-cms
git pull origin main
npm ci --omit=dev
pm2 reload ecosystem.config.js --update-env 2>/dev/null || pm2 start deploy/aws/ecosystem.config.js
pm2 save
sleep 2
curl -fsS http://127.0.0.1:3100/healthz && echo
