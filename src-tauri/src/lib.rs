use serde::Deserialize;
use serde_json::Value;
#[cfg(windows)]
use std::ffi::{c_void, OsString};
use std::fs::OpenOptions;
use std::io::Write;
#[cfg(windows)]
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

#[derive(Debug, Deserialize)]
struct PythonEnvelope {
    ok: bool,
    data: Option<Value>,
    error: Option<String>,
}

#[cfg(windows)]
#[repr(C)]
struct Guid {
    data1: u32,
    data2: u16,
    data3: u16,
    data4: [u8; 8],
}

#[cfg(windows)]
const FOLDERID_ROAMING_APP_DATA: Guid = Guid {
    data1: 0x3eb685db,
    data2: 0x65f9,
    data3: 0x4cf6,
    data4: [0xa0, 0x3a, 0xe3, 0xef, 0x65, 0x72, 0x9f, 0x3d],
};

#[cfg(windows)]
#[link(name = "shell32")]
unsafe extern "system" {
    fn SHGetKnownFolderPath(
        folder_id: *const Guid,
        flags: u32,
        token: *mut c_void,
        path: *mut *mut u16,
    ) -> i32;
}

#[cfg(windows)]
#[link(name = "ole32")]
unsafe extern "system" {
    fn CoTaskMemFree(memory: *const c_void);
}

#[cfg(windows)]
#[link(name = "advapi32")]
unsafe extern "system" {
    fn OpenProcessToken(
        process_handle: *mut c_void,
        desired_access: u32,
        token_handle: *mut *mut c_void,
    ) -> i32;
}

#[cfg(windows)]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn CloseHandle(handle: *mut c_void) -> i32;
    fn GetCurrentProcess() -> *mut c_void;
}

#[cfg(windows)]
#[link(name = "userenv")]
unsafe extern "system" {
    fn GetUserProfileDirectoryW(token: *mut c_void, profile_dir: *mut u16, size: *mut u32) -> i32;
}

#[cfg(windows)]
fn profile_dir_from_current_token() -> Result<PathBuf, String> {
    const TOKEN_QUERY: u32 = 0x0008;

    let mut token = std::ptr::null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }

    let mut size = 0;
    let _ = unsafe { GetUserProfileDirectoryW(token, std::ptr::null_mut(), &mut size) };
    if size == 0 {
        let error = std::io::Error::last_os_error().to_string();
        unsafe { CloseHandle(token) };
        return Err(error);
    }

    let mut buffer = vec![0u16; size as usize];
    let success = unsafe { GetUserProfileDirectoryW(token, buffer.as_mut_ptr(), &mut size) };
    unsafe { CloseHandle(token) };
    if success == 0 || size == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }

    let length = buffer
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(size as usize);
    Ok(PathBuf::from(OsString::from_wide(&buffer[..length])))
}

#[cfg(windows)]
fn roaming_app_data_dir() -> Option<PathBuf> {
    let mut raw_path = std::ptr::null_mut();
    let result = unsafe {
        SHGetKnownFolderPath(
            &FOLDERID_ROAMING_APP_DATA,
            0,
            std::ptr::null_mut(),
            &mut raw_path,
        )
    };
    if result < 0 || raw_path.is_null() {
        return None;
    }

    let mut length = 0;
    unsafe {
        while *raw_path.add(length) != 0 {
            length += 1;
        }
    }
    let path = unsafe { OsString::from_wide(std::slice::from_raw_parts(raw_path, length)) };
    unsafe { CoTaskMemFree(raw_path.cast()) };
    Some(PathBuf::from(path))
}

fn startup_log(message: &str) {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("rocodatebase-startup.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{message}");
    }
}

#[cfg(windows)]
fn path_utf16(path: &std::path::Path) -> String {
    path.as_os_str()
        .encode_wide()
        .map(|code_unit| format!("{code_unit:04X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(windows)]
fn environment_utf16(name: &str) -> String {
    std::env::var_os(name)
        .map(|value| {
            value
                .encode_wide()
                .map(|code_unit| format!("{code_unit:04X}"))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_else(|| "<missing>".to_string())
}

fn current_process_user() -> String {
    Command::new("whoami")
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_else(|error| format!("<whoami failed: {error}>"))
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
    app_data_dir(app).join("webview2")
}

fn app_data_dir(_app: &tauri::AppHandle) -> PathBuf {
    #[cfg(windows)]
    if let Ok(profile_dir) = profile_dir_from_current_token() {
        return profile_dir
            .join("AppData")
            .join("Roaming")
            .join("com.sans.rocodatebase");
    }

    #[cfg(windows)]
    if let Some(app_data) = roaming_app_data_dir() {
        return app_data.join("com.sans.rocodatebase");
    }

    if let Some(app_data) = std::env::var_os("APPDATA") {
        return PathBuf::from(app_data).join("com.sans.rocodatebase");
    }

    _app.path()
        .app_data_dir()
        .expect("Windows app data directory is unavailable")
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
    startup_log("run: starting Tauri");
    startup_log(&format!("process: whoami={}", current_process_user()));
    #[cfg(windows)]
    {
        startup_log(&format!(
            "process: USERPROFILE_utf16={}, APPDATA_utf16={}, LOCALAPPDATA_utf16={}",
            environment_utf16("USERPROFILE"),
            environment_utf16("APPDATA"),
            environment_utf16("LOCALAPPDATA")
        ));
        match profile_dir_from_current_token() {
            Ok(path) => startup_log(&format!(
                "process: token_profile_dir_utf16={}",
                path_utf16(&path)
            )),
            Err(error) => startup_log(&format!("process: token_profile_dir failed: {error}")),
        }
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            startup_log("setup: entered");
            let user_data_dir = app_data_dir(app.handle());
            let webview_dir = webview_data_dir(app.handle());
            startup_log(&format!(
                "setup: user_data_dir={}, webview_dir={}",
                user_data_dir.display(),
                webview_dir.display()
            ));
            startup_log(&format!(
                "setup: user_data_dir_utf16={}, webview_dir_utf16={}",
                path_utf16(&user_data_dir),
                path_utf16(&webview_dir)
            ));
            std::fs::create_dir_all(&user_data_dir)?;
            std::fs::create_dir_all(&webview_dir)?;
            startup_log("setup: data directories are available");

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
                    .data_directory(webview_dir)
                    .on_page_load(|_, payload| {
                        startup_log(&format!(
                            "page load: {:?} {}",
                            payload.event(),
                            payload.url()
                        ));
                    });
            let window_builder = if let Some((width, height)) = configured_window_size(app.handle())
            {
                window_builder.inner_size(width, height)
            } else {
                window_builder
            };
            startup_log("setup: building main window");
            let window = window_builder.build().map_err(|error| {
                startup_log(&format!("setup: main window build failed: {error}"));
                error
            })?;
            startup_log("setup: main window built");
            window.on_window_event(|event| {
                startup_log(&format!("window event: {event:?}"));
            });
            window.on_webview_event(|event| {
                startup_log(&format!("webview event: {event:?}"));
            });

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
