import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemorableMcpServer } from "../src/server.js";

describe("MCP Resources Integration", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function setupTestClient() {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const { server } = createMemorableMcpServer({ baseUrl: "http://mock-memorable" });
    await server.connect(serverTransport);

    const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(clientTransport);

    return {
      client,
      cleanup: async () => {
        await client.close();
        await server.close();
      },
    };
  }

  it("reads memorable://stats resource", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          total_memories: 10,
          pinned_memories: 2,
          total_attachments: 3,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.readResource({ uri: "memorable://stats" });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("application/json");
    expect(result.contents[0].text).toContain('"total_memories": 10');

    await cleanup();
  });

  it("reads memorable://memories index resource", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          memories: [{ id: 1, title: "Memory 1", pinned: true }],
          meta: { limit: 100, offset: 0, total_count: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.readResource({ uri: "memorable://memories" });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("Memory 1");

    await cleanup();
  });

  it("reads memorable://memories/pinned combined markdown resource", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          memories: [
            {
              id: 1,
              title: "System Philosophy",
              body: "Keep code clean and modular.",
              pinned: true,
              pinned_position: 1,
              updated_at: "2026-11-14T00:00:00Z",
            },
          ],
          meta: { limit: 100, offset: 0, total_count: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.readResource({ uri: "memorable://memories/pinned" });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("text/markdown");
    expect(result.contents[0].text).toContain("# System Philosophy (ID: 1)");
    expect(result.contents[0].text).toContain("Keep code clean and modular.");

    await cleanup();
  });

  it("reads memorable://memories/{id} parameterized resource with YAML frontmatter", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          id: 42,
          title: "Database Invariants",
          body: "# Invariants\nAll writes are serialized.",
          pinned: true,
          pinned_position: 2,
          embedded: true,
          embedding_model: "qwen3-embedding:0.6b",
          embedded_at: "2026-11-14T12:00:00Z",
          attachments_count: 0,
          updated_at: "2026-11-14T12:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.readResource({ uri: "memorable://memories/42" });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("text/markdown");
    expect(result.contents[0].text).toContain("---");
    expect(result.contents[0].text).toContain('title: "Database Invariants"');
    expect(result.contents[0].text).toContain("embedded: true");
    expect(result.contents[0].text).toContain("# Invariants\nAll writes are serialized.");

    await cleanup();
  });

  it("reads memorable://memories/{id}/neighbors parameterized resource", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          status: "ok",
          memory: { id: 42, title: "Database Invariants" },
          neighbors: [
            {
              score: 0.94,
              memory: { id: 43, title: "Transaction Isolation" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.readResource({ uri: "memorable://memories/42/neighbors" });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("application/json");
    expect(result.contents[0].text).toContain("Transaction Isolation");
    expect(result.contents[0].text).toContain("0.94");

    await cleanup();
  });
});
