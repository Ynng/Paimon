use cocoa::appkit::NSWindow;
use tauri::{
    ActivationPolicy, App, AppHandle, Emitter, EventTarget, LogicalPosition, Manager,
    PhysicalPosition, PhysicalSize, WebviewWindow,
};
use tauri_nspanel::{cocoa::appkit::NSWindowCollectionBehavior, panel_delegate, WebviewWindowExt};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[allow(non_upper_case_globals)]
const NSWindowStyleMaskNonActivatingPanel: i32 = 1 << 7;
#[allow(non_upper_case_globals)]
const NSResizableWindowMask: i32 = 1 << 3;
const WINDOW_FOCUS_EVENT: &str = "tauri://focus";
const WINDOW_BLUR_EVENT: &str = "tauri://blur";
const WINDOW_MOVED_EVENT: &str = "tauri://move";
const WINDOW_RESIZED_EVENT: &str = "tauri://resize";

fn setup_nspanel(app_handle: &mut AppHandle, window: WebviewWindow) {
    // macos window to ns_panel plugin
    let _ = app_handle.plugin(tauri_nspanel::init());

    // Hide the app icon in the dock
    let _ = app_handle.set_activation_policy(ActivationPolicy::Accessory);

    // Convert ns_window to ns_panel
    let panel = window.to_panel().unwrap();

    // Set window level as screen saver
    panel.set_level(1000);

    // Don't steal focus from other windows and support resizing
    panel.set_style_mask(NSWindowStyleMaskNonActivatingPanel | NSResizableWindowMask);

    // Share window across desktop spaces and fullscreen
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
    );

    // Define panel delegate to listen for window events
    let delegate = panel_delegate!(EcoPanelDelegate {
        window_did_become_key,
        window_did_resign_key,
        window_did_resize,
        window_did_move
    });

    // Set event listener for delegate
    delegate.set_listener(Box::new(move |delegate_name: String| {
        let target = window.label();

        let window_move_event = || {
            if let Ok(position) = window.outer_position() {
                let _ = window.emit_to(target, WINDOW_MOVED_EVENT, position);
            }
        };

        match delegate_name.as_str() {
            // Called when window gains keyboard focus
            "window_did_become_key" => {
                let _ = window.emit_to(target, WINDOW_FOCUS_EVENT, true);
            }
            // Called when window loses keyboard focus
            "window_did_resign_key" => {
                let _ = window.emit_to(target, WINDOW_BLUR_EVENT, true);
            }
            // Called when window size changes
            "window_did_resize" => {
                window_move_event();

                if let Ok(size) = window.inner_size() {
                    let _ = window.emit_to(target, WINDOW_RESIZED_EVENT, size);
                }
            }
            // Called when window position changes
            "window_did_move" => window_move_event(),
            _ => (),
        }
    }));

    // Set the window's delegate object for handling window events
    panel.set_delegate(delegate);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_screenshots::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let overlay_window = app.get_webview_window("overlay").unwrap();
            overlay_window
                .set_ignore_cursor_events(true)
                .unwrap_or_else(|err| println!("{:?}", err));
            // Setup NSPanel for macOS
            #[cfg(target_os = "macos")]
            {
                let mut app_ref = app.handle().clone();
                setup_nspanel(&mut app_ref, overlay_window.clone());
            }

            let nswindow: cocoa::base::id = overlay_window.ns_window().unwrap() as _;
            // nswindow.setCollectionBehavior_(NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces);

            // Make the window cover the entire screen
            if let Some(monitor) = overlay_window.current_monitor().unwrap_or(None) {
                let size = monitor.size();
                let position = monitor.position();

                overlay_window
                    .set_position(tauri::Position::Physical(*position))
                    .unwrap_or_else(|err| println!("Failed to set position: {:?}", err));

                overlay_window
                    .set_size(tauri::Size::Physical(*size))
                    .unwrap_or_else(|err| println!("Failed to set size: {:?}", err));
            } else {
                println!("Failed to get monitor information");
            }

            let main_window = app.get_webview_window("main").unwrap();
            if let Some(monitor) = main_window.current_monitor().unwrap_or(None) {
                let size = monitor.size();
                let position = monitor.position();
                let scale_factor = monitor.scale_factor();

                // Set width to 400px
                let window_width = (400.0 * scale_factor) as u32;
                // Position on the right side with 32px inset
                let x_position = position.x + (size.width as i32)
                    - (window_width as i32)
                    - (64.0 * scale_factor) as i32;
                let height = size.height - (64.0 * 2.0 * scale_factor) as u32;
                let y_position = position.y + (64.0 * scale_factor) as i32;

                main_window
                    .set_size(tauri::Size::Physical(tauri::PhysicalSize {
                        width: window_width,
                        height: height,
                    }))
                    .unwrap_or_else(|err| println!("Failed to set main window size: {:?}", err));

                main_window
                    .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                        x: x_position,
                        y: y_position,
                    }))
                    .unwrap_or_else(|err| {
                        println!("Failed to set main window position: {:?}", err)
                    });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// /Users/winkey/Library/Application Support/com.paimon.app/tauri-plugin-screenshots/monitor-1.png
