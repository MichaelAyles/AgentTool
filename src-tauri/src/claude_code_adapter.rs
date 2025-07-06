use crate::models::*;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::process::Child;
// use tokio::io::{AsyncBufReadExt, BufReader, AsyncWriteExt}; // Removed unused imports
use anyhow::Result;

pub struct ClaudeCodeAdapter {
    processes: Arc<Mutex<HashMap<String, ClaudeCodeProcess>>>,
    executable_path: String,
}

struct ClaudeCodeProcess {
    child: Child,
    _session_id: String,
    _project_path: String,
    permissions: AgentPermissions,
}

impl ClaudeCodeAdapter {
    pub fn new(executable_path: String) -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            executable_path,
        }
    }

    pub async fn start_session(
        &self,
        session_id: String,
        project_path: String,
        permissions: AgentPermissions,
    ) -> Result<String> {
        let mut processes = self.processes.lock().unwrap();
        
        // Check if session already exists
        if processes.contains_key(&session_id) {
            return Err(anyhow::anyhow!("Session already exists: {}", session_id));
        }

        // Build command with security restrictions
        let mut cmd = tokio::process::Command::new(&self.executable_path);
        
        // Set working directory if allowed
        if permissions.allowed_paths.iter().any(|p| project_path.starts_with(p) || p == "**") {
            cmd.current_dir(&project_path);
        }

        // Add security flags
        cmd.arg("--no-update-check");
        
        if !permissions.network_access {
            cmd.arg("--no-network");
        }

        // Configure stdio for interaction
        cmd.stdin(Stdio::piped())
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());

        // Set restricted environment variables
        cmd.env_clear();
        cmd.env("PATH", std::env::var("PATH").unwrap_or_default());
        if permissions.file_read || permissions.file_write {
            cmd.env("CLAUDE_PROJECT_PATH", &project_path);
        }

        // Spawn the process
        let child = cmd.spawn()
            .map_err(|e| anyhow::anyhow!("Failed to spawn Claude Code process: {}", e))?;

        let process = ClaudeCodeProcess {
            child,
            _session_id: session_id.clone(),
            _project_path: project_path,
            permissions,
        };

        processes.insert(session_id.clone(), process);
        drop(processes);

        Ok(session_id)
    }

    pub async fn execute_task(
        &self,
        session_id: &str,
        task: &str,
        _context: Option<&str>,
    ) -> Result<TaskResult> {
        // Check permissions without holding the lock
        let permissions = {
            let processes = self.processes.lock().unwrap();
            let process = processes.get(session_id)
                .ok_or_else(|| anyhow::anyhow!("Session not found: {}", session_id))?;
            process.permissions.clone()
        };

        // Validate task against permissions
        if !self.validate_task_permissions(task, &permissions) {
            return Ok(TaskResult {
                id: uuid::Uuid::new_v4().to_string(),
                session_id: session_id.to_string(),
                task_description: task.to_string(),
                agent_type: "claude_code".to_string(),
                status: TaskStatus::Failed,
                result: None,
                error: Some("Task not allowed by current permissions".to_string()),
                created_at: chrono::Utc::now(),
                completed_at: Some(chrono::Utc::now()),
            });
        }

        // For now, return a mock result since we can't safely execute with the current architecture
        // In a real implementation, we'd need to redesign the process management to use channels
        // or other async-safe communication patterns
        Ok(TaskResult {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            task_description: task.to_string(),
            agent_type: "claude_code".to_string(),
            status: TaskStatus::Completed,
            result: Some(format!("Claude Code would execute: {}", task)),
            error: None,
            created_at: chrono::Utc::now(),
            completed_at: Some(chrono::Utc::now()),
        })
    }

    pub async fn stop_session(&self, session_id: &str) -> Result<()> {
        let process = {
            let mut processes = self.processes.lock().unwrap();
            processes.remove(session_id)
        };
        
        if let Some(mut process) = process {
            // Send termination signal
            if let Err(e) = process.child.kill().await {
                eprintln!("Warning: Failed to kill process for session {}: {}", session_id, e);
            }
            
            // Wait for process to exit (with timeout in real implementation)
            let _ = process.child.wait().await;
        }

        Ok(())
    }

    // Commented out unused methods to remove dead code warnings
    // pub fn list_active_sessions(&self) -> Vec<String> {
    //     let processes = self.processes.lock().unwrap();
    //     processes.keys().cloned().collect()
    // }

    pub fn get_session_status(&self, session_id: &str) -> Option<AgentStatus> {
        let processes = self.processes.lock().unwrap();
        
        if let Some(_process) = processes.get(session_id) {
            Some(AgentStatus {
                id: session_id.to_string(),
                name: "Claude Code".to_string(),
                agent_type: "claude_code".to_string(),
                status: "active".to_string(),
                current_task: None, // Would track current task in real implementation
                last_activity: chrono::Utc::now(),
            })
        } else {
            None
        }
    }

    fn validate_task_permissions(&self, task: &str, permissions: &AgentPermissions) -> bool {
        let task_lower = task.to_lowercase();
        
        // Check file operations
        if (task_lower.contains("read") || task_lower.contains("open")) && !permissions.file_read {
            return false;
        }
        
        if (task_lower.contains("write") || task_lower.contains("save") || task_lower.contains("create")) && !permissions.file_write {
            return false;
        }
        
        // Check network operations
        if (task_lower.contains("fetch") || task_lower.contains("download") || task_lower.contains("http")) && !permissions.network_access {
            return false;
        }
        
        // Check process spawning
        if (task_lower.contains("run") || task_lower.contains("execute") || task_lower.contains("spawn")) && !permissions.process_spawn {
            return false;
        }
        
        true
    }

    // pub async fn cleanup_all_sessions(&self) -> Result<()> {
    //     let processes = self.processes.lock().unwrap();
    //     let session_ids: Vec<String> = processes.keys().cloned().collect();
    //     drop(processes);

    //     for session_id in session_ids {
    //         let _ = self.stop_session(&session_id).await;
    //     }

    //     Ok(())
    // }
}