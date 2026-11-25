import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  SKILL_ARTIFACTS,
  agentSkillsIndex,
  aiCatalogDocument,
  apiCatalogDocument,
  formatResortLine,
  linkHeaderValue,
  mcpServerCard,
  openApiDocument,
  poppyDocument,
  prefersMarkdown,
  robotsTxt,
  sitemapXml,
} from "../src/lib/agent-ready.ts";

test("agent-ready manifests satisfy robots, sitemap, Link, API catalog, MCP card, skills, ARD, and Poppy specs", async () => {
  const robots = robotsTxt();
  assert.match(robots, /^User-agent: \*/m);
  assert.match(robots, /Content-Signal: ai-train=no, search=yes, ai-input=yes/);
  assert.match(robots, /Sitemap: https:\/\/www\.tunnel-trash\.com\/sitemap\.xml/);
  assert.match(robots, /Agentmap: https:\/\/www\.tunnel-trash\.com\/\.well-known\/ai-catalog\.json/);

  const sitemap = sitemapXml();
  assert.match(sitemap, /<loc>https:\/\/www\.tunnel-trash\.com\/closed-snow<\/loc>/);

  const link = linkHeaderValue("/closed-snow");
  assert.match(link, /rel="api-catalog"/);
  assert.match(link, /rel="service-desc"/);
  assert.match(link, /rel="service-doc"/);
  assert.match(link, /rel="alternate"; type="text\/markdown"/);

  const catalog = apiCatalogDocument();
  assert.equal(catalog.linkset[0].anchor, "https://closed-snow.makon.dev/v1/index.json");

  const openapi = openApiDocument();
  assert.deepEqual(openapi.servers, [{ url: "https://closed-snow.makon.dev" }]);
  assert.deepEqual(openapi.paths["/.well-known/search"].servers, [{ url: "https://www.tunnel-trash.com" }]);

  const card = mcpServerCard();
  assert.equal(card.serverInfo.name, "closed-snow");
  assert.equal(card.transport.endpoint, "https://closed-snow.makon.dev/mcp");

  const skills = await agentSkillsIndex();
  assert.equal(skills.$schema, "https://schemas.agentskills.io/discovery/0.2.0/schema.json");
  for (const entry of skills.skills) {
    const artifact = SKILL_ARTIFACTS.find((s) => s.name === entry.name);
    assert.ok(artifact);
    const expected = `sha256:${createHash("sha256").update(artifact.text).digest("hex")}`;
    assert.equal(entry.digest, expected);
  }

  const ard = aiCatalogDocument();
  assert.equal(ard.specVersion, "1.0");
  assert.ok(ard.entries.every((entry) => Boolean(entry.url) && !("data" in entry)));

  const poppy = poppyDocument();
  assert.equal(poppy.protocol_version, "0.1");
  assert.equal(poppy.organization.domain, "tunnel-trash.com");

  assert.equal(prefersMarkdown("text/markdown"), true);
  assert.equal(prefersMarkdown("text/html,application/xhtml+xml"), false);
  assert.equal(prefersMarkdown("text/html;q=0.9, text/markdown;q=1.0"), true);
  assert.equal(prefersMarkdown("text/html;q=1, text/markdown;q=0.1"), false);

  const vail = formatResortLine({
    resortId: "vail",
    name: "Vail",
    pass: "epic",
    operatingStatus: { value: "open" },
    freshSnow: { value: { min: 4, max: 5 }, label: "Overnight", status: "current", reportedAt: "2026-11-25T12:30:00Z" },
    snow24: { value: { min: 6, max: 6 }, status: "current", reportedAt: "2026-11-25T12:30:00Z" },
    base: { value: { min: 22, max: 22 }, status: "current" },
    forecast: { next7DaysTotal: 8.1 },
    drive: { travelMinutes: 112 },
  });
  assert.equal(vail.status, "open");
  assert.match(vail.summary, /overnight 4–5″ as of 2026-11-25T12:30:00Z, base 22″, next 7d 8\.1″, 112m from Denver/);

  const abasin = formatResortLine({
    resortId: "arapahoe-basin",
    name: "Arapahoe Basin",
    pass: "ikon",
    operatingStatus: { value: "open" },
    freshSnow: { value: null, label: "Overnight", status: "unavailable" },
    snow24: { value: { min: 3, max: 3 }, status: "current" },
    base: { value: { min: 18, max: 18 }, status: "current" },
  });
  assert.equal(abasin.status, "open");
  assert.match(abasin.summary, /^24h 3″, base 18″$/);
});
