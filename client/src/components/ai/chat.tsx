import { getResponse, takeAction } from "@/lib/cua";
import * as CUA from "@/lib/cua";
import { cn } from "@/lib/utils";
import { appStore } from "@/stores/app";
import OpenAI from "openai";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

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
  const [uiState, setUiState] = useState<{
    steps: BrowserStep[];
  }>({
    steps: [],
  });

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
    async (stepData: OpenAI.Responses.Response, stepNumber = 1) => {
      if (isAgentFinishedRef.current) {
        return;
      }
      const preprocessResponse = (data: OpenAI.Responses.Response) => {
        if (data.output[0]?.type === "reasoning") {
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

      stepData = preprocessResponse(stepData);

      currentResponseIdRef.current = stepData.id;

      console.log("processing steps: ", stepData);
      // stepData are the new steps
      // there could be multiple, if the AI asked for an immediate screenshot or thought or something

      // Find the first message, computer call, and function call items
      const messageItem = stepData.output.find(
        (item) => item.type === "message",
      );
      const computerItem = stepData.output.find(
        (item) => item.type === "computer_call",
      );
      const functionItem = stepData.output.find(
        (item) => item.type === "function_call",
      );

      if (messageItem && messageItem.content[0].type === "output_text") {
        const newStep: BrowserStep = {
          text: messageItem.content?.[0].text || "",
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
            ...agentStateRef.current,
            steps: [...agentStateRef.current.steps, newStep],
          };

          setUiState((prev) => ({
            ...prev,
            steps: agentStateRef.current.steps,
          }));
        }
      }

      if (!computerItem && !functionItem) {
        setIsWaitingForInput(true);

        // Focus the input when it becomes visible
        if (inputRef.current) {
          inputRef.current.focus();
        }
      } else if (computerItem) {
        agentStateRef.current = {
          ...agentStateRef.current,
          steps: [
            ...agentStateRef.current.steps,
            {
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
            },
          ],
        };

        setUiState((prev) => ({
          ...prev,
          steps: agentStateRef.current.steps,
        }));

        // Handle computer call
        const responseOutputItems: OpenAI.Responses.ResponseOutputItem[] = [];
        if (computerItem) {
          responseOutputItems.push(computerItem);
        }
        if (functionItem) {
          responseOutputItems.push(functionItem);
        }
        const computerCallData = await takeAction(responseOutputItems);
        const nextStepData = await getResponse(computerCallData, stepData.id);
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
        ...agentStateRef.current,
        steps: [...agentStateRef.current.steps, newStep],
      };

      setUiState((prev) => ({
        ...prev,
        steps: agentStateRef.current.steps,
      }));
    };

    updateSteps(userStep);
    setIsWaitingForInput(false);
    setUserInput("");

    try {
      let nextStepData = await getResponse(
        [{ role: "user", content: input }],
        currentResponseIdRef.current,
      );
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
      return null;
    }
  }, []);

  return (
    <div className={cn("flex h-full flex-col", className)} {...props}>
      <div
        ref={chatContainerRef}
        className="macos:pt-6 flex min-h-0 w-full grow flex-col items-stretch justify-start gap-y-4 overflow-x-hidden overflow-y-auto p-2 pt-2"
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
                  ? "bg-[hsl(0,0%,13%)]"
                  : isSystemMessage
                    ? "bg-[hsl(0,0%,13%)]"
                    : "bg-[hsl(0,0%,13%)]",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="h-6s rounded-sm bg-neutral-700/70 px-2 py-1 text-xs font-medium text-neutral-300">
                  Step {step.stepNumber}
                </span>
                <span
                  className={cn(
                    "h-6 rounded-sm px-2 py-1 text-xs",
                    ToolToColor[step.tool],
                  )}
                >
                  {step.tool}
                </span>
              </div>
              <div className="font-medium text-neutral-200">
                {isSystemMessage && step.tool === "MESSAGE" ? (
                  <>
                    {(() => {
                      // Check if this is a message with a question
                      if (step.text.includes("?")) {
                        // Find all sentences that end with a question mark
                        const sentences = step.text.match(/[^.!?]+[.!?]+/g) || [
                          step.text,
                        ];

                        // Separate questions from non-questions
                        const questions = sentences.filter((s) =>
                          s.trim().endsWith("?"),
                        );
                        const nonQuestions = sentences.filter(
                          (s) => !s.trim().endsWith("?"),
                        );

                        // Join non-questions as the answer
                        const answerText = nonQuestions.join(" ").trim();

                        // Join questions as the question
                        const questionText = questions.join(" ").trim();

                        // Check if the entire message is just a question
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const isOnlyQuestion =
                          step.text.trim() === questionText;

                        // Extract answer content from the message or find it in previous steps
                        let displayAnswerText = answerText;

                        // If there's no answer content but there is a question
                        if (!displayAnswerText && questionText) {
                          // First, check if this step has a specific answer marker
                          if (step.text.includes("ANSWER:")) {
                            const answerParts = step.text.split("ANSWER:");
                            if (answerParts.length > 1) {
                              // Extract the text after "ANSWER:" and before any "QUESTION" marker
                              let extractedAnswer = answerParts[1].trim();
                              if (extractedAnswer.includes("QUESTION")) {
                                extractedAnswer = extractedAnswer
                                  .split("QUESTION")[0]
                                  .trim();
                              }
                              if (extractedAnswer) {
                                displayAnswerText = extractedAnswer;
                              }
                            }
                          }

                          // If we still don't have an answer, look for the first message step
                          if (!displayAnswerText) {
                            // Look for relevant information in previous steps
                            const previousSteps = uiState.steps.slice(0, index);

                            // Find the first informative MESSAGE step that's not a question
                            const infoStep = previousSteps.find(
                              (s) =>
                                s.tool === "MESSAGE" &&
                                s.text &&
                                !s.text.includes("?") && // Not a question
                                s.text.length > 10,
                            );

                            if (infoStep) {
                              // Use the content from the informative step
                              displayAnswerText = infoStep.text;
                            } else {
                              // Default message if no relevant info found
                              displayAnswerText =
                                "I'm currently searching for this information. The results will be displayed here when available.";
                            }
                          }
                        } else if (!displayAnswerText) {
                          // For other cases with no answer content
                          displayAnswerText = step.text;
                        }

                        // Only render the answer part in this message block
                        return (
                          <div className="mb-2">
                            <div className="mb-1 text-xs font-semibold text-neutral-400">
                              ANSWER:
                            </div>
                            <div className="rounded-md bg-neutral-800/50 p-2">
                              <span>{displayAnswerText}</span>
                            </div>
                          </div>
                        );
                      } else {
                        // For regular messages without questions, format them as answers
                        return (
                          <div className="mb-2">
                            <div className="rounded-md bg-neutral-800/50 p-2">
                              <span>{step.text}</span>
                            </div>
                          </div>
                        );
                      }
                    })()}
                  </>
                ) : (
                  <div className="rounded-md bg-neutral-800/50 p-2">
                    {step.text}
                  </div>
                )}
              </div>
              {/* Show reasoning for all steps except the last one */}
              {(!isSystemMessage || index < uiState.steps.length - 1) && (
                <div className="rounded-md bg-neutral-800/30 p-2 text-sm text-neutral-400">
                  <span className="font-semibold">Reasoning: </span>
                  {step.reasoning}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="w-full p-4">
        <div className="w-full rounded-2xl dark:bg-neutral-700">
          <textarea
            ref={inputRef}
            className="max-h-56 w-full resize-none overflow-x-hidden overflow-y-auto rounded-2xl p-4 text-sm text-wrap text-neutral-300 outline-none"
            placeholder="What do you want to do?"
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
        </div>
      </div>
    </div>
  );
}
