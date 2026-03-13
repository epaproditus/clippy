import { useState } from "react";

import { Message } from "./Message";
import { ChatInput } from "./ChatInput";
import { ANIMATION_KEYS_BRACKETS } from "../clippy-animation-helpers";
import { useChat } from "../contexts/ChatContext";
import { clippyApi, electronAi } from "../clippyApi";
import { isRemoteProvider } from "../../sharedState";
import { useSharedState } from "../contexts/SharedStateContext";
import { RemotePromptMessage } from "../../types/remote";

export type ChatProps = {
  style?: React.CSSProperties;
};

export function Chat({ style }: ChatProps) {
  const { setAnimationKey, setStatus, status, messages, addMessage } =
    useChat();
  const { settings } = useSharedState();
  const [streamingMessageContent, setStreamingMessageContent] =
    useState<string>("");
  const [lastRequestUUID, setLastRequestUUID] = useState<string>(
    crypto.randomUUID(),
  );
  const useRemoteModel = isRemoteProvider(settings);

  const handleAbortMessage = () => {
    if (useRemoteModel) {
      void clippyApi.abortRemotePrompt(lastRequestUUID);
      return;
    }

    electronAi.abortRequest(lastRequestUUID);
  };

  const handleSendMessage = async (message: string) => {
    if (status !== "idle") {
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: message,
      sender: "user",
      createdAt: Date.now(),
    };
    const messagesForRequest = [...messages, userMessage];

    await addMessage(userMessage);
    setStreamingMessageContent("");
    setStatus("thinking");

    try {
      const requestUUID = crypto.randomUUID();
      setLastRequestUUID(requestUUID);

      const response = useRemoteModel
        ? textToAsyncIterator(
            await clippyApi.promptRemote({
              requestUUID,
              endpoint: settings.remoteEndpoint || "",
              model: settings.remoteModel || "",
              apiKey: settings.remoteApiKey || "",
              temperature: settings.temperature,
              messages: messagesToRemotePrompts(
                messagesForRequest,
                settings.systemPrompt || "",
              ),
            }),
          )
        : await window.electronAi.promptStreaming(message, {
            requestUUID,
          });

      let fullContent = "";
      let filteredContent = "";
      let hasSetAnimationKey = false;

      for await (const chunk of response) {
        if (fullContent === "") {
          setStatus("responding");
        }

        if (!hasSetAnimationKey) {
          const { text, animationKey } = filterMessageContent(
            fullContent + chunk,
          );

          filteredContent = text;
          fullContent = fullContent + chunk;

          if (animationKey) {
            setAnimationKey(animationKey);
            hasSetAnimationKey = true;
          }
        } else {
          filteredContent += chunk;
        }

        setStreamingMessageContent(filteredContent);
      }

      // Once streaming is complete, add the full message to the messages array
      // and clear the streaming message
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        content: filteredContent,
        sender: "clippy",
        createdAt: Date.now(),
      };

      addMessage(assistantMessage);
    } catch (error) {
      if ((error as Error).message !== "Remote request aborted.") {
        console.error(error);
      }
    } finally {
      setStreamingMessageContent("");
      setStatus("idle");
    }
  };

  return (
    <div style={style} className="chat-container">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      {status === "responding" && (
        <Message
          message={{
            id: "streaming",
            content: streamingMessageContent,
            sender: "clippy",
            createdAt: Date.now(),
          }}
        />
      )}
      <ChatInput onSend={handleSendMessage} onAbort={handleAbortMessage} />
    </div>
  );
}

/**
 * Filter the message content to get the text and animation key
 *
 * @param content - The content of the message
 * @returns The text and animation key
 */
function filterMessageContent(content: string): {
  text: string;
  animationKey: string;
} {
  let text = content;
  let animationKey = "";

  if (content === "[") {
    text = "";
  } else if (/^\[[A-Za-z]*$/m.test(content)) {
    text = content.replace(/^\[[A-Za-z]*$/m, "").trim();
  } else {
    // Check for animation keys in brackets
    for (const key of ANIMATION_KEYS_BRACKETS) {
      if (content.startsWith(key)) {
        animationKey = key.slice(1, -1);
        text = content.slice(key.length).trim();
        break;
      }
    }
  }

  return { text, animationKey };
}

async function* textToAsyncIterator(
  content: string,
): AsyncGenerator<string, void, unknown> {
  yield content;
}

function messagesToRemotePrompts(
  messages: Message[],
  systemPrompt: string,
): RemotePromptMessage[] {
  const resolvedSystemPrompt = systemPrompt.replace(
    "[LIST OF ANIMATIONS]",
    ANIMATION_KEYS_BRACKETS.join(", "),
  );
  const prompts: RemotePromptMessage[] = [
    {
      role: "system",
      content: resolvedSystemPrompt,
    },
  ];

  for (const message of messages) {
    if (!message.content?.trim()) {
      continue;
    }

    prompts.push({
      role: message.sender === "clippy" ? "assistant" : "user",
      content: message.content,
    });
  }

  return prompts;
}
