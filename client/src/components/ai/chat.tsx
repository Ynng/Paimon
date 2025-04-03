import { getResponse, takeAction } from "@/lib/cua";
import * as CUA from "@/lib/cua";
import { cn } from "@/lib/utils";
import { appStore } from "@/stores/app";
import { emit } from "@tauri-apps/api/event";
import { SparkleIcon, SparklesIcon, SquarePenIcon } from "lucide-react";
import OpenAI from "openai";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorage, useSessionStorage } from "usehooks-ts";
import { useSnapshot } from "valtio";
import { Button } from "../ui/button";

export type ChatProps = React.HTMLAttributes<HTMLDivElement> & {};

export type Tool =
  | "ACT"
  | "CLOSE"
  | "WAIT"
  | "MESSAGE"
  | "CLICK"
  | "TYPE"
  | "KEYPRESS"
  | "SCROLL"
  | "DOUBLE_CLICK"
  | "DRAG"
  | "SCREENSHOT"
  | "MOVE";

const ToolToName: Record<Tool, string> = {
  // End of Task
  CLOSE: "End",

  // Waiting for Task
  WAIT: "Waiting",

  // Communication tools
  MESSAGE: "Message",

  // Utility tools
  SCREENSHOT: "Screenshot",

  // Interaction tools
  CLICK: "Click",
  TYPE: "Type",
  KEYPRESS: "Keypress",
  SCROLL: "Scroll",
  DOUBLE_CLICK: "Double Click",
  DRAG: "Drag",
  MOVE: "Move",
  ACT: "Action",
};

const ToolToColor: Record<Tool, string> = {
  // End of Task
  CLOSE: "bg-green-400/50 text-green-100",

  // Waiting for Task
  WAIT: "bg-amber-400/50 text-amber-100",

  // Communication tools
  MESSAGE: "bg-sky-400/50 text-sky-100",

  // Utility tools
  SCREENSHOT: "bg-purple-400/50 text-purple-100",

  // Interaction tools
  CLICK: "bg-gray-400/50 text-gray-100",
  TYPE: "bg-gray-400/50 text-gray-100",
  KEYPRESS: "bg-gray-400/50 text-gray-100",
  SCROLL: "bg-gray-400/50 text-gray-100",
  DOUBLE_CLICK: "bg-gray-400/50 text-gray-100",
  DRAG: "bg-gray-400/50 text-gray-100",
  MOVE: "bg-gray-400/50 text-gray-100",
  ACT: "bg-gray-400/50 text-gray-100",
};

export interface BrowserStep {
  text: string;
  type: "user_msg" | "agent_msg" | "system_msg";
  tool: Tool;
  stepNumber?: number;
  messageId?: string;
}

interface AgentState {
  steps: BrowserStep[];
}

export function Chat({ className, ...props }: ChatProps) {
  const snap = useSnapshot(appStore);
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false);
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [userInput, setUserInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentResponseIdRef = useRef<string | null>(null);
  const [isAgentFinished, setIsAgentFinished] = useState(false);
  const isAgentFinishedRef = useRef(false);
  isAgentFinishedRef.current = isAgentFinished;
  const posthog = usePostHog();
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  const agentStateRef = useRef<AgentState>({
    steps: [],
  });
  const [uiState, setUiState] = useLocalStorage<{
    steps: BrowserStep[];
  }>("uiState", {
    steps: [],
  });

  useEffect(() => {
    emit("agent_waiting_for_agent", {
      isWaitingForAgent,
    });
  }, [isWaitingForAgent]);

  useEffect(() => {
    agentStateRef.current.steps = uiState.steps;
    if (uiState.steps.length > 0) {
      // Find the last element with reasoning = "Processing message"
      const processingMessageStep = [...uiState.steps]
        .reverse()
        .find((step) => step.type === "agent_msg");

      currentResponseIdRef.current = processingMessageStep?.messageId || null;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (isWaitingForInput && inputRef.current) {
      // Try multiple times with increasing delays to ensure focus works
      const focusAttempts = [10, 100, 300, 500];

      focusAttempts.forEach((delay) => {
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            console.log(`Attempting to focus input at ${delay}ms`);
          }
        }, delay);
      });
    }
  }, [isWaitingForInput]);

  // Track scroll position to apply conditional margin
  useEffect(() => {
    const handleScroll = () => {
      if (chatContainerRef.current) {
        setIsScrolled(chatContainerRef.current.scrollTop > 10);
      }
    };

    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, []);

  useEffect(() => {
    if (
      uiState.steps.length > 0 &&
      uiState.steps[uiState.steps.length - 1].tool === "CLOSE"
    ) {
      setIsAgentFinished(true);
    }
  }, [uiState.steps]);

  useEffect(() => {
    scrollToBottom();
  }, [uiState.steps, scrollToBottom]);

  // Add a new function to process a single step
  const processStep = useCallback(
    async (response: OpenAI.Responses.Response, stepNumber = 1) => {
      if (isAgentFinishedRef.current) {
        return;
      }

      // Special case for reasoning-only response
      if (
        response.output.length === 1 &&
        response.output[0]?.type === "reasoning"
      ) {
        console.log("Detected reasoning-only response, adding message item");
        response.output.push({
          id: `msg_fallback_${response.id || "default"}`,
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "I'll help you with that task.",
              annotations: [],
            },
          ],
          status: "completed",
        });
      }

      currentResponseIdRef.current = response.id;
      console.log("processing steps: ", response);
      const addBrowserStep = (step: BrowserStep) => {
        const isDuplicate = agentStateRef.current.steps.some(
          (s) => s.messageId === step.messageId && step.messageId !== undefined,
        );

        if (isDuplicate) {
          return;
        }

        agentStateRef.current = {
          steps: [...agentStateRef.current.steps, step],
        };

        setUiState({
          steps: agentStateRef.current.steps,
        });
      };

      let executedAnything = false;
      let callOutputs = [];

      // Process all output items one by one
      for (const item of response.output) {
        if (item.type === "message") {
          if (item.content[0]?.type === "output_text") {
            addBrowserStep({
              text: item.content[0].text,
              type: "agent_msg",
              tool: "MESSAGE",
              stepNumber: stepNumber++,
              messageId: item.id,
            });
          } else if (item.content[0]?.type === "refusal") {
            addBrowserStep({
              text: item.content[0].refusal,
              type: "agent_msg",
              tool: "MESSAGE",
              stepNumber: stepNumber++,
              messageId: item.id,
            });
            setIsWaitingForInput(true);
            setIsAgentFinished(true);
          }
        } else if (item.type === "computer_call") {
          executedAnything = true;

          // basic step
          let step: BrowserStep = {
            text: "Doing " + item.action.type || "",
            type: "agent_msg",
            tool: item.action.type.toUpperCase() as
              | "TYPE"
              | "CLICK"
              | "DOUBLE_CLICK"
              | "DRAG"
              | "KEYPRESS"
              | "MOVE"
              | "SCREENSHOT"
              | "SCROLL"
              | "WAIT",
            stepNumber: stepNumber++,
          };

          // prettier-ignore
          if(item.action.type==="click") {
            step.text = "Clicking at " + item.action.x + ", " + item.action.y;
          } else if(item.action.type==="double_click") {
            step.text = "Double clicking at " + item.action.x + ", " + item.action.y;
          } else if(item.action.type==="drag") {
            step.text = "Dragging from " + item.action.path[0] + " to " + item.action.path[item.action.path.length - 1];
          } else if(item.action.type==="type") {
            step.text = "Typing " + item.action.text;
          } else if(item.action.type==="keypress") {
            step.text = "Pressing " + item.action.keys.join(", ");
          } else if(item.action.type==="move") {
            step.text = "Moving to " + item.action.x + ", " + item.action.y;
          } else if(item.action.type==="scroll") {
            step.text = "Scrolling " + item.action.scroll_x + " " + item.action.scroll_y;
          } else if(item.action.type==="screenshot") {
            step.text = "Taking screenshot";
          } else if(item.action.type==="wait") {
            step.text = "Waiting for a moment";
          }

          addBrowserStep(step);
          setIsWaitingForAgent(true);
          const computerCallData = await takeAction([item]);
          setIsWaitingForAgent(false);
          callOutputs.push(...computerCallData);
        } else if (item.type === "function_call") {
          executedAnything = true;
          // TODO: we don't have any functions yet
        }
      }

      // If no action items, wait for user input
      if (!executedAnything) {
        setIsWaitingForInput(true);
        return;
      }

      setIsWaitingForAgent(true);
      const nextStepData = await getResponse(
        callOutputs,
        currentResponseIdRef.current,
      );
      setIsWaitingForAgent(false);
      return processStep(nextStepData, stepNumber);
    },
    [],
  );

  const handleUserInput = useCallback(async (input: string) => {
    if (!input.trim()) return;

    const userStep: BrowserStep = {
      text: input,
      type: "user_msg",
      tool: "MESSAGE",
      stepNumber: agentStateRef.current.steps.length + 1,
    };

    // Update agent state and UI with the user step
    const updateSteps = (newStep: BrowserStep) => {
      agentStateRef.current = {
        steps: [...agentStateRef.current.steps, newStep],
      };

      setUiState({
        steps: agentStateRef.current.steps,
      });
    };

    updateSteps(userStep);
    setIsWaitingForInput(false);
    setUserInput("");

    try {
      setIsWaitingForAgent(true);
      let nextStepData = await getResponse(
        [{ role: "user", content: input }],
        currentResponseIdRef.current,
      );
      setIsWaitingForAgent(false);
      return processStep(nextStepData, agentStateRef.current.steps.length + 1);
    } catch (error) {
      console.error("Error handling user input:", error);
      const errorStep: BrowserStep = {
        text: "Sorry, there was an error processing your request. Please try again.",
        type: "system_msg",
        tool: "MESSAGE",
        stepNumber: agentStateRef.current.steps.length + 1,
      };

      updateSteps(errorStep);
      setIsWaitingForInput(true);
      setIsWaitingForAgent(false);
      return null;
    }
  }, []);

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-[20px]",
        className,
      )}
      {...props}
    >
      <div
        ref={chatContainerRef}
        className="macos:pt-6 flex min-h-0 w-full grow flex-col items-stretch justify-start gap-y-4 overflow-x-hidden overflow-y-auto px-4 pt-2"
        data-tauri-drag-region
      >
        {uiState.steps.map((step, index) => {
          // Determine if this is a system message (like stock price info)
          const isSystemMessage =
            step.tool === "MESSAGE" &&
            (step.type === "system_msg" || step.type === "agent_msg");
          // Determine if this is a user input message
          const isUserInput =
            step.tool === "MESSAGE" && step.type === "user_msg";
          return (
            <div
              key={index}
              className={cn(
                "relative flex flex-col space-y-3 rounded-lg border-[0.5px] border-neutral-700 p-4 shadow-md",
                isUserInput
                  ? "bg-[hsl(0,0%,20%)]/50"
                  : isSystemMessage
                    ? "bg-[hsl(0,0%,50%)]/50"
                    : "bg-[hsl(0,0%,20%)]/50",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="h-6s rounded-sm bg-neutral-700/70 px-2 py-1 text-xs font-medium text-neutral-300">
                  Step {step.stepNumber}
                </span>
                <span
                  className={cn(
                    "h-6 rounded-sm px-2 py-1 text-xs",
                    ToolToColor[isSystemMessage ? "CLOSE" : step.tool],
                  )}
                >
                  {isSystemMessage ? "System Message" : ToolToName[step.tool]}
                </span>
              </div>
              <div
                className={cn(
                  "font-medium",
                  step.tool === "MESSAGE" && "text-neutral-200",
                  step.tool !== "MESSAGE" && "font-mono text-neutral-400",
                )}
              >
                {step.text}
              </div>
              {/* Show reasoning for all steps except the last one */}
              {/* <div className="rounded-md bg-neutral-800/30 p-2 text-sm text-neutral-400">
                <span className="font-semibold">Reasoning: </span>
                {step.reasoning}
              </div> */}
            </div>
          );
        })}
        {uiState.steps.length === 0 && (
          <div className="flex h-full items-center justify-center text-3xl font-bold text-neutral-400">
            Welcome
          </div>
        )}
      </div>
      <div className="w-full p-4">
        <div
          className={cn(
            "relative w-full rounded-2xl border border-neutral-500 dark:bg-neutral-700",
          )}
        >
          <textarea
            ref={inputRef}
            className={cn(
              "max-h-56 w-full resize-none overflow-x-hidden overflow-y-auto rounded-2xl p-4 text-sm text-wrap text-neutral-300 outline-none",
            )}
            placeholder={
              isWaitingForInput ? "What's on your mind?" : "Thinking..."
            }
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (["quit", "exit", "bye"].includes(userInput.toLowerCase())) {
                  setIsAgentFinished(true);
                  return;
                } else {
                  setIsAgentFinished(false);
                  handleUserInput(userInput);
                }
              }
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-2 bottom-2 cursor-pointer text-neutral-400 hover:text-neutral-300"
            onClick={() => {
              setIsAgentFinished(true);
              setIsWaitingForAgent(false);
              setIsWaitingForInput(true);
              setUserInput("");
              setUiState({
                steps: [],
              });
              agentStateRef.current = {
                steps: [],
              };

              currentResponseIdRef.current = null;
            }}
          >
            <SquarePenIcon className="h-4 w-4" />
          </Button>
          {/* Debug button */}
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-8 bottom-2 cursor-pointer text-neutral-400 hover:text-neutral-300"
            onClick={() => {
              emit("agent_keypress", {
                keys: ["Enter"],
              });
            }}
          >
            <SparklesIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
