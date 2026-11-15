pub(crate) mod overlay;
#[cfg(windows)]
pub(crate) mod window_restore;
#[cfg(windows)]
mod shortcut_scope;
#[cfg(windows)]
pub(crate) mod visibility_input;
pub(crate) mod capture;
#[cfg(windows)]
pub(crate) mod ffi;
