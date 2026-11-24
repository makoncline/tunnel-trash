import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createServer } from "node:http";
import { assetUrl, conditionsFreshness, denverDateString, freshSnowRank, isSameCapture, loadConditions, loadFeed, reportStake, stakeContradictsReport, stakeShowsUnreportedSnow } from "../src/lib/closed-snow.ts";
import { cleanSurfaceCondition, driveSeverity, driveTrendLevel, formatDriveMinutes, isMajorRoadAlert, shortAlertLocation } from "../src/lib/closed-snow-roads.ts";
import { loadSkiDayWeather, skiDayWindowAt } from "../src/lib/closed-snow-weather.ts";
import { briefSchema } from "../src/lib/closed-snow-brief.ts";

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

test("Fresh ranks positive reports, snowy morning stakes, then zero reports", () => {
  const stake = (band, observationId = "morning") => ({
    observationId: "morning",
    snowBand: { band, observationId, capturedAt: recordedBuild },
  });
  const resorts = [
    ["unknown", freshSnowRank(null)],
    ["zero", freshSnowRank({ min: 0, max: 0 }, stake("extreme"))],
    ["some", freshSnowRank(null, stake("some"))],
    ["none", freshSnowRank(null, stake("none"))],
    ["a-lot", freshSnowRank(null, stake("a-lot"))],
    ["half inch", freshSnowRank({ min: 0, max: 0.5 })],
    ["extreme", freshSnowRank(null, stake("extreme"))],
    ["two inches", freshSnowRank({ min: 1, max: 2 })],
  ];

  resorts.sort((a, b) => b[1] - a[1]);
  assert.deepEqual(resorts.map(([name]) => name), [
    "two inches", "half inch", "extreme", "a-lot", "some", "zero", "none", "unknown",
  ]);
  assert.equal(freshSnowRank(null, stake("extreme", "older")), freshSnowRank(null));
  assert.equal(freshSnowRank(null, stake("uncertain")), freshSnowRank(null));
  assert.equal(stakeContradictsReport({ min: 3, max: 3 }, stake("none")), true);
  assert.equal(freshSnowRank({ min: 3, max: 3 }, stake("none")), 0);
  const clearedBare = { ...stake("none"), details: { clearing: { status: "observed" } } };
  assert.equal(stakeContradictsReport({ min: 3, max: 3 }, clearedBare), false);
  assert.equal(freshSnowRank({ min: 3, max: 3 }, clearedBare), 4);
  assert.equal(stakeShowsUnreportedSnow({ min: 0, max: 0 }, stake("some")), true);
  assert.equal(stakeShowsUnreportedSnow({ min: 0, max: 0 }, stake("a-lot")), true);
  assert.equal(stakeShowsUnreportedSnow({ min: 0, max: 0 }, stake("none")), false);
  assert.equal(stakeShowsUnreportedSnow({ min: 0, max: 0 }, stake("uncertain")), false);
  assert.equal(stakeShowsUnreportedSnow({ min: 1, max: 1 }, stake("some")), false);
  assert.equal(stakeShowsUnreportedSnow(null, stake("some")), false);

  // After 4:00 PM MT rollover, morning.json flips to tomorrow (unreviewed) while report is still today's:
  // reportStake must resolve today's saved history stake so Stake bare does not vanish in the evening.
  const rolledMorningCamera = {
    observationId: "next-eve",
    morning: { date: "2026-11-24", basis: "so-far" },
    snowBand: null,
    details: { clearing: { status: "unreviewed" } },
  };
  const eveningResort = {
    report: { data: { reportedAt: "2026-11-23T12:45:00.000Z", overnight: { min: 3, max: 3 } } },
    history: [
      {
        date: "2026-11-23",
        stake: {
          capturedAt: "2026-11-23T15:55:14.000Z",
          basis: "at-opening",
          timeBasis: "source",
          snowBand: "none",
          clearingStatus: "no-snow",
          clearing: null,
        },
      },
    ],
  };
  const resolved = reportStake(eveningResort, rolledMorningCamera);
  assert.equal(stakeContradictsReport({ min: 3, max: 3 }, resolved), true);
  assert.equal(freshSnowRank({ min: 3, max: 3 }, resolved), 0);
});

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
      const historyAssets = day => [day.date, day.snow24, day.stake?.image.file ?? null, day.stake?.overlay?.file ?? null];
      assert.deepEqual(entry.history.map(historyAssets), source.history.map(historyAssets));
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

test("conditions keeps reports and snow history as the build ages", async () => {
  const golden = JSON.parse(await readFile(new URL("fixtures/closed-snow/conditions.json", import.meta.url)));
  const read = (builtAt, at) =>
    loadConditions(async () => Response.json({ ...golden, builtAt }), () => at);
  const fresh = await read(recordedBuild, recordedNow());
  assert.equal(conditionsFreshness(fresh, recordedNow()), "fresh");

  for (const [age, expected] of [
    [15 * 60_000 - 1, "fresh"],
    [15 * 60_000, "delayed"],
    [60 * 60_000, "delayed"],
    [60 * 60_000 + 1, "stale"],
  ]) {
    const at = recordedNow() + age;
    assert.equal(conditionsFreshness(fresh, at), expected);
    const conditions = await read(recordedBuild, at);
    assert.equal(conditionsFreshness(conditions, at), expected);
    assert.deepEqual(conditions.entries, fresh.entries);
    assert.equal(conditions.issue, null);
  }

  const buildBeforeMidnight = "2026-11-17T06:59:59.999Z";
  const midnight = Date.parse(buildBeforeMidnight) + 1;
  const beforeMidnight = await read(buildBeforeMidnight, midnight - 1);
  assert.equal(conditionsFreshness(beforeMidnight, midnight - 1), "fresh");
  assert.equal(conditionsFreshness(beforeMidnight, midnight), "stale");
  const previousDay = await read(buildBeforeMidnight, midnight);
  assert.equal(conditionsFreshness(previousDay, midnight), "stale");
  assert.deepEqual(previousDay.entries, fresh.entries);
  assert.equal(previousDay.issue, null);
});

test("conditions is unavailable when no usable publication loads", async () => {
  const golden = JSON.parse(await readFile(new URL("fixtures/closed-snow/conditions.json", import.meta.url)));
  const feed = { ...golden, builtAt: recordedBuild };
  const read = (payload) => loadConditions(async () => Response.json(payload), recordedNow);
  const future = await read({ ...feed, builtAt: new Date(recordedNow() + 5 * 60_000).toISOString() });
  assert.equal(conditionsFreshness(future, recordedNow()), "fresh");
  assert.equal(future.entries.length, golden.entries.length);

  for (const unavailable of [
    await read({ ...feed, builtAt: undefined, generatedAt: recordedBuild }),
    await read({ ...feed, builtAt: "invalid" }),
    await read({ ...feed, builtAt: new Date(recordedNow() + 5 * 60_000 + 1).toISOString() }),
    await read({ ...feed, entries: [] }),
    await loadConditions(async () => new Response(null, { status: 503 }), recordedNow),
    await loadConditions(async () => { throw new TypeError("fetch failed"); }, recordedNow),
  ]) {
    assert.equal(conditionsFreshness(unavailable, recordedNow()), "unavailable");
    assert.equal(unavailable.entries.length, 0);
    assert.equal(unavailable.issue, "Snow reports are temporarily offline.");
  }
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
  assert.equal(conditionsFreshness(conditions, recordedNow()), "fresh");
});

test("capture comparison and Denver date helper distinguish morning and live captures", () => {
  const base = { observationId: "obs-1", image: { file: `${"a".repeat(64)}.jpg` }, sourceSha: "sha-1" };
  assert.equal(isSameCapture(base, { ...base }), true);
  assert.equal(isSameCapture(base, { observationId: "obs-2", image: { file: `${"b".repeat(64)}.jpg` }, sourceSha: "sha-1" }), true);
  assert.equal(isSameCapture(base, { observationId: "obs-2", image: { file: `${"b".repeat(64)}.jpg` }, sourceSha: "sha-2" }), false);
  assert.equal(isSameCapture(base, null), false);
  assert.equal(denverDateString(Date.parse("2026-11-21T17:25:00.000Z")), "2026-11-21");
  assert.equal(denverDateString(Date.parse("2026-11-22T06:59:59.000Z")), "2026-11-21");
  assert.equal(denverDateString(Date.parse("2026-11-22T07:00:00.000Z")), "2026-11-22");
});

test("public NWS ski-day weather selects the next 9a-4p Mountain window and parses hourly periods", async () => {
  const beforeNine = Date.parse("2026-11-21T15:30:00.000Z"); // 8:30 AM MST
  const afterNine = Date.parse("2026-11-21T16:30:00.000Z"); // 9:30 AM MST
  assert.equal(skiDayWindowAt(beforeNine).date, "2026-11-21");
  assert.equal(skiDayWindowAt(afterNine).date, "2026-11-22");
  const window = skiDayWindowAt(afterNine);
  const startMs = Date.parse(window.startsAt);
  assert.equal(Date.parse(window.endsAt) - startMs, 7 * 3_600_000);

  const periods = Array.from({ length: 7 }, (_, i) => ({
    startTime: new Date(startMs + i * 3_600_000).toISOString(),
    endTime: new Date(startMs + (i + 1) * 3_600_000).toISOString(),
    temperature: 15 + i,
    temperatureUnit: "F",
    shortForecast: i < 2 ? "Chance Snow Showers" : "Mostly Sunny",
    windSpeed: `${8 + i} mph`,
  }));
  const weather = await loadSkiDayWeather(async (url) => {
    if (!String(url).includes("GJT/174,119")) return new Response("{}", { status: 503 });
    return Response.json({
      properties: {
        updateTime: new Date(afterNine - 10 * 60_000).toISOString(),
        periods,
      },
    });
  }, afterNine);
  assert.ok(weather);
  assert.equal(weather.resorts.length, 1);
  assert.deepEqual(weather.resorts[0], {
    resortId: "vail",
    lowF: 15,
    highF: 21,
    weather: "Snow? → sun",
    windMph: { low: 8, high: 14 },
  });
});

test("drive trend tiers, CDOT surface cleanup, and alert location helpers", () => {
  assert.equal(driveTrendLevel(null), null);
  assert.equal(driveTrendLevel(-900), "falling-fast");
  assert.equal(driveTrendLevel(-420), "falling");
  assert.equal(driveTrendLevel(120), "steady");
  assert.equal(driveTrendLevel(420), "rising");
  assert.equal(driveTrendLevel(960), "rising-fast");

  assert.equal(formatDriveMinutes(3240), "54m");
  assert.equal(formatDriveMinutes(6780), "1h 53m");

  assert.equal(cleanSurfaceCondition("8 - icy"), "Icy");
  assert.equal(
    cleanSurfaceCondition("6-8-10 snow, icy, snow packed"),
    "Snow, icy, snow packed",
  );
  assert.equal(cleanSurfaceCondition("4s - wet in areas"), "Wet in areas");

  assert.equal(
    shortAlertLocation(
      "Between Exit 203: East Frisco (Silverthorne) and US 40 (Georgetown) from Mile Point 205 to Mile Point 228. Passenger vehicles must carry chains.",
    ),
    "Between Exit 203: East Frisco (Silverthorne) and US 40 (Georgetown)",
  );

  const baseAlert = {
    id: "1",
    route: "I-70",
    summary: null,
    severity: "minor",
    updatedAt: null,
    resorts: ["vail"],
    url: "https://maps.cotrip.org/",
  };
  assert.equal(
    isMajorRoadAlert({ ...baseAlert, kind: "traction-law", title: "Traction Law Code 15" }),
    false,
  );
  assert.equal(
    isMajorRoadAlert({ ...baseAlert, kind: "chain-law", title: "Chain Law Code 18" }),
    false,
  );
  assert.equal(
    isMajorRoadAlert({ ...baseAlert, kind: "chain-law", title: "Chain Law Code 16" }),
    true,
  );
  assert.equal(
    isMajorRoadAlert({ ...baseAlert, kind: "closure", title: "Road Closed" }),
    true,
  );
  assert.equal(
    isMajorRoadAlert({ ...baseAlert, kind: "incident", title: "Crash" }),
    true,
  );
  assert.equal(
    driveSeverity({
      resortId: "vail",
      name: "Vail",
      drive: {
        capturedAt: recordedBuild,
        travelSeconds: 6780,
        baselineSeconds: 6660,
        delaySeconds: 120,
        trend30mSeconds: 0,
        trend: "steady",
        samples: [],
      },
      road: {
        surface: "icy",
        worstCondition: "8 - icy",
        worstSegment: "Vail Pass",
        tractionLaw: true,
        chainLaw: true,
        closed: false,
        alerts: [{ ...baseAlert, kind: "traction-law", title: "Traction Law Code 15" }],
      },
    }),
    "normal",
  );
});

test("brief schema accepts briefs with or without model outlook and rejects invalid trends", () => {
  const base = {
    schemaVersion: 1,
    date: "2026-11-22",
    generatedAt: "2026-11-22T13:10:00.000Z",
    paragraphs: ["A-Basin is worth a closer look."],
    picks: [],
  };
  assert.equal(briefSchema.safeParse(base).success, true);
  const withOutlook = {
    ...base,
    modelOutlook: {
      initializedAt: "2026-11-22T00:00:00.000Z",
      comparedTo: "2026-11-21T00:00:00.000Z",
      models: ["GFS", "ECMWF IFS", "WeatherNext 3"],
      summary: "Next snow window: Mon–Tue (Nov 23–24) (1–2″).",
      events: [{
        window: "Mon–Tue (Nov 23–24)",
        snowfall: "1–2″",
        agreement: "All 3 models agree",
        trend: "down",
        trendNote: "Trending down vs. yesterday (GFS & ECMWF drier)",
      }],
      attribution: "Blend: GFS, ECMWF IFS & Google WeatherNext 3 (CC BY 4.0).",
    },
  };
  assert.equal(briefSchema.safeParse(withOutlook).success, true);
  assert.equal(briefSchema.safeParse({
    ...withOutlook,
    modelOutlook: {
      ...withOutlook.modelOutlook,
      events: [{ ...withOutlook.modelOutlook.events[0], trend: "sideways" }],
    },
  }).success, false);
});
