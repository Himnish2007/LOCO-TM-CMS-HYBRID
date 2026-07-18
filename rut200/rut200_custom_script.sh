#!/bin/sh
# Paste this EXACT content in: System -> Administration -> Custom Scripts
# This starts loco_push.lua automatically after every reboot/power-on

sleep 20
killall mosquitto 2>/dev/null
sleep 1
mkdir -p /etc/mosquitto
echo 'listener 1883 0.0.0.0' > /etc/mosquitto/mosquitto.conf
echo 'allow_anonymous true' >> /etc/mosquitto/mosquitto.conf
mosquitto -d -c /etc/mosquitto/mosquitto.conf
sleep 3
lua /etc/loco_push.lua &
exit 0
