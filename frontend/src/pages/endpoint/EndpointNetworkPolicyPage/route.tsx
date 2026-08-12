import { createFileRoute } from "@tanstack/react-router";

import { EndpointNetworkPolicyPage } from "./EndpointNetworkPolicyPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/endpoint/_endpoint-layout/network-policy"
)({
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Network Policy" }]
  }),
  component: EndpointNetworkPolicyPage
});
