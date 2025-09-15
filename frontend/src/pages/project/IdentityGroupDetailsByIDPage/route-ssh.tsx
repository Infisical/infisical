import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { IdentityGroupDetailsByIDPage } from "./IdentityGroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/ssh/$projectId/_ssh-layout/identity-groups/$identityGroupId"
)({
  component: IdentityGroupDetailsByIDPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Access Control",
        link: linkOptions({ to: "/projects/ssh/$projectId/access-management" })
      },
      {
        label: "Identity Groups"
      }
    ]
  })
});
