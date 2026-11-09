//! Save the native state before attachment and restore exactly those properties.
use super::ffi::*;
use std::ffi::c_void;

const GWL_STYLE: i32 = -16;
const GWL_EXSTYLE: i32 = -20;
const GWLP_HWNDPARENT: i32 = -8;
const DWM_ATTRIBUTES: [u32; 4] = [2, 3, 33, 34];

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) struct NativeWindowSnapshot {
    style: isize,
    exstyle: isize,
    owner: usize,
    placement: WinWindowPlacement,
    title: [u16; 512],
    dwm: [Option<u32>; 4],
}

fn set_window_long(hwnd: *mut c_void, index: i32, value: isize) -> Result<(), String> {
    unsafe {
        SetLastError(0);
        let previous = SetWindowLongPtrW(hwnd, index, value);
        let error = GetLastError();
        if previous == 0 && error != 0 {
            return Err(format!("SetWindowLongPtrW({index}): Win32 {error}"));
        }
    }
    Ok(())
}

fn verify_window_long(hwnd: *mut c_void, index: i32, value: isize) -> Result<(), String> {
    let actual = unsafe { GetWindowLongPtrW(hwnd, index) };
    if actual != value {
        return Err(format!("Window property {index} did not retain the requested value: requested={value:#x}, actual={actual:#x}, difference={:#x}", actual ^ value));
    }
    Ok(())
}

pub(crate) fn write_window_long(hwnd: *mut c_void, index: i32, value: isize) -> Result<(), String> {
    set_window_long(hwnd, index, value)?;
    verify_window_long(hwnd, index, value)
}

impl NativeWindowSnapshot {
    pub(crate) fn capture(hwnd: *mut c_void) -> Result<Self, String> {
        let mut placement = WinWindowPlacement {
            length: std::mem::size_of::<WinWindowPlacement>() as u32,
            ..Default::default()
        };
        if unsafe { GetWindowPlacement(hwnd, &mut placement) } == 0 {
            return Err(format!("Cannot save window placement: Win32 {}", unsafe { GetLastError() }));
        }
        let mut title = [0; 512];
        unsafe { GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32) };
        // Policy/transition attributes are write-only on some Windows versions.
        // Restore their documented normal defaults if a read is unsupported.
        let mut dwm = [Some(0), Some(0), None, None];
        for (index, attribute) in DWM_ATTRIBUTES.iter().enumerate() {
            let mut value = 0u32;
            if unsafe { DwmGetWindowAttribute(hwnd, *attribute, (&mut value as *mut u32).cast(), 4) } >= 0 {
                dwm[index] = Some(value);
            }
        }
        Ok(Self {
            style: unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) },
            exstyle: unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) },
            owner: unsafe { GetWindowLongPtrW(hwnd, GWLP_HWNDPARENT) } as usize,
            placement, title, dwm,
        })
    }

    /// Attempt every restoration even if an earlier operation fails.
    pub(crate) fn restore(self, hwnd: *mut c_void) -> Result<(), String> {
        let mut errors = Vec::new();
        let owner = if self.owner != 0 && unsafe { IsWindow(self.owner as *mut c_void) } != 0 { self.owner } else { 0 };
        for (index, value) in [(GWLP_HWNDPARENT, owner as isize), (GWL_STYLE, self.style), (GWL_EXSTYLE, self.exstyle)] {
            // WS_EX_TOPMOST is restored by SetWindowPos below, not SetWindowLongPtrW.
            // Check the complete extended style only after both operations finish.
            let result = if index == GWL_EXSTYLE {
                set_window_long(hwnd, index, value)
            } else {
                write_window_long(hwnd, index, value)
            };
            if let Err(error) = result { errors.push(error); }
        }
        if unsafe { SetWindowTextW(hwnd, self.title.as_ptr()) } == 0 {
            errors.push(format!("Cannot restore window title: Win32 {}", unsafe { GetLastError() }));
        }
        for (index, attribute) in DWM_ATTRIBUTES.iter().enumerate() {
            if let Some(value) = self.dwm[index] {
                let result = unsafe { DwmSetWindowAttribute(hwnd, *attribute, (&value as *const u32).cast(), 4) };
                if result < 0 { errors.push(format!("DwmSetWindowAttribute({attribute}): HRESULT {result:#x}")); }
            }
        }
        let mut placement = self.placement;
        // Attachment can hide or move the overlay off-screen; detach must reveal it.
        if matches!(placement.show_cmd, 0 | 2 | 6 | 7 | 11) {
            placement.show_cmd = 1;
        }
        if unsafe { SetWindowPlacement(hwnd, &placement) } == 0 {
            errors.push(format!("Cannot restore window placement: Win32 {}", unsafe { GetLastError() }));
        }
        // Preserve the original topmost setting rather than retaining a fullscreen or popup Z band.
        const WS_EX_TOPMOST: isize = 0x0000_0008;
        const HWND_TOPMOST: isize = -1;
        const HWND_NOTOPMOST: isize = -2;
        let insert_after = (if self.exstyle & WS_EX_TOPMOST != 0 { HWND_TOPMOST } else { HWND_NOTOPMOST }) as *mut c_void;
        if unsafe { SetWindowPos(hwnd, insert_after, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0020 | 0x0040 | 0x0200) } == 0 {
            errors.push(format!("Cannot refresh restored window frame: Win32 {}", unsafe { GetLastError() }));
        }
        if let Err(error) = verify_window_long(hwnd, GWL_EXSTYLE, self.exstyle) { errors.push(error); }
        if errors.is_empty() { Ok(()) } else { Err(errors.join("; ")) }
    }
}
