import { describe, expect, it, vi, afterEach } from "vitest";
import {
  shouldSuppressDuplicateNotification,
  todayStartIso,
  wasNotificationSentToday,
} from "@/lib/cron-notification-dedupe";

describe("cron-notification-dedupe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes local midnight for the notification day window", () => {
    const noonLocal = new Date(2026, 6, 27, 12, 0, 0);
    const start = new Date(todayStartIso(noonLocal));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(27);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it("suppresses when a same-day audit marker already exists", () => {
    expect(shouldSuppressDuplicateNotification(true)).toBe(true);
    expect(shouldSuppressDuplicateNotification(false)).toBe(false);
  });

  it("wasNotificationSentToday returns true when the audit row exists", async () => {
    const db = await import("@/lib/db");
    const sqlMock = vi.fn().mockResolvedValue([{ ok: 1 }]);
    vi.spyOn(db, "getSql").mockReturnValue(sqlMock as never);
    await expect(
      wasNotificationSentToday("cron.review_overdue.notified", "page-1", "2026-07-27T07:00:00.000Z"),
    ).resolves.toBe(true);
    expect(sqlMock).toHaveBeenCalled();
  });

  it("wasNotificationSentToday returns false when no audit row exists", async () => {
    const db = await import("@/lib/db");
    const sqlMock = vi.fn().mockResolvedValue([]);
    vi.spyOn(db, "getSql").mockReturnValue(sqlMock as never);
    await expect(
      wasNotificationSentToday("cron.review_overdue.notified", "page-1", "2026-07-27T07:00:00.000Z"),
    ).resolves.toBe(false);
  });
});
