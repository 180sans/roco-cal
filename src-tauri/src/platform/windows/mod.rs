pub(crate) mod overlay;
#[cfg(windows)]
pub(crate) mod window_restore;
#[cfg(windows)]
mod shortcut_scope;
pub(crate) mod capture;
#[cfg(windows)]
pub(crate) mod ffi;
