//! Background keyboard input for restoring an overlay that cannot receive focus.
use std::{ffi::c_void, io::{BufRead, Write}, sync::{Arc, atomic::{AtomicU32, Ordering}, mpsc::{Receiver, Sender}}};
use super::ffi::{WinMessage, WinPoint, GetMessageW, GetLastError};

#[repr(C)]
struct Device { page: u16, usage: u16, flags: u32, target: *mut c_void }
#[repr(C)]
struct Header { kind: u32, size: u32, device: *mut c_void, param: usize }
#[repr(C)]
#[derive(Clone, Copy)]
struct Keyboard { make_code: u16, flags: u16, reserved: u16, key: u16, message: u32, extra: u32 }

#[link(name = "user32")]
unsafe extern "system" {
    fn CreateWindowExW(ex: u32, class: *const u16, title: *const u16, style: u32,
        x: i32, y: i32, width: i32, height: i32, parent: *mut c_void,
        menu: *mut c_void, instance: *mut c_void, param: *mut c_void) -> *mut c_void;
    fn RegisterRawInputDevices(devices: *const Device, count: u32, size: u32) -> i32;
    fn GetRegisteredRawInputDevices(devices: *mut Device, count: *mut u32, size: u32) -> u32;
    fn GetRawInputData(input: *mut c_void, command: u32, data: *mut c_void, size: *mut u32, header_size: u32) -> u32;
    fn DispatchMessageW(message: *const WinMessage) -> isize;
    fn DefWindowProcW(window: *mut c_void, message: u32, w_param: usize, l_param: isize) -> isize;
    fn DestroyWindow(window: *mut c_void) -> i32;
}

fn ensure_keyboard_registration(window: *mut c_void) -> Result<bool, String> {
    let size = std::mem::size_of::<Device>() as u32;
    let mut count = 0;
    if unsafe { GetRegisteredRawInputDevices(std::ptr::null_mut(), &mut count, size) } == u32::MAX {
        return Err(format!("查询后台键盘注册失败：{}", unsafe { GetLastError() }));
    }
    let mut devices: Vec<Device> = (0..count).map(|_| Device { page: 0, usage: 0, flags: 0, target: std::ptr::null_mut() }).collect();
    let read = if count == 0 { 0 } else {
        unsafe { GetRegisteredRawInputDevices(devices.as_mut_ptr(), &mut count, size) }
    };
    if read == u32::MAX { return Err(format!("读取后台键盘注册失败：{}", unsafe { GetLastError() })); }
    if devices.iter().take(read as usize).any(|device| device.page == 1 && device.usage == 6
        && device.target == window && device.flags & 0x100 != 0) { return Ok(false); }
    let device = Device { page: 1, usage: 6, flags: 0x100, target: window };
    if unsafe { RegisterRawInputDevices(&device, 1, size) } == 0 {
        return Err(format!("恢复后台键盘注册失败：{}", unsafe { GetLastError() }));
    }
    Ok(true)
}

// Register on a dedicated message-only window so hiding the overlay does not
// change delivery. INPUTSINK observes input without taking keys from the game.
fn run(mut key_event: impl FnMut(u32, bool, u32, bool), ready: impl FnOnce()) -> Result<(), String> {
    let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
    let window = unsafe { CreateWindowExW(0, class.as_ptr(), class.as_ptr(), 0,
        0, 0, 0, 0, -3isize as *mut c_void, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut()) };
    if window.is_null() { return Err(format!("创建后台快捷键窗口失败：{}", unsafe { GetLastError() })); }
    if let Err(error) = ensure_keyboard_registration(window) {
        unsafe { DestroyWindow(window) };
        return Err(error);
    }
    ready();
    let mut keys = [false; 256];
    let mut message = WinMessage { hwnd: std::ptr::null_mut(), message: 0, w_param: 0, l_param: 0,
        time: 0, point: WinPoint { x: 0, y: 0 } };
    loop {
        let result = unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) };
        if result <= 0 { break; }
        if message.message == 0x00FF {
            // Aligned storage; a keyboard RAWINPUT fits inside this buffer.
            let mut buffer = [0usize; 32];
            let mut size = std::mem::size_of_val(&buffer) as u32;
            let header_size = std::mem::size_of::<Header>() as u32;
            let read = unsafe { GetRawInputData(message.l_param as *mut c_void, 0x10000003,
                buffer.as_mut_ptr().cast(), &mut size, header_size) };
            if read != u32::MAX && read as usize >= std::mem::size_of::<Header>() + std::mem::size_of::<Keyboard>() {
                let header = unsafe { &*buffer.as_ptr().cast::<Header>() };
                if header.kind == 1 {
                    let keyboard = unsafe { std::ptr::read_unaligned(buffer.as_ptr().cast::<u8>().add(header_size as usize).cast::<Keyboard>()) };
                    let key = keyboard.key as usize;
                    if key < keys.len() {
                        let down = keyboard.flags & 1 == 0;
                        keys[key] = down;
                        let modifiers = u32::from(keys[0x12] || keys[0xA4] || keys[0xA5])
                            | (u32::from(keys[0x11] || keys[0xA2] || keys[0xA3]) << 1)
                            | (u32::from(keys[0x10] || keys[0xA0] || keys[0xA1]) << 2);
                        key_event(key as u32, down, modifiers, keys[0x5B] || keys[0x5C]);
                    }
                }
            }
            unsafe { DefWindowProcW(message.hwnd, message.message, message.w_param, message.l_param) };
        } else {
            unsafe { DispatchMessageW(&message) };
        }
    }
    unsafe { DestroyWindow(window) };
    Err("后台键盘输入消息循环已停止".to_string())
}

const HELPER_ARGUMENT: &str = "--roco-visibility-input-helper";

/// Runs before Tauri and before the elevation prompt. No WebView is created in
/// this process, so its keyboard registration cannot be replaced by WebView.
pub(crate) fn run_helper_if_requested() -> bool {
    if std::env::args_os().nth(1).as_deref() != Some(std::ffi::OsStr::new(HELPER_ARGUMENT)) { return false; }
    let watched_key = Arc::new(AtomicU32::new(0));
    let input_key = watched_key.clone();
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            let Ok(line) = line else { break; };
            if let Ok(key) = line.parse::<u32>() {
                if key < 256 { input_key.store(key, Ordering::Relaxed); }
            }
        }
        // The pipe closes on normal exit or a crash of the parent. Never leave
        // a keyboard receiver running after the main application has exited.
        std::process::exit(0);
    });
    let mut output = std::io::stdout();
    let mut held = None;
    let result = run(|key, down, modifiers, windows_key| {
        if key == 0 || key != watched_key.load(Ordering::Relaxed) { return; }
        if down && held == Some(key) { return; }
        held = if down { Some(key) } else { None };
        if writeln!(output, "{key} {} {modifiers} {}", u8::from(down), u8::from(windows_key))
            .and_then(|_| output.flush()).is_err() { std::process::exit(0); }
    }, || {
        let mut ready_output = std::io::stdout();
        if writeln!(ready_output, "ready").and_then(|_| ready_output.flush()).is_err() { std::process::exit(0); }
    });
    if let Err(error) = result { eprintln!("{error}"); }
    true
}

pub(super) fn receive_from_helper(
    configuration: Receiver<Option<u32>>,
    stop_configuration: Sender<Option<u32>>,
    mut key_event: impl FnMut(u32, bool, u32, bool),
) -> Result<(), String> {
    use std::{os::windows::process::CommandExt, process::{Command, Stdio}};
    let mut child = Command::new(std::env::current_exe().map_err(|error| error.to_string())?)
        .arg(HELPER_ARGUMENT).creation_flags(0x0800_0000)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
        .spawn().map_err(|error| format!("启动后台快捷键接收进程失败：{error}"))?;
    let mut input = child.stdin.take().expect("piped helper stdin");
    let output = child.stdout.take().expect("piped helper stdout");
    let writer = std::thread::spawn(move || {
        for key in configuration {
            let Some(key) = key else { break; };
            if writeln!(input, "{key}").and_then(|_| input.flush()).is_err() { break; }
        }
    });
    for line in std::io::BufReader::new(output).lines() {
        let Ok(line) = line else { break; };
        if line == "ready" {
            crate::diagnostics::event("shortcut.visibility_input_ready", serde_json::json!({"pid": child.id(), "receiver": "isolated-process"}));
            continue;
        }
        let values: Vec<u32> = line.split_whitespace().filter_map(|value| value.parse().ok()).collect();
        if let [key, down, modifiers, windows_key] = values.as_slice() {
            if *key < 256 && *down <= 1 && *modifiers <= 7 && *windows_key <= 1 {
                key_event(*key, *down != 0, *modifiers, *windows_key != 0);
            }
        }
    }
    let _ = stop_configuration.send(None);
    let _ = child.kill();
    let _ = child.wait();
    let _ = writer.join();
    Err("后台快捷键接收进程已停止".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repairs_registration_replaced_by_another_window() {
        let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
        let make_window = || unsafe { CreateWindowExW(0, class.as_ptr(), class.as_ptr(), 0,
            0, 0, 0, 0, -3isize as *mut c_void, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut()) };
        let receiver = make_window();
        let other = make_window();
        assert!(!receiver.is_null() && !other.is_null());
        assert!(ensure_keyboard_registration(receiver).unwrap());
        assert!(!ensure_keyboard_registration(receiver).unwrap());
        assert!(ensure_keyboard_registration(other).unwrap());
        assert!(ensure_keyboard_registration(receiver).unwrap(), "replacement must be detected and repaired");
        assert!(!ensure_keyboard_registration(receiver).unwrap(), "healthy registration must not be repeatedly changed");
        unsafe { DestroyWindow(receiver); DestroyWindow(other); }
    }
}
