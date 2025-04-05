use tauri::{command, AppHandle, Manager, Runtime};
#[cfg(target_os = "macos")]
use tauri_nspanel::objc::{msg_send, sel, sel_impl};

#[command]
pub fn set_hide_from_screenshot<R: Runtime>(handle: AppHandle<R>, hide: bool) {
    let windows = handle.webview_windows();
    let status = if hide { 0 } else { 1 };
    #[cfg(target_os = "macos")]
    for (_, window) in windows {
        let nswindow: cocoa::base::id = window.ns_window().unwrap() as _;
        unsafe {
            let _: () = msg_send![&*nswindow, setSharingType: status];
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        log::warn!("TODO: IMPLEMENT HIDE FROM SCREENSHOT FOR {}", std::env::consts::OS);
    }
}
