use tauri::{command, AppHandle, Manager, Runtime};
use tauri_nspanel::objc::{msg_send, sel, sel_impl};

#[command]
pub fn set_hide_from_screenshot<R: Runtime>(handle: AppHandle<R>, hide: bool) {
    log::info!("set_hide_from_screenshot start {}", hide);
    let windows = handle.webview_windows();
    let status = if hide { 0 } else { 1 };
    for (_, window) in windows {
        let nswindow: cocoa::base::id = window.ns_window().unwrap() as _;
        unsafe {
            let _: () = msg_send![&*nswindow, setSharingType: status];
        }
    }
    log::info!("set_hide_from_screenshot end {}", hide);
}
