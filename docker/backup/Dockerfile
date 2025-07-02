FROM alpine:3.18

# Install required packages
RUN apk add --no-cache \
    postgresql-client \
    aws-cli \
    tar \
    gzip \
    curl \
    bash \
    dcron \
    && rm -rf /var/cache/apk/*

# Create backup user
RUN addgroup -g 1001 -S backup
RUN adduser -S backup -u 1001 -G backup

# Create directories
RUN mkdir -p /backups /scripts
RUN chown -R backup:backup /backups /scripts

# Copy backup scripts
COPY backup.sh /scripts/backup.sh
COPY restore.sh /scripts/restore.sh
COPY entrypoint.sh /scripts/entrypoint.sh

# Make scripts executable
RUN chmod +x /scripts/*.sh

# Switch to backup user
USER backup

# Set working directory
WORKDIR /backups

# Health check
HEALTHCHECK --interval=60s --timeout=30s --start-period=10s --retries=3 \
  CMD /scripts/healthcheck.sh

# Default command
CMD ["/scripts/entrypoint.sh"]