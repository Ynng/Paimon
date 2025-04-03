import { Chat } from "@/components/ai/chat";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <Chat />;
}
