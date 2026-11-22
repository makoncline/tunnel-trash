"use client";

import { AlertTriangle, ChevronRight, ExternalLink } from "lucide-react";
import { isMajorRoadAlert, type RoadAlert, type RoadsFeed } from "@/lib/closed-snow-roads";
import styles from "./snow.module.css";

const alertClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  hour: "numeric",
  minute: "2-digit",
});

const kindLabels: Record<RoadAlert["kind"], string> = {
  closure: "Closure",
  "chain-law": "Chain law",
  "traction-law": "Traction law",
  incident: "Incident",
};

function summarizeHeadline(alerts: RoadAlert[]): string {
  const closures = alerts.filter((a) => a.kind === "closure");
  const chainLaws = alerts.filter((a) => a.kind === "chain-law");
  const tractionLaws = alerts.filter((a) => a.kind === "traction-law");
  const incidents = alerts.filter((a) => a.kind === "incident");
  const parts: string[] = [];

  const routeList = (items: RoadAlert[]) =>
    [...new Set(items.map((item) => item.route))].join(", ");

  if (closures.length) parts.push(`Closed: ${routeList(closures)}`);
  if (chainLaws.length) parts.push(`Chain law: ${routeList(chainLaws)}`);
  if (tractionLaws.length) parts.push(`Traction law: ${routeList(tractionLaws)}`);
  if (incidents.length && parts.length < 2) {
    parts.push(`Incident: ${routeList(incidents)}`);
  }
  return parts.join(" · ");
}

export function RoadBanner({ roads }: { roads: RoadsFeed | null }) {
  const alerts = (roads?.corridorAlerts ?? []).filter(isMajorRoadAlert);
  if (!alerts.length) return null;

  const hasClosure = alerts.some((alert) => alert.kind === "closure");
  const headline = summarizeHeadline(alerts);

  return (
    <details
      className={`${styles.roadBanner}${hasClosure ? ` ${styles.roadBannerSevere}` : ""}`}
    >
      <summary className={styles.roadBannerSummary}>
        <AlertTriangle size={14} className={styles.roadBannerIcon} aria-hidden="true" />
        <span className={styles.roadBannerTitle}>{headline}</span>
        <span className={styles.roadBannerCount}>
          {alerts.length} {alerts.length === 1 ? "alert" : "alerts"}
        </span>
        <ChevronRight size={15} className={styles.roadBannerChevron} aria-hidden="true" />
      </summary>
      <ul className={styles.roadAlertList}>
        {alerts.map((alert) => (
          <li key={alert.id} className={styles.roadAlertItem}>
            <div className={styles.roadAlertTop}>
              <span
                className={`${styles.roadAlertTag}${
                  alert.kind === "closure" ? ` ${styles.roadAlertTagSevere}` : ""
                }`}
              >
                {kindLabels[alert.kind]}
              </span>
              <strong>{alert.route}</strong>
              <span className={styles.roadAlertName}>{alert.title}</span>
              {alert.updatedAt && (
                <time dateTime={alert.updatedAt} className={styles.roadAlertTime}>
                  {alertClock.format(new Date(alert.updatedAt))}
                </time>
              )}
            </div>
            {alert.summary && <p className={styles.roadAlertSummary}>{alert.summary}</p>}
          </li>
        ))}
      </ul>
      <div className={styles.roadBannerFooter}>
        <a href="https://maps.cotrip.org/" target="_blank" rel="noreferrer">
          Open COtrip map <ExternalLink size={11} aria-hidden="true" />
        </a>
      </div>
    </details>
  );
}
