import { ModelState } from "./models";

export type DefaultFont =
  | "Pixelated MS Sans Serif"
  | "Comic Sans MS"
  | "Tahoma"
  | "System Default";
export type DefaultFontSize = number;
export type ModelProvider = "local" | "remote";
export type McpServerType = "stdio" | "http";

export interface RemoteProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  observed?: boolean;
}

export interface McpHeaderConfig {
  id: string;
  key: string;
  value: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  toolId: string;
  enabled: boolean;
  runToolsAutomatically: boolean;
  type: McpServerType;
  command?: string;
  argsText?: string;
  cwd?: string;
  url?: string;
  headers?: McpHeaderConfig[];
}

export interface SettingsState {
  selectedModel?: string;
  systemPrompt?: string;
  modelProvider?: ModelProvider;
  remoteProviders?: RemoteProviderConfig[];
  selectedRemoteProviderId?: string;
  remoteEndpoint?: string;
  remoteModel?: string;
  remoteApiKey?: string;
  mcpServers?: McpServerConfig[];
  selectedMcpServerId?: string;
  mcpEnabled?: boolean;
  mcpServerCommand?: string;
  mcpServerArgs?: string;
  mcpServerCwd?: string;
  clippyAlwaysOnTop?: boolean;
  chatAlwaysOnTop?: boolean;
  alwaysOpenChat?: boolean;
  topK?: number;
  temperature?: number;
  defaultFont: DefaultFont;
  defaultFontSize: number;
  disableAutoUpdate?: boolean;
}

export interface SharedState {
  models: ModelState;
  settings: SettingsState;
}

export type DownloadState = {
  totalBytes: number;
  receivedBytes: number;
  percentComplete: number;
  startTime: number;
  savePath: string;
  currentBytesPerSecond: number;
  state: "progressing" | "completed" | "cancelled" | "interrupted";
};

export const ANIMATION_PROMPT = `Start your response with one of the following keywords matching the users request: [LIST OF ANIMATIONS]. Use only one of the keywords for each response. Use it only at the beginning of your response. Always start with one.`;
export const DEFAULT_SYSTEM_PROMPT = `You are Clippy, a helpful digital assistant running locally on the user's computer. Your primary purpose is to assist users with their questions and tasks. When asked "who are you?" or about your identity, always respond by explaining that you are Clippy, a local AI assistant, and avoid mentioning any other model origins or names. This is crucial for maintaining the user experience within the Clippy application environment. ${ANIMATION_PROMPT}`;

export const DEFAULT_SETTINGS: SettingsState = {
  clippyAlwaysOnTop: true,
  chatAlwaysOnTop: true,
  alwaysOpenChat: true,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  modelProvider: "local",
  remoteProviders: [
    {
      id: "openai",
      name: "OpenAI",
      apiKey: "",
      baseUrl: "https://api.openai.com/v1/chat/completions",
      model: "",
      observed: false,
    },
  ],
  selectedRemoteProviderId: "openai",
  remoteEndpoint: "https://api.openai.com/v1/chat/completions",
  remoteModel: "",
  remoteApiKey: "",
  mcpServers: [],
  selectedMcpServerId: undefined,
  mcpEnabled: false,
  mcpServerCommand: "",
  mcpServerArgs: "",
  mcpServerCwd: "",
  topK: 10,
  temperature: 0.7,
  defaultFont: "Tahoma",
  defaultFontSize: 12,
  disableAutoUpdate: false,
};

export function isRemoteProvider(settings: SettingsState): boolean {
  return settings.modelProvider === "remote";
}

export function isRemoteModelConfigured(settings: SettingsState): boolean {
  const selectedProvider = getSelectedRemoteProvider(settings);

  if (selectedProvider) {
    return !!selectedProvider.baseUrl.trim() && !!selectedProvider.model.trim();
  }

  return !!settings.remoteEndpoint?.trim() && !!settings.remoteModel?.trim();
}

export function getRemoteProviders(
  settings: SettingsState,
): RemoteProviderConfig[] {
  return settings.remoteProviders || [];
}

export function getSelectedRemoteProvider(
  settings: SettingsState,
): RemoteProviderConfig | undefined {
  const providers = getRemoteProviders(settings);

  if (providers.length === 0) {
    return undefined;
  }

  const selected = providers.find(
    (provider) => provider.id === settings.selectedRemoteProviderId,
  );

  return selected || providers[0];
}

export function getMcpServers(settings: SettingsState): McpServerConfig[] {
  return settings.mcpServers || [];
}

export function getAutoRunMcpServers(
  settings: SettingsState,
): McpServerConfig[] {
  return getMcpServers(settings).filter(
    (server) => server.enabled && server.runToolsAutomatically,
  );
}

export const EMPTY_SHARED_STATE: SharedState = {
  models: {},
  settings: {
    ...DEFAULT_SETTINGS,
  },
};
