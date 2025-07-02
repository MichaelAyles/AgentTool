# Vercel Deployment Guide

This guide explains how to deploy Vibe Code's frontend to Vercel as a static web application.

## Overview

The Vibe Code frontend is designed to work in two modes:

- **Static Mode**: Deployed on Vercel, requires desktop connector for backend functionality
- **Integrated Mode**: Deployed with backend, provides full functionality

## Quick Deployment

### Option 1: Deploy Button

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/vibe-code&project-name=vibe-code&repository-name=vibe-code)

### Option 2: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from project root
vercel

# Follow the prompts:
# - Set up project: Yes
# - Which scope: [Your account/team]
# - Link to existing project: No
# - Project name: vibe-code
# - Directory: ./
# - Override settings: Yes
# - Build command: cd packages/frontend && bun run build
# - Output directory: packages/frontend/dist
```

### Option 3: GitHub Integration

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "New Project"
4. Import from GitHub
5. Configure build settings (see below)

## Build Configuration

Vercel should automatically detect the configuration from `vercel.json`, but if you need to configure manually:

### Project Settings

- **Framework Preset**: Vite
- **Root Directory**: `./` (project root)
- **Build Command**: `cd packages/frontend && bun run build`
- **Output Directory**: `packages/frontend/dist`
- **Install Command**: `cd packages/frontend && bun install`

### Environment Variables

Set these in your Vercel project settings:

#### Required

```
NODE_ENV=production
```

#### Optional

```
VITE_APP_NAME=Vibe Code
VITE_DOCS_URL=https://docs.vibecode.com
VITE_GITHUB_URL=https://github.com/your-org/vibe-code
VITE_SUPPORT_URL=https://support.vibecode.com
```

## Domain Configuration

### Custom Domain

1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS records as shown

### Subpath Deployment

If deploying to a subpath (e.g., `yoursite.com/vibe-code`):

1. Update `vite.config.ts`:

```typescript
export default defineConfig({
  base: '/vibe-code/',
  // ... other config
});
```

2. Update `vercel.json` routes accordingly

## Features

### ✅ What Works on Vercel

- Complete frontend UI
- Desktop connector detection
- Backend configuration
- Project management (with desktop connector)
- Real-time terminal (with desktop connector)
- All CLI adapter features (with desktop connector)

### ⚠️ What Requires Desktop Connector

- Backend API functionality
- File system access
- Process management
- Terminal sessions
- Local CLI tool integration

### 🔄 Automatic Fallback

When no backend is detected, the app shows:

- Setup instructions for desktop connector
- Link to installer script
- Fallback pages for API endpoints

## Desktop Connector Integration

### Installation Script

The installer script is automatically available at:

```
https://your-vercel-app.com/install-desktop.sh
```

### One-Line Install

Users can install with:

```bash
curl -fsSL https://your-vercel-app.com/install-desktop.sh | bash
```

### Auto-Detection

The frontend automatically detects when a desktop connector is running locally and switches to use it.

## Monitoring & Analytics

### Build Analytics

Enable in Vercel dashboard:

- Go to Analytics tab
- Enable Web Analytics
- Configure as needed

### Performance Monitoring

Monitor key metrics:

- Bundle size
- Load time
- Core Web Vitals

### Error Tracking

Consider integrating:

- Sentry for error tracking
- LogRocket for session replay
- Custom analytics

## Optimization

### Bundle Size

Current optimizations:

- Code splitting by route
- Vendor chunk separation
- Tree shaking enabled
- Minification in production

### Caching

Configured headers:

- Static assets: 1 year cache
- HTML: No cache
- API fallbacks: 1 hour cache

### Performance

- Lazy loading of routes
- Image optimization
- Preloading of critical resources

## Troubleshooting

### Build Fails

1. Check build logs in Vercel dashboard
2. Verify all dependencies are installed
3. Check TypeScript compilation
4. Verify environment variables

### Runtime Errors

1. Check browser console
2. Verify API endpoints return fallback pages
3. Check desktop connector detection logic

### Slow Loading

1. Analyze bundle size
2. Check network requests
3. Verify CDN distribution
4. Monitor Core Web Vitals

## Advanced Configuration

### Custom Redirects

Add to `vercel.json`:

```json
{
  "redirects": [
    {
      "source": "/docs",
      "destination": "https://docs.vibecode.com"
    }
  ]
}
```

### Headers & Security

Current security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

### Functions (Optional)

If you need server-side functionality:

```typescript
// api/health.ts
export default function handler(req: any, res: any) {
  res.status(200).json({
    status: 'healthy',
    deployment: 'vercel',
    timestamp: new Date().toISOString(),
  });
}
```

## Maintenance

### Updates

1. Push changes to main branch
2. Vercel automatically deploys
3. Test deployment on preview URL
4. Promote to production if needed

### Rollbacks

1. Go to Deployments tab
2. Find previous deployment
3. Click "Promote to Production"

### Monitoring

- Set up deployment notifications
- Monitor error rates
- Check performance metrics

## Support

- 📚 [Vercel Documentation](https://vercel.com/docs)
- 🐛 [Report Issues](https://github.com/your-org/vibe-code/issues)
- 💬 [Community Support](https://discord.gg/vibecode)
- 📧 [Email Support](mailto:support@vibecode.com)
