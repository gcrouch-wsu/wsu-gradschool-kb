import { describe, expect, it, vi } from "vitest";
import { publishAdminClientSession, subscribeAdminClientSession } from "@/lib/admin-client-session";

describe("admin-client-session", () => {
  it("notifies subscribers when the client session flips", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAdminClientSession(listener);

    publishAdminClientSession(false);
    publishAdminClientSession(true);

    expect(listener).toHaveBeenNthCalledWith(1, false);
    expect(listener).toHaveBeenNthCalledWith(2, true);

    unsubscribe();
    publishAdminClientSession(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
