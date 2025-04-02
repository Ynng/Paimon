import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize, Window } from "@tauri-apps/api/window";
import { useState } from "react";
import { proxy, useSnapshot } from "valtio";

export const Route = createFileRoute("/")({
  component: Index,
});

// Create a state store with valtio
const windowState = proxy({
  width: 800,
  height: 600,
  x: 100,
  y: 100,
});

// Window Size and Position Controls component
const WindowControls = () => {
  const snap = useSnapshot(windowState);
  const appWindow = Window.getCurrent();

  const handleSetSize = async () => {
    try {
      await appWindow.setSize(new LogicalSize(snap.width, snap.height));
    } catch (error) {
      console.error("Failed to set window size:", error);
    }
  };

  const handleSetPosition = async () => {
    try {
      await appWindow.setPosition(new LogicalPosition(snap.x, snap.y));
    } catch (error) {
      console.error("Failed to set window position:", error);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 10,
        right: 10,
        padding: 10,
        background: "#f0f0f0",
        borderRadius: 5,
      }}
    >
      <div>
        <label>Width: </label>
        <input
          type="number"
          value={snap.width}
          onChange={(e) => (windowState.width = Number(e.target.value))}
          style={{ width: 60, marginRight: 10 }}
        />
        <label>Height: </label>
        <input
          type="number"
          value={snap.height}
          onChange={(e) => (windowState.height = Number(e.target.value))}
          style={{ width: 60 }}
        />
        <button onClick={handleSetSize} style={{ marginLeft: 10 }}>
          Set Size
        </button>
      </div>
      <div style={{ marginTop: 10 }}>
        <label>X: </label>
        <input
          type="number"
          value={snap.x}
          onChange={(e) => (windowState.x = Number(e.target.value))}
          style={{ width: 60, marginRight: 10 }}
        />
        <label>Y: </label>
        <input
          type="number"
          value={snap.y}
          onChange={(e) => (windowState.y = Number(e.target.value))}
          style={{ width: 60 }}
        />
        <button onClick={handleSetPosition} style={{ marginLeft: 10 }}>
          Set Position
        </button>
      </div>
    </div>
  );
};

function Index() {
  const snap = useSnapshot(windowState);
  const appWindow = Window.getCurrent();

  const [hide, setHide] = useState(false);
  return (
    <div className="macos:bg-red-500 p-2">
      <div className="macos:h-10 h-0" data-tauri-drag-region />
      <h3>Welcome Home!</h3>
      <WindowControls />
      <button
        onClick={() => {
          invoke("set_hide_from_screenshot", { hide: !hide });
          setHide(!hide);
        }}
      >
        {hide ? "Show" : "Hide"} from screenshot
      </button>
    </div>
  );
}
