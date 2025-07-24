import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { ProjectAccessControlTabs } from "@app/types/project";

import { MemberDetailsByIDPage } from "./MemberDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/cert-management/$projectId/_cert-manager-layout/members/$membershipId"
)({
  component: MemberDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/projects/cert-management/$projectId/access-management",
            params: {
              projectId: params.projectId
            },
            search: {
              selectedTab: ProjectAccessControlTabs.Member
            }
          })
        },
        {
          label: "User"
        }
      ]
    };
  }
});
