import { defineVirtualSubtreeConfig, layout, physical } from "@tanstack/virtual-file-routes";

export default defineVirtualSubtreeConfig([
  layout("org-layout", "layout.tsx", [physical("/organization", "organization")])
]);
