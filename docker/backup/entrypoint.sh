#!/bin/bash

# Backup service entrypoint
set -euo pipefail

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting Vibe Code backup service..."

# Set default schedule if not provided
BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-0 2 * * *}"

log "Backup schedule: $BACKUP_SCHEDULE"

# Create cron job
echo "$BACKUP_SCHEDULE /scripts/backup.sh >> /var/log/backup.log 2>&1" > /tmp/crontab
crontab /tmp/crontab

log "Cron job installed"

# Start cron daemon
crond -f -l 8