"use client";

/**
 * Exports the current KB article as an accessible PDF. Rather than rasterizing
 * the page (which produces an untagged, screen-reader-hostile PDF), this triggers
 * the browser's print-to-PDF on the page's semantic HTML — headings, lists, alt
 * text, lang, and reading order are preserved, so the saved PDF is tagged and
 * accessible. The print stylesheet hides site chrome and shows link URLs.
 */
export function PrintPdfButton() {
  return (
    <button
      className="button button--small button--ghost print-hide"
      onClick={() => window.print()}
      type="button"
    >
      Export PDF
    </button>
  );
}
