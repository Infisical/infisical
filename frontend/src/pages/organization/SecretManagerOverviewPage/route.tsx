import { createFileRoute } from "@tanstack/react-router";

import { SecretManagerOverviewPage } from "./SecretManagerOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/secret-manager/overview"
)({
  component: SecretManagerOverviewPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Secret Management"
      }
    ]
  })
});
