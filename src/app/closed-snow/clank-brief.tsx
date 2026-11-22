import type { Brief } from "@/lib/closed-snow-brief";
import styles from "./snow.module.css";

const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" });
const passes = { epic: "Epic", ikon: "Ikon" };
const trendLabel = { up: "↑ Trending up", down: "↓ Trending down", steady: "→ Steady", new: "New" };

function cycleLabel(initializedAt: string) {
  const hour = new Date(initializedAt).getUTCHours();
  return `${String(hour).padStart(2, "0")}Z blend`;
}

export function ClankBrief({ brief }: { brief: Brief | null }) {
  if (!brief) return null;
  const outlook = brief.modelOutlook;
  return (
    <section className={styles.clank} aria-labelledby="clank-heading">
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
      {outlook && (
        <div className={styles.modelOutlook} aria-label="Model snow outlook">
          <div className={styles.modelOutlookHeader}>
            <h3>Model outlook</h3>
            <span>{cycleLabel(outlook.initializedAt)}</span>
          </div>
          {outlook.events.length > 0 ? (
            <ul className={styles.modelEvents}>
              {outlook.events.map((event) => (
                <li key={event.window} className={styles.modelEvent}>
                  <div className={styles.modelEventTop}>
                    <strong className={styles.modelWindow}>{event.window}</strong>
                    <span className={styles.modelSnow}>{event.snowfall}</span>
                    <span className={styles.modelTrend} data-trend={event.trend}>{trendLabel[event.trend]}</span>
                  </div>
                  <p className={styles.modelDetail}>{event.agreement}. {event.trendNote}.</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.modelSummary}>{outlook.summary}</p>
          )}
          <p className={styles.modelCredit}>{outlook.attribution}</p>
        </div>
      )}
    </section>
  );
}
