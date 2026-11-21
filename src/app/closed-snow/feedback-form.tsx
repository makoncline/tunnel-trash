"use client";

import { type FormEvent, useState, useSyncExternalStore } from "react";
import { CLOSED_SNOW_ORIGIN } from "@/lib/closed-snow";
import styles from "./snow.module.css";

const subscribe = () => () => undefined;
const hydrated = () => true;
const serverRendered = () => false;

export function FeedbackForm() {
  const ready = useSyncExternalStore(subscribe, hydrated, serverRendered);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setPending(true);
    setStatus("");
    try {
      const response = await fetch(`${CLOSED_SNOW_ORIGIN}/v1/feedback`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({ kind: fields.get("kind"), message: fields.get("message") }),
      });
      if (response.status === 201) {
        form.reset();
        setStatus("Thanks. Your note is saved.");
        return;
      }
      const result: unknown = await response.json().catch(() => null);
      setStatus(result && typeof result === "object" && "error" in result && typeof result.error === "string"
        ? result.error : "Could not confirm the submission. Please try again.");
    } catch {
      setStatus("Could not confirm the submission. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className={styles.feedback}>
      <summary>Send feedback</summary>
      <form method="post" onSubmit={submit}>
        <fieldset disabled={!ready}>
          <label htmlFor="snow-feedback-kind">What kind of note?</label>
          <select name="kind" id="snow-feedback-kind">
            <option value="bug">Report a bug</option>
            <option value="feature">Request a feature</option>
            <option value="other">Other feedback</option>
          </select>
          <label htmlFor="snow-feedback-message">Your note</label>
          <textarea name="message" id="snow-feedback-message" aria-describedby="snow-feedback-privacy" minLength={5} maxLength={2000} rows={4} required />
          <p id="snow-feedback-privacy">Notes are private. Do not include passwords or personal information.</p>
          <button type="submit" disabled={pending}>{pending ? "Sending…" : "Send note"}</button>
        </fieldset>
        <p role="status">{status}</p>
      </form>
    </details>
  );
}
