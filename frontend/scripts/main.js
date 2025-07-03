// DuckBridge Frontend Application
class DuckBridgeApp {
    constructor() {
        this.wsConnection = null;
        this.sessionId = null;
        this.connectionStartTime = null;
        this.connectionTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.currentUuid = this.generateUUID();
        
        this.initializeElements();
        this.attachEventListeners();
        this.updateUuidDisplay();
        this.initializeTheme();
        this.initializeTagline();
        this.checkUrlParams();
        this.initializeUI();
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
        
        // Status elements
        this.statusIcon = document.getElementById('status-icon');
        this.statusText = document.getElementById('status-text');
        this.sessionIdSpan = document.getElementById('session-id');
        this.connectionTimeSpan = document.getElementById('connection-time');
        this.disconnectBtn = document.getElementById('disconnect-btn');
        
        // Legacy elements (kept for compatibility)
        this.terminalContainer = document.getElementById('terminal-container');
        
        // Theme toggle
        this.themeToggle = document.getElementById('theme-toggle');
        
        // QR Code elements
        this.qrCodeBtn = document.getElementById('qr-code-btn');
        this.qrModal = document.getElementById('qr-modal');
        this.qrClose = document.getElementById('qr-close');
        this.qrCanvas = document.getElementById('qr-canvas');
        this.qrUrl = document.getElementById('qr-url');
        
        // UI Screen elements
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.mainInterface = document.getElementById('main-interface');
        this.showLoginBtn = document.getElementById('show-login-btn');
        this.loginModal = document.getElementById('login-modal');
        this.loginClose = document.getElementById('login-close');
        this.logoutBtn = document.getElementById('logout-btn');
        
        // Project elements
        this.newProjectBtn = document.getElementById('new-project-btn');
        this.openProjectBtn = document.getElementById('open-project-btn');
        this.projectsGrid = document.getElementById('projects-grid');
        this.createFirstProjectBtn = document.querySelector('.create-first-project-btn');
        
        // Terminal workspace elements
        this.terminalTabs = document.getElementById('terminal-tabs');
        this.terminalPanels = document.getElementById('terminal-panels');
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
        
        // Theme toggle
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        
        // QR Code controls
        this.qrCodeBtn.addEventListener('click', () => this.showQrCode());
        this.qrClose.addEventListener('click', () => this.hideQrCode());
        this.qrModal.addEventListener('click', (e) => {
            if (e.target === this.qrModal) this.hideQrCode();
        });
        
        // UI Navigation controls
        this.showLoginBtn.addEventListener('click', () => this.showLoginModal());
        this.loginClose.addEventListener('click', () => this.hideLoginModal());
        this.loginModal.addEventListener('click', (e) => {
            if (e.target === this.loginModal) this.hideLoginModal();
        });
        this.logoutBtn.addEventListener('click', () => this.logout());
        
        // Project controls
        this.newProjectBtn.addEventListener('click', () => this.createNewProject());
        this.openProjectBtn.addEventListener('click', () => this.openExistingProject());
        if (this.createFirstProjectBtn) {
            this.createFirstProjectBtn.addEventListener('click', () => this.createNewProject());
        }
        
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
    
    handleConnect() {
        if (!this.validateUuid()) return;
        
        this.clearError();
        this.setConnectionState('connecting');
        
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
                this.setConnectionState('disconnected');
                setTimeout(() => this.checkConnectorAvailability(), 3000);
            };
            
            this.wsConnection.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.setConnectionState('disconnected');
            };
            
            // Connection timeout
            setTimeout(() => {
                if (this.wsConnection.readyState === WebSocket.CONNECTING) {
                    this.wsConnection.close();
                    this.setConnectionState('disconnected');
                }
            }, 10000);
            
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.setConnectionState('disconnected');
        }
    }
    
    handleConnectionSuccess(uuid) {
        this.sessionId = uuid;
        this.connectionStartTime = Date.now();
        this.reconnectAttempts = 0;
        
        // Show main interface
        this.showMainInterface();
        
        // Create first terminal tab if none exist
        if (this.terminalTabs.children.length === 0) {
            this.createNewTerminalTab('Main Terminal');
        }
        
        this.showSuccessMessage('✅ Connected successfully!');
        
        // Store UUID for reconnection
        localStorage.setItem('lastConnectedUUID', uuid);
    }
    
    handleConnectionError(message) {
        this.setConnectionState('disconnected');
        this.showError(message);
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                this.showError(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                this.handleConnect();
            }, 2000 * this.reconnectAttempts);
        }
    }
    
    checkConnectorAvailability() {
        // Simple check to see if connector is available again
        // This is a placeholder - could be enhanced with actual health check
        console.log('Checking connector availability...');
    }
    
    disconnect() {
        if (this.wsConnection) {
            this.wsConnection.close();
        }
        
        this.setConnectionState('disconnected');
        
        if (this.connectionTimer) {
            clearInterval(this.connectionTimer);
            this.connectionTimer = null;
        }
        
        this.sessionId = null;
        this.connectionStartTime = null;
        this.reconnectAttempts = 0;
    }
    
    setConnectionState(state) {
        // Update status indicator
        this.statusIcon.className = `status-icon ${state}`;
        
        // Update button and text
        const btn = this.connectBtn;
        const btnText = btn.querySelector('.btn-text');
        
        btn.classList.remove('connecting', 'connected');
        
        switch (state) {
            case 'connecting':
                this.statusText.textContent = 'Connecting...';
                btn.classList.add('connecting');
                btnText.textContent = 'Connecting...';
                btn.disabled = true;
                break;
                
            case 'connected':
                this.statusText.textContent = 'Connected';
                btn.classList.add('connected');
                btnText.textContent = 'Connected';
                btn.disabled = true;
                break;
                
            case 'disconnected':
            default:
                this.statusText.textContent = 'Disconnected';
                btnText.textContent = 'Connect to Terminal';
                btn.disabled = false;
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
        this.appendToTerminal(`🦆 DuckBridge Terminal Connected\n`);
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
                    this.handleConnectionError(`Authentication failed: ${message.data}`);
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
    
    // Initialize tagline with random selection
    initializeTagline() {
        const taglines = [
            "Get your ducks in a row with AI",
            "Bridge the gap between code and creativity",
            "Where rubber duck debugging meets real AI",
            "Swimming upstream with artificial intelligence",
            "Flocking together for better development",
            "Making waves in the AI development pool",
            "Ducking complexity, embracing simplicity",
            "Paddle through code with AI assistance",
            "Feathering your nest with smart tools",
            "Migrate your workflow to the cloud",
            "Quack the code with intelligent insights",
            "Building nest-level development experiences"
        ];
        
        const taglineElement = document.getElementById('tagline');
        if (taglineElement) {
            const randomTagline = taglines[Math.floor(Math.random() * taglines.length)];
            taglineElement.textContent = randomTagline;
        }
    }
    
    // Check URL parameters for UUID
    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const uuidParam = urlParams.get('uuid');
        if (uuidParam && this.validateUuidString(uuidParam)) {
            this.currentUuid = uuidParam;
            this.updateUuidDisplay();
        }
    }
    
    // Helper method to validate UUID string format
    validateUuidString(uuid) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }
    
    // QR Code functionality
    showQrCode() {
        console.log('QR Code button clicked');
        const url = `https://vibe.theduck.chat?uuid=${this.currentUuid}`;
        
        if (typeof QRCode === 'undefined') {
            console.log('QRCode library not available, using fallback');
            this.showFallbackQrCode(url);
            return;
        }
        
        try {
            this.generateQrCode(url);
            this.qrUrl.textContent = url;
            this.qrModal.classList.add('show');
        } catch (error) {
            console.error('Failed to generate QR code:', error);
            this.showFallbackQrCode(url);
        }
    }
    
    generateQrCode(url) {
        // Clear previous QR code
        this.qrCanvas.width = 0;
        this.qrCanvas.height = 0;
        
        QRCode.toCanvas(this.qrCanvas, url, {
            width: 200,
            height: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        }, (error) => {
            if (error) {
                console.error('QR code generation error:', error);
                this.showFallbackQrCode(url);
            }
        });
    }
    
    showFallbackQrCode(url) {
        const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
        
        // Replace canvas with image
        const container = document.getElementById('qr-code-container');
        container.innerHTML = `<img src="${fallbackUrl}" alt="QR Code" style="width: 200px; height: 200px; border-radius: 0.5rem;">`;
        
        this.qrUrl.textContent = url;
        this.qrModal.classList.add('show');
    }
    
    hideQrCode() {
        this.qrModal.classList.remove('show');
    }
    
    // UI State Management
    initializeUI() {
        // Check if user was previously connected
        const wasConnected = localStorage.getItem('wasConnected') === 'true';
        
        if (wasConnected) {
            // Show login modal directly for returning users
            this.showLoginModal();
        } else {
            // Show welcome screen for new users
            this.showWelcomeScreen();
        }
    }
    
    showWelcomeScreen() {
        this.welcomeScreen.style.display = 'block';
        this.mainInterface.style.display = 'none';
        this.hideLoginModal();
    }
    
    showLoginModal() {
        this.loginModal.classList.add('show');
        this.welcomeScreen.style.display = 'none';
    }
    
    hideLoginModal() {
        this.loginModal.classList.remove('show');
    }
    
    showMainInterface() {
        this.welcomeScreen.style.display = 'none';
        this.mainInterface.style.display = 'block';
        this.hideLoginModal();
        localStorage.setItem('wasConnected', 'true');
    }
    
    logout() {
        if (this.wsConnection) {
            this.wsConnection.close();
        }
        
        // Clear connection state
        this.sessionId = null;
        this.connectionStartTime = null;
        if (this.connectionTimer) {
            clearInterval(this.connectionTimer);
            this.connectionTimer = null;
        }
        
        // Clear terminal tabs
        this.clearAllTerminals();
        
        // Reset UI state
        localStorage.removeItem('wasConnected');
        this.showWelcomeScreen();
        
        this.showSuccessMessage('Disconnected successfully');
    }
    
    // Project Management
    createNewProject() {
        // Placeholder for now - will be implemented in later phases
        this.showSuccessMessage('Project creation coming soon!');
        
        // For now, just ensure we have at least one terminal tab
        if (this.terminalTabs.children.length === 0) {
            this.createNewTerminalTab('Project Terminal');
        }
    }
    
    openExistingProject() {
        // Placeholder for now - will be implemented in later phases
        this.showSuccessMessage('Project opening coming soon!');
    }
    
    // Terminal Tab Management
    createNewTerminalTab(name = 'Terminal') {
        const tabId = 'tab-' + Date.now();
        const panelId = 'panel-' + Date.now();
        
        // Create tab
        const tab = document.createElement('div');
        tab.className = 'terminal-tab';
        tab.dataset.tabId = tabId;
        tab.innerHTML = `
            <span class="terminal-tab-name">${name}</span>
            <button class="terminal-tab-close" data-close="${tabId}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        
        // Create panel
        const panel = document.createElement('div');
        panel.className = 'terminal-panel';
        panel.id = panelId;
        panel.innerHTML = `
            <div class="terminal-container" style="padding: 1rem; height: 400px; background: #000; color: #00ff00; font-family: var(--font-mono);">
                <div>🦆 ${name} Ready</div>
                <div>Session: ${this.sessionId || 'Not connected'}</div>
                <div>Type commands here when connected...</div>
            </div>
        `;
        
        // Add event listeners
        tab.addEventListener('click', (e) => {
            if (!e.target.closest('.terminal-tab-close')) {
                this.switchToTab(tabId, panelId);
            }
        });
        
        tab.querySelector('.terminal-tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabId, panelId);
        });
        
        // Add to DOM
        this.terminalTabs.appendChild(tab);
        this.terminalPanels.appendChild(panel);
        
        // Make this tab active
        this.switchToTab(tabId, panelId);
        
        return { tabId, panelId };
    }
    
    switchToTab(tabId, panelId) {
        // Remove active class from all tabs and panels
        document.querySelectorAll('.terminal-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.terminal-panel').forEach(panel => panel.classList.remove('active'));
        
        // Add active class to selected tab and panel
        document.querySelector(`[data-tab-id="${tabId}"]`).classList.add('active');
        document.getElementById(panelId).classList.add('active');
    }
    
    closeTab(tabId, panelId) {
        const tab = document.querySelector(`[data-tab-id="${tabId}"]`);
        const panel = document.getElementById(panelId);
        
        if (tab) tab.remove();
        if (panel) panel.remove();
        
        // If there are remaining tabs, activate the first one
        const remainingTabs = document.querySelectorAll('.terminal-tab');
        if (remainingTabs.length > 0) {
            const firstTab = remainingTabs[0];
            const firstTabId = firstTab.dataset.tabId;
            const firstPanel = document.querySelector('.terminal-panel');
            if (firstPanel) {
                this.switchToTab(firstTabId, firstPanel.id);
            }
        }
    }
    
    clearAllTerminals() {
        this.terminalTabs.innerHTML = '';
        this.terminalPanels.innerHTML = '';
    }
}

// Global functions
function showAbout() {
    alert('DuckBridge - Remote Terminal Access\\n\\nBuilt with 🦆 for developers\\n\\nConnect to your local terminal from anywhere with secure WebSocket connections.');
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new DuckBridgeApp();
    app.checkStoredConnection();
});