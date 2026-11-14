import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemorableApiError, MemorableClient } from "../src/client/memorable-client.js";

describe("MemorableClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("configures base URL and strips trailing slashes and /api/v1 suffixes", () => {
    const client1 = new MemorableClient({ baseUrl: "http://127.0.0.1:3000///" });
    expect(client1.getBaseUrl()).toBe("http://127.0.0.1:3000");

    const client2 = new MemorableClient({ baseUrl: "http://localhost:3000/api/v1/" });
    expect(client2.getBaseUrl()).toBe("http://localhost:3000");
  });

  it("attaches Authorization header when apiKey is supplied", async () => {
    let capturedHeaders: Headers | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ total_memories: 5, pinned_memories: 2, total_attachments: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = new MemorableClient({ baseUrl: "http://localhost:3000", apiKey: "test-token" });
    await client.getStats();

    expect(capturedHeaders?.get("Authorization")).toBe("Bearer test-token");
  });

  it("fetches platform stats", async () => {
    const mockStats = {
      total_memories: 25,
      pinned_memories: 4,
      total_attachments: 8,
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockStats), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = new MemorableClient();
    const stats = await client.getStats();
    expect(stats.total_memories).toBe(25);
    expect(stats.pinned_memories).toBe(4);
    expect(stats.total_attachments).toBe(8);
  });

  it("renders markdown through API", async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ html: "<h1>Memorable</h1>\n" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = new MemorableClient();
    const res = await client.renderMarkdown("# Memorable");
    expect(res.html).toBe("<h1>Memorable</h1>\n");
    expect(JSON.parse(capturedBody!)).toEqual({ text: "# Memorable" });
  });

  it("performs unified search with vector and keyword modes", async () => {
    let capturedUrl = "";
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify({
          status: "ok",
          results: [
            {
              type: "Memory",
              score: 0.945123,
              data: {
                id: 1,
                title: "PostgreSQL pgvector Setup",
                body: "Configured 1024-dim HNSW cosine indexing.",
                pinned: true,
                embedded: true,
              },
            },
          ],
          meta: { mode: "semantic", query: "pgvector", count: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const client = new MemorableClient();
    const res = await client.search({ q: "pgvector", mode: "semantic", limit: 5 });

    expect(capturedUrl).toContain("/api/v1/search?q=pgvector&mode=semantic&limit=5");
    expect(res.status).toBe("ok");
    expect(res.results).toHaveLength(1);
    expect(res.results[0].score).toBe(0.945123);
  });

  it("lists memories with filters and pagination", async () => {
    let capturedUrl = "";
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify({
          memories: [
            {
              id: 2,
              title: "Agent Instructions",
              body: "Always verify tests.",
              pinned: true,
              pinned_position: 1,
            },
          ],
          meta: { limit: 10, offset: 0, total_count: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const client = new MemorableClient();
    const res = await client.listMemories({ q: "verify", mode: "auto", pinned: true, limit: 10, offset: 0 });

    expect(capturedUrl).toContain("/api/v1/memories?q=verify&mode=auto&pinned=true&limit=10&offset=0");
    expect(res.memories).toHaveLength(1);
    expect(res.meta.total_count).toBe(1);
  });

  it("handles memory CRUD, appendToMemory, pin, and reorder operations", async () => {
    const client = new MemorableClient();

    // Create
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 10,
          title: "Architecture Guideline",
          body: "# Rules\nUse TypeScript strict mode.",
          pinned: false,
          attachments_count: 0,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );

    const created = await client.createMemory({
      title: "Architecture Guideline",
      body: "# Rules\nUse TypeScript strict mode.",
    });
    expect(created.id).toBe(10);
    expect(created.title).toBe("Architecture Guideline");

    // Get
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 10,
          title: "Architecture Guideline",
          body: "# Rules\nUse TypeScript strict mode.",
          rendered_html: "<h1>Rules</h1>",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const fetched = await client.getMemory(10, true);
    expect(fetched.rendered_html).toBe("<h1>Rules</h1>");

    // Append to memory (GET followed by PATCH)
    let patchBody: string | undefined;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 10,
            title: "Architecture Guideline",
            body: "# Rules",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        patchBody = init?.body as string;
        return new Response(
          JSON.stringify({
            id: 10,
            title: "Architecture Guideline",
            body: "# Rules\n\n## Update\nNever use any type.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

    const appended = await client.appendToMemory(10, "## Update\nNever use any type.");
    expect(appended.body).toBe("# Rules\n\n## Update\nNever use any type.");
    expect(JSON.parse(patchBody!)).toEqual({
      memory: { body: "# Rules\n\n## Update\nNever use any type." },
    });

    // Toggle Pin
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          pinned: true,
          pinned_position: 1,
          memory: { id: 10, title: "Architecture Guideline", pinned: true },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const pinRes = await client.togglePinMemory(10);
    expect(pinRes.pinned).toBe(true);

    // Reorder Pinned
    let reorderPayload: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      reorderPayload = init?.body as string;
      return new Response(
        JSON.stringify({ status: "ok", message: "Pinned memories reordered successfully" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    const reorderRes = await client.reorderPinnedMemories([10, 5, 2]);
    expect(reorderRes.status).toBe("ok");
    expect(JSON.parse(reorderPayload!)).toEqual({ memory_ids: [10, 5, 2] });

    // Delete
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", message: "Memory deleted successfully" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const delRes = await client.deleteMemory(10);
    expect(delRes.status).toBe("ok");
  });

  it("handles nearest semantic neighbors and embedding generation", async () => {
    const client = new MemorableClient();

    // Find Neighbors
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          memory: { id: 1, title: "pgvector" },
          neighbors: [
            {
              score: 0.912,
              memory: { id: 2, title: "Vector Embeddings", body: "1024-dim" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const neighborsRes = await client.findNeighbors(1, 5);
    expect(neighborsRes.status).toBe("ok");
    expect(neighborsRes.neighbors).toHaveLength(1);
    expect(neighborsRes.neighbors[0].score).toBe(0.912);

    // Generate Embedding (sync)
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          message: "Embedding generated successfully",
          memory: { id: 1, embedded: true },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const embSync = await client.generateEmbedding(1, false);
    expect(embSync.message).toContain("Embedding generated successfully");

    // Generate Embedding (async)
    let capturedUrl = "";
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify({
          status: "ok",
          message: "Embedding generation enqueued",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const embAsync = await client.generateEmbedding(1, true);
    expect(capturedUrl).toContain("?async=true");
    expect(embAsync.message).toContain("enqueued");
  });

  it("uploads multipart attachments", async () => {
    let capturedBody: FormData | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as FormData;
      return new Response(
        JSON.stringify({
          status: "ok",
          attachments: [
            {
              id: 99,
              filename: "notes.txt",
              byte_size: 12,
              content_type: "text/plain",
              created_at: new Date().toISOString(),
              url: "http://localhost:3000/blobs/notes.txt",
            },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    });

    const client = new MemorableClient();
    const res = await client.uploadAttachments(1, [
      {
        filename: "notes.txt",
        content: Buffer.from("hello world!"),
        contentType: "text/plain",
      },
    ]);

    expect(capturedBody).toBeInstanceOf(FormData);
    expect(res.attachments).toHaveLength(1);
    expect(res.attachments[0].filename).toBe("notes.txt");
  });

  it("recalls context combining pinned memories and semantic search results", async () => {
    globalThis.fetch = vi
      .fn()
      // Call 1: listMemories(pinned: true)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            memories: [
              { id: 1, title: "Standing Rules", body: "Rule 1", pinned: true },
              { id: 2, title: "Code Style", body: "Style 2", pinned: true },
            ],
            meta: { limit: 100, offset: 0, total_count: 2 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      // Call 2: search(q: "databases")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            results: [
              {
                type: "Memory",
                score: 0.95,
                data: { id: 2, title: "Code Style", body: "Style 2", pinned: true }, // Overlap ID 2
              },
              {
                type: "Memory",
                score: 0.88,
                data: { id: 3, title: "PostgreSQL Database Invariants", body: "ACID", pinned: false },
              },
            ],
            meta: { mode: "semantic", query: "databases", count: 2 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const client = new MemorableClient();
    const context = await client.recallContext({ query: "databases", mode: "semantic" });

    expect(context.pinned_memories).toHaveLength(2);
    expect(context.search_results).toHaveLength(2);
    expect(context.search_mode).toBe("semantic");
    expect(context.total_unique_memories).toBe(3); // 1, 2, 3
  });

  it("throws MemorableApiError with structured details on 422", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          error: "Validation failed",
          details: ["Title can't be blank"],
        }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      )
    );

    const client = new MemorableClient();
    await expect(client.createMemory({ title: "" })).rejects.toThrow(MemorableApiError);

    try {
      await client.createMemory({ title: "" });
    } catch (err) {
      const apiErr = err as MemorableApiError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.message).toBe("Validation failed");
      expect(apiErr.details).toContain("Title can't be blank");
    }
  });

  it("handles 404 resource not found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Resource not found",
          details: ["Couldn't find Memory with 'id'=9999"],
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    );

    const client = new MemorableClient();
    await expect(client.getMemory(9999)).rejects.toThrow(MemorableApiError);
  });
});
