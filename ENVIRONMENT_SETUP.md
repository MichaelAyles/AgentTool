# Environment Setup Guide

This document outlines the environment variables and configuration needed for the **centralized streaming** Vibe Code architecture.

## Architecture Overview

Vibe Code now uses a **centralized streaming architecture** with:

- **Frontend**: Static React app deployed on Vercel that connects to vibe.theduck.chat
- **Desktop Connector**: Lightweight client that streams data to central service using session UUIDs
- **Central Service**: vibe.theduck.chat handles all session management and data routing

## Environment Variables

### Frontend (Vercel Deployment)

The frontend is deployed as a static site and connects to the centralized service.

```bash
# Build-time configuration (optional overrides)
VITE_CENTRAL_SERVICE_URL=https://vibe.theduck.chat  # Central service URL
VITE_DEFAULT_SESSION_TIMEOUT=300000                 # Session timeout (5 minutes)
VITE_WEBSOCKET_RECONNECT_ATTEMPTS=5                 # WebSocket reconnection attempts
```

### Desktop Connector

The desktop connector streams to the central service using session UUIDs.

```bash
# Required
VIBE_SESSION_ID=<uuid>                              # Session identifier (required)

# Optional - Service Configuration
VIBE_CENTRAL_URL=https://vibe.theduck.chat          # Central service URL (default)
VIBE_DATA_DIR=~/.vibe-code                          # Data directory (default: ~/.vibe-code)
VIBE_AUTO_RECONNECT=true                            # Auto-reconnect on disconnect (default: true)

# Optional - CLI Adapter Configuration
VIBE_CLAUDE_CODE_PATH=/usr/local/bin/claude-code    # Claude Code binary path
VIBE_GEMINI_CLI_PATH=/usr/local/bin/gemini-cli      # Gemini CLI binary path
VIBE_ADAPTER_TIMEOUT=300000                         # Adapter command timeout (5 minutes)

# Optional - Logging
VIBE_LOG_LEVEL=info                                 # Log level (default: info)
VIBE_LOG_FILE=~/.vibe-code/logs/connector.log       # Log file path
```

### Central Service (vibe.theduck.chat)

Configuration for the centralized service (managed by platform):

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/vibecode

# Redis (for session management and streaming)
REDIS_URL=redis://redis.theduck.chat:6379

# Security
JWT_SECRET=<platform-managed>
CORS_ORIGINS=https://vibe-code-frontend.vercel.app

# Service Configuration
PORT=443
NODE_ENV=production
SSL_CERT_PATH=/etc/ssl/certs/theduck.chat.pem
SSL_KEY_PATH=/etc/ssl/private/theduck.chat.key
```

## Configuration Files

### Frontend (.env.local - optional for development)

```bash
# Development overrides
VITE_CENTRAL_SERVICE_URL=http://localhost:8080      # For local development
VITE_DEBUG_MODE=true                                # Enable debug logging
```

### Desktop Connector (.vibe-code/config.json)

```json
{
  "version": "1.0.0",
  "centralServiceUrl": "https://vibe.theduck.chat",
  "dataDirectory": "~/.vibe-code",
  "autoReconnect": true,
  "reconnectionDelay": 1000,
  "reconnectionAttempts": 5,
  "adapters": {
    "claude-code": {
      "enabled": true,
      "path": "/usr/local/bin/claude-code",
      "timeout": 300000
    },
    "gemini-cli": {
      "enabled": false,
      "path": "/usr/local/bin/gemini-cli",
      "timeout": 300000
    }
  },
  "security": {
    "allowDangerousCommands": false,
    "restrictedPaths": ["/system", "/etc"],
    "maxProcessTime": 300000,
    "auditLogging": true
  }
}
```

## Development Setup

### Local Development

```bash
# Frontend development (connects to production central service)
cd packages/frontend
npm run dev
# Runs on http://localhost:5173
# Connects to https://vibe.theduck.chat

# Desktop connector development
cd packages/desktop-connector
npm run dev
# Streams to https://vibe.theduck.chat
```

### Production Setup

```bash
# Frontend (Vercel) - automatic deployment
git push origin main
# Deploys to https://vibe-code-frontend.vercel.app

# Desktop connector (local installation)
npm run build
npm run install:global
vibe-code-desktop start --session-id <uuid>
```

## Usage Examples

### Starting a New Session

```bash
# Generate a new session UUID and start streaming
vibe-code-desktop start --session-id $(uuidgen | tr '[:upper:]' '[:lower:]')

# Example with specific UUID
vibe-code-desktop start --session-id 123e4567-e89b-12d3-a456-426614174000
```

### Connecting Frontend to Session

1. Visit https://vibe-code-frontend.vercel.app
2. If no active session, the Session Manager will appear
3. Either:
   - Enter existing session UUID to connect
   - Generate new UUID and start desktop connector with that UUID

### Session Flow

```
1. Frontend generates UUID or user provides existing UUID
2. Frontend connects to wss://vibe.theduck.chat/ws/{uuid}
3. User runs: vibe-code-desktop start --session-id {uuid}
4. Desktop connector connects to wss://vibe.theduck.chat/desktop-connector
5. Central service routes data between frontend and desktop connector via UUID
```

## API Endpoints

### Central Service (vibe.theduck.chat)

```
GET  /api/v1/health                      # Service health check
GET  /api/v1/sessions/{uuid}/status      # Check if session exists
POST /api/v1/sessions                    # Create new session
WSS  /frontend                           # Frontend WebSocket connection
WSS  /desktop-connector                  # Desktop connector WebSocket connection
```

## Troubleshooting

### Frontend Issues

1. **Session Manager won't appear**: Check browser console for errors
2. **Can't connect to central service**: Verify vibe.theduck.chat is reachable
3. **WebSocket connection fails**: Check firewall/proxy settings
4. **Session UUID not working**: Ensure desktop connector is running with same UUID

### Desktop Connector Issues

1. **Connection refused**: Verify internet connection and vibe.theduck.chat accessibility
2. **Session ID required error**: Always provide --session-id parameter
3. **Authentication failed**: Check if central service is accepting connections
4. **Command execution fails**: Verify CLI tools (claude-code, etc.) are installed

### Network Issues

1. **WebSocket blocked**: Configure proxy/firewall to allow WSS connections
2. **SSL certificate errors**: Ensure system trusts vibe.theduck.chat certificate
3. **Timeout errors**: Check if central service is responding (may be scaling up)

## Architecture Benefits

### Centralized Streaming Architecture

✅ **Advantages:**

- No localhost dependencies - works from any network
- Automatic session sharing across devices
- Scalable central service handles routing
- Frontend can be fully static/CDN deployed
- No port forwarding or firewall configuration needed

🔄 **Trade-offs:**

- Requires internet connection for operation
- Dependent on central service availability
- Data flows through central service (privacy consideration)

## Security Considerations

- All connections use HTTPS/WSS encryption
- Session UUIDs act as authentication tokens
- Desktop connector runs with user permissions only
- Central service does not store command history (streams only)
- Use unique UUIDs to prevent session hijacking
- Consider running desktop connector in restricted mode for sensitive environments

## Support

For issues and questions:

- GitHub Issues: https://github.com/your-org/vibe-code/issues
- Central Service Status: https://status.theduck.chat
- Documentation: https://docs.vibe-code.com
