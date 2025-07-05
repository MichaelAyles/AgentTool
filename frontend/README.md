# AgentTool Landing Page

Beautiful landing page for AgentTool - Hierarchical Multi-Agent System for AI-Powered Development.

## Features

- 🎨 Beautiful animated UI with Framer Motion
- 📱 Fully responsive design
- 🎯 One-click installation script copy
- 🌙 Dark theme optimized
- ⚡ Built with Vite + React + TypeScript
- 🎨 Styled with Tailwind CSS

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

This landing page is configured for deployment on Vercel. Simply connect your GitHub repository to Vercel and it will automatically deploy from the `/frontend` directory.

### Vercel Configuration

The `vercel.json` file is configured to:
- Use the `/frontend` directory as the build root
- Build with `npm run build`
- Output to the `dist` directory
- Handle SPA routing with rewrites

## Components

- **Hero**: Main landing section with animated elements
- **Features**: Grid of AgentTool features with hover effects
- **Architecture**: Visual diagram of the hierarchical system
- **InstallSection**: One-click copy installation command
- **Footer**: Links and project information

## Customization

To customize for your own deployment:

1. Update the GitHub repository URL in `InstallSection.tsx`
2. Update social links in `Footer.tsx`
3. Modify the installation script URL to point to your repository
4. Update the setup.sh script with your repository details

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Framer Motion** - Animation library
- **Lucide React** - Icon library