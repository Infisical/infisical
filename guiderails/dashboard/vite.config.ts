import { defineConfig } from "vite";

/**
 * Deliberately inside `dashboard/` rather than at the package root.
 *
 * Vitest auto-loads a root `vite.config.ts`, so putting this one there would apply the dashboard's
 * build settings to the whole test suite.
 *
 * No React plugin: Vite's esbuild transform already handles `.tsx` given `jsx: "react-jsx"` in
 * tsconfig, and Fast Refresh buys almost nothing here because the live server replays its whole
 * event history on connect — a plain reload restores the entire view.
 */
export default defineConfig({
  build: {
    // Nothing here is worth a source map in a demo, and the base64 frames make the bundle output
    // noisy enough already.
    sourcemap: false,
    // Loud rather than silent: a stale asset in dist/ would be served forever by the content-hash
    // stamp check, which assumes dist/ only ever holds the current build.
    emptyOutDir: true
  },
  server: {
    port: 4489,
    /**
     * The two-terminal dev loop: a real walk holds the run on 4488, and this dev server proxies
     * the socket to it. So the UI hot-reloads against a genuine stream without re-running the walk.
     */
    proxy: {
      "/events": {
        target: `ws://localhost:${process.env.GUIDERAILS_LIVE_PORT ?? "4488"}`,
        ws: true
      }
    }
  }
});
