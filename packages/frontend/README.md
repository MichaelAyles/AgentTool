# Vibe Code Frontend

React-based frontend for the Vibe Code universal AI coding assistant platform.

## Features

- 🎨 Modern React UI with Tailwind CSS
- 🔄 Real-time communication via WebSocket
- 🖥️ Terminal interface with xterm.js
- 📊 Process and resource monitoring
- 🔧 CLI adapter management
- ⚙️ Auto-detection of backend (local vs cloud)

## Deployment

### Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/vibe-code)

1. Click the deploy button above, or:
2. Push to GitHub and connect to Vercel
3. Vercel will automatically detect the configuration

### Manual Deployment

```bash
# Build for production
bun run build:vercel

# Preview the build
bun run preview

# Deploy to any static hosting
# Upload the contents of packages/frontend/dist/
```

## Development

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Run tests
bun test
```

## Environment Variables

Create `.env.local` from `.env.local.example`:

```bash
cp .env.local.example .env.local
```

Key variables:

- `VITE_BACKEND_TYPE`: auto, local, or cloud
- `VITE_DESKTOP_CONNECTOR_URL`: Local backend URL
- `VITE_API_BASE_URL`: API base URL

## Architecture

### Static Mode (Vercel)

- Frontend deployed as static site
- Auto-detects local desktop connector
- Falls back to setup instructions if no backend

### Integrated Mode

- Frontend served by backend
- Direct API access
- Full real-time functionality

## Backend Detection

The frontend automatically detects available backends:

1. **Local Desktop Connector** (`http://localhost:3000`)
   - Checks for health endpoint
   - Verifies response contains `type: "desktop-connector"`
   - Provides full functionality

2. **Cloud Backend**
   - Uses current domain API endpoints
   - Provides full functionality

3. **No Backend**
   - Shows setup instructions
   - Links to desktop connector installer
   - Provides fallback pages

## Key Components

### Setup Component (`/setup`)

- Backend configuration
- Desktop connector installation
- System information display

### Terminal Component

- Real-time terminal with PTY support
- WebSocket communication
- Session management

### Project Management

- Project creation and cloning
- Git integration
- File system access (via backend)

### CLI Adapter Management

- Multi-adapter support (Claude Code, Gemini CLI)
- Installation and configuration
- Health monitoring

## Build Configuration

### Vite Configuration

- Optimized for static deployment
- Code splitting for better performance
- Environment-specific builds

### Vercel Configuration

- Automatic static file serving
- API fallback routing
- Security headers
- Cache optimization

## Troubleshooting

### Build Issues

1. Check TypeScript errors: `bun run typecheck`
2. Clear cache: `rm -rf node_modules/.cache`
3. Rebuild: `bun run clean && bun run build`

### Runtime Issues

1. Check browser console for errors
2. Verify backend connectivity
3. Check network requests in DevTools

### Backend Connection

1. Ensure desktop connector is running: `vibe-code-desktop status`
2. Check CORS settings
3. Verify WebSocket connection

## Performance

### Bundle Size

- Vendor chunks for libraries
- Dynamic imports for routes
- Tree shaking enabled

### Caching

- Static assets: 1 year cache
- HTML: No cache for updates
- API responses: Short cache

### Optimization

- Lazy loading of components
- Image optimization
- Preloading critical resources

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
