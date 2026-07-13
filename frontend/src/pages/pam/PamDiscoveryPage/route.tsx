import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { pamSheetSearchParams } from "@app/hooks/usePamSheetState";

import { PamDiscoveryPage } from "./PamDiscoveryPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/discovery"
)({
  validateSearch: zodValidator(pamSheetSearchParams),
  search: {
    middlewares: [stripSearchParams({ discoverySourceId: undefined })]
  },
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Discovery" }]
  }),
  component: PamDiscoveryPage
});
