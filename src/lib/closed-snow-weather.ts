const NWS_ORIGIN = "https://api.weather.gov";
const ZONE = "America/Denver";
const HOUR_MS = 3_600_000;

const RESORT_GRIDS: Record<string, string> = {
  "beaver-creek": "GJT/168,118",
  vail: "GJT/174,119",
  copper: "BOU/21,53",
  breckenridge: "BOU/24,52",
  keystone: "BOU/29,57",
  "arapahoe-basin": "BOU/32,59",
  loveland: "BOU/31,61",
  "winter-park": "BOU/36,69",
  eldora: "BOU/42,72",
  steamboat: "GJT/163,159",
};

export type SkiDayResort = {
  resortId: string;
  lowF: number;
  highF: number;
  weather: string;
  windMph: { low: number; high: number } | null;
};

export type SkiDay = {
  schemaVersion: 1;
  startsAt: string;
  endsAt: string;
  resorts: SkiDayResort[];
};

const denverParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function localDateAndMinute(at: number) {
  const parts = Object.fromEntries(
    denverParts.formatToParts(new Date(at)).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function denverInstant(date: string, hour24: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  let guess = Date.UTC(y, m - 1, d, hour24 + 7, 0, 0);
  for (let i = 0; i < 3; i++) {
    const actual = localDateAndMinute(guess);
    const dayDiff = Math.round(
      (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${actual.date}T12:00:00Z`)) /
        (24 * HOUR_MS),
    );
    const minuteDiff = hour24 * 60 - actual.minute + dayDiff * 24 * 60;
    if (minuteDiff === 0) break;
    guess += minuteDiff * 60_000;
  }
  return new Date(guess).toISOString();
}

export function skiDayWindowAt(at: number) {
  const local = localDateAndMinute(at);
  const date =
    local.minute < 9 * 60
      ? local.date
      : new Date(Date.parse(`${local.date}T12:00:00Z`) + 24 * HOUR_MS)
          .toISOString()
          .slice(0, 10);
  return {
    date,
    startsAt: denverInstant(date, 9),
    endsAt: denverInstant(date, 16),
  };
}

function parseCondition(text: string): string | null {
  const s = text.toLowerCase();
  const chance = /\bchance\b/.test(s);
  const likely = /\blikely\b/.test(s);
  if (s.includes("blowing snow")) return "Blowing snow";
  if (/freezing rain|sleet|wintry mix/.test(s) || (/\bsnow\b/.test(s) && /\brain\b/.test(s))) {
    return chance ? "Mix chance" : "Wintry mix";
  }
  if (s.includes("thunderstorm")) return chance ? "Storm chance" : "Thunderstorms";
  if (/\bsnow\b/.test(s)) return likely ? "Snow likely" : chance ? "Snow chance" : "Snow";
  if (/rain|drizzle/.test(s)) return likely ? "Rain likely" : chance ? "Rain chance" : "Rain";
  if (s.includes("fog")) return "Fog";
  if (s.includes("windy")) return "Windy";
  if (s.includes("mostly sunny")) return "Mostly sunny";
  if (/partly sunny|partly cloudy/.test(s)) return "Partly sunny";
  if (s.includes("mostly cloudy")) return "Mostly cloudy";
  if (/cloudy|overcast/.test(s)) return "Cloudy";
  if (/sunny|clear/.test(s)) return "Sunny";
  return null;
}

function summarizeConditions(conditions: string[]): string {
  const priority = [
    "Thunderstorms",
    "Storm chance",
    "Wintry mix",
    "Mix chance",
    "Blowing snow",
    "Snow",
    "Snow likely",
    "Snow chance",
    "Rain",
    "Rain likely",
    "Rain chance",
    "Fog",
    "Windy",
  ];
  const notable = priority.find((label) => conditions.includes(label));
  const sunnyEnd = conditions
    .slice(-2)
    .every((label) => ["Sunny", "Mostly sunny", "Partly sunny"].includes(label));
  if (notable) return sunnyEnd && notable === "Snow chance" ? "Snow? → sun" : notable;
  const counts = new Map<string, number>();
  for (const label of conditions) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Cloudy";
}

function parseWindSpeed(text: unknown): { low: number; high: number } | null {
  if (typeof text !== "string") return null;
  const match = /^(\d+)(?: to (\d+))? mph$/i.exec(text.trim());
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2] ?? match[1]);
  return low <= high ? { low, high } : null;
}

type NwsPeriod = {
  startTime?: unknown;
  endTime?: unknown;
  temperature?: unknown;
  temperatureUnit?: unknown;
  shortForecast?: unknown;
  windSpeed?: unknown;
};

type NwsHourlyResponse = {
  properties?: {
    updateTime?: unknown;
    periods?: unknown;
  };
};

async function fetchPoint(
  resortId: string,
  grid: string,
  window: { startsAt: string; endsAt: string },
  at: number,
  request: typeof fetch,
): Promise<SkiDayResort | null> {
  try {
    const response = await request(
      `${NWS_ORIGIN}/gridpoints/${grid}/forecast/hourly`,
      {
        next: { revalidate: 900 },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: {
          "User-Agent": "ClosedSnow/1.0 (https://www.tunnel-trash.com/closed-snow)",
          Accept: "application/geo+json",
        },
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as NwsHourlyResponse;
    const updatedAt = payload.properties?.updateTime;
    const updated = typeof updatedAt === "string" ? Date.parse(updatedAt) : NaN;
    const periods = payload.properties?.periods;
    if (
      !Number.isFinite(updated) ||
      updated > at + 5 * 60_000 ||
      at - updated > 24 * HOUR_MS ||
      !Array.isArray(periods)
    ) {
      return null;
    }
    const start = Date.parse(window.startsAt);
    const end = Date.parse(window.endsAt);
    const byHour = new Map<
      number,
      { temperature: number; weather: string; wind: { low: number; high: number } | null }
    >();
    for (const raw of periods as NwsPeriod[]) {
      const from = typeof raw.startTime === "string" ? Date.parse(raw.startTime) : NaN;
      const to = typeof raw.endTime === "string" ? Date.parse(raw.endTime) : NaN;
      if (!Number.isFinite(from) || from < start || from >= end) continue;
      const weather =
        typeof raw.shortForecast === "string" ? parseCondition(raw.shortForecast) : null;
      if (
        byHour.has(from) ||
        to - from !== HOUR_MS ||
        raw.temperatureUnit !== "F" ||
        typeof raw.temperature !== "number" ||
        !Number.isInteger(raw.temperature) ||
        !weather
      ) {
        return null;
      }
      byHour.set(from, {
        temperature: raw.temperature,
        weather,
        wind: parseWindSpeed(raw.windSpeed),
      });
    }
    const rows = Array.from({ length: 7 }, (_, i) => byHour.get(start + i * HOUR_MS));
    if (rows.some((row) => !row)) return null;
    const validRows = rows as NonNullable<(typeof rows)[number]>[];
    const temps = validRows.map((row) => row.temperature);
    const winds = validRows.map((row) => row.wind);
    const windMph = winds.every((w): w is { low: number; high: number } => w !== null)
      ? {
          low: Math.min(...winds.map((w) => w.low)),
          high: Math.max(...winds.map((w) => w.high)),
        }
      : null;
    return {
      resortId,
      lowF: Math.min(...temps),
      highF: Math.max(...temps),
      weather: summarizeConditions(validRows.map((row) => row.weather)),
      windMph,
    };
  } catch {
    return null;
  }
}

export async function loadSkiDayWeather(
  request: typeof fetch = fetch,
  at: number = Date.now(),
): Promise<SkiDay | null> {
  const window = skiDayWindowAt(at);
  const results = await Promise.all(
    Object.entries(RESORT_GRIDS).map(([id, grid]) =>
      fetchPoint(id, grid, window, at, request),
    ),
  );
  const resorts = results.filter((entry): entry is SkiDayResort => entry !== null);
  if (!resorts.length) return null;
  return {
    schemaVersion: 1,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    resorts,
  };
}
