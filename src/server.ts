import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemorableClient, type MemorableClientOptions } from "./client/memorable-client.js";
import { registerPrompts, syncMemoriesFromMemorable } from "./prompts/index.js";
import { registerResources } from "./resources/index.js";
import { registerTools } from "./tools/index.js";

export interface MemorableServerInstance {
  server: McpServer;
  client: MemorableClient;
  syncMemories: () => Promise<number>;
}

export function createMemorableMcpServer(options: MemorableClientOptions = {}): MemorableServerInstance {
  const client = new MemorableClient(options);

  const server = new McpServer(
    {
      name: "memorable-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      },
    }
  );

  registerTools(server, client);
  registerResources(server, client);
  registerPrompts(server, client);

  const syncMemories = () => syncMemoriesFromMemorable(server, client);

  return { server, client, syncMemories };
}
