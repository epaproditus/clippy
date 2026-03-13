import { getLogger } from "./logger";
import { RemoteMcpConfig } from "../types/remote";

const {
  Client,
} = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");

type ConnectedMcp = {
  key: string;
  client: any;
  transport: any;
};

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

let connectedMcp: ConnectedMcp | null = null;

export async function listMcpTools(
  config?: RemoteMcpConfig,
): Promise<McpToolDefinition[]> {
  const connection = await getMcpConnection(config);

  if (!connection) {
    return [];
  }

  try {
    const toolsResult = await connection.client.listTools();

    return toolsResult.tools.map((tool: Record<string, unknown>) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema || {
        type: "object",
        properties: {},
      },
    }));
  } catch (error) {
    getLogger().error("Failed to list MCP tools", error);
    return [];
  }
}

export async function callMcpTool(
  config: RemoteMcpConfig | undefined,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const connection = await getMcpConnection(config);

  if (!connection) {
    throw new Error("MCP is not configured.");
  }

  const result = await connection.client.callTool({
    name,
    arguments: args,
  });

  return result as Record<string, unknown>;
}

async function getMcpConnection(
  config?: RemoteMcpConfig,
): Promise<ConnectedMcp | null> {
  if (!isMcpEnabled(config)) {
    await closeMcpConnection();
    return null;
  }

  const command = config.command?.trim() || "";
  const cwd = config.cwd?.trim() || undefined;
  const args = parseArgsText(config.argsText);
  const key = JSON.stringify({ command, args, cwd });

  if (connectedMcp && connectedMcp.key === key) {
    return connectedMcp;
  }

  await closeMcpConnection();

  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    stderr: "pipe",
  });

  if (transport.stderr) {
    transport.stderr.on("data", (chunk: Buffer | string) => {
      getLogger().warn(`MCP stderr: ${chunk.toString()}`);
    });
  }

  const client = new Client(
    {
      name: "clippy-mcp-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  await client.connect(transport);

  connectedMcp = {
    key,
    client,
    transport,
  };

  return connectedMcp;
}

async function closeMcpConnection() {
  if (!connectedMcp) {
    return;
  }

  const previous = connectedMcp;
  connectedMcp = null;

  try {
    await previous.client.close();
  } catch (error) {
    getLogger().warn("Error closing MCP client", error);
  }

  try {
    await previous.transport.close();
  } catch (error) {
    getLogger().warn("Error closing MCP transport", error);
  }
}

function isMcpEnabled(config?: RemoteMcpConfig): config is RemoteMcpConfig {
  return !!config?.enabled && !!config.command?.trim();
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
