interface PageLoaderProps {
  /** Screen-reader label only — no visible text by default. */
  label?: string;
  /** Shorter spinner for modals and inline panels. */
  compact?: boolean;
}

/** Centered spinner for client-side fetch loading (`useEffect`, Suspense in client pages). */
export function PageLoader({ label = "Loading", compact = false }: PageLoaderProps) {
  return (
    <div
      className={`page-loader${compact ? " page-loader--compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="page-loader__spinner" aria-hidden="true" />
    </div>
  );
}
