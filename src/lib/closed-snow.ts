import { z } from "zod";

export const CLOSED_SNOW_ORIGIN =
  "https://closed-snow-api.daylilycatalog.workers.dev";

const imageAsset = z.object({
  file: z.string().regex(/^[a-f0-9]{64}\.(jpg|avif)$/),
});

const clipSchema = z.object({
  kind: z.enum(["until-clearing", "until-opening", "close-to-open"]),
  asset: z.object({ file: z.string().regex(/^[a-f0-9]{64}\.mp4$/) }),
  from: z.string().datetime(),
  to: z.string().datetime(),
  observations: z.number().int().nonnegative(),
  maxGapMinutes: z.number().nonnegative(),
  complete: z.boolean(),
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
  clips: z.array(z.unknown()),
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

export async function loadFeed(
  kind: FeedKind,
  request: typeof fetch = fetch,
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
      cache: "no-store",
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
