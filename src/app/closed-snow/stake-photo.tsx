"use client";

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { assetUrl, type Camera } from "@/lib/closed-snow";
import { cn } from "@/lib/utils";
import styles from "./stake-photo.module.css";

type Frame = Pick<Camera, "image" | "overlay">;
type Reference = Frame & { capturedAt: string };
const referenceDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver", month: "short", day: "numeric", year: "numeric",
});

export function StakePhoto({ frame, reference, label, className, onOpen, children, unavailable = "Image unavailable" }: {
  frame: Frame;
  reference?: Reference | null;
  label: string;
  className?: string;
  onOpen?: (button: HTMLButtonElement) => void;
  children?: ReactNode;
  unavailable?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loadReference, setLoadReference] = useState(false);
  const [readyReference, setReadyReference] = useState<string | null>(null);
  const [held, setHeld] = useState(false);
  const press = useRef<{ id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const ignoreClick = useRef(false);
  const hintId = useId();
  const comparing = held && readyReference === reference?.image.file;

  useEffect(() => () => clearTimeout(press.current?.timer), []);

  function stop() {
    clearTimeout(press.current?.timer);
    press.current = null;
    setHeld(false);
  }

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    ignoreClick.current = false;
    if (!reference) return;
    setLoadReference(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      timer: setTimeout(() => {
        ignoreClick.current = true;
        setHeld(true);
      }, 400),
    };
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = press.current;
    if (active?.id !== event.pointerId || ignoreClick.current) return;
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 12) {
      ignoreClick.current = true;
      stop();
    }
  }

  function release(event: PointerEvent<HTMLButtonElement>) {
    if (press.current?.id === event.pointerId) stop();
  }

  const image = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.image} src={assetUrl(frame.image.file)} alt={onOpen ? "" : label} draggable={false} onError={() => setFailed(true)} />
      {!failed && frame.overlay && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.guide} src={assetUrl(frame.overlay.file)} alt="" draggable={false} />
      )}
      {failed && <span className={styles.error} role="status">{unavailable}</span>}
      {children}
      {reference && loadReference && (
        <span className={styles.reference} hidden={!comparing}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.referenceImage} src={assetUrl(reference.image.file)} alt="" draggable={false}
            onLoad={() => setReadyReference(reference.image.file)} />
          {reference.overlay && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.guide} src={assetUrl(reference.overlay.file)} alt="" draggable={false} />
          )}
          <span className={styles.referenceLabel}>Clear reference · {referenceDate.format(new Date(reference.capturedAt))}</span>
        </span>
      )}
    </>
  );

  if (!onOpen && !reference) return <div className={cn(styles.photo, className)}>{image}</div>;
  return (
    <button
      type="button"
      className={cn(styles.photo, styles.interactive, className)}
      data-comparing={comparing ? "true" : undefined}
      aria-label={label}
      aria-describedby={reference ? hintId : undefined}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onBlur={stop}
      onContextMenu={reference ? (event) => event.preventDefault() : undefined}
      onClick={(event) => {
        if (event.detail !== 0 && ignoreClick.current) return;
        onOpen?.(event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (onOpen || !reference || event.key !== " ") return;
        event.preventDefault();
        if (!event.repeat) {
          setLoadReference(true);
          setHeld(true);
        }
      }}
      onKeyUp={(event) => {
        if (onOpen || !reference || event.key !== " ") return;
        event.preventDefault();
        stop();
      }}
    >
      {image}
      {reference && <span id={hintId} hidden>{onOpen ? "Press and hold for the clear reference." : "Press and hold, or hold Space, for the clear reference."}</span>}
    </button>
  );
}
