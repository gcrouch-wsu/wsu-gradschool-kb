import { describe, expect, it } from "vitest";
import { parseVideoUrl, videoDeliveryUrl } from "@/lib/video";

describe("parseVideoUrl", () => {
  it("recognizes YouTube watch, short, and embed URLs", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedId: "dQw4w9WgXcQ",
    });
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedId: "dQw4w9WgXcQ",
    });
    expect(parseVideoUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedId: "dQw4w9WgXcQ",
    });
  });

  it("recognizes Vimeo URLs", () => {
    expect(parseVideoUrl("https://vimeo.com/123456789")).toEqual({
      provider: "vimeo",
      embedId: "123456789",
    });
  });

  it("treats anything else as a direct link", () => {
    expect(parseVideoUrl("https://media.wsu.edu/intro.mp4")).toEqual({ provider: "direct" });
  });
});

describe("videoDeliveryUrl", () => {
  it("builds canonical provider URLs from provider + id", () => {
    expect(videoDeliveryUrl({ videoProvider: "youtube", videoExternalId: "dQw4w9WgXcQ" })).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(videoDeliveryUrl({ videoProvider: "vimeo", videoExternalId: "123456789" })).toBe(
      "https://vimeo.com/123456789",
    );
  });

  it("falls back to the stored https URL (e.g. direct videos, or backfilled rows)", () => {
    expect(
      videoDeliveryUrl({ videoProvider: "direct", videoUrl: "https://media.wsu.edu/intro.mp4" }),
    ).toBe("https://media.wsu.edu/intro.mp4");
    // Provider known but id missing → use the URL.
    expect(
      videoDeliveryUrl({ videoProvider: "youtube", videoUrl: "https://youtu.be/abc" }),
    ).toBe("https://youtu.be/abc");
    // Legacy body fallback.
    expect(videoDeliveryUrl({ body: "https://media.wsu.edu/old.mp4" })).toBe(
      "https://media.wsu.edu/old.mp4",
    );
  });

  it("rejects anything that isn't a safe https URL", () => {
    expect(videoDeliveryUrl({ videoProvider: "direct", videoUrl: "http://insecure.example/x" })).toBeNull();
    expect(videoDeliveryUrl({ videoUrl: "javascript:alert(1)" })).toBeNull();
    expect(videoDeliveryUrl({})).toBeNull();
  });
});
