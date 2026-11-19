import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { ProjectAccessControlTabs } from "@app/types/project";

import { RoleDetailsBySlugPage } from "./RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/roles/$roleSlug"
)({
  component: RoleDetailsBySlugPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/organizations/$orgId/cert-manager/access-management",
            params: {
              orgId: params.orgId
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
