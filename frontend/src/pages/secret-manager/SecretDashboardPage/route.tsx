import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

const SecretDashboardPageQueryParamsSchema = z.object({
  secretPath: z.string().catch("/"),
  search: z.string().catch(""),
  tags: z.string().catch(""),
  filterBy: z.string().catch(""),
  dynamicSecretId: z.string().catch(""),
  connectionId: z.string().optional(),
  connectionName: z.string().optional()
});

// Preserve legacy bookmarks while routing all secret management back through Overview.
export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/secrets/$envSlug"
)({
  validateSearch: zodValidator(SecretDashboardPageQueryParamsSchema),
  search: {
    middlewares: [
      stripSearchParams({
        secretPath: "/",
        search: "",
        tags: "",
        filterBy: "",
        dynamicSecretId: ""
      })
    ]
  },
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/organizations/$orgId/projects/secret-management/$projectId/overview",
      params: {
        orgId: params.orgId,
        projectId: params.projectId
      },
      search: {
        secretPath: search.secretPath,
        search: search.search,
        tags: search.tags || undefined,
        filterBy: search.filterBy || undefined,
        connectionId: search.connectionId,
        connectionName: search.connectionName,
        dynamicSecretId: search.dynamicSecretId || undefined,
        environments: [params.envSlug]
      },
      replace: true
    });
  }
});
