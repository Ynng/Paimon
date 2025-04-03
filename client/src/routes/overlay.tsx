import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSessionStorage } from "usehooks-ts";

// Custom hook for animation frame updates
const useAnimationFrame = (callback: (deltaTime: number) => void) => {
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();
  
  const animate = useCallback((time: number) => {
    if (previousTimeRef.current !== undefined) {
      const deltaTime = time - previousTimeRef.current;
      callback(deltaTime);
    }
    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  }, [callback]);
  
  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [animate]);
};

export const Route = createFileRoute("/overlay")({
  component: Overlay,
});

type ActionEvent = {
  x?: number;
  y?: number;
  keys?: string[];
  text?: string;
  ms?: number;
  scroll_x?: number;
  scroll_y?: number;
  path?: Array<[number, number]>;
};

type VisualIndicator = {
  id: number;
  type: string;
  x?: number;
  y?: number;
  message: string;
  timestamp: number;
};

// Define action types that should show the circle effect
const LOCATION_BASED_ACTIONS = ["agent_click", "agent_double_click"];

// Circle effect component for clicks
function CircleEffect({
  x,
  y,
  color,
  size = 100,
}: {
  x: number;
  y: number;
  color: string;
  size?: number;
}) {
  const halfSize = size / 2;
  return (
    <div
      className="click-circle"
      style={{
        left: x,
        top: y,
        borderColor: color,
        borderWidth: `10px`,
        backgroundColor: "transparent",
        width: `${size}px`,
        height: `${size}px`,
        marginLeft: `-${halfSize}px`,
        marginTop: `-${halfSize}px`,
      }}
    />
  );
}

function Overlay() {
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false);
  const [indicators, setIndicators] = useState<VisualIndicator[]>([]);
  const [circleEffects, setCircleEffects] = useState<
    Array<{
      id: number;
      x: number;
      y: number;
      color: string;
      timestamp: number;
    }>
  >([]);
  const indicatorLifetime = 2000; // 2 seconds
  const circleLifetime = 2000; // 2 seconds

  // Clean up old indicators and effects using animation frames
  useAnimationFrame(() => {
    const now = Date.now();
    setIndicators((prev) =>
      prev.filter(
        (indicator) => now - indicator.timestamp < indicatorLifetime,
      ),
    );
    setCircleEffects((prev) =>
      prev.filter((effect) => now - effect.timestamp < circleLifetime),
    );
  });

  useEffect(() => {
    listen<{ isWaitingForAgent: boolean }>(
      "agent_waiting_for_agent",
      (event) => {
        setIsWaitingForAgent(event.payload.isWaitingForAgent);
      },
    );
  }, []);

  useEffect(() => {
    // Set up event listeners
    const unlisteners: Promise<UnlistenFn>[] = [];

    const setupListener = (
      eventName: string,
      messageFormatter: (payload: ActionEvent) => string,
    ) => {
      const unlisten = listen(eventName, (event) => {
        const payload = event.payload as ActionEvent;
        const newIndicator: VisualIndicator = {
          id: Date.now() + Math.random(),
          type: eventName,
          message: messageFormatter(payload),
          timestamp: Date.now(),
        };

        if (payload.x !== undefined && payload.y !== undefined) {
          newIndicator.x = payload.x;
          newIndicator.y = payload.y;

          // Add circle effect for click-like actions
          if (LOCATION_BASED_ACTIONS.includes(eventName)) {
            const circleColor =
              eventName === "agent_double_click" ? "#ff5500" : "#3b82f6";
            setCircleEffects((prev) => [
              ...prev,
              {
                id: Date.now() + Math.random(),
                x: payload.x!,
                y: payload.y!,
                color: circleColor,
                timestamp: Date.now(),
              },
            ]);
          }
        }

        setIndicators((prev) => [...prev, newIndicator]);
      });
      unlisteners.push(unlisten);
    };

    // Setup all event listeners
    setupListener(
      "agent_click",
      (payload) => `Click: ${payload.x},${payload.y}`,
    );

    setupListener(
      "agent_double_click",
      (payload) => `Double Click: ${payload.x},${payload.y}`,
    );

    setupListener(
      "agent_move_mouse",
      (payload) => `Move: ${payload.x},${payload.y}`,
    );

    setupListener(
      "agent_scroll",
      (payload) =>
        `Scroll: ${payload.scroll_x},${payload.scroll_y} at ${payload.x},${payload.y}`,
    );

    setupListener(
      "agent_keypress",
      (payload) => `Keys: ${payload.keys?.join(", ")}`,
    );

    setupListener("agent_type_text", (payload) => `Typing: "${payload.text}"`);

    setupListener("agent_wait", (payload) => `Waiting: ${payload.ms}ms`);

    setupListener("agent_drag", (payload) => {
      const start = payload.path?.[0];
      const end = payload.path?.[payload.path.length - 1];
      return `Drag: ${start} → ${end}`;
    });

    return () => {
      Promise.all(unlisteners).then((unlisteners) => {
        unlisteners.forEach((unlisten) => unlisten());
      });
    };
  }, []);

  return (
    <div className="pointer-events-none relative h-full w-full overflow-hidden">
      <div
        className={cn(
          "apple-intelligence-bg absolute inset-0",
          !isWaitingForAgent && "opacity-0",
        )}
      />

      {/* Circle effects for clicks */}
      {circleEffects.map((effect) => (
        <CircleEffect
          key={effect.id}
          x={effect.x}
          y={effect.y}
          color={effect.color}
        />
      ))}

      {/* Position-based indicators */}
      {indicators
        .filter((i) => i.x !== undefined && i.y !== undefined)
        .map((indicator) => (
          <div
            key={indicator.id}
            className="absolute z-50 -translate-x-1/2 -translate-y-1/2 transform animate-pulse rounded-md bg-blue-500 px-2 py-1 text-sm text-white"
            style={{
              left: indicator.x,
              top: indicator.y,
              opacity:
                1 - (Date.now() - indicator.timestamp) / indicatorLifetime,
            }}
          >
            {indicator.message}
          </div>
        ))}

      {/* Toast notifications for non-positional events */}
      <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
        {indicators
          .filter((i) => i.x === undefined)
          .map((indicator) => (
            <div
              key={indicator.id}
              className="rounded-md bg-gray-800 px-4 py-2 text-white shadow-lg"
              style={{
                opacity:
                  1 - (Date.now() - indicator.timestamp) / indicatorLifetime,
              }}
            >
              {indicator.message}
            </div>
          ))}
      </div>
    </div>
  );
}
