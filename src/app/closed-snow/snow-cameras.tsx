"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { z } from "zod";
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
  CLOSED_SNOW_ORIGIN,
  CONDITIONS_DELAY_MS,
  CONDITIONS_STALE_MS,
  SNOW_REPORTS_OFFLINE,
  conditionsFreshness,
  denverDateString,
  isSameCapture,
  loadConditions,
  loadFeed,
  type Camera,
  type Clip,
  type Conditions,
  type Feed,
} from "@/lib/closed-snow";
import {
  createBrowserAnalyticsTracker,
  type RecordAnalyticsAction,
} from "@/lib/closed-snow-analytics";
import { currentBrief, loadBrief, type Brief } from "@/lib/closed-snow-brief";
import { currentForecast, loadForecast, type ForecastFeed } from "@/lib/closed-snow-forecast";
import { normalizePinnedResorts, togglePinnedResort } from "@/lib/closed-snow-pins";
import { loadRoads, type RoadsFeed } from "@/lib/closed-snow-roads";
import {
  buildDocumentRefreshUrl,
  cleanRefreshParams,
  EXPECTED_BUILD_QUERY_PARAM,
  parseReloadGuard,
  RELOADED_BUILD_STORAGE_KEY,
  shouldAutoReloadForBuild,
} from "@/lib/closed-snow-version";
import type { SkiDay } from "@/lib/closed-snow-weather";
import styles from "./snow.module.css";
import { ClankBrief } from "./clank-brief";
import { FeedbackForm } from "./feedback-form";
import { RoadBanner } from "./road-banner";
import { SupportFooter } from "./support-footer";
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
const clockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  hour: "numeric",
  minute: "2-digit",
});
const reportDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  month: "short",
  day: "numeric",
});
const shortClock = (at: number) =>
  clockFormat
    .format(new Date(at))
    .replace(/\s*AM$/i, "a")
    .replace(/\s*PM$/i, "p");
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
const PULL_THRESHOLD = 60;
const PULL_MAX = 96;
const PULL_HOLD = 44;
const PULL_START_SLOP = 10;

const defaultFilters: ResortFilters = {
  pass: "all",
  openOnly: false,
  newSnowOnly: false,
  sortBy: "fresh",
};
const preferencesKey = "closed-snow:prefs:v1";
const preferencesSchema = z
  .object({
    filters: z
      .object({
        pass: z.enum(["all", "epic", "ikon"]),
        openOnly: z.boolean(),
        newSnowOnly: z.boolean(),
        sortBy: z.enum(["fresh", "week", "base", "drive"]),
      })
      .strict(),
    gauges: z.enum(["back", "diagonal", "off"]),
    pinned: z.array(z.string().min(1).max(40)).max(20).optional().default([]),
  })
  .strict();
type GaugePlacement = z.infer<typeof preferencesSchema>["gauges"];

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
  if (date > today) return `Overnight · ${formatted}`;
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
  activeClip,
  onPlay,
  clear = false,
  gauges = "back",
}: {
  camera: Camera;
  activeClip: { clip: Clip; source: Camera } | null;
  onPlay: (kind: Clip["kind"]) => void;
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
        onPlay={() => onPlay(activeClip.clip.kind)}
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
  roads,
  forecast,
  shirtPrice,
  buildId,
}: {
  current: Feed;
  morning: Feed;
  conditions: Conditions;
  asOf: number;
  brief: Brief | null;
  weather: SkiDay | null;
  roads: RoadsFeed | null;
  forecast: ForecastFeed | null;
  shirtPrice: string;
  buildId: string;
}) {
  const [latestBrief, setLatestBrief] = useState(brief);
  const [latestRoads, setLatestRoads] = useState(roads);
  const [latestForecast, setLatestForecast] = useState(forecast);
  const [feeds, setFeeds] = useState({ current, morning });
  const [resorts, setResorts] = useState(conditions);
  const [mode, setMode] = useState<CameraMode>("morning");
  const [filters, setFilters] = useState<ResortFilters>(defaultFilters);
  const [overrides, setOverrides] = useState<Record<string, CameraMode>>({});
  const [selected, setSelected] = useState<{ resortId: string; name: string } | null>(null);
  const [media, setMedia] = useState("morning");
  const [gauges, setGauges] = useState<GaugePlacement>("back");
  const [pinned, setPinned] = useState<string[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [checkedAt, setCheckedAt] = useState(Math.max(asOf, conditions.checkedAt));
  const [refreshedAt, setRefreshedAt] = useState(Math.max(asOf, conditions.checkedAt));
  const initialCheckedAtRef = useRef(Math.max(asOf, conditions.checkedAt));
  const lastVersionCheckRef = useRef(0);
  const versionCheckInFlightRef = useRef<Promise<boolean> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const pullRef = useRef({ active: false, engaged: false, startX: 0, startY: 0, distance: 0 });
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const analytics = useRef<ReturnType<typeof createBrowserAnalyticsTracker>>(null);
  const reportsAvailable = resorts.entries.length > 0;
  const freshness = conditionsFreshness(resorts, checkedAt);
  const reportBuiltAt = Date.parse(resorts.builtAt ?? "");
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
  const headingRawDate =
    feeds.morning.date ??
    (reportsAvailable ? (resorts.entries[0]?.skiDay.date ?? null) : null);
  const headingDate = skiDayHeading(headingRawDate, checkedAt);
  const filterTags = [
    filters.pass !== "all" ? filters.pass : null,
    filters.openOnly ? "open" : null,
    filters.newSnowOnly ? "new-snow" : null,
    filters.sortBy !== "fresh" ? `sort:${filters.sortBy}` : null,
  ].filter(Boolean);
  const filterSummary = filterTags.length ? filterTags.join(", ") : "all";
  const hasFilters = filterTags.length > 0;

  useEffect(() => {
    analytics.current ??= createBrowserAnalyticsTracker(
      CLOSED_SNOW_ORIGIN,
      denverDateString(Date.now()),
    );
    return analytics.current?.start();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = localStorage.getItem(preferencesKey);
        if (stored === null) return;
        const parsed = preferencesSchema.safeParse(JSON.parse(stored));
        if (parsed.success) {
          setFilters(parsed.data.filters);
          setGauges(parsed.data.gauges);
          setPinned(normalizePinnedResorts(parsed.data.pinned));
        }
      } catch {
        return;
      } finally {
        setPreferencesLoaded(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    try {
      localStorage.setItem(preferencesKey, JSON.stringify({ filters, gauges, pinned }));
    } catch {
      return;
    }
  }, [filters, gauges, pinned, preferencesLoaded]);

  const triggerDocumentRefresh = useCallback(() => {
    setRefreshing(true);
    window.location.replace(
      buildDocumentRefreshUrl(window.location.href, String(Date.now())),
    );
  }, []);

  const checkForAppUpdate = useCallback(() => {
    if (buildId === "dev") return Promise.resolve(false);
    if (versionCheckInFlightRef.current) return versionCheckInFlightRef.current;
    const now = Date.now();
    if (now - lastVersionCheckRef.current < 60_000) {
      return Promise.resolve(false);
    }

    const run = (async () => {
      const fetchRemoteBuild = async (): Promise<string | null> => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await fetch("/api/closed-snow/version", {
              cache: "no-store",
              signal: AbortSignal.timeout(4000),
            });
            if (!response.ok) return null;
            const payload = (await response.json()) as { buildId?: unknown };
            lastVersionCheckRef.current = Date.now();
            return typeof payload.buildId === "string" ? payload.buildId : null;
          } catch {
            if (attempt === 1) return null;
          }
        }
        return null;
      };

      const remoteBuild = await fetchRemoteBuild();
      if (!remoteBuild || document.visibilityState !== "visible") return false;

      const checkTime = Date.now();
      const expectedBuildInUrl = new URLSearchParams(window.location.search).get(
        EXPECTED_BUILD_QUERY_PARAM,
      );
      let guard = null;
      try {
        guard = parseReloadGuard(sessionStorage.getItem(RELOADED_BUILD_STORAGE_KEY));
      } catch {
        guard = null;
      }

      if (
        shouldAutoReloadForBuild({
          currentBuild: buildId,
          remoteBuild,
          expectedBuildInUrl,
          guard,
          now: checkTime,
        })
      ) {
        try {
          sessionStorage.setItem(
            RELOADED_BUILD_STORAGE_KEY,
            JSON.stringify({ build: remoteBuild, at: checkTime }),
          );
        } catch {
          // URL marker still bounds automatic retries when storage is blocked.
        }
        window.location.replace(
          buildDocumentRefreshUrl(
            window.location.href,
            String(checkTime),
            remoteBuild,
          ),
        );
        return true;
      }
      return false;
    })().finally(() => {
      versionCheckInFlightRef.current = null;
    });

    versionCheckInFlightRef.current = run;
    return run;
  }, [buildId]);

  const refreshFeeds = useCallback(
    async (force = false) => {
      const now = Date.now();
      setCheckedAt(now);
      if ((!force && document.hidden) || refreshingRef.current) return;
      refreshingRef.current = true;
      setRefreshing(true);
      try {
        const reports = loadConditions().then((nextConditions) => {
          setResorts(nextConditions);
          const stamped = Date.now();
          setCheckedAt(stamped);
          setRefreshedAt(stamped);
        });
        const cameras = Promise.all([loadFeed("current"), loadFeed("morning")]).then(
          ([nextCurrent, nextMorning]) => {
            setFeeds((previous) => ({
              current: nextCurrent.entries.length ? nextCurrent : previous.current,
              morning: nextMorning.entries.length ? nextMorning : previous.morning,
            }));
            const stamped = Date.now();
            setCheckedAt(stamped);
            setRefreshedAt(stamped);
          },
        );
        const nextBrief = loadBrief().then((value) => {
          if (value) setLatestBrief(value);
        });
        const nextRoads = loadRoads().then((value) => {
          if (value) setLatestRoads(value);
        });
        const nextForecast = loadForecast().then((value) => {
          if (value) setLatestForecast(value);
        });
        await Promise.all([reports, cameras, nextBrief, nextRoads, nextForecast]);
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    const cleaned = cleanRefreshParams(window.location.href, buildId);
    if (cleaned.nextUrl) {
      window.history.replaceState(null, "", cleaned.nextUrl);
    }
    const timer = setInterval(() => {
      void refreshFeeds();
    }, 60_000);
    const onVisible = () => {
      if (document.hidden) return;
      void checkForAppUpdate().then((reloading) => {
        if (!reloading) void refreshFeeds();
      });
    };
    const initialClock = setTimeout(() => {
      void checkForAppUpdate().then((reloading) => {
        if (reloading) return;
        if (
          cleaned.hadManualRefresh ||
          Date.now() - initialCheckedAtRef.current >= 60_000
        ) {
          void refreshFeeds(cleaned.hadManualRefresh);
        } else {
          setCheckedAt(Date.now());
        }
      });
    }, 0);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      clearInterval(timer);
      clearTimeout(initialClock);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [buildId, checkForAppUpdate, refreshFeeds]);

  useEffect(() => {
    const resetPull = () => {
      pullRef.current.active = false;
      pullRef.current.engaged = false;
      pullRef.current.distance = 0;
      setPullDistance(0);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (
        event.touches.length !== 1 ||
        window.scrollY > 0 ||
        document.querySelector('[data-slot="dialog-content"]')
      ) {
        return;
      }
      const target =
        event.target instanceof Element
          ? event.target
          : ((event.target as Node | null)?.parentElement ?? null);
      if (target?.closest('input, textarea, select, [role="slider"]')) return;
      const touch = event.touches[0]!;
      pullRef.current = {
        active: true,
        engaged: false,
        startX: touch.clientX,
        startY: touch.clientY,
        distance: 0,
      };
    };
    const onTouchMove = (event: TouchEvent) => {
      const state = pullRef.current;
      if (!state.active) return;
      if (
        event.touches.length !== 1 ||
        window.scrollY > 0 ||
        document.querySelector('[data-slot="dialog-content"]')
      ) {
        resetPull();
        return;
      }
      const touch = event.touches[0]!;
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;
      if (!state.engaged) {
        if (dy <= PULL_START_SLOP) {
          if (Math.abs(dx) > 12 || dy < -8) state.active = false;
          return;
        }
        if (Math.abs(dx) > dy) {
          state.active = false;
          return;
        }
        state.engaged = true;
      }
      if (dy <= 0) {
        state.distance = 0;
        setPullDistance(0);
        return;
      }
      event.preventDefault();
      const damped = Math.min(
        PULL_MAX,
        PULL_MAX * (1 - Math.exp(-(dy - PULL_START_SLOP) / 150)),
      );
      state.distance = damped;
      setPullDistance(damped);
    };
    const onTouchEnd = () => {
      const state = pullRef.current;
      if (!state.active) return;
      const triggered = state.engaged && state.distance >= PULL_THRESHOLD;
      state.active = false;
      state.engaged = false;
      state.distance = 0;
      if (!triggered) {
        setPullDistance(0);
        return;
      }
      setPullRefreshing(true);
      setPullDistance(PULL_HOLD);
      analytics.current?.record("refresh_click");
      triggerDocumentRefresh();
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", resetPull, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", resetPull);
    };
  }, [triggerDocumentRefresh]);

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
    const thresholds = [
      reportBuiltAt + CONDITIONS_DELAY_MS,
      reportBuiltAt + CONDITIONS_STALE_MS + 1,
    ].filter((at) => at > checkedAt);
    const nextCheck = Math.min(nextMinute, ...thresholds);
    const timer = setTimeout(
      () => setCheckedAt(Date.now()),
      Math.max(0, nextCheck - now),
    );
    return () => clearTimeout(timer);
  }, [checkedAt, reportBuiltAt, reportsAvailable]);

  const recordAction: RecordAnalyticsAction = (kind, target) => {
    analytics.current?.record(kind, target);
  };

  function setGlobalMode(next: CameraMode) {
    recordAction("mode_switch", next);
    setMode(next);
    setOverrides({});
  }

  function setCardMode(resortId: string, next: CameraMode) {
    recordAction("mode_switch", next);
    setOverrides((previous) => {
      const updated = { ...previous };
      if (next === mode) delete updated[resortId];
      else updated[resortId] = next;
      return updated;
    });
  }

  function togglePin(resortId: string) {
    const wasPinned = pinned.includes(resortId);
    recordAction("filter_change", `${wasPinned ? "unpin" : "pin"}:${resortId}`);
    setPinned((prev) => togglePinnedResort(prev, resortId));
  }

  function setPass(pass: PassFilter) {
    recordAction("filter_change", `pass:${pass}`);
    setFilters((prev) => ({ ...prev, pass }));
  }

  function resetFilters() {
    recordAction("filter_change", "reset");
    setFilters(defaultFilters);
  }

  function selectCameraMode(next: CameraMode) {
    recordAction("mode_switch", next);
    setMedia(next);
  }

  function open(target: OpenCameraTarget, button: HTMLButtonElement) {
    recordAction("camera_open", target.resortId);
    returnFocus.current = button;
    const m = findCamera(feeds.morning, target.resortId);
    const c = findCamera(feeds.current, target.resortId);
    const hasM = !!m && m.morning?.basis !== "unavailable";
    const resolvedMedia =
      target.initialMedia === "morning" && !hasM && c ? "now" : target.initialMedia;
    setSelected({ resortId: target.resortId, name: target.name });
    setMedia(resolvedMedia);
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

  const isOvernightRollover =
    headingRawDate !== null && headingRawDate > denverDateString(checkedAt);
  const openSeasonResorts = reportsAvailable
    ? resorts.entries.filter(
        (entry) =>
          entry.season.status === "open" || entry.operatingStatus.value === "open",
      )
    : [];
  const reportedOpenCount = openSeasonResorts.filter(
    (entry) => entry.report.status === "current",
  ).length;
  const showMorningProgress =
    !isOvernightRollover &&
    openSeasonResorts.length > 0 &&
    reportedOpenCount < openSeasonResorts.length;
  const refreshLabel = shortClock(refreshedAt);
  const updatingFromCache = refreshing && freshness !== "fresh";
  let freshMetaLabel: string | null = null;
  if (updatingFromCache) {
    freshMetaLabel = "Updating…";
  } else if (freshness === "fresh") {
    freshMetaLabel = showMorningProgress
      ? `${reportedOpenCount}/${openSeasonResorts.length} open reported · ${refreshLabel}`
      : `Updated ${refreshLabel}`;
  } else if (freshness === "delayed") {
    freshMetaLabel = `Delayed · ${shortClock(reportBuiltAt)}`;
  } else if (freshness === "stale") {
    const reportTime = shortClock(reportBuiltAt);
    const reportStamp =
      denverDateString(reportBuiltAt) === denverDateString(checkedAt)
        ? reportTime
        : `${reportDateFormat.format(reportBuiltAt)}, ${reportTime}`;
    freshMetaLabel = `Stale · ${reportStamp}`;
  }

  return (
    <main className={styles.page}>
      <div
        className={styles.pullIndicator}
        data-pulling={pullDistance > 0 && !pullRefreshing ? "true" : undefined}
        data-ready={pullDistance >= PULL_THRESHOLD && !pullRefreshing ? "true" : undefined}
        data-refreshing={pullRefreshing ? "true" : undefined}
        style={{ height: pullDistance }}
        aria-live="polite"
        aria-hidden={pullDistance === 0 && !pullRefreshing}
      >
        {(pullDistance > 0 || pullRefreshing) && (
          <div className={styles.pullPill}>
            <RefreshCw
              size={13}
              className={pullRefreshing ? styles.spinning : undefined}
              style={
                pullRefreshing
                  ? undefined
                  : { transform: `rotate(${Math.round((pullDistance / PULL_THRESHOLD) * 180)}deg)` }
              }
              aria-hidden="true"
            />
            <span>
              {pullRefreshing
                ? "Refreshing…"
                : pullDistance >= PULL_THRESHOLD
                  ? "Release to refresh"
                  : "Pull to refresh"}
            </span>
          </div>
        )}
      </div>
      <header className={styles.toolbar}>
        <h1>Closed Snow</h1>
        <div className={styles.toolbarMeta}>
          <div className={styles.toolbarText}>
            {headingDate && <p className={styles.dayContext}>{headingDate}</p>}
            {freshMetaLabel && (
              <span
                className={styles.freshMeta}
                data-freshness={updatingFromCache ? "fresh" : freshness}
              >
                {freshMetaLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            className={styles.refreshButton}
            aria-label="Refresh reports and cameras"
            title="Refresh reports and cameras"
            onClick={() => {
              recordAction("refresh_click");
              triggerDocumentRefresh();
            }}
          >
            <RefreshCw
              size={13}
              className={refreshing ? styles.spinning : undefined}
              aria-hidden="true"
            />
          </button>
        </div>
      </header>
      {(() => {
        const activeBrief = currentBrief(latestBrief, checkedAt) ? latestBrief : null;
        const activeForecast = currentForecast(latestForecast, checkedAt)
          ? latestForecast
          : null;
        return (
          <ClankBrief
            brief={activeBrief}
            forecast={activeForecast}
            pinnedResorts={pinned}
          />
        );
      })()}
      <RoadBanner roads={latestRoads} />
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
            onClick={() => {
              recordAction("filter_change", filters.openOnly ? "open:off" : "open:on");
              setFilters((prev) => ({ ...prev, openOnly: !prev.openOnly }));
            }}
          >
            Open
          </button>
          <button
            type="button"
            className={styles.filterChip}
            aria-pressed={filters.newSnowOnly}
            onClick={() => {
              recordAction("filter_change", filters.newSnowOnly ? "new-snow:off" : "new-snow:on");
              setFilters((prev) => ({ ...prev, newSnowOnly: !prev.newSnowOnly }));
            }}
          >
            New snow
          </button>
          <label className={styles.sortWrap}>
            <span className="sr-only">Sort resorts</span>
            <select
              className={styles.sortSelect}
              aria-label="Sort resorts"
              value={filters.sortBy}
              onChange={(event) => {
                const sortBy = event.currentTarget.value as SortBy;
                recordAction("sort_change", sortBy);
                setFilters((prev) => ({ ...prev, sortBy }));
              }}
            >
              <option value="fresh">Sort: Fresh</option>
              <option value="week">Sort: 5-day</option>
              <option value="base">Sort: Base</option>
              {latestRoads && <option value="drive">Sort: Drive</option>}
            </select>
          </label>
          {hasFilters && (
            <button
              type="button"
              className={styles.filterReset}
              onClick={resetFilters}
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
          roads={latestRoads}
          forecast={currentForecast(latestForecast, checkedAt) ? latestForecast : null}
          mode={mode}
          filters={filters}
          onResetFilters={resetFilters}
          overrides={overrides}
          onCardMode={setCardMode}
          pinnedResorts={pinned}
          onTogglePin={togglePin}
          open={open}
          recordAction={recordAction}
        />
      ) : (
        <>
          <p className={styles.notice} role="status">{SNOW_REPORTS_OFFLINE}</p>
          <AvailableStakes
            morning={feeds.morning}
            current={feeds.current}
            now={checkedAt}
            weather={activeWeather}
            roads={latestRoads}
            mode={mode}
            overrides={overrides}
            onCardMode={setCardMode}
            pinnedResorts={pinned}
            onTogglePin={togglePin}
            open={open}
            recordAction={recordAction}
          />
        </>
      )}
      <SupportFooter shirtPrice={shirtPrice} />
      {(() => {
        const activeForecast = currentForecast(latestForecast, checkedAt)
          ? latestForecast
          : null;
        const activeBrief = currentBrief(latestBrief, checkedAt) ? latestBrief : null;
        const attribution =
          activeForecast?.attribution ??
          activeForecast?.outlook?.attribution ??
          activeBrief?.modelOutlook?.attribution ??
          null;
        return attribution ? <p className={styles.pageCredit}>{attribution}</p> : null;
      })()}
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
            <span className={styles.viewerHandle} aria-hidden="true" />
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
            <div className={styles.viewerBody}>
              <CameraMedia
                key={`${activeCamera.cameraId}-${media}`}
                camera={activeCamera}
                activeClip={activeClip}
                onPlay={(kind) => recordAction("clip_play", `${selected.resortId}:${kind}`)}
                clear={clear}
                gauges={gauges}
              />
              <div className={styles.viewerFooter}>
                <div className={styles.controls}>
                  {usableMorning && (
                    <Button
                      variant="outline"
                      aria-pressed={media === "morning"}
                      onClick={() => selectCameraMode("morning")}
                    >
                      {morningLabel}
                    </Button>
                  )}
                  {nowCamera && (!usableMorning || distinctDialogNow) && (
                    <Button
                      variant="outline"
                      aria-pressed={media === "now"}
                      onClick={() => selectCameraMode("now")}
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
                        onClick={() => {
                          if (media !== clip.kind) {
                            recordAction("clip_play", `${selected.resortId}:${clip.kind}`);
                          }
                          setMedia(clip.kind);
                        }}
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
                      : `${selectionLabel(activeCamera, showingNow)}${activeCamera.clearedReference ? " · Hold photo for clear" : ""}`}
                </p>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </main>
  );
}
