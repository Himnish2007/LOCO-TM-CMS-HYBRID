#!/usr/bin/env bash
# One-time setup of a FRESH Ubuntu 22.04 EC2 instance for LOCO TM CMS.
# Run as the ubuntu user:  bash setup-ec2.sh
set -euo pipefail
sudo apt-get update -y
sudo apt-get install -y nginx git curl ufw certbot python3-certbot-nginx postgresql-client
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
# host firewall (the AWS security group is the first line; this is the second)
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw --force enable
# state directory (JSON fallback + automatic backups live here, NOT inside the repo)
sudo mkdir -p /var/lib/loco-tm && sudo chown ubuntu:ubuntu /var/lib/loco-tm
echo "Done. Next: clone the repo, create .env, start PM2 (see AWS_DEPLOY_LOCO.md steps 4-7)."
