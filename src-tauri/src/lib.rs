use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

#[derive(Debug, Deserialize)]
struct PythonEnvelope {
    ok: bool,
    data: Option<Value>,
    error: Option<String>,
}

fn resource_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut candidates =
        vec![PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources\\rocodatebase")];

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("rocodatebase"));
    }

    for candidate in &candidates {
        if candidate.join("desktop_api.py").is_file() {
            return Ok(candidate.clone());
        }
    }

    Err(format!(
        "Cannot locate rocodatebase resources. Tried: {}",
        candidates
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>()
            .join(" | ")
    ))
}

fn run_python(app: tauri::AppHandle, args: &[&str]) -> Result<Value, String> {
    let root = resource_root(&app)?;
    let script = root.join("desktop_api.py");
    let python = embedded_python(&app)?;
    let user_data_dir = app_data_dir(&app);
    std::fs::create_dir_all(&user_data_dir)
        .map_err(|error| format!("Cannot create app data dir: {error}"))?;
    let output = Command::new(&python)
        .arg(&script)
        .args(args)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("ROCODATABASE_USER_DATA_DIR", &user_data_dir)
        .current_dir(&root)
        .output()
        .map_err(|error| {
            format!(
                "Cannot start embedded Python: {error}. executable={}, cwd={}, script={}",
                python.display(),
                root.display(),
                script.display()
            )
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let envelope: PythonEnvelope = serde_json::from_str(stdout.trim()).map_err(|error| {
        format!(
            "Python 返回内容不是有效 JSON: {error}\nstdout: {}\nstderr: {}",
            stdout.trim(),
            stderr.trim()
        )
    })?;

    if !output.status.success() || !envelope.ok {
        return Err(envelope.error.unwrap_or_else(|| stderr.trim().to_string()));
    }

    envelope
        .data
        .ok_or_else(|| "Python 返回缺少 data 字段".to_string())
}

fn embedded_python(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut candidates = vec![PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("python")
        .join("python.exe")];

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("python").join("python.exe"));
    }

    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| {
            "Embedded Python runtime is missing. Rebuild the application so its Python resources are included."
                .to_string()
        })
}

fn run_python_payload(
    app: tauri::AppHandle,
    command: &str,
    payload: Value,
) -> Result<Value, String> {
    let payload_text = serde_json::to_string(&payload)
        .map_err(|error| format!("Cannot serialize payload: {error}"))?;
    run_python(app, &[command, "--payload", &payload_text])
}

fn webview_data_dir(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(custom_dir) = std::env::var("ROCODATABASE_WEBVIEW_DATA_DIR") {
        if !custom_dir.trim().is_empty() {
            return PathBuf::from(custom_dir);
        }
    }

    app_data_dir(app).join("webview2")
}

fn app_data_dir(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(custom_dir) = std::env::var("ROCODATABASE_USER_DATA_DIR") {
        if !custom_dir.trim().is_empty() {
            return PathBuf::from(custom_dir);
        }
    }

    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from(".runtime-data"))
}

fn configured_window_size(app: &tauri::AppHandle) -> Option<(f64, f64)> {
    const DEFAULT_WIDTH: f64 = 566.0;
    const DEFAULT_HEIGHT: f64 = 640.0;
    const MIN_WIDTH: f64 = 283.0;
    const MIN_HEIGHT: f64 = 320.0;
    const MAX_SIZE: f64 = 1600.0;

    let default_configs = resource_root(app)
        .ok()
        .and_then(|root| std::fs::read_to_string(root.join("data").join("configs.json")).ok())
        .and_then(|contents| serde_json::from_str::<Value>(&contents).ok());
    let user_configs = std::fs::read_to_string(app_data_dir(app).join("configs.json"))
        .ok()
        .and_then(|contents| serde_json::from_str::<Value>(&contents).ok());

    let default_tokens = default_configs
        .as_ref()
        .and_then(|configs| configs.get("ui_tokens"))
        .and_then(Value::as_object);
    let user_tokens = user_configs
        .as_ref()
        .and_then(|configs| configs.get("ui_tokens"))
        .and_then(Value::as_object);
    let size_value = |key: &str, default: f64, min: f64| {
        user_tokens
            .and_then(|tokens| tokens.get(key))
            .or_else(|| default_tokens.and_then(|tokens| tokens.get(key)))
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite() && *value > 0.0)
            .unwrap_or(default)
            .clamp(min, MAX_SIZE)
    };

    Some((
        size_value("window-width", DEFAULT_WIDTH, MIN_WIDTH),
        size_value("window-height", DEFAULT_HEIGHT, MIN_HEIGHT),
    ))
}

#[tauri::command]
fn database_summary(app: tauri::AppHandle) -> Result<Value, String> {
    run_python(app, &["summary"])
}

#[tauri::command]
fn search_pets(app: tauri::AppHandle, query: String) -> Result<Value, String> {
    run_python_payload(app, "list-pets", serde_json::json!({ "query": query }))
}

#[tauri::command]
fn list_presets(app: tauri::AppHandle) -> Result<Value, String> {
    run_python(app, &["presets"])
}

#[tauri::command]
fn core_probe(app: tauri::AppHandle) -> Result<Value, String> {
    run_python(app, &["core-probe"])
}

#[tauri::command]
fn app_state(app: tauri::AppHandle) -> Result<Value, String> {
    run_python(app, &["app-state"])
}

#[tauri::command]
fn list_pets(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload(app, "list-pets", payload)
}

#[tauri::command]
fn list_skills(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload(app, "list-skills", payload)
}

#[tauri::command]
fn trait_info(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload(app, "trait-info", payload)
}

#[tauri::command]
fn list_traits(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload(app, "list-traits", payload)
}

#[tauri::command]
fn list_burst_effects(app: tauri::AppHandle) -> Result<Value, String> {
    run_python(app, &["list-burst-effects"])
}

#[tauri::command]
fn calculate_battle(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload(app, "calculate-battle", payload)
}

#[tauri::command]
fn apply_skill_buffs(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload(app, "apply-skill-buffs", payload)
}

#[tauri::command]
fn skill_trigger_info(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload(app, "skill-trigger-info", payload)
}

#[tauri::command]
fn save_preset(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload(app, "save-preset", payload)
}

#[tauri::command]
fn manage_preset(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload(app, "manage-preset", payload)
}

#[tauri::command]
fn save_picker_config(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload(app, "save-picker-config", payload)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = webview_data_dir(app.handle());
            std::fs::create_dir_all(&data_dir)?;
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &data_dir);
            std::fs::create_dir_all(app_data_dir(app.handle()))?;

            let window_config = app
                .config()
                .app
                .windows
                .first()
                .ok_or_else(|| {
                    std::io::Error::new(std::io::ErrorKind::NotFound, "missing main window config")
                })?
                .clone();

            let window_builder =
                tauri::WebviewWindowBuilder::from_config(app.handle(), &window_config)?
                    .data_directory(data_dir);
            let window_builder = if let Some((width, height)) = configured_window_size(app.handle())
            {
                window_builder.inner_size(width, height)
            } else {
                window_builder
            };
            window_builder.build()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            database_summary,
            search_pets,
            list_presets,
            core_probe,
            app_state,
            list_pets,
            list_skills,
            trait_info,
            list_traits,
            list_burst_effects,
            calculate_battle,
            apply_skill_buffs,
            skill_trigger_info,
            save_preset,
            manage_preset,
            save_picker_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
