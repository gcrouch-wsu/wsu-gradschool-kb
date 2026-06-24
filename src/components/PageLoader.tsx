interface PageLoaderProps {
  /** Screen-reader label only — no visible text by default. */
  label?: string;
}

export function PageLoader({ label = "Loading" }: PageLoaderProps) {
  return (
    <div className="page-loader" role="status" aria-live="polite" aria-label={label}>
      <span className="page-loader__spinner" aria-hidden="true" />
    </div>
  );
}
