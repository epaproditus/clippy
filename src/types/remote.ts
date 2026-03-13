export type RemotePromptRole = "system" | "user" | "assistant";

export interface RemotePromptMessage {
  role: RemotePromptRole;
  content: string;
}

export interface RemoteMcpConfig {
  enabled: boolean;
  command?: string;
  argsText?: string;
  cwd?: string;
}

export interface RemotePromptRequest {
  requestUUID: string;
  endpoint: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  messages: RemotePromptMessage[];
  mcp?: RemoteMcpConfig;
}
