import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import {
  LogicalPosition,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
  Window,
} from "@tauri-apps/api/window";
import { useState } from "react";
import { proxy, useSnapshot } from "valtio";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [hide, setHide] = useState(false);
  return (
    <div className="macos:pt-6 h-full p-2 pt-2">
      <div className="macos:h-10 absolute h-0" data-tauri-drag-region />
      <h3>Welcome Home!</h3>
      <Button
        variant="secondary"
        onClick={() => {
          invoke("set_hide_from_screenshot", { hide: !hide });
          setHide(!hide);
        }}
      >
        {hide ? "Show" : "Hide"} from screenshot
      </Button>
    </div>
  );
}
