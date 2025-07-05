use anyhow::Result;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

pub struct GitWorktreeManager {
    base_worktree_dir: PathBuf,
}

impl GitWorktreeManager {
    pub fn new(base_worktree_dir: PathBuf) -> Self {
        Self { base_worktree_dir }
    }

    /// Create a new git worktree for a session
    pub async fn create_worktree(
        &self,
        project_path: &Path,
        session_id: &str,
        branch_name: Option<String>,
        base_branch: Option<String>,
    ) -> Result<PathBuf> {
        // Ensure the base worktree directory exists
        tokio::fs::create_dir_all(&self.base_worktree_dir).await?;

        // Generate a unique worktree name
        let worktree_name = format!("session-{}", session_id);
        let worktree_path = self.base_worktree_dir.join(&worktree_name);

        // Determine branch names
        let target_branch = branch_name.unwrap_or_else(|| format!("session/{}", session_id));
        let base_branch = base_branch.unwrap_or_else(|| self.get_main_branch(project_path).unwrap_or("main".to_string()));

        // Check if we're in a git repository
        if !self.is_git_repo(project_path)? {
            return Err(anyhow::anyhow!("Not a git repository: {}", project_path.display()));
        }

        // Create the branch if it doesn't exist
        self.create_branch_if_not_exists(project_path, &target_branch, &base_branch)?;

        // Create the worktree
        let output = Command::new("git")
            .current_dir(project_path)
            .args([
                "worktree",
                "add",
                worktree_path.to_str().unwrap(),
                &target_branch,
            ])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Failed to create worktree: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        // Initialize the worktree with session metadata
        self.initialize_worktree_metadata(&worktree_path, session_id, &target_branch).await?;

        Ok(worktree_path)
    }

    /// Remove a git worktree
    pub async fn remove_worktree(&self, project_path: &Path, worktree_path: &Path) -> Result<()> {
        // Get the branch name before removing the worktree
        let branch_name = self.get_worktree_branch(worktree_path)?;

        // Remove the worktree
        let output = Command::new("git")
            .current_dir(project_path)
            .args([
                "worktree",
                "remove",
                "--force",
                worktree_path.to_str().unwrap(),
            ])
            .output()?;

        if !output.status.success() {
            eprintln!(
                "Warning: Failed to remove worktree {}: {}",
                worktree_path.display(),
                String::from_utf8_lossy(&output.stderr)
            );
        }

        // Clean up the branch if it was a session branch
        if branch_name.starts_with("session/") {
            let _ = self.delete_branch(project_path, &branch_name);
        }

        Ok(())
    }

    /// Squash commits in a worktree and merge to main branch
    pub async fn squash_and_merge_to_main(
        &self,
        project_path: &Path,
        worktree_path: &Path,
        commit_message: &str,
        main_branch: Option<String>,
    ) -> Result<()> {
        let main_branch = main_branch.unwrap_or_else(|| self.get_main_branch(project_path).unwrap_or("main".to_string()));
        let current_branch = self.get_worktree_branch(worktree_path)?;

        // Switch to main branch in the original repo
        Command::new("git")
            .current_dir(project_path)
            .args(["checkout", &main_branch])
            .output()?;

        // Pull latest changes from remote
        let _ = Command::new("git")
            .current_dir(project_path)
            .args(["pull", "origin", &main_branch])
            .output();

        // Merge the session branch with squash
        let output = Command::new("git")
            .current_dir(project_path)
            .args([
                "merge",
                "--squash",
                &current_branch,
            ])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Failed to squash merge: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        // Commit the squashed changes
        let output = Command::new("git")
            .current_dir(project_path)
            .args(["commit", "-m", commit_message])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Failed to commit squashed changes: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(())
    }

    /// Rebase the worktree branch onto the latest main
    pub async fn rebase_onto_main(
        &self,
        project_path: &Path,
        worktree_path: &Path,
        main_branch: Option<String>,
    ) -> Result<()> {
        let main_branch = main_branch.unwrap_or_else(|| self.get_main_branch(project_path).unwrap_or("main".to_string()));

        // Fetch latest changes
        Command::new("git")
            .current_dir(worktree_path)
            .args(["fetch", "origin"])
            .output()?;

        // Rebase onto main
        let output = Command::new("git")
            .current_dir(worktree_path)
            .args(["rebase", &format!("origin/{}", main_branch)])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Failed to rebase: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(())
    }

    /// Get the current branch of a worktree
    pub fn get_worktree_branch(&self, worktree_path: &Path) -> Result<String> {
        let output = Command::new("git")
            .current_dir(worktree_path)
            .args(["branch", "--show-current"])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Failed to get current branch: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(String::from_utf8(output.stdout)?.trim().to_string())
    }

    /// Get the main branch name (main, master, or develop)
    pub fn get_main_branch(&self, project_path: &Path) -> Option<String> {
        // Try common main branch names
        for branch in ["main", "master", "develop"] {
            let output = Command::new("git")
                .current_dir(project_path)
                .args(["show-ref", "--verify", &format!("refs/heads/{}", branch)])
                .output();

            if let Ok(output) = output {
                if output.status.success() {
                    return Some(branch.to_string());
                }
            }
        }

        // Try to get the default branch from remote
        let output = Command::new("git")
            .current_dir(project_path)
            .args(["symbolic-ref", "refs/remotes/origin/HEAD"])
            .output();

        if let Ok(output) = output {
            if output.status.success() {
                let branch_ref = String::from_utf8_lossy(&output.stdout);
                if let Some(branch_name) = branch_ref.trim().strip_prefix("refs/remotes/origin/") {
                    return Some(branch_name.to_string());
                }
            }
        }

        None
    }

    /// List all worktrees for a project
    pub fn list_worktrees(&self, project_path: &Path) -> Result<Vec<WorktreeInfo>> {
        let output = Command::new("git")
            .current_dir(project_path)
            .args(["worktree", "list", "--porcelain"])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Failed to list worktrees: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let mut worktrees = Vec::new();
        let output_str = String::from_utf8(output.stdout)?;
        let mut current_worktree = WorktreeInfo::default();

        for line in output_str.lines() {
            if line.starts_with("worktree ") {
                if !current_worktree.path.is_empty() {
                    worktrees.push(current_worktree);
                }
                current_worktree = WorktreeInfo {
                    path: line.strip_prefix("worktree ").unwrap().to_string(),
                    ..Default::default()
                };
            } else if line.starts_with("branch ") {
                current_worktree.branch = line.strip_prefix("branch ").unwrap().to_string();
            } else if line.starts_with("HEAD ") {
                current_worktree.head = line.strip_prefix("HEAD ").unwrap().to_string();
            }
        }

        if !current_worktree.path.is_empty() {
            worktrees.push(current_worktree);
        }

        Ok(worktrees)
    }

    /// Check if a directory is a git repository
    fn is_git_repo(&self, path: &Path) -> Result<bool> {
        let output = Command::new("git")
            .current_dir(path)
            .args(["rev-parse", "--git-dir"])
            .output()?;

        Ok(output.status.success())
    }

    /// Create a branch if it doesn't exist
    fn create_branch_if_not_exists(
        &self,
        project_path: &Path,
        branch_name: &str,
        base_branch: &str,
    ) -> Result<()> {
        // Check if branch exists
        let output = Command::new("git")
            .current_dir(project_path)
            .args(["show-ref", "--verify", &format!("refs/heads/{}", branch_name)])
            .output()?;

        if output.status.success() {
            // Branch already exists
            return Ok(());
        }

        // Create the branch
        let output = Command::new("git")
            .current_dir(project_path)
            .args(["checkout", "-b", branch_name, base_branch])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Failed to create branch {}: {}",
                branch_name,
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(())
    }

    /// Delete a branch
    fn delete_branch(&self, project_path: &Path, branch_name: &str) -> Result<()> {
        let output = Command::new("git")
            .current_dir(project_path)
            .args(["branch", "-D", branch_name])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Failed to delete branch {}: {}",
                branch_name,
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(())
    }

    /// Initialize worktree with session metadata
    async fn initialize_worktree_metadata(
        &self,
        worktree_path: &Path,
        session_id: &str,
        branch_name: &str,
    ) -> Result<()> {
        let metadata = serde_json::json!({
            "session_id": session_id,
            "branch_name": branch_name,
            "created_at": chrono::Utc::now().to_rfc3339(),
            "agent_tool_version": env!("CARGO_PKG_VERSION"),
        });

        let metadata_path = worktree_path.join(".agenttool-session.json");
        tokio::fs::write(metadata_path, metadata.to_string()).await?;

        Ok(())
    }

    /// Clean up all worktrees for abandoned sessions
    pub async fn cleanup_abandoned_worktrees(&self, project_path: &Path, active_session_ids: &[String]) -> Result<()> {
        let worktrees = self.list_worktrees(project_path)?;

        for worktree in worktrees {
            // Skip the main worktree
            if worktree.path == project_path.to_string_lossy() {
                continue;
            }

            // Check if this is a session worktree
            let metadata_path = Path::new(&worktree.path).join(".agenttool-session.json");
            if let Ok(metadata_content) = tokio::fs::read_to_string(&metadata_path).await {
                if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(&metadata_content) {
                    if let Some(session_id) = metadata["session_id"].as_str() {
                        if !active_session_ids.contains(&session_id.to_string()) {
                            // This session is no longer active, clean up the worktree
                            let _ = self.remove_worktree(project_path, Path::new(&worktree.path)).await;
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Default)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub head: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_worktree_creation() {
        // This test would require a git repository setup
        // Implementation would depend on test infrastructure
    }
}