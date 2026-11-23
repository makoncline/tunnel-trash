import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import styles from "./snow.module.css";

const STRIPE_SUPPORT_URL = "https://profile.stripe.com/@makoncline";

export function SupportFooter({ shirtPrice }: { shirtPrice: string }) {
  return (
    <aside className={styles.supportCard} aria-label="Support Closed Snow">
      <Link href="/" className={styles.supportMedia}>
        <Image
          src="/assets/back_large.png"
          alt="Tunnel Trash Eisenhower Tee"
          width={88}
          height={88}
          className={styles.supportImage}
        />
      </Link>
      <div className={styles.supportBody}>
        <h2 className={styles.supportTitle}>Support Closed Snow</h2>
        <p className={styles.supportText}>
          Free snow stakes and morning briefs. Grab an Eisenhower Tee or leave a
          tip to help keep it running.
        </p>
      </div>
      <div className={styles.supportActions}>
        <Link href="/" className={styles.supportPrimary}>
          Eisenhower Tee · ${shirtPrice}
        </Link>
        <a
          href={STRIPE_SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.supportSecondary}
        >
          Leave a tip
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
    </aside>
  );
}
