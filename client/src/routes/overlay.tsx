import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/overlay")({
  component: Overlay,
});

function Overlay() {
  return (
    <div className="relative h-full w-full">
      <div className="apple-intelligence-bg absolute inset-0" />
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-4xl font-semibold text-black dark:text-white">
          Hello from Overlay!
        </div>
      </div>
    </div>
  );
}
