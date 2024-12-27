import { createFileRoute } from "@tanstack/react-router";

import { SecretManagerOverviewPage } from "./SecretManagerOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/secret-manager/overview"
)({
  component: SecretManagerOverviewPage
});
