import { createFileRoute, redirect } from "@tanstack/react-router";

import { BillingPage } from "./BillingPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/billing"
)({
  component: BillingPage,
  beforeLoad: ({ search }) => {
    if (search.subOrganization) {
      throw redirect({
        to: "/organization/projects",
        search
      });
    }

    return {
      breadcrumbs: [
        {
          label: "Billing"
        }
      ]
    };
  }
});
