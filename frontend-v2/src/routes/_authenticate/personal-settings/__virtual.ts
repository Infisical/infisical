import { defineVirtualSubtreeConfig, index, layout } from "@tanstack/virtual-file-routes";

export default defineVirtualSubtreeConfig([
  layout("personal-settings-layout", "layout.tsx", [index("index.tsx")])
]);
