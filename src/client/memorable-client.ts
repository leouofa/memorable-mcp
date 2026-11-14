import type {
  Attachment,
  AttachmentsResponse,
  ErrorResponse,
  GenerateEmbeddingResponse,
  MarkdownResponse,
  Memory,
  MemoryDetail,
  MemoryInput,
  NeighborsResponse,
  PaginatedMemories,
  RecallContextResponse,
  SearchMode,
  SearchResponse,
  Stats,
  StatusOkResponse,
  TogglePinResponse,
} from "../types/index.js";

export interface MemorableClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class MemorableApiError extends Error {
  readonly status: number;
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.name = "MemorableApiError";
    this.status = status;
    this.details = details;
  }
}

export class MemorableClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(options: MemorableClientOptions = {}) {
    const rawUrl = options.baseUrl || process.env.MEMORABLE_API_URL || "http://localhost:3000";
    this.baseUrl = rawUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
    this.apiKey = options.apiKey || process.env.MEMORABLE_API_KEY;
    this.timeoutMs =
      options.timeoutMs ??
      (process.env.MEMORABLE_TIMEOUT_MS ? Number.parseInt(process.env.MEMORABLE_TIMEOUT_MS, 10) : 30000);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(options.headers);

    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    if (this.apiKey && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${this.apiKey}`);
    }

    if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      if (!response.ok) {
        if (isJson) {
          const errorBody = (await response.json()) as Partial<ErrorResponse>;
          const message = errorBody.error || `HTTP ${response.status} ${response.statusText}`;
          const details = Array.isArray(errorBody.details) ? errorBody.details : [];
          throw new MemorableApiError(response.status, message, details);
        } else {
          const text = await response.text();
          throw new MemorableApiError(response.status, text || `HTTP ${response.status} ${response.statusText}`);
        }
      }

      if (isJson) {
        return (await response.json()) as T;
      }
      return (await response.text()) as unknown as T;
    } catch (err: unknown) {
      if (err instanceof MemorableApiError) {
        throw err;
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new MemorableApiError(408, `Memorable API request timed out after ${this.timeoutMs}ms`);
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new MemorableApiError(0, `Memorable API network error connecting to ${url}: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  // System & Stats
  async getStats(): Promise<Stats> {
    return this.request<Stats>("/api/v1/stats");
  }

  async getOpenApiSpec(): Promise<unknown> {
    return this.request<unknown>("/api/v1/openapi");
  }

  // Markdown Rendering
  async renderMarkdown(text: string): Promise<MarkdownResponse> {
    return this.request<MarkdownResponse>("/api/v1/markdown/render", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  }

  // Unified Search
  async search(params: { q: string; mode?: SearchMode; limit?: number }): Promise<SearchResponse> {
    const query = new URLSearchParams();
    query.set("q", params.q);
    if (params.mode) query.set("mode", params.mode);
    if (params.limit !== undefined) query.set("limit", String(params.limit));

    return this.request<SearchResponse>(`/api/v1/search?${query.toString()}`);
  }

  // Memories
  async listMemories(params?: {
    q?: string;
    mode?: SearchMode;
    pinned?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedMemories> {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.mode) query.set("mode", params.mode);
    if (params?.pinned !== undefined) query.set("pinned", String(params.pinned));
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.offset !== undefined) query.set("offset", String(params.offset));

    const queryString = query.toString();
    const path = `/api/v1/memories${queryString ? `?${queryString}` : ""}`;
    return this.request<PaginatedMemories>(path);
  }

  async getMemory(id: number, renderMarkdown?: boolean): Promise<MemoryDetail> {
    const query = renderMarkdown ? "?render_markdown=true" : "";
    return this.request<MemoryDetail>(`/api/v1/memories/${id}${query}`);
  }

  async createMemory(input: MemoryInput): Promise<MemoryDetail> {
    return this.request<MemoryDetail>("/api/v1/memories", {
      method: "POST",
      body: JSON.stringify({ memory: input }),
    });
  }

  async updateMemory(id: number, input: Partial<MemoryInput>, renderMarkdown?: boolean): Promise<MemoryDetail> {
    const query = renderMarkdown ? "?render_markdown=true" : "";
    return this.request<MemoryDetail>(`/api/v1/memories/${id}${query}`, {
      method: "PATCH",
      body: JSON.stringify({ memory: input }),
    });
  }

  async appendToMemory(
    id: number,
    content: string,
    options?: { separator?: string; renderMarkdown?: boolean }
  ): Promise<MemoryDetail> {
    const existing = await this.getMemory(id);
    const separator = options?.separator ?? "\n\n";
    const currentBody = existing.body || "";
    const updatedBody = currentBody.length > 0 ? `${currentBody}${separator}${content}` : content;
    return this.updateMemory(id, { body: updatedBody }, options?.renderMarkdown);
  }

  async deleteMemory(id: number): Promise<StatusOkResponse> {
    return this.request<StatusOkResponse>(`/api/v1/memories/${id}`, {
      method: "DELETE",
    });
  }

  async findNeighbors(id: number, limit?: number): Promise<NeighborsResponse> {
    const query = limit !== undefined ? `?limit=${limit}` : "";
    return this.request<NeighborsResponse>(`/api/v1/memories/${id}/neighbors${query}`);
  }

  async generateEmbedding(id: number, isAsync?: boolean): Promise<GenerateEmbeddingResponse> {
    const query = isAsync ? "?async=true" : "";
    return this.request<GenerateEmbeddingResponse>(`/api/v1/memories/${id}/generate_embedding${query}`, {
      method: "POST",
    });
  }

  async togglePinMemory(id: number): Promise<TogglePinResponse> {
    return this.request<TogglePinResponse>(`/api/v1/memories/${id}/toggle_pin`, {
      method: "PATCH",
    });
  }

  async reorderPinnedMemories(memoryIds: number[]): Promise<StatusOkResponse> {
    return this.request<StatusOkResponse>("/api/v1/memories/reorder_pinned", {
      method: "PATCH",
      body: JSON.stringify({ memory_ids: memoryIds }),
    });
  }

  // Attachments
  async listAttachments(memoryId: number): Promise<AttachmentsResponse> {
    return this.request<AttachmentsResponse>(`/api/v1/memories/${memoryId}/attachments`);
  }

  async uploadAttachments(
    memoryId: number,
    files: Array<{ filename: string; content: Blob | Uint8Array | Buffer; contentType?: string }>
  ): Promise<AttachmentsResponse> {
    const formData = new FormData();
    for (const file of files) {
      let blob: Blob;
      if (file.content instanceof Blob) {
        blob = file.content;
      } else {
        blob = new Blob([new Uint8Array(file.content)], { type: file.contentType || "application/octet-stream" });
      }
      formData.append("files[]", blob, file.filename);
    }

    return this.request<AttachmentsResponse>(`/api/v1/memories/${memoryId}/attachments`, {
      method: "POST",
      body: formData,
    });
  }

  async deleteAttachment(memoryId: number, attachmentId: number): Promise<StatusOkResponse> {
    return this.request<StatusOkResponse>(`/api/v1/memories/${memoryId}/attachments/${attachmentId}`, {
      method: "DELETE",
    });
  }

  // Composite Context Recall
  async recallContext(params?: {
    query?: string;
    mode?: SearchMode;
    limit?: number;
    include_pinned?: boolean;
  }): Promise<RecallContextResponse> {
    const includePinned = params?.include_pinned !== false;
    const limit = params?.limit ?? 10;
    const mode = params?.mode ?? "auto";

    const tasks: [Promise<PaginatedMemories | null>, Promise<SearchResponse | null>] = [
      includePinned ? this.listMemories({ pinned: true, limit: 100 }) : Promise.resolve(null),
      params?.query ? this.search({ q: params.query, mode, limit }) : Promise.resolve(null),
    ];

    const [pinnedRes, searchRes] = await Promise.all(tasks);

    const pinnedMemories = pinnedRes ? pinnedRes.memories : [];
    const searchResults = searchRes ? searchRes.results : [];

    const seenIds = new Set<number>();
    pinnedMemories.forEach((m) => {
      if (m.id !== undefined) seenIds.add(m.id);
    });
    searchResults.forEach((r) => {
      if (r.data.id !== undefined) seenIds.add(r.data.id);
    });

    return {
      pinned_memories: pinnedMemories,
      search_results: searchResults,
      search_mode: searchRes ? searchRes.meta.mode : null,
      total_unique_memories: seenIds.size,
    };
  }
}
