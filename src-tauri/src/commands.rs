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
    // Route to appropriate agent based on agent_type
    let result = match request.agent_type.as_str() {
        "claude_code" => {
            crate::claude_code_adapter::execute_task(request).await
        },
        "gemini_cli" => {
            crate::gemini_cli_adapter::execute_task(request).await
        },
        "middle_manager" => {
            crate::middle_manager::MiddleManager::new().execute_task(request).await
        },
        _ => {
            return Err(format!("Unknown agent type: {}", request.agent_type));
        }
    };
    
    result
}

#[tauri::command]
pub async fn get_agent_status(agent_id: String) -> Result<AgentStatus, String> {
    // Get actual agent status from agent registry
    match crate::agent_registry::get_agent_status(&agent_id).await {
        Some(status) => Ok(status),
        None => Err(format!("Agent not found: {}", agent_id)),
    }
}

#[tauri::command]
pub async fn configure_agent(config: AgentConfig) -> Result<(), String> {
    // Store agent configuration in database and update registry
    crate::database::store_agent_config(&config).await
        .map_err(|e| format!("Failed to store agent configuration: {}", e))?;
    
    crate::agent_registry::update_agent_config(config).await
        .map_err(|e| format!("Failed to update agent registry: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn list_agents() -> Result<Vec<AgentStatus>, String> {
    // Return list of all configured agents from registry
    crate::agent_registry::list_all_agents().await
        .map_err(|e| format!("Failed to list agents: {}", e))
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
