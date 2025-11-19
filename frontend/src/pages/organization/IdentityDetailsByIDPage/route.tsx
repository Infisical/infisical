import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/identities/$identityId"
)({
  component: IdentityDetailsByIDPage,
  context: ({ params }) => ({
    breadcrumbs: [
      {
        label: "Access Control",
        link: linkOptions({ to: "/organizations/$orgId/access-management" as const, params })
      },
      {
        label: "Identities"
      }
    ]
  })
});
