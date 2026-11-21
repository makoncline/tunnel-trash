"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { MessageSquarePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { CLOSED_SNOW_ORIGIN } from "@/lib/closed-snow";
import styles from "./snow.module.css";

const subscribe = () => () => undefined;
const hydrated = () => true;
const serverRendered = () => false;

const kinds = [
  { value: "other", label: "Note" },
  { value: "feature", label: "Feature" },
  { value: "bug", label: "Bug" },
] as const;

type FeedbackKind = (typeof kinds)[number]["value"];

export function FeedbackForm({
  context,
}: {
  context?: { mode: string; filters: string };
}) {
  const ready = useSyncExternalStore(subscribe, hydrated, serverRendered);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("other");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setStatus(null);
    const trimmed = message.trim();
    const viewport =
      typeof window !== "undefined"
        ? `${window.innerWidth}x${window.innerHeight}`
        : "";
    const meta = [
      context?.mode ? `view:${context.mode}` : null,
      context?.filters ? `filters:${context.filters}` : null,
      viewport || null,
    ]
      .filter(Boolean)
      .join(" · ");
    const suffix = meta ? `\n\n[${meta}]` : "";
    const payloadMessage =
      trimmed.length + suffix.length <= 2000 ? `${trimmed}${suffix}` : trimmed;
    try {
      const response = await fetch(`${CLOSED_SNOW_ORIGIN}/v1/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({ kind, message: payloadMessage }),
      });
      if (response.status === 201) {
        setMessage("");
        setStatus({ text: "Thanks. Your note is saved.", tone: "ok" });
        return;
      }
      const result: unknown = await response.json().catch(() => null);
      setStatus({
        text:
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Could not confirm the submission. Please try again.",
        tone: "error",
      });
    } catch {
      setStatus({
        text: "Could not confirm the submission. Please try again.",
        tone: "error",
      });
    } finally {
      setPending(false);
    }
  }

  function onTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.feedbackFab}
        aria-haspopup="dialog"
        aria-label="Send feedback"
        title="Send feedback"
        onClick={() => {
          setStatus(null);
          setOpen(true);
        }}
      >
        <MessageSquarePlus size={18} aria-hidden="true" />
        <span className={styles.feedbackFabLabel}>Feedback</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={`${styles.viewer} ${styles.feedbackDialog}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <header className={styles.viewerHeader}>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Quick note, idea, or bug for Closed Snow.
            </DialogDescription>
          </header>
          <form
            ref={formRef}
            method="post"
            className={styles.feedbackForm}
            onSubmit={submit}
          >
            <fieldset disabled={!ready}>
              <div
                className={styles.feedbackKinds}
                role="group"
                aria-label="Note type"
              >
                {kinds.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={kind === option.value}
                    onClick={() => setKind(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label htmlFor="snow-feedback-message" className="sr-only">
                Your note
              </label>
              <textarea
                name="message"
                id="snow-feedback-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={onTextareaKeyDown}
                placeholder="What would make Closed Snow better?"
                aria-describedby="snow-feedback-privacy"
                minLength={5}
                maxLength={2000}
                rows={3}
                autoFocus
                required
              />
              <p id="snow-feedback-privacy" className={styles.feedbackPrivacy}>
                Private note. Do not include passwords or personal info.
              </p>
              <div className={styles.feedbackActions}>
                <button
                  type="submit"
                  className={styles.feedbackSubmit}
                  disabled={pending}
                >
                  {pending ? "Sending…" : "Send note"}
                </button>
                {status?.tone === "ok" && (
                  <button
                    type="button"
                    className={styles.feedbackDone}
                    onClick={() => setOpen(false)}
                  >
                    Done
                  </button>
                )}
              </div>
            </fieldset>
            {status && (
              <p
                role="status"
                className={
                  status.tone === "ok"
                    ? styles.feedbackOk
                    : styles.feedbackError
                }
              >
                {status.text}
              </p>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
