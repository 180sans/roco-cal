# Shared native desktop services

Both the calculator and the independent replay application depend on this crate.
There is one implementation of each non-battle data and inference capability.
This crate does not start Python and has no dependency on either application's UI.

- `desktop_data`: data queries, presets, team codes and configuration persistence.
- `inference`: numeric OCR and sprite classification using native ONNX Runtime.
- `encoding` (re-exported at the crate root): the original `base64_encode` and
  `decode_base64` implementations shared by inference, capture and file commands.
- `user_paths` (Windows, re-exported at the crate root): the original token-profile
  and roaming-folder lookups. Application IDs, resource roots and fallback order
  stay in each application adapter; user-data directories remain independent.

Python is reserved for battle calculations, trait runtime and the battle-engine
probe. Its command boundary is checked by `src-tauri/src/battle_commands.rs`.
The battle engine may read its required datasets internally; it does not expose
non-battle queries, persistence, OCR or classifier commands.

Applications inject their own resource and user-data paths. Replay keeps
`com.sans.rocoreplay`; the calculator keeps its existing application identity.
Replay's tolerant configuration reads remain in its adapter, while both apps
share the same one-level section merge and configuration writer.

Native inference resources contain ONNX Runtime and both `vcruntime140*.dll`
dependencies. Replay packages the default configuration, native runtime and
models, without a Python interpreter or Python application sources.
`scripts/prepare-inference-runtime.ps1` prepares these resources; the replay
link script uses it for the selected source resource directory.

Checks without building either application:

```powershell
cargo test --manifest-path crates/desktop-native/Cargo.toml --target-dir .cargo-check-native
cargo build --manifest-path scripts/native-check/Cargo.toml --target-dir .cargo-check-native
python -B scripts/test_native_migration.py
python -B scripts/test_backend_boundary.py
node scripts/test-native-tools.mjs
```

The data regression suite uses fixed results captured before deleting the old
Python implementations, rather than retaining a second implementation in tests.
Development-only image checks use NumPy, OpenCV and Pillow; production does not.
