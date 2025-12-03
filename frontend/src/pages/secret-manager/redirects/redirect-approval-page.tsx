import { createFileRoute, redirect } from "@tanstack/react-router";

// this is done as part of migration for multi product inside project
export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/secret-manager/$projectId/approval"
)({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/organizations/$orgId/projects/secret-management/$projectId/approval",
      params,
      search
    });
  }
});
