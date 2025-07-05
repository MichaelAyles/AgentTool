# AgentTool Deployment Guide

This guide covers how to deploy the AgentTool landing page to Vercel.

## Quick Deploy to Vercel

### Option 1: One-Click Deploy (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMichaelAyles%2FAgentTool&project-name=agenttool-landing&repository-name=AgentTool&root-directory=frontend)

### Option 2: Manual Deployment

1. **Connect Repository to Vercel**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New" → "Project"
   - Import your GitHub repository

2. **Configure Build Settings**
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

3. **Deploy**
   - Click "Deploy"
   - Vercel will automatically build and deploy your landing page

## Configuration

The landing page is pre-configured with:

- ✅ Responsive design optimized for all devices
- ✅ Fast loading with Vite build optimization
- ✅ SEO meta tags and OpenGraph properties
- ✅ One-click installation script copy button
- ✅ Beautiful animations with Framer Motion
- ✅ GitHub links pointing to your repository

## Environment Variables

No environment variables are required for the landing page. All configuration is handled in the code.

## Custom Domain (Optional)

To use a custom domain:

1. Go to your Vercel project dashboard
2. Navigate to "Settings" → "Domains"
3. Add your custom domain
4. Follow Vercel's DNS configuration instructions

## GitHub Repository Setup

Make sure your GitHub repository is public and contains:

- ✅ `/frontend/` directory with the landing page
- ✅ `/setup.sh` script in the root directory
- ✅ `README.md` with project documentation

## Installation Script

The landing page references the installation script at:
```
https://raw.githubusercontent.com/MichaelAyles/AgentTool/main/setup.sh
```

Ensure this file exists and is executable in your repository root.

## Updating the Landing Page

1. Make changes to files in `/frontend/src/`
2. Commit and push to your main branch
3. Vercel will automatically redeploy

## Analytics (Optional)

To add analytics, you can integrate:
- **Vercel Analytics**: Add to your Vercel project settings
- **Google Analytics**: Add tracking code to `index.html`
- **Plausible**: Add script tag to `index.html`

## Performance

The landing page is optimized for performance:
- ⚡ Vite for fast builds and hot reload
- 🎨 Tailwind CSS for minimal bundle size
- 📦 Code splitting and tree shaking
- 🖼️ Optimized images and assets
- 🌐 CDN delivery via Vercel Edge Network

## Support

For deployment issues:
1. Check the [Vercel Documentation](https://vercel.com/docs)
2. Review build logs in your Vercel dashboard
3. Open an issue in the [GitHub repository](https://github.com/MichaelAyles/AgentTool/issues)