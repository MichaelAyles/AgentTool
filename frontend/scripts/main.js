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
        this.isConnected = false;
        
        // Multi-terminal support
        this.terminals = new Map(); // terminalId -> terminal data
        this.activeTerminalId = null;
        this.terminalCounter = 1;
        
        // Project management
        this.projects = new Map(); // projectId -> project data
        this.activeProjectId = null;
        this.projectTerminals = new Map(); // projectId -> Set of terminalIds
        this.terminalProjects = new Map(); // terminalId -> projectId
        this.pendingTerminalProjects = new Map(); // temporary storage for project association
        
        this.initializeElements();
        this.attachEventListeners();
        this.updateUuidDisplay();
        this.initializeTheme();
        this.initializeTagline();
        this.checkUrlParams();
        this.loadProjectTerminalAssociations();
        this.restoreActiveProject();
        this.initializeUI();
        this.initializeSidebar();
        
        // Initialize tool manager
        this.toolManager = new ToolManager(this);
        
        // Initialize command routing manager
        this.commandRoutingManager = new CommandRoutingManager(this);
        
        // Initialize agent dashboard
        this.agentDashboard = new AgentDashboard(this);
        
        // Initialize layout manager
        this.layoutManager = new LayoutManager(this);
        
        // Initialize collaboration manager
        this.collaborationManager = new CollaborationManager(this);
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
        
        // Session sidebar elements
        this.sessionSidebar = document.getElementById('session-sidebar');
        this.sidebarToggle = document.getElementById('sidebar-toggle');
        this.sessionGroups = document.getElementById('session-groups');
        this.sessionSidebarContent = document.getElementById('session-sidebar-content');
        this.globalSessions = document.getElementById('global-sessions');
        
        // Project switcher elements
        this.projectSwitcherBar = document.getElementById('project-switcher-bar');
        this.projectSwitcherBtn = document.getElementById('project-switcher-btn');
        this.projectSwitcherDropdown = document.getElementById('project-switcher-dropdown');
        this.projectOverviewBtn = document.getElementById('project-overview-btn');
        this.currentProjectName = document.getElementById('current-project-name');
        this.projectColorDot = document.getElementById('project-color-dot');
        this.projectStats = document.getElementById('project-stats');
        this.activeTerminalsSpan = document.getElementById('active-terminals');
        this.gitStatusSpan = document.getElementById('git-status');
        this.dropdownProjects = document.getElementById('dropdown-projects');
        this.createProjectQuick = document.getElementById('create-project-quick');
        this.manageProjects = document.getElementById('manage-projects');
        
        // Project overview dashboard elements
        this.projectOverviewDashboard = document.getElementById('project-overview-dashboard');
        this.closeOverviewBtn = document.getElementById('close-overview-btn');
        this.totalProjectsSpan = document.getElementById('total-projects');
        this.activeSessionsSpan = document.getElementById('active-sessions');
        this.gitReposSpan = document.getElementById('git-repos');
        this.recentActivitySpan = document.getElementById('recent-activity');
        this.recentProjectsList = document.getElementById('recent-projects-list');
        this.activeSessionsList = document.getElementById('active-sessions-list');
        this.gitActivityList = document.getElementById('git-activity-list');
        this.refreshAllGitBtn = document.getElementById('refresh-all-git');
        this.viewAllProjects = document.getElementById('view-all-projects');
        this.viewAllSessions = document.getElementById('view-all-sessions');
        
        // Workspace controls
        this.toggleSplitView = document.getElementById('toggle-split-view');
        this.toggleHorizontalSplit = document.getElementById('toggle-horizontal-split');
        this.toggleLayoutMode = document.getElementById('toggle-layout-mode');
        this.terminalWorkspaceContainer = document.getElementById('terminal-workspace-container');
        this.terminalPanelsSecondary = document.getElementById('terminal-panels-secondary');
        this.splitViewDivider = document.getElementById('split-view-divider');
        this.mainDashboard = document.getElementById('main-dashboard');
        
        // Split view state
        this.splitViewActive = false;
        this.splitViewOrientation = 'vertical'; // 'vertical' or 'horizontal'
        this.layoutMode = 'single'; // 'single', 'split', 'quad'
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
        this.newProjectBtn.addEventListener('click', () => this.showCreateProjectDialog());
        this.openProjectBtn.addEventListener('click', () => this.showCreateProjectDialog());
        if (this.createFirstProjectBtn) {
            this.createFirstProjectBtn.addEventListener('click', () => this.showCreateProjectDialog());
        }
        
        // Terminal controls
        if (this.newTerminalBtn) {
            this.newTerminalBtn.addEventListener('click', () => this.createNewTerminal());
        }
        
        // Session sidebar controls
        if (this.sidebarToggle) {
            this.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }
        
        // Project switcher controls
        if (this.projectSwitcherBtn) {
            this.projectSwitcherBtn.addEventListener('click', () => this.toggleProjectSwitcher());
        }
        
        if (this.projectOverviewBtn) {
            this.projectOverviewBtn.addEventListener('click', () => this.toggleProjectOverview());
        }
        
        if (this.closeOverviewBtn) {
            this.closeOverviewBtn.addEventListener('click', () => this.closeProjectOverview());
        }
        
        if (this.createProjectQuick) {
            this.createProjectQuick.addEventListener('click', () => this.showCreateProjectDialog());
        }
        
        if (this.manageProjects) {
            this.manageProjects.addEventListener('click', () => this.showManageProjectsDialog());
        }
        
        if (this.refreshAllGitBtn) {
            this.refreshAllGitBtn.addEventListener('click', () => this.refreshAllGitStatus());
        }
        
        if (this.viewAllProjects) {
            this.viewAllProjects.addEventListener('click', () => this.showAllProjects());
        }
        
        if (this.viewAllSessions) {
            this.viewAllSessions.addEventListener('click', () => this.showAllSessions());
        }
        
        // Workspace controls
        if (this.toggleSplitView) {
            this.toggleSplitView.addEventListener('click', () => this.toggleSplitViewMode());
        }
        
        if (this.toggleHorizontalSplit) {
            this.toggleHorizontalSplit.addEventListener('click', () => this.toggleHorizontalSplitMode());
        }
        
        if (this.toggleLayoutMode) {
            this.toggleLayoutMode.addEventListener('click', () => this.cycleLayoutMode());
        }
        
        // Click outside to close dropdowns
        document.addEventListener('click', (e) => {
            if (!this.projectSwitcherBar?.contains(e.target)) {
                this.closeProjectSwitcher();
            }
        });
        
        // Initialize split view divider dragging
        this.initializeSplitViewDivider();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleConnect();
                }
                
                // Terminal tab navigation shortcuts
                if (this.isConnected && this.terminals.size > 0) {
                    // Ctrl/Cmd + number to switch to specific tab
                    const num = parseInt(e.key);
                    if (num >= 1 && num <= 9) {
                        e.preventDefault();
                        const terminalIds = Array.from(this.terminals.keys());
                        if (terminalIds[num - 1]) {
                            this.setActiveTerminal(terminalIds[num - 1]);
                        }
                    }
                    
                    // Ctrl/Cmd + T to create new terminal
                    if (e.key === 't') {
                        e.preventDefault();
                        this.createNewTerminal();
                    }
                    
                    // Ctrl/Cmd + W to close current terminal
                    if (e.key === 'w' && this.activeTerminalId) {
                        e.preventDefault();
                        this.closeTerminal(this.activeTerminalId);
                    }
                    
                    // Ctrl/Cmd + Tab or Ctrl/Cmd + PageDown for next tab
                    if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'PageDown') {
                        e.preventDefault();
                        this.switchToNextTab();
                    }
                    
                    // Ctrl/Cmd + Shift + Tab or Ctrl/Cmd + PageUp for previous tab
                    if ((e.key === 'Tab' && e.shiftKey) || e.key === 'PageUp') {
                        e.preventDefault();
                        this.switchToPrevTab();
                    }
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
        
        // Load user projects
        this.loadUserProjects();
        
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
        
        // Update connection status for tool manager
        const wasConnected = this.isConnected;
        this.isConnected = (state === 'connected');
        
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
        
        // Notify tool manager of connection status change
        if (this.toolManager && wasConnected !== this.isConnected) {
            this.toolManager.onConnectionStatusChanged(this.isConnected);
        }
    }
    
    getApiUrl() {
        return 'http://localhost:3001';
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
                    
                case 'terminal_message':
                    this.handleTerminalMessage(message.terminalId, message.sourceTerminalId, message.data);
                    break;
                    
                case 'ping':
                    this.sendMessage({
                        type: 'pong',
                        timestamp: Date.now()
                    });
                    break;
                    
                case 'pong':
                    break;

                case 'command_result':
                    this.handleCommandResult(message.terminalId, message.data);
                    break;
                    
                case 'command_error':
                    this.handleCommandError(message.terminalId, message.data);
                    break;
                    
                case 'command_parsed':
                    this.handleCommandParsed(message.data);
                    break;
                    
                case 'command_history_result':
                    this.handleCommandHistoryResult(message.terminalId, message.data);
                    break;
                    
                case 'tool_history_result':
                    this.handleToolHistoryResult(message.data);
                    break;
                    
                case 'tool_histories_result':
                    this.handleToolHistoriesResult(message.data);
                    break;
                    
                case 'agent_output':
                    this.handleAgentOutput(message.terminalId, message.data);
                    break;
                    
                case 'command_routed':
                    this.handleCommandRouted(message.terminalId, message.data);
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
        
        // Associate with project if this was a project terminal
        // Find the most recent pending project association
        let projectId = null;
        let mostRecentTimestamp = 0;
        
        for (const [timestamp, pendingProjectId] of this.pendingTerminalProjects.entries()) {
            if (timestamp > mostRecentTimestamp) {
                mostRecentTimestamp = timestamp;
                projectId = pendingProjectId;
            }
        }
        
        if (projectId) {
            this.associateTerminalWithProject(terminalId, projectId);
            this.pendingTerminalProjects.delete(mostRecentTimestamp);
        }
        
        this.updateTerminalTabs();
        this.setActiveTerminal(terminalId);
        this.updateSessionSidebar();
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
        
        // Clean up project associations
        this.removeTerminalFromProject(terminalId);
        
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
        this.updateSessionSidebar();
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
            } else {
                // Show notification for inactive terminals
                this.showTabNotification(terminalId);
            }
            
            // Update sidebar to reflect activity status changes
            this.updateSessionSidebar();
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
    
    handleTerminalMessage(terminalId, sourceTerminalId, data) {
        console.log('Inter-terminal message:', { terminalId, sourceTerminalId, data });
        
        const terminal = this.terminals.get(terminalId);
        const sourceTerminal = this.terminals.get(sourceTerminalId);
        
        if (terminal && sourceTerminal) {
            const message = `\n[Message from ${sourceTerminal.name}]: ${data}\n`;
            terminal.output += message;
            
            // If this is the active terminal, update the display
            if (terminalId === this.activeTerminalId) {
                this.appendToTerminal(message);
            }
            
            // Visual notification for non-active terminals
            if (terminalId !== this.activeTerminalId) {
                this.showTabNotification(terminalId);
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
    
    // Command routing message handlers
    handleCommandResult(terminalId, data) {
        if (this.commandRoutingManager) {
            this.commandRoutingManager.handleCommandResult(terminalId, data);
        }
    }
    
    handleCommandError(terminalId, data) {
        if (this.commandRoutingManager) {
            this.commandRoutingManager.handleCommandError(terminalId, data);
        }
    }
    
    handleCommandParsed(data) {
        // Handle command parsing result
        console.log('Command parsed:', data);
        
        // If there's a pending callback, resolve it
        if (this.tempCallbacks && data.callbackId) {
            const callback = this.tempCallbacks.get(data.callbackId);
            if (callback) {
                callback.resolve(data.commandInfo);
                this.tempCallbacks.delete(data.callbackId);
            }
        }
    }
    
    handleCommandHistoryResult(terminalId, data) {
        // Handle command history result
        console.log('Command history result:', terminalId, data);
        
        if (this.commandRoutingManager && data.history) {
            // Update local history with backend data
            this.commandRoutingManager.commandHistory.set(terminalId, data.history.commands || []);
            this.commandRoutingManager.updateCommandHistoryUI(terminalId);
        }
    }
    
    handleToolHistoryResult(data) {
        // Handle tool history result
        console.log('Tool history result:', data);
        
        if (this.commandRoutingManager && data.history && data.tool) {
            // Update local tool history with backend data
            this.commandRoutingManager.toolHistories.set(data.tool, data.history.commands || []);
            this.commandRoutingManager.updateToolHistoryUI(data.tool);
        }
    }
    
    handleToolHistoriesResult(data) {
        // Handle all tool histories result
        console.log('Tool histories result:', data);
        
        if (this.commandRoutingManager && data.histories) {
            // Update all tool histories
            data.histories.forEach(history => {
                if (history.tool !== 'terminal') {
                    this.commandRoutingManager.toolHistories.set(history.tool, history.commands || []);
                    this.commandRoutingManager.updateToolHistoryUI(history.tool);
                }
            });
        }
    }
    
    handleAgentOutput(terminalId, data) {
        if (this.commandRoutingManager) {
            this.commandRoutingManager.handleAgentOutput(terminalId, data);
        }
    }
    
    handleCommandRouted(terminalId, data) {
        if (this.commandRoutingManager) {
            this.commandRoutingManager.handleCommandRouted(terminalId, data);
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
                
                // Initialize project switcher after potential reconnection
                this.updateProjectSwitcherStats();
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
    createNewTerminalTab(name = 'Terminal', color = null, projectSettings = null) {
        const tabId = 'tab-' + Date.now();
        const panelId = 'panel-' + Date.now();
        
        // Get terminal settings from project or use defaults
        const terminalSettings = projectSettings?.terminalSettings || {
            cols: 80,
            rows: 24,
            fontSize: 14
        };
        
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
        
        // Clear existing tabs (but preserve new terminal button)
        const newTerminalBtn = tabsContainer.querySelector('#new-terminal-btn');
        tabsContainer.innerHTML = '';
        
        // Create tabs for each terminal
        this.terminals.forEach((terminal, terminalId) => {
            this.createTabElement(terminalId, terminal.name, terminal.color);
        });
        
        // Re-add new terminal button
        if (newTerminalBtn) {
            tabsContainer.appendChild(newTerminalBtn);
        }
        
        // Create terminal panels container if needed
        this.ensureTerminalPanels();
        
        // Update terminal header info
        this.updateTerminalHeaderInfo();
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
                tab.classList.remove('has-notification'); // Clear notification when switching to tab
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
        
        // Update sidebar to reflect active session
        this.updateSessionSidebar();
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
    
    createNewTerminal(name, color, projectSettings = null, projectId = null) {
        if (!name) {
            name = `Terminal ${this.terminalCounter++}`;
        }
        
        if (!color) {
            const colors = ['blue', 'green', 'purple', 'orange', 'red', 'pink', 'indigo', 'teal'];
            const usedColors = Array.from(this.terminals.values()).map(t => t.color);
            color = colors.find(c => !usedColors.includes(c)) || colors[0];
        }
        
        // Include project settings if available
        const terminalData = { name, color };
        if (projectSettings) {
            terminalData.projectSettings = projectSettings;
        }
        
        const timestamp = Date.now();
        
        // Store project association for when terminal is created
        if (projectId) {
            this.pendingTerminalProjects.set(timestamp, projectId);
        }
        
        this.sendMessage({
            type: 'terminal_create',
            data: terminalData,
            timestamp: timestamp
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
    
    // Tab navigation methods
    switchToNextTab() {
        const terminalIds = Array.from(this.terminals.keys());
        if (terminalIds.length <= 1) return;
        
        const currentIndex = terminalIds.indexOf(this.activeTerminalId);
        const nextIndex = (currentIndex + 1) % terminalIds.length;
        this.setActiveTerminal(terminalIds[nextIndex]);
    }
    
    switchToPrevTab() {
        const terminalIds = Array.from(this.terminals.keys());
        if (terminalIds.length <= 1) return;
        
        const currentIndex = terminalIds.indexOf(this.activeTerminalId);
        const prevIndex = currentIndex <= 0 ? terminalIds.length - 1 : currentIndex - 1;
        this.setActiveTerminal(terminalIds[prevIndex]);
    }
    
    updateTerminalHeaderInfo() {
        const headerInfo = document.getElementById('terminal-header-info');
        if (!headerInfo) return;
        
        // Get active terminal project
        const activeTerminal = this.terminals.get(this.activeTerminalId);
        const activeProjectId = activeTerminal ? this.terminalProjects.get(this.activeTerminalId) : null;
        const activeProject = activeProjectId ? this.projects.get(activeProjectId) : null;
        
        if (!activeProject || !activeProject.gitRepo) {
            headerInfo.classList.remove('show');
            return;
        }
        
        const gitRepo = activeProject.gitRepo;
        const statusBadge = this.createGitStatusBadge(gitRepo.status);
        const branchInfo = this.createGitBranchInfo(gitRepo);
        const statsHtml = this.createTerminalGitStatsHtml(gitRepo.stats);
        
        headerInfo.innerHTML = `
            <div class="terminal-repo-info">
                <div class="terminal-repo-path">${this.truncatePath(activeProject.path)}</div>
                <div class="terminal-git-status">
                    ${branchInfo}
                    ${statusBadge}
                    ${statsHtml}
                </div>
            </div>
            <div class="terminal-repo-actions">
                <button class="refresh-git-btn" title="Refresh Git Status" data-project-id="${activeProject.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"/>
                        <polyline points="1 20 1 14 7 14"/>
                        <path d="m3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                </button>
            </div>
        `;
        
        headerInfo.classList.add('show');
        
        // Add event listener for refresh button
        const refreshBtn = headerInfo.querySelector('.refresh-git-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const projectId = refreshBtn.dataset.projectId;
                if (projectId) {
                    this.refreshProjectGitStatus(projectId);
                }
            });
        }
    }
    
    createTerminalGitStatsHtml(stats) {
        if (!stats) return '';
        
        const activeStats = [];
        if (stats.ahead > 0) activeStats.push(`↑${stats.ahead}`);
        if (stats.behind > 0) activeStats.push(`↓${stats.behind}`);
        if (stats.staged > 0) activeStats.push(`+${stats.staged}`);
        if (stats.modified > 0) activeStats.push(`~${stats.modified}`);
        if (stats.untracked > 0) activeStats.push(`?${stats.untracked}`);
        
        if (activeStats.length === 0) return '';
        
        return `<div class="terminal-git-stats">${activeStats.join(' ')}</div>`;
    }
    
    // Project management methods
    async loadUserProjects() {
        if (!this.currentUuid) return;
        
        try {
            const response = await fetch(`http://localhost:3001/projects/${this.currentUuid}`);
            if (response.ok) {
                const data = await response.json();
                this.updateProjectsDisplay(data.projects);
                // Update project switcher after loading projects
                this.updateProjectSwitcherStats();
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
        }
    }
    
    updateProjectsDisplay(projects) {
        this.projects.clear();
        
        // Store projects
        projects.forEach(project => {
            this.projects.set(project.id, project);
        });
        
        // Update projects grid
        const projectsGrid = this.projectsGrid;
        if (!projectsGrid) return;
        
        projectsGrid.innerHTML = '';
        
        // Always add "All Terminals" option at the beginning
        const allTerminalsCard = document.createElement('div');
        allTerminalsCard.className = 'project-card all-terminals-card';
        allTerminalsCard.innerHTML = `
            <div class="project-icon">🖥️</div>
            <h3>All Terminals</h3>
            <p>Show all terminals across projects</p>
            <div class="project-actions">
                <button class="project-open-btn">View All</button>
            </div>
        `;
        
        allTerminalsCard.querySelector('.project-open-btn').addEventListener('click', () => {
            this.switchToAllTerminals();
        });
        
        projectsGrid.appendChild(allTerminalsCard);
        
        if (projects.length === 0) {
            // Show empty state
            projectsGrid.innerHTML += `
                <div class="project-card placeholder-card">
                    <div class="project-icon">📁</div>
                    <h3>No Projects Yet</h3>
                    <p>Create your first project to get started with AI-powered coding</p>
                    <button class="create-first-project-btn">Create Project</button>
                </div>
            `;
            
            // Attach event listener to the button
            const createBtn = projectsGrid.querySelector('.create-first-project-btn');
            if (createBtn) {
                createBtn.addEventListener('click', () => this.showCreateProjectDialog());
            }
        } else {
            // Show existing projects
            projects.forEach(project => {
                const projectCard = this.createProjectCard(project);
                projectsGrid.appendChild(projectCard);
            });
        }
    }
    
    createProjectCard(project) {
        const card = document.createElement('div');
        card.className = `project-card color-${project.color}`;
        card.dataset.projectId = project.id;
        
        const lastAccessed = new Date(project.lastAccessedAt).toLocaleDateString();
        const projectIcon = this.getProjectIcon(project);
        const gitStatusHtml = this.createGitStatusHtml(project.gitRepo);
        
        card.innerHTML = `
            <button class="project-status-refresh" title="Refresh Git Status">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="m3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
            </button>
            <div class="project-icon">${projectIcon}</div>
            <h3>${project.name}</h3>
            <p>${project.description || 'No description'}</p>
            <div class="project-meta">
                <span class="project-path">${this.truncatePath(project.path)}</span>
                <span class="project-date">Last used: ${lastAccessed}</span>
            </div>
            ${gitStatusHtml}
            <div class="project-actions">
                <button class="project-open-btn" title="Open Project">Open</button>
                <button class="project-edit-btn" title="Edit Project">✏️</button>
                <button class="project-delete-btn" title="Delete Project">🗑️</button>
            </div>
        `;
        
        // Attach event listeners
        const openBtn = card.querySelector('.project-open-btn');
        const editBtn = card.querySelector('.project-edit-btn');
        const deleteBtn = card.querySelector('.project-delete-btn');
        const refreshBtn = card.querySelector('.project-status-refresh');
        
        openBtn.addEventListener('click', () => this.openProject(project.id));
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editProject(project.id);
        });
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteProject(project.id);
        });
        refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.refreshProjectGitStatus(project.id);
        });
        
        return card;
    }
    
    getProjectIcon(project) {
        if (project.type === 'git' && project.gitRepo) {
            // Different icons based on git status
            switch (project.gitRepo.status) {
                case 'clean': return '📗';
                case 'dirty': return '📙';
                case 'ahead': return '📘';
                case 'behind': return '📕';
                case 'ahead-behind': return '📓';
                default: return '📂';
            }
        }
        return project.type === 'git' ? '📂' : '📁';
    }
    
    createGitStatusHtml(gitRepo) {
        if (!gitRepo) {
            return '';
        }
        
        const statusBadge = this.createGitStatusBadge(gitRepo.status);
        const branchInfo = this.createGitBranchInfo(gitRepo);
        const statsInfo = this.createGitStatsInfo(gitRepo.stats);
        const commitInfo = this.createGitCommitInfo(gitRepo.lastCommit);
        
        return `
            <div class="project-git-info">
                <div class="project-git-status">
                    ${branchInfo}
                    ${statusBadge}
                </div>
                ${statsInfo}
                ${commitInfo}
            </div>
        `;
    }
    
    createGitStatusBadge(status) {
        const statusText = {
            'clean': 'Clean',
            'dirty': 'Changes',
            'ahead': 'Ahead',
            'behind': 'Behind',
            'ahead-behind': 'Diverged'
        }[status] || 'Unknown';
        
        return `
            <div class="git-status-badge ${status}">
                <div class="git-status-icon ${status}"></div>
                <span>${statusText}</span>
            </div>
        `;
    }
    
    createGitBranchInfo(gitRepo) {
        return `
            <div class="git-branch">
                <svg class="git-branch-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="6" y1="3" x2="6" y2="15"></line>
                    <circle cx="18" cy="6" r="3"></circle>
                    <circle cx="6" cy="18" r="3"></circle>
                    <path d="m18 9a9 9 0 0 1-9 9"></path>
                </svg>
                <span>${gitRepo.branch}</span>
            </div>
        `;
    }
    
    createGitStatsInfo(stats) {
        if (!stats) {
            return '';
        }
        
        const statsItems = [];
        
        if (stats.ahead > 0) {
            statsItems.push(`<div class="git-stat ahead"><span class="git-stat-number">${stats.ahead}</span> ahead</div>`);
        }
        if (stats.behind > 0) {
            statsItems.push(`<div class="git-stat behind"><span class="git-stat-number">${stats.behind}</span> behind</div>`);
        }
        if (stats.staged > 0) {
            statsItems.push(`<div class="git-stat staged"><span class="git-stat-number">${stats.staged}</span> staged</div>`);
        }
        if (stats.modified > 0) {
            statsItems.push(`<div class="git-stat modified"><span class="git-stat-number">${stats.modified}</span> modified</div>`);
        }
        if (stats.untracked > 0) {
            statsItems.push(`<div class="git-stat untracked"><span class="git-stat-number">${stats.untracked}</span> untracked</div>`);
        }
        if (stats.conflicts > 0) {
            statsItems.push(`<div class="git-stat conflicts"><span class="git-stat-number">${stats.conflicts}</span> conflicts</div>`);
        }
        
        if (statsItems.length === 0) {
            return '';
        }
        
        return `
            <div class="git-stats">
                ${statsItems.join('')}
            </div>
        `;
    }
    
    createGitCommitInfo(lastCommit) {
        if (!lastCommit) {
            return '';
        }
        
        const commitDate = new Date(lastCommit.date).toLocaleDateString();
        
        return `
            <div class="git-commit-info">
                <div class="git-commit-hash">${lastCommit.hash}</div>
                <div class="git-commit-message">${lastCommit.message}</div>
                <div class="git-commit-meta">
                    <span>${lastCommit.author}</span>
                    <span>${commitDate}</span>
                </div>
            </div>
        `;
    }
    
    truncatePath(path) {
        if (path.length <= 40) return path;
        return '...' + path.slice(-37);
    }
    
    showCreateProjectDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Create New Project</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="create-project-form">
                        <div class="form-group">
                            <label for="project-name">Project Name *</label>
                            <input type="text" id="project-name" required placeholder="My Project">
                        </div>
                        <div class="form-group">
                            <label for="project-type">Project Type *</label>
                            <select id="project-type" required>
                                <option value="local">Local Directory</option>
                                <option value="open-git">Open Existing Git Repository</option>
                                <option value="new-git">New Git Repository</option>
                                <option value="clone-git">Clone Git Repository</option>
                            </select>
                        </div>
                        
                        <div class="form-group" id="project-path-group">
                            <label for="project-path">Project Path *</label>
                            <div class="input-with-button">
                                <input type="text" id="project-path" required placeholder="/path/to/project">
                                <button type="button" id="browse-path-btn" class="browse-btn">Browse</button>
                                <button type="button" id="scan-repos-btn" class="scan-btn" title="Scan for Git repositories">🔍</button>
                            </div>
                        </div>
                        
                        <div class="form-group" id="git-url-group" style="display: none;">
                            <label for="git-url">Git Repository URL *</label>
                            <input type="text" id="git-url" placeholder="https://github.com/user/repo.git">
                            <small>For cloning an existing repository</small>
                        </div>
                        
                        <div class="form-group" id="git-branch-group" style="display: none;">
                            <label for="git-branch">Branch (Optional)</label>
                            <input type="text" id="git-branch" placeholder="main">
                            <small>Defaults to repository default branch</small>
                        </div>
                        <div class="form-group">
                            <label for="project-description">Description</label>
                            <textarea id="project-description" placeholder="Optional project description"></textarea>
                        </div>
                        <div class="form-group">
                            <label for="project-color">Color</label>
                            <select id="project-color">
                                <option value="blue">Blue</option>
                                <option value="green">Green</option>
                                <option value="purple">Purple</option>
                                <option value="orange">Orange</option>
                                <option value="red">Red</option>
                                <option value="pink">Pink</option>
                                <option value="indigo">Indigo</option>
                                <option value="teal">Teal</option>
                            </select>
                        </div>
                        
                        <details class="settings-section">
                            <summary>Project Settings (Optional)</summary>
                            <div class="settings-content">
                                <div class="form-group">
                                    <label for="project-shell">Default Shell</label>
                                    <select id="project-shell">
                                        <option value="">System Default</option>
                                        <option value="/bin/bash">Bash</option>
                                        <option value="/bin/zsh">Zsh</option>
                                        <option value="/bin/fish">Fish</option>
                                        <option value="powershell">PowerShell</option>
                                        <option value="cmd">Command Prompt</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="project-working-dir">Working Directory</label>
                                    <input type="text" id="project-working-dir" placeholder="Defaults to project path">
                                </div>
                                <div class="form-group">
                                    <label for="project-env-vars">Environment Variables</label>
                                    <textarea id="project-env-vars" placeholder="KEY1=value1&#10;KEY2=value2&#10;(one per line)"></textarea>
                                </div>
                                <div class="terminal-settings">
                                    <h4>Terminal Settings</h4>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label for="terminal-cols">Columns</label>
                                            <input type="number" id="terminal-cols" value="80" min="40" max="200">
                                        </div>
                                        <div class="form-group">
                                            <label for="terminal-rows">Rows</label>
                                            <input type="number" id="terminal-rows" value="24" min="10" max="60">
                                        </div>
                                        <div class="form-group">
                                            <label for="terminal-font-size">Font Size</label>
                                            <input type="number" id="terminal-font-size" value="14" min="8" max="24">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </details>
                        <div class="form-actions">
                            <button type="submit" class="primary-btn">Create Project</button>
                            <button type="button" class="secondary-btn cancel-btn">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        dialog.classList.add('show');
        
        // Event listeners
        const form = dialog.querySelector('#create-project-form');
        const closeBtn = dialog.querySelector('.modal-close');
        const cancelBtn = dialog.querySelector('.cancel-btn');
        const projectTypeSelect = dialog.querySelector('#project-type');
        const pathGroup = dialog.querySelector('#project-path-group');
        const gitUrlGroup = dialog.querySelector('#git-url-group');
        const gitBranchGroup = dialog.querySelector('#git-branch-group');
        const pathInput = dialog.querySelector('#project-path');
        const gitUrlInput = dialog.querySelector('#git-url');
        const browseBtn = dialog.querySelector('#browse-path-btn');
        const scanBtn = dialog.querySelector('#scan-repos-btn');
        
        const closeDialog = () => {
            dialog.remove();
        };
        
        // Handle project type changes
        const updateFormFields = () => {
            const projectType = projectTypeSelect.value;
            
            if (projectType === 'clone-git') {
                pathGroup.style.display = 'block';
                gitUrlGroup.style.display = 'block';
                gitBranchGroup.style.display = 'block';
                pathInput.placeholder = '/local/path/to/clone/to';
                pathInput.setAttribute('required', 'required');
                gitUrlInput.setAttribute('required', 'required');
            } else if (projectType === 'new-git') {
                pathGroup.style.display = 'block';
                gitUrlGroup.style.display = 'none';
                gitBranchGroup.style.display = 'none';
                pathInput.placeholder = '/path/to/new/git/repo';
                pathInput.setAttribute('required', 'required');
                gitUrlInput.removeAttribute('required');
            } else if (projectType === 'open-git') {
                pathGroup.style.display = 'block';
                gitUrlGroup.style.display = 'none';
                gitBranchGroup.style.display = 'none';
                pathInput.placeholder = '/path/to/existing/git/repository';
                pathInput.setAttribute('required', 'required');
                gitUrlInput.removeAttribute('required');
            } else {
                pathGroup.style.display = 'block';
                gitUrlGroup.style.display = 'none';
                gitBranchGroup.style.display = 'none';
                pathInput.placeholder = '/path/to/existing/directory';
                pathInput.setAttribute('required', 'required');
                gitUrlInput.removeAttribute('required');
            }
        };
        
        projectTypeSelect.addEventListener('change', updateFormFields);
        updateFormFields(); // Initialize
        
        // Handle browse button
        browseBtn.addEventListener('click', () => {
            this.showRepositoryBrowser(pathInput, projectTypeSelect.value);
        });
        
        // Handle scan button
        scanBtn.addEventListener('click', () => {
            this.showGitScanner(pathInput);
        });
        
        closeBtn.addEventListener('click', closeDialog);
        cancelBtn.addEventListener('click', closeDialog);
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) closeDialog();
        });
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            
            // Parse environment variables
            const envVarsText = dialog.querySelector('#project-env-vars').value;
            const environmentVariables = {};
            if (envVarsText.trim()) {
                envVarsText.split('\n').forEach(line => {
                    const [key, ...valueParts] = line.split('=');
                    if (key && valueParts.length > 0) {
                        environmentVariables[key.trim()] = valueParts.join('=').trim();
                    }
                });
            }
            
            const projectData = {
                name: dialog.querySelector('#project-name').value,
                path: dialog.querySelector('#project-path').value,
                description: dialog.querySelector('#project-description').value,
                color: dialog.querySelector('#project-color').value,
                type: dialog.querySelector('#project-type').value,
                gitUrl: dialog.querySelector('#git-url')?.value || undefined,
                gitBranch: dialog.querySelector('#git-branch')?.value || undefined,
                settings: {
                    defaultShell: dialog.querySelector('#project-shell').value || undefined,
                    workingDirectory: dialog.querySelector('#project-working-dir').value || undefined,
                    environmentVariables,
                    terminalSettings: {
                        cols: parseInt(dialog.querySelector('#terminal-cols').value) || 80,
                        rows: parseInt(dialog.querySelector('#terminal-rows').value) || 24,
                        fontSize: parseInt(dialog.querySelector('#terminal-font-size').value) || 14
                    }
                }
            };
            
            try {
                await this.createProject(projectData);
                closeDialog();
            } catch (error) {
                alert('Failed to create project: ' + error.message);
            }
        });
        
        // Focus name input
        dialog.querySelector('#project-name').focus();
    }
    
    showRepositoryBrowser(pathInput, projectType) {
        const browserDialog = document.createElement('div');
        browserDialog.className = 'modal';
        browserDialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Browse for ${projectType === 'open-git' ? 'Git Repository' : 'Directory'}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="repository-browser">
                        <div class="browser-toolbar">
                            <input type="text" id="browser-path" placeholder="/path/to/browse" value="${process.env.HOME || '/'}">
                            <button id="browser-refresh" class="secondary-btn">Refresh</button>
                        </div>
                        <div class="browser-content" id="browser-content">
                            <div class="loading">Loading directories...</div>
                        </div>
                        <div class="browser-actions">
                            <button type="button" class="primary-btn" id="select-directory">Select This Directory</button>
                            <button type="button" class="secondary-btn" id="cancel-browse">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(browserDialog);
        browserDialog.classList.add('show');
        
        const closeBrowser = () => {
            browserDialog.remove();
        };
        
        const browserPath = browserDialog.querySelector('#browser-path');
        const browserContent = browserDialog.querySelector('#browser-content');
        const refreshBtn = browserDialog.querySelector('#browser-refresh');
        const selectBtn = browserDialog.querySelector('#select-directory');
        const cancelBtn = browserDialog.querySelector('#cancel-browse');
        const closeBtn = browserDialog.querySelector('.modal-close');
        
        closeBtn.addEventListener('click', closeBrowser);
        cancelBtn.addEventListener('click', closeBrowser);
        
        selectBtn.addEventListener('click', () => {
            const selectedPath = browserPath.value;
            pathInput.value = selectedPath;
            closeBrowser();
        });
        
        const loadDirectory = async (path) => {
            try {
                browserContent.innerHTML = '<div class="loading">Loading...</div>';
                const response = await fetch(`http://localhost:3001/browse-directory?path=${encodeURIComponent(path)}&type=${projectType}`);
                const data = await response.json();
                
                if (data.success) {
                    this.renderDirectoryListing(browserContent, data.items, path, projectType);
                    browserPath.value = path;
                } else {
                    browserContent.innerHTML = `<div class="error">Error: ${data.error}</div>`;
                }
            } catch (error) {
                browserContent.innerHTML = `<div class="error">Failed to load directory: ${error.message}</div>`;
            }
        };
        
        refreshBtn.addEventListener('click', () => {
            loadDirectory(browserPath.value);
        });
        
        browserPath.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                loadDirectory(browserPath.value);
            }
        });
        
        // Load initial directory
        loadDirectory(browserPath.value);
    }
    
    renderDirectoryListing(container, items, currentPath, projectType) {
        container.innerHTML = '';
        
        // Add parent directory link if not at root
        if (currentPath !== '/') {
            const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
            const parentItem = document.createElement('div');
            parentItem.className = 'directory-item parent-dir';
            parentItem.innerHTML = `
                <span class="item-icon">⬆️</span>
                <span class="item-name">..</span>
                <span class="item-type">Parent Directory</span>
            `;
            parentItem.addEventListener('click', () => {
                const browserPath = document.querySelector('#browser-path');
                browserPath.value = parentPath;
                this.loadDirectory(parentPath);
            });
            container.appendChild(parentItem);
        }
        
        // Group directories and files
        const directories = items.filter(item => item.type === 'directory');
        const files = items.filter(item => item.type === 'file');
        
        // Show directories first
        directories.forEach(item => {
            const dirItem = document.createElement('div');
            dirItem.className = `directory-item ${item.isGitRepo ? 'git-repo' : ''}`;
            
            let itemInfo = item.isGitRepo ? 'Git Repository' : 'Directory';
            
            // Add Git status info if available
            if (item.gitInfo) {
                const statusIcon = item.gitInfo.status === 'dirty' ? '⚠️' : '✅';
                const remoteIcon = item.gitInfo.hasRemote ? '☁️' : '💾';
                itemInfo = `${statusIcon} ${item.gitInfo.branch} ${remoteIcon}`;
            }
            
            dirItem.innerHTML = `
                <span class="item-icon">${item.isGitRepo ? '📂' : '📁'}</span>
                <span class="item-name">${item.name}</span>
                <span class="item-type">${itemInfo}</span>
            `;
            
            dirItem.addEventListener('click', () => {
                if (projectType === 'open-git' && item.isGitRepo) {
                    // Select this git repository
                    const pathInput = document.querySelector('#project-path');
                    const browserPath = document.querySelector('#browser-path');
                    pathInput.value = item.path;
                    browserPath.value = item.path;
                } else {
                    // Navigate into directory
                    const browserPath = document.querySelector('#browser-path');
                    browserPath.value = item.path;
                    this.loadDirectory(item.path);
                }
            });
            
            container.appendChild(dirItem);
        });
        
        // Show relevant files for context
        if (projectType === 'open-git') {
            const gitFiles = files.filter(file => 
                file.name === '.gitignore' || 
                file.name === 'README.md' || 
                file.name === 'package.json' ||
                file.name === 'Cargo.toml'
            );
            
            gitFiles.forEach(item => {
                const fileItem = document.createElement('div');
                fileItem.className = 'directory-item file-item';
                fileItem.innerHTML = `
                    <span class="item-icon">📄</span>
                    <span class="item-name">${item.name}</span>
                    <span class="item-type">File</span>
                `;
                container.appendChild(fileItem);
            });
        }
        
        if (container.children.length === 0) {
            container.innerHTML = '<div class="empty-directory">Empty directory</div>';
        }
    }
    
    async loadDirectory(path) {
        const browserContent = document.querySelector('#browser-content');
        const projectType = document.querySelector('#project-type').value;
        
        try {
            browserContent.innerHTML = '<div class="loading">Loading...</div>';
            const response = await fetch(`http://localhost:3001/browse-directory?path=${encodeURIComponent(path)}&type=${projectType}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderDirectoryListing(browserContent, data.items, path, projectType);
            } else {
                browserContent.innerHTML = `<div class="error">Error: ${data.error}</div>`;
            }
        } catch (error) {
            browserContent.innerHTML = `<div class="error">Failed to load directory: ${error.message}</div>`;
        }
    }
    
    showGitScanner(pathInput) {
        const scanDialog = document.createElement('div');
        scanDialog.className = 'modal';
        scanDialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Scan for Git Repositories</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="git-scanner">
                        <div class="scanner-input">
                            <label>Scan Directory:</label>
                            <div class="input-with-button">
                                <input type="text" id="scan-path" placeholder="/path/to/scan" value="${process.env.HOME || '/'}">
                                <button id="start-scan" class="primary-btn">Scan</button>
                            </div>
                            <small>Will scan up to 3 levels deep for Git repositories</small>
                        </div>
                        <div class="scan-results" id="scan-results">
                            <div class="empty-scan">Enter a path and click Scan to find Git repositories</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(scanDialog);
        scanDialog.classList.add('show');
        
        const closeScanner = () => {
            scanDialog.remove();
        };
        
        const scanPath = scanDialog.querySelector('#scan-path');
        const startScanBtn = scanDialog.querySelector('#start-scan');
        const scanResults = scanDialog.querySelector('#scan-results');
        const closeBtn = scanDialog.querySelector('.modal-close');
        
        closeBtn.addEventListener('click', closeScanner);
        scanDialog.addEventListener('click', (e) => {
            if (e.target === scanDialog) closeScanner();
        });
        
        const performScan = async () => {
            try {
                scanResults.innerHTML = '<div class="loading">Scanning for Git repositories...</div>';
                const response = await fetch(`http://localhost:3001/scan-git-repos?path=${encodeURIComponent(scanPath.value)}&depth=3`);
                const data = await response.json();
                
                if (data.success) {
                    this.renderScanResults(scanResults, data.repositories, pathInput, closeScanner);
                } else {
                    scanResults.innerHTML = `<div class="error">Error: ${data.error}</div>`;
                }
            } catch (error) {
                scanResults.innerHTML = `<div class="error">Failed to scan: ${error.message}</div>`;
            }
        };
        
        startScanBtn.addEventListener('click', performScan);
        scanPath.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performScan();
        });
    }
    
    renderScanResults(container, repositories, pathInput, closeCallback) {
        if (repositories.length === 0) {
            container.innerHTML = '<div class="empty-scan">No Git repositories found in the specified directory</div>';
            return;
        }
        
        container.innerHTML = `
            <div class="scan-header">Found ${repositories.length} Git repositories:</div>
            <div class="scan-list"></div>
        `;
        
        const listContainer = container.querySelector('.scan-list');
        
        repositories.forEach(repo => {
            const repoItem = document.createElement('div');
            repoItem.className = 'scan-item';
            
            const statusIcon = repo.gitInfo.status === 'dirty' ? '⚠️' : '✅';
            const remoteIcon = repo.gitInfo.hasRemote ? '☁️' : '💾';
            
            repoItem.innerHTML = `
                <div class="scan-item-info">
                    <div class="scan-item-name">📂 ${repo.name}</div>
                    <div class="scan-item-path">${repo.path}</div>
                    <div class="scan-item-status">
                        ${statusIcon} ${repo.gitInfo.branch} ${remoteIcon}
                        ${repo.gitInfo.url ? `<span class="scan-item-url">${repo.gitInfo.url}</span>` : ''}
                    </div>
                </div>
                <button class="scan-select-btn">Select</button>
            `;
            
            const selectBtn = repoItem.querySelector('.scan-select-btn');
            selectBtn.addEventListener('click', () => {
                pathInput.value = repo.path;
                // Also update project type to open-git
                const projectTypeSelect = document.querySelector('#project-type');
                if (projectTypeSelect) {
                    projectTypeSelect.value = 'open-git';
                    projectTypeSelect.dispatchEvent(new Event('change'));
                }
                closeCallback();
            });
            
            listContainer.appendChild(repoItem);
        });
    }
    
    async createProject(projectData) {
        if (!this.currentUuid) throw new Error('No UUID available');
        
        const response = await fetch(`http://localhost:3001/projects/${this.currentUuid}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(projectData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create project');
        }
        
        const result = await response.json();
        
        // Reload projects
        await this.loadUserProjects();
        
        return result.project;
    }
    
    async openProject(projectId) {
        // Access the project to update last accessed time
        try {
            await fetch(`http://localhost:3001/projects/${this.currentUuid}/${projectId}/access`, {
                method: 'POST'
            });
            
            this.activeProjectId = projectId;
            
            // Get project data
            const project = this.projects.get(projectId);
            if (project) {
                console.log(`Opened project: ${project.name}`);
                
                // Switch to project workspace
                this.switchToProject(projectId);
                
                // Create a new terminal with project settings if none exist
                const projectTerminals = this.projectTerminals.get(projectId);
                if (!projectTerminals || projectTerminals.size === 0) {
                    this.createNewTerminal(`${project.name}`, project.color, project.settings, projectId);
                } else {
                    // Switch to project's existing terminals
                    this.showProjectTerminals(projectId);
                }
                
                // You could show a toast notification here
                this.showSuccessMessage(`Opened project: ${project.name}`);
            }
            
            // Reload projects to update last accessed time
            await this.loadUserProjects();
            
        } catch (error) {
            console.error('Failed to open project:', error);
            this.showErrorMessage('Failed to open project');
        }
    }
    
    async editProject(projectId) {
        const project = this.projects.get(projectId);
        if (!project) return;
        
        const dialog = document.createElement('div');
        dialog.className = 'modal';
        
        // Convert environment variables to text
        const envVarsText = Object.entries(project.settings.environmentVariables || {})
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        dialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Edit Project</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="edit-project-form">
                        <div class="form-group">
                            <label for="edit-project-name">Project Name *</label>
                            <input type="text" id="edit-project-name" value="${project.name}" required>
                        </div>
                        <div class="form-group">
                            <label for="edit-project-description">Description</label>
                            <textarea id="edit-project-description">${project.description || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label for="edit-project-color">Color</label>
                            <select id="edit-project-color">
                                <option value="blue" ${project.color === 'blue' ? 'selected' : ''}>Blue</option>
                                <option value="green" ${project.color === 'green' ? 'selected' : ''}>Green</option>
                                <option value="purple" ${project.color === 'purple' ? 'selected' : ''}>Purple</option>
                                <option value="orange" ${project.color === 'orange' ? 'selected' : ''}>Orange</option>
                                <option value="red" ${project.color === 'red' ? 'selected' : ''}>Red</option>
                                <option value="pink" ${project.color === 'pink' ? 'selected' : ''}>Pink</option>
                                <option value="indigo" ${project.color === 'indigo' ? 'selected' : ''}>Indigo</option>
                                <option value="teal" ${project.color === 'teal' ? 'selected' : ''}>Teal</option>
                            </select>
                        </div>
                        
                        <details class="settings-section" open>
                            <summary>Project Settings</summary>
                            <div class="settings-content">
                                <div class="form-group">
                                    <label for="edit-project-shell">Default Shell</label>
                                    <select id="edit-project-shell">
                                        <option value="" ${!project.settings.defaultShell ? 'selected' : ''}>System Default</option>
                                        <option value="/bin/bash" ${project.settings.defaultShell === '/bin/bash' ? 'selected' : ''}>Bash</option>
                                        <option value="/bin/zsh" ${project.settings.defaultShell === '/bin/zsh' ? 'selected' : ''}>Zsh</option>
                                        <option value="/bin/fish" ${project.settings.defaultShell === '/bin/fish' ? 'selected' : ''}>Fish</option>
                                        <option value="powershell" ${project.settings.defaultShell === 'powershell' ? 'selected' : ''}>PowerShell</option>
                                        <option value="cmd" ${project.settings.defaultShell === 'cmd' ? 'selected' : ''}>Command Prompt</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="edit-project-working-dir">Working Directory</label>
                                    <input type="text" id="edit-project-working-dir" value="${project.settings.workingDirectory || ''}" placeholder="Defaults to project path">
                                </div>
                                <div class="form-group">
                                    <label for="edit-project-env-vars">Environment Variables</label>
                                    <textarea id="edit-project-env-vars" placeholder="KEY1=value1&#10;KEY2=value2&#10;(one per line)">${envVarsText}</textarea>
                                </div>
                                <div class="terminal-settings">
                                    <h4>Terminal Settings</h4>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label for="edit-terminal-cols">Columns</label>
                                            <input type="number" id="edit-terminal-cols" value="${project.settings.terminalSettings?.cols || 80}" min="40" max="200">
                                        </div>
                                        <div class="form-group">
                                            <label for="edit-terminal-rows">Rows</label>
                                            <input type="number" id="edit-terminal-rows" value="${project.settings.terminalSettings?.rows || 24}" min="10" max="60">
                                        </div>
                                        <div class="form-group">
                                            <label for="edit-terminal-font-size">Font Size</label>
                                            <input type="number" id="edit-terminal-font-size" value="${project.settings.terminalSettings?.fontSize || 14}" min="8" max="24">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </details>
                        <div class="form-actions">
                            <button type="submit" class="primary-btn">Save Changes</button>
                            <button type="button" class="secondary-btn cancel-btn">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        dialog.classList.add('show');
        
        // Event listeners
        const form = dialog.querySelector('#edit-project-form');
        const closeBtn = dialog.querySelector('.modal-close');
        const cancelBtn = dialog.querySelector('.cancel-btn');
        
        const closeDialog = () => {
            dialog.remove();
        };
        
        closeBtn.addEventListener('click', closeDialog);
        cancelBtn.addEventListener('click', closeDialog);
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) closeDialog();
        });
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Parse environment variables
            const envVarsText = dialog.querySelector('#edit-project-env-vars').value;
            const environmentVariables = {};
            if (envVarsText.trim()) {
                envVarsText.split('\n').forEach(line => {
                    const [key, ...valueParts] = line.split('=');
                    if (key && valueParts.length > 0) {
                        environmentVariables[key.trim()] = valueParts.join('=').trim();
                    }
                });
            }
            
            const updateData = {
                name: dialog.querySelector('#edit-project-name').value,
                description: dialog.querySelector('#edit-project-description').value,
                color: dialog.querySelector('#edit-project-color').value,
                settings: {
                    defaultShell: dialog.querySelector('#edit-project-shell').value || undefined,
                    workingDirectory: dialog.querySelector('#edit-project-working-dir').value || undefined,
                    environmentVariables,
                    terminalSettings: {
                        cols: parseInt(dialog.querySelector('#edit-terminal-cols').value) || 80,
                        rows: parseInt(dialog.querySelector('#edit-terminal-rows').value) || 24,
                        fontSize: parseInt(dialog.querySelector('#edit-terminal-font-size').value) || 14
                    }
                }
            };
            
            try {
                await this.updateProject(projectId, updateData);
                closeDialog();
            } catch (error) {
                alert('Failed to update project: ' + error.message);
            }
        });
    }
    
    async updateProject(projectId, updateData) {
        if (!this.currentUuid) throw new Error('No UUID available');
        
        const response = await fetch(`http://localhost:3001/projects/${this.currentUuid}/${projectId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update project');
        }
        
        // Reload projects
        await this.loadUserProjects();
    }
    
    async refreshProjectGitStatus(projectId) {
        const project = this.projects.get(projectId);
        if (!project) return;
        
        const refreshBtn = document.querySelector(`[data-project-id="${projectId}"] .project-status-refresh`);
        if (refreshBtn) {
            refreshBtn.classList.add('loading');
        }
        
        try {
            const response = await fetch(`http://localhost:3001/projects/${this.currentUuid}/${projectId}/refresh-git`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to refresh git status');
            }
            
            // Reload projects to get updated git info
            await this.loadUserProjects();
            
            // Update terminal header if this project is active
            this.updateTerminalHeaderInfo();
            
        } catch (error) {
            console.error('Failed to refresh git status:', error);
            alert('Failed to refresh git status: ' + error.message);
        } finally {
            if (refreshBtn) {
                refreshBtn.classList.remove('loading');
            }
        }
    }
    
    async deleteProject(projectId) {
        const project = this.projects.get(projectId);
        if (!project) return;
        
        if (!confirm(`Are you sure you want to delete the project "${project.name}"? This action cannot be undone.`)) {
            return;
        }
        
        try {
            const response = await fetch(`http://localhost:3001/projects/${this.currentUuid}/${projectId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete project');
            }
            
            // Reload projects
            await this.loadUserProjects();
            
        } catch (error) {
            alert('Failed to delete project: ' + error.message);
        }
    }
    
    // Project workspace isolation methods
    switchToProject(projectId) {
        this.activeProjectId = projectId;
        
        // Update UI to show active project
        const project = this.projects.get(projectId);
        if (project) {
            // Update header or add project indicator
            console.log(`Switched to project: ${project.name}`);
            
            // Store in localStorage for persistence
            localStorage.setItem('activeProjectId', projectId);
        }
    }
    
    switchToAllTerminals() {
        this.activeProjectId = null;
        localStorage.removeItem('activeProjectId');
        this.showAllTerminals();
        console.log('Switched to all terminals view');
        this.showSuccessMessage('Showing all terminals');
    }
    
    showProjectTerminals(projectId) {
        // Hide all terminal tabs
        const allTabs = document.querySelectorAll('.terminal-tab');
        const allPanels = document.querySelectorAll('.terminal-panel');
        
        allTabs.forEach(tab => tab.style.display = 'none');
        allPanels.forEach(panel => panel.style.display = 'none');
        
        // Show only terminals for this project
        const projectTerminals = this.projectTerminals.get(projectId);
        if (projectTerminals && projectTerminals.size > 0) {
            let firstTerminalId = null;
            
            projectTerminals.forEach(terminalId => {
                const tab = document.querySelector(`[data-tab-id*="${terminalId}"]`);
                const panel = document.querySelector(`[id*="${terminalId}"]`);
                
                if (tab) {
                    tab.style.display = 'flex';
                    if (!firstTerminalId) firstTerminalId = terminalId;
                }
                if (panel) {
                    panel.style.display = 'block';
                }
            });
            
            // Activate the first terminal tab
            if (firstTerminalId) {
                const firstTab = document.querySelector(`[data-tab-id*="${firstTerminalId}"]`);
                const firstPanel = document.querySelector(`[id*="${firstTerminalId}"]`);
                
                if (firstTab && firstPanel) {
                    // Remove active from all
                    allTabs.forEach(tab => tab.classList.remove('active'));
                    allPanels.forEach(panel => panel.classList.remove('active'));
                    
                    // Add active to first
                    firstTab.classList.add('active');
                    firstPanel.classList.add('active');
                    this.activeTerminalId = firstTerminalId;
                }
            }
        }
    }
    
    showAllTerminals() {
        // Show all terminal tabs (for when not in project mode)
        const allTabs = document.querySelectorAll('.terminal-tab');
        const allPanels = document.querySelectorAll('.terminal-panel');
        
        allTabs.forEach(tab => tab.style.display = 'flex');
        allPanels.forEach(panel => panel.style.display = 'block');
    }
    
    associateTerminalWithProject(terminalId, projectId) {
        if (!projectId) return;
        
        // Add terminal to project
        if (!this.projectTerminals.has(projectId)) {
            this.projectTerminals.set(projectId, new Set());
        }
        this.projectTerminals.get(projectId).add(terminalId);
        
        // Track project for terminal
        this.terminalProjects.set(terminalId, projectId);
        
        // Persist in localStorage
        this.saveProjectTerminalAssociations();
    }
    
    removeTerminalFromProject(terminalId) {
        const projectId = this.terminalProjects.get(terminalId);
        if (projectId) {
            const projectTerminals = this.projectTerminals.get(projectId);
            if (projectTerminals) {
                projectTerminals.delete(terminalId);
                if (projectTerminals.size === 0) {
                    this.projectTerminals.delete(projectId);
                }
            }
            this.terminalProjects.delete(terminalId);
            this.saveProjectTerminalAssociations();
        }
    }
    
    saveProjectTerminalAssociations() {
        const associations = {};
        for (const [projectId, terminalIds] of this.projectTerminals.entries()) {
            associations[projectId] = Array.from(terminalIds);
        }
        localStorage.setItem('projectTerminalAssociations', JSON.stringify(associations));
    }
    
    loadProjectTerminalAssociations() {
        try {
            const stored = localStorage.getItem('projectTerminalAssociations');
            if (stored) {
                const associations = JSON.parse(stored);
                for (const [projectId, terminalIds] of Object.entries(associations)) {
                    this.projectTerminals.set(projectId, new Set(terminalIds));
                    terminalIds.forEach(terminalId => {
                        this.terminalProjects.set(terminalId, projectId);
                    });
                }
            }
        } catch (error) {
            console.error('Failed to load project-terminal associations:', error);
        }
    }
    
    restoreActiveProject() {
        const storedProjectId = localStorage.getItem('activeProjectId');
        if (storedProjectId) {
            this.activeProjectId = storedProjectId;
            console.log(`Restored active project: ${storedProjectId}`);
        }
    }
    
    // Inter-terminal communication methods
    showTabNotification(terminalId) {
        const tab = document.querySelector(`[data-tab-id="${terminalId}"]`);
        if (tab && !tab.classList.contains('active')) {
            tab.classList.add('has-notification');
            // Auto-remove notification after 10 seconds
            setTimeout(() => {
                tab.classList.remove('has-notification');
            }, 10000);
        }
    }
    
    sendTerminalMessage(sourceTerminalId, targetTerminalId, message) {
        this.sendMessage({
            type: 'terminal_broadcast',
            terminalId: sourceTerminalId,
            targetTerminalId: targetTerminalId,
            data: message,
            timestamp: Date.now()
        });
    }
    
    broadcastToAllTerminals(sourceTerminalId, message) {
        this.sendMessage({
            type: 'terminal_broadcast',
            terminalId: sourceTerminalId,
            data: message,
            timestamp: Date.now()
        });
    }
    
    // Session Sidebar Methods
    toggleSidebar() {
        if (this.sessionSidebar) {
            this.sessionSidebar.classList.toggle('collapsed');
            
            // Save collapsed state
            const isCollapsed = this.sessionSidebar.classList.contains('collapsed');
            localStorage.setItem('sidebarCollapsed', isCollapsed.toString());
        }
    }
    
    initializeSidebar() {
        // Restore collapsed state
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (isCollapsed && this.sessionSidebar) {
            this.sessionSidebar.classList.add('collapsed');
        }
        
        // Initialize session groups
        this.updateSessionSidebar();
    }
    
    updateSessionSidebar() {
        if (!this.sessionGroups) return;
        
        // Clear existing sessions
        this.sessionGroups.innerHTML = '';
        
        // Group sessions by project
        const globalSessions = [];
        const projectGroups = new Map();
        
        for (const [terminalId, terminal] of this.terminals.entries()) {
            const projectId = this.terminalProjects.get(terminalId) || 'global';
            
            if (projectId === 'global') {
                globalSessions.push({ terminalId, terminal });
            } else {
                if (!projectGroups.has(projectId)) {
                    projectGroups.set(projectId, []);
                }
                projectGroups.get(projectId).push({ terminalId, terminal });
            }
        }
        
        // Create global sessions group
        if (globalSessions.length > 0) {
            const globalGroup = this.createSessionGroup('global', 'Global Sessions', globalSessions);
            this.sessionGroups.appendChild(globalGroup);
        }
        
        // Create project groups
        for (const [projectId, sessions] of projectGroups.entries()) {
            const project = this.projects.get(projectId);
            const projectName = project ? project.name : `Project ${projectId}`;
            const projectGroup = this.createSessionGroup(projectId, projectName, sessions);
            this.sessionGroups.appendChild(projectGroup);
        }
        
        // If no sessions exist, show empty state
        if (this.terminals.size === 0) {
            this.sessionGroups.innerHTML = `
                <div class="empty-sessions">
                    <div class="empty-icon">📟</div>
                    <p>No active sessions</p>
                    <button class="primary-btn" onclick="app.createNewTerminal()">Create Terminal</button>
                </div>
            `;
        }
    }
    
    createSessionGroup(projectId, groupName, sessions) {
        const groupElement = document.createElement('div');
        groupElement.className = 'session-group';
        groupElement.setAttribute('data-project-id', projectId);
        
        const project = this.projects.get(projectId);
        const groupIcon = projectId === 'global' ? 
            '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>' :
            '<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>';
        
        groupElement.innerHTML = `
            <div class="session-group-header" onclick="app.toggleSessionGroup('${projectId}')">
                <div class="session-group-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${groupIcon}
                    </svg>
                    <span>${groupName} (${sessions.length})</span>
                </div>
                <button class="session-group-toggle" title="Toggle group">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </button>
            </div>
            <div class="session-list" id="sessions-${projectId}">
                ${sessions.map(({ terminalId, terminal }) => this.createSessionItem(terminalId, terminal, projectId)).join('')}
            </div>
        `;
        
        return groupElement;
    }
    
    createSessionItem(terminalId, terminal, projectId) {
        const isActive = this.activeTerminalId === terminalId;
        const status = this.getTerminalStatus(terminalId);
        const project = this.projects.get(projectId);
        
        return `
            <div class="session-item ${isActive ? 'active' : ''}" 
                 data-terminal-id="${terminalId}"
                 draggable="true"
                 ondragstart="app.handleSessionDragStart(event)"
                 ondragover="app.handleSessionDragOver(event)"
                 ondrop="app.handleSessionDrop(event)"
                 onclick="app.switchToSession('${terminalId}')">
                <div class="session-status ${status}"></div>
                <div class="session-info">
                    <div class="session-name">${terminal.name || 'Terminal'}</div>
                    <div class="session-meta">
                        ${terminal.lastActivity ? this.formatRelativeTime(terminal.lastActivity) : 'Active'}
                        ${projectId !== 'global' && project ? `<span class="session-project-badge">${project.name}</span>` : ''}
                    </div>
                </div>
                <div class="session-actions">
                    <button class="session-action" title="Rename session" onclick="event.stopPropagation(); app.renameSession('${terminalId}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="session-action" title="Duplicate session" onclick="event.stopPropagation(); app.duplicateSession('${terminalId}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                    </button>
                    <button class="session-action danger" title="Close session" onclick="event.stopPropagation(); app.closeSessionFromSidebar('${terminalId}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }
    
    getTerminalStatus(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) return 'inactive';
        
        if (this.activeTerminalId === terminalId) return 'active';
        
        // Check if terminal has recent activity (within last 30 seconds)
        const now = Date.now();
        const lastActivity = terminal.lastActivity ? new Date(terminal.lastActivity).getTime() : 0;
        const timeSinceActivity = now - lastActivity;
        
        if (timeSinceActivity < 30000) return 'running'; // 30 seconds
        if (timeSinceActivity < 300000) return 'idle'; // 5 minutes
        return 'inactive';
    }
    
    formatRelativeTime(date) {
        const now = Date.now();
        const time = new Date(date).getTime();
        const diff = now - time;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    }
    
    toggleSessionGroup(projectId) {
        const group = document.querySelector(`[data-project-id="${projectId}"]`);
        if (group) {
            group.classList.toggle('collapsed');
            
            // Save collapsed state
            const collapsedGroups = JSON.parse(localStorage.getItem('collapsedSessionGroups') || '[]');
            const isCollapsed = group.classList.contains('collapsed');
            
            if (isCollapsed && !collapsedGroups.includes(projectId)) {
                collapsedGroups.push(projectId);
            } else if (!isCollapsed) {
                const index = collapsedGroups.indexOf(projectId);
                if (index > -1) collapsedGroups.splice(index, 1);
            }
            
            localStorage.setItem('collapsedSessionGroups', JSON.stringify(collapsedGroups));
        }
    }
    
    switchToSession(terminalId) {
        if (this.terminals.has(terminalId)) {
            this.setActiveTerminal(terminalId);
            this.updateSessionSidebar();
        }
    }
    
    renameSession(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) return;
        
        const newName = prompt('Enter new session name:', terminal.name || 'Terminal');
        if (newName && newName.trim() && newName !== terminal.name) {
            // Update terminal name
            terminal.name = newName.trim();
            
            // Update tab name if it exists
            const tab = document.querySelector(`[data-tab-id*="${terminalId}"]`);
            if (tab) {
                const tabName = tab.querySelector('.terminal-tab-name');
                if (tabName) tabName.textContent = newName.trim();
            }
            
            // Update sidebar
            this.updateSessionSidebar();
            
            // Send update to backend if needed
            this.sendMessage({
                type: 'terminal_rename',
                terminalId: terminalId,
                name: newName.trim(),
                timestamp: Date.now()
            });
        }
    }
    
    duplicateSession(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) return;
        
        const projectId = this.terminalProjects.get(terminalId);
        const project = projectId ? this.projects.get(projectId) : null;
        
        const newName = `${terminal.name || 'Terminal'} (Copy)`;
        this.createNewTerminal(newName, terminal.color, project?.settings, projectId);
    }
    
    closeSessionFromSidebar(terminalId) {
        if (confirm('Are you sure you want to close this session?')) {
            this.closeTerminal(terminalId);
        }
    }
    
    // Drag and Drop for session organization
    handleSessionDragStart(event) {
        const terminalId = event.target.getAttribute('data-terminal-id');
        event.dataTransfer.setData('text/plain', terminalId);
        event.target.classList.add('dragging');
    }
    
    handleSessionDragOver(event) {
        event.preventDefault();
        const draggedElement = document.querySelector('.dragging');
        const targetElement = event.target.closest('.session-item');
        
        if (targetElement && targetElement !== draggedElement) {
            targetElement.classList.add('drop-target');
        }
    }
    
    handleSessionDrop(event) {
        event.preventDefault();
        const draggedTerminalId = event.dataTransfer.getData('text/plain');
        const targetElement = event.target.closest('.session-item');
        const targetTerminalId = targetElement?.getAttribute('data-terminal-id');
        
        // Clean up drag states
        document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        
        if (draggedTerminalId && targetTerminalId && draggedTerminalId !== targetTerminalId) {
            // Reorder sessions (this would require backend support for proper persistence)
            console.log(`Reordering: ${draggedTerminalId} -> ${targetTerminalId}`);
            this.updateSessionSidebar();
        }
    }
    
    // ===============================
    // Project Switcher Methods
    // ===============================
    
    toggleProjectSwitcher() {
        if (this.projectSwitcherDropdown) {
            const isActive = this.projectSwitcherDropdown.classList.contains('active');
            if (isActive) {
                this.closeProjectSwitcher();
            } else {
                this.openProjectSwitcher();
            }
        }
    }
    
    openProjectSwitcher() {
        if (this.projectSwitcherDropdown) {
            this.projectSwitcherDropdown.classList.add('active');
            this.updateProjectSwitcherDropdown();
        }
    }
    
    closeProjectSwitcher() {
        if (this.projectSwitcherDropdown) {
            this.projectSwitcherDropdown.classList.remove('active');
        }
    }
    
    updateProjectSwitcherDropdown() {
        if (!this.dropdownProjects) return;
        
        this.dropdownProjects.innerHTML = '';
        
        // Sort projects by last accessed
        const sortedProjects = Array.from(this.projects.values())
            .sort((a, b) => new Date(b.lastAccessedAt) - new Date(a.lastAccessedAt));
        
        // Show recent projects (limit to 5)
        const recentProjects = sortedProjects.slice(0, 5);
        
        recentProjects.forEach(project => {
            const projectElement = document.createElement('div');
            projectElement.className = 'dropdown-item';
            projectElement.dataset.projectId = project.id;
            
            const terminalCount = this.projectTerminals.get(project.id)?.size || 0;
            const gitStatus = project.gitRepo ? this.getGitStatusText(project.gitRepo.status) : 'No Git';
            
            projectElement.innerHTML = `
                <div class="project-item-icon color-${project.color}">
                    ${this.getProjectIcon(project)}
                </div>
                <div class="project-item-content">
                    <div class="project-item-name">${project.name}</div>
                    <div class="project-item-stats">${terminalCount} terminals • ${gitStatus}</div>
                </div>
            `;
            
            projectElement.addEventListener('click', () => {
                this.switchToProject(project.id);
                this.closeProjectSwitcher();
            });
            
            this.dropdownProjects.appendChild(projectElement);
        });
        
        // Add "all projects" option
        const allProjectsElement = document.createElement('div');
        allProjectsElement.className = 'dropdown-item all-projects';
        allProjectsElement.innerHTML = `
            <div class="project-item-icon">🌐</div>
            <div class="project-item-content">
                <div class="project-item-name">All Projects</div>
                <div class="project-item-stats">View all terminals</div>
            </div>
        `;
        
        allProjectsElement.addEventListener('click', () => {
            this.switchToAllTerminals();
            this.closeProjectSwitcher();
        });
        
        this.dropdownProjects.appendChild(allProjectsElement);
        
        // Update stats in switcher header
        this.updateProjectSwitcherStats();
    }
    
    updateProjectSwitcherStats() {
        if (!this.activeTerminalsSpan || !this.gitStatusSpan) return;
        
        const activeProject = this.activeProjectId ? this.projects.get(this.activeProjectId) : null;
        
        if (activeProject) {
            // Update current project display
            this.currentProjectName.textContent = activeProject.name;
            this.projectColorDot.className = `project-color-dot color-${activeProject.color}`;
            
            // Update stats
            const terminalCount = this.projectTerminals.get(activeProject.id)?.size || 0;
            this.activeTerminalsSpan.textContent = `${terminalCount} terminals`;
            
            const gitStatus = activeProject.gitRepo ? this.getGitStatusText(activeProject.gitRepo.status) : '—';
            this.gitStatusSpan.textContent = gitStatus;
        } else {
            // All projects view
            this.currentProjectName.textContent = 'All Projects';
            this.projectColorDot.className = 'project-color-dot';
            
            const totalTerminals = this.terminals.size;
            this.activeTerminalsSpan.textContent = `${totalTerminals} terminals`;
            
            const gitRepoCount = Array.from(this.projects.values())
                .filter(p => p.gitRepo).length;
            this.gitStatusSpan.textContent = `${gitRepoCount} Git repos`;
        }
    }
    
    getGitStatusText(status) {
        switch (status) {
            case 'clean': return '✅ Clean';
            case 'dirty': return '⚠️ Modified';
            case 'ahead': return '⬆️ Ahead';
            case 'behind': return '⬇️ Behind';
            case 'diverged': return '🔀 Diverged';
            default: return '—';
        }
    }
    
    // ===============================
    // Project Overview Dashboard
    // ===============================
    
    toggleProjectOverview() {
        if (this.projectOverviewDashboard) {
            const isVisible = this.projectOverviewDashboard.style.display !== 'none';
            if (isVisible) {
                this.closeProjectOverview();
            } else {
                this.openProjectOverview();
            }
        }
    }
    
    openProjectOverview() {
        if (this.projectOverviewDashboard && this.mainDashboard) {
            this.projectOverviewDashboard.style.display = 'block';
            this.mainDashboard.style.display = 'none';
            this.updateProjectOverviewStats();
            this.updateProjectOverviewContent();
        }
    }
    
    closeProjectOverview() {
        if (this.projectOverviewDashboard && this.mainDashboard) {
            this.projectOverviewDashboard.style.display = 'none';
            this.mainDashboard.style.display = 'block';
        }
    }
    
    updateProjectOverviewStats() {
        if (!this.totalProjectsSpan) return;
        
        const totalProjects = this.projects.size;
        const activeSessions = this.terminals.size;
        const gitRepos = Array.from(this.projects.values()).filter(p => p.gitRepo).length;
        const recentActivity = this.getRecentActivityCount();
        
        this.totalProjectsSpan.textContent = totalProjects;
        this.activeSessionsSpan.textContent = activeSessions;
        this.gitReposSpan.textContent = gitRepos;
        this.recentActivitySpan.textContent = recentActivity;
    }
    
    updateProjectOverviewContent() {
        this.updateRecentProjectsList();
        this.updateActiveSessionsList();
        this.updateGitActivityList();
    }
    
    updateRecentProjectsList() {
        if (!this.recentProjectsList) return;
        
        this.recentProjectsList.innerHTML = '';
        
        const sortedProjects = Array.from(this.projects.values())
            .sort((a, b) => new Date(b.lastAccessedAt) - new Date(a.lastAccessedAt))
            .slice(0, 5);
        
        sortedProjects.forEach(project => {
            const projectElement = document.createElement('div');
            projectElement.className = 'project-overview-item';
            
            const terminalCount = this.projectTerminals.get(project.id)?.size || 0;
            const lastAccessed = new Date(project.lastAccessedAt).toLocaleDateString();
            
            projectElement.innerHTML = `
                <div class="overview-item-icon color-${project.color}">
                    ${this.getProjectIcon(project)}
                </div>
                <div class="overview-item-content">
                    <div class="overview-item-name">${project.name}</div>
                    <div class="overview-item-details">${terminalCount} terminals • Last accessed ${lastAccessed}</div>
                </div>
                <div class="overview-item-actions">
                    <button class="overview-action-btn" onclick="app.openProject('${project.id}')" title="Open Project">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 12l2 2 4-4"/>
                            <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"/>
                            <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"/>
                        </svg>
                    </button>
                    <button class="overview-action-btn" onclick="app.editProject('${project.id}')" title="Edit Project">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="m18.5 2.5 a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                </div>
            `;
            
            this.recentProjectsList.appendChild(projectElement);
        });
    }
    
    updateActiveSessionsList() {
        if (!this.activeSessionsList) return;
        
        this.activeSessionsList.innerHTML = '';
        
        const sortedTerminals = Array.from(this.terminals.values())
            .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
            .slice(0, 5);
        
        sortedTerminals.forEach(terminal => {
            const sessionElement = document.createElement('div');
            sessionElement.className = 'session-overview-item';
            
            const projectId = this.terminalProjects.get(terminal.terminalId);
            const project = projectId ? this.projects.get(projectId) : null;
            const projectName = project ? project.name : 'Global';
            const lastActivity = new Date(terminal.lastActivity).toLocaleTimeString();
            
            sessionElement.innerHTML = `
                <div class="overview-item-icon color-${terminal.color}">
                    💻
                </div>
                <div class="overview-item-content">
                    <div class="overview-item-name">${terminal.name}</div>
                    <div class="overview-item-details">${projectName} • Last activity ${lastActivity}</div>
                </div>
                <div class="overview-item-actions">
                    <button class="overview-action-btn" onclick="app.setActiveTerminal('${terminal.terminalId}')" title="Switch to Terminal">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 12l2 2 4-4"/>
                            <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"/>
                            <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"/>
                        </svg>
                    </button>
                    <button class="overview-action-btn" onclick="app.closeTerminal('${terminal.terminalId}')" title="Close Terminal">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            `;
            
            this.activeSessionsList.appendChild(sessionElement);
        });
    }
    
    updateGitActivityList() {
        if (!this.gitActivityList) return;
        
        this.gitActivityList.innerHTML = '';
        
        const projectsWithGit = Array.from(this.projects.values())
            .filter(p => p.gitRepo)
            .sort((a, b) => new Date(b.gitRepo.lastUpdated) - new Date(a.gitRepo.lastUpdated))
            .slice(0, 5);
        
        projectsWithGit.forEach(project => {
            const gitElement = document.createElement('div');
            gitElement.className = 'git-activity-item';
            
            const gitRepo = project.gitRepo;
            const lastUpdated = new Date(gitRepo.lastUpdated).toLocaleTimeString();
            const statusText = this.getGitStatusText(gitRepo.status);
            
            gitElement.innerHTML = `
                <div class="overview-item-icon color-${project.color}">
                    🔄
                </div>
                <div class="overview-item-content">
                    <div class="overview-item-name">${project.name}</div>
                    <div class="overview-item-details">${gitRepo.branch} • ${statusText} • Updated ${lastUpdated}</div>
                </div>
                <div class="overview-item-actions">
                    <button class="overview-action-btn" onclick="app.refreshProjectGitStatus('${project.id}')" title="Refresh Git Status">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="23 4 23 10 17 10"/>
                            <polyline points="1 20 1 14 7 14"/>
                            <path d="m3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                        </svg>
                    </button>
                    <button class="overview-action-btn" onclick="app.openProject('${project.id}')" title="Open Project">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 12l2 2 4-4"/>
                            <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"/>
                            <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"/>
                        </svg>
                    </button>
                </div>
            `;
            
            this.gitActivityList.appendChild(gitElement);
        });
    }
    
    getRecentActivityCount() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        return Array.from(this.terminals.values())
            .filter(t => new Date(t.lastActivity) > oneHourAgo).length;
    }
    
    refreshAllGitStatus() {
        this.refreshAllGitBtn.classList.add('loading');
        
        const promises = Array.from(this.projects.keys())
            .map(projectId => this.refreshProjectGitStatus(projectId));
        
        Promise.all(promises)
            .finally(() => {
                this.refreshAllGitBtn.classList.remove('loading');
                this.updateProjectOverviewContent();
            });
    }
    
    showAllProjects() {
        this.closeProjectOverview();
        // Switch to projects view
        this.switchToAllTerminals();
    }
    
    showAllSessions() {
        this.closeProjectOverview();
        // Focus on sessions sidebar
        this.toggleSidebar();
    }
    
    showManageProjectsDialog() {
        // This would open a dedicated project management dialog
        alert('Project management dialog would open here');
    }
    
    // ===============================
    // Split View Methods
    // ===============================
    
    toggleSplitViewMode() {
        this.splitViewActive = !this.splitViewActive;
        this.applySplitViewLayout();
    }
    
    toggleHorizontalSplitMode() {
        this.splitViewOrientation = this.splitViewOrientation === 'vertical' ? 'horizontal' : 'vertical';
        if (this.splitViewActive) {
            this.applySplitViewLayout();
        }
    }
    
    cycleLayoutMode() {
        const modes = ['single', 'split', 'quad'];
        const currentIndex = modes.indexOf(this.layoutMode);
        this.layoutMode = modes[(currentIndex + 1) % modes.length];
        this.applyLayoutMode();
    }
    
    applySplitViewLayout() {
        if (!this.terminalWorkspaceContainer) return;
        
        const container = this.terminalWorkspaceContainer;
        const secondaryPanels = this.terminalPanelsSecondary;
        const divider = this.splitViewDivider;
        
        if (this.splitViewActive) {
            // Show split view
            container.classList.add(`split-${this.splitViewOrientation}`);
            secondaryPanels.style.display = 'block';
            divider.style.display = 'block';
            
            // Update control buttons
            this.toggleSplitView.classList.add('active');
            if (this.splitViewOrientation === 'horizontal') {
                this.toggleHorizontalSplit.classList.add('active');
            } else {
                this.toggleHorizontalSplit.classList.remove('active');
            }
        } else {
            // Hide split view
            container.classList.remove('split-vertical', 'split-horizontal');
            secondaryPanels.style.display = 'none';
            divider.style.display = 'none';
            
            // Update control buttons
            this.toggleSplitView.classList.remove('active');
            this.toggleHorizontalSplit.classList.remove('active');
        }
    }
    
    applyLayoutMode() {
        // Implementation for quad layout and other advanced layouts
        switch (this.layoutMode) {
            case 'single':
                this.splitViewActive = false;
                this.applySplitViewLayout();
                break;
            case 'split':
                this.splitViewActive = true;
                this.applySplitViewLayout();
                break;
            case 'quad':
                // Advanced quad layout (would need additional HTML structure)
                console.log('Quad layout not fully implemented yet');
                break;
        }
        
        // Update button states
        this.toggleLayoutMode.classList.toggle('active', this.layoutMode !== 'single');
    }
    
    initializeSplitViewDivider() {
        if (!this.splitViewDivider) return;
        
        let isDragging = false;
        let startPos = 0;
        let startSize = 0;
        
        this.splitViewDivider.addEventListener('mousedown', (e) => {
            isDragging = true;
            startPos = this.splitViewOrientation === 'vertical' ? e.clientX : e.clientY;
            startSize = this.splitViewOrientation === 'vertical' ? 
                this.terminalPanels.offsetWidth : 
                this.terminalPanels.offsetHeight;
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            e.preventDefault();
        });
        
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            const currentPos = this.splitViewOrientation === 'vertical' ? e.clientX : e.clientY;
            const diff = currentPos - startPos;
            const newSize = startSize + diff;
            
            if (this.splitViewOrientation === 'vertical') {
                this.terminalPanels.style.width = `${newSize}px`;
            } else {
                this.terminalPanels.style.height = `${newSize}px`;
            }
        };
        
        const handleMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }
    
    // Override the existing switchToProject method to update switcher
    switchToProject(projectId) {
        this.activeProjectId = projectId;
        
        // Update UI to show active project
        const project = this.projects.get(projectId);
        if (project) {
            console.log(`Switched to project: ${project.name}`);
            
            // Store in localStorage for persistence
            localStorage.setItem('activeProjectId', projectId);
            
            // Update project switcher display
            this.updateProjectSwitcherStats();
            
            // Show project terminals
            this.showProjectTerminals(projectId);
        }
    }
    
    // Override the existing switchToAllTerminals method to update switcher
    switchToAllTerminals() {
        this.activeProjectId = null;
        localStorage.removeItem('activeProjectId');
        this.showAllTerminals();
        console.log('Switched to all terminals view');
        
        // Update project switcher display
        this.updateProjectSwitcherStats();
        
        this.showSuccessMessage('Showing all terminals');
    }
}

// Tool Management System
class ToolManager {
    constructor(app) {
        this.app = app;
        this.tools = new Map();
        this.statistics = null;
        this.activeCategory = 'all';
        this.selectedTool = null;
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadTools();
    }
    
    initializeElements() {
        // Tool status bar elements
        this.toolStatusBar = document.getElementById('tool-status-bar');
        this.toolStatusStats = document.getElementById('tool-status-stats');
        this.toolsInstalledSpan = document.getElementById('tools-installed');
        this.toolsMissingSpan = document.getElementById('tools-missing');
        this.toolStatusIndicators = document.getElementById('tool-status-indicators');
        this.toolRefreshBtn = document.getElementById('tool-refresh-btn');
        this.toolManagerBtn = document.getElementById('tool-manager-btn');
        
        // Tool manager modal elements
        this.toolManagerModal = document.getElementById('tool-manager-modal');
        this.toolManagerClose = document.getElementById('tool-manager-close');
        this.modalToolsInstalled = document.getElementById('modal-tools-installed');
        this.modalToolsMissing = document.getElementById('modal-tools-missing');
        this.modalToolsTotal = document.getElementById('modal-tools-total');
        this.categoryTabs = document.querySelectorAll('.category-tab');
        this.toolsGrid = document.getElementById('tools-grid');
        this.toolDetailPanel = document.getElementById('tool-detail-panel');
        this.toolDetailContent = document.getElementById('tool-detail-content');
        this.backToToolsBtn = document.getElementById('back-to-tools-btn');
    }
    
    attachEventListeners() {
        // Tool status bar controls
        this.toolRefreshBtn?.addEventListener('click', () => this.refreshTools());
        this.toolManagerBtn?.addEventListener('click', () => this.openToolManager());
        
        // Modal controls
        this.toolManagerClose?.addEventListener('click', () => this.closeToolManager());
        this.backToToolsBtn?.addEventListener('click', () => this.showToolsGrid());
        
        // Category tabs
        this.categoryTabs.forEach(tab => {
            tab.addEventListener('click', () => this.selectCategory(tab.dataset.category));
        });
        
        // Modal backdrop click
        this.toolManagerModal?.addEventListener('click', (e) => {
            if (e.target === this.toolManagerModal) {
                this.closeToolManager();
            }
        });
    }
    
    async loadTools() {
        try {
            this.showLoadingState();
            
            if (!this.app.isConnected) {
                this.showDisconnectedState();
                return;
            }
            
            const response = await fetch(`${this.app.getApiUrl()}/tools`);
            const data = await response.json();
            
            if (data.success) {
                this.tools.clear();
                Object.entries(data.tools).forEach(([name, tool]) => {
                    this.tools.set(name, tool);
                });
                this.statistics = data.statistics;
                
                this.updateToolStatusBar();
                this.updateToolsGrid();
            } else {
                console.error('Failed to load tools:', data.error);
                this.showErrorState(data.error);
            }
        } catch (error) {
            console.error('Error loading tools:', error);
            this.showErrorState('Failed to connect to tool detection service');
        }
    }
    
    async refreshTools() {
        if (!this.app.isConnected) return;
        
        try {
            this.toolRefreshBtn?.classList.add('loading');
            this.showLoadingState();
            
            const response = await fetch(`${this.app.getApiUrl()}/tools/refresh`, {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.success) {
                this.tools.clear();
                Object.entries(data.tools).forEach(([name, tool]) => {
                    this.tools.set(name, tool);
                });
                this.statistics = data.statistics;
                
                this.updateToolStatusBar();
                this.updateToolsGrid();
            } else {
                console.error('Failed to refresh tools:', data.error);
                this.showErrorState(data.error);
            }
        } catch (error) {
            console.error('Error refreshing tools:', error);
            this.showErrorState('Failed to refresh tool status');
        } finally {
            this.toolRefreshBtn?.classList.remove('loading');
        }
    }
    
    updateToolStatusBar() {
        if (!this.statistics) return;
        
        // Update stats
        if (this.toolsInstalledSpan) {
            this.toolsInstalledSpan.textContent = `${this.statistics.installed} installed`;
        }
        if (this.toolsMissingSpan) {
            this.toolsMissingSpan.textContent = `${this.statistics.missing} missing`;
        }
        
        // Update indicators
        this.updateToolIndicators();
        
        // Update modal stats if open
        if (this.modalToolsInstalled) {
            this.modalToolsInstalled.textContent = this.statistics.installed;
        }
        if (this.modalToolsMissing) {
            this.modalToolsMissing.textContent = this.statistics.missing;
        }
        if (this.modalToolsTotal) {
            this.modalToolsTotal.textContent = this.statistics.total;
        }
    }
    
    updateToolIndicators() {
        if (!this.toolStatusIndicators) return;
        
        this.toolStatusIndicators.innerHTML = '';
        
        // Show top 8 tools (4 installed, 4 missing)
        const installedTools = Array.from(this.tools.values()).filter(tool => tool.isInstalled).slice(0, 4);
        const missingTools = Array.from(this.tools.values()).filter(tool => !tool.isInstalled).slice(0, 4);
        
        [...installedTools, ...missingTools].forEach(tool => {
            const indicator = document.createElement('div');
            indicator.className = `tool-indicator ${tool.isInstalled ? 'installed' : 'missing'}`;
            indicator.innerHTML = `
                <div class="tool-indicator-dot"></div>
                <span>${tool.displayName}</span>
            `;
            this.toolStatusIndicators.appendChild(indicator);
        });
        
        // Add "view all" indicator if there are more tools
        const remainingCount = this.tools.size - installedTools.length - missingTools.length;
        if (remainingCount > 0) {
            const viewAllIndicator = document.createElement('div');
            viewAllIndicator.className = 'tool-indicator';
            viewAllIndicator.style.cursor = 'pointer';
            viewAllIndicator.innerHTML = `
                <span>+${remainingCount} more</span>
            `;
            viewAllIndicator.addEventListener('click', () => this.openToolManager());
            this.toolStatusIndicators.appendChild(viewAllIndicator);
        }
    }
    
    openToolManager() {
        if (!this.toolManagerModal) return;
        
        this.toolManagerModal.style.display = 'flex';
        this.updateToolsGrid();
        this.showToolsGrid();
    }
    
    closeToolManager() {
        if (!this.toolManagerModal) return;
        
        this.toolManagerModal.style.display = 'none';
        this.selectedTool = null;
    }
    
    selectCategory(category) {
        this.activeCategory = category;
        
        // Update tab active state
        this.categoryTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.category === category);
        });
        
        this.updateToolsGrid();
    }
    
    updateToolsGrid() {
        if (!this.toolsGrid) return;
        
        const filteredTools = this.getFilteredTools();
        this.toolsGrid.innerHTML = '';
        
        if (filteredTools.length === 0) {
            this.toolsGrid.innerHTML = '<div class="tool-loading">No tools found for this category</div>';
            return;
        }
        
        filteredTools.forEach(tool => {
            const toolCard = this.createToolCard(tool);
            this.toolsGrid.appendChild(toolCard);
        });
    }
    
    getFilteredTools() {
        const allTools = Array.from(this.tools.values());
        
        if (this.activeCategory === 'all') {
            return allTools;
        }
        
        return allTools.filter(tool => tool.category === this.activeCategory);
    }
    
    createToolCard(tool) {
        const card = document.createElement('div');
        card.className = 'tool-card';
        card.addEventListener('click', () => this.showToolDetails(tool));
        
        const categoryIcons = {
            ai: '🤖',
            development: '💻',
            devops: '⚙️',
            cloud: '☁️',
            database: '🗄️',
            system: '🔧'
        };
        
        const statusClass = tool.isInstalled ? 'installed' : 'missing';
        const statusText = tool.isInstalled ? 'Installed' : 'Missing';
        
        card.innerHTML = `
            <div class="tool-card-header">
                <div class="tool-card-title">
                    <div class="tool-card-icon ${tool.category}">
                        ${categoryIcons[tool.category] || '🔧'}
                    </div>
                    <div>
                        <div class="tool-card-name">${tool.displayName}</div>
                        ${tool.version ? `<div class="tool-card-version">v${tool.version}</div>` : ''}
                    </div>
                </div>
                <div class="tool-card-status ${statusClass}">
                    <div class="tool-card-status-dot"></div>
                    <span>${statusText}</span>
                </div>
            </div>
            <div class="tool-card-description">
                ${tool.description}
            </div>
            <div class="tool-card-capabilities">
                ${tool.capabilities.slice(0, 3).map(cap => 
                    `<span class="tool-capability-tag">${cap.name}</span>`
                ).join('')}
                ${tool.capabilities.length > 3 ? `<span class="tool-capability-tag">+${tool.capabilities.length - 3} more</span>` : ''}
            </div>
            <div class="tool-card-actions">
                <button class="tool-action-btn" onclick="event.stopPropagation(); window.app.toolManager.refreshTool('${tool.name}')">
                    Refresh
                </button>
                ${!tool.isInstalled ? `<button class="tool-action-btn primary" onclick="event.stopPropagation(); window.app.toolManager.showInstallGuide('${tool.name}')">
                    Install Guide
                </button>` : ''}
            </div>
        `;
        
        return card;
    }
    
    async showToolDetails(tool) {
        this.selectedTool = tool;
        
        // Hide tools grid, show detail panel
        this.toolsGrid.style.display = 'none';
        this.toolDetailPanel.style.display = 'block';
        
        // Get installation guides
        let installGuides = [];
        try {
            const response = await fetch(`${this.app.getApiUrl()}/tools/${tool.name}/install-guide`);
            const data = await response.json();
            if (data.success) {
                installGuides = data.guides;
            }
        } catch (error) {
            console.error('Error fetching install guides:', error);
        }
        
        // Populate detail content
        this.toolDetailContent.innerHTML = `
            <div class="tool-detail-header-info">
                <h2>${tool.displayName}</h2>
                <p>${tool.description}</p>
                ${tool.version ? `<p><strong>Version:</strong> ${tool.version}</p>` : ''}
                ${tool.path ? `<p><strong>Path:</strong> <code>${tool.path}</code></p>` : ''}
                <p><strong>Status:</strong> <span class="tool-card-status ${tool.isInstalled ? 'installed' : 'missing'}">
                    <div class="tool-card-status-dot"></div>
                    ${tool.isInstalled ? 'Installed' : 'Missing'}
                </span></p>
            </div>
            
            <div class="tool-detail-info">
                <div class="tool-detail-section">
                    <h4>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                        </svg>
                        Capabilities
                    </h4>
                    <div class="tool-capabilities-list">
                        ${tool.capabilities.map(cap => `
                            <div class="tool-capability-item">
                                <h5>${cap.name}</h5>
                                <p>${cap.description}</p>
                                <div class="tool-capability-commands">
                                    ${cap.commands.map(cmd => `<code class="tool-capability-command">${cmd}</code>`).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                ${installGuides.length > 0 ? `
                    <div class="tool-detail-section">
                        <h4>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                            </svg>
                            Installation Guide
                        </h4>
                        <div class="tool-installation-guides">
                            ${installGuides.map(guide => `
                                <div class="tool-installation-guide">
                                    <h5>${guide.platform}</h5>
                                    <p>${guide.description}</p>
                                    <div class="tool-installation-commands">
                                        <pre>${guide.commands.join('\n')}</pre>
                                    </div>
                                    ${guide.url ? `<p><a href="${guide.url}" target="_blank">Learn more</a></p>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    showToolsGrid() {
        if (this.toolsGrid) this.toolsGrid.style.display = 'grid';
        if (this.toolDetailPanel) this.toolDetailPanel.style.display = 'none';
    }
    
    async refreshTool(toolName) {
        try {
            const response = await fetch(`${this.app.getApiUrl()}/tools/${toolName}/refresh`, {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.success) {
                this.tools.set(toolName, data.tool);
                this.updateToolStatusBar();
                this.updateToolsGrid();
                
                // If detail panel is open for this tool, update it
                if (this.selectedTool && this.selectedTool.name === toolName) {
                    this.showToolDetails(data.tool);
                }
            }
        } catch (error) {
            console.error('Error refreshing tool:', error);
        }
    }
    
    showInstallGuide(toolName) {
        const tool = this.tools.get(toolName);
        if (tool) {
            this.showToolDetails(tool);
        }
    }
    
    showLoadingState() {
        if (this.toolsInstalledSpan) {
            this.toolsInstalledSpan.textContent = 'Loading...';
        }
        if (this.toolsMissingSpan) {
            this.toolsMissingSpan.textContent = '—';
        }
        if (this.toolStatusIndicators) {
            this.toolStatusIndicators.innerHTML = '<div class="tool-loading"><div class="tool-loading-spinner"></div>Loading tools...</div>';
        }
    }
    
    showDisconnectedState() {
        if (this.toolsInstalledSpan) {
            this.toolsInstalledSpan.textContent = 'Disconnected';
        }
        if (this.toolsMissingSpan) {
            this.toolsMissingSpan.textContent = '—';
        }
        if (this.toolStatusIndicators) {
            this.toolStatusIndicators.innerHTML = '<div class="tool-indicator">Connect to view tools</div>';
        }
    }
    
    showErrorState(message) {
        if (this.toolsInstalledSpan) {
            this.toolsInstalledSpan.textContent = 'Error';
        }
        if (this.toolsMissingSpan) {
            this.toolsMissingSpan.textContent = '—';
        }
        if (this.toolStatusIndicators) {
            this.toolStatusIndicators.innerHTML = `<div class="tool-indicator missing">${message}</div>`;
        }
    }
    
    onConnectionStatusChanged(isConnected) {
        if (isConnected) {
            this.loadTools();
        } else {
            this.showDisconnectedState();
        }
    }
}

// Command Routing Manager Class
class CommandRoutingManager {
    constructor(app) {
        this.app = app;
        this.commandHistory = new Map(); // terminalId -> history
        this.toolHistories = new Map(); // tool -> history
        this.activeCommands = new Map(); // terminalId -> current command
        this.commandSuggestions = new Map(); // tool -> suggestions
        
        this.initializeRouting();
    }
    
    initializeRouting() {
        // Initialize tool-specific command suggestions
        this.commandSuggestions.set('git', [
            'git status',
            'git add .',
            'git commit -m "message"',
            'git push',
            'git pull',
            'git log --oneline',
            'git branch',
            'git checkout -b branch-name'
        ]);
        
        this.commandSuggestions.set('npm', [
            'npm install',
            'npm run build',
            'npm run dev',
            'npm run test',
            'npm run start',
            'npm audit',
            'npm outdated',
            'npm update'
        ]);
        
        this.commandSuggestions.set('docker', [
            'docker ps',
            'docker images',
            'docker build -t name .',
            'docker run -it name',
            'docker logs container',
            'docker exec -it container bash',
            'docker-compose up',
            'docker-compose down'
        ]);
        
        this.commandSuggestions.set('claude-code', [
            'claude-code help',
            'claude-code generate --type component',
            'claude-code review --file',
            'claude-code document --file',
            'claude-code explain --code',
            'claude-code fix --error'
        ]);
    }
    
    // Route a command through the intelligent routing system
    async routeCommand(terminalId, command, workingDirectory = null) {
        if (!this.app.isConnected) {
            throw new Error('Not connected to backend');
        }
        
        // Mark command as active
        this.activeCommands.set(terminalId, {
            command,
            timestamp: Date.now(),
            workingDirectory
        });
        
        // Send routing request via WebSocket
        this.app.sendMessage({
            type: 'command_route',
            terminalId,
            command,
            workingDirectory,
            timestamp: Date.now()
        });
    }
    
    // Parse a command to identify the tool and get metadata
    async parseCommand(command) {
        if (!this.app.isConnected) {
            throw new Error('Not connected to backend');
        }
        
        return new Promise((resolve, reject) => {
            // Store callback for response
            this.app.tempCallbacks = this.app.tempCallbacks || new Map();
            const callbackId = `parse_${Date.now()}`;
            
            this.app.tempCallbacks.set(callbackId, { resolve, reject });
            
            // Send parse request
            this.app.sendMessage({
                type: 'command_parse',
                command,
                callbackId,
                timestamp: Date.now()
            });
            
            // Timeout after 5 seconds
            setTimeout(() => {
                if (this.app.tempCallbacks.has(callbackId)) {
                    this.app.tempCallbacks.delete(callbackId);
                    reject(new Error('Command parse timeout'));
                }
            }, 5000);
        });
    }
    
    // Get command history for a terminal
    getTerminalHistory(terminalId) {
        return this.commandHistory.get(terminalId) || [];
    }
    
    // Get tool-specific history
    getToolHistory(tool) {
        return this.toolHistories.get(tool) || [];
    }
    
    // Add command to history
    addToHistory(terminalId, command, result = null) {
        if (!this.commandHistory.has(terminalId)) {
            this.commandHistory.set(terminalId, []);
        }
        
        const history = this.commandHistory.get(terminalId);
        history.push({
            command,
            timestamp: new Date(),
            result,
            terminalId
        });
        
        // Keep only last 100 commands per terminal
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }
        
        // Update UI if this is the active terminal
        if (terminalId === this.app.activeTerminalId) {
            this.updateCommandHistoryUI(terminalId);
        }
    }
    
    // Add to tool-specific history
    addToToolHistory(tool, command, result = null) {
        if (!this.toolHistories.has(tool)) {
            this.toolHistories.set(tool, []);
        }
        
        const history = this.toolHistories.get(tool);
        history.push({
            command,
            timestamp: new Date(),
            result,
            tool
        });
        
        // Keep only last 50 commands per tool
        if (history.length > 50) {
            history.splice(0, history.length - 50);
        }
        
        // Update tool history UI
        this.updateToolHistoryUI(tool);
    }
    
    // Get command suggestions for a tool
    getCommandSuggestions(tool) {
        return this.commandSuggestions.get(tool) || [];
    }
    
    // Update command history UI for a terminal
    updateCommandHistoryUI(terminalId) {
        const historyPanel = document.getElementById(`history-${terminalId}`);
        if (!historyPanel) return;
        
        const history = this.getTerminalHistory(terminalId);
        const historyList = historyPanel.querySelector('.command-history-list');
        
        if (historyList) {
            historyList.innerHTML = '';
            
            history.slice(-10).forEach(entry => {
                const item = document.createElement('div');
                item.className = 'history-item';
                item.innerHTML = `
                    <div class="history-command">${this.escapeHtml(entry.command)}</div>
                    <div class="history-timestamp">${entry.timestamp.toLocaleTimeString()}</div>
                `;
                
                // Add click handler to repeat command
                item.addEventListener('click', () => {
                    this.repeatCommand(terminalId, entry.command);
                });
                
                historyList.appendChild(item);
            });
        }
    }
    
    // Update tool history UI
    updateToolHistoryUI(tool) {
        const toolHistoryPanel = document.getElementById(`tool-history-${tool}`);
        if (!toolHistoryPanel) return;
        
        const history = this.getToolHistory(tool);
        const historyList = toolHistoryPanel.querySelector('.tool-history-list');
        
        if (historyList) {
            historyList.innerHTML = '';
            
            history.slice(-10).forEach(entry => {
                const item = document.createElement('div');
                item.className = 'tool-history-item';
                item.innerHTML = `
                    <div class="tool-history-command">${this.escapeHtml(entry.command)}</div>
                    <div class="tool-history-timestamp">${entry.timestamp.toLocaleTimeString()}</div>
                `;
                
                historyList.appendChild(item);
            });
        }
    }
    
    // Repeat a command
    repeatCommand(terminalId, command) {
        // Insert command into terminal input
        const terminal = this.app.terminals.get(terminalId);
        if (terminal) {
            // Send the command to the terminal
            this.app.sendMessage({
                type: 'terminal_input',
                terminalId: terminalId,
                data: command + '\r',
                timestamp: Date.now()
            });
        }
    }
    
    // Show command suggestions
    showCommandSuggestions(terminalId, tool) {
        const suggestions = this.getCommandSuggestions(tool);
        if (suggestions.length === 0) return;
        
        // Create suggestions popup
        const popup = document.createElement('div');
        popup.className = 'command-suggestions-popup';
        popup.innerHTML = `
            <div class="suggestions-header">
                <h4>${tool} Commands</h4>
                <button class="close-suggestions">&times;</button>
            </div>
            <div class="suggestions-list">
                ${suggestions.map(cmd => `
                    <div class="suggestion-item" data-command="${this.escapeHtml(cmd)}">
                        <code>${this.escapeHtml(cmd)}</code>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Add to terminal panel
        const terminalPanel = document.getElementById(`panel-${terminalId}`);
        if (terminalPanel) {
            terminalPanel.appendChild(popup);
            
            // Add event listeners
            popup.querySelector('.close-suggestions').addEventListener('click', () => {
                popup.remove();
            });
            
            popup.querySelectorAll('.suggestion-item').forEach(item => {
                item.addEventListener('click', () => {
                    const command = item.dataset.command;
                    this.repeatCommand(terminalId, command);
                    popup.remove();
                });
            });
            
            // Auto-hide after 10 seconds
            setTimeout(() => {
                if (popup.parentNode) {
                    popup.remove();
                }
            }, 10000);
        }
    }
    
    // Format command output with syntax highlighting
    formatCommandOutput(output, commandInfo) {
        if (!commandInfo || !commandInfo.tool) {
            return this.escapeHtml(output);
        }
        
        // Apply tool-specific formatting
        switch (commandInfo.tool) {
            case 'git':
                return this.formatGitOutput(output);
            case 'npm':
                return this.formatNpmOutput(output);
            case 'docker':
                return this.formatDockerOutput(output);
            default:
                return this.escapeHtml(output);
        }
    }
    
    formatGitOutput(output) {
        let formatted = this.escapeHtml(output);
        
        // Highlight git status patterns
        formatted = formatted.replace(/(modified:|new file:|deleted:)/g, '<span class="git-modified">$1</span>');
        formatted = formatted.replace(/(Untracked files:)/g, '<span class="git-untracked">$1</span>');
        formatted = formatted.replace(/(Changes to be committed:)/g, '<span class="git-staged">$1</span>');
        
        return formatted;
    }
    
    formatNpmOutput(output) {
        let formatted = this.escapeHtml(output);
        
        // Highlight npm patterns
        formatted = formatted.replace(/(WARN|WARNING)/g, '<span class="npm-warn">$1</span>');
        formatted = formatted.replace(/(ERROR|ERR!)/g, '<span class="npm-error">$1</span>');
        formatted = formatted.replace(/(✓|✔)/g, '<span class="npm-success">$1</span>');
        
        return formatted;
    }
    
    formatDockerOutput(output) {
        let formatted = this.escapeHtml(output);
        
        // Highlight Docker patterns
        formatted = formatted.replace(/(CONTAINER ID|IMAGE|COMMAND|CREATED|STATUS|PORTS|NAMES)/g, '<span class="docker-header">$1</span>');
        formatted = formatted.replace(/(Up \d+.*|Exited \(\d+\).*)/g, '<span class="docker-status">$1</span>');
        
        return formatted;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Handle command routing events from backend
    handleCommandResult(terminalId, data) {
        console.log('Command result:', terminalId, data);
        
        // Remove from active commands
        this.activeCommands.delete(terminalId);
        
        // Add to history
        if (data.commandInfo) {
            this.addToHistory(terminalId, data.commandInfo.command, data);
            
            if (data.commandInfo.tool) {
                this.addToToolHistory(data.commandInfo.tool, data.commandInfo.command, data);
            }
        }
        
        // Show output in terminal if available
        if (data.output) {
            this.app.handleTerminalOutput(terminalId, data.output);
        }
        
        // Show suggestions if this was a tool command
        if (data.commandInfo && data.commandInfo.tool && data.success) {
            setTimeout(() => {
                this.showCommandSuggestions(terminalId, data.commandInfo.tool);
            }, 1000);
        }
    }
    
    handleCommandError(terminalId, data) {
        console.error('Command error:', terminalId, data);
        
        // Remove from active commands
        this.activeCommands.delete(terminalId);
        
        // Show error in terminal
        if (data.error) {
            this.app.handleTerminalOutput(terminalId, `Error: ${data.error}`);
        }
    }
    
    handleAgentOutput(terminalId, data) {
        console.log('Agent output:', terminalId, data);
        
        // Handle streaming output from AI tools
        if (data.chunk) {
            this.app.handleTerminalOutput(terminalId, data.chunk);
        }
    }
    
    handleCommandRouted(terminalId, data) {
        console.log('Command routed:', terminalId, data);
        
        // Update routing statistics or UI as needed
        if (data.commandInfo && data.commandInfo.isAgentTool) {
            // Show agent tool indicator
            this.showAgentToolIndicator(terminalId, data.commandInfo.tool);
        }
    }
    
    showAgentToolIndicator(terminalId, tool) {
        const terminalTab = document.querySelector(`[data-tab-id="${terminalId}"]`);
        if (terminalTab) {
            terminalTab.classList.add('agent-active');
            terminalTab.setAttribute('title', `AI Agent (${tool}) is processing...`);
            
            // Remove indicator after 30 seconds
            setTimeout(() => {
                terminalTab.classList.remove('agent-active');
                terminalTab.removeAttribute('title');
            }, 30000);
        }
    }
    
    // Check if a command is currently running
    isCommandActive(terminalId) {
        return this.activeCommands.has(terminalId);
    }
    
    // Get currently active command
    getActiveCommand(terminalId) {
        return this.activeCommands.get(terminalId);
    }
    
    // Clear all history
    clearAllHistory() {
        this.commandHistory.clear();
        this.toolHistories.clear();
        this.activeCommands.clear();
    }
    
    // Clear history for a specific terminal
    clearTerminalHistory(terminalId) {
        this.commandHistory.delete(terminalId);
        this.updateCommandHistoryUI(terminalId);
    }
    
    // Clear history for a specific tool
    clearToolHistory(tool) {
        this.toolHistories.delete(tool);
        this.updateToolHistoryUI(tool);
    }
}

// Layout Management System
class LayoutManager {
    constructor(app) {
        this.app = app;
        this.currentLayout = null;
        this.layoutState = null;
        this.availableLayouts = [];
        this.layoutPresets = [];
        this.comparisonMode = false;
        this.syncScrolling = false;
        this.resizeHandlers = new Map();
        
        this.initializeElements();
        this.attachEventListeners();
        this.initializeLayoutPresets();
        this.loadLayoutState();
    }
    
    initializeElements() {
        // Layout Control Elements
        this.layoutPresetsBtn = document.getElementById('layout-presets-btn');
        this.layoutPresetsDropdown = document.getElementById('layout-presets-dropdown');
        this.presetList = document.getElementById('preset-list');
        this.toggleSplitViewBtn = document.getElementById('toggle-split-view');
        this.toggleHorizontalSplitBtn = document.getElementById('toggle-horizontal-split');
        this.toggleComparisonModeBtn = document.getElementById('toggle-comparison-mode');
        this.toggleSyncScrollBtn = document.getElementById('toggle-sync-scroll');
        this.layoutSettingsBtn = document.getElementById('layout-settings-btn');
        
        // Layout Container Elements
        this.layoutPanesContainer = document.getElementById('layout-panes-container');
        this.comparisonModeOverlay = document.getElementById('comparison-mode-overlay');
        this.syncScrollToggle = document.getElementById('sync-scroll-toggle');
        this.exitComparisonModeBtn = document.getElementById('exit-comparison-mode');
        
        // Modal Elements
        this.layoutManagerModal = document.getElementById('layout-manager-modal');
        this.layoutManagerClose = document.getElementById('layout-manager-close');
        this.saveLayoutModal = document.getElementById('save-layout-modal');
        this.saveLayoutClose = document.getElementById('save-layout-close');
        this.importLayoutModal = document.getElementById('import-layout-modal');
        this.importLayoutClose = document.getElementById('import-layout-close');
        
        // Action Elements
        this.saveCurrentLayoutBtn = document.getElementById('save-current-layout-btn');
        this.manageLayoutsBtn = document.getElementById('manage-layouts-btn');
        this.createLayoutBtn = document.getElementById('create-layout-btn');
        this.importLayoutBtn = document.getElementById('import-layout-btn');
        this.resetLayoutsBtn = document.getElementById('reset-layouts-btn');
        
        // Form Elements
        this.layoutNameInput = document.getElementById('layout-name-input');
        this.layoutDescriptionInput = document.getElementById('layout-description-input');
        this.confirmSaveLayoutBtn = document.getElementById('confirm-save-layout');
        this.cancelSaveLayoutBtn = document.getElementById('cancel-save-layout');
        
        this.layoutDataInput = document.getElementById('layout-data-input');
        this.layoutFileInput = document.getElementById('layout-file-input');
        this.confirmImportLayoutBtn = document.getElementById('confirm-import-layout');
        this.cancelImportLayoutBtn = document.getElementById('cancel-import-layout');
        
        // Stats Elements
        this.totalLayoutsSpan = document.getElementById('total-layouts');
        this.customLayoutsSpan = document.getElementById('custom-layouts');
        this.currentLayoutNameSpan = document.getElementById('current-layout-name');
        this.layoutsGrid = document.getElementById('layouts-grid');
    }
    
    attachEventListeners() {
        // Layout Control Listeners
        this.layoutPresetsBtn?.addEventListener('click', () => this.toggleLayoutPresetsDropdown());
        this.toggleSplitViewBtn?.addEventListener('click', () => this.toggleVerticalSplit());
        this.toggleHorizontalSplitBtn?.addEventListener('click', () => this.toggleHorizontalSplit());
        this.toggleComparisonModeBtn?.addEventListener('click', () => this.toggleComparisonMode());
        this.toggleSyncScrollBtn?.addEventListener('click', () => this.toggleSyncScrolling());
        this.layoutSettingsBtn?.addEventListener('click', () => this.openLayoutManager());
        
        // Modal Listeners
        this.layoutManagerClose?.addEventListener('click', () => this.closeLayoutManager());
        this.saveLayoutClose?.addEventListener('click', () => this.closeSaveLayoutModal());
        this.importLayoutClose?.addEventListener('click', () => this.closeImportLayoutModal());
        
        // Action Listeners
        this.saveCurrentLayoutBtn?.addEventListener('click', () => this.openSaveLayoutModal());
        this.manageLayoutsBtn?.addEventListener('click', () => this.openLayoutManager());
        this.createLayoutBtn?.addEventListener('click', () => this.openSaveLayoutModal());
        this.importLayoutBtn?.addEventListener('click', () => this.openImportLayoutModal());
        this.resetLayoutsBtn?.addEventListener('click', () => this.resetLayouts());
        
        // Form Listeners
        this.confirmSaveLayoutBtn?.addEventListener('click', () => this.saveCurrentLayout());
        this.cancelSaveLayoutBtn?.addEventListener('click', () => this.closeSaveLayoutModal());
        this.confirmImportLayoutBtn?.addEventListener('click', () => this.importLayout());
        this.cancelImportLayoutBtn?.addEventListener('click', () => this.closeImportLayoutModal());
        
        // File input listener
        this.layoutFileInput?.addEventListener('change', (e) => this.handleLayoutFile(e));
        this.layoutDataInput?.addEventListener('input', () => this.validateLayoutData());
        
        // Comparison mode listeners
        this.syncScrollToggle?.addEventListener('click', () => this.toggleSyncScrolling());
        this.exitComparisonModeBtn?.addEventListener('click', () => this.exitComparisonMode());
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.layoutPresetsBtn?.contains(e.target) && !this.layoutPresetsDropdown?.contains(e.target)) {
                this.closeLayoutPresetsDropdown();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        
        // Window resize listener
        window.addEventListener('resize', () => this.handleWindowResize());
    }
    
    initializeLayoutPresets() {
        this.layoutPresets = [
            {
                id: 'single-pane',
                name: 'Single Pane',
                description: 'One terminal pane',
                type: 'preset',
                orientation: 'horizontal',
                panes: [{ id: 'main', x: 0, y: 0, width: 100, height: 100 }]
            },
            {
                id: 'vertical-split',
                name: 'Vertical Split',
                description: 'Two panes side by side',
                type: 'preset',
                orientation: 'vertical',
                panes: [
                    { id: 'left', x: 0, y: 0, width: 50, height: 100 },
                    { id: 'right', x: 50, y: 0, width: 50, height: 100 }
                ]
            },
            {
                id: 'horizontal-split',
                name: 'Horizontal Split',
                description: 'Two panes stacked',
                type: 'preset',
                orientation: 'horizontal',
                panes: [
                    { id: 'top', x: 0, y: 0, width: 100, height: 50 },
                    { id: 'bottom', x: 0, y: 50, width: 100, height: 50 }
                ]
            },
            {
                id: 'three-pane-vertical',
                name: '3-Pane Vertical',
                description: 'Three panes side by side',
                type: 'preset',
                orientation: 'vertical',
                panes: [
                    { id: 'left', x: 0, y: 0, width: 33.33, height: 100 },
                    { id: 'center', x: 33.33, y: 0, width: 33.33, height: 100 },
                    { id: 'right', x: 66.66, y: 0, width: 33.34, height: 100 }
                ]
            },
            {
                id: 'four-pane-grid',
                name: '4-Pane Grid',
                description: '2x2 grid layout',
                type: 'preset',
                orientation: 'grid',
                panes: [
                    { id: 'top-left', x: 0, y: 0, width: 50, height: 50 },
                    { id: 'top-right', x: 50, y: 0, width: 50, height: 50 },
                    { id: 'bottom-left', x: 0, y: 50, width: 50, height: 50 },
                    { id: 'bottom-right', x: 50, y: 50, width: 50, height: 50 }
                ]
            }
        ];
        
        this.populatePresetsDropdown();
    }
    
    populatePresetsDropdown() {
        if (!this.presetList) return;
        
        this.presetList.innerHTML = '';
        
        this.layoutPresets.forEach(preset => {
            const presetElement = document.createElement('div');
            presetElement.className = 'preset-item';
            presetElement.dataset.layoutId = preset.id;
            
            presetElement.innerHTML = `
                <div class="preset-preview ${preset.id}"></div>
                <div class="preset-info">
                    <div class="preset-name">${preset.name}</div>
                    <div class="preset-description">${preset.description}</div>
                </div>
            `;
            
            presetElement.addEventListener('click', () => {
                this.applyLayout(preset);
                this.closeLayoutPresetsDropdown();
            });
            
            this.presetList.appendChild(presetElement);
        });
    }
    
    async loadLayoutState() {
        try {
            // Load from localStorage first
            const savedState = localStorage.getItem(`layoutState_${this.app.currentUuid}`);
            if (savedState) {
                this.layoutState = JSON.parse(savedState);
            }
            
            // Load from server if connected
            if (this.app.isConnected) {
                const response = await this.sendLayoutMessage('layout_get');
                if (response && response.layout) {
                    this.currentLayout = response.layout;
                    this.applyLayoutToUI(response.layout);
                }
                
                const stateResponse = await this.sendLayoutMessage('layout_state');
                if (stateResponse && stateResponse.state) {
                    this.layoutState = stateResponse.state;
                }
                
                this.loadAvailableLayouts();
            } else {
                // Apply default layout if no saved state
                if (!this.layoutState) {
                    this.applyLayout(this.layoutPresets[0]); // Single pane default
                }
            }
        } catch (error) {
            console.error('Error loading layout state:', error);
            this.applyLayout(this.layoutPresets[0]); // Fallback to single pane
        }
    }
    
    async loadAvailableLayouts() {
        try {
            const response = await this.sendLayoutMessage('layout_list');
            if (response && response.layouts) {
                this.availableLayouts = response.layouts;
                this.updateLayoutManagerUI();
            }
        } catch (error) {
            console.error('Error loading available layouts:', error);
        }
    }
    
    sendLayoutMessage(type, data = {}) {
        if (!this.app.wsConnection) {
            return Promise.reject(new Error('No WebSocket connection'));
        }
        
        return new Promise((resolve, reject) => {
            const messageId = `layout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const message = {
                type,
                uuid: this.app.currentUuid,
                ...data,
                messageId
            };
            
            // Store the resolver for this message
            if (!this.app.layoutMessageResolvers) {
                this.app.layoutMessageResolvers = new Map();
            }
            this.app.layoutMessageResolvers.set(messageId, { resolve, reject });
            
            // Set timeout
            setTimeout(() => {
                if (this.app.layoutMessageResolvers.has(messageId)) {
                    this.app.layoutMessageResolvers.delete(messageId);
                    reject(new Error('Layout message timeout'));
                }
            }, 10000);
            
            this.app.wsConnection.send(JSON.stringify(message));
        });
    }
    
    handleLayoutMessage(message) {
        // Handle layout-related WebSocket messages
        switch (message.type) {
            case 'layout_changed':
                this.handleLayoutChanged(message.data);
                break;
            case 'layout_state_updated':
                this.handleLayoutStateUpdated(message.data);
                break;
            case 'layout_pane_resized':
                this.handlePaneResized(message.paneId, message.data);
                break;
            case 'layout_comparison_changed':
                this.handleComparisonModeChanged(message.data);
                break;
            default:
                // Handle response messages
                if (message.messageId && this.app.layoutMessageResolvers) {
                    const resolver = this.app.layoutMessageResolvers.get(message.messageId);
                    if (resolver) {
                        this.app.layoutMessageResolvers.delete(message.messageId);
                        resolver.resolve(message.data || message);
                    }
                }
                break;
        }
    }
    
    handleLayoutChanged(data) {
        if (data.layout) {
            this.currentLayout = data.layout;
            this.applyLayoutToUI(data.layout);
        }
        if (data.state) {
            this.layoutState = data.state;
        }
        this.saveLayoutState();
    }
    
    handleLayoutStateUpdated(data) {
        if (data.state) {
            this.layoutState = { ...this.layoutState, ...data.state };
            this.saveLayoutState();
        }
    }
    
    handlePaneResized(paneId, data) {
        const pane = document.querySelector(`[data-pane-id="${paneId}"]`);
        if (pane && data.width && data.height) {
            pane.style.width = `${data.width}%`;
            pane.style.height = `${data.height}%`;
        }
    }
    
    handleComparisonModeChanged(data) {
        this.comparisonMode = data.enabled;
        this.updateComparisonModeUI();
    }
    
    applyLayout(layout) {
        if (!layout) return;
        
        this.currentLayout = layout;
        this.applyLayoutToUI(layout);
        
        // Send to server if connected
        if (this.app.isConnected) {
            this.sendLayoutMessage('layout_set', { layoutId: layout.id });
        }
        
        this.saveLayoutState();
    }
    
    applyLayoutToUI(layout) {
        if (!this.layoutPanesContainer || !layout) return;
        
        // Apply layout class to container
        this.layoutPanesContainer.className = `layout-panes-container ${layout.id}`;
        
        // Clear existing panes
        this.layoutPanesContainer.innerHTML = '';
        
        // Create panes based on layout
        layout.panes.forEach((paneConfig, index) => {
            const pane = this.createLayoutPane(paneConfig, index === 0);
            this.layoutPanesContainer.appendChild(pane);
        });
        
        // Update active state for controls
        this.updateControlStates(layout);
        
        // Update current layout name
        if (this.currentLayoutNameSpan) {
            this.currentLayoutNameSpan.textContent = layout.name;
        }
    }
    
    createLayoutPane(paneConfig, isActive = false) {
        const pane = document.createElement('div');
        pane.className = `layout-pane${isActive ? ' active' : ''}${paneConfig.terminalId ? '' : ' placeholder'}`;
        pane.dataset.paneId = paneConfig.id;
        pane.style.gridArea = this.calculateGridArea(paneConfig);
        
        if (paneConfig.terminalId) {
            // Pane with terminal
            pane.innerHTML = `
                <div class="pane-header">
                    <div class="pane-title">${paneConfig.name || `Terminal ${paneConfig.id}`}</div>
                    <div class="pane-controls">
                        <button class="pane-control-btn" data-action="split-vertical" title="Split Vertically">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="8" height="18"/>
                                <rect x="13" y="3" width="8" height="18"/>
                            </svg>
                        </button>
                        <button class="pane-control-btn" data-action="split-horizontal" title="Split Horizontally">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="8"/>
                                <rect x="3" y="13" width="18" height="8"/>
                            </svg>
                        </button>
                        <button class="pane-control-btn" data-action="close" title="Close Pane">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="pane-content">
                    <div class="terminal-panels">
                        <!-- Terminal content will be moved here -->
                    </div>
                </div>
                <div class="resize-handle resize-handle-right" data-direction="right"></div>
                <div class="resize-handle resize-handle-bottom" data-direction="bottom"></div>
                <div class="resize-handle resize-handle-corner" data-direction="corner"></div>
            `;
        } else {
            // Placeholder pane
            pane.innerHTML = `
                <div class="placeholder-content">
                    <div class="placeholder-icon">📱</div>
                    <div class="placeholder-text">Drop a terminal here or click to assign</div>
                </div>
            `;
        }
        
        // Add event listeners
        this.attachPaneEventListeners(pane);
        
        return pane;
    }
    
    attachPaneEventListeners(pane) {
        // Pane controls
        const controls = pane.querySelectorAll('.pane-control-btn');
        controls.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const paneId = pane.dataset.paneId;
                this.handlePaneAction(action, paneId);
            });
        });
        
        // Resize handles
        const resizeHandles = pane.querySelectorAll('.resize-handle');
        resizeHandles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                this.startResize(e, pane, handle.dataset.direction);
            });
        });
        
        // Pane click for activation
        pane.addEventListener('click', () => {
            this.setActivePane(pane.dataset.paneId);
        });
        
        // Placeholder click for terminal assignment
        if (pane.classList.contains('placeholder')) {
            pane.addEventListener('click', () => {
                this.showTerminalAssignmentDialog(pane.dataset.paneId);
            });
        }
    }
    
    calculateGridArea(paneConfig) {
        // Convert percentage-based coordinates to CSS grid area
        // This is a simplified version - in practice, you'd want more sophisticated grid calculation
        const col = Math.round(paneConfig.x / 50) + 1;
        const row = Math.round(paneConfig.y / 50) + 1;
        const colSpan = Math.max(1, Math.round(paneConfig.width / 50));
        const rowSpan = Math.max(1, Math.round(paneConfig.height / 50));
        
        return `${row} / ${col} / ${row + rowSpan} / ${col + colSpan}`;
    }
    
    updateControlStates(layout) {
        // Update button active states based on current layout
        const buttons = [
            { element: this.toggleSplitViewBtn, layouts: ['vertical-split'] },
            { element: this.toggleHorizontalSplitBtn, layouts: ['horizontal-split'] },
        ];
        
        buttons.forEach(({ element, layouts }) => {
            if (element) {
                element.classList.toggle('active', layouts.includes(layout.id));
            }
        });
        
        // Update comparison mode button
        if (this.toggleComparisonModeBtn) {
            this.toggleComparisonModeBtn.classList.toggle('active', this.comparisonMode);
        }
        
        // Update sync scroll button
        if (this.toggleSyncScrollBtn) {
            this.toggleSyncScrollBtn.classList.toggle('active', this.syncScrolling);
        }
    }
    
    // Layout Actions
    toggleVerticalSplit() {
        const isActive = this.currentLayout?.id === 'vertical-split';
        const targetLayout = isActive ? this.layoutPresets[0] : this.layoutPresets[1]; // single-pane or vertical-split
        this.applyLayout(targetLayout);
    }
    
    toggleHorizontalSplit() {
        const isActive = this.currentLayout?.id === 'horizontal-split';
        const targetLayout = isActive ? this.layoutPresets[0] : this.layoutPresets[2]; // single-pane or horizontal-split
        this.applyLayout(targetLayout);
    }
    
    toggleComparisonMode() {
        this.comparisonMode = !this.comparisonMode;
        this.updateComparisonModeUI();
        
        if (this.app.isConnected) {
            this.sendLayoutMessage('layout_comparison', {
                enabled: this.comparisonMode,
                panes: this.getSelectedPanes()
            });
        }
    }
    
    toggleSyncScrolling() {
        this.syncScrolling = !this.syncScrolling;
        this.updateSyncScrollUI();
        
        if (this.app.isConnected) {
            this.sendLayoutMessage('layout_sync_scroll', {
                enabled: this.syncScrolling
            });
        }
    }
    
    updateComparisonModeUI() {
        if (this.comparisonModeOverlay) {
            this.comparisonModeOverlay.style.display = this.comparisonMode ? 'block' : 'none';
        }
        
        if (this.toggleComparisonModeBtn) {
            this.toggleComparisonModeBtn.classList.toggle('active', this.comparisonMode);
        }
    }
    
    updateSyncScrollUI() {
        if (this.toggleSyncScrollBtn) {
            this.toggleSyncScrollBtn.classList.toggle('active', this.syncScrolling);
        }
        
        if (this.syncScrollToggle) {
            this.syncScrollToggle.classList.toggle('active', this.syncScrolling);
        }
    }
    
    exitComparisonMode() {
        this.comparisonMode = false;
        this.updateComparisonModeUI();
        
        if (this.app.isConnected) {
            this.sendLayoutMessage('layout_comparison', {
                enabled: false,
                panes: []
            });
        }
    }
    
    getSelectedPanes() {
        // Return array of currently visible pane IDs
        const panes = this.layoutPanesContainer?.querySelectorAll('.layout-pane');
        return Array.from(panes || []).map(pane => pane.dataset.paneId);
    }
    
    // UI Management
    toggleLayoutPresetsDropdown() {
        if (!this.layoutPresetsDropdown) return;
        
        const isVisible = this.layoutPresetsDropdown.style.display !== 'none';
        this.layoutPresetsDropdown.style.display = isVisible ? 'none' : 'block';
    }
    
    closeLayoutPresetsDropdown() {
        if (this.layoutPresetsDropdown) {
            this.layoutPresetsDropdown.style.display = 'none';
        }
    }
    
    openLayoutManager() {
        if (this.layoutManagerModal) {
            this.layoutManagerModal.style.display = 'block';
            this.loadAvailableLayouts();
        }
    }
    
    closeLayoutManager() {
        if (this.layoutManagerModal) {
            this.layoutManagerModal.style.display = 'none';
        }
    }
    
    openSaveLayoutModal() {
        if (this.saveLayoutModal) {
            this.saveLayoutModal.style.display = 'block';
            this.generateLayoutPreview();
        }
    }
    
    closeSaveLayoutModal() {
        if (this.saveLayoutModal) {
            this.saveLayoutModal.style.display = 'none';
            this.clearSaveLayoutForm();
        }
    }
    
    openImportLayoutModal() {
        if (this.importLayoutModal) {
            this.importLayoutModal.style.display = 'block';
        }
    }
    
    closeImportLayoutModal() {
        if (this.importLayoutModal) {
            this.importLayoutModal.style.display = 'none';
            this.clearImportLayoutForm();
        }
    }
    
    // Save/Load State
    saveLayoutState() {
        if (this.app.currentUuid && this.layoutState) {
            localStorage.setItem(`layoutState_${this.app.currentUuid}`, JSON.stringify(this.layoutState));
        }
    }
    
    // Keyboard Shortcuts
    handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case '1':
                    e.preventDefault();
                    this.applyLayout(this.layoutPresets[0]); // Single pane
                    break;
                case '2':
                    e.preventDefault();
                    this.applyLayout(this.layoutPresets[1]); // Vertical split
                    break;
                case '3':
                    e.preventDefault();
                    this.applyLayout(this.layoutPresets[2]); // Horizontal split
                    break;
                case '4':
                    e.preventDefault();
                    this.applyLayout(this.layoutPresets[3]); // Three pane
                    break;
                case 'g':
                    e.preventDefault();
                    this.applyLayout(this.layoutPresets[4]); // Four pane grid
                    break;
                case 'm':
                    e.preventDefault();
                    this.toggleComparisonMode();
                    break;
                case 's':
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.openSaveLayoutModal();
                    }
                    break;
            }
        }
    }
    
    // Window Resize Handler
    handleWindowResize() {
        // Recalculate pane sizes on window resize
        if (this.currentLayout && this.layoutPanesContainer) {
            // This would typically recalculate responsive grid areas
            // For now, we'll just trigger a layout refresh
            this.applyLayoutToUI(this.currentLayout);
        }
    }
    
    // Placeholder implementations for remaining methods
    handlePaneAction(action, paneId) {
        console.log(`Pane action: ${action} on pane ${paneId}`);
        // TODO: Implement pane actions (split, close, etc.)
    }
    
    setActivePane(paneId) {
        // Update active pane state
        const panes = this.layoutPanesContainer?.querySelectorAll('.layout-pane');
        panes?.forEach(pane => {
            pane.classList.toggle('active', pane.dataset.paneId === paneId);
        });
    }
    
    showTerminalAssignmentDialog(paneId) {
        console.log(`Show terminal assignment dialog for pane ${paneId}`);
        // TODO: Implement terminal assignment dialog
    }
    
    startResize(e, pane, direction) {
        console.log(`Start resize: ${direction} on pane ${pane.dataset.paneId}`);
        // TODO: Implement resize functionality
    }
    
    updateLayoutManagerUI() {
        // Update layout manager modal with available layouts
        if (this.totalLayoutsSpan) {
            this.totalLayoutsSpan.textContent = this.availableLayouts.length;
        }
        
        if (this.customLayoutsSpan) {
            const customCount = this.availableLayouts.filter(l => l.type === 'custom').length;
            this.customLayoutsSpan.textContent = customCount;
        }
        
        this.populateLayoutsGrid();
    }
    
    populateLayoutsGrid() {
        if (!this.layoutsGrid) return;
        
        this.layoutsGrid.innerHTML = '';
        
        [...this.layoutPresets, ...this.availableLayouts].forEach(layout => {
            const card = this.createLayoutCard(layout);
            this.layoutsGrid.appendChild(card);
        });
    }
    
    createLayoutCard(layout) {
        const card = document.createElement('div');
        card.className = `layout-card ${layout.id === this.currentLayout?.id ? 'active' : ''}`;
        card.dataset.layoutId = layout.id;
        
        card.innerHTML = `
            <div class="layout-preview-mini ${layout.id}"></div>
            <div class="layout-name">${layout.name}</div>
            <div class="layout-description">${layout.description || ''}</div>
            <div class="layout-meta">
                <span class="layout-type">${layout.type === 'preset' ? 'Preset' : 'Custom'}</span>
                <span class="layout-panes">${layout.panes?.length || 0} panes</span>
            </div>
            <div class="layout-actions">
                <button class="layout-action-btn" data-action="apply" title="Apply Layout">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20,6 9,17 4,12"/>
                    </svg>
                </button>
                ${layout.type === 'custom' ? `
                    <button class="layout-action-btn" data-action="export" title="Export Layout">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7,10 12,15 17,10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                    </button>
                    <button class="layout-action-btn" data-action="delete" title="Delete Layout">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18"/>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
        `;
        
        // Add event listeners
        card.addEventListener('click', () => {
            this.applyLayout(layout);
            this.closeLayoutManager();
        });
        
        const actionBtns = card.querySelectorAll('.layout-action-btn');
        actionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleLayoutCardAction(btn.dataset.action, layout);
            });
        });
        
        return card;
    }
    
    handleLayoutCardAction(action, layout) {
        switch (action) {
            case 'apply':
                this.applyLayout(layout);
                this.closeLayoutManager();
                break;
            case 'export':
                this.exportLayout(layout);
                break;
            case 'delete':
                this.deleteLayout(layout);
                break;
        }
    }
    
    generateLayoutPreview() {
        // Generate preview of current layout for save modal
        const preview = document.getElementById('layout-preview');
        if (preview && this.currentLayout) {
            preview.innerHTML = `
                <div class="preview-layout ${this.currentLayout.id}">
                    <div class="preview-text">${this.currentLayout.name} Layout</div>
                    <div class="preview-panes">${this.currentLayout.panes?.length || 0} panes</div>
                </div>
            `;
        }
    }
    
    clearSaveLayoutForm() {
        if (this.layoutNameInput) this.layoutNameInput.value = '';
        if (this.layoutDescriptionInput) this.layoutDescriptionInput.value = '';
    }
    
    clearImportLayoutForm() {
        if (this.layoutDataInput) this.layoutDataInput.value = '';
        if (this.layoutFileInput) this.layoutFileInput.value = '';
        if (this.confirmImportLayoutBtn) this.confirmImportLayoutBtn.disabled = true;
    }
    
    validateLayoutData() {
        // Validate JSON layout data in import modal
        const data = this.layoutDataInput?.value;
        if (!data) {
            this.confirmImportLayoutBtn.disabled = true;
            return;
        }
        
        try {
            const layout = JSON.parse(data);
            const isValid = layout.name && layout.panes && Array.isArray(layout.panes);
            this.confirmImportLayoutBtn.disabled = !isValid;
            
            if (isValid) {
                document.getElementById('layout-validation').style.display = 'block';
                document.getElementById('imported-layout-info').textContent = 
                    `Layout: ${layout.name} (${layout.panes.length} panes)`;
            }
        } catch (e) {
            this.confirmImportLayoutBtn.disabled = true;
            document.getElementById('layout-validation').style.display = 'none';
        }
    }
    
    handleLayoutFile(e) {
        const file = e.target.files[0];
        if (file && file.type === 'application/json') {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.layoutDataInput.value = e.target.result;
                this.validateLayoutData();
            };
            reader.readAsText(file);
        }
    }
    
    async saveCurrentLayout() {
        const name = this.layoutNameInput?.value?.trim();
        const description = this.layoutDescriptionInput?.value?.trim();
        
        if (!name) {
            this.showError('layout-name-error', 'Layout name is required');
            return;
        }
        
        try {
            const layoutData = {
                name,
                description,
                orientation: this.currentLayout?.orientation || 'horizontal',
                panes: this.currentLayout?.panes || []
            };
            
            if (this.app.isConnected) {
                await this.sendLayoutMessage('layout_create', layoutData);
            }
            
            this.closeSaveLayoutModal();
            this.loadAvailableLayouts();
        } catch (error) {
            console.error('Error saving layout:', error);
            this.showError('layout-name-error', 'Failed to save layout');
        }
    }
    
    async importLayout() {
        const data = this.layoutDataInput?.value;
        if (!data) return;
        
        try {
            if (this.app.isConnected) {
                await this.sendLayoutMessage('layout_import', { layoutData: data });
            }
            
            this.closeImportLayoutModal();
            this.loadAvailableLayouts();
        } catch (error) {
            console.error('Error importing layout:', error);
            this.showError('layout-data-error', 'Failed to import layout');
        }
    }
    
    async exportLayout(layout) {
        try {
            if (this.app.isConnected) {
                const response = await this.sendLayoutMessage('layout_export', { layoutId: layout.id });
                if (response.exportData) {
                    this.downloadFile(`${layout.name}.json`, response.exportData);
                }
            }
        } catch (error) {
            console.error('Error exporting layout:', error);
        }
    }
    
    async deleteLayout(layout) {
        if (confirm(`Are you sure you want to delete the layout "${layout.name}"?`)) {
            try {
                if (this.app.isConnected) {
                    await this.sendLayoutMessage('layout_delete', { layoutId: layout.id });
                }
                this.loadAvailableLayouts();
            } catch (error) {
                console.error('Error deleting layout:', error);
            }
        }
    }
    
    async resetLayouts() {
        if (confirm('This will reset all layouts to defaults. Are you sure?')) {
            try {
                // Clear custom layouts and reset to defaults
                if (this.app.isConnected) {
                    // Delete all custom layouts
                    const customLayouts = this.availableLayouts.filter(l => l.type === 'custom');
                    for (const layout of customLayouts) {
                        await this.sendLayoutMessage('layout_delete', { layoutId: layout.id });
                    }
                }
                
                // Apply single pane layout
                this.applyLayout(this.layoutPresets[0]);
                this.loadAvailableLayouts();
            } catch (error) {
                console.error('Error resetting layouts:', error);
            }
        }
    }
    
    showError(elementId, message) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            setTimeout(() => {
                errorElement.style.display = 'none';
            }, 5000);
        }
    }
    
    downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Global functions
function showAbout() {
    alert('DuckBridge - Remote Terminal Access\\n\\nBuilt with 🦆 for developers\\n\\nConnect to your local terminal from anywhere with secure WebSocket connections.');
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new DuckBridgeApp();
    window.app = app; // Make app globally accessible
    app.checkStoredConnection();
});