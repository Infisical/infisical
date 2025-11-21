import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { ProjectAccessControlTabs } from "@app/types/project";

import { GroupDetailsByIDPage } from "./GroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-scanning/$projectId/_secret-scanning-layout/groups/$groupId"
)({
  component: GroupDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/organizations/$orgId/projects/secret-scanning/$projectId/access-management",
            params: {
              orgId: params.orgId,
              projectId: params.projectId
            },
            search: {
              selectedTab: ProjectAccessControlTabs.Groups
            }
          })
        },
        {
          label: "Group"
        }
      ]
    };
  }
});
