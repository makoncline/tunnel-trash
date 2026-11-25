"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  denverDateString,
  stakeContradictsReport,
  type ResortConditions,
} from "@/lib/closed-snow";
import type { ForecastDay, ResortForecast } from "@/lib/closed-snow-forecast";
import styles from "./forecast-stagger.module.css";

const weekdayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
});

function offsetDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function dayDiff(fromDate: string, toDate: string): number {
  return Math.round(
    (Date.parse(`${toDate}T12:00:00Z`) - Date.parse(`${fromDate}T12:00:00Z`)) /
      86_400_000,
  );
}

function formatTotalLabel(value: number): string {
  if (value < 0.95) return "";
  return String(Math.round(value));
}

function formatTotalInches(total: number | null): string {
  if (total === null) return "—";
  if (total < 0.45) return "0″";
  return `${Math.round(total)}″`;
}

function formatExactInches(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 0.05) return "0″";
  return `${Number(value.toFixed(1))}″`;
}

function formatReportedDepth(
  depth: { min: number; max: number } | null | undefined,
): string {
  if (!depth) return "—";
  if (depth.min === depth.max) return formatExactInches(depth.max);
  const lo = depth.min < 0.05 ? "0" : String(Number(depth.min.toFixed(1)));
  const hi = depth.max < 0.05 ? "0" : String(Number(depth.max.toFixed(1)));
  return `${lo}–${hi}″`;
}

function NestedDayBars({
  night,
  day,
  nightKind = "forecast",
  muted = false,
  pastActual = false,
  maxScale,
  maxPx,
}: {
  night: number | null;
  day: number | null;
  nightKind?: "forecast" | "actual";
  muted?: boolean;
  pastActual?: boolean;
  maxScale: number;
  maxPx: number;
}) {
  const nVal = night !== null && night >= 0.35 ? night : 0;
  const dVal = day !== null && day >= 0.35 ? day : 0;
  const rawTotal = (night ?? 0) + (day ?? 0);

  if (nVal === 0 && dVal === 0 && rawTotal < 0.35) {
    return null;
  }

  // Reported-only bar (past days or Today when daytime forecast is dry)
  if (nightKind === "actual" && dVal === 0) {
    if (nVal === 0) return null;
    const clipped = nVal > maxScale;
    const height = Math.max(
      4,
      Math.round((Math.min(nVal, maxScale) / maxScale) * maxPx),
    );
    const label = formatTotalLabel(nVal);
    return (
      <div className={styles.reportedPair}>
        <div className={styles.innerSlot}>
          <div style={{ position: "relative", width: "100%", height }}>
            {label && !clipped && (
              <span
                className={`${styles.totalLabel}${muted ? ` ${styles.totalLabelMuted}` : ""}`}
              >
                {label}
              </span>
            )}
            <div
              className={[
                styles.reportedBar,
                muted
                  ? styles.innerHistActual
                  : pastActual
                    ? styles.innerPastActual
                    : styles.innerActual,
                clipped ? styles.barClipped : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ height }}
            >
              {label && clipped && (
                <span className={styles.clippedLabel}>{label}</span>
              )}
            </div>
          </div>
        </div>
        <div className={styles.innerSlot} />
      </div>
    );
  }

  const total = Math.max(rawTotal, nVal + dVal);
  const clipped = total > maxScale;
  const outerHeight = Math.max(
    5,
    Math.round((Math.min(total, maxScale) / maxScale) * maxPx),
  );
  const innerMax = Math.max(3, outerHeight - 1);
  const nightHeight =
    nVal > 0
      ? Math.min(innerMax, Math.max(3, Math.round((nVal / maxScale) * maxPx)))
      : 0;
  const dayHeight =
    dVal > 0
      ? Math.min(innerMax, Math.max(3, Math.round((dVal / maxScale) * maxPx)))
      : 0;

  const totalLabel = formatTotalLabel(total);
  const totalRounded = Math.round(total);
  const nightLabel =
    nVal >= 0.95 && nightHeight >= 10 && Math.round(nVal) !== totalRounded
      ? String(Math.round(nVal))
      : "";
  const dayLabel =
    dVal >= 0.95 && dayHeight >= 10 && Math.round(dVal) !== totalRounded
      ? String(Math.round(dVal))
      : "";

  const shellClass = [
    styles.totalShell,
    muted ? styles.totalShellMuted : "",
    nightKind === "actual" ? styles.totalShellActual : "",
    clipped ? styles.barClipped : "",
  ]
    .filter(Boolean)
    .join(" ");

  const nightBarClass = [
    styles.innerBar,
    nightKind === "actual"
      ? muted
        ? styles.innerHistActual
        : pastActual
          ? styles.innerPastActual
          : styles.innerActual
      : muted
        ? styles.innerMuted
        : styles.innerForecast,
  ]
    .filter(Boolean)
    .join(" ");

  const dayBarClass = [
    styles.innerBar,
    muted ? styles.innerMuted : styles.innerForecast,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass} style={{ height: outerHeight }}>
      {totalLabel && (
        <span
          className={`${styles.totalLabel}${muted ? ` ${styles.totalLabelMuted}` : ""}`}
        >
          {totalLabel}
        </span>
      )}
      <div className={styles.innerSlot}>
        {nightHeight > 0 && (
          <div className={nightBarClass} style={{ height: nightHeight }}>
            {nightLabel && (
              <span
                className={`${styles.subLabel}${muted && nightKind !== "actual" ? ` ${styles.subLabelMuted}` : ""}`}
              >
                {nightLabel}
              </span>
            )}
          </div>
        )}
      </div>
      <div className={styles.innerSlot}>
        {dayHeight > 0 && (
          <div className={dayBarClass} style={{ height: dayHeight }}>
            {dayLabel && (
              <span
                className={`${styles.subLabel}${muted ? ` ${styles.subLabelMuted}` : ""}`}
              >
                {dayLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ForecastStagger({
  resort,
  forecast,
  now,
}: {
  resort: ResortConditions;
  forecast: ResortForecast | null;
  now: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedDate) return;
    const onPointerDown = (event: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setSelectedDate(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedDate]);

  const todayDate = denverDateString(now);

  const columns = useMemo(() => {
    const items: {
      date: string;
      colIndex: number;
      weekdayInitial: string;
      shortLabel: string;
      dayNum: string;
      past: boolean;
      today: boolean;
      weekend: boolean;
    }[] = [];
    for (let offset = -3; offset <= 7; offset++) {
      const date = offsetDate(todayDate, offset);
      const parsed = new Date(`${date}T12:00:00Z`);
      const dayOfWeek = parsed.getUTCDay();
      const shortWd = weekdayFormat.format(parsed);
      items.push({
        date,
        colIndex: offset + 5,
        weekdayInitial: shortWd.slice(0, 1),
        shortLabel:
          offset === 0
            ? `Today ${parsed.getUTCDate()}`
            : `${shortWd} ${parsed.getUTCDate()}`,
        dayNum: String(parsed.getUTCDate()),
        past: offset < 0,
        today: offset === 0,
        weekend: offset > 0 && (dayOfWeek === 0 || dayOfWeek === 6),
      });
    }
    return items;
  }, [todayDate]);

  const actualByDate = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>();
    for (const day of resort.history) {
      const depth = day.overnight ?? day.snow24;
      if (!depth) continue;
      if (stakeContradictsReport(depth, day.stake ?? undefined)) continue;
      map.set(day.date, { min: depth.min, max: depth.max });
    }
    if (
      resort.skiDay.date === todayDate &&
      resort.report.status === "current" &&
      resort.report.data?.overnight
    ) {
      const todayHist = resort.history.find((day) => day.date === todayDate);
      if (
        !stakeContradictsReport(
          resort.report.data.overnight,
          todayHist?.stake ?? undefined,
        )
      ) {
        map.set(todayDate, {
          min: resort.report.data.overnight.min,
          max: resort.report.data.overnight.max,
        });
      }
    }
    return map;
  }, [resort, todayDate]);

  const runs = useMemo(() => {
    const source = forecast?.runs ?? [];
    return source.map((run, index) => {
      const daysByDate = new Map<string, ForecastDay>(
        run.days.map((d) => [d.date, d]),
      );
      const ago = dayDiff(run.date, todayDate);
      const parsed = new Date(`${run.date}T12:00:00Z`);
      const shortWd = weekdayFormat.format(parsed).slice(0, 1);
      return {
        ...run,
        daysByDate,
        isTopRow: index === 0,
        ageLabel: ago === 0 ? "Today" : `${ago}d ago`,
        dateLabel: `${shortWd} ${parsed.getUTCDate()}`,
      };
    });
  }, [forecast, todayDate]);

  // Scale to forecast daily totals so a large past storm does not flatten upcoming days.
  const maxScale = useMemo(() => {
    let peak = 3;
    for (const run of runs) {
      for (const col of columns) {
        const entry = run.daysByDate.get(col.date);
        if (!entry) continue;
        peak = Math.max(peak, (entry.night ?? 0) + (entry.day ?? 0));
      }
    }
    return Math.ceil(peak);
  }, [runs, columns]);

  const totals = useMemo(() => {
    const topRun = runs[0];
    let pastTotal = 0;
    let pastComplete = true;
    let futureTotal = 0;
    let futureComplete = !!topRun;
    for (const col of columns) {
      if (col.past) {
        const depth = actualByDate.get(col.date);
        if (!depth) pastComplete = false;
        else pastTotal += depth.max;
      } else if (!col.today && topRun) {
        const entry = topRun.daysByDate.get(col.date);
        if (entry?.night == null || entry.day == null) {
          futureComplete = false;
        } else {
          futureTotal += entry.night + entry.day;
        }
      }
    }
    return {
      pastTotal: pastComplete ? pastTotal : null,
      futureTotal: futureComplete ? futureTotal : null,
    };
  }, [runs, columns, actualByDate]);

  if (!runs.length) return null;

  const topRun = runs[0]!;
  const historyRuns = runs.slice(1);
  const historyCount = historyRuns.length;
  const maxPx = 36;
  const totalRows = expanded ? 4 + historyCount : 3;
  const bandStart = selectedDate ? 2 : 1;
  const bandSpan = `${bandStart} / ${totalRows + 1}`;
  const hitSpan = `2 / ${totalRows + 1}`;

  const changeSummary = (() => {
    const prevRun = historyRuns[0];
    if (!prevRun) return null;
    let prevSum = 0;
    let currSum = 0;
    let covered = 0;
    for (const col of columns) {
      if (col.past || col.today) continue;
      const prevDay = prevRun.daysByDate.get(col.date);
      const currDay = topRun.daysByDate.get(col.date);
      if (
        prevDay?.night == null ||
        prevDay.day == null ||
        currDay?.night == null ||
        currDay.day == null
      ) {
        continue;
      }
      prevSum += prevDay.night + prevDay.day;
      currSum += currDay.night + currDay.day;
      covered++;
    }
    if (covered === 0 || (prevSum < 0.45 && currSum < 0.45)) return null;
    return `${formatTotalInches(prevSum)} ${prevRun.ageLabel} → ${formatTotalInches(currSum)} ${topRun.ageLabel.toLowerCase()}`;
  })();

  const selectedCol = selectedDate
    ? columns.find((col) => col.date === selectedDate) ?? null
    : null;

  const selectedDetail = (() => {
    if (!selectedCol) return null;
    const priorTotals = historyRuns
      .map((run) => {
        if (selectedCol.date <= run.date) return null;
        const entry = run.daysByDate.get(selectedCol.date);
        if (!entry || (entry.night === null && entry.day === null)) return null;
        const sum = (entry.night ?? 0) + (entry.day ?? 0);
        return `${run.ageLabel}: ${formatExactInches(sum)}`;
      })
      .filter((item): item is string => item !== null)
      .slice(0, 2);
    const trendSuffix = priorTotals.length ? ` · ${priorTotals.join(" → ")}` : "";

    if (selectedCol.past) {
      const actual = actualByDate.get(selectedCol.date) ?? null;
      return {
        primary: `${selectedCol.shortLabel} · Reported ${formatReportedDepth(actual)}`,
        trend: trendSuffix,
      };
    }
    if (selectedCol.today) {
      const actual = actualByDate.get(selectedCol.date) ?? null;
      const dayVal = topRun.daysByDate.get(selectedCol.date)?.day ?? null;
      return {
        primary: `${selectedCol.shortLabel} · Rep ${formatReportedDepth(actual)} · D ${formatExactInches(dayVal)}`,
        trend: trendSuffix,
      };
    }
    const entry = topRun.daysByDate.get(selectedCol.date);
    if (!entry || (entry.night === null && entry.day === null)) {
      return {
        primary: `${selectedCol.shortLabel} · Forecast unavailable`,
        trend: trendSuffix,
      };
    }
    const complete = entry.night !== null && entry.day !== null;
    const daySum = complete ? entry.night! + entry.day! : null;
    return {
      primary: `${selectedCol.shortLabel} · ${complete ? formatExactInches(daySum) : "Partial"} (N ${formatExactInches(entry.night)} · D ${formatExactInches(entry.day)})`,
      trend: trendSuffix,
    };
  })();

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <h4>Snow forecast</h4>
        <div className={styles.legend} aria-hidden="true">
          <span className={styles.legendItem}>
            <span className={`${styles.dot} ${styles.dotActual}`} />
            Reported
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.dot} ${styles.dotForecast}`} />
            Forecast
          </span>
        </div>
      </div>

      <div className={styles.card} ref={cardRef}>
        <div className={styles.chartArea}>
          <div className={styles.scrollBox}>
            <div
              className={`${styles.grid}${expanded ? "" : ` ${styles.gridCollapsed}`}`}
            >
              <div
                className={styles.todayBand}
                style={{ gridRow: bandSpan }}
                aria-hidden="true"
              />
              {selectedCol && !selectedCol.today && (
                <div
                  className={styles.selectedBand}
                  style={{ gridColumn: selectedCol.colIndex, gridRow: bandSpan }}
                  aria-hidden="true"
                />
              )}

              {selectedDetail ? (
                <div className={styles.readoutRow} role="status">
                  <span className={styles.readoutText}>
                    {selectedDetail.primary}
                    {selectedDetail.trend && (
                      <span className={styles.readoutTrend}>
                        {selectedDetail.trend}
                      </span>
                    )}
                  </span>
                  <span className={styles.readoutHint}>Tap to clear</span>
                </div>
              ) : (
                <>
                  <span className={styles.bracketSpacer} aria-hidden="true" />
                  <div className={`${styles.bracket} ${styles.bracketPast}`}>
                    <span>Past 3d</span>
                    <span className={styles.bracketTotal}>
                      {formatTotalInches(totals.pastTotal)}
                    </span>
                  </div>
                  <div className={styles.bracketToday}>Today</div>
                  <div className={`${styles.bracket} ${styles.bracketFuture}`}>
                    <span>Next 7d</span>
                    <span className={styles.bracketTotal}>
                      {formatTotalInches(totals.futureTotal)}
                    </span>
                  </div>
                </>
              )}

              {expanded && (
                <div
                  className={`${styles.yRail} ${styles.yRailNow}`}
                  style={{ gridRow: 2 }}
                >
                  <span>{topRun.ageLabel}</span>
                  <span className={styles.yRailDate}>{topRun.dateLabel}</span>
                </div>
              )}
              <div
                className={styles.runBaseline}
                style={{ gridRow: 2, gridColumn: "2 / 13" }}
                aria-hidden="true"
              />
              {columns.map((col) => {
                if (col.past) {
                  const actual = actualByDate.get(col.date)?.max ?? null;
                  return (
                    <div
                      key={`top-${col.date}`}
                      className={styles.dayCell}
                      style={{ gridRow: 2, gridColumn: col.colIndex }}
                    >
                      <NestedDayBars
                        night={actual}
                        day={null}
                        nightKind="actual"
                        pastActual
                        maxScale={maxScale}
                        maxPx={maxPx}
                      />
                    </div>
                  );
                }
                if (col.today) {
                  const actual = actualByDate.get(col.date)?.max ?? null;
                  const dayValue = topRun.daysByDate.get(col.date)?.day ?? null;
                  return (
                    <div
                      key={`top-${col.date}`}
                      className={styles.dayCell}
                      style={{ gridRow: 2, gridColumn: col.colIndex }}
                    >
                      <NestedDayBars
                        night={actual}
                        day={dayValue}
                        nightKind="actual"
                        maxScale={maxScale}
                        maxPx={maxPx}
                      />
                    </div>
                  );
                }
                const entry = topRun.daysByDate.get(col.date);
                return (
                  <div
                    key={`top-${col.date}`}
                    className={styles.dayCell}
                    style={{ gridRow: 2, gridColumn: col.colIndex }}
                  >
                    <NestedDayBars
                      night={entry?.night ?? null}
                      day={entry?.day ?? null}
                      maxScale={maxScale}
                      maxPx={maxPx}
                    />
                  </div>
                );
              })}

              {columns.map((col) => (
                <div
                  key={`axis-${col.date}`}
                  className={[
                    styles.axisCell,
                    col.today ? styles.axisToday : "",
                    col.weekend ? styles.axisWeekend : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ gridColumn: col.colIndex }}
                >
                  {col.today && (
                    <div className={styles.todayPairLabels} aria-hidden="true">
                      <span>N</span>
                      <span>D</span>
                    </div>
                  )}
                  <span className={styles.axisWeekday}>
                    {col.weekdayInitial}
                  </span>
                  <span className={styles.axisDayNum}>{col.dayNum}</span>
                </div>
              ))}

              {expanded && (
                <div className={styles.historyIntro}>
                  <span>Same chart from earlier days</span>
                  {changeSummary && (
                    <span className={styles.historyTrend}>{changeSummary}</span>
                  )}
                </div>
              )}

              {expanded &&
                historyRuns.map((run, idx) => {
                  const gridRow = 5 + idx;
                  return (
                    <div key={run.date} style={{ display: "contents" }}>
                      <div className={styles.yRail} style={{ gridRow }}>
                        <span>{run.ageLabel}</span>
                        <span className={styles.yRailDate}>
                          {run.dateLabel}
                        </span>
                      </div>
                      <div
                        className={`${styles.runBaseline} ${styles.histBaseline}`}
                        style={{
                          gridRow,
                          gridColumn: "2 / 13",
                        }}
                        aria-hidden="true"
                      />
                      {columns.map((col) => {
                        if (col.date < run.date) {
                          const actual = actualByDate.get(col.date)?.max ?? null;
                          return (
                            <div
                              key={`${run.date}-${col.date}`}
                              className={styles.dayCell}
                              style={{ gridRow, gridColumn: col.colIndex }}
                            >
                              <NestedDayBars
                                night={actual}
                                day={null}
                                nightKind="actual"
                                pastActual
                                muted
                                maxScale={maxScale}
                                maxPx={maxPx}
                              />
                            </div>
                          );
                        }
                        if (col.date === run.date) {
                          const actual = actualByDate.get(col.date)?.max ?? null;
                          const dayValue =
                            run.daysByDate.get(col.date)?.day ?? null;
                          return (
                            <div
                              key={`${run.date}-${col.date}`}
                              className={styles.dayCell}
                              style={{ gridRow, gridColumn: col.colIndex }}
                            >
                              <NestedDayBars
                                night={actual}
                                day={dayValue}
                                nightKind="actual"
                                pastActual
                                muted
                                maxScale={maxScale}
                                maxPx={maxPx}
                              />
                            </div>
                          );
                        }
                        const entry = run.daysByDate.get(col.date);
                        return (
                          <div
                            key={`${run.date}-${col.date}`}
                            className={styles.dayCell}
                            style={{ gridRow, gridColumn: col.colIndex }}
                          >
                            <NestedDayBars
                              night={entry?.night ?? null}
                              day={entry?.day ?? null}
                              muted
                              maxScale={maxScale}
                              maxPx={maxPx}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

              {columns.map((col) => {
                const isSelected = selectedDate === col.date;
                return (
                  <button
                    key={`hit-${col.date}`}
                    type="button"
                    className={styles.colHit}
                    style={{ gridColumn: col.colIndex, gridRow: hitSpan }}
                    aria-pressed={isSelected}
                    aria-label={`Inspect ${col.shortLabel}`}
                    onClick={() =>
                      setSelectedDate((prev) =>
                        prev === col.date ? null : col.date,
                      )
                    }
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.footerBar}>
          {historyCount > 0 ? (
            <button
              type="button"
              className={styles.historyToggle}
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? (
                <ChevronUp size={14} aria-hidden="true" />
              ) : (
                <ChevronDown size={14} aria-hidden="true" />
              )}
              <span>
                {expanded
                  ? "Hide forecast changes"
                  : "See how the forecast is changing"}
              </span>
            </button>
          ) : (
            <span />
          )}
          <span className={styles.keyText}>N 4p–9a · D 9a–4p</span>
        </div>
      </div>
    </div>
  );
}
