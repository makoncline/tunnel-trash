"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assetUrl, loadTimeline, type Camera, type Clip, type ClipTimeline } from "@/lib/closed-snow";
import styles from "./snow.module.css";

const format = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
});

export function Timelapse({ clip, camera, overlay }: {
  clip: Clip; camera: Camera; overlay: Camera["overlay"];
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [timeline, setTimeline] = useState<ClipTimeline | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTimeline(clip.timeline.file).then(data => {
      if (!cancelled) setTimeline(data);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [clip.timeline.file]);

  useEffect(() => {
    const player = video.current;
    if (!player || !timeline || !ready || failed) return;
    let callback = 0;
    // The decoded frame time is authoritative, including after a seek or loop.
    const update = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      setIndex(Math.min(timeline.frames.length - 1, Math.floor(metadata.mediaTime * timeline.fps + 0.0001)));
      callback = player.requestVideoFrameCallback(update);
    };
    callback = player.requestVideoFrameCallback(update);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      void player.play().catch(() => { /* The Play button handles browser autoplay rules. */ });
    return () => { player.cancelVideoFrameCallback(callback); player.pause(); };
  }, [timeline, ready, failed]);

  function seek(next: number) {
    const player = video.current;
    if (!player || !timeline) return;
    player.pause();
    player.currentTime = (next + 0.5) / timeline.fps;
  }
  function toggle() {
    const player = video.current;
    if (!player) return;
    if (player.paused) void player.play().catch(() => setFailed(true));
    else player.pause();
  }
  const frame = timeline?.frames[index];
  const stamp = frame ? `${frame.timeBasis === "unknown" ? "Fetched " : ""}${format.format(new Date(frame.capturedAt))}` : "Loading frame times…";
  const enabled = !!timeline && ready && !failed;

  return <>
    <div className={styles.media}>
      <video ref={video} src={`${assetUrl(clip.asset.file)}?timeline=${clip.timeline.file}`} poster={assetUrl(camera.image.file)} muted loop playsInline
        aria-label={`${camera.name} timelapse`} onLoadedData={() => setReady(true)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} />
      {overlay && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.guide} src={assetUrl(overlay.file)} alt="" aria-hidden="true" />
      )}
    </div>
    {failed ? <p className={styles.notice} role="status">Timelapse unavailable. Select Image or reopen this camera.</p> :
      <div className={styles.playback}>
        <div className={styles.transport}>
          <Button variant="outline" onClick={() => seek(index - 1)} disabled={!enabled || index === 0} aria-label="Previous frame" title="Previous frame"><ChevronLeft aria-hidden="true" /></Button>
          <Button variant="outline" onClick={toggle} disabled={!enabled} aria-label={playing ? "Pause timelapse" : "Play timelapse"} title={playing ? "Pause" : "Play"}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</Button>
          <Button variant="outline" onClick={() => seek(index + 1)} disabled={!enabled || index === (timeline?.frames.length ?? 0) - 1} aria-label="Next frame" title="Next frame"><ChevronRight aria-hidden="true" /></Button>
          <time dateTime={frame?.capturedAt}>{stamp}</time>
        </div>
        <input type="range" min={0} max={(timeline?.frames.length ?? 1) - 1} step={1} value={index} disabled={!enabled}
          aria-label="Timelapse frame" aria-valuetext={stamp} onChange={event => seek(Number(event.target.value))} />
      </div>}
  </>;
}
