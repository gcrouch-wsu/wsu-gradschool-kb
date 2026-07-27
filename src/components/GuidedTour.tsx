"use client";

import { useEffect, useState } from "react";

function tourStorageKey(tourId: string) {
  return `kb-guided-tour:${tourId}`;
}

function initialTourIndex(tourId: string, stepCount: number): number | null {
  if (typeof window === "undefined" || stepCount === 0) {
    return null;
  }
  if (window.localStorage.getItem(tourStorageKey(tourId)) === "done") {
    return null;
  }
  return 0;
}

export function GuidedTour({
  tourId,
  steps,
}: {
  tourId: string;
  steps: Array<{ title: string; body: string }>;
}) {
  const [index, setIndex] = useState<number | null>(() => initialTourIndex(tourId, steps.length));

  useEffect(() => {
    // Re-evaluate when the tour id/steps change after hydration.
    const frame = window.requestAnimationFrame(() => {
      setIndex(initialTourIndex(tourId, steps.length));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tourId, steps.length]);

  if (index === null || !steps[index]) {
    return null;
  }

  const step = steps[index];
  const isLast = index >= steps.length - 1;

  function finish() {
    window.localStorage.setItem(tourStorageKey(tourId), "done");
    setIndex(null);
  }

  return (
    <div className="guided-tour" role="dialog" aria-label={step.title}>
      <p className="guided-tour__eyebrow">
        Tip {index + 1} of {steps.length}
      </p>
      <h3 className="guided-tour__title">{step.title}</h3>
      <p>{step.body}</p>
      <div className="guided-tour__actions">
        <button className="button button--small" onClick={finish} type="button">
          Dismiss tour
        </button>
        <button
          className="button button--small button--primary"
          onClick={() => (isLast ? finish() : setIndex(index + 1))}
          type="button"
        >
          {isLast ? "Got it" : "Next"}
        </button>
      </div>
    </div>
  );
}
