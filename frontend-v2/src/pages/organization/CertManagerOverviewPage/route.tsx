import { createFileRoute } from "@tanstack/react-router";

import { CertManagerOverviewPage } from "./CertManagerOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/cert-manager/overview"
)({
  component: CertManagerOverviewPage
});
