import { NextResponse, type NextRequest } from "next/server";
import {
  SKILL_ARTIFACTS,
  agentGuideMarkdown,
  agentSkillsIndex,
  aiCatalogDocument,
  apiCatalogDocument,
  estimateTokens,
  linkHeaderValue,
  llmsTxt,
  mcpServerCard,
  openApiDocument,
  poppyDocument,
  renderPageMarkdown,
  renderSearchMarkdown,
} from "@/lib/agent-ready";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};

function jsonResponse(
  body: unknown,
  contentType = "application/json; charset=utf-8",
  cacheControl = "public, max-age=3600",
) {
  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  });
}

function markdownResponse(
  body: string,
  cacheControl = "public, max-age=3600",
  extra: Record<string, string> = {},
) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": cacheControl,
      "x-markdown-tokens": estimateTokens(body),
      ...extra,
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await context.params;
  const key = slug.join("/");

  if (key === "api-catalog") {
    return jsonResponse(apiCatalogDocument(), "application/linkset+json; charset=utf-8");
  }
  if (key === "openapi") {
    return jsonResponse(openApiDocument(), "application/openapi+json; charset=utf-8");
  }
  if (key === "mcp-server-card") {
    return jsonResponse(mcpServerCard());
  }
  if (key === "skills") {
    return jsonResponse(await agentSkillsIndex());
  }
  if (slug[0] === "skills" && slug[1] && slug.length === 2) {
    const skill = SKILL_ARTIFACTS.find((item) => item.slug === slug[1]);
    if (!skill) {
      return new NextResponse(null, { status: 404, headers: CORS_HEADERS });
    }
    return markdownResponse(skill.text);
  }
  if (key === "ai-catalog") {
    return jsonResponse(aiCatalogDocument());
  }
  if (key === "poppy") {
    return jsonResponse(poppyDocument());
  }
  if (key === "guide") {
    return markdownResponse(agentGuideMarkdown());
  }
  if (key === "llms") {
    return markdownResponse(llmsTxt());
  }
  if (key === "markdown") {
    const rawPath = request.nextUrl.searchParams.get("path") ?? "/";
    const pathname = rawPath === "/closed-snow" ? "/closed-snow" : "/";
    const body = await renderPageMarkdown(pathname);
    return markdownResponse(body, "public, max-age=60", {
      Vary: "Accept",
      Link: linkHeaderValue(pathname),
    });
  }
  if (key === "search") {
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (!query) {
      return new NextResponse("Missing required query parameter: q\n", {
        status: 400,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/plain; charset=utf-8",
          "Accept-Query": "q",
          "Cache-Control": "no-store",
        },
      });
    }
    const body = await renderSearchMarkdown(query);
    return markdownResponse(body, "public, max-age=60", {
      "Accept-Query": "q",
    });
  }

  return new NextResponse(null, { status: 404, headers: CORS_HEADERS });
}
