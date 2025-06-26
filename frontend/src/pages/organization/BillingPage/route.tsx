import { createFileRoute } from "@tanstack/react-router";

import { BillingPage } from "./BillingPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/billing"
)({
  component: BillingPage,
  beforeLoad: () => {
    return {
      breadcrumbs: [
        {
          label: "Billing"
        }
      ]
    };
  }
});
