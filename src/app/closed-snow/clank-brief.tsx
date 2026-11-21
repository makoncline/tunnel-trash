import type { Brief } from "@/lib/closed-snow-brief";
import styles from "./snow.module.css";

const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" });
const passes = { epic: "Epic", ikon: "Ikon" };

export function ClankBrief({ brief }: { brief: Brief | null }) {
  if (!brief) return null;
  return (
    <section className={styles.clank} aria-labelledby="clank-heading">
      <div className={styles.clankHeader}>
        <h2 id="clank-heading">Clank’s morning brief</h2>
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
    </section>
  );
}
