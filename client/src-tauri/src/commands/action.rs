use enigo::{
    Axis, Button, Coordinate,
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Mouse, Settings,
};
use serde_json::json;
use std::thread;
use std::time::Duration;
use tauri::{command, AppHandle, Emitter, Runtime};

#[command]
pub fn click<R: Runtime>(handle: AppHandle<R>, button: &str, x: f64, y: f64) -> Result<(), String> {
    log::info!("agent: clicking at {}, {}", x, y);
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;

    // Move to position
    enigo
        .move_mouse(x as i32, y as i32, Coordinate::Abs)
        .map_err(|e| format!("Failed to move mouse: {}", e))?;

    // Determine which button to click
    let button_type = match button.to_lowercase().as_str() {
        "left" => Button::Left,
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => return Err(format!("Unsupported mouse button: {}", button)),
    };

    // Perform click
    enigo
        .button(button_type, Click)
        .map_err(|e| format!("Failed to click: {}", e))?;
    handle
        .emit("agent_click", json!({ "x": x, "y": y }))
        .map_err(|e| format!("Failed to emit click event: {}", e))?;

    Ok(())
}

#[command]
pub fn scroll<R: Runtime>(
    handle: AppHandle<R>,
    x: f64,
    y: f64,
    scroll_x: i32,
    scroll_y: i32,
) -> Result<(), String> {
    log::info!("agent: scrolling at {}, {}", x, y);
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;

    // Move to position first
    enigo
        .move_mouse(x as i32, y as i32, Coordinate::Abs)
        .map_err(|e| format!("Failed to move mouse: {}", e))?;

    // Perform scroll
    if scroll_x != 0 {
        enigo
            .scroll(scroll_x, Axis::Horizontal)
            .map_err(|e| format!("Failed to scroll: {}", e))?;
    }

    if scroll_y != 0 {
        enigo
            .scroll(scroll_y, Axis::Vertical)
            .map_err(|e| format!("Failed to scroll: {}", e))?;
    }

    handle
        .emit(
            "agent_scroll",
            json!({ "x": x, "y": y, "scroll_x": scroll_x, "scroll_y": scroll_y }),
        )
        .map_err(|e| format!("Failed to emit scroll event: {}", e))?;

    Ok(())
}

#[command]
pub fn double_click<R: Runtime>(handle: AppHandle<R>, x: f64, y: f64) -> Result<(), String> {
    log::info!("agent: double clicking at {}, {}", x, y);
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;

    // Move to position
    enigo
        .move_mouse(x as i32, y as i32, Coordinate::Abs)
        .map_err(|e| format!("Failed to move mouse: {}", e))?;

    // Perform double click
    enigo
        .button(Button::Left, Click)
        .map_err(|e| format!("Failed to click: {}", e))?;
    thread::sleep(Duration::from_millis(10)); // Small delay between clicks
    enigo
        .button(Button::Left, Click)
        .map_err(|e| format!("Failed to click: {}", e))?;
    handle
        .emit("agent_double_click", json!({ "x": x, "y": y }))
        .map_err(|e| format!("Failed to emit double click event: {}", e))?;
    Ok(())
}

#[command]
pub fn keypress<R: Runtime>(handle: AppHandle<R>, keys: Vec<String>) -> Result<(), String> {
    log::info!("agent: keypressing {}", keys.join(" "));
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;

    for key_str in keys.clone() {
        let key = parse_key(&key_str)?;
        enigo
            .key(key, Click)
            .map_err(|e| format!("Failed to keypress: {}", e))?;
    }

    handle
        .emit("agent_keypress", json!({ "keys": keys }))
        .map_err(|e| format!("Failed to emit keypress event: {}", e))?;

    Ok(())
}

#[command]
pub fn type_text<R: Runtime>(handle: AppHandle<R>, text: String) -> Result<(), String> {
    log::info!("agent: typing text {}", text);
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;

    enigo
        .text(&text)
        .map_err(|e| format!("Failed to type text: {}", e))?;

    handle
        .emit("agent_type_text", json!({ "text": text }))
        .map_err(|e| format!("Failed to emit type text event: {}", e))?;

    Ok(())
}

#[command]
pub fn wait<R: Runtime>(handle: AppHandle<R>, ms: u64) -> Result<(), String> {
    log::info!("agent: waiting for {}ms", ms);
    thread::sleep(Duration::from_millis(ms));
    handle
        .emit("agent_wait", json!({ "ms": ms }))
        .map_err(|e| format!("Failed to emit wait event: {}", e))?;
    Ok(())
}

#[command]
pub fn move_mouse<R: Runtime>(handle: AppHandle<R>, x: f64, y: f64) -> Result<(), String> {
    log::info!("agent: moving mouse to {}, {}", x, y);
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;

    enigo
        .move_mouse(x as i32, y as i32, Coordinate::Abs)
        .map_err(|e| format!("Failed to move mouse: {}", e))?;

    handle
        .emit("agent_move_mouse", json!({ "x": x, "y": y }))
        .map_err(|e| format!("Failed to emit move mouse event: {}", e))?;

    Ok(())
}

#[command]
pub fn drag<R: Runtime>(handle: AppHandle<R>, path: Vec<(f64, f64)>) -> Result<(), String> {
    log::info!("agent: dragging path {:?}", path);
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;

    // Move to the starting position
    let (start_x, start_y) = path[0];
    enigo
        .move_mouse(start_x as i32, start_y as i32, Coordinate::Abs)
        .map_err(|e| format!("Failed to move mouse: {}", e))?;

    // Press the mouse button
    enigo
        .button(Button::Left, Press)
        .map_err(|e| format!("Failed to press mouse button: {}", e))?;

    // Move through each point in the path
    for (x, y) in path.iter().skip(1) {
        enigo
            .move_mouse(*x as i32, *y as i32, Coordinate::Abs)
            .map_err(|e| format!("Failed to move mouse: {}", e))?;
        thread::sleep(Duration::from_millis(5)); // Small delay for smoother dragging
    }

    // Release the mouse button
    enigo
        .button(Button::Left, Release)
        .map_err(|e| format!("Failed to release mouse button: {}", e))?;

    handle
        .emit("agent_drag", json!({ "path": path }))
        .map_err(|e| format!("Failed to emit drag event: {}", e))?;

    Ok(())
}

// Helper function to parse key strings into Key enum
fn parse_key(key_str: &str) -> Result<Key, String> {
    match key_str.to_lowercase().as_str() {
        "alt" => Ok(Key::Alt),
        "backspace" => Ok(Key::Backspace),
        "capslock" => Ok(Key::CapsLock),
        "control" | "ctrl" => Ok(Key::Control),
        "delete" => Ok(Key::Delete),
        "downarrow" | "down" => Ok(Key::DownArrow),
        "end" => Ok(Key::End),
        "escape" | "esc" => Ok(Key::Escape),
        "f1" => Ok(Key::F1),
        "f2" => Ok(Key::F2),
        "f3" => Ok(Key::F3),
        "f4" => Ok(Key::F4),
        "f5" => Ok(Key::F5),
        "f6" => Ok(Key::F6),
        "f7" => Ok(Key::F7),
        "f8" => Ok(Key::F8),
        "f9" => Ok(Key::F9),
        "f10" => Ok(Key::F10),
        "f11" => Ok(Key::F11),
        "f12" => Ok(Key::F12),
        "home" => Ok(Key::Home),
        "leftarrow" | "left" => Ok(Key::LeftArrow),
        "meta" | "command" | "windows" | "cmd" | "win" => Ok(Key::Meta),
        "option" => Ok(Key::Option),
        "pagedown" | "pgdn" => Ok(Key::PageDown),
        "pageup" | "pgup" => Ok(Key::PageUp),
        "return" | "enter" => Ok(Key::Return),
        "rightarrow" | "right" => Ok(Key::RightArrow),
        "shift" => Ok(Key::Shift),
        "space" => Ok(Key::Space),
        "tab" => Ok(Key::Tab),
        "uparrow" | "up" => Ok(Key::UpArrow),
        _ if key_str.len() == 1 => {
            // For single characters, use Unicode
            let c = key_str.chars().next().unwrap();
            Ok(Key::Unicode(c))
        }
        _ => Err(format!("Unsupported key: {}", key_str)),
    }
}
