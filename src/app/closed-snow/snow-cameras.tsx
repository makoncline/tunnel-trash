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
  hasCurrentConditions,
  loadConditions,
  loadFeed,
  type Camera,
  type Conditions,
  type Feed,
} from "@/lib/closed-snow";
import { currentBrief, loadBrief, type Brief } from "@/lib/closed-snow-brief";
import styles from "./snow.module.css";
import { ClankBrief } from "./clank-brief";
import { FeedbackForm } from "./feedback-form";
import { AvailableStakes, ResortCards } from "./resort-cards";
import { Timelapse } from "./timelapse";

const format = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const stamp = (at: string) => format.format(new Date(at));
const timestamp = (camera: { capturedAt: string; timeBasis: string }) =>
  `${camera.timeBasis === "unknown" ? "Fetched " : ""}${stamp(camera.capturedAt)}`;
const clipNames = {
  "until-clearing": "Until clearing",
  "until-opening": "Until opening",
  "close-to-open": "Close to open",
};

function selectionLabel(camera: Camera) {
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
      "so-far": "So far",
      unavailable: "Pre-open image unavailable",
      manual: "Selected by you",
    }[camera.morning.basis];
  return camera.stale ? "Saved image" : "Latest";
}

function CameraMedia({
  camera,
  clear = false,
  diagonal = false,
  clipIndex = -1,
}: {
  camera: Camera;
  clear?: boolean;
  diagonal?: boolean;
  clipIndex?: number;
}) {
  const shown =
    clear && camera.clearedReference ? camera.clearedReference : camera;
  const clip = clipIndex >= 0 ? camera.clips[clipIndex] : undefined;
  const overlay = diagonal ? shown.diagonalOverlay : shown.overlay;
  const [failed, setFailed] = useState(false);
  if (clip) return <Timelapse clip={clip} camera={camera} overlay={overlay} />;
  return (
    <div className={styles.media}>
      {
        // Keep the producer's original bytes and native camera view.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assetUrl(shown.image.file)}
          alt={`${camera.name}${clear ? " clear platform reference" : " snow stake"}`}
          loading="eager"
          decoding="async"
          onError={() => setFailed(true)}
        />
      }
      {!failed && overlay && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.guide}
          src={assetUrl(overlay.file)}
          alt=""
          aria-hidden="true"
        />
      )}
      {failed && (
        <span className={styles.imageError} role="status">
          Media unavailable. Select Image or reopen this camera.
        </span>
      )}
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
  const [selected, setSelected] = useState<Camera | null>(null);
  const [media, setMedia] = useState("image");
  const [gauges, setGauges] = useState("back");
  const [checkedAt, setCheckedAt] = useState(Math.max(asOf, conditions.checkedAt));
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const reportsAvailable = hasCurrentConditions(resorts, checkedAt);
  const clear = media === "clear";
  const clipIndex =
    selected?.clips.findIndex((clip) => clip.kind === media) ?? -1;
  const shown =
    clear && selected?.clearedReference ? selected.clearedReference : selected;

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

  useEffect(() => {
    if (!reportsAvailable) return;
    const now = Date.now();
    const nextMinute = now - (now % 60_000) + 60_000;
    const nextCheck = Math.min(conditionsExpireAt(resorts), nextMinute);
    const timer = setTimeout(() => setCheckedAt(Date.now()), nextCheck - now);
    return () => clearTimeout(timer);
  }, [checkedAt, reportsAvailable, resorts]);

  function open(camera: Camera, button: HTMLButtonElement) {
    returnFocus.current = button;
    setSelected(camera);
    setMedia("image");
    setGauges("back");
    if (camera.clearedReference) {
      const image = new window.Image();
      image.src = assetUrl(camera.clearedReference.image.file);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.toolbar}>
        <h1>Closed Snow</h1>
      </header>
      <ClankBrief brief={currentBrief(latestBrief, checkedAt) ? latestBrief : null} />
      {afterBrief}
      {reportsAvailable ? (
        <ResortCards
          conditions={resorts}
          morning={feeds.morning}
          current={feeds.current}
          now={checkedAt}
          open={open}
        />
      ) : (
        <>
          <p className={styles.notice} role="status">Resort reports unavailable</p>
          <AvailableStakes morning={feeds.morning} current={feeds.current} now={checkedAt} open={open} />
        </>
      )}
      <FeedbackForm />
      <Dialog
        open={!!selected}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelected(null);
        }}
      >
        {selected && (
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
                {clear ? "Clear reference · " : ""}
                {selected.clips[clipIndex]
                  ? clipNames[selected.clips[clipIndex].kind]
                  : shown && timestamp(shown)}
              </DialogDescription>
            </header>
            <CameraMedia
              key={`${selected.cameraId}-${media}`}
              camera={selected}
              clear={clear}
              diagonal={gauges === "diagonal"}
              clipIndex={clipIndex}
            />
            <div className={styles.controls}>
              <Button
                variant="outline"
                aria-pressed={media === "image"}
                onClick={() => setMedia("image")}
              >
                Image
              </Button>
              {selected.clearedReference && (
                <Button
                  variant="outline"
                  aria-pressed={clear}
                  onClick={() => setMedia(clear ? "image" : "clear")}
                >
                  Clear stake
                </Button>
              )}
              {selected.clips.map((clip) => (
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
                : clipIndex >= 0 && selected.clips[clipIndex]
                  ? `${stamp(selected.clips[clipIndex].from)} – ${stamp(selected.clips[clipIndex].to)}${selected.clips[clipIndex].complete ? "" : ` · Partial coverage; largest gap ${Math.round(selected.clips[clipIndex].maxGapMinutes)} min`}`
                  : selectionLabel(selected)}
            </p>
          </DialogContent>
        )}
      </Dialog>
    </main>
  );
}
