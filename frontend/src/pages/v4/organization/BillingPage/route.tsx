import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";

import { BillingPage } from "./BillingPage";

export const Route = createFileRoute("/v4/organizations/$orgId/billing")({
  staticData: { readiness: "full" },
  beforeLoad: ({ search, params }) => {
    if ("subOrganization" in search && search.subOrganization) {
      throw redirect({ to: "/organizations/$orgId/projects", params, search: true });
    }
  },
  component: BillingPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
