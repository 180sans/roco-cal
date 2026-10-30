//! Battle-only Python transport; application path adapters remain in lib.rs.
use crate::battle_commands::{self, ExecutionMode};
use crate::{app_data_dir, log_recognition_timing, resource_root};
use super::process::{build_python_command, PipeMode};
use serde::Deserialize;
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

#[derive(Debug, Deserialize)]
struct PythonEnvelope {
    ok: bool,
    data: Option<Value>,
    error: Option<String>,
    timing: Option<Value>,
}

struct PersistentPythonWorker {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

static PERSISTENT_PYTHON_WORKER: OnceLock<Mutex<Option<PersistentPythonWorker>>> = OnceLock::new();

fn prepare_python_command(
    app: &tauri::AppHandle,
    args: &[&str],
    pipes: PipeMode,
) -> Result<(Command, PathBuf, PathBuf, PathBuf), String> {
    let root = resource_root(app)?;
    let script = root.join("desktop_api.py");
    let python = embedded_python(app)?;
    let user_data_dir = app_data_dir(app);
    std::fs::create_dir_all(&user_data_dir)
        .map_err(|error| format!("Cannot create app data dir: {error}"))?;
    let command = build_python_command(&python, &root, &user_data_dir, args, pipes);
    Ok((command, python, root, script))
}

fn run_python(app: tauri::AppHandle, args: &[&str]) -> Result<Value, String> {
    run_python_with_input(app, args, None)
}

fn run_python_with_input(
    app: tauri::AppHandle,
    args: &[&str],
    input: Option<&str>,
) -> Result<Value, String> {
    battle_commands::validate(args.first().copied().unwrap_or(""))?;
    let command_started = std::time::Instant::now();
    let (mut command, python, root, script) = prepare_python_command(
        &app, args, PipeMode::SingleShot { input: input.is_some() },
    )?;
    let mut child = command.spawn().map_err(|error| {
        format!(
            "Cannot start embedded Python: {error}. executable={}, cwd={}, script={}",
            python.display(),
            root.display(),
            script.display()
        )
    })?;
    if let Some(input) = input {
        child
            .stdin
            .as_mut()
            .ok_or_else(|| "Cannot open embedded Python input pipe".to_string())?
            .write_all(input.as_bytes())
            .map_err(|error| format!("Cannot send payload to embedded Python: {error}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| format!("Cannot collect embedded Python output: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let envelope: PythonEnvelope = serde_json::from_str(stdout.trim()).map_err(|error| {
        format!(
            "Python 返回内容不是有效 JSON: {error}\nstdout: {}\nstderr: {}",
            stdout.trim(),
            stderr.trim()
        )
    })?;

    let command_name = args.first().copied().unwrap_or("python");
    if battle_commands::execution(command_name)? == ExecutionMode::Persistent {
        log_recognition_timing(
            &app,
            &format!(
                "{} python process round-trip: {:.1} ms",
                command_name,
                command_started.elapsed().as_secs_f64() * 1000.0
            ),
        );
        if let Some(timing) = envelope.timing.as_ref() {
            log_recognition_timing(
                &app,
                &format!(
                    "{} python internal timing: {}",
                    command_name,
                    timing
                ),
            );
        }
    }

    if !output.status.success() || !envelope.ok {
        return Err(envelope.error.unwrap_or_else(|| stderr.trim().to_string()));
    }

    envelope
        .data
        .ok_or_else(|| "Python 返回缺少 data 字段".to_string())
}

fn embedded_python(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let local_runtime = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("python");
    let mut candidates = vec![
        local_runtime.join("pythonw.exe"),
        local_runtime.join("python.exe"),
    ];

    if let Ok(resource_dir) = app.path().resource_dir() {
        let runtime = resource_dir.join("python");
        candidates.push(runtime.join("pythonw.exe"));
        candidates.push(runtime.join("python.exe"));
    }

    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| {
            "Embedded Python runtime is missing. Rebuild the application so its Python resources are included."
                .to_string()
        })
}

fn start_persistent_python_worker(app: &tauri::AppHandle) -> Result<PersistentPythonWorker, String> {
    let (mut command, python, root, script) = prepare_python_command(
        app, &["persistent-worker"], PipeMode::Persistent,
    )?;
    let mut child = command.spawn().map_err(|error| {
        format!(
            "Cannot start persistent embedded Python: {error}. executable={}, cwd={}, script={}",
            python.display(), root.display(), script.display()
        )
    })?;
    let stdin = child.stdin.take().ok_or("Cannot open Python worker stdin")?;
    let stdout = child.stdout.take().ok_or("Cannot open Python worker stdout")?;
    Ok(PersistentPythonWorker { child, stdin, stdout: BufReader::new(stdout) })
}

fn persistent_python_payload(app: &tauri::AppHandle, command: &str, payload: &Value) -> Result<Value, String> {
    let started = std::time::Instant::now();
    let request = serde_json::json!({ "command": command, "payload": payload });
    let request = serde_json::to_vec(&request)
        .map_err(|error| format!("Cannot serialize persistent Python request: {error}"))?;
    let worker_lock = PERSISTENT_PYTHON_WORKER.get_or_init(|| Mutex::new(None));
    let mut guard = worker_lock.lock().map_err(|error| error.to_string())?;
    let mut last_error = String::new();

    for attempt in 0..2 {
        if guard.is_none() {
            *guard = Some(start_persistent_python_worker(app)?);
        }
        let worker = guard.as_mut().expect("worker initialized");
        let result = (|| -> Result<PythonEnvelope, String> {
            worker.stdin.write_all(&request).map_err(|error| format!("Cannot send request to Python worker: {error}"))?;
            worker.stdin.write_all(b"\n").map_err(|error| format!("Cannot delimit Python worker request: {error}"))?;
            worker.stdin.flush().map_err(|error| format!("Cannot flush Python worker request: {error}"))?;
            let mut response = String::new();
            let bytes = worker.stdout.read_line(&mut response).map_err(|error| format!("Cannot read Python worker response: {error}"))?;
            if bytes == 0 {
                return Err("Persistent Python worker exited without a response".to_string());
            }
            serde_json::from_str(response.trim()).map_err(|error| format!("Python worker returned invalid JSON: {error}; response={}", response.trim()))
        })();
        match result {
            Ok(envelope) => {
                log_recognition_timing(
                    app,
                    &format!("{command} persistent Python round-trip: {:.1} ms; attempt {}", started.elapsed().as_secs_f64() * 1000.0, attempt + 1),
                );
                if let Some(timing) = envelope.timing.as_ref() {
                    log_recognition_timing(app, &format!("{command} python internal timing: {timing}"));
                }
                if !envelope.ok {
                    return Err(envelope.error.unwrap_or_else(|| "Persistent Python request failed".to_string()));
                }
                return envelope.data.ok_or_else(|| "Python worker response is missing data".to_string());
            }
            Err(error) => {
                last_error = error;
                if let Some(mut dead_worker) = guard.take() {
                    let _ = dead_worker.child.kill();
                    let _ = dead_worker.child.wait();
                }
                if attempt == 1 {
                    break;
                }
            }
        }
    }
    Err(last_error)
}

pub(crate) fn stop_persistent_python_worker() {
    let Some(worker_lock) = PERSISTENT_PYTHON_WORKER.get() else { return; };
    if let Ok(mut guard) = worker_lock.lock() {
        if let Some(mut worker) = guard.take() {
            let _ = worker.child.kill();
            let _ = worker.child.wait();
        }
    }
}

pub(crate) async fn run_python_async(app: tauri::AppHandle, args: Vec<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_python(app, &arg_refs)
    })
    .await
    .map_err(|error| format!("Python task failed: {error}"))?
}

pub(crate) async fn run_python_payload_async(
    app: tauri::AppHandle,
    command: &str,
    payload: Value,
) -> Result<Value, String> {
    battle_commands::validate(command)?;
    let payload_text = serde_json::to_string(&payload)
        .map_err(|error| format!("Cannot serialize payload: {error}"))?;
    let command = command.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        if battle_commands::execution(&command)? == ExecutionMode::Persistent {
            let payload: Value = serde_json::from_str(&payload_text)
                .map_err(|error| format!("Cannot decode serialized Python payload: {error}"))?;
            persistent_python_payload(&app, &command, &payload)
        } else {
            run_python_with_input(
                app,
                &[command.as_str(), "--payload-stdin"],
                Some(&payload_text),
            )
        }
    })
    .await
    .map_err(|error| format!("Python task failed: {error}"))?
}
