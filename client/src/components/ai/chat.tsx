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
  reasoning: string;
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
        .find((step) => step.reasoning === "Processing message");

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
      const preprocessResponse = (data: OpenAI.Responses.Response) => {
        if (data.output.length === 1 && data.output[0]?.type === "reasoning") {
          console.log("Detected reasoning-only response, adding message item");
          data.output.push({
            id: `msg_fallback_${data.id || "default"}`,
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
        return data;
      };

      currentResponseIdRef.current = response.id;
      response = preprocessResponse(response);

      console.log("processing steps: ", response);
      // stepData are the new steps
      // there could be multiple, if the AI asked for an immediate screenshot or thought or something

      // TODO: process all output items, not just the first one of each type
      const messageItem: OpenAI.Responses.ResponseOutputItem | undefined =
        response.output.find((item) => item.type === "message");
      const computerItem: OpenAI.Responses.ResponseOutputItem | undefined =
        response.output.find((item) => item.type === "computer_call");
      const functionItem: OpenAI.Responses.ResponseOutputItem | undefined =
        response.output.find((item) => item.type === "function_call");

      if (messageItem && messageItem.content[0].type === "output_text") {
        const newStep: BrowserStep = {
          text: messageItem.content[0].text || "",
          reasoning: "Processing message",
          tool: "MESSAGE",
          stepNumber: stepNumber++,
          messageId: messageItem.id,
        };

        // Only add the step if we haven't seen this messageId before
        const isDuplicate = agentStateRef.current.steps.some(
          (step) =>
            step.messageId === messageItem.id && messageItem.id !== undefined,
        );

        if (!isDuplicate) {
          agentStateRef.current = {
            steps: [...agentStateRef.current.steps, newStep],
          };

          console.log(
            "agentStateRef.current.steps: ",
            agentStateRef.current.steps,
          );

          setUiState({
            steps: agentStateRef.current.steps,
          });
        }
      }

      if (!computerItem && !functionItem) {
        setIsWaitingForInput(true);

        // Focus the input when it becomes visible
        if (inputRef.current) {
          inputRef.current.focus();
        }
      } else if (computerItem) {
        let step: BrowserStep = {
          text: "Doing " + computerItem.action.type || "",
          reasoning: "Taking action",
          tool: computerItem.action.type.toUpperCase() as
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
        if(computerItem.action.type==="click") {
          step.text = "Clicking at " + computerItem.action.x + ", " + computerItem.action.y;
        } else if(computerItem.action.type==="double_click") {
          step.text = "Double clicking at " + computerItem.action.x + ", " + computerItem.action.y;
        } else if(computerItem.action.type==="drag") {
          step.text = "Dragging from " + computerItem.action.path[0] + " to " + computerItem.action.path[computerItem.action.path.length - 1];
        } else if(computerItem.action.type==="type") {
          step.text = "Typing " + computerItem.action.text;
        } else if(computerItem.action.type==="keypress") {
          step.text = "Pressing " + computerItem.action.keys.join(", ");
        } else if(computerItem.action.type==="move") {
          step.text = "Moving to " + computerItem.action.x + ", " + computerItem.action.y;
        } else if(computerItem.action.type==="scroll") {
          step.text = "Scrolling " + computerItem.action.scroll_x + " " + computerItem.action.scroll_y;
        } else if(computerItem.action.type==="screenshot") {
          step.text = "Taking screenshot";
        } else if(computerItem.action.type==="wait") {
          step.text = "Waiting for a moment";
        }

        agentStateRef.current = {
          ...agentStateRef.current,
          steps: [...agentStateRef.current.steps, step],
        };

        setUiState({
          steps: agentStateRef.current.steps,
        });

        // Handle computer call
        const responseOutputItems: OpenAI.Responses.ResponseOutputItem[] = [];
        if (computerItem) {
          responseOutputItems.push(computerItem);
        }
        if (functionItem) {
          responseOutputItems.push(functionItem);
        }
        setIsWaitingForAgent(true);
        const computerCallData = await takeAction(responseOutputItems);
        const nextStepData = await getResponse(
          computerCallData,
          currentResponseIdRef.current,
        );
        setIsWaitingForAgent(false);
        return processStep(nextStepData, stepNumber);
      } else {
        console.log("No message or computer call output");
        console.log("messageItem", messageItem);
        console.log("computerItem", computerItem);
      }
    },
    [],
  );

  const handleUserInput = useCallback(async (input: string) => {
    if (!input.trim()) return;

    const userStep: BrowserStep = {
      text: input,
      reasoning: "User input",
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
        reasoning: "Error handling user input",
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
            step.tool === "MESSAGE" && step.reasoning === "Processing message";
          // Determine if this is a user input message
          const isUserInput =
            step.tool === "MESSAGE" && step.reasoning === "User input";
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
              <div className="font-medium text-neutral-200">{step.text}</div>
              {/* Show reasoning for all steps except the last one */}
              <div className="rounded-md bg-neutral-800/30 p-2 text-sm text-neutral-400">
                <span className="font-semibold">Reasoning: </span>
                {step.reasoning}
              </div>
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
          {/* <Button
            size="icon"
            variant="ghost"
            className="absolute right-8 bottom-2 text-neutral-400 hover:text-neutral-300 cursor-pointer"
            onClick={() => {
              emit("agent_type_text", {
                text: "Hello, world!",
              });
            }}
          >
            <SparklesIcon className="h-4 w-4" />
          </Button> */}
        </div>
      </div>
    </div>
  );
}
