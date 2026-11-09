use crate::diagnostics;
use crate::log_recognition_timing;
use crate::platform::windows::overlay::{OverlayTargetBinding, OverlayTargetState, OverlayInteractionState, OverlayVisibilityState, parse_hwnd, force_overlay_edit_mode, set_overlay_click_through};
#[cfg(not(windows))]
use crate::platform::windows::overlay::restore_normal_window;
#[cfg(windows)]
use crate::platform::windows::overlay::{enforce_overlay_borderless, restore_detached_overlay, sync_overlay_to_target, set_overlay_taskbar_entry_visible, set_overlay_window_title, set_overlay_border_visible};
#[cfg(windows)]
use crate::platform::windows::capture::capture_window_client_regions;
#[cfg(windows)]
use crate::platform::windows::ffi::{IsWindow, GetWindowLongPtrW, SetWindowLongPtrW, ShowWindow, GetClientRect, ClientToScreen, WinPoint, WinRect};
#[cfg(windows)]
use roco_desktop_native::base64_encode;
use serde_json::Value;
#[cfg(windows)]
use std::{ffi::c_void, time::Instant};
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};

#[tauri::command]
pub(crate) async fn configure_plugin_shortcuts(bindings: Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || crate::platform::windows::overlay::configure_plugin_shortcuts(bindings))
        .await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) fn update_overlay_click_through(
    app: tauri::AppHandle,
    target_state: tauri::State<'_, OverlayTargetState>,
    interaction_state: tauri::State<'_, OverlayInteractionState>,
    visibility_state: tauri::State<'_, OverlayVisibilityState>,
    enabled: bool,
) -> Result<Value, String> {
    // Serialize the binding check and native mutation with attach/detach/tracking.
    let _transition_guard = visibility_state.transition.lock()
        .map_err(|_| "Overlay transition state is unavailable".to_string())?;
    if enabled
        && (visibility_state.collapsed.load(Ordering::Relaxed) || target_state
            .binding
            .lock()
            .map_err(|_| "Overlay target state is unavailable".to_string())?
            .is_none())
    {
        return Err("Bind and expand a target window before enabling click-through mode".to_string());
    }
    set_overlay_click_through(&app, interaction_state.inner(), enabled)?;
    Ok(serde_json::json!({ "clickThrough": enabled }))
}

#[tauri::command]
pub(crate) fn begin_overlay_mixed_mode(
    _interaction_state: tauri::State<'_, OverlayInteractionState>,
) -> Result<Value, String> {
    Ok(serde_json::json!({ "mixedMode": true }))
}

#[tauri::command]
pub(crate) fn force_overlay_edit_mode_command(
    app: tauri::AppHandle,
    interaction_state: tauri::State<'_, OverlayInteractionState>,
    visibility_state: tauri::State<'_, OverlayVisibilityState>,
) -> Result<Value, String> {
    let _transition_guard = visibility_state.transition.lock()
        .map_err(|_| "Overlay transition state is unavailable".to_string())?;
    force_overlay_edit_mode(&app, interaction_state.inner())?;
    Ok(serde_json::json!({ "mixedMode": false, "clickThrough": false }))
}

#[tauri::command]
pub(crate) fn attach_overlay_target(
    app: tauri::AppHandle,
    state: tauri::State<'_, OverlayTargetState>,
    interaction_state: tauri::State<'_, OverlayInteractionState>,
    visibility_state: tauri::State<'_, OverlayVisibilityState>,
    hwnd: String,
) -> Result<Value, String> {
    diagnostics::event("window.attach_request", serde_json::json!({"input": hwnd}));
    let target_hwnd = parse_hwnd(&hwnd)?;
    let _transition_guard = visibility_state
        .transition
        .lock()
        .map_err(|_| "Overlay transition state is unavailable".to_string())?;

    #[cfg(windows)]
    {
        const GWLP_HWNDPARENT: i32 = -8;
        let target = target_hwnd as *mut c_void;
        if unsafe { IsWindow(target) } == 0 {
            return Err("The supplied HWND does not reference an active window".to_string());
        }
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Main overlay window is unavailable".to_string())?;
        let overlay_hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as usize;
        if overlay_hwnd == target_hwnd {
            return Err("The overlay window cannot target itself".to_string());
        }
        let previous_binding = *state.binding.lock()
            .map_err(|_| "Overlay target state is unavailable".to_string())?;
        // Rebinding retains the original independent window, never the attached geometry.
        let binding = OverlayTargetBinding {
            overlay_hwnd,
            target_hwnd,
            restore: match previous_binding {
                Some(binding) => binding.restore,
                None => crate::platform::windows::window_restore::NativeWindowSnapshot::capture(overlay_hwnd as *mut c_void)?,
            },
            restore_fullscreen: match previous_binding {
                Some(binding) => binding.restore_fullscreen,
                None => window.is_fullscreen().map_err(|error| error.to_string())?,
            },
        };
        *state.binding.lock().map_err(|_| "Overlay target state is unavailable".to_string())? = None;
        const SW_HIDE: i32 = 0;
        unsafe { ShowWindow(overlay_hwnd as *mut c_void, SW_HIDE) };
        if let Err(error) = force_overlay_edit_mode(&app, interaction_state.inner()) {
            let restored = restore_detached_overlay(&app, interaction_state.inner(), visibility_state.inner(), Some(binding), "attach_interaction_failed");
            return Err(format!("{error}; restore={restored:?}"));
        }
        enforce_overlay_borderless(overlay_hwnd as *mut c_void);
        visibility_state.collapsed.store(false, Ordering::Relaxed);
        // Keep the overlay owned by the target so it follows the target window.
        unsafe { crate::platform::windows::ffi::SetLastError(0) };
        let previous_owner = unsafe { SetWindowLongPtrW(overlay_hwnd as *mut c_void, GWLP_HWNDPARENT, target_hwnd as isize) };
        let owner_error = unsafe { crate::platform::windows::ffi::GetLastError() };
        let actual_owner = unsafe { GetWindowLongPtrW(overlay_hwnd as *mut c_void, GWLP_HWNDPARENT) };
        let mut target_pid = 0;
        unsafe { crate::platform::windows::ffi::GetWindowThreadProcessId(target, &mut target_pid) };
        diagnostics::event("window.owner_set", serde_json::json!({"previousOwner": format!("0x{previous_owner:X}"),
            "win32Error": owner_error, "actualOwner": format!("0x{actual_owner:X}"), "matchesTarget": actual_owner == target_hwnd as isize,
            "targetProcess": diagnostics::process(target_pid), "windows": diagnostics::snapshot(Some(binding))}));
        let _ = set_overlay_taskbar_entry_visible(&app, false);
        let _ = set_overlay_window_title(&app, "");
        let _ = set_overlay_border_visible(&app, false);
        if actual_owner != target_hwnd as isize || !sync_overlay_to_target(binding, true) {
            diagnostics::event("window.attach_failed", diagnostics::snapshot(Some(binding)));
            let restored = restore_detached_overlay(&app, interaction_state.inner(), visibility_state.inner(), Some(binding), "attach_failed");
            return Err(format!("无法完成窗口绑定：owner 匹配={}，Win32 错误码={}；恢复结果={restored:?}", actual_owner == target_hwnd as isize, owner_error));
        }
        *state.binding.lock().map_err(|_| "Overlay target state is unavailable".to_string())? = Some(binding);
        diagnostics::event("window.attached", diagnostics::snapshot(Some(binding)));
        let _ = app.emit("overlay-attachment-change", true);
        let _ = app.emit("overlay-click-through-change", false);
        return Ok(serde_json::json!({ "attached": true, "hwnd": format!("0x{target_hwnd:X}") }));
    }

    #[cfg(not(windows))]
    {
        let _ = app;
        let _ = state;
        let _ = interaction_state;
        let _ = visibility_state;
        let _ = target_hwnd;
        Err("Manual HWND binding is only available on Windows".to_string())
    }
}

#[tauri::command]
pub(crate) fn detach_overlay_target(
    app: tauri::AppHandle,
    state: tauri::State<'_, OverlayTargetState>,
    interaction_state: tauri::State<'_, OverlayInteractionState>,
    visibility_state: tauri::State<'_, OverlayVisibilityState>,
) -> Result<Value, String> {
    let _transition_guard = visibility_state
        .transition
        .lock()
        .map_err(|_| "Overlay transition state is unavailable".to_string())?;
    diagnostics::event("window.detach_request", serde_json::json!({}));
    visibility_state.collapsed.store(false, Ordering::Relaxed);
    let binding = state
        .binding
        .lock()
        .map_err(|_| "Overlay target state is unavailable".to_string())?
        .take();

    #[cfg(windows)]
    restore_detached_overlay(&app, interaction_state.inner(), visibility_state.inner(), binding, "manual")?;

    #[cfg(not(windows))]
    {
        let _ = binding;
        restore_normal_window(&app)?;
        set_overlay_click_through(&app, interaction_state.inner(), false)?;
        let _ = app.emit("overlay-attachment-change", false);
    }

    Ok(serde_json::json!({ "attached": false }))
}

#[tauri::command]
pub(crate) fn capture_overlay_target(
    app: tauri::AppHandle,
    target_state: tauri::State<'_, OverlayTargetState>,
    regions: Value,
    viewport_width: f64,
    viewport_height: f64,
) -> Result<Value, String> {
    let binding = target_state
        .binding
        .lock()
        .map_err(|_| "Overlay target state is unavailable".to_string())?
        .ok_or_else(|| "Bind a target window before recognition".to_string())?;

    #[cfg(windows)]
    {
        let started = Instant::now();
        let overlay = binding.overlay_hwnd as *mut c_void;
        let mut overlay_rect = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
        let mut overlay_origin = WinPoint { x: 0, y: 0 };
        if unsafe { GetClientRect(overlay, &mut overlay_rect) } == 0
            || unsafe { ClientToScreen(overlay, &mut overlay_origin) } == 0
        {
            return Err("Cannot read overlay client geometry".to_string());
        }
        let overlay_width = (overlay_rect.right - overlay_rect.left).max(1);
        let overlay_height = (overlay_rect.bottom - overlay_rect.top).max(1);
        if viewport_width <= 0.0 || viewport_height <= 0.0 {
            return Err("Overlay viewport dimensions are unavailable".to_string());
        }
        let region_specs = regions.as_array().ok_or("Screenshot regions must be a list")?;
        let mut region_rects: Vec<(i32, i32, i32, i32)> = Vec::with_capacity(region_specs.len());
        let mut region_keys: Vec<String> = Vec::with_capacity(region_specs.len());
        for region in region_specs {
            let key = region.get("key").and_then(Value::as_str).ok_or("Screenshot region key is missing")?;
            let x = region.get("x").and_then(Value::as_f64).ok_or("Screenshot region x is missing")?;
            let y = region.get("y").and_then(Value::as_f64).ok_or("Screenshot region y is missing")?;
            let right = region.get("right").and_then(Value::as_f64).ok_or("Screenshot region right is missing")?;
            let bottom = region.get("bottom").and_then(Value::as_f64).ok_or("Screenshot region bottom is missing")?;
            let left = (overlay_origin.x as f64 + x * overlay_width as f64).round() as i32;
            let top = (overlay_origin.y as f64 + y * overlay_height as f64).round() as i32;
            let region_right = (overlay_origin.x as f64 + right * overlay_width as f64).round() as i32;
            let region_bottom = (overlay_origin.y as f64 + bottom * overlay_height as f64).round() as i32;
            region_rects.push((left, top, (region_right - left).max(1), (region_bottom - top).max(1)));
            region_keys.push(key.to_string());
        }
        let captured = capture_window_client_regions(&app, binding.target_hwnd, &region_rects)?;
        let base64_started = Instant::now();
        let mut region_images = serde_json::Map::new();
        for (index, bmp) in captured.regions.iter().enumerate() {
            region_images.insert(
                region_keys[index].clone(),
                Value::String(format!("data:image/bmp;base64,{}", base64_encode(bmp))),
            );
        }
        let base64_time = base64_started.elapsed();
        let json_started = Instant::now();
        let response = serde_json::json!({ "regions": region_images });
        let response_bytes = response.to_string().len();
        let json_time = json_started.elapsed();
        let native_total_time = started.elapsed();
        log_recognition_timing(
            &app,
            &format!(
                "capture command native: {:.1} ms; base64 {:.1} ms; response JSON sizing {:.1} ms; ROI count {}; response bytes {}",
                native_total_time.as_secs_f64() * 1000.0,
                base64_time.as_secs_f64() * 1000.0,
                json_time.as_secs_f64() * 1000.0,
                region_keys.len(),
                response_bytes,
            ),
        );
        return Ok(response);
    }
    #[cfg(not(windows))]
    { let _ = binding; Err("Target screenshots are only available on Windows".to_string()) }
}
