//! Non-battle desktop capabilities shared by the calculator and replay app.
//! This crate never starts Python; battle rules remain in the battle engine.
pub mod desktop_data;
pub mod external_icons;
pub mod plugin_shortcuts;
pub mod inference;

mod encoding;
pub use encoding::{base64_encode, decode_base64};

#[cfg(windows)]
mod user_paths;
#[cfg(windows)]
pub use user_paths::{profile_dir_from_current_token, roaming_app_data_dir};
