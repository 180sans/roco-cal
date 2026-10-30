use crate::{app_data_dir, log_recognition_timing, run_native_data, run_native_inference};
use roco_desktop_native::decode_base64;
use serde_json::Value;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub(crate) async fn open_config_directory(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let directory = app_data_dir(&app);
        std::fs::create_dir_all(&directory).map_err(|error| format!("Cannot create configuration directory: {error}"))?;
        app.opener().open_path(directory.to_string_lossy().into_owned(), None::<String>)
            .map_err(|error| format!("Cannot open configuration directory: {error}"))
    }).await.map_err(|error| format!("Opening configuration directory failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn external_icons(app: tauri::AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = roco_desktop_native::external_icons::prepare_external_icons(&app_data_dir(&app))?;
        app.asset_protocol_scope().allow_directory(&root, true).map_err(|error| error.to_string())?;
        Ok(serde_json::json!({ "directory": root, "groups": roco_desktop_native::external_icons::external_icon_files(&root)? }))
    }).await.map_err(|error| format!("Loading external icons failed: {error}"))?
}

#[tauri::command]
pub(crate) fn record_recognition_timing(app: tauri::AppHandle, message: String) {
    log_recognition_timing(&app, &format!("frontend {message}"));
}

#[tauri::command]
pub(crate) async fn database_summary(app: tauri::AppHandle) -> Result<Value, String> {
    run_native_data(app, "summary", serde_json::json!({})).await
}

#[tauri::command]
pub(crate) async fn search_pets(app: tauri::AppHandle, query: String) -> Result<Value, String> {
    run_native_data(app, "list-pets", serde_json::json!({ "query": query })).await
}

#[tauri::command]
pub(crate) async fn list_presets(app: tauri::AppHandle) -> Result<Value, String> {
    run_native_data(app, "presets", serde_json::json!({})).await
}

#[tauri::command]
pub(crate) async fn app_state(app: tauri::AppHandle) -> Result<Value, String> {
    run_native_data(app, "app-state", serde_json::json!({})).await
}

#[tauri::command]
pub(crate) async fn list_pets(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_native_data(app, "list-pets", payload).await
}

#[tauri::command]
pub(crate) async fn list_skills(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_native_data(app, "list-skills", payload).await
}

#[tauri::command]
pub(crate) async fn list_buff_skills(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_native_data(app, "list-buff-skills", payload).await
}

#[tauri::command]
pub(crate) async fn list_traits(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_native_data(app, "list-traits", payload).await
}

#[tauri::command]
pub(crate) async fn list_burst_effects(app: tauri::AppHandle) -> Result<Value, String> {
    run_native_data(app, "list-burst-effects", serde_json::json!({})).await
}

#[tauri::command]
pub(crate) async fn apply_skill_buffs(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_native_data(app, "apply-skill-buffs", payload).await
}

#[tauri::command]
pub(crate) async fn skill_trigger_info(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_native_data(app, "skill-trigger-info", payload).await
}

#[tauri::command]
pub(crate) async fn save_preset(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_native_data(app, "save-preset", payload).await
}

#[tauri::command]
pub(crate) async fn manage_preset(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_native_data(app, "manage-preset", payload).await
}

#[tauri::command]
pub(crate) async fn import_team_code(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_native_data(app, "import-team-code", payload).await
}

#[tauri::command]
pub(crate) async fn save_picker_config(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_native_data(app, "save-picker-config", payload).await
}

#[tauri::command]
pub(crate) async fn classify_image_samples(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_native_inference(app, payload, true).await
}

#[tauri::command]
pub(crate) async fn recognize_images(app: tauri::AppHandle, images: Value) -> Result<Value, String> {
    run_native_inference(app, images, false).await
}

#[tauri::command]
pub(crate) async fn save_ocr_debug_images(app: tauri::AppHandle, category: String, images: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let image_items = images.as_array().ok_or_else(|| "OCR debug images must be a list".to_string())?;
        let safe_category = category.chars()
            .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
            .collect::<String>();
        if safe_category.is_empty() { return Err("OCR debug image category is invalid".to_string()); }
        let directory = app_data_dir(&app).join("ocr-debug-inputs").join(safe_category);
        std::fs::create_dir_all(&directory).map_err(|error| format!("Cannot create OCR debug image directory: {error}"))?;
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|error| error.to_string())?.as_millis();
        let mut saved = 0usize;
        for (index, image) in image_items.iter().enumerate() {
            let data_url = image.get("imageDataUrl").and_then(Value::as_str).ok_or_else(|| "OCR debug image is missing imageDataUrl".to_string())?;
            let (metadata, encoded) = data_url.split_once(',').ok_or_else(|| "OCR debug image must be a data URL".to_string())?;
            let extension = if metadata.starts_with("data:image/bmp") { "bmp" } else { "png" };
            let key = image.get("key").and_then(Value::as_str).unwrap_or("image").chars()
                .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
                .collect::<String>();
            let name = if key.is_empty() { "image" } else { &key };
            std::fs::write(directory.join(format!("{stamp}-{index}-{name}.{extension}")), decode_base64(encoded)?)
                .map_err(|error| format!("Cannot save OCR debug image: {error}"))?;
            saved += 1;
        }
        Ok(serde_json::json!({ "saved": saved, "directory": directory.to_string_lossy() }))
    }).await.map_err(|error| format!("Saving OCR debug images failed: {error}"))?
}
