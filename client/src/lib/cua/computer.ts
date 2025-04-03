import { invoke } from "@tauri-apps/api/core";
import { currentMonitor } from "@tauri-apps/api/window";
import { platform, type } from "@tauri-apps/plugin-os";
import { getScreenshot, setHideFromScreenshot } from "../screenshot";

export type Environment = "mac" | "windows" | "ubuntu";

// A stateless computer
export class TauriComputer {
  environment: Environment = "mac";
  dimensions: [number, number] = [0, 0];
  async init(): Promise<this> {
    const monitor = await currentMonitor();
    if (!monitor) throw new Error("No monitor found");
    this.dimensions = [
      monitor.size.width / monitor.scaleFactor,
      monitor.size.height / monitor.scaleFactor,
    ];
    console.log("computer dimensions", this.dimensions);
    const os = await platform();
    if (os === "macos") {
      this.environment = "mac";
    } else if (os === "windows") {
      this.environment = "windows";
    } else if (os === "linux") {
      this.environment = "ubuntu";
    } else {
      throw new Error(`Unsupported OS: ${os}`);
    }
    return this;
  }

  // returns a base64 encoded image
  async screenshot(): Promise<string> {
    await setHideFromScreenshot(true);
    const result = await getScreenshot();
    await setHideFromScreenshot(false);
    console.log("screenshot taken at ", result.path);
    return result.base64;
  }

  async click(
    button: string = "left",
    x: number | string,
    y: number | string,
  ): Promise<void> {
    await invoke("click", { button, x, y });
  }

  async scroll(
    x: number,
    y: number,
    scrollX: number,
    scrollY: number,
  ): Promise<void> {
    // I think chatgpt wants to scroll by pixels
    // 1 tick of scroll is like 30pixels for me though
    await invoke("scroll", {
      x,
      y,
      scrollX: scrollX / 100,
      scrollY: scrollY / 100,
    });
  }

  async double_click(x: number, y: number): Promise<void> {
    await invoke("double_click", { x, y });
  }

  async keypress(keys: string[]): Promise<void> {
    await invoke("keypress", { keys });
  }

  async type(text: string): Promise<void> {
    await invoke("type_text", { text });
  }

  async wait(ms: number = 0): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async move(x: number, y: number): Promise<void> {
    await invoke("move_mouse", { x, y });
  }

  async drag(path: { x: number; y: number }[]): Promise<void> {
    await invoke("drag", { path });
  }
}
