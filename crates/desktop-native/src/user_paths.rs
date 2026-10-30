//! Shared Windows profile lookups; application IDs and fallback order stay in each app.
use std::ffi::{c_void, OsString};
use std::os::windows::ffi::OsStringExt;
use std::path::PathBuf;

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
pub fn profile_dir_from_current_token() -> Result<PathBuf, String> {
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
pub fn roaming_app_data_dir() -> Option<PathBuf> {
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
