import type { Brief } from "@/lib/closed-snow-brief";
import type { ForecastFeed } from "@/lib/closed-snow-forecast";
import styles from "./snow.module.css";

const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" });
const passes = { epic: "Epic", ikon: "Ikon" };
const trendLabel = { up: "↑ Trending up", down: "↓ Trending down", steady: "→ Steady", new: "New" };

export function ClankBrief({
  brief,
  forecast,
}: {
  brief: Brief | null;
  forecast?: ForecastFeed | null;
}) {
  const outlook = forecast?.outlook ?? brief?.modelOutlook ?? null;
  if (!brief && !outlook) return null;
  return (
    <section className={styles.clank} aria-labelledby={brief ? "clank-heading" : "outlook-heading"}>
      {brief && (
        <>
          <div className={styles.clankHeader}>
            <h2 id="clank-heading">Morning brief</h2>
            <time dateTime={brief.generatedAt}>{time.format(new Date(brief.generatedAt))} MT</time>
          </div>
          {brief.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {brief.picks.length > 0 && (
            <ul className={styles.clankPicks}>
              {brief.picks.map((pick) => (
                <li key={`${pick.date}-${pick.kind}-${pick.scope}`}>
                  <strong>
                    {pick.kind === "watch" ? `${weekday.format(new Date(`${pick.date}T00:00Z`))} watch` : "Today’s pick"}
                    {pick.pass ? ` · ${passes[pick.pass]}` : ""}: {pick.resortName}.
                  </strong>{" "}{pick.reason}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {outlook && (
        <div
          className={brief ? styles.modelOutlook : styles.modelOutlookSolo}
          aria-label="7-day snow outlook"
        >
          <div className={styles.modelOutlookHeader}>
            <h3 id={brief ? undefined : "outlook-heading"}>7-day snow outlook</h3>
          </div>
          {outlook.events.length > 0 ? (
            <ul className={styles.modelEvents}>
              {outlook.events.map((event) => {
                const hasRegions = !!event.regions?.length;
                return (
                  <li key={event.window} className={styles.modelEvent}>
                    <div className={styles.modelEventTop}>
                      <strong className={styles.modelWindow}>{event.window}</strong>
                      {!hasRegions && (
                        <span className={styles.modelSnow}>{event.snowfall}</span>
                      )}
                      <span className={styles.modelTrend} data-trend={event.trend}>
                        {trendLabel[event.trend]}
                      </span>
                    </div>
                    {hasRegions && (
                      <p className={styles.modelRegions}>
                        {event.regions!.map((region, index) => (
                          <span key={region.id} className={styles.modelRegionItem}>
                            {index > 0 && (
                              <span className={styles.modelRegionSep} aria-hidden="true">
                                ·
                              </span>
                            )}
                            <span className={region.lead ? styles.modelRegionLead : undefined}>
                              {region.label}{" "}
                              <strong
                                className={
                                  region.lead
                                    ? styles.modelRegionSnowLead
                                    : styles.modelRegionSnow
                                }
                              >
                                {region.snowfall}
                              </strong>
                            </span>
                          </span>
                        ))}
                      </p>
                    )}
                    <p className={styles.modelDetail}>
                      {hasRegions && event.confidence
                        ? `${event.confidence} · ${event.trendNote}.`
                        : `${event.agreement}. ${event.trendNote}.`}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.modelSummary}>{outlook.summary}</p>
          )}
        </div>
      )}
    </section>
  );
}
