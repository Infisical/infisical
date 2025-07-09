import { createFileRoute } from "@tanstack/react-router";

import { IPAllowListPage } from "./IPAllowlistPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/allowlist"
)({
  component: () => IPAllowListPage
});
