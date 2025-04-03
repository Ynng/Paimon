import OpenAI from "openai";
import { Agent } from "./agent";
import { TauriComputer } from "./computer";

export async function getResponse(
  input: OpenAI.Responses.ResponseInput,
  responseId: string | null,
): Promise<OpenAI.Responses.Response> {
  try {
    const computer = new TauriComputer();
    await computer.init();
    const agent = new Agent("computer-use-preview", computer);
    let result = await agent.getResponse(input, responseId);
    return result;
  } catch (error) {
    console.error("Error in processInput:", error);
    throw error;
  }
}

export async function takeAction(
  output: OpenAI.Responses.ResponseOutputItem[],
): Promise<
  (
    | OpenAI.Responses.ResponseInputItem.Message
    | OpenAI.Responses.ResponseInputItem.ComputerCallOutput
    | OpenAI.Responses.ResponseInputItem.FunctionCallOutput
  )[]
> {
  try {
    console.log("agent's request for action:", output);
    const computer = new TauriComputer();
    await computer.init();
    const agent = new Agent("computer-use-preview", computer);
    const result = await agent.takeAction(output);
    console.log("took action, results:", result);
    return result;
  } catch (error) {
    console.error("Error in takeAction:", error);
    throw error;
  }
}
