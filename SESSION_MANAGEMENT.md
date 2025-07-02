# Session Management System

## Overview

The Vibe Code frontend now includes a comprehensive session management system that handles the case when there's no active session with the desktop connector. This provides a seamless user experience for both new users and returning users.

## Features

### 🔄 **Automatic Session Detection**

- Detects if desktop connector is running locally
- Validates existing session IDs
- Auto-shows session manager when no active session found

### 📊 **Session Status Indicator**

- Real-time connection status in the header
- Visual indicators for connected/disconnected states
- Session ID display and management

### 🎯 **Session Manager Popover**

When no active session is detected, users see a comprehensive modal with:

#### **Option 1: Enter Existing Session**

- Input field for existing session UUID
- Validation and connection to existing sessions
- Useful for multi-tab or multi-device workflows

#### **Option 2: Start New Session**

- Auto-generated UUID for new sessions
- Copy session ID functionality
- Desktop connector startup instructions

### 🖥️ **Desktop Connector Integration**

- Enhanced CLI with `--session-id` parameter
- Session status endpoints for validation
- Session information in system info

## User Experience Flow

### 1. **First Time User**

```
1. User visits the app
2. No session detected → Session Manager opens automatically
3. User sees options to start new session or enter existing one
4. Gets command to run: `vibe-code-desktop start --session-id <uuid>`
5. After running command, session becomes active
```

### 2. **Returning User**

```
1. User visits the app
2. Previous session ID found in localStorage
3. System validates session with desktop connector
4. If valid → continues with existing session
5. If invalid → Session Manager opens with reconnection options
```

### 3. **Multi-Session User**

```
1. User has multiple terminals/tabs
2. Can enter specific session ID to connect to existing session
3. Or create new session for isolated work
```

## Technical Implementation

### **Frontend Components**

#### **SessionManager.tsx**

- Modal dialog for session management
- UUID generation and validation
- Clipboard integration for easy copying
- Real-time connector status checking

#### **SessionStatus.tsx**

- Header component showing connection status
- Click to open session manager
- Visual indicators and tooltips

#### **SessionInitializer.tsx**

- Auto-opens session manager when needed
- Handles app initialization flow
- Session validation on startup

#### **Session Store (Zustand)**

- Persistent session state management
- LocalStorage integration
- Global state for session information

### **Backend Integration**

#### **Desktop Connector CLI**

```bash
# Start with specific session
vibe-code-desktop start --session-id abc-123-def

# Session appears in logs and system info
Session ID: abc-123-def
```

#### **API Endpoints**

```
GET /api/v1/sessions/:sessionId/status
- Validates if session exists and is active

POST /api/v1/sessions
- Creates new session

GET /api/v1/system/info
- Includes current session ID in response
```

## Usage Examples

### **Starting New Session**

```bash
# 1. User gets UUID from frontend: 550e8400-e29b-41d4-a716-446655440000
# 2. Runs desktop connector with session:
vibe-code-desktop start --session-id 550e8400-e29b-41d4-a716-446655440000

# 3. Frontend automatically detects and connects
```

### **Connecting to Existing Session**

```bash
# 1. Desktop connector already running with session ID
# 2. User enters session ID in frontend: 550e8400-e29b-41d4-a716-446655440000
# 3. Frontend validates and connects
```

### **Multi-Tab Workflow**

```bash
# Tab 1: Primary work session
Session ID: primary-work-session

# Tab 2: Experimental session
Session ID: experiment-branch-test

# Tab 3: Code review session
Session ID: review-pr-1234
```

## Visual Design

### **Session Status Indicator**

```
┌─ Header ──────────────────────────────────────┐
│ Vibe Code    [🟢 Connected] [🔘 test-session] │
└──────────────────────────────────────────────┘
```

### **Session Manager Modal**

```
┌─ No Active Session ─────────────────────┐
│ ⚠️  No Active Session                   │
│ 🟢 Desktop connector running            │
│                                         │
│ Option 1: Enter Existing Session       │
│ ┌─────────────────────┐ [Connect]       │
│ │ session-uuid-here   │                │
│ └─────────────────────┘                │
│                                         │
│ Option 2: Start New Session            │
│ New session ID:                         │
│ ┌─────────────────────┐ [📋] [🔄]       │
│ │ abc-123-def-456...  │                │
│ └─────────────────────┘                │
│                                         │
│ Command:                                │
│ vibe-code-desktop start --session-id \ │
│   abc-123-def-456-789                   │
│                                         │
│ [Copy Command] [Use Session ID]         │
└─────────────────────────────────────────┘
```

## Benefits

### **For Users**

- ✅ Clear guidance when no session is active
- ✅ Easy session management and switching
- ✅ No more confusion about "why isn't it working"
- ✅ Copy-paste commands for quick setup

### **For Developers**

- ✅ Proper session isolation
- ✅ Multi-instance support
- ✅ Debugging and development workflows
- ✅ Clear session lifecycle management

### **For Teams**

- ✅ Shared session IDs for collaboration
- ✅ Consistent setup across team members
- ✅ Easy onboarding for new team members

## Configuration

### **Environment Variables**

```bash
# Default desktop connector URL
VITE_DESKTOP_CONNECTOR_URL=http://localhost:3000

# Session check interval (ms)
VITE_SESSION_CHECK_INTERVAL=30000
```

### **LocalStorage Keys**

```javascript
// Session persistence
'vibe-code-session' -> {
  sessionId: string,
  connectorUrl: string,
  lastConnectedAt: Date
}
```

## Future Enhancements

- 🔄 **Session Sharing**: QR codes for easy session sharing
- 📱 **Mobile Integration**: Session management on mobile devices
- 🔐 **Session Authentication**: Optional password protection for sessions
- 📊 **Session Analytics**: Usage tracking and session insights
- 🌐 **Cloud Sessions**: Session state sync across devices
- 🔔 **Session Notifications**: Alerts for session events

## Testing

### **Manual Testing**

1. Start frontend without desktop connector → Session manager appears
2. Start desktop connector with session ID → Status updates to connected
3. Enter different session ID → Validates correctly
4. Refresh page → Session persists
5. Stop desktop connector → Status updates to disconnected

### **Automated Testing**

- Session store state management
- API endpoint validation
- UI component behavior
- Error handling scenarios

This session management system provides a professional, user-friendly experience that eliminates confusion and provides clear guidance for users at every step of their Vibe Code journey.
