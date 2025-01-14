import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { KmsOverviewPage } from "./KmsOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/kms/overview"
)({
  component: KmsOverviewPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "products",
        link: linkOptions({ disabled: true, to: "/" })
      },
      {
        label: "KMS",
        link: linkOptions({ to: "/organization/kms/overview" })
      }
    ]
  })
});
