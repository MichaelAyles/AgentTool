# Vibe Code - Disaster Recovery Guide

This guide provides step-by-step procedures for disaster recovery scenarios in the Vibe Code production environment.

## Overview

Vibe Code includes comprehensive backup and recovery procedures to ensure business continuity in case of:

- Complete system failure
- Data corruption
- Security incidents
- Infrastructure outages
- Human error

## Backup Strategy

### Automated Backups

- **Schedule**: Daily at 2:00 AM UTC
- **Retention**: 30 days local, 90 days in S3
- **Components**:
  - PostgreSQL database (custom format, compressed)
  - Validation reports and storage
  - Application configuration
  - System logs

### Backup Locations

1. **Local**: `/backups` directory on backup service container
2. **S3**: Configured S3 bucket for offsite storage
3. **Point-in-time**: Database WAL archiving for precise recovery

## Recovery Procedures

### 1. Database Recovery

#### Quick Database Restore

```bash
# List available backups
docker exec vibe-code-backup ls -la /backups/

# Restore from latest backup
docker exec vibe-code-backup /scripts/restore.sh vibe-code-backup-YYYYMMDD_HHMMSS

# Restore from S3
docker exec vibe-code-backup /scripts/restore.sh -s s3 vibe-code-backup-YYYYMMDD_HHMMSS
```

#### Point-in-Time Recovery

```bash
# Stop database
docker-compose -f docker-compose.prod.yml stop postgres

# Restore base backup
docker exec vibe-code-backup /scripts/restore.sh vibe-code-backup-YYYYMMDD_HHMMSS

# Start database in recovery mode
docker-compose -f docker-compose.prod.yml start postgres

# Apply WAL files up to specific time
docker exec vibe-code-postgres-prod psql -U vibecode -d vibecode -c "
SELECT pg_wal_replay_resume();
"
```

### 2. Complete System Recovery

#### From Total Infrastructure Loss

1. **Provision New Infrastructure**

   ```bash
   # Clone repository
   git clone https://github.com/your-org/vibe-code.git
   cd vibe-code

   # Copy production environment
   cp .env.production .env
   # Edit .env with new infrastructure details
   ```

2. **Deploy Base System**

   ```bash
   # Deploy infrastructure services
   docker-compose -f docker-compose.prod.yml up -d redis postgres elasticsearch

   # Wait for services to be ready
   sleep 60
   ```

3. **Restore Data**

   ```bash
   # Download latest backup from S3
   docker-compose -f docker-compose.prod.yml run --rm backup \
     /scripts/restore.sh -s s3 -f $(aws s3 ls s3://your-backup-bucket/backups/ --recursive | sort | tail -n 1 | awk '{print $4}' | sed 's/.tar.gz//')
   ```

4. **Deploy Application Services**

   ```bash
   # Start application
   docker-compose -f docker-compose.prod.yml up -d backend frontend nginx

   # Start monitoring
   docker-compose -f docker-compose.prod.yml up -d prometheus grafana kibana
   ```

### 3. Application Recovery

#### Service Restart

```bash
# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend

# Restart all application services
docker-compose -f docker-compose.prod.yml restart backend frontend nginx
```

#### Configuration Recovery

```bash
# Restore configuration from backup
docker exec vibe-code-backup tar -xzf /backups/latest/config.tar.gz -C /app/

# Restart services to pick up new config
docker-compose -f docker-compose.prod.yml restart backend
```

### 4. Data Corruption Recovery

#### Selective Data Recovery

```bash
# Extract specific data from backup
docker exec vibe-code-backup bash -c "
  cd /tmp
  tar -xzf /backups/vibe-code-backup-YYYYMMDD_HHMMSS.tar.gz
  tar -xzf vibe-code-backup-YYYYMMDD_HHMMSS/validation-reports.tar.gz
"

# Copy specific files
docker cp vibe-code-backup:/tmp/validation-reports /var/lib/vibe-code/
```

## Recovery Time Objectives (RTO)

| Scenario                | Target RTO | Description                 |
| ----------------------- | ---------- | --------------------------- |
| Database failure        | 15 minutes | Restore from latest backup  |
| Application failure     | 5 minutes  | Service restart             |
| Complete system failure | 2 hours    | Full infrastructure rebuild |
| Data corruption         | 30 minutes | Selective restore           |

## Recovery Point Objectives (RPO)

| Data Type       | Target RPO | Backup Frequency |
| --------------- | ---------- | ---------------- |
| Database        | 24 hours   | Daily            |
| Configuration   | 24 hours   | Daily            |
| Logs            | 24 hours   | Daily            |
| Validation data | 24 hours   | Daily            |

## Testing Procedures

### Monthly Recovery Tests

1. **Database Recovery Test**

   ```bash
   # Create test environment
   docker-compose -f docker-compose.test.yml up -d

   # Restore latest backup to test environment
   docker exec test-backup /scripts/restore.sh latest

   # Verify data integrity
   docker exec test-postgres psql -U vibecode -d vibecode -c "SELECT COUNT(*) FROM users;"
   ```

2. **Complete System Recovery Test**

   ```bash
   # Deploy to staging environment
   ./scripts/deploy.sh staging

   # Restore production backup
   docker exec staging-backup /scripts/restore.sh -s s3 latest

   # Run integration tests
   npm run test:integration:staging
   ```

## Monitoring and Alerting

### Backup Monitoring

- **Health Check**: Backup service reports health every minute
- **Alerts**: Failed backups trigger immediate alerts
- **Metrics**: Backup size, duration, and success rate tracked

### Recovery Monitoring

- **RTO Tracking**: Recovery time measured and reported
- **RPO Verification**: Data loss assessment after recovery
- **Service Health**: Continuous monitoring during recovery

## Emergency Contacts

### Escalation Matrix

| Level | Contact             | Response Time |
| ----- | ------------------- | ------------- |
| L1    | On-call Engineer    | 15 minutes    |
| L2    | Senior Engineer     | 30 minutes    |
| L3    | Engineering Manager | 1 hour        |
| L4    | CTO                 | 2 hours       |

### Communication Channels

- **Primary**: Slack #incidents channel
- **Secondary**: Email distribution list
- **Emergency**: Phone/SMS escalation

## Security Considerations

### Backup Security

- Backups encrypted at rest and in transit
- Access controlled via IAM policies
- Backup integrity verified with checksums
- Audit trail for all backup operations

### Recovery Security

- Recovery operations require multi-factor authentication
- All recovery actions logged and audited
- Security team notified of all recovery operations
- Post-recovery security assessment required

## Post-Recovery Procedures

### Verification Checklist

- [ ] Database connectivity confirmed
- [ ] Application functionality verified
- [ ] User authentication working
- [ ] Validation pipeline operational
- [ ] Monitoring and alerting functional
- [ ] Performance metrics normal
- [ ] Security controls active

### Documentation

1. **Incident Report**: Document cause, impact, and resolution
2. **Timeline**: Record all recovery actions with timestamps
3. **Lessons Learned**: Identify improvements for future incidents
4. **Process Updates**: Update procedures based on lessons learned

## Automation

### Recovery Scripts

- `scripts/deploy.sh rollback`: Automated rollback to previous version
- `docker/backup/restore.sh`: Automated data restoration
- `scripts/disaster-recovery.sh`: Complete disaster recovery automation

### Infrastructure as Code

- All infrastructure defined in version control
- Automated provisioning via Terraform/CloudFormation
- Configuration management via Ansible/Puppet

## Regular Maintenance

### Weekly Tasks

- Verify backup completion and integrity
- Test recovery scripts in staging environment
- Review and update disaster recovery procedures
- Check storage capacity and retention policies

### Monthly Tasks

- Full disaster recovery test
- Update emergency contact information
- Review and update recovery time objectives
- Security audit of backup procedures

### Quarterly Tasks

- Disaster recovery plan review
- Staff training and tabletop exercises
- Infrastructure and tooling updates
- Business continuity plan validation

---

**Last Updated**: $(date)
**Next Review**: $(date -d "+3 months")
**Document Owner**: Infrastructure Team
