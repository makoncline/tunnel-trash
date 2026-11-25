"use client";

import { useEffect } from "react";
import { CLOSED_SNOW_API_ORIGIN, CLOSED_SNOW_MCP_TOOLS } from "@/lib/agent-ready";

type ToolInput = Record<string, unknown> | undefined;

type WebMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (
    input: ToolInput,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>;
};

type ModelContext = {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void> | undefined;
  unregisterTool?: (name: string) => void;
};

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    modelContext?: ModelContext;
  }
}

async function callClosedSnowMcp(
  name: string,
  input: ToolInput,
  signal?: AbortSignal,
) {
  const response = await fetch(`${CLOSED_SNOW_API_ORIGIN}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: input ?? {} },
    }),
    signal,
  });
  const text = await response.text();
  const trimmed = text.trim();
  const payload = (
    trimmed.startsWith("{")
      ? JSON.parse(trimmed)
      : JSON.parse(
          trimmed
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .at(-1) ?? "{}",
        )
  ) as { result?: unknown; error?: { message?: string } };
  if (payload.error) {
    throw new Error(payload.error.message ?? "MCP request failed");
  }
  return payload.result;
}

export function WebMcpTools() {
  useEffect(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== "function") {
      return;
    }

    const controller = new AbortController();
    const tools: WebMcpTool[] = [
      ...CLOSED_SNOW_MCP_TOOLS.map((tool) => ({
        ...tool,
        annotations: { readOnlyHint: true },
        execute: (input: ToolInput, options?: { signal?: AbortSignal }) =>
          callClosedSnowMcp(tool.name, input, options?.signal),
      })),
      {
        name: "search_site",
        title: "Search Tunnel Trash and Closed Snow",
        description:
          "Search live Colorado ski conditions, 7-day snow forecasts, road alerts, and Tunnel Trash details in Markdown.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", description: "Search keywords or question." },
          },
        },
        annotations: { readOnlyHint: true },
        execute: async (input, options) => {
          const query = typeof input?.query === "string" ? input.query.trim() : "";
          const response = await fetch(
            `/.well-known/search?q=${encodeURIComponent(query)}`,
            { signal: options?.signal },
          );
          return { markdown: await response.text() };
        },
      },
    ];

    for (const tool of tools) {
      void Promise.resolve(
        modelContext.registerTool(tool, { signal: controller.signal }),
      ).catch(() => undefined);
    }

    return () => {
      controller.abort();
      for (const tool of tools) {
        modelContext.unregisterTool?.(tool.name);
      }
    };
  }, []);

  return null;
}
