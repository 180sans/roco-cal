//! Crawled icons are user files, independent of the installation directory.
use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const ICON_GROUPS: [&str; 4] = ["pet", "skill", "element", "skill_type"];

fn png_files(directory: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("{}: {error}", directory.display())),
    };
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry.file_type().map_err(|error| error.to_string())?.is_file()
            && entry.path().extension().is_some_and(|extension| extension.eq_ignore_ascii_case("png"))
        {
            files.push(entry.path());
        }
    }
    files.sort();
    Ok(files)
}

/// Ensure the external folders exist without importing or modifying icons.
pub fn prepare_external_icons(user_data: &Path) -> Result<PathBuf, String> {
    let root = user_data.join("icons");
    for group in ICON_GROUPS {
        fs::create_dir_all(root.join(group)).map_err(|error| format!("{}: {error}", root.display()))?;
    }
    Ok(root)
}

/// Paths only: WebView loads images on demand rather than transferring all PNGs through IPC.
pub fn external_icon_files(root: &Path) -> Result<BTreeMap<String, BTreeMap<String, String>>, String> {
    ICON_GROUPS.into_iter().map(|group| {
        let icons = png_files(&root.join(group))?.into_iter().map(|path| {
            let name = path.file_stem().and_then(|name| name.to_str()).ok_or("Invalid icon filename")?.to_owned();
            Ok((name, path.to_string_lossy().into_owned()))
        }).collect::<Result<_, String>>()?;
        Ok((group.to_owned(), icons))
    }).collect()
}
