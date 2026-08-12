import { createFileRoute } from "@tanstack/react-router";

import { EndpointActivityPage } from "./EndpointActivityPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/endpoint/_endpoint-layout/activity"
)({
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Activity" }]
  }),
  component: EndpointActivityPage
});
