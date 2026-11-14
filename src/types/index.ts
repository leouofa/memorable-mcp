import type { components } from "./memorable-api.js";

// OpenAPI component schemas
export type Memory = components["schemas"]["Memory"];
export type MemoryDetail = components["schemas"]["MemoryDetail"];
export type Attachment = components["schemas"]["Attachment"];
export type Stats = components["schemas"]["Stats"];
export type PaginationMeta = components["schemas"]["PaginationMeta"];
export type StatusOkResponse = components["schemas"]["StatusResponse"];
export type ErrorResponse = components["schemas"]["Error"];

// Search and Mode types
export type SearchMode = "auto" | "semantic" | "keyword";

export interface SearchResultItem {
  type: string;
  score: number | null;
  data: Memory;
}

export interface SearchResponse {
  status: string;
  results: SearchResultItem[];
  meta: {
    mode: string;
    query: string;
    count: number;
  };
}

export interface PaginatedMemories {
  memories: Memory[];
  meta: PaginationMeta;
}

export interface MemoryInput {
  title: string;
  body?: string;
  pinned?: boolean;
  pinned_position?: number | null;
}

export interface NeighborItem {
  score: number;
  memory: Memory;
}

export interface NeighborsResponse {
  status: string;
  memory: Memory;
  neighbors: NeighborItem[];
}

export interface GenerateEmbeddingResponse {
  status: string;
  message: string;
  memory?: Memory;
}

export interface TogglePinResponse {
  status: string;
  pinned: boolean;
  pinned_position: number | null;
  memory: Memory;
}

export interface AttachmentsResponse {
  status?: string;
  attachments: Attachment[];
}

export interface MarkdownResponse {
  html: string;
}

export interface RecallContextResponse {
  pinned_memories: Memory[];
  search_results: SearchResultItem[];
  search_mode: string | null;
  total_unique_memories: number;
}
