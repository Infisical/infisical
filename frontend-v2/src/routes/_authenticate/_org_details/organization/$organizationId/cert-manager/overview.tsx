import { createFileRoute } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/workspace/types";

import { ProductOverview } from "../secret-manager/overview";

const CertManagerOverviewPage = () => <ProductOverview type={ProjectType.CertificateManager} />;

export const Route = createFileRoute(
  "/_authenticate/_org_details/_org-layout/organization/$organizationId/cert-manager/overview"
)({
  component: CertManagerOverviewPage
});
