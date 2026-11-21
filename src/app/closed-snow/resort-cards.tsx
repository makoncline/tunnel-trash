"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Play, Square } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  assetUrl,
  isSameCapture,
  loadTimeline,
  type Camera,
  type Clip,
  type ClipTimeline,
  type Conditions,
  type Depth,
  type Feed,
  type ResortConditions,
} from "@/lib/closed-snow";
import type { SkiDay } from "@/lib/closed-snow-weather";
import viewer from "./snow.module.css";
import styles from "./resort-cards.module.css";
import { StakePhoto } from "./stake-photo";

export type CameraMode = "morning" | "now";
export type PassFilter = "all" | "epic" | "ikon";
export type ResortFilters = {
  pass: PassFilter;
  openOnly: boolean;
  newSnowOnly: boolean;
};
export type OpenCameraTarget = {
  resortId: string;
  name: string;
  initialMedia: string;
};

export const RESORT_PASSES: Record<string, "epic" | "ikon"> = {
  vail: "epic",
  "beaver-creek": "epic",
  breckenridge: "epic",
  keystone: "epic",
  copper: "ikon",
  "winter-park": "ikon",
  "arapahoe-basin": "ikon",
  eldora: "ikon",
};

type Day = ResortConditions["history"][number];
type View = { camera: Camera; basis: string; title: string };

const zone = "America/Denver";
const longFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: zone,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: zone,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const stamp = (at: string | null) =>
  at ? longFormat.format(new Date(at)) : "Time not supplied";
const longDate = (date: string) =>
  dateFormat.format(new Date(`${date}T12:00:00Z`));
const round = (n: number) => Number(n.toFixed(1)).toString();
const inches = (value: Depth | null) =>
  !value
    ? "—"
    : `${round(value.min)}${value.min === value.max ? "" : `–${round(value.max)}`}″`;
const missingInches = (value: Depth | null) =>
  value ? inches(value) : "— (missing)";
const basisNames = {
  "before-clearing": "Before clearing",
  "at-opening": "At opening",
  "so-far": "Overnight so far",
  manual: "Selected by you",
};
const captionNames: Record<string, string> = {
  "before-clearing": "Before clear",
  "at-opening": "Opening",
  "so-far": "Overnight",
  manual: "Morning",
};
const bandNames = {
  none: "none",
  some: "some",
  "a-lot": "lots",
  extreme: "extreme",
  uncertain: "uncertain",
};

function parts(at: string) {
  return Object.fromEntries(
    partsFormat
      .formatToParts(new Date(at))
      .map((part) => [part.type, part.value]),
  );
}
function shortStamp(at: string, now: number) {
  const p = parts(at);
  const date =
    now - Date.parse(at) < 6 * 86_400_000 ? p.weekday : `${p.month} ${p.day}`;
  return `${date} ${p.hour}:${p.minute}${p.dayPeriod === "AM" ? "a" : "p"}`;
}
function clockTime(at: string) {
  const p = parts(at);
  return `${p.hour}:${p.minute}${p.dayPeriod === "AM" ? "a" : "p"}`;
}
function isStale(camera: Camera, now: number) {
  return (
    camera.stale ||
    (camera.morning
      ? camera.morning.basis === "unavailable"
      : now - Date.parse(camera.capturedAt) > 30 * 60_000)
  );
}
function resortCamera(resortId: string, feed: Feed) {
  return feed.entries.find(
    (entry) => entry.cameraId === resortId || entry.stakeId === resortId,
  );
}
function leadView(resort: ResortConditions, morning: Feed): View | null {
  const camera = resortCamera(resort.resortId, morning);
  const pick = camera?.morning;
  if (
    !camera ||
    pick?.date !== resort.skiDay.date ||
    pick.basis === "unavailable"
  )
    return null;
  return { camera, basis: pick.basis, title: basisNames[pick.basis] };
}
function currentView(resortId: string, current: Feed): View | null {
  const camera = resortCamera(resortId, current);
  if (!camera) return null;
  return { camera, basis: "now", title: "Now" };
}
function cameraStamp(camera: Camera) {
  return `${camera.timeBasis === "unknown" ? "Fetched " : ""}${stamp(camera.capturedAt)}`;
}
function reportOf(resort: ResortConditions) {
  return resort.report.status === "current" ? resort.report.data : null;
}
function statusPageUrl(resort: ResortConditions): string {
  const source = resort.operatingStatus.source;
  if (source && !/\/api\//i.test(source)) return source;
  return resort.reportUrl;
}
function hasNewSnow(resort: ResortConditions, morningView: View | null): boolean {
  const fresh = reportOf(resort)?.overnight;
  if (fresh) return fresh.max > 0;
  const band =
    morningView?.camera.snowBand?.observationId === morningView?.camera.observationId
      ? morningView?.camera.snowBand?.band
      : null;
  return band === "some" || band === "a-lot" || band === "extreme";
}

function InlineCardClip({
  name,
  camera,
  clip,
  onStop,
  onExpand,
}: {
  name: string;
  camera: Camera;
  clip: Clip;
  onStop: () => void;
  onExpand: (button: HTMLButtonElement) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [timeline, setTimeline] = useState<ClipTimeline | null>(null);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTimeline(clip.timeline.file)
      .then((data) => {
        if (!cancelled) setTimeline(data);
      })
      .catch(() => {
        if (!cancelled) setTimeline(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clip.timeline.file]);

  useEffect(() => {
    const player = video.current;
    if (!player || !ready || failed) return;
    let callback = 0;
    if (timeline) {
      const update = (_now: number, metadata: VideoFrameCallbackMetadata) => {
        setIndex(
          Math.min(
            timeline.frames.length - 1,
            Math.floor(metadata.mediaTime * timeline.fps + 0.0001),
          ),
        );
        callback = player.requestVideoFrameCallback(update);
      };
      callback = player.requestVideoFrameCallback(update);
    }
    void player.play().catch(() => undefined);
    return () => {
      if (callback) player.cancelVideoFrameCallback(callback);
      player.pause();
    };
  }, [timeline, ready, failed]);

  const frame = timeline?.frames[index];
  const frameTime = frame ? clockTime(frame.capturedAt) : "Playing…";

  return (
    <div className={styles.media}>
      <div className={styles.inlineClipStage}>
        {failed ? (
          <p className={styles.inlineClipError} role="status">
            Timelapse unavailable
          </p>
        ) : (
          <>
            <video
              ref={video}
              className={styles.inlineVideo}
              src={`${assetUrl(clip.asset.file)}?timeline=${clip.timeline.file}`}
              poster={assetUrl(camera.image.file)}
              muted
              loop
              playsInline
              autoPlay
              aria-label={`${name} timelapse`}
              onLoadedData={() => setReady(true)}
              onError={() => setFailed(true)}
              onClick={() => onStop()}
            />
            {camera.overlay && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.inlineGuide}
                src={assetUrl(camera.overlay.file)}
                alt=""
                aria-hidden="true"
              />
            )}
          </>
        )}
      </div>
      <div className={styles.overlayControls}>
        <span className={styles.caption}>Timelapse · {frameTime}</span>
        <div className={styles.clipActions}>
          <button
            type="button"
            className={styles.clipPill}
            aria-label={`Stop ${name} timelapse`}
            onClick={() => onStop()}
          >
            <Square size={10} fill="currentColor" aria-hidden="true" />
            <span>Stop</span>
          </button>
          <button
            type="button"
            className={styles.clipIconPill}
            aria-label={`Expand ${name} timelapse controls`}
            title="Expand frame controls"
            onClick={(event) => onExpand(event.currentTarget)}
          >
            <Maximize2 size={12} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StakeMedia({
  resortId,
  name,
  morningView,
  nowView,
  activeMode,
  playingClip,
  onSelectMode,
  onPlayClip,
  onStopClip,
  open,
  now,
}: {
  resortId: string;
  name: string;
  morningView: View | null;
  nowView: View | null;
  activeMode: CameraMode;
  playingClip: boolean;
  onSelectMode: (next: CameraMode) => void;
  onPlayClip: () => void;
  onStopClip: () => void;
  open: (target: OpenCameraTarget, button: HTMLButtonElement) => void;
  now: number;
}) {
  const distinctNow =
    !!nowView && (!morningView || !isSameCapture(morningView.camera, nowView.camera));
  const activeView = activeMode === "now" ? nowView : morningView;
  const clipSource = morningView?.camera.clips.length
    ? morningView.camera
    : nowView?.camera.clips.length
      ? nowView.camera
      : null;
  const primaryClip = clipSource?.clips[0] ?? null;

  if (playingClip && clipSource && primaryClip) {
    return (
      <InlineCardClip
        name={name}
        camera={clipSource}
        clip={primaryClip}
        onStop={onStopClip}
        onExpand={(button) =>
          open({ resortId, name, initialMedia: primaryClip.kind }, button)
        }
      />
    );
  }

  if (!activeView) {
    return (
      <div className={styles.noImageBox}>
        <p className={styles.noImage}>Pre-open image unavailable</p>
        {nowView && (
          <button
            type="button"
            className={styles.inlineSwitch}
            onClick={() => onSelectMode("now")}
          >
            Show Now · {clockTime(nowView.camera.capturedAt)}
          </button>
        )}
      </div>
    );
  }

  const stale = isStale(activeView.camera, now);
  const morningStale = morningView ? isStale(morningView.camera, now) : false;
  const nowStale = nowView ? isStale(nowView.camera, now) : false;
  const matchedBand =
    activeView.camera.snowBand?.observationId === activeView.camera.observationId
      ? activeView.camera.snowBand
      : null;
  const band = matchedBand && matchedBand.band !== "uncertain" ? matchedBand : null;

  return (
    <div className={styles.media}>
      <StakePhoto
        key={`${activeView.camera.image.file}-${activeMode}`}
        frame={activeView.camera}
        reference={activeView.camera.clearedReference}
        className={styles.stake}
        onOpen={(button) =>
          open(
            {
              resortId,
              name,
              initialMedia: activeMode === "now" && distinctNow ? "now" : "morning",
            },
            button,
          )
        }
        label={`Enlarge ${name} stake, ${activeView.title}. ${cameraStamp(activeView.camera)}.${band ? ` Snow assessment: ${bandNames[band.band]}.` : ""}`}
      />
      <div className={styles.overlayControls}>
        {morningView && nowView && distinctNow ? (
          <div
            className={styles.stateSwitch}
            role="group"
            aria-label={`${name} camera time`}
          >
            <button
              type="button"
              className={`${styles.stateOption}${morningStale ? ` ${styles.warning}` : ""}`}
              aria-pressed={activeMode === "morning"}
              title={`${morningView.title} · ${cameraStamp(morningView.camera)}${morningStale ? " · Stale" : ""}`}
              onClick={() => onSelectMode("morning")}
            >
              <span>{captionNames[morningView.basis] ?? "Morning"}</span>
              <span className={styles.pillTime}>
                {clockTime(morningView.camera.capturedAt)}
              </span>
            </button>
            <button
              type="button"
              className={`${styles.stateOption}${nowStale ? ` ${styles.warning}` : ""}`}
              aria-pressed={activeMode === "now"}
              title={`Now · ${cameraStamp(nowView.camera)}${nowStale ? " · Stale" : ""}`}
              onClick={() => onSelectMode("now")}
            >
              <span>Now</span>
              <span className={styles.pillTime}>
                {clockTime(nowView.camera.capturedAt)}
              </span>
            </button>
          </div>
        ) : (
          <span
            className={`${styles.caption}${stale ? ` ${styles.warning}` : ""}`}
            title={`${activeView.camera.timeBasis === "unknown" ? "Fetched" : "Captured"} ${stamp(activeView.camera.capturedAt)}`}
          >
            {captionNames[activeView.basis] ?? "Now"} ·{" "}
            {activeView.camera.timeBasis === "unknown" && "Fetched "}
            {clockTime(activeView.camera.capturedAt)}
            {stale ? " · Stale" : ""}
          </span>
        )}
        {band && <span className={styles.band}>{bandNames[band.band]}</span>}
        {primaryClip && (
          <button
            type="button"
            className={`${styles.clipPill} ${styles.clipBottomRight}`}
            aria-label={`Play ${name} timelapse`}
            onClick={() => onPlayClip()}
          >
            <Play size={11} aria-hidden="true" />
            <span>Timelapse</span>
          </button>
        )}
      </div>
    </div>
  );
}

const weatherDay = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" });
const range = (low: number, high: number) => (low === high ? `${low}` : `${low}–${high}`);

function StakeWeather({ resortId, forecast }: { resortId: string; forecast: SkiDay | null }) {
  const day = forecast?.resorts.find((entry) => entry.resortId === resortId);
  if (!forecast || !day) return null;
  return (
    <p className={styles.weather}>
      <time dateTime={forecast.startsAt}>{weatherDay.format(new Date(forecast.startsAt))} 9a–4p MT</time>
      <span>{range(day.lowF, day.highF)}°F</span>
      <span>{day.weather}</span>
      {day.windMph && <span>Wind {range(day.windMph.low, day.windMph.high)} mph</span>}
    </p>
  );
}

export function AvailableStakes({
  morning,
  current,
  now,
  weather,
  mode,
  overrides,
  onCardMode,
  open,
}: {
  morning: Feed;
  current: Feed;
  now: number;
  weather: SkiDay | null;
  mode: CameraMode;
  overrides: Record<string, CameraMode>;
  onCardMode: (resortId: string, next: CameraMode) => void;
  open: (target: OpenCameraTarget, button: HTMLButtonElement) => void;
}) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const ids = new Map<string, { name: string; morning: View | null; now: View | null }>();
  for (const camera of morning.entries) {
    const basis = camera.morning?.basis;
    if (basis && basis !== "unavailable" && !ids.has(camera.stakeId)) {
      ids.set(camera.stakeId, {
        name: camera.name,
        morning: { camera, basis, title: basisNames[basis] },
        now: null,
      });
    }
  }
  for (const camera of current.entries) {
    const existing = ids.get(camera.stakeId);
    const nowView: View = { camera, basis: "now", title: "Now" };
    if (existing) existing.now = nowView;
    else ids.set(camera.stakeId, { name: camera.name, morning: null, now: nowView });
  }
  if (!ids.size) return <p className={viewer.notice}>No camera images available.</p>;
  return (
    <section className={styles.cards} aria-label="Available stake images">
      {[...ids].map(([id, entry]) => {
        const chosen = overrides[id] ?? mode;
        const activeMode: CameraMode =
          chosen === "now" && entry.now
            ? "now"
            : entry.morning
              ? "morning"
              : "now";
        return (
          <article key={id} className={`${styles.card} ${styles.cameraOnly}`}>
            <StakeMedia
              resortId={id}
              name={entry.name}
              morningView={entry.morning}
              nowView={entry.now}
              activeMode={activeMode}
              playingClip={playingId === id}
              onSelectMode={(next) => {
                setPlayingId((prev) => (prev === id ? null : prev));
                onCardMode(id, next);
              }}
              onPlayClip={() => setPlayingId(id)}
              onStopClip={() => setPlayingId(null)}
              open={open}
              now={now}
            />
            <header className={styles.header}>
              <h3>{entry.name}</h3>
            </header>
            <StakeWeather resortId={id} forecast={weather} />
          </article>
        );
      })}
    </section>
  );
}

const valueFitsInBar = 0.55;

function DayButton({
  resort,
  day,
  scale,
  onOpen,
}: {
  resort: ResortConditions;
  day: Day;
  scale: number;
  onOpen: (button: HTMLButtonElement) => void;
}) {
  const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay();
  const tooltip = `${resort.resortId}-tooltip-${day.date}`;
  const snow = day.snow24;
  const inside = snow !== null && snow.min / scale >= valueFitsInBar;
  return (
    <button
      type="button"
      className={`${styles.day}${weekday === 0 || weekday === 6 ? ` ${styles.weekend}` : ""}`}
      data-day={day.date}
      aria-label={`${longDate(day.date)} · ${missingInches(snow)} reported in 24 hours. ${day.stake ? "Open saved morning image." : "No saved morning image."}`}
      aria-describedby={tooltip}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <span className={styles.track} aria-hidden="true">
        {snow ? (
          <span
            className={`${styles.mark}${snow.max === 0 ? ` ${styles.zero}` : ""}${inside ? ` ${styles.inside}` : ""}`}
            style={{ height: `${(snow.max / scale) * 100}%` }}
          >
            <span
              className={styles.fill}
              style={{
                height: `${snow.max ? (snow.min / snow.max) * 100 : 0}%`,
              }}
            />
            {snow.min !== snow.max && <span className={styles.range} />}
            <span
              className={styles.value}
              style={
                inside
                  ? { top: `calc(${(1 - snow.min / snow.max) * 100}% + 1px)` }
                  : undefined
              }
            >
              {inches(snow)}
            </span>
          </span>
        ) : (
          <span className={styles.missing}>—</span>
        )}
      </span>
      <span className={styles.label}>
        {"SMTWTFS"[weekday]} {Number(day.date.slice(-2))}
      </span>
      <span className={styles.tooltip} id={tooltip} role="tooltip">
        <strong>{missingInches(snow)}</strong> · {longDate(day.date)} · reported
        24h
      </span>
    </button>
  );
}

function ResortCard({
  resort,
  morningView,
  nowView,
  activeMode,
  playingClip,
  onSelectMode,
  onPlayClip,
  onStopClip,
  scale,
  now,
  weather,
  open,
  openMore,
  openDay,
}: {
  resort: ResortConditions;
  morningView: View | null;
  nowView: View | null;
  activeMode: CameraMode;
  playingClip: boolean;
  onSelectMode: (next: CameraMode) => void;
  onPlayClip: () => void;
  onStopClip: () => void;
  scale: number;
  now: number;
  weather: SkiDay | null;
  open: (target: OpenCameraTarget, button: HTMLButtonElement) => void;
  openMore: (button: HTMLButtonElement) => void;
  openDay: (day: Day, button: HTMLButtonElement) => void;
}) {
  const name = useRef<HTMLButtonElement>(null);
  const report = reportOf(resort);
  const status = resort.operatingStatus.value;
  const statusLabel = { open: "Open", closed: "Closed", unknown: "" }[status];
  const period = resort.periods[0];
  const today = resort.history.at(-1)!;
  const fresh = report?.overnight ?? null;
  const reportedAt = resort.report.data?.reportedAt ?? null;
  const reportStatus =
    resort.report.status === "stale" && resort.report.data
      ? "Saved report"
      : fresh
        ? "Reported ✓"
        : "Not reported";
  return (
    <article
      className={styles.card}
      data-resort-id={resort.resortId}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, a, video"))
          name.current?.click();
      }}
    >
      <StakeMedia
        resortId={resort.resortId}
        name={resort.name}
        morningView={morningView}
        nowView={nowView}
        activeMode={activeMode}
        playingClip={playingClip}
        onSelectMode={onSelectMode}
        onPlayClip={onPlayClip}
        onStopClip={onStopClip}
        open={open}
        now={now}
      />
      <header className={styles.header}>
        <h3>
          <button
            ref={name}
            type="button"
            className={styles.name}
            aria-haspopup="dialog"
            aria-label={`${resort.name}, more details`}
            onClick={(event) => openMore(event.currentTarget)}
          >
            {resort.name}
          </button>
        </h3>
        <span className={styles.base}>Base {inches(report?.base ?? null)}</span>
        <a
          href={statusPageUrl(resort)}
          target="_blank"
          rel="noreferrer"
          className={`${styles.status} ${styles[status]}`}
          aria-label={`${statusLabel || "Operating status unknown"} · Open ${resort.name} terrain and lift status`}
          title={[
            statusLabel || "Operating status unknown",
            status !== "unknown" &&
              resort.operatingStatus.reportedAt &&
              stamp(resort.operatingStatus.reportedAt),
            "View lifts & trails",
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          <span className={styles.dot} />
          {statusLabel}
          <span className={styles.statusArrow} aria-hidden="true">↗</span>
        </a>
      </header>
      <StakeWeather resortId={resort.resortId} forecast={weather} />
      <section
        className={styles.history}
        aria-label={`${resort.name} six report dates`}
      >
        <div className={styles.timeline}>
          <div className={styles.plot}>
            {period && (
              <div className={styles.period}>
                <span>{period.label}</span>{" "}
                <span
                  className={period.snow24 ? styles.total : styles.incomplete}
                >
                  {period.snow24 ? inches(period.snow24) : "—"}
                </span>
              </div>
            )}
            {resort.history.slice(0, -1).map((day) => (
              <DayButton
                key={day.date}
                resort={resort}
                day={day}
                scale={scale}
                onOpen={(button) => openDay(day, button)}
              />
            ))}
          </div>
          <button
            type="button"
            className={styles.hero}
            aria-label={`${resort.overnightLabel} ${inches(fresh)}. ${reportStatus}. ${stamp(reportedAt)}. ${today.stake ? "Open saved morning image." : "No saved morning image."}`}
            onClick={(event) => openDay(today, event.currentTarget)}
          >
            <span
              className={`${styles.fresh}${fresh ? "" : ` ${styles.muted}`}${inches(fresh).includes("–") ? ` ${styles.range2}` : ""}`}
            >
              {inches(fresh)}
            </span>
            {reportedAt && (
              <time
                dateTime={reportedAt}
                className={
                  resort.report.status !== "current"
                    ? styles.warning
                    : undefined
                }
              >
                {shortStamp(reportedAt, now)}
                {fresh ? " ✓" : ""}
              </time>
            )}
          </button>
        </div>
      </section>
    </article>
  );
}

function Note({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <p className={`${styles.note}${warning ? ` ${styles.warning}` : ""}`}>
      {children}
    </p>
  );
}
function Source({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function MoreDetails({
  resort,
  view,
  latest,
  open,
  now,
}: {
  resort: ResortConditions;
  view: View | null;
  latest: Camera | undefined;
  open: (target: OpenCameraTarget, button: HTMLButtonElement) => void;
  now: number;
}) {
  const report = resort.report.data;
  const snowpack = resort.snowpack.data;
  const operating = resort.operatingStatus;
  const distinctLatest = latest && !isSameCapture(latest, view?.camera);
  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <h4>
            {resort.report.status === "current"
              ? "Resort report"
              : "Saved resort report"}
          </h4>
          <Source href={resort.reportUrl}>Snow report ↗</Source>
        </div>
        {report ? (
          <>
            <dl className={styles.totals}>
              {(
                [
                  [resort.overnightLabel, report.overnight],
                  ["24 hours", report.snow24],
                  ["48 hours", report.snow48],
                  ["7 days", report.snow7],
                  ["Base", report.base],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{inches(value)}</dd>
                </div>
              ))}
            </dl>
            <Note warning={resort.report.status !== "current"}>
              {report.location} · Reported {stamp(report.reportedAt)}
            </Note>
          </>
        ) : (
          <Note warning>No report collected.</Note>
        )}
        {resort.report.error && (
          <Note warning>
            {resort.report.error}. Last attempt{" "}
            {stamp(resort.report.lastAttemptAt)}.
          </Note>
        )}
      </section>
      <section className={styles.section}>
        <h4>Nearby snowpack</h4>
        <Note>
          {snowpack.station.name} · {snowpack.station.triplet} ·{" "}
          {snowpack.station.elevationFeet.toLocaleString("en-US")} ft · about{" "}
          {snowpack.context.distanceMiles} mi from the snow stake.{" "}
          <Source href={snowpack.sourceUrl}>NRCS station ↗</Source>
        </Note>
        <Note>{snowpack.context.caveat}</Note>
        <Note>
          Snow water equivalent (SWE) ·{" "}
          {snowpack.swe
            ? `${snowpack.swe.value} inches of water. Measured ${stamp(snowpack.swe.reportedAt)} · ${snowpack.swe.provider}.`
            : "unavailable."}
        </Note>
        <Note>
          Station snow depth ·{" "}
          {snowpack.stationDepth
            ? `${snowpack.stationDepth.value} inches of snow. Measured ${stamp(snowpack.stationDepth.reportedAt)} · ${snowpack.stationDepth.provider}.`
            : "unavailable."}
        </Note>
        <Note>
          1991–2020 SWE median for this date ·{" "}
          {resort.snowpack.freshness.normal === "current" &&
          snowpack.percentOfNormal !== null
            ? `${snowpack.percentOfNormal}% of median.`
            : "unavailable."}
        </Note>
      </section>
      <section className={styles.section}>
        <table className={styles.table}>
          <caption>Daily reports and saved morning evidence</caption>
          <thead>
            <tr>
              <th scope="col">Report date</th>
              <th scope="col">24h</th>
              <th scope="col">Report time</th>
              <th scope="col">Morning evidence</th>
            </tr>
          </thead>
          <tbody>
            {resort.history.map((day) => (
              <tr key={day.date}>
                <th scope="row">{longDate(day.date)}</th>
                <td>{day.snow24 ? inches(day.snow24) : "—"}</td>
                <td>
                  {day.reportedAt
                    ? stamp(day.reportedAt)
                    : day.snow24 ? "Time unavailable" : "Not reported"}
                </td>
                <td>
                  {day.stake
                    ? `${basisNames[day.stake.basis]} · ${day.stake.timeBasis === "unknown" ? "Fetched" : "Captured"} ${stamp(day.stake.capturedAt)}`
                    : "No saved morning image"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Note>
          The five bars show daily reported 24-hour snow on one shared scale.
          Prev 5 adds the available values. Dashes mark missing reports.
          The box shows reported overnight snow for today.
          Select a date to see its saved morning image, if available.
        </Note>
      </section>
      <section className={styles.section}>
        <h4>Observed facts</h4>
        <Note>{resort.summary.text}</Note>
      </section>
      {view && (
        <section className={styles.section}>
          <h4>Stake</h4>
          <Note warning={isStale(view.camera, now)}>
            {view.title} · {cameraStamp(view.camera)}
          </Note>
          <button
            type="button"
            className={styles.textButton}
            onClick={(event) =>
              open(
                { resortId: resort.resortId, name: resort.name, initialMedia: "morning" },
                event.currentTarget,
              )
            }
          >
            Open camera image and clips
          </button>
          <Note>
            The stake shows snow since its last clearing. Snow can drift against
            the stake. Snow bands are coarse estimates, never inches.
          </Note>
        </section>
      )}
      {distinctLatest && latest && (
        <section className={styles.section}>
          <h4>Now</h4>
          <div className={styles.media}>
            <StakePhoto
              key={latest.image.file}
              frame={latest}
              reference={latest.clearedReference}
              className={styles.stake}
              onOpen={(button) =>
                open(
                  { resortId: resort.resortId, name: resort.name, initialMedia: "now" },
                  button,
                )
              }
              label={`Enlarge ${resort.name} stake, Now. ${cameraStamp(latest)}.`}
            >
              <span
                className={`${styles.caption}${isStale(latest, now) ? ` ${styles.warning}` : ""}`}
                title={`${latest.timeBasis === "unknown" ? "Fetched" : "Captured"} ${stamp(latest.capturedAt)}`}
              >
                Now · {latest.timeBasis === "unknown" && "Fetched "}
                {clockTime(latest.capturedAt)}
                {isStale(latest, now) ? " · Stale" : ""}
              </span>
            </StakePhoto>
          </div>
        </section>
      )}
      <section className={styles.section}>
        <h4>Operating status</h4>
        <Note>
          {operating.value === "unknown" ? (
            "Operating status unknown"
          ) : (
            <>
              Reported {operating.value}
              {operating.reportedAt && ` · ${stamp(operating.reportedAt)}`}
              {operating.field && ` · ${operating.field}`}
              {" · "}
              <Source href={statusPageUrl(resort)}>Lifts & terrain ↗</Source>
            </>
          )}
        </Note>
      </section>
      <section className={styles.section}>
        <h4>Season</h4>
        <Note>
          {{ open: "Open for season", "not-yet-open": "Not open yet", closed: "Season closed" }[resort.season.status] ?? "Season status unknown"}
          {" · Checked "}{stamp(resort.season.checkedAt)}
          {" · "}<Source href={resort.season.source}>Season source ↗</Source>
        </Note>
      </section>
    </>
  );
}

function DayDetails({ resort, day, reference }: { resort: ResortConditions; day: Day; reference?: Camera["clearedReference"] }) {
  const stake = day.stake;
  const archive = day.snow24Source;
  const reportedAt = archive ? archive.reportedAt : day.reportedAt;
  return (
    <>
      <Note>
        24h reported snow {missingInches(day.snow24)} ·{" "}
        {reportedAt ? `Reported ${stamp(reportedAt)}` : "Report time unavailable"}
        {archive && <> · <Source href={archive.url}>{archive.name} ↗</Source></>}
      </Note>
      {stake ? (
        <>
          <Note>
            {basisNames[stake.basis]} ·{" "}
            {stake.timeBasis === "unknown" ? "Fetched" : "Captured"}{" "}
            {stamp(stake.capturedAt)}
          </Note>
          <Note>
            {stake.clearing
              ? `Clearing observed between ${stamp(stake.clearing.from)} and ${stamp(stake.clearing.to)}${stake.clearing.timeBasis === "fetch" ? " (fetch times; camera time unknown)" : ""}.`
              : "No verified clearing interval saved with this image."}
          </Note>
          {reference && <Note>Hold the image for the clear reference.</Note>}
          <StakePhoto
            className={styles.original}
            frame={stake}
            reference={reference}
            label={`${resort.name} saved morning stake, ${stamp(stake.capturedAt)}`}
            unavailable="The saved image file is unavailable. This date has no replacement image."
          />
        </>
      ) : (
        <Note warning>
          No saved morning image is available for this report date.
        </Note>
      )}
    </>
  );
}

export function ResortCards({
  conditions,
  morning,
  current,
  now,
  weather,
  mode,
  filters,
  onResetFilters,
  overrides,
  onCardMode,
  open,
}: {
  conditions: Conditions;
  morning: Feed;
  current: Feed;
  now: number;
  weather: SkiDay | null;
  mode: CameraMode;
  filters: ResortFilters;
  onResetFilters: () => void;
  overrides: Record<string, CameraMode>;
  onCardMode: (resortId: string, next: CameraMode) => void;
  open: (target: OpenCameraTarget, button: HTMLButtonElement) => void;
}) {
  const [dialog, setDialog] = useState<{
    resortId: string;
    date: string | null;
  } | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const dialogResort = conditions.entries.find(
    (resort) => resort.resortId === dialog?.resortId,
  );
  const dialogDay = dialogResort?.history.find(
    (day) => day.date === dialog?.date,
  );
  const dialogOpen = !!dialogResort && (dialog?.date === null || !!dialogDay);
  const reference = current.entries.find((camera) => camera.cameraId === dialogResort?.resortId)?.clearedReference
    ?? morning.entries.find((camera) => camera.cameraId === dialogResort?.resortId)?.clearedReference;
  const order = morning.entries.map((entry) => entry.cameraId);
  const position = (id: string) =>
    order.includes(id) ? order.indexOf(id) : 99;
  const rank = (resort: ResortConditions) =>
    reportOf(resort)?.overnight?.max ?? -1;
  const week = (resort: ResortConditions) => reportOf(resort)?.snow7?.max ?? -1;
  const sortedResorts = [...conditions.entries].sort(
    (a, b) =>
      Number(a.operatingStatus.value !== "open") -
        Number(b.operatingStatus.value !== "open") ||
      rank(b) - rank(a) ||
      week(b) - week(a) ||
      position(a.resortId) - position(b.resortId),
  );
  const visibleResorts = sortedResorts.filter((resort) => {
    if (filters.pass !== "all" && RESORT_PASSES[resort.resortId] !== filters.pass) {
      return false;
    }
    if (filters.openOnly && resort.operatingStatus.value !== "open") {
      return false;
    }
    if (filters.newSnowOnly && !hasNewSnow(resort, leadView(resort, morning))) {
      return false;
    }
    return true;
  });
  const scale = Math.max(
    6,
    Math.ceil(
      Math.max(
        0,
        ...conditions.entries.flatMap((resort) =>
          resort.history.slice(0, -1).map((day) => day.snow24?.max ?? 0),
        ),
      ),
    ),
  );
  const show = (
    resort: ResortConditions,
    day: Day | null,
    button: HTMLButtonElement,
  ) => {
    returnFocus.current = button;
    setDialog({ resortId: resort.resortId, date: day?.date ?? null });
  };
  const openCamera = (target: OpenCameraTarget, button: HTMLButtonElement) => {
    setDialog(null);
    setPlayingId(null);
    open(target, returnFocus.current ?? button);
  };
  return (
    <>
      {conditions.issue && (
        <p className={viewer.notice} role="status">{conditions.issue}</p>
      )}
      {visibleResorts.length === 0 ? (
        <div className={styles.emptyFilter} role="status">
          <p>No resorts match the selected filters.</p>
          <button
            type="button"
            className={styles.textButton}
            onClick={onResetFilters}
          >
            Show all resorts
          </button>
        </div>
      ) : (
        <div className={styles.cards} data-scale={scale}>
          {visibleResorts.map((resort) => {
            const morningView = leadView(resort, morning);
            const nowView = currentView(resort.resortId, current);
            const chosen = overrides[resort.resortId] ?? mode;
            const activeMode: CameraMode =
              chosen === "now" && nowView ? "now" : "morning";
            return (
              <ResortCard
                key={resort.resortId}
                resort={resort}
                morningView={morningView}
                nowView={nowView}
                activeMode={activeMode}
                playingClip={playingId === resort.resortId}
                onSelectMode={(next) => {
                  setPlayingId((prev) => (prev === resort.resortId ? null : prev));
                  onCardMode(resort.resortId, next);
                }}
                onPlayClip={() => setPlayingId(resort.resortId)}
                onStopClip={() => setPlayingId(null)}
                scale={scale}
                now={now}
                weather={weather}
                open={(target, button) => {
                  setPlayingId(null);
                  open(target, button);
                }}
                openMore={(button) => show(resort, null, button)}
                openDay={(day, button) => show(resort, day, button)}
              />
            );
          })}
        </div>
      )}
      <Dialog
        open={dialogOpen}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        {dialogOpen && dialogResort && (
          <DialogContent
            className={`${viewer.viewer} ${styles.dialog}`}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocus.current?.focus();
            }}
          >
            <header className={viewer.viewerHeader}>
              <DialogTitle>
                {dialogDay
                  ? `${dialogResort.name} · ${longDate(dialogDay.date)}`
                  : dialogResort.name}
              </DialogTitle>
              <DialogDescription>
                {dialogDay
                  ? "Daily report and saved morning image"
                  : "Report, snowpack and sources"}
              </DialogDescription>
            </header>
            {dialogDay ? (
              <DayDetails
                key={`${dialogResort.resortId}-${dialogDay.date}-${dialogDay.stake?.image.file}`}
                resort={dialogResort}
                day={dialogDay}
                reference={reference}
              />
            ) : (
              <MoreDetails
                resort={dialogResort}
                view={leadView(dialogResort, morning)}
                latest={resortCamera(dialogResort.resortId, current)}
                open={openCamera}
                now={now}
              />
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
