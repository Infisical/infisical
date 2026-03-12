import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ObservabilityPage } from "./ObservabilityPage";

const ObservabilityQueryParams = z.object({
  view: z.string().catch("").default("org")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/observability"
)({
  component: ObservabilityPage,
  validateSearch: zodValidator(ObservabilityQueryParams),
  search: {
    middlewares: [stripSearchParams({ view: "" })]
  },
  context: () => ({
    breadcrumbs: [
      {
        label: "Observability"
      }
    ]
  })
});
