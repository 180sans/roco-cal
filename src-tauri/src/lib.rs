mod commands;
mod battle_commands;
mod runtime;
mod platform;
use runtime::python::stop_persistent_python_worker;
use roco_desktop_native::{desktop_data, inference};
#[cfg(windows)]
use roco_desktop_native::{profile_dir_from_current_token, roaming_app_data_dir};

use platform::windows::overlay::{OverlayTargetState, OverlayInteractionState, OverlayVisibilityState};
#[cfg(windows)]
use platform::windows::ffi::IsWindow;

use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::Manager;

const RECOGNITION_LOG_MAX_BYTES: usize = 1024 * 1024;
static RECOGNITION_LOG_LOCK: Mutex<()> = Mutex::new(());

fn log_recognition_timing(app: &tauri::AppHandle, message: &str) {
    let Ok(_guard) = RECOGNITION_LOG_LOCK.lock() else {
        return;
    };
    let path = app_data_dir(app).join("recognition-timing.log");
    let Ok(()) = std::fs::create_dir_all(
        path.parent()
            .unwrap_or_else(|| std::path::Path::new(".")),
    ) else {
        return;
    };
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let mut line = format!("{timestamp} {message}\n").into_bytes();
    if line.len() > RECOGNITION_LOG_MAX_BYTES {
        let start = line.len() - RECOGNITION_LOG_MAX_BYTES;
        line.drain(..start);
    }
    let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    else {
        return;
    };
    if std::io::Write::write_all(&mut file, &line).is_err() {
        return;
    }
    let Ok(length) = file.metadata().map(|metadata| metadata.len() as usize) else {
        return;
    };
    if length > RECOGNITION_LOG_MAX_BYTES {
        drop(file);
        let Ok(mut contents) = std::fs::read(&path) else {
            return;
        };
        let start = contents.len().saturating_sub(RECOGNITION_LOG_MAX_BYTES);
        let boundary = contents[start..]
            .iter()
            .position(|byte| *byte == b'\n')
            .map(|offset| start + offset + 1)
            .unwrap_or(contents.len());
        contents.drain(..boundary);
        let _ = std::fs::write(path, contents);
    }
}

#[derive(Clone, Default)]
struct NativeData(Arc<Mutex<Option<desktop_data::DesktopData>>>);
#[derive(Clone, Default)]
struct NativeInference(Arc<OnceLock<inference::Inference>>);

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

async fn run_native_data(app: tauri::AppHandle, command: &str, payload: Value) -> Result<Value, String> {
    let data = app.state::<NativeData>().inner().clone();
    let command = command.to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = data.0.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            *guard = Some(desktop_data::DesktopData::new(resource_root(&app)?, app_data_dir(&app)));
        }
        guard.as_mut().unwrap().dispatch(&command, &payload)
    }).await.map_err(|e| format!("Native data task failed: {e}"))?
}

async fn run_native_inference(app: tauri::AppHandle, payload: Value, classify: bool) -> Result<Value, String> {
    let state = app.state::<NativeInference>().inner().clone();
    let resources = resource_root(&app)?.parent().ok_or("Invalid resources directory")?.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        let init_started = std::time::Instant::now();
        let engine = state.0.get_or_init(|| inference::Inference::new(resources));
        let init_elapsed = init_started.elapsed().as_secs_f64() * 1000.0;
        let started = std::time::Instant::now();
        let mut result = if classify { engine.classify(&payload) } else { engine.recognize(&payload) };
        if classify {
            if let Ok(value) = &mut result {
                if let Some(timing) = value.as_object_mut().and_then(|object| object.remove("_timing")) {
                    log_recognition_timing(
                        &app,
                        &format!(
                            "pet classifier stages: runtime init {:.1} ms; model init {:.1} ms; session lock wait {:.1} ms; decode {:.1} ms; tensor {:.1} ms; ONNX run {:.1} ms (max/image {:.1} ms); postprocess {:.1} ms; images {}",
                            timing["runtimeInitMs"].as_f64().unwrap_or_default(),
                            timing["modelInitMs"].as_f64().unwrap_or_default(),
                            timing["classifierLockWaitMs"].as_f64().unwrap_or_default(),
                            timing["decodeMs"].as_f64().unwrap_or_default(),
                            timing["tensorMs"].as_f64().unwrap_or_default(),
                            timing["sessionRunMs"].as_f64().unwrap_or_default(),
                            timing["maxSessionRunMs"].as_f64().unwrap_or_default(),
                            timing["postprocessMs"].as_f64().unwrap_or_default(),
                            timing["images"].as_u64().unwrap_or_default(),
                        ),
                    );
                }
            }
        }
        log_recognition_timing(
            &app,
            &format!(
                "{} model init: {:.1} ms; inference: {:.1} ms",
                if classify { "pet" } else { "number" },
                init_elapsed,
                started.elapsed().as_secs_f64() * 1000.0,
            ),
        );
        result
    }).await.map_err(|e| format!("Native inference task failed: {e}"))?
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

fn create_main_window(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    eprintln!("[startup] Preparing application data and WebView2 directories");
    let user_data_dir = app_data_dir(app.handle());
    let webview_dir = webview_data_dir(app.handle());
    std::fs::create_dir_all(&user_data_dir)?;
    std::fs::create_dir_all(&webview_dir)?;

    let window_config = app
        .config()
        .app
        .windows
        .first()
        .ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "missing main window config")
        })?
        .clone();

    // Before App::run, App still owns the runtime and creates the native window
    // synchronously. The AppHandle path discards native creation errors.
    let window_builder = tauri::WebviewWindowBuilder::from_config(app, &window_config)?
        .data_directory(webview_dir);
    let window_builder = if let Some((width, height)) = configured_window_size(app.handle()) {
        window_builder.inner_size(width, height)
    } else {
        window_builder
    };
    eprintln!("[startup] Creating main window and initializing WebView2");
    let window = window_builder.build().map_err(|error| {
        eprintln!("[startup] Main window initialization failed: {error} ({error:?})");
        error
    })?;
    #[cfg(windows)]
    {
        let hwnd = window.hwnd()?;
        if unsafe { IsWindow(hwnd.0) } == 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "main window creation returned an invalid HWND",
            ).into());
        }
        eprintln!("[startup] Native main window created: HWND={:#x}", hwnd.0 as usize);
    }
    // A launcher can pass a minimized startup state to the first native window.
    window.unminimize()?;
    window.show()?;
    eprintln!("[startup] Main window initialized; restore and show requested");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(NativeData::default())
        .manage(NativeInference::default())
        .manage(OverlayTargetState::default())
        .manage(OverlayInteractionState::default())
        .manage(OverlayVisibilityState::default())
        .setup(|app| {
            #[cfg(windows)]
            {
                platform::windows::overlay::start_overlay_runtime(app);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::data::database_summary,
            commands::data::search_pets,
            commands::data::list_presets,
            commands::battle::core_probe,
            commands::data::app_state,
            commands::data::external_icons,
            commands::data::open_config_directory,
            commands::data::list_pets,
            commands::data::list_skills,
            commands::data::list_buff_skills,
            commands::battle::trait_info,
            commands::data::list_traits,
            commands::data::list_burst_effects,
            commands::battle::calculate_battle,
            commands::battle::calculate_quick_skills,
            commands::battle::calculate_quick_skills_batch,
            commands::battle::trait_power_candidates,
            commands::battle::calculate_enemy_attack_skills,
            commands::battle::calculate_watch_advantages,
            commands::battle::calculate_willpower,
            commands::battle::calculate_required_power,
            commands::data::apply_skill_buffs,
            commands::data::skill_trigger_info,
            commands::data::save_preset,
            commands::data::manage_preset,
            commands::data::import_team_code,
            commands::data::save_picker_config,
            commands::data::classify_image_samples,
            commands::data::recognize_images,
            commands::data::save_ocr_debug_images,
            commands::data::record_recognition_timing,
            commands::window::capture_overlay_target,
            commands::window::attach_overlay_target,
            commands::window::detach_overlay_target,
            commands::window::update_overlay_click_through,
            commands::window::begin_overlay_mixed_mode,
            commands::window::force_overlay_edit_mode_command
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    create_main_window(&app).unwrap_or_else(|error| {
        panic!("[startup] Cannot initialize main window: {error} ({error:?})");
    });
    app.run(|_, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            stop_persistent_python_worker();
        }
    });
}
