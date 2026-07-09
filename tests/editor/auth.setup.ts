import { expect, test as setup } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, AUTH_STATE_PATH, BASE_URL } from "./helpers";

// Sign in once and hand the resulting session cookie to every other project via
// storageState. Posting straight to the session API (rather than driving the
// sign-in form) keeps auth fast and independent of sign-in UI changes. The
// explicit Origin header satisfies the same-origin guard in
// src/app/api/admin/session/route.ts.
setup("authenticate", async ({ request }) => {
  const response = await request.post("/api/admin/session", {
    headers: { Origin: BASE_URL },
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(
    response.ok(),
    `Sign-in failed (${response.status()}). Ensure the dev bootstrap admin is enabled ` +
      "(no DATABASE_URL / KB_ADMIN_* overrides) or set KB_ADMIN_EMAIL / KB_ADMIN_PASSWORD.",
  ).toBeTruthy();

  await request.storageState({ path: AUTH_STATE_PATH });
});
