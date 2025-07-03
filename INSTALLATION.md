# Vibe Coding Terminal - Installation Guide

Welcome to Vibe Coding Terminal! This guide will help you set up the desktop connector to enable terminal access through your web browser.

## Quick Start

### 1. Visit the Web App
Open your browser and go to: [https://vibe.theduck.chat](https://vibe.theduck.chat)

### 2. Install the Desktop Connector

The easiest way to install is using the one-line install command shown on the website:

```bash
curl -fsSL https://raw.githubusercontent.com/MichaelAyles/AgentTool/main/install.sh | bash -s YOUR_UUID
```

**Note:** Replace `YOUR_UUID` with the UUID shown on the website.

## Manual Installation

If you prefer to install manually:

### Prerequisites
- Node.js 16 or higher
- npm or yarn
- Git

### Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/MichaelAyles/AgentTool.git
   cd AgentTool/connector
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the connector:**
   ```bash
   npm run build
   ```

4. **Start the connector:**
   ```bash
   npm start
   ```

5. **Copy the UUID from the console output and paste it into the web app**

## Platform-Specific Instructions

### macOS
- Terminal access works out of the box
- The connector will request permission to access Terminal on first run

### Linux
- Ensure you have Node.js installed: `sudo apt install nodejs npm` (Ubuntu/Debian)
- Or use your distribution's package manager

### Windows (WSL)
- Install WSL2 if not already installed
- Install Node.js inside WSL
- Run the connector from within WSL

## Troubleshooting

### "No Connection Found" error
1. Ensure the desktop connector is running
2. Check that ports 3001 and 3002 are not blocked by firewall
3. Try refreshing the web page

### Connection keeps dropping
1. Check your internet connection
2. Ensure the connector hasn't crashed (check terminal output)
3. Try restarting the connector

### Terminal not responding
1. Check if the connector has terminal permissions
2. Try restarting the connector
3. Check connector logs for errors

### Port already in use
If you see "EADDRINUSE" error:
1. Another instance might be running: `killall node`
2. Or change the port in the connector config

## Security Notes

- The connector only accepts connections from localhost and vibe.theduck.chat
- Each session requires a unique UUID for authentication
- Sessions expire after inactivity
- All connections use WebSocket for real-time communication

## Uninstalling

To remove the desktop connector:

1. Stop any running instances (Ctrl+C in terminal)
2. Remove the cloned directory:
   ```bash
   rm -rf AgentTool
   ```
3. Clear any saved sessions (optional):
   ```bash
   rm -rf ~/.vibe-coding
   ```

## Getting Help

- Report issues: [GitHub Issues](https://github.com/MichaelAyles/AgentTool/issues)
- Documentation: [GitHub Repository](https://github.com/MichaelAyles/AgentTool)

## Advanced Configuration

### Running on Different Ports
Edit `connector/src/index.ts` and change:
```typescript
const httpPort = 3001;  // Change HTTP port
const wsPort = 3002;    // Change WebSocket port
```

### Auto-start on Boot
Create a systemd service (Linux) or use Login Items (macOS) to start the connector automatically.

---

Happy coding with Vibe! 🚀