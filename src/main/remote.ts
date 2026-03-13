import { getLogger } from "./logger";
import { RemotePromptRequest } from "../types/remote";

const activeRequests = new Map<string, AbortController>();

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

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (request.apiKey?.trim()) {
      headers["Authorization"] = `Bearer ${request.apiKey.trim()}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: abortController.signal,
      body: JSON.stringify({
        model,
        temperature: request.temperature,
        messages: request.messages,
      }),
    });

    if (!response.ok) {
      const errorBody = await readResponseText(response);
      throw new Error(
        `Remote request failed (${response.status}): ${errorBody || response.statusText}`,
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const content = extractRemoteContent(payload).trim();

    if (!content) {
      throw new Error("Remote response did not include assistant text.");
    }

    return content;
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
