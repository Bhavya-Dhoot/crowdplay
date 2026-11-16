import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/tests/unit/**/*.test.ts", "src/tests/integration/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    env: { REALTIME_MODE: "mock", LLM_MODE: "mock", LOG_LEVEL: "silent" },
  },
});
