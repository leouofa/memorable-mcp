import { z } from "zod";

export const SearchModeSchema = z
  .enum(["auto", "semantic", "keyword"])
  .optional()
  .describe("Search mode: 'auto' (hybrid vector fallback to keyword), 'semantic' (pure pgvector), or 'keyword'");

// 1. Search
export const SearchSchema = z.object({
  q: z.string().min(1).describe("Search query string to find matching memories"),
  mode: SearchModeSchema,
  limit: z.number().int().min(1).max(100).optional().describe("Maximum number of results to return (1-100, default 20)"),
});

// 2. Recall Context
export const RecallContextSchema = z.object({
  query: z.string().optional().describe("Optional topic or query to semantically match against memories"),
  mode: SearchModeSchema,
  limit: z.number().int().min(1).max(50).optional().describe("Maximum search results to return (default 10)"),
  include_pinned: z
    .boolean()
    .optional()
    .describe("Whether to include standing pinned memories in the recalled context (default true)"),
});

// 3. List Memories
export const ListMemoriesSchema = z.object({
  q: z.string().optional().describe("Optional search query across memory title and body"),
  mode: SearchModeSchema,
  pinned: z.boolean().optional().describe("Filter memories by pinned status"),
  limit: z.number().int().min(1).max(100).optional().describe("Number of memories to return (1-100, default 50)"),
  offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)"),
});

// 4. Get Memory
export const GetMemorySchema = z.object({
  id: z.number().int().positive().describe("Unique identifier of the memory"),
  render_markdown: z
    .boolean()
    .optional()
    .describe("Whether to include rendered HTML for the memory Markdown body"),
});

// 5. Create Memory
export const CreateMemorySchema = z.object({
  title: z.string().min(1).describe("Title or headline of the memory"),
  body: z.string().optional().describe("Markdown content, instructions, or knowledge context"),
  pinned: z.boolean().optional().describe("Whether this memory should be pinned to the top of the workspace"),
  pinned_position: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional manual order index for pinned memory"),
});

// 6. Update Memory
export const UpdateMemorySchema = z.object({
  id: z.number().int().positive().describe("Unique identifier of the memory"),
  title: z.string().min(1).optional().describe("Updated title of the memory"),
  body: z.string().optional().describe("Updated Markdown content of the memory"),
  pinned: z.boolean().optional().describe("Update pinned status"),
  pinned_position: z.number().int().positive().nullable().optional().describe("Update pinned position index"),
  render_markdown: z.boolean().optional().describe("Whether to return rendered HTML in the response"),
});

// 7. Append To Memory
export const AppendToMemorySchema = z.object({
  id: z.number().int().positive().describe("Unique identifier of the memory to append to"),
  content: z.string().min(1).describe("Markdown content to append to the existing memory body"),
  separator: z
    .string()
    .optional()
    .describe("Separator between existing content and appended content (defaults to double newline)"),
  render_markdown: z.boolean().optional().describe("Whether to return rendered HTML in the response"),
});

// 8. Delete Memory
export const DeleteMemorySchema = z.object({
  id: z.number().int().positive().describe("Unique identifier of the memory to permanently delete"),
});

// 9. Find Neighbors
export const FindNeighborsSchema = z.object({
  id: z.number().int().positive().describe("Unique identifier of the target memory"),
  limit: z.number().int().min(1).max(100).optional().describe("Maximum nearest neighbors to return (default 10)"),
});

// 10. Generate Embedding
export const GenerateEmbeddingSchema = z.object({
  id: z.number().int().positive().describe("Unique identifier of the memory to vectorize"),
  async: z
    .boolean()
    .optional()
    .describe("Whether to enqueue embedding generation as a background job (default false = synchronous)"),
});

// 11. Toggle Pin
export const TogglePinMemorySchema = z.object({
  id: z.number().int().positive().describe("Unique identifier of the memory whose pinned state should be toggled"),
});

// 12. Reorder Pinned
export const ReorderPinnedMemoriesSchema = z.object({
  memory_ids: z
    .array(z.number().int().positive())
    .min(1)
    .describe("Array of pinned memory IDs in their desired sequential order"),
});

// 13. File Upload Item
export const FileUploadItemSchema = z.object({
  path: z.string().optional().describe("Absolute or relative local file path on disk"),
  filename: z.string().optional().describe("Target filename (required if using content_base64)"),
  content_base64: z.string().optional().describe("Base64-encoded file content (alternative to disk path)"),
  content_type: z.string().optional().describe("MIME type (e.g. 'image/png', 'application/pdf')"),
});

// 14. Delete Attachment
export const DeleteAttachmentSchema = z.object({
  memory_id: z.number().int().positive().describe("Unique identifier of the memory"),
  attachment_id: z.number().int().positive().describe("Unique identifier of the attachment to purge"),
});

// 15. Render Markdown
export const RenderMarkdownSchema = z.object({
  text: z.string().describe("Raw Markdown text to render into sanitized HTML"),
});
