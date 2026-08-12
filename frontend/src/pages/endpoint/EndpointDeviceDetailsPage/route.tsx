import { createFileRoute } from "@tanstack/react-router";

import { EndpointDeviceDetailsPage } from "./EndpointDeviceDetailsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/endpoint/_endpoint-layout/devices/$deviceId"
)({
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Devices" }]
  }),
  component: EndpointDeviceDetailsPage
});
