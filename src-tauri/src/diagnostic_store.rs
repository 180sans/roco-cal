//! Four fixed log files, serialized across processes before checking size or rotating.
use std::{fs, io::{self, Write}, path::{Path, PathBuf}, time::{Duration, Instant}};

pub(super) const MAX_FILE_BYTES: u64 = 1024 * 1024;
pub(super) const MAX_RECORD_BYTES: usize = 32 * 1024;

struct DirectoryLock { _file: fs::File }

impl DirectoryLock {
    fn acquire(directory: &Path) -> io::Result<Self> {
        let started = Instant::now();
        loop {
            let mut options = fs::OpenOptions::new();
            options.create(true).read(true).write(true).truncate(false);
            #[cfg(windows)] {
                use std::os::windows::fs::OpenOptionsExt;
                // Windows releases this exclusive handle even if the process crashes.
                options.share_mode(0);
            }
            let attempt = options.open(directory.join("plugin.lock")).and_then(|file| {
                #[cfg(unix)] {
                    use std::os::fd::AsRawFd;
                    unsafe extern "C" { fn flock(fd: i32, operation: i32) -> i32; }
                    if unsafe { flock(file.as_raw_fd(), 2 | 4) } != 0 { return Err(io::Error::last_os_error()); }
                }
                Ok(Self { _file: file })
            });
            match attempt {
                Ok(lock) => return Ok(lock),
                Err(error) => {
                    let busy = matches!(error.kind(), io::ErrorKind::WouldBlock)
                        || cfg!(windows) && error.raw_os_error() == Some(32);
                    if !busy || started.elapsed() >= Duration::from_millis(500) { return Err(error); }
                    std::thread::sleep(Duration::from_millis(5));
                }
            }
        }
    }
}

fn is_legacy_log(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else { return false; };
    let Some(name) = name.strip_prefix("plugin-") else { return false; };
    let Some((pid, suffix)) = name.split_once(".jsonl") else { return false; };
    !pid.is_empty() && pid.bytes().all(|byte| byte.is_ascii_digit())
        && (suffix.is_empty() || matches!(suffix, ".1" | ".2" | ".3"))
}

pub(super) struct Store { path: PathBuf }

impl Store {
    pub(super) fn new(directory: &Path) -> io::Result<Self> {
        fs::create_dir_all(directory)?;
        let _lock = DirectoryLock::acquire(directory)?;
        // Migrate only logs produced by the previous per-PID naming scheme.
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            if is_legacy_log(&entry.path()) && entry.file_type()?.is_file() { fs::remove_file(entry.path())?; }
        }
        let store = Self { path: directory.join("plugin.jsonl") };
        for n in 0..=3 {
            let path = if n == 0 { store.path.clone() } else { store.backup(n) };
            if fs::metadata(&path).map(|metadata| metadata.len() > MAX_FILE_BYTES).unwrap_or(false) {
                fs::remove_file(path)?;
            }
        }
        Ok(store)
    }

    fn backup(&self, n: u32) -> PathBuf { self.path.with_extension(format!("jsonl.{n}")) }

    pub(super) fn append(&self, record: &[u8]) -> io::Result<()> {
        if record.len() > MAX_RECORD_BYTES { return Ok(()); }
        let directory = self.path.parent().ok_or_else(|| io::Error::other("Invalid log directory"))?;
        let _lock = DirectoryLock::acquire(directory)?;
        let size = fs::metadata(&self.path).map(|metadata| metadata.len()).unwrap_or(0);
        if size + record.len() as u64 > MAX_FILE_BYTES {
            if self.backup(3).exists() { fs::remove_file(self.backup(3))?; }
            for n in (1..3).rev() {
                if self.backup(n).exists() { fs::rename(self.backup(n), self.backup(n + 1))?; }
            }
            fs::rename(&self.path, self.backup(1))?;
        }
        let mut file = fs::OpenOptions::new().create(true).append(true).open(&self.path)?;
        file.write_all(record)?;
        file.flush()
    }
}
