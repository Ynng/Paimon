import OpenAI from "openai";
import { Agent } from "./agent";
import { TauriComputer } from "./computer";

export async function handleInput(
  input: OpenAI.Responses.ResponseInput,
  responseId?: string,
): Promise<OpenAI.Responses.Response[]> {
  let computer: TauriComputer | null = null;
  let agent: Agent | null = null;

  try {
    computer = new TauriComputer();
    await computer.init();

    agent = new Agent("computer-use-preview", computer);

    let result = await agent.getAction(input, responseId);

    // If the agent wants a screenshot, handle it immediately
    if (result.output.find((item) => item.type === "computer_call")) {
      const computerCall = result.output.find(
        (item) => item.type === "computer_call",
      );

      if (computerCall?.action.type === "screenshot") {
        const screenshotAction = await agent.takeAction(result.output);
        result = await agent.getAction(
          screenshotAction.filter((item) => item.type !== "message"),
          result.id,
        );
      }
    }

    // If the generated action is only reasoning, request a real action
    if (
      result.output.length === 1 &&
      result.output.find((item) => item.type === "reasoning")
    ) {
      do {
        result = await agent.getAction(
          [
            {
              role: "user",
              content: "Please continue with the task.",
            },
          ],
          result.id,
        );
      } while (
        result.output.length === 1 &&
        result.output.find((item) => item.type === "reasoning")
      );
    }

    return [result];
  } catch (error) {
    console.error("Error in processInput:", error);
    throw error;
  }
}

export async function takeAction(
  output: OpenAI.Responses.ResponseOutputItem[],
): Promise<
  (
    | OpenAI.Responses.ResponseOutputMessage
    | OpenAI.Responses.ResponseComputerToolCallOutputItem
    | OpenAI.Responses.ResponseFunctionToolCallOutputItem
  )[]
> {
  let computer: TauriComputer | null = null;
  let agent: Agent | null = null;

  try {
    console.log("output", output);

    computer = new TauriComputer();
    await computer.init();
    agent = new Agent("computer-use-preview", computer);
    const result = await agent.takeAction(output);

    return result;
  } catch (error) {
    console.error("Error in takeAction:", error);
    throw error;
  }
}
