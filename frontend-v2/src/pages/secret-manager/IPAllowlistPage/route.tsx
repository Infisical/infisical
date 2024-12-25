import { createFileRoute } from "@tanstack/react-router";

import { IPAllowListPage } from "./IPAllowListPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/allowlist/"
)({
  component: () => IPAllowListPage
});
