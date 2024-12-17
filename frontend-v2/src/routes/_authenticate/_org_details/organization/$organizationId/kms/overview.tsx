import { createFileRoute } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/workspace/types";

import { ProductOverview } from "../secret-manager/overview";

const KeyManagerOverviewPage = () => <ProductOverview type={ProjectType.KMS} />;

export const Route = createFileRoute(
  "/_authenticate/_org_details/_org-layout/organization/$organizationId/kms/overview"
)({
  component: KeyManagerOverviewPage
});
