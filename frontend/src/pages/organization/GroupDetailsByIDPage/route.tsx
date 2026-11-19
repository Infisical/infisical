import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { OrgAccessControlTabSections } from "@app/types/org";

import { GroupDetailsByIDPage } from "./GroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/groups/$groupId"
)({
  component: GroupDetailsByIDPage,
  context: ({ params }) => ({
    breadcrumbs: [
      {
        label: "Access Control",
        link: linkOptions({
          to: "/organizations/$orgId/access-management" as const,
          params,
          search: { selectedTab: OrgAccessControlTabSections.Groups }
        })
      },
      {
        label: "Group"
      }
    ]
  })
});
