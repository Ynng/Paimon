import { handleInput, takeAction } from "@/lib/cua";
import * as CUA from "@/lib/cua";
import { cn } from "@/lib/utils";
import { appStore } from "@/stores/app";
import OpenAI from "openai";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

export type ChatProps = React.HTMLAttributes<HTMLDivElement> & {};

export interface BrowserStep {
  text: string;
  reasoning: string;
  tool:
    | "GOTO"
    | "ACT"
    | "EXTRACT"
    | "OBSERVE"
    | "CLOSE"
    | "WAIT"
    | "NAVBACK"
    | "MESSAGE"
    | "CLICK"
    | "TYPE"
    | "KEYPRESS"
    | "SCROLL"
    | "DOUBLECLICK"
    | "DRAG"
    | "SCREENSHOT"
    | "MOVE";
  instruction: string;
  stepNumber?: number;
  messageId?: string;
}

interface AgentState {
  steps: BrowserStep[];
  isLoading: boolean;
}

export function Chat({ className, ...props }: ChatProps) {
  const snap = useSnapshot(appStore);
  const [isLoading, setIsLoading] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentResponseRef = useRef<{ id: string } | null>(null);
  const [isAgentFinished, setIsAgentFinished] = useState(false);
  const posthog = usePostHog();
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  const agentStateRef = useRef<AgentState>({
    steps: [],
    isLoading: false,
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
    async (stepData: OpenAI.Responses.Response[], stepNumber = 1) => {
      const messageItems = stepData.find((step) =>
        step.output.find((item) => item.type === "message"),
      );
      const computerCallItems = stepData.find((step) =>
        step.output.find((item) => item.type === "computer_call"),
      );
      const functionCallItems = stepData.find((step) =>
        step.output.find((item) => item.type === "function_call"),
      );

      const messageItem = messageItems?.output.find(
        (item) => item.type === "message",
      );
      const computerItem = computerCallItems?.output.find(
        (item) => item.type === "computer_call",
      );
      const functionItem = functionCallItems?.output.find(
        (item) => item.type === "function_call",
      );

      // Extract context from message content
      const contextClues = {
        website: "",
        action: "",
        subject: "",
        location: "",
        filter: "",
        selection: "",
        goal: "", // The overall user goal
        lastAction: "", // Keep track of the previous action
      };

      // Extract context from message content if available
      if (messageItem && messageItem.content) {
        // Extract text from content items
        const messageText =
          messageItem.content
            .filter((content) => content.type === "output_text")
            .map((content) => content.text)
            .join(" ") || "";

        // Look for goal statements
        const goalPatterns = [
          /(?:I want to|I'd like to|I need to|Can you|Please)\s+([^.?!]+)[.?!]/i,
          /(?:find|search|look up|tell me|show me)\s+([^.?!]+)[.?!]/i,
          /(?:what is|how much|how many|where is|when is)\s+([^.?!]+)[?]/i,
        ];

        // Extract website names
        const websitePatterns = [
          /(?:on|to|using|visit|open|access|browse)\s+([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)+)/i,
          /([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)+)\s+(?:website|site|page)/i,
          /(?:website|site|page)\s+([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)+)/i,
        ];

        // Extract search terms
        const searchPatterns = [
          /(?:search|look|find)(?:\s+for)?\s+([^.,;]+)/i,
          /searching\s+for\s+([^.,;]+)/i,
        ];

        // Extract location information
        const locationPatterns = [
          /(?:in|near|at|around)\s+([A-Za-z\s]+(?:City|Town|Village|County|State|Province|District|Area|Region))/i,
          /location\s+(?:in|near|at|to)\s+([^.,;]+)/i,
          /([A-Za-z\s]+(?:City|Town|Village|County|State|Province|District|Area|Region))/i,
        ];

        // Extract filter information
        const filterPatterns = [
          /filter\s+(?:by|for|with)\s+([^.,;]+)/i,
          /(?:set|adjust|change)\s+(?:the)?\s+([^\s]+)\s+(?:filter|setting|option)\s+(?:to|for)?\s+([^.,;]+)/i,
        ];

        // Extract selection information
        const selectionPatterns = [
          /(?:select|choose|pick)\s+(?:the)?\s+([^.,;]+)/i,
          /selecting\s+(?:the)?\s+([^.,;]+)/i,
        ];

        // Apply all patterns to extract context
        for (const pattern of goalPatterns) {
          const match = messageText.match(pattern);
          if (match && match[1]) {
            contextClues.goal = match[1].trim();
            break;
          }
        }

        for (const pattern of websitePatterns) {
          const match = messageText.match(pattern);
          if (match && match[1]) {
            contextClues.website = match[1].trim();
            break;
          }
        }

        for (const pattern of searchPatterns) {
          const match = messageText.match(pattern);
          if (match && match[1]) {
            contextClues.subject = match[1].trim();
            break;
          }
        }

        for (const pattern of locationPatterns) {
          const match = messageText.match(pattern);
          if (match && match[1]) {
            contextClues.location = match[1].trim();
            break;
          }
        }

        for (const pattern of filterPatterns) {
          const match = messageText.match(pattern);
          if (match && match[1]) {
            contextClues.filter = match[1].trim();
            if (match[2]) contextClues.filter += " " + match[2].trim();
            break;
          }
        }

        for (const pattern of selectionPatterns) {
          const match = messageText.match(pattern);
          if (match && match[1]) {
            contextClues.selection = match[1].trim();
            break;
          }
        }

        // Determine the main action from the message
        if (messageText.match(/search|find|look/i)) {
          contextClues.action = "searching";
        } else if (messageText.match(/select|choose|pick/i)) {
          contextClues.action = "selecting";
        } else if (messageText.match(/filter|adjust|set/i)) {
          contextClues.action = "filtering";
        } else if (messageText.match(/click|press|tap/i)) {
          contextClues.action = "clicking";
        } else if (messageText.match(/type|enter|input|fill/i)) {
          contextClues.action = "entering";
        } else if (messageText.match(/scroll|move/i)) {
          contextClues.action = "scrolling";
        }
      }

      // Create a concise, task-oriented reasoning description
      const createTaskDescription = (action: Action): string => {
        // Default descriptions based on action type
        const defaultDescriptions: Record<string, string> = {
          click: "Clicking on an element",
          type: "Entering text",
          keypress: "Pressing keyboard keys",
          scroll: "Scrolling the page",
          goto: "Navigating to a website",
          back: "Going back to previous page",
          wait: "Waiting for page to load",
          double_click: "Double-clicking on an element",
          drag: "Dragging an element",
          screenshot: "Taking a screenshot",
          move: "Moving the cursor",
          message: "Sending a message",
        };

        // Create specific descriptions based on context
        switch (action.type) {
          case "click":
            // Try to infer what's being clicked based on common UI patterns
            const x = typeof action.x === "number" ? action.x : 0;
            const y = typeof action.y === "number" ? action.y : 0;

            if (typeof action.x === "number" && typeof action.y === "number") {
              // Check if clicking in top-left corner (often navigation/menu)
              if (x < 100 && y < 100) {
                return "Opening navigation menu";
              }
              // Check if clicking in top-right corner (often account/settings)
              else if (x > 900 && y < 100) {
                return "Accessing account options";
              }
              // Check if clicking near bottom of page (often pagination/load more)
              else if (y > 500) {
                return "Loading more content";
              }
            }

            return "Selecting an interactive element";
          case "type":
            const text = typeof action.text === "string" ? action.text : "";
            if (text.includes("@") && text.includes("."))
              return "Entering email address";
            if (text.length > 20) return "Entering detailed information";
            if (/^\d+$/.test(text)) return "Entering numeric value";
            return text
              ? `Typing "${text.substring(0, 15)}${
                  text.length > 15 ? "..." : ""
                }"`
              : defaultDescriptions.type;
          case "keypress":
            const keys = Array.isArray(action.keys)
              ? action.keys.join(", ")
              : "";
            if (keys.includes("Enter")) return "Submitting form";
            if (keys.includes("Tab")) return "Moving to next field";
            if (keys.includes("Escape")) return "Closing dialog";
            return defaultDescriptions.keypress;
          case "scroll":
            const scrollY =
              typeof action.scroll_y === "number" ? action.scroll_y : 0;
            return scrollY > 0
              ? "Scrolling down to see more results"
              : "Scrolling up to previous content";
          case "wait":
            // Provide more specific wait descriptions
            if (contextClues.action === "searching") {
              return `Waiting for search results to load`;
            } else if (contextClues.website) {
              return `Waiting for ${contextClues.website} page to load`;
            } else if (contextClues.subject) {
              return `Waiting for ${contextClues.subject} content to appear`;
            }
            return "Waiting for page to respond";
          default:
            // For other action types, try to be more specific based on context
            if (action.type === "double_click" && contextClues.selection) {
              return `Opening ${contextClues.selection}`;
            } else if (action.type === "drag" && contextClues.action) {
              return `Adjusting ${contextClues.action} by dragging`;
            } else if (action.type === "screenshot") {
              return "Capturing screenshot of current view";
            } else if (action.type === "move" && contextClues.action) {
              return `Positioning cursor for ${contextClues.action}`;
            }
            return (
              defaultDescriptions[action.type] ||
              `Performing ${action.type} action`
            );
        }
      };

      if (
        !computerCallItems &&
        !functionCallItems &&
        messageItem &&
        messageItem.content[0].type === "output_text"
      ) {
        const newStep: BrowserStep = {
          text: messageItem.content?.[0].text || "",
          reasoning: "Processing message",
          tool: "MESSAGE",
          instruction: "",
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

        setIsWaitingForInput(true);
        currentResponseRef.current = {
          id: stepData[0].id,
        };

        // Focus the input when it becomes visible
        if (inputRef.current) {
          inputRef.current.focus();
        }
      } else if (computerItem || functionItem) {
        if (
          messageItem &&
          messageItem.type === "message" &&
          messageItem.content[0].type === "output_text"
        ) {
          const newStep: BrowserStep = {
            text: messageItem.content?.[0].text || "",
            reasoning: "Processing message",
            tool: "MESSAGE",
            instruction: "",
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
        let actionStep: BrowserStep | null = null;

        if (computerItem) {
          const action = computerItem.action;

          switch (action.type) {
            case "click":
              actionStep = {
                text: `Clicking at position (${action.x}, ${action.y})`,
                reasoning: generateDetailedReasoning(
                  action,
                  contextClues,
                  createTaskDescription,
                ),
                tool: "CLICK",
                instruction: `click(${action.x}, ${action.y})`,
                stepNumber: stepNumber++,
              };
              break;
            case "type":
              actionStep = {
                text: `Typing text: "${action.text}"`,
                reasoning: generateDetailedReasoning(
                  action,
                  contextClues,
                  createTaskDescription,
                ),
                tool: "TYPE",
                instruction: action.text || "",
                stepNumber: stepNumber++,
              };
              break;
            case "keypress":
              actionStep = {
                text: `Pressing keys: ${action.keys?.join(", ")}`,
                reasoning: generateDetailedReasoning(
                  action,
                  contextClues,
                  createTaskDescription,
                ),
                tool: "KEYPRESS",
                instruction: action.keys?.join(", ") || "",
                stepNumber: stepNumber++,
              };
              break;
            case "scroll":
              actionStep = {
                text: `Scrolling by (${action.scroll_x}, ${action.scroll_y})`,
                reasoning: generateDetailedReasoning(
                  action,
                  contextClues,
                  createTaskDescription,
                ),
                tool: "SCROLL",
                instruction: `scroll(${action.scroll_x}, ${action.scroll_y})`,
                stepNumber: stepNumber++,
              };
              break;
            default:
              // Create more specific text descriptions for different action types
              let actionText = `Performing ${action.type} action`;

              if (action.type === "wait") {
                actionText = "Waiting for page to respond";
              } else if (action.type === "double_click") {
                actionText = `Double-clicking at position (${action.x || 0}, ${
                  action.y || 0
                })`;
              } else if (action.type === "drag") {
                // Drag has a path array with start and end points
                const startPoint = action.path?.[0] || { x: 0, y: 0 };
                const endPoint = action.path?.[action.path?.length - 1] || {
                  x: 0,
                  y: 0,
                };
                actionText = `Dragging from (${startPoint.x}, ${startPoint.y}) to (${endPoint.x}, ${endPoint.y})`;
              } else if (action.type === "screenshot") {
                actionText = "Taking screenshot of current page";
              } else if (action.type === "move") {
                actionText = `Moving cursor to position (${action.x || 0}, ${
                  action.y || 0
                })`;
              }

              actionStep = {
                text: actionText,
                reasoning: generateDetailedReasoning(
                  action,
                  contextClues,
                  createTaskDescription,
                ),
                tool: action.type.toUpperCase() as unknown as
                  | "GOTO"
                  | "ACT"
                  | "EXTRACT"
                  | "OBSERVE"
                  | "CLOSE"
                  | "WAIT"
                  | "NAVBACK"
                  | "MESSAGE"
                  | "CLICK"
                  | "TYPE"
                  | "KEYPRESS"
                  | "SCROLL"
                  | "DOUBLECLICK"
                  | "DRAG"
                  | "SCREENSHOT"
                  | "MOVE",
                instruction: action.type,
                stepNumber: stepNumber++,
              };
          }
        } else if (functionItem) {
          // we don't have any other functions
        }
        agentStateRef.current = {
          ...agentStateRef.current,
          steps: [
            ...agentStateRef.current.steps,
            actionStep ?? {
              text: "Unknown action",
              reasoning: "Default action",
              tool: "ACT",
              instruction: "",
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
        const nextStepData = await handleInput(computerCallData);

        // Handle reasoning-only responses by adding a message item if needed
        if (
          nextStepData[0]?.output?.length === 1 &&
          nextStepData[0]?.output[0]?.type === "reasoning"
        ) {
          console.log("Detected reasoning-only response, adding message item");
          // Add a message item to ensure the reasoning is followed by another item
          nextStepData[0].output.push({
            id: `msg_fallback_${nextStepData[0]?.id || "default"}`,
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text: "I'll continue with the task.",
                annotations: [],
              },
            ],
          });
        }

        currentResponseRef.current = {
          id: nextStepData[0]?.id || "",
        };

        // Process the next step recursively - ensure nextStepData is an array first
        if (Array.isArray(nextStepData)) {
          return processStep(nextStepData, stepNumber);
        } else {
          console.error("stepData is not an array:", nextStepData);
          // Return gracefully instead of causing an error
          return;
        }
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
      instruction: "",
      stepNumber: agentStateRef.current.steps.length + 1,
    };

    agentStateRef.current = {
      ...agentStateRef.current,
      steps: [...agentStateRef.current.steps, userStep],
    };

    setUiState((prev) => ({
      ...prev,
      steps: agentStateRef.current.steps,
    }));

    setIsWaitingForInput(false);

    setUserInput("");

    try {
      const nextStepData = await CUA.handleInput(
        [
          {
            role: "user",
            content: input,
          },
        ],
        currentResponseRef.current?.id,
      );
      if (
        nextStepData[0]?.output?.length === 1 &&
        nextStepData[0]?.output[0]?.type === "reasoning"
      ) {
        console.log("Detected reasoning-only response, adding message item");
        // Add a message item to ensure the reasoning is followed by another item
        nextStepData[0].output.push({
          id: `msg_fallback_${nextStepData[0]?.id || "default"}`,
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

      currentResponseRef.current = {
        id: nextStepData[0].id,
      };

      const stepNumber = agentStateRef.current.steps.length + 1;

      // Process the next step recursively
      return processStep(nextStepData, stepNumber);
    } catch (error) {
      console.error("Error handling user input:", error);

      // Check if this is a reasoning item error
      if (
        error instanceof Error &&
        (error.message.includes("reasoning") ||
          error.message.includes("without its required following item"))
      ) {
        console.log(
          "Handling reasoning item error, retrying with modified request",
        );
        try {
          // Try again with a more specific instruction
          const retryData = await CUA.handleInput(
            [
              {
                role: "user",
                content: input,
              },
            ],
            currentResponseRef.current?.id,
          );

          // If we still have a reasoning-only response, add a message item
          if (
            retryData[0]?.output?.length === 1 &&
            retryData[0]?.output[0]?.type === "reasoning"
          ) {
            console.log(
              "Still got reasoning-only response, adding message item",
            );
            // Add a message item to ensure reasoning is followed by another item
            retryData[0].output.push({
              id: `msg_fallback_${retryData[0]?.id || "default"}`,
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

          currentResponseRef.current = {
            id: retryData[0].id,
          };

          const stepNumber = agentStateRef.current.steps.length + 1;

          // Process the retry step
          return processStep(retryData, stepNumber);
        } catch (retryError) {
          console.error("Error during retry:", retryError);
          // Fall through to the default error handling
        }
      }

      // Default error handling
      const errorStep: BrowserStep = {
        text: "Sorry, there was an error processing your request. Please try again.",
        reasoning: "Error handling user input",
        tool: "MESSAGE",
        instruction: "",
        stepNumber: agentStateRef.current.steps.length + 1,
      };

      agentStateRef.current = {
        ...agentStateRef.current,
        steps: [...agentStateRef.current.steps, errorStep],
      };

      setUiState((prev) => ({
        ...prev,
        steps: agentStateRef.current.steps,
      }));

      setUserInput("");

      setIsWaitingForInput(true);
      return null;
    }
  }, []);

  return (
    <div className={cn("flex h-full flex-col", className)} {...props}>
      <div
        ref={chatContainerRef}
        className="macos:pt-6 flex min-h-0 w-full grow items-center justify-center space-y-4 overflow-x-hidden overflow-y-auto p-2 pt-2"
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
              className={`p-4 ${
                isUserInput
                  ? "bg-white"
                  : isSystemMessage
                    ? "bg-[#2E191E] text-white"
                    : "bg-[#FCFCFC]"
              } space-y-2 border border-[#B3B1B0]`}
            >
              <div className="flex items-center justify-between">
                {/* Step number */}
                <span
                  className={`text-sm ${
                    isSystemMessage ? "text-[gray-200]" : "text-[#2E191E]"
                  }`}
                >
                  Step {step.stepNumber}
                </span>
                {/* Tool name */}
                <span
                  className={`px-2 py-1 ${
                    isSystemMessage ? "text-gray-200" : "text-white-200"
                  } border border-[#CAC8C7] text-xs`}
                >
                  {step.tool}
                </span>
              </div>
              <div className="font-medium">
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
                          <div className="mb-3">
                            <div className="mb-1 text-xs font-semibold text-gray-200">
                              ANSWER:
                            </div>
                            <div className="p-2">
                              <span>{displayAnswerText}</span>
                            </div>
                          </div>
                        );
                      } else {
                        // For regular messages without questions, format them as answers
                        return (
                          <div className="mb-3">
                            {/* <div className="text-xs font-semibold text-gray-200 mb-1">
                                      ANSWER:
                                    </div> */}
                            <div className="p-2">
                              <span>{step.text}</span>
                            </div>
                          </div>
                        );
                      }
                    })()}
                  </>
                ) : (
                  step.text
                )}
              </div>
              {/* Show reasoning for all steps except the last one */}
              {(!isSystemMessage || index < uiState.steps.length - 1) && (
                <p className="text-white-200 text-sm">
                  <span className="font-semibold">Reasoning: </span>
                  {step.reasoning}
                </p>
              )}
            </div>
          );
        })}

        {/* Add a separate question message if the last message had a question */}
        {uiState.steps.length > 0 &&
          (() => {
            const lastStep = uiState.steps[uiState.steps.length - 1];
            if (lastStep.tool === "MESSAGE" && lastStep.text.includes("?")) {
              // Find all sentences that end with a question mark
              const sentences = lastStep.text.match(/[^.!?]+[.!?]+/g) || [
                lastStep.text,
              ];

              // Extract questions
              const questions = sentences.filter((s) => s.trim().endsWith("?"));
              const questionText = questions.join(" ").trim();

              // Check if the entire message is just a question
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const isOnlyQuestion = lastStep.text.trim() === questionText;

              if (questionText) {
                return (
                  <div
                    className={`font-ppsupply mt-2 space-y-2 bg-[#2E191E] p-4 text-white`}
                  >
                    <div className="flex items-center justify-between">
                      {/* <span className="text-sm text-gray-200">
                              {isOnlyQuestion ? "Question" : "Follow-up"}
                            </span> */}
                      {/* <span className="px-2 py-1 text-gray-200 rounded text-xs">
                              QUESTION
                            </span> */}
                    </div>
                    <div className="font-medium">
                      <div className="border-l-2 p-2">
                        <span>{questionText}</span>
                      </div>
                    </div>
                  </div>
                );
              }
            }
            return null;
          })()}
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
                }
                handleUserInput(userInput);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

type Action =
  | OpenAI.Responses.ResponseComputerToolCall.Click
  | OpenAI.Responses.ResponseComputerToolCall.Type
  | OpenAI.Responses.ResponseComputerToolCall.Keypress
  | OpenAI.Responses.ResponseComputerToolCall.Scroll
  | OpenAI.Responses.ResponseComputerToolCall.Wait
  | OpenAI.Responses.ResponseComputerToolCall.DoubleClick
  | OpenAI.Responses.ResponseComputerToolCall.Drag
  | OpenAI.Responses.ResponseComputerToolCall.Screenshot
  | OpenAI.Responses.ResponseComputerToolCall.Move
  | OpenAI.Responses.ResponseOutputMessage;

// Generate detailed reasoning for actions based on context and action type
const generateDetailedReasoning = (
  action: Action,
  contextClues: Record<string, unknown>,
  createTaskDescription: (action: Action) => string,
): string => {
  // Get basic description first
  const basicDescription = createTaskDescription(action);

  // Add more detailed context based on the action type and available context
  switch (action.type) {
    case "click":
      if (contextClues.goal) {
        return `${basicDescription} to begin searching for information about ${contextClues.goal}. This interaction initiates the search process.`;
      }
      return `${basicDescription} to interact with the page interface. This helps navigate through the content to find the requested information.`;

    case "type":
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const text = action.text || "";
      if (contextClues.goal) {
        return `${basicDescription} to search for specific information about ${contextClues.goal}. Entering these search terms will help retrieve relevant results.`;
      }
      return `${basicDescription} to provide input needed for this search. This text will help narrow down the results to find the specific information requested.`;

    case "keypress":
      const keys = Array.isArray(action.keys) ? action.keys.join(", ") : "";
      if (keys.includes("ENTER")) {
        return `Submitting the search query to find information about ${
          contextClues.goal || "the requested topic"
        }. This will execute the search and retrieve relevant results.`;
      }
      return `${basicDescription} to efficiently interact with the page. This keyboard interaction helps streamline the navigation process.`;

    case "scroll":
      return `${basicDescription} to view additional content that might contain the requested information about ${
        contextClues.goal || "the topic"
      }. Scrolling allows examining more search results or content.`;

    case "wait":
      return `${basicDescription} while the page loads the requested information. This ensures all content is properly displayed before proceeding.`;

    case "double_click":
      return `${basicDescription} to interact with this element. Double-clicking often opens or expands content that may contain relevant information.`;

    case "drag":
      // Get start and end points from the path if available
      let startPoint = { x: 0, y: 0 };
      let endPoint = { x: 0, y: 0 };
      if (Array.isArray(action.path) && action.path.length > 0) {
        startPoint = action.path[0] as { x: number; y: number };
        endPoint = action.path[action.path.length - 1] as {
          x: number;
          y: number;
        };
      }
      return `${basicDescription} to adjust the view or interact with content. Dragging from (${startPoint.x}, ${startPoint.y}) to (${endPoint.x}, ${endPoint.y}) helps reveal or organize information in a more useful way.`;

    case "screenshot":
      return `${basicDescription} to capture the visual information displayed. This preserves the current state of the information for reference.`;

    case "move":
      return `${basicDescription} to prepare for the next interaction. Positioning the cursor is necessary before clicking or selecting content.`;

    case "message":
      const content = action.content.join("\n");
      if (
        content.startsWith("yes") ||
        content.startsWith("no") ||
        content.includes("?")
      ) {
        return `Providing additional input to refine the search for information about ${
          contextClues.goal || "the requested topic"
        }. This clarification helps the assistant provide more relevant results.`;
      }
      return `Communicating with the assistant about ${
        contextClues.goal || "the requested information"
      }. This exchange helps clarify needs and receive appropriate information.`;

    default:
      return `${basicDescription} to progress in finding information about ${
        contextClues.goal || "the requested topic"
      }. This action is part of the process to retrieve the relevant data.`;
  }
};
