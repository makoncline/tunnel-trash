import styles from "./snow.module.css";
export default function Loading() {
  return (
    <main className={styles.page}>
      <header className={styles.toolbar}>
        <h1>Closed Snow</h1>
      </header>
      <p className={styles.loading} role="status">
        Loading cameras…
      </p>
    </main>
  );
}
