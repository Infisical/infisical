import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { OrgAccessControlTabSections } from "@app/types/org";

import { RoleByIDPage } from "./RoleByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/roles/$roleId"
)({
  component: RoleByIDPage,
  context: ({ params }) => ({
    breadcrumbs: [
      {
        label: "Access Control",
        link: linkOptions({
          to: "/organizations/$orgId/access-management",
          params: { orgId: params.orgId },
          search: { selectedTab: OrgAccessControlTabSections.Roles }
        })
      },
      {
        label: "Role"
      }
    ]
  })
});
