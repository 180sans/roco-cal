//! Shared shortcut definitions and validation. Window registration stays in the host.
use serde_json::Value;
use std::collections::HashSet;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Shortcut {
    pub id: String,
    pub label: String,
    pub chord: String,
    pub event: String,
    pub requires_target: bool,
    pub modifiers: u32,
    pub virtual_key: u32,
    pub registration_id: i32,
}

pub fn resolve(bindings: &Value) -> Result<Vec<Shortcut>, String> {
    let definitions: Value =
        serde_json::from_str(include_str!("../../../src/shared/pluginShortcuts.json"))
            .map_err(|error| error.to_string())?;
    let definitions = definitions.as_array().ok_or("快捷键定义无效")?;
    let bindings = bindings.as_object().ok_or("快捷键配置必须是对象")?;
    for id in bindings.keys() {
        if !definitions
            .iter()
            .any(|item| item["id"].as_str() == Some(id))
        {
            return Err(format!("未知快捷键：{id}"));
        }
    }
    let mut used = HashSet::new();
    let mut shortcuts = Vec::new();
    for (index, item) in definitions.iter().enumerate() {
        let id = item["id"].as_str().ok_or("缺少快捷键标识")?;
        let label = item["label"].as_str().ok_or("缺少快捷键名称")?;
        let chord = bindings
            .get(id)
            .unwrap_or(&item["shortcut"])
            .as_str()
            .ok_or_else(|| format!("{label}：无效快捷键"))?;
        if chord.is_empty() {
            continue;
        }
        let (modifiers, virtual_key) =
            parse_chord(chord).map_err(|error| format!("{label}：{error}"))?;
        if !used.insert((modifiers, virtual_key)) {
            return Err(format!("{label}：快捷键重复 {chord}"));
        }
        shortcuts.push(Shortcut {
            id: id.into(),
            label: label.into(),
            chord: chord.into(),
            event: item["event"].as_str().unwrap_or_default().into(),
            requires_target: item["requiresTarget"].as_bool().unwrap_or(true),
            modifiers,
            virtual_key,
            registration_id: 0x5300 + index as i32,
        });
    }
    Ok(shortcuts)
}

pub fn parse_chord(chord: &str) -> Result<(u32, u32), String> {
    let parts: Vec<_> = chord.split('+').collect();
    let (key, modifiers) = parts.split_last().ok_or("无效快捷键")?;
    let modifiers = match modifiers.join("+").as_str() {
        "" => 0,
        "Ctrl" => 2,
        "Alt" => 1,
        "Shift" => 4,
        "Ctrl+Shift" => 6,
        "Ctrl+Alt" => 3,
        "Alt+Shift" => 5,
        "Ctrl+Alt+Shift" => 7,
        _ => return Err("无效组合键".into()),
    };
    let virtual_key = if key.len() == 1
        && key.as_bytes()[0].is_ascii_alphanumeric()
        && key.to_ascii_uppercase() == *key
    {
        if modifiers & 3 == 0 {
            return Err("字母和数字必须搭配 Ctrl 或 Alt".into());
        }
        key.as_bytes()[0] as u32
    } else if let Some(number) = key
        .strip_prefix('F')
        .and_then(|number| number.parse::<u32>().ok())
    {
        if !(1..=24).contains(&number) || *key != format!("F{number}") {
            return Err("无效主键".into());
        }
        if number == 11 {
            return Err("F11 已用于全屏".into());
        }
        if number == 12 {
            return Err("F12 为系统保留键".into());
        }
        0x70 + number - 1
    } else {
        return Err("无效主键".into());
    };
    Ok((modifiers, virtual_key))
}

/// Apply on the registering thread, restoring the last working set on conflict.
pub fn replace<R, U>(
    current: &mut Vec<Shortcut>,
    next: Vec<Shortcut>,
    mut register: R,
    mut unregister: U,
) -> Result<(), String>
where
    R: FnMut(&Shortcut) -> bool,
    U: FnMut(&Shortcut),
{
    if *current == next {
        return Ok(());
    }
    for shortcut in current.iter() {
        unregister(shortcut);
    }
    let mut registered = Vec::new();
    for shortcut in &next {
        if !register(shortcut) {
            for shortcut in &registered {
                unregister(shortcut);
            }
            let mut failed_restore = Vec::new();
            for previous in current.iter() {
                if !register(previous) {
                    failed_restore.push(previous.label.clone());
                }
            }
            let suffix = if failed_restore.is_empty() {
                String::new()
            } else {
                format!("；恢复失败：{}", failed_restore.join("、"))
            };
            return Err(format!(
                "{}（{}）已被占用，无法注册{suffix}",
                shortcut.label, shortcut.chord
            ));
        }
        registered.push(shortcut.clone());
    }
    *current = next;
    Ok(())
}
