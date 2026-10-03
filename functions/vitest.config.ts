import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      USE_MEMORY_STORE: "1",
      ALLOW_TEST_AUTH: "1",
      NODE_ENV: "test",
    },
    include: ["test/**/*.test.ts"],
  },
});
