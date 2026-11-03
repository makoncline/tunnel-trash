import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createServer } from "node:http";
import { assetUrl, loadFeed } from "../src/lib/closed-snow.ts";

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
