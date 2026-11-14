import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemorableClient } from "../client/memorable-client.js";

export function registerResources(server: McpServer, client: MemorableClient): void {
  // 1. Stats Resource
  server.resource(
    "memorable_stats",
    "memorable://stats",
    {
      mimeType: "application/json",
      description: "Aggregated Memorable statistics: total memories, pinned memories, and attachments",
    },
    async (uri) => {
      const stats = await client.getStats();
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(stats, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // 2. All Memories List Resource
  server.resource(
    "memorable_memories",
    "memorable://memories",
    {
      mimeType: "application/json",
      description: "Index of all active memories saved in the Memorable workspace",
    },
    async (uri) => {
      const memories = await client.listMemories({ limit: 100 });
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(memories, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // 3. Combined Pinned Memories Resource (Markdown Document)
  server.resource(
    "memorable_pinned",
    "memorable://memories/pinned",
    {
      mimeType: "text/markdown",
      description: "Unified Markdown document combining all pinned memories and standing context",
    },
    async (uri) => {
      const { memories } = await client.listMemories({ pinned: true, limit: 100 });
      const doc =
        memories.length > 0
          ? memories
              .map(
                (m) =>
                  `# ${m.title} (ID: ${m.id})\n_Pinned Position: ${m.pinned_position ?? "Default"} | Updated: ${m.updated_at}_\n\n${m.body || "_No content_"}`
              )
              .join("\n\n---\n\n")
          : "# Pinned Context\n\n_No memories are currently pinned._";

      return {
        contents: [
          {
            uri: uri.href,
            text: doc,
            mimeType: "text/markdown",
          },
        ],
      };
    }
  );

  // 4. Memory Detail Resource Template (Returns Markdown with YAML frontmatter header)
  server.resource(
    "memorable_memory_detail",
    new ResourceTemplate("memorable://memories/{id}", {
      list: async () => {
        try {
          const { memories } = await client.listMemories({ limit: 100 });
          return {
            resources: memories.map((m) => ({
              uri: `memorable://memories/${m.id}`,
              name: `Memory: ${m.title}`,
              description: `${m.pinned ? "[Pinned] " : ""}${m.title} (embedded: ${m.embedded})`,
              mimeType: "text/markdown",
            })),
          };
        } catch {
          return { resources: [] };
        }
      },
    }),
    {
      mimeType: "text/markdown",
      description: "Memory raw Markdown content with YAML metadata frontmatter",
    },
    async (uri, params) => {
      const id = Number(params.id);
      const memory = await client.getMemory(id);

      const header = [
        "---",
        `id: ${memory.id}`,
        `title: ${JSON.stringify(memory.title)}`,
        `pinned: ${memory.pinned}`,
        `pinned_position: ${memory.pinned_position ?? "null"}`,
        `embedded: ${memory.embedded}`,
        `embedding_model: ${JSON.stringify(memory.embedding_model || "none")}`,
        `embedded_at: ${JSON.stringify(memory.embedded_at || null)}`,
        `attachments_count: ${memory.attachments_count}`,
        `updated_at: ${JSON.stringify(memory.updated_at)}`,
        "---",
        "",
      ].join("\n");

      return {
        contents: [
          {
            uri: uri.href,
            text: `${header}${memory.body || ""}`,
            mimeType: "text/markdown",
          },
        ],
      };
    }
  );

  // 5. Memory Nearest Semantic Neighbors Resource Template
  server.resource(
    "memorable_memory_neighbors",
    new ResourceTemplate("memorable://memories/{id}/neighbors", {
      list: async () => {
        try {
          const { memories } = await client.listMemories({ limit: 50 });
          return {
            resources: memories
              .filter((m) => m.embedded)
              .map((m) => ({
                uri: `memorable://memories/${m.id}/neighbors`,
                name: `Neighbors: ${m.title}`,
                description: `Nearest semantic vector neighbors for ${m.title}`,
                mimeType: "application/json",
              })),
          };
        } catch {
          return { resources: [] };
        }
      },
    }),
    {
      mimeType: "application/json",
      description: "Nearest semantic neighbor memories and cosine similarity scores for memory {id}",
    },
    async (uri, params) => {
      const id = Number(params.id);
      const neighbors = await client.findNeighbors(id, 10);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(neighbors, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );
}
