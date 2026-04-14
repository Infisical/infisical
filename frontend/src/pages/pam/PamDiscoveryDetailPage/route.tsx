import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamDiscoveryDetailPage } from "./PamDiscoveryDetailPage";

export enum DiscoveryDetailTab {
  Runs = "runs",
  Resources = "resources",
  Accounts = "accounts"
}

const DiscoveryDetailSearchSchema = z.object({
  selectedTab: z.nativeEnum(DiscoveryDetailTab).catch(DiscoveryDetailTab.Runs)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/discovery/$discoveryType/$discoverySourceId"
)({
  validateSearch: zodValidator(DiscoveryDetailSearchSchema),
  component: PamDiscoveryDetailPage,
  search: {
    middlewares: [stripSearchParams({ selectedTab: DiscoveryDetailTab.Runs })]
  },
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [...context.breadcrumbs, { label: "Discovery" }, { label: "Details" }]
    };
  }
});
