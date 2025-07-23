import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { ProjectAccessControlTabs } from "@app/types/project";

import { RoleDetailsBySlugPage } from "./RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/roles/$roleSlug"
)({
  component: RoleDetailsBySlugPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/projects/secret-management/$projectId/access-management",
            params: {
              projectId: params.projectId
            },
            search: {
              selectedTab: ProjectAccessControlTabs.Roles
            }
          })
        },
        {
          label: "Roles"
        }
      ]
    };
  }
});
