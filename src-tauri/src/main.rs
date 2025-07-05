// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod models;
mod agent_registry;
mod middle_manager;
mod database;
mod claude_code_adapter;
mod gemini_cli_adapter;
mod session_manager;
mod git_worktree_manager;

use tauri::Manager;
use commands::*;
use session_manager::SessionManager;

#[tokio::main]
async fn main() {
    // Initialize database
    database::init_database().expect("Failed to initialize database");

    // Initialize session manager
    let session_manager = SessionManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(session_manager)
        .invoke_handler(tauri::generate_handler![
            greet,
            create_session,
            get_sessions,
            execute_task,
            get_agent_status,
            configure_agent,
            list_agents,
            send_message,
            get_conversation_history,
            pause_session,
            resume_session
        ])
        .setup(|app| {
            // Initialize agent registry on startup
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                agent_registry::initialize_registry(app_handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}