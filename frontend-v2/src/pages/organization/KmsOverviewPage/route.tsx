import { createFileRoute } from "@tanstack/react-router";

import { KmsOverviewPage } from "./KmsOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/kms/overview"
)({
  component: KmsOverviewPage
});
