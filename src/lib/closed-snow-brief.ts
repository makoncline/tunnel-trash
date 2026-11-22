import { z } from "zod";

const CLOSED_SNOW_ORIGIN =
  process.env.NEXT_PUBLIC_CLOSED_SNOW_ORIGIN ?? "https://closed-snow.makon.dev";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = z.string().min(1).max(600).refine((s) => !/https?:|<|>|[\x00-\x1f]/i.test(s));
const pass = z.enum(["epic", "ikon"]);
const modelOutlook = z.object({
  initializedAt: z.string().datetime(),
  comparedTo: z.string().datetime().nullable(),
  models: z.array(text).min(1).max(6),
  summary: text,
  events: z.array(z.object({
    window: text,
    snowfall: text,
    agreement: text,
    trend: z.enum(["up", "down", "steady", "new"]),
    trendNote: text,
  }).strict()).max(3),
  attribution: text,
}).strict();
export const briefSchema = z.object({
  schemaVersion: z.literal(1), date, generatedAt: z.string().datetime(),
  paragraphs: z.array(text).min(1).max(3),
  picks: z.array(z.object({
    resortId: z.string().regex(/^[a-z]+(?:-[a-z]+)*$/), resortName: text, date,
    kind: z.enum(["pick", "watch"]), scope: z.enum(["overall", "epic", "ikon"]), pass: pass.nullable(), reason: text,
  }).strict()).max(6),
  modelOutlook: modelOutlook.optional(),
}).strict();
export type Brief = z.infer<typeof briefSchema>;

const denver = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" });
export function currentBrief(brief: Brief | null, at: number) {
  return !!brief && brief.date === denver.format(at)
    && denver.format(new Date(brief.generatedAt)) === brief.date && Date.parse(brief.generatedAt) <= at;
}

export async function loadBrief(request: typeof fetch = fetch) {
  try {
    const response = await request(new URL("/v1/brief.json", CLOSED_SNOW_ORIGIN), {
      cache: "no-store", signal: AbortSignal.timeout(3500), redirect: "error",
    });
    if (!response.ok) return null;
    if (Number(response.headers.get("content-length")) > 8192) return null;
    const json = await response.text();
    if (json.length > 8192) return null;
    const parsed = briefSchema.safeParse(JSON.parse(json));
    return parsed.success && currentBrief(parsed.data, Date.now()) ? parsed.data : null;
  } catch {
    return null;
  }
}
