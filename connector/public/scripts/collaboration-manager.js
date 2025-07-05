// Collaboration Manager for Frontend
class CollaborationManager {
    constructor(app) {
        this.app = app;
        this.sharedSessions = new Map(); // sessionId -> session info
        this.activeCursors = new Map(); // sessionId -> Map(userId -> cursor position)
        this.sessionComments = new Map(); // sessionId -> Map(commentId -> comment)
        this.activeRecordings = new Map(); // sessionId -> recording info
        
        this.initializeCollaborationUI();
        this.setupWebSocketHandlers();
    }
    
    initializeCollaborationUI() {
        // Create collaboration panel in the sidebar
        this.createCollaborationPanel();
        
        // Create session sharing modal
        this.createSessionSharingModal();
        
        // Create comments panel
        this.createCommentsPanel();
        
        // Create recording controls
        this.createRecordingControls();
        
        // Initialize cursor tracking
        this.initializeCursorTracking();
    }
    
    createCollaborationPanel() {
        const sidebar = document.querySelector('.sidebar-content');
        if (!sidebar) return;
        
        const collaborationSection = document.createElement('div');
        collaborationSection.className = 'collaboration-section';
        collaborationSection.innerHTML = `
            <div class="section-header">
                <h3>Collaboration</h3>
                <button id="share-session-btn" class="btn btn-sm btn-primary" title="Share Terminal Session">
                    <i class="fas fa-share-alt"></i>
                </button>
            </div>
            <div class="shared-sessions-list" id="shared-sessions-list">
                <div class="empty-state">
                    <p>No active shared sessions</p>
                </div>
            </div>
            <div class="section-header">
                <h4>Participants</h4>
            </div>
            <div class="participants-list" id="participants-list">
                <div class="empty-state">
                    <p>Join a session to see participants</p>
                </div>
            </div>
        `;
        
        sidebar.appendChild(collaborationSection);
        
        // Attach event handlers
        document.getElementById('share-session-btn').addEventListener('click', () => {
            this.showSessionSharingModal();
        });
    }
    
    createSessionSharingModal() {
        const modal = document.createElement('div');
        modal.id = 'session-sharing-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Share Terminal Session</h3>
                    <button class="modal-close" id="sharing-modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="session-name">Session Name</label>
                        <input type="text" id="session-name" class="form-control" placeholder="My Terminal Session" />
                    </div>
                    <div class="form-group">
                        <label for="session-description">Description (optional)</label>
                        <textarea id="session-description" class="form-control" placeholder="What are you working on?"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Permissions</label>
                        <div class="permissions-grid">
                            <label class="checkbox-label">
                                <input type="checkbox" id="allow-read" checked /> Allow participants to view
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="allow-write" /> Allow participants to type
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="allow-comment" checked /> Allow comments
                            </label>
                        </div>
                    </div>
                    <div class="terminal-selection">
                        <label for="terminal-select">Terminal to Share</label>
                        <select id="terminal-select" class="form-control">
                            <option value="">Select a terminal...</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="cancel-sharing">Cancel</button>
                    <button class="btn btn-primary" id="create-shared-session">Create Session</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Attach event handlers
        document.getElementById('sharing-modal-close').addEventListener('click', () => {
            this.hideSessionSharingModal();
        });
        
        document.getElementById('cancel-sharing').addEventListener('click', () => {
            this.hideSessionSharingModal();
        });
        
        document.getElementById('create-shared-session').addEventListener('click', () => {
            this.createSharedSession();
        });
    }
    
    createCommentsPanel() {
        const commentsPanel = document.createElement('div');
        commentsPanel.id = 'comments-panel';
        commentsPanel.className = 'comments-panel';
        commentsPanel.innerHTML = `
            <div class="comments-header">
                <h4>Comments</h4>
                <button id="toggle-comments" class="btn btn-sm btn-secondary">
                    <i class="fas fa-comments"></i>
                </button>
            </div>
            <div class="comments-content" id="comments-content">
                <div class="comments-list" id="comments-list">
                    <div class="empty-state">
                        <p>No comments yet</p>
                    </div>
                </div>
                <div class="comment-input-area">
                    <textarea id="new-comment" class="form-control" placeholder="Add a comment..."></textarea>
                    <button id="add-comment" class="btn btn-sm btn-primary">Add Comment</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(commentsPanel);
        
        // Attach event handlers
        document.getElementById('toggle-comments').addEventListener('click', () => {
            this.toggleCommentsPanel();
        });
        
        document.getElementById('add-comment').addEventListener('click', () => {
            this.addComment();
        });
    }
    
    createRecordingControls() {
        const recordingControls = document.createElement('div');
        recordingControls.id = 'recording-controls';
        recordingControls.className = 'recording-controls';
        recordingControls.innerHTML = `
            <div class="recording-header">
                <h4>Session Recording</h4>
                <div class="recording-status" id="recording-status">
                    <span class="status-indicator"></span>
                    <span class="status-text">Not recording</span>
                </div>
            </div>
            <div class="recording-actions">
                <button id="start-recording" class="btn btn-sm btn-danger">
                    <i class="fas fa-record-vinyl"></i> Start Recording
                </button>
                <button id="stop-recording" class="btn btn-sm btn-secondary" disabled>
                    <i class="fas fa-stop"></i> Stop Recording
                </button>
            </div>
            <div class="recordings-list" id="recordings-list">
                <h5>Past Recordings</h5>
                <div class="empty-state">
                    <p>No recordings available</p>
                </div>
            </div>
        `;
        
        document.body.appendChild(recordingControls);
        
        // Attach event handlers
        document.getElementById('start-recording').addEventListener('click', () => {
            this.startRecording();
        });
        
        document.getElementById('stop-recording').addEventListener('click', () => {
            this.stopRecording();
        });
        
        // Add close button to recording controls
        const closeBtn = document.createElement('button');
        closeBtn.className = 'recording-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Close Recording Controls';
        recordingControls.querySelector('.recording-header').appendChild(closeBtn);
        
        closeBtn.addEventListener('click', () => {
            this.hideRecordingControls();
        });
    }
    
    toggleRecordingControls() {
        const controls = document.getElementById('recording-controls');
        if (controls) {
            if (controls.classList.contains('visible')) {
                this.hideRecordingControls();
            } else {
                this.showRecordingControls();
            }
        }
    }
    
    showRecordingControls() {
        const controls = document.getElementById('recording-controls');
        if (controls) {
            controls.classList.add('visible');
            setTimeout(() => controls.classList.add('show'), 10);
        }
    }
    
    hideRecordingControls() {
        const controls = document.getElementById('recording-controls');
        if (controls) {
            controls.classList.remove('show');
            controls.classList.add('hide');
            setTimeout(() => {
                controls.classList.remove('visible', 'hide');
            }, 300);
        }
    }
    
    initializeCursorTracking() {
        // Set up cursor position tracking for all terminals
        this.setupCursorTracking();
    }
    
    setupWebSocketHandlers() {
        // Add collaboration message handlers to the main app's WebSocket
        const originalOnMessage = this.app.onMessage;
        
        this.app.onMessage = (data) => {
            // Handle collaboration messages
            switch (data.type) {
                case 'session_share':
                    this.handleSessionShared(data);
                    break;
                case 'session_join':
                    this.handleSessionJoined(data);
                    break;
                case 'session_leave':
                    this.handleSessionLeft(data);
                    break;
                case 'cursor_position':
                    this.handleCursorPosition(data);
                    break;
                case 'comment_add':
                    this.handleCommentAdded(data);
                    break;
                case 'comment_update':
                    this.handleCommentUpdated(data);
                    break;
                case 'comment_delete':
                    this.handleCommentDeleted(data);
                    break;
                case 'recording_start':
                    this.handleRecordingStarted(data);
                    break;
                case 'recording_stop':
                    this.handleRecordingStopped(data);
                    break;
                default:
                    // Pass to original handler
                    if (originalOnMessage) {
                        originalOnMessage.call(this.app, data);
                    }
                    break;
            }
        };
    }
    
    // Session Management
    showSessionSharingModal() {
        const modal = document.getElementById('session-sharing-modal');
        const terminalSelect = document.getElementById('terminal-select');
        
        // Populate terminal options
        terminalSelect.innerHTML = '<option value="">Select a terminal...</option>';
        for (const [terminalId, terminal] of this.app.terminals) {
            const option = document.createElement('option');
            option.value = terminalId;
            option.textContent = `Terminal ${terminal.displayName || terminalId}`;
            terminalSelect.appendChild(option);
        }
        
        modal.style.display = 'block';
    }
    
    hideSessionSharingModal() {
        const modal = document.getElementById('session-sharing-modal');
        modal.style.display = 'none';
        
        // Reset form
        document.getElementById('session-name').value = '';
        document.getElementById('session-description').value = '';
        document.getElementById('terminal-select').value = '';
    }
    
    createSharedSession() {
        const name = document.getElementById('session-name').value.trim();
        const description = document.getElementById('session-description').value.trim();
        const terminalId = document.getElementById('terminal-select').value;
        const canRead = document.getElementById('allow-read').checked;
        const canWrite = document.getElementById('allow-write').checked;
        const canComment = document.getElementById('allow-comment').checked;
        
        if (!name || !terminalId) {
            alert('Please provide a session name and select a terminal');
            return;
        }
        
        // Send session creation request
        this.app.sendMessage({
            type: 'session_share',
            terminalId: terminalId,
            data: {
                name: name,
                description: description,
                permissions: {
                    canRead: canRead,
                    canWrite: canWrite,
                    canComment: canComment
                }
            }
        });
        
        this.hideSessionSharingModal();
    }
    
    // Cursor Tracking
    setupCursorTracking() {
        // Monitor cursor positions in active terminals
        setInterval(() => {
            this.trackCursorPositions();
        }, 500); // Update every 500ms
    }
    
    trackCursorPositions() {
        if (!this.app.activeTerminalId) return;
        
        // Get active session that includes this terminal
        const activeSession = this.getActiveSessionForTerminal(this.app.activeTerminalId);
        if (!activeSession) return;
        
        // Simulate cursor position (in a real implementation, this would track actual cursor)
        const position = this.getCurrentCursorPosition();
        
        if (position) {
            this.app.sendMessage({
                type: 'cursor_position',
                sessionId: activeSession.id,
                cursorPosition: position
            });
        }
    }
    
    getCurrentCursorPosition() {
        // This is a simplified implementation
        // In a real terminal, you'd get the actual cursor position
        return {
            line: Math.floor(Math.random() * 24),
            column: Math.floor(Math.random() * 80)
        };
    }
    
    // Comments System
    toggleCommentsPanel() {
        const panel = document.getElementById('comments-panel');
        panel.classList.toggle('open');
    }
    
    addComment() {
        const content = document.getElementById('new-comment').value.trim();
        if (!content) return;
        
        const activeSession = this.getActiveSession();
        if (!activeSession) {
            alert('Join a session to add comments');
            return;
        }
        
        this.app.sendMessage({
            type: 'comment_add',
            sessionId: activeSession.id,
            data: {
                content: content,
                position: this.getCurrentCursorPosition()
            }
        });
        
        document.getElementById('new-comment').value = '';
    }
    
    // Recording System
    startRecording() {
        const activeSession = this.getActiveSession();
        if (!activeSession) {
            alert('Join a session to start recording');
            return;
        }
        
        const recordingName = prompt('Recording name:', `Session ${new Date().toLocaleString()}`);
        if (!recordingName) return;
        
        this.app.sendMessage({
            type: 'recording_start',
            sessionId: activeSession.id,
            data: {
                name: recordingName
            }
        });
    }
    
    stopRecording() {
        const activeSession = this.getActiveSession();
        if (!activeSession) return;
        
        this.app.sendMessage({
            type: 'recording_stop',
            sessionId: activeSession.id
        });
    }
    
    // WebSocket Event Handlers
    handleSessionShared(data) {
        const session = data.data;
        this.sharedSessions.set(session.id, session);
        this.updateSharedSessionsList();
        
        // Show success notification
        this.showNotification(`Session "${session.name}" created successfully`, 'success');
    }
    
    handleSessionJoined(data) {
        const { sessionId, userId, session } = data.data;
        this.sharedSessions.set(sessionId, session);
        this.updateParticipantsList(sessionId);
        
        this.showNotification(`User joined session "${session.name}"`, 'info');
    }
    
    handleSessionLeft(data) {
        const { sessionId, userId, session } = data.data;
        if (session) {
            this.sharedSessions.set(sessionId, session);
        }
        this.updateParticipantsList(sessionId);
    }
    
    handleCursorPosition(data) {
        const { sessionId, userId, cursorPosition } = data;
        
        let sessionCursors = this.activeCursors.get(sessionId);
        if (!sessionCursors) {
            sessionCursors = new Map();
            this.activeCursors.set(sessionId, sessionCursors);
        }
        
        sessionCursors.set(userId, {
            ...cursorPosition,
            timestamp: Date.now()
        });
        
        // Update cursor display in terminal
        this.updateCursorDisplay(sessionId);
    }
    
    handleCommentAdded(data) {
        const comment = data.data;
        
        let sessionComments = this.sessionComments.get(comment.sessionId);
        if (!sessionComments) {
            sessionComments = new Map();
            this.sessionComments.set(comment.sessionId, sessionComments);
        }
        
        sessionComments.set(comment.id, comment);
        this.updateCommentsDisplay(comment.sessionId);
    }
    
    handleCommentUpdated(data) {
        const comment = data.data;
        const sessionComments = this.sessionComments.get(comment.sessionId);
        
        if (sessionComments && sessionComments.has(comment.id)) {
            sessionComments.set(comment.id, comment);
            this.updateCommentsDisplay(comment.sessionId);
        }
    }
    
    handleCommentDeleted(data) {
        const { commentId, sessionId } = data.data;
        const sessionComments = this.sessionComments.get(sessionId);
        
        if (sessionComments) {
            sessionComments.delete(commentId);
            this.updateCommentsDisplay(sessionId);
        }
    }
    
    handleRecordingStarted(data) {
        const recording = data.data;
        this.activeRecordings.set(recording.sessionId, recording);
        
        this.updateRecordingStatus('recording', `Recording "${recording.name}"`);
        document.getElementById('start-recording').disabled = true;
        document.getElementById('stop-recording').disabled = false;
    }
    
    handleRecordingStopped(data) {
        const recording = data.data;
        this.activeRecordings.delete(recording.sessionId);
        
        this.updateRecordingStatus('stopped', 'Not recording');
        document.getElementById('start-recording').disabled = false;
        document.getElementById('stop-recording').disabled = true;
        
        this.addToRecordingsList(recording);
    }
    
    // UI Update Methods
    updateSharedSessionsList() {
        const listContainer = document.getElementById('shared-sessions-list');
        
        if (this.sharedSessions.size === 0) {
            listContainer.innerHTML = '<div class="empty-state"><p>No active shared sessions</p></div>';
            return;
        }
        
        let html = '';
        for (const [sessionId, session] of this.sharedSessions) {
            html += `
                <div class="session-item" data-session-id="${sessionId}">
                    <div class="session-info">
                        <h5>${session.name}</h5>
                        <p>${session.description || 'No description'}</p>
                        <span class="participant-count">${session.participants.size} participants</span>
                    </div>
                    <div class="session-actions">
                        <button class="btn btn-sm btn-secondary" onclick="collaborationManager.leaveSession('${sessionId}')">
                            Leave
                        </button>
                    </div>
                </div>
            `;
        }
        
        listContainer.innerHTML = html;
    }
    
    updateParticipantsList(sessionId) {
        const session = this.sharedSessions.get(sessionId);
        if (!session) return;
        
        const listContainer = document.getElementById('participants-list');
        
        if (session.participants.size === 0) {
            listContainer.innerHTML = '<div class="empty-state"><p>No participants</p></div>';
            return;
        }
        
        let html = '';
        for (const participantId of session.participants) {
            const isHost = participantId === session.hostUuid;
            html += `
                <div class="participant-item">
                    <div class="participant-info">
                        <span class="participant-name">${participantId}</span>
                        ${isHost ? '<span class="host-badge">Host</span>' : ''}
                    </div>
                    <div class="participant-status">
                        <span class="status-indicator online"></span>
                    </div>
                </div>
            `;
        }
        
        listContainer.innerHTML = html;
    }
    
    updateCursorDisplay(sessionId) {
        // This would update cursor overlays in the terminal
        // Implementation depends on terminal library being used
        console.log('Updating cursors for session:', sessionId);
    }
    
    updateCommentsDisplay(sessionId) {
        const comments = this.sessionComments.get(sessionId);
        if (!comments) return;
        
        const listContainer = document.getElementById('comments-list');
        
        if (comments.size === 0) {
            listContainer.innerHTML = '<div class="empty-state"><p>No comments yet</p></div>';
            return;
        }
        
        let html = '';
        for (const [commentId, comment] of comments) {
            html += `
                <div class="comment-item" data-comment-id="${commentId}">
                    <div class="comment-header">
                        <span class="comment-author">${comment.userId}</span>
                        <span class="comment-time">${new Date(comment.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="comment-content">${comment.content}</div>
                    ${comment.position ? `<div class="comment-position">Line ${comment.position.line}, Col ${comment.position.column}</div>` : ''}
                </div>
            `;
        }
        
        listContainer.innerHTML = html;
    }
    
    updateRecordingStatus(status, text) {
        const statusElement = document.getElementById('recording-status');
        const indicator = statusElement.querySelector('.status-indicator');
        const textElement = statusElement.querySelector('.status-text');
        
        indicator.className = `status-indicator ${status}`;
        textElement.textContent = text;
    }
    
    addToRecordingsList(recording) {
        const listContainer = document.getElementById('recordings-list');
        const emptyState = listContainer.querySelector('.empty-state');
        
        if (emptyState) {
            emptyState.remove();
        }
        
        const recordingElement = document.createElement('div');
        recordingElement.className = 'recording-item';
        recordingElement.innerHTML = `
            <div class="recording-info">
                <h6>${recording.name}</h6>
                <p>Duration: ${Math.round(recording.duration / 1000)}s</p>
                <p>Created: ${new Date(recording.createdAt).toLocaleString()}</p>
            </div>
            <div class="recording-actions">
                <button class="btn btn-sm btn-primary" onclick="collaborationManager.playRecording('${recording.id}')">
                    <i class="fas fa-play"></i> Play
                </button>
            </div>
        `;
        
        listContainer.appendChild(recordingElement);
    }
    
    // Utility Methods
    getActiveSession() {
        // Return the first active session (in a real app, this would be more sophisticated)
        return this.sharedSessions.values().next().value;
    }
    
    getActiveSessionForTerminal(terminalId) {
        for (const session of this.sharedSessions.values()) {
            if (session.terminalId === terminalId) {
                return session;
            }
        }
        return null;
    }
    
    leaveSession(sessionId) {
        this.app.sendMessage({
            type: 'session_leave',
            sessionId: sessionId
        });
        
        this.sharedSessions.delete(sessionId);
        this.updateSharedSessionsList();
        this.updateParticipantsList(sessionId);
    }
    
    playRecording(recordingId) {
        this.app.sendMessage({
            type: 'recording_play',
            recordingId: recordingId
        });
    }
    
    showNotification(message, type = 'info') {
        // Simple notification system
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}