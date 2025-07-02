// Vibe Coding Frontend Application
class VibeApp {
    constructor() {
        this.wsConnection = null;
        this.sessionId = null;
        this.connectionStartTime = null;
        this.connectionTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // Generate a UUID for new installations
        this.setupUuid = this.generateUUID();
        
        this.initializeElements();
        this.attachEventListeners();
        this.updateSetupCommand();
    }
    
    initializeElements() {
        // Connection panel elements
        this.uuidInput = document.getElementById('uuid-input');
        this.connectBtn = document.getElementById('connect-btn');
        this.connectionError = document.getElementById('connection-error');
        this.setupUuidSpan = document.getElementById('setup-uuid');
        this.copySetupBtn = document.getElementById('copy-setup');
        
        // Status panel elements
        this.statusPanel = document.getElementById('status-panel');
        this.statusIcon = document.getElementById('status-icon');
        this.statusText = document.getElementById('status-text');
        this.connectionDetails = document.getElementById('connection-details');
        this.sessionIdSpan = document.getElementById('session-id');
        this.connectionTimeSpan = document.getElementById('connection-time');
        this.disconnectBtn = document.getElementById('disconnect-btn');
        
        // Terminal panel
        this.terminalPanel = document.getElementById('terminal-panel');
        this.terminalContainer = document.getElementById('terminal-container');
    }
    
    attachEventListeners() {
        this.connectBtn.addEventListener('click', () => this.handleConnect());
        this.uuidInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleConnect();
        });
        this.uuidInput.addEventListener('input', () => this.clearError());
        this.copySetupBtn.addEventListener('click', () => this.copySetupCommand());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
    }
    
    generateUUID() {
        // Generate a v4 UUID
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    updateSetupCommand() {
        this.setupUuidSpan.textContent = this.setupUuid;
    }
    
    async copySetupCommand() {
        const command = document.getElementById('setup-command').textContent;
        try {
            await navigator.clipboard.writeText(command);
            
            // Visual feedback
            const originalContent = this.copySetupBtn.innerHTML;
            this.copySetupBtn.innerHTML = '✓ Copied!';
            this.copySetupBtn.style.color = 'var(--success-color)';
            
            setTimeout(() => {
                this.copySetupBtn.innerHTML = originalContent;
                this.copySetupBtn.style.color = '';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            this.showError('Failed to copy to clipboard');
        }
    }
    
    handleConnect() {
        const uuid = this.uuidInput.value.trim();
        
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(uuid)) {
            this.showError('Please enter a valid UUID');
            return;
        }
        
        this.connect(uuid);
    }
    
    connect(uuid) {
        this.clearError();
        this.updateStatus('connecting', 'Connecting...');
        this.connectBtn.disabled = true;
        
        // For now, simulate a connection since we don't have the backend yet
        // In production, this would connect to the WebSocket server
        setTimeout(() => {
            if (Math.random() > 0.8) {
                // Simulate connection failure
                this.handleConnectionError('Unable to connect to desktop connector');
            } else {
                // Simulate successful connection
                this.handleConnectionSuccess(uuid);
            }
        }, 1500);
    }
    
    handleConnectionSuccess(uuid) {
        this.sessionId = uuid;
        this.connectionStartTime = Date.now();
        this.reconnectAttempts = 0;
        
        this.updateStatus('connected', 'Connected');
        this.sessionIdSpan.textContent = uuid.substring(0, 8) + '...';
        this.connectionDetails.classList.remove('hidden');
        this.statusPanel.classList.remove('hidden');
        this.terminalPanel.classList.remove('hidden');
        
        // Start connection timer
        this.startConnectionTimer();
        
        // Initialize terminal (placeholder for now)
        this.initializeTerminal();
        
        // Store UUID for reconnection
        localStorage.setItem('lastConnectedUUID', uuid);
    }
    
    handleConnectionError(message) {
        this.updateStatus('disconnected', 'Disconnected');
        this.showError(message);
        this.connectBtn.disabled = false;
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                this.showError(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                this.connect(this.sessionId);
            }, 2000 * this.reconnectAttempts);
        }
    }
    
    disconnect() {
        if (this.wsConnection) {
            this.wsConnection.close();
        }
        
        this.updateStatus('disconnected', 'Disconnected');
        this.connectionDetails.classList.add('hidden');
        this.terminalPanel.classList.add('hidden');
        this.connectBtn.disabled = false;
        
        if (this.connectionTimer) {
            clearInterval(this.connectionTimer);
            this.connectionTimer = null;
        }
        
        this.sessionId = null;
        this.connectionStartTime = null;
        this.reconnectAttempts = 0;
    }
    
    updateStatus(status, text) {
        this.statusIcon.className = `status-icon ${status}`;
        this.statusText.textContent = text;
    }
    
    startConnectionTimer() {
        this.connectionTimer = setInterval(() => {
            const elapsed = Date.now() - this.connectionStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            this.connectionTimeSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
    
    initializeTerminal() {
        // Placeholder for terminal initialization
        // In production, this would integrate with a terminal library like xterm.js
        this.terminalContainer.innerHTML = `
            <div style="color: #00ff00; padding: 1rem; font-family: monospace;">
                <p>Terminal connected to session ${this.sessionId}</p>
                <p>Waiting for desktop connector implementation...</p>
                <p style="margin-top: 1rem;">$ <span style="animation: blink 1s infinite;">_</span></p>
            </div>
            <style>
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
            </style>
        `;
    }
    
    showError(message) {
        this.connectionError.textContent = message;
    }
    
    clearError() {
        this.connectionError.textContent = '';
    }
    
    // Check for stored UUID on load
    checkStoredConnection() {
        const storedUuid = localStorage.getItem('lastConnectedUUID');
        if (storedUuid) {
            this.uuidInput.value = storedUuid;
        }
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new VibeApp();
    app.checkStoredConnection();
});