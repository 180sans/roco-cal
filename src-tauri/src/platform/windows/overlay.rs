use std::sync::{Arc, Mutex};
use std::sync::atomic::Ordering;
#[cfg(windows)]
use std::{ffi::c_void, sync::OnceLock, time::Duration};
use tauri::{Emitter, Manager};
#[cfg(windows)]
use super::ffi::*;
#[cfg(windows)]
use roco_desktop_native::plugin_shortcuts::{self, Shortcut};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) struct OverlayTargetBinding {
    pub(crate) overlay_hwnd: usize,
    pub(crate) target_hwnd: usize,
    pub(crate) overlay_style: isize,
    pub(crate) overlay_exstyle: isize,
}

#[derive(Clone, Default)]
pub(crate) struct OverlayTargetState {
    pub(crate) binding: Arc<Mutex<Option<OverlayTargetBinding>>>,
}

#[derive(Clone, Default)]
pub(crate) struct OverlayInteractionState {
    pub(crate) click_through: Arc<std::sync::atomic::AtomicBool>,
}

#[derive(Clone, Default)]
pub(crate) struct OverlayVisibilityState {
    pub(crate) collapsed: Arc<std::sync::atomic::AtomicBool>,
    pub(crate) transition: Arc<Mutex<()>>,
}

#[cfg(windows)]
#[derive(Clone)]
struct OverlayHotkeyContext {
    app: tauri::AppHandle,
    target_state: OverlayTargetState,
    interaction_state: OverlayInteractionState,
    visibility_state: OverlayVisibilityState,
    edit_shortcut: Arc<Mutex<Option<Shortcut>>>,
}

#[cfg(windows)]
static OVERLAY_HOTKEY_CONTEXT: OnceLock<Mutex<Option<OverlayHotkeyContext>>> = OnceLock::new();

#[cfg(windows)]
struct ShortcutRequest {
    shortcuts: Vec<Shortcut>,
    reply: std::sync::mpsc::Sender<Result<(), String>>,
}

#[cfg(windows)]
static SHORTCUT_REQUESTS: OnceLock<std::sync::mpsc::Sender<ShortcutRequest>> = OnceLock::new();

pub(crate) fn configure_plugin_shortcuts(bindings: serde_json::Value) -> Result<(), String> {
    #[cfg(windows)]
    {
        let shortcuts = plugin_shortcuts::resolve(&bindings)?;
        let sender = SHORTCUT_REQUESTS.get().ok_or("快捷键服务尚未启动")?;
        let (reply, response) = std::sync::mpsc::channel();
        sender.send(ShortcutRequest { shortcuts, reply }).map_err(|_| "快捷键服务已停止")?;
        response.recv().map_err(|_| "快捷键服务已停止")?
    }
    #[cfg(not(windows))]
    { let _ = bindings; Err("插件快捷键仅支持 Windows".into()) }
}

pub(crate) fn parse_hwnd(value: &str) -> Result<usize, String> {
    let normalized = value.trim().replace('_', "");
    let digits = normalized
        .strip_prefix("0x")
        .or_else(|| normalized.strip_prefix("0X"));
    let parsed = match digits {
        Some(hex) => u64::from_str_radix(hex, 16),
        None => normalized.parse::<u64>(),
    }
    .map_err(|_| "HWND must be a decimal value or a 0x-prefixed hexadecimal value".to_string())?;
    usize::try_from(parsed)
        .ok()
        .filter(|handle| *handle != 0)
        .ok_or_else(|| "HWND must be a non-zero value for this Windows process".to_string())
}

#[cfg(windows)]
pub(crate) fn enforce_overlay_borderless(hwnd: *mut c_void) {
    const GWL_STYLE: i32 = -16;
    const GWL_EXSTYLE: i32 = -20;
    const WS_BORDER: isize = 0x0080_0000;
    const WS_DLGFRAME: isize = 0x0040_0000;
    const WS_THICKFRAME: isize = 0x0004_0000;
    const WS_SYSMENU: isize = 0x0008_0000;
    const WS_MINIMIZEBOX: isize = 0x0002_0000;
    const WS_MAXIMIZEBOX: isize = 0x0001_0000;
    const WS_POPUP: isize = 0x8000_0000;
    const WS_EX_DLGMODALFRAME: isize = 0x0000_0001;
    const WS_EX_WINDOWEDGE: isize = 0x0000_0100;
    const WS_EX_CLIENTEDGE: isize = 0x0000_0200;
    const WS_EX_STATICEDGE: isize = 0x0002_0000;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_FRAMECHANGED: u32 = 0x0020;

    let style = unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) };
    let exstyle = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };
    let next_style = (style | WS_POPUP)
        & !(WS_BORDER
            | WS_DLGFRAME
            | WS_THICKFRAME
            | WS_SYSMENU
            | WS_MINIMIZEBOX
            | WS_MAXIMIZEBOX);
    let next_exstyle = exstyle
        & !(WS_EX_DLGMODALFRAME | WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_STATICEDGE);
    if next_style != style || next_exstyle != exstyle {
        unsafe {
            SetWindowLongPtrW(hwnd, GWL_STYLE, next_style);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next_exstyle);
            SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                0,
                0,
                0,
                0,
                SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
        }
    }

    const DWMWA_NCRENDERING_POLICY: u32 = 2;
    const DWMWA_TRANSITIONS_FORCEDISABLED: u32 = 3;
    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMNCRP_DISABLED: u32 = 1;
    const DWMWCP_DONOTROUND: u32 = 1;
    const COLOR_NONE: u32 = 0xFFFF_FFFE;
    const TRUE_VALUE: i32 = 1;
    unsafe {
        DwmSetWindowAttribute(hwnd, DWMWA_NCRENDERING_POLICY, (&DWMNCRP_DISABLED as *const u32).cast(), 4);
        DwmSetWindowAttribute(hwnd, DWMWA_TRANSITIONS_FORCEDISABLED, (&TRUE_VALUE as *const i32).cast(), 4);
        DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, (&DWMWCP_DONOTROUND as *const u32).cast(), 4);
        DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, (&COLOR_NONE as *const u32).cast(), 4);
    }
}

#[cfg(windows)]
pub(crate) fn restore_overlay_native_frame(binding: OverlayTargetBinding) {
    const GWL_STYLE: i32 = -16;
    const GWL_EXSTYLE: i32 = -20;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_FRAMECHANGED: u32 = 0x0020;
    let hwnd = binding.overlay_hwnd as *mut c_void;
    unsafe {
        SetWindowLongPtrW(hwnd, GWL_STYLE, binding.overlay_style);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, binding.overlay_exstyle);
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

#[cfg(windows)]
pub(crate) fn sync_overlay_to_target(binding: OverlayTargetBinding, raise_overlay: bool) -> bool {
    const SW_HIDE: i32 = 0;
    const SW_SHOWNOACTIVATE: i32 = 4;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_FRAMECHANGED: u32 = 0x0020;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOOWNERZORDER: u32 = 0x0200;

    let target = binding.target_hwnd as *mut c_void;
    let overlay = binding.overlay_hwnd as *mut c_void;
    if unsafe { IsWindow(target) } == 0 || unsafe { IsWindow(overlay) } == 0 {
        return false;
    }
    if unsafe { IsIconic(target) } != 0 {
        unsafe { ShowWindow(overlay, SW_HIDE) };
        return true;
    }

    // Tauri applies decoration changes asynchronously. Reassert the actual
    // Win32/DWM frame state while attached so a delayed update cannot bring
    // back a one-pixel border or resize frame.
    enforce_overlay_borderless(overlay);

    // The overlay contains controls positioned against game content, so bind
    // it to the target client area rather than its title bar and resize frame.
    const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2: isize = -4;
    let previous_dpi_context = unsafe {
        SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 as *mut c_void)
    };
    let mut target_client = WinRect {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let mut target_origin = WinPoint { x: 0, y: 0 };
    if unsafe { GetClientRect(target, &mut target_client) } == 0
        || unsafe { ClientToScreen(target, &mut target_origin) } == 0
    {
        if !previous_dpi_context.is_null() {
            unsafe { SetThreadDpiAwarenessContext(previous_dpi_context) };
        }
        return false;
    }
    let width = (target_client.right - target_client.left).max(1);
    let height = (target_client.bottom - target_client.top).max(1);
    let flags = if raise_overlay {
        SWP_NOACTIVATE | SWP_FRAMECHANGED
    } else {
        SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER
    };
    let mut overlay_rect = WinRect {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let overlay_rect_available = unsafe { GetWindowRect(overlay, &mut overlay_rect) } != 0;
    let geometry_changed = !overlay_rect_available
        || overlay_rect.left != target_origin.x
        || overlay_rect.top != target_origin.y
        || overlay_rect.right - overlay_rect.left != width
        || overlay_rect.bottom - overlay_rect.top != height;
    let positioned = if raise_overlay || geometry_changed {
        (unsafe {
            SetWindowPos(
                overlay,
                std::ptr::null_mut(),
                target_origin.x,
                target_origin.y,
                width,
                height,
                flags,
            )
        }) != 0
    } else {
        true
    };
    if positioned && unsafe { IsWindowVisible(overlay) } == 0 {
        unsafe { ShowWindow(overlay, SW_SHOWNOACTIVATE) };
    }
    if !previous_dpi_context.is_null() {
        unsafe { SetThreadDpiAwarenessContext(previous_dpi_context) };
    }
    positioned
}

#[cfg(windows)]
fn toggle_overlay_visibility(
    app: &tauri::AppHandle,
    target_state: &OverlayTargetState,
    interaction_state: &OverlayInteractionState,
    visibility_state: &OverlayVisibilityState,
) {
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOOWNERZORDER: u32 = 0x0200;
    let binding = target_state
        .binding
        .lock()
        .ok()
        .and_then(|binding| *binding);
    let Some(binding) = binding else {
        return;
    };
    let Ok(_transition_guard) = visibility_state.transition.lock() else {
        return;
    };
    let collapse = !visibility_state.collapsed.load(Ordering::Relaxed);
    visibility_state
        .collapsed
        .store(collapse, Ordering::Relaxed);
    if collapse {
        let _ = set_overlay_click_through(app, interaction_state, false);
        unsafe {
            SetWindowPos(
                binding.overlay_hwnd as *mut c_void,
                std::ptr::null_mut(),
                -32000,
                -32000,
                0,
                0,
                SWP_NOACTIVATE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER,
            )
        };
    } else if !sync_overlay_to_target(binding, true) {
        if let Ok(mut current) = target_state.binding.lock() {
            if *current == Some(binding) {
                *current = None;
            }
        }
        let _ = restore_normal_window(app);
        let _ = app.emit("overlay-attachment-change", false);
    }
}

pub(crate) fn set_overlay_click_through(
    app: &tauri::AppHandle,
    state: &OverlayInteractionState,
    enabled: bool,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        const GWL_EXSTYLE: i32 = -20;
        const WS_EX_TRANSPARENT: isize = 0x0000_0020;
        const WS_EX_LAYERED: isize = 0x0008_0000;
        const SWP_NOSIZE: u32 = 0x0001;
        const SWP_NOMOVE: u32 = 0x0002;
        const SWP_NOZORDER: u32 = 0x0004;
        const SWP_NOACTIVATE: u32 = 0x0010;
        const SWP_FRAMECHANGED: u32 = 0x0020;
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Main overlay window is unavailable".to_string())?;
        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as *mut c_void;
        let exstyle = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };
        let next = if enabled {
            exstyle | WS_EX_TRANSPARENT | WS_EX_LAYERED
        } else {
            exstyle & !WS_EX_TRANSPARENT
        };
        unsafe {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
            SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                0,
                0,
                0,
                0,
                SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
        }
    }
    #[cfg(not(windows))]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Main overlay window is unavailable".to_string())?;
        window
            .set_ignore_cursor_events(enabled)
            .map_err(|error| format!("Cannot change overlay interaction mode: {error}"))?;
    }
    state.click_through.store(enabled, Ordering::Relaxed);
    app.emit("overlay-click-through-change", enabled)
        .map_err(|error| format!("Cannot notify overlay interaction mode: {error}"))
}

#[cfg(windows)]
pub(crate) fn set_overlay_taskbar_entry_visible(app: &tauri::AppHandle, visible: bool) -> Result<(), String> {
    const GWL_EXSTYLE: i32 = -20;
    const WS_EX_APPWINDOW: isize = 0x0004_0000;
    const WS_EX_TOOLWINDOW: isize = 0x0000_0080;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_FRAMECHANGED: u32 = 0x0020;
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main overlay window is unavailable".to_string())?;
    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as *mut c_void;
    let exstyle = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };
    let next = if visible {
        (exstyle | WS_EX_APPWINDOW) & !WS_EX_TOOLWINDOW
    } else {
        (exstyle | WS_EX_TOOLWINDOW) & !WS_EX_APPWINDOW
    };
    if unsafe { SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next) } == 0 {
        // The style change may still have taken effect, so continue with a
        // frame refresh and let the caller observe the window behavior.
    }
    unsafe {
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
    Ok(())
}

#[cfg(windows)]
pub(crate) fn set_overlay_window_title(app: &tauri::AppHandle, title: &str) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main overlay window is unavailable".to_string())?;
    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as *mut c_void;
    let wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
    if unsafe { SetWindowTextW(hwnd, wide.as_ptr()) } == 0 {
        return Err("Cannot update overlay window title".to_string());
    }
    Ok(())
}

#[cfg(windows)]
pub(crate) fn set_overlay_border_visible(app: &tauri::AppHandle, visible: bool) -> Result<(), String> {
    const DWMWA_NCRENDERING_POLICY: u32 = 2;
    const DWMWA_TRANSITIONS_FORCEDISABLED: u32 = 3;
    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMNCRP_USEWINDOWSTYLE: u32 = 0;
    const DWMWCP_DEFAULT: u32 = 0;
    const COLOR_DEFAULT: u32 = 0xFFFF_FFFF;
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main overlay window is unavailable".to_string())?;
    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as *mut c_void;
    if !visible {
        enforce_overlay_borderless(hwnd);
        return Ok(());
    }
    const FALSE_VALUE: i32 = 0;
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_NCRENDERING_POLICY,
            (&DWMNCRP_USEWINDOWSTYLE as *const u32).cast(),
            4,
        );
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            (&FALSE_VALUE as *const i32).cast(),
            4,
        );
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            (&DWMWCP_DEFAULT as *const u32).cast(),
            4,
        );
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            (&COLOR_DEFAULT as *const u32).cast(),
            std::mem::size_of::<u32>() as u32,
        );
    }
    Ok(())
}


pub(crate) fn force_overlay_edit_mode(
    app: &tauri::AppHandle,
    state: &OverlayInteractionState,
) -> Result<(), String> {
    set_overlay_click_through(app, state, false)
}

#[cfg(windows)]
fn force_overlay_edit_mode_from_hotkey(context: &OverlayHotkeyContext) {
    let binding = context
        .target_state
        .binding
        .lock()
        .ok()
        .and_then(|binding| *binding);
    if binding.is_none() || context.visibility_state.collapsed.load(Ordering::Relaxed) {
        return;
    }
    let _ = set_overlay_click_through(&context.app, &context.interaction_state, false);
    let _ = context.app.emit("overlay-force-edit-mode", ());
}

#[cfg(windows)]
unsafe extern "system" fn overlay_keyboard_hook(code: i32, w_param: usize, l_param: isize) -> isize {
    const HC_ACTION: i32 = 0;
    const WM_KEYDOWN: usize = 0x0100;
    const WM_SYSKEYDOWN: usize = 0x0104;
    if code == HC_ACTION && (w_param == WM_KEYDOWN || w_param == WM_SYSKEYDOWN) && l_param != 0 {
        let event = unsafe { &*(l_param as *const KeyboardLowLevelHook) };
        if let Some(context) = OVERLAY_HOTKEY_CONTEXT
                .get()
                .and_then(|slot| slot.lock().ok())
                .and_then(|guard| guard.clone())
        {
            let shortcut = context.edit_shortcut.lock().ok().and_then(|binding| binding.clone());
            let modifiers = u32::from(unsafe { GetAsyncKeyState(0x12) } < 0)
                | (u32::from(unsafe { GetAsyncKeyState(0x11) } < 0) << 1)
                | (u32::from(unsafe { GetAsyncKeyState(0x10) } < 0) << 2);
            if shortcut.as_ref().is_some_and(|shortcut| shortcut.virtual_key == event.vk_code && shortcut.modifiers == modifiers)
                && unsafe { GetAsyncKeyState(0x5B) } >= 0 && unsafe { GetAsyncKeyState(0x5C) } >= 0
            {
                force_overlay_edit_mode_from_hotkey(&context);
            }
        }
    }
    unsafe { CallNextHookEx(std::ptr::null_mut(), code, w_param, l_param) }
}

pub(crate) fn restore_normal_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main overlay window is unavailable".to_string())?;
    let _ = window.set_shadow(true);
    let _ = window.set_skip_taskbar(false);
    window
        .set_decorations(true)
        .map_err(|error| format!("Cannot restore normal window decorations: {error}"))?;
    window
        .set_resizable(true)
        .map_err(|error| format!("Cannot restore normal window resizing: {error}"))
}

#[cfg(windows)]
pub(crate) fn start_overlay_runtime(app: &mut tauri::App) {
    let overlay_target_state = app.state::<OverlayTargetState>().inner().clone();
    let tracker_app = app.handle().clone();
    let tracker_interaction_state = app.state::<OverlayInteractionState>().inner().clone();
    let tracker_visibility_state = app.state::<OverlayVisibilityState>().inner().clone();
    std::thread::spawn(move || loop {
        let binding = overlay_target_state
            .binding
            .lock()
            .ok()
            .and_then(|current| *current);
        if let Some(binding) = binding {
            let Ok(_transition_guard) = tracker_visibility_state.transition.lock() else {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            };
            let tracking_ok = if tracker_visibility_state
                .collapsed
                .load(Ordering::Relaxed)
            {
                unsafe {
                    IsWindow(binding.target_hwnd as *mut c_void) != 0
                        && IsWindow(binding.overlay_hwnd as *mut c_void) != 0
                }
            } else {
                sync_overlay_to_target(binding, false)
            };
            if !tracking_ok {
                if let Ok(mut current) = overlay_target_state.binding.lock() {
                    if *current == Some(binding) {
                        *current = None;
                        tracker_visibility_state
                            .collapsed
                            .store(false, Ordering::Relaxed);
                        if tracker_interaction_state
                            .click_through
                            .swap(false, Ordering::Relaxed)
                        {
                            let _ = set_overlay_click_through(
                                &tracker_app,
                                &tracker_interaction_state,
                                false,
                            );
                        }
                        restore_overlay_native_frame(binding);
                        let _ = restore_normal_window(&tracker_app);
                        let _ = set_overlay_taskbar_entry_visible(&tracker_app, true);
                        let _ = set_overlay_window_title(&tracker_app, "Roco Database");
                        let _ = set_overlay_border_visible(&tracker_app, true);
                        let _ = tracker_app.emit("overlay-attachment-change", false);
                    }
                }
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    });

    let hotkey_app = app.handle().clone();
    let hotkey_target_state = app.state::<OverlayTargetState>().inner().clone();
    let hotkey_interaction_state = app.state::<OverlayInteractionState>().inner().clone();
    let hotkey_visibility_state = app.state::<OverlayVisibilityState>().inner().clone();
    let hotkey_context = OverlayHotkeyContext {
        app: hotkey_app.clone(),
        target_state: hotkey_target_state.clone(),
        interaction_state: hotkey_interaction_state.clone(),
        visibility_state: hotkey_visibility_state.clone(),
        edit_shortcut: Arc::new(Mutex::new(None)),
    };
    let _ = OVERLAY_HOTKEY_CONTEXT
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map(|mut slot| *slot = Some(hotkey_context.clone()));
    std::thread::spawn(move || {
        const WH_KEYBOARD_LL: i32 = 13;
        let hook = unsafe {
            SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(overlay_keyboard_hook),
                std::ptr::null_mut(),
                0,
            )
        };
        if hook.is_null() {
            return;
        }
        let mut message = WinMessage {
            hwnd: std::ptr::null_mut(),
            message: 0,
            w_param: 0,
            l_param: 0,
            time: 0,
            point: WinPoint { x: 0, y: 0 },
        };
        while unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) } > 0 {}
        unsafe { UnhookWindowsHookEx(hook) };
    });
    let configs = std::fs::read_to_string(crate::app_data_dir(app.handle()).join("configs.json"))
        .ok().and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
    let bindings = configs.as_ref().and_then(|configs| configs.pointer("/team_layout/shortcuts"))
        .cloned().unwrap_or_else(|| serde_json::json!({}));
    let initial = plugin_shortcuts::resolve(&bindings).unwrap_or_else(|error| {
        eprintln!("Cannot load plugin shortcuts: {error}");
        plugin_shortcuts::resolve(&serde_json::json!({})).unwrap_or_default()
    });
    let (sender, requests) = std::sync::mpsc::channel::<ShortcutRequest>();
    let _ = SHORTCUT_REQUESTS.set(sender);
    std::thread::spawn(move || {
        const WM_HOTKEY: u32 = 0x0312;
        const WM_QUIT: u32 = 0x0012;
        let register = |shortcut: &Shortcut| unsafe {
            RegisterHotKey(std::ptr::null_mut(), shortcut.registration_id, shortcut.modifiers | 0x4000, shortcut.virtual_key) != 0
        };
        let unregister = |shortcut: &Shortcut| { unsafe { UnregisterHotKey(std::ptr::null_mut(), shortcut.registration_id) }; };
        let mut current = Vec::new();
        for shortcut in initial {
            if register(&shortcut) { current.push(shortcut); }
            else { eprintln!("Cannot register {} ({})", shortcut.label, shortcut.chord); }
        }
        let update_edit_shortcut = |shortcuts: &[Shortcut]| {
            if let Ok(mut binding) = hotkey_context.edit_shortcut.lock() {
                *binding = shortcuts.iter().find(|shortcut| shortcut.id == "edit-mode").cloned();
            }
        };
        update_edit_shortcut(&current);
        let mut message = WinMessage {
            hwnd: std::ptr::null_mut(), message: 0, w_param: 0, l_param: 0,
            time: 0, point: WinPoint { x: 0, y: 0 },
        };
        'runtime: loop {
            // Drain old key messages before accepting a new configuration.
            while unsafe { PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, 1) } != 0 {
                if message.message == WM_QUIT { break 'runtime; }
                if message.message != WM_HOTKEY { continue; }
                let Some(shortcut) = current.iter().find(|shortcut| shortcut.registration_id as usize == message.w_param) else { continue; };
                let chord = message.l_param as u32;
                if chord >> 16 != shortcut.virtual_key || chord & 0xf != shortcut.modifiers { continue; }
                let binding = hotkey_target_state.binding.lock().ok().and_then(|binding| *binding);
                if shortcut.requires_target && binding.is_none() { continue; }
                if shortcut.id == "toggle-visibility" {
                    toggle_overlay_visibility(&hotkey_app, &hotkey_target_state, &hotkey_interaction_state, &hotkey_visibility_state);
                    continue;
                }
                if hotkey_visibility_state.collapsed.load(Ordering::Relaxed) { continue; }
                if shortcut.id == "edit-mode" { force_overlay_edit_mode_from_hotkey(&hotkey_context); }
                else {
                    if shortcut.id == "skill-order" { force_overlay_edit_mode_from_hotkey(&hotkey_context); }
                    let _ = hotkey_app.emit(&shortcut.event, ());
                }
            }
            while let Ok(request) = requests.try_recv() {
                let result = plugin_shortcuts::replace(&mut current, request.shortcuts, register, unregister);
                update_edit_shortcut(&current);
                let _ = request.reply.send(result);
            }
            std::thread::sleep(Duration::from_millis(15));
        }
        for shortcut in &current { unregister(shortcut); }
    });
}
