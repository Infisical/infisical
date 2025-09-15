import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { IdentityGroupDetailsByIDPage } from "./IdentityGroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/identity-groups/$identityGroupId"
)({
  component: IdentityGroupDetailsByIDPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Access Control",
        link: linkOptions({ to: "/projects/secret-management/$projectId/access-management" })
      },
      {
        label: "Identity Groups"
      }
    ]
  })
});
