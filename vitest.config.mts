import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit and component tests (`npm test`). Browser smoke tests live in e2e/ and run with Playwright.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // `@/*` → `src/*`, read from tsconfig.json so the alias is defined in one place.
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,mjs}"],
    exclude: [
      "**/node_modules/**",
      "Blender Assets/**", // owner's Blender work (D-22): never read by tests
      ".next/**",
      "e2e/**",
      ".review/**",
      ".lighthouseci/**",
    ],
  },
});
