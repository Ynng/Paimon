import OpenAI from "openai";
import { TauriComputer } from "./computer";

type AcknowledgeSafetyCheckCallback = (message: string) => boolean;

// A stateless agent
export class Agent {
  private client: OpenAI;
  private model: string;
  private computer: TauriComputer;
  private tools: OpenAI.Responses.Tool[];
  private printSteps: boolean = true;
  private acknowledgeSafetyCheckCallback: AcknowledgeSafetyCheckCallback;

  constructor(
    model: string = "computer-use-preview",
    computer: TauriComputer,
    acknowledgeSafetyCheckCallback: AcknowledgeSafetyCheckCallback = () => true,
  ) {
    this.client = new OpenAI({
      dangerouslyAllowBrowser: true,
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    });
    this.model = model;
    this.computer = computer;
    this.acknowledgeSafetyCheckCallback = acknowledgeSafetyCheckCallback;

    this.tools = [
      {
        type: "computer-preview",
        display_width: computer.dimensions[0],
        display_height: computer.dimensions[1],
        environment: computer.environment,
      },
    ];
  }

  private async createResponse(
    options: OpenAI.Responses.ResponseCreateParamsNonStreaming,
  ): Promise<OpenAI.Responses.Response> {
    return await this.client.responses.create(options);
  }

  async getResponse(
    inputItems: OpenAI.Responses.ResponseInput,
    previousResponseId: string | null,
  ): Promise<OpenAI.Responses.Response> {
    // If no previousResponseId, insert the system prompt before other inputs
    if (!previousResponseId) {
      // Check if the first message is already a system message
      const hasSystemMessage =
        inputItems.length > 0 &&
        "role" in inputItems[0] &&
        inputItems[0].role === "system";

      if (!hasSystemMessage) {
        inputItems = [
          {
            role: "system",
            content:
              "You are a helpful assistant that can use a macos desktop to accomplish tasks. Your starting point is the macos desktop. Use the windows, files and applications available to you to accomplish the task. Do not ask clarifying questions unless you are stuck, it's better to try things out and get some results before asking for help.",
          },
          ...inputItems,
          {
            role: "assistant",
            content:
              "I'll help you with that task.",
          },
        ];
      }
    }

    const response = await this.createResponse({
      model: this.model,
      input: inputItems,
      tools: this.tools,
      truncation: "auto",
      ...(previousResponseId
        ? { previous_response_id: previousResponseId }
        : {}),
    });

    console.log("response", response);

    return response;
  }

  async takeAction(
    output: OpenAI.Responses.ResponseOutputItem[],
  ): Promise<
    (
      | OpenAI.Responses.ResponseInputItem.Message
      | OpenAI.Responses.ResponseInputItem.ComputerCallOutput
      | OpenAI.Responses.ResponseInputItem.FunctionCallOutput
    )[]
  > {
    const results: (
      | OpenAI.Responses.ResponseInputItem.Message
      | OpenAI.Responses.ResponseInputItem.ComputerCallOutput
      | OpenAI.Responses.ResponseInputItem.FunctionCallOutput
    )[] = [];

    // Process actions sequentially instead of in parallel
    for (const item of output) {
      if (item.type === "message") {
        // Do nothing for message items
      } else if (item.type === "computer_call") {
        const result = await this.takeComputerAction(item);
        results.push(result);
      } else if (item.type === "function_call") {
        const result = await this.takeFunctionAction(item);
        results.push(result);
      }
    }

    return results;
  }

  async takeComputerAction(
    computerItem: OpenAI.Responses.ResponseComputerToolCall,
  ): Promise<OpenAI.Responses.ResponseInputItem.ComputerCallOutput> {
    const action = computerItem.action;
    const actionType = action.type;
    const actionArgs = Object.fromEntries(
      Object.entries(action).filter(([key]) => key !== "type"),
    );

    if (this.printSteps) {
      console.log("computerItem", computerItem);
      console.log(`${actionType}(${JSON.stringify(actionArgs)})`);
    }

    if (!this.computer) {
      throw new Error("Computer not initialized");
    }

    const method = (this.computer as unknown as Record<string, unknown>)[
      actionType
    ] as (...args: unknown[]) => unknown;
    await method.apply(this.computer, Object.values(actionArgs));

    const screenshot = await this.computer.screenshot();
    
    const pendingChecks = computerItem.pending_safety_checks || [];
    for (const check of pendingChecks) {
      const message = check.message;
      if (!this.acknowledgeSafetyCheckCallback(message)) {
        throw new Error(
          `Safety check failed: ${message}. Cannot continue with unacknowledged safety checks.`,
        );
      }
    }

    return {
      type: "computer_call_output",
      call_id: computerItem.call_id,
      acknowledged_safety_checks: pendingChecks,
      output: {
        type: "computer_screenshot",
        image_url: screenshot,
      },
    };
  }

  async takeFunctionAction(
    functionItem: OpenAI.Responses.ResponseFunctionToolCall,
  ): Promise<OpenAI.Responses.ResponseInputItem.FunctionCallOutput> {
    const name = functionItem.name;
    const args = JSON.parse(functionItem.arguments);
    if (this.printSteps) {
      console.log(`${name}(${JSON.stringify(args)})`);
    }

    if (
      this.computer &&
      typeof (this.computer as unknown as Record<string, unknown>)[name] ===
        "function"
    ) {
      const method = (this.computer as unknown as Record<string, unknown>)[
        name
      ] as (...args: unknown[]) => unknown;
      await method.apply(this.computer, Object.values(args));
    } else {
      throw new Error(`Function ${name} not found`);
    }

    if (!functionItem.id) {
      throw new Error("Function call item ID missing");
    }

    return {
      id: functionItem.id,
      type: "function_call_output",
      call_id: functionItem.call_id,
      output: "success", //TODO: add actual output
    };
  }
}
