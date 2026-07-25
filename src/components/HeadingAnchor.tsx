"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

export function HeadingAnchor({
  id,
  children,
  as: Tag,
  style,
  className = "anchor-heading",
  showCopyLink = true,
}: {
  id: string;
  children: ReactNode;
  as: "h2" | "h3";
  style?: CSSProperties;
  className?: string;
  /** When false, render a plain heading (used inside excerpt/sourced embeds). */
  showCopyLink?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      const url = `${window.location.origin}${window.location.pathname}#${id}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can fail in older browsers; the heading id still works for TOC links.
    }
  }

  if (!showCopyLink) {
    return (
      <Tag className={className} id={id} style={style}>
        {children}
      </Tag>
    );
  }

  // Button is a sibling of the heading (not a child) so its accessible name does not
  // pollute the heading name for screen-reader users navigating by headings.
  return (
    <div className="heading-with-anchor">
      <Tag className={`${className} heading-with-anchor__text`} id={id} style={style}>
        {children}
      </Tag>
      <button
        aria-label={copied ? "Link copied" : "Copy link to this heading"}
        className="heading-anchor-copy print-hide"
        onClick={copyLink}
        type="button"
      >
        {copied ? "Copied" : "Link"}
      </button>
    </div>
  );
}
