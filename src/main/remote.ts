import { getLogger } from "./logger";
import { RemotePromptRequest } from "../types/remote";
import { callMcpTool, listMcpTools, McpToolDefinition } from "./mcp";

const activeRequests = new Map<string, AbortController>();
const MAX_TOOL_CALL_ROUNDS = 8;

export async function promptRemote(
  request: RemotePromptRequest,
): Promise<string> {
  const endpoint = request.endpoint.trim();
  const model = request.model.trim();

  if (!endpoint) {
    throw new Error("Remote endpoint is required.");
  }

  if (!model) {
    throw new Error("Remote model is required.");
  }

  if (!request.messages.length) {
    throw new Error("Remote request requires at least one message.");
  }

  const abortController = new AbortController();
  activeRequests.set(request.requestUUID, abortController);
  const messages: Array<Record<string, unknown>> = request.messages.map(
    (message) => ({
      role: message.role,
      content: message.content,
    }),
  );

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (request.apiKey?.trim()) {
      headers["Authorization"] = `Bearer ${request.apiKey.trim()}`;
    }

    const mcpToolDefinitions = await listMcpTools(request.mcp);
    const remoteTools = toOpenAiTools(mcpToolDefinitions);

    for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
      const payload = await createRemoteResponse({
        endpoint,
        headers,
        signal: abortController.signal,
        body: {
          model,
          temperature: request.temperature,
          messages,
          ...(remoteTools.length > 0
            ? {
                tools: remoteTools,
                tool_choice: "auto",
              }
            : {}),
        },
      });
      const primaryMessage = getPrimaryResponseMessage(payload);
      const toolCalls = getToolCalls(primaryMessage?.["tool_calls"]);
      const primaryText = extractTextFromContent(primaryMessage?.["content"]);

      if (toolCalls.length === 0) {
        const content = (primaryText || extractRemoteContent(payload)).trim();

        if (!content) {
          throw new Error("Remote response did not include assistant text.");
        }

        return content;
      }

      messages.push({
        role: "assistant",
        content: primaryText || "",
        tool_calls: toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: toolCall.argumentsText,
          },
        })),
      });

      for (const toolCall of toolCalls) {
        const toolResult = await executeToolCall(request, toolCall);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }
    }

    throw new Error("Remote model exceeded maximum tool-call depth.");
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("Remote request aborted.");
    }

    getLogger().error("Remote request failed", error);
    throw error;
  } finally {
    activeRequests.delete(request.requestUUID);
  }
}

export function abortRemotePrompt(requestUUID: string): boolean {
  const controller = activeRequests.get(requestUUID);

  if (!controller) {
    return false;
  }

  controller.abort();
  activeRequests.delete(requestUUID);
  return true;
}

async function createRemoteResponse({
  endpoint,
  headers,
  signal,
  body,
}: {
  endpoint: string;
  headers: Record<string, string>;
  signal: AbortSignal;
  body: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await readResponseText(response);
    throw new Error(
      `Remote request failed (${response.status}): ${errorBody || response.statusText}`,
    );
  }

  return (await response.json()) as Record<string, unknown>;
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function extractRemoteContent(payload: Record<string, unknown>): string {
  const outputText = payload["output_text"];
  if (typeof outputText === "string") {
    return outputText;
  }

  const choices = getRecordArray(payload["choices"]);
  if (choices.length > 0) {
    const firstChoice = choices[0];
    const message = getRecord(firstChoice["message"]);
    const messageContent = extractTextFromContent(message?.["content"]);

    if (messageContent) {
      return messageContent;
    }

    if (typeof firstChoice["text"] === "string") {
      return firstChoice["text"];
    }
  }

  const outputItems = getRecordArray(payload["output"]);
  const outputParts: string[] = [];

  for (const item of outputItems) {
    const contentItems = getRecordArray(item["content"]);
    for (const contentItem of contentItems) {
      if (typeof contentItem["text"] === "string") {
        outputParts.push(contentItem["text"]);
      }
    }
  }

  return outputParts.join("");
}

function getPrimaryResponseMessage(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  const choices = getRecordArray(payload["choices"]);

  if (choices.length === 0) {
    return null;
  }

  return getRecord(choices[0]["message"]);
}

type OpenAiToolCall = {
  id: string;
  name: string;
  argumentsText: string;
};

function getToolCalls(value: unknown): OpenAiToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((toolCall): OpenAiToolCall | null => {
      if (!toolCall || typeof toolCall !== "object") {
        return null;
      }

      const record = toolCall as Record<string, unknown>;
      const functionRecord = getRecord(record["function"]);
      const name = functionRecord?.["name"];

      if (typeof name !== "string" || !name.trim()) {
        return null;
      }

      const rawId = record["id"];
      const rawArguments = functionRecord["arguments"];

      return {
        id:
          typeof rawId === "string" && rawId.trim()
            ? rawId
            : crypto.randomUUID(),
        name,
        argumentsText: typeof rawArguments === "string" ? rawArguments : "{}",
      };
    })
    .filter((toolCall): toolCall is OpenAiToolCall => !!toolCall);
}

function toOpenAiTools(
  mcpTools: McpToolDefinition[],
): Array<Record<string, unknown>> {
  return mcpTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema || {
        type: "object",
        properties: {},
      },
    },
  }));
}

async function executeToolCall(
  request: RemotePromptRequest,
  toolCall: OpenAiToolCall,
): Promise<string> {
  if (!request.mcp?.enabled) {
    return "MCP is not enabled in settings.";
  }

  let parsedArgs: Record<string, unknown> = {};

  try {
    parsedArgs = parseToolCallArguments(toolCall.argumentsText);
  } catch (error) {
    return `Tool argument parsing failed: ${(error as Error).message}`;
  }

  try {
    const result = await callMcpTool(request.mcp, toolCall.name, parsedArgs);
    return stringifyToolResult(result);
  } catch (error) {
    getLogger().error(`MCP tool call failed: ${toolCall.name}`, error);
    return `MCP tool call failed: ${(error as Error).message}`;
  }
}

function parseToolCallArguments(
  argumentsText: string,
): Record<string, unknown> {
  if (!argumentsText.trim()) {
    return {};
  }

  const parsed = JSON.parse(argumentsText) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function stringifyToolResult(result: Record<string, unknown>): string {
  const outputChunks: string[] = [];

  if (result["isError"] === true) {
    outputChunks.push("Tool returned an error.");
  }

  const content = result["content"];
  if (Array.isArray(content)) {
    for (const chunk of content) {
      if (!chunk || typeof chunk !== "object") {
        continue;
      }

      const chunkRecord = chunk as Record<string, unknown>;
      const chunkType = chunkRecord["type"];

      if (chunkType === "text" && typeof chunkRecord["text"] === "string") {
        outputChunks.push(chunkRecord["text"]);
        continue;
      }

      if (chunkType === "resource") {
        const resourceRecord = getRecord(chunkRecord["resource"]);
        if (typeof resourceRecord?.["text"] === "string") {
          outputChunks.push(resourceRecord["text"]);
        } else {
          outputChunks.push("[resource result]");
        }
        continue;
      }

      outputChunks.push(`[${String(chunkType || "unknown")} result]`);
    }
  }

  if (result["structuredContent"] !== undefined) {
    outputChunks.push(
      `structuredContent:\n${JSON.stringify(result["structuredContent"], null, 2)}`,
    );
  }

  if (outputChunks.length === 0) {
    return JSON.stringify(result, null, 2);
  }

  return outputChunks.join("\n").trim();
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === "string") {
      parts.push(item);
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;

    if (typeof record["text"] === "string") {
      parts.push(record["text"]);
      continue;
    }

    if (typeof record["content"] === "string") {
      parts.push(record["content"]);
    }
  }

  return parts.join("");
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function getRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object",
  );
}
