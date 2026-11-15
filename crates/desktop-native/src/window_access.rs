//! Shared Windows process/window discovery and optional startup elevation.
use std::{collections::HashSet, ffi::{c_void, OsStr, OsString}, os::windows::ffi::OsStrExt};

#[repr(C)]
struct ProcessEntry {
    size: u32, usage: u32, pid: u32, heap: usize, module: u32, threads: u32,
    parent: u32, priority: i32, flags: u32, name: [u16; 260],
}
#[repr(C)]
#[derive(Default)]
struct Rect { left: i32, top: i32, right: i32, bottom: i32 }

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> *mut c_void;
    fn Process32FirstW(snapshot: *mut c_void, entry: *mut ProcessEntry) -> i32;
    fn Process32NextW(snapshot: *mut c_void, entry: *mut ProcessEntry) -> i32;
    fn CloseHandle(handle: *mut c_void) -> i32;
    fn GetCurrentProcess() -> *mut c_void;
    fn GetLastError() -> u32;
    fn SetLastError(error: u32);
}
#[link(name = "user32")]
unsafe extern "system" {
    fn EnumWindows(callback: unsafe extern "system" fn(*mut c_void, isize) -> i32, param: isize) -> i32;
    fn GetWindowThreadProcessId(window: *mut c_void, pid: *mut u32) -> u32;
    fn IsWindowVisible(window: *mut c_void) -> i32;
    fn GetWindow(window: *mut c_void, command: u32) -> *mut c_void;
    fn GetClientRect(window: *mut c_void, rect: *mut Rect) -> i32;
    fn MessageBoxW(window: *mut c_void, text: *const u16, title: *const u16, flags: u32) -> i32;
}
#[link(name = "advapi32")]
unsafe extern "system" {
    fn OpenProcessToken(process: *mut c_void, access: u32, token: *mut *mut c_void) -> i32;
    fn GetTokenInformation(token: *mut c_void, kind: u32, data: *mut c_void, size: u32, returned: *mut u32) -> i32;
}
#[link(name = "shell32")]
unsafe extern "system" {
    fn ShellExecuteW(window: *mut c_void, verb: *const u16, file: *const u16,
        args: *const u16, directory: *const u16, show: i32) -> isize;
}

fn wide(value: impl AsRef<OsStr>) -> Vec<u16> { value.as_ref().encode_wide().chain(Some(0)).collect() }
fn process_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() { return Err("请输入进程名".into()); }
    if value.contains(['/', '\\', '\0']) { return Err("请填写进程名，不要填写文件路径".into()); }
    let value = value.to_lowercase();
    Ok(value.strip_suffix(".exe").unwrap_or(&value).to_owned())
}

struct Search { pids: HashSet<u32>, best: Option<(i64, usize)> }
unsafe extern "system" fn window_candidate(window: *mut c_void, param: isize) -> i32 {
    let search = unsafe { &mut *(param as *mut Search) };
    let mut pid = 0;
    unsafe { GetWindowThreadProcessId(window, &mut pid) };
    if search.pids.contains(&pid) && unsafe { IsWindowVisible(window) } != 0
        && unsafe { GetWindow(window, 4) }.is_null() {
        let mut rect = Rect::default();
        if unsafe { GetClientRect(window, &mut rect) } != 0 {
            let area = i64::from((rect.right - rect.left).max(0)) * i64::from((rect.bottom - rect.top).max(0));
            if area > 0 && search.best.is_none_or(|(previous, _)| area > previous) {
                search.best = Some((area, window as usize));
            }
        }
    }
    1
}

pub fn find_window_by_process(name: &str) -> Result<usize, String> {
    let expected = process_name(name)?;
    let snapshot = unsafe { CreateToolhelp32Snapshot(2, 0) };
    if snapshot as isize == -1 { return Err(format!("无法读取进程列表，Windows 错误码：{}", unsafe { GetLastError() })); }
    let mut entry: ProcessEntry = unsafe { std::mem::zeroed() };
    entry.size = std::mem::size_of::<ProcessEntry>() as u32;
    let mut pids = HashSet::new();
    let mut available = unsafe { Process32FirstW(snapshot, &mut entry) };
    while available != 0 {
        let end = entry.name.iter().position(|ch| *ch == 0).unwrap_or(entry.name.len());
        if process_name(&String::from_utf16_lossy(&entry.name[..end])).ok().as_ref() == Some(&expected) {
            pids.insert(entry.pid);
        }
        available = unsafe { Process32NextW(snapshot, &mut entry) };
    }
    let error = unsafe { GetLastError() };
    unsafe { CloseHandle(snapshot) };
    if error != 18 { return Err(format!("读取进程列表失败，Windows 错误码：{error}")); }
    if pids.is_empty() { return Err(format!("未找到进程“{}”，请确认游戏已经启动及进程名是否正确", name.trim())); }
    let mut search = Search { pids, best: None };
    unsafe { SetLastError(0) };
    if unsafe { EnumWindows(window_candidate, (&mut search as *mut Search) as isize) } == 0 {
        return Err(format!("枚举窗口失败，Windows 错误码：{}", unsafe { GetLastError() }));
    }
    search.best.map(|(_, hwnd)| hwnd).ok_or_else(|| format!("已找到进程“{}”，但未找到可绑定的主窗口；请等待游戏窗口打开后重试", name.trim()))
}

fn elevated() -> Result<bool, String> {
    let mut token = std::ptr::null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), 8, &mut token) } == 0 { return Err("无法读取当前管理员权限状态".into()); }
    let mut value = 0u32;
    let mut returned = 0;
    let result = unsafe { GetTokenInformation(token, 20, (&mut value as *mut u32).cast(), 4, &mut returned) };
    unsafe { CloseHandle(token) };
    if result == 0 { Err("无法读取当前管理员权限状态".into()) } else { Ok(value != 0) }
}

// Quote an individual Windows command-line argument, preserving quotes and trailing slashes.
fn quote_arg(arg: &OsStr) -> Vec<u16> {
    let mut output = vec![34];
    let mut slashes = 0;
    for ch in arg.encode_wide() {
        if ch == 92 { slashes += 1; continue; }
        output.extend(std::iter::repeat_n(92, if ch == 34 { slashes * 2 + 1 } else { slashes }));
        output.push(ch);
        slashes = 0;
    }
    output.extend(std::iter::repeat_n(92, slashes * 2));
    output.push(34);
    output
}

/// Returns true only after successfully starting the elevated replacement.
/// Declining either our explanation or Windows UAC leaves this process running.
pub fn request_window_binding_elevation() -> Result<bool, String> {
    if elevated()? { return Ok(false); }
    const MARKER: &str = "--roco-elevation-attempted";
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    if args.iter().any(|arg| arg == MARKER) { return Ok(false); }
    let reason = wide("获取并绑定游戏窗口需要管理员权限。是否以管理员权限启动？\n\n选择“否”，或在后续 Windows 权限提示中选择“否”，仍会以普通权限运行。");
    let title = wide("Roco Datacal — 获取并绑定窗口");
    if unsafe { MessageBoxW(std::ptr::null_mut(), reason.as_ptr(), title.as_ptr(), 0x24) } != 6 { return Ok(false); }
    let exe = wide(std::env::current_exe().map_err(|error| error.to_string())?);
    let directory = wide(std::env::current_dir().map_err(|error| error.to_string())?);
    let mut parameters = Vec::new();
    for arg in args.iter().map(OsString::as_os_str).chain(Some(OsStr::new(MARKER))) {
        if !parameters.is_empty() { parameters.push(32); }
        parameters.extend(quote_arg(arg));
    }
    parameters.push(0);
    let verb = wide("runas");
    let result = unsafe { ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), exe.as_ptr(), parameters.as_ptr(), directory.as_ptr(), 1) };
    if result > 32 { Ok(true) }
    else if unsafe { GetLastError() } == 1223 { Ok(false) }
    else { Err(format!("请求管理员权限失败（错误码 {result}），将继续以普通权限运行")) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names_and_arguments() {
        assert_eq!(process_name(" NRC-Win64-Shipping.exe ").unwrap(), "nrc-win64-shipping");
        assert!(process_name(" ").is_err());
        assert!(process_name("C:\\game.exe").is_err());
        for (arg, expected) in [("", "\"\""), ("a b", "\"a b\""), ("a\\", "\"a\\\\\""), ("a\"b", "\"a\\\"b\"")] {
            assert_eq!(String::from_utf16(&quote_arg(OsStr::new(arg))).unwrap(), expected);
        }
    }
}
