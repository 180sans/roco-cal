use serde::Deserialize;
use serde_json::Value;
#[cfg(windows)]
use std::ffi::{c_void, OsString};
use std::io::{BufRead, BufReader, Write};
#[cfg(windows)]
use std::os::windows::ffi::OsStringExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
#[cfg(windows)]
use std::time::Instant;
use tauri::{Emitter, Manager};
#[cfg(windows)]
use windows::{
    core::{factory, Interface},
    Foundation::TypedEventHandler,
    Graphics::{
        Capture::{Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession},
        DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
    },
    Win32::{
        Foundation::{HMODULE, HWND, RPC_E_CHANGED_MODE},
        Graphics::{
            Direct3D::{D3D_DRIVER_TYPE, D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP},
            Direct3D11::{
                D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
                D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ,
                D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC,
                D3D11_USAGE_STAGING,
            },
            Dxgi::IDXGIDevice,
        },
        System::WinRT::{
            Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess},
            Graphics::Capture::IGraphicsCaptureItemInterop,
            RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED,
        },
    },
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Deserialize)]
struct PythonEnvelope {
    ok: bool,
    data: Option<Value>,
    error: Option<String>,
}

struct OcrWorkerProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

const OCR_WORKER_COUNT: usize = 2;

#[derive(Clone, Copy, PartialEq, Eq)]
struct OverlayTargetBinding {
    overlay_hwnd: usize,
    target_hwnd: usize,
    overlay_style: isize,
    overlay_exstyle: isize,
}

#[derive(Clone, Default)]
struct OverlayTargetState {
    binding: Arc<Mutex<Option<OverlayTargetBinding>>>,
}

#[derive(Clone, Default)]
struct OverlayInteractionState {
    click_through: Arc<std::sync::atomic::AtomicBool>,
}

#[derive(Clone, Default)]
struct OverlayVisibilityState {
    collapsed: Arc<std::sync::atomic::AtomicBool>,
    transition: Arc<Mutex<()>>,
}

#[cfg(windows)]
#[derive(Clone)]
struct OverlayHotkeyContext {
    app: tauri::AppHandle,
    target_state: OverlayTargetState,
    interaction_state: OverlayInteractionState,
    visibility_state: OverlayVisibilityState,
}

#[cfg(windows)]
static OVERLAY_HOTKEY_CONTEXT: OnceLock<Mutex<Option<OverlayHotkeyContext>>> = OnceLock::new();

#[derive(Clone)]
struct OcrWorker {
    processes: [Arc<Mutex<Option<OcrWorkerProcess>>>; OCR_WORKER_COUNT],
    next_process: Arc<AtomicUsize>,
}

impl Default for OcrWorker {
    fn default() -> Self {
        Self {
            processes: std::array::from_fn(|_| Arc::new(Mutex::new(None))),
            next_process: Arc::new(AtomicUsize::new(0)),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplayOcrFrame {
    region: String,
    image_data_url: String,
    video_time: f64,
    session_id: u64,
    category: Option<String>,
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
#[derive(Clone, Copy)]
#[repr(C)]
struct WinPoint {
    x: i32,
    y: i32,
}

#[cfg(windows)]
#[derive(Clone, Copy)]
#[repr(C)]
struct WinRect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[cfg(windows)]
#[repr(C)]
struct WinMessage {
    hwnd: *mut c_void,
    message: u32,
    w_param: usize,
    l_param: isize,
    time: u32,
    point: WinPoint,
}

#[cfg(windows)]
#[repr(C)]
struct KeyboardLowLevelHook {
    vk_code: u32,
    scan_code: u32,
    flags: u32,
    time: u32,
    extra_info: usize,
}

#[cfg(windows)]
#[link(name = "user32")]
unsafe extern "system" {
    fn IsWindow(hwnd: *mut c_void) -> i32;
    fn IsWindowVisible(hwnd: *mut c_void) -> i32;
    fn IsIconic(hwnd: *mut c_void) -> i32;
    fn GetWindowLongPtrW(hwnd: *mut c_void, index: i32) -> isize;
    fn SetWindowLongPtrW(hwnd: *mut c_void, index: i32, value: isize) -> isize;
    fn SetThreadDpiAwarenessContext(context: *mut c_void) -> *mut c_void;
    fn GetWindowRect(hwnd: *mut c_void, rect: *mut WinRect) -> i32;
    fn GetClientRect(hwnd: *mut c_void, rect: *mut WinRect) -> i32;
    fn ClientToScreen(hwnd: *mut c_void, point: *mut WinPoint) -> i32;
    fn SetWindowTextW(hwnd: *mut c_void, text: *const u16) -> i32;
    fn SetWindowPos(
        hwnd: *mut c_void,
        insert_after: *mut c_void,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
        flags: u32,
    ) -> i32;
    fn ShowWindow(hwnd: *mut c_void, command: i32) -> i32;
    fn RegisterHotKey(hwnd: *mut c_void, id: i32, modifiers: u32, virtual_key: u32) -> i32;
    fn UnregisterHotKey(hwnd: *mut c_void, id: i32) -> i32;
    fn GetMessageW(message: *mut WinMessage, hwnd: *mut c_void, minimum: u32, maximum: u32) -> i32;
    fn SetWindowsHookExW(
        hook_id: i32,
        proc: Option<unsafe extern "system" fn(i32, usize, isize) -> isize>,
        instance: *mut c_void,
        thread_id: u32,
    ) -> *mut c_void;
    fn CallNextHookEx(hook: *mut c_void, code: i32, w_param: usize, l_param: isize) -> isize;
    fn UnhookWindowsHookEx(hook: *mut c_void) -> i32;
}

#[cfg(windows)]
#[link(name = "dwmapi")]
unsafe extern "system" {
    fn DwmSetWindowAttribute(hwnd: *mut c_void, attribute: u32, value: *const c_void, size: u32) -> i32;
    fn DwmGetWindowAttribute(hwnd: *mut c_void, attribute: u32, value: *mut c_void, size: u32) -> i32;
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let value = (u32::from(chunk[0]) << 16)
            | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
            | u32::from(*chunk.get(2).unwrap_or(&0));
        output.push(TABLE[((value >> 18) & 63) as usize] as char);
        output.push(TABLE[((value >> 12) & 63) as usize] as char);
        output.push(if chunk.len() > 1 { TABLE[((value >> 6) & 63) as usize] as char } else { '=' });
        output.push(if chunk.len() > 2 { TABLE[(value & 63) as usize] as char } else { '=' });
    }
    output
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
    run_python_with_input(app, args, None)
}

fn run_python_with_input(
    app: tauri::AppHandle,
    args: &[&str],
    input: Option<&str>,
) -> Result<Value, String> {
    let root = resource_root(&app)?;
    let script = root.join("desktop_api.py");
    let python = embedded_python(&app)?;
    let user_data_dir = app_data_dir(&app);
    std::fs::create_dir_all(&user_data_dir)
        .map_err(|error| format!("Cannot create app data dir: {error}"))?;
    let mut command = Command::new(&python);
    command
        .arg(&script)
        .args(args)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("ROCODATABASE_USER_DATA_DIR", &user_data_dir)
        .current_dir(&root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if input.is_some() {
        command.stdin(Stdio::piped());
    }
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let mut child = command.spawn().map_err(|error| {
        format!(
            "Cannot start embedded Python: {error}. executable={}, cwd={}, script={}",
            python.display(),
            root.display(),
            script.display()
        )
    })?;
    if let Some(input) = input {
        child
            .stdin
            .as_mut()
            .ok_or_else(|| "Cannot open embedded Python input pipe".to_string())?
            .write_all(input.as_bytes())
            .map_err(|error| format!("Cannot send payload to embedded Python: {error}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| format!("Cannot collect embedded Python output: {error}"))?;

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
    let local_runtime = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("python");
    let mut candidates = vec![
        local_runtime.join("pythonw.exe"),
        local_runtime.join("python.exe"),
    ];

    if let Ok(resource_dir) = app.path().resource_dir() {
        let runtime = resource_dir.join("python");
        candidates.push(runtime.join("pythonw.exe"));
        candidates.push(runtime.join("python.exe"));
    }

    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| {
            "Embedded Python runtime is missing. Rebuild the application so its Python resources are included."
                .to_string()
        })
}

async fn run_python_async(app: tauri::AppHandle, args: Vec<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_python(app, &arg_refs)
    })
    .await
    .map_err(|error| format!("Python task failed: {error}"))?
}

async fn run_python_payload_async(
    app: tauri::AppHandle,
    command: &str,
    payload: Value,
) -> Result<Value, String> {
    let payload_text = serde_json::to_string(&payload)
        .map_err(|error| format!("Cannot serialize payload: {error}"))?;
    let command = command.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        run_python_with_input(
            app,
            &[command.as_str(), "--payload-stdin"],
            Some(&payload_text),
        )
    })
    .await
    .map_err(|error| format!("Python task failed: {error}"))?
}

fn start_ocr_worker(app: &tauri::AppHandle) -> Result<OcrWorkerProcess, String> {
    let root = resource_root(app)?;
    let script = root.join("desktop_api.py");
    let python = embedded_python(app)?;
    let user_data_dir = app_data_dir(app);
    std::fs::create_dir_all(&user_data_dir)
        .map_err(|error| format!("Cannot create app data dir: {error}"))?;
    let mut command = Command::new(&python);
    command
        .arg(&script)
        .arg("ocr-worker")
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("ROCODATABASE_USER_DATA_DIR", &user_data_dir)
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let mut child = command
        .spawn()
        .map_err(|error| format!("Cannot start ONNX OCR worker: {error}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Cannot open ONNX OCR worker input pipe".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Cannot open ONNX OCR worker output pipe".to_string())?;
    Ok(OcrWorkerProcess {
        child,
        stdin,
        stdout: BufReader::new(stdout),
    })
}

fn run_ocr_worker(
    app: &tauri::AppHandle,
    worker: &OcrWorker,
    payload: Value,
) -> Result<Value, String> {
    // Replay OCR has one lane per side. Alternate calls across two persistent
    // processes so enemy and self events can be recognized concurrently.
    let process_index = worker.next_process.fetch_add(1, Ordering::Relaxed) % OCR_WORKER_COUNT;
    let mut guard = worker.processes[process_index]
        .lock()
        .map_err(|_| "ONNX OCR worker lock is poisoned".to_string())?;
    let needs_restart = guard
        .as_mut()
        .map(|process| process.child.try_wait().ok().flatten().is_some())
        .unwrap_or(true);
    if needs_restart {
        *guard = Some(start_ocr_worker(app)?);
    }
    let process = guard
        .as_mut()
        .ok_or_else(|| "ONNX OCR worker is unavailable".to_string())?;
    let request = serde_json::to_string(&payload)
        .map_err(|error| format!("Cannot serialize ONNX OCR request: {error}"))?;
    process
        .stdin
        .write_all(request.as_bytes())
        .and_then(|_| process.stdin.write_all(b"\n"))
        .and_then(|_| process.stdin.flush())
        .map_err(|error| format!("Cannot send request to ONNX OCR worker: {error}"))?;
    let mut response = String::new();
    let bytes = process
        .stdout
        .read_line(&mut response)
        .map_err(|error| format!("Cannot read ONNX OCR worker response: {error}"))?;
    if bytes == 0 {
        *guard = None;
        return Err("ONNX OCR worker exited before responding".to_string());
    }
    let envelope: PythonEnvelope = serde_json::from_str(response.trim()).map_err(|error| {
        format!(
            "ONNX OCR worker returned invalid JSON: {error}; response={}",
            response.trim()
        )
    })?;
    if !envelope.ok {
        return Err(envelope
            .error
            .unwrap_or_else(|| "ONNX OCR worker failed".to_string()));
    }
    envelope
        .data
        .ok_or_else(|| "ONNX OCR worker response is missing data".to_string())
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

fn parse_hwnd(value: &str) -> Result<usize, String> {
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
fn enforce_overlay_borderless(hwnd: *mut c_void) {
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
fn restore_overlay_native_frame(binding: OverlayTargetBinding) {
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
fn sync_overlay_to_target(binding: OverlayTargetBinding, raise_overlay: bool) -> bool {
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

fn set_overlay_click_through(
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
fn set_overlay_taskbar_entry_visible(app: &tauri::AppHandle, visible: bool) -> Result<(), String> {
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
fn set_overlay_window_title(app: &tauri::AppHandle, title: &str) -> Result<(), String> {
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
fn set_overlay_border_visible(app: &tauri::AppHandle, visible: bool) -> Result<(), String> {
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


fn force_overlay_edit_mode(
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
    const VK_F8: u32 = 0x77;
    if code == HC_ACTION && (w_param == WM_KEYDOWN || w_param == WM_SYSKEYDOWN) && l_param != 0 {
        let event = unsafe { &*(l_param as *const KeyboardLowLevelHook) };
        if event.vk_code == VK_F8 {
            if let Some(context) = OVERLAY_HOTKEY_CONTEXT
                .get()
                .and_then(|slot| slot.lock().ok())
                .and_then(|guard| guard.clone())
            {
                force_overlay_edit_mode_from_hotkey(&context);
            }
        }
    }
    unsafe { CallNextHookEx(std::ptr::null_mut(), code, w_param, l_param) }
}

fn restore_normal_window(app: &tauri::AppHandle) -> Result<(), String> {
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
        .map_err(|error| format!("Cannot restore normal window resizing: {error}"))?;
    window
        .set_always_on_top(false)
        .map_err(|error| format!("Cannot restore normal window pinning: {error}"))
}

#[tauri::command]
fn update_overlay_click_through(
    app: tauri::AppHandle,
    target_state: tauri::State<'_, OverlayTargetState>,
    interaction_state: tauri::State<'_, OverlayInteractionState>,
    enabled: bool,
) -> Result<Value, String> {
    if enabled
        && target_state
            .binding
            .lock()
            .map_err(|_| "Overlay target state is unavailable".to_string())?
            .is_none()
    {
        return Err("Bind a target window before enabling click-through mode".to_string());
    }
    set_overlay_click_through(&app, interaction_state.inner(), enabled)?;
    Ok(serde_json::json!({ "clickThrough": enabled }))
}

#[tauri::command]
fn begin_overlay_mixed_mode(
    _interaction_state: tauri::State<'_, OverlayInteractionState>,
) -> Result<Value, String> {
    Ok(serde_json::json!({ "mixedMode": true }))
}

#[tauri::command]
fn force_overlay_edit_mode_command(
    app: tauri::AppHandle,
    interaction_state: tauri::State<'_, OverlayInteractionState>,
) -> Result<Value, String> {
    force_overlay_edit_mode(&app, interaction_state.inner())?;
    Ok(serde_json::json!({ "mixedMode": false, "clickThrough": false }))
}

#[tauri::command]
fn attach_overlay_target(
    app: tauri::AppHandle,
    state: tauri::State<'_, OverlayTargetState>,
    interaction_state: tauri::State<'_, OverlayInteractionState>,
    visibility_state: tauri::State<'_, OverlayVisibilityState>,
    hwnd: String,
) -> Result<Value, String> {
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
        let previous_binding = state
            .binding
            .lock()
            .map_err(|_| "Overlay target state is unavailable".to_string())?
            .take();
        const GWL_STYLE: i32 = -16;
        const GWL_EXSTYLE: i32 = -20;
        let binding = OverlayTargetBinding {
            overlay_hwnd,
            target_hwnd,
            overlay_style: previous_binding
                .map(|binding| binding.overlay_style)
                .unwrap_or_else(|| unsafe {
                    GetWindowLongPtrW(overlay_hwnd as *mut c_void, GWL_STYLE)
                }),
            overlay_exstyle: previous_binding
                .map(|binding| binding.overlay_exstyle)
                .unwrap_or_else(|| unsafe {
                    GetWindowLongPtrW(overlay_hwnd as *mut c_void, GWL_EXSTYLE)
                }),
        };
        const SW_HIDE: i32 = 0;
        unsafe { ShowWindow(overlay_hwnd as *mut c_void, SW_HIDE) };
        if let Err(error) = force_overlay_edit_mode(&app, interaction_state.inner()) {
            restore_overlay_native_frame(binding);
            const SW_SHOW: i32 = 5;
            unsafe { ShowWindow(overlay_hwnd as *mut c_void, SW_SHOW) };
            return Err(error);
        }
        enforce_overlay_borderless(overlay_hwnd as *mut c_void);
        visibility_state.collapsed.store(false, Ordering::Relaxed);
        // Keep the overlay owned by the target so it follows the target window.
        unsafe { SetWindowLongPtrW(overlay_hwnd as *mut c_void, GWLP_HWNDPARENT, target_hwnd as isize) };
        let _ = set_overlay_taskbar_entry_visible(&app, false);
        let _ = set_overlay_window_title(&app, "");
        let _ = set_overlay_border_visible(&app, false);
        if !sync_overlay_to_target(binding, true) {
            unsafe { SetWindowLongPtrW(overlay_hwnd as *mut c_void, GWLP_HWNDPARENT, 0) };
            let _ = restore_normal_window(&app);
            restore_overlay_native_frame(binding);
            let _ = set_overlay_taskbar_entry_visible(&app, true);
            let _ = set_overlay_window_title(&app, "Roco Database");
            let _ = set_overlay_border_visible(&app, true);
            const SW_SHOW: i32 = 5;
            unsafe { ShowWindow(overlay_hwnd as *mut c_void, SW_SHOW) };
            return Err("Unable to align the overlay with the supplied HWND".to_string());
        }
        *state.binding.lock().map_err(|_| "Overlay target state is unavailable".to_string())? = Some(binding);
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
fn detach_overlay_target(
    app: tauri::AppHandle,
    state: tauri::State<'_, OverlayTargetState>,
    interaction_state: tauri::State<'_, OverlayInteractionState>,
    visibility_state: tauri::State<'_, OverlayVisibilityState>,
) -> Result<Value, String> {
    let _transition_guard = visibility_state
        .transition
        .lock()
        .map_err(|_| "Overlay transition state is unavailable".to_string())?;
    visibility_state.collapsed.store(false, Ordering::Relaxed);
    let binding = state
        .binding
        .lock()
        .map_err(|_| "Overlay target state is unavailable".to_string())?
        .take();

    #[cfg(windows)]
    if let Some(binding) = binding {
        const GWLP_HWNDPARENT: i32 = -8;
        unsafe {
            SetWindowLongPtrW(
                binding.overlay_hwnd as *mut c_void,
                GWLP_HWNDPARENT,
                0,
            )
        };
        restore_overlay_native_frame(binding);
    }

    #[cfg(not(windows))]
    let _ = binding;

    restore_normal_window(&app)?;
    #[cfg(windows)]
    #[cfg(windows)]
    let _ = set_overlay_taskbar_entry_visible(&app, true);
    #[cfg(windows)]
    let _ = set_overlay_window_title(&app, "Roco Database");
    #[cfg(windows)]
    let _ = set_overlay_border_visible(&app, true);

    if interaction_state.click_through.load(Ordering::Relaxed) {
        set_overlay_click_through(&app, interaction_state.inner(), false)?;
    }
    let _ = app.emit("overlay-attachment-change", false);

    Ok(serde_json::json!({ "attached": false }))
}

#[cfg(windows)]
struct WinRtApartmentGuard(bool);

#[cfg(windows)]
impl Drop for WinRtApartmentGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe { RoUninitialize() };
        }
    }
}

#[cfg(windows)]
struct CaptureGeometry {
    origin: WinPoint,
    width: i32,
    height: i32,
    window_bounds: WinRect,
    extended_bounds: Option<WinRect>,
}

#[cfg(windows)]
struct CapturedClientFrame {
    bmp: Vec<u8>,
    width: i32,
    height: i32,
    origin: WinPoint,
    has_content: bool,
}

#[cfg(windows)]
fn read_capture_geometry(hwnd: *mut c_void) -> Result<CaptureGeometry, String> {
    const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2: isize = -4;
    const DWMWA_EXTENDED_FRAME_BOUNDS: u32 = 9;
    let previous_dpi_context = unsafe {
        SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 as *mut c_void)
    };
    let result = (|| {
        let mut client = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
        let mut origin = WinPoint { x: 0, y: 0 };
        let mut window_bounds = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
        if unsafe { GetClientRect(hwnd, &mut client) } == 0
            || unsafe { ClientToScreen(hwnd, &mut origin) } == 0
            || unsafe { GetWindowRect(hwnd, &mut window_bounds) } == 0
        {
            return Err("Cannot read target client geometry".to_string());
        }
        let width = client.right - client.left;
        let height = client.bottom - client.top;
        if width <= 0 || height <= 0 {
            return Err("Target client area is empty".to_string());
        }
        let mut extended_bounds = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
        let extended_bounds = (unsafe {
            DwmGetWindowAttribute(
                hwnd,
                DWMWA_EXTENDED_FRAME_BOUNDS,
                (&mut extended_bounds as *mut WinRect).cast(),
                std::mem::size_of::<WinRect>() as u32,
            )
        } >= 0)
            .then_some(extended_bounds);
        Ok(CaptureGeometry { origin, width, height, window_bounds, extended_bounds })
    })();
    if !previous_dpi_context.is_null() {
        unsafe { SetThreadDpiAwarenessContext(previous_dpi_context) };
    }
    result
}

#[cfg(windows)]
fn create_d3d11_capture_device(
    driver_type: D3D_DRIVER_TYPE,
) -> Result<(ID3D11Device, ID3D11DeviceContext), String> {
    let mut device = None;
    let mut context = None;
    unsafe {
        D3D11CreateDevice(
            None,
            driver_type,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
    }
    .map_err(|error| format!("Cannot create D3D11 capture device: {error}"))?;
    Ok((
        device.ok_or_else(|| "D3D11 capture device is unavailable".to_string())?,
        context.ok_or_else(|| "D3D11 capture context is unavailable".to_string())?,
    ))
}

#[cfg(windows)]
fn select_client_crop(
    geometry: &CaptureGeometry,
    frame_width: u32,
    frame_height: u32,
) -> Result<(u32, u32), String> {
    let client_width = geometry.width as u32;
    let client_height = geometry.height as u32;
    if frame_width == client_width && frame_height == client_height {
        return Ok((0, 0));
    }

    let mut best: Option<(i64, u32, u32)> = None;
    for bounds in [geometry.extended_bounds, Some(geometry.window_bounds)]
        .into_iter()
        .flatten()
    {
        let x = geometry.origin.x - bounds.left;
        let y = geometry.origin.y - bounds.top;
        if x < 0 || y < 0 {
            continue;
        }
        let x = x as u32;
        let y = y as u32;
        if x.saturating_add(client_width) > frame_width
            || y.saturating_add(client_height) > frame_height
        {
            continue;
        }
        let bounds_width = (bounds.right - bounds.left).max(0) as i64;
        let bounds_height = (bounds.bottom - bounds.top).max(0) as i64;
        let score = (frame_width as i64 - bounds_width).abs()
            + (frame_height as i64 - bounds_height).abs();
        if best.map(|current| score < current.0).unwrap_or(true) {
            best = Some((score, x, y));
        }
    }
    if let Some((_, x, y)) = best {
        return Ok((x, y));
    }

    if frame_width >= client_width
        && frame_height >= client_height
        && frame_width - client_width <= 2
        && frame_height - client_height <= 2
    {
        return Ok(((frame_width - client_width) / 2, (frame_height - client_height) / 2));
    }
    Err(format!(
        "Windows Graphics Capture frame {frame_width}x{frame_height} does not contain target client area {client_width}x{client_height}"
    ))
}

#[cfg(windows)]
fn copy_wgc_frame_to_bmp(
    frame: &Direct3D11CaptureFrame,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    hwnd: *mut c_void,
) -> Result<CapturedClientFrame, String> {
    let content_size = frame.ContentSize().map_err(|error| format!("Cannot read WGC frame size: {error}"))?;
    if content_size.Width <= 0 || content_size.Height <= 0 {
        return Err("Windows Graphics Capture returned an empty frame".to_string());
    }
    let surface = frame.Surface().map_err(|error| format!("Cannot read WGC frame surface: {error}"))?;
    let access: IDirect3DDxgiInterfaceAccess = surface
        .cast()
        .map_err(|error| format!("Cannot access WGC DXGI surface: {error}"))?;
    let texture: ID3D11Texture2D = unsafe { access.GetInterface() }
        .map_err(|error| format!("Cannot access WGC D3D11 texture: {error}"))?;
    let mut texture_desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { texture.GetDesc(&mut texture_desc) };
    let frame_width = (content_size.Width as u32).min(texture_desc.Width);
    let frame_height = (content_size.Height as u32).min(texture_desc.Height);
    let geometry = read_capture_geometry(hwnd)?;
    let (crop_x, crop_y) = select_client_crop(&geometry, frame_width, frame_height)?;

    let mut staging_desc = texture_desc;
    staging_desc.Usage = D3D11_USAGE_STAGING;
    staging_desc.BindFlags = 0;
    staging_desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
    staging_desc.MiscFlags = 0;
    let mut staging = None;
    unsafe { device.CreateTexture2D(&staging_desc, None, Some(&mut staging)) }
        .map_err(|error| format!("Cannot create WGC staging texture: {error}"))?;
    let staging = staging.ok_or_else(|| "WGC staging texture is unavailable".to_string())?;
    unsafe { context.CopyResource(&staging, &texture) };

    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe { context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)) }
        .map_err(|error| format!("Cannot map WGC frame for OCR: {error}"))?;
    let width = geometry.width as usize;
    let height = geometry.height as usize;
    let bmp_stride = (width * 3 + 3) & !3;
    let mut pixels = vec![0u8; bmp_stride * height];
    let source_len = mapped.RowPitch as usize * texture_desc.Height as usize;
    let source = unsafe { std::slice::from_raw_parts(mapped.pData.cast::<u8>(), source_len) };
    let mut has_content = false;
    for output_y in 0..height {
        let source_y = crop_y as usize + (height - 1 - output_y);
        let source_row = source_y * mapped.RowPitch as usize + crop_x as usize * 4;
        let output_row = output_y * bmp_stride;
        for x in 0..width {
            let source_pixel = source_row + x * 4;
            let output_pixel = output_row + x * 3;
            let b = source[source_pixel];
            let g = source[source_pixel + 1];
            let r = source[source_pixel + 2];
            pixels[output_pixel] = b;
            pixels[output_pixel + 1] = g;
            pixels[output_pixel + 2] = r;
            has_content |= b != 0 || g != 0 || r != 0;
        }
    }
    unsafe { context.Unmap(&staging, 0) };

    let file_size = 14usize + 40 + pixels.len();
    let file_size_u32 = u32::try_from(file_size).map_err(|_| "WGC screenshot is too large".to_string())?;
    let image_size_u32 = u32::try_from(pixels.len()).map_err(|_| "WGC screenshot is too large".to_string())?;
    let mut bmp = Vec::with_capacity(file_size);
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&file_size_u32.to_le_bytes());
    bmp.extend_from_slice(&[0; 4]);
    bmp.extend_from_slice(&(54u32).to_le_bytes());
    bmp.extend_from_slice(&40u32.to_le_bytes());
    bmp.extend_from_slice(&geometry.width.to_le_bytes());
    bmp.extend_from_slice(&geometry.height.to_le_bytes());
    bmp.extend_from_slice(&1u16.to_le_bytes());
    bmp.extend_from_slice(&24u16.to_le_bytes());
    bmp.extend_from_slice(&0u32.to_le_bytes());
    bmp.extend_from_slice(&image_size_u32.to_le_bytes());
    bmp.extend_from_slice(&[0; 16]);
    bmp.extend_from_slice(&pixels);
    Ok(CapturedClientFrame {
        bmp,
        width: geometry.width,
        height: geometry.height,
        origin: geometry.origin,
        has_content,
    })
}

#[cfg(windows)]
fn capture_window_client_wgc(hwnd_value: usize) -> Result<CapturedClientFrame, String> {
    let apartment_initialized = match unsafe { RoInitialize(RO_INIT_MULTITHREADED) } {
        Ok(()) => true,
        Err(error) if error.code() == RPC_E_CHANGED_MODE => false,
        Err(error) => return Err(format!("Cannot initialize Windows Graphics Capture: {error}")),
    };
    let _apartment = WinRtApartmentGuard(apartment_initialized);
    if !GraphicsCaptureSession::IsSupported()
        .map_err(|error| format!("Cannot query Windows Graphics Capture support: {error}"))?
    {
        return Err("Windows Graphics Capture is not supported on this Windows version".to_string());
    }

    let (device, context) = create_d3d11_capture_device(D3D_DRIVER_TYPE_HARDWARE)
        .or_else(|_| create_d3d11_capture_device(D3D_DRIVER_TYPE_WARP))?;
    let dxgi_device: IDXGIDevice = device
        .cast()
        .map_err(|error| format!("Cannot access D3D11 DXGI device: {error}"))?;
    let inspectable = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi_device) }
        .map_err(|error| format!("Cannot create WinRT D3D11 device: {error}"))?;
    let winrt_device: IDirect3DDevice = inspectable
        .cast()
        .map_err(|error| format!("Cannot access WinRT D3D11 device: {error}"))?;
    let interop: IGraphicsCaptureItemInterop = factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
        .map_err(|error| format!("Cannot create WGC window interop: {error}"))?;
    let hwnd = hwnd_value as *mut c_void;
    let item: GraphicsCaptureItem = unsafe { interop.CreateForWindow(HWND(hwnd)) }
        .map_err(|error| format!("Cannot create WGC target item: {error}"))?;
    let item_size = item.Size().map_err(|error| format!("Cannot read WGC target size: {error}"))?;
    let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
        &winrt_device,
        DirectXPixelFormat::B8G8R8A8UIntNormalized,
        2,
        item_size,
    )
    .map_err(|error| format!("Cannot create WGC frame pool: {error}"))?;
    let session = pool
        .CreateCaptureSession(&item)
        .map_err(|error| format!("Cannot create WGC capture session: {error}"))?;
    let _ = session.SetIsCursorCaptureEnabled(false);
    let _ = session.SetIsBorderRequired(false);

    let (frame_sender, frame_receiver) = std::sync::mpsc::sync_channel(2);
    let handler = TypedEventHandler::<Direct3D11CaptureFramePool, windows::core::IInspectable>::new(
        move |sender, _| {
            if let Some(pool) = sender.as_ref() {
                if let Ok(frame) = pool.TryGetNextFrame() {
                    let _ = frame_sender.try_send(frame);
                }
            }
            Ok(())
        },
    );
    let token = pool
        .FrameArrived(&handler)
        .map_err(|error| format!("Cannot subscribe to WGC frames: {error}"))?;
    let result = (|| {
        session.StartCapture().map_err(|error| format!("Cannot start WGC capture: {error}"))?;
        let deadline = Instant::now() + Duration::from_secs(2);
        for _ in 0..4 {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            let frame = frame_receiver
                .recv_timeout(remaining)
                .map_err(|_| "Timed out waiting for a Windows Graphics Capture frame".to_string())?;
            let captured = copy_wgc_frame_to_bmp(&frame, &device, &context, hwnd);
            let _ = frame.Close();
            let captured = captured?;
            if captured.has_content {
                return Ok(captured);
            }
        }
        Err("Windows Graphics Capture returned only blank frames".to_string())
    })();
    let _ = pool.RemoveFrameArrived(token);
    let _ = session.Close();
    let _ = pool.Close();
    result
}

#[tauri::command]
fn capture_overlay_target(target_state: tauri::State<'_, OverlayTargetState>) -> Result<Value, String> {
    let binding = target_state
        .binding
        .lock()
        .map_err(|_| "Overlay target state is unavailable".to_string())?
        .ok_or_else(|| "Bind a target window before recognition".to_string())?;

    #[cfg(windows)]
    {
        let captured = capture_window_client_wgc(binding.target_hwnd)?;
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
        return Ok(serde_json::json!({
            "imageDataUrl": format!("data:image/bmp;base64,{}", base64_encode(&captured.bmp)),
            "width": captured.width,
            "height": captured.height,
            "targetClient": { "x": captured.origin.x, "y": captured.origin.y, "width": captured.width, "height": captured.height },
            "overlayClient": { "x": overlay_origin.x, "y": overlay_origin.y, "width": overlay_width, "height": overlay_height },
        }));
    }
    #[cfg(not(windows))]
    { let _ = binding; Err("Target screenshots are only available on Windows".to_string()) }
}
#[tauri::command]
async fn database_summary(app: tauri::AppHandle) -> Result<Value, String> {
    run_python_async(app, vec!["summary".to_string()]).await
}

#[tauri::command]
async fn search_pets(app: tauri::AppHandle, query: String) -> Result<Value, String> {
    run_python_payload_async(app, "list-pets", serde_json::json!({ "query": query })).await
}

#[tauri::command]
async fn list_presets(app: tauri::AppHandle) -> Result<Value, String> {
    run_python_async(app, vec!["presets".to_string()]).await
}

#[tauri::command]
async fn core_probe(app: tauri::AppHandle) -> Result<Value, String> {
    run_python_async(app, vec!["core-probe".to_string()]).await
}

#[tauri::command]
async fn app_state(app: tauri::AppHandle) -> Result<Value, String> {
    run_python_async(app, vec!["app-state".to_string()]).await
}

#[tauri::command]
async fn list_pets(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "list-pets", payload).await
}

#[tauri::command]
async fn list_skills(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "list-skills", payload).await
}

#[tauri::command]
async fn trait_info(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "trait-info", payload).await
}

#[tauri::command]
async fn list_traits(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "list-traits", payload).await
}

#[tauri::command]
async fn list_burst_effects(app: tauri::AppHandle) -> Result<Value, String> {
    run_python_async(app, vec!["list-burst-effects".to_string()]).await
}

#[tauri::command]
async fn calculate_battle(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "calculate-battle", payload).await
}

#[tauri::command]
async fn calculate_quick_skills(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "calculate-quick-skills", payload).await
}

#[tauri::command]
async fn calculate_willpower(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "calculate-willpower", payload).await
}

#[tauri::command]
async fn calculate_required_power(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "calculate-required-power", payload).await
}

#[tauri::command]
async fn apply_skill_buffs(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "apply-skill-buffs", payload).await
}

#[tauri::command]
async fn skill_trigger_info(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "skill-trigger-info", payload).await
}

#[tauri::command]
async fn save_preset(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "save-preset", payload).await
}

#[tauri::command]
async fn manage_preset(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "manage-preset", payload).await
}

#[tauri::command]
async fn import_team_code(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "import-team-code", payload).await
}

#[tauri::command]
async fn save_picker_config(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "save-picker-config", payload).await
}

#[tauri::command]
async fn classify_image_samples(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    run_python_payload_async(app, "classify-image-samples", payload).await
}

#[tauri::command]
async fn recognize_image_text(
    app: tauri::AppHandle,
    worker: tauri::State<'_, OcrWorker>,
    image_data_url: String,
    mode: String,
) -> Result<String, String> {
    let worker = worker.inner().clone();
    let response = tauri::async_runtime::spawn_blocking(move || {
        run_ocr_worker(
            &app,
            &worker,
            serde_json::json!({ "images": [{ "imageDataUrl": image_data_url, "mode": mode }] }),
        )
    })
    .await
    .map_err(|error| format!("ONNX OCR task failed: {error}"))??;
    response
        .get("items")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|item| item.get("text"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "ONNX OCR response is missing text".to_string())
}

#[tauri::command]
async fn recognize_images(
    app: tauri::AppHandle,
    worker: tauri::State<'_, OcrWorker>,
    images: Value,
) -> Result<Value, String> {
    let worker = worker.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_ocr_worker(&app, &worker, serde_json::json!({ "images": images }))
    })
    .await
    .map_err(|error| format!("ONNX OCR task failed: {error}"))?
}

#[tauri::command]
async fn save_ocr_debug_images(app: tauri::AppHandle, category: String, images: Value) -> Result<Value, String> {
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
            let (_, encoded) = data_url.split_once(',').ok_or_else(|| "OCR debug image must be a data URL".to_string())?;
            let key = image.get("key").and_then(Value::as_str).unwrap_or("image").chars()
                .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
                .collect::<String>();
            let name = if key.is_empty() { "image" } else { &key };
            std::fs::write(directory.join(format!("{stamp}-{index}-{name}.png")), decode_base64(encoded)?)
                .map_err(|error| format!("Cannot save OCR debug image: {error}"))?;
            saved += 1;
        }
        Ok(serde_json::json!({ "saved": saved, "directory": directory.to_string_lossy() }))
    }).await.map_err(|error| format!("Saving OCR debug images failed: {error}"))?
}

#[tauri::command]
async fn save_labeled_ocr_sample(
    app: tauri::AppHandle,
    image_data_url: String,
    region: String,
    label: String,
    video_time: f64,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let allowed_regions = [
            "enemyHealth", "selfHealth", "enemyDamage", "selfDamage",
            "skill1", "skill2", "skill3", "skill4",
        ];
        if !allowed_regions.contains(&region.as_str()) {
            return Err("Only numeric OCR regions can be labeled".to_string());
        }
        let normalized_label = label.trim().replace(' ', "");
        if normalized_label.is_empty()
            || !(normalized_label == "-"
                || normalized_label
                    .chars()
                    .all(|ch| ch.is_ascii_digit() || matches!(ch, '/' | '%')))
        {
            return Err("Numeric sample labels can contain only digits, /, %, and -".to_string());
        }
        let (_, encoded) = image_data_url
            .split_once(',')
            .ok_or_else(|| "Sample image must be a data URL".to_string())?;
        let bytes = decode_base64(encoded)?;
        let samples_dir = app_data_dir(&app).join("ocr-samples").join(&region);
        std::fs::create_dir_all(&samples_dir)
            .map_err(|error| format!("Cannot create OCR samples directory: {error}"))?;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis();
        let file_name = format!("{stamp}-{}.png", normalized_label.replace('/', "_"));
        let image_path = samples_dir.join(&file_name);
        std::fs::write(&image_path, bytes)
            .map_err(|error| format!("Cannot save OCR sample image: {error}"))?;
        let record = serde_json::json!({
            "file": format!("{region}/{file_name}"),
            "region": region,
            "label": normalized_label,
            "videoTime": video_time,
            "createdAt": stamp,
        });
        let manifest_path = app_data_dir(&app).join("ocr-samples").join("labels.jsonl");
        use std::io::Write as _;
        let mut manifest = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&manifest_path)
            .map_err(|error| format!("Cannot open OCR labels manifest: {error}"))?;
        writeln!(manifest, "{}", record)
            .map_err(|error| format!("Cannot write OCR label: {error}"))?;
        Ok(serde_json::json!({ "file": image_path.to_string_lossy(), "manifest": manifest_path.to_string_lossy() }))
    })
    .await
    .map_err(|error| format!("Saving OCR sample failed: {error}"))?
}

#[tauri::command]
async fn save_labeled_image_sample(
    app: tauri::AppHandle,
    image_data_url: String,
    region: String,
    truth: String,
    video_time: f64,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let allowed_regions = ["enemyImage", "selfImage"];
        if !allowed_regions.contains(&region.as_str()) {
            return Err("Only player image regions can be saved".to_string());
        }
        let folder_name = truth.trim();
        if folder_name.is_empty()
            || folder_name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
            || folder_name == "."
            || folder_name == ".."
        {
            return Err("Image truth must be a valid folder name".to_string());
        }
        let (_, encoded) = image_data_url
            .split_once(',')
            .ok_or_else(|| "Image sample must be a data URL".to_string())?;
        let bytes = decode_base64(encoded)?;
        let side = if region == "enemyImage" { "enemy" } else { "self" };
        let samples_dir = app_data_dir(&app).join("image-samples").join(side).join(folder_name);
        std::fs::create_dir_all(&samples_dir)
            .map_err(|error| format!("Cannot create image sample directory: {error}"))?;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis();
        let image_path = samples_dir.join(format!("{stamp}-{:.0}.png", video_time.max(0.0) * 1000.0));
        std::fs::write(&image_path, bytes)
            .map_err(|error| format!("Cannot save image sample: {error}"))?;
        Ok(serde_json::json!({ "file": image_path.to_string_lossy() }))
    })
    .await
    .map_err(|error| format!("Saving image sample failed: {error}"))?
}

#[tauri::command]
async fn save_replay_ocr_frames(
    app: tauri::AppHandle,
    frames: Vec<ReplayOcrFrame>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let allowed_regions = ["enemyHealth", "selfHealth", "enemyDamage", "selfDamage"];
        let root = app_data_dir(&app).join("replay-frames");
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis();
        let mut saved = 0usize;
        for (index, frame) in frames.into_iter().enumerate() {
            if !allowed_regions.contains(&frame.region.as_str()) {
                return Err(format!("Unsupported replay OCR region: {}", frame.region));
            }
            let root = match frame.category.as_deref() {
                None | Some("captured") => root.clone(),
                Some("ocr-analysis") => root.join("ocr-analysis"),
                Some(category) => {
                    return Err(format!("Unsupported replay frame category: {category}"))
                }
            };
            let (_, encoded) = frame
                .image_data_url
                .split_once(',')
                .ok_or_else(|| "Replay OCR image must be a data URL".to_string())?;
            let bytes = decode_base64(encoded)?;
            let region_dir = root.join(&frame.region);
            std::fs::create_dir_all(&region_dir)
                .map_err(|error| format!("Cannot create replay frame directory: {error}"))?;
            let video_millis = (frame.video_time.max(0.0) * 1000.0).round() as u64;
            let file_name = format!(
                "{}-{}-{}-{}.png",
                frame.session_id, video_millis, stamp, index
            );
            std::fs::write(region_dir.join(file_name), bytes)
                .map_err(|error| format!("Cannot save replay OCR frame: {error}"))?;
            saved += 1;
        }
        Ok(serde_json::json!({ "saved": saved, "directory": root.to_string_lossy() }))
    })
    .await
    .map_err(|error| format!("Saving replay OCR frames failed: {error}"))?
}

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    fn value(byte: u8) -> Option<u8> {
        match byte {
            b'A'..=b'Z' => Some(byte - b'A'),
            b'a'..=b'z' => Some(byte - b'a' + 26),
            b'0'..=b'9' => Some(byte - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let clean = input
        .as_bytes()
        .iter()
        .copied()
        .filter(|byte| !byte.is_ascii_whitespace())
        .collect::<Vec<_>>();
    if clean.len() % 4 != 0 {
        return Err("Invalid base64 length".to_string());
    }
    let mut output = Vec::with_capacity(clean.len() / 4 * 3);
    for chunk in clean.chunks_exact(4) {
        let a = value(chunk[0]).ok_or_else(|| "Invalid base64 data".to_string())?;
        let b = value(chunk[1]).ok_or_else(|| "Invalid base64 data".to_string())?;
        let c = if chunk[2] == b'=' {
            0
        } else {
            value(chunk[2]).ok_or_else(|| "Invalid base64 data".to_string())?
        };
        let d = if chunk[3] == b'=' {
            0
        } else {
            value(chunk[3]).ok_or_else(|| "Invalid base64 data".to_string())?
        };
        output.push((a << 2) | (b >> 4));
        if chunk[2] != b'=' {
            output.push((b << 4) | (c >> 2));
        }
        if chunk[3] != b'=' {
            output.push((c << 6) | d);
        }
    }
    Ok(output)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(OcrWorker::default())
        .manage(OverlayTargetState::default())
        .manage(OverlayInteractionState::default())
        .manage(OverlayVisibilityState::default())
        .setup(|app| {
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

            let window_builder =
                tauri::WebviewWindowBuilder::from_config(app.handle(), &window_config)?
                    .data_directory(webview_dir);
            let window_builder = if let Some((width, height)) = configured_window_size(app.handle())
            {
                window_builder.inner_size(width, height)
            } else {
                window_builder
            };
            window_builder.build()?;

            #[cfg(windows)]
            {
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

                let f9_app = app.handle().clone();
                let f9_target_state = app.state::<OverlayTargetState>().inner().clone();
                let f9_interaction_state = app.state::<OverlayInteractionState>().inner().clone();
                let f9_visibility_state = app.state::<OverlayVisibilityState>().inner().clone();
                std::thread::spawn(move || {
                    const F9_HOTKEY_ID: i32 = 0x5248;
                    const VK_F9: u32 = 0x78;
                    const WM_HOTKEY: u32 = 0x0312;
                    const MOD_NOREPEAT: u32 = 0x4000;
                    if unsafe {
                        RegisterHotKey(
                            std::ptr::null_mut(),
                            F9_HOTKEY_ID,
                            MOD_NOREPEAT,
                            VK_F9,
                        )
                    } == 0
                    {
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
                    while unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) } > 0 {
                        if message.message == WM_HOTKEY
                            && message.w_param == F9_HOTKEY_ID as usize
                        {
                            toggle_overlay_visibility(
                                &f9_app,
                                &f9_target_state,
                                &f9_interaction_state,
                                &f9_visibility_state,
                            );
                        }
                    }
                    unsafe { UnregisterHotKey(std::ptr::null_mut(), F9_HOTKEY_ID) };
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
                std::thread::spawn(move || {
                    const OVERLAY_HOTKEY_ID: i32 = 0x524F;
                    const QUICK_CALCULATE_HOTKEY_ID: i32 = 0x5243;
                    const HIDE_QUICK_RESULTS_HOTKEY_ID: i32 = 0x5244;
                    const BATTLE_START_SCAN_HOTKEY_ID: i32 = 0x5245;
                    const BATTLE_LIVE_SCAN_HOTKEY_ID: i32 = 0x5246;
                    const BATTLE_POWER_SCAN_HOTKEY_ID: i32 = 0x5247;
                    const VK_F8: u32 = 0x77;
                    const VK_J: u32 = 0x4A;
                    const VK_D: u32 = 0x44;
                    const VK_B: u32 = 0x42;
                    const VK_U: u32 = 0x55;
                    const VK_P: u32 = 0x50;
                    const WM_HOTKEY: u32 = 0x0312;
                    const MOD_CONTROL: u32 = 0x0002;
                    let overlay_hotkey_registered = unsafe {
                        RegisterHotKey(std::ptr::null_mut(), OVERLAY_HOTKEY_ID, 0, VK_F8)
                    } != 0;
                    let quick_hotkey_registered = unsafe {
                        RegisterHotKey(
                            std::ptr::null_mut(),
                            QUICK_CALCULATE_HOTKEY_ID,
                            MOD_CONTROL,
                            VK_J,
                        )
                    } != 0;
                    let hide_quick_results_registered = unsafe {
                        RegisterHotKey(
                            std::ptr::null_mut(),
                            HIDE_QUICK_RESULTS_HOTKEY_ID,
                            MOD_CONTROL,
                            VK_D,
                        )
                    } != 0;
                    let battle_start_scan_registered = unsafe { RegisterHotKey(std::ptr::null_mut(), BATTLE_START_SCAN_HOTKEY_ID, MOD_CONTROL, VK_B) } != 0;
                    let battle_live_scan_registered = unsafe { RegisterHotKey(std::ptr::null_mut(), BATTLE_LIVE_SCAN_HOTKEY_ID, MOD_CONTROL, VK_U) } != 0;
                    let battle_power_scan_registered = unsafe { RegisterHotKey(std::ptr::null_mut(), BATTLE_POWER_SCAN_HOTKEY_ID, MOD_CONTROL, VK_P) } != 0;
                    let mut message = WinMessage {
                        hwnd: std::ptr::null_mut(),
                        message: 0,
                        w_param: 0,
                        l_param: 0,
                        time: 0,
                        point: WinPoint { x: 0, y: 0 },
                    };
                    while unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) } > 0 {
                        if message.message != WM_HOTKEY {
                            continue;
                        }
                        let binding = hotkey_target_state
                            .binding
                            .lock()
                            .ok()
                            .and_then(|binding| *binding);
                        let Some(_binding) = binding else {
                            continue;
                        };
                        if hotkey_visibility_state.collapsed.load(Ordering::Relaxed) {
                            continue;
                        }
                        if overlay_hotkey_registered
                            && message.w_param == OVERLAY_HOTKEY_ID as usize
                        {
                            force_overlay_edit_mode_from_hotkey(&hotkey_context);
                        } else if quick_hotkey_registered
                            && message.w_param == QUICK_CALCULATE_HOTKEY_ID as usize
                        {
                            let _ = hotkey_app.emit("overlay-quick-calculate", ());
                        } else if hide_quick_results_registered
                            && message.w_param == HIDE_QUICK_RESULTS_HOTKEY_ID as usize
                        {
                            let _ = hotkey_app.emit("overlay-hide-quick-results", ());
                        } else if battle_start_scan_registered && message.w_param == BATTLE_START_SCAN_HOTKEY_ID as usize {
                            let _ = hotkey_app.emit("overlay-battle-start-scan", ());
                        } else if battle_live_scan_registered && message.w_param == BATTLE_LIVE_SCAN_HOTKEY_ID as usize {
                            let _ = hotkey_app.emit("overlay-battle-live-scan", ());
                        } else if battle_power_scan_registered && message.w_param == BATTLE_POWER_SCAN_HOTKEY_ID as usize {
                            let _ = hotkey_app.emit("overlay-battle-power-scan", ());
                        }
                    }
                    if overlay_hotkey_registered {
                        unsafe { UnregisterHotKey(std::ptr::null_mut(), OVERLAY_HOTKEY_ID) };
                    }
                    if quick_hotkey_registered {
                        unsafe { UnregisterHotKey(std::ptr::null_mut(), QUICK_CALCULATE_HOTKEY_ID) };
                    }
                    if hide_quick_results_registered {
                        unsafe {
                            UnregisterHotKey(
                                std::ptr::null_mut(),
                                HIDE_QUICK_RESULTS_HOTKEY_ID,
                            )
                        };
                    }
                    if battle_start_scan_registered { unsafe { UnregisterHotKey(std::ptr::null_mut(), BATTLE_START_SCAN_HOTKEY_ID) }; }
                    if battle_live_scan_registered { unsafe { UnregisterHotKey(std::ptr::null_mut(), BATTLE_LIVE_SCAN_HOTKEY_ID) }; }
                    if battle_power_scan_registered { unsafe { UnregisterHotKey(std::ptr::null_mut(), BATTLE_POWER_SCAN_HOTKEY_ID) }; }
                });
            }

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
            calculate_quick_skills,
            calculate_willpower,
            calculate_required_power,
            apply_skill_buffs,
            skill_trigger_info,
            save_preset,
            manage_preset,
            import_team_code,
            save_picker_config,
            classify_image_samples,
            recognize_image_text,
            recognize_images,
            save_ocr_debug_images,
            save_labeled_ocr_sample,
            save_labeled_image_sample,
            save_replay_ocr_frames,
            capture_overlay_target,
            attach_overlay_target,
            detach_overlay_target,
            update_overlay_click_through,
            begin_overlay_mixed_mode,
            force_overlay_edit_mode_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
