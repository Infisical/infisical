import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SecretManagerOverviewPage } from "./SecretManagerOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/secret-manager/overview"
)({
  component: SecretManagerOverviewPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "products",
        link: linkOptions({ disabled: true, to: "/" })
      },
      {
        label: "Secret Managers",
        link: linkOptions({ to: "/organization/secret-manager/overview" })
      }
    ]
  })
});
