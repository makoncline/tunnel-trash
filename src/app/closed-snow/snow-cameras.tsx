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
  loadFeed,
  type Camera,
  type Feed,
  type FeedKind,
} from "@/lib/closed-snow";
import styles from "./snow.module.css";
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
const seasons = {
  open: "Open for the season",
  "not-yet-open": "Not open yet",
  closed: "Season closed",
  unknown: "Other cameras",
};
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

function CameraTile({
  camera,
  asOf,
  open,
}: {
  camera: Camera;
  asOf: number;
  open: (camera: Camera, button: HTMLButtonElement) => void;
}) {
  const latest = camera.details.latestCapture;
  const fresh =
    latest &&
    latest.timeBasis !== "unknown" &&
    asOf - Date.parse(latest.capturedAt) <= 30 * 60_000 &&
    Date.parse(latest.capturedAt) <= asOf;
  const status = latest
    ? `${fresh ? "Recent" : "Saved"} capture: ${timestamp(latest)}. This is not a live connection check.`
    : "No saved capture";
  return (
    <button
      className={styles.tile}
      data-camera-id={camera.cameraId}
      onClick={(event) => open(camera, event.currentTarget)}
      aria-label={`Enlarge ${camera.name}. ${timestamp(camera)}. ${selectionLabel(camera)}.`}
    >
      <span className={styles.top}>
        <span
          className={styles.dot}
          data-state={fresh ? "fresh" : "saved"}
          role="img"
          aria-label={status}
          title={status}
        />
        <time dateTime={camera.capturedAt}>{timestamp(camera)}</time>
      </span>
      <CameraMedia key={camera.image.file} camera={camera} />
      <span className={styles.bottom}>
        <span className={styles.name}>{camera.name}</span>
        <span className={styles.secondary}>{selectionLabel(camera)}</span>
      </span>
    </button>
  );
}

export function SnowCameras({
  current,
  morning,
  asOf,
}: {
  current: Feed;
  morning: Feed;
  asOf: number;
}) {
  const [feeds, setFeeds] = useState({ current, morning });
  const [kind, setKind] = useState<FeedKind>("morning");
  const [selected, setSelected] = useState<Camera | null>(null);
  const [media, setMedia] = useState("image");
  const [gauges, setGauges] = useState("back");
  const [checkedAt, setCheckedAt] = useState(asOf);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const feed = feeds[kind];
  const clear = media === "clear";
  const clipIndex =
    selected?.clips.findIndex((clip) => clip.kind === media) ?? -1;
  const shown =
    clear && selected?.clearedReference ? selected.clearedReference : selected;

  useEffect(() => {
    let cancelled = false,
      running = false;
    async function refresh() {
      if (document.hidden || running) return;
      running = true;
      try {
        const next = await loadFeed(kind);
        if (cancelled) return;
        setRefreshFailed(!!next.issue);
        if (next.entries.length)
          setFeeds((previous) => ({ ...previous, [kind]: next }));
        setCheckedAt(Date.now());
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
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [kind]);

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
        <ToggleGroup
          type="single"
          value={kind}
          onValueChange={(value) => {
            if (value === "morning" || value === "current") {
              setKind(value);
              setSelected(null);
            }
          }}
          className={styles.mode}
          aria-label="Camera view"
        >
          <ToggleGroupItem value="morning">Morning · pre-open</ToggleGroupItem>
          <ToggleGroupItem value="current">Now</ToggleGroupItem>
        </ToggleGroup>
      </header>
      {(feed.issue !== null || refreshFailed) && (
        <p className={styles.notice} role="status">
          {feed.entries.length
            ? "Update incomplete. Keeping the available images."
            : feed.issue}
        </p>
      )}
      {!feed.entries.length && (
        <p className={styles.notice}>No images available for this view.</p>
      )}
      <div className={styles.sections}>
        {Object.entries(seasons).map(([season, title]) => {
          const entries = feed.entries.filter(
            (camera) => camera.details.seasonStatus === season,
          );
          return (
            entries.length > 0 && (
              <section key={season} aria-label={title}>
                <h2>{title}</h2>
                <div className={styles.grid}>
                  {entries.map((camera) => (
                    <CameraTile
                      key={camera.cameraId}
                      camera={camera}
                      asOf={checkedAt}
                      open={open}
                    />
                  ))}
                </div>
              </section>
            )
          );
        })}
      </div>
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
                {selected.clips[clipIndex] ? clipNames[selected.clips[clipIndex].kind] : shown && timestamp(shown)}
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
