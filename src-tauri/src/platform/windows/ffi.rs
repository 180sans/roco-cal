use std::ffi::c_void;

#[cfg(windows)]
#[derive(Clone, Copy)]
#[repr(C)]
pub(crate) struct WinPoint {
    pub(crate) x: i32,
    pub(crate) y: i32,
}

#[cfg(windows)]
#[derive(Clone, Copy)]
#[repr(C)]
pub(crate) struct WinRect {
    pub(crate) left: i32,
    pub(crate) top: i32,
    pub(crate) right: i32,
    pub(crate) bottom: i32,
}

#[cfg(windows)]
#[repr(C)]
pub(crate) struct WinMessage {
    pub(crate) hwnd: *mut c_void,
    pub(crate) message: u32,
    pub(crate) w_param: usize,
    pub(crate) l_param: isize,
    pub(crate) time: u32,
    pub(crate) point: WinPoint,
}

#[cfg(windows)]
#[repr(C)]
pub(crate) struct KeyboardLowLevelHook {
    pub(crate) vk_code: u32,
    pub(crate) scan_code: u32,
    pub(crate) flags: u32,
    pub(crate) time: u32,
    pub(crate) extra_info: usize,
}

#[cfg(windows)]
#[link(name = "user32")]
unsafe extern "system" {
    pub(crate) fn IsWindow(hwnd: *mut c_void) -> i32;
    pub(crate) fn IsWindowVisible(hwnd: *mut c_void) -> i32;
    pub(crate) fn IsIconic(hwnd: *mut c_void) -> i32;
    pub(crate) fn GetWindowLongPtrW(hwnd: *mut c_void, index: i32) -> isize;
    pub(crate) fn SetWindowLongPtrW(hwnd: *mut c_void, index: i32, value: isize) -> isize;
    pub(crate) fn SetThreadDpiAwarenessContext(context: *mut c_void) -> *mut c_void;
    pub(crate) fn GetWindowRect(hwnd: *mut c_void, rect: *mut WinRect) -> i32;
    pub(crate) fn GetClientRect(hwnd: *mut c_void, rect: *mut WinRect) -> i32;
    pub(crate) fn ClientToScreen(hwnd: *mut c_void, point: *mut WinPoint) -> i32;
    pub(crate) fn SetWindowTextW(hwnd: *mut c_void, text: *const u16) -> i32;
    pub(crate) fn SetWindowPos(
        hwnd: *mut c_void,
        insert_after: *mut c_void,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
        flags: u32,
    ) -> i32;
    pub(crate) fn ShowWindow(hwnd: *mut c_void, command: i32) -> i32;
    pub(crate) fn RegisterHotKey(hwnd: *mut c_void, id: i32, modifiers: u32, virtual_key: u32) -> i32;
    pub(crate) fn UnregisterHotKey(hwnd: *mut c_void, id: i32) -> i32;
    pub(crate) fn GetMessageW(message: *mut WinMessage, hwnd: *mut c_void, minimum: u32, maximum: u32) -> i32;
    pub(crate) fn PeekMessageW(message: *mut WinMessage, hwnd: *mut c_void, minimum: u32, maximum: u32, remove: u32) -> i32;
    pub(crate) fn GetAsyncKeyState(virtual_key: i32) -> i16;
    pub(crate) fn SetWindowsHookExW(
        hook_id: i32,
        proc: Option<unsafe extern "system" fn(i32, usize, isize) -> isize>,
        instance: *mut c_void,
        thread_id: u32,
    ) -> *mut c_void;
    pub(crate) fn CallNextHookEx(hook: *mut c_void, code: i32, w_param: usize, l_param: isize) -> isize;
    pub(crate) fn UnhookWindowsHookEx(hook: *mut c_void) -> i32;
}

#[cfg(windows)]
#[link(name = "dwmapi")]
unsafe extern "system" {
    pub(crate) fn DwmSetWindowAttribute(hwnd: *mut c_void, attribute: u32, value: *const c_void, size: u32) -> i32;
    pub(crate) fn DwmGetWindowAttribute(hwnd: *mut c_void, attribute: u32, value: *mut c_void, size: u32) -> i32;
}

