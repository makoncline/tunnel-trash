import { z } from "zod";

export const CLOSED_SNOW_ORIGIN =
  process.env.NEXT_PUBLIC_CLOSED_SNOW_ORIGIN ?? "https://closed-snow.makon.dev";

const imageAsset = z.object({
  file: z.string().regex(/^[a-f0-9]{64}\.(jpg|avif)$/),
});

const clipSchema = z.object({
  kind: z.enum([
    "until-clearing",
    "until-opening",
    "close-to-open",
    "last-24h",
    "last-48h",
    "last-72h",
  ]),
  asset: z.object({ file: z.string().regex(/^[a-f0-9]{64}\.mp4$/) }),
  timeline: z.object({ file: z.string().regex(/^[a-f0-9]{64}\.json$/) }),
  from: z.string().datetime(),
  to: z.string().datetime(),
  observations: z.number().int().nonnegative(),
  maxGapMinutes: z.number().nonnegative(),
  complete: z.boolean(),
});

const guideAsset = z.object({ file: z.string().regex(/^[a-f0-9]{64}\.svg$/) });
const clearReference = z.object({
  image: imageAsset,
  capturedAt: z.string().datetime(),
  timeBasis: z.string(),
  overlay: guideAsset.nullable(),
  diagonalOverlay: guideAsset.nullable(),
});
const cameraSchema = z.object({
  stakeId: z.string(),
  cameraId: z.string(),
  name: z.string().min(1),
  observationId: z.string(),
  capturedAt: z.string().datetime(),
  sourceAt: z.string().datetime().nullable(),
  timeBasis: z.string(),
  stale: z.boolean(),
  selection: z.enum(["snapshot", "pre-clear"]),
  note: z.string(),
  image: imageAsset,
  overlay: guideAsset.nullable(),
  diagonalOverlay: guideAsset.nullable(),
  clearedReference: clearReference.nullable(),
  morning: z
    .object({
      date: z.string(),
      basis: z.enum([
        "before-clearing",
        "at-opening",
        "so-far",
        "unavailable",
        "manual",
      ]),
    })
    .nullable(),
  details: z.object({
    seasonStatus: z.enum(["open", "not-yet-open", "closed", "unknown"]),
    latestCapture: z
      .object({ capturedAt: z.string().datetime(), timeBasis: z.string() })
      .nullable(),
    clearing: z.object({
      status: z.enum([
        "observed",
        "not-observed",
        "no-snow",
        "uncertain",
        "unreviewed",
      ]),
      reviewedAt: z.string().datetime().nullable(),
      from: z.string().datetime().nullable(),
      to: z.string().datetime().nullable(),
      timeBasis: z.enum(["fetch", "source"]).nullable(),
    }),
  }),
  clips: z.array(z.unknown()),
  sourceSha: z.string().optional(),
  snowBand: z
    .object({
      band: z.enum(["none", "some", "a-lot", "extreme", "uncertain"]),
      observationId: z.string(),
      capturedAt: z.string().datetime(),
    })
    .nullable()
    .optional(),
});

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  product: z.literal("closed-snow"),
  kind: z.enum(["current", "morning"]),
  runId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  date: z.string().nullable(),
  entries: z.array(z.unknown()),
  omissions: z.array(z.object({ stakeId: z.string(), reason: z.string() })),
});

export type Clip = z.infer<typeof clipSchema>;
export type Camera = Omit<z.infer<typeof cameraSchema>, "clips"> & {
  clips: Clip[];
};
export type FeedKind = "current" | "morning";
export type Feed = {
  kind: FeedKind;
  checkedAt: number;
  runId: string | null;
  generatedAt: string | null;
  date: string | null;
  entries: Camera[];
  omissions: { stakeId: string; reason: string }[];
  requestId: string | null;
  correlationId: string | null;
  issue: string | null;
};

export function assetUrl(file: string) {
  return `${CLOSED_SNOW_ORIGIN}/assets/${file}`;
}

export function isSameCapture(
  a: Pick<Camera, "observationId" | "image" | "sourceSha"> | null | undefined,
  b: Pick<Camera, "observationId" | "image" | "sourceSha"> | null | undefined,
) {
  if (!a || !b) return false;
  return (
    a.observationId === b.observationId ||
    a.image.file === b.image.file ||
    (!!a.sourceSha && a.sourceSha === b.sourceSha)
  );
}

export type FetchCacheOptions = { revalidate?: number };
function cacheInit(options?: FetchCacheOptions): RequestInit & { next?: { revalidate: number } } {
  return options?.revalidate !== undefined
    ? { next: { revalidate: options.revalidate } }
    : { cache: "no-store" };
}

export async function loadFeed(
  kind: FeedKind,
  request: typeof fetch = fetch,
  options?: FetchCacheOptions,
): Promise<Feed> {
  const feed: Feed = {
    kind,
    checkedAt: Date.now(),
    runId: null,
    generatedAt: null,
    date: null,
    entries: [],
    omissions: [],
    requestId: null,
    correlationId: null,
    issue: null,
  };
  try {
    const response = await request(`${CLOSED_SNOW_ORIGIN}/v1/${kind}.json`, {
      ...cacheInit(options),
      signal: AbortSignal.timeout(8000),
    });
    feed.requestId = response.headers.get("x-request-id");
    feed.correlationId = response.headers.get("x-correlation-id");
    if (!response.ok) throw new Error("Feed request failed");
    const manifest = manifestSchema.parse(await response.json());
    if (manifest.kind !== kind) throw new Error("Feed kind does not match");
    Object.assign(feed, {
      runId: manifest.runId,
      generatedAt: manifest.generatedAt,
      date: manifest.date,
      omissions: manifest.omissions,
    });
    let skipped = 0;
    for (const entry of manifest.entries) {
      const camera = cameraSchema.safeParse(entry);
      if (!camera.success) {
        skipped++;
        continue;
      }
      const clips: Clip[] = [];
      for (const item of camera.data.clips) {
        const clip = clipSchema.safeParse(item);
        if (clip.success) clips.push(clip.data);
        else skipped++;
      }
      feed.entries.push({ ...camera.data, clips });
    }
    if (skipped) feed.issue = "Some camera data could not be read.";
  } catch {
    feed.issue =
      "This feed could not be loaded. Select the other view or refresh.";
  }
  return feed;
}

const timelineSchema = z.object({
  schemaVersion: z.literal(1),
  fps: z.literal(24),
  frames: z
    .array(
      z.object({
        observationId: z.string(),
        sourceSha: z.string(),
        capturedAt: z.string().datetime(),
        timeBasis: z.string(),
      }),
    )
    .length(72),
});
export type ClipTimeline = z.infer<typeof timelineSchema>;
export async function loadTimeline(file: string): Promise<ClipTimeline> {
  const response = await fetch(assetUrl(file), {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Frame times unavailable");
  return timelineSchema.parse(await response.json());
}

const depth = z.object({ min: z.number(), max: z.number() });
const countPair = z.object({
  open: z.number().int().nonnegative(),
  total: z.number().int().positive(),
});
const conditionsEntrySchema = z.object({
  resortId: z.string(),
  name: z.string().min(1),
  reportUrl: z.string().url(),
  overnightLabel: z.string(),
  skiDay: z.object({ date: z.string() }),
  operatingStatus: z.object({
    value: z.enum(["open", "closed", "unknown"]),
    source: z.string().url().nullable(),
    reportedAt: z.string().datetime().nullable(),
    field: z.string().nullable(),
    lifts: countPair.nullable().optional(),
    trails: countPair.nullable().optional(),
  }),
  season: z.object({
    status: z.string(),
    checkedAt: z.string().datetime(),
    source: z.string().url(),
  }),
  report: z.object({
    status: z.enum(["current", "stale", "unavailable"]),
    data: z
      .object({
        reportedAt: z.string().datetime().nullable(),
        location: z.string(),
        overnight: depth.nullable(),
        snow24: depth.nullable(),
        snow48: depth.nullable(),
        snow7: depth.nullable(),
        base: depth.nullable(),
      })
      .nullable(),
    lastAttemptAt: z.string().datetime().nullable(),
    error: z.string().nullable(),
  }),
  snowpack: z.object({
    data: z.object({
      sourceUrl: z.string().url(),
      station: z.object({
        name: z.string(),
        triplet: z.string(),
        elevationFeet: z.number(),
      }),
      context: z.object({ distanceMiles: z.number(), caveat: z.string() }),
      swe: z
        .object({
          value: z.number(),
          reportedAt: z.string().datetime(),
          provider: z.string(),
        })
        .nullable(),
      stationDepth: z
        .object({
          value: z.number(),
          reportedAt: z.string().datetime(),
          provider: z.string(),
        })
        .nullable(),
      percentOfNormal: z.number().nullable(),
    }),
    freshness: z.object({
      normal: z.enum(["current", "stale", "unavailable"]),
    }),
  }),
  summary: z.object({ text: z.string() }),
  periods: z.array(
    z.object({
      label: z.string(),
      snow24: depth.nullable(),
      reportedDays: z.number().int(),
      totalDays: z.number().int(),
    }),
  ),
  history: z
    .array(
      z.object({
        date: z.string(),
        snow24: depth.nullable(),
        reportedAt: z.string().datetime().nullable(),
        snow24Source: z.object({
          name: z.string(),
          url: z.string().url(),
          reportedAt: z.string().datetime().nullable(),
        }).optional(),
        stake: z
          .object({
            capturedAt: z.string().datetime(),
            basis: z.enum([
              "before-clearing",
              "at-opening",
              "so-far",
              "manual",
            ]),
            timeBasis: z.string(),
            image: imageAsset,
            overlay: guideAsset.nullable(),
            clearing: z
              .object({
                from: z.string().datetime(),
                to: z.string().datetime(),
                timeBasis: z.enum(["fetch", "source"]).nullable(),
              })
              .nullable(),
          })
          .nullable(),
      }),
    )
    .length(6),
});
const conditionsSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().uuid(),
  builtAt: z.string().datetime(),
  date: z.string(),
  entries: z.array(z.unknown()),
});

export type Depth = z.infer<typeof depth>;

const snowBandRanks = {
  extreme: 0.9,
  "a-lot": 0.7,
  some: 0.4,
  none: -0.5,
  uncertain: -1,
};

export function matchingSnowBand(camera?: Camera) {
  if (!camera) return null;
  const band = camera.snowBand;
  return band?.observationId === camera.observationId ? band : null;
}

export function stakeContradictsReport(fresh: Depth | null, camera?: Camera) {
  return (
    (fresh?.max ?? 0) >= 2 &&
    matchingSnowBand(camera)?.band === "none" &&
    camera?.details?.clearing?.status !== "observed"
  );
}

export function freshSnowRank(fresh: Depth | null, camera?: Camera) {
  if (stakeContradictsReport(fresh, camera)) return 0;
  if (fresh) return fresh.max > 0 ? 1 + fresh.max : 0;
  const evidence = matchingSnowBand(camera);
  return evidence ? snowBandRanks[evidence.band] : -1;
}

export type ResortConditions = z.infer<typeof conditionsEntrySchema>;
export type Conditions = {
  date: string | null;
  builtAt: string | null;
  checkedAt: number;
  entries: ResortConditions[];
  issue: string | null;
};

const denverDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Denver",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function denverDateString(at: number) {
  return denverDate.format(at);
}

export const CONDITIONS_DELAY_MS = 15 * 60_000;
export const CONDITIONS_STALE_MS = 60 * 60_000;
export const SNOW_REPORTS_OFFLINE = "Snow reports are temporarily offline.";

export function conditionsFreshness(conditions: Conditions, now: number) {
  const age = now - Date.parse(conditions.builtAt ?? "");
  if (!conditions.entries.length || !Number.isFinite(age) || age < -5 * 60_000) {
    return "unavailable";
  }
  if (conditions.date !== denverDateString(now) || age > CONDITIONS_STALE_MS) {
    return "stale";
  }
  if (age >= CONDITIONS_DELAY_MS) return "delayed";
  return "fresh";
}

export async function loadConditions(
  request: typeof fetch = fetch,
  now: () => number = Date.now,
  options?: FetchCacheOptions,
): Promise<Conditions> {
  const conditions: Conditions = {
    date: null,
    builtAt: null,
    checkedAt: now(),
    entries: [],
    issue: null,
  };
  try {
    const response = await request(`${CLOSED_SNOW_ORIGIN}/v1/conditions.json`, {
      ...cacheInit(options),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Conditions request failed");
    const feed = conditionsSchema.parse(await response.json());
    Object.assign(conditions, {
      date: feed.date,
      builtAt: feed.builtAt,
    });
    let skipped = 0;
    for (const entry of feed.entries) {
      const resort = conditionsEntrySchema.safeParse(entry);
      if (resort.success) conditions.entries.push(resort.data);
      else skipped++;
    }
    conditions.checkedAt = now();
    if (
      conditionsFreshness(conditions, conditions.checkedAt) === "unavailable"
    ) {
      conditions.entries = [];
      conditions.issue = SNOW_REPORTS_OFFLINE;
    } else if (skipped) {
      conditions.issue = "Some resort data could not be read.";
    }
  } catch {
    conditions.issue = SNOW_REPORTS_OFFLINE;
  }
  return conditions;
}
