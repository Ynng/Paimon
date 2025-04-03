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
    <div className="flex h-full flex-col">
      <div
        className="macos:pt-6 flex min-h-0 w-full grow items-center justify-center p-2 pt-2"
        data-tauri-drag-region
      >
        <div className="text-4xl font-semibold text-gray-500 select-none">
          Placeholder
        </div>
      </div>
      <div className="w-full p-4">
        <div className="w-full rounded-2xl dark:bg-neutral-700">
          <textarea
            className="max-h-56 w-full resize-none overflow-x-hidden overflow-y-auto rounded-2xl p-4 text-sm text-wrap text-neutral-300 outline-none"
            placeholder="What do you want to do?"
          />
        </div>
      </div>
      {/* <h3>Welcome Home!</h3>
      <Button
        variant="secondary"
        onClick={() => {
          invoke("set_hide_from_screenshot", { hide: !hide });
          setHide(!hide);
        }}
      >
        {hide ? "Show" : "Hide"} from screenshot
      </Button> */}
    </div>
  );
}
