import { currentMonitor } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import { getScreenshot } from "../screenshot";

export type Environment = "mac" | "windows" | "ubuntu";

// A stateless computer
export class TauriComputer {
  environment: Environment = "mac";
  dimensions: [number, number] = [0, 0];
  async init(): Promise<this> {
    const monitor = await currentMonitor();
    if (!monitor) throw new Error("No monitor found");
    this.dimensions = [monitor.size.width, monitor.size.height];
    const os = platform();
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
    const result = await getScreenshot();
    return result.base64;
  }

  async click(
    button: string = "left",
    x: number | string,
    y: number | string,
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  async scroll(
    x: number,
    y: number,
    scrollX: number,
    scrollY: number,
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  async double_click(x: number, y: number): Promise<void> {
    throw new Error("Not implemented");
  }

  async keypress(keys: string[]): Promise<void> {
    throw new Error("Not implemented");
  }

  async type(text: string): Promise<void> {
    throw new Error("Not implemented");
  }

  async wait(ms: number = 250): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async move(x: number, y: number): Promise<void> {
    throw new Error("Not implemented");
  }

  async drag(path: { x: number; y: number }[]): Promise<void> {
    throw new Error("Not implemented");
  }
}
