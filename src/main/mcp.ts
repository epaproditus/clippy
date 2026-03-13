import { getLogger } from "./logger";
import { RemoteMcpHeaderConfig, RemoteMcpServerConfig } from "../types/remote";

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

type ConnectedMcp = {
  key: string;
  client: any;
  transport: any;
};

type VerifyResult = {
  ok: boolean;
  tools: Array<{
    name: string;
    description?: string;
  }>;
  error?: string;
};

export interface McpToolDefinition {
  serverId: string;
  serverToolId: string;
  toolName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

const connectedMcpById = new Map<string, ConnectedMcp>();

export async function listMcpTools(
  config: RemoteMcpServerConfig,
): Promise<McpToolDefinition[]> {
  const connection = await getMcpConnection(config, true);

  if (!connection) {
    return [];
  }

  const toolsResult = await connection.client.listTools();

  return toolsResult.tools.map((tool: Record<string, unknown>) => ({
    serverId: config.id,
    serverToolId: config.toolId,
    toolName: String(tool.name || "").trim(),
    description:
      typeof tool.description === "string" ? tool.description : undefined,
    inputSchema: (tool.inputSchema as Record<string, unknown>) || {
      type: "object",
      properties: {},
    },
  }));
}

export async function callMcpTool(
  config: RemoteMcpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const connection = await getMcpConnection(config, true);

  if (!connection) {
    throw new Error("MCP server is not configured.");
  }

  const result = await connection.client.callTool({
    name: toolName,
    arguments: args,
  });

  return result as Record<string, unknown>;
}

export async function verifyMcpServer(
  config: RemoteMcpServerConfig,
): Promise<VerifyResult> {
  try {
    const connection = await getMcpConnection(config, false);

    if (!connection) {
      return {
        ok: false,
        tools: [],
        error: "MCP server configuration is incomplete.",
      };
    }

    const toolsResult = await connection.client.listTools();

    return {
      ok: true,
      tools: toolsResult.tools.map((tool: Record<string, unknown>) => ({
        name: String(tool.name || ""),
        description:
          typeof tool.description === "string" ? tool.description : undefined,
      })),
    };
  } catch (error) {
    getLogger().error("Failed to verify MCP server", error);

    return {
      ok: false,
      tools: [],
      error: (error as Error).message,
    };
  }
}

async function getMcpConnection(
  config: RemoteMcpServerConfig,
  requireEnabled: boolean,
): Promise<ConnectedMcp | null> {
  if (!isMcpConfigured(config, requireEnabled)) {
    await closeMcpConnectionById(config.id);
    return null;
  }

  const args = parseArgsText(config.argsText);
  const headers = normalizeHeaders(config.headers);
  const key = JSON.stringify({
    id: config.id,
    type: config.type,
    command: config.command?.trim(),
    args,
    cwd: config.cwd?.trim(),
    url: config.url?.trim(),
    headers,
  });

  const existing = connectedMcpById.get(config.id);

  if (existing && existing.key === key) {
    return existing;
  }

  if (existing) {
    await closeMcpConnectionById(config.id);
  }

  const transport = createTransport(config, args, headers);
  const client = new Client(
    {
      name: "clippy-mcp-client",
      version: "1.1.0",
    },
    {
      capabilities: {},
    },
  );

  await client.connect(transport);

  const connection: ConnectedMcp = {
    key,
    client,
    transport,
  };
  connectedMcpById.set(config.id, connection);

  return connection;
}

function createTransport(
  config: RemoteMcpServerConfig,
  args: string[],
  headers: Record<string, string>,
) {
  if (config.type === "http") {
    const url = config.url?.trim() || "";

    return new StreamableHTTPClientTransport(new URL(url), {
      requestInit: {
        headers,
      },
    });
  }

  const command = config.command?.trim() || "";
  const cwd = config.cwd?.trim() || undefined;
  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    stderr: "pipe",
  });

  if (transport.stderr) {
    transport.stderr.on("data", (chunk: Buffer | string) => {
      getLogger().warn(`MCP stderr (${config.name}): ${chunk.toString()}`);
    });
  }

  return transport;
}

async function closeMcpConnectionById(serverId: string) {
  const existing = connectedMcpById.get(serverId);

  if (!existing) {
    return;
  }

  connectedMcpById.delete(serverId);

  try {
    await existing.client.close();
  } catch (error) {
    getLogger().warn(`Error closing MCP client for ${serverId}`, error);
  }

  try {
    await existing.transport.close();
  } catch (error) {
    getLogger().warn(`Error closing MCP transport for ${serverId}`, error);
  }
}

function isMcpConfigured(
  config: RemoteMcpServerConfig,
  requireEnabled: boolean,
): boolean {
  if (requireEnabled && !config.enabled) {
    return false;
  }

  if (config.type === "http") {
    return !!config.url?.trim();
  }

  return !!config.command?.trim();
}

function parseArgsText(argsText?: string): string[] {
  if (!argsText?.trim()) {
    return [];
  }

  const tokens = argsText.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g) || [];

  return tokens.map((token) => {
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return token
        .slice(1, -1)
        .replace(/\\(["'])/g, "$1")
        .replace(/\\\\/g, "\\");
    }

    return token;
  });
}

function normalizeHeaders(
  headers?: RemoteMcpHeaderConfig[],
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const header of headers || []) {
    const key = header.key.trim();
    const value = header.value;

    if (!key) {
      continue;
    }

    result[key] = value;
  }

  return result;
}
