import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createServer } from "node:http";
import { assetUrl, loadConditions, loadFeed } from "../src/lib/closed-snow.ts";

// Golden manifests were exported from the real November 3 camera store.
// Serve unchanged evidence over HTTP; do not fabricate images or review results.
test("real camera golden feeds retain native views, clear references and approved guides", async () => {
  const files = new Map(await Promise.all(["current", "morning"].map(async kind => [kind, await readFile(new URL(`fixtures/closed-snow/${kind}.json`, import.meta.url))])));
  const server = createServer((req, res) => {
    const kind = req.url.split("/").at(-1).replace(".json", "");
    const body = files.get(kind);
    if (!body) { res.writeHead(404); res.end(); return; }
    const manifest = JSON.parse(body);
    res.writeHead(200, { "Content-Type": "application/json", "X-Request-Id": "golden-http", "X-Correlation-Id": manifest.runId }); res.end(body);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    for (const kind of ["morning", "current"]) {
      const golden = JSON.parse(files.get(kind));
      const feed = await loadFeed(kind, (url, options) => fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, options));
      assert.equal(feed.issue, null);
      assert.equal(feed.entries.length, 8);
      assert.deepEqual(feed.entries.map(e => e.cameraId), golden.entries.map(e => e.cameraId));
      assert.equal(feed.correlationId, golden.runId);
      for (const entry of feed.entries) {
        const source = golden.entries.find(e => e.cameraId === entry.cameraId);
        assert.equal(entry.image.file, source.image.file);
        assert.equal(entry.clearedReference.image.file, source.clearedReference.image.file);
        assert.equal(entry.clearedReference.capturedAt, source.clearedReference.capturedAt);
        assert.equal(entry.overlay.file, source.overlay.file);
        assert.deepEqual(entry.details, source.details);
        assert.deepEqual(entry.clips.map(c => c.timeline.file), source.clips.map(c => c.timeline.file));
        assert.ok(assetUrl(entry.image.file).endsWith(`/assets/${source.image.file}`));
      }
      assert.equal(feed.entries.find(e => e.cameraId === "vail").diagonalOverlay, null);
      assert.equal(feed.entries.find(e => e.cameraId === "keystone").details.seasonStatus, "open");
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

// The conditions golden is a real Nov 16 export from the producer's conditions view.
test("real conditions golden keeps report dates, operating status and saved morning evidence", async () => {
  const body = await readFile(new URL("fixtures/closed-snow/conditions.json", import.meta.url));
  const golden = JSON.parse(body);
  const server = createServer((req, res) => {
    if (req.url !== "/v1/conditions.json") { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(body);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const conditions = await loadConditions((url, options) => fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, options));
    assert.equal(conditions.issue, null);
    assert.equal(conditions.date, golden.date);
    assert.deepEqual(conditions.entries.map(e => e.resortId), golden.entries.map(e => e.resortId));
    for (const entry of conditions.entries) {
      const source = golden.entries.find(e => e.resortId === entry.resortId);
      assert.deepEqual(entry.operatingStatus, source.operatingStatus);
      assert.deepEqual(entry.periods.map(p => [p.snow24, p.reportedDays]), source.periods.map(p => [p.snow24, p.reportedDays]));
      assert.deepEqual(entry.history.map(d => [d.date, d.snow24, d.stake?.image.file ?? null]), source.history.map(d => [d.date, d.snow24, d.stake?.image.file ?? null]));
      assert.equal(entry.report.data?.base?.max, source.report.data?.base?.max);
    }
    assert.equal(conditions.entries.find(e => e.resortId === "copper").operatingStatus.value, "open");
    const missing = await loadConditions(() => Promise.resolve(new Response("{}", { status: 404 })));
    assert.equal(missing.entries.length, 0);
    assert.ok(missing.issue);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test("conditions accepts unknown operating status with no source or time", async () => {
  const golden = JSON.parse(await readFile(new URL("fixtures/closed-snow/conditions.json", import.meta.url)));
  const copper = golden.entries.find(entry => entry.resortId === "copper");
  copper.operatingStatus = { value: "unknown", source: null, reportedAt: null, field: null };

  const conditions = await loadConditions(() => Promise.resolve(Response.json(golden)));
  assert.equal(conditions.issue, null);
  assert.equal(conditions.entries.length, golden.entries.length);
  const entry = conditions.entries.find(resort => resort.resortId === copper.resortId);
  assert.deepEqual(entry.operatingStatus, copper.operatingStatus);
  assert.deepEqual(entry.season, copper.season);
});
