//! Release-enabled, bounded JSONL diagnostics. Never records battle payloads or typed keys.
use serde_json::{json, Value};
use std::{sync::{Mutex, OnceLock, mpsc::{self, SyncSender}, atomic::{AtomicU64, Ordering}}, time::{Instant, SystemTime, UNIX_EPOCH}};

#[path = "diagnostic_store.rs"]
mod store;
use store::Store as Log;

static LOG: OnceLock<Mutex<Log>> = OnceLock::new();
static QUEUE: OnceLock<SyncSender<Message>> = OnceLock::new();
static STARTED: OnceLock<Instant> = OnceLock::new();
static DROPPED: AtomicU64 = AtomicU64::new(0);
enum Message { Record(Value), Flush(mpsc::Sender<()>) }

pub(crate) fn init(app: &tauri::AppHandle) {
    let directory = crate::app_data_dir(app).join("diagnostics");
    if let Err(error) = std::fs::create_dir_all(&directory) {
        eprintln!("Cannot create diagnostics directory {}: {error}", directory.display());
        return;
    }
    let _ = STARTED.set(Instant::now());
    let log = match Log::new(&directory) {
        Ok(log) => log,
        Err(error) => { eprintln!("Cannot initialize diagnostics: {error}"); return; }
    };
    let _ = LOG.set(Mutex::new(log));
    let (sender, receiver) = mpsc::sync_channel(2048);
    let _ = QUEUE.set(sender);
    std::thread::spawn(move || {
        while let Ok(message) = receiver.recv() {
            match message {
                Message::Record(row) => write(row),
                Message::Flush(reply) => { let _ = reply.send(()); }
            }
        }
    });
    event("session.start", json!({
        "version": env!("CARGO_PKG_VERSION"), "diagnosticsSchema": 1,
        "debug": cfg!(debug_assertions), "arch": std::env::consts::ARCH,
        "exe": std::env::current_exe().ok(), "cwd": std::env::current_dir().ok(),
        "resourceDir": app.path().resource_dir().ok(), "resourceRoot": crate::resource_root(app),
        "userData": crate::app_data_dir(app), "logDirectory": directory,
        "process": process(std::process::id()), "os": os_version(),
        "exeModifiedUtcMs": std::env::current_exe().ok().and_then(|path| std::fs::metadata(path).ok())
            .and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|t| t.as_millis()),
    }));
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        event("rust.panic", json!({"message": info.to_string()}));
        flush();
        previous(info);
    }));
}

use tauri::Manager;

fn record_level(name: &str, details: &Value) -> Option<&'static str> {
    let failed_result = details.get("result").and_then(|value| value.get("Err")).is_some();
    let errors = details.get("errors").and_then(Value::as_array).is_some_and(|errors| !errors.is_empty());
    let error = details.get("error").is_some_and(|error| !error.is_null() && error != "" && error != 0 && error != false);
    if name.contains("error") || name.contains("failed") || name.contains("panic")
        || name.ends_with("unhandled_rejection") || name.ends_with("config_invalid")
        || failed_result || errors || error || details.get("success") == Some(&Value::Bool(false))
        || details.get("matchesTarget") == Some(&Value::Bool(false)) {
        return Some("error");
    }
    match name {
        "session.start" | "session.exit" | "frontend.start" |
        "window.attach_request" | "window.attached" | "window.detached" => Some("info"),
        _ => None,
    }
}

pub(crate) fn report_result<T>(component: &str, command: &str, result: &Result<T, String>) {
    if let Err(error) = result {
        event("backend.error", json!({"component": component, "command": command,
            "error": error.chars().take(6000).collect::<String>()}));
    }
}

pub(crate) fn event(name: &str, details: Value) {
    let Some(level) = record_level(name, &details) else { return };
    let Some(queue) = QUEUE.get() else { return };
    let elapsed = STARTED.get().map(|started| started.elapsed().as_millis());
    let row = json!({"utcMs": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
        "elapsedMs": elapsed, "pid": std::process::id(), "thread": format!("{:?}", std::thread::current().id()),
        "level": level, "event": name, "details": details});
    if queue.try_send(Message::Record(row)).is_err() { DROPPED.fetch_add(1, Ordering::Relaxed); }
}

pub(crate) fn flush() {
    if let Some(queue) = QUEUE.get() {
        let (reply, done) = mpsc::channel();
        if queue.try_send(Message::Flush(reply)).is_ok() {
            let _ = done.recv_timeout(std::time::Duration::from_secs(2));
        }
    }
}

fn write(mut row: Value) {
    let Some(log) = LOG.get() else { return };
    let Ok(log) = log.lock() else { return };
    let dropped = DROPPED.swap(0, Ordering::Relaxed);
    if dropped != 0 { row["droppedBeforeThisRecord"] = json!(dropped); }
    let result = log.append(format!("{row}\n").as_bytes());
    if let Err(error) = result { eprintln!("Diagnostic log write failed: {error}"); }
}

#[tauri::command]
pub(crate) fn diagnostic_event(name: String, details: Value) {
    // Bound frontend records without ever truncating a JSON value mid-write.
    if name.len() <= 128 && details.to_string().len() <= 16_384 {
        event(&format!("frontend.{name}"), details);
    }
}

#[cfg(windows)]
pub(crate) fn process(pid: u32) -> Value {
    use std::ffi::c_void;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
        fn QueryFullProcessImageNameW(handle: *mut c_void, flags: u32, path: *mut u16, size: *mut u32) -> i32;
        fn CloseHandle(handle: *mut c_void) -> i32;
        fn GetLastError() -> u32;
    }
    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn OpenProcessToken(process: *mut c_void, access: u32, token: *mut *mut c_void) -> i32;
        fn GetTokenInformation(token: *mut c_void, class: i32, data: *mut c_void, length: u32, returned: *mut u32) -> i32;
    }
    unsafe {
        let handle = OpenProcess(0x1000, 0, pid);
        if handle.is_null() { return json!({"pid": pid, "openError": GetLastError()}); }
        let mut path = [0u16; 32768]; let mut size = path.len() as u32;
        let image = if QueryFullProcessImageNameW(handle, 0, path.as_mut_ptr(), &mut size) != 0 {
            json!(String::from_utf16_lossy(&path[..size as usize]))
        } else { json!({"error": GetLastError()}) };
        let mut token = std::ptr::null_mut();
        let elevation = if OpenProcessToken(handle, 8, &mut token) != 0 {
            let mut elevated = 0u32; let mut returned = 0;
            let result = if GetTokenInformation(token, 20, (&mut elevated as *mut u32).cast(), 4, &mut returned) != 0 {
                json!(elevated != 0)
            } else { json!({"error": GetLastError()}) };
            CloseHandle(token); result
        } else { json!({"error": GetLastError()}) };
        CloseHandle(handle);
        json!({"pid": pid, "image": image, "elevated": elevation})
    }
}

#[cfg(not(windows))]
pub(crate) fn process(pid: u32) -> Value { json!({"pid": pid}) }

#[cfg(windows)]
fn os_version() -> Value {
    #[repr(C)]
    struct Version { size: u32, major: u32, minor: u32, build: u32, platform: u32, service_pack: [u16; 128] }
    #[link(name = "ntdll")]
    unsafe extern "system" { fn RtlGetVersion(version: *mut Version) -> i32; }
    let mut version = Version { size: std::mem::size_of::<Version>() as u32,
        major: 0, minor: 0, build: 0, platform: 0, service_pack: [0; 128] };
    let result = unsafe { RtlGetVersion(&mut version) };
    json!({"major": version.major, "minor": version.minor, "build": version.build, "status": result})
}

#[cfg(not(windows))]
fn os_version() -> Value { json!({"os": std::env::consts::OS}) }

#[cfg(windows)]
pub(crate) fn window(hwnd: usize) -> Value {
    use crate::platform::windows::ffi::*;
    use std::ffi::c_void;
    let handle = hwnd as *mut c_void;
    unsafe {
        if IsWindow(handle) == 0 { return json!({"hwnd": format!("0x{hwnd:X}"), "valid": false}); }
        let mut pid = 0; let thread = GetWindowThreadProcessId(handle, &mut pid);
        let mut title = [0u16; 512]; let mut class = [0u16; 256];
        let title_len = GetWindowTextW(handle, title.as_mut_ptr(), title.len() as i32).max(0) as usize;
        let class_len = GetClassNameW(handle, class.as_mut_ptr(), class.len() as i32).max(0) as usize;
        let mut rect = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
        let rect_ok = GetWindowRect(handle, &mut rect) != 0;
        json!({"hwnd": format!("0x{hwnd:X}"), "valid": true, "pid": pid, "thread": thread,
            "title": String::from_utf16_lossy(&title[..title_len]), "class": String::from_utf16_lossy(&class[..class_len]),
            "owner": format!("0x{:X}", GetWindow(handle, 4) as usize),
            "parent": format!("0x{:X}", GetParent(handle) as usize),
            "root": format!("0x{:X}", GetAncestor(handle, 2) as usize),
            "above": format!("0x{:X}", GetWindow(handle, 3) as usize),
            "visible": IsWindowVisible(handle) != 0, "minimized": IsIconic(handle) != 0,
            "style": format!("0x{:X}", GetWindowLongPtrW(handle, -16)),
            "exstyle": format!("0x{:X}", GetWindowLongPtrW(handle, -20)),
            "rectOk": rect_ok, "rect": [rect.left, rect.top, rect.right, rect.bottom],
            "dpi": GetDpiForWindow(handle)})
    }
}

#[cfg(windows)]
pub(crate) fn snapshot(binding: Option<crate::platform::windows::overlay::OverlayTargetBinding>) -> Value {
    let foreground = unsafe { crate::platform::windows::ffi::GetForegroundWindow() } as usize;
    json!({"foreground": window(foreground),
        "target": binding.map(|b| window(b.target_hwnd)), "overlay": binding.map(|b| window(b.overlay_hwnd))})
}
