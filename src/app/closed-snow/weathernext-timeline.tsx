"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import styles from "./snow.module.css";

const hour = 3_600_000;
const maxBytes = 128 * 1024;
const privateOrigin = process.env.NEXT_PUBLIC_CLOSED_SNOW_PRIVATE_ORIGIN ?? "https://makonmacair.tailb1a90d.ts.net:8448";
const sites = [
  ["beaver-creek", "Beaver Creek"],
  ["vail", "Vail"],
  ["copper", "Copper"],
  ["breckenridge", "Breck"],
  ["keystone", "Keystone"],
  ["arapahoe-basin", "A-Basin"],
  ["winter-park", "Winter Park"],
  ["eldora", "Eldora"],
] as const;
const sources = ["WeatherNext 3", "GFS", "ECMWF"] as const;
const dateTime = z.string().datetime();
const amountSeries = z.array(z.number().finite().nonnegative().nullable()).min(1).max(168);
const forecastSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("closed-snow-private-liquid"),
  initializedAt: dateTime,
  windowStart: dateTime,
  retrievedAt: z.tuple([dateTime, dateTime.nullable(), dateTime.nullable()]),
  resorts: z.array(z.object({
    id: z.enum(["beaver-creek", "vail", "copper", "breckenridge", "keystone", "arapahoe-basin", "winter-park", "eldora"]),
    hourlyMillimeters: z.tuple([amountSeries, amountSeries, amountSeries]),
  })).length(sites.length),
});
type Forecast = z.infer<typeof forecastSchema>;
const local = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver", weekday: "short", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
});
const localHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Denver", hour: "2-digit", hourCycle: "h23",
});
const localDay = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Denver", day: "2-digit" });
const bounds = [0.0025, 0.005, 0.01, 0.02];
const levels = ["▂", "▃", "▅", "▇", "█"];
const inches = (mm: number) => mm / 25.4;

function nextMidnight(at: number) {
  do { at += hour; } while (localHour.format(at) !== "00");
  return at;
}

function forecastBands(start: number, end: number) {
  const sections = [
    { name: "Hours", limit: Math.min(start + 12 * hour, end), width: 1, step: (at: number) => at + hour },
    { name: "6h blocks", limit: Math.min(nextMidnight(nextMidnight(start)), end), width: 3, step: (at: number) => at + 6 * hour },
    { name: "Days", limit: end, width: 3, step: nextMidnight },
  ];
  let from = start;
  return sections.flatMap(({ name, limit, width, step }) => {
    const bins = [];
    while (from < limit) {
      const to = Math.min(step(from), limit);
      bins.push({ from, to });
      from = to;
    }
    return bins.length ? [{ name, width, bins }] : [];
  });
}

function sum(values: (number | null)[], from: number, to: number) {
  const hours = values.slice(from, to);
  return hours.length === to - from && hours.every((value) => value !== null)
    ? hours.reduce((total, value) => total + value, 0)
    : null;
}

function blend(models: Forecast["resorts"][number]["hourlyMillimeters"], from: number, to: number) {
  const totals = models.map((series) => sum(series, from, to));
  if (!totals.every((amount) => amount !== null)) return null;
  return { mean: totals.reduce((total, value) => total + value, 0) / totals.length, min: Math.min(...totals), max: Math.max(...totals) };
}

function mark(mmPerHour: number | null) {
  if (mmPerHour === null) return "░";
  if (mmPerHour === 0) return ".";
  const index = bounds.findIndex((bound) => inches(mmPerHour) < bound);
  return levels[index < 0 ? levels.length - 1 : index]!;
}

const format = (mm: number) => mm === 0 ? "0" : inches(mm) < .001 ? "<0.001" : inches(mm).toFixed(3);

function compatible(forecast: Forecast) {
  const start = Date.parse(forecast.windowStart), init = Date.parse(forecast.initializedAt);
  const hours = forecast.resorts[0]!.hourlyMillimeters[0].length;
  return start % hour === 0 && init % hour === 0 && init <= start &&
    forecast.retrievedAt.every((at) => at === null || Date.parse(at) >= init) &&
    new Set(forecast.resorts.map(({ id }) => id)).size === sites.length &&
    forecast.resorts.every(({ hourlyMillimeters }) => hourlyMillimeters.every((values, i) =>
      values.length === hours && (forecast.retrievedAt[i] !== null || values.every((value) => value === null))));
}

function Timeline({ forecast, asOf }: { forecast: Forecast; asOf: number }) {
  const storedStart = Date.parse(forecast.windowStart);
  const start = Math.max(storedStart, Math.ceil(asOf / hour) * hour);
  const end = storedStart + forecast.resorts[0]!.hourlyMillimeters[0].length * hour;
  if (end <= start) return <p role="status">This file has no complete forecast hours after now.</p>;
  const bands = forecastBands(start, end);
  const bins = bands.flatMap((band) => band.bins);
  const rows = sites.map(([id, name]) => {
    const models = forecast.resorts.find((resort) => resort.id === id)!.hourlyMillimeters;
    const groups = bands.map((band) => band.bins.map(({ from, to }) => blend(models, (from - storedStart) / hour, (to - storedStart) / hour)));
    return { name, groups, totals: groups.flat() };
  });
  const headings = bands.map(({ name, width, bins }) => name.padEnd(width * bins.length).slice(0, width * bins.length));
  const ticks = bands.map(({ name, width, bins }) => bins.map(({ from }, i) => {
    if (name === "Days") return localDay.format(from).padEnd(width);
    if (width > 1) return localHour.format(from).padEnd(width);
    if (i % 3 === 0) return localHour.format(from).slice(0, bins.length - i);
    return i % 3 === 1 ? "" : " ";
  }).join(""));
  const text = [
    "               " + headings.join(" | ").trimEnd(),
    `Local start  | ${ticks.join(" | ").trimEnd()}`,
    ...rows.map(({ name, groups }) => `${name.padEnd(13)}| ${groups.map((totals, bandIndex) => {
      const band = bands[bandIndex]!;
      return totals.map((total, i) => {
        const { from, to } = band.bins[i]!;
        return mark(total === null ? null : total.mean / ((to - from) / hour)).padEnd(band.width);
      }).join("");
    }).join(" | ").trimEnd()}`),
  ].join("\n");

  return (
    <>
      <p>{local.format(start)} to {local.format(end)} · Run: <time dateTime={forecast.initializedAt}>{local.format(new Date(forecast.initializedAt))}</time></p>
      <div className={styles.forecastScroll} tabIndex={0} role="region" aria-label="Forecast timeline. Exact values follow.">
        <pre className={styles.forecastText} aria-hidden="true">{text}</pre>
      </div>
      <p><code>.</code> Zero · <code>▂▃▅▇█</code> Less to more liquid per hour · <code>░</code> Missing model data</p>
      <p>Equal weights. Liquid water, not snowfall. Longer blocks smooth short bursts. WeatherNext hour-ending timing is provisional.</p>
      <details>
        <summary>Sources, block totals and model ranges</summary>
        <ul>
          {sources.map((source, i) => {
            const read = forecast.retrievedAt[i];
            return <li key={source}>{source}: ⅓ · {read ? `Read ${local.format(new Date(read))}` : "Unavailable"}</li>;
          })}
        </ul>
        <div className={styles.forecastScroll} tabIndex={0} role="region" aria-label="Block amounts and model ranges">
          <table>
            <caption>Inches of liquid, blend and model range</caption>
            <thead><tr><th scope="col">Mountain time</th>{rows.map(({ name }) => <th key={name} scope="col">{name}</th>)}</tr></thead>
            <tbody>{bins.map(({ from, to }, index) => (
              <tr key={from}>
                <th scope="row">{local.format(from)} to {local.format(to)}</th>
                {rows.map(({ name, totals }) => {
                  const total = totals[index];
                  return <td key={name}>{total ? `${format(total.mean)} (${format(total.min)}–${format(total.max)})` : "Unavailable"}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function PrivateForecast() {
  const [opened, setOpened] = useState<{ forecast: Forecast; asOf: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    async function load() {
      try {
        const response = await fetch(`${privateOrigin}/forecast/blend.json`, { cache: "no-store", redirect: "error", signal: controller.signal });
        if (!response.ok) return;
        const text = await response.text();
        if (text.length > maxBytes) return;
        const parsed = forecastSchema.parse(JSON.parse(text));
        if (!compatible(parsed)) return;
        if (live) setOpened({ forecast: parsed, asOf: Date.now() });
      } catch {
        return;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 15 * 60_000);
    return () => {
      live = false;
      clearInterval(timer);
      controller.abort();
    };
  }, []);

  if (!opened) return null;
  return (
    <section className={styles.forecastTiming} aria-labelledby="forecast-heading">
      <h2 id="forecast-heading">Private forecast · Closed Snow blend</h2>
      <Timeline {...opened} />
    </section>
  );
}
