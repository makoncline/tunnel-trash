export const SITE_ORIGIN = "https://www.tunnel-trash.com";
export const CLOSED_SNOW_API_ORIGIN = "https://closed-snow.makon.dev";
export const CONTENT_SIGNAL = "ai-train=no, search=yes, ai-input=yes";
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const AGENT_PATHS = {
  robots: "/robots.txt",
  sitemap: "/sitemap.xml",
  llmsTxt: "/llms.txt",
  openApi: "/openapi.json",
  apiCatalog: "/.well-known/api-catalog",
  agentGuide: "/.well-known/agent-guide.md",
  mcpServerCard: "/.well-known/mcp/server-card.json",
  skillsIndex: "/.well-known/agent-skills/index.json",
  aiCatalog: "/.well-known/ai-catalog.json",
  poppy: "/.well-known/poppy.json",
  search: "/.well-known/search",
} as const;

export const CLOSED_SNOW_MCP_TOOLS = [
  {
    name: "get_ski_day",
    title: "Plan today’s Colorado ski day",
    description:
      "One-shot Colorado ski summary combining resort snow reports, live 4-region 7-day snow outlook, per-resort 7-day forecasts, Denver drive times, CDOT road alerts, and stake cameras.",
    inputSchema: {
      type: "object",
      properties: {
        resortId: {
          type: "string",
          description:
            "Optional resort ID (vail, keystone, breckenridge, beaver-creek, arapahoe-basin, copper, winter-park, eldora, loveland, steamboat).",
        },
        pass: { type: "string", enum: ["epic", "ikon", "independent"] },
        openOnly: { type: "boolean" },
        maxDriveMinutes: { type: "integer", minimum: 1, maximum: 600 },
        includeBrief: { type: "boolean" },
      },
    },
  },
  {
    name: "get_ski_conditions",
    title: "Get Colorado ski conditions",
    description:
      "Get morning snow reports, overnight and 24-hour snow, base depth, lift/trail counts, SNOTEL SWE, and morning stake URLs.",
    inputSchema: {
      type: "object",
      properties: {
        resortId: { type: "string" },
        pass: { type: "string", enum: ["epic", "ikon", "independent"] },
        openOnly: { type: "boolean" },
      },
    },
  },
  {
    name: "get_roads",
    title: "Get Denver drive times and I-70/US-40 road alerts",
    description:
      "Get live Denver-to-resort drive times, delays, traffic trends, road surfaces, traction/chain laws, and CDOT corridor alerts.",
    inputSchema: {
      type: "object",
      properties: { resortId: { type: "string" } },
    },
  },
  {
    name: "get_stake_cameras",
    title: "Get snow-stake cameras and timelapses",
    description:
      "Get morning and live current snow-stake image URLs, clear references, gauge overlays, and MP4 timelapses.",
    inputSchema: {
      type: "object",
      properties: {
        resortId: { type: "string" },
        pass: { type: "string", enum: ["epic", "ikon", "independent"] },
        view: { type: "string", enum: ["both", "morning", "current"] },
      },
    },
  },
  {
    name: "get_resorts",
    title: "Get tracked Colorado resorts",
    description:
      "Get tracked Colorado resorts, pass affiliation (epic, ikon, independent), season status, opening dates, lift hours, and stake IDs.",
    inputSchema: {
      type: "object",
      properties: {
        resortId: { type: "string" },
        pass: { type: "string", enum: ["epic", "ikon", "independent"] },
        date: { type: "string" },
      },
    },
  },
] as const;

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}

export function estimateTokens(text: string): string {
  return String(Math.max(1, Math.ceil(text.length / 4)));
}

export function prefersMarkdown(acceptHeader: string | null): boolean {
  if (!acceptHeader) return false;
  let mdQ = 0;
  let htmlQ = 0;
  for (const part of acceptHeader.split(",")) {
    const [rawType, ...params] = part.trim().toLowerCase().split(";");
    const type = rawType?.trim();
    if (type !== "text/markdown" && type !== "text/html") continue;
    let q = 1;
    for (const param of params) {
      const [key, value] = param.trim().split("=");
      if (key === "q") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) q = parsed;
      }
    }
    if (type === "text/markdown") mdQ = q;
    if (type === "text/html") htmlQ = q;
  }
  return mdQ > 0 && mdQ >= htmlQ;
}

export function linkHeaderValue(pathname: string): string {
  const normalized = pathname === "/closed-snow" ? "/closed-snow" : "/";
  return [
    `<${AGENT_PATHS.apiCatalog}>; rel="api-catalog"`,
    `<${AGENT_PATHS.openApi}>; rel="service-desc"; type="application/openapi+json"`,
    `<${AGENT_PATHS.agentGuide}>; rel="service-doc"; type="text/markdown"`,
    `<${SITE_ORIGIN}${normalized}>; rel="alternate"; type="text/markdown"`,
    `<${AGENT_PATHS.aiCatalog}>; rel="ai-catalog"`,
  ].join(", ");
}

export function robotsTxt(): string {
  return [
    "User-agent: *",
    `Content-Signal: ${CONTENT_SIGNAL}`,
    "Allow: /",
    "Disallow: /admin/",
    "",
    `Sitemap: ${SITE_ORIGIN}${AGENT_PATHS.sitemap}`,
    `Agentmap: ${SITE_ORIGIN}${AGENT_PATHS.aiCatalog}`,
    "",
  ].join("\n");
}

export function sitemapXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_ORIGIN}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${SITE_ORIGIN}/closed-snow</loc>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}

export function apiCatalogDocument() {
  return {
    linkset: [
      {
        anchor: `${CLOSED_SNOW_API_ORIGIN}/v1/index.json`,
        "service-desc": [
          {
            href: `${SITE_ORIGIN}${AGENT_PATHS.openApi}`,
            type: "application/openapi+json",
          },
        ],
        "service-doc": [
          {
            href: `${SITE_ORIGIN}${AGENT_PATHS.agentGuide}`,
            type: "text/markdown",
          },
        ],
        status: [
          {
            href: `${CLOSED_SNOW_API_ORIGIN}/v1/health.json`,
            type: "application/json",
          },
        ],
      },
    ],
  };
}

export function openApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Tunnel Trash · Closed Snow Public API",
      version: "1.1.0",
      description:
        "Machine-readable Colorado ski conditions, 5-model 7-day snow forecasts, live snow-stake cameras, Denver drive times, and CDOT I-70/US-40 road alerts powering Tunnel Trash Closed Snow.",
    },
    servers: [{ url: CLOSED_SNOW_API_ORIGIN }],
    paths: {
      "/v1/ski-day.json": {
        get: {
          summary: "One-shot Colorado ski day summary",
          operationId: "getSkiDay",
          parameters: [
            { name: "resortId", in: "query", schema: { type: "string" } },
            {
              name: "pass",
              in: "query",
              schema: { type: "string", enum: ["epic", "ikon", "independent"] },
            },
            { name: "openOnly", in: "query", schema: { type: "boolean" } },
            {
              name: "maxDriveMinutes",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 600 },
            },
          ],
          responses: { "200": { description: "Combined ski-day JSON" } },
        },
      },
      "/v1/conditions.json": {
        get: {
          summary: "Resort snow reports, base depths, and SNOTEL data",
          operationId: "getConditions",
          responses: { "200": { description: "Conditions manifest" } },
        },
      },
      "/v1/forecast.json": {
        get: {
          summary: "5-model 7-day snow outlook and per-resort daily forecasts",
          operationId: "getForecast",
          responses: { "200": { description: "Forecast manifest" } },
        },
      },
      "/v1/roads.json": {
        get: {
          summary: "Denver drive times and CDOT road alerts",
          operationId: "getRoads",
          responses: { "200": { description: "Roads manifest" } },
        },
      },
      "/v1/resorts.json": {
        get: {
          summary: "Tracked resort catalog and pass affiliations",
          operationId: "getResorts",
          responses: { "200": { description: "Resorts catalog" } },
        },
      },
      "/v1/health.json": {
        get: {
          summary: "Feed freshness and snowfall integrity health status",
          operationId: "getHealth",
          responses: { "200": { description: "Health JSON" } },
        },
      },
      "/.well-known/search": {
        servers: [{ url: SITE_ORIGIN }],
        get: {
          summary:
            "Search live Closed Snow conditions, forecasts, roads, and Tunnel Trash info in Markdown",
          operationId: "searchSite",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Markdown search results" } },
        },
      },
    },
  };
}

export function mcpServerCard() {
  return {
    $schema:
      "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    version: "1.0",
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: {
      name: "closed-snow",
      title: "Closed Snow MCP Server",
      version: "1.1.0",
    },
    description:
      "Live Colorado ski conditions, 5-model 7-day snow forecasts, snow-stake cameras and timelapses, Denver drive times, and CDOT I-70/US-40 road alerts.",
    documentationUrl: `${SITE_ORIGIN}${AGENT_PATHS.agentGuide}`,
    transport: {
      type: "streamable-http",
      endpoint: `${CLOSED_SNOW_API_ORIGIN}/mcp`,
    },
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
    tools: CLOSED_SNOW_MCP_TOOLS.map(({ name, description }) => ({
      name,
      description,
    })),
  };
}

export const SKILL_ARTIFACTS = [
  {
    slug: "closed-snow",
    name: "closed-snow",
    description:
      "Use when an agent needs live Colorado ski conditions, 7-day snow forecasts, snow-stake cameras, Denver drive times, or I-70/US-40 road alerts from Closed Snow on Tunnel Trash.",
    text: [
      "---",
      "name: closed-snow",
      "description: Use when an agent needs live Colorado ski conditions, 7-day snow forecasts, snow-stake cameras, Denver drive times, or I-70/US-40 road alerts from Closed Snow on Tunnel Trash.",
      "---",
      "",
      "# Closed Snow",
      "",
      `Prefer the public MCP server (\`${CLOSED_SNOW_API_ORIGIN}/mcp\`), the JSON API (\`${CLOSED_SNOW_API_ORIGIN}/v1/ski-day.json\`), or Markdown negotiation (\`Accept: text/markdown\` on \`${SITE_ORIGIN}/closed-snow\`) before scraping HTML.`,
      "",
      "## Recommended flow",
      "",
      "1. Call `get_ski_day` (or `GET /v1/ski-day.json`) for a single-call ski decision across all 10 tracked Colorado resorts.",
      "2. Filter by `pass` (`epic`, `ikon`, `independent`), `openOnly: true`, `maxDriveMinutes`, or `resortId`.",
      "3. Use `get_stake_cameras` for morning and live snow-stake photos and MP4 timelapses.",
      "4. Use `get_roads` for live TomTom drive samples and CDOT corridor alerts.",
      "",
    ].join("\n"),
  },
  {
    slug: "tunnel-trash-site",
    name: "tunnel-trash-site",
    description:
      "Use when an agent needs information about Tunnel Trash, the Eisenhower Tee, or how to discover Closed Snow data and tools on tunnel-trash.com.",
    text: [
      "---",
      "name: tunnel-trash-site",
      "description: Use when an agent needs information about Tunnel Trash, the Eisenhower Tee, or how to discover Closed Snow data and tools on tunnel-trash.com.",
      "---",
      "",
      "# Tunnel Trash",
      "",
      `Tunnel Trash (${SITE_ORIGIN}) hosts the Eisenhower Tee shop at \`/\` and the free Colorado ski conditions dashboard (Closed Snow) at \`/closed-snow\`.`,
      "",
      "## Entry points",
      "",
      `- Live Colorado ski dashboard: \`${SITE_ORIGIN}/closed-snow\` (supports \`Accept: text/markdown\`)`,
      `- Site search for agents: \`${SITE_ORIGIN}/.well-known/search?q={query}\``,
      `- Closed Snow MCP server: \`${CLOSED_SNOW_API_ORIGIN}/mcp\``,
      `- Closed Snow JSON API: \`${CLOSED_SNOW_API_ORIGIN}/v1/index.json\``,
      "",
    ].join("\n"),
  },
] as const;

export async function agentSkillsIndex() {
  const skills = await Promise.all(
    SKILL_ARTIFACTS.map(async (skill) => ({
      name: skill.name,
      type: "skill-md",
      description: skill.description,
      url: `${SITE_ORIGIN}/.well-known/agent-skills/${skill.slug}/SKILL.md`,
      digest: await sha256(skill.text),
    })),
  );
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills,
  };
}

export function aiCatalogDocument() {
  return {
    specVersion: "1.0",
    host: {
      displayName: "Tunnel Trash",
      identifier: "did:web:tunnel-trash.com",
    },
    entries: [
      {
        identifier: "urn:air:tunnel-trash.com:server:closed-snow-mcp",
        displayName: "Closed Snow MCP Server",
        type: "application/mcp-server-card+json",
        url: `${SITE_ORIGIN}${AGENT_PATHS.mcpServerCard}`,
        representativeQueries: [
          "Where should I ski in Colorado today on an Epic or Ikon pass?",
          "What is the 7-day snow forecast for Vail, Winter Park, and Summit County?",
          "How long is the drive from Denver to Keystone and is I-70 traction law active?",
          "Show live snow-stake cameras for Colorado ski resorts.",
        ],
      },
      {
        identifier: "urn:air:tunnel-trash.com:api:closed-snow",
        displayName: "Closed Snow Public REST API",
        type: "application/openapi+json",
        url: `${SITE_ORIGIN}${AGENT_PATHS.openApi}`,
        representativeQueries: [
          "Get JSON Colorado ski conditions, base depth, and 7-day snowfall forecasts",
          "Check I-70 and US-40 road surface conditions and drive delays from Denver",
        ],
      },
    ],
  };
}

export function poppyDocument() {
  return {
    protocol_version: "0.1",
    organization: {
      name: "Tunnel Trash",
      domain: "tunnel-trash.com",
    },
    web: {},
  };
}

export function agentGuideMarkdown(): string {
  return [
    "---",
    "title: Tunnel Trash & Closed Snow Agent Guide",
    `canonical: ${SITE_ORIGIN}${AGENT_PATHS.agentGuide}`,
    "---",
    "",
    "# Tunnel Trash & Closed Snow Agent Guide",
    "",
    "Tunnel Trash hosts **Closed Snow** (`/closed-snow`), a free Colorado snow-stake, resort snow report, 7-day forecast, and I-70 drive-time dashboard, alongside the **Eisenhower Tee** at `/`.",
    "",
    "## Machine-readable entry points",
    "",
    `- Markdown pages: request \`${SITE_ORIGIN}/closed-snow\` or \`${SITE_ORIGIN}/\` with \`Accept: text/markdown\``,
    `- Search for agents: \`${SITE_ORIGIN}${AGENT_PATHS.search}?q={query}\``,
    `- Closed Snow MCP endpoint: \`${CLOSED_SNOW_API_ORIGIN}/mcp\``,
    `- Closed Snow one-shot ski-day JSON: \`${CLOSED_SNOW_API_ORIGIN}/v1/ski-day.json\``,
    `- API catalog: \`${SITE_ORIGIN}${AGENT_PATHS.apiCatalog}\``,
    `- OpenAPI spec: \`${SITE_ORIGIN}${AGENT_PATHS.openApi}\``,
    `- MCP Server Card: \`${SITE_ORIGIN}${AGENT_PATHS.mcpServerCard}\``,
    `- Agent Skills index: \`${SITE_ORIGIN}${AGENT_PATHS.skillsIndex}\``,
    `- AI Catalog (ARD): \`${SITE_ORIGIN}${AGENT_PATHS.aiCatalog}\``,
    "",
    "## Browser tools (WebMCP)",
    "",
    "Pages register read-only WebMCP tools (`get_ski_day`, `get_ski_conditions`, `get_roads`, `get_stake_cameras`, `get_resorts`, and `search_site`) via `document.modelContext`.",
    "",
  ].join("\n");
}

export function llmsTxt(): string {
  return [
    "# Tunnel Trash",
    "",
    "> Home of Closed Snow (free Colorado snow-stake cameras, snow reports, 7-day forecasts, and I-70 drive times) and the Eisenhower Tee.",
    "",
    "## Closed Snow (live ski data)",
    "",
    `- [Closed Snow dashboard](${SITE_ORIGIN}/closed-snow): live stakes, snow reports, 7-day snow outlook, and Denver drive times`,
    `- [Closed Snow MCP server](${CLOSED_SNOW_API_ORIGIN}/mcp): Streamable HTTP tools for agents`,
    `- [One-shot ski day JSON](${CLOSED_SNOW_API_ORIGIN}/v1/ski-day.json): snow reports, 7-day forecast outlook, per-resort forecasts, cameras, and roads`,
    `- [Agent search](${SITE_ORIGIN}${AGENT_PATHS.search}?q=vail): Markdown search across live ski conditions, forecasts, roads, and site info`,
    "",
    "## Discovery",
    "",
    `- [Agent guide](${SITE_ORIGIN}${AGENT_PATHS.agentGuide})`,
    `- [API catalog](${SITE_ORIGIN}${AGENT_PATHS.apiCatalog})`,
    `- [OpenAPI spec](${SITE_ORIGIN}${AGENT_PATHS.openApi})`,
    `- [MCP Server Card](${SITE_ORIGIN}${AGENT_PATHS.mcpServerCard})`,
    `- [Agent skills](${SITE_ORIGIN}${AGENT_PATHS.skillsIndex})`,
    "",
  ].join("\n");
}

function searchFrontMatter(title: string, pathname: string): string {
  return [
    "---",
    `title: ${title}`,
    `canonical: ${SITE_ORIGIN}${pathname}`,
    `content-signal: ${CONTENT_SIGNAL}`,
    "agent:",
    '  instructions: "Use this search API to find live Colorado ski conditions, 7-day snow forecasts, drive times, road alerts, and Tunnel Trash details with keywords or natural-language queries. Results are returned in Markdown."',
    `  endpoint: "${SITE_ORIGIN}${AGENT_PATHS.search}?q={query}"`,
    '  method: "GET"',
    '  documentation: "https://developers.cloudflare.com/ai-search/how-to/search-for-agents/"',
    "---",
  ].join("\n");
}

type SkiDaySummary = {
  date?: string;
  forecastOutlook?: {
    summary?: string;
    events?: Array<{
      window: string;
      snowfall: string;
      trendNote?: string;
      regions?: Array<{ label: string; snowfall: string }>;
    }>;
  } | null;
  corridorAlerts?: Array<{ route: string; title: string; summary?: string | null }>;
  resorts?: Array<{
    resortId: string;
    name: string;
    pass: string;
    operatingStatus?: string | null;
    freshSnow?: number | null;
    snow24?: number | null;
    base?: number | null;
    forecast?: { next7DaysTotal: number } | null;
    drive?: { travelMinutes: number } | null;
  }>;
};

async function fetchLiveSkiDay(): Promise<SkiDaySummary | null> {
  try {
    const res = await fetch(`${CLOSED_SNOW_API_ORIGIN}/v1/ski-day.json?includeBrief=false`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SkiDaySummary;
  } catch {
    return null;
  }
}

export async function renderPageMarkdown(pathname: string): Promise<string> {
  if (pathname === "/closed-snow") {
    const skiDay = await fetchLiveSkiDay();
    const lines = [
      searchFrontMatter("Closed Snow · Tunnel Trash", "/closed-snow"),
      "",
      "# Closed Snow",
      "",
      "Live Colorado snow-stake cameras, resort snow reports, 5-model 7-day snow forecasts, Denver drive times, and CDOT I-70/US-40 road alerts.",
      "",
      `- Web page: ${SITE_ORIGIN}/closed-snow`,
      `- MCP server: \`${CLOSED_SNOW_API_ORIGIN}/mcp\``,
      `- One-shot JSON API: \`${CLOSED_SNOW_API_ORIGIN}/v1/ski-day.json\``,
      "",
    ];
    if (skiDay?.forecastOutlook?.events?.length) {
      lines.push("## 7-day snow outlook", "");
      for (const event of skiDay.forecastOutlook.events) {
        const regions = event.regions?.length
          ? event.regions.map((r) => `${r.label} ${r.snowfall}`).join(" · ")
          : event.snowfall;
        lines.push(`- **${event.window}:** ${regions}${event.trendNote ? ` (${event.trendNote})` : ""}`);
      }
      lines.push("");
    }
    if (skiDay?.resorts?.length) {
      lines.push(`## Tracked resorts${skiDay.date ? ` (${skiDay.date})` : ""}`, "");
      for (const resort of skiDay.resorts) {
        const status = resort.operatingStatus ?? "Unknown";
        const snow =
          typeof resort.freshSnow === "number"
            ? `overnight ${resort.freshSnow}″`
            : typeof resort.snow24 === "number"
              ? `24h ${resort.snow24}″`
              : "snow —";
        const base = typeof resort.base === "number" ? `, base ${resort.base}″` : "";
        const next7 = resort.forecast ? `, next 7d ${resort.forecast.next7DaysTotal}″` : "";
        const drive = resort.drive ? `, ${resort.drive.travelMinutes}m from Denver` : "";
        lines.push(`- **${resort.name}** (${resort.pass}, ${status}): ${snow}${base}${next7}${drive}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  const price = process.env.NEXT_PUBLIC_EISENHOWER_PRICE ?? "32";
  const shipping = process.env.NEXT_PUBLIC_SHIPPING_PRICE ?? "6";
  return [
    searchFrontMatter("Tunnel Trash · Eisenhower Tee & Closed Snow", "/"),
    "",
    "# Tunnel Trash",
    "",
    "Colorado Front Range ski culture: home of **Closed Snow** (free live snow-stake cameras, snow reports, 7-day forecasts, and I-70 drive times) and the **Eisenhower Tee**.",
    "",
    "## Closed Snow (live ski dashboard)",
    "",
    `- Dashboard: ${SITE_ORIGIN}/closed-snow`,
    `- MCP server: \`${CLOSED_SNOW_API_ORIGIN}/mcp\``,
    `- JSON API: \`${CLOSED_SNOW_API_ORIGIN}/v1/ski-day.json\``,
    "",
    "## Eisenhower Tee",
    "",
    `- Price: $${price} USD (+ $${shipping} shipping)`,
    "- Material: Comfort Colors 100% Cotton Pocket T-shirt, screen printed",
    "- Sizes: S, M, L, XL, XXL",
    `- Order page: ${SITE_ORIGIN}/`,
    "",
  ].join("\n");
}

export async function renderSearchMarkdown(rawQuery: string): Promise<string> {
  const query = rawQuery.trim();
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const skiDay = await fetchLiveSkiDay();

  const docs: Array<{ title: string; url: string; text: string; keywords: string }> = [];
  if (skiDay?.forecastOutlook?.events?.length) {
    const summary = skiDay.forecastOutlook.events
      .map((event) => {
        const regions = event.regions?.length
          ? event.regions.map((r) => `${r.label} ${r.snowfall}`).join(", ")
          : event.snowfall;
        return `${event.window}: ${regions}`;
      })
      .join("; ");
    docs.push({
      title: "7-day Colorado snow outlook",
      url: `${SITE_ORIGIN}/closed-snow`,
      text: `${skiDay.forecastOutlook.summary ?? ""} ${summary}`.trim(),
      keywords: "forecast outlook storm snow weekend powder 7-day closed snow",
    });
  }
  for (const resort of skiDay?.resorts ?? []) {
    const snow =
      typeof resort.freshSnow === "number"
        ? `overnight ${resort.freshSnow}″`
        : typeof resort.snow24 === "number"
          ? `24h ${resort.snow24}″`
          : "no reported snow";
    const next7 = resort.forecast ? `, next 7d ${resort.forecast.next7DaysTotal}″` : "";
    const drive = resort.drive ? `, ${resort.drive.travelMinutes}m from Denver` : "";
    docs.push({
      title: `${resort.name} (${resort.pass})`,
      url: `${CLOSED_SNOW_API_ORIGIN}/v1/ski-day.json?resortId=${resort.resortId}`,
      text: `Status: ${resort.operatingStatus ?? "Unknown"}. ${snow}${next7}${drive}.`,
      keywords: `${resort.resortId} ${resort.name} ${resort.pass} ski snow stake camera forecast drive road`,
    });
  }
  for (const alert of skiDay?.corridorAlerts ?? []) {
    docs.push({
      title: `${alert.route}: ${alert.title}`,
      url: `${CLOSED_SNOW_API_ORIGIN}/v1/roads.json`,
      text: alert.summary ?? `Active ${alert.route} road alert.`,
      keywords: `i-70 us-40 cdot road traffic alert traction closure ${alert.route}`,
    });
  }
  docs.push(
    {
      title: "Closed Snow · Colorado snow stakes and forecasts",
      url: `${SITE_ORIGIN}/closed-snow`,
      text: `Free live snow-stake cameras, resort snow reports, 7-day forecasts, and I-70 drive times. MCP endpoint at ${CLOSED_SNOW_API_ORIGIN}/mcp.`,
      keywords: "closed snow stakes cameras ski forecast api mcp",
    },
    {
      title: "Eisenhower Tee · Tunnel Trash",
      url: `${SITE_ORIGIN}/`,
      text: "Comfort Colors 100% cotton pocket tee celebrating Colorado I-70 skiers.",
      keywords: "eisenhower tee shirt merch apparel tunnel trash",
    },
  );

  const ranked = docs
    .map((doc) => {
      const hay = `${doc.title} ${doc.text} ${doc.keywords}`.toLowerCase();
      const score = tokens.reduce((acc, token) => acc + (hay.includes(token) ? 1 : 0), 0);
      return { ...doc, score };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const chosen = ranked.length > 0 ? ranked : docs.slice(0, 5);
  return [
    `# Search results for: "${query}"`,
    "",
    ...chosen.flatMap((item) => [
      `## ${item.title}`,
      "",
      item.text,
      "",
      `Source: ${item.url}`,
      "",
    ]),
  ].join("\n");
}
