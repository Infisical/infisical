import { createFileRoute, linkOptions } from "@tanstack/react-router";

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
          params
        })
      },
      {
        label: "groups"
      }
    ]
  })
});
