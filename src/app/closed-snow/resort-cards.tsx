"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  assetUrl,
  type Camera,
  type Conditions,
  type Depth,
  type Feed,
  type ResortConditions,
} from "@/lib/closed-snow";
import viewer from "./snow.module.css";
import styles from "./resort-cards.module.css";

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
  "before-clearing": "Pre-clear",
  "at-opening": "Opening",
  "so-far": "So far",
  manual: "Selected",
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
function leadView(resortId: string, morning: Feed, current: Feed): View | null {
  const am = morning.entries.find(
    (entry) => entry.cameraId === resortId || entry.stakeId === resortId,
  );
  const latest = current.entries.find(
    (entry) => entry.cameraId === resortId || entry.stakeId === resortId,
  );
  if (am?.morning && am.morning.basis !== "unavailable")
    return {
      camera: am,
      basis: am.morning.basis,
      title: basisNames[am.morning.basis],
    };
  if (latest)
    return { camera: latest, basis: "now", title: "Now · no pre-open image" };
  return null;
}
function reportOf(resort: ResortConditions) {
  return resort.report.status === "current" ? resort.report.data : null;
}

function StakeImage({
  view,
  name,
  open,
  now,
}: {
  view: View;
  name: string;
  open: (camera: Camera, button: HTMLButtonElement) => void;
  now: number;
}) {
  const [failed, setFailed] = useState(false);
  const stale = isStale(view.camera, now);
  const band =
    view.camera.snowBand?.observationId === view.camera.observationId
      ? view.camera.snowBand
      : null;
  return (
    <>
      <button
        type="button"
        className={styles.stake}
        onClick={(event) => open(view.camera, event.currentTarget)}
        aria-label={`Enlarge ${name} stake, ${view.title}. ${stamp(view.camera.capturedAt)}.`}
      >
        {
          // Keep the producer's original bytes and native camera view.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl(view.camera.image.file)}
            alt=""
            onError={() => setFailed(true)}
          />
        }
        {!failed && view.camera.overlay && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.guide}
            src={assetUrl(view.camera.overlay.file)}
            alt=""
            aria-hidden="true"
          />
        )}
        {failed && <span className={styles.imageError}>Image unavailable</span>}
      </button>
      <p
        className={`${styles.caption}${stale ? ` ${styles.warning}` : ""}`}
        title={`${view.camera.timeBasis === "unknown" ? "Fetched" : "Captured"} ${stamp(view.camera.capturedAt)}`}
      >
        {captionNames[view.basis] ?? "Now"} {clockTime(view.camera.capturedAt)}
        {stale ? " · Stale" : ""}
      </p>
      {band && <span className={styles.band}>AI: {bandNames[band.band]}</span>}
    </>
  );
}

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
  return (
    <button
      type="button"
      className={`${styles.day}${weekday === 0 || weekday === 6 ? ` ${styles.weekend}` : ""}${day.stake ? ` ${styles.saved}` : ""}`}
      data-day={day.date}
      aria-label={`${longDate(day.date)} · ${missingInches(snow)} reported in 24 hours. ${day.stake ? "Open saved morning image." : "No saved morning image."}`}
      aria-describedby={tooltip}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <span className={styles.track} aria-hidden="true">
        {snow ? (
          <span
            className={`${styles.mark}${snow.max === 0 ? ` ${styles.zero}` : ""}`}
            style={{ height: `${(snow.max / scale) * 100}%` }}
          >
            <span
              className={styles.fill}
              style={{
                height: `${snow.max ? (snow.min / snow.max) * 100 : 0}%`,
              }}
            />
            {snow.min !== snow.max && <span className={styles.range} />}
            {snow.max > 0 && (
              <span className={styles.value}>{inches(snow)}</span>
            )}
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
  view,
  scale,
  now,
  open,
  openMore,
  openDay,
}: {
  resort: ResortConditions;
  view: View | null;
  scale: number;
  now: number;
  open: (camera: Camera, button: HTMLButtonElement) => void;
  openMore: (button: HTMLButtonElement) => void;
  openDay: (day: Day, button: HTMLButtonElement) => void;
}) {
  const name = useRef<HTMLButtonElement>(null);
  const report = reportOf(resort);
  const status = resort.operatingStatus.value;
  const statusLabel = { open: "Open", closed: "Closed", unknown: "" }[status];
  const percent =
    resort.snowpack.freshness.normal === "current"
      ? resort.snowpack.data.percentOfNormal
      : null;
  const percentLabel = `Nearby snowpack ${percent}% of 1991–2020 median at ${resort.snowpack.data.station.name}`;
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
        if (!(event.target as HTMLElement).closest("button, a"))
          name.current?.click();
      }}
    >
      <div className={styles.media}>
        {view ? (
          <StakeImage view={view} name={resort.name} open={open} now={now} />
        ) : (
          <p className={styles.noImage}>Stake image unavailable</p>
        )}
      </div>
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
        <span className={styles.base}>
          Base {inches(report?.base ?? null)}
          {percent !== null && (
            <span role="note" aria-label={percentLabel} title={percentLabel}>
              {` (${percent}%)`}
            </span>
          )}
        </span>
        <span
          className={`${styles.status} ${styles[status]}`}
          role={status === "unknown" ? "img" : undefined}
          aria-label={statusLabel || "Operating status unknown"}
          title={`${statusLabel || "Operating status unknown"} · ${stamp(resort.operatingStatus.reportedAt)}`}
        >
          <span className={styles.dot} />
          {statusLabel}
        </span>
      </header>
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
                  {period.snow24
                    ? inches(period.snow24)
                    : `${period.reportedDays}/${period.totalDays}`}
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
            className={`${styles.hero}${today.stake ? ` ${styles.heroSaved}` : ""}`}
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
  open,
  now,
}: {
  resort: ResortConditions;
  view: View | null;
  open: (camera: Camera, button: HTMLButtonElement) => void;
  now: number;
}) {
  const report = resort.report.data;
  const snowpack = resort.snowpack.data;
  const operating = resort.operatingStatus;
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
          1991–2020 daily SWE median ·{" "}
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
                  {day.reportedAt ? stamp(day.reportedAt) : "Not reported"}
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
          Prev 5 sums them only when all five dates have values. Dashes mark
          missing reports. The box shows reported overnight snow for today. Gold
          underlines mark saved morning images.
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
            {view.title} · {stamp(view.camera.capturedAt)}
          </Note>
          <button
            type="button"
            className={styles.textButton}
            onClick={(event) => open(view.camera, event.currentTarget)}
          >
            Open camera image and clips
          </button>
          <Note>
            The stake shows snow since its last clearing. Snow can drift against
            the stake. AI bands are coarse estimates, never inches.
          </Note>
        </section>
      )}
      <section className={styles.section}>
        <h4>Operating status</h4>
        <Note>
          {operating.value === "unknown"
            ? "Operating status unknown"
            : `Reported ${operating.value}`}{" "}
          · {stamp(operating.reportedAt)}
          {operating.field ? ` · ${operating.field}` : ""}.{" "}
          <Source href={operating.source}>Status source ↗</Source>
        </Note>
      </section>
    </>
  );
}

function DayDetails({ resort, day }: { resort: ResortConditions; day: Day }) {
  const stake = day.stake;
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Note>
        24h reported snow {missingInches(day.snow24)} ·{" "}
        {day.reportedAt
          ? `Reported ${stamp(day.reportedAt)}`
          : "Report time unavailable"}
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
          {failed ? (
            <Note warning>
              The saved image file is unavailable. This date has no replacement
              image.
            </Note>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.original}
              src={assetUrl(stake.image.file)}
              alt={`${resort.name} saved morning stake, ${stamp(stake.capturedAt)}`}
              onError={() => setFailed(true)}
            />
          )}
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
  open,
}: {
  conditions: Conditions;
  morning: Feed;
  current: Feed;
  now: number;
  open: (camera: Camera, button: HTMLButtonElement) => void;
}) {
  const [dialog, setDialog] = useState<{
    resort: ResortConditions;
    day: Day | null;
  } | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  if (!conditions.entries.length)
    return conditions.issue ? (
      <p className={viewer.notice}>{conditions.issue}</p>
    ) : null;
  const order = morning.entries.map((entry) => entry.cameraId);
  const position = (id: string) =>
    order.includes(id) ? order.indexOf(id) : 99;
  const rank = (resort: ResortConditions) =>
    reportOf(resort)?.overnight?.max ?? -1;
  const week = (resort: ResortConditions) => reportOf(resort)?.snow7?.max ?? -1;
  const resorts = [...conditions.entries].sort(
    (a, b) =>
      Number(a.operatingStatus.value !== "open") -
        Number(b.operatingStatus.value !== "open") ||
      rank(b) - rank(a) ||
      week(b) - week(a) ||
      position(a.resortId) - position(b.resortId),
  );
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
    setDialog({ resort, day });
  };
  const openCamera = (camera: Camera, button: HTMLButtonElement) => {
    setDialog(null);
    open(camera, returnFocus.current ?? button);
  };
  return (
    <>
      {conditions.issue && <p className={viewer.notice}>{conditions.issue}</p>}
      <div className={styles.cards} data-scale={scale}>
        {resorts.map((resort) => (
          <ResortCard
            key={resort.resortId}
            resort={resort}
            view={leadView(resort.resortId, morning, current)}
            scale={scale}
            now={now}
            open={open}
            openMore={(button) => show(resort, null, button)}
            openDay={(day, button) => show(resort, day, button)}
          />
        ))}
      </div>
      <Dialog
        open={!!dialog}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        {dialog && (
          <DialogContent
            className={`${viewer.viewer} ${styles.dialog}`}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocus.current?.focus();
            }}
          >
            <header className={viewer.viewerHeader}>
              <DialogTitle>
                {dialog.day
                  ? `${dialog.resort.name} · ${longDate(dialog.day.date)}`
                  : dialog.resort.name}
              </DialogTitle>
              <DialogDescription>
                {dialog.day
                  ? "Daily report and saved morning image"
                  : "Report, snowpack and sources"}
              </DialogDescription>
            </header>
            {dialog.day ? (
              <DayDetails resort={dialog.resort} day={dialog.day} />
            ) : (
              <MoreDetails
                resort={dialog.resort}
                view={leadView(dialog.resort.resortId, morning, current)}
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
