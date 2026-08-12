import { createFileRoute } from "@tanstack/react-router";

import { EndpointEgressPolicyPage } from "./EndpointEgressPolicyPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/endpoint/_endpoint-layout/egress-policy"
)({
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Egress Policy" }]
  }),
  component: EndpointEgressPolicyPage
});
