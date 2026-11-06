import { defineConfig } from "rerecord";

export default defineConfig({
  appUrl: process.env.RERECORD_APP_URL ?? "http://localhost:8080",
  build: { command: ["npx", "vite", "build"], cwd: "../../frontend", dist: "../../frontend/dist" },
  scenesDir: "scenes",
  outputDir: "../images/platform",
  // 1728x991 at the 2x scale rerecord renders at gives the 3456x1982 images the docs already use.
  viewport: { width: 1728, height: 991 },
  isReady: (url) => url.pathname.startsWith("/organizations/"),
  saveSessionOn: (url) => url.includes("/api/v1/auth/token")
});
