import { createFileRoute } from "@tanstack/react-router";

import { SecretManagerOverviewPage } from "./SecretManagerOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/secret-manager/overview"
)({
  component: SecretManagerOverviewPage
});
