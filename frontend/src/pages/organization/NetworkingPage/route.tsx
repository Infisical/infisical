import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { NetworkingPage } from "./NetworkingPage";

const NetworkingPageQueryParams = z.object({
  selectedTab: z.string().catch("gateways"),
  action: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/networking"
)({
  component: NetworkingPage,
  validateSearch: zodValidator(NetworkingPageQueryParams),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "gateways" })]
  },
  context: () => ({
    breadcrumbs: [
      {
        label: "Networking"
      }
    ]
  })
});
