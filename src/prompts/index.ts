import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemorableClient } from "../client/memorable-client.js";

/**
 * Extracts all unique placeholder variable names from a memory template string.
 * Example: "Rule for {{service}} by {{author}}" -> ["service", "author"]
 */
export function extractTemplateVariables(body: string): string[] {
  const matches = Array.from(body.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g), (m) => m[1]);
  return Array.from(new Set(matches));
}

/**
 * Substitutes {{variable}} placeholders in a memory body.
 */
export function substituteVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    result = result.replace(pattern, value);
  }
  return result;
}

/**
 * Normalizes a memory title to an MCP-compliant prompt identifier (lowercase alphanumeric + underscores).
 */
export function toMemoryPromptSlug(id: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return `memorable_${id}_${slug || "memory"}`;
}

export function registerPrompts(server: McpServer, client: MemorableClient): void {
  // 1. Memory template executor: loads any Memorable memory by ID and substitutes {{variables}}
  server.prompt(
    "memorable_use_memory_template",
    "Load any Memorable memory or prompt template by ID, substituting {{variables}} into the Markdown body",
    {
      memory_id: z.string().describe("The ID of the Memorable memory to fetch and format"),
      variables: z
        .string()
        .optional()
        .describe(
          "JSON string mapping variable names to their values (e.g. '{\"service\":\"auth-service\",\"env\":\"production\"}')"
        ),
    },
    async ({ memory_id, variables }) => {
      const id = Number(memory_id);
      const memory = await client.getMemory(id);

      let parsedVars: Record<string, string> = {};
      if (variables) {
        try {
          parsedVars = JSON.parse(variables);
        } catch {
          // If not valid JSON, ignore and return raw template
        }
      }

      const formattedText = substituteVariables(memory.body || "", parsedVars);

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: formattedText,
            },
          },
        ],
      };
    }
  );

  // 2. Author Memory Prompt: Interactive guide to create structured context/knowledge
  server.prompt(
    "memorable_author_memory",
    "Interactive engineering guide to draft structured AI context, decisions, preferences, or technical knowledge for Memorable",
    {
      topic: z.string().describe("Topic, subject, or domain of the memory to document"),
      memory_type: z
        .enum(["preference", "decision", "architecture", "troubleshooting", "context"])
        .optional()
        .describe(
          "Optional memory archetype: 'preference', 'decision' (ADR), 'architecture', 'troubleshooting', or 'context'"
        ),
      pin: z
        .enum(["true", "false"])
        .optional()
        .describe("Whether this memory should be pinned to the top of the workspace (default 'false')"),
    },
    async ({ topic, memory_type, pin }) => {
      const selectedType = memory_type || "context";
      const isPinned = pin === "true";

      const typeGuides: Record<string, string> = {
        preference:
          "Include: `# User / Project Preference`, `## Core Rules`, `## Do's & Don'ts`, and `## Code Style Examples`.",
        decision:
          "Include: `# Decision: [Title]`, `## Context & Motivation`, `## Chosen Approach`, and `## Consequences`.",
        architecture:
          "Include: `# Architecture: [System]`, `## Components & Topology`, `## Data Invariants`, and `## External Integrations`.",
        troubleshooting:
          "Include: `# Troubleshooting: [Symptom]`, `## Root Cause`, `## Diagnostics`, and `## Resolution Steps`.",
        context:
          "Include: `# Context: [Topic]`, `## Background`, `## Relevant Constraints`, and `## Key References`.",
      };

      const guideText = [
        `You are assisting the user in capturing high-value long-term context and instructions for Memorable.`,
        `Topic: ${topic}`,
        `Memory Archetype: ${selectedType.toUpperCase()}`,
        `Pinned State: ${isPinned ? "PINNED (Standing Workspace Context)" : "UNPINNED"}`,
        "",
        `Structure Recommendation:`,
        `1. ${typeGuides[selectedType] || typeGuides.context}`,
        `2. Use clean GitHub Flavored Markdown (bullet lists, tables, syntax-highlighted code blocks).`,
        `3. When completed, invoke 'memorable_create_memory' with title, body, and pinned: ${isPinned} to persist it to Memorable.`,
      ].join("\n");

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: guideText,
            },
          },
        ],
      };
    }
  );

  // 3. Recall Context Prompt: Synthesizes pinned context + semantic matches
  server.prompt(
    "memorable_recall_context",
    "Recall standing pinned context and search relevant memories in Memorable to produce a unified context brief",
    {
      topic: z.string().describe("Task, topic, or question requiring contextual knowledge"),
      search_mode: z
        .enum(["auto", "semantic", "keyword"])
        .optional()
        .describe("Search mode: 'auto' (hybrid vector fallback to keyword), 'semantic', or 'keyword'"),
    },
    async ({ topic, search_mode }) => {
      const recallData = await client.recallContext({
        query: topic,
        mode: search_mode || "auto",
        limit: 10,
        include_pinned: true,
      });

      const pinnedSection =
        recallData.pinned_memories.length > 0
          ? recallData.pinned_memories
              .map((m) => `### 📌 [Pinned] ${m.title} (ID: ${m.id})\n\n${m.body || "_Empty_"}`)
              .join("\n\n---\n\n")
          : "_No pinned memories currently active._";

      const matchedSection =
        recallData.search_results.length > 0
          ? recallData.search_results
              .map((r) => {
                const scoreText = r.score !== null ? ` (Similarity: ${(r.score * 100).toFixed(1)}%)` : "";
                return `### 🔍 ${r.data.title} [ID: ${r.data.id}]${scoreText}\n\n${r.data.body || "_Empty_"}`;
              })
              .join("\n\n---\n\n")
          : "_No semantic search matches found._";

      const briefing = [
        `# Memorable Context Briefing for Topic: "${topic}"`,
        `Search Mode: ${recallData.search_mode || "auto"} | Total Unique Memories: ${recallData.total_unique_memories}`,
        "",
        `## 1. Standing Pinned Instructions & Guidelines`,
        pinnedSection,
        "",
        `## 2. Semantically Relevant Memories`,
        matchedSection,
        "",
        `## Instructions for AI Assistant`,
        `Integrate the above guidelines, preferences, and architecture context when executing tasks for the user.`,
      ].join("\n");

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: briefing,
            },
          },
        ],
      };
    }
  );
}

/**
 * Optionally syncs saved memories from a running Memorable instance into native MCP prompts at server startup.
 */
export async function syncMemoriesFromMemorable(server: McpServer, client: MemorableClient): Promise<number> {
  try {
    const { memories } = await client.listMemories({ limit: 50 });
    let registeredCount = 0;

    for (const memory of memories) {
      if (!memory.id) continue;
      const promptSlug = toMemoryPromptSlug(memory.id, memory.title || "memory");
      const variables = extractTemplateVariables(memory.body || "");
      const shape: Record<string, z.ZodString> = {};

      for (const v of variables) {
        shape[v] = z.string().describe(`Template value for {{${v}}}`);
      }

      try {
        server.prompt(
          promptSlug,
          `[Memorable] ${memory.title}${memory.pinned ? " 📌" : ""}`,
          shape,
          async (args) => {
            const fullMemory = await client.getMemory(memory.id!);
            const substituted = substituteVariables(fullMemory.body || "", args as Record<string, string>);
            return {
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: substituted,
                  },
                },
              ],
            };
          }
        );
        registeredCount++;
      } catch {
        // Skip duplicate or registration errors
      }
    }
    return registeredCount;
  } catch {
    // If Memorable API is temporarily offline during boot, static prompts remain available
    return 0;
  }
}
