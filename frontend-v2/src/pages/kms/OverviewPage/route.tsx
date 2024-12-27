import { createFileRoute } from "@tanstack/react-router";

import { OverviewPage } from "./OverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/kms/$projectId/_kms-layout/overview"
)({
  component: OverviewPage
});
