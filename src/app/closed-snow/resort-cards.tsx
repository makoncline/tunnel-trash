"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  ExternalLink,
  Maximize2,
  Minus,
  Play,
  Square,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  assetUrl,
  freshSnowRank,
  isSameCapture,
  loadTimeline,
  matchingSnowBand,
  reportStake,
  stakeContradictsReport,
  stakeShowsUnreportedSnow,
  type Camera,
  type Clip,
  type ClipTimeline,
  type Conditions,
  type Depth,
  type Feed,
  type ResortConditions,
} from "@/lib/closed-snow";
import type { RecordAnalyticsAction } from "@/lib/closed-snow-analytics";
import {
  cleanSurfaceCondition,
  driveSeverity,
  driveTrendLabel,
  driveTrendLevel,
  formatDelayMinutes,
  formatDriveMinutes,
  isMajorRoadAlert,
  shortAlertLocation,
  surfaceLabel,
  type DriveInfo,
  type DriveTrendLevel,
  type ResortRoadEntry,
  type RoadsFeed,
} from "@/lib/closed-snow-roads";
import type { SkiDay } from "@/lib/closed-snow-weather";
import viewer from "./snow.module.css";
import styles from "./resort-cards.module.css";
import { StakePhoto } from "./stake-photo";

export type CameraMode = "morning" | "now";
export type PassFilter = "all" | "epic" | "ikon";
export type SortBy = "fresh" | "week" | "base" | "drive";
export type ResortFilters = {
  pass: PassFilter;
  openOnly: boolean;
  newSnowOnly: boolean;
  sortBy: SortBy;
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
  steamboat: "ikon",
};

const RESORT_DESTINATIONS: Record<string, string> = {
  vail: "Vail Ski Resort, Vail, CO",
  "beaver-creek": "Beaver Creek Resort, Avon, CO",
  breckenridge: "Breckenridge Ski Resort, Breckenridge, CO",
  keystone: "Keystone Resort, Keystone, CO",
  copper: "Copper Mountain Resort, Frisco, CO",
  "arapahoe-basin": "Arapahoe Basin Ski Area, Dillon, CO",
  loveland: "Loveland Ski Area, Georgetown, CO",
  "winter-park": "Winter Park Resort, Winter Park, CO",
  eldora: "Eldora Mountain Resort, Nederland, CO",
  steamboat: "Steamboat Ski Resort, Steamboat Springs, CO",
};

function appleMapsUrl(resortId: string, name: string): string {
  const destination = RESORT_DESTINATIONS[resortId] ?? `${name} Ski Resort, CO`;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`;
}
function googleMapsUrl(resortId: string, name: string): string {
  const destination = RESORT_DESTINATIONS[resortId] ?? `${name} Ski Resort, CO`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

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
function freshSnowOf(resort: ResortConditions): Depth | null {
  const report = reportOf(resort);
  return report?.overnight ?? report?.snow24 ?? null;
}
function freshLabelOf(resort: ResortConditions): string {
  const report = reportOf(resort);
  if (report?.overnight) return resort.overnightLabel;
  if (report?.snow24) return "24 hr";
  return resort.overnightLabel;
}
function hasNewSnow(resort: ResortConditions, morningView: View | null): boolean {
  const fresh = freshSnowOf(resort);
  const verdictStake = reportStake(resort, morningView?.camera);
  if (stakeContradictsReport(fresh, verdictStake)) return false;
  if (fresh) return fresh.max > 0;
  const band = matchingSnowBand(morningView?.camera)?.band;
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

function pickDefaultClip(morning: Camera | null | undefined, now: Camera | null | undefined) {
  const all: { camera: Camera; clip: Clip }[] = [];
  const seen = new Set<string>();
  for (const source of [morning, now]) {
    if (!source) continue;
    for (const clip of source.clips) {
      if (seen.has(clip.kind)) continue;
      seen.add(clip.kind);
      all.push({ camera: source, clip });
    }
  }
  const preference: Clip["kind"][] = [
    "close-to-open",
    "until-opening",
    "until-clearing",
    "last-24h",
    "last-48h",
    "last-72h",
  ];
  for (const kind of preference) {
    const match = all.find((item) => item.clip.kind === kind);
    if (match) return match;
  }
  return all[0] ?? null;
}

function StakeMedia({
  resortId,
  name,
  morningView,
  nowView,
  activeMode,
  playingClip,
  showHoldHint = false,
  onSelectMode,
  onPlayClip,
  onStopClip,
  open,
  now,
  recordAction,
}: {
  resortId: string;
  name: string;
  morningView: View | null;
  nowView: View | null;
  activeMode: CameraMode;
  playingClip: boolean;
  showHoldHint?: boolean;
  onSelectMode: (next: CameraMode) => void;
  onPlayClip: () => void;
  onStopClip: () => void;
  open: (target: OpenCameraTarget, button: HTMLButtonElement) => void;
  now: number;
  recordAction: RecordAnalyticsAction;
}) {
  const distinctNow =
    !!nowView && (!morningView || !isSameCapture(morningView.camera, nowView.camera));
  const activeView = activeMode === "now" ? nowView : morningView;
  const defaultClip = pickDefaultClip(morningView?.camera, nowView?.camera);
  const clipSource = defaultClip?.camera ?? null;
  const primaryClip = defaultClip?.clip ?? null;

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
  const matchedBand = matchingSnowBand(activeView.camera);
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
        {showHoldHint && activeView.camera.clearedReference && (
          <span className={styles.holdHint} aria-hidden="true">
            Hold for clear
          </span>
        )}
        {primaryClip && (
          <button
            type="button"
            className={`${styles.clipPill} ${styles.clipBottomRight}`}
            aria-label={`Play ${name} timelapse`}
            onClick={() => {
              recordAction("clip_play", `${resortId}:${primaryClip.kind}`);
              onPlayClip();
            }}
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

function DriveTrendIcon({
  level,
  size = 12,
}: {
  level: DriveTrendLevel;
  size?: number;
}) {
  const toneClass =
    level === "rising-fast"
      ? styles.trendRisingFast
      : level === "rising"
        ? styles.trendRising
        : level === "steady"
          ? styles.trendSteady
          : styles.trendFalling;
  const className = `${styles.driveTrend} ${toneClass}`;
  switch (level) {
    case "rising-fast":
      return <ChevronsUp size={size} className={className} aria-hidden="true" />;
    case "rising":
      return <ChevronUp size={size} className={className} aria-hidden="true" />;
    case "steady":
      return <Minus size={size - 1} className={className} aria-hidden="true" />;
    case "falling":
      return <ChevronDown size={size} className={className} aria-hidden="true" />;
    case "falling-fast":
      return <ChevronsDown size={size} className={className} aria-hidden="true" />;
  }
}

function StakeWeather({
  resortId,
  name,
  forecast,
  roadEntry,
  originName,
  now,
  onOpenDetails,
  recordAction,
}: {
  resortId: string;
  name: string;
  forecast: SkiDay | null;
  roadEntry: ResortRoadEntry | null;
  originName: string;
  now: number;
  onOpenDetails?: (button: HTMLButtonElement) => void;
  recordAction: RecordAnalyticsAction;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const day = forecast?.resorts.find((entry) => entry.resortId === resortId);
  const weekday = forecast ? weatherDay.format(new Date(forecast.startsAt)) : null;
  const drive = roadEntry?.drive ?? null;
  const road = roadEntry?.road ?? null;
  const hasDriveDetails =
    drive !== null ||
    (road !== null && (road.surface !== "unknown" || road.alerts.length > 0));
  const severity = driveSeverity(roadEntry);
  const hasMajorAlert = road?.alerts.some(isMajorRoadAlert) ?? false;
  const delayText = drive ? formatDelayMinutes(drive.delaySeconds) : null;
  const trendLevel = drive ? driveTrendLevel(drive.trend30mSeconds) : null;
  const surface = road ? surfaceLabel(road.surface) : null;
  const roadTags = [
    road?.closed ? "Road closed" : null,
    road?.chainLaw ? "Chain law" : null,
    road?.tractionLaw ? "Traction law" : null,
    !road?.closed && surface && surface !== "Dry" ? surface : null,
  ].filter(Boolean);
  const pillClass = [
    styles.driveLink,
    drive || road?.closed ? styles.drivePill : "",
    severity === "warn" ? styles.driveWarn : "",
    severity === "severe" ? styles.driveSevere : "",
  ]
    .filter(Boolean)
    .join(" ");
  const driveSummary = [
    drive ? `${formatDriveMinutes(drive.travelSeconds)} from ${originName}` : null,
    delayText ? `${delayText} delay` : null,
    trendLevel ? driveTrendLabel(trendLevel) : null,
    ...roadTags,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={styles.weatherRow}>
      {forecast && day && weekday ? (
        <p className={styles.weather}>
          <time dateTime={forecast.startsAt} title={`${weekday} ski hours (9 AM–4 PM MT)`}>
            {weekday}
          </time>
          <span>{range(day.lowF, day.highF)}°F</span>
          <span>{day.weather}</span>
          {day.windMph && <span>Wind {range(day.windMph.low, day.windMph.high)} mph</span>}
        </p>
      ) : (
        <span />
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className={pillClass}
            aria-label={
              driveSummary
                ? `Driving directions to ${name} (${driveSummary})`
                : `Driving directions to ${name}`
            }
            title={driveSummary ? `${driveSummary} · Open directions` : `Directions to ${name}`}
          >
            <Car size={13} aria-hidden="true" />
            {road?.closed ? (
              <span className={styles.driveTime}>Closed</span>
            ) : (
              drive && (
                <>
                  <span className={styles.driveTime}>
                    {formatDriveMinutes(drive.travelSeconds)}
                  </span>
                  {delayText && <span className={styles.driveDelay}>{delayText}</span>}
                  {trendLevel && <DriveTrendIcon level={trendLevel} />}
                </>
              )
            )}
            {road && !road.closed && hasMajorAlert && (
              <AlertTriangle size={11} className={styles.driveAlertIcon} aria-hidden="true" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className={styles.driveMenu}
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel className={styles.driveMenuLabel}>
            Directions · {name}
          </DropdownMenuLabel>
          {(drive !== null || roadTags.length > 0) && (
            <div className={styles.driveMenuMeta}>
              {drive && (
                <span>
                  From {originName}: {formatDriveMinutes(drive.travelSeconds)}
                  {delayText ? ` (${delayText})` : ""}
                  {trendLevel ? ` · ${driveTrendLabel(trendLevel)}` : ""} · {shortStamp(drive.capturedAt, now)}
                </span>
              )}
              {roadTags.length > 0 && <span>{roadTags.join(" · ")}</span>}
            </div>
          )}
          {onOpenDetails && hasDriveDetails && (
            <DropdownMenuItem
              className={styles.driveMenuItem}
              onSelect={() => {
                if (triggerRef.current) onOpenDetails(triggerRef.current);
              }}
            >
              <span>Traffic trend &amp; alerts</span>
              <ChevronRight size={13} aria-hidden="true" />
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild className={styles.driveMenuItem}>
            <a
              href={appleMapsUrl(resortId, name)}
              target="_blank"
              rel="noreferrer"
              onClick={() => recordAction("directions_click", `${resortId}:apple`)}
            >
              <span>Apple Maps</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={styles.driveMenuItem}>
            <a
              href={googleMapsUrl(resortId, name)}
              target="_blank"
              rel="noreferrer"
              onClick={() => recordAction("directions_click", `${resortId}:google`)}
            >
              <span>Google Maps</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </DropdownMenuItem>
          {road && road.alerts.length > 0 && (
            <DropdownMenuItem asChild className={styles.driveMenuItem}>
              <a
                href="https://maps.cotrip.org/"
                target="_blank"
                rel="noreferrer"
                onClick={() => recordAction("directions_click", `${resortId}:cotrip`)}
              >
                <span>COtrip alerts ({road.alerts.length})</span>
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AvailableStakes({
  morning,
  current,
  now,
  weather,
  roads,
  mode,
  overrides,
  onCardMode,
  open,
  recordAction,
}: {
  morning: Feed;
  current: Feed;
  now: number;
  weather: SkiDay | null;
  roads: RoadsFeed | null;
  mode: CameraMode;
  overrides: Record<string, CameraMode>;
  onCardMode: (resortId: string, next: CameraMode) => void;
  open: (target: OpenCameraTarget, button: HTMLButtonElement) => void;
  recordAction: RecordAnalyticsAction;
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
              recordAction={recordAction}
            />
            <header className={styles.header}>
              <h3>{entry.name}</h3>
            </header>
            <StakeWeather
              resortId={id}
              name={entry.name}
              forecast={weather}
              roadEntry={roads?.resorts.find((r) => r.resortId === id) ?? null}
              originName={roads?.origin.name ?? "Denver"}
              now={now}
              recordAction={recordAction}
            />
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
  const bare = stakeContradictsReport(snow, day.stake ?? undefined);
  const inside = !bare && snow !== null && snow.min / scale >= valueFitsInBar;
  return (
    <button
      type="button"
      className={`${styles.day}${weekday === 0 || weekday === 6 ? ` ${styles.weekend}` : ""}`}
      data-day={day.date}
      aria-label={`${longDate(day.date)} · ${missingInches(snow)} reported in 24 hours${bare ? " (stake looked bare)" : ""}. ${day.stake ? "Open saved morning image." : "No saved morning image."}`}
      aria-describedby={tooltip}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <span className={styles.track} aria-hidden="true">
        {snow ? (
          <span
            className={`${styles.mark}${snow.max === 0 ? ` ${styles.zero}` : ""}${bare ? ` ${styles.contradictedBar}` : ""}${inside ? ` ${styles.inside}` : ""}`}
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
        24h{bare ? " · stake looked bare" : ""}
      </span>
    </button>
  );
}

const formatPeriodLabel = (label: string) =>
  label.replace(/^prev\s+(\d+)$/i, "Prior $1 days");

function ResortCard({
  resort,
  morningView,
  nowView,
  activeMode,
  playingClip,
  showHoldHint = false,
  onSelectMode,
  onPlayClip,
  onStopClip,
  scale,
  now,
  weather,
  roadEntry,
  originName,
  open,
  openMore,
  openDay,
  recordAction,
}: {
  resort: ResortConditions;
  morningView: View | null;
  nowView: View | null;
  activeMode: CameraMode;
  playingClip: boolean;
  showHoldHint?: boolean;
  onSelectMode: (next: CameraMode) => void;
  onPlayClip: () => void;
  onStopClip: () => void;
  scale: number;
  now: number;
  weather: SkiDay | null;
  roadEntry: ResortRoadEntry | null;
  originName: string;
  open: (target: OpenCameraTarget, button: HTMLButtonElement) => void;
  openMore: (button: HTMLButtonElement) => void;
  openDay: (day: Day, button: HTMLButtonElement) => void;
  recordAction: RecordAnalyticsAction;
}) {
  const name = useRef<HTMLButtonElement>(null);
  const report = reportOf(resort);
  const status = resort.operatingStatus.value;
  const statusLabel = { open: "Open", closed: "Closed", unknown: "" }[status];
  const lifts = resort.operatingStatus.lifts;
  const liftBadge =
    status === "open" && lifts && lifts.open > 0
      ? `${lifts.open}/${lifts.total} lifts`
      : null;
  const period = resort.periods[0];
  const today = resort.history.at(-1)!;
  const fresh = freshSnowOf(resort);
  const freshLabel = freshLabelOf(resort);
  const verdictStake = reportStake(resort, morningView?.camera);
  const stakeBare = stakeContradictsReport(fresh, verdictStake);
  const stakeSnow = stakeShowsUnreportedSnow(fresh, verdictStake);
  const reportedAt = resort.report.data?.reportedAt ?? null;
  const reportStatus =
    resort.report.status === "stale" && resort.report.data
      ? "Saved report"
      : stakeBare
        ? "Reported, stake looks bare"
        : stakeSnow
          ? "Reported 0″, snow on stake"
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
        showHoldHint={showHoldHint}
        onSelectMode={onSelectMode}
        onPlayClip={onPlayClip}
        onStopClip={onStopClip}
        open={open}
        now={now}
        recordAction={recordAction}
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
          <span>
            {statusLabel}
            {liftBadge ? ` · ${liftBadge}` : ""}
          </span>
          <span className={styles.statusArrow} aria-hidden="true">↗</span>
        </a>
      </header>
      <StakeWeather
        resortId={resort.resortId}
        name={resort.name}
        forecast={weather}
        roadEntry={roadEntry}
        originName={originName}
        now={now}
        onOpenDetails={openMore}
        recordAction={recordAction}
      />
      <section
        className={styles.history}
        aria-label={`${resort.name} six report dates`}
      >
        <div className={styles.timeline}>
          <div className={styles.plot}>
            {period && (
              <div className={styles.period}>
                <span>{formatPeriodLabel(period.label)}</span>{" "}
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
            aria-label={`${freshLabel} ${inches(fresh)}. ${reportStatus}. ${stamp(reportedAt)}. ${today.stake ? "Open saved morning image." : "No saved morning image."}`}
            onClick={(event) => openDay(today, event.currentTarget)}
          >
            <span
              className={`${styles.fresh}${fresh ? "" : ` ${styles.muted}`}${stakeBare ? ` ${styles.contradicted}` : ""}${inches(fresh).includes("–") ? ` ${styles.range2}` : ""}`}
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
                {fresh && !stakeBare && !stakeSnow ? " ✓" : ""}
              </time>
            )}
            {stakeBare && <span className={styles.bareNote}>Stake bare</span>}
            {stakeSnow && <span className={styles.snowNote}>Snow on stake</span>}
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

const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});
const dayName = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`));
const shortWindow = (label: string) => {
  const hours = /\((\d+) hr\)/.exec(label)?.[1];
  return hours ? `${hours}h` : "Overnight";
};

function statusLine(resort: ResortConditions, now: number) {
  const operating = resort.operatingStatus;
  if (operating.value === "unknown") return "Lift status unknown";
  return [
    operating.value === "open" ? "Open" : "Closed",
    operating.lifts && `${operating.lifts.open}/${operating.lifts.total} lifts`,
    operating.trails && `${operating.trails.open}/${operating.trails.total} trails`,
    operating.reportedAt && shortStamp(operating.reportedAt, now),
  ].filter(Boolean).join(" · ");
}

function DriveSparkline({ drive }: { drive: DriveInfo }) {
  const samples = drive.samples;
  if (samples.length < 2) return null;
  const width = 280;
  const height = 56;
  const padX = 4;
  const padY = 6;
  const values = [...samples.map((s) => s.travelSeconds), drive.baselineSeconds];
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values, minVal + 300);
  const times = samples.map((s) => Date.parse(s.at));
  const minT = Math.min(...times);
  const maxT = Math.max(...times, minT + 60_000);
  const xOf = (t: number) =>
    padX + ((t - minT) / (maxT - minT)) * (width - padX * 2);
  const yOf = (v: number) =>
    height - padY - ((v - minVal) / (maxVal - minVal)) * (height - padY * 2);
  const points = samples
    .map((sample) => `${xOf(Date.parse(sample.at)).toFixed(1)},${yOf(sample.travelSeconds).toFixed(1)}`)
    .join(" ");
  const baselineY = yOf(drive.baselineSeconds);
  const last = samples.at(-1)!;
  return (
    <div className={styles.sparkWrap}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.sparkSvg}
        role="img"
        aria-label={`Drive time trend from ${clockTime(samples[0]!.at)} to ${clockTime(last.at)}`}
      >
        <line
          x1={padX}
          x2={width - padX}
          y1={baselineY}
          y2={baselineY}
          className={styles.sparkBaseline}
        />
        <polyline points={points} className={styles.sparkLine} />
        <circle
          cx={xOf(Date.parse(last.at))}
          cy={yOf(last.travelSeconds)}
          r={3}
          className={styles.sparkDot}
        />
      </svg>
      <div className={styles.sparkLabels}>
        <span>{clockTime(samples[0]!.at)}</span>
        <span>Normal {formatDriveMinutes(drive.baselineSeconds)}</span>
        <span>{clockTime(last.at)}</span>
      </div>
    </div>
  );
}

function MoreDetails({
  resort,
  roadEntry,
  originName,
  now,
  openDay,
  recordAction,
}: {
  resort: ResortConditions;
  roadEntry: ResortRoadEntry | null;
  originName: string;
  now: number;
  openDay: (day: Day) => void;
  recordAction: RecordAnalyticsAction;
}) {
  const report = resort.report.data;
  const saved = resort.report.status !== "current";
  const snowpack = resort.snowpack.data;
  const percent =
    resort.snowpack.freshness.normal === "current" ? snowpack.percentOfNormal : null;
  const measuredAt = snowpack.swe?.reportedAt ?? snowpack.stationDepth?.reportedAt ?? null;
  const statusUrl = statusPageUrl(resort);
  const drive = roadEntry?.drive ?? null;
  const road = roadEntry?.road ?? null;
  const delayText = drive ? formatDelayMinutes(drive.delaySeconds) : null;
  const surface = road ? surfaceLabel(road.surface) : null;
  const cleanedCondition = cleanSurfaceCondition(road?.worstCondition ?? null);
  const trendLevel = drive ? driveTrendLevel(drive.trend30mSeconds) : null;
  const trendMinutes =
    drive?.trend30mSeconds !== null && drive?.trend30mSeconds !== undefined
      ? Math.round(drive.trend30mSeconds / 60)
      : null;
  const detailAlerts = (() => {
    if (!road?.alerts.length) return [];
    const seen = new Set<string>();
    return road.alerts.flatMap((alert) => {
      const location = shortAlertLocation(alert.summary);
      const dedupeKey = `${alert.route}|${alert.title}|${location ?? ""}`;
      if (seen.has(dedupeKey)) return [];
      seen.add(dedupeKey);
      return [{ ...alert, location }];
    });
  })();
  return (
    <>
      <nav className={styles.actions} aria-label={`${resort.name} links`}>
        <a href={resort.reportUrl} target="_blank" rel="noreferrer">Snow report ↗</a>
        {statusUrl !== resort.reportUrl && (
          <a href={statusUrl} target="_blank" rel="noreferrer">Lifts & trails ↗</a>
        )}
        <a
          href={appleMapsUrl(resort.resortId, resort.name)}
          target="_blank"
          rel="noreferrer"
          onClick={() => recordAction("directions_click", `${resort.resortId}:apple`)}
        >
          Apple Maps ↗
        </a>
        <a
          href={googleMapsUrl(resort.resortId, resort.name)}
          target="_blank"
          rel="noreferrer"
          onClick={() => recordAction("directions_click", `${resort.resortId}:google`)}
        >
          Google Maps ↗
        </a>
      </nav>
      <section className={styles.section} aria-label="Resort report">
        {report ? (
          <>
            <dl className={styles.totals}>
              {(
                [
                  [shortWindow(resort.overnightLabel), resort.overnightLabel, report.overnight],
                  ["24h", "24 hours", report.snow24],
                  ["48h", "48 hours", report.snow48],
                  ["7d", "7 days", report.snow7],
                  ["Base", "Base depth", report.base],
                ] as const
              ).map(([label, full, value]) => (
                <div key={full}>
                  <dt title={full}>{label}</dt>
                  <dd>{inches(value)}</dd>
                </div>
              ))}
            </dl>
            <Note warning={saved}>
              {saved ? "Saved report · " : ""}
              {report.reportedAt ? `Reported ${shortStamp(report.reportedAt, now)}` : "Report time not supplied"}
            </Note>
          </>
        ) : (
          <Note warning>No resort report yet today.</Note>
        )}
        {resort.report.error && <Note warning>{resort.report.error}</Note>}
      </section>
      {(drive !== null || (road !== null && (road.surface !== "unknown" || road.alerts.length > 0))) && (
        <section className={styles.section} aria-label="Drive and road conditions">
          <div className={styles.sectionHeading}>
            <h4>Drive & roads</h4>
            <a
              href="https://maps.cotrip.org/"
              target="_blank"
              rel="noreferrer"
              onClick={() => recordAction("directions_click", `${resort.resortId}:cotrip`)}
            >
              COtrip ↗
            </a>
          </div>
          {drive && (
            <div className={styles.driveHeadline}>
              <strong>{formatDriveMinutes(drive.travelSeconds)}</strong>
              <span className={styles.muted}>from {originName}</span>
              {delayText && (
                <span
                  className={
                    drive.delaySeconds >= 1800 ? styles.roadChipSevere : styles.roadChipWarn
                  }
                >
                  {delayText} traffic
                </span>
              )}
              {trendLevel && (
                <span className={styles.roadChip}>
                  <DriveTrendIcon level={trendLevel} size={13} />
                  <span>
                    {driveTrendLabel(trendLevel)}
                    {trendMinutes !== null && trendMinutes !== 0
                      ? ` (${trendMinutes > 0 ? `+${trendMinutes}` : trendMinutes}m/30m)`
                      : ""}
                  </span>
                </span>
              )}
            </div>
          )}
          {drive && <DriveSparkline drive={drive} />}
          {drive && drive.samples.length < 2 && (
            <Note>
              Normal {formatDriveMinutes(drive.baselineSeconds)} · Updated {shortStamp(drive.capturedAt, now)}
            </Note>
          )}
          {road && (
            <div className={styles.roadBadges}>
              {road.closed && <span className={styles.roadChipSevere}>Road closed</span>}
              {road.chainLaw && <span className={styles.roadChipWarn}>Chain law</span>}
              {road.tractionLaw && <span className={styles.roadChipWarn}>Traction law</span>}
              {surface && !road.closed && (
                <span
                  className={
                    road.surface === "icy" || road.surface === "snow"
                      ? styles.roadChipWarn
                      : styles.roadChip
                  }
                >
                  {surface}
                </span>
              )}
            </div>
          )}
          {cleanedCondition && road?.worstSegment && (
            <Note>
              {road.worstSegment}: {cleanedCondition}
            </Note>
          )}
          {detailAlerts.length > 0 && (
            <ul className={styles.detailAlerts}>
              {detailAlerts.map((alert) => (
                <li key={alert.id}>
                  <strong>{alert.route}</strong> · {alert.title}
                  {alert.location && (
                    <span className={styles.detailAlertLoc}> — {alert.location}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className={styles.section}>
        <h4>Daily 24h snow</h4>
        <ul className={styles.dayList}>
          {[...resort.history].reverse().map((day) => {
            const bare = stakeContradictsReport(day.snow24, day.stake ?? undefined);
            return (
              <li key={day.date}>
                <button
                  type="button"
                  className={styles.dayRow}
                  aria-label={`${longDate(day.date)}: ${missingInches(day.snow24)} reported${bare ? " (stake looked bare)" : ""}. ${day.stake ? "Open saved stake image." : "No saved stake image."}`}
                  onClick={() => openDay(day)}
                >
                  <span>{dayName(day.date)}</span>
                  <strong
                    className={
                      bare
                        ? styles.contradicted
                        : day.snow24
                          ? undefined
                          : styles.muted
                    }
                  >
                    {day.snow24 ? inches(day.snow24) : "—"}
                  </strong>
                  <span className={styles.muted}>
                    {day.stake
                      ? `${captionNames[day.stake.basis] ?? "Stake"} ${clockTime(day.stake.capturedAt)}${bare ? " · Stake bare" : ""}`
                      : "No image"}
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <details className={styles.sources}>
        <summary>
          <ChevronRight aria-hidden="true" /> Snowpack & sources
        </summary>
        <Note>
          {snowpack.station.name} · {snowpack.station.elevationFeet.toLocaleString("en-US")} ft ·
          about {snowpack.context.distanceMiles} mi away
        </Note>
        <Note>
          Snow water {snowpack.swe ? `${snowpack.swe.value}″` : "—"}
          {percent !== null && ` (${Math.round(percent)}% of the 1991–2020 median for this date)`}
          {" · "}Depth {snowpack.stationDepth ? `${snowpack.stationDepth.value}″` : "—"}
          {measuredAt && ` · ${shortStamp(measuredAt, now)}`}
        </Note>
        <Note>{snowpack.context.caveat}</Note>
        <Note>
          <Source href={snowpack.sourceUrl}>NRCS station ↗</Source>
          {" · "}
          {{ open: "Open for season", "not-yet-open": "Not open yet", closed: "Season closed" }[resort.season.status] ?? "Season status unknown"}
          {" · "}
          <Source href={resort.season.source}>Season source ↗</Source>
        </Note>
      </details>
    </>
  );
}

function DayDetails({
  resort,
  day,
  reference,
  now,
  onBack,
}: {
  resort: ResortConditions;
  day: Day;
  reference?: Camera["clearedReference"];
  now: number;
  onBack?: () => void;
}) {
  const stake = day.stake;
  const archive = day.snow24Source;
  const reportedAt = archive ? archive.reportedAt : day.reportedAt;
  return (
    <>
      {onBack && (
        <nav>
          <button type="button" className={styles.back} onClick={onBack}>
            <ChevronLeft aria-hidden="true" /> {resort.name}
          </button>
        </nav>
      )}
      <Note>
        {day.snow24 ? `${inches(day.snow24)} reported in 24h` : "No 24h report"}
        {reportedAt && ` · ${shortStamp(reportedAt, now)}`}
        {archive && <> · <Source href={archive.url}>{archive.name} ↗</Source></>}
      </Note>
      {stake ? (
        <>
          <Note>
            {basisNames[stake.basis]} · {stake.timeBasis === "unknown" ? "Fetched " : ""}
            {clockTime(stake.capturedAt)}
            {stake.clearing &&
              ` · cleared ${clockTime(stake.clearing.from)}–${clockTime(stake.clearing.to)}`}
            {reference && " · hold the image for the clear stake"}
          </Note>
          <StakePhoto
            className={styles.original}
            frame={stake}
            reference={reference}
            label={`${resort.name} saved morning stake, ${stamp(stake.capturedAt)}`}
            unavailable="The saved image file is unavailable. This date has no replacement image."
          />
        </>
      ) : (
        <Note warning>No saved stake image for this date.</Note>
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
  roads,
  mode,
  filters,
  onResetFilters,
  overrides,
  onCardMode,
  open,
  recordAction,
}: {
  conditions: Conditions;
  morning: Feed;
  current: Feed;
  now: number;
  weather: SkiDay | null;
  roads: RoadsFeed | null;
  mode: CameraMode;
  filters: ResortFilters;
  onResetFilters: () => void;
  overrides: Record<string, CameraMode>;
  onCardMode: (resortId: string, next: CameraMode) => void;
  open: (target: OpenCameraTarget, button: HTMLButtonElement) => void;
  recordAction: RecordAnalyticsAction;
}) {
  const [dialog, setDialog] = useState<{
    resortId: string;
    date: string | null;
    fromDetails?: boolean;
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
  const reportedFresh = (resort: ResortConditions) =>
    freshSnowOf(resort)?.max ?? -1;
  const freshRank = (resort: ResortConditions) =>
    freshSnowRank(
      freshSnowOf(resort),
      reportStake(resort, leadView(resort, morning)?.camera),
    );
  const week = (resort: ResortConditions) =>
    resort.periods[0]?.snow24?.max ?? reportOf(resort)?.snow7?.max ?? -1;
  const baseDepth = (resort: ResortConditions) =>
    reportOf(resort)?.base?.max ?? -1;
  const roadById = new Map(
    (roads?.resorts ?? []).map((entry) => [entry.resortId, entry]),
  );
  const originName = roads?.origin.name ?? "Denver";
  const driveSeconds = (resort: ResortConditions) => {
    const entry = roadById.get(resort.resortId);
    if (!entry || entry.road.closed || !entry.drive) return Number.MAX_SAFE_INTEGER;
    return entry.drive.travelSeconds;
  };
  const sortedResorts = [...conditions.entries].sort((a, b) => {
    const openDiff =
      Number(a.operatingStatus.value !== "open") -
      Number(b.operatingStatus.value !== "open");
    if (openDiff) return openDiff;
    if (filters.sortBy === "drive") {
      return (
        driveSeconds(a) - driveSeconds(b) ||
        freshRank(b) - freshRank(a) ||
        position(a.resortId) - position(b.resortId)
      );
    }
    if (filters.sortBy === "week") {
      return (
        week(b) - week(a) ||
        reportedFresh(b) - reportedFresh(a) ||
        position(a.resortId) - position(b.resortId)
      );
    }
    if (filters.sortBy === "base") {
      return (
        baseDepth(b) - baseDepth(a) ||
        reportedFresh(b) - reportedFresh(a) ||
        position(a.resortId) - position(b.resortId)
      );
    }
    return (
      freshRank(b) - freshRank(a) ||
      week(b) - week(a) ||
      position(a.resortId) - position(b.resortId)
    );
  });
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
          resort.history
            .slice(0, -1)
            .map((day) =>
              stakeContradictsReport(day.snow24, day.stake ?? undefined)
                ? 0
                : (day.snow24?.max ?? 0),
            ),
        ),
      ),
    ),
  );
  const show = (
    resort: ResortConditions,
    day: Day | null,
    button: HTMLButtonElement,
  ) => {
    if (day) recordAction("day_open", resort.resortId);
    returnFocus.current = button;
    setDialog({ resortId: resort.resortId, date: day?.date ?? null });
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
          {(() => {
            let shownHoldHint = false;
            return visibleResorts.map((resort) => {
              const morningView = leadView(resort, morning);
              const nowView = currentView(resort.resortId, current);
              const chosen = overrides[resort.resortId] ?? mode;
              const activeMode: CameraMode =
                chosen === "now" && nowView
                  ? "now"
                  : morningView
                    ? "morning"
                    : nowView
                      ? "now"
                      : "morning";
              const activeView = activeMode === "now" ? nowView : morningView;
              const showHoldHint =
                !shownHoldHint && !!activeView?.camera.clearedReference;
              if (showHoldHint) shownHoldHint = true;
              return (
                <ResortCard
                  key={resort.resortId}
                  resort={resort}
                  morningView={morningView}
                  nowView={nowView}
                  activeMode={activeMode}
                  playingClip={playingId === resort.resortId}
                  showHoldHint={showHoldHint}
                  onSelectMode={(next) => {
                    setPlayingId((prev) => (prev === resort.resortId ? null : prev));
                    onCardMode(resort.resortId, next);
                  }}
                  onPlayClip={() => setPlayingId(resort.resortId)}
                  onStopClip={() => setPlayingId(null)}
                  scale={scale}
                  now={now}
                  weather={weather}
                  roadEntry={roadById.get(resort.resortId) ?? null}
                  originName={originName}
                  open={(target, button) => {
                    setPlayingId(null);
                    open(target, button);
                  }}
                  openMore={(button) => show(resort, null, button)}
                  openDay={(day, button) => show(resort, day, button)}
                  recordAction={recordAction}
                />
              );
            });
          })()}
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
            <span className={viewer.viewerHandle} aria-hidden="true" />
            <header className={viewer.viewerHeader}>
              <DialogTitle>
                {dialogDay
                  ? `${dialogResort.name} · ${longDate(dialogDay.date)}`
                  : dialogResort.name}
              </DialogTitle>
              <DialogDescription>
                {dialogDay ? "Daily report and saved stake image" : statusLine(dialogResort, now)}
              </DialogDescription>
            </header>
            <div className={viewer.viewerBody}>
              {dialogDay ? (
                <DayDetails
                  key={`${dialogResort.resortId}-${dialogDay.date}-${dialogDay.stake?.image.file}`}
                  resort={dialogResort}
                  day={dialogDay}
                  reference={reference}
                  now={now}
                  onBack={dialog?.fromDetails ? () => setDialog({ resortId: dialogResort.resortId, date: null }) : undefined}
                />
              ) : (
                <MoreDetails
                  resort={dialogResort}
                  roadEntry={roadById.get(dialogResort.resortId) ?? null}
                  originName={originName}
                  now={now}
                  openDay={(day) => {
                    recordAction("day_open", dialogResort.resortId);
                    setDialog({ resortId: dialogResort.resortId, date: day.date, fromDetails: true });
                  }}
                  recordAction={recordAction}
                />
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
