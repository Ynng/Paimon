use cocoa::appkit::NSWindow;
use tauri::{
    ActivationPolicy, App, AppHandle, Emitter, EventTarget, LogicalPosition, Manager,
    PhysicalPosition, PhysicalSize, WebviewWindow,
};
use tauri_nspanel::{
    cocoa::appkit::{NSMainMenuWindowLevel, NSWindowCollectionBehavior},
    panel_delegate, Panel, WebviewWindowExt,
};
mod commands;

#[allow(non_upper_case_globals)]
const NSWindowStyleMaskNonActivatingPanel: i32 = 1 << 7;
#[allow(non_upper_case_globals)]
const WINDOW_FOCUS_EVENT: &str = "tauri://focus";
const WINDOW_BLUR_EVENT: &str = "tauri://blur";
const WINDOW_MOVED_EVENT: &str = "tauri://move";
const WINDOW_RESIZED_EVENT: &str = "tauri://resize";

fn setup_nspanel(app_handle: &mut AppHandle, window: WebviewWindow) -> Result<Panel, String> {
    // macos window to ns_panel plugin
    let _ = app_handle.plugin(tauri_nspanel::init());

    // Hide the app icon in the dock
    let panel = window.to_panel().map_err(|e| e.to_string())?;

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

    Ok(panel)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_screenshots::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let overlay_window = app
                .get_webview_window("overlay")
                .expect("Failed to get overlay window");
            let spotlight_window = app
                .get_webview_window("spotlight")
                .expect("Failed to get spotlight window");

            // Setup NSPanel for macOS
            #[cfg(target_os = "macos")]
            {
                // let _ = app_handle.set_activation_policy(ActivationPolicy::Accessory);
                let mut app_ref = app.handle().clone();
                let overlay_panel = setup_nspanel(&mut app_ref, overlay_window.clone())
                    .expect("Failed to setup overlay panel");
                // Set window level as screen saver
                overlay_panel.set_level(1000);
                overlay_panel.set_style_mask(NSWindowStyleMaskNonActivatingPanel);
                overlay_panel.set_collection_behaviour(
                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                        | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
                        | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
                );

                let spotlight_panel = setup_nspanel(&mut app_ref, spotlight_window.clone())
                    .expect("Failed to setup spotlight panel");
                spotlight_panel.set_level(NSMainMenuWindowLevel + 1);
                spotlight_panel.set_style_mask(NSWindowStyleMaskNonActivatingPanel);
                spotlight_panel.set_collection_behaviour(
                    NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                        | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
                        | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
                );
            }
            overlay_window
                .set_ignore_cursor_events(true)
                .unwrap_or_else(|err| println!("{:?}", err));
            // find the window next to the primary monitor if it exists, else just use the primary monitor
            let monitors = app.available_monitors().expect("Failed to get monitors");
            let primary_monitor = app
                .primary_monitor()
                .expect("Failed to get primary monitor")
                .unwrap();
            let primary_monitor_name = primary_monitor
                .name()
                .expect("Failed to get primary monitor name");
            let primary_monitor_index = monitors
                .iter()
                .position(|m| m.name() == Some(primary_monitor_name))
                .unwrap();
            // get the next monitor if it exists
            // TODO: moving window across monitors is very inconsistent on macOS, should investigate later
            let monitor = overlay_window
                .current_monitor()
                .expect("Failed to get current monitor")
                .unwrap();
            // let monitor = monitors
            //     .get((primary_monitor_index + 1) % monitors.len())
            //     .unwrap_or(&primary_monitor);

            // for debug, go through all monitors and print their name, size, position, and scale factor
            for monitor in app.available_monitors().expect("Failed to get monitors") {
                println!("Monitor: {:?}", monitor.name());
                println!("Size: {:?}", monitor.size());
                println!("Position: {:?}", monitor.position());
                println!("Scale factor: {:?}", monitor.scale_factor());
            }

            // Make the window cover the entire screen
            let monitor_size = monitor.size();
            let monitor_position = monitor.position();
            let monitor_scale_factor = monitor.scale_factor();
            println!("Chosen monitor name: {:?}", monitor.name());
            println!("Chosen monitor size: {:?}", monitor_size);
            println!("Chosen monitor position: {:?}", monitor_position);
            println!("Chosen monitor scale factor: {:?}", monitor_scale_factor);

            overlay_window
                .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: monitor_position.x,
                    y: monitor_position.y,
                }))
                .unwrap_or_else(|err| println!("Failed to set position: {:?}", err));

            overlay_window
                .set_size(tauri::Size::Physical(tauri::PhysicalSize {
                    width: monitor_size.width,
                    height: monitor_size.height,
                }))
                .unwrap_or_else(|err| println!("Failed to set size: {:?}", err));

            // Set width to 400px
            let window_width = (400.0 * monitor_scale_factor) as u32;
            let window_height = (600.0 * monitor_scale_factor) as u32;
            // Position on the right side with 32px inset
            let x_position = monitor_position.x + monitor_size.width as i32
                - (window_width as i32)
                - (64.0 * monitor_scale_factor) as i32;
            let y_position = monitor_position.y + monitor_size.height as i32
                - window_height as i32
                - (64.0 * monitor_scale_factor) as i32;
            println!(
                "Setting position to {:?}",
                tauri::PhysicalPosition {
                    x: x_position,
                    y: y_position,
                }
            );
            println!(
                "Setting size to {:?}",
                tauri::PhysicalSize {
                    width: window_width,
                    height: window_height,
                }
            );
            spotlight_window
                .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: x_position,
                    y: y_position,
                }))
                .unwrap_or_else(|err| println!("Failed to set main window position: {:?}", err));
            spotlight_window
                .set_size(tauri::Size::Physical(tauri::PhysicalSize {
                    width: window_width,
                    height: window_height,
                }))
                .unwrap_or_else(|err| println!("Failed to set main window size: {:?}", err));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::windowing::set_hide_from_screenshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// /Users/winkey/Library/Application Support/com.paimon.app/tauri-plugin-screenshots/monitor-1.png
