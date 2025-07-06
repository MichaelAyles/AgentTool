use crate::models::*;
use crate::database::get_database;
use crate::claude_code_adapter::ClaudeCodeAdapter;
use crate::gemini_cli_adapter::GeminiCliAdapter;
use crate::middle_manager::MiddleManager;
use crate::git_worktree_manager::GitWorktreeManager;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::path::PathBuf;
use anyhow::Result;
use uuid::Uuid;

pub struct SessionManager {
    active_sessions: Arc<RwLock<HashMap<String, SessionData>>>,
    claude_adapter: Arc<ClaudeCodeAdapter>,
    gemini_adapter: Arc<GeminiCliAdapter>,
    middle_manager: Arc<MiddleManager>,
    git_worktree_manager: Arc<GitWorktreeManager>,
}

struct SessionData {
    session: Session,
    conversation_history: Vec<ConversationMessage>,
    active_tasks: HashMap<String, TaskResult>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConversationMessage {
    pub id: String,
    pub session_id: String,
    pub role: MessageRole,
    pub content: String,
    pub agent_type: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            active_sessions: Arc::new(RwLock::new(HashMap::new())),
            claude_adapter: Arc::new(ClaudeCodeAdapter::new("claude-code".to_string())),
            gemini_adapter: Arc::new(GeminiCliAdapter::new("gemini".to_string())),
            middle_manager: Arc::new(MiddleManager::new(
                std::env::var("OPENROUTER_API_KEY").unwrap_or_default(),
                "anthropic/claude-3-sonnet".to_string(),
            )),
            git_worktree_manager: Arc::new(GitWorktreeManager::new(
                PathBuf::from(std::env::var("AGENT_TOOL_WORKTREE_DIR").unwrap_or_else(|_| {
                    std::env::temp_dir().join("agent-tool-worktrees").to_string_lossy().to_string()
                }))
            )),
        }
    }

    pub async fn create_session(
        &self,
        name: String,
        project_path: String,
        description: Option<String>,
    ) -> Result<Session> {
        let session_id = Uuid::new_v4().to_string();
        let project_path_buf = PathBuf::from(&project_path);
        
        // Create git worktree for the session if it's a git repository
        let (worktree_path, branch_name) = if project_path_buf.join(".git").exists() {
            match self.git_worktree_manager.create_worktree(
                &project_path_buf,
                &session_id,
                None, // Let it auto-generate branch name
                None, // Let it auto-detect main branch
            ).await {
                Ok(worktree_path) => {
                    let branch_name = format!("session/{}", session_id);
                    (Some(worktree_path.to_string_lossy().to_string()), Some(branch_name))
                }
                Err(e) => {
                    eprintln!("Warning: Failed to create git worktree for session {}: {}", session_id, e);
                    (None, None)
                }
            }
        } else {
            (None, None)
        };

        let session = Session {
            id: session_id,
            name,
            project_path: project_path.clone(),
            description,
            status: SessionStatus::Created,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            worktree_path,
            branch_name,
        };

        // Store in database
        get_database().create_session(&session)?;

        // Add to active sessions
        let session_data = SessionData {
            session: session.clone(),
            conversation_history: Vec::new(),
            active_tasks: HashMap::new(),
        };

        {
            let mut sessions = self.active_sessions.write().unwrap();
            sessions.insert(session.id.clone(), session_data);
        }

        // Create a system message to start the conversation
        let worktree_info = if let Some(ref worktree_path) = session.worktree_path {
            format!(" with isolated git worktree at: {}", worktree_path)
        } else {
            String::new()
        };

        self.add_message(
            &session.id,
            MessageRole::System,
            format!(
                "Session '{}' created for project at: {}{}",
                session.name, session.project_path, worktree_info
            ),
            None,
        ).await?;

        Ok(session)
    }

    pub async fn get_session(&self, session_id: &str) -> Option<Session> {
        let sessions = self.active_sessions.read().unwrap();
        sessions.get(session_id).map(|data| data.session.clone())
    }

    pub async fn list_sessions(&self) -> Result<Vec<Session>> {
        // Load from database to get all sessions (not just active ones)
        get_database().get_sessions()
    }

    pub async fn add_message(
        &self,
        session_id: &str,
        role: MessageRole,
        content: String,
        agent_type: Option<String>,
    ) -> Result<ConversationMessage> {
        let message = ConversationMessage {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            role,
            content,
            agent_type,
            created_at: chrono::Utc::now(),
        };

        // Add to session history
        {
            let mut sessions = self.active_sessions.write().unwrap();
            if let Some(session_data) = sessions.get_mut(session_id) {
                session_data.conversation_history.push(message.clone());
                
                // Update session timestamp
                session_data.session.updated_at = chrono::Utc::now();
                session_data.session.status = SessionStatus::Active;
            }
        }

        // TODO: Store message in database
        
        Ok(message)
    }

    pub async fn get_conversation_history(&self, session_id: &str) -> Vec<ConversationMessage> {
        let sessions = self.active_sessions.read().unwrap();
        sessions
            .get(session_id)
            .map(|data| data.conversation_history.clone())
            .unwrap_or_default()
    }

    pub async fn execute_user_request(
        &self,
        session_id: &str,
        user_message: String,
    ) -> Result<Vec<ConversationMessage>> {
        // Add user message to conversation
        self.add_message(
            session_id,
            MessageRole::User,
            user_message.clone(),
            None,
        ).await?;

        let mut responses = Vec::new();

        // Get conversation context
        let history = self.get_conversation_history(session_id).await;
        let context = self.build_context_from_history(&history);

        // Use Middle Manager to decompose the task
        let decomposition = self.middle_manager
            .process_task(&user_message, &context)
            .await
            .map_err(|e| anyhow::anyhow!(e))?;

        // Add middle manager response
        let reasoning_message = self.add_message(
            session_id,
            MessageRole::Assistant,
            format!(
                "Task decomposition: {} - {}",
                decomposition.strategy, decomposition.reasoning
            ),
            Some("middle_manager".to_string()),
        ).await?;
        responses.push(reasoning_message);

        // Execute subtasks through appropriate agents
        for subtask in decomposition.subtasks {
            let task_result = match subtask.agent.as_str() {
                "claude_code" => {
                    self.execute_claude_code_task(session_id, &subtask).await?
                }
                "gemini_cli" => {
                    self.execute_gemini_cli_task(session_id, &subtask).await?
                }
                "middle_manager" => {
                    // Handle coordination tasks
                    TaskResult {
                        id: Uuid::new_v4().to_string(),
                        session_id: session_id.to_string(),
                        task_description: subtask.description.clone(),
                        agent_type: "middle_manager".to_string(),
                        status: TaskStatus::Completed,
                        result: Some("Coordination task handled by middle manager".to_string()),
                        error: None,
                        created_at: chrono::Utc::now(),
                        completed_at: Some(chrono::Utc::now()),
                    }
                }
                _ => {
                    return Err(anyhow::anyhow!("Unknown agent type: {}", subtask.agent));
                }
            };

            // Store task result
            {
                let mut sessions = self.active_sessions.write().unwrap();
                if let Some(session_data) = sessions.get_mut(session_id) {
                    session_data.active_tasks.insert(task_result.id.clone(), task_result.clone());
                }
            }

            // Add agent response to conversation
            let content = if let Some(result) = &task_result.result {
                format!("Task completed: {}", result)
            } else if let Some(error) = &task_result.error {
                format!("Task failed: {}", error)
            } else {
                "Task completed with no output".to_string()
            };

            let agent_message = self.add_message(
                session_id,
                MessageRole::Assistant,
                content,
                Some(task_result.agent_type.clone()),
            ).await?;
            responses.push(agent_message);
        }

        Ok(responses)
    }

    async fn execute_claude_code_task(
        &self,
        session_id: &str,
        subtask: &crate::middle_manager::SubTask,
    ) -> Result<TaskResult> {
        // Get session to determine project path and permissions
        let session = self.get_session(session_id).await
            .ok_or_else(|| anyhow::anyhow!("Session not found"))?;

        // Use worktree path if available, otherwise use project path
        let working_path = session.worktree_path.as_ref().unwrap_or(&session.project_path);

        let permissions = AgentPermissions {
            file_read: true,
            file_write: true,
            network_access: true,
            process_spawn: true,
            allowed_paths: vec![working_path.clone(), "**".to_string()],
        };

        // Start Claude Code session if not already running
        let claude_session_id = format!("{}-claude", session_id);
        if self.claude_adapter.get_session_status(&claude_session_id).is_none() {
            self.claude_adapter
                .start_session(
                    claude_session_id.clone(),
                    working_path.clone(),
                    permissions,
                )
                .await?;
        }

        // Execute the task
        self.claude_adapter
            .execute_task(&claude_session_id, &subtask.description, None)
            .await
    }

    async fn execute_gemini_cli_task(
        &self,
        session_id: &str,
        subtask: &crate::middle_manager::SubTask,
    ) -> Result<TaskResult> {
        // Get session to determine project path
        let session = self.get_session(session_id).await
            .ok_or_else(|| anyhow::anyhow!("Session not found"))?;

        // Use worktree path if available, otherwise use project path
        let working_path = session.worktree_path.as_ref().unwrap_or(&session.project_path);

        // Use quick task execution for Gemini CLI
        self.gemini_adapter
            .execute_quick_task(&subtask.description, working_path)
            .await
    }

    fn build_context_from_history(&self, history: &[ConversationMessage]) -> String {
        let recent_messages: Vec<String> = history
            .iter()
            .rev()
            .take(10) // Last 10 messages for context
            .rev()
            .map(|msg| {
                let role = match msg.role {
                    MessageRole::User => "User",
                    MessageRole::Assistant => "Assistant",
                    MessageRole::System => "System",
                };
                let agent_info = msg.agent_type
                    .as_ref()
                    .map(|a| format!(" ({})", a))
                    .unwrap_or_default();
                format!("{}{}: {}", role, agent_info, msg.content)
            })
            .collect();

        recent_messages.join("\n")
    }

    pub async fn pause_session(&self, session_id: &str) -> Result<()> {
        {
            let mut sessions = self.active_sessions.write().unwrap();
            if let Some(session_data) = sessions.get_mut(session_id) {
                session_data.session.status = SessionStatus::Paused;
                session_data.session.updated_at = chrono::Utc::now();
            }
        }

        // Stop any running agent processes for this session
        let claude_session_id = format!("{}-claude", session_id);
        let _ = self.claude_adapter.stop_session(&claude_session_id).await;

        Ok(())
    }

    pub async fn resume_session(&self, session_id: &str) -> Result<()> {
        {
            let mut sessions = self.active_sessions.write().unwrap();
            if let Some(session_data) = sessions.get_mut(session_id) {
                session_data.session.status = SessionStatus::Active;
                session_data.session.updated_at = chrono::Utc::now();
            }
        }
        Ok(())
    }

    // Commented out unused methods to remove dead code warnings
    // pub async fn complete_session(&self, session_id: &str) -> Result<()> {
    //     let worktree_path = {
    //         let mut sessions = self.active_sessions.write().unwrap();
    //         if let Some(session_data) = sessions.get_mut(session_id) {
    //             session_data.session.status = SessionStatus::Completed;
    //             session_data.session.updated_at = chrono::Utc::now();
    //             session_data.session.worktree_path.clone()
    //         } else {
    //             None
    //         }
    //     };

    //     // Cleanup agent sessions
    //     let claude_session_id = format!("{}-claude", session_id);
    //     let _ = self.claude_adapter.stop_session(&claude_session_id).await;

    //     // Clean up git worktree if it exists
    //     if let Some(worktree_path_str) = worktree_path {
    //         let worktree_path = PathBuf::from(&worktree_path_str);
    //         if let Some(session_data) = self.get_session(session_id).await {
    //             let project_path = PathBuf::from(&session_data.project_path);
    //             if let Err(e) = self.git_worktree_manager.remove_worktree(&project_path, &worktree_path).await {
    //                 eprintln!("Warning: Failed to remove git worktree for session {}: {}", session_id, e);
    //             }
    //         }
    //     }

    //     Ok(())
    // }

    // pub async fn get_session_tasks(&self, session_id: &str) -> Vec<TaskResult> {
    //     let sessions = self.active_sessions.read().unwrap();
    //     sessions
    //         .get(session_id)
    //         .map(|data| data.active_tasks.values().cloned().collect())
    //         .unwrap_or_default()
    // }

    // pub async fn merge_session_to_main(&self, session_id: &str, commit_message: &str) -> Result<()> {
    //     let session = self.get_session(session_id).await
    //         .ok_or_else(|| anyhow::anyhow!("Session not found"))?;

    //     if let Some(worktree_path_str) = &session.worktree_path {
    //         let worktree_path = PathBuf::from(worktree_path_str);
    //         let project_path = PathBuf::from(&session.project_path);
            
    //         self.git_worktree_manager
    //             .squash_and_merge_to_main(&project_path, &worktree_path, commit_message, None)
    //             .await?;
    //     }

    //     Ok(())
    // }

    // pub async fn cleanup_all_sessions(&self) -> Result<()> {
    //     // Stop all agent processes
    //     self.claude_adapter.cleanup_all_sessions().await?;
    //     self.gemini_adapter.cleanup_all_sessions().await?;

    //     // Get list of active session IDs for cleanup
    //     let active_session_ids: Vec<String> = {
    //         let sessions = self.active_sessions.read().unwrap();
    //         sessions.keys().cloned().collect()
    //     };

    //     // Cleanup abandoned worktrees
    //     for session_data in self.active_sessions.read().unwrap().values() {
    //         let project_path = PathBuf::from(&session_data.session.project_path);
    //         let _ = self.git_worktree_manager
    //             .cleanup_abandoned_worktrees(&project_path, &active_session_ids)
    //             .await;
    //     }

    //     // Clear active sessions
    //     {
    //         let mut sessions = self.active_sessions.write().unwrap();
    //         sessions.clear();
    //     }

    //     Ok(())
    // }
}