//! Decide whether a shortcut belongs to the foreground window, without reserving keys.
use super::ffi::GetAncestor;
use std::collections::HashSet;
use std::ffi::c_void;

pub(crate) fn foreground_in_scope(foreground: usize, overlay: usize, target: Option<usize>) -> bool {
    if foreground == 0 { return false; }
    let root = |window: usize, flag| {
        let ancestor = unsafe { GetAncestor(window as *mut c_void, flag) } as usize;
        if ancestor == 0 { window } else { ancestor }
    };
    let foreground_root = root(foreground, 2); // GA_ROOT: include child controls.
    if overlay != 0 && foreground_root == root(overlay, 2) { return true; }
    target.is_some_and(|target| target != 0 && {
        let target_root = root(target, 2);
        foreground_root == target_root || root(foreground, 3) == target_root // Owned game popups.
    })
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum KeyRoute { Pass, Consume, Trigger }

#[derive(Default)]
pub(crate) struct ShortcutKeys { pressed: HashSet<u32> }

impl ShortcutKeys {
    pub(crate) fn route(&mut self, key: u32, down: bool, in_scope: bool, matches: bool) -> KeyRoute {
        if !down {
            return if self.pressed.remove(&key) && in_scope { KeyRoute::Consume } else { KeyRoute::Pass };
        }
        if !in_scope {
            self.pressed.remove(&key);
            return KeyRoute::Pass;
        }
        if self.pressed.contains(&key) { return KeyRoute::Consume; }
        if !matches { return KeyRoute::Pass; }
        self.pressed.insert(key);
        KeyRoute::Trigger
    }
}
