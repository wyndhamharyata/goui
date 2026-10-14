import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  // Each journey starts its own browser and waits for levels to settle.
  timeout: 60_000,
  reporter: "list",
});
