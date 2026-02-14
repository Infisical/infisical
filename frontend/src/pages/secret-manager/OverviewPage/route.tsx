import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OverviewPage } from "./OverviewPage";

const SecretOverviewPageQuerySchema = z.object({
  search: z.string().catch(""),
  secretPath: z.string().catch("/"),
  connectionId: z.string().optional(),
  connectionName: z.string().optional(),
  environments: z.array(z.string()).catch([])
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/overview"
)({
  component: OverviewPage,
  validateSearch: zodValidator(SecretOverviewPageQuerySchema),
  search: {
    middlewares: [stripSearchParams({ secretPath: "/", search: "", environments: [] })]
  },
  beforeLoad: ({ context, params }) => ({
    ...context,
    breadcrumbs: [
      ...context.breadcrumbs,
      {
        label: "Secrets",
        link: linkOptions({
          to: "/organizations/$orgId/projects/secret-management/$projectId/overview",
          params
        })
      }
    ]
  })
});
