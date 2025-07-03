// Vibe Coding Frontend Application
class VibeApp {
    constructor() {
        this.wsConnection = null;
        this.sessionId = null;
        this.connectionStartTime = null;
        this.connectionTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.currentUuid = this.generateUUID();
        this.connectionStateDebounceTimer = null;
        this.lastConnectionState = null;
        this.wasManuallyDisconnected = false;
        this.hasEverConnected = false;
        
        this.initializeElements();
        this.attachEventListeners();
        this.updateUuidDisplay();
        this.initializeTheme();
        this.checkConnectorAvailability();
    }
    
    initializeElements() {
        // UUID elements
        this.uuidInput = document.getElementById('uuid-input');
        this.regenerateBtn = document.getElementById('regenerate-uuid');
        this.copyUuidBtn = document.getElementById('copy-uuid');
        this.commandUuidSpan = document.getElementById('command-uuid');
        this.uuidError = document.getElementById('uuid-error');
        
        // Connection elements
        this.connectBtn = document.getElementById('connect-btn');
        this.connectionError = document.getElementById('connection-error');
        this.copyInstallBtn = document.getElementById('copy-install');
        this.installCommand = document.getElementById('install-command');
        
        // Status elements (removed - using single button approach)
        this.sessionIdSpan = document.getElementById('session-id');
        this.connectionTimeSpan = document.getElementById('connection-time');
        this.disconnectBtn = document.getElementById('disconnect-btn');
        this.killConnectorBtn = document.getElementById('kill-connector-btn');
        
        // Terminal elements
        this.terminalSection = document.getElementById('terminal-section');
        this.terminalContainer = document.getElementById('terminal-container');
        
        // Theme toggle
        this.themeToggle = document.getElementById('theme-toggle');
    }
    
    attachEventListeners() {
        // UUID controls
        this.regenerateBtn.addEventListener('click', () => this.regenerateUuid());
        this.copyUuidBtn.addEventListener('click', () => this.copyUuid());
        this.uuidInput.addEventListener('input', (e) => this.handleUuidInput(e));
        this.uuidInput.addEventListener('blur', () => this.validateUuid());
        
        // Connection controls
        this.connectBtn.addEventListener('click', () => this.handleConnect());
        this.copyInstallBtn.addEventListener('click', () => this.copyInstallCommand());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.killConnectorBtn.addEventListener('click', () => this.killConnector());
        
        // Theme toggle
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleConnect();
                }
            }
        });
    }
    
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    regenerateUuid() {
        this.currentUuid = this.generateUUID();
        this.updateUuidDisplay();
        this.showSuccessMessage('New UUID generated!');
    }
    
    updateUuidDisplay() {
        this.uuidInput.value = this.currentUuid;
        this.commandUuidSpan.textContent = this.currentUuid;
    }
    
    handleUuidInput(e) {
        this.currentUuid = e.target.value;
        this.commandUuidSpan.textContent = this.currentUuid;
        this.clearError();
    }
    
    validateUuid() {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (this.currentUuid && !uuidRegex.test(this.currentUuid)) {
            this.showUuidError('Invalid UUID format');
            return false;
        }
        this.clearUuidError();
        return true;
    }
    
    async copyUuid() {
        try {
            await navigator.clipboard.writeText(this.currentUuid);
            this.showSuccessMessage('UUID copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy UUID:', err);
            this.showUuidError('Failed to copy UUID');
        }
    }
    
    async copyInstallCommand() {
        const command = this.installCommand.textContent;
        try {
            await navigator.clipboard.writeText(command);
            this.showSuccessMessage('Install command copied!');
        } catch (err) {
            console.error('Failed to copy command:', err);
            this.showError('Failed to copy install command');
        }
    }
    
    async checkConnectorAvailability() {
        try {
            const response = await fetch('http://localhost:3001/health', { 
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            if (response.ok) {
                // If connector found, always go to available (unless currently connected)
                if (this.lastConnectionState !== 'connected') {
                    if (this.wasManuallyDisconnected) {
                        this.wasManuallyDisconnected = false;
                    }
                    this.setConnectionState('available');
                }
            } else {
                // If no connector found
                if (this.hasEverConnected && !this.wasManuallyDisconnected) {
                    // If we've connected before but haven't manually disconnected, set to disconnected
                    this.setConnectionState('disconnected');
                    this.wasManuallyDisconnected = true;
                } else if (!this.hasEverConnected && this.lastConnectionState !== 'disconnected') {
                    // If never connected and not disconnected, stay on no-connection
                    this.setConnectionState('no-connection');
                }
            }
        } catch (error) {
            // Same logic for error case
            if (this.hasEverConnected && !this.wasManuallyDisconnected) {
                this.setConnectionState('disconnected');
                this.wasManuallyDisconnected = true;
            } else if (!this.hasEverConnected && this.lastConnectionState !== 'disconnected') {
                this.setConnectionState('no-connection');
            }
            // Retry check in 5 seconds
            setTimeout(() => this.checkConnectorAvailability(), 5000);
        }
    }

    handleConnect(showConnectingState = true) {
        if (!this.validateUuid()) return;
        
        this.clearError();
        
        // Only show connecting state if this is a user-initiated connection or we've connected before
        if (showConnectingState && (this.hasEverConnected || this.lastConnectionState === 'available')) {
            this.setConnectionState('connecting');
        }
        
        const wsUrl = 'ws://localhost:3002';
        
        try {
            this.wsConnection = new WebSocket(wsUrl);
            
            this.wsConnection.onopen = () => {
                console.log('WebSocket connected');
                this.sendMessage({
                    type: 'auth',
                    uuid: this.currentUuid,
                    timestamp: Date.now()
                });
            };
            
            this.wsConnection.onmessage = (event) => {
                this.handleWebSocketMessage(event);
            };
            
            this.wsConnection.onclose = (event) => {
                console.log('WebSocket disconnected:', event.code, event.reason);
                // If we've connected before, set to disconnected
                if (this.hasEverConnected && !this.wasManuallyDisconnected) {
                    this.setConnectionState('disconnected');
                    this.wasManuallyDisconnected = true; // Treat connection loss as disconnected state
                } else if (!this.hasEverConnected) {
                    // If never connected, check availability to determine proper state
                    setTimeout(() => this.checkConnectorAvailability(), 1000);
                    return; // Don't double-check
                }
                // Check availability after a delay
                setTimeout(() => this.checkConnectorAvailability(), 3000);
            };
            
            this.wsConnection.onerror = (error) => {
                console.error('WebSocket error:', error);
                // If we've connected before, set to disconnected
                if (this.hasEverConnected && !this.wasManuallyDisconnected) {
                    this.setConnectionState('disconnected');
                    this.wasManuallyDisconnected = true;
                } else if (!this.hasEverConnected) {
                    // If never connected, check availability to determine proper state
                    setTimeout(() => this.checkConnectorAvailability(), 1000);
                }
            };
            
            // Connection timeout - increased to reduce premature timeouts
            setTimeout(() => {
                if (this.wsConnection.readyState === WebSocket.CONNECTING) {
                    this.wsConnection.close();
                    // If we've connected before, set to disconnected
                    if (this.hasEverConnected && !this.wasManuallyDisconnected) {
                        this.setConnectionState('disconnected');
                        this.wasManuallyDisconnected = true;
                    } else if (!this.hasEverConnected) {
                        // If never connected, check availability to determine proper state
                        setTimeout(() => this.checkConnectorAvailability(), 1000);
                        return;
                    }
                    setTimeout(() => this.checkConnectorAvailability(), 2000);
                }
            }, 15000);
            
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            // If we've connected before, set to disconnected
            if (this.hasEverConnected && !this.wasManuallyDisconnected) {
                this.setConnectionState('disconnected');
                this.wasManuallyDisconnected = true;
            } else if (!this.hasEverConnected) {
                // If never connected, check availability to determine proper state
                setTimeout(() => this.checkConnectorAvailability(), 1000);
                return;
            }
            setTimeout(() => this.checkConnectorAvailability(), 2000);
        }
    }
    
    handleConnectionSuccess(uuid) {
        this.sessionId = uuid;
        this.connectionStartTime = Date.now();
        this.reconnectAttempts = 0;
        this.wasManuallyDisconnected = false; // Reset manual disconnect flag
        this.hasEverConnected = true; // Mark that we've successfully connected
        
        this.setConnectionState('connected');
        this.sessionIdSpan.textContent = uuid.substring(0, 8) + '...';
        this.terminalSection.classList.remove('hidden');
        
        this.showSuccessMessage('✅ Connected successfully!');
        this.startConnectionTimer();
        this.initializeTerminal();
        
        // Store UUID for reconnection
        localStorage.setItem('lastConnectedUUID', uuid);
    }
    
    handleConnectionError(message) {
        console.log('Connection error:', message); // Log for debugging but don't show to user
        
        if (this.hasEverConnected && !this.wasManuallyDisconnected) {
            this.setConnectionState('disconnected');
            this.wasManuallyDisconnected = true;
        } else if (!this.hasEverConnected) {
            // If never connected, check availability to determine proper state
            setTimeout(() => this.checkConnectorAvailability(), 1000);
            return; // Don't attempt reconnection if never connected
        }
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            // Exponential backoff with minimum 3 seconds to reduce flickering
            const delay = Math.max(3000, 2000 * this.reconnectAttempts);
            setTimeout(() => {
                console.log(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                this.handleConnect(false); // Don't show connecting state for automatic retries
            }, delay);
        } else {
            // After max reconnect attempts, go back to checking availability
            setTimeout(() => this.checkConnectorAvailability(), 10000);
        }
    }
    
    disconnect() {
        if (this.wsConnection) {
            this.wsConnection.close();
        }
        
        this.wasManuallyDisconnected = true;
        this.setConnectionState('disconnected');
        this.terminalSection.classList.add('hidden');
        
        if (this.connectionTimer) {
            clearInterval(this.connectionTimer);
            this.connectionTimer = null;
        }
        
        this.sessionId = null;
        this.connectionStartTime = null;
        this.reconnectAttempts = 0;
        
        // Continue checking for availability to allow reconnection
        setTimeout(() => this.checkConnectorAvailability(), 2000);
    }
    
    async killConnector() {
        if (!confirm('Are you sure you want to kill the desktop connector? This will terminate all sessions.')) {
            return;
        }
        
        try {
            const response = await fetch('http://localhost:3001/shutdown', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (response.ok) {
                this.showSuccessMessage('✅ Desktop connector terminated successfully');
                this.disconnect();
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to kill connector:', error);
            this.showError('Failed to terminate desktop connector. It may not be running.');
        }
    }
    
    setConnectionState(state) {
        // Clear any existing debounce timer
        if (this.connectionStateDebounceTimer) {
            clearTimeout(this.connectionStateDebounceTimer);
        }
        
        // Don't update if state hasn't changed
        if (this.lastConnectionState === state) {
            return;
        }
        
        // For immediate feedback on user actions, don't debounce connecting state
        if (state === 'connecting' && this.lastConnectionState === 'disconnected') {
            this.updateConnectionStateUI(state);
            this.lastConnectionState = state;
            return;
        }
        
        // Debounce other state changes to prevent flickering
        this.connectionStateDebounceTimer = setTimeout(() => {
            this.updateConnectionStateUI(state);
            this.lastConnectionState = state;
        }, 300);
    }
    
    updateConnectionStateUI(state) {
        const btn = this.connectBtn;
        const btnText = btn.querySelector('.btn-text');
        
        // Remove all state classes
        btn.classList.remove('no-connection', 'available', 'connected', 'disconnected');
        
        switch (state) {
            case 'no-connection':
                btn.classList.add('no-connection');
                btnText.textContent = 'No Connection Found';
                btn.disabled = true;
                break;
                
            case 'available':
                btn.classList.add('available');
                btnText.textContent = 'Connect to Terminal';
                btn.disabled = false;
                break;
                
            case 'connecting':
                btn.classList.add('available'); // Use blue color while connecting
                btnText.textContent = 'Connecting...';
                btn.disabled = true;
                break;
                
            case 'connected':
                btn.classList.add('connected');
                btnText.textContent = 'Connected';
                btn.disabled = true;
                break;
                
            case 'disconnected':
                btn.classList.add('disconnected');
                btnText.textContent = 'Disconnected';
                btn.disabled = true;
                break;
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
        this.terminalContainer.innerHTML = `
            <div id="terminal-output" style="
                color: #00ff00; 
                background: transparent; 
                padding: 0;
                font-family: var(--font-mono);
                font-size: 14px;
                height: 350px;
                overflow-y: auto;
                white-space: pre-wrap;
                margin-bottom: 1rem;
            "></div>
            <div id="terminal-input-area" style="
                display: flex;
                align-items: center;
                background: rgba(0, 255, 0, 0.1);
                border: 1px solid rgba(0, 255, 0, 0.3);
                border-radius: 0.5rem;
                padding: 0.5rem;
            ">
                <span style="color: #00ff00; font-family: var(--font-mono); margin-right: 0.5rem;">$</span>
                <input type="text" id="terminal-input" style="
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: #00ff00;
                    font-family: var(--font-mono);
                    font-size: 14px;
                    outline: none;
                " placeholder="Enter command...">
            </div>
        `;
        
        const terminalInput = document.getElementById('terminal-input');
        
        // Handle all keydown events for better terminal emulation
        terminalInput.addEventListener('keydown', (e) => {
            if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
                let keyData = '';
                
                // Handle special keys
                if (e.key === 'Enter') {
                    keyData = '\r';
                    terminalInput.value = '';
                } else if (e.key === 'Backspace') {
                    keyData = '\u007f';
                } else if (e.key === 'Tab') {
                    e.preventDefault();
                    keyData = '\t';
                } else if (e.ctrlKey && e.key === 'c') {
                    e.preventDefault();
                    keyData = '\u0003';
                } else if (e.ctrlKey && e.key === 'd') {
                    e.preventDefault();
                    keyData = '\u0004';
                } else if (e.key.length === 1) {
                    // Regular printable characters
                    keyData = e.key;
                }
                
                // Send key data to terminal
                if (keyData) {
                    this.sendMessage({
                        type: 'terminal_input',
                        data: keyData,
                        timestamp: Date.now()
                    });
                }
                
                // For regular characters, let the input field handle them
                if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    // Don't prevent default for regular typing
                } else if (e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Tab') {
                    // Prevent default for special keys we handle
                    e.preventDefault();
                }
            }
        });
        
        // Focus terminal input
        terminalInput.focus();
        
        // Initial terminal message
        this.appendToTerminal(`🚀 Vibe Coding Terminal Connected\n`);
        this.appendToTerminal(`Session: ${this.sessionId}\n`);
        this.appendToTerminal(`Platform: ${navigator.platform}\n`);
        this.appendToTerminal(`Waiting for shell to initialize...\n\n`);
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
                    // If we've connected before, set to disconnected
                    if (this.hasEverConnected && !this.wasManuallyDisconnected) {
                        this.setConnectionState('disconnected');
                        this.wasManuallyDisconnected = true;
                    } else if (!this.hasEverConnected) {
                        // If never connected, check availability to determine proper state
                        setTimeout(() => this.checkConnectorAvailability(), 1000);
                        return;
                    }
                    setTimeout(() => this.checkConnectorAvailability(), 2000);
                    break;
                    
                case 'terminal_output':
                    this.appendToTerminal(message.data);
                    // Clear the input field if we receive output (shell is echoing)
                    const terminalInput = document.getElementById('terminal-input');
                    if (terminalInput && message.data.includes('\n')) {
                        terminalInput.value = '';
                    }
                    break;
                    
                case 'terminal_ready':
                    console.log('Terminal ready');
                    break;
                    
                case 'terminal_exit':
                    this.appendToTerminal(`\nProcess exited with code ${message.data.exitCode}\n`);
                    break;
                    
                case 'ping':
                    this.sendMessage({
                        type: 'pong',
                        timestamp: Date.now()
                    });
                    break;
                    
                case 'pong':
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
            terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
    }
    
    sendMessage(message) {
        if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
            this.wsConnection.send(JSON.stringify(message));
        }
    }
    
    // Theme management
    initializeTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        this.setTheme(savedTheme);
    }
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }
    
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }
    
    // Message helpers
    showError(message) {
        this.connectionError.textContent = message;
        this.connectionError.style.color = 'var(--error-color)';
        setTimeout(() => this.clearError(), 5000);
    }
    
    showUuidError(message) {
        this.uuidError.textContent = message;
        setTimeout(() => this.clearUuidError(), 5000);
    }
    
    showSuccessMessage(message) {
        this.connectionError.textContent = message;
        this.connectionError.style.color = 'var(--success-color)';
        setTimeout(() => this.clearError(), 3000);
    }
    
    clearError() {
        this.connectionError.textContent = '';
    }
    
    clearUuidError() {
        this.uuidError.textContent = '';
    }
    
    // Auto-connection for returning users
    checkStoredConnection() {
        const storedUuid = localStorage.getItem('lastConnectedUUID');
        if (storedUuid) {
            this.currentUuid = storedUuid;
            this.updateUuidDisplay();
            // Attempt automatic connection after a delay
            setTimeout(() => {
                this.handleConnect();
            }, 1000);
        }
    }
}

// Global functions
function showAbout() {
    alert('Vibe Coding - Remote Terminal Access\\n\\nBuilt with ❤️ for developers\\n\\nConnect to your local terminal from anywhere with secure WebSocket connections.');
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new VibeApp();
    app.checkStoredConnection();
});