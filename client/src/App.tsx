import { getScreenshotableWindows, getWindowScreenshot, getScreenshotableMonitors, getMonitorScreenshot } from "tauri-plugin-screenshots-api";
import { useState } from "react";

export function App() {
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);

  const takeWindowScreenshot = async () => {
    try {
      const windows = await getScreenshotableWindows();
      if (windows.length > 0) {
        const path = await getWindowScreenshot(windows[0].id);
        setScreenshotPath(path);
      }
    } catch (error) {
      console.error("Failed to take window screenshot:", error);
    }
  };

  const takeMonitorScreenshot = async () => {
    try {
      const monitors = await getScreenshotableMonitors();
      if (monitors.length > 0) {
        const path = await getMonitorScreenshot(monitors[0].id);
        setScreenshotPath(path);
      }
    } catch (error) {
      console.error("Failed to take monitor screenshot:", error);
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Screenshot Demo</h1>
      <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
        <button 
          onClick={takeWindowScreenshot}
          className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded transition-colors"
        >
          Take Window Screenshot
        </button>
        <button 
          onClick={takeMonitorScreenshot}
          className="bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded transition-colors"
        >
          Take Monitor Screenshot
        </button>
      </div>
      {screenshotPath && (
        <div className="mt-6 p-4 bg-gray-100 rounded-lg">
          <p className="text-gray-800 break-all">Screenshot saved at: {screenshotPath}</p>
        </div>
      )}
    </main>
  );
}

export default App;
