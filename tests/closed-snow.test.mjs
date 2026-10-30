import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { assetUrl, loadFeed } from "../src/lib/closed-snow.ts";

const fixture = async (kind) =>
  JSON.parse(
    await readFile(
      new URL(`./fixtures/closed-snow/${kind}.json`, import.meta.url),
      "utf8",
    ),
  );

test("public feed records retain producer order, clips and trace IDs", async () => {
  const morning = await fixture("morning");
  const feed = await loadFeed("morning", async (url, options) => {
    assert.equal(
      url,
      "https://closed-snow-api.daylilycatalog.workers.dev/v1/morning.json",
    );
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(morning, {
      headers: {
        "X-Request-Id": "request-1",
        "X-Correlation-Id": "correlation-1",
      },
    });
  });
  assert.equal(feed.issue, null);
  assert.deepEqual(
    feed.entries.map((entry) => entry.cameraId),
    morning.entries.map((entry) => entry.cameraId),
  );
  assert.equal(feed.entries.flatMap((entry) => entry.clips).length, 4);
  assert.equal(feed.entries[0].clips[0].complete, false);
  assert.equal(feed.runId, morning.runId);
  assert.equal(feed.requestId, "request-1");
  assert.equal(feed.correlationId, "correlation-1");
  assert.equal(
    assetUrl(feed.entries[0].image.file),
    `https://closed-snow-api.daylilycatalog.workers.dev/assets/${morning.entries[0].image.file}`,
  );
});

test("bad records and missing guides do not block usable cameras or clips", async () => {
  const morning = await fixture("morning");
  morning.entries[0].overlay = null;
  morning.entries[0].calibrationSha = null;
  morning.entries[0].clips.push({
    kind: "until-opening",
    asset: { file: "../../bad.mp4" },
  });
  morning.entries[1].image.file = "https://other.example/image.jpg";
  const feed = await loadFeed("morning", async () => Response.json(morning));
  assert.equal(feed.entries.length, 3);
  assert.equal(feed.entries[0].cameraId, "beaver-creek");
  assert.equal(feed.entries[0].clips.length, 1);
  assert.ok(feed.issue);
  assert.equal(feed.omissions.length, morning.omissions.length);
});

test("a failed current feed does not block the morning feed", async () => {
  const morning = await fixture("morning");
  const [current, available] = await Promise.all([
    loadFeed(
      "current",
      async () =>
        new Response("Unavailable", {
          status: 503,
          headers: { "X-Request-Id": "failed-request" },
        }),
    ),
    loadFeed("morning", async () => Response.json(morning)),
  ]);
  assert.ok(current.issue);
  assert.equal(current.requestId, "failed-request");
  assert.equal(current.entries.length, 0);
  assert.equal(available.entries.length, 4);
  const invalid = await loadFeed("current", async () =>
    Response.json({ entries: [] }),
  );
  assert.ok(invalid.issue);
  const offline = await loadFeed("current", async () => {
    throw new Error("offline");
  });
  assert.ok(offline.issue);
});
