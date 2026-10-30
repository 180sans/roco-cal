//! The Python process boundary is reserved for battle rules and their probe.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExecutionMode { SingleShot, Persistent }

pub const COMMANDS: &[(&str, ExecutionMode)] = &[
    ("core-probe", ExecutionMode::SingleShot),
    ("trait-info", ExecutionMode::SingleShot),
    ("calculate-battle", ExecutionMode::SingleShot),
    ("calculate-quick-skills", ExecutionMode::SingleShot),
    ("calculate-quick-skills-batch", ExecutionMode::Persistent),
    ("trait-power-candidates", ExecutionMode::Persistent),
    ("calculate-enemy-attack-skills", ExecutionMode::SingleShot),
    ("calculate-watch-advantages", ExecutionMode::SingleShot),
    ("calculate-willpower", ExecutionMode::SingleShot),
    ("calculate-required-power", ExecutionMode::SingleShot),
];

pub fn execution(command: &str) -> Result<ExecutionMode, String> {
    COMMANDS.iter().find(|(name, _)| *name == command)
        .map(|(_, mode)| *mode)
        .ok_or_else(|| format!("Non-battle commands must use Rust: {command}"))
}

pub fn validate(command: &str) -> Result<(), String> {
    execution(command).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_existing_battle_commands() {
        for (command, mode) in COMMANDS {
            assert!(validate(command).is_ok(), "{command}");
            assert_eq!(execution(command), Ok(*mode));
        }
    }

    #[test]
    fn rejects_data_inference_and_unknown_commands() {
        for command in [
            "", "app-state", "list-pets", "list-skills", "list-traits",
            "save-preset", "manage-preset", "import-team-code", "save-picker-config",
            "recognize-images", "classify-image-samples", "ocr-worker",
            "persistent-worker", "unknown",
        ] {
            assert!(validate(command).is_err(), "{command}");
        }
    }
}
