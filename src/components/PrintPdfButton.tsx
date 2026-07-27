"use client";

import { useState } from "react";

const PRINT_IMAGE_TIMEOUT_MS = 15000;

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

function imageLoaded(img: HTMLImageElement) {
  return img.complete && img.naturalWidth > 0;
}

async function waitForImageEvent(img: HTMLImageElement, timeoutMs: number) {
  if (imageLoaded(img)) {
    return;
  }
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
    wait(timeoutMs),
  ]);
}

async function nudgeLazyImageLoad(img: HTMLImageElement) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  img.scrollIntoView({ block: "center", inline: "nearest" });
  await nextFrame();
  window.scrollTo(scrollX, scrollY);
  await nextFrame();
}

async function loadImageViaObjectUrl(
  img: HTMLImageElement,
  source: string,
  cleanupTasks: Array<() => void>,
) {
  try {
    const response = await fetch(source, { cache: "force-cache", credentials: "same-origin" });
    if (!response.ok) {
      return;
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const originalSrc = img.getAttribute("src");
    const originalSrcset = img.getAttribute("srcset");
    if (originalSrcset) {
      img.removeAttribute("srcset");
    }
    img.src = objectUrl;
    await waitForImageEvent(img, 3000);
    cleanupTasks.push(() => {
      if (originalSrcset) {
        img.setAttribute("srcset", originalSrcset);
      }
      if (originalSrc) {
        img.setAttribute("src", originalSrc);
      }
      URL.revokeObjectURL(objectUrl);
    });
  } catch {
    // Cross-origin or blocked images can still fall back to the browser's print behavior.
  }
}

async function waitForImage(img: HTMLImageElement, cleanupTasks: Array<() => void>) {
  img.removeAttribute("loading");
  img.loading = "eager";
  await nextFrame();

  const source = img.currentSrc || img.src;
  if (!source) {
    return;
  }

  if (!imageLoaded(img)) {
    const loadPromise = waitForImageEvent(img, 3000);
    await nudgeLazyImageLoad(img);
    await loadPromise;
  }

  if (!imageLoaded(img)) {
    await loadImageViaObjectUrl(img, source, cleanupTasks);
  }

  if (!imageLoaded(img)) {
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
    if (!imageLoaded(img)) {
      img.src = source;
      await nextFrame();
    }
  }

  if (!imageLoaded(img)) {
    await waitForImageEvent(img, 3000);
  }

  if (imageLoaded(img) && typeof img.decode === "function") {
    await img.decode().catch(() => {});
  }
}

async function prepareArticleImagesForPrint() {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>(".article img"));
  const cleanupTasks: Array<() => void> = [];
  if (images.length === 0) {
    return cleanupTasks;
  }

  await Promise.race([
    Promise.all(images.map((img) => waitForImage(img, cleanupTasks))),
    wait(PRINT_IMAGE_TIMEOUT_MS),
  ]);
  await nextFrame();
  await nextFrame();
  return cleanupTasks;
}

export function PrintPdfButton() {
  const [preparing, setPreparing] = useState(false);

  async function printPdf() {
    if (preparing) return;
    setPreparing(true);
    let cleanupTasks: Array<() => void> = [];
    try {
      cleanupTasks = await prepareArticleImagesForPrint();
      window.print();
    } finally {
      for (const cleanup of cleanupTasks) {
        cleanup();
      }
      setPreparing(false);
    }
  }

  return (
    <button
      aria-busy={preparing}
      className="button button--small button--ghost print-hide"
      disabled={preparing}
      onClick={printPdf}
      title="Opens the browser print dialog so you can print or save as PDF. This is browser print-to-PDF over the page HTML, not a separate tagged-PDF file."
      type="button"
    >
      {preparing ? "Preparing…" : "Print / Save as PDF"}
    </button>
  );
}
