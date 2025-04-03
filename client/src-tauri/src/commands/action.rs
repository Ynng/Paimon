use enigo::{
    Axis, Button, Coordinate, Direction::{Click, Press, Release}, Enigo, Key, Keyboard, Mouse, Settings
};
use tauri::command;
use std::time::Duration;
use std::thread;

#[command]
pub fn click(button: &str, x: f64, y: f64) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;
    
    // Move to position
    enigo.move_mouse(x as i32, y as i32, Coordinate::Abs).map_err(|e| format!("Failed to move mouse: {}", e))?;
    
    // Determine which button to click
    let button_type = match button.to_lowercase().as_str() {
        "left" => Button::Left,
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => return Err(format!("Unsupported mouse button: {}", button)),
    };
    
    // Perform click
    enigo.button(button_type, Click).map_err(|e| format!("Failed to click: {}", e))?;
    
    Ok(())
}

#[command]
pub fn scroll(x: f64, y: f64, scroll_x: i32, scroll_y: i32) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;
    
    // Move to position first
    enigo.move_mouse(x as i32, y as i32, Coordinate::Abs).map_err(|e| format!("Failed to move mouse: {}", e))?;
    
    // Perform scroll
    if scroll_x != 0 {
        enigo.scroll(scroll_x, Axis::Horizontal).map_err(|e| format!("Failed to scroll: {}", e))?;
    }
    
    if scroll_y != 0 {
        enigo.scroll(scroll_y, Axis::Vertical).map_err(|e| format!("Failed to scroll: {}", e))?;
    }
    
    Ok(())
}

#[command]
pub fn double_click(x: f64, y: f64) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;
    
    // Move to position
    enigo.move_mouse(x as i32, y as i32, Coordinate::Abs).map_err(|e| format!("Failed to move mouse: {}", e))?;
    
    // Perform double click
    enigo.button(Button::Left, Click).map_err(|e| format!("Failed to click: {}", e))?;
    thread::sleep(Duration::from_millis(10)); // Small delay between clicks
    enigo.button(Button::Left, Click).map_err(|e| format!("Failed to click: {}", e))?;
    
    Ok(())
}

#[command]
pub fn keypress(keys: Vec<String>) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;
    
    for key_str in keys {
        let key = parse_key(&key_str)?;
        enigo.key(key, Click).map_err(|e| format!("Failed to keypress: {}", e))?;
    }
    
    Ok(())
}

#[command]
pub fn type_text(text: String) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;
    
    enigo.text(&text).map_err(|e| format!("Failed to type text: {}", e))?;
    
    Ok(())
}

#[command]
pub fn wait(ms: u64) -> Result<(), String> {
    thread::sleep(Duration::from_millis(ms));
    Ok(())
}

#[command]
pub fn move_mouse(x: f64, y: f64) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;
    
    enigo.move_mouse(x as i32, y as i32, Coordinate::Abs).map_err(|e| format!("Failed to move mouse: {}", e))?;
    
    Ok(())
}

#[command]
pub fn drag(path: Vec<(f64, f64)>) -> Result<(), String> {
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;
    
    // Move to the starting position
    let (start_x, start_y) = path[0];
    enigo.move_mouse(start_x as i32, start_y as i32, Coordinate::Abs).map_err(|e| format!("Failed to move mouse: {}", e))?;
    
    // Press the mouse button
    enigo.button(Button::Left, Press).map_err(|e| format!("Failed to press mouse button: {}", e))?;
    
    // Move through each point in the path
    for (x, y) in path.iter().skip(1) {
        enigo.move_mouse(*x as i32, *y as i32, Coordinate::Abs).map_err(|e| format!("Failed to move mouse: {}", e))?;
        thread::sleep(Duration::from_millis(5)); // Small delay for smoother dragging
    }
    
    // Release the mouse button
    enigo.button(Button::Left, Release).map_err(|e| format!("Failed to release mouse button: {}", e))?;
    
    Ok(())
}

// Helper function to parse key strings into Key enum
fn parse_key(key_str: &str) -> Result<Key, String> {
    match key_str {
        "alt" => Ok(Key::Alt),
        "backspace" => Ok(Key::Backspace),
        "capslock" => Ok(Key::CapsLock),
        "control" | "ctrl" => Ok(Key::Control),
        "delete" => Ok(Key::Delete),
        "downarrow" => Ok(Key::DownArrow),
        "end" => Ok(Key::End),
        "escape" => Ok(Key::Escape),
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
        "leftarrow" => Ok(Key::LeftArrow),
        "meta" | "command" | "windows" => Ok(Key::Meta),
        "option" => Ok(Key::Option),
        "pagedown" => Ok(Key::PageDown),
        "pageup" => Ok(Key::PageUp),
        "return" | "enter" => Ok(Key::Return),
        "rightarrow" => Ok(Key::RightArrow),
        "shift" => Ok(Key::Shift),
        "space" => Ok(Key::Space),
        "tab" => Ok(Key::Tab),
        "uparrow" => Ok(Key::UpArrow),
        _ if key_str.len() == 1 => {
            // For single characters, use Unicode
            let c = key_str.chars().next().unwrap();
            Ok(Key::Unicode(c))
        }
        _ => Err(format!("Unsupported key: {}", key_str)),
    }
}
