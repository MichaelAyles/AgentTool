use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::AppHandle;
use crate::models::*;

pub struct AgentRegistry {
    agents: Arc<RwLock<HashMap<String, AgentConfig>>>,
    _running_agents: Arc<RwLock<HashMap<String, AgentStatus>>>,
}

impl AgentRegistry {
    pub fn new() -> Self {
        Self {
            agents: Arc::new(RwLock::new(HashMap::new())),
            _running_agents: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register_agent(&self, config: AgentConfig) -> Result<(), String> {
        let mut agents = self.agents.write().await;
        agents.insert(config.id.clone(), config);
        Ok(())
    }

    // Commented out unused methods to remove dead code warnings
    // pub async fn get_agent(&self, agent_id: &str) -> Option<AgentConfig> {
    //     let agents = self.agents.read().await;
    //     agents.get(agent_id).cloned()
    // }

    // pub async fn list_agents(&self) -> Vec<AgentConfig> {
    //     let agents = self.agents.read().await;
    //     agents.values().cloned().collect()
    // }

    // pub async fn update_agent_status(&self, status: AgentStatus) {
    //     let mut running_agents = self._running_agents.write().await;
    //     running_agents.insert(status.id.clone(), status);
    // }

    // pub async fn get_agent_status(&self, agent_id: &str) -> Option<AgentStatus> {
    //     let running_agents = self._running_agents.read().await;
    //     running_agents.get(agent_id).cloned()
    // }

    // pub async fn list_running_agents(&self) -> Vec<AgentStatus> {
    //     let running_agents = self._running_agents.read().await;
    //     running_agents.values().cloned().collect()
    // }

    // pub async fn remove_agent(&self, agent_id: &str) -> bool {
    //     let mut agents = self.agents.write().await;
    //     let mut running_agents = self._running_agents.write().await;
    //     
    //     let removed = agents.remove(agent_id).is_some();
    //     running_agents.remove(agent_id);
    //     
    //     removed
    // }
}

static mut REGISTRY: Option<AgentRegistry> = None;

pub async fn initialize_registry(_app_handle: AppHandle) {
    let registry = AgentRegistry::new();
    
    // Register default agents
    let claude_config = AgentConfig {
        id: "claude_code".to_string(),
        name: "Claude Code".to_string(),
        agent_type: "claude_code".to_string(),
        config: serde_json::json!({
            "executable_path": "claude-code",
            "default_args": ["--no-update-check"]
        }),
        permissions: AgentPermissions {
            file_read: true,
            file_write: true,
            network_access: true,
            process_spawn: true,
            allowed_paths: vec!["**".to_string()],
        },
    };

    let gemini_config = AgentConfig {
        id: "gemini_cli".to_string(),
        name: "Gemini CLI".to_string(),
        agent_type: "gemini_cli".to_string(),
        config: serde_json::json!({
            "executable_path": "gemini",
            "default_args": []
        }),
        permissions: AgentPermissions {
            file_read: true,
            file_write: true,
            network_access: true,
            process_spawn: true,
            allowed_paths: vec!["**".to_string()],
        },
    };

    let middle_manager_config = AgentConfig {
        id: "middle_manager".to_string(),
        name: "Middle Manager".to_string(),
        agent_type: "middle_manager".to_string(),
        config: serde_json::json!({
            "openrouter_api_key": "",
            "default_model": "anthropic/claude-3-sonnet",
            "task_decomposition_enabled": true
        }),
        permissions: AgentPermissions {
            file_read: true,
            file_write: false,
            network_access: true,
            process_spawn: false,
            allowed_paths: vec!["**".to_string()],
        },
    };

    registry.register_agent(claude_config).await.unwrap();
    registry.register_agent(gemini_config).await.unwrap();
    registry.register_agent(middle_manager_config).await.unwrap();

    unsafe {
        REGISTRY = Some(registry);
    }
}

pub fn get_registry() -> &'static AgentRegistry {
    unsafe {
        REGISTRY.as_ref().expect("Agent registry not initialized")
    }
}

// Additional agent registry functions for commands.rs
pub async fn get_agent_status(agent_id: &str) -> Option<AgentStatus> {
    let registry = get_registry();
    let agents = registry.agents.read().await;
    
    if let Some(config) = agents.get(agent_id) {
        Some(AgentStatus {
            id: config.id.clone(),
            name: config.name.clone(),
            agent_type: config.agent_type.clone(),
            status: "ready".to_string(),
            current_task: None,
            last_activity: chrono::Utc::now(),
        })
    } else {
        None
    }
}

pub async fn update_agent_config(config: AgentConfig) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let registry = get_registry();
    let mut agents = registry.agents.write().await;
    agents.insert(config.id.clone(), config);
    Ok(())
}

pub async fn list_all_agents() -> Result<Vec<AgentStatus>, Box<dyn std::error::Error + Send + Sync>> {
    let registry = get_registry();
    let agents = registry.agents.read().await;
    
    let agent_statuses: Vec<AgentStatus> = agents.values().map(|config| {
        AgentStatus {
            id: config.id.clone(),
            name: config.name.clone(),
            agent_type: config.agent_type.clone(),
            status: "ready".to_string(),
            current_task: None,
            last_activity: chrono::Utc::now(),
        }
    }).collect();
    
    Ok(agent_statuses)
}
