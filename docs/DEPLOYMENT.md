# Production Deployment Guide

This guide covers deploying Vibe Code to production environments using Docker and container orchestration.

## Overview

Vibe Code is designed for containerized deployment with support for:

- **Docker Compose**: Single-server deployments
- **Kubernetes**: Multi-server orchestration
- **Cloud Services**: AWS, GCP, Azure integrations
- **Monitoring**: Prometheus, Grafana, ELK stack
- **Security**: SSL/TLS, authentication, audit logging

## Deployment Options

### 1. Docker Compose (Recommended for Single Server)

**Best for**: Small to medium deployments, development teams, proof of concepts

```bash
# Clone repository
git clone https://github.com/your-org/vibe-code.git
cd vibe-code

# Configure environment
cp .env.production .env
# Edit .env with your production values

# Deploy
./scripts/deploy.sh production
```

**Includes**:
- Application services (frontend, backend)
- Database (PostgreSQL)
- Cache (Redis)
- Monitoring (Prometheus, Grafana)
- Logging (ELK stack)
- Backup services

### 2. Kubernetes

**Best for**: Large deployments, high availability, auto-scaling

```bash
# Deploy to Kubernetes
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/
```

**Features**:
- Auto-scaling based on load
- Rolling updates with zero downtime
- Health checks and self-healing
- Resource limits and requests
- Ingress with SSL termination

### 3. Cloud Services

**AWS ECS/Fargate**:
```bash
# Deploy using AWS CDK
cd deployment/aws
npm install
cdk deploy VibCodeStack
```

**Google Cloud Run**:
```bash
# Deploy to Cloud Run
gcloud run deploy vibe-code \
  --image gcr.io/your-project/vibe-code \
  --platform managed \
  --region us-central1
```

**Azure Container Instances**:
```bash
# Deploy to Azure
az container create \
  --resource-group vibe-code \
  --name vibe-code \
  --image your-registry/vibe-code:latest
```

## Pre-deployment Checklist

### Infrastructure Requirements

- [ ] **Compute**: Minimum 2 vCPUs, 4GB RAM per service
- [ ] **Storage**: 100GB+ for databases and logs
- [ ] **Network**: Load balancer, SSL certificates
- [ ] **DNS**: Domain names and SSL certificates
- [ ] **Monitoring**: Prometheus, Grafana endpoints
- [ ] **Backup**: S3 bucket or equivalent storage

### Security Requirements

- [ ] **SSL/TLS**: Valid certificates for all domains
- [ ] **Secrets**: Secure storage for API keys and passwords
- [ ] **Network**: VPC, security groups, firewall rules
- [ ] **Authentication**: OAuth providers or LDAP integration
- [ ] **Audit**: Log aggregation and retention policies
- [ ] **Backup**: Encrypted backups with retention policy

### Configuration Requirements

- [ ] **Environment Variables**: All required variables set
- [ ] **API Keys**: Valid keys for AI services
- [ ] **Database**: Connection strings and credentials
- [ ] **Cache**: Redis configuration
- [ ] **Monitoring**: Metrics and alerting endpoints
- [ ] **Email**: SMTP configuration for notifications

## Step-by-Step Deployment

### 1. Infrastructure Setup

**Create Infrastructure**:
```bash
# Using Terraform (recommended)
cd deployment/terraform
terraform init
terraform plan
terraform apply

# Using CloudFormation (AWS)
aws cloudformation deploy \
  --template-file infrastructure.yaml \
  --stack-name vibe-code-infra
```

**Verify Infrastructure**:
```bash
# Check load balancer
curl -f https://your-domain.com/health

# Check database connectivity
psql -h your-db-host -U vibecode -d vibecode -c "SELECT 1;"

# Check Redis
redis-cli -h your-redis-host ping
```

### 2. Application Deployment

**Build Images**:
```bash
# Build production images
docker build -t vibe-code-backend:v1.0.0 -f packages/backend/Dockerfile .
docker build -t vibe-code-frontend:v1.0.0 -f packages/frontend/Dockerfile .

# Push to registry
docker push your-registry/vibe-code-backend:v1.0.0
docker push your-registry/vibe-code-frontend:v1.0.0
```

**Deploy Services**:
```bash
# Update docker-compose with new image tags
sed -i 's|image: vibe-code-backend:.*|image: your-registry/vibe-code-backend:v1.0.0|' docker-compose.prod.yml

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

**Verify Deployment**:
```bash
# Check service health
curl -f https://your-domain.com/api/health
curl -f https://your-domain.com/health

# Check all services
docker-compose -f docker-compose.prod.yml ps
```

### 3. Database Setup

**Initialize Database**:
```bash
# Run migrations
docker-compose -f docker-compose.prod.yml exec backend \
  npm run migrate

# Create admin user
docker-compose -f docker-compose.prod.yml exec backend \
  npm run create-admin -- --email admin@your-domain.com
```

**Configure Backup**:
```bash
# Test backup
docker-compose -f docker-compose.prod.yml exec backup \
  /scripts/backup.sh

# Verify backup uploaded to S3
aws s3 ls s3://your-backup-bucket/backups/
```

### 4. Monitoring Setup

**Configure Prometheus**:
```bash
# Verify Prometheus targets
curl http://your-domain.com:9090/api/v1/targets

# Check metrics collection
curl http://your-domain.com:9090/api/v1/query?query=up
```

**Configure Grafana**:
```bash
# Access Grafana
open http://your-domain.com:3001

# Import dashboards
curl -X POST http://admin:password@your-domain.com:3001/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @docker/grafana/dashboards/vibe-code-dashboard.json
```

**Configure Alerts**:
```bash
# Test alert rules
curl http://your-domain.com:9090/api/v1/rules

# Test alertmanager
curl -X POST http://your-domain.com:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{"labels":{"alertname":"test"}}]'
```

## Configuration Management

### Environment-Specific Configuration

**Production (.env.production)**:
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-db:5432/vibecode
REDIS_URL=redis://prod-redis:6379
JWT_SECRET=prod-jwt-secret-256-bits
DANGEROUS_MODE_ENABLED=false
AUDIT_LOG_LEVEL=info
```

**Staging (.env.staging)**:
```bash
NODE_ENV=staging
DATABASE_URL=postgresql://user:pass@staging-db:5432/vibecode_staging
REDIS_URL=redis://staging-redis:6379
JWT_SECRET=staging-jwt-secret
DANGEROUS_MODE_ENABLED=true
AUDIT_LOG_LEVEL=debug
```

### Secret Management

**Using Docker Secrets**:
```bash
# Create secrets
echo "your-jwt-secret" | docker secret create jwt_secret -
echo "your-db-password" | docker secret create db_password -

# Use in docker-compose
services:
  backend:
    secrets:
      - jwt_secret
      - db_password
```

**Using Kubernetes Secrets**:
```bash
# Create secret
kubectl create secret generic vibe-code-secrets \
  --from-literal=jwt-secret=your-jwt-secret \
  --from-literal=db-password=your-db-password

# Reference in deployment
env:
- name: JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: vibe-code-secrets
      key: jwt-secret
```

## Scaling and High Availability

### Horizontal Scaling

**Scale Backend Services**:
```bash
# Docker Compose
docker-compose -f docker-compose.prod.yml up -d --scale backend=3

# Kubernetes
kubectl scale deployment backend --replicas=3
```

**Load Balancing**:
```nginx
upstream backend {
    server backend-1:3000;
    server backend-2:3000;
    server backend-3:3000;
}

server {
    location /api/ {
        proxy_pass http://backend;
    }
}
```

### Database High Availability

**PostgreSQL with Streaming Replication**:
```yaml
services:
  postgres-primary:
    image: postgres:15
    environment:
      POSTGRES_REPLICATION_USER: replicator
      POSTGRES_REPLICATION_PASSWORD: repl_password
  
  postgres-replica:
    image: postgres:15
    environment:
      PGUSER: postgres
      POSTGRES_MASTER_SERVICE: postgres-primary
```

**Redis Cluster**:
```yaml
services:
  redis-1:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes
  redis-2:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes
  redis-3:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes
```

## Security Hardening

### SSL/TLS Configuration

**Nginx SSL Configuration**:
```nginx
server {
    listen 443 ssl http2;
    ssl_certificate /etc/ssl/certs/your-domain.crt;
    ssl_certificate_key /etc/ssl/private/your-domain.key;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
}
```

### Network Security

**Docker Network Isolation**:
```yaml
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true

services:
  nginx:
    networks: [frontend]
  backend:
    networks: [frontend, backend]
  postgres:
    networks: [backend]
```

**Firewall Rules**:
```bash
# Allow only necessary ports
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp
ufw deny everything
ufw enable
```

## Monitoring and Alerting

### Health Checks

**Application Health**:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

**Database Health**:
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U vibecode -d vibecode"]
  interval: 10s
  timeout: 5s
  retries: 5
```

### Alerting Rules

**Critical Alerts**:
```yaml
groups:
  - name: critical
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
```

**Performance Alerts**:
```yaml
- alert: HighResponseTime
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High response time detected"
```

## Backup and Recovery

### Automated Backups

**Database Backup**:
```bash
# Daily backup script
#!/bin/bash
pg_dump -h postgres -U vibecode vibecode | \
  gzip > /backups/vibecode-$(date +%Y%m%d).sql.gz

# Upload to S3
aws s3 cp /backups/vibecode-$(date +%Y%m%d).sql.gz \
  s3://your-backup-bucket/daily/
```

**Application Data Backup**:
```bash
# Backup validation reports
tar -czf /backups/validation-reports-$(date +%Y%m%d).tar.gz \
  /var/lib/vibe-code/validation-reports

# Backup configuration
tar -czf /backups/config-$(date +%Y%m%d).tar.gz \
  /app/.config
```

### Disaster Recovery

**Complete System Recovery**:
```bash
# Restore from backup
./scripts/deploy.sh restore production latest

# Verify recovery
curl -f https://your-domain.com/health
```

## Maintenance

### Updates and Upgrades

**Rolling Update**:
```bash
# Build new version
docker build -t vibe-code-backend:v1.1.0 .

# Update one service at a time
docker-compose -f docker-compose.prod.yml up -d --no-deps backend

# Verify update
curl -f https://your-domain.com/api/health
```

**Database Migrations**:
```bash
# Run migrations
docker-compose -f docker-compose.prod.yml exec backend \
  npm run migrate

# Verify migration
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U vibecode -d vibecode -c "\dt"
```

### Log Management

**Log Rotation**:
```bash
# Configure logrotate
echo '/var/log/vibe-code/*.log {
  daily
  rotate 30
  compress
  delaycompress
  missingok
  notifempty
  create 644 vibe-code vibe-code
}' > /etc/logrotate.d/vibe-code
```

**Log Aggregation**:
```yaml
# Filebeat configuration
filebeat.inputs:
- type: log
  paths:
    - /var/log/vibe-code/*.log
  fields:
    service: vibe-code
    environment: production

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
```

## Troubleshooting

### Common Issues

**Service Won't Start**:
```bash
# Check logs
docker-compose logs backend

# Check resources
docker stats

# Check disk space
df -h
```

**Database Connection Issues**:
```bash
# Test connection
docker-compose exec backend \
  psql -h postgres -U vibecode -d vibecode -c "SELECT 1;"

# Check database logs
docker-compose logs postgres
```

**Performance Issues**:
```bash
# Check resource usage
docker stats

# Check application metrics
curl http://your-domain.com:9090/api/v1/query?query=rate(http_requests_total[5m])

# Check database performance
docker-compose exec postgres \
  psql -U vibecode -d vibecode -c "SELECT * FROM pg_stat_activity;"
```

### Recovery Procedures

**Service Recovery**:
```bash
# Restart specific service
docker-compose restart backend

# Force recreate
docker-compose up -d --force-recreate backend
```

**Data Recovery**:
```bash
# Restore from backup
./docker/backup/restore.sh vibe-code-backup-20231201_120000

# Verify restoration
curl -f https://your-domain.com/api/health
```

---

For additional support, consult the [Disaster Recovery Guide](DISASTER_RECOVERY.md) or contact the infrastructure team.