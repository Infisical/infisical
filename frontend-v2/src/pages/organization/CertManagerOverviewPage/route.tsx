import { createFileRoute } from "@tanstack/react-router";

import { CertManagerOverviewPage } from "./CertManagerOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/cert-manager/overview"
)({
  component: CertManagerOverviewPage
});
