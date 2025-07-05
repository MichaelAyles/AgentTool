// AI Agent Dashboard for DuckBridge
class AgentDashboard {
    constructor(app) {
        this.app = app;
        this.agents = new Map();
        this.agentTasks = new Map();
        this.agentMessages = [];
        this.systemMetrics = null;
        this.refreshInterval = null;
        this.isVisible = false;
        this.initializeElements();
        this.attachEventListeners();
        this.startMetricsPolling();
    }

    initializeElements() {
        // Create agent dashboard modal
        this.createAgentDashboardModal();
        
        // Get existing elements
        this.agentDashboardBtn = document.getElementById('agent-dashboard-btn');
        this.agentModal = document.getElementById('agent-dashboard-modal');
        this.agentClose = document.getElementById('agent-dashboard-close');
        
        // Dashboard sections
        this.systemStatusSection = document.getElementById('agent-system-status');
        this.agentListSection = document.getElementById('agent-list');
        this.taskListSection = document.getElementById('agent-tasks');
        this.metricsSection = document.getElementById('agent-metrics');
        this.messagesSection = document.getElementById('agent-messages');
        
        // Control buttons
        this.refreshBtn = document.getElementById('refresh-agents');
        this.createAgentBtn = document.getElementById('create-agent');
        this.taskSubmitBtn = document.getElementById('submit-task');
        this.clearHistoryBtn = document.getElementById('clear-agent-history');
        
        // Forms
        this.createAgentForm = document.getElementById('create-agent-form');
        this.taskForm = document.getElementById('task-form');
    }

    createAgentDashboardModal() {
        const modalHTML = `
            <div id="agent-dashboard-modal" class="modal agent-dashboard-modal">
                <div class="modal-content agent-dashboard-content">
                    <div class="modal-header">
                        <h3>🤖 AI Agent Dashboard</h3>
                        <button id="agent-dashboard-close" class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <!-- Dashboard Tabs -->
                        <div class="dashboard-tabs">
                            <button class="tab-btn active" data-tab="overview">Overview</button>
                            <button class="tab-btn" data-tab="agents">Agents</button>
                            <button class="tab-btn" data-tab="tasks">Tasks</button>
                            <button class="tab-btn" data-tab="messages">Messages</button>
                            <button class="tab-btn" data-tab="metrics">Metrics</button>
                        </div>

                        <!-- Overview Tab -->
                        <div class="tab-content active" id="overview-tab">
                            <div class="system-status-cards">
                                <div class="status-card">
                                    <div class="status-icon">🤖</div>
                                    <div class="status-content">
                                        <div class="status-number" id="total-agents">-</div>
                                        <div class="status-label">Active Agents</div>
                                    </div>
                                </div>
                                <div class="status-card">
                                    <div class="status-icon">📋</div>
                                    <div class="status-content">
                                        <div class="status-number" id="active-tasks">-</div>
                                        <div class="status-label">Active Tasks</div>
                                    </div>
                                </div>
                                <div class="status-card">
                                    <div class="status-icon">✅</div>
                                    <div class="status-content">
                                        <div class="status-number" id="completed-tasks">-</div>
                                        <div class="status-label">Completed</div>
                                    </div>
                                </div>
                                <div class="status-card">
                                    <div class="status-icon">💻</div>
                                    <div class="status-content">
                                        <div class="status-number" id="system-memory">-</div>
                                        <div class="status-label">Memory (MB)</div>
                                    </div>
                                </div>
                            </div>

                            <div class="system-health-section">
                                <h4>System Health</h4>
                                <div class="health-indicators">
                                    <div class="health-indicator">
                                        <span class="health-label">Agent System:</span>
                                        <span class="health-status" id="agent-system-health">Checking...</span>
                                    </div>
                                    <div class="health-indicator">
                                        <span class="health-label">Message Bus:</span>
                                        <span class="health-status" id="message-bus-health">Checking...</span>
                                    </div>
                                    <div class="health-indicator">
                                        <span class="health-label">Agent Coordination:</span>
                                        <span class="health-status" id="coordination-health">Checking...</span>
                                    </div>
                                </div>
                            </div>

                            <div class="quick-actions">
                                <h4>Quick Actions</h4>
                                <div class="action-buttons">
                                    <button class="action-btn" onclick="agentDashboard.showCreateAgentForm()">
                                        <span class="btn-icon">➕</span>
                                        Create Agent
                                    </button>
                                    <button class="action-btn" onclick="agentDashboard.showSubmitTaskForm()">
                                        <span class="btn-icon">📋</span>
                                        Submit Task
                                    </button>
                                    <button class="action-btn" onclick="agentDashboard.refreshData()">
                                        <span class="btn-icon">🔄</span>
                                        Refresh Data
                                    </button>
                                    <button class="action-btn" onclick="agentDashboard.exportSystemState()">
                                        <span class="btn-icon">💾</span>
                                        Export State
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Agents Tab -->
                        <div class="tab-content" id="agents-tab">
                            <div class="agents-header">
                                <h4>Agent Management</h4>
                                <div class="agents-controls">
                                    <button id="refresh-agents" class="control-btn">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="23 4 23 10 17 10"/>
                                            <polyline points="1 20 1 14 7 14"/>
                                            <path d="m3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                                        </svg>
                                        Refresh
                                    </button>
                                    <button id="create-agent" class="control-btn primary">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <line x1="12" y1="5" x2="12" y2="19"/>
                                            <line x1="5" y1="12" x2="19" y2="12"/>
                                        </svg>
                                        Create Agent
                                    </button>
                                </div>
                            </div>
                            <div id="agent-list" class="agent-list">
                                <!-- Agents will be populated here -->
                            </div>
                        </div>

                        <!-- Tasks Tab -->
                        <div class="tab-content" id="tasks-tab">
                            <div class="tasks-header">
                                <h4>Task Management</h4>
                                <div class="tasks-controls">
                                    <button id="submit-task" class="control-btn primary">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <line x1="12" y1="5" x2="12" y2="19"/>
                                            <line x1="5" y1="12" x2="19" y2="12"/>
                                        </svg>
                                        Submit Task
                                    </button>
                                </div>
                            </div>
                            <div id="agent-tasks" class="task-list">
                                <!-- Tasks will be populated here -->
                            </div>
                        </div>

                        <!-- Messages Tab -->
                        <div class="tab-content" id="messages-tab">
                            <div class="messages-header">
                                <h4>Agent Communication</h4>
                                <div class="messages-controls">
                                    <button id="clear-messages" class="control-btn">Clear Messages</button>
                                    <button id="send-broadcast" class="control-btn primary">Send Broadcast</button>
                                </div>
                            </div>
                            <div id="agent-messages" class="messages-list">
                                <!-- Messages will be populated here -->
                            </div>
                        </div>

                        <!-- Metrics Tab -->
                        <div class="tab-content" id="metrics-tab">
                            <div class="metrics-header">
                                <h4>System Metrics</h4>
                                <div class="metrics-controls">
                                    <button id="export-metrics" class="control-btn">Export Metrics</button>
                                    <button id="clear-agent-history" class="control-btn">Clear History</button>
                                </div>
                            </div>
                            <div id="agent-metrics" class="metrics-content">
                                <!-- Metrics will be populated here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Create Agent Form Modal -->
            <div id="create-agent-modal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Create New Agent</h3>
                        <button class="modal-close" onclick="agentDashboard.hideCreateAgentForm()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-agent-form">
                            <div class="form-group">
                                <label for="agent-type">Agent Type:</label>
                                <select id="agent-type" required>
                                    <option value="">Select agent type...</option>
                                    <option value="claude_code">Claude Code Agent</option>
                                    <option value="gemini">Gemini Agent</option>
                                    <option value="monitor">Monitor Agent</option>
                                    <option value="coordinator">Coordinator Agent</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="agent-name">Agent Name:</label>
                                <input type="text" id="agent-name" placeholder="Optional custom name">
                            </div>
                            <div class="form-group">
                                <label for="agent-config">Configuration (JSON):</label>
                                <textarea id="agent-config" placeholder='{"maxConcurrentTasks": 5}' rows="4"></textarea>
                            </div>
                            <div class="form-actions">
                                <button type="button" onclick="agentDashboard.hideCreateAgentForm()">Cancel</button>
                                <button type="submit">Create Agent</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <!-- Submit Task Form Modal -->
            <div id="submit-task-modal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Submit Agent Task</h3>
                        <button class="modal-close" onclick="agentDashboard.hideSubmitTaskForm()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="task-form">
                            <div class="form-group">
                                <label for="task-type">Task Type:</label>
                                <select id="task-type" required>
                                    <option value="">Select task type...</option>
                                    <option value="code_generation">Code Generation</option>
                                    <option value="code_review">Code Review</option>
                                    <option value="debugging">Debugging</option>
                                    <option value="documentation">Documentation</option>
                                    <option value="testing">Testing</option>
                                    <option value="refactoring">Refactoring</option>
                                    <option value="analysis">Analysis</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="task-description">Description:</label>
                                <textarea id="task-description" placeholder="Describe what you want the agents to do..." required rows="3"></textarea>
                            </div>
                            <div class="form-group">
                                <label for="task-priority">Priority:</label>
                                <select id="task-priority">
                                    <option value="low">Low</option>
                                    <option value="medium" selected>Medium</option>
                                    <option value="high">High</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="task-context">Context (JSON):</label>
                                <textarea id="task-context" placeholder='{"terminalId": "terminal1", "files": ["file.js"]}' rows="3"></textarea>
                            </div>
                            <div class="form-actions">
                                <button type="button" onclick="agentDashboard.hideSubmitTaskForm()">Cancel</button>
                                <button type="submit">Submit Task</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Add agent dashboard button to header if it doesn't exist
        if (!document.getElementById('agent-dashboard-btn')) {
            const headerControls = document.querySelector('.header-controls');
            if (headerControls) {
                headerControls.insertAdjacentHTML('beforeend', `
                    <button id="agent-dashboard-btn" class="header-btn" title="AI Agent Dashboard">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="7" height="9"/>
                            <rect x="14" y="3" width="7" height="5"/>
                            <rect x="14" y="12" width="7" height="9"/>
                            <rect x="3" y="16" width="7" height="5"/>
                        </svg>
                    </button>
                `);
            }
        }
    }

    attachEventListeners() {
        // Dashboard modal controls
        if (this.agentDashboardBtn) {
            this.agentDashboardBtn.addEventListener('click', () => this.show());
        }
        if (this.agentClose) {
            this.agentClose.addEventListener('click', () => this.hide());
        }

        // Tab switching
        document.querySelectorAll('.dashboard-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Control buttons
        const refreshBtn = document.getElementById('refresh-agents');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshData());
        }

        const createAgentBtn = document.getElementById('create-agent');
        if (createAgentBtn) {
            createAgentBtn.addEventListener('click', () => this.showCreateAgentForm());
        }

        const submitTaskBtn = document.getElementById('submit-task');
        if (submitTaskBtn) {
            submitTaskBtn.addEventListener('click', () => this.showSubmitTaskForm());
        }

        // Forms
        const createAgentForm = document.getElementById('create-agent-form');
        if (createAgentForm) {
            createAgentForm.addEventListener('submit', (e) => this.handleCreateAgent(e));
        }

        const taskForm = document.getElementById('task-form');
        if (taskForm) {
            taskForm.addEventListener('submit', (e) => this.handleSubmitTask(e));
        }

        // Clear buttons
        const clearMessagesBtn = document.getElementById('clear-messages');
        if (clearMessagesBtn) {
            clearMessagesBtn.addEventListener('click', () => this.clearMessages());
        }

        const clearHistoryBtn = document.getElementById('clear-agent-history');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => this.clearHistory());
        }

        // Broadcast button
        const sendBroadcastBtn = document.getElementById('send-broadcast');
        if (sendBroadcastBtn) {
            sendBroadcastBtn.addEventListener('click', () => this.showBroadcastForm());
        }

        // Export buttons
        const exportMetricsBtn = document.getElementById('export-metrics');
        if (exportMetricsBtn) {
            exportMetricsBtn.addEventListener('click', () => this.exportMetrics());
        }

        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === this.agentModal) {
                this.hide();
            }
        });
    }

    async show() {
        this.isVisible = true;
        this.agentModal.style.display = 'block';
        await this.refreshData();
    }

    hide() {
        this.isVisible = false;
        this.agentModal.style.display = 'none';
    }

    switchTab(tabName) {
        // Remove active class from all tabs and content
        document.querySelectorAll('.dashboard-tabs .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // Add active class to selected tab and content
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Load tab-specific data
        this.loadTabData(tabName);
    }

    async loadTabData(tabName) {
        switch (tabName) {
            case 'overview':
                await this.loadOverviewData();
                break;
            case 'agents':
                await this.loadAgentsList();
                break;
            case 'tasks':
                await this.loadTasksList();
                break;
            case 'messages':
                await this.loadMessagesList();
                break;
            case 'metrics':
                await this.loadMetricsData();
                break;
        }
    }

    async refreshData() {
        try {
            // Get system status
            const response = await fetch(`http://localhost:3001/agents`);
            const data = await response.json();
            
            if (data.success) {
                this.systemMetrics = data.system;
                this.agents.clear();
                
                // Process agents
                Object.entries(data.agents).forEach(([agentId, status]) => {
                    this.agents.set(agentId, status);
                });

                this.updateOverviewCards();
                this.updateHealthIndicators();
                
                // Refresh current tab data
                const activeTab = document.querySelector('.dashboard-tabs .tab-btn.active');
                if (activeTab) {
                    await this.loadTabData(activeTab.dataset.tab);
                }
            }
        } catch (error) {
            console.error('Failed to refresh agent data:', error);
            this.showError('Failed to refresh agent data');
        }
    }

    updateOverviewCards() {
        if (!this.systemMetrics) return;

        const totalAgentsEl = document.getElementById('total-agents');
        const activeTasksEl = document.getElementById('active-tasks');
        const completedTasksEl = document.getElementById('completed-tasks');
        const systemMemoryEl = document.getElementById('system-memory');

        if (totalAgentsEl) totalAgentsEl.textContent = this.systemMetrics.agents.total;
        if (activeTasksEl) activeTasksEl.textContent = this.systemMetrics.tasks.active;
        if (completedTasksEl) completedTasksEl.textContent = this.systemMetrics.tasks.completed;
        if (systemMemoryEl) systemMemoryEl.textContent = Math.round(this.systemMetrics.system.memory);
    }

    updateHealthIndicators() {
        const agentSystemHealth = document.getElementById('agent-system-health');
        const messageBusHealth = document.getElementById('message-bus-health');
        const coordinationHealth = document.getElementById('coordination-health');

        if (agentSystemHealth) {
            agentSystemHealth.textContent = this.systemMetrics && this.systemMetrics.initialized ? 'Healthy' : 'Offline';
            agentSystemHealth.className = 'health-status ' + (this.systemMetrics && this.systemMetrics.initialized ? 'healthy' : 'unhealthy');
        }

        if (messageBusHealth) {
            messageBusHealth.textContent = 'Healthy';
            messageBusHealth.className = 'health-status healthy';
        }

        if (coordinationHealth) {
            coordinationHealth.textContent = this.systemMetrics && this.systemMetrics.agents.total > 0 ? 'Active' : 'Idle';
            coordinationHealth.className = 'health-status ' + (this.systemMetrics && this.systemMetrics.agents.total > 0 ? 'healthy' : 'warning');
        }
    }

    async loadOverviewData() {
        // Overview data is already loaded in refreshData
        this.updateOverviewCards();
        this.updateHealthIndicators();
    }

    async loadAgentsList() {
        const agentListEl = document.getElementById('agent-list');
        if (!agentListEl) return;

        if (this.agents.size === 0) {
            agentListEl.innerHTML = '<div class="empty-state">No agents currently active</div>';
            return;
        }

        const agentsHTML = Array.from(this.agents.entries()).map(([agentId, status]) => `
            <div class="agent-item" data-agent-id="${agentId}">
                <div class="agent-header">
                    <div class="agent-info">
                        <span class="agent-name">${agentId}</span>
                        <span class="agent-type">${status.state}</span>
                    </div>
                    <div class="agent-status">
                        <span class="status-indicator ${status.state}">${status.state}</span>
                        <span class="health-score">${status.healthScore}%</span>
                    </div>
                </div>
                <div class="agent-details">
                    <div class="agent-stat">
                        <span class="stat-label">Tasks:</span>
                        <span class="stat-value">${status.currentTasks.length}</span>
                    </div>
                    <div class="agent-stat">
                        <span class="stat-label">Completed:</span>
                        <span class="stat-value">${status.completedTasks}</span>
                    </div>
                    <div class="agent-stat">
                        <span class="stat-label">Failed:</span>
                        <span class="stat-value">${status.failedTasks}</span>
                    </div>
                    <div class="agent-stat">
                        <span class="stat-label">Memory:</span>
                        <span class="stat-value">${Math.round(status.resourceUsage.memory)}MB</span>
                    </div>
                </div>
                <div class="agent-actions">
                    <button class="action-btn small" onclick="agentDashboard.restartAgent('${agentId}')">Restart</button>
                    <button class="action-btn small danger" onclick="agentDashboard.destroyAgent('${agentId}')">Destroy</button>
                    <button class="action-btn small" onclick="agentDashboard.sendMessageToAgent('${agentId}')">Message</button>
                </div>
            </div>
        `).join('');

        agentListEl.innerHTML = agentsHTML;
    }

    async loadTasksList() {
        const taskListEl = document.getElementById('agent-tasks');
        if (!taskListEl) return;

        try {
            // For now, show placeholder since we don't have a specific task list endpoint
            taskListEl.innerHTML = `
                <div class="task-summary">
                    <div class="task-stat">
                        <span class="stat-number">${this.systemMetrics?.tasks.active || 0}</span>
                        <span class="stat-label">Active Tasks</span>
                    </div>
                    <div class="task-stat">
                        <span class="stat-number">${this.systemMetrics?.tasks.completed || 0}</span>
                        <span class="stat-label">Completed</span>
                    </div>
                    <div class="task-stat">
                        <span class="stat-number">${this.systemMetrics?.tasks.failed || 0}</span>
                        <span class="stat-label">Failed</span>
                    </div>
                </div>
                <div class="task-info">
                    <p>Task management is integrated with the agent system. Submit new tasks using the "Submit Task" button above.</p>
                </div>
            `;
        } catch (error) {
            console.error('Failed to load tasks:', error);
            taskListEl.innerHTML = '<div class="error-state">Failed to load tasks</div>';
        }
    }

    async loadMessagesList() {
        const messagesListEl = document.getElementById('agent-messages');
        if (!messagesListEl) return;

        try {
            const response = await fetch(`http://localhost:3001/agents/messages?limit=50`);
            const data = await response.json();

            if (data.success && data.messages.length > 0) {
                const messagesHTML = data.messages.map(msg => `
                    <div class="message-item">
                        <div class="message-header">
                            <span class="message-from">${msg.fromAgent}</span>
                            <span class="message-to">→ ${msg.toAgent}</span>
                            <span class="message-type">${msg.type}</span>
                            <span class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div class="message-content">
                            ${JSON.stringify(msg.data, null, 2).substring(0, 200)}${JSON.stringify(msg.data).length > 200 ? '...' : ''}
                        </div>
                    </div>
                `).join('');

                messagesListEl.innerHTML = messagesHTML;
            } else {
                messagesListEl.innerHTML = '<div class="empty-state">No messages found</div>';
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
            messagesListEl.innerHTML = '<div class="error-state">Failed to load messages</div>';
        }
    }

    async loadMetricsData() {
        const metricsEl = document.getElementById('agent-metrics');
        if (!metricsEl) return;

        try {
            const response = await fetch(`http://localhost:3001/agents/metrics`);
            const data = await response.json();

            if (data.success) {
                const metricsHTML = `
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <h5>System Uptime</h5>
                            <div class="metric-value">${Math.round(this.systemMetrics?.system.uptime / 1000 / 60)} min</div>
                        </div>
                        <div class="metric-card">
                            <h5>Memory Usage</h5>
                            <div class="metric-value">${Math.round(this.systemMetrics?.system.memory)} MB</div>
                        </div>
                        <div class="metric-card">
                            <h5>CPU Usage</h5>
                            <div class="metric-value">${Math.round(this.systemMetrics?.system.cpu * 100)}%</div>
                        </div>
                        <div class="metric-card">
                            <h5>Agent Types</h5>
                            <div class="metric-breakdown">
                                ${Object.entries(this.systemMetrics?.agents.byType || {}).map(([type, count]) => 
                                    `<div>${type}: ${count}</div>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                `;

                metricsEl.innerHTML = metricsHTML;
            } else {
                metricsEl.innerHTML = '<div class="error-state">Failed to load metrics</div>';
            }
        } catch (error) {
            console.error('Failed to load metrics:', error);
            metricsEl.innerHTML = '<div class="error-state">Failed to load metrics</div>';
        }
    }

    showCreateAgentForm() {
        const modal = document.getElementById('create-agent-modal');
        if (modal) {
            modal.style.display = 'block';
        }
    }

    hideCreateAgentForm() {
        const modal = document.getElementById('create-agent-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        const form = document.getElementById('create-agent-form');
        if (form) {
            form.reset();
        }
    }

    showSubmitTaskForm() {
        const modal = document.getElementById('submit-task-modal');
        if (modal) {
            modal.style.display = 'block';
        }
    }

    hideSubmitTaskForm() {
        const modal = document.getElementById('submit-task-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        const form = document.getElementById('task-form');
        if (form) {
            form.reset();
        }
    }

    async handleCreateAgent(e) {
        e.preventDefault();
        
        const agentType = document.getElementById('agent-type').value;
        const agentName = document.getElementById('agent-name').value;
        const agentConfigText = document.getElementById('agent-config').value;

        let config = {};
        if (agentConfigText.trim()) {
            try {
                config = JSON.parse(agentConfigText);
            } catch (error) {
                this.showError('Invalid JSON configuration');
                return;
            }
        }

        if (agentName) {
            config.name = agentName;
        }

        try {
            const response = await fetch(`http://localhost:3001/agents/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    agentType,
                    config
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Agent created successfully: ${data.agentId}`);
                this.hideCreateAgentForm();
                await this.refreshData();
            } else {
                this.showError(data.error || 'Failed to create agent');
            }
        } catch (error) {
            console.error('Failed to create agent:', error);
            this.showError('Failed to create agent');
        }
    }

    async handleSubmitTask(e) {
        e.preventDefault();
        
        const taskType = document.getElementById('task-type').value;
        const description = document.getElementById('task-description').value;
        const priority = document.getElementById('task-priority').value;
        const contextText = document.getElementById('task-context').value;

        let context = {};
        if (contextText.trim()) {
            try {
                context = JSON.parse(contextText);
            } catch (error) {
                this.showError('Invalid JSON context');
                return;
            }
        }

        // Add current terminal context if available
        if (this.app.activeTerminalId) {
            context.terminalId = this.app.activeTerminalId;
        }

        try {
            const response = await fetch(`http://localhost:3001/agents/tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: taskType,
                    description,
                    priority,
                    context,
                    requirements: {
                        tools: [],
                        capabilities: []
                    }
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Task submitted successfully: ${data.taskId}`);
                this.hideSubmitTaskForm();
                await this.refreshData();
            } else {
                this.showError(data.error || 'Failed to submit task');
            }
        } catch (error) {
            console.error('Failed to submit task:', error);
            this.showError('Failed to submit task');
        }
    }

    async restartAgent(agentId) {
        if (!confirm(`Are you sure you want to restart agent ${agentId}?`)) {
            return;
        }

        try {
            const response = await fetch(`http://localhost:3001/agents/${agentId}/restart`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Agent ${agentId} restarted successfully`);
                await this.refreshData();
            } else {
                this.showError(data.error || 'Failed to restart agent');
            }
        } catch (error) {
            console.error('Failed to restart agent:', error);
            this.showError('Failed to restart agent');
        }
    }

    async destroyAgent(agentId) {
        if (!confirm(`Are you sure you want to destroy agent ${agentId}? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`http://localhost:3001/agents/${agentId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Agent ${agentId} destroyed successfully`);
                await this.refreshData();
            } else {
                this.showError(data.error || 'Failed to destroy agent');
            }
        } catch (error) {
            console.error('Failed to destroy agent:', error);
            this.showError('Failed to destroy agent');
        }
    }

    async sendMessageToAgent(agentId) {
        const messageType = prompt('Enter message type:');
        if (!messageType) return;

        const messageData = prompt('Enter message data (JSON):');
        let data = {};
        if (messageData) {
            try {
                data = JSON.parse(messageData);
            } catch (error) {
                this.showError('Invalid JSON data');
                return;
            }
        }

        try {
            const response = await fetch(`http://localhost:3001/agents/${agentId}/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: messageType,
                    data,
                    priority: 'medium'
                })
            });

            const responseData = await response.json();

            if (responseData.success) {
                this.showSuccess(`Message sent to ${agentId}`);
            } else {
                this.showError(responseData.error || 'Failed to send message');
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            this.showError('Failed to send message');
        }
    }

    async clearMessages() {
        // This would clear message history - implementation depends on backend
        this.showInfo('Message history would be cleared');
    }

    async clearHistory() {
        if (!confirm('Are you sure you want to clear all agent history?')) {
            return;
        }

        try {
            const response = await fetch(`http://localhost:3001/agents/history`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess('Agent history cleared successfully');
                await this.refreshData();
            } else {
                this.showError(data.error || 'Failed to clear history');
            }
        } catch (error) {
            console.error('Failed to clear history:', error);
            this.showError('Failed to clear history');
        }
    }

    async exportSystemState() {
        try {
            const response = await fetch(`http://localhost:3001/agents/export`);
            const blob = await response.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `agent-system-state-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            this.showSuccess('System state exported successfully');
        } catch (error) {
            console.error('Failed to export system state:', error);
            this.showError('Failed to export system state');
        }
    }

    async exportMetrics() {
        try {
            const response = await fetch(`http://localhost:3001/agents/metrics`);
            const data = await response.json();
            
            if (data.success) {
                const blob = new Blob([JSON.stringify(data.metrics, null, 2)], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `agent-metrics-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                this.showSuccess('Metrics exported successfully');
            } else {
                this.showError('Failed to export metrics');
            }
        } catch (error) {
            console.error('Failed to export metrics:', error);
            this.showError('Failed to export metrics');
        }
    }

    startMetricsPolling() {
        // Refresh data every 30 seconds when dashboard is visible
        this.refreshInterval = setInterval(() => {
            if (this.isVisible) {
                this.refreshData();
            }
        }, 30000);
    }

    stopMetricsPolling() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showInfo(message) {
        this.showNotification(message, 'info');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            font-size: 14px;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            ${type === 'success' ? 'background-color: #10b981;' : ''}
            ${type === 'error' ? 'background-color: #ef4444;' : ''}
            ${type === 'info' ? 'background-color: #3b82f6;' : ''}
        `;
        
        document.body.appendChild(notification);
        
        // Remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    destroy() {
        this.stopMetricsPolling();
        if (this.agentModal && this.agentModal.parentNode) {
            this.agentModal.parentNode.removeChild(this.agentModal);
        }
    }
}

// Global variable for agent dashboard
let agentDashboard = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for app to be available
    setTimeout(() => {
        if (window.app) {
            agentDashboard = new AgentDashboard(window.app);
            window.agentDashboard = agentDashboard;
        }
    }, 1000);
});