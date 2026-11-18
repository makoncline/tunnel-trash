import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createServer } from "node:http";
import { assetUrl, hasCurrentConditions, loadConditions, loadFeed } from "../src/lib/closed-snow.ts";

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

const recordedBuild = "2026-11-16T20:00:00.000Z";
const recordedNow = () => Date.parse(recordedBuild);

// The conditions golden is a real Nov 16 export from the producer's conditions view.
test("real conditions golden keeps report dates, operating status and saved morning evidence", async () => {
  const body = await readFile(new URL("fixtures/closed-snow/conditions.json", import.meta.url));
  const golden = { ...JSON.parse(body), builtAt: recordedBuild };
  const server = createServer((req, res) => {
    if (req.url !== "/v1/conditions.json") { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(golden));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const conditions = await loadConditions((url, options) => fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, options), recordedNow);
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
  golden.builtAt = recordedBuild;
  const copper = golden.entries.find(entry => entry.resortId === "copper");
  copper.operatingStatus = { value: "unknown", source: null, reportedAt: null, field: null };

  const conditions = await loadConditions(() => Promise.resolve(Response.json(golden)), recordedNow);
  assert.equal(conditions.issue, null);
  assert.equal(conditions.entries.length, golden.entries.length);
  const entry = conditions.entries.find(resort => resort.resortId === copper.resortId);
  assert.deepEqual(entry.operatingStatus, copper.operatingStatus);
  assert.deepEqual(entry.season, copper.season);
});

test("conditions requires a usable current build and expires a retained publication", async () => {
  const golden = JSON.parse(await readFile(new URL("fixtures/closed-snow/conditions.json", import.meta.url)));
  const read = (builtAt, date = golden.date, now = recordedNow) =>
    loadConditions(() => Promise.resolve(Response.json({
      ...golden, date, builtAt, generatedAt: recordedBuild,
    })), now);

  const exact = await read(new Date(recordedNow() - 15 * 60_000).toISOString());
  assert.equal(exact.entries.length, golden.entries.length);
  assert.equal(hasCurrentConditions(exact, recordedNow() + 1), false);
  const future = await read(new Date(recordedNow() + 5 * 60_000).toISOString());
  assert.equal(future.entries.length, golden.entries.length);

  for (const invalid of [
    await read(undefined),
    await read("invalid"),
    await read(new Date(recordedNow() - 15 * 60_000 - 1).toISOString()),
    await read(new Date(recordedNow() + 5 * 60_000 + 1).toISOString()),
    await read(recordedBuild, "2026-11-15"),
  ]) {
    assert.equal(invalid.entries.length, 0);
    assert.equal(invalid.issue, "Resort reports unavailable");
  }

  const justBeforeMidnight = "2026-11-17T06:59:59.999Z";
  const late = await read(justBeforeMidnight, golden.date, () => Date.parse(justBeforeMidnight));
  assert.equal(late.entries.length, golden.entries.length);
  assert.equal(hasCurrentConditions(late, Date.parse(justBeforeMidnight) + 1), false);
});

test("conditions preserves valid resorts in a partial publication", async () => {
  const golden = JSON.parse(await readFile(new URL("fixtures/closed-snow/conditions.json", import.meta.url)));
  const [rejected, ...valid] = golden.entries;
  const conditions = await loadConditions(() => Promise.resolve(Response.json({
    ...golden,
    builtAt: recordedBuild,
    entries: [{ ...rejected, operatingStatus: null }, ...valid],
  })), recordedNow);
  assert.equal(conditions.issue, "Some resort data could not be read.");
  assert.deepEqual(conditions.entries.map(resort => resort.resortId), valid.map(resort => resort.resortId));
  assert.equal(hasCurrentConditions(conditions, recordedNow()), true);
});
