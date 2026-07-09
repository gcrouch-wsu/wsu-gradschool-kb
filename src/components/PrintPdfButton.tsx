"use client";

import { useState } from "react";

const PRINT_IMAGE_TIMEOUT_MS = 12000;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForImage(img: HTMLImageElement) {
  img.loading = "eager";
  await nextFrame();

  const source = img.currentSrc || img.src;
  if (!source) {
    return;
  }

  if (!img.complete || img.naturalWidth === 0) {
    await new Promise<void>((resolve) => {
      const probe = new Image();
      probe.decoding = "sync";
      probe.onload = () => resolve();
      probe.onerror = () => resolve();
      probe.src = source;
      if (probe.complete) {
        resolve();
      }
    });
    if (!img.complete || img.naturalWidth === 0) {
      img.src = source;
      await nextFrame();
    }
  }

  if (!img.complete || img.naturalWidth === 0) {
    await Promise.race([
      new Promise<void>((resolve) => {
        const done = () => {
          img.removeEventListener("load", done);
          img.removeEventListener("error", done);
          resolve();
        };
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }),
      wait(3000),
    ]);
  }

  if (img.complete && img.naturalWidth > 0 && typeof img.decode === "function") {
    await img.decode().catch(() => {});
  }
}

async function prepareArticleImagesForPrint() {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>(".article img"));
  if (images.length === 0) {
    return;
  }

  await Promise.race([
    Promise.all(images.map(waitForImage)),
    wait(PRINT_IMAGE_TIMEOUT_MS),
  ]);
  await nextFrame();
  await nextFrame();
}

export function PrintPdfButton() {
  const [preparing, setPreparing] = useState(false);

  async function printPdf() {
    if (preparing) return;
    setPreparing(true);
    try {
      await prepareArticleImagesForPrint();
      window.print();
    } finally {
      setPreparing(false);
    }
  }

  return (
    <button
      aria-busy={preparing}
      className="button button--small button--ghost print-hide"
      disabled={preparing}
      onClick={printPdf}
      type="button"
    >
      {preparing ? "Preparing PDF..." : "Export PDF"}
    </button>
  );
}
