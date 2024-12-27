import { createFileRoute } from "@tanstack/react-router";

import { IPAllowListPage } from "./IPAllowListPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/allowlist"
)({
  component: () => IPAllowListPage
});
