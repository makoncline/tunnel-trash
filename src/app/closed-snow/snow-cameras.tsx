"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  assetUrl,
  conditionsExpireAt,
  denverDateString,
  hasCurrentConditions,
  isSameCapture,
  loadConditions,
  loadFeed,
  type Camera,
  type Clip,
  type Conditions,
  type Feed,
} from "@/lib/closed-snow";
import { currentBrief, loadBrief, type Brief } from "@/lib/closed-snow-brief";
import type { SkiDay } from "@/lib/closed-snow-weather";
import styles from "./snow.module.css";
import { ClankBrief } from "./clank-brief";
import { FeedbackForm } from "./feedback-form";
import {
  AvailableStakes,
  ResortCards,
  type CameraMode,
  type OpenCameraTarget,
  type PassFilter,
  type ResortFilters,
  type SortBy,
} from "./resort-cards";
import { StakePhoto } from "./stake-photo";
import { Timelapse } from "./timelapse";

const format = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});
const stamp = (at: string) => format.format(new Date(at));
const timestamp = (camera: { capturedAt: string; timeBasis: string }) =>
  `${camera.timeBasis === "unknown" ? "Fetched " : ""}${stamp(camera.capturedAt)}`;
const clipNames: Record<Clip["kind"], string> = {
  "close-to-open": "Since close",
  "until-opening": "Since close",
  "until-clearing": "Pre-clear",
  "last-24h": "24h",
  "last-48h": "48h",
  "last-72h": "72h",
};
const clipOrder: Clip["kind"][] = [
  "close-to-open",
  "until-opening",
  "until-clearing",
  "last-24h",
  "last-48h",
  "last-72h",
];
const morningButtonNames: Record<string, string> = {
  "before-clearing": "Before clear",
  "at-opening": "Opening",
  "so-far": "Overnight",
  manual: "Morning",
};
const defaultFilters: ResortFilters = {
  pass: "all",
  openOnly: false,
  newSnowOnly: false,
  sortBy: "fresh",
};

function findCamera(feed: Feed, resortId: string) {
  return (
    feed.entries.find(
      (entry) => entry.cameraId === resortId || entry.stakeId === resortId,
    ) ?? null
  );
}

function skiDayHeading(date: string | null, now: number) {
  if (!date) return null;
  const formatted = dayFormat.format(new Date(`${date}T12:00:00Z`));
  const today = denverDateString(now);
  if (date === today) return `Today · ${formatted}`;
  if (date > today) return `For tomorrow · ${formatted}`;
  return formatted;
}

function selectionLabel(camera: Camera, isNow: boolean) {
  if (isNow) return camera.stale ? "Saved live image" : "Latest camera capture";
  if (camera.morning?.basis === "unavailable")
    return "Pre-open image unavailable";
  const clearing = camera.details.clearing;
  if (clearing.status === "observed" && clearing.from && clearing.to)
    return `Cleared ${stamp(clearing.from)}–${stamp(clearing.to)}${clearing.timeBasis === "fetch" ? " · fetch times" : ""}`;
  if (clearing.status === "no-snow") return "No snow";
  if (clearing.status === "not-observed") return "No clearing observed";
  if (clearing.status === "uncertain") return "Clearing uncertain";
  if (camera.morning)
    return {
      "before-clearing": "Before clearing",
      "at-opening": "At opening",
      "so-far": "Overnight so far",
      unavailable: "Pre-open image unavailable",
      manual: "Selected by you",
    }[camera.morning.basis];
  return camera.stale ? "Saved image" : "Latest";
}

type GaugePlacement = "back" | "diagonal" | "off";

function CameraMedia({
  camera,
  activeClip,
  clear = false,
  gauges = "back",
}: {
  camera: Camera;
  activeClip: { clip: Clip; source: Camera } | null;
  clear?: boolean;
  gauges?: GaugePlacement;
}) {
  const shown =
    clear && camera.clearedReference ? camera.clearedReference : camera;
  const overlay =
    gauges === "off"
      ? null
      : gauges === "diagonal"
        ? (shown.diagonalOverlay ?? shown.overlay)
        : shown.overlay;
  if (activeClip) {
    const clipOverlay =
      gauges === "off"
        ? null
        : gauges === "diagonal"
          ? (activeClip.source.diagonalOverlay ?? activeClip.source.overlay)
          : activeClip.source.overlay;
    return (
      <Timelapse
        clip={activeClip.clip}
        camera={activeClip.source}
        overlay={clipOverlay}
      />
    );
  }
  const reference = clear ? null : camera.clearedReference;
  const refOverlay = reference
    ? gauges === "off"
      ? null
      : gauges === "diagonal"
        ? (reference.diagonalOverlay ?? reference.overlay)
        : reference.overlay
    : null;
  return (
    <div className={styles.media}>
      <StakePhoto
        className={styles.still}
        frame={{ image: shown.image, overlay }}
        reference={reference && { ...reference, overlay: refOverlay }}
        label={`${camera.name}${clear ? " clear platform reference" : " snow stake"}`}
        unavailable="Media unavailable. Select another view or reopen this camera."
      />
    </div>
  );
}

export function SnowCameras({
  current,
  morning,
  conditions,
  asOf,
  brief,
  weather,
}: {
  current: Feed;
  morning: Feed;
  conditions: Conditions;
  asOf: number;
  brief: Brief | null;
  weather: SkiDay | null;
}) {
  const [latestBrief, setLatestBrief] = useState(brief);
  const [feeds, setFeeds] = useState({ current, morning });
  const [resorts, setResorts] = useState(conditions);
  const [mode, setMode] = useState<CameraMode>("morning");
  const [filters, setFilters] = useState<ResortFilters>(defaultFilters);
  const [overrides, setOverrides] = useState<Record<string, CameraMode>>({});
  const [selected, setSelected] = useState<{ resortId: string; name: string } | null>(null);
  const [media, setMedia] = useState("morning");
  const [gauges, setGauges] = useState<GaugePlacement>("back");
  const [checkedAt, setCheckedAt] = useState(Math.max(asOf, conditions.checkedAt));
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const reportsAvailable = hasCurrentConditions(resorts, checkedAt);
  const activeWeather =
    weather && checkedAt < Date.parse(weather.endsAt) ? weather : null;

  const hasDistinctNow = feeds.current.entries.some((live) => {
    const m = findCamera(feeds.morning, live.cameraId);
    if (!m || m.morning?.basis === "unavailable") return true;
    return !isSameCapture(m, live);
  });

  const morningCamera = selected ? findCamera(feeds.morning, selected.resortId) : null;
  const usableMorning =
    morningCamera && morningCamera.morning?.basis !== "unavailable"
      ? morningCamera
      : null;
  const nowCamera = selected ? findCamera(feeds.current, selected.resortId) : null;
  const distinctDialogNow =
    !!nowCamera && (!usableMorning || !isSameCapture(usableMorning, nowCamera));
  const allClips: { clip: Clip; source: Camera }[] = [];
  const seenKinds = new Set<string>();
  for (const source of [usableMorning, nowCamera]) {
    if (!source) continue;
    for (const clip of source.clips) {
      if (seenKinds.has(clip.kind)) continue;
      seenKinds.add(clip.kind);
      allClips.push({ clip, source });
    }
  }
  allClips.sort(
    (a, b) => clipOrder.indexOf(a.clip.kind) - clipOrder.indexOf(b.clip.kind),
  );
  const activeClip = allClips.find((item) => item.clip.kind === media) ?? null;
  const clear = media === "clear";
  const showingNow = media === "now" && !!nowCamera && distinctDialogNow;
  const activeCamera = showingNow
    ? nowCamera
    : (usableMorning ?? nowCamera);
  const shown =
    clear && activeCamera?.clearedReference
      ? activeCamera.clearedReference
      : activeCamera;
  const morningLabel =
    (usableMorning?.morning
      ? morningButtonNames[usableMorning.morning.basis]
      : undefined) ?? "Morning";
  const headingDate = skiDayHeading(
    feeds.morning.date ?? (reportsAvailable ? resorts.entries[0]?.skiDay.date ?? null : null),
    checkedAt,
  );
  const filterTags = [
    filters.pass !== "all" ? filters.pass : null,
    filters.openOnly ? "open" : null,
    filters.newSnowOnly ? "new-snow" : null,
    filters.sortBy !== "fresh" ? `sort:${filters.sortBy}` : null,
  ].filter(Boolean);
  const filterSummary = filterTags.length ? filterTags.join(", ") : "all";
  const hasFilters = filterTags.length > 0;

  useEffect(() => {
    let cancelled = false,
      running = false;
    async function refresh() {
      setCheckedAt(Date.now());
      if (document.hidden || running) return;
      running = true;
      try {
        const reports = loadConditions().then((nextConditions) => {
          if (cancelled) return;
          setResorts(nextConditions);
          setCheckedAt(Date.now());
        });
        const cameras = Promise.all([loadFeed("current"), loadFeed("morning")]).then(
          ([nextCurrent, nextMorning]) => {
            if (cancelled) return;
            setFeeds((previous) => ({
              current: nextCurrent.entries.length ? nextCurrent : previous.current,
              morning: nextMorning.entries.length ? nextMorning : previous.morning,
            }));
            setCheckedAt(Date.now());
          },
        );
        const nextBrief = loadBrief().then((value) => {
          if (!cancelled && value) setLatestBrief(value);
        });
        await Promise.all([reports, cameras, nextBrief]);
      } finally {
        running = false;
      }
    }
    const timer = setInterval(() => {
      void refresh();
    }, 60_000);
    const onVisible = () => {
      void refresh();
    };
    const initialClock = setTimeout(() => setCheckedAt(Date.now()), 0);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(initialClock);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, []);

  const currentEntries = feeds.current.entries;
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const camera of currentEntries) {
        const image = new window.Image();
        image.src = assetUrl(camera.image.file);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [currentEntries]);

  useEffect(() => {
    if (!reportsAvailable) return;
    const now = Date.now();
    const nextMinute = now - (now % 60_000) + 60_000;
    const nextCheck = Math.min(conditionsExpireAt(resorts), nextMinute);
    const timer = setTimeout(() => setCheckedAt(Date.now()), nextCheck - now);
    return () => clearTimeout(timer);
  }, [checkedAt, reportsAvailable, resorts]);

  function setGlobalMode(next: CameraMode) {
    setMode(next);
    setOverrides({});
  }

  function setCardMode(resortId: string, next: CameraMode) {
    setOverrides((previous) => {
      const updated = { ...previous };
      if (next === mode) delete updated[resortId];
      else updated[resortId] = next;
      return updated;
    });
  }

  function setPass(pass: PassFilter) {
    setFilters((prev) => ({ ...prev, pass }));
  }

  function open(target: OpenCameraTarget, button: HTMLButtonElement) {
    returnFocus.current = button;
    const m = findCamera(feeds.morning, target.resortId);
    const c = findCamera(feeds.current, target.resortId);
    const hasM = !!m && m.morning?.basis !== "unavailable";
    const resolvedMedia =
      target.initialMedia === "morning" && !hasM && c ? "now" : target.initialMedia;
    setSelected({ resortId: target.resortId, name: target.name });
    setMedia(resolvedMedia);
    setGauges("back");
    for (const file of [
      m?.clearedReference?.image.file,
      c?.clearedReference?.image.file,
      m?.image.file,
      c?.image.file,
    ]) {
      if (file) {
        const image = new window.Image();
        image.src = assetUrl(file);
      }
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.toolbar}>
        <h1>Closed Snow</h1>
        {headingDate && <p className={styles.dayContext}>{headingDate}</p>}
      </header>
      <ClankBrief brief={currentBrief(latestBrief, checkedAt) ? latestBrief : null} />
      {reportsAvailable && (
        <div className={styles.filterBar} role="region" aria-label="Filter resorts">
          <div className={styles.filterGroup} role="group" aria-label="Pass">
            {(
              [
                ["all", "All"],
                ["epic", "Epic"],
                ["ikon", "Ikon"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={styles.filterOption}
                aria-pressed={filters.pass === value}
                onClick={() => setPass(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.filterChip}
            aria-pressed={filters.openOnly}
            onClick={() =>
              setFilters((prev) => ({ ...prev, openOnly: !prev.openOnly }))
            }
          >
            Open
          </button>
          <button
            type="button"
            className={styles.filterChip}
            aria-pressed={filters.newSnowOnly}
            onClick={() =>
              setFilters((prev) => ({ ...prev, newSnowOnly: !prev.newSnowOnly }))
            }
          >
            New snow
          </button>
          <label className={styles.sortWrap}>
            <span className="sr-only">Sort resorts</span>
            <select
              className={styles.sortSelect}
              aria-label="Sort resorts"
              value={filters.sortBy}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  sortBy: event.target.value as SortBy,
                }))
              }
            >
              <option value="fresh">Sort: Fresh</option>
              <option value="week">Sort: 5-day</option>
              <option value="base">Sort: Base</option>
            </select>
          </label>
          {hasFilters && (
            <button
              type="button"
              className={styles.filterReset}
              onClick={() => setFilters(defaultFilters)}
            >
              Reset
            </button>
          )}
        </div>
      )}
      {reportsAvailable ? (
        <ResortCards
          conditions={resorts}
          morning={feeds.morning}
          current={feeds.current}
          now={checkedAt}
          weather={activeWeather}
          mode={mode}
          filters={filters}
          onResetFilters={() => setFilters(defaultFilters)}
          overrides={overrides}
          onCardMode={setCardMode}
          open={open}
        />
      ) : (
        <>
          <p className={styles.notice} role="status">Resort reports unavailable</p>
          <AvailableStakes
            morning={feeds.morning}
            current={feeds.current}
            now={checkedAt}
            weather={activeWeather}
            mode={mode}
            overrides={overrides}
            onCardMode={setCardMode}
            open={open}
          />
        </>
      )}
      <FeedbackForm context={{ mode, filters: filterSummary }} />
      {hasDistinctNow && (
        <nav className={styles.dock} aria-label="All stake cameras">
          <div className={styles.dockGroup} role="group" aria-label="Camera time view">
            <button
              type="button"
              className={styles.dockButton}
              aria-pressed={mode === "morning" && Object.keys(overrides).length === 0}
              data-active={mode === "morning" ? "true" : undefined}
              onClick={() => setGlobalMode("morning")}
            >
              Morning
            </button>
            <button
              type="button"
              className={styles.dockButton}
              aria-pressed={mode === "now" && Object.keys(overrides).length === 0}
              data-active={mode === "now" ? "true" : undefined}
              onClick={() => setGlobalMode("now")}
            >
              <span className={styles.liveDot} aria-hidden="true" />
              Now
            </button>
          </div>
        </nav>
      )}
      <Dialog
        open={!!selected && !!activeCamera}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelected(null);
        }}
      >
        {selected && activeCamera && (
          <DialogContent
            className={styles.viewer}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocus.current?.focus();
            }}
          >
            <header className={styles.viewerHeader}>
              <DialogTitle>{selected.name}</DialogTitle>
              <DialogDescription>
                {clear
                  ? "Clear reference · "
                  : activeClip
                    ? "Timelapse · "
                    : showingNow
                      ? "Now · "
                      : `${morningLabel} · `}
                {activeClip
                  ? clipNames[activeClip.clip.kind]
                  : shown && timestamp(shown)}
              </DialogDescription>
            </header>
            <CameraMedia
              key={`${activeCamera.cameraId}-${media}`}
              camera={activeCamera}
              activeClip={activeClip}
              clear={clear}
              gauges={gauges}
            />
            <div className={styles.viewerFooter}>
              <div className={styles.controls}>
                {usableMorning && (
                  <Button
                    variant="outline"
                    aria-pressed={media === "morning"}
                    onClick={() => setMedia("morning")}
                  >
                    {morningLabel}
                  </Button>
                )}
                {nowCamera && (!usableMorning || distinctDialogNow) && (
                  <Button
                    variant="outline"
                    aria-pressed={media === "now"}
                    onClick={() => setMedia("now")}
                  >
                    Now
                  </Button>
                )}
                {activeCamera.clearedReference && (
                  <Button
                    variant="outline"
                    aria-pressed={clear}
                    onClick={() =>
                      setMedia(clear ? (usableMorning ? "morning" : "now") : "clear")
                    }
                  >
                    Clear stake
                  </Button>
                )}
              </div>
              {allClips.length > 0 && (
                <div
                  className={styles.clipControls}
                  role="group"
                  aria-label="Timelapse range"
                >
                  <span className={styles.clipRowLabel}>Timelapse</span>
                  {allClips.map(({ clip }) => (
                    <button
                      type="button"
                      key={clip.kind}
                      className={styles.clipChoice}
                      aria-pressed={media === clip.kind}
                      onClick={() => setMedia(clip.kind)}
                    >
                      {clipNames[clip.kind]}
                    </button>
                  ))}
                </div>
              )}
              {(shown?.overlay ?? shown?.diagonalOverlay) && (
                <ToggleGroup
                  type="single"
                  value={gauges}
                  onValueChange={(value) => {
                    if (value === "back" || value === "diagonal" || value === "off") {
                      setGauges(value);
                    }
                  }}
                  className={styles.mode}
                  aria-label="Gauge placement"
                >
                  <ToggleGroupItem value="back">Back gauges</ToggleGroupItem>
                  {shown?.diagonalOverlay && (
                    <ToggleGroupItem value="diagonal">
                      Diagonal gauges
                    </ToggleGroupItem>
                  )}
                  <ToggleGroupItem value="off">No guides</ToggleGroupItem>
                </ToggleGroup>
              )}
              <p className={styles.detailNote}>
                {clear
                  ? "Saved clear platform for comparison. This is not today’s clearing result."
                  : activeClip
                    ? `${stamp(activeClip.clip.from)} – ${stamp(activeClip.clip.to)}${activeClip.clip.complete ? "" : ` · Partial coverage; largest gap ${Math.round(activeClip.clip.maxGapMinutes)} min`}`
                    : selectionLabel(activeCamera, showingNow)}
              </p>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </main>
  );
}
