import { createFileRoute } from "@tanstack/react-router";

import { BillingPage } from "./BillingPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/billing"
)({
  component: BillingPage
});
