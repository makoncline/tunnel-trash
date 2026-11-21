"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  type Conditions,
  type Feed,
} from "@/lib/closed-snow";
import { currentBrief, loadBrief, type Brief } from "@/lib/closed-snow-brief";
import { loadSkiDayWeather, type SkiDay } from "@/lib/closed-snow-private";
import styles from "./snow.module.css";
import { ClankBrief } from "./clank-brief";
import { FeedbackForm } from "./feedback-form";
import {
  AvailableStakes,
  ResortCards,
  type CameraMode,
  type OpenCameraTarget,
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
const clipNames = {
  "until-clearing": "Until clearing",
  "until-opening": "Until opening",
  "close-to-open": "Close to open",
};
const morningButtonNames: Record<string, string> = {
  "before-clearing": "Before clear",
  "at-opening": "Opening",
  "so-far": "Overnight",
  manual: "Morning",
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

function CameraMedia({
  camera,
  clipSource,
  clear = false,
  diagonal = false,
  clipIndex = -1,
}: {
  camera: Camera;
  clipSource: Camera;
  clear?: boolean;
  diagonal?: boolean;
  clipIndex?: number;
}) {
  const shown =
    clear && camera.clearedReference ? camera.clearedReference : camera;
  const clip = clipIndex >= 0 ? clipSource.clips[clipIndex] : undefined;
  const overlay = diagonal ? shown.diagonalOverlay : shown.overlay;
  const clipOverlay = diagonal ? clipSource.diagonalOverlay : clipSource.overlay;
  if (clip) return <Timelapse clip={clip} camera={clipSource} overlay={clipOverlay} />;
  const reference = clear ? null : camera.clearedReference;
  return (
    <div className={styles.media}>
      <StakePhoto
        className={styles.still}
        frame={{ image: shown.image, overlay }}
        reference={reference && { ...reference, overlay: diagonal ? reference.diagonalOverlay : reference.overlay }}
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
  afterBrief,
}: {
  current: Feed;
  morning: Feed;
  conditions: Conditions;
  asOf: number;
  brief: Brief | null;
  afterBrief: ReactNode;
}) {
  const [latestBrief, setLatestBrief] = useState(brief);
  const [feeds, setFeeds] = useState({ current, morning });
  const [resorts, setResorts] = useState(conditions);
  const [mode, setMode] = useState<CameraMode>("morning");
  const [overrides, setOverrides] = useState<Record<string, CameraMode>>({});
  const [selected, setSelected] = useState<{ resortId: string; name: string } | null>(null);
  const [media, setMedia] = useState("morning");
  const [gauges, setGauges] = useState("back");
  const [checkedAt, setCheckedAt] = useState(Math.max(asOf, conditions.checkedAt));
  const [skiDay, setSkiDay] = useState<SkiDay | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const reportsAvailable = hasCurrentConditions(resorts, checkedAt);
  const weather = skiDay && checkedAt < Date.parse(skiDay.startsAt) ? skiDay : null;

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
  const clipSource = usableMorning?.clips.length
    ? usableMorning
    : (nowCamera ?? usableMorning);
  const clips = clipSource?.clips ?? [];
  const clipIndex = clips.findIndex((clip) => clip.kind === media);
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
        const brief = loadBrief().then((value) => {
          if (!cancelled && value) setLatestBrief(value);
        });
        await Promise.all([reports, cameras, brief]);
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

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const next = await loadSkiDayWeather(controller.signal);
      if (controller.signal.aborted) return;
      const now = Date.now();
      setCheckedAt(now);
      if (next) setSkiDay(next);
      const untilStart = next ? Date.parse(next.startsAt) - now : Infinity;
      const delay = untilStart > 0 ? Math.min(untilStart, 15 * 60_000) : 60_000;
      timer = setTimeout(() => void refresh(), delay);
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

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
    <main className={styles.page} data-dock={hasDistinctNow ? "true" : undefined}>
      <header className={styles.toolbar}>
        <h1>Closed Snow</h1>
        {headingDate && <p className={styles.dayContext}>{headingDate}</p>}
      </header>
      <ClankBrief brief={currentBrief(latestBrief, checkedAt) ? latestBrief : null} />
      {afterBrief}
      {reportsAvailable ? (
        <ResortCards
          conditions={resorts}
          morning={feeds.morning}
          current={feeds.current}
          now={checkedAt}
          weather={weather}
          mode={mode}
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
            weather={weather}
            mode={mode}
            overrides={overrides}
            onCardMode={setCardMode}
            open={open}
          />
        </>
      )}
      <FeedbackForm />
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
        {selected && activeCamera && clipSource && (
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
                  : clipIndex >= 0
                    ? ""
                    : showingNow
                      ? "Now · "
                      : `${morningLabel} · `}
                {clips[clipIndex]
                  ? clipNames[clips[clipIndex].kind]
                  : shown && timestamp(shown)}
              </DialogDescription>
            </header>
            <CameraMedia
              key={`${activeCamera.cameraId}-${media}`}
              camera={activeCamera}
              clipSource={clipSource}
              clear={clear}
              diagonal={gauges === "diagonal"}
              clipIndex={clipIndex}
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
                {clips.map((clip) => (
                  <Button
                    variant="outline"
                    key={clip.kind}
                    aria-pressed={media === clip.kind}
                    onClick={() => setMedia(clip.kind)}
                  >
                    {clipNames[clip.kind]}
                  </Button>
                ))}
              </div>
              {shown?.diagonalOverlay && (
                <ToggleGroup
                  type="single"
                  value={gauges}
                  onValueChange={(value) => {
                    if (value) setGauges(value);
                  }}
                  className={styles.mode}
                  aria-label="Gauge placement"
                >
                  <ToggleGroupItem value="back">Back gauges</ToggleGroupItem>
                  <ToggleGroupItem value="diagonal">
                    Diagonal gauges
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
              <p className={styles.detailNote}>
                {clear
                  ? "Saved clear platform for comparison. This is not today’s clearing result."
                  : clipIndex >= 0 && clips[clipIndex]
                    ? `${stamp(clips[clipIndex].from)} – ${stamp(clips[clipIndex].to)}${clips[clipIndex].complete ? "" : ` · Partial coverage; largest gap ${Math.round(clips[clipIndex].maxGapMinutes)} min`}`
                    : selectionLabel(activeCamera, showingNow)}
              </p>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </main>
  );
}
