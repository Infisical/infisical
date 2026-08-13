import { createFileRoute } from "@tanstack/react-router";

import { EndpointTargetsPage } from "./EndpointTargetsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/endpoint/_endpoint-layout/targets"
)({
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Private Access" }]
  }),
  component: EndpointTargetsPage
});
