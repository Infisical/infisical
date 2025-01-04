import { createFileRoute } from "@tanstack/react-router";

import { KmsOverviewPage } from "./KmsOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/kms/overview"
)({
  component: KmsOverviewPage
});
