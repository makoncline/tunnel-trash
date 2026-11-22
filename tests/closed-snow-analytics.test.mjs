import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  createAnalyticsTracker,
  createBrowserAnalyticsTracker,
} from "../src/lib/closed-snow-analytics.ts";
import {
  CLOSED_SNOW_ORIGIN,
  denverDateString,
} from "../src/lib/closed-snow.ts";

const visitorKey = "closed-snow:visitor:v1";
const firstSeenDate = denverDateString(Date.parse("2026-11-22T03:00:00Z"));

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
  };
}

function track(overrides = {}) {
  const events = [];
  const tracker = createAnalyticsTracker({
    storage: memoryStorage,
    firstSeenDate,
    randomUUID,
    now: () => 0,
    viewportWidth: 768,
    hostname: "www.tunnel-trash.com",
    referrer: "",
    send: (event) => {
      events.push(event);
    },
    ...overrides,
  });
  tracker.pageView();
  return { tracker, events };
}

function browser(t, { storage = memoryStorage(), navigator = {}, fetch } = {}) {
  let clock = 0;
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
    referrer: "https://WWW.Snow.Example/article?query=private#fragment",
  });
  const window = Object.assign(new EventTarget(), {
    document,
    navigator,
    fetch,
    localStorage: storage,
    performance: { now: () => clock },
    crypto: { randomUUID },
    location: { hostname: "www.tunnel-trash.com" },
    innerWidth: 767,
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: window,
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  });
  return {
    window,
    document,
    advance: (ms) => {
      clock += ms;
    },
    visibility: (state) => {
      document.visibilityState = state;
      document.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

test("visitor stays the same across visits and sessions get new IDs", () => {
  const storage = memoryStorage();
  const { tracker, events } = track({ storage: () => storage });
  tracker.pageView();
  assert.equal(events.length, 1);
  const [first] = events;
  assert.match(first.visitorId, /^[\da-f-]{36}$/);
  assert.match(first.sessionId, /^[\da-f-]{36}$/);
  assert.equal(first.returning, false);
  assert.equal(first.viewport, "desktop");
  assert.deepEqual(JSON.parse(storage.getItem(visitorKey)), {
    visitorId: first.visitorId,
    firstSeenDate: "2026-11-21",
  });

  const [reload] = track({ storage: () => storage }).events;
  const [tomorrow] = track({
    storage: () => storage,
    firstSeenDate: "2026-11-22",
  }).events;
  assert.equal(reload.returning, true);
  assert.equal(tomorrow.returning, true);
  assert.equal(reload.visitorId, first.visitorId);
  assert.equal(tomorrow.visitorId, first.visitorId);
  assert.equal(
    new Set([first.sessionId, reload.sessionId, tomorrow.sessionId]).size,
    3,
  );
  assert.equal(
    JSON.parse(storage.getItem(visitorKey)).firstSeenDate,
    "2026-11-21",
  );
});

test("blocked storage gives each visit an ephemeral ID and malformed data is replaced", () => {
  const blocked = () => {
    throw new Error("Storage unavailable");
  };
  const [first] = track({ storage: blocked }).events;
  const [second] = track({
    storage: () => ({ getItem: () => null, setItem: blocked }),
  }).events;
  assert.equal(first.returning, false);
  assert.equal(second.returning, false);
  assert.notEqual(first.visitorId, second.visitorId);

  const storage = memoryStorage();
  storage.setItem(visitorKey, "{");
  const [recovered] = track({ storage: () => storage }).events;
  assert.equal(recovered.returning, false);
  assert.equal(
    JSON.parse(storage.getItem(visitorKey)).visitorId,
    recovered.visitorId,
  );
});

test("referrer is a normalized, bounded external hostname", () => {
  for (const referrer of [
    "",
    "invalid",
    "file:///private/path",
    "https://WWW.TUNNEL-TRASH.COM/elsewhere",
    "https://tunnel-trash.com:8443/elsewhere",
  ]) {
    const [event] = track({ referrer }).events;
    assert.equal("referrerHost" in event, false, referrer);
  }
  const [external] = track({
    referrer: "https://WWW.Snow.Example:4000/a?q=secret",
  }).events;
  assert.equal(external.referrerHost, "snow.example");
  const longHost = `${"a".repeat(60)}.${"b".repeat(60)}.example`;
  const [long] = track({ referrer: `https://${longHost}/` }).events;
  assert.equal(long.referrerHost, longHost.slice(0, 100));
});

test("browser lifecycle counts visible time and flushes each interval once", (t) => {
  const { window, document, advance, visibility } = browser(t, {
    navigator: { webdriver: true },
  });
  document.visibilityState = "hidden";
  assert.equal(
    createBrowserAnalyticsTracker(CLOSED_SNOW_ORIGIN, firstSeenDate),
    null,
  );
  const events = [];
  const tracker = createBrowserAnalyticsTracker(
    CLOSED_SNOW_ORIGIN,
    firstSeenDate,
    (event) => {
      events.push(event);
    },
  );
  const stop = tracker.start();
  advance(15_000);
  visibility("visible");
  advance(2900);
  visibility("hidden");
  window.dispatchEvent(new Event("pagehide"));
  advance(20_000);
  visibility("visible");
  advance(3000);
  window.dispatchEvent(new Event("pagehide"));
  advance(50_000);
  window.dispatchEvent(new Event("pageshow"));
  advance(500);
  tracker.record("refresh_click");
  visibility("hidden");
  stop();
  const stopAgain = tracker.start();
  stopAgain();
  visibility("visible");
  advance(3000);
  window.dispatchEvent(new Event("pagehide"));

  const [first, ...rest] = events;
  assert.equal(first.type, "page_view");
  assert.deepEqual(rest, [
    { ...first, type: "session_end", activeSeconds: 2, actions: [] },
    { ...first, type: "session_end", activeSeconds: 3, actions: [] },
    {
      ...first,
      type: "session_end",
      activeSeconds: 0,
      actions: [{ kind: "refresh_click" }],
    },
  ]);
});

test("tracker sends only supported actions and limits each flush to 50", () => {
  let clock = 0;
  const { tracker, events } = track({ now: () => clock });
  const actions = [
    { kind: "camera_open", target: "winter-park" },
    { kind: "clip_play", target: "winter-park:last-24h" },
    { kind: "day_open", target: "winter-park" },
    { kind: "directions_click", target: "winter-park:cotrip" },
    { kind: "filter_change", target: "pass:ikon" },
    { kind: "sort_change", target: "drive" },
    { kind: "mode_switch", target: "now" },
    { kind: "refresh_click" },
  ];
  tracker.startVisible();
  for (const { kind, target } of actions) tracker.record(kind, target);
  tracker.record("directions_click", "https://example.com");
  tracker.record("camera_open", "x".repeat(49));
  tracker.record("unsupported", "ignored");
  tracker.record("camera_open", "x".repeat(48));
  for (let index = 0; index < 50; index++)
    tracker.record("camera_open", `resort-${index}`);
  clock = 90_000_000;
  tracker.flush();
  assert.equal(events[1].activeSeconds, 86_400);
  assert.deepEqual(events[1].actions, [
    ...actions,
    { kind: "directions_click" },
    { kind: "camera_open" },
    { kind: "camera_open", target: "x".repeat(48) },
    ...Array.from({ length: 39 }, (_, index) => ({
      kind: "camera_open",
      target: `resort-${index}`,
    })),
  ]);

  tracker.record("filter_change", "reset");
  tracker.flush();
  assert.equal(events[2].activeSeconds, 0);
  assert.deepEqual(events[2].actions, [
    { kind: "filter_change", target: "reset" },
  ]);
  tracker.flush();
  assert.equal(events.length, 3);
});

test("server rendering skips browser analytics", () => {
  assert.equal(
    createBrowserAnalyticsTracker(CLOSED_SNOW_ORIGIN, firstSeenDate),
    null,
  );
});

test("string beacon and keepalive fallback use the same event contract", (t) => {
  const beacons = [];
  const requests = [];
  const navigator = {
    sendBeacon(url, body) {
      beacons.push([url, body]);
      if (beacons.length === 3) throw new Error("Beacon failed");
      return beacons.length === 1;
    },
  };
  const { window, advance, visibility } = browser(t, {
    navigator,
    fetch(url, options) {
      requests.push([url, options]);
      return Promise.reject(new Error("Offline"));
    },
  });
  const tracker = createBrowserAnalyticsTracker(
    CLOSED_SNOW_ORIGIN,
    firstSeenDate,
  );
  const stop = tracker.start();
  assert.equal(requests.length, 0);
  const url = `${CLOSED_SNOW_ORIGIN}/v1/events`;
  const [firstUrl, firstBody] = beacons[0];
  assert.equal(firstUrl, url);
  assert.equal(typeof firstBody, "string");
  assert.equal(
    new Request(url, { method: "POST", body: firstBody }).headers.get(
      "content-type",
    ),
    "text/plain;charset=UTF-8",
  );
  const { visitorId, sessionId } = JSON.parse(firstBody);
  assert.equal(
    visitorId,
    JSON.parse(window.localStorage.getItem(visitorKey)).visitorId,
  );
  assert.match(sessionId, /^[\da-f-]{36}$/);
  const pageView = {
    type: "page_view",
    visitorId,
    sessionId,
    path: "/closed-snow",
    returning: false,
    viewport: "mobile",
    referrerHost: "snow.example",
  };
  assert.deepEqual(JSON.parse(firstBody), pageView);

  for (const [index, target] of [
    "winter-park:apple",
    "winter-park:google",
    "winter-park:cotrip",
  ].entries()) {
    tracker.record("directions_click", target);
    advance(1000);
    visibility("hidden");
    const [requestUrl, options] = requests[index];
    assert.equal(requestUrl, url);
    const body = options.body;
    assert.deepEqual(options, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
      keepalive: true,
    });
    assert.deepEqual(JSON.parse(body), {
      ...pageView,
      type: "session_end",
      activeSeconds: 1,
      actions: [{ kind: "directions_click", target }],
    });
    if (navigator.sendBeacon) assert.deepEqual(beacons[index + 1], [url, body]);
    if (index === 1) delete navigator.sendBeacon;
    visibility("visible");
  }
  stop();
  assert.equal(beacons.length, 3);
  assert.equal(requests.length, 3);
});
