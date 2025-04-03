import { invoke } from "@tauri-apps/api/core";

export const getScreenshot = async () => {
    const result = await invoke<{ path: string; base64: string }>("get_screenshot");
    return result;
};

export const setHideFromScreenshot = async (hide: boolean) => {
    await invoke("set_hide_from_screenshot", { hide });
};
