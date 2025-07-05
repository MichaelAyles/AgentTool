use crate::models::*;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::process::Child;
use tokio::io::{AsyncBufReadExt, BufReader, AsyncWriteExt};
use anyhow::Result;

pub struct ClaudeCodeAdapter {
    processes: Arc<Mutex<HashMap<String, ClaudeCodeProcess>>>,
    executable_path: String,
}

struct ClaudeCodeProcess {
    child: Child,
    session_id: String,
    project_path: String,
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
            session_id: session_id.clone(),
            project_path,
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
        context: Option<&str>,
    ) -> Result<TaskResult> {
        let mut processes = self.processes.lock().unwrap();
        
        let process = processes.get_mut(session_id)
            .ok_or_else(|| anyhow::anyhow!("Session not found: {}", session_id))?;

        // Validate task against permissions
        if !self.validate_task_permissions(task, &process.permissions) {
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

        // Send task to Claude Code process
        let task_with_context = if let Some(ctx) = context {
            format!("Context: {}\n\nTask: {}", ctx, task)
        } else {
            task.to_string()
        };

        if let Some(stdin) = process.child.stdin.as_mut() {
            stdin.write_all(task_with_context.as_bytes()).await
                .map_err(|e| anyhow::anyhow!("Failed to write to process: {}", e))?;
            stdin.write_all(b"\n").await?;
            stdin.flush().await?;
        }

        // Read response (simplified - in real implementation would handle streaming)
        let mut output = String::new();
        if let Some(stdout) = process.child.stdout.as_mut() {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            
            // Read a few lines as example (real implementation would be more sophisticated)
            for _ in 0..10 {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break, // EOF
                    Ok(_) => output.push_str(&line),
                    Err(_) => break,
                }
            }
        }

        Ok(TaskResult {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            task_description: task.to_string(),
            agent_type: "claude_code".to_string(),
            status: if output.is_empty() { TaskStatus::Failed } else { TaskStatus::Completed },
            result: if output.is_empty() { None } else { Some(output.clone()) },
            error: if output.is_empty() { Some("No output received".to_string()) } else { None },
            created_at: chrono::Utc::now(),
            completed_at: Some(chrono::Utc::now()),
        })
    }

    pub async fn stop_session(&self, session_id: &str) -> Result<()> {
        let mut processes = self.processes.lock().unwrap();
        
        if let Some(mut process) = processes.remove(session_id) {
            // Send termination signal
            if let Err(e) = process.child.kill().await {
                eprintln!("Warning: Failed to kill process for session {}: {}", session_id, e);
            }
            
            // Wait for process to exit (with timeout in real implementation)
            let _ = process.child.wait().await;
        }

        Ok(())
    }

    pub fn list_active_sessions(&self) -> Vec<String> {
        let processes = self.processes.lock().unwrap();
        processes.keys().cloned().collect()
    }

    pub fn get_session_status(&self, session_id: &str) -> Option<AgentStatus> {
        let processes = self.processes.lock().unwrap();
        
        if let Some(process) = processes.get(session_id) {
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

    pub async fn cleanup_all_sessions(&self) -> Result<()> {
        let mut processes = self.processes.lock().unwrap();
        let session_ids: Vec<String> = processes.keys().cloned().collect();
        drop(processes);

        for session_id in session_ids {
            let _ = self.stop_session(&session_id).await;
        }

        Ok(())
    }
}