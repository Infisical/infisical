import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/overview",
      params
    });
  }
});
