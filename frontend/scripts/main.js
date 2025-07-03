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
        
        // Multi-terminal support
        this.terminals = new Map(); // terminalId -> terminal data
        this.activeTerminalId = null;
        this.terminalCounter = 1;
        
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
        this.newTerminalBtn = document.getElementById('new-terminal-btn');
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
        
        // Terminal controls
        if (this.newTerminalBtn) {
            this.newTerminalBtn.addEventListener('click', () => this.createNewTerminal());
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
        
        // Store session information for persistence
        this.saveSessionState(uuid);
    }
    
    saveSessionState(uuid) {
        localStorage.setItem('lastConnectedUUID', uuid);
        localStorage.setItem('wasConnected', 'true');
        localStorage.setItem('sessionTimestamp', Date.now().toString());
        
        // Save current tab configuration
        const tabs = Array.from(this.terminalTabs.children).map(tab => ({
            name: tab.querySelector('.terminal-tab-name').textContent,
            isActive: tab.classList.contains('active')
        }));
        localStorage.setItem('terminalTabs', JSON.stringify(tabs));
    }
    
    restoreSessionState() {
        const savedTabs = localStorage.getItem('terminalTabs');
        if (savedTabs) {
            try {
                const tabs = JSON.parse(savedTabs);
                tabs.forEach((tabInfo, index) => {
                    const { tabId, panelId } = this.createNewTerminalTab(tabInfo.name, tabInfo.color);
                    if (tabInfo.isActive) {
                        this.switchToTab(tabId, panelId);
                    }
                });
            } catch (error) {
                console.warn('Failed to restore terminal tabs:', error);
                // Fallback: create a single terminal tab
                this.createNewTerminalTab('Main Terminal');
            }
        }
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
                if (keyData && this.activeTerminalId) {
                    this.sendMessage({
                        type: 'terminal_input',
                        terminalId: this.activeTerminalId,
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
                    
                case 'terminal_list':
                    this.handleTerminalList(message.data.terminals);
                    break;
                    
                case 'terminal_created':
                    this.handleTerminalCreated(message.terminalId, message.data);
                    break;
                    
                case 'terminal_create_error':
                    this.handleTerminalCreateError(message.data);
                    break;
                    
                case 'terminal_closed':
                    this.handleTerminalClosed(message.terminalId);
                    break;
                    
                case 'terminal_output':
                    this.handleTerminalOutput(message.terminalId, message.data);
                    break;
                    
                case 'terminal_exit':
                    this.handleTerminalExit(message.terminalId, message.data.exitCode);
                    break;
                    
                case 'ping':
                    this.sendMessage({
                        type: 'pong',
                        timestamp: Date.now()
                    });
                    break;
                    
                case 'pong':
                    break;
                    
                case 'error':
                    console.error('WebSocket error:', message.data);
                    break;
                    
                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }
    
    // Multi-terminal message handlers
    handleTerminalList(terminals) {
        console.log('Received terminal list:', terminals);
        
        // Clear existing terminals
        this.terminals.clear();
        
        // Populate terminals
        terminals.forEach(terminal => {
            this.terminals.set(terminal.terminalId, {
                id: terminal.id,
                terminalId: terminal.terminalId,
                name: terminal.name || 'Terminal',
                color: terminal.color || 'blue',
                isActive: terminal.isActive,
                output: '',
                createdAt: new Date(terminal.createdAt),
                lastActivity: new Date(terminal.lastActivity)
            });
        });
        
        // Update UI
        this.updateTerminalTabs();
        
        // Set active terminal if none is set
        if (!this.activeTerminalId && terminals.length > 0) {
            this.setActiveTerminal(terminals[0].terminalId);
        }
    }
    
    handleTerminalCreated(terminalId, data) {
        console.log('Terminal created:', terminalId, data);
        
        this.terminals.set(terminalId, {
            id: data.id,
            terminalId: terminalId,
            name: data.name || 'Terminal',
            color: data.color || 'blue',
            isActive: true,
            output: '',
            createdAt: new Date(data.createdAt),
            lastActivity: new Date()
        });
        
        this.updateTerminalTabs();
        this.setActiveTerminal(terminalId);
    }
    
    handleTerminalCreateError(data) {
        console.error('Failed to create terminal:', data);
        
        // Show user-friendly error message
        let message = 'Failed to create new terminal';
        if (data.message) {
            if (data.message.includes('Maximum terminals per user')) {
                message = 'You have reached the maximum number of terminals (8). Please close some terminals first.';
            } else if (data.message.includes('Maximum total terminals')) {
                message = 'Server has reached maximum terminal capacity. Please try again later.';
            } else {
                message = data.message;
            }
        }
        
        alert(message);
    }
    
    handleTerminalClosed(terminalId) {
        console.log('Terminal closed:', terminalId);
        
        this.terminals.delete(terminalId);
        
        // If this was the active terminal, switch to another one
        if (this.activeTerminalId === terminalId) {
            const remainingTerminals = Array.from(this.terminals.keys());
            this.activeTerminalId = remainingTerminals.length > 0 ? remainingTerminals[0] : null;
        }
        
        this.updateTerminalTabs();
        if (this.activeTerminalId) {
            this.setActiveTerminal(this.activeTerminalId);
        }
    }
    
    handleTerminalOutput(terminalId, data) {
        const terminal = this.terminals.get(terminalId);
        if (terminal) {
            terminal.output += data;
            terminal.lastActivity = new Date();
            
            // If this is the active terminal, update the display
            if (terminalId === this.activeTerminalId) {
                this.appendToTerminal(data);
                
                // Clear the input field if we receive output (shell is echoing)
                const terminalInput = document.getElementById('terminal-input');
                if (terminalInput && data.includes('\n')) {
                    terminalInput.value = '';
                }
            }
        }
    }
    
    handleTerminalExit(terminalId, exitCode) {
        console.log('Terminal exited:', terminalId, 'code:', exitCode);
        
        const terminal = this.terminals.get(terminalId);
        if (terminal) {
            terminal.isActive = false;
            const exitMessage = `\nProcess exited with code ${exitCode}\n`;
            terminal.output += exitMessage;
            
            // If this is the active terminal, update the display
            if (terminalId === this.activeTerminalId) {
                this.appendToTerminal(exitMessage);
            }
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
        const lastUuid = localStorage.getItem('lastConnectedUUID');
        
        if (wasConnected && lastUuid) {
            // Auto-restore UUID for returning users
            this.currentUuid = lastUuid;
            this.updateUuidDisplay();
            
            // Show login modal and attempt auto-reconnect
            this.showLoginModal();
            
            // Attempt auto-reconnect after a brief delay
            setTimeout(() => {
                this.attemptAutoReconnect();
            }, 1000);
        } else {
            // Show welcome screen for new users
            this.showWelcomeScreen();
        }
    }
    
    attemptAutoReconnect() {
        // Only attempt if we have a valid UUID and aren't already connected
        if (this.currentUuid && this.validateUuidString(this.currentUuid) && !this.wsConnection) {
            console.log('Attempting auto-reconnect with stored UUID');
            this.handleConnect();
        }
    }
    
    // Helper method for UUID validation
    validateUuidString(uuid) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }
    
    showWelcomeScreen() {
        // Smooth transition to welcome screen
        this.mainInterface.classList.add('hidden');
        this.hideLoginModal();
        
        setTimeout(() => {
            this.welcomeScreen.style.display = 'block';
            this.mainInterface.style.display = 'none';
            requestAnimationFrame(() => {
                this.welcomeScreen.classList.remove('hidden');
            });
        }, 100);
    }
    
    showLoginModal() {
        this.loginModal.classList.add('show');
        
        // Hide welcome screen with animation
        this.welcomeScreen.classList.add('hidden');
        setTimeout(() => {
            this.welcomeScreen.style.display = 'none';
        }, 300);
    }
    
    hideLoginModal() {
        this.loginModal.classList.remove('show');
    }
    
    showMainInterface() {
        // Hide both welcome screen and login modal
        this.welcomeScreen.classList.add('hidden');
        this.hideLoginModal();
        
        // Show main interface with smooth transition
        setTimeout(() => {
            this.welcomeScreen.style.display = 'none';
            this.mainInterface.style.display = 'block';
            this.mainInterface.classList.remove('hidden');
        }, 100);
        
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
        
        // Clear all session state
        this.clearSessionState();
        
        // Reset UI state
        this.showWelcomeScreen();
        
        this.showSuccessMessage('Disconnected successfully');
    }
    
    clearSessionState() {
        localStorage.removeItem('wasConnected');
        localStorage.removeItem('lastConnectedUUID');
        localStorage.removeItem('sessionTimestamp');
        localStorage.removeItem('terminalTabs');
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
    createNewTerminalTab(name = 'Terminal', color = null) {
        const tabId = 'tab-' + Date.now();
        const panelId = 'panel-' + Date.now();
        
        // Assign a color if not provided
        if (!color) {
            const colors = ['blue', 'green', 'purple', 'orange', 'red', 'pink', 'indigo', 'teal'];
            const existingColors = Array.from(this.terminalTabs.children).map(tab => {
                const colorMatch = tab.className.match(/color-(\w+)/);
                return colorMatch ? colorMatch[1] : null;
            }).filter(Boolean);
            
            // Find an unused color or cycle through
            color = colors.find(c => !existingColors.includes(c)) || colors[existingColors.length % colors.length];
        }
        
        // Create tab
        const tab = document.createElement('div');
        tab.className = `terminal-tab color-${color}`;
        tab.dataset.tabId = tabId;
        tab.dataset.color = color;
        tab.innerHTML = `
            <span class="terminal-tab-name">${name}</span>
            <button class="terminal-tab-edit" data-edit="${tabId}" title="Edit tab">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
            <button class="terminal-tab-close" data-close="${tabId}" title="Close tab">
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
            if (!e.target.closest('.terminal-tab-close') && !e.target.closest('.terminal-tab-edit')) {
                this.switchToTab(tabId, panelId);
            }
        });
        
        tab.querySelector('.terminal-tab-edit').addEventListener('click', (e) => {
            e.stopPropagation();
            this.editTab(tabId);
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
    
    editTab(tabId) {
        const tab = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (!tab) return;
        
        const nameSpan = tab.querySelector('.terminal-tab-name');
        const currentName = nameSpan.textContent;
        const currentColor = tab.dataset.color;
        
        // Create inline editor
        const editor = document.createElement('div');
        editor.className = 'tab-editor';
        editor.innerHTML = `
            <input type="text" class="tab-name-input" value="${currentName}" placeholder="Tab name">
            <select class="tab-color-select">
                <option value="blue" ${currentColor === 'blue' ? 'selected' : ''}>🔵 Blue</option>
                <option value="green" ${currentColor === 'green' ? 'selected' : ''}>🟢 Green</option>
                <option value="purple" ${currentColor === 'purple' ? 'selected' : ''}>🟣 Purple</option>
                <option value="orange" ${currentColor === 'orange' ? 'selected' : ''}>🟠 Orange</option>
                <option value="red" ${currentColor === 'red' ? 'selected' : ''}>🔴 Red</option>
                <option value="pink" ${currentColor === 'pink' ? 'selected' : ''}>🩷 Pink</option>
                <option value="indigo" ${currentColor === 'indigo' ? 'selected' : ''}>🟦 Indigo</option>
                <option value="teal" ${currentColor === 'teal' ? 'selected' : ''}>🔷 Teal</option>
            </select>
            <button class="tab-save-btn">✓</button>
            <button class="tab-cancel-btn">✕</button>
        `;
        
        // Replace tab content temporarily
        const originalContent = tab.innerHTML;
        tab.innerHTML = '';
        tab.appendChild(editor);
        
        const nameInput = editor.querySelector('.tab-name-input');
        const colorSelect = editor.querySelector('.tab-color-select');
        const saveBtn = editor.querySelector('.tab-save-btn');
        const cancelBtn = editor.querySelector('.tab-cancel-btn');
        
        // Focus input and select text
        nameInput.focus();
        nameInput.select();
        
        const saveChanges = () => {
            const newName = nameInput.value.trim() || currentName;
            const newColor = colorSelect.value;
            
            // Update tab
            tab.className = `terminal-tab color-${newColor}`;
            tab.dataset.color = newColor;
            tab.innerHTML = originalContent;
            
            // Update name
            const updatedNameSpan = tab.querySelector('.terminal-tab-name');
            updatedNameSpan.textContent = newName;
            
            // Re-attach event listeners
            this.attachTabListeners(tab, tabId);
            
            // Save to localStorage
            this.saveTabState();
        };
        
        const cancelChanges = () => {
            tab.innerHTML = originalContent;
            this.attachTabListeners(tab, tabId);
        };
        
        // Event listeners for editor
        saveBtn.addEventListener('click', saveChanges);
        cancelBtn.addEventListener('click', cancelChanges);
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveChanges();
            if (e.key === 'Escape') cancelChanges();
        });
        
        // Auto-save on color change
        colorSelect.addEventListener('change', () => {
            tab.className = `terminal-tab color-${colorSelect.value}`;
        });
    }
    
    attachTabListeners(tab, tabId) {
        const panelId = document.querySelector('.terminal-panel.active')?.id || `panel-${Date.now()}`;
        
        tab.addEventListener('click', (e) => {
            if (!e.target.closest('.terminal-tab-close') && !e.target.closest('.terminal-tab-edit')) {
                this.switchToTab(tabId, panelId);
            }
        });
        
        const editBtn = tab.querySelector('.terminal-tab-edit');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editTab(tabId);
            });
        }
        
        const closeBtn = tab.querySelector('.terminal-tab-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(tabId, panelId);
            });
        }
    }
    
    saveTabState() {
        const tabs = Array.from(this.terminalTabs.children).map(tab => ({
            name: tab.querySelector('.terminal-tab-name').textContent,
            color: tab.dataset.color,
            isActive: tab.classList.contains('active')
        }));
        localStorage.setItem('terminalTabs', JSON.stringify(tabs));
    }
    
    clearAllTerminals() {
        this.terminalTabs.innerHTML = '';
        this.terminalPanels.innerHTML = '';
    }
    
    // Multi-terminal management methods
    updateTerminalTabs() {
        const tabsContainer = this.terminalTabs;
        if (!tabsContainer) return;
        
        // Clear existing tabs
        tabsContainer.innerHTML = '';
        
        // Create tabs for each terminal
        this.terminals.forEach((terminal, terminalId) => {
            this.createTabElement(terminalId, terminal.name, terminal.color);
        });
        
        // Create terminal panels container if needed
        this.ensureTerminalPanels();
    }
    
    createTabElement(terminalId, name, color) {
        const tab = document.createElement('div');
        tab.className = `terminal-tab color-${color}`;
        tab.dataset.tabId = terminalId;
        tab.dataset.color = color;
        
        tab.innerHTML = `
            <span class="terminal-tab-name">${name}</span>
            <button class="terminal-tab-edit" title="Edit tab">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="m18.5 2.5 a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
            <button class="terminal-tab-close" title="Close tab">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        
        this.terminalTabs.appendChild(tab);
        this.attachMultiTerminalTabListeners(tab, terminalId);
        
        return tab;
    }
    
    ensureTerminalPanels() {
        const panelsContainer = this.terminalPanels;
        if (!panelsContainer) return;
        
        // Remove panels for terminals that no longer exist
        const existingPanels = panelsContainer.querySelectorAll('.terminal-panel');
        existingPanels.forEach(panel => {
            const terminalId = panel.id.replace('panel-', '');
            if (!this.terminals.has(terminalId)) {
                panel.remove();
            }
        });
        
        // Create panels for new terminals
        this.terminals.forEach((terminal, terminalId) => {
            if (!document.getElementById(`panel-${terminalId}`)) {
                this.createTerminalPanel(terminalId);
            }
        });
    }
    
    createTerminalPanel(terminalId) {
        const panel = document.createElement('div');
        panel.className = 'terminal-panel';
        panel.id = `panel-${terminalId}`;
        panel.innerHTML = `
            <div id="terminal-output-${terminalId}" class="terminal-container"></div>
        `;
        
        this.terminalPanels.appendChild(panel);
        this.setupTerminalPanelInput(panel, terminalId);
        return panel;
    }
    
    setupTerminalPanelInput(panel, terminalId) {
        const outputElement = panel.querySelector(`#terminal-output-${terminalId}`);
        if (!outputElement) return;
        
        // Make the output element focusable and handle keyboard input
        outputElement.setAttribute('tabindex', '0');
        outputElement.style.outline = 'none';
        
        outputElement.addEventListener('keydown', (e) => {
            if (!this.activeTerminalId || this.activeTerminalId !== terminalId) return;
            
            let keyData = null;
            
            // Handle special keys
            if (e.key === 'Enter') {
                keyData = '\r';
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
                keyData = e.key;
            }
            
            // Send key data to terminal
            if (keyData) {
                this.sendMessage({
                    type: 'terminal_input',
                    terminalId: terminalId,
                    data: keyData,
                    timestamp: Date.now()
                });
            }
        });
    }
    
    setActiveTerminal(terminalId) {
        if (!this.terminals.has(terminalId)) return;
        
        this.activeTerminalId = terminalId;
        
        // Update tab states
        document.querySelectorAll('.terminal-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.tabId === terminalId) {
                tab.classList.add('active');
            }
        });
        
        // Update panel states
        document.querySelectorAll('.terminal-panel').forEach(panel => {
            panel.classList.remove('active');
            if (panel.id === `panel-${terminalId}`) {
                panel.classList.add('active');
            }
        });
        
        // Restore terminal output and focus
        const terminal = this.terminals.get(terminalId);
        const outputElement = document.getElementById(`terminal-output-${terminalId}`);
        if (outputElement && terminal) {
            outputElement.textContent = terminal.output;
            outputElement.scrollTop = outputElement.scrollHeight;
            outputElement.focus();
        }
    }
    
    attachMultiTerminalTabListeners(tab, terminalId) {
        tab.addEventListener('click', (e) => {
            if (!e.target.closest('.terminal-tab-close') && !e.target.closest('.terminal-tab-edit')) {
                this.setActiveTerminal(terminalId);
            }
        });
        
        const editBtn = tab.querySelector('.terminal-tab-edit');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editTerminalTab(terminalId);
            });
        }
        
        const closeBtn = tab.querySelector('.terminal-tab-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTerminal(terminalId);
            });
        }
    }
    
    editTerminalTab(terminalId) {
        const tab = document.querySelector(`[data-tab-id="${terminalId}"]`);
        const terminal = this.terminals.get(terminalId);
        if (!tab || !terminal) return;
        
        const nameSpan = tab.querySelector('.terminal-tab-name');
        const currentName = nameSpan.textContent;
        const currentColor = tab.dataset.color;
        
        // Store original content
        const originalContent = tab.innerHTML;
        
        // Create inline editor
        const editor = document.createElement('div');
        editor.className = 'tab-editor';
        editor.innerHTML = `
            <input type="text" class="tab-name-input" value="${currentName}" placeholder="Tab name">
            <select class="tab-color-select">
                <option value="blue" ${currentColor === 'blue' ? 'selected' : ''}>Blue</option>
                <option value="green" ${currentColor === 'green' ? 'selected' : ''}>Green</option>
                <option value="purple" ${currentColor === 'purple' ? 'selected' : ''}>Purple</option>
                <option value="orange" ${currentColor === 'orange' ? 'selected' : ''}>Orange</option>
                <option value="red" ${currentColor === 'red' ? 'selected' : ''}>Red</option>
                <option value="pink" ${currentColor === 'pink' ? 'selected' : ''}>Pink</option>
                <option value="indigo" ${currentColor === 'indigo' ? 'selected' : ''}>Indigo</option>
                <option value="teal" ${currentColor === 'teal' ? 'selected' : ''}>Teal</option>
            </select>
            <button class="tab-save-btn" title="Save">✓</button>
            <button class="tab-cancel-btn" title="Cancel">✕</button>
        `;
        
        tab.innerHTML = '';
        tab.appendChild(editor);
        
        const nameInput = editor.querySelector('.tab-name-input');
        const colorSelect = editor.querySelector('.tab-color-select');
        const saveBtn = editor.querySelector('.tab-save-btn');
        const cancelBtn = editor.querySelector('.tab-cancel-btn');
        
        nameInput.focus();
        
        const saveChanges = () => {
            const newName = nameInput.value.trim() || currentName;
            const newColor = colorSelect.value;
            
            // Update local state
            terminal.name = newName;
            terminal.color = newColor;
            
            // Restore tab with new values
            tab.innerHTML = originalContent;
            tab.querySelector('.terminal-tab-name').textContent = newName;
            tab.className = `terminal-tab color-${newColor}`;
            tab.dataset.color = newColor;
            
            this.attachMultiTerminalTabListeners(tab, terminalId);
            this.saveTabState();
        };
        
        const cancelChanges = () => {
            tab.innerHTML = originalContent;
            this.attachMultiTerminalTabListeners(tab, terminalId);
        };
        
        // Event listeners
        saveBtn.addEventListener('click', saveChanges);
        cancelBtn.addEventListener('click', cancelChanges);
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveChanges();
            if (e.key === 'Escape') cancelChanges();
        });
        
        colorSelect.addEventListener('change', () => {
            tab.className = `terminal-tab color-${colorSelect.value}`;
        });
    }
    
    createNewTerminal(name, color) {
        if (!name) {
            name = `Terminal ${this.terminalCounter++}`;
        }
        
        if (!color) {
            const colors = ['blue', 'green', 'purple', 'orange', 'red', 'pink', 'indigo', 'teal'];
            const usedColors = Array.from(this.terminals.values()).map(t => t.color);
            color = colors.find(c => !usedColors.includes(c)) || colors[0];
        }
        
        this.sendMessage({
            type: 'terminal_create',
            data: { name, color },
            timestamp: Date.now()
        });
    }
    
    closeTerminal(terminalId) {
        // Don't close if it's the last terminal
        if (this.terminals.size <= 1) {
            alert('Cannot close the last terminal. Create a new one first.');
            return;
        }
        
        this.sendMessage({
            type: 'terminal_close',
            terminalId: terminalId,
            timestamp: Date.now()
        });
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