import { createFileRoute } from "@tanstack/react-router";

import { BillingPage } from "./BillingPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/billing/"
)({
  component: BillingPage
});
