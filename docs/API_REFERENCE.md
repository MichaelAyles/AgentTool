# Vibe Code API Reference

This document provides comprehensive documentation for the Vibe Code REST API and WebSocket interfaces.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [REST API](#rest-api)
4. [WebSocket API](#websocket-api)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [SDK and Client Libraries](#sdk-and-client-libraries)
8. [Examples](#examples)

## 🔍 Overview

The Vibe Code API provides programmatic access to all platform features:

- **REST API**: HTTP endpoints for CRUD operations
- **WebSocket API**: Real-time communication for terminal and events
- **Authentication**: JWT-based authentication with refresh tokens
- **Rate Limiting**: Configurable limits to prevent abuse

### Base URLs

```
Development: http://localhost:3000/api/v1
Production:  https://api.vibecode.com/v1
WebSocket:   ws://localhost:3000 (dev) or wss://api.vibecode.com (prod)
```

### Content Types

- **Request**: `application/json`
- **Response**: `application/json`
- **WebSocket**: JSON messages

## 🔐 Authentication

### JWT Token Authentication

All API requests require authentication via JWT tokens in the `Authorization` header:

```http
Authorization: Bearer <jwt_token>
```

### Obtaining Tokens

#### Login Endpoint

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response:**

```json
{
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  },
  "tokens": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 3600
  }
}
```

#### Refresh Token Endpoint

```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 3600
}
```

## 🔗 REST API

### Projects

#### List Projects

```http
GET /projects
```

**Query Parameters:**

- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page (default: 20, max: 100)
- `search` (string): Search term for project names
- `sort` (string): Sort field (name, created_at, updated_at)
- `order` (string): Sort order (asc, desc)

**Response:**

```json
{
  "projects": [
    {
      "id": "proj-123",
      "name": "My Project",
      "description": "A sample project",
      "path": "/path/to/project",
      "adapter": "claude-code",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T12:00:00Z",
      "git": {
        "initialized": true,
        "branch": "main",
        "remote": "origin"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

#### Create Project

```http
POST /projects
Content-Type: application/json

{
  "name": "New Project",
  "description": "Project description",
  "path": "/path/to/project",
  "adapter": "claude-code",
  "template": "empty",
  "git": {
    "initialize": true,
    "remote_url": "https://github.com/user/repo.git"
  },
  "settings": {
    "security_mode": "safe",
    "allowed_commands": ["npm", "git", "python"]
  }
}
```

**Response:**

```json
{
  "project": {
    "id": "proj-124",
    "name": "New Project",
    "description": "Project description",
    "path": "/path/to/project",
    "adapter": "claude-code",
    "created_at": "2024-01-01T12:00:00Z",
    "updated_at": "2024-01-01T12:00:00Z"
  }
}
```

#### Get Project

```http
GET /projects/{id}
```

**Response:**

```json
{
  "project": {
    "id": "proj-123",
    "name": "My Project",
    "description": "A sample project",
    "path": "/path/to/project",
    "adapter": "claude-code",
    "settings": {
      "security_mode": "safe",
      "allowed_commands": ["npm", "git", "python"],
      "working_directory": "/path/to/project"
    },
    "git": {
      "initialized": true,
      "branch": "main",
      "remote": "origin",
      "status": {
        "staged": 2,
        "unstaged": 1,
        "untracked": 0
      }
    },
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T12:00:00Z"
  }
}
```

#### Update Project

```http
PUT /projects/{id}
Content-Type: application/json

{
  "name": "Updated Project Name",
  "description": "Updated description",
  "adapter": "gemini-cli",
  "settings": {
    "security_mode": "dangerous"
  }
}
```

#### Delete Project

```http
DELETE /projects/{id}
```

**Response:**

```json
{
  "message": "Project deleted successfully"
}
```

### Adapters

#### List Available Adapters

```http
GET /adapters
```

**Response:**

```json
{
  "adapters": [
    {
      "id": "claude-code",
      "name": "Claude Code",
      "description": "Anthropic's Claude coding assistant",
      "version": "1.2.0",
      "status": "installed",
      "config_schema": {
        "type": "object",
        "properties": {
          "api_key": {
            "type": "string",
            "description": "Anthropic API key"
          },
          "model": {
            "type": "string",
            "enum": ["claude-3", "claude-instant"],
            "default": "claude-3"
          }
        }
      }
    }
  ]
}
```

#### Get Adapter Configuration

```http
GET /adapters/{id}/config
```

**Response:**

```json
{
  "config": {
    "api_key": "sk-ant-***",
    "model": "claude-3",
    "max_tokens": 4000,
    "temperature": 0.7
  }
}
```

#### Update Adapter Configuration

```http
PUT /adapters/{id}/config
Content-Type: application/json

{
  "model": "claude-instant",
  "max_tokens": 2000,
  "temperature": 0.5
}
```

#### Install Adapter

```http
POST /adapters/{id}/install
```

**Response:**

```json
{
  "status": "installing",
  "message": "Adapter installation started"
}
```

### Execution

#### Execute Command

```http
POST /execute
Content-Type: application/json

{
  "project_id": "proj-123",
  "adapter": "claude-code",
  "command": "help",
  "options": {
    "working_directory": "/path/to/project",
    "timeout": 30000,
    "env": {
      "NODE_ENV": "development"
    }
  }
}
```

**Response:**

```json
{
  "execution": {
    "id": "exec-456",
    "project_id": "proj-123",
    "adapter": "claude-code",
    "command": "help",
    "status": "running",
    "created_at": "2024-01-01T12:00:00Z"
  }
}
```

#### Get Execution Status

```http
GET /execute/{id}/status
```

**Response:**

```json
{
  "execution": {
    "id": "exec-456",
    "project_id": "proj-123",
    "adapter": "claude-code",
    "command": "help",
    "status": "completed",
    "exit_code": 0,
    "output": "Available commands:\n- help: Show this help\n- version: Show version",
    "error": null,
    "created_at": "2024-01-01T12:00:00Z",
    "completed_at": "2024-01-01T12:00:05Z"
  }
}
```

#### Cancel Execution

```http
DELETE /execute/{id}
```

**Response:**

```json
{
  "message": "Execution cancelled successfully"
}
```

### Git Operations

#### Get Git Status

```http
GET /projects/{id}/git/status
```

**Response:**

```json
{
  "status": {
    "branch": "main",
    "ahead": 2,
    "behind": 0,
    "staged": [
      {
        "file": "src/index.js",
        "status": "modified"
      }
    ],
    "unstaged": [
      {
        "file": "README.md",
        "status": "modified"
      }
    ],
    "untracked": [
      {
        "file": "new-file.js",
        "status": "untracked"
      }
    ]
  }
}
```

#### Stage Files

```http
POST /projects/{id}/git/stage
Content-Type: application/json

{
  "files": ["src/index.js", "README.md"]
}
```

#### Create Commit

```http
POST /projects/{id}/git/commit
Content-Type: application/json

{
  "message": "Add new feature",
  "author": {
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Response:**

```json
{
  "commit": {
    "hash": "abc123def456",
    "message": "Add new feature",
    "author": "John Doe <john@example.com>",
    "date": "2024-01-01T12:00:00Z"
  }
}
```

#### List Branches

```http
GET /projects/{id}/git/branches
```

**Response:**

```json
{
  "branches": [
    {
      "name": "main",
      "current": true,
      "upstream": "origin/main"
    },
    {
      "name": "feature/new-ui",
      "current": false,
      "upstream": null
    }
  ]
}
```

#### Create Branch

```http
POST /projects/{id}/git/branches
Content-Type: application/json

{
  "name": "feature/api-improvements",
  "source": "main",
  "checkout": true
}
```

### Security

#### Get Security Status

```http
GET /security/status
```

**Response:**

```json
{
  "current_mode": "safe",
  "dangerous_mode_expires": null,
  "active_sessions": 1,
  "recent_alerts": [],
  "audit_summary": {
    "commands_executed": 45,
    "files_accessed": 12,
    "dangerous_mode_activations": 0
  }
}
```

#### Request Dangerous Mode

```http
POST /security/dangerous-mode
Content-Type: application/json

{
  "duration": 3600,
  "reason": "Need to access system files for debugging"
}
```

**Response:**

```json
{
  "status": "approved",
  "expires_at": "2024-01-01T13:00:00Z",
  "session_id": "danger-session-789"
}
```

#### Get Audit Logs

```http
GET /security/audit
```

**Query Parameters:**

- `start_date` (ISO date): Start date for logs
- `end_date` (ISO date): End date for logs
- `severity` (string): Filter by severity (low, medium, high, critical)
- `user_id` (string): Filter by user
- `action` (string): Filter by action type

**Response:**

```json
{
  "logs": [
    {
      "id": "audit-123",
      "timestamp": "2024-01-01T12:00:00Z",
      "user_id": "user-123",
      "action": "execute_command",
      "severity": "medium",
      "details": {
        "command": "rm -rf temp/",
        "project_id": "proj-123",
        "mode": "dangerous"
      }
    }
  ]
}
```

## 🔌 WebSocket API

### Connection

Connect to the WebSocket endpoint:

```javascript
const ws = new WebSocket('ws://localhost:3000');

// Authentication after connection
ws.send(
  JSON.stringify({
    type: 'auth',
    token: 'your_jwt_token',
  })
);
```

### Message Format

All WebSocket messages follow this format:

```json
{
  "type": "message_type",
  "id": "unique_message_id",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    // Message-specific data
  }
}
```

### Client → Server Messages

#### Execute Command

```json
{
  "type": "execute",
  "id": "msg-123",
  "data": {
    "project_id": "proj-123",
    "adapter": "claude-code",
    "command": "help me debug this code",
    "options": {
      "working_directory": "/path/to/project"
    }
  }
}
```

#### Send Input

```json
{
  "type": "input",
  "id": "msg-124",
  "data": {
    "session_id": "session-456",
    "input": "yes, proceed with the fix"
  }
}
```

#### Cancel Execution

```json
{
  "type": "cancel",
  "id": "msg-125",
  "data": {
    "session_id": "session-456"
  }
}
```

#### Subscribe to Events

```json
{
  "type": "subscribe",
  "id": "msg-126",
  "data": {
    "events": ["output", "status", "error"],
    "project_id": "proj-123"
  }
}
```

### Server → Client Messages

#### Output Stream

````json
{
  "type": "output",
  "id": "msg-127",
  "timestamp": "2024-01-01T12:00:01Z",
  "data": {
    "session_id": "session-456",
    "stream": "stdout",
    "content": "Here's a solution to your problem:\n\n```python\ndef fix_bug():\n    return 'fixed'\n```",
    "metadata": {
      "adapter": "claude-code",
      "tokens_used": 150
    }
  }
}
````

#### Status Updates

```json
{
  "type": "status",
  "id": "msg-128",
  "timestamp": "2024-01-01T12:00:02Z",
  "data": {
    "session_id": "session-456",
    "status": "running",
    "progress": 0.5,
    "message": "Analyzing code..."
  }
}
```

#### Error Messages

```json
{
  "type": "error",
  "id": "msg-129",
  "timestamp": "2024-01-01T12:00:03Z",
  "data": {
    "session_id": "session-456",
    "error": {
      "code": "ADAPTER_ERROR",
      "message": "API rate limit exceeded",
      "details": {
        "retry_after": 60
      }
    }
  }
}
```

#### Process Complete

```json
{
  "type": "complete",
  "id": "msg-130",
  "timestamp": "2024-01-01T12:00:10Z",
  "data": {
    "session_id": "session-456",
    "exit_code": 0,
    "duration": 8500,
    "summary": {
      "tokens_used": 450,
      "files_modified": 2
    }
  }
}
```

## ⚠️ Error Handling

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `429` - Rate Limited
- `500` - Internal Server Error
- `503` - Service Unavailable

### Error Response Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "validation error details"
    },
    "request_id": "req-123",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

### Common Error Codes

| Code                    | Description                       |
| ----------------------- | --------------------------------- |
| `INVALID_TOKEN`         | JWT token is invalid or expired   |
| `PROJECT_NOT_FOUND`     | Requested project doesn't exist   |
| `ADAPTER_NOT_INSTALLED` | Required adapter is not installed |
| `PERMISSION_DENIED`     | Insufficient permissions          |
| `RATE_LIMIT_EXCEEDED`   | API rate limit exceeded           |
| `VALIDATION_ERROR`      | Request validation failed         |
| `ADAPTER_ERROR`         | Error from the AI adapter         |
| `EXECUTION_TIMEOUT`     | Command execution timed out       |

### WebSocket Error Format

```json
{
  "type": "error",
  "id": "msg-id",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "error": {
      "code": "CONNECTION_ERROR",
      "message": "WebSocket connection failed",
      "recoverable": true
    }
  }
}
```

## 🔄 Rate Limiting

### Limits

| Endpoint Category  | Limit        | Window   |
| ------------------ | ------------ | -------- |
| Authentication     | 10 requests  | 1 minute |
| Projects           | 100 requests | 1 hour   |
| Execution          | 50 requests  | 1 minute |
| WebSocket Messages | 200 messages | 1 minute |

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1609459200
X-RateLimit-Window: 3600
```

### Rate Limit Response

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 60 seconds.",
    "details": {
      "limit": 100,
      "window": 3600,
      "reset_at": "2024-01-01T13:00:00Z"
    }
  }
}
```

## 📚 SDK and Client Libraries

### Official SDKs

#### JavaScript/TypeScript SDK

```bash
npm install @vibecode/sdk
```

```javascript
import { VibeCodeClient } from '@vibecode/sdk';

const client = new VibeCodeClient({
  baseURL: 'https://api.vibecode.com/v1',
  token: 'your_jwt_token',
});

// List projects
const projects = await client.projects.list();

// Execute command
const execution = await client.execute({
  projectId: 'proj-123',
  adapter: 'claude-code',
  command: 'help me write a function',
});
```

#### Python SDK

```bash
pip install vibecode-sdk
```

```python
from vibecode import VibeCodeClient

client = VibeCodeClient(
    base_url='https://api.vibecode.com/v1',
    token='your_jwt_token'
)

# List projects
projects = client.projects.list()

# Execute command
execution = client.execute(
    project_id='proj-123',
    adapter='claude-code',
    command='help me write a function'
)
```

### Community SDKs

- **Go**: `github.com/community/vibecode-go`
- **Rust**: `vibecode-rs` crate
- **Java**: `com.vibecode:vibecode-java`

## 💡 Examples

### Complete Project Workflow

```javascript
// 1. Create a new project
const project = await client.projects.create({
  name: 'My Web App',
  description: 'A new web application',
  adapter: 'claude-code',
  template: 'react',
});

// 2. Execute initial command
const execution = await client.execute({
  projectId: project.id,
  adapter: 'claude-code',
  command: 'Create a basic React component for a todo list',
});

// 3. Monitor execution via WebSocket
const ws = client.createWebSocket();
ws.subscribe(['output', 'status'], project.id);

ws.on('output', data => {
  console.log('AI Response:', data.content);
});

ws.on('complete', async data => {
  // 4. Commit changes
  await client.git.stage(project.id, ['src/TodoList.jsx']);
  await client.git.commit(project.id, {
    message: 'Add TodoList component',
  });
});
```

### Real-time Terminal Implementation

```javascript
class VibeCodeTerminal {
  constructor(projectId, adapter) {
    this.projectId = projectId;
    this.adapter = adapter;
    this.ws = new VibeCodeWebSocket();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.ws.on('output', data => {
      this.displayOutput(data.content, data.stream);
    });

    this.ws.on('status', data => {
      this.updateStatus(data.status, data.message);
    });

    this.ws.on('error', data => {
      this.displayError(data.error.message);
    });
  }

  async executeCommand(command) {
    const execution = await this.ws.send({
      type: 'execute',
      data: {
        project_id: this.projectId,
        adapter: this.adapter,
        command: command,
      },
    });

    return execution.session_id;
  }

  async sendInput(sessionId, input) {
    await this.ws.send({
      type: 'input',
      data: {
        session_id: sessionId,
        input: input,
      },
    });
  }

  displayOutput(content, stream) {
    const element = document.createElement('div');
    element.className = `output-${stream}`;
    element.textContent = content;
    this.terminalElement.appendChild(element);
  }
}
```

### Batch Operations

```javascript
// Process multiple projects
const projects = await client.projects.list();

const results = await Promise.allSettled(
  projects.data.map(async project => {
    // Update each project's dependencies
    return client.execute({
      projectId: project.id,
      adapter: 'claude-code',
      command: 'Update all npm dependencies to latest versions',
    });
  })
);

// Handle results
results.forEach((result, index) => {
  if (result.status === 'fulfilled') {
    console.log(`Project ${projects.data[index].name} updated successfully`);
  } else {
    console.error(
      `Failed to update ${projects.data[index].name}:`,
      result.reason
    );
  }
});
```

---

This API reference provides comprehensive documentation for integrating with the Vibe Code platform. For additional examples and advanced usage patterns, see the [SDK documentation](https://sdk.vibecode.dev) and [example repository](https://github.com/vibecode/examples).
