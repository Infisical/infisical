import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { RequestsPage } from "./RequestsPage";

const SearchSchema = z.object({
  selectedTab: z.enum(["application-requests", "signing-requests"]).optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/requests"
)({
  component: RequestsPage,
  validateSearch: zodValidator(SearchSchema),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "application-requests" })]
  },
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Requests" }]
  })
});
