//! A small headless harness: checks migrated modules without building Tauri/UI.
#[path = "../../src-tauri/src/desktop_data.rs"]
mod desktop_data;
#[path = "../../src-tauri/src/inference.rs"]
mod inference;
use base64::Engine;
use serde_json::{json, Value};
use std::io::{BufRead, Write};
fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(input)
        .map_err(|e| e.to_string())
}
fn main() {
    fn assert_send_sync<T: Send + Sync>() {}
    assert_send_sync::<inference::Inference>();
    assert_send_sync::<desktop_data::DesktopData>();
    let args: Vec<_> = std::env::args_os().collect();
    let root = std::path::PathBuf::from(&args[1]);
    let user = std::path::PathBuf::from(&args[2]);
    let mut data = desktop_data::DesktopData::new(root.clone(), user);
    let engine = inference::Inference::new(root.parent().unwrap().to_path_buf());
    for line in std::io::stdin().lock().lines() {
        let line = line.unwrap();
        let request: Value = serde_json::from_str(&line).unwrap();
        let p = &request["payload"];
        let start = std::time::Instant::now();
        let result = match request["command"].as_str().unwrap() {
            "recognize-images" => engine.recognize(&p["images"]),
            "classify-image-samples" => engine.classify(p),
            "normalize-health" => Ok(json!(inference::normalize_health(
                p["text"].as_str().unwrap()
            ))),
            "parallel-inference" => std::thread::scope(|scope| {
                let first = scope.spawn(|| engine.recognize(&p["first"]));
                let second = scope.spawn(|| engine.recognize(&p["second"]));
                let sprites = scope.spawn(|| engine.classify(&p["sprites"]));
                Ok(
                    json!({"first":first.join().unwrap()?,"second":second.join().unwrap()?,"sprites":sprites.join().unwrap()?}),
                )
            }),
            "number-tensor" | "classifier-tensor" => {
                let bytes = decode_base64(
                    p["imageDataUrl"]
                        .as_str()
                        .unwrap()
                        .split_once(',')
                        .unwrap()
                        .1,
                )
                .unwrap();
                let image = image::load_from_memory(&bytes).unwrap();
                if request["command"] == "number-tensor" {
                    let w = p["width"].as_u64().unwrap() as usize;
                    Ok(json!(inference::number_tensor(&image.to_rgb8(), w, 48)))
                } else {
                    Ok(json!(inference::classifier_tensor(&image.to_rgba8())))
                }
            }
            command => data.dispatch(command, p),
        };
        let elapsed = start.elapsed().as_secs_f64() * 1000.0;
        let response = match result {
            Ok(data) => json!({"ok":true,"data":data,"elapsedMs":elapsed}),
            Err(error) => json!({"ok":false,"error":error,"elapsedMs":elapsed}),
        };
        println!("{response}");
        std::io::stdout().flush().unwrap();
    }
}
