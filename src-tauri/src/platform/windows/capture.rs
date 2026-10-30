#[cfg(windows)]
use std::{ffi::c_void, sync::{Mutex, OnceLock}, time::{Duration, Instant}};
#[cfg(windows)]
use crate::log_recognition_timing;
#[cfg(windows)]
use super::ffi::*;

#[cfg(windows)]
use windows::{
    core::{factory, Interface},
    Foundation::TypedEventHandler,
    Graphics::{
        Capture::{Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession},
        DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
    },
    Win32::{
        Foundation::{HMODULE, HWND},
        Graphics::{
            Direct3D::{D3D_DRIVER_TYPE, D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP},
            Direct3D11::{
                D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
                D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ,
                D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC,
                D3D11_USAGE_STAGING,
            },
            Dxgi::IDXGIDevice,
        },
        System::WinRT::{
            Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess},
            Graphics::Capture::IGraphicsCaptureItemInterop,
        },
    },
};

#[cfg(windows)]
struct CaptureGeometry {
    origin: WinPoint,
    width: i32,
    height: i32,
    window_bounds: WinRect,
    extended_bounds: Option<WinRect>,
}

#[cfg(windows)]
pub(crate) struct CapturedClientRegions {
    pub(crate) regions: Vec<Vec<u8>>,
    has_content: bool,
    readback_time: Duration,
    pixel_and_bmp_time: Duration,
}

#[cfg(windows)]
struct WgcCaptureSession {
    hwnd: usize,
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    pool: Direct3D11CaptureFramePool,
    session: GraphicsCaptureSession,
    token: i64,
    frame_receiver: std::sync::mpsc::Receiver<Direct3D11CaptureFrame>,
    staging: Option<ID3D11Texture2D>,
}

#[cfg(windows)]
static WGC_CAPTURE_SESSION: OnceLock<Mutex<Option<WgcCaptureSession>>> = OnceLock::new();

#[cfg(windows)]
fn read_capture_geometry(hwnd: *mut c_void) -> Result<CaptureGeometry, String> {
    const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2: isize = -4;
    const DWMWA_EXTENDED_FRAME_BOUNDS: u32 = 9;
    let previous_dpi_context = unsafe {
        SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 as *mut c_void)
    };
    let result = (|| {
        let mut client = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
        let mut origin = WinPoint { x: 0, y: 0 };
        let mut window_bounds = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
        if unsafe { GetClientRect(hwnd, &mut client) } == 0
            || unsafe { ClientToScreen(hwnd, &mut origin) } == 0
            || unsafe { GetWindowRect(hwnd, &mut window_bounds) } == 0
        {
            return Err("Cannot read target client geometry".to_string());
        }
        let width = client.right - client.left;
        let height = client.bottom - client.top;
        if width <= 0 || height <= 0 {
            return Err("Target client area is empty".to_string());
        }
        let mut extended_bounds = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
        let extended_bounds = (unsafe {
            DwmGetWindowAttribute(
                hwnd,
                DWMWA_EXTENDED_FRAME_BOUNDS,
                (&mut extended_bounds as *mut WinRect).cast(),
                std::mem::size_of::<WinRect>() as u32,
            )
        } >= 0)
            .then_some(extended_bounds);
        Ok(CaptureGeometry { origin, width, height, window_bounds, extended_bounds })
    })();
    if !previous_dpi_context.is_null() {
        unsafe { SetThreadDpiAwarenessContext(previous_dpi_context) };
    }
    result
}

#[cfg(windows)]
fn create_d3d11_capture_device(
    driver_type: D3D_DRIVER_TYPE,
) -> Result<(ID3D11Device, ID3D11DeviceContext), String> {
    let mut device = None;
    let mut context = None;
    unsafe {
        D3D11CreateDevice(
            None,
            driver_type,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
    }
    .map_err(|error| format!("Cannot create D3D11 capture device: {error}"))?;
    Ok((
        device.ok_or_else(|| "D3D11 capture device is unavailable".to_string())?,
        context.ok_or_else(|| "D3D11 capture context is unavailable".to_string())?,
    ))
}

#[cfg(windows)]
fn select_client_crop(
    geometry: &CaptureGeometry,
    frame_width: u32,
    frame_height: u32,
) -> Result<(u32, u32), String> {
    let client_width = geometry.width as u32;
    let client_height = geometry.height as u32;
    if frame_width == client_width && frame_height == client_height {
        return Ok((0, 0));
    }

    let mut best: Option<(i64, u32, u32)> = None;
    for bounds in [geometry.extended_bounds, Some(geometry.window_bounds)]
        .into_iter()
        .flatten()
    {
        let x = geometry.origin.x - bounds.left;
        let y = geometry.origin.y - bounds.top;
        if x < 0 || y < 0 {
            continue;
        }
        let x = x as u32;
        let y = y as u32;
        if x.saturating_add(client_width) > frame_width
            || y.saturating_add(client_height) > frame_height
        {
            continue;
        }
        let bounds_width = (bounds.right - bounds.left).max(0) as i64;
        let bounds_height = (bounds.bottom - bounds.top).max(0) as i64;
        let score = (frame_width as i64 - bounds_width).abs()
            + (frame_height as i64 - bounds_height).abs();
        if best.map(|current| score < current.0).unwrap_or(true) {
            best = Some((score, x, y));
        }
    }
    if let Some((_, x, y)) = best {
        return Ok((x, y));
    }

    if frame_width >= client_width
        && frame_height >= client_height
        && frame_width - client_width <= 2
        && frame_height - client_height <= 2
    {
        return Ok(((frame_width - client_width) / 2, (frame_height - client_height) / 2));
    }
    Err(format!(
        "Windows Graphics Capture frame {frame_width}x{frame_height} does not contain target client area {client_width}x{client_height}"
    ))
}

#[cfg(windows)]
fn create_wgc_capture_session(hwnd_value: usize) -> Result<WgcCaptureSession, String> {
    let (device, context) = create_d3d11_capture_device(D3D_DRIVER_TYPE_HARDWARE)
        .or_else(|_| create_d3d11_capture_device(D3D_DRIVER_TYPE_WARP))?;
    let dxgi_device: IDXGIDevice = device
        .cast()
        .map_err(|error| format!("Cannot access D3D11 DXGI device: {error}"))?;
    let inspectable = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi_device) }
        .map_err(|error| format!("Cannot create WinRT D3D11 device: {error}"))?;
    let winrt_device: IDirect3DDevice = inspectable
        .cast()
        .map_err(|error| format!("Cannot access WinRT D3D11 device: {error}"))?;
    let interop: IGraphicsCaptureItemInterop = factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
        .map_err(|error| format!("Cannot create WGC window interop: {error}"))?;
    let hwnd = hwnd_value as *mut c_void;
    let item: GraphicsCaptureItem = unsafe { interop.CreateForWindow(HWND(hwnd)) }
        .map_err(|error| format!("Cannot create WGC target item: {error}"))?;
    let item_size = item.Size().map_err(|error| format!("Cannot read WGC target size: {error}"))?;
    let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
        &winrt_device,
        DirectXPixelFormat::B8G8R8A8UIntNormalized,
        2,
        item_size,
    )
    .map_err(|error| format!("Cannot create WGC frame pool: {error}"))?;
    let session = pool
        .CreateCaptureSession(&item)
        .map_err(|error| format!("Cannot create WGC capture session: {error}"))?;
    let _ = session.SetIsCursorCaptureEnabled(false);
    let _ = session.SetIsBorderRequired(false);
    let (frame_sender, frame_receiver) = std::sync::mpsc::sync_channel(3);
    let handler = TypedEventHandler::<Direct3D11CaptureFramePool, windows::core::IInspectable>::new(
        move |sender, _| {
            if let Some(pool) = sender.as_ref() {
                if let Ok(frame) = pool.TryGetNextFrame() {
                    let _ = frame_sender.try_send(frame);
                }
            }
            Ok(())
        },
    );
    let token = pool
        .FrameArrived(&handler)
        .map_err(|error| format!("Cannot subscribe to WGC frames: {error}"))?;
    session
        .StartCapture()
        .map_err(|error| format!("Cannot start WGC capture: {error}"))?;
    Ok(WgcCaptureSession { hwnd: hwnd_value, device, context, pool, session, token, frame_receiver, staging: None })
}

#[cfg(windows)]
fn copy_wgc_frame_regions(
    frame: &Direct3D11CaptureFrame,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    staging_cache: &mut Option<ID3D11Texture2D>,
    hwnd: *mut c_void,
    regions: &[(i32, i32, i32, i32)],
) -> Result<CapturedClientRegions, String> {
    let content_size = frame.ContentSize().map_err(|error| format!("Cannot read WGC frame size: {error}"))?;
    if content_size.Width <= 0 || content_size.Height <= 0 {
        return Err("Windows Graphics Capture returned an empty frame".to_string());
    }
    let surface = frame.Surface().map_err(|error| format!("Cannot read WGC frame surface: {error}"))?;
    let access: IDirect3DDxgiInterfaceAccess = surface
        .cast()
        .map_err(|error| format!("Cannot access WGC DXGI surface: {error}"))?;
    let texture: ID3D11Texture2D = unsafe { access.GetInterface() }
        .map_err(|error| format!("Cannot access WGC D3D11 texture: {error}"))?;
    let mut texture_desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { texture.GetDesc(&mut texture_desc) };
    let frame_width = (content_size.Width as u32).min(texture_desc.Width);
    let frame_height = (content_size.Height as u32).min(texture_desc.Height);
    let geometry = read_capture_geometry(hwnd)?;
    let (crop_x, crop_y) = select_client_crop(&geometry, frame_width, frame_height)?;

    let mut staging_desc = texture_desc;
    staging_desc.Usage = D3D11_USAGE_STAGING;
    staging_desc.BindFlags = 0;
    staging_desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
    staging_desc.MiscFlags = 0;
    let staging_matches = staging_cache.as_ref().is_some_and(|staging| {
        let mut cached_desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { staging.GetDesc(&mut cached_desc) };
        cached_desc.Width == staging_desc.Width
            && cached_desc.Height == staging_desc.Height
            && cached_desc.Format == staging_desc.Format
    });
    if !staging_matches {
        let mut staging = None;
        unsafe { device.CreateTexture2D(&staging_desc, None, Some(&mut staging)) }
            .map_err(|error| format!("Cannot create WGC staging texture: {error}"))?;
        *staging_cache = Some(staging.ok_or_else(|| "WGC staging texture is unavailable".to_string())?);
    }
    let staging = staging_cache.as_ref().unwrap();
    let readback_started = Instant::now();
    unsafe { context.CopyResource(staging, &texture) };

    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe { context.Map(staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)) }
        .map_err(|error| format!("Cannot map WGC frame for OCR: {error}"))?;
    let readback_time = readback_started.elapsed();
    let pixel_and_bmp_started = Instant::now();
    let source_len = mapped.RowPitch as usize * texture_desc.Height as usize;
    let source = unsafe { std::slice::from_raw_parts(mapped.pData.cast::<u8>(), source_len) };
    let mut has_content = false;
    let frame_width_u = frame_width as usize;
    let frame_height_u = frame_height as usize;
    let mut region_bitmaps: Vec<Vec<u8>> = Vec::with_capacity(regions.len());
    for region in regions {
        let region_left = (region.0 - geometry.origin.x).max(0) as usize;
        let region_top = (region.1 - geometry.origin.y).max(0) as usize;
        let region_left = region_left.min(frame_width_u.saturating_sub(1));
        let region_top = region_top.min(frame_height_u.saturating_sub(1));
        let region_width = (region.2 as usize).clamp(1, frame_width_u - region_left);
        let region_height = (region.3 as usize).clamp(1, frame_height_u - region_top);
        let bmp_stride = (region_width * 3 + 3) & !3;
        let mut pixels = vec![0u8; bmp_stride * region_height];
        for output_y in 0..region_height {
            let source_y = crop_y as usize + region_top + (region_height - 1 - output_y);
            let source_row = source_y * mapped.RowPitch as usize + (crop_x as usize + region_left) * 4;
            let output_row = output_y * bmp_stride;
            for x in 0..region_width {
                let source_pixel = source_row + x * 4;
                let output_pixel = output_row + x * 3;
                let b = source[source_pixel];
                let g = source[source_pixel + 1];
                let r = source[source_pixel + 2];
                pixels[output_pixel] = b;
                pixels[output_pixel + 1] = g;
                pixels[output_pixel + 2] = r;
                has_content |= b != 0 || g != 0 || r != 0;
            }
        }
        let file_size = 14usize + 40 + pixels.len();
        let file_size_u32 = u32::try_from(file_size).map_err(|_| "WGC screenshot is too large".to_string())?;
        let image_size_u32 = u32::try_from(pixels.len()).map_err(|_| "WGC screenshot is too large".to_string())?;
        let mut bmp = Vec::with_capacity(file_size);
        bmp.extend_from_slice(b"BM");
        bmp.extend_from_slice(&file_size_u32.to_le_bytes());
        bmp.extend_from_slice(&[0; 4]);
        bmp.extend_from_slice(&(54u32).to_le_bytes());
        bmp.extend_from_slice(&40u32.to_le_bytes());
        bmp.extend_from_slice(&(region_width as i32).to_le_bytes());
        bmp.extend_from_slice(&(region_height as i32).to_le_bytes());
        bmp.extend_from_slice(&1u16.to_le_bytes());
        bmp.extend_from_slice(&24u16.to_le_bytes());
        bmp.extend_from_slice(&0u32.to_le_bytes());
        bmp.extend_from_slice(&image_size_u32.to_le_bytes());
        bmp.extend_from_slice(&[0; 16]);
        bmp.extend_from_slice(&pixels);
        region_bitmaps.push(bmp);
    }
    unsafe { context.Unmap(staging, 0) };
    Ok(CapturedClientRegions {
        regions: region_bitmaps,
        has_content,
        readback_time,
        pixel_and_bmp_time: pixel_and_bmp_started.elapsed(),
    })
}

#[cfg(windows)]
fn capture_cached_wgc_regions(
    app: &tauri::AppHandle,
    cached: &mut WgcCaptureSession,
    regions: &[(i32, i32, i32, i32)],
) -> Result<CapturedClientRegions, String> {
    let started = Instant::now();
    let mut frame_wait_time = Duration::ZERO;
    let mut readback_time = Duration::ZERO;
    let mut pixel_and_bmp_time = Duration::ZERO;
    // Frames already in the channel were produced before this recognition request.
    // Close them before waiting so this capture is based on a post-trigger frame.
    let mut stale_frames_discarded = 0usize;
    while let Ok(frame) = cached.frame_receiver.try_recv() {
        let _ = frame.Close();
        stale_frames_discarded += 1;
    }
    let deadline = Instant::now() + Duration::from_secs(2);
    for _ in 0..4 {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() { break; }
        let wait_started = Instant::now();
        let frame = cached.frame_receiver.recv_timeout(remaining)
            .map_err(|_| "Timed out waiting for a Windows Graphics Capture frame".to_string())?;
        frame_wait_time += wait_started.elapsed();
        let captured = copy_wgc_frame_regions(&frame, &cached.device, &cached.context, &mut cached.staging, cached.hwnd as *mut c_void, regions);
        let _ = frame.Close();
        let captured = captured?;
        readback_time += captured.readback_time;
        pixel_and_bmp_time += captured.pixel_and_bmp_time;
        if captured.has_content {
            log_recognition_timing(app, &format!("WGC fresh-frame capture: queued frames discarded {}; frame wait {:.1} ms; GPU readback {:.1} ms; ROI pixel + BMP {:.1} ms; total {:.1} ms", stale_frames_discarded, frame_wait_time.as_secs_f64() * 1000.0, readback_time.as_secs_f64() * 1000.0, pixel_and_bmp_time.as_secs_f64() * 1000.0, started.elapsed().as_secs_f64() * 1000.0));
            return Ok(captured);
        }
    }
    Err("Windows Graphics Capture returned only blank frames".to_string())
}

#[cfg(windows)]
pub(crate) fn capture_window_client_regions(
    app: &tauri::AppHandle,
    hwnd_value: usize,
    region_rects: &[(i32, i32, i32, i32)],
) -> Result<CapturedClientRegions, String> {
    let cache = WGC_CAPTURE_SESSION.get_or_init(|| Mutex::new(None));
    let mut cache = cache.lock().map_err(|error| error.to_string())?;
    if let Some(cached) = cache.as_mut().filter(|capture| capture.hwnd == hwnd_value) {
        let cached_started = Instant::now();
        let result = capture_cached_wgc_regions(app, cached, region_rects);
        log_recognition_timing(app, &format!("WGC cached session capture total: {:.1} ms", cached_started.elapsed().as_secs_f64() * 1000.0));
        return result;
    }
    if let Some(previous) = cache.take() {
        let _ = previous.pool.RemoveFrameArrived(previous.token);
        let _ = previous.session.Close();
        let _ = previous.pool.Close();
    }
    let setup_started = Instant::now();
    if !GraphicsCaptureSession::IsSupported()
        .map_err(|error| format!("Cannot query Windows Graphics Capture support: {error}"))?
    {
        return Err("Windows Graphics Capture is not supported on this Windows version".to_string());
    }
    let session = create_wgc_capture_session(hwnd_value)?;
    *cache = Some(session);
    log_recognition_timing(
        app,
        &format!("WGC persistent session initialized: {:.1} ms", setup_started.elapsed().as_secs_f64() * 1000.0),
    );
    capture_cached_wgc_regions(app, cache.as_mut().unwrap(), region_rects)
}

