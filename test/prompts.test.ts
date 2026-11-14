import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractTemplateVariables,
  substituteVariables,
  toMemoryPromptSlug,
} from "../src/prompts/index.js";
import { createMemorableMcpServer } from "../src/server.js";

describe("Prompts & Template Utilities", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("extracts unique template variables from markdown", () => {
    const template =
      "Hello {{name}}! Welcome to {{service}}. Note that {{name}} must follow {{convention}}.";
    const vars = extractTemplateVariables(template);
    expect(vars).toEqual(["name", "service", "convention"]);
  });

  it("substitutes placeholders accurately", () => {
    const template = "Deployment target: {{env}} for {{project}}.";
    const result = substituteVariables(template, { env: "production", project: "billing-api" });
    expect(result).toBe("Deployment target: production for billing-api.");
  });

  it("normalizes memory titles into valid MCP prompt identifiers", () => {
    expect(toMemoryPromptSlug(5, "ADR 001: Postgres pgvector Setup")).toBe("memorable_5_adr_001_postgres_pgvector_setup");
    expect(toMemoryPromptSlug(12, "   My Cool Memory!!!   ")).toBe("memorable_12_my_cool_memory");
    expect(toMemoryPromptSlug(99, "")).toBe("memorable_99_memory");
  });

  async function setupTestClient() {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverInstance = createMemorableMcpServer({ baseUrl: "http://mock-memorable" });
    await serverInstance.server.connect(serverTransport);

    const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(clientTransport);

    return {
      client,
      serverInstance,
      cleanup: async () => {
        await client.close();
        await serverInstance.server.close();
      },
    };
  }

  it("registers static prompts: memorable_use_memory_template, memorable_author_memory, memorable_recall_context", async () => {
    const { client, cleanup } = await setupTestClient();
    const { prompts } = await client.listPrompts();

    const names = prompts.map((p) => p.name);
    expect(names).toContain("memorable_use_memory_template");
    expect(names).toContain("memorable_author_memory");
    expect(names).toContain("memorable_recall_context");

    await cleanup();
  });

  it("executes memorable_use_memory_template prompt", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          id: 7,
          title: "Service Deploy Rule",
          body: "Always deploy {{service}} to {{cluster}} first.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { client, cleanup } = await setupTestClient();
    const result = await client.getPrompt({
      name: "memorable_use_memory_template",
      arguments: {
        memory_id: "7",
        variables: JSON.stringify({ service: "auth-gateway", cluster: "staging-us-east" }),
      },
    });

    expect(result.messages).toHaveLength(1);
    const content = result.messages[0].content as { type: string; text: string };
    expect(content.text).toBe("Always deploy auth-gateway to staging-us-east first.");

    await cleanup();
  });

  it("executes memorable_author_memory prompt", async () => {
    const { client, cleanup } = await setupTestClient();
    const result = await client.getPrompt({
      name: "memorable_author_memory",
      arguments: {
        topic: "PostgreSQL Connection Pooling",
        memory_type: "architecture",
        pin: "true",
      },
    });

    const content = result.messages[0].content as { type: string; text: string };
    expect(content.text).toContain("PostgreSQL Connection Pooling");
    expect(content.text).toContain("ARCHITECTURE");
    expect(content.text).toContain("PINNED (Standing Workspace Context)");
    expect(content.text).toContain("memorable_create_memory");

    await cleanup();
  });

  it("executes memorable_recall_context prompt", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            memories: [{ id: 1, title: "Code Style Guide", body: "No any types.", pinned: true }],
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
                score: 0.912,
                data: { id: 2, title: "TypeScript Handbook", body: "Use strict mode.", pinned: false },
              },
            ],
            meta: { mode: "semantic", query: "typescript", count: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const { client, cleanup } = await setupTestClient();
    const result = await client.getPrompt({
      name: "memorable_recall_context",
      arguments: {
        topic: "typescript",
        search_mode: "semantic",
      },
    });

    const content = result.messages[0].content as { type: string; text: string };
    expect(content.text).toContain("Memorable Context Briefing for Topic: \"typescript\"");
    expect(content.text).toContain("Code Style Guide");
    expect(content.text).toContain("TypeScript Handbook");
    expect(content.text).toContain("Similarity: 91.2%");

    await cleanup();
  });

  it("syncs saved memories from Memorable into native MCP prompts", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/v1/memories?limit=50")) {
        return new Response(
          JSON.stringify({
            memories: [
              {
                id: 101,
                title: "Release Checklist",
                body: "Release checklist for {{version}} tagged by {{author}}.",
                pinned: true,
              },
            ],
            meta: { limit: 50, offset: 0, total_count: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/v1/memories/101")) {
        return new Response(
          JSON.stringify({
            id: 101,
            title: "Release Checklist",
            body: "Release checklist for {{version}} tagged by {{author}}.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const { client, serverInstance, cleanup } = await setupTestClient();
    const count = await serverInstance.syncMemories();
    expect(count).toBe(1);

    const { prompts } = await client.listPrompts();
    const syncPrompt = prompts.find((p) => p.name === "memorable_101_release_checklist");
    expect(syncPrompt).toBeDefined();

    const result = await client.getPrompt({
      name: "memorable_101_release_checklist",
      arguments: {
        version: "v2.4.0",
        author: "DevOps Team",
      },
    });

    const content = result.messages[0].content as { type: string; text: string };
    expect(content.text).toBe("Release checklist for v2.4.0 tagged by DevOps Team.");

    await cleanup();
  });

  it("gracefully falls back when syncMemories fails (e.g. server offline)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const { serverInstance, cleanup } = await setupTestClient();
    const count = await serverInstance.syncMemories();
    expect(count).toBe(0);

    await cleanup();
  });
});
