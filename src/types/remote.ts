export type RemotePromptRole = "system" | "user" | "assistant";

export interface RemotePromptMessage {
  role: RemotePromptRole;
  content: string;
}

export type RemoteMcpServerType = "stdio" | "http";

export interface RemoteProviderRequestConfig {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl: string;
  model: string;
}

export interface RemoteMcpHeaderConfig {
  key: string;
  value: string;
}

export interface RemoteMcpServerConfig {
  id: string;
  name: string;
  toolId: string;
  enabled: boolean;
  runToolsAutomatically: boolean;
  type: RemoteMcpServerType;
  command?: string;
  argsText?: string;
  cwd?: string;
  url?: string;
  headers?: RemoteMcpHeaderConfig[];
}

// Legacy single-server MCP support kept for backwards compatibility.
export interface RemoteMcpConfig {
  enabled: boolean;
  type?: RemoteMcpServerType;
  command?: string;
  argsText?: string;
  cwd?: string;
  url?: string;
  headers?: RemoteMcpHeaderConfig[];
}

export interface RemotePromptRequest {
  requestUUID: string;
  endpoint: string;
  model: string;
  apiKey?: string;
  provider?: RemoteProviderRequestConfig;
  temperature?: number;
  messages: RemotePromptMessage[];
  mcp?: RemoteMcpConfig;
  mcpServers?: RemoteMcpServerConfig[];
}
