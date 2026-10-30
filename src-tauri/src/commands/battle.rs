use crate::runtime::python::{run_python_async, run_python_payload_async};
use serde_json::Value;

#[tauri::command]
pub(crate) async fn core_probe(app: tauri::AppHandle) -> Result<Value, String> {
    run_python_async(app, vec!["core-probe".to_string()]).await
}

#[tauri::command]
pub(crate) async fn trait_info(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "trait-info", payload).await
}

#[tauri::command]
pub(crate) async fn calculate_battle(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "calculate-battle", payload).await
}

#[tauri::command]
pub(crate) async fn calculate_quick_skills(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "calculate-quick-skills", payload).await
}

#[tauri::command]
pub(crate) async fn calculate_quick_skills_batch(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "calculate-quick-skills-batch", payload).await
}

#[tauri::command]
pub(crate) async fn trait_power_candidates(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "trait-power-candidates", payload).await
}

#[tauri::command]
pub(crate) async fn calculate_enemy_attack_skills(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "calculate-enemy-attack-skills", payload).await
}

#[tauri::command]
pub(crate) async fn calculate_watch_advantages(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "calculate-watch-advantages", payload).await
}

#[tauri::command]
pub(crate) async fn calculate_willpower(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "calculate-willpower", payload).await
}

#[tauri::command]
pub(crate) async fn calculate_required_power(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "calculate-required-power", payload).await
}
