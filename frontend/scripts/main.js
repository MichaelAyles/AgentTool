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
        // Also populate the connection input with the same UUID
        this.uuidInput.value = this.setupUuid;
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
        
        // Connect to desktop connector WebSocket
        const wsUrl = 'ws://localhost:3002';
        
        try {
            this.wsConnection = new WebSocket(wsUrl);
            
            this.wsConnection.onopen = () => {
                console.log('WebSocket connected');
                // Send authentication message
                this.sendMessage({
                    type: 'auth',
                    uuid: uuid,
                    timestamp: Date.now()
                });
            };
            
            this.wsConnection.onmessage = (event) => {
                this.handleWebSocketMessage(event);
            };
            
            this.wsConnection.onclose = (event) => {
                console.log('WebSocket disconnected:', event.code, event.reason);
                this.handleConnectionError('Connection closed');
            };
            
            this.wsConnection.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.handleConnectionError('Unable to connect to desktop connector. Make sure it is running on localhost:3002');
            };
            
            // Set connection timeout
            setTimeout(() => {
                if (this.wsConnection.readyState === WebSocket.CONNECTING) {
                    this.wsConnection.close();
                    this.handleConnectionError('Connection timeout. Make sure desktop connector is running.');
                }
            }, 10000);
            
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.handleConnectionError('Failed to create connection');
        }
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
        
        // Update connection panel to show success
        this.connectionError.textContent = '';
        this.connectionError.style.color = 'var(--success-color, #00aa00)';
        this.connectionError.textContent = '✅ Connected successfully!';
        
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
        
        // Update connect button state based on connection status
        if (status === 'connected') {
            this.connectBtn.textContent = 'Connected';
            this.connectBtn.disabled = true;
            this.connectBtn.style.backgroundColor = 'var(--success-color, #00aa00)';
        } else if (status === 'connecting') {
            this.connectBtn.textContent = 'Connecting...';
            this.connectBtn.disabled = true;
        } else {
            this.connectBtn.textContent = 'Connect';
            this.connectBtn.disabled = false;
            this.connectBtn.style.backgroundColor = '';
        }
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
        // Create terminal display area
        this.terminalContainer.innerHTML = `
            <div id="terminal-output" style="
                color: #00ff00; 
                background: #000; 
                padding: 1rem; 
                font-family: 'Courier New', monospace; 
                font-size: 14px;
                height: 400px;
                overflow-y: auto;
                border: 1px solid #333;
                white-space: pre-wrap;
            "></div>
            <div id="terminal-input-area" style="
                display: flex;
                margin-top: 8px;
                align-items: center;
                background: #000;
                border: 1px solid #333;
                padding: 4px;
            ">
                <span style="color: #00ff00; font-family: monospace;">$</span>
                <input type="text" id="terminal-input" style="
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: #00ff00;
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                    padding: 4px 8px;
                    outline: none;
                " placeholder="Enter command...">
            </div>
            <style>
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
            </style>
        `;
        
        // Set up terminal input handling
        const terminalInput = document.getElementById('terminal-input');
        const terminalOutput = document.getElementById('terminal-output');
        
        terminalInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const command = terminalInput.value;
                terminalInput.value = '';
                
                // Display command in terminal
                this.appendToTerminal(`$ ${command}\n`);
                
                // Send command to desktop connector
                if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
                    this.sendMessage({
                        type: 'terminal_input',
                        data: command + '\r',
                        timestamp: Date.now()
                    });
                }
            }
        });
        
        // Focus terminal input
        terminalInput.focus();
        
        // Initial terminal message
        this.appendToTerminal(`Terminal connected to session ${this.sessionId}\n`);
        this.appendToTerminal(`Type commands and press Enter to execute\n\n`);
    }
    
    showError(message) {
        this.connectionError.textContent = message;
    }
    
    clearError() {
        this.connectionError.textContent = '';
    }
    
    sendMessage(message) {
        if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
            this.wsConnection.send(JSON.stringify(message));
        }
    }
    
    handleWebSocketMessage(event) {
        try {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'auth_success':
                    console.log('Authentication successful');
                    this.handleConnectionSuccess(message.data.uuid);
                    break;
                    
                case 'auth_error':
                    console.error('Authentication failed:', message.data);
                    this.handleConnectionError(`Authentication failed: ${message.data}`);
                    break;
                    
                case 'terminal_output':
                    this.appendToTerminal(message.data);
                    break;
                    
                case 'terminal_ready':
                    console.log('Terminal ready');
                    break;
                    
                case 'terminal_exit':
                    this.appendToTerminal(`\nProcess exited with code ${message.data.exitCode}\n`);
                    break;
                    
                case 'ping':
                    // Respond to ping with pong
                    this.sendMessage({
                        type: 'pong',
                        timestamp: Date.now()
                    });
                    break;
                    
                case 'pong':
                    // Handle pong response
                    break;
                    
                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }
    
    appendToTerminal(text) {
        const terminalOutput = document.getElementById('terminal-output');
        if (terminalOutput) {
            terminalOutput.textContent += text;
            // Auto-scroll to bottom
            terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
    }
    
    // Check for stored UUID on load and attempt auto-connection
    checkStoredConnection() {
        const storedUuid = localStorage.getItem('lastConnectedUUID');
        if (storedUuid) {
            this.uuidInput.value = storedUuid;
            // Attempt automatic connection after a short delay
            setTimeout(() => {
                this.connect(storedUuid);
            }, 1000);
        }
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new VibeApp();
    app.checkStoredConnection();
});