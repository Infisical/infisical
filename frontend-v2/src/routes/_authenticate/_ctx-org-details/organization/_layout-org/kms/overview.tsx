import { createFileRoute } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/workspace/types";

import { ProductOverview } from "../secret-manager/overview";

const KeyManagerOverviewPage = () => <ProductOverview type={ProjectType.KMS} />;

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/kms/overview"
)({
  component: KeyManagerOverviewPage
});
