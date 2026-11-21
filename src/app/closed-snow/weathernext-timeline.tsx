"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { privateOrigin } from "@/lib/closed-snow-private";
import styles from "./snow.module.css";

const minute = 60_000;
const hour = 60 * minute;
const maxBytes = 128 * 1024;
const sites = [
  ["steamboat", "Steamboat"],
  ["beaver-creek", "Beaver Creek"],
  ["vail", "Vail"],
  ["copper", "Copper"],
  ["breckenridge", "Breck"],
  ["keystone", "Keystone"],
  ["loveland", "Loveland"],
  ["arapahoe-basin", "A-Basin"],
  ["winter-park", "Winter Park"],
  ["eldora", "Eldora"],
] as const;
const addedSites = new Set(["steamboat", "loveland"]);
const dateTime = z.string().datetime();
const siteId = z.enum(["steamboat", "beaver-creek", "vail", "copper", "breckenridge", "keystone", "loveland", "arapahoe-basin", "winter-park", "eldora"]);
const amountSeries = z.array(z.number().finite().nonnegative().nullable()).min(1).max(168);
const forecastSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("closed-snow-private-liquid"),
  initializedAt: dateTime,
  windowStart: dateTime,
  retrievedAt: z.tuple([dateTime, dateTime.nullable(), dateTime.nullable()]),
  resorts: z.array(z.object({
    id: siteId,
    hourlyMillimeters: z.tuple([amountSeries, amountSeries, amountSeries]),
  })).min(sites.length - addedSites.size).max(sites.length),
});
type Forecast = z.infer<typeof forecastSchema>;
const local = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver", weekday: "short", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
});
const localClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});
const localHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Denver", hour: "2-digit", hourCycle: "h23",
});
const localDay = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Denver", day: "2-digit" });
const fullScale = 0.10;
const levels = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
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
  return totals.reduce((total, value) => total + value, 0) / totals.length;
}

function mark(mmPerHour: number | null) {
  if (mmPerHour === null) return "░";
  if (mmPerHour === 0) return ".";
  const fraction = inches(mmPerHour) / fullScale;
  const height = fraction >= 1 ? levels.length : Math.min(levels.length - 1, Math.max(1, Math.round(fraction * levels.length)));
  return levels[height - 1]!;
}

const format = (mm: number) => mm === 0 ? "0" : inches(mm) < .001 ? "<0.001" : inches(mm).toFixed(3);

function compatible(forecast: Forecast) {
  const start = Date.parse(forecast.windowStart), init = Date.parse(forecast.initializedAt);
  const hours = forecast.resorts[0]!.hourlyMillimeters[0].length;
  const present = new Set(forecast.resorts.map(({ id }) => id));
  return start % hour === 0 && init % hour === 0 && init <= start &&
    forecast.retrievedAt.every((at) => at === null || Date.parse(at) >= init) &&
    present.size === forecast.resorts.length && sites.every(([id]) => addedSites.has(id) || present.has(id)) &&
    forecast.resorts.every(({ hourlyMillimeters }) => hourlyMillimeters.every((values, i) =>
      values.length === hours && (forecast.retrievedAt[i] !== null || values.every((value) => value === null))));
}

function Timeline({ forecast, asOf }: { forecast: Forecast; asOf: number }) {
  const storedStart = Date.parse(forecast.windowStart);
  const currentHour = Math.floor(asOf / hour) * hour;
  const start = Math.max(storedStart, currentHour);
  const end = storedStart + forecast.resorts[0]!.hourlyMillimeters[0].length * hour;
  if (end <= start) return null;
  const includesCurrentHour = start === currentHour;
  const bands = forecastBands(start, end);
  const bins = bands.flatMap((band) => band.bins);
  const rows = sites.flatMap(([id, name]) => {
    const resort = forecast.resorts.find((point) => point.id === id);
    if (!resort) return [];
    const groups = bands.map((band) => band.bins.map(({ from, to }) => blend(resort.hourlyMillimeters, (from - storedStart) / hour, (to - storedStart) / hour)));
    return [{ name, groups, totals: groups.flat() }];
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
    `Now          | ${includesCurrentHour ? "▼ " : ""}${localClock.format(asOf)}`,
    ...rows.map(({ name, groups }) => `${name.padEnd(13)}| ${groups.map((totals, bandIndex) => {
      const band = bands[bandIndex]!;
      return totals.map((total, i) => {
        const { from, to } = band.bins[i]!;
        return mark(total === null ? null : total / ((to - from) / hour)).padEnd(band.width);
      }).join("");
    }).join(" | ").trimEnd()}`),
  ].join("\n");

  return (
    <figure className={styles.forecastTiming} aria-labelledby="forecast-heading">
      <figcaption id="forecast-heading" className={styles.forecastCaption}>
        <strong>Liquid forecast</strong> (0–{fullScale.toFixed(2)}″/hr) · {local.formatRange(start, end)}
      </figcaption>
      <div className={styles.forecastScroll} tabIndex={0} role="region" aria-label={`Forecast timeline. Now ${localClock.format(asOf)}.`}>
        <pre className={styles.forecastText} aria-hidden="true">{text}</pre>
      </div>
      <div className="sr-only">
        <table>
          <caption>Forecast inches of liquid water</caption>
          <thead><tr><th scope="col">Mountain time</th>{rows.map(({ name }) => <th key={name} scope="col">{name}</th>)}</tr></thead>
          <tbody>{bins.map(({ from, to }, index) => (
            <tr key={from}>
              <th scope="row">{from === currentHour ? "Current hour · " : ""}{local.formatRange(from, to)}</th>
              {rows.map(({ name, totals }) => {
                const total = totals[index];
                return <td key={name}>{total == null ? "Unavailable" : format(total)}</td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </figure>
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
    let clock: ReturnType<typeof setTimeout>;
    function updateClock() {
      clearTimeout(clock);
      const now = Date.now();
      setOpened((previous) => previous ? { ...previous, asOf: now } : null);
      clock = setTimeout(updateClock, minute - (now % minute));
    }
    void load();
    const timer = setInterval(() => void load(), 15 * minute);
    clock = setTimeout(updateClock, minute - (Date.now() % minute));
    document.addEventListener("visibilitychange", updateClock);
    window.addEventListener("pageshow", updateClock);
    return () => {
      live = false;
      clearInterval(timer);
      clearTimeout(clock);
      document.removeEventListener("visibilitychange", updateClock);
      window.removeEventListener("pageshow", updateClock);
      controller.abort();
    };
  }, []);

  return opened ? <Timeline {...opened} /> : null;
}
