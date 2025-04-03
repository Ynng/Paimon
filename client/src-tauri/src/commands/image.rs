use base64::{engine::general_purpose, Engine as _};
use image::{imageops::FilterType, ImageFormat, ImageReader};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tauri::{command, AppHandle, Manager, Runtime};
use tauri_plugin_screenshots::{get_monitor_screenshot, get_screenshotable_monitors};

#[derive(serde::Serialize)]
pub struct ScreenshotResult {
    path: String,
    base64: String,
}

#[command]
pub async fn get_screenshot<R: Runtime>(handle: AppHandle<R>) -> Result<ScreenshotResult, String> {
    let monitors = get_screenshotable_monitors().await?;
    let screenshot_path = get_monitor_screenshot(handle, monitors[0].id).await?;
    let image = ImageReader::open(&screenshot_path).map_err(|e| e.to_string())?;
    let image = image.decode().map_err(|e| e.to_string())?;
    // image size limit for openai api
    let image = image.resize(2000, 768, FilterType::CatmullRom);

    // Create a jpg path with the same name but different extension
    let jpg_path = Path::new(&screenshot_path).with_extension("jpg");

    // Save as jpg with slight compression (quality 85)
    image
        .save_with_format(&jpg_path, ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;

    // Convert PathBuf to String
    let jpg_path_str = jpg_path.to_string_lossy().to_string();

    // Create base64 representation
    let mut buffer = Cursor::new(Vec::new());
    image
        .write_to(&mut buffer, ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;
    let base64_image = general_purpose::STANDARD.encode(buffer.into_inner());

    Ok(ScreenshotResult {
        path: jpg_path_str,
        base64: format!("data:image/jpeg;base64,{}", base64_image),
    })
}
