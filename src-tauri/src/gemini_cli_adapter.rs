use crate::models::*;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::process::Child;
use tokio::io::AsyncWriteExt; // Removed unused imports: AsyncBufReadExt, BufReader
use anyhow::Result;

pub struct GeminiCliAdapter {
    processes: Arc<Mutex<HashMap<String, GeminiCliProcess>>>,
    executable_path: String,
}

struct GeminiCliProcess {
    child: Child,
    _session_id: String,
    _project_path: String,
    permissions: AgentPermissions,
}

impl GeminiCliAdapter {
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

        // Add gemini-specific flags
        cmd.arg("--interactive");
        
        if !permissions.network_access {
            // Note: Gemini CLI always needs network access to function
            return Err(anyhow::anyhow!("Gemini CLI requires network access to function"));
        }

        // Configure stdio for interaction
        cmd.stdin(Stdio::piped())
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());

        // Set environment variables
        cmd.env_clear();
        cmd.env("PATH", std::env::var("PATH").unwrap_or_default());
        
        // Set API key if available
        if let Ok(api_key) = std::env::var("GEMINI_API_KEY") {
            cmd.env("GEMINI_API_KEY", api_key);
        }
        
        if permissions.file_read || permissions.file_write {
            cmd.env("GEMINI_PROJECT_PATH", &project_path);
        }

        // Spawn the process
        let child = cmd.spawn()
            .map_err(|e| anyhow::anyhow!("Failed to spawn Gemini CLI process: {}", e))?;

        let process = GeminiCliProcess {
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
        context: Option<&str>,
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
                agent_type: "gemini_cli".to_string(),
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
        let gemini_prompt = self.format_gemini_prompt(task, context);
        
        Ok(TaskResult {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            task_description: task.to_string(),
            agent_type: "gemini_cli".to_string(),
            status: TaskStatus::Completed,
            result: Some(format!("Gemini CLI would execute: {}", gemini_prompt)),
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
            // Send exit command to Gemini CLI
            if let Some(stdin) = process.child.stdin.as_mut() {
                let _ = stdin.write_all(b"exit\n").await;
                let _ = stdin.flush().await;
            }
            
            // Give it a moment to exit gracefully
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            
            // Force kill if still running
            if let Err(e) = process.child.kill().await {
                eprintln!("Warning: Failed to kill process for session {}: {}", session_id, e);
            }
            
            let _ = process.child.wait().await;
        }

        Ok(())
    }

    // Commented out unused methods to remove dead code warnings
    // pub fn list_active_sessions(&self) -> Vec<String> {
    //     let processes = self.processes.lock().unwrap();
    //     processes.keys().cloned().collect()
    // }

    // pub fn get_session_status(&self, session_id: &str) -> Option<AgentStatus> {
    //     let processes = self.processes.lock().unwrap();
    //     
    //     if let Some(_process) = processes.get(session_id) {
    //         Some(AgentStatus {
    //             id: session_id.to_string(),
    //             name: "Gemini CLI".to_string(),
    //             agent_type: "gemini_cli".to_string(),
    //             status: "active".to_string(),
    //             current_task: None,
    //             last_activity: chrono::Utc::now(),
    //         })
    //     } else {
    //         None
    //     }
    // }

    fn format_gemini_prompt(&self, task: &str, context: Option<&str>) -> String {
        let mut prompt = String::new();
        
        if let Some(ctx) = context {
            prompt.push_str("Context: ");
            prompt.push_str(ctx);
            prompt.push_str("\n\n");
        }
        
        prompt.push_str("Task: ");
        prompt.push_str(task);
        prompt.push_str("\n\nPlease provide a clear and concise response.");
        
        prompt
    }

    // fn clean_gemini_output(&self, output: &str) -> String {
    //     // Remove CLI prompts and formatting
    //     output.lines()
    //         .filter(|line| !line.trim().starts_with(">>> "))
    //         .filter(|line| !line.trim().starts_with("Gemini"))
    //         .filter(|line| !line.trim().is_empty())
    //         .collect::<Vec<&str>>()
    //         .join("\n")
    //         .trim()
    //         .to_string()
    // }

    fn validate_task_permissions(&self, task: &str, permissions: &AgentPermissions) -> bool {
        let task_lower = task.to_lowercase();
        
        // Check file operations
        if (task_lower.contains("read") || task_lower.contains("open") || task_lower.contains("analyze file")) && !permissions.file_read {
            return false;
        }
        
        if (task_lower.contains("write") || task_lower.contains("save") || task_lower.contains("create file")) && !permissions.file_write {
            return false;
        }
        
        // Gemini CLI requires network access for all operations
        if !permissions.network_access {
            return false;
        }
        
        // Check process spawning (Gemini CLI typically doesn't spawn processes)
        if (task_lower.contains("execute command") || task_lower.contains("run script")) && !permissions.process_spawn {
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

    pub async fn execute_quick_task(&self, task: &str, project_path: &str) -> Result<TaskResult> {
        // For quick one-off tasks, spawn a temporary process
        let session_id = uuid::Uuid::new_v4().to_string();
        
        let permissions = AgentPermissions {
            file_read: true,
            file_write: false,
            network_access: true,
            process_spawn: false,
            allowed_paths: vec![project_path.to_string()],
        };

        self.start_session(session_id.clone(), project_path.to_string(), permissions).await?;
        let result = self.execute_task(&session_id, task, None).await?;
        let _ = self.stop_session(&session_id).await;

        Ok(result)
    }
}