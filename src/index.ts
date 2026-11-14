#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Command } from "commander";
import { createMemorableMcpServer } from "./server.js";

const program = new Command()
  .name("memorable-mcp")
  .description("Official Model Context Protocol (MCP) server for Memorable AI memory management studio")
  .version("1.0.0")
  .option("-u, --url <url>", "Memorable API base URL (defaults to MEMORABLE_API_URL or http://localhost:3000)")
  .option("-k, --api-key <key>", "Memorable API key / bearer token (defaults to MEMORABLE_API_KEY)")
  .option("-t, --timeout <ms>", "Request timeout in milliseconds", (val) => Number.parseInt(val, 10))
  .option("--no-sync", "Disable initial memory template synchronization on startup");

program.parse(process.argv);
const options = program.opts();

const baseUrl = options.url || process.env.MEMORABLE_API_URL || "http://localhost:3000";
const apiKey = options.apiKey || process.env.MEMORABLE_API_KEY;
const timeoutMs = options.timeout ? Number(options.timeout) : undefined;
const shouldSync = options.sync !== false;

async function main() {
  const { server, client, syncMemories } = createMemorableMcpServer({
    baseUrl,
    apiKey,
    timeoutMs,
  });

  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  const cleanup = async () => {
    process.stderr.write("\nShutting down Memorable MCP server...\n");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await server.connect(transport);
  process.stderr.write(`Memorable MCP server running on stdio (Memorable URL: ${client.getBaseUrl()})\n`);

  if (shouldSync) {
    const synced = await syncMemories();
    if (synced > 0) {
      process.stderr.write(`Synced ${synced} saved memory/memories from Memorable into native MCP prompts.\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(
    `Fatal error in Memorable MCP server: ${error instanceof Error ? error.stack || error.message : error}\n`
  );
  process.exit(1);
});
