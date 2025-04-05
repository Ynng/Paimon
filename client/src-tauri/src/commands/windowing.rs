use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tauri::{command, AppHandle, Manager, Runtime};
#[cfg(target_os = "macos")]
use tauri_nspanel::objc::{msg_send, sel, sel_impl};

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::WDA_NONE;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE};

#[command]
pub fn set_hide_from_screenshot<R: Runtime>(handle: AppHandle<R>, hide: bool) {
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        log::warn!("set_hide_from_screenshot not implemented for this platform");
        return;
    }

    let windows = handle.webview_windows();
    let status = if hide { 0 } else { 1 };
    
    #[cfg(target_os = "macos")]
    for (_, window) in windows {
        let nswindow: cocoa::base::id = window.ns_window().unwrap() as _;
        unsafe {
            let _: () = msg_send![&*nswindow, setSharingType: status];
        }
    }

    #[cfg(target_os = "windows")]
    for (_, window) in windows {
        let raw_window = window.window_handle().expect("Failed to get window handle");
        match raw_window.as_raw() {
            RawWindowHandle::Win32(handle) => unsafe {
                let raw_value = handle.hwnd.get();
                let hwnd_ptr = raw_value as *mut std::ffi::c_void;
                let hwnd: HWND = HWND(hwnd_ptr);
                SetWindowDisplayAffinity(hwnd, if hide { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE }).unwrap();
            },
            _ => {}
        }
    }
}
