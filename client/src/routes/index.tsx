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

// const response = await openai.responses.create({
//   model: "computer-use-preview",
//   previous_response_id: "<previous_response_id>",
//   tools: [
//     {
//       type: "computer-preview",
//       display_width: 1024,
//       display_height: 768,
//       environment: "mac",
//     },
//   ],
//   input: [
//     {
//       type: "computer_call_output",
//       call_id: "<call_id>",
//       acknowledged_safety_checks: [
//         {
//           id: "<safety_check_id>",
//           code: "malicious_instructions",
//           message:
//             "We've detected instructions that may cause your application to perform malicious or unauthorized actions. Please acknowledge this warning if you'd like to proceed.",
//         },
//       ],
//       output: {
//         type: "computer_screenshot",
//         image_url: "<image_url>",
//       },
//     },
//   ],
//   truncation: "auto",
// });

// console.log(response.tool_choice);

function Index() {
  const [hide, setHide] = useState(false);
  const display_width = currentMonitor().then((monitor) => monitor?.size.width);

  return <Chat />;
}
