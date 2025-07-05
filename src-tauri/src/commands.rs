use serde::{Deserialize, Serialize};
use tauri::State;
use crate::models::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub name: String,
    pub project_path: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecuteTaskRequest {
    pub session_id: String,
    pub task_description: String,
    pub agent_type: String, // "claude_code", "gemini_cli", or "middle_manager"
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello {}! Welcome to AgentTool - Your Multi-Agent AI Assistant", name)
}

#[tauri::command]
pub async fn create_session(request: CreateSessionRequest) -> Result<Session, String> {
    let session = Session {
        id: uuid::Uuid::new_v4().to_string(),
        name: request.name,
        project_path: request.project_path,
        description: request.description,
        status: SessionStatus::Created,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        worktree_path: None,
        branch_name: None,
    };
    
    // TODO: Persist to database
    Ok(session)
}

#[tauri::command]
pub async fn get_sessions() -> Result<Vec<Session>, String> {
    // TODO: Fetch from database
    Ok(vec![])
}

#[tauri::command]
pub async fn execute_task(request: ExecuteTaskRequest) -> Result<TaskResult, String> {
    // TODO: Route to appropriate agent
    let result = TaskResult {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: request.session_id,
        task_description: request.task_description,
        agent_type: request.agent_type,
        status: TaskStatus::InProgress,
        result: None,
        error: None,
        created_at: chrono::Utc::now(),
        completed_at: None,
    };
    
    Ok(result)
}

#[tauri::command]
pub async fn get_agent_status(agent_id: String) -> Result<AgentStatus, String> {
    // TODO: Get actual agent status
    Ok(AgentStatus {
        id: agent_id,
        name: "Sample Agent".to_string(),
        agent_type: "claude_code".to_string(),
        status: "idle".to_string(),
        current_task: None,
        last_activity: chrono::Utc::now(),
    })
}

#[tauri::command]
pub async fn configure_agent(config: AgentConfig) -> Result<(), String> {
    // TODO: Store agent configuration
    Ok(())
}

#[tauri::command]
pub async fn list_agents() -> Result<Vec<AgentStatus>, String> {
    // TODO: Return list of configured agents
    Ok(vec![])
}