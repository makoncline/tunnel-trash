import { z } from "zod";

export const privateOrigin = process.env.NEXT_PUBLIC_CLOSED_SNOW_PRIVATE_ORIGIN ?? "https://makonmacair.tailb1a90d.ts.net:8448";

const speed = z.number().int().nonnegative();
const skiDaySchema = z.object({
  schemaVersion: z.literal(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  resorts: z.array(z.object({
    resortId: z.string().regex(/^[a-z]+(?:-[a-z]+)*$/),
    lowF: z.number().int(),
    highF: z.number().int(),
    weather: z.string().regex(/^[a-zA-Z ?→-]{1,24}$/),
    windMph: z.object({ low: speed, high: speed }).refine(({ low, high }) => low <= high).nullable(),
  }).refine(({ lowF, highF }) => lowF <= highF)).max(10),
}).refine(({ startsAt, endsAt }) => Date.parse(endsAt) - Date.parse(startsAt) === 7 * 3_600_000);

export type SkiDay = z.infer<typeof skiDaySchema>;

export async function loadSkiDayWeather(signal: AbortSignal) {
  try {
    const response = await fetch(`${privateOrigin}/forecast/ski-day.json`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    });
    if (!response.ok) return null;
    const parsed = skiDaySchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
