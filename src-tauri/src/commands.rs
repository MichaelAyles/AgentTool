use serde::{Deserialize, Serialize};
use tauri::State;
use crate::models::*;
use crate::session_manager::{SessionManager, ConversationMessage};

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

#[derive(Debug, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub session_id: String,
    pub message: String,
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello {}! Welcome to AgentTool - Your Multi-Agent AI Assistant", name)
}

#[tauri::command]
pub async fn create_session(
    request: CreateSessionRequest,
    session_manager: State<'_, SessionManager>,
) -> Result<Session, String> {
    session_manager
        .create_session(request.name, request.project_path, request.description)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sessions(
    session_manager: State<'_, SessionManager>,
) -> Result<Vec<Session>, String> {
    session_manager
        .list_sessions()
        .await
        .map_err(|e| e.to_string())
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
pub async fn configure_agent(_config: AgentConfig) -> Result<(), String> {
    // TODO: Store agent configuration
    Ok(())
}

#[tauri::command]
pub async fn list_agents() -> Result<Vec<AgentStatus>, String> {
    // TODO: Return list of configured agents
    Ok(vec![])
}

#[tauri::command]
pub async fn send_message(
    request: SendMessageRequest,
    session_manager: State<'_, SessionManager>,
) -> Result<Vec<ConversationMessage>, String> {
    session_manager
        .execute_user_request(&request.session_id, request.message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_conversation_history(
    session_id: String,
    session_manager: State<'_, SessionManager>,
) -> Result<Vec<ConversationMessage>, String> {
    Ok(session_manager.get_conversation_history(&session_id).await)
}

#[tauri::command]
pub async fn pause_session(
    session_id: String,
    session_manager: State<'_, SessionManager>,
) -> Result<(), String> {
    session_manager
        .pause_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_session(
    session_id: String,
    session_manager: State<'_, SessionManager>,
) -> Result<(), String> {
    session_manager
        .resume_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}