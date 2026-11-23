import { z } from "zod";

const CLOSED_SNOW_ORIGIN =
  process.env.NEXT_PUBLIC_CLOSED_SNOW_ORIGIN ?? "https://closed-snow.makon.dev";

export const CLOSED_SNOW_ROADS_URL =
  process.env.NEXT_PUBLIC_CLOSED_SNOW_ROADS_URL ??
  new URL("/v1/roads.json", CLOSED_SNOW_ORIGIN).toString();

const nullableTime = z.string().datetime().nullable();
const nullableText = z.string().nullable();
const nonNegInt = z.number().int().nonnegative();

const sourceSchema = z
  .object({
    fetchedAt: nullableTime,
    lastAttemptAt: nullableTime,
    error: nullableText,
  })
  .strict();

const alertSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["closure", "chain-law", "traction-law", "incident"]),
    route: z.string(),
    title: z.string(),
    summary: nullableText,
    severity: nullableText,
    updatedAt: nullableTime,
    resorts: z.array(z.string()),
    url: z.string().url(),
  })
  .strict();

const driveSampleSchema = z
  .object({
    at: z.string().datetime(),
    travelSeconds: nonNegInt,
    delaySeconds: nonNegInt,
  })
  .strict();

const driveSchema = z
  .object({
    capturedAt: z.string().datetime(),
    travelSeconds: nonNegInt,
    baselineSeconds: nonNegInt,
    delaySeconds: nonNegInt,
    trend30mSeconds: z.number().int().nullable(),
    trend: z.enum(["rising", "falling", "steady"]).nullable(),
    samples: z.array(driveSampleSchema),
  })
  .strict();

const roadStateSchema = z
  .object({
    surface: z.enum(["dry", "wet", "slush", "snow", "icy", "closed", "unknown"]),
    worstCondition: nullableText,
    worstSegment: nullableText,
    tractionLaw: z.boolean(),
    chainLaw: z.boolean(),
    closed: z.boolean(),
    alerts: z.array(alertSchema),
  })
  .strict();

const resortRoadEntrySchema = z
  .object({
    resortId: z.string(),
    name: z.string(),
    drive: driveSchema.nullable(),
    road: roadStateSchema,
  })
  .strict();

export const roadsSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    runId: nullableText,
    origin: z
      .object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
      })
      .strict(),
    sources: z
      .object({
        tomtom: sourceSchema,
        cotrip: sourceSchema,
      })
      .strict(),
    corridorAlerts: z.array(alertSchema),
    resorts: z.array(resortRoadEntrySchema),
  })
  .strict();

export type RoadAlert = z.infer<typeof alertSchema>;
export type DriveSample = z.infer<typeof driveSampleSchema>;
export type DriveInfo = z.infer<typeof driveSchema>;
export type ResortRoadState = z.infer<typeof roadStateSchema>;
export type ResortRoadEntry = z.infer<typeof resortRoadEntrySchema>;
export type RoadsFeed = z.infer<typeof roadsSchema>;
export type DriveTrendLevel =
  | "falling-fast"
  | "falling"
  | "steady"
  | "rising"
  | "rising-fast";

export function driveTrendLevel(trend30mSeconds: number | null): DriveTrendLevel | null {
  if (trend30mSeconds === null) return null;
  if (trend30mSeconds >= 900) return "rising-fast";
  if (trend30mSeconds >= 300) return "rising";
  if (trend30mSeconds <= -900) return "falling-fast";
  if (trend30mSeconds <= -300) return "falling";
  return "steady";
}

export function driveTrendLabel(level: DriveTrendLevel): string {
  return {
    "falling-fast": "Decreasing quickly",
    falling: "Decreasing",
    steady: "Steady",
    rising: "Increasing",
    "rising-fast": "Increasing quickly",
  }[level];
}

export function cleanSurfaceCondition(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^\d+[a-z]?(?:-\d+[a-z]?)*(?:\s*-\s*|\s+)/i, "")
    .trim();
  if (!cleaned) return raw.trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function shortAlertLocation(summary: string | null): string | null {
  if (!summary) return null;
  const firstSentence = summary.split(/\.(?:\s|$)/)[0]?.trim() ?? "";
  if (!firstSentence) return null;
  const compact = firstSentence
    .replace(/\s+from Mile Point\s+[\d.]+\s+to Mile Point\s+[\d.]+$/i, "")
    .replace(/\s+at Mile Point\s+[\d.]+$/i, "")
    .trim();
  return compact.length > 0 && compact.length <= 120 ? compact : null;
}

export function formatDriveMinutes(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatDelayMinutes(delaySeconds: number): string | null {
  const minutes = Math.round(delaySeconds / 60);
  return minutes >= 5 ? `+${minutes}m` : null;
}

export function surfaceLabel(surface: ResortRoadState["surface"]): string | null {
  return {
    dry: "Dry",
    wet: "Wet",
    slush: "Slush",
    snow: "Snow-packed",
    icy: "Icy",
    closed: "Closed",
    unknown: null,
  }[surface];
}

export function isPassengerChainLaw(alert: RoadAlert): boolean {
  if (alert.kind !== "chain-law") return false;
  return !/\bcode\s*18\b|\bcommercial\b/i.test(`${alert.title} ${alert.summary ?? ""}`);
}

export function isMajorRoadAlert(alert: RoadAlert): boolean {
  return (
    alert.kind === "closure" ||
    alert.kind === "incident" ||
    isPassengerChainLaw(alert)
  );
}

export function driveSeverity(
  entry: ResortRoadEntry | null | undefined,
): "normal" | "warn" | "severe" {
  if (!entry) return "normal";
  if (entry.road.closed) return "severe";
  const delayMin = entry.drive ? Math.round(entry.drive.delaySeconds / 60) : 0;
  if (delayMin >= 30) return "severe";
  if (delayMin >= 15 || entry.road.alerts.some(isMajorRoadAlert)) {
    return "warn";
  }
  return "normal";
}

export async function loadRoads(
  request: typeof fetch = fetch,
  options?: { revalidate?: number },
): Promise<RoadsFeed | null> {
  try {
    const init: RequestInit & { next?: { revalidate: number } } =
      options?.revalidate !== undefined
        ? { next: { revalidate: options.revalidate } }
        : { cache: "no-store" };
    const response = await request(CLOSED_SNOW_ROADS_URL, {
      ...init,
      signal: AbortSignal.timeout(4000),
      redirect: "error",
    });
    if (!response.ok) return null;
    const parsed = roadsSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
