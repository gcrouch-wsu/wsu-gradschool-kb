"use client";

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
