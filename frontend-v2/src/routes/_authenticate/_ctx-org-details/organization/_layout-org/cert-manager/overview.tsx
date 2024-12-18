import { createFileRoute } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/workspace/types";

import { ProductOverview } from "../secret-manager/overview";

const CertManagerOverviewPage = () => <ProductOverview type={ProjectType.CertificateManager} />;

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/cert-manager/overview"
)({
  component: CertManagerOverviewPage
});
