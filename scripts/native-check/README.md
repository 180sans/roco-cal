# Native migration checks

This harness compiles the same data and inference modules as the desktop app,
without compiling or launching Tauri or the frontend.

```powershell
cargo build --manifest-path scripts/native-check/Cargo.toml --target-dir .cargo-check-native
python -B scripts/test_native_migration.py
python -B scripts/test_native_migration.py --real
```

The comparison script needs a **development** Python with NumPy, OpenCV, Pillow
and ONNX Runtime. These packages are no longer bundled with the application.
`--real` reads the bundled database and writes only to a temporary directory.
The default run uses synthetic data plus saved OCR debug crops when available.

`npm run prepare:python` prepares a standard-library-only Python runtime for
core battle calculations and a separate native ONNX Runtime. The production
Python CLI accepts only core calculations and the core diagnostic command.
Legacy helpers in `desktop_api.py` are retained as parity-test references;
the desktop routes their former commands directly to Rust.

Preserved behavior includes preset/group order, configuration merging, team
code matching and warnings, numeric cleanup, image normalization, classifier
top-six results, numeric model reloads and concurrent health recognition.
