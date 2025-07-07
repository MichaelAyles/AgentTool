use rusqlite::Connection;
use anyhow::Result;
use std::sync::{Arc, Mutex};
use crate::models::*;
use crate::session_manager::ConversationMessage;

pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(database_path: &str) -> Result<Self> {
        let conn = Connection::open(database_path)?;
        
        // Run migrations
        Self::run_migrations(&conn)?;
        
        Ok(Self { 
            conn: Arc::new(Mutex::new(conn))
        })
    }

    fn run_migrations(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                project_path TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                worktree_path TEXT,
                branch_name TEXT
            );

            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                agent_type TEXT NOT NULL,
                config TEXT NOT NULL,
                permissions TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                task_description TEXT NOT NULL,
                agent_type TEXT NOT NULL,
                status TEXT NOT NULL,
                result TEXT,
                error TEXT,
                created_at TEXT NOT NULL,
                completed_at TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );

            CREATE TABLE IF NOT EXISTS agent_messages (
                id TEXT PRIMARY KEY,
                from_agent TEXT NOT NULL,
                to_agent TEXT,
                message_type TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            "#
        )?;

        Ok(())
    }

    pub fn create_session(&self, session: &Session) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO sessions 
            (id, name, project_path, description, status, created_at, updated_at, worktree_path, branch_name)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            (
                &session.id,
                &session.name,
                &session.project_path,
                &session.description,
                &format!("{:?}", session.status),
                &session.created_at.to_rfc3339(),
                &session.updated_at.to_rfc3339(),
                &session.worktree_path,
                &session.branch_name,
            )
        )?;

        Ok(())
    }

    pub fn get_sessions(&self) -> Result<Vec<Session>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM sessions ORDER BY updated_at DESC")?;
        
        let session_iter = stmt.query_map([], |row| {
            let status_str: String = row.get("status")?;
            let status = match status_str.as_str() {
                "Created" => SessionStatus::Created,
                "Active" => SessionStatus::Active,
                "Paused" => SessionStatus::Paused,
                "Completed" => SessionStatus::Completed,
                "Failed" => SessionStatus::Failed,
                _ => SessionStatus::Created,
            };

            Ok(Session {
                id: row.get("id")?,
                name: row.get("name")?,
                project_path: row.get("project_path")?,
                description: row.get("description")?,
                status,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<usize, String>(5)?)
                    .map_err(|e| rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(e)))?
                    .with_timezone(&chrono::Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<usize, String>(6)?)
                    .map_err(|e| rusqlite::Error::FromSqlConversionFailure(6, rusqlite::types::Type::Text, Box::new(e)))?
                    .with_timezone(&chrono::Utc),
                worktree_path: row.get("worktree_path")?,
                branch_name: row.get("branch_name")?,
            })
        })?;

        let mut sessions = Vec::new();
        for session in session_iter {
            sessions.push(session?);
        }

        Ok(sessions)
    }

    // Commented out unused method to remove dead code warning
    // pub fn create_task(&self, task: &TaskResult) -> Result<()> {
    //     let conn = self.conn.lock().unwrap();
    //     conn.execute(
    //         r#"
    //         INSERT INTO tasks 
    //         (id, session_id, task_description, agent_type, status, result, error, created_at, completed_at)
    //         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    //         "#,
    //         (
    //             &task.id,
    //             &task.session_id,
    //             &task.task_description,
    //             &task.agent_type,
    //             &format!("{:?}", task.status),
    //             &task.result,
    //             &task.error,
    //             &task.created_at.to_rfc3339(),
    //             &task.completed_at.map(|dt| dt.to_rfc3339()),
    //         )
    //     )?;

    //     Ok(())
    // }
}

static mut DATABASE: Option<Database> = None;

pub fn init_database() -> Result<()> {
    let database = Database::new("agenttool.db")?;
    unsafe {
        DATABASE = Some(database);
    }
    Ok(())
}

pub fn get_database() -> &'static Database {
    unsafe {
        DATABASE.as_ref().expect("Database not initialized")
    }
}

// Additional database functions for agent management
pub async fn store_agent_config(config: &AgentConfig) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let db = get_database();
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO agents (id, name, agent_type, config, permissions, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            &config.id,
            &config.name,
            &config.agent_type,
            &serde_json::to_string(&config.config)?,
            &serde_json::to_string(&config.permissions)?,
            &chrono::Utc::now().to_rfc3339(),
            &chrono::Utc::now().to_rfc3339(),
        ),
    )?;
    Ok(())
}

pub async fn store_message(session_id: &str, message: &ConversationMessage) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let db = get_database();
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO agent_messages (id, from_agent, to_agent, message_type, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &uuid::Uuid::new_v4().to_string(),
            &format!("{:?}", message.role),
            &session_id,
            "user_message",
            &message.content,
            &message.created_at.to_rfc3339(),
        ),
    )?;
    Ok(())
}
