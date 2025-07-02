# Environment Variables Setup

## Architecture Overview

The Vibe Code platform now supports three deployment modes:

1. **Static Frontend + Desktop Connector** (Recommended)
2. **Unified Desktop Connector** (Local Development)
3. **Full Cloud Deployment** (Enterprise)

## 🌐 Static Frontend (Vercel) Environment Variables

### Frontend Environment Variables

Set these in **Vercel Dashboard → Project Settings → Environment Variables**:

#### Required Variables

```bash
# Build Configuration
NODE_ENV=production
VITE_APP_NAME=Vibe Code
VITE_APP_VERSION=1.0.0

# Backend Detection
VITE_BACKEND_TYPE=auto
VITE_DESKTOP_CONNECTOR_URL=http://localhost:3000
VITE_API_BASE_URL=/api

# Feature Flags
VITE_FEATURE_DESKTOP_CONNECTOR=true
VITE_FEATURE_CLOUD_BACKEND=true
VITE_FEATURE_SESSION_MANAGEMENT=true
```

#### Optional Variables

```bash
# External URLs
VITE_DOCS_URL=https://docs.vibecode.com
VITE_GITHUB_URL=https://github.com/MichaelAyles/AgentTool
VITE_SUPPORT_URL=https://support.vibecode.com

# Analytics & Monitoring
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_ERROR_REPORTING=true
VITE_ANALYTICS_ID=your-analytics-id
VITE_SENTRY_DSN=your-sentry-dsn

# Session Configuration
VITE_SESSION_CHECK_INTERVAL=30000
VITE_SESSION_TIMEOUT=3600000
```

## 🖥️ Desktop Connector Environment Variables

### Local Development (.env)

```bash
# ===================
# Server Configuration
# ===================
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://your-vercel-app.vercel.app

# ===================
# Database Configuration
# ===================
# SQLite for development
DATABASE_PATH=./vibecode.db

# ===================
# Security Configuration
# ===================
JWT_SECRET=your-jwt-secret-change-in-production
SESSION_SECRET=your-session-secret-change-in-production

# ===================
# AI API Keys
# ===================
# Anthropic Claude
ANTHROPIC_API_KEY=your-anthropic-api-key-here

# Google AI (Gemini)
GOOGLE_AI_API_KEY=your-google-ai-api-key-here

# ===================
# Feature Flags
# ===================
# Enable dangerous mode (allows unrestricted commands)
DANGEROUS_MODE_ENABLED=false

# Enable session management
SESSION_MANAGEMENT_ENABLED=true

# Enable auto CLI detection
AUTO_CLI_DETECTION=true

# ===================
# Development Options
# ===================
# Debug logging
DEBUG=vibecode:*
LOG_LEVEL=info

# Hot reload
HOT_RELOAD=true
```

### Production Desktop Connector (.env.production)

```bash
# ===================
# Server Configuration
# ===================
PORT=3000
HOST=127.0.0.1
NODE_ENV=production

# CORS Configuration
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:3000

# ===================
# Database Configuration
# ===================
DATABASE_PATH=./vibecode.db

# ===================
# Security Configuration
# ===================
JWT_SECRET=your-strong-jwt-secret-256-bits
SESSION_SECRET=your-strong-session-secret-256-bits

# ===================
# AI API Keys
# ===================
ANTHROPIC_API_KEY=your-production-anthropic-key
GOOGLE_AI_API_KEY=your-production-google-key

# ===================
# Feature Flags
# ===================
DANGEROUS_MODE_ENABLED=false
SESSION_MANAGEMENT_ENABLED=true
AUTO_CLI_DETECTION=true

# ===================
# Production Options
# ===================
LOG_LEVEL=warn
DEBUG=

# Security
AUDIT_LOG_ENABLED=true
RATE_LIMITING_ENABLED=true
```

## ☁️ Full Cloud Deployment Environment Variables

### Backend (.env.production)

```bash
# ===================
# Server Configuration
# ===================
PORT=3000
NODE_ENV=production

# ===================
# Database Configuration
# ===================
DATABASE_URL=postgresql://username:password@host:5432/database
POSTGRES_PASSWORD=your-strong-postgres-password

# ===================
# Redis Configuration
# ===================
REDIS_URL=redis://localhost:6379

# ===================
# Security Configuration
# ===================
JWT_SECRET=your-strong-jwt-secret-256-bits
SESSION_SECRET=your-strong-session-secret-256-bits

# ===================
# AI API Keys
# ===================
ANTHROPIC_API_KEY=your-anthropic-api-key
GOOGLE_AI_API_KEY=your-google-ai-key

# ===================
# Feature Flags
# ===================
DANGEROUS_MODE_ENABLED=false
SECURITY_AUDIT_ENABLED=true
AUDIT_LOG_LEVEL=info

# ===================
# CORS Configuration
# ===================
ALLOWED_ORIGINS=https://your-frontend-domain.com

# ===================
# Monitoring & Logging
# ===================
LOG_LEVEL=info
LOG_FORMAT=json
ELASTICSEARCH_ENABLED=true

# ===================
# Email Configuration
# ===================
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
FROM_EMAIL=noreply@yourdomain.com

# ===================
# Backup Configuration
# ===================
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_S3_BUCKET=your-backup-bucket
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key

# ===================
# Rate Limiting
# ===================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ===================
# Health & Monitoring
# ===================
HEALTH_CHECK_ENABLED=true
METRICS_ENABLED=true
GRAFANA_PASSWORD=your-grafana-password

# ===================
# SSL/TLS
# ===================
SSL_CERT_PATH=/etc/nginx/ssl/cert.pem
SSL_KEY_PATH=/etc/nginx/ssl/key.pem
```

## 🔧 Setup Instructions

### 1. Static Frontend + Desktop Connector (Recommended)

#### Step 1: Deploy Frontend to Vercel

```bash
# Set environment variables in Vercel Dashboard
VITE_BACKEND_TYPE=auto
VITE_DESKTOP_CONNECTOR_URL=http://localhost:3000
# ... other frontend variables

# Deploy
git push origin main
```

#### Step 2: Setup Desktop Connector Locally

```bash
# Install desktop connector
curl -fsSL https://raw.githubusercontent.com/MichaelAyles/AgentTool/main/install-desktop.sh | bash

# Create .env file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start desktop connector
vibe-code-desktop start --session-id $(uuidgen)
```

### 2. Local Development

```bash
# Clone repository
git clone https://github.com/MichaelAyles/AgentTool.git
cd AgentTool

# Setup environment
cp .env.example .env
nano .env  # Configure your settings

# Install dependencies
bun install

# Start development
bun dev
```

### 3. Full Cloud Deployment

```bash
# Setup database and Redis
# Configure all production environment variables
# Deploy using Docker Compose

docker compose -f docker-compose.prod.yml up -d
```

## 🔍 Backend Detection Logic

The frontend automatically detects the available backend:

1. **Auto Mode** (Default):
   - Tries local desktop connector first (`http://localhost:3000`)
   - Falls back to cloud backend if local not available

2. **Local Mode**:
   - Forces connection to desktop connector only

3. **Cloud Mode**:
   - Forces connection to cloud backend only

## 🔐 Security Considerations

### Environment Variable Security

- **Never commit `.env` files** to version control
- **Use different keys** for development and production
- **Rotate API keys** regularly
- **Use strong passwords** (256-bit minimum)

### CORS Configuration

- **Static Frontend**: Add your Vercel domain to desktop connector CORS
- **Cloud Deployment**: Configure appropriate origins for your domains

### API Keys

- **Development**: Use test/development API keys
- **Production**: Use production API keys with appropriate rate limits

## 🚀 Quick Start Commands

### Static Frontend Deployment

```bash
# Vercel CLI
npm i -g vercel
vercel

# Environment variables (set in Vercel Dashboard)
vercel env add VITE_BACKEND_TYPE production
vercel env add VITE_DESKTOP_CONNECTOR_URL production
```

### Desktop Connector Setup

```bash
# One-line install
curl -fsSL https://raw.githubusercontent.com/MichaelAyles/AgentTool/main/install-desktop.sh | bash

# Manual setup
git clone https://github.com/MichaelAyles/AgentTool.git
cd AgentTool
cp .env.example .env
# Edit .env with your settings
bun install
bun run build
vibe-code-desktop start
```

### Development Setup

```bash
# Full development environment
git clone https://github.com/MichaelAyles/AgentTool.git
cd AgentTool
cp .env.example .env
bun install
bun dev
```

## 📋 Environment Variable Checklist

### Frontend (Vercel) ✅

- [ ] `VITE_BACKEND_TYPE=auto`
- [ ] `VITE_DESKTOP_CONNECTOR_URL=http://localhost:3000`
- [ ] `VITE_APP_NAME=Vibe Code`
- [ ] `NODE_ENV=production`

### Desktop Connector ✅

- [ ] `PORT=3000`
- [ ] `ALLOWED_ORIGINS=https://your-vercel-app.vercel.app`
- [ ] `ANTHROPIC_API_KEY=your-key`
- [ ] `JWT_SECRET=your-secret`
- [ ] `DATABASE_PATH=./vibecode.db`

### Optional Features ✅

- [ ] `DANGEROUS_MODE_ENABLED=false`
- [ ] `SESSION_MANAGEMENT_ENABLED=true`
- [ ] `AUTO_CLI_DETECTION=true`
- [ ] `AUDIT_LOG_ENABLED=true`

This setup provides maximum flexibility while maintaining security and ease of use across all deployment scenarios.
