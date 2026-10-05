/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";
import pkg from "./package.json";

// Get git hash at build time
function getGitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_HASH__: JSON.stringify(getGitHash()),
  },
  // Prevent vite from obscuring rust errors
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari14",
    // Don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
  test: {
    // This machine has NODE_ENV=production in the ambient environment, which makes React
    // resolve its production build and breaks act(). Pin it so tests do not depend on it.
    env: { NODE_ENV: "test" },
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    // Stylesheets are stubbed out in tests, except when imported with ?raw: the
    // FormDataEditor test reads them to check every rendered class has a rule.
    css: { include: [/\.css\?raw$/] },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/main.tsx", "src/**/index.ts"],
      // Thresholds are set per layer rather than globally. The layers that hold logic are
      // held to a high bar; presentation components are not, because a number there would
      // reward rendering tests that assert nothing.
      thresholds: {
        "src/domain/**": { statements: 90, branches: 90, functions: 80 },
        "src/utils/**": { statements: 90, branches: 88, functions: 90 },
        "src/stores/**": { statements: 85, branches: 88, functions: 78 },
        "src/services/**": { statements: 80, branches: 85, functions: 72 },
      },
    },
  },
});
