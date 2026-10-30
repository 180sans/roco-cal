//! Common process configuration; lifecycle and protocol stay in python.rs.
use std::path::Path;
use std::process::{Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Clone, Copy)]
pub(super) enum PipeMode {
    SingleShot { input: bool },
    Persistent,
}

pub(super) fn build_python_command(
    python: &Path,
    root: &Path,
    user_data_dir: &Path,
    args: &[&str],
    pipes: PipeMode,
) -> Command {
    let mut command = Command::new(python);
    command
        .arg("-B")
        .arg(root.join("desktop_api.py"))
        .args(args)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("ROCODATABASE_USER_DATA_DIR", user_data_dir)
        .current_dir(root)
        .stdout(Stdio::piped());
    match pipes {
        PipeMode::SingleShot { input } => {
            command.stderr(Stdio::piped());
            if input { command.stdin(Stdio::piped()); }
        }
        PipeMode::Persistent => {
            command.stdin(Stdio::piped()).stderr(Stdio::null());
        }
    }
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    command
}
