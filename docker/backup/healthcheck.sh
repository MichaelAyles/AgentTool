#!/bin/bash

# Backup service health check
set -euo pipefail

BACKUP_DIR="/backups"
HEALTH_FILE="$BACKUP_DIR/.health"

# Check if last backup was recent (within 48 hours)
if [[ -f "$BACKUP_DIR/last_backup" ]]; then
    last_backup=$(cat "$BACKUP_DIR/last_backup")
    last_backup_time=$(date -d "$last_backup" +%s 2>/dev/null || echo 0)
    current_time=$(date +%s)
    time_diff=$((current_time - last_backup_time))
    
    # 48 hours = 172800 seconds
    if [[ $time_diff -lt 172800 ]]; then
        echo "healthy" > "$HEALTH_FILE"
        exit 0
    else
        echo "stale backup" > "$HEALTH_FILE"
        exit 1
    fi
else
    echo "no backup found" > "$HEALTH_FILE"
    exit 1
fi