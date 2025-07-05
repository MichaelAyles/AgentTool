use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub project_path: String,
    pub description: Option<String>,
    pub status: SessionStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub worktree_path: Option<String>,
    pub branch_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum SessionStatus {
    Created,
    Active,
    Paused,
    Completed,
    Failed,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskResult {
    pub id: String,
    pub session_id: String,
    pub task_description: String,
    pub agent_type: String,
    pub status: TaskStatus,
    pub result: Option<String>,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentStatus {
    pub id: String,
    pub name: String,
    pub agent_type: String,
    pub status: String,
    pub current_task: Option<String>,
    pub last_activity: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub agent_type: String,
    pub config: serde_json::Value,
    pub permissions: AgentPermissions,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentPermissions {
    pub file_read: bool,
    pub file_write: bool,
    pub network_access: bool,
    pub process_spawn: bool,
    pub allowed_paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum AgentMessage {
    TaskAssignment {
        task_id: String,
        description: String,
        context: serde_json::Value,
        permissions: AgentPermissions,
    },
    TaskProgress {
        task_id: String,
        progress: f32,
        output: String,
    },
    TaskComplete {
        task_id: String,
        result: serde_json::Value,
        artifacts: Vec<String>,
    },
    TaskFailed {
        task_id: String,
        error: String,
    },
    CoordinationRequest {
        from_agent: String,
        message: String,
        requires_approval: bool,
    },
}