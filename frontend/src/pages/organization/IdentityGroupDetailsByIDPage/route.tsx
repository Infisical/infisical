import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { IdentityGroupDetailsByIDPage } from "./IdentityGroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/identity-groups/$identityGroupId"
)({
  component: IdentityGroupDetailsByIDPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Access Control",
        link: linkOptions({ to: "/organization/access-management" })
      },
      {
        label: "identity groups"
      }
    ]
  })
});
