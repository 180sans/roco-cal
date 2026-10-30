//! Native ONNX inference shared by the desktop commands; no Python workers.
use image::{RgbImage, RgbaImage};
use ort::{session::Session, value::Tensor};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
static RUNTIME: OnceLock<Result<Vec<libloading::Library>>> = OnceLock::new();
fn initialize(resources: &Path) -> Result<()> {
    RUNTIME
        .get_or_init(|| {
            let dll = resources.join("inference/onnxruntime.dll");
            if !dll.is_file() {
                return Err(format!(
                    "ONNX Runtime is missing: {}. Run scripts/prepare-inference-runtime.ps1.",
                    dll.display()
                ));
            }
            // Native inference ships its own C++ runtime, including in replay
            // installations that do not contain a Python interpreter.
            let mut dependencies = Vec::new();
            #[cfg(windows)]
            for name in ["vcruntime140.dll", "vcruntime140_1.dll"] {
                let path = resources.join("inference").join(name);
                // Keep the handles alive for the lifetime of the ONNX runtime.
                dependencies.push(unsafe { libloading::Library::new(&path) }.map_err(err)?);
            }
            // Small models use one compute thread per session, avoiding a large
            // per-session CPU thread pool while retaining concurrent health requests.
            std::panic::catch_unwind(|| {
                ort::init_from(dll.to_string_lossy())
                    .with_name("rocodatebase")
                    .commit()
                    .map(|_| dependencies)
                    .map_err(err)
            })
            .unwrap_or_else(|_| Err("Cannot load the bundled ONNX Runtime".into()))
        })
        .as_ref()
        .map(|_| ())
        .map_err(Clone::clone)
}
fn session(path: &Path) -> Result<Session> {
    Session::builder()
        .map_err(err)?
        .with_intra_threads(1)
        .map_err(err)?
        .with_inter_threads(1)
        .map_err(err)?
        .commit_from_file(path)
        .map_err(err)
}
#[derive(PartialEq, Eq)]
struct Stamp(u64, std::time::SystemTime, u64, std::time::SystemTime);
fn stamp(model: &Path, metadata: &Path) -> Result<Stamp> {
    let a = std::fs::metadata(model).map_err(err)?;
    let b = std::fs::metadata(metadata).map_err(err)?;
    Ok(Stamp(
        a.len(),
        a.modified().map_err(err)?,
        b.len(),
        b.modified().map_err(err)?,
    ))
}
struct NumberModel {
    stamp: Stamp,
    session: Session,
    characters: Vec<String>,
}
struct Classifier {
    session: Session,
    classes: Vec<String>,
}
pub struct Inference {
    resources: PathBuf,
    numbers: [Mutex<Option<NumberModel>>; 2],
    next: std::sync::atomic::AtomicUsize,
    classifier: Mutex<Option<Classifier>>,
}
impl Inference {
    pub fn new(resources: PathBuf) -> Self {
        Self {
            resources,
            numbers: std::array::from_fn(|_| Mutex::new(None)),
            next: 0.into(),
            classifier: Mutex::new(None),
        }
    }
    pub fn recognize(&self, images: &Value) -> Result<Value> {
        let images = images.as_array().ok_or("OCR images must be a list")?;
        if images.is_empty() {
            return Ok(json!({"items":[]}));
        }
        if images.len() == 1 {
            return self.recognize_slice(images);
        }
        // Split multi-crop requests over the two existing sessions. Each half
        // stays serial, and merging restores the caller's original crop order.
        std::thread::scope(|scope| {
            let middle = images.len().div_ceil(2);
            let first = scope.spawn(move || self.recognize_slice(&images[..middle]));
            let second = self.recognize_slice(&images[middle..]);
            let first = first.join().map_err(|_| "Numeric OCR task failed")??;
            let second = second?;
            let items: Vec<_> = first["items"]
                .as_array()
                .unwrap()
                .iter()
                .chain(second["items"].as_array().unwrap())
                .cloned()
                .collect();
            Ok(json!({"items":items}))
        })
    }
    fn recognize_slice(&self, images: &[Value]) -> Result<Value> {
        initialize(&self.resources)?;
        let index = self.next.fetch_add(1, std::sync::atomic::Ordering::Relaxed) % 2;
        let mut guard = self.numbers[index].lock().map_err(err)?;
        let dir = std::env::var_os("ROCODATABASE_OCR_NUMBER_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| self.resources.join("ocr-models/number"));
        let model_path = dir.join("model.onnx");
        let charset_path = dir.join("charset.txt");
        let stamp = stamp(&model_path, &charset_path)?;
        if guard.as_ref().is_none_or(|m| m.stamp != stamp) {
            // Do not retain an outdated session after a failed model replacement.
            *guard = None;
            let characters: Vec<_> = std::fs::read_to_string(charset_path)
                .map_err(err)?
                .lines()
                .map(str::to_owned)
                .collect();
            if characters.is_empty() {
                return Err("Numeric OCR model is unavailable".into());
            }
            *guard = Some(NumberModel {
                stamp,
                session: session(&model_path)?,
                characters,
            });
        }
        let model = guard.as_ref().unwrap();
        let mut items = vec![];
        for image in images {
            if !image.is_object() {
                return Err("OCR image entry must be an object".into());
            }
            let mode = image
                .get("mode")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .unwrap_or("number");
            if !["power", "enemy_health", "self_health", "number", "health"].contains(&mode) {
                return Err(format!("Unsupported OCR mode: {mode}"));
            }
            let source = decode(image)?.to_rgb8();
            let dash = dash_only(&source);
            let width = ((source.width() as f64 / source.height().max(1) as f64 * 48.0)
                .round_ties_even() as usize)
                .clamp(48, 320);
            let tensor = number_tensor(&source, width, 48);
            let input =
                Tensor::from_array(([1, 3, 48, width], tensor.into_boxed_slice())).map_err(err)?;
            let prediction = model
                .session
                .run(ort::inputs![input].map_err(err)?)
                .map_err(err)?;
            let (shape, data) = prediction[0].try_extract_raw_tensor::<f32>().map_err(err)?;
            if shape.len() != 3 || shape[0] != 1 || shape[2] < 1 {
                return Err(format!("Invalid numeric OCR output shape: {shape:?}"));
            }
            let classes = shape[2] as usize;
            let mut previous = usize::MAX;
            let mut raw = String::new();
            for scores in data.chunks_exact(classes) {
                let index = argmax(scores);
                if index != 0 && index != previous {
                    if let Some(c) = model.characters.get(index - 1) {
                        raw.push_str(c);
                    }
                }
                previous = index;
            }
            let raw = if raw.trim().is_empty() {
                "-".to_owned()
            } else {
                raw.trim().to_owned()
            };
            let result = if dash
                && raw
                    .chars()
                    .filter(|c| !c.is_whitespace() && *c != '-')
                    .count()
                    <= 1
            {
                "-".into()
            } else {
                clean_number(&raw, mode)
            };
            items.push(json!({"text":result,"rawText":raw}));
        }
        Ok(json!({"items":items}))
    }
    pub fn classify(&self, payload: &Value) -> Result<Value> {
        let runtime_started = std::time::Instant::now();
        initialize(&self.resources)?;
        let runtime_init_ms = runtime_started.elapsed().as_secs_f64() * 1000.0;
        let mut model_init_ms = 0.0;
        let images = payload["images"]
            .as_array()
            .ok_or("Classifier images must be a list")?;
        let lock_started = std::time::Instant::now();
        let mut guard = self.classifier.lock().map_err(err)?;
        let lock_wait_ms = lock_started.elapsed().as_secs_f64() * 1000.0;
        if guard.is_none() {
            let init_started = std::time::Instant::now();
            let dir = self.resources.join("image-classifier");
            let metadata: Value = serde_json::from_slice(
                &std::fs::read(dir.join("legacy_558.onnx.json")).map_err(err)?,
            )
            .map_err(err)?;
            let classes: Vec<String> =
                serde_json::from_value(metadata["class_order"].clone()).map_err(err)?;
            if classes.is_empty() {
                return Err("Classifier classes are empty".into());
            }
            *guard = Some(Classifier {
                session: session(&dir.join("legacy_558.onnx"))?,
                classes,
            });
            model_init_ms = init_started.elapsed().as_secs_f64() * 1000.0;
        }
        let model = guard.as_ref().unwrap();
        let mut items = vec![];
        let (mut decode_ms, mut tensor_ms, mut session_run_ms, mut postprocess_ms) =
            (0.0, 0.0, 0.0, 0.0);
        let mut max_session_run_ms: f64 = 0.0;
        for image in images {
            let stage_started = std::time::Instant::now();
            let source = decode(image)?.to_rgba8();
            decode_ms += stage_started.elapsed().as_secs_f64() * 1000.0;
            let stage_started = std::time::Instant::now();
            let tensor = classifier_tensor(&source);
            let input =
                Tensor::from_array(([1, 3, 86, 76], tensor.into_boxed_slice())).map_err(err)?;
            tensor_ms += stage_started.elapsed().as_secs_f64() * 1000.0;
            let stage_started = std::time::Instant::now();
            let prediction = model
                .session
                .run(ort::inputs!["images"=>input].map_err(err)?)
                .map_err(err)?;
            let run_ms = stage_started.elapsed().as_secs_f64() * 1000.0;
            session_run_ms += run_ms;
            max_session_run_ms = max_session_run_ms.max(run_ms);
            let stage_started = std::time::Instant::now();
            let (_, scores) = prediction["logits"]
                .try_extract_raw_tensor::<f32>()
                .map_err(err)?;
            if scores.len() != model.classes.len() {
                return Err("Classifier output does not match class metadata".into());
            }
            let max = scores[argmax(scores)];
            let probs: Vec<f32> = scores.iter().map(|v| (*v - max).exp()).collect();
            let sum: f32 = probs.iter().sum();
            let mut indices: Vec<_> = (0..scores.len()).collect();
            indices.sort_by(|a, b| probs[*b].total_cmp(&probs[*a]).then(b.cmp(a)));
            let top: Vec<_> = indices
                .iter()
                .take(6)
                .map(|i| json!({"label":model.classes[*i],"confidence":probs[*i]/sum}))
                .collect();
            items.push(
                json!({"label":top[0]["label"],"confidence":top[0]["confidence"],"topK":top}),
            );
            postprocess_ms += stage_started.elapsed().as_secs_f64() * 1000.0;
        }
        Ok(json!({
            "items":items,
            "_timing": {
                "modelInitMs": model_init_ms,
                "runtimeInitMs": runtime_init_ms,
                "classifierLockWaitMs": lock_wait_ms,
                "decodeMs": decode_ms,
                "tensorMs": tensor_ms,
                "sessionRunMs": session_run_ms,
                "maxSessionRunMs": max_session_run_ms,
                "postprocessMs": postprocess_ms,
                "images": images.len(),
            }
        }))
    }
}
fn argmax(scores: &[f32]) -> usize {
    let mut best = 0;
    for i in 1..scores.len() {
        if scores[i] > scores[best] {
            best = i;
        }
    }
    best
}
fn decode(image: &Value) -> Result<image::DynamicImage> {
    let url = image["imageDataUrl"]
        .as_str()
        .ok_or("OCR image must be a data URL")?;
    let (_, encoded) = url.split_once(',').ok_or("OCR image must be a data URL")?;
    image::load_from_memory(&crate::decode_base64(encoded)?).map_err(err)
}
// OpenCV INTER_LINEAR's 8-bit separable interpolation (11-bit coefficients).
// Pixel rounding matters for these small numeric crops.
pub fn resize_linear(source: &RgbImage, width: usize, height: usize) -> Vec<u8> {
    let (sw, sh) = (source.width() as usize, source.height() as usize);
    let mut result = vec![0; width * height * 3];
    let coord = |i: usize, src: usize, dst: usize, clamp: bool| {
        let pos = ((i as f64 + 0.5) * src as f64 / dst as f64 - 0.5) as f32;
        let mut lo = pos.floor() as i64;
        let mut frac = pos - lo as f32;
        if clamp {
            if lo < 0 {
                lo = 0;
                frac = 0.0;
            }
            if lo >= src as i64 - 1 {
                lo = src as i64 - 1;
                frac = 0.0;
            }
        }
        (
            lo,
            ((1.0 - frac) * 2048.0).round_ties_even() as i32,
            (frac * 2048.0).round_ties_even() as i32,
        )
    };
    for y in 0..height {
        let (sy, b0, b1) = coord(y, sh, height, false);
        let y0 = sy.clamp(0, sh as i64 - 1) as usize;
        let y1 = (sy + 1).clamp(0, sh as i64 - 1) as usize;
        for x in 0..width {
            let (sx, a0, a1) = coord(x, sw, width, true);
            let x0 = sx as usize;
            let x1 = (x0 + 1).min(sw - 1);
            for c in 0..3 {
                let top = source.get_pixel(x0 as u32, y0 as u32)[c] as i32 * a0
                    + source.get_pixel(x1 as u32, y0 as u32)[c] as i32 * a1;
                let bottom = source.get_pixel(x0 as u32, y1 as u32)[c] as i32 * a0
                    + source.get_pixel(x1 as u32, y1 as u32)[c] as i32 * a1;
                // OpenCV's specialized uchar vertical kernel shifts each horizontal accumulator.
                result[(y * width + x) * 3 + c] =
                    ((((b0 * (top >> 4)) >> 16) + ((b1 * (bottom >> 4)) >> 16) + 2) >> 2)
                        .clamp(0, 255) as u8;
            }
        }
    }
    result
}
pub fn number_tensor(source: &RgbImage, width: usize, height: usize) -> Vec<f32> {
    let resized = resize_linear(source, width, height);
    let plane = width * height;
    let mut out = vec![0.0; plane * 3];
    for (i, p) in resized.chunks_exact(3).enumerate() {
        for c in 0..3 {
            out[c * plane + i] = (p[c] as f32 / 255.0 - 0.5) / 0.5;
        }
    }
    out
}
pub fn classifier_tensor(source: &RgbaImage) -> Vec<f32> {
    let (sw, sh) = (source.width(), source.height());
    let (mut w, mut h) = (sw, sh);
    if w > 76 || h > 86 {
        // Pillow thumbnail chooses floor/ceil to minimize aspect-ratio error.
        let aspect = sw as f64 / sh as f64;
        let round_aspect = |n: f64, test: &dyn Fn(f64) -> f64| {
            let f = n.floor();
            let c = n.ceil();
            if test(f).abs() <= test(c).abs() {
                f
            } else {
                c
            }
        };
        if 76.0 / 86.0 >= aspect {
            h = 86;
            w = round_aspect(86.0 * aspect, &|n| aspect - n / 86.0).max(1.0) as u32;
        } else {
            w = 76;
            h = round_aspect(76.0 / aspect, &|n| {
                if n == 0.0 {
                    0.0
                } else {
                    aspect - 76.0 / n
                }
            })
            .max(1.0) as u32;
        }
    }
    // Pillow's RGBA resize premultiplies alpha before Lanczos interpolation.
    let resized = if (w, h) == (sw, sh) {
        source.clone()
    } else {
        pillow_lanczos(source, w, h)
    };
    let plane = 76 * 86;
    let mut tensor = vec![0.0; plane * 3];
    let ox = (76 - w) / 2;
    let oy = (86 - h) / 2;
    for (x, y, p) in resized.enumerate_pixels() {
        let i = ((y + oy) * 76 + x + ox) as usize;
        // alpha_composite onto transparent black preserves nonzero-alpha RGB,
        // but leaves fully transparent source pixels black.
        if p[3] > 0 {
            for c in 0..3 {
                tensor[c * plane + i] = p[c] as f32 / 255.0;
            }
        }
    }
    tensor
}
fn pillow_lanczos(source: &RgbaImage, w: u32, h: u32) -> RgbaImage {
    let mut premult = source.clone();
    for p in premult.pixels_mut() {
        for c in 0..3 {
            let v = p[c] as u32 * p[3] as u32 + 128;
            p[c] = (((v >> 8) + v) >> 8) as u8;
        }
    }
    let resize_axis = |input: &RgbaImage, size: u32, horizontal: bool| {
        let (old, cross) = if horizontal {
            (input.width(), input.height())
        } else {
            (input.height(), input.width())
        };
        if old == size {
            return input.clone();
        }
        let scale = old as f64 / size as f64;
        let filter_scale = scale.max(1.0);
        let support = 3.0 * filter_scale;
        let mut out = if horizontal {
            RgbaImage::new(size, cross)
        } else {
            RgbaImage::new(cross, size)
        };
        for i in 0..size {
            let center = (i as f64 + 0.5) * scale;
            let start = ((center - support + 0.5) as i64).max(0) as u32;
            let end = ((center + support + 0.5) as i64).min(old as i64) as u32;
            let weights: Vec<_> = (start..end)
                .map(|j| {
                    let x = (j as f64 - center + 0.5) / filter_scale;
                    if x == 0.0 {
                        1.0
                    } else if !(-3.0..3.0).contains(&x) {
                        0.0
                    } else {
                        let x = x * std::f64::consts::PI;
                        (x.sin() / x) * ((x / 3.0).sin() / (x / 3.0))
                    }
                })
                .collect();
            let sum: f64 = weights.iter().sum();
            let weights: Vec<i32> = weights
                .iter()
                .map(|v| {
                    let n = v / sum * (1 << 22) as f64;
                    if n < 0.0 {
                        (n - 0.5) as i32
                    } else {
                        (n + 0.5) as i32
                    }
                })
                .collect();
            for k in 0..cross {
                let mut p = [0; 4];
                for c in 0..4 {
                    let mut v = 1i64 << 21;
                    for (j, a) in (start..end).zip(&weights) {
                        let q = if horizontal {
                            input.get_pixel(j, k)
                        } else {
                            input.get_pixel(k, j)
                        };
                        v += q[c] as i64 * (*a as i64);
                    }
                    p[c] = (v >> 22).clamp(0, 255) as u8;
                }
                if horizontal {
                    out.put_pixel(i, k, image::Rgba(p));
                } else {
                    out.put_pixel(k, i, image::Rgba(p));
                }
            }
        }
        out
    };
    let tmp = resize_axis(&premult, w, true);
    let mut out = resize_axis(&tmp, h, false);
    for p in out.pixels_mut() {
        if p[3] != 0 && p[3] != 255 {
            for c in 0..3 {
                p[c] = ((255 * p[c] as u32) / p[3] as u32).min(255) as u8;
            }
        }
    }
    out
}
fn clean_number(raw: &str, mode: &str) -> String {
    let allowed = match mode {
        "enemy_health" => "0123456789%",
        "self_health" | "health" => "0123456789/",
        _ => "0123456789",
    };
    let value: String = raw
        .chars()
        .map(|c| match c {
            'Z' | 'z' => '2',
            'O' | 'o' => '0',
            'G' => '6',
            '／' | '\\' => '/',
            _ => c,
        })
        .filter(|c| allowed.contains(*c))
        .collect();
    let value = if ["self_health", "health"].contains(&mode) {
        normalize_health(&value)
    } else {
        value
    };
    if value.trim().is_empty() {
        "-".into()
    } else {
        value
    }
}
fn numeric_le(a: &str, b: &str) -> bool {
    let a = a.trim_start_matches('0');
    let b = b.trim_start_matches('0');
    a.len() < b.len() || (a.len() == b.len() && a <= b)
}
pub fn normalize_health(value: &str) -> String {
    if let Some((a, b)) = value.split_once('/') {
        if !a.is_empty()
            && !b.is_empty()
            && a.bytes().all(|c| c.is_ascii_digit())
            && b.bytes().all(|c| c.is_ascii_digit())
            && numeric_le(a, b)
        {
            return value.into();
        }
        return String::new();
    }
    if !value.bytes().all(|c| c.is_ascii_digit()) {
        return String::new();
    }
    let mut candidates = vec![];
    for (i, c) in value
        .bytes()
        .enumerate()
        .skip(1)
        .take(value.len().saturating_sub(2))
    {
        if c == b'7' && numeric_le(&value[..i], &value[i + 1..]) {
            candidates.push((
                i.abs_diff(value.len() - i - 1),
                (i * 2).abs_diff(value.len()),
                format!("{}/{}", &value[..i], &value[i + 1..]),
            ));
        }
    }
    candidates.sort();
    if candidates.len() == 1
        || (candidates.len() > 1
            && (candidates[0].0, candidates[0].1) != (candidates[1].0, candidates[1].1))
    {
        candidates[0].2.clone()
    } else {
        String::new()
    }
}
pub fn dash_only(source: &RgbImage) -> bool {
    let (w, h) = (source.width() as usize, source.height() as usize);
    let mut foreground = vec![false; w * h];
    for (i, p) in source.pixels().enumerate() {
        foreground[i] =
            ((p[0] as u32 * 19595 + p[1] as u32 * 38470 + p[2] as u32 * 7471 + 32768) >> 16) >= 180;
    }
    let mut seen = vec![false; w * h];
    let mut bars = vec![];
    for start in 0..w * h {
        if seen[start] || !foreground[start] {
            continue;
        }
        let mut stack = vec![start];
        seen[start] = true;
        let (mut count, mut minx, mut maxx, mut miny, mut maxy, mut edge) = (0, w, 0, h, 0, false);
        while let Some(i) = stack.pop() {
            let (x, y) = (i % w, i / w);
            count += 1;
            minx = minx.min(x);
            maxx = maxx.max(x);
            miny = miny.min(y);
            maxy = maxy.max(y);
            edge |= x == 0 || x + 1 == w || y == 0 || y + 1 == h;
            for n in [
                if x > 0 { Some(i - 1) } else { None },
                if x + 1 < w { Some(i + 1) } else { None },
                if y > 0 { Some(i - w) } else { None },
                if y + 1 < h { Some(i + w) } else { None },
            ]
            .into_iter()
            .flatten()
            {
                if !seen[n] && foreground[n] {
                    seen[n] = true;
                    stack.push(n);
                }
            }
        }
        let (bw, bh) = (maxx - minx + 1, maxy - miny + 1);
        if !edge && count >= 20 && bw >= 12 && bh <= 10 && bw as f64 / bh as f64 >= 1.5 {
            bars.push(((minx + maxx) as f64 / 2.0, (miny + maxy) as f64 / 2.0));
        }
    }
    bars.iter().enumerate().any(|(i, a)| {
        bars.iter()
            .skip(i + 1)
            .any(|b| (8.0..=42.0).contains(&(a.0 - b.0).abs()) && (a.1 - b.1).abs() <= 14.0)
    })
}
