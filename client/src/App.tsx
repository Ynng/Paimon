import "./App.css";
import { getScreenshotableWindows, getWindowScreenshot, getScreenshotableMonitors, getMonitorScreenshot } from "tauri-plugin-screenshots-api";
import { useState } from "react";

function App() {
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
    <main className="container">
      <h1>Screenshot Demo</h1>
      <div className="button-group">
        <button onClick={takeWindowScreenshot}>Take Window Screenshot</button>
        <button onClick={takeMonitorScreenshot}>Take Monitor Screenshot</button>
      </div>
      {screenshotPath && (
        <div className="result">
          <p>Screenshot saved at: {screenshotPath}</p>
        </div>
      )}
    </main>
  );
}

export default App;
