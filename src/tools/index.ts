import fs from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemorableApiError, type MemorableClient } from "../client/memorable-client.js";
import {
  AppendToMemorySchema,
  CreateMemorySchema,
  DeleteAttachmentSchema,
  DeleteMemorySchema,
  FileUploadItemSchema,
  FindNeighborsSchema,
  GenerateEmbeddingSchema,
  GetMemorySchema,
  ListMemoriesSchema,
  RecallContextSchema,
  RenderMarkdownSchema,
  ReorderPinnedMemoriesSchema,
  SearchSchema,
  TogglePinMemorySchema,
  UpdateMemorySchema,
} from "./schemas.js";

function formatError(error: unknown): { isError: true; content: Array<{ type: "text"; text: string }> } {
  if (error instanceof MemorableApiError) {
    const details = error.details.length > 0 ? `\nDetails:\n${error.details.map((d) => `• ${d}`).join("\n")}` : "";
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Memorable API Error [${error.status}]: ${error.message}${details}`,
        },
      ],
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}

function formatResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function registerTools(server: McpServer, client: MemorableClient): void {
  // 1. Unified Vector & Keyword Search
  server.tool(
    "memorable_search",
    "Unified vector and keyword search across Memorable memories using pgvector cosine similarity or text matching",
    SearchSchema.shape,
    async (args) => {
      try {
        const result = await client.search(args);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 2. Composite Context Recall
  server.tool(
    "memorable_recall_context",
    "Recalls standing pinned memories combined with relevant semantic search matches in one unified context payload",
    RecallContextSchema.shape,
    async (args) => {
      try {
        const result = await client.recallContext(args);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 3. List Memories
  server.tool(
    "memorable_list_memories",
    "List, filter, and paginate memories in Memorable with optional query, mode, and pinned filters",
    ListMemoriesSchema.shape,
    async (args) => {
      try {
        const result = await client.listMemories(args);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 4. Get Memory
  server.tool(
    "memorable_get_memory",
    "Retrieve a memory's full Markdown content, embedding status, attachments, and optional rendered HTML",
    GetMemorySchema.shape,
    async ({ id, render_markdown }) => {
      try {
        const result = await client.getMemory(id, render_markdown);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 5. Create Memory
  server.tool(
    "memorable_create_memory",
    "Create a new memory in Memorable (automatically enqueues vector embedding in the background)",
    CreateMemorySchema.shape,
    async (args) => {
      try {
        const result = await client.createMemory(args);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 6. Update Memory
  server.tool(
    "memorable_update_memory",
    "Update a memory's title, Markdown body, or pinned status in Memorable",
    UpdateMemorySchema.shape,
    async ({ id, render_markdown, ...input }) => {
      try {
        const result = await client.updateMemory(id, input, render_markdown);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 7. Append To Memory
  server.tool(
    "memorable_append_to_memory",
    "Safely append Markdown content to an existing memory without overwriting its prior body",
    AppendToMemorySchema.shape,
    async ({ id, content, separator, render_markdown }) => {
      try {
        const result = await client.appendToMemory(id, content, {
          separator,
          renderMarkdown: render_markdown,
        });
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 8. Delete Memory
  server.tool(
    "memorable_delete_memory",
    "Permanently delete a memory and its associated attachments from Memorable",
    DeleteMemorySchema.shape,
    async ({ id }) => {
      try {
        const result = await client.deleteMemory(id);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 9. Find Nearest Semantic Neighbors
  server.tool(
    "memorable_find_neighbors",
    "Find nearest semantic neighbor memories via 1024-dimensional pgvector cosine distance",
    FindNeighborsSchema.shape,
    async ({ id, limit }) => {
      try {
        const result = await client.findNeighbors(id, limit);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 10. Generate / Refresh Embedding
  server.tool(
    "memorable_generate_embedding",
    "Generate or refresh the 1024-dimensional vector embedding for a memory using Ollama (synchronous or async background job)",
    GenerateEmbeddingSchema.shape,
    async (args) => {
      try {
        const result = await client.generateEmbedding(args.id, args.async);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 11. Toggle Pin
  server.tool(
    "memorable_toggle_pin",
    "Toggle the pinned status of a memory in the Memorable workspace",
    TogglePinMemorySchema.shape,
    async ({ id }) => {
      try {
        const result = await client.togglePinMemory(id);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 12. Reorder Pinned Memories
  server.tool(
    "memorable_reorder_pinned",
    "Update the sequential order of pinned memories displayed at the top of the Memorable workspace",
    ReorderPinnedMemoriesSchema.shape,
    async ({ memory_ids }) => {
      try {
        const result = await client.reorderPinnedMemories(memory_ids);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 13. List Attachments
  server.tool(
    "memorable_list_attachments",
    "List file attachments and download URLs associated with a memory",
    { memory_id: z.number().int().positive().describe("Unique identifier of the memory") },
    async ({ memory_id }) => {
      try {
        const result = await client.listAttachments(memory_id);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 14. Upload Attachment
  server.tool(
    "memorable_upload_attachment",
    "Upload one or more files to attach to a memory in Memorable (accepts local file paths or base64 data)",
    {
      memory_id: z.number().int().positive().describe("Unique identifier of the memory"),
      files: z.array(FileUploadItemSchema).min(1).describe("Files to attach (path on disk or base64 content)"),
    },
    async ({ memory_id, files }) => {
      try {
        const processedFiles: Array<{ filename: string; content: Buffer; contentType?: string }> = [];

        for (const file of files) {
          if (file.path) {
            const resolvedPath = path.resolve(file.path);
            const content = await fs.readFile(resolvedPath);
            const filename = file.filename || path.basename(resolvedPath);
            processedFiles.push({ filename, content, contentType: file.content_type });
          } else if (file.content_base64 && file.filename) {
            const content = Buffer.from(file.content_base64, "base64");
            processedFiles.push({ filename: file.filename, content, contentType: file.content_type });
          } else {
            return formatError(new Error("Each file must specify either 'path' or both 'filename' and 'content_base64'"));
          }
        }

        const result = await client.uploadAttachments(memory_id, processedFiles);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 15. Delete Attachment
  server.tool(
    "memorable_delete_attachment",
    "Purge and delete an attachment from a memory",
    DeleteAttachmentSchema.shape,
    async ({ memory_id, attachment_id }) => {
      try {
        const result = await client.deleteAttachment(memory_id, attachment_id);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 16. Render Markdown
  server.tool(
    "memorable_render_markdown",
    "Render Markdown text to sanitized HTML using Memorable's Redcarpet GitHub-flavored markdown pipeline",
    RenderMarkdownSchema.shape,
    async ({ text }) => {
      try {
        const result = await client.renderMarkdown(text);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // 17. System Stats
  server.tool(
    "memorable_get_stats",
    "Get system statistics from Memorable (total memories, pinned memories, and attachments count)",
    async () => {
      try {
        const result = await client.getStats();
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
