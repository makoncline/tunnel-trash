const visitorKey = "closed-snow:visitor:v1";
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
const targetPattern = /^[a-z0-9:_-]{1,48}$/i;

const actionKinds = [
  "camera_open",
  "clip_play",
  "day_open",
  "directions_click",
  "filter_change",
  "sort_change",
  "mode_switch",
  "refresh_click",
] as const;
type ActionKind = (typeof actionKinds)[number];
type Action = { kind: ActionKind; target?: string };
export type RecordAnalyticsAction = (kind: ActionKind, target?: string) => void;

type Visitor = { visitorId: string; firstSeenDate: string };
type Visit = {
  visitorId: string;
  sessionId: string;
  path: "/closed-snow";
  returning: boolean;
  viewport: "mobile" | "desktop";
  referrerHost?: string;
};
type AnalyticsEvent = Visit &
  (
    | { type: "page_view" }
    | { type: "session_end"; activeSeconds: number; actions: Action[] }
  );
type Send = (event: AnalyticsEvent) => void | Promise<void>;
type TrackerOptions = {
  storage: () => Pick<Storage, "getItem" | "setItem">;
  firstSeenDate: string;
  randomUUID: () => string;
  now: () => number;
  viewportWidth: number;
  referrer: string;
  hostname: string;
  send: Send;
};

function parseVisitor(raw: string | null): Visitor | null {
  if (raw === null) return null;
  try {
    const visitor = JSON.parse(raw) as Partial<Visitor> | null;
    if (
      typeof visitor?.visitorId === "string" &&
      uuid.test(visitor.visitorId) &&
      typeof visitor.firstSeenDate === "string" &&
      date.test(visitor.firstSeenDate)
    ) {
      return {
        visitorId: visitor.visitorId,
        firstSeenDate: visitor.firstSeenDate,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function identifyVisitor({
  storage,
  randomUUID,
  firstSeenDate,
}: TrackerOptions) {
  let visitorId: string | undefined;
  try {
    const store = storage();
    const saved = parseVisitor(store.getItem(visitorKey));
    if (saved) return { visitorId: saved.visitorId, returning: true };
    visitorId = randomUUID();
    store.setItem(visitorKey, JSON.stringify({ visitorId, firstSeenDate }));
  } catch {
    return { visitorId: visitorId ?? randomUUID(), returning: false };
  }
  return { visitorId, returning: false };
}

function referrerHost(referrer: string, hostname: string) {
  const normalize = (host: string) => host.toLowerCase().replace(/^www\./, "");
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    const host = normalize(url.hostname);
    if (host && host !== normalize(hostname)) return host.slice(0, 100);
  } catch {
    return undefined;
  }
}

export function createAnalyticsTracker(options: TrackerOptions) {
  const referrer = referrerHost(options.referrer, options.hostname);
  const visit: Visit = {
    ...identifyVisitor(options),
    sessionId: options.randomUUID(),
    path: "/closed-snow",
    viewport: options.viewportWidth < 768 ? "mobile" : "desktop",
    ...(referrer && { referrerHost: referrer }),
  };
  let viewed = false;
  let visibleSince: number | null = null;
  let actions: Action[] = [];

  function send(event: AnalyticsEvent) {
    try {
      void options.send(event)?.catch(() => undefined);
    } catch {
      return;
    }
  }

  const record: RecordAnalyticsAction = (kind, target) => {
    if (actions.length === 50 || !actionKinds.includes(kind)) return;
    actions.push(
      target && targetPattern.test(target) ? { kind, target } : { kind },
    );
  };

  return {
    pageView() {
      if (viewed) return;
      viewed = true;
      send({ ...visit, type: "page_view" });
    },
    startVisible() {
      visibleSince ??= options.now();
    },
    flush(this: void) {
      const elapsed = visibleSince === null ? 0 : options.now() - visibleSince;
      const activeSeconds = Math.min(
        86_400,
        Math.max(0, Math.floor(elapsed / 1000)),
      );
      visibleSince = null;
      const pending = actions;
      actions = [];
      if (activeSeconds > 0 || pending.length > 0) {
        send({
          ...visit,
          type: "session_end",
          activeSeconds,
          actions: pending,
        });
      }
    },
    record,
  };
}

function postEvent(url: string, event: AnalyticsEvent) {
  const body = JSON.stringify(event);
  try {
    if (window.navigator.sendBeacon?.(url, body)) return;
  } catch {
    // Try fetch if the browser could not queue the beacon.
  }
  return window
    .fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
      keepalive: true,
    })
    .then(() => undefined);
}

export function createBrowserAnalyticsTracker(
  origin: string,
  firstSeenDate: string,
  send?: Send,
) {
  if (typeof window === "undefined" || (!send && window.navigator.webdriver))
    return null;
  if (!window.crypto?.randomUUID) return null;
  const { document, performance } = window;
  const tracker = createAnalyticsTracker({
    storage: () => window.localStorage,
    firstSeenDate,
    randomUUID: () => window.crypto.randomUUID(),
    now: () => performance.now(),
    viewportWidth: window.innerWidth,
    referrer: document.referrer,
    hostname: window.location.hostname,
    send: send ?? ((event) => postEvent(`${origin}/v1/events`, event)),
  });

  return {
    record: tracker.record,
    start() {
      function onVisibilityChange() {
        if (document.visibilityState === "visible") tracker.startVisible();
        else tracker.flush();
      }
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("pageshow", onVisibilityChange);
      window.addEventListener("pagehide", tracker.flush);
      onVisibilityChange();
      tracker.pageView();
      return () => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("pageshow", onVisibilityChange);
        window.removeEventListener("pagehide", tracker.flush);
        tracker.flush();
      };
    },
  };
}
