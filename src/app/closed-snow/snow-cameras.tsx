"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  assetUrl,
  type Camera,
  type Feed,
  type FeedKind,
} from "@/lib/closed-snow";
import styles from "./snow.module.css";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

function timestamp(value: string) {
  return dateFormat.format(new Date(value));
}

function CameraImage({
  camera,
  large = false,
}: {
  camera: Camera;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`${styles.image} ${large ? styles.large : ""}`}>
      {failed ? (
        <p role="status">Image unavailable. Refresh to try again.</p>
      ) : (
        // The producer serves immutable images. Keep their full frame and pixels.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assetUrl(camera.image.file)}
          alt={`${camera.name} snow camera, captured ${timestamp(camera.capturedAt)}`}
          loading={large ? "eager" : "lazy"}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

const clipNames = {
  "until-clearing": "Until clearing",
  "until-opening": "Until opening",
  "close-to-open": "Close to open",
};

function ClipPlayer({
  clip,
  poster,
}: {
  clip: Camera["clips"][number];
  poster: string | undefined;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className={styles.clip}>
      <figcaption>
        <h3>{clipNames[clip.kind]}</h3>
        <p>
          {timestamp(clip.from)} – {timestamp(clip.to)}
        </p>
      </figcaption>
      {failed ? (
        <p role="status">This clip could not be played.</p>
      ) : (
        <video
          controls
          playsInline
          preload="metadata"
          poster={poster}
          onError={() => setFailed(true)}
          aria-label={`${clipNames[clip.kind]} camera clip`}
        >
          <source src={assetUrl(clip.asset.file)} type="video/mp4" />
          Your browser cannot play this video.
        </video>
      )}
      <p className={styles.secondary}>
        {clip.complete ? "Full interval" : "Partial interval"} ·{" "}
        {clip.observations} captures · Longest gap{" "}
        {Math.round(clip.maxGapMinutes)} min
      </p>
      <a href={assetUrl(clip.asset.file)} target="_blank" rel="noreferrer">
        Open clip <ArrowUpRight size={14} />
      </a>
    </figure>
  );
}

function FeedDetails({ feed }: { feed: Feed }) {
  return (
    <details className={styles.feedDetails}>
      <summary>
        {feed.kind === "current" ? "Current" : "Morning"} feed details
      </summary>
      <dl>
        <dt>Published</dt>
        <dd>
          {feed.generatedAt ? timestamp(feed.generatedAt) : "Unavailable"}
        </dd>
        <dt>Producer run</dt>
        <dd>{feed.runId ?? "Unavailable"}</dd>
        <dt>Request</dt>
        <dd>{feed.requestId ?? "Unavailable"}</dd>
        <dt>Correlation</dt>
        <dd>{feed.correlationId ?? "Unavailable"}</dd>
      </dl>
      {feed.omissions.length > 0 && (
        <>
          <h3>Not in this feed</h3>
          <ul>
            {feed.omissions.map((item) => (
              <li key={item.stakeId}>
                <strong>{item.stakeId}</strong>: {item.reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
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
  const [kind, setKind] = useState<FeedKind>(
    current.entries.length ? "current" : "morning",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const feed = kind === "current" ? current : morning;
  const camera = feed.entries.find((entry) => entry.cameraId === selected);
  const otherCamera = (kind === "current" ? morning : current).entries.find(
    (entry) => entry.cameraId === selected,
  );
  const clips = [
    ...(camera?.clips ?? []),
    ...(otherCamera?.clips ?? []),
  ].filter(
    (clip, index, all) =>
      all.findIndex((item) => item.asset.file === clip.asset.file) === index,
  );
  const feedIsOld =
    feed.generatedAt && asOf - Date.parse(feed.generatedAt) > 30 * 60_000;

  function openCamera(id: string | null) {
    setSelected(id);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() =>
      document
        .getElementById(id ? "camera-heading" : "cameras-heading")
        ?.focus(),
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.storeLink}>
          Tunnel Trash <ArrowUpRight size={14} />
        </Link>
        <div className={styles.titleRow}>
          <div>
            <h1>Closed Snow</h1>
            <p>Snow cameras. Current images and morning clips.</p>
          </div>
          <Button variant="outline" asChild>
            <a href="/closed-snow">
              <RefreshCw size={16} /> Refresh
            </a>
          </Button>
        </div>
      </header>

      <Tabs value={kind} onValueChange={(value) => setKind(value as FeedKind)}>
        <div className={styles.toolbar}>
          <TabsList aria-label="Camera view" className="h-11">
            <TabsTrigger value="current" className="px-5">
              Current
            </TabsTrigger>
            <TabsTrigger value="morning" className="px-5">
              Morning
            </TabsTrigger>
          </TabsList>
          <p className={styles.secondary}>
            {feed.generatedAt ? (
              <>
                Published {timestamp(feed.generatedAt)}
                {kind === "current" && feedIsOld ? " · Update delayed" : ""}
              </>
            ) : (
              "Feed unavailable"
            )}
          </p>
        </div>
        <TabsContent value={kind}>
          {feed.issue && (
            <p className={styles.notice} role="status">
              {feed.issue}
            </p>
          )}

          {selected ? (
            <section className={styles.inspection} aria-label="Camera details">
              <Button
                variant="ghost"
                onClick={() => openCamera(null)}
                className="mb-5 -ml-3"
              >
                <ArrowLeft size={16} /> All cameras
              </Button>
              <div className={styles.cameraTitle}>
                <h2 id="camera-heading" tabIndex={-1}>
                  {camera?.name ?? otherCamera?.name ?? "Camera"}
                </h2>
                {camera && (
                  <p>
                    {kind === "morning" && camera.selection === "pre-clear"
                      ? "Before clearing"
                      : kind === "morning"
                        ? "Morning capture"
                        : "Latest capture"}{" "}
                    · {timestamp(camera.capturedAt)}
                    {camera.stale ||
                    (kind === "current" &&
                      asOf - Date.parse(camera.capturedAt) > 30 * 60_000)
                      ? " · Older capture"
                      : ""}
                  </p>
                )}
              </div>
              {camera ? (
                <>
                  <CameraImage key={camera.image.file} camera={camera} large />
                  <div className={styles.imageCaption}>
                    <span>Camera image · No added guide</span>
                    <a
                      href={assetUrl(camera.image.file)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open image <ArrowUpRight size={14} />
                    </a>
                  </div>
                  <div className={styles.notes}>
                    <h3>Camera notes</h3>
                    <p>{camera.note}</p>
                    <p className={styles.secondary}>
                      {camera.sourceAt
                        ? `Source time: ${timestamp(camera.sourceAt)}`
                        : "Source time is unknown. The time above is the capture time."}
                    </p>
                  </div>
                </>
              ) : (
                <p className={styles.notice}>
                  This camera has no {kind} image. Select the other view to see
                  its available image.
                </p>
              )}
              <section className={styles.clips} aria-label="Available clips">
                <h2>Camera clips</h2>
                <p className={styles.secondary}>
                  Short time-lapse clips from the available captures. A partial
                  interval can have missing images.
                </p>
                {clips.length ? (
                  <div className={styles.clipGrid}>
                    {clips.map((clip) => (
                      <ClipPlayer
                        key={clip.asset.file}
                        clip={clip}
                        poster={
                          (camera ?? otherCamera)
                            ? assetUrl((camera ?? otherCamera)!.image.file)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className={styles.notice}>
                    No clips are available for this camera.
                  </p>
                )}
              </section>
              {camera && (
                <details className={styles.feedDetails}>
                  <summary>Capture details</summary>
                  <dl>
                    <dt>Camera</dt>
                    <dd>{camera.cameraId}</dd>
                    <dt>Observation</dt>
                    <dd>{camera.observationId}</dd>
                    <dt>Time basis</dt>
                    <dd>{camera.timeBasis}</dd>
                  </dl>
                </details>
              )}
            </section>
          ) : (
            <section
              aria-label={`${kind === "current" ? "Current" : "Morning"} cameras`}
            >
              <div className={styles.listHeading}>
                <h2 id="cameras-heading" tabIndex={-1}>
                  {kind === "current" ? "Current cameras" : "Morning cameras"}
                </h2>
                <span>{feed.entries.length} available</span>
              </div>
              {feed.entries.length ? (
                <div className={styles.grid}>
                  {feed.entries.map((entry) => (
                    <button
                      type="button"
                      className={styles.camera}
                      key={entry.cameraId}
                      onClick={() => openCamera(entry.cameraId)}
                      aria-label={`Open ${entry.name}`}
                    >
                      <CameraImage key={entry.image.file} camera={entry} />
                      <div className={styles.cardCaption}>
                        <div>
                          <h3>{entry.name}</h3>
                          <p>
                            {timestamp(entry.capturedAt)}
                            {entry.stale ||
                            (kind === "current" &&
                              asOf - Date.parse(entry.capturedAt) > 30 * 60_000)
                              ? " · Older capture"
                              : ""}
                          </p>
                        </div>
                        <ArrowUpRight size={20} aria-hidden="true" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.notice}>
                  No camera images are available in this view. Select the other
                  view or refresh.
                </p>
              )}
            </section>
          )}
        </TabsContent>
      </Tabs>
      <footer className={styles.footer}>
        <p>Images and clips from Closed Snow. Times are in Mountain Time.</p>
        <p>
          Guides are not shown. Weather and reported totals are not in this
          feed. No snowfall is estimated from these images.
        </p>
        <FeedDetails feed={current} />
        <FeedDetails feed={morning} />
      </footer>
    </main>
  );
}
