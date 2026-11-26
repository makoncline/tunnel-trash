/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  async rewrites() {
    return [
      { source: "/.well-known/api-catalog", destination: "/api/agent/api-catalog" },
      { source: "/.well-known/agent-guide.md", destination: "/api/agent/guide" },
      { source: "/.well-known/mcp/server-card.json", destination: "/api/agent/mcp-server-card" },
      { source: "/.well-known/agent-skills/index.json", destination: "/api/agent/skills" },
      { source: "/.well-known/agent-skills/:slug/SKILL.md", destination: "/api/agent/skills/:slug" },
      { source: "/.well-known/ai-catalog.json", destination: "/api/agent/ai-catalog" },
      { source: "/.well-known/poppy.json", destination: "/api/agent/poppy" },
      { source: "/.well-known/search", destination: "/api/agent/search" },
      { source: "/openapi.json", destination: "/api/agent/openapi" },
      { source: "/llms.txt", destination: "/api/agent/llms" },
    ];
  },
};

export default config;
