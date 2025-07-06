// use crate::models::*; // Unused - types are defined locally
use serde_json::json;
// Removed unused imports - these were only used in commented-out methods
// use std::process::Stdio;
// use tokio::process::Command;
// use tokio::io::{AsyncBufReadExt, BufReader};

pub struct MiddleManager {
    openrouter_api_key: String,
    default_model: String,
}

impl MiddleManager {
    pub fn new(openrouter_api_key: String, default_model: String) -> Self {
        Self {
            openrouter_api_key,
            default_model,
        }
    }

    pub async fn process_task(&self, task: &str, context: &str) -> Result<TaskDecomposition, String> {
        let prompt = format!(
            r#"You are a Middle Manager Agent responsible for coordinating AI coding assistants.

Your job is to analyze the given task and decide:
1. Whether to handle it yourself or delegate to subagents
2. If delegating, break it into smaller tasks
3. Choose the appropriate agent(s) for each subtask

Available agents:
- claude_code: Best for code analysis, writing, debugging, complex reasoning
- gemini_cli: Good for quick tasks, code generation, simple operations
- middle_manager: For coordination, planning, high-level analysis

Current task: {}
Context: {}

Respond with JSON in this format:
{{
  "strategy": "direct|delegate|hybrid",
  "reasoning": "explanation of approach",
  "subtasks": [
    {{
      "id": "unique_id",
      "description": "task description", 
      "agent": "claude_code|gemini_cli|middle_manager",
      "priority": "high|medium|low",
      "dependencies": ["other_task_ids"]
    }}
  ]
}}"#,
            task, context
        );

        match self.call_openrouter_api(&prompt).await {
            Ok(response) => return self.parse_decomposition_response(&response),
            Err(_) => {
                // Fallback to simple decomposition
                println!("OpenRouter API call failed, using fallback decomposition");
            }
        }
        Ok(TaskDecomposition {
            strategy: "delegate".to_string(),
            reasoning: "Task requires code analysis and implementation".to_string(),
            subtasks: vec![SubTask {
                id: uuid::Uuid::new_v4().to_string(),
                description: task.to_string(),
                agent: "claude_code".to_string(),
                priority: "high".to_string(),
                dependencies: vec![],
            }],
        })
    }

    // Commented out unused methods to remove dead code warnings
    // pub async fn coordinate_agents(&self, subtasks: Vec<SubTask>) -> Result<Vec<TaskResult>, String> {
    //     let mut results = Vec::new();
    //     
    //     for subtask in subtasks {
    //         let result = self.execute_subtask(&subtask).await?;
    //         results.push(result);
    //     }
    //     
    //     Ok(results)
    // }

    // async fn execute_subtask(&self, subtask: &SubTask) -> Result<TaskResult, String> {
    //     match subtask.agent.as_str() {
    //         "claude_code" => self.execute_claude_code_task(subtask).await,
    //         "gemini_cli" => self.execute_gemini_cli_task(subtask).await,
    //         "middle_manager" => self.execute_self_task(subtask).await,
    //         _ => Err(format!("Unknown agent type: {}", subtask.agent)),
    //     }
    // }

    // async fn execute_claude_code_task(&self, subtask: &SubTask) -> Result<TaskResult, String> {
    //     // TODO: Launch Claude Code in isolated process
    //     let mut child = Command::new("claude-code")
    //         .arg("--task")
    //         .arg(&subtask.description)
    //         .stdout(Stdio::piped())
    //         .stderr(Stdio::piped())
    //         .spawn()
    //         .map_err(|e| format!("Failed to start claude-code: {}", e))?;

    //     let stdout = child.stdout.take().unwrap();
    //     let mut reader = BufReader::new(stdout).lines();
    //     let mut output = String::new();

    //     while let Some(line) = reader.next_line().await.map_err(|e| e.to_string())? {
    //         output.push_str(&line);
    //         output.push('\n');
    //     }

    //     let status = child.wait().await.map_err(|e| e.to_string())?;

    //     Ok(TaskResult {
    //         id: uuid::Uuid::new_v4().to_string(),
    //         session_id: subtask.id.clone(),
    //         task_description: subtask.description.clone(),
    //         agent_type: subtask.agent.clone(),
    //         status: if status.success() { TaskStatus::Completed } else { TaskStatus::Failed },
    //         result: Some(output),
    //         error: if status.success() { None } else { Some("Task failed".to_string()) },
    //         created_at: chrono::Utc::now(),
    //         completed_at: Some(chrono::Utc::now()),
    //     })
    // }

    // async fn execute_gemini_cli_task(&self, subtask: &SubTask) -> Result<TaskResult, String> {
    //     // TODO: Implement Gemini CLI execution
    //     Ok(TaskResult {
    //         id: uuid::Uuid::new_v4().to_string(),
    //         session_id: subtask.id.clone(),
    //         task_description: subtask.description.clone(),
    //         agent_type: subtask.agent.clone(),
    //         status: TaskStatus::Completed,
    //         result: Some("Gemini CLI task completed".to_string()),
    //         error: None,
    //         created_at: chrono::Utc::now(),
    //         completed_at: Some(chrono::Utc::now()),
    //     })
    // }

    // async fn execute_self_task(&self, subtask: &SubTask) -> Result<TaskResult, String> {
    //     // Handle coordination tasks directly
    //     Ok(TaskResult {
    //         id: uuid::Uuid::new_v4().to_string(),
    //         session_id: subtask.id.clone(),
    //         task_description: subtask.description.clone(),
    //         agent_type: subtask.agent.clone(),
    //         status: TaskStatus::Completed,
    //         result: Some("Middle manager task completed".to_string()),
    //         error: None,
    //         created_at: chrono::Utc::now(),
    //         completed_at: Some(chrono::Utc::now()),
    //     })
    // }

    async fn call_openrouter_api(&self, prompt: &str) -> Result<String, String> {
        if self.openrouter_api_key.is_empty() {
            return Err("OpenRouter API key not configured".to_string());
        }

        let client = reqwest::Client::new();
        let payload = json!({
            "model": self.default_model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "max_tokens": 2000,
            "temperature": 0.7
        });

        let response = client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.openrouter_api_key))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("API request failed with status: {}", response.status()));
        }

        let response_text = response.text().await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        // Parse the OpenRouter response
        let response_json: serde_json::Value = serde_json::from_str(&response_text)
            .map_err(|e| format!("Failed to parse JSON: {}", e))?;

        if let Some(content) = response_json["choices"][0]["message"]["content"].as_str() {
            Ok(content.to_string())
        } else {
            Err("Invalid response format from OpenRouter".to_string())
        }
    }

    fn parse_decomposition_response(&self, response: &str) -> Result<TaskDecomposition, String> {
        // Try to extract JSON from the response
        let json_start = response.find('{');
        let json_end = response.rfind('}');
        
        if let (Some(start), Some(end)) = (json_start, json_end) {
            let json_str = &response[start..=end];
            match serde_json::from_str::<TaskDecomposition>(json_str) {
                Ok(decomposition) => Ok(decomposition),
                Err(_) => {
                    // Fallback to simple parsing or default
                    Ok(TaskDecomposition {
                        strategy: "delegate".to_string(),
                        reasoning: "Parsed from AI response".to_string(),
                        subtasks: vec![SubTask {
                            id: uuid::Uuid::new_v4().to_string(),
                            description: response.lines().next().unwrap_or("AI generated task").to_string(),
                            agent: "claude_code".to_string(),
                            priority: "high".to_string(),
                            dependencies: vec![],
                        }],
                    })
                }
            }
        } else {
            Err("No valid JSON found in response".to_string())
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct TaskDecomposition {
    pub strategy: String,
    pub reasoning: String,
    pub subtasks: Vec<SubTask>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SubTask {
    pub id: String,
    pub description: String,
    pub agent: String,
    pub priority: String,
    pub dependencies: Vec<String>,
}