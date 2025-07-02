# User Requests

## Frontend Deployment Issue  
- ❌ **CURRENT ISSUE**: Vercel build failing on working branch
- Error: "The specified Root Directory 'packages/frontend' does not exist"
- Our structure: "frontend/" at repository root
- Previous deployment still working: https://frontend-three-delta-48.vercel.app
- **Action needed**: Update Vercel project settings to use "frontend" as root directory
- Need to configure custom domain vibe.theduck.chat to point to deployment

## Desktop Connector Dependencies Issue
- node-pty compilation failing on macOS with Node.js v24.2.0
- Error: 'memory' file not found during compilation
- **Workaround**: Implementing mock terminal for development
- **Solution needed**: Either:
  1. Use Node.js v18 or v20 (more stable for native modules)
  2. Install Xcode command line tools: `xcode-select --install`
  3. Use alternative terminal library or mock implementation

## Suggested Actions:
1. Configure custom domain vibe.theduck.chat → https://frontend-three-delta-48.vercel.app
2. Resolve node-pty compilation issue for terminal functionality
3. Test WebSocket connection between frontend and connector