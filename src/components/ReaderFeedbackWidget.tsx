"use client";

import { useState } from "react";

export function ReaderFeedbackWidget({ pageId }: { pageId: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [comment, setComment] = useState("");

  async function submit(helpful: boolean) {
    setStatus("sending");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, helpful, comment: comment.trim() || undefined }),
      });
      if (!response.ok) throw new Error("failed");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <aside aria-live="polite" className="reader-feedback">
        <p className="meta">Thanks for the feedback.</p>
      </aside>
    );
  }

  return (
    <aside aria-label="Was this page helpful?" className="reader-feedback">
      <p className="reader-feedback__prompt">
        <strong>Was this page helpful?</strong>
      </p>
      <div className="reader-feedback__actions">
        <button className="button button--small" disabled={status === "sending"} onClick={() => submit(true)} type="button">
          Yes
        </button>
        <button
          className="button button--ghost button--small"
          disabled={status === "sending"}
          onClick={() => submit(false)}
          type="button"
        >
          No
        </button>
      </div>
      <label className="reader-feedback__comment">
        <span className="meta">Optional comment</span>
        <textarea
          className="input"
          maxLength={500}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          value={comment}
        />
      </label>
      {status === "error" && <p className="error">Could not send feedback. Try again later.</p>}
    </aside>
  );
}
