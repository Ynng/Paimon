import { Chat } from "@/components/ai/chat";
import { Button } from "@/components/ui/button";
import { openai } from "@/lib/openai";
import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import {
  currentMonitor,
  getCurrentWindow,
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
  return <Chat />;
}
