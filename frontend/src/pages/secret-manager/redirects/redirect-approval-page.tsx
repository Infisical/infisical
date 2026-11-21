import { createFileRoute, redirect } from "@tanstack/react-router";

// this is done as part of migration for multi product inside project
export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/secret-manager/$projectId/approval"
)({
  staticData: { v3Alias: true },
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/organizations/$orgId/projects/secret-management/$projectId/approval",
      params,
      search
    });
  }
});
