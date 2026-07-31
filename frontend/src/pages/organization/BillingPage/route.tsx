import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { BillingPage } from "./BillingPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/billing"
)({
  component: BillingPage,
  validateSearch: z.object({
    product: z.string().optional()
  }),
  beforeLoad: ({ search, params }) => {
    if (search.subOrganization) {
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: params.orgId },
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
