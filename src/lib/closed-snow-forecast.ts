import { z } from "zod";
import { outlookEventSchema } from "./closed-snow-brief";

const CLOSED_SNOW_ORIGIN =
  process.env.NEXT_PUBLIC_CLOSED_SNOW_ORIGIN ?? "https://closed-snow.makon.dev";

export const CLOSED_SNOW_FORECAST_URL =
  process.env.NEXT_PUBLIC_CLOSED_SNOW_FORECAST_URL ??
  new URL("/v1/forecast.json", CLOSED_SNOW_ORIGIN).toString();

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const nullableSnow = z.number().finite().min(0).nullable();
const safeText = z
  .string()
  .min(1)
  .max(600)
  .refine((s) => !/https?:|<|>|[\x00-\x1f]/i.test(s));

const forecastOutlookSchema = z
  .object({
    initializedAt: z.string().datetime(),
    comparedTo: z.string().datetime().nullable(),
    summary: safeText,
    events: z.array(outlookEventSchema).max(3),
    attribution: safeText,
  })
  .strict();

const forecastDaySchema = z
  .object({
    date: z.string().regex(datePattern),
    night: nullableSnow,
    day: nullableSnow,
  })
  .strict();

const forecastRunSchema = z
  .object({
    date: z.string().regex(datePattern),
    initializedAt: z.string().datetime(),
    days: z.array(forecastDaySchema),
  })
  .strict();

const forecastResortSchema = z
  .object({
    resortId: z.string().min(1),
    name: z.string().min(1),
    runs: z.array(forecastRunSchema),
  })
  .strict();

export const forecastSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    date: z.string().regex(datePattern),
    runId: z.string().nullable(),
    attribution: z.string().min(1),
    outlook: forecastOutlookSchema.nullable().optional(),
    resorts: z.array(forecastResortSchema),
  })
  .strict();

export type ForecastDay = z.infer<typeof forecastDaySchema>;
export type ForecastRun = z.infer<typeof forecastRunSchema>;
export type ResortForecast = z.infer<typeof forecastResortSchema>;
export type ForecastFeed = z.infer<typeof forecastSchema>;

const denverDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Denver",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function currentForecast(forecast: ForecastFeed | null, at: number): boolean {
  if (!forecast) return false;
  const generated = Date.parse(forecast.generatedAt);
  if (!Number.isFinite(generated) || generated > at) return false;
  const today = denverDateFormat.format(at);
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  return forecast.date >= yesterday && forecast.date <= today;
}

export async function loadForecast(
  request: typeof fetch = fetch,
  options?: { revalidate?: number },
): Promise<ForecastFeed | null> {
  try {
    const init: RequestInit & { next?: { revalidate: number } } =
      options?.revalidate !== undefined
        ? { next: { revalidate: options.revalidate } }
        : { cache: "no-store" };
    const response = await request(CLOSED_SNOW_FORECAST_URL, {
      ...init,
      signal: AbortSignal.timeout(4000),
      redirect: "error",
    });
    if (!response.ok) return null;
    const parsed = forecastSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
