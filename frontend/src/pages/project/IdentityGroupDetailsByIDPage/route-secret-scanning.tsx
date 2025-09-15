import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { IdentityGroupDetailsByIDPage } from "./IdentityGroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/secret-scanning/$projectId/_secret-scanning-layout/identity-groups/$identityGroupId"
)({
  component: IdentityGroupDetailsByIDPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Access Control",
        link: linkOptions({ to: "/projects/secret-scanning/$projectId/access-management" })
      },
      {
        label: "Identity Groups"
      }
    ]
  })
});
