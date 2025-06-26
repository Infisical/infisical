import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { KmsOverviewPage } from "./KmsOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/kms/overview"
)({
  component: KmsOverviewPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "KMS",
        link: linkOptions({ to: "/organization/kms/overview" })
      }
    ]
  })
});
