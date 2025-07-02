#!/bin/bash

# Vibe Code Restore Script
set -euo pipefail

# Configuration
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-vibecode}"
POSTGRES_USER="${POSTGRES_USER:-vibecode}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
BACKUP_DIR="/backups"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"

# Logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

# Usage function
usage() {
    echo "Usage: $0 [OPTIONS] <backup_name_or_file>"
    echo ""
    echo "Options:"
    echo "  -s, --source     Source of backup (local|s3) [default: local]"
    echo "  -d, --dry-run    Show what would be restored without executing"
    echo "  -f, --force      Force restore without confirmation"
    echo "  -h, --help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 vibe-code-backup-20231201_120000"
    echo "  $0 -s s3 vibe-code-backup-20231201_120000"
    echo "  $0 -f /backups/vibe-code-backup-20231201_120000.tar.gz"
}

# Parse command line arguments
SOURCE="local"
DRY_RUN=false
FORCE=false
BACKUP_NAME=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--source)
            SOURCE="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        -*)
            log_error "Unknown option $1"
            usage
            exit 1
            ;;
        *)
            BACKUP_NAME="$1"
            shift
            ;;
    esac
done

if [[ -z "$BACKUP_NAME" ]]; then
    log_error "Backup name or file is required"
    usage
    exit 1
fi

# Determine backup file path
if [[ "$BACKUP_NAME" == *.tar.gz ]]; then
    # Full path provided
    BACKUP_FILE="$BACKUP_NAME"
    BACKUP_NAME=$(basename "$BACKUP_FILE" .tar.gz)
else
    # Just name provided
    BACKUP_FILE="$BACKUP_DIR/$BACKUP_NAME.tar.gz"
fi

log "Starting restore process for: $BACKUP_NAME"

# Download from S3 if needed
if [[ "$SOURCE" == "s3" ]]; then
    if [[ -z "$AWS_ACCESS_KEY_ID" || -z "$AWS_SECRET_ACCESS_KEY" || -z "$BACKUP_S3_BUCKET" ]]; then
        log_error "S3 credentials not configured"
        exit 1
    fi
    
    log "Downloading backup from S3..."
    aws s3 cp "s3://$BACKUP_S3_BUCKET/backups/$(basename "$BACKUP_FILE")" "$BACKUP_FILE"
    
    if [[ $? -ne 0 ]]; then
        log_error "Failed to download backup from S3"
        exit 1
    fi
fi

# Check if backup file exists
if [[ ! -f "$BACKUP_FILE" ]]; then
    log_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

log "Found backup file: $BACKUP_FILE"

# Extract backup
TEMP_DIR="$BACKUP_DIR/restore_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$TEMP_DIR"

log "Extracting backup to: $TEMP_DIR"
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

BACKUP_EXTRACT_DIR="$TEMP_DIR/$BACKUP_NAME"

# Verify backup structure
if [[ ! -f "$BACKUP_EXTRACT_DIR/manifest.json" ]]; then
    log_error "Invalid backup: manifest.json not found"
    exit 1
fi

# Read manifest
log "Reading backup manifest..."
MANIFEST=$(cat "$BACKUP_EXTRACT_DIR/manifest.json")
echo "$MANIFEST" | jq . > /dev/null || {
    log_error "Invalid manifest.json format"
    exit 1
}

BACKUP_VERSION=$(echo "$MANIFEST" | jq -r '.version')
BACKUP_TIMESTAMP=$(echo "$MANIFEST" | jq -r '.timestamp')

log "Backup version: $BACKUP_VERSION"
log "Backup timestamp: $BACKUP_TIMESTAMP"

# Show what will be restored
log "Backup contains the following components:"
echo "$MANIFEST" | jq -r '.components | keys[]' | while read component; do
    file=$(echo "$MANIFEST" | jq -r ".components.$component.file")
    format=$(echo "$MANIFEST" | jq -r ".components.$component.format")
    echo "  - $component ($format): $file"
done

# Confirmation
if [[ "$FORCE" != "true" && "$DRY_RUN" != "true" ]]; then
    echo ""
    echo "WARNING: This will restore data from backup $BACKUP_TIMESTAMP"
    echo "Current data will be REPLACED. This action cannot be undone."
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    
    if [[ "$confirm" != "yes" ]]; then
        log "Restore cancelled by user"
        rm -rf "$TEMP_DIR"
        exit 0
    fi
fi

if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY RUN: Would restore the following components:"
    echo "$MANIFEST" | jq -r '.components | keys[]'
    rm -rf "$TEMP_DIR"
    exit 0
fi

# Stop services during restore
log "Stopping application services..."
docker-compose -f /app/docker-compose.prod.yml stop backend frontend

# Restore database
if [[ -f "$BACKUP_EXTRACT_DIR/database.dump" ]]; then
    log "Restoring database..."
    
    # Drop and recreate database
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d postgres << EOF
DROP DATABASE IF EXISTS $POSTGRES_DB;
CREATE DATABASE $POSTGRES_DB;
EOF
    
    # Restore from dump
    PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
        -h "$POSTGRES_HOST" \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        --verbose \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        "$BACKUP_EXTRACT_DIR/database.dump"
    
    if [[ $? -eq 0 ]]; then
        log "Database restored successfully"
    else
        log_error "Database restore failed"
        exit 1
    fi
else
    log "No database backup found, skipping database restore"
fi

# Restore validation reports
if [[ -f "$BACKUP_EXTRACT_DIR/validation-reports.tar.gz" ]]; then
    log "Restoring validation reports..."
    mkdir -p /var/lib/vibe-code
    tar -xzf "$BACKUP_EXTRACT_DIR/validation-reports.tar.gz" -C /var/lib/vibe-code/
    log "Validation reports restored"
fi

# Restore configuration
if [[ -f "$BACKUP_EXTRACT_DIR/config.tar.gz" ]]; then
    log "Restoring configuration..."
    tar -xzf "$BACKUP_EXTRACT_DIR/config.tar.gz" -C /app/
    log "Configuration restored"
fi

# Restore logs (optional - usually not needed)
if [[ -f "$BACKUP_EXTRACT_DIR/logs.tar.gz" ]]; then
    log "Restoring logs..."
    tar -xzf "$BACKUP_EXTRACT_DIR/logs.tar.gz" -C /app/
    log "Logs restored"
fi

# Set proper permissions
log "Setting file permissions..."
chown -R 1001:1001 /var/lib/vibe-code /app/.config /app/logs

# Start services
log "Starting application services..."
docker-compose -f /app/docker-compose.prod.yml start backend frontend

# Wait for services to be ready
log "Waiting for services to be ready..."
sleep 30

# Verify restore
log "Verifying restore..."

# Check database connection
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) FROM users;" > /dev/null
if [[ $? -eq 0 ]]; then
    log "Database connection verified"
else
    log_error "Database connection failed"
fi

# Check API health
if curl -f -s "http://backend:3000/health" > /dev/null; then
    log "API health check passed"
else
    log_error "API health check failed"
fi

# Cleanup
log "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

# Create restore log
echo "$BACKUP_TIMESTAMP" > "$BACKUP_DIR/last_restore"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Restored from $BACKUP_NAME" >> "$BACKUP_DIR/restore_history.log"

log "Restore completed successfully!"
log "Restored from backup: $BACKUP_NAME ($BACKUP_TIMESTAMP)"