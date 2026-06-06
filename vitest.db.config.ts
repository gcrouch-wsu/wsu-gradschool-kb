import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config for the live-database (KI-1) integration tests. Run with `npm run test:db`.
// It loads .env.local so DATABASE_URL is set, then runs only the `*.db.test.ts`
// files against the real Neon database. The default `npm test` does NOT load env,
// so those same files self-skip there and the in-memory suite is unaffected.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    setupFiles: ["./vitest.db.setup.ts"],
    // Live network round-trips to Neon are slower than in-memory unit tests.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
