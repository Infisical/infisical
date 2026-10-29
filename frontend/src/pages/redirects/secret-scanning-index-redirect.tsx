import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/secret-scanning/_secret-scanning-layout/"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/organizations/$orgId/secret-scanning/data-sources",
      params: { orgId: params.orgId }
    });
  }
});
