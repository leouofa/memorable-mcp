import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemorableMcpServer } from "../src/server.js";

describe("MCP Tools Integration", () => {
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

  it("lists all 17 available tools", async () => {
    const { client, cleanup } = await setupTestClient();
    const { tools } = await client.listTools();

    expect(tools.length).toBe(17);
    const names = tools.map((t) => t.name);
    expect(names).toContain("memorable_search");
    expect(names).toContain("memorable_recall_context");
    expect(names).toContain("memorable_list_memories");
    expect(names).toContain("memorable_get_memory");
    expect(names).toContain("memorable_create_memory");
    expect(names).toContain("memorable_update_memory");
    expect(names).toContain("memorable_append_to_memory");
    expect(names).toContain("memorable_delete_memory");
    expect(names).toContain("memorable_find_neighbors");
    expect(names).toContain("memorable_generate_embedding");
    expect(names).toContain("memorable_toggle_pin");
    expect(names).toContain("memorable_reorder_pinned");
    expect(names).toContain("memorable_list_attachments");
    expect(names).toContain("memorable_upload_attachment");
    expect(names).toContain("memorable_delete_attachment");
    expect(names).toContain("memorable_render_markdown");
    expect(names).toContain("memorable_get_stats");

    await cleanup();
  });

  it("executes memorable_get_stats tool", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          total_memories: 15,
          pinned_memories: 3,
          total_attachments: 4,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.callTool({ name: "memorable_get_stats", arguments: {} });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain('"total_memories": 15');
    expect(content[0].text).toContain('"pinned_memories": 3');

    await cleanup();
  });

  it("executes memorable_search tool", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          status: "ok",
          results: [
            {
              type: "Memory",
              score: 0.92,
              data: { id: 1, title: "PostgreSQL pgvector Setup", body: "Vector cosine ops" },
            },
          ],
          meta: { mode: "semantic", query: "vector search", count: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.callTool({
      name: "memorable_search",
      arguments: { q: "vector search", mode: "semantic", limit: 5 },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("PostgreSQL pgvector Setup");
    expect(content[0].text).toContain("0.92");

    await cleanup();
  });

  it("executes memorable_recall_context composite tool", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            memories: [{ id: 1, title: "Standing Rules", body: "Rule 1", pinned: true }],
            meta: { limit: 100, offset: 0, total_count: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            results: [
              {
                type: "Memory",
                score: 0.89,
                data: { id: 2, title: "Architecture Decision", body: "ADR context", pinned: false },
              },
            ],
            meta: { mode: "semantic", query: "architecture", count: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const { client, cleanup } = await setupTestClient();
    const result = await client.callTool({
      name: "memorable_recall_context",
      arguments: { query: "architecture", mode: "semantic" },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Standing Rules");
    expect(content[0].text).toContain("Architecture Decision");
    expect(content[0].text).toContain('"total_unique_memories": 2');

    await cleanup();
  });

  it("executes memorable_create_memory tool", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          id: 50,
          title: "System Invariants",
          body: "# Data Invariants\nAtomic transactions only",
          pinned: true,
          pinned_position: 1,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.callTool({
      name: "memorable_create_memory",
      arguments: {
        title: "System Invariants",
        body: "# Data Invariants\nAtomic transactions only",
        pinned: true,
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain('"id": 50');
    expect(content[0].text).toContain("System Invariants");

    await cleanup();
  });

  it("executes memorable_append_to_memory tool", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 50,
            title: "System Invariants",
            body: "# Section 1",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 50,
            title: "System Invariants",
            body: "# Section 1\n\n# Section 2",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const { client, cleanup } = await setupTestClient();
    const result = await client.callTool({
      name: "memorable_append_to_memory",
      arguments: {
        id: 50,
        content: "# Section 2",
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("# Section 1\\n\\n# Section 2");

    await cleanup();
  });

  it("executes memorable_find_neighbors tool", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          status: "ok",
          memory: { id: 1, title: "Source Memory" },
          neighbors: [
            {
              score: 0.95,
              memory: { id: 2, title: "Neighbor Memory" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.callTool({
      name: "memorable_find_neighbors",
      arguments: { id: 1, limit: 3 },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Neighbor Memory");
    expect(content[0].text).toContain("0.95");

    await cleanup();
  });

  it("executes memorable_generate_embedding tool", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          status: "ok",
          message: "Embedding generated successfully",
          memory: { id: 1, embedded: true },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.callTool({
      name: "memorable_generate_embedding",
      arguments: { id: 1, async: false },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Embedding generated successfully");

    await cleanup();
  });

  it("executes memorable_upload_attachment tool with base64 content", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          status: "ok",
          attachments: [
            {
              id: 301,
              filename: "context.json",
              byte_size: 15,
              content_type: "application/json",
              created_at: "2026-11-14T00:00:00Z",
              url: "http://mock-memorable/blobs/context.json",
            },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.callTool({
      name: "memorable_upload_attachment",
      arguments: {
        memory_id: 1,
        files: [
          {
            filename: "context.json",
            content_base64: Buffer.from('{"key":"value"}').toString("base64"),
            content_type: "application/json",
          },
        ],
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("context.json");

    await cleanup();
  });

  it("returns formatted error response on API failure", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          error: "Validation failed",
          details: ["Title can't be blank"],
        }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.callTool({
      name: "memorable_create_memory",
      arguments: {
        title: "Test",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Memorable API Error [422]");
    expect(content[0].text).toContain("Title can't be blank");

    await cleanup();
  });
});
