import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { EndpointDeviceDetailsPage, EndpointDeviceDetailsTab } from "./EndpointDeviceDetailsPage";

// The tab lives in the URL so a link can point at the transfer history or a device's findings
// directly, and a refresh comes back to the same place.
const EndpointDeviceDetailsSearchSchema = z.object({
  selectedTab: z.nativeEnum(EndpointDeviceDetailsTab).optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/endpoint/_endpoint-layout/devices/$deviceId"
)({
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Devices" }]
  }),
  validateSearch: zodValidator(EndpointDeviceDetailsSearchSchema),
  component: EndpointDeviceDetailsPage
});
