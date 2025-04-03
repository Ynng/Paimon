import { routeTree } from "@/routeTree.gen";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { PostHogConfig } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

// Create a new router instance
const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const posthogOptions: Partial<PostHogConfig> = {
  api_host: import.meta.env.VITE_POSTHOG_HOST,
  ui_host: "https://us.posthog.com",
  person_profiles: "always",
  capture_pageview: false,
  capture_pageleave: false,
  session_recording: {
    maskTextSelector: ".sensitive",
  },
};

export const App = () => {
  return (
    <PostHogProvider
      apiKey={import.meta.env.VITE_POSTHOG_KEY}
      options={posthogOptions}
    >
      <RouterProvider router={router} />
    </PostHogProvider>
  );
};
