# Vercel Deployment Checklist

## Pre-Deployment

### ✅ Code Preparation

- [ ] All features tested locally
- [ ] TypeScript errors resolved (or build configured to skip)
- [ ] Dependencies updated and secure
- [ ] Environment variables configured
- [ ] Build optimization verified

### ✅ Configuration Files

- [x] `vercel.json` - Vercel configuration
- [x] `packages/frontend/.env.production` - Production environment variables
- [x] `packages/frontend/README.md` - Frontend documentation
- [x] `VERCEL_DEPLOYMENT.md` - Deployment guide

### ✅ Static Assets

- [x] `packages/frontend/public/install-desktop.sh` - Desktop connector installer
- [x] `packages/frontend/public/api-fallback.html` - API fallback page
- [ ] Favicon and app icons
- [ ] Social media meta images

## Deployment Process

### Option 1: Deploy Button

1. Update repository URL in README deploy button
2. Test the deploy button link
3. Verify deployment settings

### Option 2: GitHub Integration

1. Push code to GitHub
2. Connect repository to Vercel
3. Configure build settings:
   - **Framework**: Vite
   - **Root Directory**: `./`
   - **Build Command**: `cd packages/frontend && bun run build:vercel`
   - **Output Directory**: `packages/frontend/dist`
   - **Install Command**: `cd packages/frontend && bun install`

### Option 3: Vercel CLI

```bash
# Install CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts
```

## Environment Variables

Set in Vercel Dashboard → Project Settings → Environment Variables:

### Required

```
NODE_ENV=production
```

### Optional

```
VITE_APP_NAME=Vibe Code
VITE_DOCS_URL=https://docs.vibecode.com
VITE_GITHUB_URL=https://github.com/your-org/vibe-code
VITE_SUPPORT_URL=https://support.vibecode.com
```

## Post-Deployment

### ✅ Verification

- [ ] Site loads correctly
- [ ] All routes work (/, /setup, /settings, etc.)
- [ ] API fallback pages display properly
- [ ] Desktop connector installer downloads
- [ ] Auto-detection works (test with local connector)

### ✅ Domain Configuration

- [ ] Custom domain configured (if needed)
- [ ] SSL certificate active
- [ ] DNS records pointing correctly
- [ ] www redirect configured

### ✅ Performance

- [ ] Lighthouse score > 90
- [ ] Bundle size acceptable
- [ ] Load time < 3 seconds
- [ ] Core Web Vitals passing

### ✅ SEO & Meta

- [ ] Meta tags configured
- [ ] Open Graph tags set
- [ ] Twitter Cards configured
- [ ] Sitemap generated (if needed)

### ✅ Monitoring

- [ ] Vercel Analytics enabled
- [ ] Error tracking configured
- [ ] Performance monitoring active
- [ ] Uptime monitoring set up

## Common Issues & Solutions

### Build Failures

**Issue**: TypeScript compilation errors
**Solution**: Use `build:vercel` script that skips TypeScript checking

**Issue**: Out of memory during build
**Solution**: Simplify build configuration, disable sourcemaps

**Issue**: Dependencies not found
**Solution**: Ensure all dependencies are in `dependencies`, not `devDependencies`

### Runtime Issues

**Issue**: 404 on routes
**Solution**: Verify SPA fallback in `vercel.json`

**Issue**: API calls fail
**Solution**: Check API fallback routing and CORS configuration

**Issue**: Assets not loading
**Solution**: Verify base path configuration in Vite

### Desktop Connector

**Issue**: Installer script not downloading
**Solution**: Check file is in `public/` directory and route is configured

**Issue**: Auto-detection not working
**Solution**: Verify CORS allows localhost:3000 requests

## Rollback Plan

If deployment fails:

1. Go to Vercel Dashboard → Deployments
2. Find last working deployment
3. Click "Promote to Production"
4. Investigate issues in staging

## Security Checklist

### ✅ Headers

- [x] CSP headers configured
- [x] XSS protection enabled
- [x] Frame options set
- [x] Content type sniffing disabled

### ✅ Dependencies

- [ ] No known vulnerabilities (`bun audit`)
- [ ] Dependencies up to date
- [ ] Only production deps in build

### ✅ Environment

- [ ] No secrets in client code
- [ ] Environment variables properly scoped
- [ ] Debug logs disabled in production

## Maintenance

### Regular Tasks

- [ ] Update dependencies monthly
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Update documentation

### Version Updates

- [ ] Tag releases in Git
- [ ] Update changelog
- [ ] Test deployment in preview
- [ ] Communicate changes to users

## Contact & Support

- 📧 **Technical Issues**: [Create GitHub Issue](https://github.com/your-org/vibe-code/issues)
- 📚 **Documentation**: [docs.vibecode.com](https://docs.vibecode.com)
- 💬 **Community**: [Discord](https://discord.gg/vibecode)
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/your-org/vibe-code/issues/new?template=bug_report.md)
