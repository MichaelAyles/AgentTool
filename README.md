# Vibe Coding Terminal

A browser-based terminal interface that connects to your local development environment via UUID pairing. Access your terminal from anywhere with a secure, real-time connection.

**🚀 Live at: [https://vibe.theduck.chat](https://vibe.theduck.chat)**

## Overview

Vibe Coding App consists of two main components:
- **Frontend**: A static web application hosted on Vercel that provides the browser-based terminal interface
- **Desktop Connector**: A local application that runs on your machine and provides secure terminal access

## Features

### Current Features
- ✅ UUID-based session pairing
- ✅ Real-time terminal access through browser
- ✅ WebSocket-based streaming for low latency
- ✅ Local session persistence
- ✅ Cross-platform support (Mac, Linux, WSL)
- ✅ Secure local-only connections
- ✅ One-line installation script
- ✅ Auto-reconnection support
- ✅ Beautiful, responsive UI

### Future Features
- 📁 File system browser
- 🎨 Terminal themes and customization
- 📱 Mobile-responsive design
- 🔧 Multi-session support
- 📊 Process monitoring
- 🌙 Dark/light mode toggle

## Quick Start

### 1. Access the Web Interface
Visit: [https://vibe.theduck.chat](https://vibe.theduck.chat)

### 2. Install Desktop Connector
The easiest way is to use the one-line install command shown on the website:

```bash
curl -fsSL https://raw.githubusercontent.com/MichaelAyles/AgentTool/main/install.sh | bash -s YOUR_UUID
```

### 3. Connect
The connector will start automatically and connect to the web interface. You're ready to code!

For detailed installation instructions, see [INSTALLATION.md](INSTALLATION.md)

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│   Web Browser   │         │  Local Machine   │
│   (Frontend)    │         │ (Desktop Connector)│
│                 │         │                  │
│  Vercel Static  │◄────────┤  WebSocket Server │
│     Site        │  UUID   │                  │
│                 │  Auth   │   Terminal       │
│  Terminal UI    │         │   Sessions       │
└─────────────────┘         └──────────────────┘
```

## Development

### Prerequisites
- Node.js 18+ (for desktop connector)
- Modern web browser
- Mac, Linux, or WSL environment

### Local Development Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd vibe-coding-app
```

2. Install dependencies:
```bash
npm install
```

3. Start development servers:
```bash
# Frontend development
npm run dev:frontend

# Desktop connector development
npm run dev:connector
```

### Project Structure
```
vibe-coding-app/
├── frontend/           # Vercel-hosted static site
│   ├── index.html
│   ├── styles/
│   └── scripts/
├── connector/          # Desktop connector application
│   ├── src/
│   ├── package.json
│   └── dist/
├── docs/              # Documentation
├── scripts/           # Build and deployment scripts
└── tests/            # Test suites
```

## Security

- **Local Only**: The desktop connector only accepts connections from localhost
- **UUID Authentication**: Each session requires a unique UUID for access
- **No External Exposure**: Your terminal is never exposed to the internet
- **Session Isolation**: Each UUID creates an isolated session

## Deployment

### Frontend (Vercel)
The frontend is automatically deployed to Vercel on push to main branch.

### Desktop Connector
Distributed as:
- npm package for easy installation
- Standalone executables for various platforms
- Docker container for containerized environments

## Troubleshooting

### Common Issues

**Cannot connect to desktop connector:**
1. Ensure the connector is running locally
2. Check that the UUID matches exactly
3. Verify no firewall is blocking local connections
4. Try restarting the connector

**Terminal not responding:**
1. Check WebSocket connection status
2. Restart the desktop connector
3. Refresh the browser page
4. Check browser console for errors

**Setup script fails:**
1. Ensure you have proper permissions to install packages
2. Check internet connection for package downloads
3. Try manual installation method
4. Refer to platform-specific installation guides

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](issues/)
- 💬 [Discussions](discussions/)
- 📧 [Contact](mailto:support@example.com)

## Roadmap

See our [Project Roadmap](docs/ROADMAP.md) for planned features and development timeline.

---

**Note**: This project is currently in active development. Features and APIs may change before the stable release.