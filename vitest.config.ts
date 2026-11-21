import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "src"),
  // `server-only` throws outside a React Server environment; tests run server code directly.
  "server-only": path.resolve(__dirname, "tests/support/empty.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/integration/setup-env.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          // One worker: tests share one real PostgreSQL database and truncate between files.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
