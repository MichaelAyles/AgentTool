#!/bin/bash

# Vibe Code Backup Script
set -euo pipefail

# Configuration from environment variables
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-vibecode}"
POSTGRES_USER="${POSTGRES_USER:-vibecode}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"

# Backup directory
BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="vibe-code-backup-$TIMESTAMP"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

# Logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

# Create backup directory
mkdir -p "$BACKUP_PATH"

log "Starting backup: $BACKUP_NAME"

# 1. Database backup
log "Backing up PostgreSQL database..."
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$POSTGRES_HOST" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --verbose \
    --no-password \
    --format=custom \
    --compress=9 \
    > "$BACKUP_PATH/database.dump"

if [[ $? -eq 0 ]]; then
    log "Database backup completed successfully"
else
    log_error "Database backup failed"
    exit 1
fi

# 2. Application data backup
log "Backing up application data..."

# Backup validation results and storage
if [[ -d "/var/lib/vibe-code/validation-reports" ]]; then
    tar -czf "$BACKUP_PATH/validation-reports.tar.gz" -C /var/lib/vibe-code validation-reports
    log "Validation reports backed up"
fi

# Backup logs
if [[ -d "/app/logs" ]]; then
    tar -czf "$BACKUP_PATH/logs.tar.gz" -C /app logs
    log "Application logs backed up"
fi

# Backup configuration
if [[ -d "/app/.config" ]]; then
    tar -czf "$BACKUP_PATH/config.tar.gz" -C /app .config
    log "Configuration files backed up"
fi

# 3. Create backup manifest
log "Creating backup manifest..."
cat > "$BACKUP_PATH/manifest.json" << EOF
{
    "backup_name": "$BACKUP_NAME",
    "timestamp": "$TIMESTAMP",
    "version": "1.0",
    "components": {
        "database": {
            "file": "database.dump",
            "format": "postgresql_custom",
            "compressed": true
        },
        "validation_reports": {
            "file": "validation-reports.tar.gz",
            "format": "tar_gzip"
        },
        "logs": {
            "file": "logs.tar.gz", 
            "format": "tar_gzip"
        },
        "config": {
            "file": "config.tar.gz",
            "format": "tar_gzip"
        }
    },
    "postgres_version": "$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT version();" | head -1 | xargs)",
    "backup_size_bytes": $(du -sb "$BACKUP_PATH" | cut -f1)
}
EOF

# 4. Compress entire backup
log "Compressing backup..."
cd "$BACKUP_DIR"
tar -czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_PATH"

BACKUP_FILE="$BACKUP_DIR/$BACKUP_NAME.tar.gz"
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

log "Backup compressed to $BACKUP_FILE (size: $BACKUP_SIZE)"

# 5. Upload to S3 if configured
if [[ -n "$AWS_ACCESS_KEY_ID" && -n "$AWS_SECRET_ACCESS_KEY" && -n "$BACKUP_S3_BUCKET" ]]; then
    log "Uploading backup to S3..."
    
    aws s3 cp "$BACKUP_FILE" "s3://$BACKUP_S3_BUCKET/backups/" \
        --metadata "backup-timestamp=$TIMESTAMP,backup-size=$BACKUP_SIZE" \
        --storage-class STANDARD_IA
    
    if [[ $? -eq 0 ]]; then
        log "Backup uploaded to S3 successfully"
    else
        log_error "Failed to upload backup to S3"
    fi
fi

# 6. Cleanup old backups
log "Cleaning up old backups (retention: $BACKUP_RETENTION_DAYS days)..."

# Local cleanup
find "$BACKUP_DIR" -name "vibe-code-backup-*.tar.gz" -type f -mtime +$BACKUP_RETENTION_DAYS -delete

# S3 cleanup if configured
if [[ -n "$AWS_ACCESS_KEY_ID" && -n "$AWS_SECRET_ACCESS_KEY" && -n "$BACKUP_S3_BUCKET" ]]; then
    # List and delete old S3 backups
    cutoff_date=$(date -d "$BACKUP_RETENTION_DAYS days ago" +%Y-%m-%d)
    aws s3 ls "s3://$BACKUP_S3_BUCKET/backups/" | while read -r line; do
        backup_date=$(echo "$line" | awk '{print $1}')
        backup_file=$(echo "$line" | awk '{print $4}')
        
        if [[ "$backup_date" < "$cutoff_date" ]]; then
            aws s3 rm "s3://$BACKUP_S3_BUCKET/backups/$backup_file"
            log "Deleted old S3 backup: $backup_file"
        fi
    done
fi

# 7. Update backup status
echo "$TIMESTAMP" > "$BACKUP_DIR/last_backup"

log "Backup completed successfully: $BACKUP_NAME.tar.gz"